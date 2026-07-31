"""
brightness.py
-------------
Etapa 1: analisis global de brillo de la escena completa.

Calcula, sobre la imagen completa (sin depender de las detecciones del
modelo): brillo promedio/maximo/minimo/desviacion estandar, histogramas de
los canales V (HSV) y L (LAB), la distribucion de intensidad luminosa por
bandas y el mapa de brillo pixel a pixel (insumo del heatmap que dibuja
visualization.py).

Responsabilidad unica: calculo numerico de brillo global. Este modulo NO
genera ninguna figura; eso es responsabilidad exclusiva de visualization.py.
"""

from __future__ import annotations

import logging

import numpy as np

from . import utils

logger = logging.getLogger("lightingAnalyzer.brightness")


class SceneBrightnessAnalyzer:
    """Analiza el brillo global de una escena a partir de sus canales V (HSV) y L (LAB).

    Parameters
    ----------
    analysis_config:
        Dict cargado de `configs/lighting_analysis.yaml`. Se usan las claves
        `histogram` (bins/range) e `intensity_bands`.
    """

    def __init__(self, analysis_config: dict):
        hist_cfg = analysis_config.get("histogram", {})
        self.hist_bins = int(hist_cfg.get("bins", 256))
        self.hist_range = tuple(hist_cfg.get("range", [0, 256]))

        bands_cfg = analysis_config.get("intensity_bands", {})
        if not bands_cfg:
            raise utils.LightingAnalyzerError(
                "configs/lighting_analysis.yaml no define 'intensity_bands'."
            )
        self.intensity_bands: dict[str, tuple[int, int]] = {
            name: tuple(rng) for name, rng in bands_cfg.items()
        }

    def analyze(self, image_bgr: np.ndarray) -> dict:
        """Ejecuta el analisis global de brillo sobre la imagen completa.

        Returns
        -------
        dict con:
            v_channel, l_channel   -> arrays 2D (uint8), insumo para heatmaps
            mean/max/min/std       -> estadisticas de brillo (canal V)
            v_histogram, l_histogram -> histogramas (arrays 1D)
            intensity_distribution -> % de pixeles en cada banda (canal V)
            image_shape             -> (alto, ancho) de la imagen
        """
        utils.validate_image(image_bgr)

        v_channel = utils.bgr_to_v_channel(image_bgr)
        l_channel = utils.bgr_to_l_channel(image_bgr)

        # El brillo "oficial" de la escena se define sobre el canal V (HSV),
        # ver utils.bgr_to_v_channel para la justificacion. El canal L (LAB)
        # se reporta como referencia perceptual complementaria (histograma),
        # tal como pide la Etapa 1, pero no participa en scene_brightness.
        stats = utils.basic_stats(v_channel)

        v_hist = utils.histogram_256(v_channel, bins=self.hist_bins, value_range=self.hist_range)
        l_hist = utils.histogram_256(l_channel, bins=self.hist_bins, value_range=self.hist_range)

        distribution = utils.intensity_distribution(v_channel, self.intensity_bands)

        result = {
            "image_shape": (int(image_bgr.shape[0]), int(image_bgr.shape[1])),
            "mean": stats["mean"],
            "max": stats["max"],
            "min": stats["min"],
            "std": stats["std"],
            "v_channel": v_channel,
            "l_channel": l_channel,
            "v_histogram": v_hist,
            "l_histogram": l_hist,
            "intensity_distribution": distribution,
        }
        logger.info(
            "Brillo global de la escena: mean=%.2f max=%.2f min=%.2f std=%.2f",
            stats["mean"], stats["max"], stats["min"], stats["std"],
        )
        return result
