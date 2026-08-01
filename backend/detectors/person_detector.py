"""
person_detector.py
-------------------
Wrapper de inferencia para el detector de personas: `RT-DETR` (implementacion
oficial de Ultralytics), entrenado sobre COCO 2017 (clase unica "person") en
el proyecto independiente `ModelosDeteccionComp/Proyecto_RTDETR_COCO`.

El checkpoint usado (`weights/person/RTDETR_COCO.pt`) es el checkpoint nativo
de Ultralytics (dict con "model", "train_args", etc., ver
`Proyecto_RTDETR_COCO/src/model.py`) para el modelo `rtdetr-l` afinado con
una unica clase (`{0: "person"}`).

A diferencia de `lighting_detector.py` (torchvision `fasterrcnn_resnet50_fpn_v2`,
dos etapas), RT-DETR es un detector transformer de una sola pasada sin NMS
(seleccion de queries IoU-aware integrada en el decoder). Es notablemente mas
liviano que Faster R-CNN, pero se mantiene el mismo throttling (ver
`app/throttled_detector.py`) porque sigue siendo mas pesado que un YOLO
convencional (~33M parametros, 108 GFLOPs a 640px).
"""

from __future__ import annotations

import logging
import os
import shutil
from pathlib import Path

import numpy as np
from ultralytics import RTDETR

from app.device_utils import resolve_device

logger = logging.getLogger("detectors.person_detector")


def _load_rtdetr(weights_path: Path) -> RTDETR:
    """Carga un checkpoint RT-DETR, sea cual sea su extension.

    Ultralytics (`attempt_load_one_weight`) exige estrictamente la extension
    `.pt` en varias operaciones internas (predict/val/reanudar entrenamiento)
    y lanza `AssertionError` con cualquier otra (p. ej. `.pth`). Si el
    checkpoint entregado no termina en `.pt`, se crea (una unica vez, de
    forma idempotente) un hard link gemelo con esa extension en la misma
    carpeta -mismo contenido fisico, sin duplicar espacio en disco- y se
    carga el modelo a traves de el.
    """
    if weights_path.suffix.lower() == ".pt":
        return RTDETR(str(weights_path))

    pt_alias = weights_path.with_suffix(".pt")
    if not pt_alias.exists():
        try:
            os.link(weights_path, pt_alias)
            logger.info("Hard link .pt creado para compatibilidad con Ultralytics: %s", pt_alias)
        except OSError:
            shutil.copy2(weights_path, pt_alias)
            logger.info("Copia .pt creada para compatibilidad con Ultralytics: %s", pt_alias)

    return RTDETR(str(pt_alias))


class PersonDetector:
    """Detector de personas. `.detect(frame_bgr) -> list[dict]`."""

    def __init__(
        self,
        weights_path: str | Path,
        device: str = "auto",
        conf_threshold: float = 0.5,
    ):
        weights_path = Path(weights_path)
        if not weights_path.exists():
            raise FileNotFoundError(
                f"No se encontro el checkpoint del detector de personas: {weights_path}. "
                "Copialo desde Proyecto_RTDETR_COCO/modelosEntrenados/RTDETR_COCO.pt."
            )

        self.conf_threshold = conf_threshold
        self.device = resolve_device(device)
        self._device_arg = "cpu" if self.device.type == "cpu" else "0"

        self.model = _load_rtdetr(weights_path)

        logger.info(
            "PersonDetector listo (clase=person, arquitectura=RT-DETR, device=%s)",
            self.device,
        )

    def warmup(self) -> None:
        """Un forward dummy para no penalizar el primer frame real con la
        inicializacion perezosa de CUDA/cuDNN."""
        dummy = np.zeros((480, 640, 3), dtype=np.uint8)
        self.detect(dummy)

    def detect(self, frame_bgr: np.ndarray) -> list[dict]:
        """Ejecuta inferencia sobre un frame BGR (formato OpenCV).

        Returns
        -------
        Lista de `{"class": "person", "confidence": float, "bbox": [x1,y1,x2,y2]}`.
        """
        result = self.model.predict(
            source=frame_bgr,
            conf=self.conf_threshold,
            device=self._device_arg,
            verbose=False,
        )[0]

        boxes = result.boxes.xyxy.cpu().numpy()
        scores = result.boxes.conf.cpu().numpy()
        # clases no se filtra: el modelo tiene una unica clase ("person"),
        # por lo que toda deteccion que sobrevive al filtro de conf lo es.

        detections: list[dict] = []
        for box, score in zip(boxes, scores):
            detections.append({
                "class": "person",
                "confidence": float(score),
                "bbox": [float(box[0]), float(box[1]), float(box[2]), float(box[3])],
            })
        return detections
