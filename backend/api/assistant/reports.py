"""Genera reportes en PDF para el asistente de voz: un tipo de dato
concreto (consumo de hoy, estimado del mes, plan de ahorro -- ver
`report_data.py`, plantillas fijas sin intervencion del LLM), el resumen de
la conversacion, o un reporte DETALLADO que el propio LLM redacta a la
medida de lo que el usuario pidio (ver `_datos_detallado` y
`openai_client.generar_reporte_detallado`). Persiste el archivo en disco y
una fila en `reportes` (ver `api.models.Reporte`).

`sugerir_tipos_reporte` es lo que decide, segun la conversacion reciente,
cuales de esos tipos tiene sentido ofrecerle al usuario para descargar (en
vez de mostrarle siempre el catalogo completo)."""

from __future__ import annotations

import datetime as dt
import uuid
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import models
from ..config import settings
from ..energy import historical
from . import context_builder, openai_client, pdf_renderer, report_data
from .report_types import CLAVE_POR_DEFECTO, TIPOS_REPORTE

_RESUMEN_SYSTEM_PROMPT = (
    "Sintetiza en un parrafo breve (maximo 120 palabras), en espanol, los temas tratados y las "
    "conclusiones o planes de ahorro mas relevantes de esta conversacion sobre consumo energetico. "
    "No inventes datos que no aparezcan en la conversacion; si no se tocaron temas concretos, dilo."
)


def _reports_dir() -> Path:
    path = settings.project_root / settings.asistente_reports_dir
    path.mkdir(parents=True, exist_ok=True)
    return path


def _consultas_recientes(db: Session, id_usuario: uuid.UUID, limite: int) -> list[models.Consulta]:
    consultas = db.scalars(
        select(models.Consulta)
        .where(models.Consulta.id_usuario == id_usuario)
        .order_by(models.Consulta.fecha_hora.desc())
        .limit(limite)
    ).all()
    return list(reversed(consultas))  # orden cronologico para el reporte


def _generar_resumen(consultas: list[models.Consulta]) -> str:
    if not consultas:
        return "No hubo preguntas registradas en esta conversacion."
    transcript = "\n".join(f"P: {c.pregunta}\nR: {c.respuesta or '(sin respuesta)'}" for c in consultas)
    mensajes = [
        {"role": "system", "content": _RESUMEN_SYSTEM_PROMPT},
        {"role": "user", "content": transcript},
    ]
    return openai_client.generar_respuesta_chat(mensajes)


def _datos_general(db: Session, id_usuario: uuid.UUID, limite_consultas: int) -> dict:
    consultas = _consultas_recientes(db, id_usuario, limite_consultas)
    resumen = _generar_resumen(consultas)

    secciones = [{"titulo": "Resumen", "parrafos": [resumen]}]
    if consultas:
        secciones.append({
            "titulo": "Conversacion",
            "tabla": [["Fecha", "Pregunta", "Respuesta"]] + [
                [c.fecha_hora.strftime("%Y-%m-%d %H:%M"), c.pregunta, c.respuesta or "(sin respuesta)"]
                for c in consultas
            ],
        })
    else:
        secciones.append({"titulo": "Conversacion", "parrafos": ["Sin intercambios registrados."]})

    if consultas:
        periodo = f"{consultas[0].fecha_hora:%Y-%m-%d %H:%M} a {consultas[-1].fecha_hora:%Y-%m-%d %H:%M}"
    else:
        periodo = dt.datetime.now().strftime("%Y-%m-%d %H:%M")

    return {"periodo": periodo, "secciones": secciones, "resumen": resumen}


def _resumen_corto(datos: dict) -> str:
    """Linea corta para `Reporte.resumen` (se muestra bajo cada tarjeta en el
    frontend) cuando el tipo de reporte no trae ya un resumen propio generado
    por el LLM (solo `general` lo trae)."""
    primera = datos["secciones"][0]
    if primera.get("parrafos"):
        return " ".join(primera["parrafos"][:3])
    tabla = primera.get("tabla")
    if tabla and len(tabla) > 1:
        return f"{primera['titulo']}: {len(tabla) - 1} filas de datos."
    return primera["titulo"]


def _sanear_secciones(crudas: object) -> list[dict]:
    """Valida lo que devolvio el LLM antes de pasarlo a `pdf_renderer`: JSON
    mode garantiza sintaxis valida, no que la FORMA sea exactamente la que
    se pidio (el modelo puede omitir "titulo", mandar una tabla con filas de
    ancho distinto, meter un numero donde se espera texto, etc.). Descarta
    silenciosamente lo que no se puede dibujar en vez de fallar el reporte
    entero por una sola seccion mal formada."""
    if not isinstance(crudas, list):
        return []

    limpias: list[dict] = []
    for cruda in crudas:
        if not isinstance(cruda, dict):
            continue
        titulo = cruda.get("titulo")
        if not isinstance(titulo, str) or not titulo.strip():
            continue
        seccion: dict = {"titulo": titulo.strip()}

        parrafos = cruda.get("parrafos")
        if isinstance(parrafos, list):
            limpios = [str(p).strip() for p in parrafos if isinstance(p, (str, int, float)) and str(p).strip()]
            if limpios:
                seccion["parrafos"] = limpios

        tabla = cruda.get("tabla")
        if isinstance(tabla, list) and len(tabla) >= 2 and all(isinstance(fila, list) for fila in tabla):
            ancho = len(tabla[0])
            if ancho > 0:
                # Filas mas cortas que el encabezado se rellenan; mas largas
                # se truncan -- ReportLab necesita el mismo numero de
                # columnas en cada fila de la tabla.
                seccion["tabla"] = [
                    [str(celda) for celda in fila[:ancho]] + [""] * max(0, ancho - len(fila))
                    for fila in tabla
                ]

        if "parrafos" in seccion or "tabla" in seccion:
            limpias.append(seccion)

    return limpias


def _datos_detallado(db: Session, usuario: models.Usuario, instrucciones: str, limite_consultas: int) -> dict:
    """El unico tipo de reporte que el LLM redacta libremente (a diferencia
    de `report_data.datos_*`, plantillas fijas): recibe el mismo snapshot de
    datos que ancla al chat (`context_builder.construir_contexto_datos`) mas
    el desglose por luminaria/zona (que el chat no necesita pero un reporte
    "detallado" si, para poder hablar de una sala en concreto), y la
    instruccion del usuario en sus propias palabras."""
    ahora = dt.datetime.now(dt.timezone.utc)
    contexto = context_builder.construir_contexto_datos(db)

    por_luminaria = historical.resumen_por_luminaria(db, desde=ahora - dt.timedelta(days=30))
    if por_luminaria:
        contexto += "\n\nConsumo estimado acumulado por luminaria, ultimos 30 dias (de mas a menos consumo):\n"
        contexto += "\n".join(
            f"- {f['luminaria']} (zona: {f['zona']}): {f['consumo_estimado_kwh_total']:.3f} kWh consumidos, "
            f"{f['ahorro_kwh_total']:.3f} kWh de ahorro potencial, {f['muestras']} muestras."
            for f in por_luminaria
        )
    else:
        contexto += "\n\nConsumo por luminaria (ultimos 30 dias): TODAVIA NO HAY REGISTROS."

    consultas = _consultas_recientes(db, usuario.id_usuario, limite_consultas)
    transcript = "\n".join(f"P: {c.pregunta}\nR: {c.respuesta or '(sin respuesta)'}" for c in consultas)

    crudo = openai_client.generar_reporte_detallado(contexto, instrucciones, transcript)
    secciones = _sanear_secciones(crudo.get("secciones"))
    resumen = str(crudo.get("resumen") or "").strip()
    periodo = str(crudo.get("periodo") or "").strip() or ahora.strftime("%Y-%m-%d %H:%M")

    if not secciones:
        # El LLM respondio JSON valido pero sin secciones aprovechables (p.
        # ej. todas sin "titulo"): que quede igual un reporte con el resumen,
        # no una pagina en blanco.
        secciones = [{
            "titulo": "Reporte detallado",
            "parrafos": [resumen or "No hubo suficiente informacion disponible para detallar este reporte."],
        }]

    return {"periodo": periodo, "secciones": secciones, "resumen": resumen}


def sugerir_tipos_reporte(db: Session, usuario: models.Usuario, limite_consultas: int = 20) -> list[str]:
    """Claves de `TIPOS_REPORTE` relevantes segun la conversacion reciente
    del usuario (clasificadas por el LLM, ver `openai_client.clasificar_tipos_reporte`).
    Si no hay conversacion o la clasificacion falla, cae a solo `general`."""
    consultas = _consultas_recientes(db, usuario.id_usuario, limite_consultas)
    if not consultas:
        return [CLAVE_POR_DEFECTO]

    transcript = "\n".join(f"P: {c.pregunta}\nR: {c.respuesta or '(sin respuesta)'}" for c in consultas)
    claves = openai_client.clasificar_tipos_reporte(transcript, TIPOS_REPORTE)
    return claves or [CLAVE_POR_DEFECTO]


def generar_reporte(
    db: Session,
    usuario: models.Usuario,
    clave_reporte: str = CLAVE_POR_DEFECTO,
    limite_consultas: int = 20,
    titulo: str | None = None,
    instrucciones: str | None = None,
) -> models.Reporte:
    if clave_reporte not in TIPOS_REPORTE:
        clave_reporte = CLAVE_POR_DEFECTO
    definicion = TIPOS_REPORTE[clave_reporte]

    if clave_reporte == "detallado":
        datos = _datos_detallado(db, usuario, (instrucciones or "").strip(), limite_consultas)
        resumen = datos["resumen"] or _resumen_corto(datos)
    elif clave_reporte == "general":
        datos = _datos_general(db, usuario.id_usuario, limite_consultas)
        resumen = datos["resumen"]
    elif clave_reporte == "consumo_diario":
        datos = report_data.datos_consumo_diario(db)
        resumen = _resumen_corto(datos)
    elif clave_reporte == "consumo_mensual":
        datos = report_data.datos_consumo_mensual(db)
        resumen = _resumen_corto(datos)
    else:  # plan_ahorro
        datos = report_data.datos_plan_ahorro(db)
        resumen = _resumen_corto(datos)

    titulo_final = titulo or f"{definicion['etiqueta']} - SELENE"
    ahora = dt.datetime.now().strftime("%Y-%m-%d %H:%M")
    subtitulo = f"Generado el {ahora} para {usuario.nombre} ({usuario.correo})."

    nombre_archivo = f"{uuid.uuid4()}.pdf"
    ruta = _reports_dir() / nombre_archivo
    pdf_renderer.render_pdf(ruta, titulo_final, subtitulo, datos["secciones"])

    reporte = models.Reporte(
        id_usuario=usuario.id_usuario,
        tipo_reporte=definicion["tipo_reporte_enum"],
        clave_reporte=clave_reporte,
        periodo=datos["periodo"],
        ruta_archivo=str(ruta),
        resumen=resumen,
    )
    db.add(reporte)
    db.commit()
    db.refresh(reporte)
    return reporte


def eliminar_reporte(db: Session, usuario: models.Usuario, id_reporte: uuid.UUID) -> None:
    """Borra el reporte: el archivo en disco (si sigue ahi) y la fila en
    `reportes`. Que el archivo ya no exista no es motivo para fallar -- lo
    que importa es que el registro desaparezca de la lista del usuario."""
    reporte = db.get(models.Reporte, id_reporte)
    if reporte is None or reporte.id_usuario != usuario.id_usuario:
        raise ValueError("Reporte no encontrado.")

    Path(reporte.ruta_archivo).unlink(missing_ok=True)

    db.delete(reporte)
    db.commit()
