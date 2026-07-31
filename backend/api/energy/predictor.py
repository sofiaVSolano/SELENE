"""Prediccion energetica: envuelve `model_loader` + `feature_mapping` para
producir un `PrediccionConsumo` a partir de un escenario de vision.

El modelo (LightGBM, ya entrenado, ver `model_loader.py`) NO tiene ninguna
feature de iluminacion/luminarias: solo ve ocupacion, tiempo y mezcla de
sector. Por eso esta funcion produce el consumo BASE del escenario; la parte
de iluminacion "accionable" por el sistema de vision se aisla despues en
`simulations.py` a partir del `porcentaje_artificial` observado (ver docstring
de ese modulo).
"""

from __future__ import annotations

import time

from . import model_loader
from .feature_mapping import construir_features_crudas
from .schemas import ContextoInstalacion, EscenarioVision, PrediccionConsumo


def predecir_consumo(escenario: EscenarioVision, contexto: ContextoInstalacion) -> PrediccionConsumo:
    fila = construir_features_crudas(escenario, contexto)

    inicio = time.perf_counter()
    consumo_kwh = model_loader.predecir_kwh(fila)
    tiempo_ms = (time.perf_counter() - inicio) * 1000.0

    info = model_loader.modelo_info()
    return PrediccionConsumo(
        modelo_utilizado=info.get("modelo_recomendado", "LightGBM"),
        variables_entrada=fila,
        consumo_kwh=round(max(consumo_kwh, 0.0), 4),
        tiempo_inferencia_ms=round(tiempo_ms, 4),
        confianza=None,  # LightGBM (regresion puntual) no expone una confianza por prediccion.
    )
