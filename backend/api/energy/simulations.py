"""Simulacion de escenarios "optimizados" para estimar el ahorro potencial.

El modelo LightGBM (`model_loader.py`) no tiene ninguna feature de
iluminacion/luminarias: predice el consumo agregado del espacio a partir de
ocupacion, tiempo y mezcla de sector. Por eso una simulacion como "apagar las
luminarias lejos de ventanas" no puede expresarse como una re-prediccion del
modelo (no existe esa palanca en sus features de entrada).

En su lugar, este modulo aisla la PORCION del consumo predicho que es
atribuible a iluminacion artificial usando `porcentaje_artificial` (que si
entrega la vision por computador):

    consumo_iluminacion_kwh = consumo_total_kwh * porcentaje_artificial / 100

y cada simulacion reduce esa porcion segun que fraccion de luminarias
quedarian activas, mantiene el resto del consumo (ocupacion, equipos, etc.)
sin cambios, y recompone el total:

    consumo_simulado_kwh = consumo_total_kwh - consumo_iluminacion_original
                            + consumo_iluminacion_kwh * fraccion_activa

Es una aproximacion deliberada y documentada (no una segunda prediccion del
modelo): mantiene el uso del modelo entrenado para el consumo base y usa la
senal de vision (natural/artificial score) para el ahorro accionable por
control de luminarias, que es justo lo que el sistema de vision puede influir.
"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass

from . import context
from .mathutils import safe_divide
from .schemas import EscenarioVision, PrediccionConsumo, SimulacionResultado


def porcion_iluminacion_kwh(consumo_total_kwh: float, porcentaje_artificial: float) -> float:
    return consumo_total_kwh * (porcentaje_artificial / 100.0)


@dataclass(frozen=True)
class DefinicionSimulacion:
    tipo: str
    aplica: Callable[[EscenarioVision], bool]
    fraccion_luminarias_activas: Callable[[EscenarioVision], float]
    descripcion: Callable[[EscenarioVision], str]


def _fraccion_reduccion_por_luz_natural(escenario: EscenarioVision) -> float:
    """Cuanta luz artificial sigue siendo necesaria decrece linealmente con
    el % de luz natural disponible (100% natural -> 0% artificial necesaria)."""
    return round(max(0.0, min(1.0, 1.0 - escenario.porcentaje_natural / 100.0)), 4)


def _es_mixta_o_insuficiente(escenario: EscenarioVision) -> bool:
    return (
        escenario.tipo_iluminacion == "Mixta"
        or context.umbral_natural_insuficiente() <= escenario.porcentaje_natural < context.umbral_natural_suficiente()
    )


_DEFINICIONES: list[DefinicionSimulacion] = [
    DefinicionSimulacion(
        tipo="apagar_sin_ocupacion",
        aplica=lambda e: e.personas_detectadas == 0,
        fraccion_luminarias_activas=lambda e: 0.0,
        descripcion=lambda e: "No se detectaron personas: apagar completamente la iluminacion artificial.",
    ),
    DefinicionSimulacion(
        tipo="reducir_con_luz_natural",
        aplica=lambda e: e.porcentaje_natural >= context.umbral_natural_suficiente(),
        fraccion_luminarias_activas=_fraccion_reduccion_por_luz_natural,
        descripcion=lambda e: (
            f"Iluminacion natural suficiente ({e.porcentaje_natural:.1f}% >= "
            f"{context.umbral_natural_suficiente():.0f}%): reducir el uso de luminarias en proporcion a la luz disponible."
        ),
    ),
    DefinicionSimulacion(
        tipo="mantener_alejadas_ventanas",
        aplica=lambda e: e.porcentaje_natural >= context.umbral_natural_suficiente() and e.num_luminarias > 0,
        fraccion_luminarias_activas=lambda e: context.fraccion_luminarias_lejos_ventanas(),
        descripcion=lambda e: (
            "Iluminacion natural suficiente cerca de las ventanas: mantener encendidas unicamente "
            f"las luminarias alejadas de ellas (~{context.fraccion_luminarias_lejos_ventanas():.0%} del total)."
        ),
    ),
    DefinicionSimulacion(
        tipo="encendido_parcial_mixta",
        aplica=_es_mixta_o_insuficiente,
        fraccion_luminarias_activas=lambda e: context.fraccion_encendido_mixta(),
        descripcion=lambda e: (
            "Iluminacion mixta o luz natural insuficiente: mantener solo la iluminacion artificial "
            f"necesaria (~{context.fraccion_encendido_mixta():.0%} de las luminarias activas)."
        ),
    ),
]

CATALOGO_SIMULACIONES: dict[str, DefinicionSimulacion] = {d.tipo: d for d in _DEFINICIONES}


def _ejecutar(definicion: DefinicionSimulacion, escenario: EscenarioVision, prediccion_base: PrediccionConsumo) -> SimulacionResultado:
    consumo_total = prediccion_base.consumo_kwh
    fraccion_activa = max(0.0, min(1.0, definicion.fraccion_luminarias_activas(escenario)))

    iluminacion_original = porcion_iluminacion_kwh(consumo_total, escenario.porcentaje_artificial)
    porcentaje_artificial_simulado = round(escenario.porcentaje_artificial * fraccion_activa, 4)
    iluminacion_simulada = porcion_iluminacion_kwh(consumo_total, porcentaje_artificial_simulado)

    consumo_simulado = round(max(0.0, consumo_total - iluminacion_original + iluminacion_simulada), 4)
    ahorro = round(consumo_total - consumo_simulado, 4)
    ahorro_pct = round(safe_divide(ahorro, consumo_total) * 100.0, 4)

    return SimulacionResultado(
        tipo_simulacion=definicion.tipo,
        descripcion=definicion.descripcion(escenario),
        escenario_original={
            "personas_detectadas": escenario.personas_detectadas,
            "num_luminarias": escenario.num_luminarias,
            # `num_ventanas` no lo usa la simulacion, pero este dict es el
            # UNICO sitio donde queda persistido el escenario de vision tal
            # como lo vio la camara, y los reportes de iluminacion necesitan
            # saber cuantas ventanas habia (ver
            # `historical.resumen_iluminacion`). Es aditivo: las filas
            # anteriores simplemente no lo traen.
            "num_ventanas": escenario.num_ventanas,
            "porcentaje_natural": escenario.porcentaje_natural,
            "porcentaje_artificial": escenario.porcentaje_artificial,
            "tipo_iluminacion": escenario.tipo_iluminacion,
        },
        escenario_simulado={
            "fraccion_luminarias_activas": fraccion_activa,
            "num_luminarias_activas_estimadas": round(escenario.num_luminarias * fraccion_activa, 2),
            "porcentaje_artificial_simulado": porcentaje_artificial_simulado,
        },
        consumo_original_kwh=round(consumo_total, 4),
        consumo_simulado_kwh=consumo_simulado,
        ahorro_kwh=ahorro,
        ahorro_porcentaje=ahorro_pct,
    )


def simular(tipo: str, escenario: EscenarioVision, prediccion_base: PrediccionConsumo) -> SimulacionResultado:
    definicion = CATALOGO_SIMULACIONES.get(tipo)
    if definicion is None:
        disponibles = ", ".join(sorted(CATALOGO_SIMULACIONES))
        raise ValueError(f"Simulacion '{tipo}' no existe. Disponibles: {disponibles}.")
    return _ejecutar(definicion, escenario, prediccion_base)


def simular_aplicables(escenario: EscenarioVision, prediccion_base: PrediccionConsumo) -> list[SimulacionResultado]:
    """Corre unicamente las simulaciones cuya condicion (`aplica`) se cumple
    para este escenario — son las candidatas reales a recomendar."""
    return [
        _ejecutar(definicion, escenario, prediccion_base)
        for definicion in _DEFINICIONES
        if definicion.aplica(escenario)
    ]


def mejor_simulacion(escenario: EscenarioVision, prediccion_base: PrediccionConsumo) -> SimulacionResultado | None:
    """La simulacion aplicable con mayor ahorro en kWh, o None si ninguna aplica
    (escenario ya optimo: ocupado, sin luz natural aprovechable)."""
    aplicables = simular_aplicables(escenario, prediccion_base)
    if not aplicables:
        return None
    return max(aplicables, key=lambda s: s.ahorro_kwh)
