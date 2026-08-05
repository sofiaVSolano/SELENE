"""CRUD de luminarias.

Las salas a las que pertenecen viven en `routers/zonas.py`. Aqui esta lo que
cuelga de ellas: crear una luminaria en una sala, editarla, moverla de sala y
eliminarla.

Borrado: se NIEGA si la luminaria ya registro algo. En la base todas sus tablas
hijas son `ON DELETE CASCADE` (detecciones, eventos, consumo, recomendaciones,
predicciones), asi que un borrado se llevaria el historial por delante sin
avisar. Se responde 409 con el recuento para que sea una decision y no un
accidente.
"""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session, joinedload

from .. import models, schemas
from ..database import get_db
from ..deps import get_current_user

router = APIRouter(prefix="/api/luminarias", tags=["luminarias"])

# Tablas que cuelgan de una luminaria y que un DELETE se llevaria en cascada.
# Las etiquetas (singular, plural) son las que ve el usuario en el error.
_HISTORIAL = (
    (models.DeteccionOcupacion, "detección", "detecciones"),
    (models.Evento, "evento", "eventos"),
    (models.ConsumoEnergetico, "registro de consumo", "registros de consumo"),
    (models.Recomendacion, "recomendación", "recomendaciones"),
)


def _obtener(db: Session, id_luminaria: uuid.UUID) -> models.Luminaria:
    luminaria = db.get(models.Luminaria, id_luminaria)
    if luminaria is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Luminaria no encontrada.")
    return luminaria


def _exigir_zona(db: Session, id_zona: uuid.UUID) -> models.Zona:
    zona = db.get(models.Zona, id_zona)
    if zona is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="La sala indicada no existe.")
    return zona


def _exigir_nombre_libre_en_zona(
    db: Session, nombre: str, id_zona: uuid.UUID, excepto: uuid.UUID | None = None
) -> None:
    """`uq_luminarias_nombre_zona` es UNIQUE (nombre, id_zona) en la base: dos
    luminarias pueden llamarse igual en salas distintas, pero no en la misma."""
    consulta = select(models.Luminaria).where(
        func.lower(models.Luminaria.nombre) == nombre.strip().lower(),
        models.Luminaria.id_zona == id_zona,
    )
    if excepto is not None:
        consulta = consulta.where(models.Luminaria.id_luminaria != excepto)
    if db.scalars(consulta).first() is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Esa sala ya tiene una luminaria llamada «{nombre.strip()}».",
        )


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
    if payload.id_zona is not None:
        zona = _exigir_zona(db, payload.id_zona)
    else:
        # Camino viejo: la sala se nombra y se crea si no existe. Lo usa quien
        # ya llamaba asi a la API; la pantalla de salas manda `id_zona`.
        zona = db.query(models.Zona).filter(models.Zona.nombre == payload.zona).first()
        if zona is None:
            zona = models.Zona(nombre=payload.zona, tipo_espacio=payload.tipo_espacio)
            db.add(zona)
            db.flush()

    _exigir_nombre_libre_en_zona(db, payload.nombre, zona.id_zona)

    luminaria = models.Luminaria(
        nombre=payload.nombre.strip(),
        id_zona=zona.id_zona,
        tipo=payload.tipo,
        potencia_w=payload.potencia_w,
    )
    db.add(luminaria)
    db.commit()
    db.refresh(luminaria)
    return luminaria


@router.patch("/{id_luminaria}", response_model=schemas.LuminariaOut)
def editar_luminaria(
    id_luminaria: uuid.UUID,
    payload: schemas.LuminariaUpdate,
    db: Session = Depends(get_db),
    _usuario: models.Usuario = Depends(get_current_user),
) -> models.Luminaria:
    luminaria = _obtener(db, id_luminaria)
    cambios = payload.model_dump(exclude_unset=True)

    id_zona_final = cambios.get("id_zona") or luminaria.id_zona
    if "id_zona" in cambios and cambios["id_zona"]:
        _exigir_zona(db, cambios["id_zona"])

    nombre_final = cambios.get("nombre") or luminaria.nombre
    if "nombre" in cambios or "id_zona" in cambios:
        _exigir_nombre_libre_en_zona(db, nombre_final, id_zona_final, excepto=id_luminaria)
    if cambios.get("nombre"):
        cambios["nombre"] = cambios["nombre"].strip()

    for campo, valor in cambios.items():
        if valor is not None:
            setattr(luminaria, campo, valor)

    db.commit()
    db.refresh(luminaria)
    return luminaria


@router.delete("/{id_luminaria}", status_code=status.HTTP_204_NO_CONTENT)
def eliminar_luminaria(
    id_luminaria: uuid.UUID,
    db: Session = Depends(get_db),
    _usuario: models.Usuario = Depends(get_current_user),
) -> None:
    luminaria = _obtener(db, id_luminaria)

    acumulado = []
    for modelo, singular, plural in _HISTORIAL:
        cuantos = db.scalar(
            select(func.count()).select_from(modelo).where(modelo.id_luminaria == id_luminaria)
        )
        if cuantos:
            acumulado.append(f"{cuantos} {singular if cuantos == 1 else plural}")

    if acumulado:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                f"«{luminaria.nombre}» ya tiene historial ({', '.join(acumulado)}) y borrarla "
                "se lo llevaría todo. Se conserva para no perder la evidencia."
            ),
        )

    db.delete(luminaria)
    db.commit()
