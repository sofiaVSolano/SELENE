"""Esquemas Pydantic del asistente de voz."""

from __future__ import annotations

import datetime as dt
import uuid
from typing import Literal

from pydantic import BaseModel, Field


class PreguntaAudioResponse(BaseModel):
    id_consulta: uuid.UUID
    transcripcion: str
    respuesta_texto: str
    respuesta_audio_base64: str = Field(description="Audio MP3 de la respuesta, codificado en base64.")
    tiempo_respuesta: float = Field(description="Segundos totales: transcripcion + generacion de respuesta + voz.")


class PreguntaTextoRequest(BaseModel):
    pregunta: str = Field(min_length=1, max_length=4000)
    con_voz: bool = Field(
        default=False,
        description="Si es true, la respuesta incluye tambien el audio MP3 sintetizado (mismo costo que la via de voz).",
    )


class PreguntaTextoResponse(BaseModel):
    id_consulta: uuid.UUID
    pregunta: str
    respuesta_texto: str
    respuesta_audio_base64: str | None = Field(
        default=None, description="Audio MP3 en base64; solo presente si se pidio con_voz."
    )
    tiempo_respuesta: float


class ConsultaHistorialItem(BaseModel):
    id_consulta: uuid.UUID
    pregunta: str
    respuesta: str | None
    fecha_hora: dt.datetime
    tiempo_respuesta: float | None


class GenerarReporteRequest(BaseModel):
    clave_reporte: Literal["consumo_diario", "consumo_mensual", "plan_ahorro", "general", "detallado"] = "general"
    limite_consultas: int = Field(default=20, ge=1, le=200, description="Cuantos intercambios recientes sintetizar (aplica a clave_reporte='general' o 'detallado').")
    titulo: str | None = None
    instrucciones: str | None = Field(
        default=None,
        max_length=1000,
        description=(
            "Que quiere el usuario que cubra el reporte, en sus propias palabras (solo aplica a "
            "clave_reporte='detallado'; el LLM lo usa para decidir que secciones incluir y con que "
            "profundidad, en vez de seguir una plantilla fija)."
        ),
    )


class TipoReporteSugerido(BaseModel):
    clave: str
    etiqueta: str


class ReporteOut(BaseModel):
    id_reporte: uuid.UUID
    fecha_generacion: dt.datetime
    tipo_reporte: str
    clave_reporte: str | None
    periodo: str
    resumen: str | None
    url_descarga: str
