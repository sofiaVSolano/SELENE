"""
throttled_detector.py
-----------------------
Envoltorio generico que re-ejecuta un detector solo cada N frames,
opcionalmente en un hilo aparte via un `Executor` compartido, devolviendo la
ultima deteccion disponible en los frames intermedios.

Los dos detectores de esta app son pesados en relacion a un detector liviano
de una sola pasada: `LightingDetector` es `fasterrcnn_resnet50_fpn_v2`
(torchvision, dos etapas) y `PersonDetector` es RT-DETR (Ultralytics,
transformer sin NMS, ~33M parametros / 108 GFLOPs a 640px). Correr
cualquiera de los dos en cada frame haria caer la tasa de refresco del video
muy por debajo de tiempo real, por lo que ambos se manejan con la misma
logica de throttling/async.
"""

from __future__ import annotations

import logging
from concurrent.futures import Executor, Future
from typing import Callable, Optional

import numpy as np

logger = logging.getLogger("app.throttled_detector")


class ThrottledDetector:
    """Ejecuta `detect_fn` cada `interval_frames` frames.

    Si se provee `executor`, la deteccion corre en un hilo aparte (un unico
    future en vuelo por instancia) para no bloquear el loop de captura/
    display mientras el frame se procesa; en los frames intermedios (y
    mientras el future en vuelo no termina) se devuelve la ultima deteccion
    disponible. Sin `executor`, la ejecucion es sincrona (bloquea el frame
    actual cuando toca re-detectar).
    """

    def __init__(
        self,
        detect_fn: Callable[[np.ndarray], list[dict]],
        interval_frames: int = 1,
        executor: Optional[Executor] = None,
    ):
        self.detect_fn = detect_fn
        self.interval_frames = max(1, interval_frames)
        self.executor = executor
        self._pending: Optional[Future] = None
        self._last: list[dict] = []

    def step(self, frame: np.ndarray, frame_idx: int) -> list[dict]:
        """Avanza un frame; devuelve la deteccion vigente (nueva o la anterior)."""
        if frame_idx % self.interval_frames != 0:
            return self._last

        if self.executor is None:
            self._last = self.detect_fn(frame)
            return self._last

        if self._pending is not None and self._pending.done():
            try:
                self._last = self._pending.result()
            except Exception:
                logger.exception("El detector fallo al ejecutarse en un hilo en segundo plano.")
            self._pending = None

        if self._pending is None:
            self._pending = self.executor.submit(self.detect_fn, frame.copy())

        return self._last
