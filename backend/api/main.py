"""Punto de entrada de la API de SELENE.

Ejecutar desde `backend/` con:
    uvicorn api.main:app --reload --port 8000
"""

from __future__ import annotations

import datetime as dt
import logging
import threading

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import settings
from .routers import alertas, asistente, auth, configuracion, deteccion, energia, luminarias, recorrido, zonas

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("api.main")

app = FastAPI(
    title="SELENE API",
    description="Gestion inteligente de luminarias: ocupacion, iluminacion y alertas.",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(zonas.router)
app.include_router(luminarias.router)
app.include_router(deteccion.router)
app.include_router(alertas.router)
app.include_router(energia.router)
app.include_router(asistente.router)
app.include_router(recorrido.router)
app.include_router(configuracion.router)


@app.get("/api/health", tags=["health"])
def health() -> dict:
    return {"status": "ok", "service": "selene-api"}


@app.on_event("startup")
def _startup() -> None:
    # SQLite es un archivo: la propia API se asegura de que el esquema
    # exista antes de atender la primera peticion (antes, con Postgres,
    # esto lo hacia un contenedor `db-init` aparte esperando a que el
    # servidor de base de datos levantara). Idempotente: no hace nada si
    # `database/selene.db` ya tiene las tablas.
    from .db_init import aplicar_schema, sembrar_usuario_demo

    aplicar_schema()
    sembrar_usuario_demo()

    # La precarga de modelos va en un hilo aparte A PROPOSITO: uvicorn no
    # acepta ni una conexion hasta que este startup retorna, y cargar los dos
    # checkpoints de deteccion + el modelo energetico tarda de decenas de
    # segundos a minutos en una VM sin GPU. Hacerlo aqui de forma sincrona
    # dejaba el puerto publicado pero sin nadie escuchando detras, y el login
    # respondia "502 Bad Gateway" hasta que terminaba la carga.
    #
    # El costo de inicializacion se sigue pagando una sola vez y fuera de la
    # primera peticion real (que era el objetivo original): simplemente ocurre
    # en paralelo mientras el usuario entra, en vez de bloquear el arranque.
    threading.Thread(target=_precargar_modelos, name="warmup", daemon=True).start()

    # Limpieza de imagenes de mas de 60 dias (ver `imagenes.py`): corre una
    # vez al arrancar y luego cada 24h, en su propio hilo daemon -- mismo
    # patron que la precarga de modelos de arriba. No borra la fila de la
    # deteccion ni sus cifras, solo el archivo pesado y su referencia.
    threading.Thread(target=_limpieza_periodica, name="limpieza-imagenes", daemon=True).start()

    # Resumen diario de actividad por correo (ver `email_reports.py` y
    # `routers/configuracion.py`): a diferencia de los dos hilos de arriba,
    # este SI necesita granularidad de minuto (una cuenta puede pedir que le
    # llegue a las 08:03), asi que revisa cada 60s en vez de una vez al dia.
    threading.Thread(target=_reportes_email_periodico, name="reportes-email", daemon=True).start()


_UN_DIA_SEGUNDOS = 24 * 60 * 60
_UN_MINUTO_SEGUNDOS = 60


def _limpieza_periodica() -> None:
    from .database import SessionLocal
    from .imagenes import limpiar_imagenes_antiguas

    while True:
        db = SessionLocal()
        try:
            limpiar_imagenes_antiguas(db, dias=60)
        except Exception:  # noqa: BLE001 - limpieza de fondo; no debe tumbar el hilo ni el servidor.
            logger.warning("Fallo la limpieza periodica de imagenes de deteccion.", exc_info=True)
        finally:
            db.close()
        threading.Event().wait(_UN_DIA_SEGUNDOS)


def _reportes_email_periodico() -> None:
    """Cada minuto, revisa que cuentas tienen el resumen diario activo
    (`configuracion_reportes_email.activo = 1`) y cuya `hora_envio` es la hora
    actual en `settings.app_timezone`. `ultima_fecha_enviada` es lo que evita
    mandar el mismo correo dos veces si el reloj vuelve a pasar por esa
    hora:minuto (o si el servidor se reinicia despues de ya haber enviado).

    Cada cuenta se envia con su propia sesion/commit: que a una le falle el
    SMTP (destino invalido, etc.) no debe dejar sin enviar a las demas ni
    tumbar el hilo."""
    from sqlalchemy import or_, select

    from . import models
    from .database import SessionLocal
    from .email_reports import enviar_resumen_diario, zona_horaria

    while True:
        try:
            tz = zona_horaria()
            ahora_local = dt.datetime.now(tz)
            hora_actual = ahora_local.strftime("%H:%M")
            hoy_str = ahora_local.date().isoformat()

            db = SessionLocal()
            try:
                pendientes = db.scalars(
                    select(models.ConfiguracionReporteEmail).where(
                        models.ConfiguracionReporteEmail.activo.is_(True),
                        models.ConfiguracionReporteEmail.hora_envio == hora_actual,
                        # `!= hoy_str` a secas descartaria tambien las filas con
                        # `ultima_fecha_enviada IS NULL` (nunca enviado): en SQL,
                        # `NULL != valor` da NULL, no verdadero.
                        or_(
                            models.ConfiguracionReporteEmail.ultima_fecha_enviada.is_(None),
                            models.ConfiguracionReporteEmail.ultima_fecha_enviada != hoy_str,
                        ),
                    )
                ).all()

                for config in pendientes:
                    usuario = db.get(models.Usuario, config.id_usuario)
                    if usuario is None:
                        continue
                    try:
                        enviar_resumen_diario(db, usuario, config.correo_destino, ahora_local.date())
                        config.ultima_fecha_enviada = hoy_str
                        db.commit()
                        logger.info("Resumen diario enviado a %s.", config.correo_destino)
                    except Exception:  # noqa: BLE001 - un SMTP caido no debe tumbar el hilo ni saltarse a las demas cuentas.
                        db.rollback()
                        logger.warning(
                            "No se pudo enviar el resumen diario a %s.", config.correo_destino, exc_info=True,
                        )
            finally:
                db.close()
        except Exception:  # noqa: BLE001 - fallo inesperado del propio hilo (p. ej. zona horaria mal formada); sigue vivo.
            logger.warning("Fallo un ciclo del envio de resumenes diarios.", exc_info=True)

        threading.Event().wait(_UN_MINUTO_SEGUNDOS)


def _precargar_modelos() -> None:
    from . import detection_service
    from .energy import model_loader as energy_model_loader

    try:
        detection_service.warmup_models()
    except FileNotFoundError as exc:
        logger.warning(
            "No se pudieron precargar los modelos de vision (%s). "
            "El servidor sigue arriba; /api/deteccion/frame fallara hasta "
            "que los checkpoints existan en weights/.",
            exc,
        )

    try:
        energy_model_loader.warmup()
    except Exception as exc:  # noqa: BLE001 - dependencia externa (ENERGY_MODEL_DIR/lightgbm); no debe tumbar la API.
        logger.warning(
            "No se pudo precargar el modelo de prediccion energetica (%s). "
            "El servidor sigue arriba; /api/energia/analizar fallara hasta "
            "que ENERGY_MODEL_DIR apunte a ProyectoPrediccionEnergetica y las "
            "dependencias (lightgbm, etc.) esten instaladas.",
            exc,
        )
