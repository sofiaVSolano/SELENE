"""
person_detector.py
-------------------
Wrapper de inferencia para el detector de personas: `Faster R-CNN`
(`fasterrcnn_resnet50_fpn_v2`, implementacion oficial de torchvision),
entrenado sobre COCO 2017 (clase unica "person") en el proyecto independiente
`ModelosDeteccionComp/Proyecto_FasterRCNN_COCO`.

El checkpoint usado (`weights/person/FasterRCNN_COCO.pth`) es el export de
inferencia de la TERCERA corrida de ese proyecto ("FasterRCNN_COCO copy 3",
config `fasterrcnn_coco_3.yaml`, pesos EMA): un dict con "model_state_dict",
"num_classes", "imgsz", "trainable_backbone_layers" y "architecture" (ver
`Proyecto_FasterRCNN_COCO/src/model.py::save_model_checkpoint`). No es un
checkpoint de entrenamiento: no trae optimizador ni estado de EMA.

Comparte arquitectura con `lighting_detector.py` -ambos son
`fasterrcnn_resnet50_fpn_v2` de torchvision, dos etapas con NMS- pero NO
comparte el formato de checkpoint: aquel guarda "state_dict" + "class_names",
este "model_state_dict" + "num_classes". Por eso cada uno reconstruye su
modelo por separado en vez de compartir un helper.

Faster R-CNN es notablemente mas pesado que el RT-DETR que reemplazo
(452 GFLOPs vs 103, ~6 FPS vs ~14 medidos sobre val2017 completo), por lo que
`configs/models.yaml` sube su `interval_frames` en consecuencia; ver
`app/throttled_detector.py`.
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

logger = logging.getLogger("detectors.person_detector")

# Indice de la clase "person" en el checkpoint. El modelo se entreno con
# NUM_CLASSES=2: 0 = fondo, 1 = person (ver Proyecto_FasterRCNN_COCO/src/model.py).
PERSON_LABEL = 1


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
                "Copialo desde Proyecto_FasterRCNN_COCO/modelosEntrenados/FasterRCNN_COCO_3.pth."
            )

        self.conf_threshold = conf_threshold
        self.device = resolve_device(device)

        checkpoint = torch.load(weights_path, map_location="cpu", weights_only=True)
        num_classes = checkpoint.get("num_classes", 2)
        img_size = checkpoint.get("imgsz", 640)

        # `weights=None`: los pesos oficiales de COCO no se descargan, se
        # sobreescriben enteros con los del checkpoint dos lineas mas abajo.
        model = fasterrcnn_resnet50_fpn_v2(weights=None, min_size=img_size, max_size=img_size)
        in_features = model.roi_heads.box_predictor.cls_score.in_features
        model.roi_heads.box_predictor = FastRCNNPredictor(in_features, num_classes)
        model.load_state_dict(checkpoint["model_state_dict"])
        model.to(self.device)
        model.eval()

        self.model = model
        logger.info(
            "PersonDetector listo (clase=person, arquitectura=fasterrcnn_resnet50_fpn_v2, "
            "img_size=%d, device=%s)",
            img_size, self.device,
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
        Lista de `{"class": "person", "confidence": float, "bbox": [x1,y1,x2,y2]}`.
        """
        frame_rgb = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2RGB)
        tensor = TF.to_tensor(frame_rgb).to(self.device)

        output = self.model([tensor])[0]

        # A diferencia del RT-DETR de una sola clase que reemplazo, aqui la
        # cabeza tiene 2 salidas (fondo + person), asi que ademas del umbral de
        # confianza hay que filtrar por etiqueta.
        keep = (output["scores"] >= self.conf_threshold) & (output["labels"] == PERSON_LABEL)
        boxes = output["boxes"][keep].cpu().numpy()
        scores = output["scores"][keep].cpu().numpy()

        detections: list[dict] = []
        for box, score in zip(boxes, scores):
            detections.append({
                "class": "person",
                "confidence": float(score),
                "bbox": [float(box[0]), float(box[1]), float(box[2]), float(box[3])],
            })
        return detections
