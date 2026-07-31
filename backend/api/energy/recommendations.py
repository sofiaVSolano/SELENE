"""Motor de recomendaciones basado en reglas.

Cada regla es, en el fondo, una de las simulaciones de `simulations.py` cuya
condicion (`aplica`) se cumple para el escenario observado: la recomendacion
es literalmente "aplicar esa simulacion", con el antes/despues/ahorro/CO2 ya
calculado (ver `simulations.simular_aplicables`). Mantenerlas como la misma
fuente evita que recomendacion y simulacion queden inconsistentes entre si.
"""

from __future__ import annotations

from . import emissions
from .schemas import EscenarioVision, PrediccionConsumo, RecomendacionEnergetica, SimulacionResultado
from .simulations import simular_aplicables

_PRIORIDAD_FORZADA = {"apagar_sin_ocupacion": "alta"}


def _prioridad(simulacion: SimulacionResultado) -> str:
    if simulacion.tipo_simulacion in _PRIORIDAD_FORZADA:
        return _PRIORIDAD_FORZADA[simulacion.tipo_simulacion]
    if simulacion.ahorro_porcentaje >= 30:
        return "alta"
    if simulacion.ahorro_porcentaje >= 15:
        return "media"
    return "baja"


def _a_recomendacion(simulacion: SimulacionResultado, factor_co2: float) -> RecomendacionEnergetica:
    return RecomendacionEnergetica(
        tipo_recomendacion=simulacion.tipo_simulacion,
        descripcion=simulacion.descripcion,
        consumo_antes_kwh=simulacion.consumo_original_kwh,
        consumo_despues_kwh=simulacion.consumo_simulado_kwh,
        ahorro_kwh=simulacion.ahorro_kwh,
        ahorro_porcentaje=simulacion.ahorro_porcentaje,
        co2_evitable_kg=emissions.calcular_co2_kg(simulacion.ahorro_kwh, factor_co2),
        prioridad=_prioridad(simulacion),
    )


def generar_recomendaciones(
    escenario: EscenarioVision,
    prediccion_base: PrediccionConsumo,
    factor_co2_kg_por_kwh: float,
) -> list[RecomendacionEnergetica]:
    """Recomendaciones ordenadas de mayor a menor ahorro estimado (kWh)."""
    simulaciones = simular_aplicables(escenario, prediccion_base)
    recomendaciones = [_a_recomendacion(s, factor_co2_kg_por_kwh) for s in simulaciones]
    recomendaciones.sort(key=lambda r: r.ahorro_kwh, reverse=True)
    return recomendaciones
