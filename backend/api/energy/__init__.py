"""Modulo de gestion energetica: convierte la salida del sistema de vision
(personas, ventanas, luminarias, brillo, natural/artificial score...) en
indicadores energeticos y recomendaciones de ahorro, usando exclusivamente el
modelo LightGBM ya entrenado en ProyectoPrediccionEnergetica (no se reentrena
nada aqui).

Ver `service.py` para el punto de entrada (`generar_reporte_energetico`).
"""

from __future__ import annotations
