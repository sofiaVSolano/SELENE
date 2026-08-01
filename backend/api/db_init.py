"""Aplica database/schema.sql sobre el archivo SQLite de `settings.database_url`.

Usa `sqlite3` (stdlib) directo, no el motor de SQLAlchemy: aplicar un script
con multiples sentencias DDL es exactamente para lo que sirve
`sqlite3.Connection.executescript()`, y separar esto del pool de conexiones
que usa el resto de la app evita mezclar una inicializacion de una sola vez
con conexiones de vida larga.

Idempotente de verdad, no "atrapa el error y sigue" como hacia la version
para Postgres (`_ALREADY_EXISTS_SQLSTATES`): cada `CREATE TABLE`/`CREATE
INDEX` en schema.sql lleva `IF NOT EXISTS`, asi que volver a aplicar el
script sobre una base ya inicializada simplemente no hace nada.

Se llama tanto desde aqui (uso manual, `python scripts/init_db.py`) como
desde el startup de FastAPI (`main.py`): con Postgres hacia falta un
contenedor `db-init` aparte porque el servidor tardaba en levantar; un
archivo SQLite no tiene ese problema, asi que la propia API puede
asegurarse de que el esquema exista antes de atender la primera peticion.
"""

from __future__ import annotations

import logging
import sqlite3
from pathlib import Path

from .config import settings

logger = logging.getLogger("api.db_init")

SCHEMA_PATH = settings.project_root / "database" / "schema.sql"


def _ruta_sqlite() -> Path:
    """Extrae la ruta de archivo de una URL `sqlite:///...` (relativa) o
    `sqlite:////...` (absoluta en Unix) o `sqlite:///C:/...` (Windows)."""
    sin_esquema = settings.database_url.removeprefix("sqlite:///")
    return Path(sin_esquema)


def aplicar_schema() -> None:
    if not settings.database_url.startswith("sqlite"):
        logger.info(
            "DATABASE_URL no es SQLite (%s); se omite la inicializacion automatica del esquema.",
            settings.database_url,
        )
        return

    if not SCHEMA_PATH.exists():
        raise FileNotFoundError(f"No se encontro {SCHEMA_PATH}")

    ruta_db = _ruta_sqlite()
    ruta_db.parent.mkdir(parents=True, exist_ok=True)
    sql = SCHEMA_PATH.read_text(encoding="utf-8")

    logger.info("Aplicando %s sobre %s ...", SCHEMA_PATH, ruta_db)
    conn = sqlite3.connect(str(ruta_db))
    try:
        conn.executescript(sql)
        conn.commit()
    finally:
        conn.close()
    logger.info("Esquema listo (%s).", ruta_db)
