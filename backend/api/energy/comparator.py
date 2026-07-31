"""Comparacion actual vs. optimizado (kWh, %, ganancia energetica)."""

from __future__ import annotations

from .mathutils import safe_divide
from .schemas import ComparacionEscenarios


def comparar(consumo_actual_kwh: float, consumo_optimizado_kwh: float) -> ComparacionEscenarios:
    diferencia = round(consumo_actual_kwh - consumo_optimizado_kwh, 4)
    diferencia_pct = round(safe_divide(diferencia, consumo_actual_kwh) * 100.0, 4)

    return ComparacionEscenarios(
        consumo_actual_kwh=round(consumo_actual_kwh, 4),
        consumo_optimizado_kwh=round(consumo_optimizado_kwh, 4),
        diferencia_kwh=diferencia,
        diferencia_porcentaje=diferencia_pct,
        ganancia_energetica_kwh=max(diferencia, 0.0),
    )
