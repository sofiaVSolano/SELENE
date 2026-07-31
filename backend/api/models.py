"""Modelos SQLAlchemy que mapean el esquema fisico definido en database/schema.sql.

Las tablas y los tipos ENUM ya existen en PostgreSQL (creados por
database/schema.sql, ver backend/scripts/init_db.py); aqui solo se declara el
mapeo objeto-relacional que usa la API. `create_type=False` en cada Enum evita
que SQLAlchemy intente volver a crear un tipo que la base de datos ya tiene.
"""

from __future__ import annotations

import datetime as dt
import uuid

from sqlalchemy import (
    BigInteger,
    Boolean,
    CheckConstraint,
    Computed,
    Date,
    DateTime,
    Enum,
    ForeignKey,
    Interval,
    Numeric,
    SmallInteger,
    Text,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .database import Base

RolUsuario = Enum(
    "administrador", "operador", "analista", "visor",
    name="rol_usuario_enum", create_type=False,
)
TipoLuminaria = Enum(
    "LED", "fluorescente", "sodio", "halogena", "induccion", "otro",
    name="tipo_luminaria_enum", create_type=False,
)
EstadoLuminaria = Enum(
    "encendida", "apagada", "falla", "mantenimiento",
    name="estado_luminaria_enum", create_type=False,
)
EstadoOcupacion = Enum(
    "ocupado", "vacio", name="estado_ocupacion_enum", create_type=False,
)
TipoEvento = Enum(
    "encendido", "apagado", "alerta_ocupacion", "alerta_falla",
    "mantenimiento", "conexion", "desconexion", "cambio_configuracion",
    name="tipo_evento_enum", create_type=False,
)
Prioridad = Enum(
    "baja", "media", "alta", "critica", name="prioridad_enum", create_type=False,
)
TipoReporte = Enum(
    "consumo", "ocupacion", "patrones", "alertas", "general",
    name="tipo_reporte_enum", create_type=False,
)


class Zona(Base):
    __tablename__ = "zonas"

    id_zona: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, server_default=func.gen_random_uuid())
    nombre: Mapped[str] = mapped_column(Text, unique=True, nullable=False)
    edificio: Mapped[str | None] = mapped_column(Text)
    piso: Mapped[str | None] = mapped_column(Text)
    descripcion: Mapped[str | None] = mapped_column(Text)
    tipo_espacio: Mapped[str] = mapped_column(Text, nullable=False, server_default="oficina")
    created_at: Mapped[dt.datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    luminarias: Mapped[list["Luminaria"]] = relationship(back_populates="zona")


class Usuario(Base):
    __tablename__ = "usuarios"

    id_usuario: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, server_default=func.gen_random_uuid())
    nombre: Mapped[str] = mapped_column(Text, nullable=False)
    correo: Mapped[str] = mapped_column(Text, unique=True, nullable=False)
    contrasena_hash: Mapped[str] = mapped_column(Text, nullable=False)
    rol: Mapped[str] = mapped_column(RolUsuario, nullable=False, server_default="visor")
    activo: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="true")
    fecha_registro: Mapped[dt.datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[dt.datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class Luminaria(Base):
    __tablename__ = "luminarias"

    id_luminaria: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, server_default=func.gen_random_uuid())
    nombre: Mapped[str] = mapped_column(Text, nullable=False)
    id_zona: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("zonas.id_zona"), nullable=False)
    tipo: Mapped[str] = mapped_column(TipoLuminaria, nullable=False)
    potencia_w: Mapped[float] = mapped_column(Numeric(6, 2), nullable=False)
    estado_actual: Mapped[str] = mapped_column(EstadoLuminaria, nullable=False, server_default="apagada")
    fecha_instalacion: Mapped[dt.date] = mapped_column(Date, server_default=func.current_date())
    activa: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="true")
    created_at: Mapped[dt.datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[dt.datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (CheckConstraint("potencia_w > 0", name="chk_luminarias_potencia"),)

    zona: Mapped["Zona"] = relationship(back_populates="luminarias")


class DeteccionOcupacion(Base):
    """Una fila por cada deteccion de ocupacion; fecha_hora es el instante
    exacto en que se detecto (o no) una persona en el frame analizado."""

    __tablename__ = "detecciones_ocupacion"

    id_deteccion: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    fecha_hora: Mapped[dt.datetime] = mapped_column(DateTime(timezone=True), primary_key=True, server_default=func.now())
    id_luminaria: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("luminarias.id_luminaria"), nullable=False)
    personas_detectadas: Mapped[int] = mapped_column(SmallInteger, nullable=False, server_default="0")
    confianza: Mapped[float | None] = mapped_column(Numeric(5, 4))
    imagen_referencia: Mapped[str | None] = mapped_column(Text)
    estado_ocupacion: Mapped[str] = mapped_column(EstadoOcupacion, nullable=False)


class Evento(Base):
    __tablename__ = "eventos"

    id_evento: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    id_luminaria: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("luminarias.id_luminaria"), nullable=False)
    id_deteccion_origen: Mapped[int | None] = mapped_column(BigInteger)
    fecha_hora_origen: Mapped[dt.datetime | None] = mapped_column(DateTime(timezone=True))
    fecha_hora: Mapped[dt.datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    tipo_evento: Mapped[str] = mapped_column(TipoEvento, nullable=False)
    descripcion: Mapped[str | None] = mapped_column(Text)


class ConsumoEnergetico(Base):
    """Ciclos de encendido/apagado reales por luminaria (ver
    `energy/vision_bridge.py`): se abre una fila cuando la vision detecta que
    una luminaria pasa a 'encendida' y se cierra (con su duracion y kWh) al
    volver a 'apagada'. Distinta de `ConsumoEnergeticoEstimado`, que es el
    consumo de una ESCENA completa calculado por el modelo LightGBM."""

    __tablename__ = "consumo_energetico"

    id_consumo: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    id_luminaria: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("luminarias.id_luminaria"), nullable=False)
    fecha_hora_inicio: Mapped[dt.datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    fecha_hora_fin: Mapped[dt.datetime | None] = mapped_column(DateTime(timezone=True))
    tiempo_encendida: Mapped[dt.timedelta | None] = mapped_column(
        Interval, Computed("fecha_hora_fin - fecha_hora_inicio")
    )
    energia_consumida_kwh: Mapped[float | None] = mapped_column(Numeric(10, 4))

    __table_args__ = (
        CheckConstraint(
            "fecha_hora_fin IS NULL OR fecha_hora_fin > fecha_hora_inicio",
            name="chk_consumo_rango_fechas",
        ),
    )


class PatronUso(Base):
    """Mapeo minimo: solo lo necesario para que `Recomendacion.id_patron`
    pueda resolver su FK. Ningun router usa todavia patrones_uso completo
    (queda para la etapa de analisis de patrones)."""

    __tablename__ = "patrones_uso"

    id_patron: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, server_default=func.gen_random_uuid())
    id_luminaria: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("luminarias.id_luminaria"), nullable=False)


class Recomendacion(Base):
    """Sugerencia generada por el sistema (p. ej. apagar una luminaria sin
    ocupación) — ver backend/api/routers/alertas.py."""

    __tablename__ = "recomendaciones"

    id_recomendacion: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, server_default=func.gen_random_uuid())
    id_luminaria: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("luminarias.id_luminaria"), nullable=False)
    id_patron: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("patrones_uso.id_patron"))
    fecha_hora: Mapped[dt.datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    recomendacion: Mapped[str] = mapped_column(Text, nullable=False)
    prioridad: Mapped[str] = mapped_column(Prioridad, nullable=False, server_default="media")
    aplicada: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="false")
    fecha_aplicacion: Mapped[dt.datetime | None] = mapped_column(DateTime(timezone=True))


# =====================================================================
# Modulo de prediccion energetica (backend/api/energy/) — ver
# database/DISENO_BASE_DATOS.md seccion "Modulo energetico" para el detalle.
#
# `id_deteccion` en las 4 tablas de abajo es una referencia SUAVE (sin FK, sin
# constraint) a `detecciones_ocupacion.id_deteccion` — mismo patron que
# `Evento.id_deteccion_origen` — porque esa tabla esta particionada y de alta
# frecuencia de escritura; ademas el modulo debe poder generar/persistir un
# reporte energetico standalone (sin una captura de vision asociada todavia).
# =====================================================================


class ConsumoEnergeticoEstimado(Base):
    """Consumo real/estimado/optimizado por escenario analizado. Es un tabla
    distinta de `consumo_energetico` (que mide ciclos encendido/apagado por
    LUMINARIA individual): esta es por ESCENA completa (N luminarias a la
    vez), calculada por el modelo LightGBM + el motor de simulacion."""

    __tablename__ = "consumo_energetico_estimado"

    id_consumo_estimado: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    id_deteccion: Mapped[int | None] = mapped_column(BigInteger)
    consumo_real_kwh: Mapped[float | None] = mapped_column(Numeric(12, 4))
    consumo_estimado_kwh: Mapped[float] = mapped_column(Numeric(12, 4), nullable=False)
    consumo_optimizado_kwh: Mapped[float] = mapped_column(Numeric(12, 4), nullable=False)
    ahorro_kwh: Mapped[float] = mapped_column(Numeric(12, 4), nullable=False)
    ahorro_porcentaje: Mapped[float] = mapped_column(Numeric(6, 2), nullable=False)
    co2_generado_kg: Mapped[float] = mapped_column(Numeric(12, 4), nullable=False)
    co2_evitable_kg: Mapped[float] = mapped_column(Numeric(12, 4), nullable=False)
    intensidad_energetica_kwh_m2: Mapped[float | None] = mapped_column(Numeric(10, 4))
    fecha: Mapped[dt.datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (
        CheckConstraint("consumo_estimado_kwh >= 0", name="chk_consumo_estimado_no_negativo"),
        CheckConstraint("consumo_optimizado_kwh >= 0", name="chk_consumo_optimizado_no_negativo"),
    )


class PrediccionConsumoDB(Base):
    """Cada llamada al modelo LightGBM: variables de entrada crudas y salida,
    para trazabilidad/auditoria de por que se predijo tal consumo."""

    __tablename__ = "predicciones_consumo"

    id_prediccion: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    id_deteccion: Mapped[int | None] = mapped_column(BigInteger)
    modelo_utilizado: Mapped[str] = mapped_column(Text, nullable=False, server_default="LightGBM")
    variables_entrada: Mapped[dict] = mapped_column(JSONB, nullable=False)
    prediccion_kwh: Mapped[float] = mapped_column(Numeric(12, 4), nullable=False)
    tiempo_inferencia_ms: Mapped[float | None] = mapped_column(Numeric(10, 4))
    confianza: Mapped[float | None] = mapped_column(Numeric(5, 4))
    fecha: Mapped[dt.datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class RecomendacionEnergetica(Base):
    """Recomendacion generada por `energy/recommendations.py` (distinta de
    `Recomendacion`, que es la sugerencia generica ligada a una luminaria y a
    patrones de uso — ver `backend/api/routers/alertas.py`)."""

    __tablename__ = "recomendaciones_energeticas"

    id_recomendacion_energetica: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=func.gen_random_uuid()
    )
    id_deteccion: Mapped[int | None] = mapped_column(BigInteger)
    tipo_recomendacion: Mapped[str] = mapped_column(Text, nullable=False)
    descripcion: Mapped[str] = mapped_column(Text, nullable=False)
    ahorro_estimado_kwh: Mapped[float] = mapped_column(Numeric(12, 4), nullable=False)
    ahorro_porcentaje: Mapped[float] = mapped_column(Numeric(6, 2), nullable=False)
    co2_estimado_kg: Mapped[float] = mapped_column(Numeric(12, 4), nullable=False)
    aplicada: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="false")
    fecha: Mapped[dt.datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class Simulacion(Base):
    """Una corrida del motor de simulacion (`energy/simulations.py`): guarda
    el escenario original y el simulado completos (JSONB) para poder
    reconstruir/auditar el calculo despues."""

    __tablename__ = "simulaciones"

    id_simulacion: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    id_deteccion: Mapped[int | None] = mapped_column(BigInteger)
    tipo_simulacion: Mapped[str] = mapped_column(Text, nullable=False)
    escenario_original: Mapped[dict] = mapped_column(JSONB, nullable=False)
    escenario_simulado: Mapped[dict] = mapped_column(JSONB, nullable=False)
    consumo_original_kwh: Mapped[float] = mapped_column(Numeric(12, 4), nullable=False)
    consumo_simulado_kwh: Mapped[float] = mapped_column(Numeric(12, 4), nullable=False)
    ahorro_kwh: Mapped[float] = mapped_column(Numeric(12, 4), nullable=False)
    ahorro_porcentaje: Mapped[float] = mapped_column(Numeric(6, 2), nullable=False)
    fecha: Mapped[dt.datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


# =====================================================================
# Asistente de voz (backend/api/assistant/) — mapea `consultas` y
# `reportes`, ya definidas en database/schema.sql (seccion 10 y 11) pero
# sin ORM propio hasta ahora (el resto de routers no las necesitaba).
# =====================================================================


class Consulta(Base):
    """Un intercambio pregunta/respuesta del asistente de voz (ver
    `api/assistant/`): `pregunta` es la transcripcion de whisper, `respuesta`
    el texto generado por el modelo de chat."""

    __tablename__ = "consultas"

    id_consulta: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, server_default=func.gen_random_uuid())
    id_usuario: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("usuarios.id_usuario", ondelete="CASCADE"), nullable=False)
    pregunta: Mapped[str] = mapped_column(Text, nullable=False)
    respuesta: Mapped[str | None] = mapped_column(Text)
    fecha_hora: Mapped[dt.datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    tiempo_respuesta: Mapped[float | None] = mapped_column(Numeric(8, 3))

    __table_args__ = (CheckConstraint("tiempo_respuesta >= 0", name="chk_consultas_tiempo_respuesta"),)


class Reporte(Base):
    """Documento generado (Markdown/HTML) que sintetiza una conversacion con
    el asistente + los datos energeticos citados (ver `api/assistant/reports.py`)."""

    __tablename__ = "reportes"

    id_reporte: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, server_default=func.gen_random_uuid())
    id_usuario: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("usuarios.id_usuario", ondelete="RESTRICT"), nullable=False)
    fecha_generacion: Mapped[dt.datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    tipo_reporte: Mapped[str] = mapped_column(TipoReporte, nullable=False)
    clave_reporte: Mapped[str | None] = mapped_column(Text)
    periodo: Mapped[str] = mapped_column(Text, nullable=False)
    ruta_archivo: Mapped[str] = mapped_column(Text, nullable=False)
    resumen: Mapped[str | None] = mapped_column(Text)
