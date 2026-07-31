"""Persistencia del reporte energetico en las 4 tablas del modulo (ver
`api.models` y `database/schema.sql`): consumo_energetico_estimado,
predicciones_consumo, recomendaciones_energeticas, simulaciones.

Separado de `service.py` para que generar un reporte (calculo puro) no
dependa de tener una sesion de base de datos abierta (p. ej. para pruebas).
"""

from __future__ import annotations

from sqlalchemy.orm import Session

from .. import models
from .schemas import ReporteEnergetico


def guardar_reporte(db: Session, reporte: ReporteEnergetico) -> None:
    captura_id = reporte.captura_id

    db.add(models.PrediccionConsumoDB(
        id_deteccion=captura_id,
        modelo_utilizado=reporte.prediccion.modelo_utilizado,
        variables_entrada=reporte.prediccion.variables_entrada,
        prediccion_kwh=reporte.prediccion.consumo_kwh,
        tiempo_inferencia_ms=reporte.prediccion.tiempo_inferencia_ms,
        confianza=reporte.prediccion.confianza,
    ))

    db.add(models.ConsumoEnergeticoEstimado(
        id_deteccion=captura_id,
        consumo_estimado_kwh=reporte.consumo_esperado_kwh,
        consumo_optimizado_kwh=reporte.consumo_optimizado_kwh,
        ahorro_kwh=reporte.ahorro_kwh,
        ahorro_porcentaje=reporte.ahorro_porcentaje,
        co2_generado_kg=reporte.emisiones.co2_actual_kg,
        co2_evitable_kg=reporte.emisiones.co2_evitable_kg,
        intensidad_energetica_kwh_m2=reporte.indicadores.intensidad_energetica_kwh_m2,
    ))

    for rec in reporte.recomendaciones:
        db.add(models.RecomendacionEnergetica(
            id_deteccion=captura_id,
            tipo_recomendacion=rec.tipo_recomendacion,
            descripcion=rec.descripcion,
            ahorro_estimado_kwh=rec.ahorro_kwh,
            ahorro_porcentaje=rec.ahorro_porcentaje,
            co2_estimado_kg=rec.co2_evitable_kg,
        ))

    for sim in reporte.simulaciones:
        db.add(models.Simulacion(
            id_deteccion=captura_id,
            tipo_simulacion=sim.tipo_simulacion,
            escenario_original=sim.escenario_original,
            escenario_simulado=sim.escenario_simulado,
            consumo_original_kwh=sim.consumo_original_kwh,
            consumo_simulado_kwh=sim.consumo_simulado_kwh,
            ahorro_kwh=sim.ahorro_kwh,
            ahorro_porcentaje=sim.ahorro_porcentaje,
        ))

    db.commit()
