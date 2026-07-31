"""Alertas de anomalía: zona sin ocupación con iluminación artificial activa.

El umbral de "10 segundos sin nadie" y el de "% de luz artificial" se miden
en el frontend (que ya recibe un resultado por frame, ver
`frontend/src/components/dashboard/CameraPanel.jsx`); este router solo
persiste la anomalía como un `Evento` (tipo `alerta_ocupacion`) y una
`Recomendacion` ("apagar la luminaria"), y devuelve el mensaje para que el
panel lo hable/notifique.
"""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from .. import models, schemas
from ..database import get_db
from ..deps import get_current_user

router = APIRouter(prefix="/api/alertas", tags=["alertas"])

MENSAJE_TEMPLATE = (
    "Oye, no hay nadie en esta zona desde hace {segundos} segundos y las luces "
    "siguen encendidas ({pct:.0f}% de iluminación artificial). Recomiendo apagarlas."
)


@router.post(
    "/ocupacion-luz",
    response_model=schemas.AlertaOcupacionLuzOut,
    status_code=status.HTTP_201_CREATED,
)
def reportar_ocupacion_luz(
    payload: schemas.AlertaOcupacionLuzCreate,
    db: Session = Depends(get_db),
    _usuario: models.Usuario = Depends(get_current_user),
) -> schemas.AlertaOcupacionLuzOut:
    luminaria = db.get(models.Luminaria, payload.id_luminaria)
    if luminaria is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Luminaria no encontrada.")

    mensaje = MENSAJE_TEMPLATE.format(
        segundos=payload.segundos_sin_ocupacion, pct=payload.porcentaje_artificial,
    )
    # Cuanto mas tiempo lleva vacia con la luz prendida, mayor la prioridad.
    prioridad = "alta" if payload.segundos_sin_ocupacion >= 60 else "media"

    evento = models.Evento(
        id_luminaria=payload.id_luminaria,
        tipo_evento="alerta_ocupacion",
        descripcion=mensaje,
    )
    recomendacion = models.Recomendacion(
        id_luminaria=payload.id_luminaria,
        recomendacion=mensaje,
        prioridad=prioridad,
    )
    db.add_all([evento, recomendacion])
    db.commit()
    db.refresh(evento)
    db.refresh(recomendacion)

    return schemas.AlertaOcupacionLuzOut(
        id_evento=evento.id_evento,
        id_recomendacion=recomendacion.id_recomendacion,
        mensaje=mensaje,
        prioridad=prioridad,
        fecha_hora=recomendacion.fecha_hora,
    )


@router.get("/{id_luminaria}", response_model=list[schemas.RecomendacionOut])
def historial_alertas(
    id_luminaria: uuid.UUID,
    limite: int = 10,
    db: Session = Depends(get_db),
    _usuario: models.Usuario = Depends(get_current_user),
) -> list[models.Recomendacion]:
    return (
        db.query(models.Recomendacion)
        .filter(models.Recomendacion.id_luminaria == id_luminaria)
        .order_by(models.Recomendacion.fecha_hora.desc())
        .limit(min(limite, 100))
        .all()
    )
