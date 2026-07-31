"""CRUD minimo de luminarias/zonas, necesario para elegir que luminaria escanear en el panel."""

from __future__ import annotations

from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session, joinedload

from .. import models, schemas
from ..database import get_db
from ..deps import get_current_user

router = APIRouter(prefix="/api/luminarias", tags=["luminarias"])


@router.get("", response_model=list[schemas.LuminariaOut])
def listar_luminarias(
    db: Session = Depends(get_db),
    _usuario: models.Usuario = Depends(get_current_user),
) -> list[models.Luminaria]:
    return (
        db.query(models.Luminaria)
        .options(joinedload(models.Luminaria.zona))
        .order_by(models.Luminaria.created_at.desc())
        .all()
    )


@router.post("", response_model=schemas.LuminariaOut, status_code=status.HTTP_201_CREATED)
def crear_luminaria(
    payload: schemas.LuminariaCreate,
    db: Session = Depends(get_db),
    _usuario: models.Usuario = Depends(get_current_user),
) -> models.Luminaria:
    zona = db.query(models.Zona).filter(models.Zona.nombre == payload.zona).first()
    if zona is None:
        zona = models.Zona(nombre=payload.zona, tipo_espacio=payload.tipo_espacio)
        db.add(zona)
        db.flush()

    luminaria = models.Luminaria(
        nombre=payload.nombre,
        id_zona=zona.id_zona,
        tipo=payload.tipo,
        potencia_w=payload.potencia_w,
    )
    db.add(luminaria)
    db.commit()
    db.refresh(luminaria)
    return luminaria
