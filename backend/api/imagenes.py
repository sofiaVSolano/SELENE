"""Imagenes de deteccion en disco (JPEG), enlazadas desde
`DeteccionOcupacion.imagen_referencia`.

Antes esta imagen no se guardaba en ningun lado del servidor: el frontend la
llevaba consigo como data URL en `localStorage` (ver `frontend/src/lib/
almacen.js`), y por eso la columna `imagen_referencia` aparecia siempre en
`null` en la base -- existia desde el diseño original pero nadie la llenaba.

Donde viven los archivos: junto al propio `.db`, no en `settings.project_root`
directo. `settings.database_url` es la unica fuente de verdad de donde esta la
base (en Docker apunta a `/app/data/selene.db`, un bind mount aparte de
`/app/database` -- ver el comentario en `docker-compose.yml` sobre por que esa
carpeta esta separada); poniendo `imagenes/` como hermana de ese archivo, las
fotos quedan en el MISMO volumen persistente que ya sobrevive a un
`docker compose up --build`, sin declarar un volumen nuevo.

Se guarda solo el NOMBRE de archivo en `imagen_referencia` (no la ruta
completa): la carpeta se resuelve en runtime a partir de `database_url`, asi
que si algun dia cambia donde vive el `.db`, no hay que reescribir filas viejas.
"""

from __future__ import annotations

import datetime as dt
import logging
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.orm import Session

from . import models
from .config import settings

logger = logging.getLogger("api.imagenes")


def _ruta_sqlite() -> Path:
    """Misma logica que `db_init._ruta_sqlite()`, duplicada a proposito: ese
    modulo hace inicializacion de esquema de una sola vez y este hace
    lectura/escritura de archivos en cada peticion; no vale la pena acoplar
    los dos por una funcion de una linea."""
    sin_esquema = settings.database_url.removeprefix("sqlite:///")
    return Path(sin_esquema)


def _directorio_imagenes() -> Path:
    directorio = _ruta_sqlite().parent / "imagenes"
    directorio.mkdir(parents=True, exist_ok=True)
    return directorio


def _nombre_archivo(id_deteccion: int) -> str:
    return f"{id_deteccion}.jpg"


def ruta_absoluta(nombre_archivo: str) -> Path:
    return _directorio_imagenes() / nombre_archivo


def guardar_imagen(id_deteccion: int, contenido_jpeg: bytes) -> str | None:
    """Escribe el JPEG a disco y devuelve el nombre de archivo a guardar en
    `imagen_referencia`. No lanza si falla la escritura -- una foto que no se
    pudo guardar no debe tumbar `POST /api/deteccion/frame`, que ya analizo el
    fotograma y tiene que responder con el resultado igual."""
    nombre = _nombre_archivo(id_deteccion)
    try:
        ruta_absoluta(nombre).write_bytes(contenido_jpeg)
        return nombre
    except OSError:
        logger.warning("No se pudo guardar la imagen de la deteccion %s.", id_deteccion, exc_info=True)
        return None


def eliminar_imagen(nombre_archivo: str | None) -> None:
    """Borra el archivo si existe. Silencioso ante ausencia: borrar una
    imagen que ya no esta (dos clics, o una limpieza que se le adelanto) no es
    un error."""
    if not nombre_archivo:
        return
    try:
        ruta_absoluta(nombre_archivo).unlink(missing_ok=True)
    except OSError:
        logger.warning("No se pudo borrar el archivo de imagen %s.", nombre_archivo, exc_info=True)


def limpiar_imagenes_antiguas(db: Session, dias: int = 60) -> int:
    """Borra del disco las imagenes de detecciones con mas de `dias` de
    antiguedad y deja `imagen_referencia` en NULL -- la fila y sus cifras
    (personas, %, consumo, recomendacion...) NO se tocan, solo el archivo
    pesado. Es una decision de retencion explicita: los datos cuantitativos
    del historial no tienen por que caducar solo porque la evidencia visual
    si lo hace.

    Devuelve cuantas imagenes se limpiaron. Pensada para llamarse desde un
    hilo periodico en el startup (ver `main.py`), igual que la precarga de
    modelos."""
    corte = dt.datetime.now(dt.timezone.utc) - dt.timedelta(days=dias)
    filas = db.scalars(
        select(models.DeteccionOcupacion).where(
            models.DeteccionOcupacion.imagen_referencia.is_not(None),
            models.DeteccionOcupacion.fecha_hora < corte,
        )
    ).all()

    for fila in filas:
        eliminar_imagen(fila.imagen_referencia)
        fila.imagen_referencia = None

    if filas:
        db.commit()
        logger.info("Limpieza de imagenes: %d detección(es) de más de %d días quedaron sin imagen.", len(filas), dias)
    return len(filas)
