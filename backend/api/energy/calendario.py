"""Festivos de Colombia (Ley 51 de 1983 / "Ley Emiliani"), necesarios para
derivar `es_festivo` a partir de `fecha_hora` sin depender de un catalogo
externo. Los festivos que caen entre martes y sabado se trasladan al lunes
siguiente; los de fecha fija (Ano Nuevo, Trabajo, Independencia, Boyaca,
Inmaculada, Navidad) y los ligados al Viernes/Jueves Santo no se trasladan.
"""

from __future__ import annotations

import datetime as dt
import functools

_FIJOS_NO_TRASLADABLES = [(1, 1), (5, 1), (7, 20), (8, 7), (12, 8), (12, 25)]
_TRASLADABLES = [(1, 6), (3, 19), (6, 29), (8, 15), (10, 12), (11, 1), (11, 11)]
_OFFSETS_PASCUA_TRASLADABLES = [39, 60, 68]  # Ascension, Corpus Christi, Sagrado Corazon


def _domingo_pascua(year: int) -> dt.date:
    """Algoritmo de Meeus/Jones/Butcher (calendario gregoriano)."""
    a = year % 19
    b = year // 100
    c = year % 100
    d = b // 4
    e = b % 4
    f = (b + 8) // 25
    g = (b - f + 1) // 3
    h = (19 * a + b - d - g + 15) % 30
    i = c // 4
    k = c % 4
    l = (32 + 2 * e + 2 * i - h - k) % 7
    m = (a + 11 * h + 22 * l) // 451
    numero = h + l - 7 * m + 114
    mes = numero // 31
    dia = numero % 31 + 1
    return dt.date(year, mes, dia)


def _siguiente_lunes(fecha: dt.date) -> dt.date:
    dias_hasta_lunes = (7 - fecha.weekday()) % 7
    return fecha if dias_hasta_lunes == 0 else fecha + dt.timedelta(days=dias_hasta_lunes)


@functools.lru_cache(maxsize=32)
def festivos_colombia(year: int) -> frozenset[dt.date]:
    festivos: set[dt.date] = {dt.date(year, mes, dia) for mes, dia in _FIJOS_NO_TRASLADABLES}
    festivos.update(_siguiente_lunes(dt.date(year, mes, dia)) for mes, dia in _TRASLADABLES)

    pascua = _domingo_pascua(year)
    festivos.add(pascua - dt.timedelta(days=3))  # Jueves Santo
    festivos.add(pascua - dt.timedelta(days=2))  # Viernes Santo
    festivos.update(_siguiente_lunes(pascua + dt.timedelta(days=offset)) for offset in _OFFSETS_PASCUA_TRASLADABLES)

    return frozenset(festivos)


def es_festivo(fecha: dt.date) -> bool:
    return fecha in festivos_colombia(fecha.year)
