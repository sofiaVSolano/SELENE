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
from fastapi.responses import FileResponse
from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import detection_service, imagenes, luminarias_auto, models, schemas
from ..database import get_db
from ..deps import get_current_user
from ..energy import context as energy_context
from ..energy import vision_bridge
from ..energy.service import generar_reporte_energetico

router = APIRouter(prefix="/api/deteccion", tags=["deteccion"])
logger = logging.getLogger("api.routers.deteccion")


def _imagen_url(id_deteccion: int | None, imagen_referencia: str | None) -> str | None:
    """Ruta RELATIVA (no absoluta con `request.url_for`) a propósito: el
    frontend ya antepone `API_URL` a todo lo que pide (ver `lib/api.js`), y
    una URL absoluta armada en el servidor podría no coincidir con el host
    que ve el navegador si hay un proxy por delante (ver `nginx` en el
    docker-compose de producción) -- el mismo enlace debe funcionar detrás de
    cualquier proxy sin que el backend tenga que saber su propio host público.
    """
    if id_deteccion is None or not imagen_referencia:
        return None
    return f"/api/deteccion/{id_deteccion}/imagen"


@router.post("/frame", response_model=schemas.FrameAnalysisResponse)
def analizar_frame(
    imagen: UploadFile = File(...),
    id_zona: uuid.UUID | None = Form(default=None),
    id_luminaria: uuid.UUID | None = Form(default=None),
    db: Session = Depends(get_db),
    _usuario: models.Usuario = Depends(get_current_user),
) -> schemas.FrameAnalysisResponse:
    """Se monitorea una SALA (`id_zona`): SELENE registra sola las luminarias
    que va viendo en ella (ver `api/luminarias_auto.py`), porque no se
    escriben a mano. `id_luminaria` se mantiene para quien ya llamaba asi a la
    API y apunta a una luminaria concreta.
    """
    raw = imagen.file.read()
    try:
        frame_bgr = detection_service.decode_image(raw)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    resultado = detection_service.analyze_frame(frame_bgr)

    deteccion_id = None
    consumo_estimado_kwh = None
    ahorro_estimado_kwh = None
    luminarias_sala: list[models.Luminaria] = []

    if id_zona is not None:
        zona = db.get(models.Zona, id_zona)
        if zona is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Sala no encontrada.")
        # El detector manda: la sala termina con tantas luminarias como se han
        # llegado a ver en ella.
        luminarias_sala = luminarias_auto.sincronizar(db, zona, resultado["num_luminarias"])
        # La deteccion del fotograma se ancla a la primera: es UNA fila por
        # fotograma, como siempre. El consumo no se ancla aqui, se reparte
        # abajo abriendo un ciclo por luminaria encendida.
        luminaria = luminarias_sala[0]
        id_luminaria = luminaria.id_luminaria
    elif id_luminaria is not None:
        luminaria = db.get(models.Luminaria, id_luminaria)
        if luminaria is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Luminaria no encontrada.")

    if id_luminaria is not None:
        registro = models.DeteccionOcupacion(
            id_luminaria=id_luminaria,
            # La sala se sella en la fila, no se deduce despues de
            # `luminaria.zona` (ver el comentario largo en
            # `models.py::DeteccionOcupacion`). Si vino por `id_luminaria`
            # suelto (camino viejo, sin `id_zona`), se toma la de esa
            # luminaria: sigue siendo "la sala activa al capturar".
            id_zona=id_zona or luminaria.id_zona,
            personas_detectadas=resultado["personas_detectadas"],
            confianza=resultado["confianza_max_persona"] or None,
            estado_ocupacion=resultado["estado_ocupacion"],
            num_ventanas=resultado["num_ventanas"],
            num_luminarias=resultado["num_luminarias"],
            num_luminarias_encendidas=resultado["num_luminarias_encendidas"],
            porcentaje_natural=resultado["porcentaje_natural"],
            porcentaje_artificial=resultado["porcentaje_artificial"],
            natural_score=resultado["natural_score"],
            artificial_score=resultado["artificial_score"],
            recomendacion=resultado["recomendacion"],
        )
        db.add(registro)
        db.commit()
        db.refresh(registro)
        deteccion_id = registro.id_deteccion

        # La imagen se guarda YA y se confirma aparte: si el paso energetico
        # de mas abajo falla y hace rollback, la fotografia (que ya esta en
        # disco de todos modos) no debe perder su referencia en la fila.
        nombre_imagen = imagenes.guardar_imagen(deteccion_id, raw)
        if nombre_imagen:
            registro.imagen_referencia = nombre_imagen
            db.commit()

        # Tracking real de encendido/apagado (consumo_energetico, eventos):
        # se guarda siempre, sin depender de que el paso de LightGBM de abajo
        # funcione (es la fuente de verdad de "cuanto tiempo estuvo encendida").
        #
        # Con una sala se actualizan TODAS sus luminarias, no solo la que
        # ancla la deteccion: asi el consumo real sale de tantos ciclos
        # abiertos como lamparas encendidas hay, en vez de contar siempre una.
        if luminarias_sala:
            estados = luminarias_auto.repartir_encendidas(
                luminarias_sala, resultado["num_luminarias_encendidas"],
            )
            for lum, encendida in zip(luminarias_sala, estados):
                vision_bridge.actualizar_estado_luminaria(
                    db, lum, resultado, deteccion_id, registro.fecha_hora, encendida=encendida,
                )
        else:
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
            # Se reflejan en la fila para que el historial (`GET
            # /api/deteccion/historial`) muestre el mismo numero que esta
            # respuesta, en vez de quedarse siempre en None.
            registro.consumo_estimado_kwh = consumo_estimado_kwh
            registro.ahorro_estimado_kwh = ahorro_estimado_kwh
            db.commit()
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
        num_ventanas=resultado["num_ventanas"],
        num_luminarias=resultado["num_luminarias"],
        num_luminarias_encendidas=resultado["num_luminarias_encendidas"],
        area_ventanas_relativa=resultado["area_ventanas_relativa"],
        area_luminarias_relativa=resultado["area_luminarias_relativa"],
        brillo_ventanas=resultado["brillo_ventanas"],
        brillo_luminarias=resultado["brillo_luminarias"],
        natural_score=resultado["natural_score"],
        artificial_score=resultado["artificial_score"],
        confianza_max_persona=resultado["confianza_max_persona"] or 0.0,
        imagen_url=_imagen_url(
            deteccion_id, registro.imagen_referencia if deteccion_id is not None else None
        ),
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


@router.get("/historial", response_model=list[schemas.DeteccionHistorialItem])
def listar_historial(
    id_zona: uuid.UUID | None = None,
    limite: int = 60,
    offset: int = 0,
    db: Session = Depends(get_db),
    _usuario: models.Usuario = Depends(get_current_user),
) -> list[schemas.DeteccionHistorialItem]:
    """La galería de Historial · Capturas del frontend. Reemplaza lo que antes
    salía de `localStorage` (`lib/almacen.js`): estas filas SÍ traen el
    snapshot completo del análisis y una URL de imagen real, porque
    `POST /frame` ahora los persiste (ver el comentario largo en
    `models.py::DeteccionOcupacion`).
    """
    consulta = select(models.DeteccionOcupacion).order_by(models.DeteccionOcupacion.fecha_hora.desc())
    if id_zona is not None:
        consulta = consulta.where(models.DeteccionOcupacion.id_zona == id_zona)
    registros = db.scalars(consulta.offset(max(0, offset)).limit(min(limite, 200))).all()

    zonas_por_id = {z.id_zona: z.nombre for z in db.scalars(select(models.Zona)).all()}

    return [
        schemas.DeteccionHistorialItem(
            id_deteccion=r.id_deteccion,
            fecha_hora=r.fecha_hora,
            id_zona=r.id_zona,
            zona=zonas_por_id.get(r.id_zona) if r.id_zona else None,
            personas_detectadas=r.personas_detectadas,
            estado_ocupacion=r.estado_ocupacion,
            num_ventanas=r.num_ventanas,
            num_luminarias=r.num_luminarias,
            num_luminarias_encendidas=r.num_luminarias_encendidas,
            porcentaje_natural=r.porcentaje_natural,
            porcentaje_artificial=r.porcentaje_artificial,
            natural_score=r.natural_score,
            artificial_score=r.artificial_score,
            consumo_estimado_kwh=r.consumo_estimado_kwh,
            ahorro_estimado_kwh=r.ahorro_estimado_kwh,
            recomendacion=r.recomendacion,
            confianza=r.confianza,
            imagen_url=_imagen_url(r.id_deteccion, r.imagen_referencia),
        )
        for r in registros
    ]


@router.delete("/historial", status_code=status.HTTP_204_NO_CONTENT)
def vaciar_historial(
    id_zona: uuid.UUID | None = None,
    db: Session = Depends(get_db),
    _usuario: models.Usuario = Depends(get_current_user),
) -> None:
    """«Borrar todas» del historial de capturas — opcionalmente restringido a
    una sala, igual que el filtro de `listar_historial`.

    Ruta literal, registrada ANTES que `/{id_deteccion}` a propósito: aunque
    Starlette ya hace fallback correcto cuando la conversión a `int` de
    "historial" falla, declarar el orden así no depende de ese detalle."""
    consulta = select(models.DeteccionOcupacion)
    if id_zona is not None:
        consulta = consulta.where(models.DeteccionOcupacion.id_zona == id_zona)
    registros = db.scalars(consulta).all()
    ids = [r.id_deteccion for r in registros]

    if ids:
        db.query(models.Recomendacion).filter(
            models.Recomendacion.id_deteccion_origen.in_(ids)
        ).update({"id_deteccion_origen": None}, synchronize_session=False)

    for registro in registros:
        imagenes.eliminar_imagen(registro.imagen_referencia)
        db.delete(registro)
    db.commit()


@router.get("/{id_deteccion}/imagen", name="obtener_imagen_deteccion")
def obtener_imagen_deteccion(
    id_deteccion: int,
    db: Session = Depends(get_db),
    _usuario: models.Usuario = Depends(get_current_user),
) -> FileResponse:
    registro = db.get(models.DeteccionOcupacion, id_deteccion)
    if registro is None or not registro.imagen_referencia:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Esta detección no tiene imagen guardada.")

    ruta = imagenes.ruta_absoluta(registro.imagen_referencia)
    if not ruta.exists():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="La imagen ya no existe en disco.")

    return FileResponse(ruta, media_type="image/jpeg")


@router.delete("/{id_deteccion}", status_code=status.HTTP_204_NO_CONTENT)
def eliminar_deteccion(
    id_deteccion: int,
    db: Session = Depends(get_db),
    _usuario: models.Usuario = Depends(get_current_user),
) -> None:
    """Borra una captura del historial: el archivo de imagen y la fila. Las
    alertas que se hayan disparado desde esta detección NO se borran — solo
    pierden el enlace a la imagen (`Recomendacion.id_deteccion_origen` pasa a
    NULL), igual que decide `imagenes.limpiar_imagenes_antiguas` con el paso
    del tiempo."""
    registro = db.get(models.DeteccionOcupacion, id_deteccion)
    if registro is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Detección no encontrada.")

    db.query(models.Recomendacion).filter(
        models.Recomendacion.id_deteccion_origen == id_deteccion
    ).update({"id_deteccion_origen": None}, synchronize_session=False)

    imagenes.eliminar_imagen(registro.imagen_referencia)
    db.delete(registro)
    db.commit()
