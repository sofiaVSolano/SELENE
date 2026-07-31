"""
lightingAnalyzer
=================
Modulo de analisis clasico (OpenCV/NumPy) de la iluminacion de una escena a
partir de las detecciones (Window, Luminaire) del detector FasterRCNN_ADE20K
ya entrenado. No entrena ni ejecuta ninguna red neuronal adicional.

Uso tipico:

    from lightingAnalyzer import LightingAnalyzer

    analyzer = LightingAnalyzer()
    result = analyzer.analyze(image_bgr, detections, image_name="foto_01")

Ver README.md para la metodologia completa y el detalle de cada formula.
"""

from .analyzer import LightingAnalyzer

__all__ = ["LightingAnalyzer"]
