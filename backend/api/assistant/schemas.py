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


class ConsultaHistorialItem(BaseModel):
    id_consulta: uuid.UUID
    pregunta: str
    respuesta: str | None
    fecha_hora: dt.datetime
    tiempo_respuesta: float | None


class GenerarReporteRequest(BaseModel):
    clave_reporte: Literal["consumo_diario", "consumo_mensual", "plan_ahorro", "general"] = "general"
    limite_consultas: int = Field(default=20, ge=1, le=200, description="Cuantos intercambios recientes sintetizar (solo aplica a clave_reporte='general').")
    titulo: str | None = None


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
