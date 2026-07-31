"""
classifier.py
-------------
Clasificacion final del tipo de iluminacion de la escena (Natural / Artificial
/ Mixta) a partir de los porcentajes calculados por indicators.py.

Los umbrales de decision viven en `configs/lighting_thresholds.yaml` y no
estan hardcodeados: modificar el archivo cambia el comportamiento sin tocar
este codigo.

Reglas (se evaluan en este orden; gana la primera que se cumple):

    1. "Natural"    si natural_percentage    > umbral_natural.min_pct
                    Y artificial_percentage  < umbral_natural.max_opposite_pct

    2. "Artificial" si artificial_percentage > umbral_artificial.min_pct
                    Y natural_percentage     < umbral_artificial.max_opposite_pct

    3. "Mixta"      en cualquier otro caso (incluye 50/50 y toda combinacion
                    que no dispare 1 ni 2 de forma inequivoca).
"""

from __future__ import annotations

import logging

from . import utils

logger = logging.getLogger("lightingAnalyzer.classifier")

NATURAL = "Natural"
ARTIFICIAL = "Artificial"
MIXED = "Mixta"


class LightingClassifier:
    """Clasifica el tipo de iluminacion dominante de la escena."""

    def __init__(self, thresholds_config: dict):
        try:
            self.natural_min_pct = float(thresholds_config["natural"]["min_pct"])
            self.natural_max_opposite_pct = float(thresholds_config["natural"]["max_opposite_pct"])
            self.artificial_min_pct = float(thresholds_config["artificial"]["min_pct"])
            self.artificial_max_opposite_pct = float(thresholds_config["artificial"]["max_opposite_pct"])
        except KeyError as exc:
            raise utils.LightingAnalyzerError(
                "configs/lighting_thresholds.yaml incompleto: se esperan las claves "
                "natural.min_pct, natural.max_opposite_pct, artificial.min_pct, "
                "artificial.max_opposite_pct."
            ) from exc

    def classify(self, natural_percentage: float, artificial_percentage: float) -> str:
        if (
            natural_percentage > self.natural_min_pct
            and artificial_percentage < self.natural_max_opposite_pct
        ):
            result = NATURAL
        elif (
            artificial_percentage > self.artificial_min_pct
            and natural_percentage < self.artificial_max_opposite_pct
        ):
            result = ARTIFICIAL
        else:
            result = MIXED

        logger.info(
            "Clasificacion: %s (natural=%.2f%%, artificial=%.2f%%)",
            result, natural_percentage, artificial_percentage,
        )
        return result
