"""Orquesta un turno de conversacion: audio -> transcripcion -> respuesta
(anclada en el contexto de `api.energy`) -> voz, y persiste el intercambio en
`consultas`."""

from __future__ import annotations

import base64
import time
import uuid

from sqlalchemy.orm import Session

from .. import models
from . import context_builder, openai_client
from .schemas import PreguntaAudioResponse


def procesar_pregunta_audio(
    db: Session,
    id_usuario: uuid.UUID,
    audio_bytes: bytes,
    filename: str,
    content_type: str,
) -> PreguntaAudioResponse:
    inicio = time.perf_counter()

    transcripcion = openai_client.transcribir_audio(audio_bytes, filename, content_type)
    if not transcripcion:
        raise ValueError("No se pudo transcribir el audio: el clip llego vacio o sin voz reconocible.")

    mensajes = context_builder.construir_mensajes(db, id_usuario, transcripcion)
    respuesta_texto = openai_client.generar_respuesta_chat(mensajes)
    audio_respuesta = openai_client.sintetizar_voz(respuesta_texto)

    tiempo_respuesta = round(time.perf_counter() - inicio, 3)

    consulta = models.Consulta(
        id_usuario=id_usuario,
        pregunta=transcripcion,
        respuesta=respuesta_texto,
        tiempo_respuesta=tiempo_respuesta,
    )
    db.add(consulta)
    db.commit()
    db.refresh(consulta)

    return PreguntaAudioResponse(
        id_consulta=consulta.id_consulta,
        transcripcion=transcripcion,
        respuesta_texto=respuesta_texto,
        respuesta_audio_base64=base64.b64encode(audio_respuesta).decode("ascii"),
        tiempo_respuesta=tiempo_respuesta,
    )
