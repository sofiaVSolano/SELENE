"""
visualization.py
-----------------
Generacion y guardado de TODAS las salidas graficas del modulo:

  - Imagen anotada (bounding boxes + etiqueta + brillo por ROI + resumen de
    scores/clasificacion de la escena).
  - Histogramas (canal V y canal L de la escena; canal V por cada ventana y
    cada luminaria detectada).
  - Mapa de calor de brillo (heatmap) sobre el canal V de la escena completa.
  - Grafica de distribucion de intensidad luminosa (bandas oscura/media/clara).

Responsabilidad unica: dibujar y guardar en disco. Este modulo no calcula
ninguna metrica (eso ya viene resuelto en los dicts que recibe de
brightness.py / windows.py / luminaires.py / indicators.py / classifier.py).
"""

from __future__ import annotations

import logging
from pathlib import Path

import cv2
import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np

from . import utils

logger = logging.getLogger("lightingAnalyzer.visualization")

# ---------------------------------------------------------------------------
# Tokens de diseno (consistentes con scripts/plotting.py del resto del
# proyecto: fondo claro, tinta primaria/secundaria/muted, grid recesivo).
# ---------------------------------------------------------------------------

INK_PRIMARY = "#0b0b0b"
INK_SECONDARY = "#52514e"
INK_MUTED = "#898781"
GRIDLINE = "#e1e0d9"
BASELINE = "#c3c2b7"
SURFACE = "#fcfcfb"

# Colores categoricos fijos por clase (nunca reasignados): Window = azul
# (asociacion convencional con luz de dia/cielo), Luminaire = ambar (asociacion
# convencional con luz artificial calida).
BOX_COLOR_BGR = {
    "Window": (214, 120, 42),      # azul (#2a78d6 en BGR)
    "Luminaire": (52, 104, 235),   # ambar (#eb6834 en BGR)
}
HIST_COLOR = {
    "Window": "#2a78d6",
    "Luminaire": "#eb6834",
    "V": "#2a78d6",
    "L": "#eb6834",
}


def _setup_style(dpi: int) -> None:
    plt.rcParams.update({
        "figure.facecolor": SURFACE,
        "axes.facecolor": SURFACE,
        "savefig.facecolor": SURFACE,
        "axes.edgecolor": BASELINE,
        "axes.labelcolor": INK_SECONDARY,
        "text.color": INK_PRIMARY,
        "xtick.color": INK_MUTED,
        "ytick.color": INK_MUTED,
        "grid.color": GRIDLINE,
        "font.family": "sans-serif",
        "font.size": 10,
        "axes.titlesize": 12,
        "axes.titleweight": "bold",
        "axes.spines.top": False,
        "axes.spines.right": False,
        "figure.dpi": dpi,
        "savefig.dpi": dpi,
    })


def _save_fig(fig, out_path: Path) -> Path:
    utils.ensure_dir(out_path.parent)
    fig.tight_layout()
    fig.savefig(out_path, bbox_inches="tight")
    plt.close(fig)
    logger.info("Grafica guardada: %s", out_path)
    return out_path


# ---------------------------------------------------------------------------
# Imagen anotada
# ---------------------------------------------------------------------------

def draw_annotated_image(
    image_bgr: np.ndarray,
    window_results: list[dict],
    luminaire_results: list[dict],
    scene_result: dict,
    indicators_result: dict,
    lighting_type: str,
) -> np.ndarray:
    """Dibuja bounding boxes + etiqueta + brillo por ROI + un panel resumen
    con Natural Score, Artificial Score, tipo de iluminacion y brillo de
    escena. Devuelve una COPIA de la imagen (no modifica el array original).
    """
    canvas = image_bgr.copy()
    font = cv2.FONT_HERSHEY_SIMPLEX

    for label, results, id_key in (
        ("Window", window_results, "window_id"),
        ("Luminaire", luminaire_results, "luminaire_id"),
    ):
        color = BOX_COLOR_BGR[label]
        for res in results:
            x1, y1, x2, y2 = res["bbox"]
            cv2.rectangle(canvas, (x1, y1), (x2, y2), color, 2)
            text = f"{label} #{res[id_key]} | brillo={res['brightness_mean']:.0f}"
            (tw, th), baseline = cv2.getTextSize(text, font, 0.5, 1)
            text_y = max(y1 - 6, th + 4)
            cv2.rectangle(canvas, (x1, text_y - th - baseline - 2), (x1 + tw + 4, text_y + baseline), color, -1)
            cv2.putText(canvas, text, (x1 + 2, text_y), font, 0.5, (255, 255, 255), 1, cv2.LINE_AA)

    # Panel resumen (fondo semitransparente en la esquina superior izquierda).
    lines = [
        f"Brillo escena: {scene_result['mean']:.1f}",
        f"Natural: {indicators_result['natural_percentage']:.1f}%",
        f"Artificial: {indicators_result['artificial_percentage']:.1f}%",
        f"Tipo: {lighting_type}",
    ]
    panel_w, panel_h = 260, 22 * len(lines) + 16
    overlay = canvas.copy()
    cv2.rectangle(overlay, (0, 0), (panel_w, panel_h), (20, 20, 20), -1)
    canvas = cv2.addWeighted(overlay, 0.55, canvas, 0.45, 0)
    for i, line in enumerate(lines):
        cv2.putText(canvas, line, (10, 24 + i * 22), font, 0.55, (255, 255, 255), 1, cv2.LINE_AA)

    return canvas


# ---------------------------------------------------------------------------
# Histogramas
# ---------------------------------------------------------------------------

def plot_scene_histograms(v_hist: np.ndarray, l_hist: np.ndarray, out_path: Path, dpi: int) -> Path:
    """Histogramas del canal V (HSV, brillo) y L (LAB, luminosidad perceptual)
    de la escena completa, en subplots lado a lado."""
    _setup_style(dpi)
    fig, axes = plt.subplots(1, 2, figsize=(9, 3.2))
    x = np.arange(len(v_hist))

    axes[0].fill_between(x, v_hist, color=HIST_COLOR["V"], alpha=0.85)
    axes[0].set_title("Histograma canal V (HSV)")
    axes[0].set_xlabel("Valor (0-255)")
    axes[0].set_ylabel("Pixeles")
    axes[0].grid(True, axis="y", linewidth=0.6)

    axes[1].fill_between(np.arange(len(l_hist)), l_hist, color=HIST_COLOR["L"], alpha=0.85)
    axes[1].set_title("Histograma canal L (LAB)")
    axes[1].set_xlabel("Valor (0-255)")
    axes[1].grid(True, axis="y", linewidth=0.6)

    return _save_fig(fig, out_path)


def plot_roi_histograms(results: list[dict], label: str, id_key: str, out_path: Path, dpi: int) -> Path | None:
    """Grilla con un subplot por cada ROI detectado (ventana o luminaria) con
    su histograma del canal V. Devuelve None si no hay resultados (no se
    genera un archivo vacio)."""
    if not results:
        logger.info("Sin detecciones de %s: no se genera grilla de histogramas.", label)
        return None

    _setup_style(dpi)
    n = len(results)
    ncols = min(n, 4)
    nrows = int(np.ceil(n / ncols))
    fig, axes = plt.subplots(nrows, ncols, figsize=(3.0 * ncols, 2.6 * nrows), squeeze=False)
    color = HIST_COLOR[label]

    for i, res in enumerate(results):
        ax = axes[i // ncols][i % ncols]
        hist = res["histogram"]
        ax.fill_between(np.arange(len(hist)), hist, color=color, alpha=0.85)
        ax.set_title(f"{label} #{res[id_key]}", fontsize=9)
        ax.set_xticks([0, 128, 255])
        ax.grid(True, axis="y", linewidth=0.5)

    # Oculta subplots sobrantes de la grilla.
    for i in range(n, nrows * ncols):
        axes[i // ncols][i % ncols].axis("off")

    fig.suptitle(f"Histogramas de brillo (canal V) por {label}", fontsize=11, y=1.02)
    return _save_fig(fig, out_path)


# ---------------------------------------------------------------------------
# Mapa de calor de brillo
# ---------------------------------------------------------------------------

def plot_brightness_heatmap(v_channel: np.ndarray, out_path: Path, colormap: str, dpi: int) -> Path:
    """Mapa de calor del brillo (canal V) de la escena completa.

    Se usa un colormap secuencial y perceptualmente uniforme (por defecto
    'inferno') en vez de una paleta tipo "rainbow"/jet, que introduce bandas
    de contraste falsas no presentes en los datos reales.
    """
    _setup_style(dpi)
    fig, ax = plt.subplots(figsize=(6, 4.5))
    im = ax.imshow(v_channel, cmap=colormap, vmin=0, vmax=255)
    ax.set_title("Mapa de calor de brillo (canal V)")
    ax.set_xticks([])
    ax.set_yticks([])
    cbar = fig.colorbar(im, ax=ax, fraction=0.046, pad=0.04)
    cbar.set_label("Brillo (0-255)")
    return _save_fig(fig, out_path)


# ---------------------------------------------------------------------------
# Distribucion de intensidad luminosa
# ---------------------------------------------------------------------------

def plot_intensity_distribution(distribution: dict[str, float], out_path: Path, dpi: int) -> Path:
    """Grafica de barras con el porcentaje de pixeles en cada banda de
    intensidad (oscura / media / clara), segun `configs/lighting_analysis.yaml`.
    """
    _setup_style(dpi)
    fig, ax = plt.subplots(figsize=(5, 3.2))
    names = list(distribution.keys())
    values = [distribution[n] for n in names]
    bars = ax.bar(names, values, color=[INK_MUTED, "#2a78d6", "#eb6834"][: len(names)])
    ax.set_ylabel("% de pixeles")
    ax.set_title("Distribucion de intensidad luminosa")
    ax.set_ylim(0, max(100.0, max(values) * 1.15 if values else 100.0))
    ax.grid(True, axis="y", linewidth=0.6)
    for bar, value in zip(bars, values):
        ax.annotate(f"{value:.1f}%", (bar.get_x() + bar.get_width() / 2, bar.get_height()),
                    ha="center", va="bottom", fontsize=9, color=INK_PRIMARY)
    return _save_fig(fig, out_path)


# ---------------------------------------------------------------------------
# Orquestacion: genera y guarda TODO en un directorio de salida
# ---------------------------------------------------------------------------

def generate_all(
    output_dir: Path,
    image_bgr: np.ndarray,
    scene_result: dict,
    window_results: list[dict],
    luminaire_results: list[dict],
    indicators_result: dict,
    lighting_type: str,
    plots_config: dict,
    heatmap_config: dict,
) -> dict[str, Path]:
    """Genera y guarda todas las imagenes/graficas del pipeline en `output_dir`.

    Returns
    -------
    dict {nombre_logico: Path} con la ruta de cada artefacto generado
    (los que no aplican, p. ej. sin luminarias detectadas, se omiten).
    """
    graphs_dir = utils.ensure_dir(Path(output_dir) / "graphs")
    dpi = int(plots_config.get("dpi", 150))
    colormap = heatmap_config.get("colormap", "inferno")

    paths: dict[str, Path] = {}

    annotated = draw_annotated_image(
        image_bgr, window_results, luminaire_results, scene_result, indicators_result, lighting_type
    )
    annotated_path = graphs_dir / "annotated.png"
    utils.ensure_dir(annotated_path.parent)
    cv2.imwrite(str(annotated_path), annotated)
    logger.info("Imagen anotada guardada en %s", annotated_path)
    paths["annotated_image"] = annotated_path

    paths["scene_histograms"] = plot_scene_histograms(
        scene_result["v_histogram"], scene_result["l_histogram"], graphs_dir / "scene_histograms.png", dpi
    )
    paths["brightness_heatmap"] = plot_brightness_heatmap(
        scene_result["v_channel"], graphs_dir / "brightness_heatmap.png", colormap, dpi
    )
    paths["intensity_distribution"] = plot_intensity_distribution(
        scene_result["intensity_distribution"], graphs_dir / "intensity_distribution.png", dpi
    )

    window_hist_path = plot_roi_histograms(
        window_results, "Window", "window_id", graphs_dir / "windows_histograms.png", dpi
    )
    if window_hist_path:
        paths["windows_histograms"] = window_hist_path

    luminaire_hist_path = plot_roi_histograms(
        luminaire_results, "Luminaire", "luminaire_id", graphs_dir / "luminaires_histograms.png", dpi
    )
    if luminaire_hist_path:
        paths["luminaires_histograms"] = luminaire_hist_path

    return paths
