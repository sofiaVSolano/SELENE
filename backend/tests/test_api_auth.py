"""Registro, login y acceso autenticado, sobre la app real via TestClient."""

from __future__ import annotations

import pytest

pytestmark = pytest.mark.lento


def test_health_responde_ok(client):
    respuesta = client.get("/api/health")
    assert respuesta.status_code == 200
    assert respuesta.json() == {"status": "ok", "service": "selene-api"}


def test_registro_devuelve_token_y_usuario(usuario_nuevo):
    assert usuario_nuevo["token"]
    assert usuario_nuevo["usuario"]["correo"] == usuario_nuevo["correo"]
    # Quien acaba de registrarse todavia no ha visto el recorrido de Lum.
    assert usuario_nuevo["usuario"]["onboarding_completado"] is False


def test_no_se_puede_registrar_dos_veces_el_mismo_correo(client, usuario_nuevo):
    respuesta = client.post(
        "/api/auth/register",
        json={"nombre": "Otro", "correo": usuario_nuevo["correo"], "contrasena": "OtraClave123"},
    )
    assert respuesta.status_code == 409


def test_el_correo_no_distingue_mayusculas(client, usuario_nuevo):
    respuesta = client.post(
        "/api/auth/login",
        json={"correo": usuario_nuevo["correo"].upper(), "contrasena": usuario_nuevo["contrasena"]},
    )
    assert respuesta.status_code == 200


def test_login_con_contrasena_incorrecta_da_401(client, usuario_nuevo):
    respuesta = client.post(
        "/api/auth/login",
        json={"correo": usuario_nuevo["correo"], "contrasena": "no-es-esta"},
    )
    assert respuesta.status_code == 401


def test_me_sin_token_da_401(client):
    assert client.get("/api/auth/me").status_code == 401


def test_me_con_token_devuelve_al_usuario(client, auth, usuario_nuevo):
    respuesta = client.get("/api/auth/me", headers=auth)
    assert respuesta.status_code == 200
    assert respuesta.json()["correo"] == usuario_nuevo["correo"]


def test_una_contrasena_corta_no_pasa_la_validacion(client):
    respuesta = client.post(
        "/api/auth/register",
        json={"nombre": "Corta", "correo": "corta@selene.app", "contrasena": "1234"},
    )
    assert respuesta.status_code == 422
