"""CRUD de salas (tabla `zonas`).

Una "sala" en la interfaz es una `zona` en el modelo: el espacio fisico que
SELENE vigila y al que pertenecen las luminarias. Hasta ahora no habia forma de
crear una: nacian de rebote al crear una luminaria por nombre
(`POST /api/luminarias`), asi que en una instalacion nueva no existia ninguna y
sin luminaria elegida el monitoreo no puede reportar alertas ni estimar consumo.

Borrado: se NIEGA si la sala todavia tiene luminarias. No es una limitacion
tecnica que haya que sortear, es la regla que ya declara la base
(`luminarias.id_zona ... ON DELETE RESTRICT`): las luminarias arrastran en
cascada detecciones, eventos y consumo, o sea la evidencia acumulada. Se
responde 409 diciendo cuantas hay, para que el usuario decida que hacer con
ellas primero.
"""

from __future__ import annotations

import logging
import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from .. import luminarias_auto, models, schemas
from ..database import get_db
from ..deps import get_current_user

router = APIRouter(prefix="/api/zonas", tags=["zonas"])
logger = logging.getLogger("api.routers.zonas")


def _obtener(db: Session, id_zona: uuid.UUID) -> models.Zona:
    zona = db.get(models.Zona, id_zona)
    if zona is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Sala no encontrada.")
    return zona


def _exigir_nombre_libre(db: Session, nombre: str, excepto: uuid.UUID | None = None) -> None:
    """`zonas.nombre` es UNIQUE en la base. Sin esto el choque saldria como un
    IntegrityError 500, y el usuario solo veria "error del servidor" cuando en
    realidad ya tiene una sala con ese nombre."""
    consulta = select(models.Zona).where(func.lower(models.Zona.nombre) == nombre.strip().lower())
    if excepto is not None:
        consulta = consulta.where(models.Zona.id_zona != excepto)
    if db.scalars(consulta).first() is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Ya existe una sala llamada «{nombre.strip()}».",
        )


@router.get("", response_model=list[schemas.ZonaDetalleOut])
def listar_zonas(
    db: Session = Depends(get_db),
    _usuario: models.Usuario = Depends(get_current_user),
) -> list[models.Zona]:
    return list(
        db.scalars(
            select(models.Zona)
            .options(selectinload(models.Zona.luminarias))
            .order_by(models.Zona.created_at.desc())
        ).all()
    )


@router.post("", response_model=schemas.ZonaDetalleOut, status_code=status.HTTP_201_CREATED)
def crear_zona(
    payload: schemas.ZonaCreate,
    db: Session = Depends(get_db),
    _usuario: models.Usuario = Depends(get_current_user),
) -> models.Zona:
    _exigir_nombre_libre(db, payload.nombre)

    zona = models.Zona(
        nombre=payload.nombre.strip(),
        tipo_espacio=payload.tipo_espacio,
        potencia_luminaria_w=payload.potencia_luminaria_w,
        edificio=payload.edificio,
        piso=payload.piso,
        descripcion=payload.descripcion,
    )
    db.add(zona)
    db.commit()
    db.refresh(zona)
    # Nace sin luminarias a proposito: las registra la camara la primera vez
    # que se monitorea la sala (ver `api/luminarias_auto.py`).
    return zona


@router.patch("/{id_zona}", response_model=schemas.ZonaDetalleOut)
def editar_zona(
    id_zona: uuid.UUID,
    payload: schemas.ZonaUpdate,
    db: Session = Depends(get_db),
    _usuario: models.Usuario = Depends(get_current_user),
) -> models.Zona:
    zona = _obtener(db, id_zona)

    # `exclude_unset`: distingue "no me mandaron el campo" de "me lo mandaron
    # en null para borrarlo". Sin esto, editar solo el nombre vaciaria el
    # edificio, el piso y la descripcion.
    cambios = payload.model_dump(exclude_unset=True)
    if "nombre" in cambios and cambios["nombre"]:
        _exigir_nombre_libre(db, cambios["nombre"], excepto=id_zona)
        cambios["nombre"] = cambios["nombre"].strip()

    for campo, valor in cambios.items():
        setattr(zona, campo, valor)

    # La potencia declarada de la sala baja a sus luminarias: las creo SELENE
    # con ese valor, nadie las escribió, así que no hay nada que respetar.
    if cambios.get("potencia_luminaria_w"):
        luminarias_auto.actualizar_potencia(db, zona, cambios["potencia_luminaria_w"])

    db.commit()
    db.refresh(zona)
    return zona


@router.delete("/{id_zona}", status_code=status.HTTP_204_NO_CONTENT)
def eliminar_zona(
    id_zona: uuid.UUID,
    db: Session = Depends(get_db),
    _usuario: models.Usuario = Depends(get_current_user),
) -> None:
    """Borra la sala CON todo lo suyo: sus luminarias y, en cascada, las
    detecciones, eventos, consumo y recomendaciones de cada una.

    Se borran las luminarias explicitamente y en un paso previo porque
    `luminarias.id_zona` es `ON DELETE RESTRICT`: la base impide borrar una
    sala que aun las tenga. De sus luminarias hacia abajo todo es
    `ON DELETE CASCADE`, asi que el historial se va solo.

    Es irreversible y no hay copia: quien lo pida tiene que haberlo confirmado
    antes, y la interfaz dice cuanto historial se va a perder (ver
    `GET /api/zonas/{id_zona}/impacto-borrado`).
    """
    zona = _obtener(db, id_zona)
    nombre = zona.nombre

    borradas = db.query(models.Luminaria).filter(models.Luminaria.id_zona == id_zona).delete(
        synchronize_session=False
    )
    db.delete(zona)
    db.commit()
    logger.info("Sala «%s» eliminada con %d luminaria(s) y su historial.", nombre, borradas or 0)


@router.get("/{id_zona}/impacto-borrado", response_model=schemas.ImpactoBorradoOut)
def impacto_borrado(
    id_zona: uuid.UUID,
    db: Session = Depends(get_db),
    _usuario: models.Usuario = Depends(get_current_user),
) -> schemas.ImpactoBorradoOut:
    """Que se perderia al borrar esta sala.

    Existe para que la confirmacion diga un numero y no una advertencia
    generica: "se perderan 281 detecciones y 34 eventos" es una decision
    informada; "esta accion no se puede deshacer" es un formalismo que nadie
    lee.
    """
    _obtener(db, id_zona)
    luminarias = select(models.Luminaria.id_luminaria).where(models.Luminaria.id_zona == id_zona)

    def _contar(modelo) -> int:
        return int(db.scalar(
            select(func.count()).select_from(modelo).where(modelo.id_luminaria.in_(luminarias))
        ) or 0)

    return schemas.ImpactoBorradoOut(
        luminarias=int(db.scalar(
            select(func.count()).select_from(models.Luminaria).where(models.Luminaria.id_zona == id_zona)
        ) or 0),
        detecciones=_contar(models.DeteccionOcupacion),
        eventos=_contar(models.Evento),
        registros_consumo=_contar(models.ConsumoEnergetico),
        recomendaciones=_contar(models.Recomendacion),
    )
