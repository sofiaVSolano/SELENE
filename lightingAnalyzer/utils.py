"""
utils.py
--------
Utilidades transversales de `lightingAnalyzer`: carga de configuracion,
representacion de detecciones, extraccion de ROIs, estadisticas basicas de
brillo/contraste y escritura de artefactos (JSON/CSV) en disco.

Responsabilidad unica de este modulo: E/S y calculos numericos genericos que
reutilizan el resto de submodulos (brightness, windows, luminaires,
indicators, ...). No contiene logica de negocio especifica de iluminacion
(esa vive en brightness.py / windows.py / luminaires.py / indicators.py).
"""

from __future__ import annotations

import csv
import json
import logging
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Iterable

import cv2
import numpy as np
import yaml

logger = logging.getLogger("lightingAnalyzer.utils")

# ---------------------------------------------------------------------------
# Rutas del proyecto (resueltas de forma relativa a este archivo, igual que
# scripts/config.py, para que el modulo funcione sin importar el cwd desde el
# que se invoque).
# ---------------------------------------------------------------------------

MODULE_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = MODULE_DIR.parent
CONFIGS_DIR = PROJECT_ROOT / "configs"

WEIGHTS_CONFIG_PATH = CONFIGS_DIR / "lighting_weights.yaml"
THRESHOLDS_CONFIG_PATH = CONFIGS_DIR / "lighting_thresholds.yaml"
RECOMMENDATIONS_CONFIG_PATH = CONFIGS_DIR / "lighting_recommendations.yaml"
ANALYSIS_CONFIG_PATH = CONFIGS_DIR / "lighting_analysis.yaml"


class LightingAnalyzerError(Exception):
    """Error generico y explicito para fallos de validacion del modulo."""


# ---------------------------------------------------------------------------
# Configuracion (YAML)
# ---------------------------------------------------------------------------

def load_yaml_config(path: str | Path) -> dict:
    """Carga un archivo YAML de configuracion y valida que exista y sea un mapping.

    Se usa para todos los archivos en `configs/lighting_*.yaml`, de forma que
    ningun peso, umbral o regla quede escrito directamente en el codigo.
    """
    path = Path(path)
    if not path.exists():
        raise LightingAnalyzerError(
            f"No se encontro el archivo de configuracion: {path}"
        )
    with open(path, "r", encoding="utf-8") as f:
        data = yaml.safe_load(f)
    if data is None:
        return {}
    if not isinstance(data, dict):
        raise LightingAnalyzerError(
            f"El archivo de configuracion {path} debe contener un mapping (dict)."
        )
    return data


def ensure_dir(path: str | Path) -> Path:
    """Crea el directorio (y sus padres) si no existe y devuelve el Path."""
    p = Path(path)
    p.mkdir(parents=True, exist_ok=True)
    return p


# ---------------------------------------------------------------------------
# Deteccion
# ---------------------------------------------------------------------------

@dataclass(frozen=True)
class Detection:
    """Representa una deteccion ya validada y recortada a los limites de la imagen.

    bbox: (x1, y1, x2, y2) en coordenadas de pixel, enteros, x2>x1, y2>y1.
    """

    class_name: str
    confidence: float
    bbox: tuple[int, int, int, int]

    @property
    def width(self) -> int:
        return self.bbox[2] - self.bbox[0]

    @property
    def height(self) -> int:
        return self.bbox[3] - self.bbox[1]

    @property
    def area_px(self) -> int:
        """Area en pixeles^2 (ancho x alto del bounding box)."""
        return max(self.width, 0) * max(self.height, 0)

    @property
    def centroid(self) -> tuple[float, float]:
        """Centroide del bounding box (cx, cy), en pixeles."""
        x1, y1, x2, y2 = self.bbox
        return ((x1 + x2) / 2.0, (y1 + y2) / 2.0)

    def relative_area(self, image_shape: tuple[int, int]) -> float:
        """Area relativa respecto al area total de la imagen (0-1).

        image_shape: (alto, ancho) de la imagen completa.
        """
        h, w = image_shape[:2]
        total = float(h * w)
        return safe_divide(self.area_px, total, default=0.0)


def clip_bbox(x1: float, y1: float, x2: float, y2: float, width: int, height: int) -> tuple[int, int, int, int]:
    """Recorta un bbox arbitrario a los limites validos [0, width) x [0, height)."""
    x1c = int(max(0, min(x1, width - 1)))
    y1c = int(max(0, min(y1, height - 1)))
    x2c = int(max(0, min(x2, width)))
    y2c = int(max(0, min(y2, height)))
    return x1c, y1c, x2c, y2c


def parse_detections(raw_detections: Iterable[dict], image_shape: tuple[int, int]) -> list[Detection]:
    """Convierte las detecciones "crudas" (dict con class/confidence/bbox) del
    detector FasterRCNN_ADE20K en objetos `Detection` validados y recortados a
    los limites de la imagen.

    Detecciones malformadas (campos faltantes/invalidos) lanzan un error
    explicito; bounding boxes degenerados tras el recorte (area 0, por
    ejemplo por una caja completamente fuera de la imagen) se descartan
    silenciosamente con un aviso en el log, ya que no aportan area analizable.
    """
    h, w = image_shape[:2]
    parsed: list[Detection] = []
    for i, det in enumerate(raw_detections):
        if not isinstance(det, dict):
            raise LightingAnalyzerError(f"Deteccion #{i} invalida (se esperaba un dict): {det!r}")
        try:
            class_name = str(det["class"])
            confidence = float(det.get("confidence", 0.0))
            x1, y1, x2, y2 = det["bbox"]
        except (KeyError, TypeError, ValueError) as exc:
            raise LightingAnalyzerError(f"Deteccion #{i} malformada: {det!r}") from exc

        bbox = clip_bbox(x1, y1, x2, y2, w, h)
        if bbox[2] <= bbox[0] or bbox[3] <= bbox[1]:
            logger.warning("Deteccion #%d descartada: bbox degenerado tras recorte %r -> %r", i, (x1, y1, x2, y2), bbox)
            continue
        parsed.append(Detection(class_name=class_name, confidence=confidence, bbox=bbox))
    return parsed


def crop_roi(image: np.ndarray, bbox: tuple[int, int, int, int]) -> np.ndarray:
    """Recorta la region de interes (ROI) de una imagen dado un bbox ya clippeado."""
    x1, y1, x2, y2 = bbox
    return image[y1:y2, x1:x2]


# ---------------------------------------------------------------------------
# Conversion de color / canales de brillo
# ---------------------------------------------------------------------------

def bgr_to_v_channel(image_bgr: np.ndarray) -> np.ndarray:
    """Extrae el canal V (Value) del espacio HSV: V = max(R, G, B).

    Es la medida de "brillo" clasica en vision por computador (Gonzalez &
    Woods, Digital Image Processing) y la que este modulo usa como metrica
    principal de brillo para todos los calculos (escena, ventanas,
    luminarias). Rango: 0-255 (uint8).
    """
    hsv = cv2.cvtColor(image_bgr, cv2.COLOR_BGR2HSV)
    return hsv[:, :, 2]


def bgr_to_l_channel(image_bgr: np.ndarray) -> np.ndarray:
    """Extrae el canal L (Lightness) del espacio CIE LAB.

    L* aproxima la percepcion humana de luminosidad (no es linealmente
    proporcional a la intensidad fisica, a diferencia de V). Se usa aqui como
    referencia perceptual complementaria (histograma L, Etapa 1), no como
    metrica principal de brillo. OpenCV devuelve L ya escalado a 0-255 (uint8).
    """
    lab = cv2.cvtColor(image_bgr, cv2.COLOR_BGR2LAB)
    return lab[:, :, 0]


# ---------------------------------------------------------------------------
# Estadisticas de brillo / contraste
# ---------------------------------------------------------------------------

def basic_stats(channel: np.ndarray) -> dict[str, float]:
    """Calcula media, maximo, minimo y desviacion estandar de un canal 2D.

    Devuelve todo en 0.0 si el ROI esta vacio (bbox degenerado), en vez de
    lanzar una excepcion, para que el pipeline pueda seguir procesando el
    resto de detecciones.
    """
    if channel.size == 0:
        return {"mean": 0.0, "max": 0.0, "min": 0.0, "std": 0.0}
    arr = channel.astype(np.float64)
    return {
        "mean": float(np.mean(arr)),
        "max": float(np.max(arr)),
        "min": float(np.min(arr)),
        "std": float(np.std(arr)),
    }


def michelson_contrast(channel: np.ndarray) -> float:
    """Contraste de Michelson: C = (I_max - I_min) / (I_max + I_min).

    Formula clasica de contraste (Michelson, 1927, "Studies in Optics"),
    acotada en [0, 1] y adecuada para regiones localizadas (ROIs) donde no
    hay un patron periodico global, a diferencia del contraste RMS
    (equivalente a std/mean) que ya se reporta por separado como
    "desviacion estandar". Devuelve 0.0 si el ROI esta vacio o es
    completamente negro (I_max + I_min == 0).
    """
    if channel.size == 0:
        return 0.0
    i_max = float(np.max(channel))
    i_min = float(np.min(channel))
    denom = i_max + i_min
    if denom == 0:
        return 0.0
    return (i_max - i_min) / denom


def histogram_256(channel: np.ndarray, bins: int = 256, value_range: tuple[int, int] = (0, 256)) -> np.ndarray:
    """Histograma de un canal de un solo byte (0-255), como vector 1D de tamano `bins`."""
    if channel.size == 0:
        return np.zeros(bins, dtype=np.float64)
    hist = cv2.calcHist([channel.astype(np.uint8)], [0], None, [bins], list(value_range))
    return hist.flatten()


def intensity_distribution(channel: np.ndarray, bands: dict[str, tuple[int, int]]) -> dict[str, float]:
    """Distribucion de intensidad luminosa: porcentaje de pixeles en cada banda.

    `bands` es un dict {nombre: (lo, hi)} con rangos semiabiertos [lo, hi).
    Devuelve el porcentaje (0-100) de pixeles del canal que cae en cada banda.
    """
    total = channel.size
    if total == 0:
        return {name: 0.0 for name in bands}
    result = {}
    for name, (lo, hi) in bands.items():
        count = int(np.count_nonzero((channel >= lo) & (channel < hi)))
        result[name] = safe_divide(count, total, default=0.0) * 100.0
    return result


def safe_divide(numerator: float, denominator: float, default: float = 0.0) -> float:
    """Division segura: devuelve `default` si el denominador es 0 (evita ZeroDivisionError)."""
    return numerator / denominator if denominator else default


# ---------------------------------------------------------------------------
# Escritura de artefactos
# ---------------------------------------------------------------------------

def write_json(data: Any, path: str | Path) -> Path:
    """Serializa `data` a JSON legible (indent=2) y lo guarda en `path`."""
    path = Path(path)
    ensure_dir(path.parent)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False, default=_json_default)
    logger.info("JSON guardado en %s", path)
    return path


def _json_default(obj: Any) -> Any:
    if isinstance(obj, (np.integer,)):
        return int(obj)
    if isinstance(obj, (np.floating,)):
        return float(obj)
    if isinstance(obj, np.ndarray):
        return obj.tolist()
    if isinstance(obj, Path):
        return str(obj)
    raise TypeError(f"Objeto no serializable a JSON: {type(obj)}")


def write_csv(rows: list[dict], path: str | Path) -> Path:
    """Guarda una lista de dicts homogeneos (misma union de claves) como CSV.

    Si `rows` esta vacio se guarda un CSV con solo el encabezado "sin datos"
    en vez de lanzar un error, para que el reporte siempre exista.
    """
    path = Path(path)
    ensure_dir(path.parent)
    if not rows:
        with open(path, "w", newline="", encoding="utf-8") as f:
            csv.writer(f).writerow(["sin_datos"])
        logger.info("CSV vacio guardado en %s", path)
        return path

    fieldnames: list[str] = []
    for row in rows:
        for key in row.keys():
            if key not in fieldnames:
                fieldnames.append(key)

    with open(path, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)
    logger.info("CSV guardado en %s", path)
    return path


def validate_image(image: np.ndarray) -> None:
    """Valida que `image` sea una imagen RGB/BGR valida para el pipeline."""
    if image is None:
        raise LightingAnalyzerError("La imagen de entrada es None.")
    if not isinstance(image, np.ndarray):
        raise LightingAnalyzerError(f"La imagen debe ser un numpy.ndarray, se recibio {type(image)}.")
    if image.ndim != 3 or image.shape[2] != 3:
        raise LightingAnalyzerError(f"La imagen debe tener forma (H, W, 3), se recibio {image.shape}.")
    if image.size == 0 or image.shape[0] == 0 or image.shape[1] == 0:
        raise LightingAnalyzerError("La imagen esta vacia (alto o ancho igual a 0).")
