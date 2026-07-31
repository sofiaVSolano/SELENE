"""Carga de configs/energy_context.yaml: perfiles de contexto por instalacion
y parametros ajustables del motor de simulacion/recomendaciones/indicadores.

Todo lo que en otro modulo estaria hardcodeado (potencia por luminaria,
umbrales de luz natural, mapeo tipo_espacio -> columna del modelo...) vive en
ese YAML para poder afinarlo sin tocar codigo, siguiendo el mismo patron que
`configs/lighting_*.yaml` en `lightingAnalyzer/`.
"""

from __future__ import annotations

import functools

import yaml

from ..config import settings
from .schemas import ContextoInstalacion


class EnergyContextError(Exception):
    pass


@functools.lru_cache(maxsize=1)
def _raw_config() -> dict:
    path = settings.project_root / settings.energy_context_config_path
    if not path.exists():
        raise EnergyContextError(f"No se encontro {path}.")
    with open(path, encoding="utf-8") as fh:
        return yaml.safe_load(fh) or {}


def resolver_contexto(perfil_contexto: str = "default", **overrides: object) -> ContextoInstalacion:
    """Resuelve un `ContextoInstalacion` a partir del perfil nombrado en el
    YAML, con `overrides` puntuales (p. ej. area_m2 real de una instalacion
    concreta) aplicados encima."""
    perfiles = _raw_config().get("perfiles_contexto", {})
    if perfil_contexto not in perfiles:
        disponibles = ", ".join(sorted(perfiles)) or "(ninguno)"
        raise EnergyContextError(
            f"Perfil de contexto '{perfil_contexto}' no existe en "
            f"{settings.energy_context_config_path}. Disponibles: {disponibles}."
        )
    data = {**perfiles[perfil_contexto], **{k: v for k, v in overrides.items() if v is not None}}
    return ContextoInstalacion(**data)


def mapeo_tipo_espacio() -> dict[str, str]:
    return dict(_raw_config().get("mapeo_tipo_espacio", {}))


def potencia_promedio_luminaria_w() -> float:
    return float(_raw_config().get("potencia_promedio_luminaria_w", 36.0))


def horas_tramo_captura() -> float:
    return float(_raw_config().get("horas_tramo_captura", 1.0))


def fraccion_luminarias_lejos_ventanas() -> float:
    return float(_raw_config().get("fraccion_luminarias_lejos_ventanas", 0.4))


def fraccion_encendido_mixta() -> float:
    return float(_raw_config().get("fraccion_encendido_mixta", 0.5))


def umbral_natural_suficiente() -> float:
    return float(_raw_config().get("umbral_natural_suficiente", 60.0))


def umbral_natural_insuficiente() -> float:
    return float(_raw_config().get("umbral_natural_insuficiente", 30.0))


def niveles_ocupacion() -> dict[str, float]:
    return dict(_raw_config().get(
        "niveles_ocupacion", {"vacio": 0.0, "bajo": 25.0, "medio": 60.0, "alto": 85.0}
    ))
