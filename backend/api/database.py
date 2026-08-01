"""Motor y sesion de SQLAlchemy contra SQLite (esquema definido en database/schema.sql).

Antes de esto el proyecto usaba PostgreSQL con un servidor aparte; SQLite es
un archivo, y este modulo asume eso: la conexion se abre contra un `.db`
local (ver `settings.database_url`), sin servidor que "esperar" a que
levante.
"""

from __future__ import annotations

import datetime as dt
from collections.abc import Generator

from sqlalchemy import create_engine, event
from sqlalchemy.engine import Dialect
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker
from sqlalchemy.types import DateTime, TypeDecorator

from .config import settings

_es_sqlite = settings.database_url.startswith("sqlite")

engine = create_engine(
    settings.database_url,
    pool_pre_ping=True,
    future=True,
    # SQLite: cada conexion vive en su propio hilo por defecto, pero FastAPI
    # puede atender una misma sesion desde hilos distintos (endpoints sync
    # corridos en el threadpool de Starlette). SQLAlchemy ya serializa el
    # acceso via el pool, asi que desactivar el chequeo es seguro aqui.
    connect_args={"check_same_thread": False} if _es_sqlite else {},
)

if _es_sqlite:

    @event.listens_for(engine, "connect")
    def _activar_foreign_keys(conexion_dbapi, _registro) -> None:
        """SQLite ignora las FK declaradas en el esquema (ON DELETE CASCADE
        / RESTRICT) a menos que se lo pida explicitamente por conexion --
        a diferencia de Postgres, donde siempre estan activas. Sin este
        PRAGMA, borrar un usuario o una luminaria NO arrastraria sus filas
        dependientes (consultas, detecciones, eventos...): quedarian huerfanas
        en silencio, sin que ninguna excepcion avise del problema."""
        cursor = conexion_dbapi.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()


SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, future=True)


class Base(DeclarativeBase):
    pass


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


class UTCDateTime(TypeDecorator):
    """`DateTime` que siempre entra y sale en UTC *aware*, sin importar el
    dialecto.

    Por que existe: SQLite no tiene un tipo timestamp-con-zona-horaria (a
    diferencia de TIMESTAMPTZ en Postgres). El `DateTime` generico de
    SQLAlchemy sobre SQLite guarda texto ISO y, al leerlo, devuelve un
    `datetime` *naive* -- pero esta aplicacion compara timestamps con
    `dt.datetime.now(dt.timezone.utc)` por todos lados (ver
    `energy/historical.py`, `context_builder.py`, `reports.py`), y Python
    lanza `TypeError` al comparar un datetime aware contra uno naive. Este
    tipo cierra esa brecha: al guardar, si el valor es aware lo convierte a
    UTC y lo guarda naive (SQLite no tiene donde poner el offset); al leer,
    reatacha `tzinfo=UTC` siempre, porque todo lo que pasa por aqui SE
    GARANTIZA que ya esta en UTC (todos los timestamps de esta app se
    generan con `dt.datetime.now(dt.timezone.utc)`, nunca con hora local)."""

    impl = DateTime
    cache_ok = True

    def process_bind_param(self, value: dt.datetime | None, dialect: Dialect) -> dt.datetime | None:
        if value is None:
            return None
        if value.tzinfo is not None:
            value = value.astimezone(dt.timezone.utc).replace(tzinfo=None)
        return value

    def process_result_value(self, value: dt.datetime | None, dialect: Dialect) -> dt.datetime | None:
        if value is None:
            return None
        if value.tzinfo is None:
            value = value.replace(tzinfo=dt.timezone.utc)
        return value
