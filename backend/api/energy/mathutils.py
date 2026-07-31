"""Utilidades numericas compartidas por indicators/simulations/comparator/emissions."""

from __future__ import annotations


def safe_divide(numerator: float, denominator: float, default: float = 0.0) -> float:
    if not denominator:
        return default
    return numerator / denominator
