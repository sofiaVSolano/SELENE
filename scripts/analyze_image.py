"""
analyze_image.py
-----------------
CLI para analizar una unica imagen estatica: corre ambos detectores
(iluminacion + personas) y genera el reporte completo de `lightingAnalyzer`
(graficas + JSON/CSV/MD/HTML) en `reports/lighting_analysis/`.

Uso:
    python scripts/analyze_image.py --image test_media/casaSofia.jpeg
"""

from __future__ import annotations

import argparse
import logging
import sys
from pathlib import Path

import cv2
import yaml

PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

from detectors import LightingDetector, PersonDetector  # noqa: E402
from lightingAnalyzer import LightingAnalyzer  # noqa: E402

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(levelname)s: %(message)s")
logger = logging.getLogger("scripts.analyze_image")


def _resolve_path(base: Path, value: str) -> Path:
    p = Path(value)
    return p if p.is_absolute() else base / p


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--image", required=True, help="Ruta a la imagen a analizar.")
    parser.add_argument("--config", default=str(PROJECT_ROOT / "configs" / "models.yaml"),
                         help="Ruta al YAML de configuracion de modelos (default: configs/models.yaml).")
    parser.add_argument("--device", default=None, choices=["auto", "cuda", "cpu"])
    return parser.parse_args()


def main() -> None:
    args = parse_args()

    image_path = Path(args.image)
    if not image_path.exists():
        raise FileNotFoundError(f"No se encontro la imagen: {image_path}")

    image = cv2.imread(str(image_path))
    if image is None:
        raise ValueError(f"No se pudo leer la imagen (formato invalido o archivo corrupto): {image_path}")

    with open(args.config, "r", encoding="utf-8") as f:
        config = yaml.safe_load(f)

    device = args.device or config.get("device", "auto")
    lighting_cfg = config["lighting_detector"]
    person_cfg = config["person_detector"]

    lighting_detector = LightingDetector(
        weights_path=_resolve_path(PROJECT_ROOT, lighting_cfg["weights_path"]),
        device=device,
        score_threshold=lighting_cfg.get("score_threshold", 0.5),
    )
    person_detector = PersonDetector(
        weights_path=_resolve_path(PROJECT_ROOT, person_cfg["weights_path"]),
        device=device,
        conf_threshold=person_cfg.get("conf_threshold", 0.5),
    )
    lighting_analyzer = LightingAnalyzer()

    lighting_detections = lighting_detector.detect(image)
    person_detections = person_detector.detect(image)

    result = lighting_analyzer.analyze(
        image, lighting_detections, image_name=image_path.stem, generate_report=True,
    )

    print(f"Imagen: {image_path}")
    print(f"Ventanas detectadas: {result['windows']}  |  Luminarias detectadas: {result['luminaires']}")
    print(f"Personas detectadas: {len(person_detections)}")
    print(f"Natural: {result['natural_percentage']:.1f}%  |  Artificial: {result['artificial_percentage']:.1f}%")
    print(f"Tipo de iluminacion: {result['lighting_type']}")
    print(f"Recomendacion: {result['recommendation']}")
    print(f"Reporte completo en: {result['artifacts']['output_dir']}")


if __name__ == "__main__":
    main()
