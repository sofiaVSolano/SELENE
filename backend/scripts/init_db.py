"""Ejecuta database/schema.sql (raiz del repo) contra DATABASE_URL.

Uso (desde `backend/`, con el entorno virtual activo):
    python scripts/init_db.py

Es el mismo schema.sql documentado en database/DISENO_BASE_DATOS.md: se
mantiene un unico archivo fuente de verdad para el esquema, en vez de
duplicar la definicion de tablas vía `Base.metadata.create_all()`.

Idempotente a nivel "todo o nada": si el esquema ya fue aplicado antes (p.
ej. el contenedor `db-init` de docker-compose se re-ejecuta en un `docker
compose up` posterior sobre un volumen ya inicializado), el primer `CREATE
TYPE`/`CREATE TABLE` que choca aborta toda la transaccion (schema.sql esta
envuelto en un unico BEGIN/COMMIT) y este script lo trata como exito, no
como error.
"""

from __future__ import annotations

import sys
import time
from pathlib import Path

import psycopg
from psycopg import errors as pg_errors

BACKEND_ROOT = Path(__file__).resolve().parents[1]
PROJECT_ROOT = BACKEND_ROOT.parent
sys.path.insert(0, str(BACKEND_ROOT))

from api.config import settings  # noqa: E402

SCHEMA_PATH = PROJECT_ROOT / "database" / "schema.sql"

# Codigos SQLSTATE de clase "objeto/tabla/tipo/columna ya existe" (42*):
# ver https://www.postgresql.org/docs/current/errcodes-appendix.html
_ALREADY_EXISTS_SQLSTATES = {"42710", "42P07", "42P06", "42701", "42723"}


def _to_psycopg_dsn(sqlalchemy_url: str) -> str:
    return sqlalchemy_url.replace("postgresql+psycopg://", "postgresql://")


def _connect_with_retry(dsn: str, attempts: int = 10, delay_s: float = 2.0) -> psycopg.Connection:
    last_error: Exception | None = None
    for attempt in range(1, attempts + 1):
        try:
            return psycopg.connect(dsn, autocommit=True)
        except psycopg.OperationalError as exc:
            last_error = exc
            print(f"  Postgres no responde todavia (intento {attempt}/{attempts}), reintentando...")
            time.sleep(delay_s)
    raise RuntimeError(f"No se pudo conectar a Postgres tras {attempts} intentos") from last_error


def main() -> None:
    if not SCHEMA_PATH.exists():
        raise FileNotFoundError(f"No se encontro {SCHEMA_PATH}")

    sql = SCHEMA_PATH.read_text(encoding="utf-8")
    dsn = _to_psycopg_dsn(settings.database_url)

    print(f"Aplicando {SCHEMA_PATH} sobre {dsn.split('@')[-1]} ...")
    # schema.sql ya trae su propio BEGIN/COMMIT, asi que la conexion se abre
    # en autocommit (evita anidar una segunda transaccion sobre la del script).
    conn = _connect_with_retry(dsn)
    try:
        with conn.cursor() as cur:
            cur.execute(sql)
        print("Esquema aplicado correctamente.")
    except pg_errors.Error as exc:
        sqlstate = exc.diag.sqlstate if exc.diag else None
        if sqlstate in _ALREADY_EXISTS_SQLSTATES:
            print(f"El esquema ya estaba inicializado (omitido): {exc}")
        else:
            raise
    finally:
        conn.close()


if __name__ == "__main__":
    main()
