"""Asistente de voz: preguntas en audio sobre consumo energetico y planes de
ahorro (transcripcion + respuesta de chat anclada en `api.energy` + voz),
y generacion de un reporte que sintetiza la conversacion. Ver `api.assistant`.
"""

from __future__ import annotations

import mimetypes
import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile, status
from fastapi.responses import FileResponse
from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import models
from ..assistant import reports, service
from ..assistant.openai_client import AssistantConfigError
from ..assistant.report_types import TIPOS_REPORTE
from ..assistant.schemas import (
    ConsultaHistorialItem,
    GenerarReporteRequest,
    PreguntaAudioResponse,
    ReporteOut,
    TipoReporteSugerido,
)
from ..database import get_db
from ..deps import get_current_user

router = APIRouter(prefix="/api/asistente", tags=["asistente"])

_MAX_AUDIO_BYTES = 20 * 1024 * 1024  # 20 MB, generoso para un clip de voz de unos pocos minutos


@router.post("/preguntar", response_model=PreguntaAudioResponse)
async def preguntar(
    audio: UploadFile = File(...),
    db: Session = Depends(get_db),
    usuario: models.Usuario = Depends(get_current_user),
) -> PreguntaAudioResponse:
    contenido = await audio.read()
    if not contenido:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="El archivo de audio llego vacio.")
    if len(contenido) > _MAX_AUDIO_BYTES:
        raise HTTPException(status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, detail="Audio demasiado grande (maximo 20 MB).")

    try:
        return service.procesar_pregunta_audio(
            db,
            usuario.id_usuario,
            contenido,
            filename=audio.filename or "audio.webm",
            content_type=audio.content_type or "audio/webm",
        )
    except AssistantConfigError as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc


@router.get("/historial", response_model=list[ConsultaHistorialItem])
def historial(
    limite: int = 30,
    db: Session = Depends(get_db),
    usuario: models.Usuario = Depends(get_current_user),
) -> list[models.Consulta]:
    consultas = db.scalars(
        select(models.Consulta)
        .where(models.Consulta.id_usuario == usuario.id_usuario)
        .order_by(models.Consulta.fecha_hora.desc())
        .limit(min(limite, 200))
    ).all()
    return list(reversed(consultas))


def _a_reporte_out(request: Request, reporte: models.Reporte) -> ReporteOut:
    return ReporteOut(
        id_reporte=reporte.id_reporte,
        fecha_generacion=reporte.fecha_generacion,
        tipo_reporte=reporte.tipo_reporte,
        clave_reporte=reporte.clave_reporte,
        periodo=reporte.periodo,
        resumen=reporte.resumen,
        url_descarga=str(request.url_for("descargar_reporte", id_reporte=reporte.id_reporte)),
    )


@router.get("/reportes/sugerencias", response_model=list[TipoReporteSugerido])
def sugerencias_reporte(
    limite_consultas: int = 20,
    db: Session = Depends(get_db),
    usuario: models.Usuario = Depends(get_current_user),
) -> list[TipoReporteSugerido]:
    try:
        claves = reports.sugerir_tipos_reporte(db, usuario, limite_consultas=limite_consultas)
    except AssistantConfigError as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)) from exc
    return [TipoReporteSugerido(clave=clave, etiqueta=TIPOS_REPORTE[clave]["etiqueta"]) for clave in claves]


@router.post("/reporte", response_model=ReporteOut, status_code=status.HTTP_201_CREATED)
def generar_reporte(
    payload: GenerarReporteRequest,
    request: Request,
    db: Session = Depends(get_db),
    usuario: models.Usuario = Depends(get_current_user),
) -> ReporteOut:
    try:
        reporte = reports.generar_reporte(
            db, usuario, clave_reporte=payload.clave_reporte, limite_consultas=payload.limite_consultas, titulo=payload.titulo
        )
    except AssistantConfigError as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)) from exc
    return _a_reporte_out(request, reporte)


@router.get("/reportes", response_model=list[ReporteOut])
def listar_reportes(
    request: Request,
    limite: int = 20,
    db: Session = Depends(get_db),
    usuario: models.Usuario = Depends(get_current_user),
) -> list[ReporteOut]:
    reportes_usuario = db.scalars(
        select(models.Reporte)
        .where(models.Reporte.id_usuario == usuario.id_usuario)
        .order_by(models.Reporte.fecha_generacion.desc())
        .limit(min(limite, 100))
    ).all()
    return [_a_reporte_out(request, r) for r in reportes_usuario]


@router.get("/reporte/{id_reporte}/descargar", name="descargar_reporte")
def descargar_reporte(
    id_reporte: uuid.UUID,
    db: Session = Depends(get_db),
    usuario: models.Usuario = Depends(get_current_user),
) -> FileResponse:
    reporte = db.get(models.Reporte, id_reporte)
    if reporte is None or reporte.id_usuario != usuario.id_usuario:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Reporte no encontrado.")

    ruta = Path(reporte.ruta_archivo)
    if not ruta.exists():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="El archivo del reporte ya no existe en disco.")

    # Reportes generados antes de este cambio son .md; los nuevos son .pdf.
    media_type, _ = mimetypes.guess_type(ruta.name)
    return FileResponse(ruta, filename=ruta.name, media_type=media_type or "application/pdf")
