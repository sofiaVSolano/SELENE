"""
overlay.py
----------
Dibujo del HUD en tiempo real (cajas + panel de texto) sobre un frame BGR,
usando unicamente `cv2.rectangle`/`cv2.putText` (sin dependencias nuevas).
"""

from __future__ import annotations

import numpy as np
import cv2

# Colores en BGR (formato OpenCV)
COLOR_PERSON = (0, 200, 0)
COLOR_WINDOW = (214, 120, 42)
COLOR_LUMINAIRE = (0, 161, 237)
COLOR_DEFAULT = (255, 255, 255)

_CLASS_COLORS = {
    "Window": COLOR_WINDOW,
    "Luminaire": COLOR_LUMINAIRE,
}


def _draw_box(frame: np.ndarray, det: dict, color: tuple[int, int, int]) -> None:
    x1, y1, x2, y2 = (int(v) for v in det["bbox"])
    label = f"{det['class']} {det['confidence']:.2f}"
    cv2.rectangle(frame, (x1, y1), (x2, y2), color, 2)
    (tw, th), _ = cv2.getTextSize(label, cv2.FONT_HERSHEY_SIMPLEX, 0.5, 1)
    cv2.rectangle(frame, (x1, max(0, y1 - th - 6)), (x1 + tw + 4, y1), color, -1)
    cv2.putText(frame, label, (x1 + 2, max(0, y1 - 4)), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 0, 0), 1, cv2.LINE_AA)


def draw(
    frame: np.ndarray,
    person_detections: list[dict],
    lighting_detections: list[dict],
    lighting_summary: dict,
    fps: float,
) -> np.ndarray:
    """Dibuja cajas de personas/iluminacion + panel de estado sobre `frame` (in-place).

    Devuelve el mismo `frame` por conveniencia (encadenar llamadas).
    """
    for det in lighting_detections:
        _draw_box(frame, det, _CLASS_COLORS.get(det["class"], COLOR_DEFAULT))

    for det in person_detections:
        _draw_box(frame, det, COLOR_PERSON)

    lines = [
        f"FPS: {fps:.1f}",
        f"Personas: {len(person_detections)}",
        f"Natural: {lighting_summary.get('natural_percentage', 0.0):.1f}%  "
        f"Artificial: {lighting_summary.get('artificial_percentage', 0.0):.1f}%",
        f"Tipo: {lighting_summary.get('lighting_type', '-')}",
    ]

    pad = 8
    line_h = 22
    panel_h = pad * 2 + line_h * len(lines)
    panel_w = 340
    overlay = frame.copy()
    cv2.rectangle(overlay, (0, 0), (panel_w, panel_h), (20, 20, 20), -1)
    cv2.addWeighted(overlay, 0.55, frame, 0.45, 0, dst=frame)

    for i, line in enumerate(lines):
        y = pad + line_h * (i + 1) - 6
        cv2.putText(frame, line, (pad, y), cv2.FONT_HERSHEY_SIMPLEX, 0.55, (255, 255, 255), 1, cv2.LINE_AA)

    help_text = "[q] salir  [s] snapshot completo"
    (tw, th), _ = cv2.getTextSize(help_text, cv2.FONT_HERSHEY_SIMPLEX, 0.5, 1)
    h = frame.shape[0]
    cv2.putText(frame, help_text, (pad, h - 10), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255, 255, 255), 1, cv2.LINE_AA)

    return frame
