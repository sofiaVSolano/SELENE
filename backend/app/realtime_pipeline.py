"""
realtime_pipeline.py
---------------------
Orquestador del loop de video en tiempo real: corre el detector de personas
(FasterRCNN+COCO) y el detector de iluminacion (FasterRCNN+ADE20K), ambos
igual de pesados (`fasterrcnn_resnet50_fpn_v2`), cada uno cada N frames en un
hilo aparte (ver `throttled_detector.ThrottledDetector`), alimentando
`LightingAnalyzer` en modo ligero (`generate_report=False`) para el HUD en
vivo. Permite guardar un snapshot con reporte completo bajo demanda (tecla 's').
"""

from __future__ import annotations

import datetime as dt
import logging
import time
from concurrent.futures import ThreadPoolExecutor
from typing import Optional

import cv2

from detectors import LightingDetector, PersonDetector
from lightingAnalyzer import LightingAnalyzer

from . import overlay
from .throttled_detector import ThrottledDetector

logger = logging.getLogger("app.realtime_pipeline")


class RealtimePipeline:
    def __init__(
        self,
        lighting_detector: LightingDetector,
        person_detector: PersonDetector,
        lighting_analyzer: LightingAnalyzer,
        source: str | int = 0,
        window_name: str = "Deteccion en tiempo real - Iluminacion y Personas",
        lighting_interval_frames: int = 15,
        person_interval_frames: int = 5,
        async_execution: bool = True,
    ):
        self.lighting_detector = lighting_detector
        self.person_detector = person_detector
        self.lighting_analyzer = lighting_analyzer
        self.source = source
        self.window_name = window_name

        # Un unico executor compartido (2 workers: como ambos detectores
        # comparten la misma GPU, el trabajo se serializa igual que si cada
        # uno tuviera su propio hilo, pero evita bloquear el loop principal
        # de captura/display mientras cualquiera de los dos infiere).
        self._executor: Optional[ThreadPoolExecutor] = (
            ThreadPoolExecutor(max_workers=2) if async_execution else None
        )
        self._lighting_runner = ThrottledDetector(
            self.lighting_detector.detect, lighting_interval_frames, self._executor
        )
        self._person_runner = ThrottledDetector(
            self.person_detector.detect, person_interval_frames, self._executor
        )

    def run(self) -> None:
        cap = cv2.VideoCapture(self.source)
        if not cap.isOpened():
            raise RuntimeError(
                f"No se pudo abrir la fuente de video: {self.source!r}. "
                "Prueba otro indice de camara (--source 1, 2, ...) o una ruta de archivo valida."
            )

        logger.info("Calentando detectores...")
        self.person_detector.warmup()
        self.lighting_detector.warmup()

        last_lighting_detections: list[dict] = []

        frame_idx = 0
        prev_time = time.perf_counter()
        fps = 0.0

        try:
            while True:
                ok, frame = cap.read()
                if not ok:
                    logger.info("Fin del stream de video (o error de lectura).")
                    break

                person_detections = self._person_runner.step(frame, frame_idx)
                last_lighting_detections = self._lighting_runner.step(frame, frame_idx)

                lighting_summary = self.lighting_analyzer.analyze(
                    frame, last_lighting_detections, generate_report=False,
                )

                now = time.perf_counter()
                elapsed = now - prev_time
                prev_time = now
                if elapsed > 0:
                    fps = 1.0 / elapsed

                overlay.draw(frame, person_detections, last_lighting_detections, lighting_summary, fps)
                cv2.imshow(self.window_name, frame)

                key = cv2.waitKey(1) & 0xFF
                if key == ord('q'):
                    logger.info("Salida solicitada por el usuario.")
                    break
                if key == ord('s'):
                    self._save_snapshot(frame, last_lighting_detections)

                frame_idx += 1
        finally:
            cap.release()
            cv2.destroyAllWindows()
            if self._executor is not None:
                self._executor.shutdown(wait=False)

    def _save_snapshot(self, frame, lighting_detections: list[dict]) -> None:
        timestamp = dt.datetime.now().strftime("%Y%m%d_%H%M%S")
        image_name = f"snapshot_{timestamp}"
        result = self.lighting_analyzer.analyze(
            frame, lighting_detections, image_name=image_name, generate_report=True,
        )
        output_dir = result["artifacts"]["output_dir"] if result.get("artifacts") else "?"
        logger.info("Snapshot completo guardado en %s", output_dir)
        print(f"[snapshot] Reporte completo guardado en: {output_dir}")
