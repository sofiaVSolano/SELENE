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

# Cuenta de prueba que se ofrece en el login (ver DemoCredentials.jsx en el
# frontend) para quien quiera entrar sin registrarse. Mismas credenciales en
# ambos lados a proposito: el frontend solo las muestra, quien las hace
# validas de verdad es `sembrar_usuario_demo()`.
DEMO_CORREO = "invitado@selene.app"
DEMO_CONTRASENA = "SeleneInvitado26"


def _ruta_sqlite() -> Path:
    """Extrae la ruta de archivo de una URL `sqlite:///...` (relativa) o
    `sqlite:////...` (absoluta en Unix) o `sqlite:///C:/...` (Windows)."""
    sin_esquema = settings.database_url.removeprefix("sqlite:///")
    return Path(sin_esquema)


# Columnas agregadas despues de que la base ya existia en algun equipo. Un
# `CREATE TABLE IF NOT EXISTS` no altera una tabla existente, asi que sin esto
# el esquema nuevo solo llegaria a las bases creadas desde cero.
# (tabla, columna, DDL del ALTER)
_COLUMNAS_NUEVAS: tuple[tuple[str, str, str], ...] = (
    (
        "usuarios",
        "onboarding_completado",
        "ALTER TABLE usuarios ADD COLUMN onboarding_completado INTEGER NOT NULL DEFAULT 0",
    ),
)


def _migrar_columnas(conn: sqlite3.Connection) -> None:
    """Agrega columnas que falten en bases ya creadas. Idempotente: consulta
    `PRAGMA table_info` antes de tocar nada, asi que arrancar el servidor mil
    veces no hace mil ALTER ni rompe si la columna ya esta.

    Nota sobre el DEFAULT 0: las cuentas que YA existian quedan marcadas como
    "sin recorrido", asi que veran la bienvenida la proxima vez que entren.
    Es lo correcto — nunca lo han visto — y de paso hace la funcion probable
    sin borrar la base."""
    for tabla, columna, ddl in _COLUMNAS_NUEVAS:
        existentes = {fila[1] for fila in conn.execute(f"PRAGMA table_info({tabla})")}
        if not existentes:
            continue  # la tabla aun no existe: la creara el schema, ya con la columna
        if columna in existentes:
            continue
        logger.info("Migrando: %s.%s", tabla, columna)
        conn.execute(ddl)


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
        _migrar_columnas(conn)
        conn.commit()
    finally:
        conn.close()
    logger.info("Esquema listo (%s).", ruta_db)


def sembrar_usuario_demo() -> None:
    """Crea la cuenta demo (`DEMO_CORREO`/`DEMO_CONTRASENA`) si todavia no
    existe. Va por el ORM (no por `sqlite3` crudo, a diferencia de
    `aplicar_schema`) porque necesita `hash_password` (bcrypt) para dejar la
    fila en el mismo formato que `POST /api/auth/register` -- si se
    insertara la contrasena en texto plano, el login fallaria.

    Idempotente por busqueda de correo antes de insertar: reiniciar el
    servidor no duplica la fila ni pisa una contrasena que alguien haya
    cambiado a mano en la base."""
    from sqlalchemy.exc import IntegrityError

    from . import models
    from .database import SessionLocal
    from .security import hash_password

    db = SessionLocal()
    try:
        ya_existe = db.query(models.Usuario).filter(models.Usuario.correo == DEMO_CORREO).first()
        if ya_existe is not None:
            return

        db.add(
            models.Usuario(
                nombre="Cuenta invitado",
                correo=DEMO_CORREO,
                contrasena_hash=hash_password(DEMO_CONTRASENA),
            )
        )
        try:
            db.commit()
        except IntegrityError:
            # Carrera con otro worker sembrando al mismo tiempo: el UNIQUE de
            # `correo` ya gano, no hay nada que hacer.
            db.rollback()
    finally:
        db.close()
    logger.info("Usuario demo listo (%s).", DEMO_CORREO)
