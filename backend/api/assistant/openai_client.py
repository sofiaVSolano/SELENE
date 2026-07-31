"""Envoltorio delgado sobre el SDK de OpenAI: transcripcion (Whisper),
respuesta (Chat Completions) y voz (TTS). Un solo lugar para los 3 modelos
configurables (ver GPT_API_KEY/OPENAI_*_MODEL en backend/.env)."""

from __future__ import annotations

import functools
import json

from ..config import settings


class AssistantConfigError(Exception):
    pass


@functools.lru_cache(maxsize=1)
def _client():
    if not settings.gpt_api_key:
        raise AssistantConfigError(
            "GPT_API_KEY no esta configurado en backend/.env: el asistente de voz no puede llamar a OpenAI."
        )
    from openai import OpenAI  # import perezoso: no forzar la dependencia si el modulo no se usa

    return OpenAI(api_key=settings.gpt_api_key)


def transcribir_audio(audio_bytes: bytes, filename: str, content_type: str) -> str:
    """Voz -> texto (Whisper). `language='es'` evita que Whisper intente
    detectar el idioma en clips cortos y a veces se equivoque."""
    resultado = _client().audio.transcriptions.create(
        model=settings.openai_transcription_model,
        file=(filename, audio_bytes, content_type),
        language="es",
    )
    return resultado.text.strip()


def generar_respuesta_chat(mensajes: list[dict]) -> str:
    """`mensajes` en formato Chat Completions: [{"role": "system"|"user"|"assistant", "content": str}, ...]."""
    respuesta = _client().chat.completions.create(
        model=settings.openai_chat_model,
        messages=mensajes,
        temperature=0.3,
    )
    return respuesta.choices[0].message.content.strip()


def clasificar_tipos_reporte(transcript: str, catalogo: dict[str, dict]) -> list[str]:
    """Le pide al modelo de chat que identifique, a partir de una
    conversacion, cuales tipos de reporte (`report_types.TIPOS_REPORTE`)
    tiene sentido ofrecer para descargar. Devuelve solo claves presentes en
    `catalogo`; lista vacia si el modelo no responde JSON valido (el caller
    hace fallback a ["general"], ver `reports.sugerir_tipos_reporte`)."""
    catalogo_texto = "\n".join(f"- {clave}: {info['descripcion_para_llm']}" for clave, info in catalogo.items())
    system = (
        "Vas a leer una conversacion entre un usuario y el asistente de voz de SELENE (consumo energetico). "
        "Identifica cuales de estos tipos de reporte tiene sentido ofrecerle para descargar, segun los temas "
        f"que se hablaron:\n{catalogo_texto}\n\n"
        'Responde SOLO un objeto JSON con la forma {"tipos_relevantes": ["clave1", "clave2"]}, '
        "con 1 a 4 claves validas del catalogo de arriba, ordenadas de mas a menos relevante. "
        'Si no hay temas claros, incluye al menos "general".'
    )
    respuesta = _client().chat.completions.create(
        model=settings.openai_chat_model,
        messages=[
            {"role": "system", "content": system},
            {"role": "user", "content": transcript or "(conversacion vacia)"},
        ],
        temperature=0,
        response_format={"type": "json_object"},
    )
    contenido = respuesta.choices[0].message.content
    try:
        claves_propuestas = json.loads(contenido).get("tipos_relevantes", [])
    except (json.JSONDecodeError, AttributeError, TypeError):
        return []

    vistas: set[str] = set()
    resultado: list[str] = []
    for clave in claves_propuestas:
        if clave in catalogo and clave not in vistas:
            vistas.add(clave)
            resultado.append(clave)
    return resultado


def sintetizar_voz(texto: str) -> bytes:
    """Texto -> audio MP3 (TTS)."""
    respuesta = _client().audio.speech.create(
        model=settings.openai_tts_model,
        voice=settings.openai_tts_voice,
        input=texto,
    )
    contenido = getattr(respuesta, "content", None)
    return contenido if contenido is not None else respuesta.read()
