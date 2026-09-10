"""Redaccion de la alerta de oportunidad (sala vacia con luz encendida).

SELENE no acciona nada: solo avisa. El mensaje tiene que hablar en plural
correcto y pedir apagar, nunca prometer que apagara.
"""

from __future__ import annotations

import pytest

from api.routers.alertas import _describir_luces


def test_una_sola_luz_se_describe_en_singular():
    assert _describir_luces(1) == ("hay una luz encendida", "apagarla")


@pytest.mark.parametrize("encendidas", [2, 3, 12])
def test_varias_luces_se_describen_en_plural_con_su_numero(encendidas):
    luces, apagar = _describir_luces(encendidas)
    assert luces == f"hay {encendidas} luces encendidas"
    assert apagar == "apagarlas"
