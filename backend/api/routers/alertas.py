"""Alertas de anomalía: zona sin ocupación con alguna luminaria encendida.

El umbral de "10 segundos sin nadie" y la condición de "hay una luminaria
encendida" se miden en el frontend, que ya recibe un resultado por frame (ver
`evaluarDerroche` en `frontend/src/modules/monitoreo/useMonitoreo.js`); este
router solo persiste la anomalía como un `Evento` (tipo `alerta_ocupacion`) y
una `Recomendacion` ("apagar la luminaria"), y devuelve el mensaje para que la
interfaz monte la escena del aviso.
"""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import models, schemas
from ..database import get_db
from ..deps import get_current_user
from .deteccion import _imagen_url

router = APIRouter(prefix="/api/alertas", tags=["alertas"])

MENSAJE_TEMPLATE = (
    "Oye, no hay nadie en esta zona desde hace {segundos} segundos y {luces}. "
    "Recomiendo {apagar}."
)


def _describir_luces(encendidas: int) -> tuple[str, str]:
    """Frase de las luces + verbo de la recomendacion, en singular o plural.

    Antes el mensaje citaba el % de iluminacion artificial. Se quito porque no
    es lo que dispara la alerta ni lo que el usuario puede accionar: es un
    reparto relativo frente a la luz natural, asi que de dia podia leerse
    "las luces siguen encendidas (40% de iluminación artificial)" — una cifra
    baja al lado de una afirmacion tajante. El numero de lamparas encendidas
    si es una observacion directa y comprobable mirando la foto de la alerta.
    """
    if encendidas == 1:
        return "hay una luz encendida", "apagarla"
    return f"hay {encendidas} luces encendidas", "apagarlas"


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
    if payload.id_zona is not None:
        # La alerta es de la SALA. Se ancla a una de sus luminarias porque
        # `eventos` y `recomendaciones` cuelgan de una luminaria; cual de
        # ellas es indiferente, el mensaje habla de la sala entera.
        luminaria = db.scalars(
            select(models.Luminaria)
            .where(models.Luminaria.id_zona == payload.id_zona)
            .order_by(models.Luminaria.created_at.asc())
            .limit(1)
        ).first()
        if luminaria is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Esa sala todavía no tiene luminarias detectadas.",
            )
    else:
        luminaria = db.get(models.Luminaria, payload.id_luminaria)
        if luminaria is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Luminaria no encontrada.")

    luces, apagar = _describir_luces(payload.luminarias_encendidas)
    mensaje = MENSAJE_TEMPLATE.format(
        segundos=payload.segundos_sin_ocupacion, luces=luces, apagar=apagar,
    )
    # Cuanto mas tiempo lleva vacia con la luz prendida, mayor la prioridad.
    prioridad = "alta" if payload.segundos_sin_ocupacion >= 60 else "media"
    # Sala sellada al momento de la alerta, no deducida de `luminaria.id_zona`
    # (ver el comentario largo en `models.py::Recomendacion`).
    id_zona = payload.id_zona or luminaria.id_zona

    evento = models.Evento(
        id_luminaria=luminaria.id_luminaria,
        id_deteccion_origen=payload.id_deteccion,
        tipo_evento="alerta_ocupacion",
        descripcion=mensaje,
    )
    recomendacion = models.Recomendacion(
        id_luminaria=luminaria.id_luminaria,
        id_zona=id_zona,
        id_deteccion_origen=payload.id_deteccion,
        segundos_sin_ocupacion=payload.segundos_sin_ocupacion,
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


@router.get("/historial", response_model=list[schemas.AlertaHistorialItem])
def listar_historial_alertas(
    id_zona: uuid.UUID | None = None,
    limite: int = 40,
    offset: int = 0,
    db: Session = Depends(get_db),
    _usuario: models.Usuario = Depends(get_current_user),
) -> list[schemas.AlertaHistorialItem]:
    """La galería de Historial · Alertas del frontend. Reemplaza lo que antes
    salía de `localStorage` (`lib/alertasAlmacen.js`): zona, luminaria e
    imagen se resuelven aquí en vez de venir del navegador que disparó la
    alerta.

    Ruta literal declarada ANTES que `/{id_luminaria}` a propósito, igual que
    en `deteccion.py` — no depende del fallback de conversión de Starlette.
    """
    consulta = select(models.Recomendacion).order_by(models.Recomendacion.fecha_hora.desc())
    if id_zona is not None:
        consulta = consulta.where(models.Recomendacion.id_zona == id_zona)
    recomendaciones = db.scalars(consulta.offset(max(0, offset)).limit(min(limite, 200))).all()

    ids_deteccion = [r.id_deteccion_origen for r in recomendaciones if r.id_deteccion_origen is not None]
    detecciones_por_id = {}
    if ids_deteccion:
        for d in db.scalars(
            select(models.DeteccionOcupacion).where(models.DeteccionOcupacion.id_deteccion.in_(ids_deteccion))
        ).all():
            detecciones_por_id[d.id_deteccion] = d

    zonas_por_id = {z.id_zona: z.nombre for z in db.scalars(select(models.Zona)).all()}
    luminarias_por_id = {l.id_luminaria: l.nombre for l in db.scalars(select(models.Luminaria)).all()}

    salida = []
    for r in recomendaciones:
        deteccion = detecciones_por_id.get(r.id_deteccion_origen) if r.id_deteccion_origen else None
        salida.append(
            schemas.AlertaHistorialItem(
                id_recomendacion=r.id_recomendacion,
                fecha_hora=r.fecha_hora,
                mensaje=r.recomendacion,
                prioridad=r.prioridad,
                aplicada=r.aplicada,
                zona=zonas_por_id.get(r.id_zona) if r.id_zona else None,
                id_zona=r.id_zona,
                luminaria=luminarias_por_id.get(r.id_luminaria),
                segundos_sin_ocupacion=r.segundos_sin_ocupacion,
                porcentaje_artificial=deteccion.porcentaje_artificial if deteccion else None,
                luminarias_visibles=deteccion.num_luminarias if deteccion else None,
                luminarias_encendidas=deteccion.num_luminarias_encendidas if deteccion else None,
                imagen_url=_imagen_url(r.id_deteccion_origen, deteccion.imagen_referencia) if deteccion else None,
            )
        )
    return salida


@router.delete("/historial", status_code=status.HTTP_204_NO_CONTENT)
def vaciar_historial_alertas(
    id_zona: uuid.UUID | None = None,
    db: Session = Depends(get_db),
    _usuario: models.Usuario = Depends(get_current_user),
) -> None:
    """«Borrar todas» del historial de alertas. No toca la detección de
    origen ni su imagen — esas siguen viviendo (o no) en el historial de
    capturas, que se administra aparte."""
    consulta = select(models.Recomendacion)
    if id_zona is not None:
        consulta = consulta.where(models.Recomendacion.id_zona == id_zona)
    for r in db.scalars(consulta).all():
        db.delete(r)
    db.commit()


@router.delete("/{id_recomendacion}", status_code=status.HTTP_204_NO_CONTENT)
def eliminar_alerta(
    id_recomendacion: uuid.UUID,
    db: Session = Depends(get_db),
    _usuario: models.Usuario = Depends(get_current_user),
) -> None:
    r = db.get(models.Recomendacion, id_recomendacion)
    if r is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Alerta no encontrada.")
    db.delete(r)
    db.commit()


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
