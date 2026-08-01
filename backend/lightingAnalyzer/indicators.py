"""
indicators.py
-------------
Calculo de los indicadores "Natural Score" y "Artificial Score": una
estimacion relativa (no una medicion fotometrica) de cuanto de la iluminacion
visible en la escena proviene de luz natural (ventanas) frente a luz
artificial (luminarias).

Metodologia
-----------
1. Por cada categoria (natural / artificial) se calculan varios
   "componentes" numericos a partir de las detecciones y sus ROIs, cada uno
   normalizado a [0, 1] mediante una funcion de saturacion:

       componente = min(valor_observado / saturacion, 1.0)

   La saturacion es el valor a partir del cual se considera que la evidencia
   ya es maxima (ver `configs/lighting_analysis.yaml: normalization`); evita
   que casos extremos (p. ej. 15 ventanas) dominen de forma no acotada.

2. Los componentes se combinan mediante una suma ponderada cuyos pesos viven
   en `configs/lighting_weights.yaml` (nunca hardcodeados). Cada bloque de
   pesos debe sumar 1.0 (se valida al cargar).

3. Los dos scores "crudos" (natural_raw, artificial_raw), cada uno ya en
   [0, 1], se renormalizan para que sus PORCENTAJES sumen exactamente 100%:

       natural_pct = natural_raw / (natural_raw + artificial_raw) * 100
       artificial_pct = 100 - natural_pct

   Caso borde: si ambos son 0 (ninguna ventana ni luminaria detectada, o
   ambas con evidencia nula), se usa el brillo promedio de la escena como
   fallback neutral: natural_pct = scene_brightness / 255 * 100. Este caso
   se marca explicitamente en el resultado (`fallback_used: True`) para
   trazabilidad.

Advertencia (ver README.md): estos indicadores son una ESTIMACION RELATIVA
basada en vision por computador sobre imagenes RGB, no una medicion fisica de
iluminancia (lux). No sustituyen un luxometro ni un estudio luminotecnico.
"""

from __future__ import annotations

import logging

from . import utils

logger = logging.getLogger("lightingAnalyzer.indicators")

_WEIGHT_SUM_TOLERANCE = 1e-6


class IndicatorCalculator:
    """Calcula Natural Score / Artificial Score a partir de los resultados de
    brightness.py, windows.py y luminaires.py."""

    def __init__(self, weights_config: dict, normalization_config: dict):
        self.natural_weights = self._validate_weights(weights_config, "natural")
        self.artificial_weights = self._validate_weights(weights_config, "artificial")
        self.norm = normalization_config

    @staticmethod
    def _validate_weights(weights_config: dict, group: str) -> dict:
        if group not in weights_config:
            raise utils.LightingAnalyzerError(
                f"configs/lighting_weights.yaml no define el bloque '{group}'."
            )
        weights = weights_config[group]
        total = sum(weights.values())
        if abs(total - 1.0) > _WEIGHT_SUM_TOLERANCE:
            raise utils.LightingAnalyzerError(
                f"Los pesos de '{group}' en lighting_weights.yaml deben sumar 1.0 "
                f"(suman {total:.4f}). Corrija el archivo de configuracion."
            )
        return weights

    # ------------------------------------------------------------------
    # Componentes individuales (cada uno normalizado a [0, 1])
    # ------------------------------------------------------------------

    def _natural_components(self, window_results: list[dict], image_shape: tuple[int, int]) -> dict[str, float]:
        count = len(window_results)
        count_saturation = float(self.norm.get("window_count_saturation", 4))
        area_saturation = float(self.norm.get("window_area_saturation", 0.35))

        windows_component = min(utils.safe_divide(count, count_saturation), 1.0)

        if count == 0:
            # Sin ventanas detectadas no hay ROI de luz natural que medir:
            # todos los componentes dependientes de ROI quedan en 0 (ver
            # docstring del modulo, seccion "Caso borde").
            return {
                "windows": windows_component,
                "area": 0.0,
                "brightness": 0.0,
                "contrast": 0.0,
                "distribution": 0.0,
            }

        total_relative_area = sum(w["relative_area"] for w in window_results)
        area_component = min(utils.safe_divide(total_relative_area, area_saturation), 1.0)

        mean_brightness = sum(w["brightness_mean"] for w in window_results) / count
        brightness_component = min(mean_brightness / 255.0, 1.0)

        mean_contrast = sum(w["contrast"] for w in window_results) / count
        contrast_component = min(mean_contrast, 1.0)

        image_width = image_shape[1]
        centroids_x = [w["centroid_x"] for w in window_results]
        distribution_component = self._spatial_distribution(centroids_x, image_width)

        return {
            "windows": windows_component,
            "area": area_component,
            "brightness": brightness_component,
            "contrast": contrast_component,
            "distribution": distribution_component,
        }

    def _artificial_components(self, luminaire_results: list[dict]) -> dict[str, float]:
        count = len(luminaire_results)
        count_saturation = float(self.norm.get("luminaire_count_saturation", 6))
        area_saturation = float(self.norm.get("luminaire_area_saturation", 0.20))
        hotspot_saturation = float(self.norm.get("hotspot_pct_saturation", 15.0))

        luminaires_component = min(utils.safe_divide(count, count_saturation), 1.0)

        if count == 0:
            return {
                "luminaires": luminaires_component,
                "area": 0.0,
                "brightness": 0.0,
                "contrast": 0.0,
                "hotspot": 0.0,
            }

        total_relative_area = sum(l["relative_area"] for l in luminaire_results)
        area_component = min(utils.safe_divide(total_relative_area, area_saturation), 1.0)

        mean_brightness = sum(l["brightness_mean"] for l in luminaire_results) / count
        brightness_component = min(mean_brightness / 255.0, 1.0)

        mean_contrast = sum(l["contrast"] for l in luminaire_results) / count
        contrast_component = min(mean_contrast, 1.0)

        mean_bright_pct = sum(l["bright_pixel_pct"] for l in luminaire_results) / count
        hotspot_component = min(utils.safe_divide(mean_bright_pct, hotspot_saturation), 1.0)

        return {
            "luminaires": luminaires_component,
            "area": area_component,
            "brightness": brightness_component,
            "contrast": contrast_component,
            "hotspot": hotspot_component,
        }

    @staticmethod
    def _spatial_distribution(centroids_x: list[float], image_width: int) -> float:
        """Fraccion de los 3 tercios horizontales de la imagen que contienen
        al menos un centroide de ventana (0, 1/3, 2/3 o 1.0).

        Una escena con ventanas repartidas en varias zonas del encuadre
        (no todas concentradas en una esquina) tiende a producir una luz
        natural mas uniforme sobre el espacio interior.
        """
        if not centroids_x or image_width <= 0:
            return 0.0
        third_width = image_width / 3.0
        thirds_covered = {min(int(cx / third_width), 2) for cx in centroids_x}
        return len(thirds_covered) / 3.0

    # ------------------------------------------------------------------
    # Orquestacion
    # ------------------------------------------------------------------

    def compute(
        self,
        scene_result: dict,
        window_results: list[dict],
        luminaire_results: list[dict],
        image_shape: tuple[int, int],
    ) -> dict:
        """Calcula natural_score/artificial_score (normalizados, suman 1.0) y
        sus porcentajes (suman exactamente 100.0)."""
        natural_components = self._natural_components(window_results, image_shape)
        artificial_components = self._artificial_components(luminaire_results)

        natural_raw = sum(
            self.natural_weights[key] * value for key, value in natural_components.items()
        )
        artificial_raw = sum(
            self.artificial_weights[key] * value for key, value in artificial_components.items()
        )

        total = natural_raw + artificial_raw
        fallback_used = False
        if total <= 0.0:
            # Ni ventanas ni luminarias aportan evidencia (0 detecciones o
            # ROIs completamente negros): se usa el brillo global de la
            # escena como referencia neutral en vez de dividir por 0.
            fallback_used = True
            natural_score = min(max(scene_result["mean"] / 255.0, 0.0), 1.0)
            artificial_score = 1.0 - natural_score
        else:
            natural_score = natural_raw / total
            artificial_score = artificial_raw / total

        natural_pct = round(natural_score * 100.0, 4)
        artificial_pct = round(100.0 - natural_pct, 4)

        logger.info(
            "Natural score=%.4f (%.2f%%) | Artificial score=%.4f (%.2f%%) | fallback=%s",
            natural_score, natural_pct, artificial_score, artificial_pct, fallback_used,
        )

        return {
            "natural_components": natural_components,
            "artificial_components": artificial_components,
            "natural_raw": natural_raw,
            "artificial_raw": artificial_raw,
            "natural_score": natural_score,
            "artificial_score": artificial_score,
            "natural_percentage": natural_pct,
            "artificial_percentage": artificial_pct,
            "fallback_used": fallback_used,
        }
