"""
recommender.py
--------------
Motor de reglas de recomendacion automatica sobre el uso de iluminacion
natural/artificial, a partir de los porcentajes calculados por indicators.py.

Las reglas (condiciones + mensaje) viven en
`configs/lighting_recommendations.yaml` y se evaluan EN ORDEN: se aplica la
primera regla cuyas condiciones se cumplen todas. La ultima regla del archivo
debe ser un catch-all sin condiciones, para garantizar que siempre exista una
recomendacion.
"""

from __future__ import annotations

import logging

from . import utils

logger = logging.getLogger("lightingAnalyzer.recommender")

_CONDITION_KEYS = ("min_natural_pct", "max_natural_pct", "min_artificial_pct", "max_artificial_pct")


class RecommendationEngine:
    """Genera una recomendacion textual a partir de natural_pct/artificial_pct."""

    def __init__(self, recommendations_config: dict):
        rules = recommendations_config.get("rules")
        if not rules:
            raise utils.LightingAnalyzerError(
                "configs/lighting_recommendations.yaml no define ninguna regla ('rules')."
            )
        if not any(not any(key in rule for key in _CONDITION_KEYS) for rule in rules):
            raise utils.LightingAnalyzerError(
                "configs/lighting_recommendations.yaml debe incluir una regla catch-all "
                "(sin condiciones) al final de la lista."
            )
        self.rules = rules

    @staticmethod
    def _rule_matches(rule: dict, natural_pct: float, artificial_pct: float) -> bool:
        if "min_natural_pct" in rule and not (natural_pct >= rule["min_natural_pct"]):
            return False
        if "max_natural_pct" in rule and not (natural_pct <= rule["max_natural_pct"]):
            return False
        if "min_artificial_pct" in rule and not (artificial_pct >= rule["min_artificial_pct"]):
            return False
        if "max_artificial_pct" in rule and not (artificial_pct <= rule["max_artificial_pct"]):
            return False
        return True

    def recommend(self, natural_percentage: float, artificial_percentage: float) -> str:
        for rule in self.rules:
            if self._rule_matches(rule, natural_percentage, artificial_percentage):
                logger.info("Regla de recomendacion aplicada: %s", rule.get("name", "<sin nombre>"))
                return str(rule["message"]).strip()
        # Inalcanzable si la config tiene catch-all (validado en __init__),
        # pero se deja como red de seguridad explicita.
        raise utils.LightingAnalyzerError(
            "Ninguna regla de configs/lighting_recommendations.yaml coincidio y no hay catch-all."
        )
