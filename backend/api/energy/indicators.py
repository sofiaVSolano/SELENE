"""Indicadores energeticos derivados de la prediccion + el escenario de vision.

Cada indicador es una funcion pura, independiente y registrada en
`REGISTRO_INDICADORES`: para incorporar uno nuevo basta con escribir la
funcion y agregarla al registro (y, si debe viajar tipado en la respuesta de
la API, un campo en `schemas.IndicadoresEnergeticos`) — el resto del modulo
(`service.py`) no necesita cambiar.
"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass

from . import context
from .feature_mapping import calcular_ocupacion_pct
from .mathutils import safe_divide
from .schemas import ContextoInstalacion, EscenarioVision, IndicadoresEnergeticos
from .simulations import porcion_iluminacion_kwh


@dataclass(frozen=True)
class IndicatorContext:
    escenario: EscenarioVision
    contexto: ContextoInstalacion
    consumo_esperado_kwh: float
    consumo_optimizado_kwh: float


def _consumo_por_persona_kwh(ctx: IndicatorContext) -> float | None:
    if ctx.escenario.personas_detectadas <= 0:
        return None
    return round(ctx.consumo_esperado_kwh / ctx.escenario.personas_detectadas, 4)


def _consumo_por_luminaria_kwh(ctx: IndicatorContext) -> float | None:
    if ctx.escenario.num_luminarias <= 0:
        return None
    iluminacion_kwh = porcion_iluminacion_kwh(ctx.consumo_esperado_kwh, ctx.escenario.porcentaje_artificial)
    return round(iluminacion_kwh / ctx.escenario.num_luminarias, 4)


def _consumo_por_m2_kwh(ctx: IndicatorContext) -> float:
    return round(safe_divide(ctx.consumo_esperado_kwh, ctx.contexto.area_m2), 4)


def _intensidad_energetica_kwh_m2(ctx: IndicatorContext) -> float:
    # Intensidad energetica = consumo / area, la misma metrica estandar que
    # "consumo por m2"; se expone como indicador propio porque es el nombre
    # de columna que persiste consumo_energetico_estimado (ver database/).
    return _consumo_por_m2_kwh(ctx)


def _indice_aprovechamiento_natural(ctx: IndicatorContext) -> float:
    # natural_score ya es la estimacion normalizada (0-1) de lightingAnalyzer
    # de cuanta luz natural se esta aprovechando en la escena.
    return round(ctx.escenario.natural_score, 4)


def _indice_eficiencia_energetica(ctx: IndicatorContext) -> float:
    # Que tan cerca esta el consumo actual del optimo simulado: 1.0 = ya es
    # optimo (sin margen de ahorro detectado), valores menores = mas margen.
    return round(min(1.0, safe_divide(ctx.consumo_optimizado_kwh, ctx.consumo_esperado_kwh, default=1.0)), 4)


def _nivel_ocupacion_pct(ctx: IndicatorContext) -> float:
    return calcular_ocupacion_pct(ctx.escenario.personas_detectadas, ctx.contexto.capacidad_personas)


def _nivel_ocupacion_categoria(ctx: IndicatorContext) -> str:
    """Categoriza `nivel_ocupacion_pct` segun los umbrales de
    configs/energy_context.yaml -> niveles_ocupacion. El primer umbral (0.0,
    "vacio" por defecto) solo aplica a ocupacion estrictamente nula: con
    personas detectadas pero pocas (p. ej. 1 persona en un aforo de 40) el
    resultado debe leerse como "bajo", no "vacio" (eso confundiria con el
    caso 0 personas que dispara la recomendacion apagar_sin_ocupacion)."""
    ocupacion = _nivel_ocupacion_pct(ctx)
    niveles = sorted(context.niveles_ocupacion().items(), key=lambda kv: kv[1])
    if ocupacion <= 0 or len(niveles) <= 1:
        return niveles[0][0]

    categoria = niveles[1][0]
    for nombre, umbral in niveles[1:]:
        if ocupacion >= umbral:
            categoria = nombre
    return categoria


def _relacion_ocupacion_artificial(ctx: IndicatorContext) -> float | None:
    # Cuanta luz artificial se usa por unidad de ocupacion; valores altos con
    # ocupacion baja delatan luminarias encendidas sin necesidad. None cuando
    # no hay ocupacion que relacionar (ese caso ya lo cubre nivel_ocupacion
    # ='vacio' + la simulacion/recomendacion "apagar_sin_ocupacion").
    ocupacion = _nivel_ocupacion_pct(ctx)
    if ocupacion <= 0:
        return None
    return round(ctx.escenario.porcentaje_artificial / ocupacion, 4)


REGISTRO_INDICADORES: dict[str, Callable[[IndicatorContext], float | None]] = {
    "consumo_por_persona_kwh": _consumo_por_persona_kwh,
    "consumo_por_luminaria_kwh": _consumo_por_luminaria_kwh,
    "consumo_por_m2_kwh": _consumo_por_m2_kwh,
    "intensidad_energetica_kwh_m2": _intensidad_energetica_kwh_m2,
    "indice_aprovechamiento_natural": _indice_aprovechamiento_natural,
    "indice_eficiencia_energetica": _indice_eficiencia_energetica,
    "nivel_ocupacion_pct": _nivel_ocupacion_pct,
    "nivel_ocupacion_categoria": _nivel_ocupacion_categoria,
    "relacion_ocupacion_artificial": _relacion_ocupacion_artificial,
}


def calcular_indicadores(
    escenario: EscenarioVision,
    contexto: ContextoInstalacion,
    consumo_esperado_kwh: float,
    consumo_optimizado_kwh: float,
) -> IndicadoresEnergeticos:
    ctx = IndicatorContext(
        escenario=escenario,
        contexto=contexto,
        consumo_esperado_kwh=consumo_esperado_kwh,
        consumo_optimizado_kwh=consumo_optimizado_kwh,
    )
    valores = {nombre: funcion(ctx) for nombre, funcion in REGISTRO_INDICADORES.items()}
    return IndicadoresEnergeticos(**valores)
