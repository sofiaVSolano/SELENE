"""Narracion del recorrido de bienvenida.

Existe por una razon concreta: la voz del navegador (`SpeechSynthesis`) suena
robotica en Windows, y el recorrido lo conduce una mascota que tiene que
sentirse calida. Tres niveles, en orden:

  1. **ElevenLabs** (`elevenlabs_client.py`), la voz de Lum de verdad — cálida,
     natural, elegida a mano (`ELEVENLABS_VOICE_ID` en `.env`).
  2. **TTS de OpenAI** (`openai_client.sintetizar_voz`), el mismo que ya usa
     el asistente. Respaldo si ElevenLabs no está configurado o falla (clave
     vencida, cuota agotada, red).
  3. **`SpeechSynthesis` del navegador**, resuelto enteramente en el
     frontend (`narracion.js`) si este endpoint devuelve 503.

Dos decisiones que importan:

  * **Cache en memoria.** El guion es corto y muy repetido — el mismo usuario
    puede relanzar el recorrido, y varios usuarios oyen exactamente las mismas
    frases. Sintetizar cada vez seria pagar una y otra vez por un audio
    identico. La clave es el hash del texto, asi que las variantes del guion
    (que cambian la frase para que no suene siempre igual) conviven sin
    pisarse. La clave incluye qué motor generó el audio: si algún día se
    cambia de voz o de proveedor, lo nuevo no hereda por error el audio ya
    cacheado del anterior.
  * **Fallar aqui no puede romper el recorrido.** Si ningun motor responde,
    se contesta 503 y el frontend cae a la voz del navegador. El recorrido
    nunca se queda mudo, solo suena peor.
"""

from __future__ import annotations

import hashlib
import logging
from collections import OrderedDict

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import Response

from .. import models, schemas
from ..config import settings
from ..deps import get_current_user

router = APIRouter(prefix="/api/recorrido", tags=["recorrido"])

logger = logging.getLogger("api.recorrido")

# Guion completo del recorrido con sus variantes: unas pocas decenas de frases
# cortas. El tope es holgado y acota la memoria pase lo que pase.
_MAX_CACHE = 128
_cache: "OrderedDict[str, bytes]" = OrderedDict()


def _clave(texto: str, motor: str) -> str:
    # `motor` entra en el hash (ver nota de arriba: distingue voces/proveedores).
    return hashlib.sha256(f"{motor}::{texto.strip()}".encode("utf-8")).hexdigest()


@router.post(
    "/narrar",
    responses={200: {"content": {"audio/mpeg": {}}}},
    response_class=Response,
)
def narrar(
    payload: schemas.NarracionIn,
    _usuario: models.Usuario = Depends(get_current_user),
) -> Response:
    """Texto del guion -> MP3. Devuelve 503 (no 500) si ningun motor de TTS
    esta disponible: para el frontend es 'usa la voz del navegador', no
    'algo se rompio'."""
    texto = payload.texto.strip()
    # `preferido` es el motor que se INTENTARÍA primero ahora mismo; solo sirve
    # para mirar en cache antes de llamar a nadie. No es necesariamente el
    # motor que terminó generando el audio (ver `motor_real` más abajo) — si
    # ElevenLabs está caído y cae a OpenAI, cachear bajo la clave de
    # ElevenLabs serviría ese audio de repuesto para siempre, aunque
    # ElevenLabs vuelva a funcionar dos peticiones después.
    preferido = f"elevenlabs:{settings.elevenlabs_voice_id}" if settings.elevenlabs_api_key else "openai"
    clave = _clave(texto, preferido)

    audio = _cache.get(clave)
    if audio is not None:
        _cache.move_to_end(clave)
        return Response(content=audio, media_type="audio/mpeg", headers={"X-Cache": "hit", "X-Motor": preferido})

    # Imports perezosos: cada cliente valida su clave al construirse, y no
    # queremos que importar el router tumbe el arranque de la API si el
    # despliegue no tiene ninguna de las dos configurada.
    from ..assistant import elevenlabs_client, openai_client

    errores: list[str] = []
    motor_real = preferido

    if elevenlabs_client.disponible():
        try:
            audio = elevenlabs_client.sintetizar_voz(texto)
        except elevenlabs_client.ElevenLabsError as exc:
            logger.warning("ElevenLabs no disponible, se prueba OpenAI: %s", exc)
            errores.append(str(exc))

    if audio is None:
        motor_real = "openai"
        try:
            audio = openai_client.sintetizar_voz(texto)
        except Exception as exc:  # noqa: BLE001 - cualquier fallo degrada igual
            errores.append(str(exc))
            audio = None

    if audio is None:
        logger.warning("Narracion del recorrido no disponible: %s", " | ".join(errores))
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="La narracion no esta disponible; el recorrido seguira con la voz del navegador.",
        )

    # Se cachea bajo la clave del motor que REALMENTE respondió, para que un
    # fallback puntual de ElevenLabs no quede pegado como respuesta futura.
    clave_real = clave if motor_real == preferido else _clave(texto, motor_real)
    _cache[clave_real] = audio
    _cache.move_to_end(clave_real)
    while len(_cache) > _MAX_CACHE:
        _cache.popitem(last=False)

    return Response(content=audio, media_type="audio/mpeg", headers={"X-Cache": "miss", "X-Motor": motor_real})
