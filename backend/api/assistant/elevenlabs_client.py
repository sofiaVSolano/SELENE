"""Texto -> voz con ElevenLabs. Motor principal de la narracion de Lum.

Vive junto a `openai_client.py` (mismo tipo de responsabilidad: un cliente
HTTP delgado hacia un proveedor externo de voz) pero es un modulo aparte
porque son proveedores distintos con auth y forma de payload distintas —
mezclarlos en un mismo archivo obligaria a un monton de ifs.

No hay SDK de ElevenLabs en las dependencias del proyecto y no hace falta
instalarlo: la API es un POST HTTP simple y `httpx` ya llega como
dependencia transitiva de `openai` (ver requirements.txt). Un cliente propio
de 40 lineas es menos superficie que una libreria nueva para una sola
llamada.
"""

from __future__ import annotations

import httpx

from ..config import settings

_URL = "https://api.elevenlabs.io/v1/text-to-speech/{voice_id}"
_TIMEOUT = httpx.Timeout(20.0, connect=5.0)


class ElevenLabsError(RuntimeError):
    """La sintesis con ElevenLabs no se pudo completar (sin clave, red, 4xx/5xx)."""


def disponible() -> bool:
    return bool(settings.elevenlabs_api_key)


def sintetizar_voz(texto: str, voice_id: str | None = None) -> bytes:
    """Texto -> audio MP3 con la voz configurada de ElevenLabs.

    `eleven_multilingual_v2` y no el modelo mono-ingles por defecto de la
    API: el guion del recorrido esta en espanol, y el modelo en ingles
    pronuncia el espanol con acento marcado — justo lo opuesto a la voz
    calida y natural que pidio la usuaria para Lum.
    """
    if not settings.elevenlabs_api_key:
        raise ElevenLabsError("ELEVENLABS_API_KEY no esta configurado en backend/.env.")

    url = _URL.format(voice_id=voice_id or settings.elevenlabs_voice_id)
    try:
        respuesta = httpx.post(
            url,
            timeout=_TIMEOUT,
            headers={
                "xi-api-key": settings.elevenlabs_api_key,
                "Content-Type": "application/json",
                "Accept": "audio/mpeg",
            },
            json={
                "text": texto,
                "model_id": settings.elevenlabs_model_id,
                "voice_settings": {
                    # Estabilidad media-alta y algo de "style": firme y calida
                    # sin sonar plana, que es justo el punto medio que se
                    # pidio ("muy calida, amigable, profesional, natural").
                    "stability": 0.5,
                    "similarity_boost": 0.8,
                    "style": 0.35,
                    "use_speaker_boost": True,
                },
            },
        )
        respuesta.raise_for_status()
    except httpx.HTTPStatusError as exc:
        # El body de error de ElevenLabs es JSON con detail.message; se
        # incluye porque "401" a secas no dice si es la clave o el voice_id.
        detalle = exc.response.text[:300]
        raise ElevenLabsError(f"ElevenLabs respondio {exc.response.status_code}: {detalle}") from exc
    except httpx.HTTPError as exc:
        raise ElevenLabsError(f"No se pudo contactar a ElevenLabs: {exc}") from exc

    return respuesta.content
