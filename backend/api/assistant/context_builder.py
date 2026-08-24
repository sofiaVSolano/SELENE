"""Arma los mensajes (formato Chat Completions) que se envian al modelo:
un system prompt fijo con las reglas del asistente + un snapshot de los
datos energeticos disponibles (historial persistido por `api.energy`) +
el historial reciente de la conversacion, para que las respuestas queden
ancladas en datos reales del sistema y no en informacion inventada.
"""

from __future__ import annotations

import datetime as dt

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .. import models
from ..config import settings
from ..energy import context as energy_context
from ..energy import historical

SYSTEM_PROMPT = """Eres el asistente de voz de SELENE, un sistema de gestion energetica que combina \
vision por computador (deteccion de personas, ventanas y luminarias) con un modelo LightGBM ya \
entrenado que estima el consumo energetico de un espacio y un motor de simulacion que calcula \
ahorros potenciales (apagar luces sin ocupacion, aprovechar luz natural, etc.).

Reglas:
- Responde siempre en espanol, de forma breve, clara y conversacional: tu respuesta se va a leer \
en voz alta, evita listas largas, tablas o markdown pesado.
- Basa tus respuestas en el CONTEXTO DE DATOS de abajo. Si no hay datos suficientes para responder \
con precision, dilo explicitamente ("todavia no hay historial suficiente...") en vez de inventar cifras.
- Cuando cites una cifra del contexto, aclara brevemente de que se trata (p. ej. "en promedio, sobre \
los ultimos analisis...").
- Puedes explicar como funciona el sistema, los tipos de simulacion/recomendacion disponibles y sus \
parametros, aunque no haya datos historicos todavia.
- Mantente en el dominio de SELENE: consumo energetico, iluminacion y ahorro, pero tambien salas, \
alertas de derroche, imagenes guardadas en el historial y reportes generados; si preguntan algo \
fuera de ese dominio, indica amablemente que no es tu area."""

_DESCRIPCION_SIMULACIONES = {
    "apagar_sin_ocupacion": "Apaga toda la iluminacion artificial cuando no se detectan personas en el espacio.",
    "reducir_con_luz_natural": "Reduce el uso de luminarias en proporcion a cuanta luz natural hay disponible.",
    "mantener_alejadas_ventanas": "Con luz natural suficiente, mantiene encendidas solo las luminarias alejadas de las ventanas.",
    "encendido_parcial_mixta": "Con iluminacion mixta o luz natural insuficiente, mantiene encendida solo una fraccion de luminarias.",
}


def _formatear_numero(valor: float | None, sufijo: str = "") -> str:
    return "sin datos" if valor is None else f"{valor:.2f}{sufijo}"


def construir_contexto_salas(db: Session, id_usuario) -> str:
    """Snapshot en texto plano de salas, alertas de derroche, imagenes del
    historial y reportes -- datos que no vienen de `api.energy` sino de las
    tablas `zonas`/`recomendaciones`/`detecciones_ocupacion`/`reportes`
    directamente. Conteos simples (`func.count()`), no promedios: no hace
    falta el bucketing en Python que usa `historical.py` para este volumen."""
    inicio_hoy = dt.datetime.now(dt.timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)

    def _contar(modelo, *condiciones) -> int:
        return int(db.scalar(select(func.count()).select_from(modelo).where(*condiciones)) or 0)

    zonas = db.scalars(select(models.Zona).order_by(models.Zona.nombre)).all()

    lineas: list[str] = ["", "=== SALAS, ALERTAS DE DERROCHE, IMAGENES Y REPORTES ==="]

    if not zonas:
        lineas.append("Todavia no hay salas registradas.")
    else:
        lineas.append("Por sala (imagenes guardadas en el historial, alertas de derroche total y de hoy):")
        for zona in zonas:
            imagenes = _contar(
                models.DeteccionOcupacion,
                models.DeteccionOcupacion.id_zona == zona.id_zona,
                models.DeteccionOcupacion.imagen_referencia.is_not(None),
            )
            alertas_total = _contar(models.Recomendacion, models.Recomendacion.id_zona == zona.id_zona)
            alertas_hoy = _contar(
                models.Recomendacion,
                models.Recomendacion.id_zona == zona.id_zona,
                models.Recomendacion.fecha_hora >= inicio_hoy,
            )
            lineas.append(
                f"- {zona.nombre}: {imagenes} imagen(es) guardadas, {alertas_total} alerta(s) de derroche "
                f"en total ({alertas_hoy} hoy)."
            )

    alertas_hoy_global = _contar(models.Recomendacion, models.Recomendacion.fecha_hora >= inicio_hoy)
    lineas.append(f"Alertas de derroche generadas HOY (todas las salas): {alertas_hoy_global}.")

    reportes_usuario = _contar(models.Reporte, models.Reporte.id_usuario == id_usuario)
    lineas.append(f"Reportes generados por este usuario: {reportes_usuario}.")

    return "\n".join(lineas)


def construir_contexto_datos(db: Session, id_usuario) -> str:
    """Snapshot en texto plano del historial energetico persistido (tablas del
    modulo `api.energy`) + parametros del sistema, para inyectar como contexto."""
    ahora = dt.datetime.now(dt.timezone.utc)
    resumen = historical.comparar_actual_vs_optimizado(db, limite=200)
    por_ocupacion = historical.comparar_por_ocupacion(db, limite=500)
    por_simulacion = historical.comparar_por_simulacion(db, limite=500)
    hoy = historical.resumen_periodo(db, desde=ahora.replace(hour=0, minute=0, second=0, microsecond=0))
    ultimas_24h = historical.resumen_periodo(db, desde=ahora - dt.timedelta(hours=24))
    eventos = historical.eventos_recientes(db, desde=ahora - dt.timedelta(days=7), limite=15)

    lineas: list[str] = ["=== CONTEXTO DE DATOS (SELENE) ==="]

    if resumen["muestras"] == 0:
        lineas.append("Historial de analisis energeticos: TODAVIA NO HAY REGISTROS.")
    else:
        lineas.append(f"Historial de analisis energeticos: {resumen['muestras']} escenas analizadas (ultimas registradas).")
        lineas.append(f"- Consumo estimado promedio por escena: {_formatear_numero(resumen['consumo_estimado_kwh_promedio'], ' kWh')}")
        lineas.append(f"- Consumo optimizado promedio por escena: {_formatear_numero(resumen['consumo_optimizado_kwh_promedio'], ' kWh')}")
        lineas.append(f"- Ahorro promedio por escena: {_formatear_numero(resumen['ahorro_kwh_promedio'], ' kWh')} ({_formatear_numero(resumen['ahorro_porcentaje_promedio'], '%')})")

    if hoy["muestras"] > 0:
        lineas.append(f"Total estimado HOY: {hoy['consumo_estimado_kwh_total']:.2f} kWh consumidos, {hoy['ahorro_kwh_total']:.2f} kWh de ahorro potencial, {hoy['co2_evitable_kg_total']:.2f} kg de CO2 evitable.")
    if ultimas_24h["muestras"] > 0:
        lineas.append(f"Total estimado ULTIMAS 24 HORAS: {ultimas_24h['consumo_estimado_kwh_total']:.2f} kWh consumidos, {ultimas_24h['ahorro_kwh_total']:.2f} kWh de ahorro potencial.")

    if eventos:
        lineas.append("Eventos recientes por luminaria (encendido/apagado/alertas de ultimos 7 dias, mas recientes primero):")
        for ev in eventos:
            fecha_legible = ev["fecha_hora"].strftime("%Y-%m-%d %H:%M")
            lineas.append(f"- [{fecha_legible}] {ev['luminaria']}: {ev['descripcion'] or ev['tipo_evento']}")

    con_datos = [b for b in por_ocupacion if b["muestras"] > 0]
    if con_datos:
        lineas.append("Consumo estimado promedio por nivel de ocupacion:")
        for bucket in con_datos:
            lineas.append(
                f"- {bucket['nivel_ocupacion']}: {_formatear_numero(bucket['consumo_estimado_kwh_promedio'], ' kWh')} "
                f"({bucket['muestras']} muestras)"
            )

    if por_simulacion:
        lineas.append("Ahorro promedio observado por tipo de plan de ahorro (simulacion):")
        for fila in por_simulacion:
            lineas.append(
                f"- {fila['tipo_simulacion']}: {_formatear_numero(fila['ahorro_kwh_promedio'], ' kWh')} "
                f"({_formatear_numero(fila['ahorro_porcentaje_promedio'], '%')}, {fila['muestras']} muestras)"
            )

    lineas.append("")
    lineas.append("Planes de ahorro (simulaciones) que el sistema puede aplicar:")
    for tipo, descripcion in _DESCRIPCION_SIMULACIONES.items():
        lineas.append(f"- {tipo}: {descripcion}")

    lineas.append("")
    lineas.append("Parametros del sistema:")
    lineas.append(f"- Factor de emision de CO2: {settings.co2_emission_factor_kg_per_kwh} kg CO2/kWh.")
    lineas.append(f"- Umbral de luz natural 'suficiente': {energy_context.umbral_natural_suficiente():.0f}%.")
    lineas.append(f"- Umbral de luz natural 'insuficiente': {energy_context.umbral_natural_insuficiente():.0f}%.")
    lineas.append(f"- Potencia promedio asumida por luminaria: {energy_context.potencia_promedio_luminaria_w():.0f} W.")
    lineas.append(
        "- El consumo se estima con un modelo LightGBM entrenado con datos historicos de la UPTC, "
        "adaptado a la escala de un espacio individual (salon/oficina), no de un campus completo: "
        "las cifras son una aproximacion, no una medicion de un medidor fisico."
    )

    lineas.append(construir_contexto_salas(db, id_usuario))

    return "\n".join(lineas)


def mensajes_historial(db: Session, id_usuario, limite: int = 6) -> list[dict]:
    """Ultimos `limite` intercambios de este usuario, en formato Chat
    Completions (user/assistant alternados), para continuidad conversacional."""
    consultas = db.scalars(
        select(models.Consulta)
        .where(models.Consulta.id_usuario == id_usuario)
        .order_by(models.Consulta.fecha_hora.desc())
        .limit(limite)
    ).all()

    mensajes: list[dict] = []
    for consulta in reversed(consultas):
        mensajes.append({"role": "user", "content": consulta.pregunta})
        if consulta.respuesta:
            mensajes.append({"role": "assistant", "content": consulta.respuesta})
    return mensajes


def construir_mensajes(db: Session, id_usuario, pregunta: str) -> list[dict]:
    contexto = construir_contexto_datos(db, id_usuario)
    mensajes = [{"role": "system", "content": f"{SYSTEM_PROMPT}\n\n{contexto}"}]
    mensajes.extend(mensajes_historial(db, id_usuario))
    mensajes.append({"role": "user", "content": pregunta})
    return mensajes
