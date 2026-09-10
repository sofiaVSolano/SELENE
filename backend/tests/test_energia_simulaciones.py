"""Motor de simulaciones energeticas: las cuatro reglas de RF-09.

Cada simulacion decide que fraccion de luminarias quedaria activa y recompone
el consumo aislando la porcion atribuible a iluminacion artificial. La formula
esta documentada en el propio modulo y en la memoria; aqui se verifica con
numeros redondos para que el resultado sea comprobable a mano.

No se toca el modelo LightGBM: `PrediccionConsumo` se construye a mano, porque
lo que se prueba es la aritmetica de la simulacion, no la prediccion base.
"""

from __future__ import annotations

import datetime as dt

import pytest

from api.energy.schemas import EscenarioVision, PrediccionConsumo
from api.energy.simulations import (
    CATALOGO_SIMULACIONES,
    mejor_simulacion,
    porcion_iluminacion_kwh,
    simular,
    simular_aplicables,
)


def escenario(
    personas=0,
    num_luminarias=10,
    porcentaje_natural=0.0,
    tipo_iluminacion="Artificial",
) -> EscenarioVision:
    return EscenarioVision(
        personas_detectadas=personas,
        num_ventanas=2,
        num_luminarias=num_luminarias,
        area_ventanas_relativa=0.1,
        area_luminarias_relativa=0.05,
        brillo_escena=50.0,
        brillo_ventanas=200.0,
        brillo_luminarias=240.0,
        natural_score=porcentaje_natural / 100.0,
        artificial_score=1.0 - porcentaje_natural / 100.0,
        porcentaje_natural=porcentaje_natural,
        porcentaje_artificial=100.0 - porcentaje_natural,
        tipo_iluminacion=tipo_iluminacion,
        fecha_hora=dt.datetime(2026, 9, 10, 14, 0, 0),
        tipo_espacio="salon",
    )


def prediccion(consumo_kwh=100.0) -> PrediccionConsumo:
    return PrediccionConsumo(
        modelo_utilizado="LightGBM",
        variables_entrada={},
        consumo_kwh=consumo_kwh,
        tiempo_inferencia_ms=0.01,
    )


# --- Aritmetica base ---------------------------------------------------------


def test_la_porcion_de_iluminacion_es_el_porcentaje_artificial_del_total():
    assert porcion_iluminacion_kwh(100.0, 40.0) == pytest.approx(40.0)
    assert porcion_iluminacion_kwh(100.0, 0.0) == 0.0


# --- Regla 1: sala vacia -----------------------------------------------------


def test_sin_personas_se_apaga_toda_la_iluminacion_artificial():
    # 100 kWh totales, 40% artificial -> se ahorran los 40 kWh de iluminacion
    # y se conservan los 60 restantes (equipos, climatizacion, etc.).
    resultado = simular("apagar_sin_ocupacion", escenario(personas=0, porcentaje_natural=60.0), prediccion(100.0))
    assert resultado.escenario_simulado["fraccion_luminarias_activas"] == 0.0
    assert resultado.consumo_simulado_kwh == pytest.approx(60.0)
    assert resultado.ahorro_kwh == pytest.approx(40.0)
    assert resultado.ahorro_porcentaje == pytest.approx(40.0)


def test_con_personas_la_regla_de_sala_vacia_no_aplica():
    aplicables = [s.tipo_simulacion for s in simular_aplicables(escenario(personas=3), prediccion())]
    assert "apagar_sin_ocupacion" not in aplicables


# --- Regla 2: luz natural suficiente ----------------------------------------


def test_la_reduccion_por_luz_natural_es_proporcional_a_la_luz_disponible():
    # 80% de luz natural -> solo hace falta el 20% de la luz artificial.
    resultado = simular("reducir_con_luz_natural", escenario(personas=2, porcentaje_natural=80.0), prediccion(100.0))
    assert resultado.escenario_simulado["fraccion_luminarias_activas"] == pytest.approx(0.2)
    # artificial = 20 kWh; queda el 20% de esos 20 -> 4 kWh; ahorro = 16 kWh
    assert resultado.ahorro_kwh == pytest.approx(16.0)


def test_con_luz_natural_total_la_iluminacion_artificial_se_anula():
    resultado = simular("reducir_con_luz_natural", escenario(personas=1, porcentaje_natural=100.0), prediccion(100.0))
    assert resultado.escenario_simulado["fraccion_luminarias_activas"] == 0.0


# --- Regla 3: mantener solo las alejadas de ventanas ------------------------


def test_mantener_alejadas_exige_que_haya_luminarias():
    con_luminarias = escenario(personas=2, num_luminarias=10, porcentaje_natural=80.0)
    sin_luminarias = escenario(personas=2, num_luminarias=0, porcentaje_natural=80.0)
    assert "mantener_alejadas_ventanas" in [s.tipo_simulacion for s in simular_aplicables(con_luminarias, prediccion())]
    assert "mantener_alejadas_ventanas" not in [s.tipo_simulacion for s in simular_aplicables(sin_luminarias, prediccion())]


def test_se_estima_cuantas_luminarias_quedarian_encendidas():
    resultado = simular("mantener_alejadas_ventanas", escenario(personas=2, num_luminarias=10, porcentaje_natural=80.0), prediccion())
    fraccion = resultado.escenario_simulado["fraccion_luminarias_activas"]
    assert resultado.escenario_simulado["num_luminarias_activas_estimadas"] == pytest.approx(10 * fraccion, abs=0.01)


# --- Regla 4: mixta o luz natural insuficiente -------------------------------


def test_la_regla_de_iluminacion_mixta_aplica_por_tipo_de_escena():
    mixta = escenario(personas=2, porcentaje_natural=45.0, tipo_iluminacion="Mixta")
    assert "encendido_parcial_mixta" in [s.tipo_simulacion for s in simular_aplicables(mixta, prediccion())]


# --- Seleccion y errores -----------------------------------------------------


def test_la_mejor_simulacion_es_la_de_mayor_ahorro():
    # Sala vacia con mucha luz natural: aplican varias reglas a la vez y debe
    # ganar la de apagado total, que ahorra el 100% de la iluminacion.
    resultado = mejor_simulacion(escenario(personas=0, porcentaje_natural=80.0), prediccion(100.0))
    assert resultado is not None
    assert resultado.tipo_simulacion == "apagar_sin_ocupacion"
    assert all(resultado.ahorro_kwh >= s.ahorro_kwh
               for s in simular_aplicables(escenario(personas=0, porcentaje_natural=80.0), prediccion(100.0)))


def test_un_escenario_ya_optimo_no_devuelve_ninguna_simulacion():
    # Ocupado, sin luz natural aprovechable y sin ser mixta: no hay palanca.
    optimo = escenario(personas=5, porcentaje_natural=10.0, tipo_iluminacion="Artificial")
    assert mejor_simulacion(optimo, prediccion()) is None


def test_una_simulacion_inexistente_falla_diciendo_cuales_hay():
    with pytest.raises(ValueError, match="no existe"):
        simular("apagar_todo_siempre", escenario(), prediccion())


def test_el_catalogo_expone_las_cuatro_reglas_documentadas():
    assert set(CATALOGO_SIMULACIONES) == {
        "apagar_sin_ocupacion",
        "reducir_con_luz_natural",
        "mantener_alejadas_ventanas",
        "encendido_parcial_mixta",
    }


def test_el_consumo_simulado_nunca_es_negativo():
    # Caso patologico: 100% artificial y apagado total. El consumo debe caer a
    # 0, no por debajo.
    resultado = simular("apagar_sin_ocupacion", escenario(personas=0, porcentaje_natural=0.0), prediccion(50.0))
    assert resultado.consumo_simulado_kwh == 0.0
    assert resultado.ahorro_kwh == pytest.approx(50.0)
