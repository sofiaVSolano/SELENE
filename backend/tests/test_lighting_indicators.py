"""Natural Score / Artificial Score: el calculo que sostiene RF-03.

Estos indicadores deciden el porcentaje de luz natural frente a artificial que
la interfaz muestra al usuario y que el motor de reglas usa para recomendar.
Se prueban aqui sin camara, sin modelo y sin base de datos: `IndicatorCalculator`
recibe diccionarios y devuelve numeros, asi que la formula se puede verificar a
mano contra la documentada en la memoria (Seccion 3.1.3.5).
"""

from __future__ import annotations

import pytest

from lightingAnalyzer.indicators import IndicatorCalculator
from lightingAnalyzer.utils import LightingAnalyzerError

# Pesos deliberadamente planos (0.2 cada uno) para que el resultado esperado se
# pueda calcular a mano en los tests sin arrastrar los valores de produccion.
PESOS_PLANOS = {
    "natural": {"windows": 0.2, "area": 0.2, "brightness": 0.2, "contrast": 0.2, "distribution": 0.2},
    "artificial": {"luminaires": 0.2, "area": 0.2, "brightness": 0.2, "contrast": 0.2, "hotspot": 0.2},
}

NORMALIZACION = {
    "window_count_saturation": 4,
    "window_area_saturation": 0.35,
    "luminaire_count_saturation": 6,
    "luminaire_area_saturation": 0.20,
    "hotspot_pct_saturation": 15.0,
}


def calculadora(pesos=None, norm=None) -> IndicatorCalculator:
    return IndicatorCalculator(pesos or PESOS_PLANOS, norm or NORMALIZACION)


def ventana(relative_area=0.1, brightness_mean=200.0, contrast=0.5, centroid_x=100.0) -> dict:
    return {
        "relative_area": relative_area,
        "brightness_mean": brightness_mean,
        "contrast": contrast,
        "centroid_x": centroid_x,
    }


def luminaria(relative_area=0.05, brightness_mean=240.0, contrast=0.6, bright_pixel_pct=10.0) -> dict:
    return {
        "relative_area": relative_area,
        "brightness_mean": brightness_mean,
        "contrast": contrast,
        "bright_pixel_pct": bright_pixel_pct,
    }


# --- Validacion de la configuracion -----------------------------------------


def test_pesos_que_no_suman_uno_se_rechazan_al_construir():
    # Si los pesos no suman 1.0 los "scores" dejan de estar en [0, 1] y el
    # porcentaje mostrado al usuario pierde sentido; debe fallar temprano.
    pesos = {
        "natural": {"windows": 0.5, "area": 0.2, "brightness": 0.2, "contrast": 0.2, "distribution": 0.2},
        "artificial": PESOS_PLANOS["artificial"],
    }
    with pytest.raises(LightingAnalyzerError, match="deben sumar 1.0"):
        calculadora(pesos)


def test_falta_un_bloque_de_pesos_y_se_rechaza():
    with pytest.raises(LightingAnalyzerError, match="artificial"):
        calculadora({"natural": PESOS_PLANOS["natural"]})


# --- Saturacion de componentes ----------------------------------------------


def test_el_conteo_de_ventanas_satura_en_uno():
    # 15 ventanas con saturacion 4 no deben valer 15/4 = 3.75: la saturacion
    # existe justamente para que un caso extremo no domine la suma ponderada.
    calc = calculadora()
    componentes = calc._natural_components([ventana(centroid_x=i * 10.0) for i in range(15)], (480, 640))
    assert componentes["windows"] == 1.0


def test_el_brillo_medio_se_normaliza_sobre_255():
    calc = calculadora()
    componentes = calc._natural_components([ventana(brightness_mean=127.5)], (480, 640))
    assert componentes["brightness"] == pytest.approx(0.5)


def test_sin_ventanas_los_componentes_de_roi_quedan_en_cero():
    # No hay region que medir: area, brillo, contraste y distribucion valen 0
    # en vez de propagar una division por cero.
    calc = calculadora()
    componentes = calc._natural_components([], (480, 640))
    assert componentes == {
        "windows": 0.0,
        "area": 0.0,
        "brightness": 0.0,
        "contrast": 0.0,
        "distribution": 0.0,
    }


# --- Distribucion espacial ---------------------------------------------------


@pytest.mark.parametrize(
    "centroides, esperado",
    [
        ([100.0], 1 / 3),                  # todas en el tercio izquierdo
        ([100.0, 500.0], 2 / 3),           # dos tercios cubiertos
        ([100.0, 320.0, 600.0], 1.0),      # los tres tercios
        ([100.0, 110.0, 120.0], 1 / 3),    # amontonadas: sigue siendo un tercio
    ],
)
def test_la_distribucion_cuenta_tercios_cubiertos_no_ventanas(centroides, esperado):
    assert IndicatorCalculator._spatial_distribution(centroides, 640) == pytest.approx(esperado)


def test_la_distribucion_es_cero_si_la_imagen_no_tiene_ancho():
    assert IndicatorCalculator._spatial_distribution([100.0], 0) == 0.0


# --- Formula completa --------------------------------------------------------


def test_la_suma_ponderada_coincide_con_el_calculo_a_mano():
    """Verifica la formula documentada: raw = suma(peso_i * componente_i)."""
    calc = calculadora()
    resultado = calc.compute(
        scene_result={"mean": 128.0},
        window_results=[ventana(relative_area=0.35, brightness_mean=255.0, contrast=1.0, centroid_x=100.0)],
        luminaire_results=[],
        image_shape=(480, 640),
    )
    # windows = 1/4 = 0.25 | area = 0.35/0.35 = 1.0 | brightness = 1.0
    # contrast = 1.0 | distribution = 1/3
    esperado = 0.2 * (0.25 + 1.0 + 1.0 + 1.0 + 1 / 3)
    assert resultado["natural_raw"] == pytest.approx(esperado)


def test_los_porcentajes_siempre_suman_cien():
    calc = calculadora()
    resultado = calc.compute(
        scene_result={"mean": 100.0},
        window_results=[ventana(), ventana(centroid_x=600.0)],
        luminaire_results=[luminaria(), luminaria(), luminaria()],
        image_shape=(480, 640),
    )
    suma = resultado["natural_percentage"] + resultado["artificial_percentage"]
    assert suma == pytest.approx(100.0)
    assert resultado["fallback_used"] is False


def test_solo_luminarias_da_predominio_artificial():
    calc = calculadora()
    resultado = calc.compute(
        scene_result={"mean": 100.0},
        window_results=[],
        luminaire_results=[luminaria()],
        image_shape=(480, 640),
    )
    assert resultado["artificial_percentage"] > resultado["natural_percentage"]


# --- Caso borde: sin ninguna evidencia --------------------------------------


def test_sin_detecciones_se_usa_el_brillo_de_escena_y_se_marca_el_fallback():
    # Es el caso que mas importa documentar: el detector tiene recall < 0.5,
    # asi que "cero detecciones" no significa "cero luces en la sala".
    calc = calculadora()
    resultado = calc.compute(
        scene_result={"mean": 191.25},   # 191.25 / 255 = 0.75
        window_results=[],
        luminaire_results=[],
        image_shape=(480, 640),
    )
    assert resultado["fallback_used"] is True
    assert resultado["natural_score"] == pytest.approx(0.75)
    assert resultado["natural_percentage"] == pytest.approx(75.0)
    assert resultado["artificial_percentage"] == pytest.approx(25.0)


def test_el_fallback_acota_el_brillo_a_uno():
    calc = calculadora()
    resultado = calc.compute(
        scene_result={"mean": 300.0},    # fuera de rango: no debe pasar de 1.0
        window_results=[],
        luminaire_results=[],
        image_shape=(480, 640),
    )
    assert resultado["natural_score"] == 1.0
    assert resultado["artificial_score"] == 0.0
