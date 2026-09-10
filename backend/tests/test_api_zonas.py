"""CRUD de salas: la pantalla de salas se apoya entera en estos endpoints."""

from __future__ import annotations

import uuid

import pytest

pytestmark = pytest.mark.lento


def _crear_sala(client, auth, **campos):
    cuerpo = {"nombre": f"Sala {uuid.uuid4().hex[:8]}", "tipo_espacio": "oficina", **campos}
    return client.post("/api/zonas", json=cuerpo, headers=auth)


def test_las_salas_exigen_autenticacion(client):
    assert client.get("/api/zonas").status_code == 401


def test_crear_una_sala_la_devuelve_con_id_y_sin_luminarias(client, auth):
    respuesta = _crear_sala(client, auth, potencia_luminaria_w=36.0)
    assert respuesta.status_code == 201, respuesta.text
    sala = respuesta.json()
    assert uuid.UUID(sala["id_zona"])
    assert sala["potencia_luminaria_w"] == 36.0
    # Las luminarias las detecta SELENE mirando la sala, no se escriben a mano:
    # una sala recien creada nace vacia.
    assert sala["luminarias"] == []


def test_la_sala_creada_aparece_en_el_listado(client, auth):
    id_zona = _crear_sala(client, auth).json()["id_zona"]
    listado = client.get("/api/zonas", headers=auth).json()
    assert id_zona in [s["id_zona"] for s in listado]


def test_no_se_admiten_dos_salas_con_el_mismo_nombre(client, auth):
    nombre = f"Sala {uuid.uuid4().hex[:8]}"
    assert _crear_sala(client, auth, nombre=nombre).status_code == 201
    repetida = _crear_sala(client, auth, nombre=nombre)
    assert repetida.status_code == 409


def test_un_tipo_de_espacio_inventado_se_rechaza(client, auth):
    # `tipo_espacio` alimenta el contexto del modelo energetico: solo valen
    # los perfiles de configs/energy_context.yaml.
    respuesta = _crear_sala(client, auth, tipo_espacio="submarino")
    assert respuesta.status_code == 422


def test_patch_cambia_solo_lo_que_llega(client, auth):
    sala = _crear_sala(client, auth, potencia_luminaria_w=18.0, piso="1").json()
    respuesta = client.patch(
        f"/api/zonas/{sala['id_zona']}", json={"potencia_luminaria_w": 42.0}, headers=auth
    )
    assert respuesta.status_code == 200
    actualizada = respuesta.json()
    assert actualizada["potencia_luminaria_w"] == 42.0
    assert actualizada["piso"] == "1"
    assert actualizada["nombre"] == sala["nombre"]


def test_borrar_una_sala_vacia_funciona_y_desaparece(client, auth):
    id_zona = _crear_sala(client, auth).json()["id_zona"]
    assert client.delete(f"/api/zonas/{id_zona}", headers=auth).status_code == 204
    listado = client.get("/api/zonas", headers=auth).json()
    assert id_zona not in [s["id_zona"] for s in listado]


def test_una_sala_inexistente_da_404(client, auth):
    assert client.get(f"/api/zonas/{uuid.uuid4()}/impacto-borrado", headers=auth).status_code == 404
