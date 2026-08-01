"""
run_realtime.py
----------------
CLI para correr la deteccion de personas + iluminacion en tiempo real sobre
una webcam o un archivo de video.

Uso:
    python scripts/run_realtime.py                       # webcam por defecto (indice 0)
    python scripts/run_realtime.py --source 1
    python scripts/run_realtime.py --source ruta\video.mp4
    python scripts/run_realtime.py --lighting-interval 20 --person-interval 8 --device cpu --no-async
"""

from __future__ import annotations

import argparse
import logging
import sys
from pathlib import Path

import yaml

PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

from app.realtime_pipeline import RealtimePipeline  # noqa: E402
from detectors import LightingDetector, PersonDetector  # noqa: E402
from lightingAnalyzer import LightingAnalyzer  # noqa: E402

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(levelname)s: %(message)s")
logger = logging.getLogger("scripts.run_realtime")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--config", default=str(PROJECT_ROOT / "configs" / "models.yaml"),
                         help="Ruta al YAML de configuracion de modelos (default: configs/models.yaml).")
    parser.add_argument("--source", default=None,
                         help="Indice de camara o ruta de archivo de video (override de video.source).")
    parser.add_argument("--lighting-interval", type=int, default=None,
                         help="Re-ejecutar el detector de iluminacion cada N frames (override).")
    parser.add_argument("--person-interval", type=int, default=None,
                         help="Re-ejecutar el detector de personas cada N frames (override).")
    parser.add_argument("--device", default=None, choices=["auto", "cuda", "cpu"],
                         help="Dispositivo de inferencia para ambos detectores (override).")
    parser.add_argument("--no-async", action="store_true",
                         help="Ejecuta el detector de iluminacion de forma sincrona (sin hilo aparte).")
    return parser.parse_args()


def _resolve_path(base: Path, value: str) -> Path:
    p = Path(value)
    return p if p.is_absolute() else base / p


def main() -> None:
    args = parse_args()

    config_path = Path(args.config)
    with open(config_path, "r", encoding="utf-8") as f:
        config = yaml.safe_load(f)

    device = args.device or config.get("device", "auto")

    lighting_cfg = config["lighting_detector"]
    person_cfg = config["person_detector"]
    video_cfg = config.get("video", {})

    lighting_weights = _resolve_path(PROJECT_ROOT, lighting_cfg["weights_path"])
    person_weights = _resolve_path(PROJECT_ROOT, person_cfg["weights_path"])

    logger.info("Cargando detector de iluminacion desde %s", lighting_weights)
    lighting_detector = LightingDetector(
        weights_path=lighting_weights,
        device=device,
        score_threshold=lighting_cfg.get("score_threshold", 0.5),
    )

    logger.info("Cargando detector de personas desde %s", person_weights)
    person_detector = PersonDetector(
        weights_path=person_weights,
        device=device,
        conf_threshold=person_cfg.get("conf_threshold", 0.5),
    )

    lighting_analyzer = LightingAnalyzer()

    source = args.source if args.source is not None else video_cfg.get("source", 0)
    if isinstance(source, str) and source.isdigit():
        source = int(source)

    lighting_interval = args.lighting_interval if args.lighting_interval is not None else lighting_cfg.get("interval_frames", 15)
    person_interval = args.person_interval if args.person_interval is not None else person_cfg.get("interval_frames", 5)
    # --no-async desactiva el hilo aparte para AMBOS detectores (los dos son
    # fasterrcnn_resnet50_fpn_v2, igual de pesados).
    async_execution = not args.no_async and (lighting_cfg.get("async_execution", True) or person_cfg.get("async_execution", True))

    pipeline = RealtimePipeline(
        lighting_detector=lighting_detector,
        person_detector=person_detector,
        lighting_analyzer=lighting_analyzer,
        source=source,
        window_name=video_cfg.get("window_name", "Deteccion en tiempo real - Iluminacion y Personas"),
        lighting_interval_frames=lighting_interval,
        person_interval_frames=person_interval,
        async_execution=async_execution,
    )
    pipeline.run()


if __name__ == "__main__":
    main()
