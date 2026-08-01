"""
lighting_detector.py
---------------------
Wrapper de inferencia para el detector de iluminacion (Window / Luminaire):
`fasterrcnn_resnet50_fpn_v2` (torchvision), entrenado en el proyecto de
investigacion `ModeloDeteccionLamp` (ver
`entrenamientos/FasterRCNN_ADE20K.ipynb`, celdas de construccion del modelo
y de inferencia cualitativa).

El checkpoint de entrega (`weights/lighting/FasterRCNN_ADE20KOnly_best.pth`)
es un dict guardado con `torch.save` que contiene:
    - "state_dict": pesos del modelo ya afinado (fine-tuned).
    - "class_names": lista de nombres de clase real, sin fondo (["Window", "Luminaire"]).
    - "img_size": resolucion usada en entrenamiento (min_size=max_size del resize interno).
    - "base_weights", "model_name": metadatos informativos.

No se cargan pesos COCO preentrenados (`weights=None`) porque el fine-tuning
completo ya vive en el `state_dict`: esto evita requerir descarga de internet
para correr inferencia.
"""

from __future__ import annotations

import logging
from pathlib import Path

import cv2
import numpy as np
import torch
import torchvision.transforms.functional as TF
from torchvision.models.detection import fasterrcnn_resnet50_fpn_v2
from torchvision.models.detection.faster_rcnn import FastRCNNPredictor

from app.device_utils import resolve_device

logger = logging.getLogger("detectors.lighting_detector")


class LightingDetector:
    """Detector de ventanas/luminarias. `.detect(frame_bgr) -> list[dict]`."""

    def __init__(
        self,
        weights_path: str | Path,
        device: str = "auto",
        score_threshold: float = 0.5,
    ):
        weights_path = Path(weights_path)
        if not weights_path.exists():
            raise FileNotFoundError(
                f"No se encontro el checkpoint del detector de iluminacion: {weights_path}. "
                "Copialo desde ModeloDeteccionLamp/modelosEntrenados/FasterRCNN_ADE20KOnly_best.pth."
            )

        self.score_threshold = score_threshold
        self.device = resolve_device(device)

        checkpoint = torch.load(weights_path, map_location="cpu", weights_only=True)
        self.class_names: list[str] = checkpoint["class_names"]
        img_size = checkpoint.get("img_size", 640)

        model = fasterrcnn_resnet50_fpn_v2(weights=None, min_size=img_size, max_size=img_size)
        in_features = model.roi_heads.box_predictor.cls_score.in_features
        model.roi_heads.box_predictor = FastRCNNPredictor(in_features, len(self.class_names) + 1)
        model.load_state_dict(checkpoint["state_dict"])
        model.to(self.device)
        model.eval()

        self.model = model
        logger.info(
            "LightingDetector listo (clases=%s, img_size=%d, device=%s)",
            self.class_names, img_size, self.device,
        )

    def warmup(self) -> None:
        """Un forward dummy para no penalizar el primer frame real con la
        inicializacion perezosa de CUDA/cuDNN."""
        dummy = np.zeros((480, 640, 3), dtype=np.uint8)
        self.detect(dummy)

    @torch.no_grad()
    def detect(self, frame_bgr: np.ndarray) -> list[dict]:
        """Ejecuta inferencia sobre un frame BGR (formato OpenCV).

        Returns
        -------
        Lista de `{"class": "Window"|"Luminaire", "confidence": float, "bbox": [x1,y1,x2,y2]}`.
        """
        frame_rgb = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2RGB)
        tensor = TF.to_tensor(frame_rgb).to(self.device)

        output = self.model([tensor])[0]

        keep = output["scores"] >= self.score_threshold
        boxes = output["boxes"][keep].cpu().numpy()
        labels = output["labels"][keep].cpu().numpy()
        scores = output["scores"][keep].cpu().numpy()

        detections: list[dict] = []
        for box, label, score in zip(boxes, labels, scores):
            class_name = self.class_names[int(label) - 1]  # offset +1: label 0 = fondo
            detections.append({
                "class": class_name,
                "confidence": float(score),
                "bbox": [float(box[0]), float(box[1]), float(box[2]), float(box[3])],
            })
        return detections
