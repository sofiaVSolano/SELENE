"""Punto de entrada de la API de SELENE.

Ejecutar desde `backend/` con:
    uvicorn api.main:app --reload --port 8000
"""

from __future__ import annotations

import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import settings
from .routers import alertas, asistente, auth, deteccion, energia, luminarias, recorrido

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
app.include_router(luminarias.router)
app.include_router(deteccion.router)
app.include_router(alertas.router)
app.include_router(energia.router)
app.include_router(asistente.router)
app.include_router(recorrido.router)


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

    # Carga los modelos de vision UNA vez al arrancar (no en la primera
    # peticion), para que el dashboard no espere el costo de inicializacion
    # de CUDA/pesos en el primer escaneo.
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
