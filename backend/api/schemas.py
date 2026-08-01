"""Esquemas Pydantic (request/response) de la API."""

from __future__ import annotations

import datetime as dt
import uuid
from typing import Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field

# --- Auth / Usuarios ---------------------------------------------------------


class UsuarioRegister(BaseModel):
    nombre: str = Field(min_length=2, max_length=150)
    correo: EmailStr
    contrasena: str = Field(min_length=8, max_length=128)


class UsuarioLogin(BaseModel):
    correo: EmailStr
    contrasena: str


class UsuarioOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id_usuario: uuid.UUID
    nombre: str
    correo: str
    rol: str
    fecha_registro: dt.datetime


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    usuario: UsuarioOut


# --- Luminarias / Zonas -------------------------------------------------------


class ZonaOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id_zona: uuid.UUID
    nombre: str
    tipo_espacio: str


class LuminariaCreate(BaseModel):
    nombre: str = Field(min_length=2, max_length=150)
    zona: str = Field(min_length=2, max_length=100, description="Nombre de la zona; se crea si no existe.")
    tipo_espacio: Literal["comedor", "salon", "laboratorio", "auditorio", "oficina"] = Field(
        default="oficina",
        description="Solo se usa si la zona no existe todavia; tipo de espacio para el modelo LightGBM (ver configs/energy_context.yaml).",
    )
    tipo: str = Field(default="LED")
    potencia_w: float = Field(gt=0, default=18.0)


class LuminariaOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id_luminaria: uuid.UUID
    nombre: str
    tipo: str
    potencia_w: float
    estado_actual: str
    zona: ZonaOut


# --- Deteccion en tiempo real --------------------------------------------------


class BoundingBox(BaseModel):
    x1: float
    y1: float
    x2: float
    y2: float


class DetectionItem(BaseModel):
    clase: str
    confianza: float
    bbox: BoundingBox


class FrameAnalysisResponse(BaseModel):
    fecha_hora: dt.datetime
    personas: list[DetectionItem]
    personas_detectadas: int
    estado_ocupacion: str
    elementos_iluminacion: list[DetectionItem]
    porcentaje_natural: float
    porcentaje_artificial: float
    brillo_escena: float
    tipo_iluminacion: str
    recomendacion: str
    id_deteccion: int | None = None
    consumo_estimado_kwh: float | None = Field(
        default=None, description="Consumo estimado por LightGBM para el tramo real transcurrido desde el frame anterior (None si no se pudo calcular)."
    )
    ahorro_estimado_kwh: float | None = Field(default=None, description="Ahorro potencial estimado para ese mismo tramo, segun la mejor simulacion aplicable.")

    # --- Metricas que `lightingAnalyzer` ya calcula por frame -------------------
    # Estaban disponibles en `detection_service.analyze_frame()` pero solo se
    # usaban internamente para armar el EscenarioVision del modulo energetico.
    # Se exponen aqui (todos opcionales, cambio aditivo) porque el Centro de
    # Monitoreo las muestra por elemento: area ocupada, intensidad y scores.
    num_ventanas: int = 0
    num_luminarias: int = 0
    area_ventanas_relativa: float = Field(default=0.0, ge=0, le=1, description="Fraccion del frame ocupada por ventanas (0-1).")
    area_luminarias_relativa: float = Field(default=0.0, ge=0, le=1, description="Fraccion del frame ocupada por luminarias (0-1).")
    brillo_ventanas: float = Field(default=0.0, ge=0, le=255, description="Brillo medio (canal V) de las ventanas detectadas.")
    brillo_luminarias: float = Field(default=0.0, ge=0, le=255, description="Brillo medio (canal V) de las luminarias detectadas.")
    natural_score: float = Field(default=0.0, ge=0, le=1)
    artificial_score: float = Field(default=0.0, ge=0, le=1)
    confianza_max_persona: float = Field(default=0.0, ge=0, le=1)


# --- Alertas / recomendaciones ------------------------------------------------


class AlertaOcupacionLuzCreate(BaseModel):
    id_luminaria: uuid.UUID
    segundos_sin_ocupacion: int = Field(ge=1, le=86400)
    porcentaje_artificial: float = Field(ge=0, le=100)


class AlertaOcupacionLuzOut(BaseModel):
    id_evento: int
    id_recomendacion: uuid.UUID
    mensaje: str
    prioridad: str
    fecha_hora: dt.datetime


class RecomendacionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id_recomendacion: uuid.UUID
    recomendacion: str
    prioridad: str
    aplicada: bool
    fecha_hora: dt.datetime
