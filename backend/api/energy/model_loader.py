"""Puente hacia el modelo LightGBM ya entrenado en el proyecto externo
`ProyectoPrediccionEnergetica` (ver ENERGY_MODEL_DIR en backend/.env).

Este modulo NO reentrena ni reimplementa el preprocesamiento: importa
`predict.cargar_mejor_modelo`/`predict.predecir` tal cual del proyecto de
origen (para que la desserializacion de `preprocessing_artifacts.joblib`
encuentre las mismas clases `src.preprocessing.*` con las que fue guardado) y
los cachea como singleton, igual que `api.detection_service` hace con los
detectores de vision.
"""

from __future__ import annotations

import functools
import sys
import threading

import pandas as pd

from ..config import settings

_load_lock = threading.Lock()


class EnergyModelError(Exception):
    pass


@functools.lru_cache(maxsize=1)
def _predict_module():
    """Inserta la raiz de ProyectoPrediccionEnergetica al frente de
    sys.path (una sola vez) e importa su `predict.py`. Aislado en su propia
    funcion para no ensuciar sys.path del resto de la app si este modulo no
    llega a usarse."""
    with _load_lock:
        model_dir = settings.energy_model_path
        if not model_dir.exists():
            raise EnergyModelError(
                f"ENERGY_MODEL_DIR ('{model_dir}') no existe. Configure la ruta a "
                "ProyectoPrediccionEnergetica en backend/.env."
            )
        model_dir_str = str(model_dir)
        if model_dir_str not in sys.path:
            sys.path.insert(0, model_dir_str)

        import predict as energy_predict  # noqa: E402  (proyecto externo, no reentrena nada)

        return energy_predict


@functools.lru_cache(maxsize=1)
def _cargar_modelo() -> tuple[object, object, dict]:
    """Carga (una sola vez) el mejor modelo entrenado + artefactos de
    preprocesamiento + metadata (`modelosEntrenados/mejor_modelo_info.json`)."""
    predict_module = _predict_module()
    modelo, artifacts, info = predict_module.cargar_mejor_modelo()
    return modelo, artifacts, info


def modelo_info() -> dict:
    _, _, info = _cargar_modelo()
    return info


def feature_columns_raw() -> list[str]:
    """Columnas crudas (antes de imputacion/encoding) que espera el
    preprocesamiento del modelo, ver `PreprocessingArtifacts.feature_columns_raw`."""
    _, artifacts, _ = _cargar_modelo()
    return list(artifacts.feature_columns_raw)


def predecir_kwh(fila_features: dict) -> float:
    """Ejecuta el pipeline de preprocesamiento + inferencia del modelo
    entrenado sobre una unica fila de features crudas."""
    predict_module = _predict_module()
    modelo, artifacts, _ = _cargar_modelo()

    raw_df = pd.DataFrame([fila_features])
    prediccion = predict_module.predecir(raw_df, modelo, artifacts)
    return float(prediccion.iloc[0])


def warmup() -> None:
    """Precarga el modelo (llamar en el startup de FastAPI, igual que
    `detection_service.warmup_models`), para no pagar el costo de I/O +
    deserializacion en la primera peticion real."""
    _cargar_modelo()
