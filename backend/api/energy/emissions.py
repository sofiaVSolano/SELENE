"""Estimacion de emisiones de CO2 a partir de un factor de emision configurable
(kg CO2 / kWh, ver CO2_EMISSION_FACTOR_KG_PER_KWH en backend/.env — depende de
la matriz energetica del pais/region y debe ajustarse por el operador)."""

from __future__ import annotations

from .mathutils import safe_divide
from .schemas import EmisionesResultado


def calcular_co2_kg(consumo_kwh: float, factor_kg_por_kwh: float) -> float:
    return round(max(consumo_kwh, 0.0) * factor_kg_por_kwh, 4)


def comparar_emisiones(consumo_actual_kwh: float, consumo_optimizado_kwh: float, factor_kg_por_kwh: float) -> EmisionesResultado:
    co2_actual = calcular_co2_kg(consumo_actual_kwh, factor_kg_por_kwh)
    co2_optimizado = calcular_co2_kg(consumo_optimizado_kwh, factor_kg_por_kwh)
    co2_evitable = round(co2_actual - co2_optimizado, 4)
    reduccion_pct = round(safe_divide(co2_evitable, co2_actual) * 100.0, 4)

    return EmisionesResultado(
        factor_kg_por_kwh=factor_kg_por_kwh,
        co2_actual_kg=co2_actual,
        co2_optimizado_kg=co2_optimizado,
        co2_evitable_kg=co2_evitable,
        reduccion_porcentaje=reduccion_pct,
    )
