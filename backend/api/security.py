"""Hash de contrasenas (bcrypt) y emision/verificacion de JWT."""

from __future__ import annotations

import datetime as dt
from uuid import UUID

import bcrypt
import jwt

from .config import settings


def hash_password(plain_password: str) -> str:
    return bcrypt.hashpw(plain_password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(plain_password: str, password_hash: str) -> bool:
    return bcrypt.checkpw(plain_password.encode("utf-8"), password_hash.encode("utf-8"))


def create_access_token(subject: UUID, rol: str) -> str:
    now = dt.datetime.now(dt.timezone.utc)
    payload = {
        "sub": str(subject),
        "rol": rol,
        "iat": now,
        "exp": now + dt.timedelta(minutes=settings.jwt_expire_minutes),
    }
    return jwt.encode(payload, settings.jwt_secret_key, algorithm=settings.jwt_algorithm)


def decode_access_token(token: str) -> dict:
    return jwt.decode(token, settings.jwt_secret_key, algorithms=[settings.jwt_algorithm])
