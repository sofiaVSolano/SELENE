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


def _datos_general(
    db: Session, id_usuario: uuid.UUID, limite_consultas: int, figuras: list[dict] | None = None,
    id_zona: uuid.UUID | None = None,
) -> dict:
    """El resumen de la conversacion. Ademas de lo conversado, lleva el
    panorama real de la ultima semana: un reporte que solo transcribe
    preguntas obliga al lector a recordar de que cifras se estaba hablando."""
    consultas = _consultas_recientes(db, id_usuario, limite_consultas)
    resumen = _generar_resumen(consultas)

    ahora = dt.datetime.now(dt.timezone.utc)
    panorama = report_data.recolectar_panorama(db, desde=ahora - dt.timedelta(days=7), hasta=ahora,
                                               id_zona=id_zona)

    secciones = [
        report_data._seccion(
            "La semana de un vistazo",
            [report_data.tarjetas_panorama(panorama, "general")],
            anotacion="últimos 7 días",
        ),
        report_data._seccion("Cómo se reparte la energía", [
            report_data.grafica_reparto_luz(panorama),
            report_data.grafica_por_luminaria(panorama),
        ]),
        report_data._seccion("Evidencia visual", report_data.bloques_de_figuras(figuras or [])),
        report_data._seccion("Lo que conversamos", [
            {
                "tipo": "tabla",
                "filas": [["Fecha", "Pregunta", "Respuesta"]] + [
                    [c.fecha_hora.strftime("%d/%m %H:%M"), c.pregunta, c.respuesta or "(sin respuesta)"]
                    for c in consultas
                ],
                "nota": "Intercambios registrados en esta conversación, en orden cronológico.",
            } if consultas else {
                "tipo": "parrafos",
                "parrafos": ["Todavía no hay intercambios registrados en esta conversación."],
            },
        ]),
        # El texto del LLM entra como primer parrafo de las observaciones: es
        # la redaccion que el usuario pidio, y las frases derivadas de las
        # cifras la respaldan justo debajo.
        report_data._seccion(None, [report_data.observaciones(panorama, "general", extra=[resumen])]),
    ]

    if consultas:
        periodo = f"{consultas[0].fecha_hora:%d/%m/%Y %H:%M} — {consultas[-1].fecha_hora:%d/%m/%Y %H:%M}"
    else:
        periodo = dt.datetime.now().strftime("%d/%m/%Y %H:%M")

    return {
        "periodo": periodo,
        "enfoque": "general",
        "secciones": [s for s in secciones if s],
        "resumen": resumen,
        "panorama": panorama,
    }


def _resumen_corto(datos: dict) -> str:
    """Linea corta para `Reporte.resumen` (se muestra bajo cada tarjeta en el
    frontend) cuando el tipo de reporte no trae ya un resumen propio generado
    por el LLM (solo `general` y `detallado` lo traen).

    Se saca del bloque de observaciones, que es exactamente el resumen que
    SELENE compuso del periodo; si no hubiera, se cae al primer texto util
    que encuentre recorriendo los bloques."""
    for seccion in datos.get("secciones") or []:
        for bloque in seccion.get("bloques") or []:
            if bloque.get("tipo") == "observaciones" and bloque.get("parrafos"):
                return bloque["parrafos"][0]

    for seccion in datos.get("secciones") or []:
        for bloque in seccion.get("bloques") or []:
            if bloque.get("tipo") == "destacado":
                return f"{bloque.get('etiqueta', '')}: {bloque.get('valor', '')} {bloque.get('unidad', '')}".strip()
            if bloque.get("tipo") == "parrafos" and bloque.get("parrafos"):
                return bloque["parrafos"][0]

    return "Reporte generado por SELENE."


def _sanear_secciones(crudas: object) -> list[dict]:
    """Traduce lo que devolvio el LLM al vocabulario de bloques, validando por
    el camino: JSON mode garantiza sintaxis valida, no que la FORMA sea
    exactamente la que se pidio (el modelo puede omitir "titulo", mandar una
    tabla con filas de ancho distinto, meter un numero donde se espera texto,
    o inventarse una clave que no existe). Descarta silenciosamente lo que no
    se puede dibujar en vez de fallar el reporte entero por una seccion mal
    formada."""
    if not isinstance(crudas, list):
        return []

    limpias: list[dict] = []
    for cruda in crudas:
        if not isinstance(cruda, dict):
            continue
        titulo = cruda.get("titulo")
        if not isinstance(titulo, str) or not titulo.strip():
            continue

        bloques: list[dict] = []

        parrafos = cruda.get("parrafos")
        if isinstance(parrafos, list):
            limpios = [str(p).strip() for p in parrafos if isinstance(p, (str, int, float)) and str(p).strip()]
            if limpios:
                bloques.append({"tipo": "parrafos", "parrafos": limpios})

        renglones = cruda.get("renglones")
        if isinstance(renglones, list):
            pares = [
                (str(fila[0]).strip(), str(fila[1]).strip())
                for fila in renglones
                if isinstance(fila, (list, tuple)) and len(fila) >= 2 and str(fila[0]).strip()
            ]
            if pares:
                bloques.append({"tipo": "renglones", "items": pares})

        tabla = cruda.get("tabla")
        if isinstance(tabla, list) and len(tabla) >= 2 and all(isinstance(fila, list) for fila in tabla):
            ancho = len(tabla[0])
            if ancho > 0:
                # Filas mas cortas que el encabezado se rellenan; mas largas
                # se truncan -- ReportLab necesita el mismo numero de
                # columnas en cada fila de la tabla.
                bloques.append({
                    "tipo": "tabla",
                    "filas": [
                        [str(celda) for celda in fila[:ancho]] + [""] * max(0, ancho - len(fila))
                        for fila in tabla
                    ],
                })

        if bloques:
            limpias.append({"titulo": titulo.strip(), "bloques": bloques})

    return limpias


_ENFOQUES_VALIDOS = ("consumo", "ocupacion", "iluminacion", "general")


def _datos_detallado(
    db: Session,
    usuario: models.Usuario,
    instrucciones: str,
    limite_consultas: int,
    figuras: list[dict] | None = None,
    id_zona: uuid.UUID | None = None,
) -> dict:
    """El unico tipo de reporte que el LLM redacta libremente (a diferencia
    de `report_data.datos_*`, plantillas fijas): recibe el mismo snapshot de
    datos que ancla al chat (`context_builder.construir_contexto_datos`) mas
    el desglose por luminaria/zona (que el chat no necesita pero un reporte
    "detallado" si, para poder hablar de una sala en concreto), y la
    instruccion del usuario en sus propias palabras.

    El reparto de trabajo con el modelo es deliberado: el LLM elige el ENFOQUE
    y escribe la prosa; los indicadores, las graficas y las figuras los pone
    SELENE con datos reales, ANTES de las secciones redactadas. Asi el reporte
    se siente hecho a medida y a la vez ninguna cifra puede estar inventada.
    """
    ahora = dt.datetime.now(dt.timezone.utc)
    contexto = context_builder.construir_contexto_datos(db)

    por_luminaria = historical.resumen_por_luminaria(db, desde=ahora - dt.timedelta(days=30), id_zona=id_zona)
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
    redactadas = _sanear_secciones(crudo.get("secciones"))
    resumen = str(crudo.get("resumen") or "").strip()
    periodo = str(crudo.get("periodo") or "").strip() or ahora.strftime("%d/%m/%Y %H:%M")

    enfoque = str(crudo.get("enfoque") or "").strip().lower()
    if enfoque not in _ENFOQUES_VALIDOS:
        enfoque = "general"

    # --- Lo que pone SELENE, con datos reales, antes de la prosa ---
    panorama = report_data.recolectar_panorama(db, desde=ahora - dt.timedelta(days=30), hasta=ahora,
                                               id_zona=id_zona)
    por_dia = historical.resumen_por_dia(db, desde=ahora - dt.timedelta(days=30), hasta=ahora, id_zona=id_zona)
    por_hora = historical.ocupacion_por_hora(db, desde=ahora - dt.timedelta(days=30), hasta=ahora, id_zona=id_zona)

    # El orden de las graficas tambien lo decide el enfoque: la protagonista
    # va primero. Es la misma idea que en las tarjetas.
    graficas = {
        "consumo": [
            report_data.grafica_por_dia(por_dia),
            report_data.grafica_por_luminaria(panorama),
            report_data.grafica_reparto_luz(panorama),
        ],
        "ocupacion": [
            report_data.grafica_ocupacion_por_hora(por_hora),
            report_data.grafica_por_luminaria(panorama),
            report_data.grafica_por_dia(por_dia),
        ],
        "iluminacion": [
            report_data.grafica_reparto_luz(panorama),
            report_data.grafica_por_luminaria(panorama),
            report_data.grafica_ocupacion_por_hora(por_hora),
        ],
        "general": [
            report_data.grafica_reparto_luz(panorama),
            report_data.grafica_por_dia(por_dia),
            report_data.grafica_por_luminaria(panorama),
        ],
    }[enfoque]

    secciones = [
        report_data._seccion(
            "Los números del período",
            [report_data.tarjetas_panorama(panorama, enfoque)],
            anotacion="últimos 30 días",
        ),
        report_data._seccion("Qué muestran los datos", graficas),
        report_data._seccion("Evidencia visual", report_data.bloques_de_figuras(figuras or [])),
    ]
    secciones = [s for s in secciones if s]
    secciones.extend(redactadas)

    if not secciones:
        # El LLM respondio JSON valido pero sin secciones aprovechables y
        # tampoco hay datos: que quede igual un reporte con el resumen, no una
        # pagina en blanco.
        secciones = [{
            "titulo": "Reporte detallado",
            "bloques": [{
                "tipo": "parrafos",
                "parrafos": [resumen or "No hubo suficiente información disponible para detallar este reporte."],
            }],
        }]

    observaciones = report_data.observaciones(panorama, enfoque, extra=[resumen])
    if observaciones:
        secciones.append({"titulo": None, "bloques": [observaciones]})

    return {
        "periodo": periodo,
        "enfoque": enfoque,
        "secciones": secciones,
        "resumen": resumen,
        "panorama": panorama,
    }


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
    figuras: list[dict] | None = None,
    id_zona: uuid.UUID | None = None,
) -> models.Reporte:
    """`figuras` son los fotogramas que manda el frontend para las figuras del
    reporte (imagen ya decodificada + metadatos del analisis). El backend no
    guarda imagenes de camara: el registro visual vive en el navegador (ver
    `frontend/src/lib/almacen.js`), asi que viajan con la peticion."""
    if clave_reporte not in TIPOS_REPORTE:
        clave_reporte = CLAVE_POR_DEFECTO
    definicion = TIPOS_REPORTE[clave_reporte]
    # Se decodifica y valida aqui, en el borde del paquete: de este punto
    # hacia dentro `figuras` ya son bytes de una imagen comprobada.
    figuras = report_data.decodificar_figuras(figuras or [])

    if clave_reporte == "detallado":
        datos = _datos_detallado(db, usuario, (instrucciones or "").strip(), limite_consultas, figuras,
                                 id_zona=id_zona)
        resumen = datos["resumen"] or _resumen_corto(datos)
    elif clave_reporte == "general":
        datos = _datos_general(db, usuario.id_usuario, limite_consultas, figuras, id_zona=id_zona)
        resumen = datos["resumen"]
    elif clave_reporte == "consumo_diario":
        datos = report_data.datos_consumo_diario(db, figuras, id_zona=id_zona)
        resumen = _resumen_corto(datos)
    elif clave_reporte == "consumo_mensual":
        datos = report_data.datos_consumo_mensual(db, figuras, id_zona=id_zona)
        resumen = _resumen_corto(datos)
    else:  # plan_ahorro
        datos = report_data.datos_plan_ahorro(db, figuras=figuras, id_zona=id_zona)
        resumen = _resumen_corto(datos)

    titulo_final = titulo or definicion["etiqueta"]
    generado_en = dt.datetime.now()
    # Si el reporte cubre una sola sala hay que DECIRLO en la portada: dos PDF
    # con el mismo titulo y cifras distintas, sin nada que los distinga, es
    # peor que no poder filtrar.
    sala = db.get(models.Zona, id_zona) if id_zona is not None else None
    alcance = f" Cubre únicamente la sala «{sala.nombre}»." if sala is not None else ""
    subtitulo = (
        f"Generado el {generado_en.strftime('%d/%m/%Y a las %H:%M')} para {usuario.nombre} "
        f"({usuario.correo}).{alcance}"
    )

    nombre_archivo = f"{uuid.uuid4()}.pdf"
    ruta = _reports_dir() / nombre_archivo
    pdf_renderer.render_pdf(ruta, {
        "titulo": titulo_final,
        "subtitulo": subtitulo,
        "periodo": datos["periodo"] + (f" · {sala.nombre}" if sala is not None else ""),
        "generado_en": generado_en,
        "secciones": datos["secciones"],
    })

    reporte = models.Reporte(
        id_usuario=usuario.id_usuario,
        tipo_reporte=definicion["tipo_reporte_enum"],
        clave_reporte=clave_reporte,
        periodo=datos["periodo"] + (f" · {sala.nombre}" if sala is not None else ""),
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
