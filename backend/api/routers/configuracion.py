"""Preferencias de la cuenta. Por ahora, una sola cosa: el resumen diario de
actividad por correo (ver `api/email_reports.py`)."""

from __future__ import annotations

import datetime as dt
import logging

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from .. import models, schemas
from ..database import get_db
from ..deps import get_current_user
from ..email_reports import enviar_resumen_diario

router = APIRouter(prefix="/api/configuracion", tags=["configuracion"])
logger = logging.getLogger("api.routers.configuracion")


def _obtener_o_crear(db: Session, usuario: models.Usuario) -> models.ConfiguracionReporteEmail:
    """Perezoso: la fila solo se crea la primera vez que la cuenta abre esta
    pantalla, con el correo de login como destino por defecto y el envío
    desactivado -- nadie debe empezar a recibir un correo diario sin haberlo
    encendido a propósito."""
    config = db.get(models.ConfiguracionReporteEmail, usuario.id_usuario)
    if config is not None:
        return config

    ahora = dt.datetime.now(dt.timezone.utc)
    config = models.ConfiguracionReporteEmail(
        id_usuario=usuario.id_usuario,
        correo_destino=usuario.correo,
        created_at=ahora,
        updated_at=ahora,
    )
    db.add(config)
    db.commit()
    db.refresh(config)
    return config


@router.get("/reportes-email", response_model=schemas.ConfiguracionReporteEmailOut)
def obtener_configuracion(
    usuario: models.Usuario = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> models.ConfiguracionReporteEmail:
    return _obtener_o_crear(db, usuario)


@router.put("/reportes-email", response_model=schemas.ConfiguracionReporteEmailOut)
def actualizar_configuracion(
    payload: schemas.ConfiguracionReporteEmailUpdate,
    usuario: models.Usuario = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> models.ConfiguracionReporteEmail:
    config = _obtener_o_crear(db, usuario)
    config.activo = payload.activo
    config.hora_envio = payload.hora_envio
    config.correo_destino = str(payload.correo_destino)
    db.commit()
    db.refresh(config)
    return config


@router.post("/reportes-email/probar", status_code=status.HTTP_204_NO_CONTENT)
def probar_configuracion(
    usuario: models.Usuario = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> None:
    """Manda el resumen de HOY de una vez, para que la persona compruebe que
    el correo le llega antes de esperar a la hora programada. No marca
    `ultima_fecha_enviada`: no reemplaza el envío automático del día (ver
    `main.py::_reportes_email_periodico`)."""
    config = _obtener_o_crear(db, usuario)
    try:
        enviar_resumen_diario(db, usuario, config.correo_destino)
    except (RuntimeError, OSError) as exc:
        logger.warning("Fallo el envio de prueba del resumen diario para %s: %s", usuario.correo, exc)
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)) from exc
