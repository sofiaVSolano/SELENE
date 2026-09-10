"""Clasificacion del tipo de iluminacion y motor de reglas de recomendacion.

Son las dos piezas que convierten los porcentajes de `indicators.py` en algo
que el usuario lee: la etiqueta Natural/Artificial/Mixta y el texto de la
recomendacion. Ambas leen su configuracion de YAML, asi que lo que se prueba
aqui es que las reglas se apliquen en el orden documentado y que una
configuracion invalida falle al construir y no en produccion.
"""

from __future__ import annotations

import pytest

from lightingAnalyzer.classifier import ARTIFICIAL, MIXED, NATURAL, LightingClassifier
from lightingAnalyzer.recommender import RecommendationEngine
from lightingAnalyzer.utils import LightingAnalyzerError

UMBRALES = {
    "natural": {"min_pct": 60.0, "max_opposite_pct": 40.0},
    "artificial": {"min_pct": 60.0, "max_opposite_pct": 40.0},
}


# --- Clasificador ------------------------------------------------------------


@pytest.mark.parametrize(
    "natural_pct, artificial_pct, esperado",
    [
        (80.0, 20.0, NATURAL),
        (20.0, 80.0, ARTIFICIAL),
        (50.0, 50.0, MIXED),      # empate exacto
        (60.0, 40.0, MIXED),      # justo en el umbral: la regla exige ">", no ">="
        (61.0, 39.0, NATURAL),    # un punto por encima ya decide
        (45.0, 55.0, MIXED),      # ninguna categoria domina de forma inequivoca
    ],
)
def test_la_clasificacion_sigue_los_umbrales_configurados(natural_pct, artificial_pct, esperado):
    assert LightingClassifier(UMBRALES).classify(natural_pct, artificial_pct) == esperado


def test_una_configuracion_de_umbrales_incompleta_falla_al_construir():
    with pytest.raises(LightingAnalyzerError, match="incompleto"):
        LightingClassifier({"natural": {"min_pct": 60.0}})


def test_cambiar_el_umbral_cambia_la_etiqueta_sin_tocar_codigo():
    # El proposito de tener los umbrales en YAML: el mismo par de porcentajes
    # se clasifica distinto solo cambiando la configuracion.
    porcentajes = (55.0, 45.0)
    estricto = LightingClassifier(UMBRALES)
    laxo = LightingClassifier(
        {
            "natural": {"min_pct": 50.0, "max_opposite_pct": 50.0},
            "artificial": {"min_pct": 60.0, "max_opposite_pct": 40.0},
        }
    )
    assert estricto.classify(*porcentajes) == MIXED
    assert laxo.classify(*porcentajes) == NATURAL


# --- Motor de recomendaciones ------------------------------------------------

REGLAS = {
    "rules": [
        {"name": "mucha luz natural", "min_natural_pct": 70.0, "message": "Aprovecha la luz natural."},
        {"name": "predomina artificial", "min_artificial_pct": 70.0, "message": "Revisa las luminarias."},
        {"name": "catch-all", "message": "Iluminacion mixta."},
    ]
}


def test_se_aplica_la_primera_regla_que_coincide():
    motor = RecommendationEngine(REGLAS)
    assert motor.recommend(80.0, 20.0) == "Aprovecha la luz natural."


def test_el_orden_de_las_reglas_decide_cuando_varias_coinciden():
    # Ambas reglas coinciden con 75/75 (imposible en la practica, pero es la
    # forma de comprobar que se evalua en orden y gana la primera).
    motor = RecommendationEngine(REGLAS)
    assert motor.recommend(75.0, 75.0) == "Aprovecha la luz natural."


def test_si_ninguna_regla_especifica_coincide_responde_el_catch_all():
    motor = RecommendationEngine(REGLAS)
    assert motor.recommend(50.0, 50.0) == "Iluminacion mixta."


def test_una_configuracion_sin_catch_all_se_rechaza():
    # Sin regla final sin condiciones habria escenas sin recomendacion.
    sin_catch_all = {"rules": [{"name": "solo natural", "min_natural_pct": 70.0, "message": "x"}]}
    with pytest.raises(LightingAnalyzerError, match="catch-all"):
        RecommendationEngine(sin_catch_all)


def test_una_configuracion_sin_reglas_se_rechaza():
    with pytest.raises(LightingAnalyzerError, match="ninguna regla"):
        RecommendationEngine({"rules": []})


def test_los_limites_maximos_tambien_se_respetan():
    reglas = {
        "rules": [
            {"name": "poca natural", "max_natural_pct": 30.0, "message": "Enciende luces."},
            {"name": "catch-all", "message": "Sin cambios."},
        ]
    }
    motor = RecommendationEngine(reglas)
    assert motor.recommend(25.0, 75.0) == "Enciende luces."
    assert motor.recommend(35.0, 65.0) == "Sin cambios."
