"""Contrato de la API: que ninguna ruta protegida quede abierta por descuido.

En vez de comprobar endpoint por endpoint, este modulo recorre el esquema
OpenAPI que la propia app publica y exige que toda ruta fuera de una lista
blanca explicita rechace una peticion sin credenciales. Asi, un endpoint nuevo
que alguien agregue manana sin `get_current_user` hace fallar la suite en vez de
llegar a produccion abierto.
"""

from __future__ import annotations

import pytest

# Rutas que deben ser accesibles sin token, con su justificacion. Cualquier
# adicion a esta lista es una decision consciente de exponer algo al publico.
RUTAS_PUBLICAS = {
    ("/api/health", "get"),             # sonda de vida: solo devuelve {"status","service"}
    ("/api/auth/login", "post"),        # obtener token: no puede exigir token
    ("/api/auth/register", "post"),     # alta de usuario
    ("/docs", "get"),
    ("/redoc", "get"),
    ("/openapi.json", "get"),
}

# Valores de relleno para los parametros de ruta: da igual que no existan,
# porque la comprobacion de credenciales ocurre antes de buscar el recurso.
_RELLENO = {"int": "1", "integer": "1", "number": "1"}


def _rutas_protegidas(app):
    esquema = app.openapi()
    for plantilla, operaciones in esquema.get("paths", {}).items():
        for metodo, operacion in operaciones.items():
            if metodo not in {"get", "post", "put", "patch", "delete"}:
                continue
            if (plantilla, metodo) in RUTAS_PUBLICAS:
                continue
            ruta = plantilla
            for parametro in operacion.get("parameters", []):
                if parametro.get("in") != "path":
                    continue
                tipo = parametro.get("schema", {}).get("type", "string")
                ruta = ruta.replace(
                    "{" + parametro["name"] + "}",
                    _RELLENO.get(tipo, "00000000-0000-0000-0000-000000000000"),
                )
            yield plantilla, metodo, ruta


def test_el_esquema_expone_rutas_para_revisar(client):
    """Red de seguridad del propio test: si el recorrido no encuentra rutas,
    los asserts de abajo pasarian en vacio y no probarian nada."""
    from api.main import app

    assert len(list(_rutas_protegidas(app))) > 10


def test_ninguna_ruta_protegida_responde_sin_credenciales(client):
    from api.main import app

    abiertas = []
    for plantilla, metodo, ruta in _rutas_protegidas(app):
        respuesta = client.request(metodo, ruta)
        if respuesta.status_code not in (401, 403):
            abiertas.append(f"{metodo.upper()} {plantilla} -> {respuesta.status_code}")
    assert not abiertas, "Rutas alcanzables sin autenticacion:\n  " + "\n  ".join(abiertas)


def test_un_token_manipulado_no_abre_una_ruta_protegida(client):
    respuesta = client.get("/api/zonas", headers={"Authorization": "Bearer no-es-un-jwt"})
    assert respuesta.status_code in (401, 403)


def test_el_esquema_openapi_se_genera_sin_errores(client):
    respuesta = client.get("/openapi.json")
    assert respuesta.status_code == 200
    esquema = respuesta.json()
    assert esquema["openapi"].startswith("3.")
    assert esquema["paths"]


@pytest.mark.parametrize("rol", ["visor", "administrador"])
def test_el_rol_del_token_no_cambia_el_acceso(client, usuario_nuevo, rol):
    """Deja constancia ejecutable del hallazgo de elevacion de privilegios.

    El campo `rol` viaja en el JWT pero ninguna dependencia lo valida: un token
    de `visor` alcanza exactamente lo mismo que uno de `administrador`. Esta
    prueba NO exige que eso cambie -- documenta el comportamiento actual, de modo
    que el dia que se introduzca un modelo de permisos la prueba falle y obligue
    a revisar el analisis de amenazas que hoy registra la brecha.
    """
    from uuid import UUID

    from api.security import create_access_token

    token = create_access_token(UUID(usuario_nuevo["usuario"]["id_usuario"]), rol)
    respuesta = client.get("/api/zonas", headers={"Authorization": f"Bearer {token}"})
    assert respuesta.status_code == 200
