"""Analisis de un frame en vivo: personas (bbox + confianza), ocupacion y % de iluminacion.

Cada llamada exitosa inserta una fila en `detecciones_ocupacion` con la hora
exacta de la deteccion (ver database/DISENO_BASE_DATOS.md). Si el frame trae
`id_luminaria`, ademas actualiza el tracking real de encendido/apagado
(`consumo_energetico`, `eventos`) y dispara el modulo energetico (LightGBM)
para ese mismo tramo -- ver `api.energy.vision_bridge`.
"""

from __future__ import annotations

import datetime as dt
import logging
import uuid

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from sqlalchemy.orm import Session

from .. import detection_service, models, schemas
from ..database import get_db
from ..deps import get_current_user
from ..energy import context as energy_context
from ..energy import vision_bridge
from ..energy.service import generar_reporte_energetico

router = APIRouter(prefix="/api/deteccion", tags=["deteccion"])
logger = logging.getLogger("api.routers.deteccion")


@router.post("/frame", response_model=schemas.FrameAnalysisResponse)
def analizar_frame(
    imagen: UploadFile = File(...),
    id_luminaria: uuid.UUID | None = Form(default=None),
    db: Session = Depends(get_db),
    _usuario: models.Usuario = Depends(get_current_user),
) -> schemas.FrameAnalysisResponse:
    raw = imagen.file.read()
    try:
        frame_bgr = detection_service.decode_image(raw)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    resultado = detection_service.analyze_frame(frame_bgr)

    deteccion_id = None
    consumo_estimado_kwh = None
    ahorro_estimado_kwh = None

    if id_luminaria is not None:
        luminaria = db.get(models.Luminaria, id_luminaria)
        if luminaria is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Luminaria no encontrada.")

        registro = models.DeteccionOcupacion(
            id_luminaria=id_luminaria,
            personas_detectadas=resultado["personas_detectadas"],
            confianza=resultado["confianza_max_persona"] or None,
            estado_ocupacion=resultado["estado_ocupacion"],
        )
        db.add(registro)
        db.commit()
        db.refresh(registro)
        deteccion_id = registro.id_deteccion

        # Tracking real de encendido/apagado (consumo_energetico, eventos):
        # se guarda siempre, sin depender de que el paso de LightGBM de abajo
        # funcione (es la fuente de verdad de "cuanto tiempo estuvo encendida").
        vision_bridge.actualizar_estado_luminaria(
            db, luminaria, resultado, deteccion_id, registro.fecha_hora,
        )
        db.commit()

        try:
            horas_transcurridas = vision_bridge.calcular_horas_transcurridas(
                db, id_luminaria, registro.fecha_hora,
            )
            escenario = vision_bridge.construir_escenario_vision(
                resultado, luminaria.zona.tipo_espacio, registro.fecha_hora, deteccion_id,
            )
            factor_escala = horas_transcurridas / energy_context.horas_tramo_captura()
            reporte = generar_reporte_energetico(
                escenario, db=db, guardar=True, factor_escala=factor_escala,
            )
            consumo_estimado_kwh = reporte.consumo_esperado_kwh
            ahorro_estimado_kwh = reporte.ahorro_kwh
        except Exception:  # noqa: BLE001 - el modulo energetico es auxiliar; no debe tumbar /api/deteccion/frame.
            logger.warning(
                "No se pudo generar/guardar el reporte energetico para la deteccion %s.",
                deteccion_id, exc_info=True,
            )
            db.rollback()

    return schemas.FrameAnalysisResponse(
        fecha_hora=registro.fecha_hora if deteccion_id is not None else dt.datetime.now(dt.timezone.utc),
        personas=resultado["personas"],
        personas_detectadas=resultado["personas_detectadas"],
        estado_ocupacion=resultado["estado_ocupacion"],
        elementos_iluminacion=resultado["elementos_iluminacion"],
        porcentaje_natural=resultado["porcentaje_natural"],
        porcentaje_artificial=resultado["porcentaje_artificial"],
        brillo_escena=resultado["brillo_escena"],
        tipo_iluminacion=resultado["tipo_iluminacion"],
        recomendacion=resultado["recomendacion"],
        id_deteccion=deteccion_id,
        consumo_estimado_kwh=consumo_estimado_kwh,
        ahorro_estimado_kwh=ahorro_estimado_kwh,
    )


@router.get("/historial/{id_luminaria}", response_model=list[schemas.FrameAnalysisResponse])
def historial_luminaria(
    id_luminaria: uuid.UUID,
    limite: int = 20,
    db: Session = Depends(get_db),
    _usuario: models.Usuario = Depends(get_current_user),
) -> list[schemas.FrameAnalysisResponse]:
    registros = (
        db.query(models.DeteccionOcupacion)
        .filter(models.DeteccionOcupacion.id_luminaria == id_luminaria)
        .order_by(models.DeteccionOcupacion.fecha_hora.desc())
        .limit(min(limite, 200))
        .all()
    )
    return [
        schemas.FrameAnalysisResponse(
            fecha_hora=r.fecha_hora,
            personas=[],
            personas_detectadas=r.personas_detectadas,
            estado_ocupacion=r.estado_ocupacion,
            elementos_iluminacion=[],
            porcentaje_natural=0.0,
            porcentaje_artificial=0.0,
            brillo_escena=0.0,
            tipo_iluminacion="",
            recomendacion="",
            id_deteccion=r.id_deteccion,
        )
        for r in registros
    ]
