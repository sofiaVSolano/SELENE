"""Calculos puros del modulo energetico: sin base de datos ni modelo cargado."""

from __future__ import annotations

from api.energy.mathutils import safe_divide


def test_safe_divide_divide_normalmente():
    assert safe_divide(10, 4) == 2.5


def test_safe_divide_no_revienta_con_denominador_cero():
    # Los indicadores dividen por area_m2, num_luminarias o personas, todos
    # valores que pueden llegar en cero desde una escena real.
    assert safe_divide(10, 0) == 0.0


def test_safe_divide_admite_un_valor_por_defecto_propio():
    assert safe_divide(10, 0, default=-1.0) == -1.0
