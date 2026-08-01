"""
windows.py
----------
Etapa 2: analisis por deteccion de la clase "Window".

Para cada deteccion de ventana calcula area, area relativa, brillo
(promedio/maximo/minimo), contraste (Michelson), desviacion estandar,
histograma (canal V) y centroide del bounding box.

Responsabilidad unica: analisis numerico de ROIs de ventana. No dibuja ni
guarda imagenes (eso es responsabilidad de visualization.py) ni decide
scores/clasificacion (eso es responsabilidad de indicators.py/classifier.py).
"""

from __future__ import annotations

import logging

import numpy as np

from . import utils

logger = logging.getLogger("lightingAnalyzer.windows")


class WindowAnalyzer:
    """Calcula las metricas de brillo/contraste de cada ROI detectado como "Window"."""

    def __init__(self, analysis_config: dict):
        hist_cfg = analysis_config.get("histogram", {})
        self.hist_bins = int(hist_cfg.get("bins", 256))
        self.hist_range = tuple(hist_cfg.get("range", [0, 256]))

    def analyze(self, image_bgr: np.ndarray, detections: list[utils.Detection]) -> list[dict]:
        """Analiza todas las detecciones de clase "Window".

        Parameters
        ----------
        image_bgr: imagen completa (para poder recortar cada ROI).
        detections: lista de `utils.Detection` ya parseadas (todas las clases);
            este metodo filtra internamente las de clase "Window".

        Returns
        -------
        Lista de dicts, uno por ventana, con todas las metricas calculadas,
        en el mismo orden en que aparecen las detecciones de entrada.
        """
        utils.validate_image(image_bgr)
        image_shape = (image_bgr.shape[0], image_bgr.shape[1])

        results = []
        for idx, det in enumerate(d for d in detections if d.class_name == "Window"):
            roi = utils.crop_roi(image_bgr, det.bbox)
            v_roi = utils.bgr_to_v_channel(roi) if roi.size else np.empty((0, 0), dtype=np.uint8)

            stats = utils.basic_stats(v_roi)
            contrast = utils.michelson_contrast(v_roi)
            hist = utils.histogram_256(v_roi, bins=self.hist_bins, value_range=self.hist_range)
            cx, cy = det.centroid

            results.append({
                "window_id": idx,
                "confidence": det.confidence,
                "bbox": det.bbox,
                "area_px": det.area_px,
                "relative_area": det.relative_area(image_shape),
                "brightness_mean": stats["mean"],
                "brightness_max": stats["max"],
                "brightness_min": stats["min"],
                "brightness_std": stats["std"],
                "contrast": contrast,
                "histogram": hist,
                "centroid_x": cx,
                "centroid_y": cy,
            })

        logger.info("Ventanas analizadas: %d", len(results))
        return results
