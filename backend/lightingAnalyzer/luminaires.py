"""
luminaires.py
-------------
Etapa 3: analisis por deteccion de la clase "Luminaire", incluyendo deteccion
de hotspots (zonas extremadamente brillantes, tipicas de fuentes de luz
artificial directa o reflejos especulares).

Responsabilidad unica: analisis numerico de ROIs de luminaria. No dibuja ni
guarda imagenes (visualization.py) ni decide scores/clasificacion
(indicators.py/classifier.py).
"""

from __future__ import annotations

import logging

import cv2
import numpy as np

from . import utils

logger = logging.getLogger("lightingAnalyzer.luminaires")


def detect_hotspots(v_channel: np.ndarray, threshold: int, min_area_px: int, connectivity: int) -> dict:
    """Detecta hotspots: componentes conexas de pixeles con brillo > `threshold`.

    Un hotspot es una zona extremadamente brillante (p. ej. pixel > 240/255),
    tipica del bulbo o difusor de una luminaria encendida. Se filtran
    componentes menores a `min_area_px` para descartar ruido de compresion o
    de sensor (1-3 px aislados que no representan una fuente de luz real).

    Returns
    -------
    dict con:
        count            -> numero de hotspots (componentes conexas validas)
        area_px           -> area total ocupada por hotspots validos (pixeles)
        mask              -> mascara booleana (mismo shape que v_channel) con
                              los hotspots validos (para visualization.py)
        bright_pixel_pct  -> % de pixeles del ROI por encima del umbral,
                              SIN filtrar por area minima de componente (ver
                              docstring de la diferencia con `count`/`area_px`
                              en README.md)
    """
    if v_channel.size == 0:
        return {"count": 0, "area_px": 0, "mask": np.zeros_like(v_channel, dtype=bool), "bright_pixel_pct": 0.0}

    raw_mask = (v_channel > threshold).astype(np.uint8)
    total_bright_pixels = int(np.count_nonzero(raw_mask))
    bright_pixel_pct = utils.safe_divide(total_bright_pixels, v_channel.size, default=0.0) * 100.0

    num_labels, labels, stats, _ = cv2.connectedComponentsWithStats(raw_mask, connectivity=connectivity)

    valid_mask = np.zeros_like(raw_mask, dtype=bool)
    count = 0
    area_px = 0
    # label 0 es el fondo (pixeles no-hotspot), se ignora.
    for label in range(1, num_labels):
        component_area = int(stats[label, cv2.CC_STAT_AREA])
        if component_area >= min_area_px:
            valid_mask |= (labels == label)
            count += 1
            area_px += component_area

    return {
        "count": count,
        "area_px": area_px,
        "mask": valid_mask,
        "bright_pixel_pct": bright_pixel_pct,
    }


class LuminaireAnalyzer:
    """Calcula las metricas de brillo/contraste/hotspots de cada ROI "Luminaire"."""

    def __init__(self, analysis_config: dict):
        hist_cfg = analysis_config.get("histogram", {})
        self.hist_bins = int(hist_cfg.get("bins", 256))
        self.hist_range = tuple(hist_cfg.get("range", [0, 256]))

        hotspot_cfg = analysis_config.get("hotspot", {})
        if not hotspot_cfg:
            raise utils.LightingAnalyzerError("configs/lighting_analysis.yaml no define 'hotspot'.")
        self.hotspot_threshold = int(hotspot_cfg.get("brightness_threshold", 240))
        self.hotspot_min_area_px = int(hotspot_cfg.get("min_area_px", 4))
        self.hotspot_connectivity = int(hotspot_cfg.get("connectivity", 8))

        on_cfg = analysis_config.get("luminaire_on", {})
        self.on_bright_pixel_pct_min = float(on_cfg.get("bright_pixel_pct_min", 1.0))
        self.on_brightness_mean_min = float(on_cfg.get("brightness_mean_min", 180.0))
        self.on_max_window_overlap = float(on_cfg.get("max_window_overlap", 0.70))

    @staticmethod
    def _fraccion_dentro_de_ventanas(bbox, ventanas: list[utils.Detection]) -> float:
        """Que fraccion del area de esta luminaria cae dentro de alguna ventana.

        Se toma el maximo por ventana (no la suma): interesa "esta metida en
        una ventana", no repartir el area entre varias que se solapan entre si.
        """
        x1, y1, x2, y2 = bbox
        area = max(0, x2 - x1) * max(0, y2 - y1)
        if area <= 0 or not ventanas:
            return 0.0

        mayor = 0.0
        for v in ventanas:
            vx1, vy1, vx2, vy2 = v.bbox
            solape = (
                max(0, min(x2, vx2) - max(x1, vx1))
                * max(0, min(y2, vy2) - max(y1, vy1))
            )
            mayor = max(mayor, solape / area)
        return mayor

    def analyze(self, image_bgr: np.ndarray, detections: list[utils.Detection]) -> list[dict]:
        """Analiza todas las detecciones de clase "Luminaire".

        Ver `windows.WindowAnalyzer.analyze` para la simetria de contrato
        (misma imagen completa + lista de detecciones ya parseadas).
        """
        utils.validate_image(image_bgr)
        image_shape = (image_bgr.shape[0], image_bgr.shape[1])

        ventanas = [d for d in detections if d.class_name == "Window"]
        results = []
        for idx, det in enumerate(d for d in detections if d.class_name == "Luminaire"):
            roi = utils.crop_roi(image_bgr, det.bbox)
            v_roi = utils.bgr_to_v_channel(roi) if roi.size else np.empty((0, 0), dtype=np.uint8)

            stats = utils.basic_stats(v_roi)
            contrast = utils.michelson_contrast(v_roi)
            hist = utils.histogram_256(v_roi, bins=self.hist_bins, value_range=self.hist_range)
            hotspots = detect_hotspots(
                v_roi,
                threshold=self.hotspot_threshold,
                min_area_px=self.hotspot_min_area_px,
                connectivity=self.hotspot_connectivity,
            )
            hotspot_area_pct = utils.safe_divide(hotspots["area_px"], v_roi.size, default=0.0) * 100.0
            cx, cy = det.centroid

            # Esta lampara, en concreto, esta emitiendo? Se mira solo su ROI:
            # el balance natural/artificial de la escena (indicators.py) es una
            # proporcion, y una lampara encendida junto a una ventana soleada
            # aporta poco al total sin por ello estar apagada.
            #
            # Salvo que la "lampara" este metida dentro de una ventana: con el
            # sol fuerte el detector recorta trozos de ventana como luminarias,
            # y darlas por encendidas hacia saltar la alerta en una sala vacia
            # sin ninguna luz prendida (ver `luminaire_on` en el YAML).
            en_ventana = self._fraccion_dentro_de_ventanas(det.bbox, ventanas)
            is_lit = en_ventana < self.on_max_window_overlap and (
                hotspots["bright_pixel_pct"] >= self.on_bright_pixel_pct_min
                or stats["mean"] >= self.on_brightness_mean_min
            )

            results.append({
                "luminaire_id": idx,
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
                "hotspot_count": hotspots["count"],
                "hotspot_area_px": hotspots["area_px"],
                "hotspot_area_pct_of_roi": hotspot_area_pct,
                "bright_pixel_pct": hotspots["bright_pixel_pct"],
                "hotspot_mask": hotspots["mask"],
                "is_lit": is_lit,
                # Se guarda para poder auditar por que una luminaria brillante
                # no cuenta como encendida.
                "window_overlap": round(en_ventana, 4),
                "centroid_x": cx,
                "centroid_y": cy,
            })

        logger.info(
            "Luminarias analizadas: %d (encendidas: %d)",
            len(results), sum(1 for r in results if r["is_lit"]),
        )
        return results
