"""Modelos SQLAlchemy que mapean el esquema fisico definido en database/schema.sql.

Las tablas ya existen en SQLite (creadas por database/schema.sql, ver
backend/scripts/init_db.py); aqui solo se declara el mapeo objeto-relacional
que usa la API.

Migrado desde PostgreSQL: los cambios de fondo frente a la version anterior
son los que exige SQLite, no un cambio de gusto --
  - `Uuid(as_uuid=True)` en vez de `sqlalchemy.dialects.postgresql.UUID`: es
    el tipo generico de SQLAlchemy 2.0, se guarda como TEXT en SQLite pero
    se sigue leyendo/escribiendo como `uuid.UUID` en Python, asi que ningun
    router/servicio que ya trataba estos campos como UUID tuvo que cambiar.
  - `default=uuid.uuid4` en vez de `server_default=func.gen_random_uuid()`:
    SQLite no tiene una funcion de generacion de UUID a nivel de base de
    datos: el id se genera en Python al construir el objeto, antes del INSERT.
  - `UTCDateTime` (ver `database.py`) en vez de `DateTime(timezone=True)`:
    SQLite no tiene tipo timestamp-con-zona-horaria; este wrapper garantiza
    que todo timestamp se guarde y se lea en UTC *aware*, para no romper las
    comparaciones con `dt.datetime.now(dt.timezone.utc)` que usa el resto
    del backend (`energy/historical.py`, `assistant/reports.py`, etc.).
  - `JSON` en vez de `JSONB`: SQLite no tiene JSONB; el tipo generico de
    SQLAlchemy serializa/deserializa igual en ambos lados, sin que el codigo
    que ya hacia `.get(...)` sobre estos campos (ver `energy/historical.py`)
    necesite cambiar.
  - `DeteccionOcupacion` ya no tiene PK compuesta (id_deteccion, fecha_hora):
    esa composicion existia solo porque Postgres particionaba la tabla por
    rango de fecha_hora; sin particionado, un unico id autoincremental basta.
  - Se quito `ConsumoEnergetico.tiempo_encendida` (columna generada tipo
    INTERVAL, que SQLite no tiene): se confirmo que ningun router la lee,
    `energy/vision_bridge.py` calcula la duracion en Python.
"""

from __future__ import annotations

import datetime as dt
import uuid

from sqlalchemy import (
    JSON,
    BigInteger,
    Boolean,
    CheckConstraint,
    Date,
    Enum,
    ForeignKey,
    Numeric,
    SmallInteger,
    Text,
    Uuid,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .database import Base, UTCDateTime

_ahora_utc = lambda: dt.datetime.now(dt.timezone.utc)  # noqa: E731 - default reusado en cada tabla

RolUsuario = Enum("administrador", "operador", "analista", "visor", name="rol_usuario_enum")
TipoLuminaria = Enum("LED", "fluorescente", "sodio", "halogena", "induccion", "otro", name="tipo_luminaria_enum")
EstadoLuminaria = Enum("encendida", "apagada", "falla", "mantenimiento", name="estado_luminaria_enum")
EstadoOcupacion = Enum("ocupado", "vacio", name="estado_ocupacion_enum")
TipoEvento = Enum(
    "encendido", "apagado", "alerta_ocupacion", "alerta_falla",
    "mantenimiento", "conexion", "desconexion", "cambio_configuracion",
    name="tipo_evento_enum",
)
Prioridad = Enum("baja", "media", "alta", "critica", name="prioridad_enum")
TipoReporte = Enum("consumo", "ocupacion", "patrones", "alertas", "general", name="tipo_reporte_enum")


class Zona(Base):
    __tablename__ = "zonas"

    id_zona: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    nombre: Mapped[str] = mapped_column(Text, unique=True, nullable=False)
    edificio: Mapped[str | None] = mapped_column(Text)
    piso: Mapped[str | None] = mapped_column(Text)
    descripcion: Mapped[str | None] = mapped_column(Text)
    tipo_espacio: Mapped[str] = mapped_column(Text, nullable=False, server_default="oficina")
    # Ver el comentario del mismo campo en database/schema.sql: los vatios no
    # se detectan con una camara, asi que se declaran por sala.
    potencia_luminaria_w: Mapped[float] = mapped_column(Numeric(6, 2), nullable=False, server_default="18.0")
    created_at: Mapped[dt.datetime] = mapped_column(UTCDateTime, default=_ahora_utc)

    luminarias: Mapped[list["Luminaria"]] = relationship(back_populates="zona")


class Usuario(Base):
    __tablename__ = "usuarios"

    id_usuario: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    nombre: Mapped[str] = mapped_column(Text, nullable=False)
    correo: Mapped[str] = mapped_column(Text, unique=True, nullable=False)
    contrasena_hash: Mapped[str] = mapped_column(Text, nullable=False)
    rol: Mapped[str] = mapped_column(RolUsuario, nullable=False, server_default="visor")
    activo: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="1")
    # Recorrido de bienvenida ya hecho. Se marca una sola vez, al terminarlo o
    # al saltarlo: a partir de ahi el bombillo solo aparece si lo llaman.
    onboarding_completado: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="0")
    fecha_registro: Mapped[dt.datetime] = mapped_column(UTCDateTime, default=_ahora_utc)
    # `onupdate` reemplaza el trigger `trg_usuarios_updated_at` de la version
    # Postgres: SQLite no tiene funciones PL/pgSQL, asi que esto se resuelve
    # en el ORM en vez de en la base de datos. Cubre el 100% de los casos
    # porque ningun router hace UPDATE por SQL crudo, todos pasan por aqui.
    updated_at: Mapped[dt.datetime] = mapped_column(UTCDateTime, default=_ahora_utc, onupdate=_ahora_utc)


class Luminaria(Base):
    __tablename__ = "luminarias"

    id_luminaria: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    nombre: Mapped[str] = mapped_column(Text, nullable=False)
    id_zona: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), ForeignKey("zonas.id_zona"), nullable=False)
    tipo: Mapped[str] = mapped_column(TipoLuminaria, nullable=False)
    potencia_w: Mapped[float] = mapped_column(Numeric(6, 2), nullable=False)
    estado_actual: Mapped[str] = mapped_column(EstadoLuminaria, nullable=False, server_default="apagada")
    fecha_instalacion: Mapped[dt.date] = mapped_column(Date, default=dt.date.today)
    activa: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="1")
    created_at: Mapped[dt.datetime] = mapped_column(UTCDateTime, default=_ahora_utc)
    updated_at: Mapped[dt.datetime] = mapped_column(UTCDateTime, default=_ahora_utc, onupdate=_ahora_utc)

    __table_args__ = (CheckConstraint("potencia_w > 0", name="chk_luminarias_potencia"),)

    zona: Mapped["Zona"] = relationship(back_populates="luminarias")


class DeteccionOcupacion(Base):
    """Una fila por cada deteccion de ocupacion; fecha_hora es el instante
    exacto en que se detecto (o no) una persona en el frame analizado.

    PK simple (antes compuesta con fecha_hora): esa composicion solo existia
    para que Postgres pudiera particionar la tabla por rango de fecha; sin
    particionado, un id autoincremental es suficiente y mas simple."""

    __tablename__ = "detecciones_ocupacion"

    id_deteccion: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    fecha_hora: Mapped[dt.datetime] = mapped_column(UTCDateTime, default=_ahora_utc)
    id_luminaria: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), ForeignKey("luminarias.id_luminaria"), nullable=False)
    # La sala se sella AQUI, con la que estaba activa al capturar (igual que
    # hacia `resumirCaptura` en el `localStorage` del frontend, ver
    # `historial-por-sala-selene`): no se deduce despues via `luminaria.zona`
    # porque una luminaria podria, en teoria, cambiar de sala entre la captura
    # y la consulta, y eso reescribiria la procedencia de historial ya tomado.
    id_zona: Mapped[uuid.UUID | None] = mapped_column(Uuid(as_uuid=True), ForeignKey("zonas.id_zona"))
    personas_detectadas: Mapped[int] = mapped_column(SmallInteger, nullable=False, server_default="0")
    confianza: Mapped[float | None] = mapped_column(Numeric(5, 4))
    # Ruta relativa (dentro de `settings.project_root`) al JPEG en disco, no
    # una URL: la URL publica se arma en el router con `request.url_for(...)`
    # segun donde este corriendo la API. Ver `api/imagenes.py`.
    imagen_referencia: Mapped[str | None] = mapped_column(Text)
    estado_ocupacion: Mapped[str] = mapped_column(EstadoOcupacion, nullable=False)

    # --- Snapshot del analisis completo de este fotograma -------------------
    # Antes solo vivian en la respuesta HTTP de `POST /api/deteccion/frame` y
    # de ahi pasaban a `localStorage` (`lib/almacen.js` del frontend). Se
    # persisten aqui para que el historial sea del servidor, no del navegador:
    # sobrevive a "borrar datos de navegacion", es el mismo en cualquier
    # dispositivo, y no tiene el tope de 60 capturas que tenia localStorage.
    num_ventanas: Mapped[int] = mapped_column(SmallInteger, nullable=False, server_default="0")
    num_luminarias: Mapped[int] = mapped_column(SmallInteger, nullable=False, server_default="0")
    num_luminarias_encendidas: Mapped[int] = mapped_column(SmallInteger, nullable=False, server_default="0")
    porcentaje_natural: Mapped[float] = mapped_column(Numeric(5, 2), nullable=False, server_default="0")
    porcentaje_artificial: Mapped[float] = mapped_column(Numeric(5, 2), nullable=False, server_default="0")
    natural_score: Mapped[float] = mapped_column(Numeric(5, 4), nullable=False, server_default="0")
    artificial_score: Mapped[float] = mapped_column(Numeric(5, 4), nullable=False, server_default="0")
    consumo_estimado_kwh: Mapped[float | None] = mapped_column(Numeric(12, 6))
    ahorro_estimado_kwh: Mapped[float | None] = mapped_column(Numeric(12, 6))
    recomendacion: Mapped[str | None] = mapped_column(Text)


class Evento(Base):
    __tablename__ = "eventos"

    id_evento: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    id_luminaria: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), ForeignKey("luminarias.id_luminaria"), nullable=False)
    id_deteccion_origen: Mapped[int | None] = mapped_column(BigInteger)
    fecha_hora_origen: Mapped[dt.datetime | None] = mapped_column(UTCDateTime)
    fecha_hora: Mapped[dt.datetime] = mapped_column(UTCDateTime, default=_ahora_utc)
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
    id_luminaria: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), ForeignKey("luminarias.id_luminaria"), nullable=False)
    fecha_hora_inicio: Mapped[dt.datetime] = mapped_column(UTCDateTime, nullable=False)
    fecha_hora_fin: Mapped[dt.datetime | None] = mapped_column(UTCDateTime)
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

    id_patron: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    id_luminaria: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), ForeignKey("luminarias.id_luminaria"), nullable=False)


class Recomendacion(Base):
    """Sugerencia generada por el sistema (p. ej. apagar una luminaria sin
    ocupación) — ver backend/api/routers/alertas.py."""

    __tablename__ = "recomendaciones"

    id_recomendacion: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    id_luminaria: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), ForeignKey("luminarias.id_luminaria"), nullable=False)
    id_patron: Mapped[uuid.UUID | None] = mapped_column(Uuid(as_uuid=True), ForeignKey("patrones_uso.id_patron"))
    # Sala activa cuando se disparó la alerta, sellada aquí y no deducida de
    # `luminaria.id_zona` — esa luminaria se puede reasignar de sala después
    # (ver `editar_luminaria`), y eso reescribiría a qué sala perteneció esta
    # alerta ya ocurrida.
    id_zona: Mapped[uuid.UUID | None] = mapped_column(Uuid(as_uuid=True), ForeignKey("zonas.id_zona"))
    # Detección cuyo fotograma disparó esta alerta (ver
    # `routers/alertas.py`): así la alerta reutiliza la imagen ya guardada en
    # `detecciones_ocupacion.imagen_referencia` en vez de duplicarla. Sin FK
    # real (igual que `eventos.id_deteccion_origen`): al borrar la detección
    # de origen, el router de deteccion pone esto en NULL a mano — la alerta
    # y su mensaje se conservan, solo pierde la imagen asociada.
    id_deteccion_origen: Mapped[int | None] = mapped_column(BigInteger)
    # Cuánto llevaba la sala vacía al disparar la alerta: es un dato DE LA
    # ALERTA, no de la detección de origen (esa solo describe el fotograma),
    # así que no se puede sacar del join con `detecciones_ocupacion`.
    segundos_sin_ocupacion: Mapped[int | None] = mapped_column(SmallInteger)
    fecha_hora: Mapped[dt.datetime] = mapped_column(UTCDateTime, default=_ahora_utc)
    recomendacion: Mapped[str] = mapped_column(Text, nullable=False)
    prioridad: Mapped[str] = mapped_column(Prioridad, nullable=False, server_default="media")
    aplicada: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="0")
    fecha_aplicacion: Mapped[dt.datetime | None] = mapped_column(UTCDateTime)


# =====================================================================
# Modulo de prediccion energetica (backend/api/energy/) — ver
# database/DISENO_BASE_DATOS.md seccion "Modulo energetico" para el detalle.
#
# `id_deteccion` en las 4 tablas de abajo es una referencia SUAVE (sin FK, sin
# constraint) a `detecciones_ocupacion.id_deteccion` — mismo patron que
# `Evento.id_deteccion_origen` — porque esa tabla es de alta frecuencia de
# escritura; ademas el modulo debe poder generar/persistir un reporte
# energetico standalone (sin una captura de vision asociada todavia).
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
    fecha: Mapped[dt.datetime] = mapped_column(UTCDateTime, default=_ahora_utc)

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
    variables_entrada: Mapped[dict] = mapped_column(JSON, nullable=False)
    prediccion_kwh: Mapped[float] = mapped_column(Numeric(12, 4), nullable=False)
    tiempo_inferencia_ms: Mapped[float | None] = mapped_column(Numeric(10, 4))
    confianza: Mapped[float | None] = mapped_column(Numeric(5, 4))
    fecha: Mapped[dt.datetime] = mapped_column(UTCDateTime, default=_ahora_utc)


class RecomendacionEnergetica(Base):
    """Recomendacion generada por `energy/recommendations.py` (distinta de
    `Recomendacion`, que es la sugerencia generica ligada a una luminaria y a
    patrones de uso — ver `backend/api/routers/alertas.py`)."""

    __tablename__ = "recomendaciones_energeticas"

    id_recomendacion_energetica: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    id_deteccion: Mapped[int | None] = mapped_column(BigInteger)
    tipo_recomendacion: Mapped[str] = mapped_column(Text, nullable=False)
    descripcion: Mapped[str] = mapped_column(Text, nullable=False)
    ahorro_estimado_kwh: Mapped[float] = mapped_column(Numeric(12, 4), nullable=False)
    ahorro_porcentaje: Mapped[float] = mapped_column(Numeric(6, 2), nullable=False)
    co2_estimado_kg: Mapped[float] = mapped_column(Numeric(12, 4), nullable=False)
    aplicada: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="0")
    fecha: Mapped[dt.datetime] = mapped_column(UTCDateTime, default=_ahora_utc)


class Simulacion(Base):
    """Una corrida del motor de simulacion (`energy/simulations.py`): guarda
    el escenario original y el simulado completos (JSON) para poder
    reconstruir/auditar el calculo despues."""

    __tablename__ = "simulaciones"

    id_simulacion: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    id_deteccion: Mapped[int | None] = mapped_column(BigInteger)
    tipo_simulacion: Mapped[str] = mapped_column(Text, nullable=False)
    escenario_original: Mapped[dict] = mapped_column(JSON, nullable=False)
    escenario_simulado: Mapped[dict] = mapped_column(JSON, nullable=False)
    consumo_original_kwh: Mapped[float] = mapped_column(Numeric(12, 4), nullable=False)
    consumo_simulado_kwh: Mapped[float] = mapped_column(Numeric(12, 4), nullable=False)
    ahorro_kwh: Mapped[float] = mapped_column(Numeric(12, 4), nullable=False)
    ahorro_porcentaje: Mapped[float] = mapped_column(Numeric(6, 2), nullable=False)
    fecha: Mapped[dt.datetime] = mapped_column(UTCDateTime, default=_ahora_utc)


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

    id_consulta: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    id_usuario: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), ForeignKey("usuarios.id_usuario", ondelete="CASCADE"), nullable=False)
    pregunta: Mapped[str] = mapped_column(Text, nullable=False)
    respuesta: Mapped[str | None] = mapped_column(Text)
    fecha_hora: Mapped[dt.datetime] = mapped_column(UTCDateTime, default=_ahora_utc)
    tiempo_respuesta: Mapped[float | None] = mapped_column(Numeric(8, 3))

    __table_args__ = (CheckConstraint("tiempo_respuesta >= 0", name="chk_consultas_tiempo_respuesta"),)


class Reporte(Base):
    """Documento generado (Markdown/HTML) que sintetiza una conversacion con
    el asistente + los datos energeticos citados (ver `api/assistant/reports.py`)."""

    __tablename__ = "reportes"

    id_reporte: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    id_usuario: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), ForeignKey("usuarios.id_usuario", ondelete="RESTRICT"), nullable=False)
    fecha_generacion: Mapped[dt.datetime] = mapped_column(UTCDateTime, default=_ahora_utc)
    tipo_reporte: Mapped[str] = mapped_column(TipoReporte, nullable=False)
    clave_reporte: Mapped[str | None] = mapped_column(Text)
    periodo: Mapped[str] = mapped_column(Text, nullable=False)
    ruta_archivo: Mapped[str] = mapped_column(Text, nullable=False)
    resumen: Mapped[str | None] = mapped_column(Text)
