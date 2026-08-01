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


def generar_reporte_detallado(contexto_datos: str, instrucciones: str, transcript: str = "") -> dict:
    """Le pide al modelo que redacte un reporte DETALLADO y a la medida de
    lo que pidio el usuario (`instrucciones`, en sus propias palabras),
    anclado EXCLUSIVAMENTE en `contexto_datos` (el mismo snapshot que ancla
    al chat, ver `context_builder.construir_contexto_datos`, mas el desglose
    por luminaria que arma `reports._datos_detallado`).

    A diferencia de `datos_consumo_diario`/`datos_consumo_mensual`/
    `datos_plan_ahorro` (plantillas fijas en `report_data.py` que solo
    formatean numeros ya calculados, sin que el LLM intervenga), aqui es el
    modelo quien decide que secciones incluir, en que orden y con que
    profundidad -- por eso el reporte "se siente hecho a su medida" en vez
    de una plantilla generica con otro titulo.

    JSON mode es obligatorio, no cosmetico: sin una forma fija, un LLM libre
    para redactar como quiera llega a un formato de reporte distinto en cada
    llamada, imposible de dibujar de forma consistente en PDF (ver
    `pdf_renderer.render_pdf`, que espera `{"titulo", "parrafos"|"tabla"}`
    por seccion). `reports._sanear_secciones` valida el resultado igual,
    porque un LLM puede devolver JSON valido con una forma parecida pero no
    exacta."""
    system = f"""Eres el redactor de reportes de SELENE, un sistema de gestion energetica que combina \
vision por computador con un modelo de prediccion de consumo ya entrenado. Vas a escribir un reporte \
DETALLADO en espanol, basado EXCLUSIVAMENTE en el CONTEXTO DE DATOS de abajo.

Regla mas importante: nunca inventes una cifra que no este en el contexto. Si el usuario pidio algo \
que los datos disponibles no cubren (una zona, un periodo, una comparacion que no aparece abajo), \
dilo explicitamente en el reporte ("no hay datos suficientes sobre X todavia") en vez de rellenar con \
numeros ficticios o genericos.

El usuario pidio, en sus propias palabras, lo siguiente -- usa esto para decidir que secciones \
incluir, en que orden y con que profundidad, de modo que el reporte se sienta hecho a su medida y no \
una plantilla generica:
"{instrucciones or 'Un reporte detallado y completo, cubriendo todo lo que los datos disponibles permitan analizar.'}"

Responde SOLO un objeto JSON con esta forma exacta (nada de texto fuera del JSON):
{{
  "periodo": "string: el rango de fechas o momento que cubre el reporte",
  "resumen": "string: 1 a 2 parrafos de resumen ejecutivo",
  "secciones": [
    {{"titulo": "string", "parrafos": ["string", "..."]}},
    {{"titulo": "string", "tabla": [["Encabezado1", "Encabezado2"], ["fila1col1", "fila1col2"]]}}
  ]
}}

Entre 3 y 8 secciones. Usa "tabla" para series numericas o comparaciones (se leen mejor que en \
parrafos); usa "parrafos" para el analisis y las conclusiones. Toda tabla debe traer su fila de \
encabezado como primer elemento.

=== CONTEXTO DE DATOS ===
{contexto_datos}"""

    mensajes = [{"role": "system", "content": system}]
    mensajes.append(
        {"role": "user", "content": f"Conversacion reciente con el usuario, para contexto adicional:\n{transcript}"}
        if transcript
        else {"role": "user", "content": "Genera el reporte."}
    )

    respuesta = _client().chat.completions.create(
        model=settings.openai_chat_model,
        messages=mensajes,
        temperature=0.4,
        response_format={"type": "json_object"},
    )
    try:
        return json.loads(respuesta.choices[0].message.content)
    except (json.JSONDecodeError, TypeError, AttributeError) as exc:
        raise ValueError("El modelo no devolvio un reporte con un formato valido. Intenta de nuevo.") from exc


def sintetizar_voz(texto: str) -> bytes:
    """Texto -> audio MP3 (TTS)."""
    respuesta = _client().audio.speech.create(
        model=settings.openai_tts_model,
        voice=settings.openai_tts_voice,
        input=texto,
    )
    contenido = getattr(respuesta, "content", None)
    return contenido if contenido is not None else respuesta.read()
