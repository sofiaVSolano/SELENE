"""Puente entre la API y los modelos de vision ya entrenados del proyecto
(`detectors/person_detector.py`, `detectors/lighting_detector.py`,
`lightingAnalyzer/`).

Este modulo NO reimplementa deteccion: unicamente carga (una sola vez, como
singletons) los mismos wrappers que usa `scripts/run_realtime.py` y expone una
funcion de conveniencia `analyze_frame()` para el router `/api/deteccion`.

Nota de import: el paquete raiz `app/` (device_utils, etc., del que dependen
los detectores) vive en la raiz del repo, no dentro de `backend/`. Se inserta
la raiz del proyecto al frente de `sys.path` para que `import app...`,
`import detectors...` y `import lightingAnalyzer...` resuelvan siempre ahi,
sin importar desde donde se lance uvicorn.
"""

from __future__ import annotations

import functools
import logging
import sys
import threading

import cv2
import numpy as np
import yaml

from .config import settings

_PROJECT_ROOT = str(settings.project_root)
if _PROJECT_ROOT not in sys.path:
    sys.path.insert(0, _PROJECT_ROOT)

from detectors.lighting_detector import LightingDetector  # noqa: E402
from detectors.person_detector import PersonDetector  # noqa: E402
from lightingAnalyzer.analyzer import LightingAnalyzer  # noqa: E402

logger = logging.getLogger("api.detection_service")

_load_lock = threading.Lock()


@functools.lru_cache(maxsize=1)
def _models_config() -> dict:
    config_path = settings.project_root / settings.models_config_path
    with open(config_path, encoding="utf-8") as fh:
        return yaml.safe_load(fh)


# El lock envuelve la LLAMADA, no el cuerpo cacheado: `lru_cache` protege su
# diccionario interno pero NO sostiene ningun lock mientras ejecuta la funcion,
# asi que dos hilos que fallan la cache a la vez construyen AMBOS el detector.
# Con la precarga corriendo en segundo plano (ver api/main.py) eso deja de ser
# teorico: una peticion a /api/deteccion durante el arranque cargaria un
# segundo FasterRCNN en memoria, que es justo lo que tumba una VM chica.
def get_person_detector() -> PersonDetector:
    with _load_lock:
        return _construir_person_detector()


def get_lighting_detector() -> LightingDetector:
    with _load_lock:
        return _construir_lighting_detector()


@functools.lru_cache(maxsize=1)
def _construir_person_detector() -> PersonDetector:
    cfg = _models_config()["person_detector"]
    detector = PersonDetector(
        weights_path=settings.project_root / cfg["weights_path"],
        device=settings.device,
        conf_threshold=cfg["conf_threshold"],
    )
    detector.warmup()
    return detector


@functools.lru_cache(maxsize=1)
def _construir_lighting_detector() -> LightingDetector:
    cfg = _models_config()["lighting_detector"]
    detector = LightingDetector(
        weights_path=settings.project_root / cfg["weights_path"],
        device=settings.device,
        score_threshold=cfg["score_threshold"],
    )
    detector.warmup()
    return detector


@functools.lru_cache(maxsize=1)
def get_lighting_analyzer() -> LightingAnalyzer:
    return LightingAnalyzer()


def warmup_models() -> None:
    """Se llama en el startup de FastAPI para no pagar el costo de carga
    (pesos + CUDA init) en la primera peticion real del dashboard."""
    logger.info("Cargando modelos de vision (persona + iluminacion)...")
    get_person_detector()
    get_lighting_detector()
    get_lighting_analyzer()
    logger.info("Modelos listos.")


def decode_image(raw_bytes: bytes) -> np.ndarray:
    array = np.frombuffer(raw_bytes, dtype=np.uint8)
    frame_bgr = cv2.imdecode(array, cv2.IMREAD_COLOR)
    if frame_bgr is None:
        raise ValueError("No se pudo decodificar la imagen recibida.")
    return frame_bgr


def analyze_frame(frame_bgr: np.ndarray) -> dict:
    """Corre ambos detectores + el analizador de iluminacion sobre un frame.

    Returns
    -------
    dict con personas detectadas (bbox + confianza), estado de ocupacion,
    elementos de iluminacion detectados (Window/Luminaire) y el resumen del
    `lightingAnalyzer` (porcentaje natural/artificial, brillo, recomendacion).
    """
    person_detections = get_person_detector().detect(frame_bgr)
    lighting_detections = get_lighting_detector().detect(frame_bgr)

    lighting_summary = get_lighting_analyzer().analyze(
        frame_bgr, lighting_detections, generate_report=False,
    )

    personas_detectadas = len(person_detections)
    estado_ocupacion = "ocupado" if personas_detectadas >= 1 else "vacio"

    ventanas = lighting_summary["details"]["windows"]
    luminarias_detectadas = lighting_summary["details"]["luminaires"]

    return {
        "personas": [_to_detection_item(d) for d in person_detections],
        "personas_detectadas": personas_detectadas,
        "estado_ocupacion": estado_ocupacion,
        "elementos_iluminacion": [_to_detection_item(d) for d in lighting_detections],
        "porcentaje_natural": lighting_summary["natural_percentage"],
        "porcentaje_artificial": lighting_summary["artificial_percentage"],
        "brillo_escena": round(lighting_summary["scene_brightness"] / 255 * 100, 2),
        "tipo_iluminacion": lighting_summary["lighting_type"],
        "recomendacion": lighting_summary["recommendation"],
        "confianza_max_persona": max((d["confidence"] for d in person_detections), default=0.0),
        # Campos adicionales para EscenarioVision (api.energy.vision_bridge):
        # lightingAnalyzer ya los calcula, solo no se exponian en la respuesta HTTP.
        "num_ventanas": lighting_summary["windows"],
        "num_luminarias": lighting_summary["luminaires"],
        # Cuantas de las luminarias detectadas estan realmente emitiendo. Es
        # lo que decide "hay derroche" cuando la sala esta vacia:
        # `porcentaje_artificial` no sirve para eso porque es un reparto
        # relativo frente a la luz natural y se hunde en cuanto entra sol,
        # aunque la lampara siga encendida (ver lightingAnalyzer/luminaires.py).
        "num_luminarias_encendidas": lighting_summary["luminaires_lit"],
        "area_ventanas_relativa": round(min(1.0, sum(w["relative_area"] for w in ventanas)), 4),
        "area_luminarias_relativa": round(min(1.0, sum(l["relative_area"] for l in luminarias_detectadas)), 4),
        "brillo_ventanas": round(_promedio_brillo(ventanas), 4),
        "brillo_luminarias": round(_promedio_brillo(luminarias_detectadas), 4),
        "natural_score": lighting_summary["natural_score"],
        "artificial_score": lighting_summary["artificial_score"],
    }


def _promedio_brillo(elementos: list[dict]) -> float:
    if not elementos:
        return 0.0
    return sum(e["brightness_mean"] for e in elementos) / len(elementos)


def _to_detection_item(detection: dict) -> dict:
    x1, y1, x2, y2 = detection["bbox"]
    return {
        "clase": detection["class"],
        "confianza": round(float(detection["confidence"]), 4),
        "bbox": {"x1": x1, "y1": y1, "x2": x2, "y2": y2},
    }
