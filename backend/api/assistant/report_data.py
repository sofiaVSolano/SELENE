"""Arma los datos (periodo + secciones) para cada tipo de reporte del
catalogo (`report_types.py`), a partir de lo ya persistido por `api.energy` --
ningun numero se inventa aqui, son las mismas consultas que ya usa
`context_builder` para anclar al LLM (ver `energy/historical.py`).

Cada `datos_*` devuelve `{"periodo": str, "secciones": list[dict]}`, donde
cada seccion es `{"titulo": str, "parrafos": list[str] | None, "tabla": list[list[str]] | None}`
(la primera fila de `tabla`, si existe, es el encabezado) -- listo para que
`pdf_renderer.render_pdf` lo dibuje.
"""

from __future__ import annotations

import calendar
import datetime as dt

from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import models
from ..energy import historical


def datos_consumo_diario(db: Session) -> dict:
    ahora = dt.datetime.now(dt.timezone.utc)
    inicio_dia = ahora.replace(hour=0, minute=0, second=0, microsecond=0)
    resumen = historical.resumen_periodo(db, desde=inicio_dia, hasta=ahora)
    eventos = historical.eventos_recientes(db, desde=inicio_dia, limite=20)

    secciones = [
        {
            "titulo": "Consumo estimado de hoy",
            "parrafos": [
                f"Muestras analizadas: {resumen['muestras']}.",
                f"Consumo total estimado: {resumen['consumo_estimado_kwh_total']:.3f} kWh.",
                f"Consumo optimizado (si se aplicaran las recomendaciones): {resumen['consumo_optimizado_kwh_total']:.3f} kWh.",
                f"Ahorro potencial: {resumen['ahorro_kwh_total']:.3f} kWh.",
                f"CO2 generado: {resumen['co2_generado_kg_total']:.3f} kg. CO2 evitable: {resumen['co2_evitable_kg_total']:.3f} kg.",
            ],
        },
    ]
    if eventos:
        secciones.append({
            "titulo": "Eventos de hoy (encendido / apagado / alertas)",
            "tabla": [["Hora", "Luminaria", "Evento"]] + [
                [ev["fecha_hora"].strftime("%H:%M"), ev["luminaria"], ev["descripcion"] or ev["tipo_evento"]]
                for ev in eventos
            ],
        })

    return {"periodo": inicio_dia.strftime("%Y-%m-%d"), "secciones": secciones}


def datos_consumo_mensual(db: Session) -> dict:
    ahora = dt.datetime.now(dt.timezone.utc)
    inicio_mes = ahora.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    resumen = historical.resumen_periodo(db, desde=inicio_mes, hasta=ahora)
    por_dia = historical.resumen_por_dia(db, desde=inicio_mes, hasta=ahora)

    periodo = f"{calendar.month_name[ahora.month].capitalize()} {ahora.year}"

    secciones = [
        {
            "titulo": f"Estimado de consumo de {periodo}",
            "parrafos": [
                f"Muestras analizadas: {resumen['muestras']}.",
                f"Consumo total estimado: {resumen['consumo_estimado_kwh_total']:.3f} kWh.",
                f"Consumo optimizado: {resumen['consumo_optimizado_kwh_total']:.3f} kWh.",
                f"Ahorro potencial acumulado: {resumen['ahorro_kwh_total']:.3f} kWh.",
                f"CO2 evitable acumulado: {resumen['co2_evitable_kg_total']:.3f} kg.",
            ],
        },
    ]
    if por_dia:
        secciones.append({
            "titulo": "Detalle por dia",
            "tabla": [["Fecha", "Consumo estimado (kWh)", "Ahorro potencial (kWh)"]] + [
                [d["fecha"].strftime("%Y-%m-%d"), f"{d['consumo_estimado_kwh_total']:.3f}", f"{d['ahorro_kwh_total']:.3f}"]
                for d in por_dia
            ],
        })
    else:
        secciones.append({"titulo": "Detalle por dia", "parrafos": ["Todavia no hay analisis registrados este mes."]})

    return {"periodo": periodo, "secciones": secciones}


def datos_plan_ahorro(db: Session, limite: int = 10) -> dict:
    por_simulacion = historical.comparar_por_simulacion(db, limite=500)
    recomendaciones = db.scalars(
        select(models.RecomendacionEnergetica)
        .order_by(models.RecomendacionEnergetica.ahorro_estimado_kwh.desc())
        .limit(limite)
    ).all()

    secciones = []
    if por_simulacion:
        secciones.append({
            "titulo": "Ahorro promedio por tipo de plan (historico)",
            "tabla": [["Tipo de plan", "Ahorro promedio (kWh)", "Ahorro (%)", "Muestras"]] + [
                [
                    f["tipo_simulacion"],
                    f"{f['ahorro_kwh_promedio'] or 0:.3f}",
                    f"{f['ahorro_porcentaje_promedio'] or 0:.1f}%",
                    str(f["muestras"]),
                ]
                for f in por_simulacion
            ],
        })
    if recomendaciones:
        secciones.append({
            "titulo": "Recomendaciones puntuales con mayor ahorro estimado",
            "tabla": [["Fecha", "Recomendacion", "Ahorro (kWh)", "Ahorro (%)"]] + [
                [
                    r.fecha.strftime("%Y-%m-%d %H:%M"),
                    r.descripcion,
                    f"{float(r.ahorro_estimado_kwh):.3f}",
                    f"{float(r.ahorro_porcentaje):.1f}%",
                ]
                for r in recomendaciones
            ],
        })
    if not secciones:
        secciones.append({
            "titulo": "Plan de ahorro energetico",
            "parrafos": ["Todavia no hay suficiente historial para armar un plan de ahorro."],
        })

    return {"periodo": dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%d"), "secciones": secciones}
