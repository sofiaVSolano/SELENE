"""Traduce `EscenarioVision` (salida del sistema de vision) + `ContextoInstalacion`
(metadata estatica del espacio) a la fila de features CRUDAS que espera el
preprocesamiento del modelo LightGBM (ver `model_loader.feature_columns_raw`).

Separado de `predictor.py` para poder testear el mapeo (y las simulaciones,
que solo tocan un subconjunto de estos campos) sin cargar el modelo.
"""

from __future__ import annotations

from . import calendario
from .context import mapeo_tipo_espacio
from .schemas import ContextoInstalacion, EscenarioVision

SECTOR_COLUMNS = ["pct_comedores", "pct_salones", "pct_laboratorios", "pct_auditorios", "pct_oficinas"]


def calcular_ocupacion_pct(personas_detectadas: int, capacidad_personas: float) -> float:
    if capacidad_personas <= 0:
        return 0.0
    return round(min(100.0, max(0.0, personas_detectadas / capacidad_personas * 100.0)), 4)


def distribucion_sectores(tipo_espacio: str) -> dict[str, float]:
    """100% de la mezcla de sector en la columna correspondiente al
    `tipo_espacio` detectado; el resto en 0 (ver mapeo_tipo_espacio en
    configs/energy_context.yaml)."""
    distribucion = dict.fromkeys(SECTOR_COLUMNS, 0.0)
    columna = mapeo_tipo_espacio().get(tipo_espacio)
    if columna in distribucion:
        distribucion[columna] = 100.0
    return distribucion


def construir_features_crudas(escenario: EscenarioVision, contexto: ContextoInstalacion) -> dict:
    """Fila cruda (pre-imputacion/encoding) lista para `model_loader.predecir_kwh`."""
    fecha = escenario.fecha_hora
    dia_semana = fecha.weekday()  # 0=Lunes ... 6=Domingo (igual que el codebook UPTC)

    fila: dict[str, object] = {
        "sede": contexto.sede,
        "agua_litros": contexto.agua_litros,
        "temperatura_exterior_c": contexto.temperatura_exterior_c,
        "ocupacion_pct": calcular_ocupacion_pct(escenario.personas_detectadas, contexto.capacidad_personas),
        "hora": fecha.hour,
        "dia_semana": dia_semana,
        "mes": fecha.month,
        "trimestre": (fecha.month - 1) // 3 + 1,
        "año": fecha.year,
        "periodo_academico": contexto.periodo_academico,
        "es_fin_semana": dia_semana >= 5,
        "es_festivo": calendario.es_festivo(fecha.date()),
        "es_semana_parciales": contexto.es_semana_parciales,
        "es_semana_finales": contexto.es_semana_finales,
        "nombre_completo": contexto.nombre_completo,
        "ciudad": contexto.ciudad,
        "area_m2": contexto.area_m2,
        "num_estudiantes": contexto.num_estudiantes,
        "num_empleados": contexto.num_empleados,
        "num_edificios": contexto.num_edificios,
        "tiene_residencias": contexto.tiene_residencias,
        "tiene_laboratorios_pesados": contexto.tiene_laboratorios_pesados,
        "altitud_msnm": contexto.altitud_msnm,
        "temp_promedio_c": contexto.temp_promedio_c,
    }
    fila.update(distribucion_sectores(escenario.tipo_espacio))
    return fila
