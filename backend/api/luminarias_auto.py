"""Registro AUTOMATICO de las luminarias de una sala, a partir de lo que ve la camara.

Las luminarias ya no se escriben a mano: SELENE las detecta. Este modulo es el
puente entre "el detector vio 3 luminarias en el fotograma" y "la sala X tiene
3 luminarias registradas", que es lo que necesitan el historial, el desglose
por luminaria del reporte y el seguimiento de encendido/apagado.

Dos decisiones que sostienen todo lo demas:

**El registro solo CRECE.** Si un fotograma ve 3 luminarias y el siguiente 2
(alguien pasa por delante, cambia el encuadre, una queda fuera de plano), la
sala sigue teniendo 3. Borrar la tercera arrastraria en cascada su historial
—detecciones, eventos, consumo— por un encuadre desafortunado. Se registra el
maximo visto, no el ultimo.

**Los vatios no se detectan.** Ninguna camara ve la potencia de una lampara.
Cada luminaria nace con la potencia declarada de su sala
(`zonas.potencia_luminaria_w`), que es el unico numero del consumo que sigue
siendo una afirmacion del usuario. Cambiar la potencia de la sala actualiza
las luminarias que SELENE creo, porque nadie las escribio a mano y no hay nada
que respetar.
"""

from __future__ import annotations

import logging

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from . import models

logger = logging.getLogger("api.luminarias_auto")

# Nombre de las luminarias que registra SELENE. El numero es su posicion en la
# sala, no una identidad estable de la lampara fisica: el detector no puede
# decir si la que ve hoy en el centro es la misma de ayer.
PREFIJO = "Luminaria"


def _nombre(indice: int) -> str:
    return f"{PREFIJO} {indice}"


def luminarias_de(db: Session, id_zona) -> list[models.Luminaria]:
    return list(
        db.scalars(
            select(models.Luminaria)
            .where(models.Luminaria.id_zona == id_zona)
            .order_by(models.Luminaria.created_at.asc())
        ).all()
    )


def sincronizar(db: Session, zona: models.Zona, vistas: int) -> list[models.Luminaria]:
    """Deja la sala con al menos `vistas` luminarias registradas y las devuelve.

    Siempre deja al menos UNA aunque el detector no vea ninguna: es la que
    ancla la deteccion del fotograma, y sin ella la sala no podria registrar
    ocupacion ni consumo. Una sala vigilada con la luz apagada tiene que poder
    decir "aqui no habia nadie y no habia luz encendida", y eso tambien es un
    dato.

    No hace `commit`: lo controla el router junto con el resto del fotograma.
    """
    existentes = luminarias_de(db, zona.id_zona)
    objetivo = max(1, int(vistas or 0))
    if len(existentes) >= objetivo:
        return existentes

    potencia = float(zona.potencia_luminaria_w or 18.0)
    for i in range(len(existentes) + 1, objetivo + 1):
        db.add(models.Luminaria(
            nombre=_nombre(i),
            id_zona=zona.id_zona,
            tipo="LED",
            potencia_w=potencia,
        ))
    db.flush()

    nuevas = objetivo - len(existentes)
    logger.info(
        "Sala %s: registradas %d luminaria(s) nueva(s) por vision (total %d).",
        zona.nombre, nuevas, objetivo,
    )
    return luminarias_de(db, zona.id_zona)


def repartir_encendidas(luminarias: list[models.Luminaria], encendidas: int) -> list[bool]:
    """Que luminarias de la sala se dan por encendidas en este fotograma.

    El detector dice CUANTAS estan emitiendo, no CUALES: no hay forma de casar
    una caja del fotograma con un registro de la base entre fotogramas. Se
    marcan las `n` primeras, que es arbitrario pero consistente — y lo que
    importa aguas abajo es cuantos ciclos de consumo hay abiertos a la vez,
    no cual de ellos corresponde a que lampara del techo.
    """
    n = max(0, min(int(encendidas or 0), len(luminarias)))
    return [i < n for i in range(len(luminarias))]


def actualizar_potencia(db: Session, zona: models.Zona, potencia: float) -> int:
    """Propaga la potencia declarada de la sala a sus luminarias.

    Se pisa el valor sin preguntar porque estas luminarias las creo SELENE con
    la potencia de la sala: no hay un valor escrito por el usuario que pudiera
    perderse. Devuelve cuantas se actualizaron.
    """
    actualizadas = db.query(models.Luminaria).filter(
        models.Luminaria.id_zona == zona.id_zona,
        models.Luminaria.potencia_w != potencia,
    ).update({models.Luminaria.potencia_w: potencia, models.Luminaria.updated_at: func.now()},
             synchronize_session=False)
    return int(actualizadas or 0)
