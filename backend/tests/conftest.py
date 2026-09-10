"""Configuracion comun de la suite.

Lo mas importante de este archivo pasa ANTES de cualquier `import api...`:
`api/config.py` construye `settings` al importarse y `api/database.py` abre el
motor de SQLAlchemy con esa URL en el momento del import. Si los tests no
fijaran `DATABASE_URL` primero, la suite escribiria sobre `database/selene.db`
-- la base real de la aplicacion. pytest carga `conftest.py` antes que los
modulos de test, asi que este es el unico sitio donde llegar a tiempo.
"""

from __future__ import annotations

import os
import tempfile
import uuid
from pathlib import Path

import pytest

# --- Entorno de pruebas (antes de importar la app) ---------------------------
_DB_TMP = Path(tempfile.mkdtemp(prefix="selene-tests-")) / "test.db"
# `.as_posix()` por la misma razon que en api/config.py: en Windows las
# backslashes romperian la URL sqlite:///.
os.environ["DATABASE_URL"] = f"sqlite:///{_DB_TMP.as_posix()}"
# >= 32 bytes: por debajo de eso PyJWT avisa (InsecureKeyLengthWarning) y
# la suite se llena de ruido que no dice nada sobre el codigo probado.
os.environ["JWT_SECRET_KEY"] = "secreto-solo-de-pruebas-nunca-en-produccion"
# Sin claves de terceros: ningun test debe salir a la red. Si algo intentara
# llamar a OpenAI/ElevenLabs/SMTP, fallara de forma evidente en vez de gastar
# cuota de verdad.
os.environ["GPT_API_KEY"] = ""
os.environ["ELEVENLABS_API_KEY"] = ""
os.environ["SMTP_HOST"] = ""


@pytest.fixture(scope="session", autouse=True)
def _esquema_de_pruebas():
    """Crea las tablas una vez para toda la sesion sobre la base temporal."""
    from api.db_init import aplicar_schema

    aplicar_schema()
    yield


@pytest.fixture(scope="session")
def client():
    """Cliente HTTP contra la app real.

    `TestClient(app)` SIN el `with`: usado como context manager dispararia el
    evento startup de `api/main.py`, que lanza el hilo de precarga de los dos
    checkpoints de vision y el de limpieza de imagenes. Para probar endpoints
    no hace falta nada de eso (y en una maquina sin GPU tarda minutos); el
    esquema ya lo crea la fixture de arriba.
    """
    from fastapi.testclient import TestClient

    from api.main import app

    return TestClient(app)


@pytest.fixture
def db():
    """Sesion de SQLAlchemy directa, para preparar o comprobar datos sin HTTP."""
    from api.database import SessionLocal

    sesion = SessionLocal()
    try:
        yield sesion
    finally:
        sesion.close()


@pytest.fixture
def usuario_nuevo(client):
    """Registra un usuario con correo unico y devuelve su token + datos.

    Correo unico por test a proposito: la base temporal es una sola para toda
    la sesion, asi que dos tests que registren "test@selene.app" chocarian con
    el UNIQUE de `usuarios.correo` y el segundo fallaria por una razon que no
    tiene nada que ver con lo que estaba probando.
    """
    correo = f"test-{uuid.uuid4().hex[:12]}@selene.app"
    contrasena = "ClaveDePrueba123"
    respuesta = client.post(
        "/api/auth/register",
        json={"nombre": "Usuario De Prueba", "correo": correo, "contrasena": contrasena},
    )
    assert respuesta.status_code == 201, respuesta.text
    datos = respuesta.json()
    return {
        "correo": correo,
        "contrasena": contrasena,
        "token": datos["access_token"],
        "usuario": datos["usuario"],
    }


@pytest.fixture
def auth(usuario_nuevo):
    """Cabecera Authorization lista para pasar a `client.get(..., headers=auth)`."""
    return {"Authorization": f"Bearer {usuario_nuevo['token']}"}
