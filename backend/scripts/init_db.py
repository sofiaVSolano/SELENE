"""Aplica database/schema.sql (raiz del repo) contra el archivo SQLite de
DATABASE_URL.

Uso (desde `backend/`, con el entorno virtual activo):
    python scripts/init_db.py

Es el mismo schema.sql documentado en database/DISENO_BASE_DATOS.md: se
mantiene un unico archivo fuente de verdad para el esquema, en vez de
duplicar la definicion de tablas vía `Base.metadata.create_all()`.

La logica real vive en `api.db_init.aplicar_schema()` porque tambien la usa
el startup de FastAPI (`main.py`): con Postgres hacia falta un contenedor
`db-init` aparte que esperara a que el servidor de base de datos levantara;
un archivo SQLite no tiene ese problema, asi que la propia API se inicializa
sola. Este script sigue existiendo para poder crear el archivo sin levantar
el servidor completo.
"""

from __future__ import annotations

import sys
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_ROOT))

from api.db_init import aplicar_schema  # noqa: E402

if __name__ == "__main__":
    aplicar_schema()
