"""Asistente de voz: preguntas en audio sobre consumo energetico y planes de
ahorro, transcritas (Whisper), respondidas por un modelo de chat con el
contexto del modulo energetico (`api.energy`) y devueltas en texto + voz
(TTS), todo via la API de OpenAI (ver GPT_API_KEY en backend/.env).

Punto de entrada: `service.procesar_pregunta_audio` / `reports.generar_reporte`.
"""

from __future__ import annotations
