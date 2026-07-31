"""Punto de entrada del modulo energetico: dado un `EscenarioVision` (que se
asume ya producido por el pipeline de vision), arma el `ReporteEnergetico`
completo -- prediccion, simulaciones, recomendaciones, comparacion,
emisiones e indicadores -- y opcionalmente lo persiste.
"""

from __future__ import annotations

from sqlalchemy.orm import Session

from ..config import settings
from . import comparator, context, emissions, indicators, persistence, predictor, recommendations, simulations
from .schemas import EscenarioVision, ReporteEnergetico


def generar_reporte_energetico(
    escenario: EscenarioVision,
    contexto_overrides: dict | None = None,
    db: Session | None = None,
    guardar: bool = False,
    factor_escala: float = 1.0,
) -> ReporteEnergetico:
    """`factor_escala` ajusta la prediccion (kWh "por tramo nativo", ver
    `horas_tramo_captura` en configs/energy_context.yaml) al tiempo real que
    representa este escenario -- p. ej. `horas_transcurridas /
    horas_tramo_captura()` cuando se llama una vez por frame de camara en vez
    de una vez por tramo horario completo (ver `vision_bridge.py`). Como
    comparator/emissions/indicators/simulations/recommendations son todas
    funciones lineales de `prediccion.consumo_kwh`, escalar aqui (antes de
    derivar el resto del reporte) basta para que todo el reporte quede
    consistente con esa fraccion de tiempo."""
    contexto = context.resolver_contexto(escenario.perfil_contexto, **(contexto_overrides or {}))

    prediccion = predictor.predecir_consumo(escenario, contexto)
    if factor_escala != 1.0:
        prediccion = prediccion.model_copy(
            update={"consumo_kwh": round(max(prediccion.consumo_kwh * factor_escala, 0.0), 4)}
        )
    todas_las_simulaciones = simulations.simular_aplicables(escenario, prediccion)
    mejor = max(todas_las_simulaciones, key=lambda s: s.ahorro_kwh, default=None)
    consumo_optimizado = mejor.consumo_simulado_kwh if mejor else prediccion.consumo_kwh

    comparacion = comparator.comparar(prediccion.consumo_kwh, consumo_optimizado)
    emisiones = emissions.comparar_emisiones(
        prediccion.consumo_kwh, consumo_optimizado, settings.co2_emission_factor_kg_per_kwh
    )
    indicadores = indicators.calcular_indicadores(escenario, contexto, prediccion.consumo_kwh, consumo_optimizado)
    recos = recommendations.generar_recomendaciones(escenario, prediccion, settings.co2_emission_factor_kg_per_kwh)

    reporte = ReporteEnergetico(
        fecha_hora=escenario.fecha_hora,
        captura_id=escenario.captura_id,
        contexto=contexto,
        prediccion=prediccion,
        consumo_esperado_kwh=prediccion.consumo_kwh,
        consumo_optimizado_kwh=comparacion.consumo_optimizado_kwh,
        ahorro_kwh=comparacion.diferencia_kwh,
        ahorro_porcentaje=comparacion.diferencia_porcentaje,
        comparacion=comparacion,
        emisiones=emisiones,
        indicadores=indicadores,
        simulaciones=todas_las_simulaciones,
        recomendaciones=recos,
    )

    if guardar:
        if db is None:
            raise ValueError("guardar=True requiere una sesion de base de datos (db).")
        persistence.guardar_reporte(db, reporte)

    return reporte
