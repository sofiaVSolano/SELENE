"""Registro, login y perfil del usuario autenticado."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from .. import models, schemas
from ..database import get_db
from ..deps import get_current_user
from ..security import create_access_token, hash_password, verify_password

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/register", response_model=schemas.TokenResponse, status_code=status.HTTP_201_CREATED)
def register(payload: schemas.UsuarioRegister, db: Session = Depends(get_db)) -> schemas.TokenResponse:
    usuario = models.Usuario(
        nombre=payload.nombre,
        correo=payload.correo.lower(),
        contrasena_hash=hash_password(payload.contrasena),
    )
    db.add(usuario)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Ese correo ya esta registrado.") from exc
    db.refresh(usuario)

    token = create_access_token(usuario.id_usuario, usuario.rol)
    return schemas.TokenResponse(access_token=token, usuario=schemas.UsuarioOut.model_validate(usuario))


@router.post("/login", response_model=schemas.TokenResponse)
def login(payload: schemas.UsuarioLogin, db: Session = Depends(get_db)) -> schemas.TokenResponse:
    usuario = db.query(models.Usuario).filter(models.Usuario.correo == payload.correo.lower()).first()
    if usuario is None or not verify_password(payload.contrasena, usuario.contrasena_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Correo o contrasena incorrectos.")
    if not usuario.activo:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Usuario deshabilitado.")

    token = create_access_token(usuario.id_usuario, usuario.rol)
    return schemas.TokenResponse(access_token=token, usuario=schemas.UsuarioOut.model_validate(usuario))


@router.get("/me", response_model=schemas.UsuarioOut)
def me(usuario: models.Usuario = Depends(get_current_user)) -> schemas.UsuarioOut:
    return schemas.UsuarioOut.model_validate(usuario)


@router.post("/onboarding/completado", response_model=schemas.UsuarioOut)
def marcar_onboarding(
    usuario: models.Usuario = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> schemas.UsuarioOut:
    """Marca el recorrido de bienvenida como visto. Se llama al terminarlo y
    tambien al saltarlo: saltar es una decision del usuario, y volver a
    lanzarselo en el siguiente login seria no haberle hecho caso.

    No hay endpoint para desmarcarlo: relanzar el recorrido a mano (boton de
    ayuda del riel) no toca la base, solo abre el recorrido en esa sesion.
    Asi 'ya lo vi' es un hecho que no se revierte solo."""
    usuario.onboarding_completado = True
    db.commit()
    db.refresh(usuario)
    return schemas.UsuarioOut.model_validate(usuario)
