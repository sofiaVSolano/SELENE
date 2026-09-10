"""Contrasenas y JWT: la puerta de entrada de la API."""

from __future__ import annotations

import datetime as dt
import uuid

import jwt
import pytest

from api.config import settings
from api.security import create_access_token, decode_access_token, hash_password, verify_password


def test_el_hash_no_guarda_la_contrasena_en_claro():
    hashed = hash_password("ClaveDePrueba123")
    assert "ClaveDePrueba123" not in hashed
    assert verify_password("ClaveDePrueba123", hashed)


def test_una_contrasena_equivocada_no_verifica():
    assert not verify_password("otra-clave", hash_password("ClaveDePrueba123"))


def test_dos_hashes_de_la_misma_clave_son_distintos():
    # bcrypt usa una sal nueva cada vez: dos usuarios con la misma contrasena
    # no deben quedar con el mismo hash en la base.
    assert hash_password("igual") != hash_password("igual")


def test_el_token_lleva_usuario_y_rol():
    id_usuario = uuid.uuid4()
    payload = decode_access_token(create_access_token(id_usuario, "admin"))
    assert payload["sub"] == str(id_usuario)
    assert payload["rol"] == "admin"


def test_un_token_firmado_con_otro_secreto_se_rechaza():
    ajeno = jwt.encode({"sub": str(uuid.uuid4())}, "secreto-que-no-es-el-nuestro", algorithm="HS256")
    with pytest.raises(jwt.InvalidSignatureError):
        decode_access_token(ajeno)


def test_un_token_vencido_se_rechaza():
    vencido = jwt.encode(
        {"sub": str(uuid.uuid4()), "exp": dt.datetime.now(dt.timezone.utc) - dt.timedelta(minutes=1)},
        settings.jwt_secret_key,
        algorithm=settings.jwt_algorithm,
    )
    with pytest.raises(jwt.ExpiredSignatureError):
        decode_access_token(vencido)
