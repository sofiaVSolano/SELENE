"""Esquemas Pydantic del modulo energetico.

`EscenarioVision` es el contrato de entrada: exactamente las variables que el
enunciado del sistema de vision por computador promete entregar por imagen
procesada. El resto de clases son las salidas (prediccion, simulaciones,
comparaciones, emisiones, indicadores, recomendaciones) que arma este modulo.
"""

from __future__ import annotations

import datetime as dt
from typing import Literal

from pydantic import BaseModel, Field

TipoIluminacion = Literal["Natural", "Artificial", "Mixta"]
TipoEspacio = Literal["comedor", "salon", "laboratorio", "auditorio", "oficina"]


class EscenarioVision(BaseModel):
    """Salida ya calculada por el pipeline de vision para una imagen/frame.

    Este modulo NO se conecta todavia a `detection_service`/`lightingAnalyzer`
    (ver alcance del encargo): se asume que estas variables ya existen y
    llegan pobladas, por lo que aqui solo se validan/tipan.
    """

    personas_detectadas: int = Field(ge=0)
    num_ventanas: int = Field(ge=0)
    num_luminarias: int = Field(ge=0)
    area_ventanas_relativa: float = Field(
        ge=0, le=1, description="Suma de relative_area de las ventanas detectadas (0-1, fraccion del frame)."
    )
    area_luminarias_relativa: float = Field(
        ge=0, le=1, description="Suma de relative_area de las luminarias detectadas (0-1, fraccion del frame)."
    )
    brillo_escena: float = Field(ge=0, le=100, description="Brillo promedio de la escena, 0-100.")
    brillo_ventanas: float = Field(ge=0, le=255, description="Brillo promedio (canal V) de las ventanas, 0-255.")
    brillo_luminarias: float = Field(ge=0, le=255, description="Brillo promedio (canal V) de las luminarias, 0-255.")
    natural_score: float = Field(ge=0, le=1)
    artificial_score: float = Field(ge=0, le=1)
    porcentaje_natural: float = Field(ge=0, le=100)
    porcentaje_artificial: float = Field(ge=0, le=100)
    tipo_iluminacion: TipoIluminacion
    fecha_hora: dt.datetime
    tipo_espacio: TipoEspacio

    perfil_contexto: str = Field(
        default="default",
        description="Clave dentro de configs/energy_context.yaml -> perfiles_contexto.",
    )
    captura_id: int | None = Field(
        default=None,
        description="id_deteccion de detecciones_ocupacion, si esta escena ya quedo persistida (referencia suave, sin FK).",
    )


class AnalizarEscenarioRequest(BaseModel):
    """Body del endpoint POST /api/energia/analizar."""

    escenario: EscenarioVision
    contexto_overrides: dict = Field(
        default_factory=dict,
        description="Sobrescribe campos puntuales del perfil de contexto (p. ej. area_m2 real de la instalacion).",
    )
    guardar: bool = Field(default=False, description="Si True, persiste el reporte en las tablas del modulo energetico.")


class SimularEscenarioRequest(BaseModel):
    """Body del endpoint POST /api/energia/simulaciones/{tipo}."""

    escenario: EscenarioVision
    contexto_overrides: dict = Field(default_factory=dict)


class ContextoInstalacion(BaseModel):
    """Metadata estatica del espacio monitoreado que el modelo necesita pero
    la camara no puede ver (ver configs/energy_context.yaml)."""

    sede: str
    ciudad: str
    nombre_completo: str
    periodo_academico: str
    area_m2: float = Field(gt=0)
    num_estudiantes: float = Field(ge=0)
    num_empleados: float = Field(ge=0)
    num_edificios: float = Field(ge=0)
    tiene_residencias: bool
    tiene_laboratorios_pesados: bool
    altitud_msnm: float
    temp_promedio_c: float
    agua_litros: float = Field(ge=0)
    temperatura_exterior_c: float
    es_semana_parciales: bool
    es_semana_finales: bool
    capacidad_personas: float = Field(gt=0)


class PrediccionConsumo(BaseModel):
    modelo_utilizado: str
    variables_entrada: dict
    consumo_kwh: float
    tiempo_inferencia_ms: float
    confianza: float | None = None


class SimulacionResultado(BaseModel):
    tipo_simulacion: str
    descripcion: str
    escenario_original: dict
    escenario_simulado: dict
    consumo_original_kwh: float
    consumo_simulado_kwh: float
    ahorro_kwh: float
    ahorro_porcentaje: float


class ComparacionEscenarios(BaseModel):
    consumo_actual_kwh: float
    consumo_optimizado_kwh: float
    diferencia_kwh: float
    diferencia_porcentaje: float
    ganancia_energetica_kwh: float


class EmisionesResultado(BaseModel):
    factor_kg_por_kwh: float
    co2_actual_kg: float
    co2_optimizado_kg: float
    co2_evitable_kg: float
    reduccion_porcentaje: float


class IndicadoresEnergeticos(BaseModel):
    consumo_por_persona_kwh: float | None
    consumo_por_luminaria_kwh: float | None
    consumo_por_m2_kwh: float
    intensidad_energetica_kwh_m2: float
    indice_aprovechamiento_natural: float
    indice_eficiencia_energetica: float
    nivel_ocupacion_pct: float
    nivel_ocupacion_categoria: str
    relacion_ocupacion_artificial: float | None


class RecomendacionEnergetica(BaseModel):
    tipo_recomendacion: str
    descripcion: str
    consumo_antes_kwh: float
    consumo_despues_kwh: float
    ahorro_kwh: float
    ahorro_porcentaje: float
    co2_evitable_kg: float
    prioridad: Literal["baja", "media", "alta", "critica"]


class ReporteEnergetico(BaseModel):
    fecha_hora: dt.datetime
    captura_id: int | None
    contexto: ContextoInstalacion
    prediccion: PrediccionConsumo
    consumo_esperado_kwh: float
    consumo_optimizado_kwh: float
    ahorro_kwh: float
    ahorro_porcentaje: float
    comparacion: ComparacionEscenarios
    emisiones: EmisionesResultado
    indicadores: IndicadoresEnergeticos
    simulaciones: list[SimulacionResultado]
    recomendaciones: list[RecomendacionEnergetica]
