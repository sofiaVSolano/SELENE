"""Catalogo de tipos de reporte que el asistente puede generar en PDF.

Cada clave es mas especifica que `tipo_reporte_enum` (la columna ancha de
`api.models.Reporte`, ver database/schema.sql): ese enum agrupa por
categoria (consumo/ocupacion/patrones/alertas/general), esto agrega el
`clave_reporte` concreto que el usuario elige (o que se le sugiere segun la
conversacion, ver `openai_client.clasificar_tipos_reporte`)."""

from __future__ import annotations

from typing import Literal, TypedDict

ClaveReporte = Literal["consumo_diario", "consumo_mensual", "plan_ahorro", "general", "detallado"]


class DefinicionTipoReporte(TypedDict):
    etiqueta: str
    descripcion_para_llm: str
    tipo_reporte_enum: str


TIPOS_REPORTE: dict[ClaveReporte, DefinicionTipoReporte] = {
    "consumo_diario": {
        "etiqueta": "Consumo de hoy",
        "descripcion_para_llm": "El usuario pregunto por cuanto se ha consumido HOY o en un dia puntual (no un periodo mas largo).",
        "tipo_reporte_enum": "consumo",
    },
    "consumo_mensual": {
        "etiqueta": "Estimado del mes",
        "descripcion_para_llm": "El usuario pregunto por el consumo estimado a lo largo del MES (o un periodo mas largo que un dia), p. ej. por que el recibo salio caro.",
        "tipo_reporte_enum": "consumo",
    },
    "plan_ahorro": {
        "etiqueta": "Plan de ahorro energetico",
        "descripcion_para_llm": "El usuario pregunto como ahorrar energia, pidio recomendaciones o un plan de ahorro.",
        "tipo_reporte_enum": "patrones",
    },
    "general": {
        "etiqueta": "Resumen de la conversacion",
        "descripcion_para_llm": "Resumen general de la conversacion; usar si no aplica ninguno de los otros tipos, o como complemento.",
        "tipo_reporte_enum": "general",
    },
    "detallado": {
        "etiqueta": "Reporte detallado a tu medida",
        "descripcion_para_llm": (
            "El usuario pidio un reporte detallado, extenso o personalizado, o especifico exactamente "
            "que temas, zonas o periodos quiere que se cubran en profundidad -- a diferencia de los "
            "otros tipos (plantillas fijas), este lo redacta el LLM a la medida de lo que se pidio."
        ),
        "tipo_reporte_enum": "general",
    },
}

CLAVE_POR_DEFECTO: ClaveReporte = "general"
