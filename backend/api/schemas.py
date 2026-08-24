"""Esquemas Pydantic (request/response) de la API."""

from __future__ import annotations

import datetime as dt
import uuid
from typing import Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field, model_validator

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
    # El frontend decide con esto si lanza el recorrido de bienvenida. Viaja
    # en el login y en /me para que la decision este tomada antes de pintar
    # la primera pantalla, sin una peticion extra.
    onboarding_completado: bool
    fecha_registro: dt.datetime


class NarracionIn(BaseModel):
    """Una frase del recorrido de bienvenida, para leerla en voz alta."""

    texto: str = Field(min_length=1, max_length=600)


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    usuario: UsuarioOut


# --- Luminarias / Zonas -------------------------------------------------------


TipoEspacio = Literal["comedor", "salon", "laboratorio", "auditorio", "oficina"]
TipoLuminaria = Literal["LED", "fluorescente", "sodio", "halogena", "induccion", "otro"]


class ZonaOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id_zona: uuid.UUID
    nombre: str
    tipo_espacio: str


_POTENCIA = Field(
    default=18.0,
    gt=0,
    le=2000,
    description=(
        "Potencia tipica de las luminarias de la sala, en vatios. Es el unico dato del "
        "consumo que declara el usuario: las luminarias las detecta la camara, pero los "
        "vatios no se ven en una imagen. Se propaga a las luminarias de la sala."
    ),
)


class ZonaCreate(BaseModel):
    nombre: str = Field(min_length=2, max_length=100)
    # `tipo_espacio` no es decorativo: alimenta el contexto del modelo
    # energetico (ver configs/energy_context.yaml), asi que la sala tiene que
    # declararlo desde que nace.
    tipo_espacio: TipoEspacio = "oficina"
    potencia_luminaria_w: float = _POTENCIA
    edificio: str | None = Field(default=None, max_length=100)
    piso: str | None = Field(default=None, max_length=50)
    descripcion: str | None = Field(default=None, max_length=500)


class ZonaUpdate(BaseModel):
    """Todo opcional: se aplica solo lo que venga (PATCH, no PUT)."""

    nombre: str | None = Field(default=None, min_length=2, max_length=100)
    tipo_espacio: TipoEspacio | None = None
    potencia_luminaria_w: float | None = Field(default=None, gt=0, le=2000)
    edificio: str | None = Field(default=None, max_length=100)
    piso: str | None = Field(default=None, max_length=50)
    descripcion: str | None = Field(default=None, max_length=500)


class ImpactoBorradoOut(BaseModel):
    """Cuanto historial se lleva por delante borrar una sala."""

    luminarias: int
    detecciones: int
    eventos: int
    registros_consumo: int
    recomendaciones: int


class LuminariaResumen(BaseModel):
    """La luminaria vista DESDE su sala: sin la zona anidada, que seria el
    padre repitiendose dentro de cada hijo."""

    model_config = ConfigDict(from_attributes=True)

    id_luminaria: uuid.UUID
    nombre: str
    tipo: str
    potencia_w: float
    estado_actual: str


class ZonaDetalleOut(ZonaOut):
    """Lo que necesita la pantalla de salas: la sala con sus luminarias dentro."""

    model_config = ConfigDict(from_attributes=True)

    potencia_luminaria_w: float = 18.0
    edificio: str | None = None
    piso: str | None = None
    descripcion: str | None = None
    # Las registra SELENE al monitorear la sala; no se escriben a mano.
    luminarias: list[LuminariaResumen] = []


class LuminariaCreate(BaseModel):
    nombre: str = Field(min_length=2, max_length=150)
    # Dos formas de decir en que sala va, y exactamente una debe venir:
    # `id_zona` la usa la pantalla de salas (la sala ya existe y se eligio);
    # `zona` por nombre es el camino viejo, que crea la sala si no existe y
    # se conserva para no romper a quien ya llamaba asi a la API.
    id_zona: uuid.UUID | None = None
    zona: str | None = Field(default=None, min_length=2, max_length=100)
    tipo_espacio: TipoEspacio = Field(
        default="oficina",
        description="Solo se usa si la zona se crea por nombre; tipo de espacio para el modelo LightGBM (ver configs/energy_context.yaml).",
    )
    tipo: TipoLuminaria = "LED"
    potencia_w: float = Field(gt=0, default=18.0)

    @model_validator(mode="after")
    def _una_sola_sala(self) -> "LuminariaCreate":
        if (self.id_zona is None) == (self.zona is None):
            raise ValueError("Indique la sala con 'id_zona' o con 'zona' (nombre), pero no ambas.")
        return self


class LuminariaUpdate(BaseModel):
    """Todo opcional. `id_zona` permite mover la luminaria de sala."""

    nombre: str | None = Field(default=None, min_length=2, max_length=150)
    id_zona: uuid.UUID | None = None
    tipo: TipoLuminaria | None = None
    potencia_w: float | None = Field(default=None, gt=0)


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
    num_luminarias_encendidas: int = Field(
        default=0,
        ge=0,
        description=(
            "Cuantas de las luminarias detectadas estan emitiendo luz, medido sobre "
            "los pixeles de cada lampara. Es el criterio de derroche cuando la sala "
            "esta vacia; `porcentaje_artificial` no lo es, porque reparte 100 puntos "
            "entre luz natural y artificial y baja al entrar sol aunque la lampara siga encendida."
        ),
    )
    area_ventanas_relativa: float = Field(default=0.0, ge=0, le=1, description="Fraccion del frame ocupada por ventanas (0-1).")
    area_luminarias_relativa: float = Field(default=0.0, ge=0, le=1, description="Fraccion del frame ocupada por luminarias (0-1).")
    brillo_ventanas: float = Field(default=0.0, ge=0, le=255, description="Brillo medio (canal V) de las ventanas detectadas.")
    brillo_luminarias: float = Field(default=0.0, ge=0, le=255, description="Brillo medio (canal V) de las luminarias detectadas.")
    natural_score: float = Field(default=0.0, ge=0, le=1)
    artificial_score: float = Field(default=0.0, ge=0, le=1)
    confianza_max_persona: float = Field(default=0.0, ge=0, le=1)
    # URL para pedir la imagen guardada de este fotograma (`GET
    # /api/deteccion/{id_deteccion}/imagen`, requiere el Bearer token de
    # siempre). None si no habia `id_zona`/`id_luminaria` que anclar, o si la
    # escritura a disco fallo (ver `imagenes.guardar_imagen`).
    imagen_url: str | None = None


# --- Historial de detecciones (galeria del frontend) --------------------------


class DeteccionHistorialItem(BaseModel):
    """Una fila de la galería de Historial · Capturas. Es el mismo snapshot
    que antes vivía solo en `localStorage` (`lib/almacen.js` del frontend,
    función `resumirCaptura`), ahora servido desde la base de datos."""

    model_config = ConfigDict(from_attributes=True)

    id_deteccion: int
    fecha_hora: dt.datetime
    id_zona: uuid.UUID | None = None
    zona: str | None = None
    personas_detectadas: int
    estado_ocupacion: str
    num_ventanas: int
    num_luminarias: int
    num_luminarias_encendidas: int
    porcentaje_natural: float
    porcentaje_artificial: float
    natural_score: float
    artificial_score: float
    consumo_estimado_kwh: float | None
    ahorro_estimado_kwh: float | None
    recomendacion: str | None
    confianza: float | None
    imagen_url: str | None = None


class ImpactoBorradoHistorialOut(BaseModel):
    """Cuántas detecciones se verían afectadas por un borrado masivo — mismo
    espíritu que `ImpactoBorradoOut` en zonas.py: una confirmación con número,
    no una advertencia genérica."""

    detecciones: int


# --- Alertas / recomendaciones ------------------------------------------------


class AlertaOcupacionLuzCreate(BaseModel):
    # Se monitorea una sala, asi que la alerta llega con `id_zona` y el router
    # la ancla a una luminaria de esa sala. `id_luminaria` se conserva para
    # quien ya llamaba asi a la API.
    id_zona: uuid.UUID | None = None
    id_luminaria: uuid.UUID | None = None
    segundos_sin_ocupacion: int = Field(ge=1, le=86400)
    porcentaje_artificial: float = Field(ge=0, le=100)
    # Cuantas luminarias vio encendidas SELENE al disparar la alerta: es el
    # motivo del aviso y lo que dice el mensaje. El default de 1 no inventa
    # nada — una alerta solo se reporta habiendo visto al menos una encendida,
    # asi que es el piso verdadero si un cliente viejo no manda el campo.
    luminarias_encendidas: int = Field(default=1, ge=1, le=999)
    # Detección cuyo fotograma disparó la alerta: la alerta reutiliza esa
    # imagen (`Recomendacion.id_deteccion_origen`) en vez de que el frontend
    # suba una copia aparte. Opcional por compatibilidad con quien ya llamaba
    # a este endpoint sin mandarlo.
    id_deteccion: int | None = None

    @model_validator(mode="after")
    def _una_referencia(self) -> "AlertaOcupacionLuzCreate":
        if self.id_zona is None and self.id_luminaria is None:
            raise ValueError("Indique la sala con 'id_zona' o la luminaria con 'id_luminaria'.")
        return self


class AlertaOcupacionLuzOut(BaseModel):
    id_evento: int
    id_recomendacion: uuid.UUID
    mensaje: str
    prioridad: str
    fecha_hora: dt.datetime


class AlertaHistorialItem(BaseModel):
    """Una fila de la galería de Historial · Alertas, enriquecida con la sala,
    la luminaria y la imagen de la detección que la disparó."""

    id_recomendacion: uuid.UUID
    id_evento: int | None = None
    fecha_hora: dt.datetime
    mensaje: str
    prioridad: str
    aplicada: bool
    zona: str | None = None
    id_zona: uuid.UUID | None = None
    luminaria: str | None = None
    segundos_sin_ocupacion: int | None = None
    porcentaje_artificial: float | None = None
    luminarias_visibles: int | None = None
    luminarias_encendidas: int | None = None
    imagen_url: str | None = None


class RecomendacionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id_recomendacion: uuid.UUID
    recomendacion: str
    prioridad: str
    aplicada: bool
    fecha_hora: dt.datetime
