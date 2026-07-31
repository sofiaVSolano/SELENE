"""Conecta el pipeline de vision (`api.detection_service`) con el modulo
energetico: arma el `EscenarioVision` de cada frame analizado y mantiene el
tracking real de encendido/apagado por luminaria (`consumo_energetico`,
`eventos`).

Antes de este modulo, `/api/energia/analizar` solo se podia disparar a mano
con un `EscenarioVision` armado por el caller (ver docstring historico de
`routers/energia.py`); esto cierra esa conexion para que cada frame del loop
de camara (`CameraPanel.jsx`, ~1 cada 1.4s) alimente el modelo LightGBM y el
historial real de consumo sin intervencion manual.
"""

from __future__ import annotations

import datetime as dt
import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import models
from ..config import settings
from . import context
from .schemas import EscenarioVision


def construir_escenario_vision(
    resultado: dict,
    tipo_espacio: str,
    fecha_hora: dt.datetime,
    captura_id: int | None,
) -> EscenarioVision:
    """Traduce el dict que devuelve `detection_service.analyze_frame` al
    contrato de entrada del modulo energetico."""
    return EscenarioVision(
        personas_detectadas=resultado["personas_detectadas"],
        num_ventanas=resultado["num_ventanas"],
        num_luminarias=resultado["num_luminarias"],
        area_ventanas_relativa=resultado["area_ventanas_relativa"],
        area_luminarias_relativa=resultado["area_luminarias_relativa"],
        brillo_escena=resultado["brillo_escena"],
        brillo_ventanas=resultado["brillo_ventanas"],
        brillo_luminarias=resultado["brillo_luminarias"],
        natural_score=resultado["natural_score"],
        artificial_score=resultado["artificial_score"],
        porcentaje_natural=resultado["porcentaje_natural"],
        porcentaje_artificial=resultado["porcentaje_artificial"],
        tipo_iluminacion=resultado["tipo_iluminacion"],
        fecha_hora=fecha_hora,
        tipo_espacio=tipo_espacio,
        captura_id=captura_id,
    )


def calcular_horas_transcurridas(db: Session, id_luminaria: uuid.UUID, fecha_hora: dt.datetime) -> float:
    """Horas reales desde el frame anterior de esta luminaria, acotadas entre
    1 segundo y `horas_tramo_captura()` (el modelo predice kWh para ese
    tramo "nativo"; un hueco de horas sin escanear no debe atribuirsele
    entero al frame que retoma el escaneo).

    Si es el primer frame de la luminaria (no hay anterior), se usa
    `horas_tramo_captura()` completo: es el mismo supuesto con el que el
    modelo fue entrenado (una prediccion = un tramo nativo).
    """
    tope_horas = context.horas_tramo_captura()

    anterior = db.scalars(
        select(models.DeteccionOcupacion.fecha_hora)
        .where(
            models.DeteccionOcupacion.id_luminaria == id_luminaria,
            models.DeteccionOcupacion.fecha_hora < fecha_hora,
        )
        .order_by(models.DeteccionOcupacion.fecha_hora.desc())
        .limit(1)
    ).first()

    if anterior is None:
        return tope_horas

    horas_transcurridas = (fecha_hora - anterior).total_seconds() / 3600.0
    return max(1.0 / 3600.0, min(horas_transcurridas, tope_horas))


def actualizar_estado_luminaria(
    db: Session,
    luminaria: models.Luminaria,
    resultado: dict,
    deteccion_id: int | None,
    fecha_hora: dt.datetime,
) -> None:
    """Detecta transiciones encendida<->apagada (umbral `luz_encendida_umbral_pct`
    sobre `porcentaje_artificial`) y las persiste como lo haria un sistema con
    sensado real: actualiza `luminarias.estado_actual`, registra el evento
    ('encendido'/'apagado') y abre/cierra el ciclo correspondiente en
    `consumo_energetico` (con su duracion y kWh reales al cerrarlo).

    No hace `db.commit()`: el caller (router) controla la transaccion junto
    con el resto de escrituras del frame.
    """
    encendida = resultado["porcentaje_artificial"] >= settings.luz_encendida_umbral_pct
    estado_nuevo = "encendida" if encendida else "apagada"
    if estado_nuevo == luminaria.estado_actual:
        return

    luminaria.estado_actual = estado_nuevo

    if estado_nuevo == "encendida":
        db.add(models.Evento(
            id_luminaria=luminaria.id_luminaria,
            id_deteccion_origen=deteccion_id,
            fecha_hora_origen=fecha_hora,
            tipo_evento="encendido",
            descripcion=f"Iluminacion artificial detectada por vision ({resultado['porcentaje_artificial']:.1f}%).",
        ))
        db.add(models.ConsumoEnergetico(
            id_luminaria=luminaria.id_luminaria,
            fecha_hora_inicio=fecha_hora,
        ))
        return

    ciclo_abierto = db.scalars(
        select(models.ConsumoEnergetico)
        .where(
            models.ConsumoEnergetico.id_luminaria == luminaria.id_luminaria,
            models.ConsumoEnergetico.fecha_hora_fin.is_(None),
        )
        .order_by(models.ConsumoEnergetico.fecha_hora_inicio.desc())
        .limit(1)
    ).first()

    if ciclo_abierto is not None:
        ciclo_abierto.fecha_hora_fin = fecha_hora
        horas = (fecha_hora - ciclo_abierto.fecha_hora_inicio).total_seconds() / 3600.0
        ciclo_abierto.energia_consumida_kwh = round(float(luminaria.potencia_w) / 1000.0 * max(horas, 0.0), 4)

    db.add(models.Evento(
        id_luminaria=luminaria.id_luminaria,
        id_deteccion_origen=deteccion_id,
        fecha_hora_origen=fecha_hora,
        tipo_evento="apagado",
        descripcion=f"Sin iluminacion artificial detectada por vision ({resultado['porcentaje_artificial']:.1f}%).",
    ))
