"""Modulo de gestion energetica: convierte la salida del sistema de vision en
indicadores de consumo y recomendaciones de ahorro, usando el modelo LightGBM
ya entrenado (ver `api.energy`). Todavia NO esta conectado a
`detection_service`/`lightingAnalyzer` (ver alcance del encargo): el body de
`/analizar` es el propio `EscenarioVision`, tal como lo entregara luego el
pipeline de vision.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from .. import models
from ..database import get_db
from ..deps import get_current_user
from ..energy import context as energy_context
from ..energy import historical, simulations
from ..energy import predictor as energy_predictor
from ..energy.schemas import (
    AnalizarEscenarioRequest,
    ReporteEnergetico,
    SimulacionResultado,
    SimularEscenarioRequest,
)
from ..energy.service import generar_reporte_energetico

router = APIRouter(prefix="/api/energia", tags=["energia"])


@router.post("/analizar", response_model=ReporteEnergetico)
def analizar_escenario(
    payload: AnalizarEscenarioRequest,
    db: Session = Depends(get_db),
    _usuario: models.Usuario = Depends(get_current_user),
) -> ReporteEnergetico:
    return generar_reporte_energetico(
        payload.escenario,
        contexto_overrides=payload.contexto_overrides,
        db=db,
        guardar=payload.guardar,
    )


@router.get("/simulaciones/catalogo")
def catalogo_simulaciones(
    _usuario: models.Usuario = Depends(get_current_user),
) -> list[str]:
    return sorted(simulations.CATALOGO_SIMULACIONES)


@router.post("/simulaciones/{tipo}", response_model=SimulacionResultado)
def simular_escenario(
    tipo: str,
    payload: SimularEscenarioRequest,
    _usuario: models.Usuario = Depends(get_current_user),
) -> SimulacionResultado:
    if tipo not in simulations.CATALOGO_SIMULACIONES:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Simulacion '{tipo}' no existe.")

    contexto = energy_context.resolver_contexto(payload.escenario.perfil_contexto, **payload.contexto_overrides)
    prediccion_base = energy_predictor.predecir_consumo(payload.escenario, contexto)
    return simulations.simular(tipo, payload.escenario, prediccion_base)


@router.get("/historico/comparacion")
def historico_comparacion(
    limite: int = 200,
    db: Session = Depends(get_db),
    _usuario: models.Usuario = Depends(get_current_user),
) -> dict:
    return historical.comparar_actual_vs_optimizado(db, limite=min(limite, 1000))


@router.get("/historico/por-ocupacion")
def historico_por_ocupacion(
    limite: int = 500,
    db: Session = Depends(get_db),
    _usuario: models.Usuario = Depends(get_current_user),
) -> list[dict]:
    return historical.comparar_por_ocupacion(db, limite=min(limite, 2000))


@router.get("/historico/por-simulacion")
def historico_por_simulacion(
    limite: int = 500,
    db: Session = Depends(get_db),
    _usuario: models.Usuario = Depends(get_current_user),
) -> list[dict]:
    return historical.comparar_por_simulacion(db, limite=min(limite, 2000))
