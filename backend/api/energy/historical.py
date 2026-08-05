"""Comparaciones historicas sobre lo ya persistido por `persistence.py`.

Los agregados se resuelven en Python (no con SQL/JSONB avanzado) a proposito:
el volumen esperado de esta tabla (una fila por reporte energetico generado,
no por frame de camara) es bajo comparado con `detecciones_ocupacion`, y
mantener la logica de bucketing en Python la deja facil de ajustar sin tocar
consultas SQL. Si el volumen crece, migrar los `GROUP BY` a la base de datos
es directo porque las columnas ya existen (`consumo_energetico_estimado`,
`predicciones_consumo`, `simulaciones`).
"""

from __future__ import annotations

import datetime as dt
import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import models
from . import context


def _promedio(valores: list[float]) -> float | None:
    return round(sum(valores) / len(valores), 4) if valores else None


def condiciones_zona(modelo, id_zona: uuid.UUID | None) -> list:
    """Condiciones que restringen una consulta a una sala. Lista vacia si
    `id_zona` es None, para que el llamador no tenga que ramificar.

    Hay dos formas de llegar a la sala segun la tabla, y por eso esto existe
    en vez de repetir el join diez veces:

    - `detecciones_ocupacion` y `eventos` guardan `id_luminaria` directo.
    - `consumo_energetico_estimado`, `predicciones_consumo` y `simulaciones`
      NO guardan la luminaria: cuelgan de la deteccion que las origino, asi
      que hay que pasar por ella.
    """
    if id_zona is None:
        return []

    luminarias = select(models.Luminaria.id_luminaria).where(models.Luminaria.id_zona == id_zona)
    if hasattr(modelo, "id_luminaria"):
        return [modelo.id_luminaria.in_(luminarias)]
    return [
        modelo.id_deteccion.in_(
            select(models.DeteccionOcupacion.id_deteccion).where(
                models.DeteccionOcupacion.id_luminaria.in_(luminarias)
            )
        )
    ]


def resumen_periodo(db: Session, desde: dt.datetime, hasta: dt.datetime | None = None,
                    id_zona: uuid.UUID | None = None) -> dict:
    """Suma (no promedio) de consumo/ahorro/CO2 estimado entre `desde` y
    `hasta` (ahora si no se especifica). A diferencia de
    `comparar_actual_vs_optimizado` (que promedia las ultimas N filas, sea
    cual sea el periodo real que cubran), esto da un total fisicamente
    interpretable -- "cuanto se estima que se consumio hoy/esta semana" --
    aprovechando que cada fila ya viene escalada a energia real del tramo que
    representa (ver `vision_bridge.calcular_horas_transcurridas` +
    `service.generar_reporte_energetico(factor_escala=...)`)."""
    hasta = hasta or dt.datetime.now(dt.timezone.utc)
    filas = db.scalars(
        select(models.ConsumoEnergeticoEstimado)
        .where(
            models.ConsumoEnergeticoEstimado.fecha >= desde,
            models.ConsumoEnergeticoEstimado.fecha <= hasta,
            *condiciones_zona(models.ConsumoEnergeticoEstimado, id_zona),
        )
        .order_by(models.ConsumoEnergeticoEstimado.fecha.asc())
    ).all()

    return {
        "desde": desde,
        "hasta": hasta,
        "muestras": len(filas),
        "consumo_estimado_kwh_total": round(sum(float(f.consumo_estimado_kwh) for f in filas), 4) if filas else 0.0,
        "consumo_optimizado_kwh_total": round(sum(float(f.consumo_optimizado_kwh) for f in filas), 4) if filas else 0.0,
        "ahorro_kwh_total": round(sum(float(f.ahorro_kwh) for f in filas), 4) if filas else 0.0,
        "co2_generado_kg_total": round(sum(float(f.co2_generado_kg) for f in filas), 4) if filas else 0.0,
        "co2_evitable_kg_total": round(sum(float(f.co2_evitable_kg) for f in filas), 4) if filas else 0.0,
    }


def resumen_por_dia(db: Session, desde: dt.datetime, hasta: dt.datetime | None = None,
                    id_zona: uuid.UUID | None = None) -> list[dict]:
    """Igual que `resumen_periodo` pero bucketizado por dia calendario --
    para la tabla del reporte mensual (una fila por dia con su total, no un
    unico total agregado). Reusa el mismo supuesto de energia ya escalada
    por fila (ver `resumen_periodo`)."""
    hasta = hasta or dt.datetime.now(dt.timezone.utc)
    filas = db.scalars(
        select(models.ConsumoEnergeticoEstimado)
        .where(
            models.ConsumoEnergeticoEstimado.fecha >= desde,
            models.ConsumoEnergeticoEstimado.fecha <= hasta,
            *condiciones_zona(models.ConsumoEnergeticoEstimado, id_zona),
        )
        .order_by(models.ConsumoEnergeticoEstimado.fecha.asc())
    ).all()

    por_dia: dict[dt.date, list[models.ConsumoEnergeticoEstimado]] = {}
    for f in filas:
        por_dia.setdefault(f.fecha.date(), []).append(f)

    return [
        {
            "fecha": fecha,
            "muestras": len(dia_filas),
            "consumo_estimado_kwh_total": round(sum(float(f.consumo_estimado_kwh) for f in dia_filas), 4),
            "ahorro_kwh_total": round(sum(float(f.ahorro_kwh) for f in dia_filas), 4),
        }
        for fecha, dia_filas in sorted(por_dia.items())
    ]


def eventos_recientes(db: Session, desde: dt.datetime, limite: int = 30,
                      id_zona: uuid.UUID | None = None) -> list[dict]:
    """Eventos de encendido/apagado/alerta de ocupacion desde `desde`, mas
    recientes primero -- para que el asistente pueda citar casos puntuales
    ("el dia X la luminaria Y quedo encendida sin ocupacion...") en vez de
    solo promedios/totales agregados."""
    filas = db.execute(
        select(models.Evento.fecha_hora, models.Evento.tipo_evento, models.Evento.descripcion, models.Luminaria.nombre)
        .join(models.Luminaria, models.Evento.id_luminaria == models.Luminaria.id_luminaria)
        .where(
            models.Evento.fecha_hora >= desde,
            models.Evento.tipo_evento.in_(["encendido", "apagado", "alerta_ocupacion"]),
            *condiciones_zona(models.Evento, id_zona),
        )
        .order_by(models.Evento.fecha_hora.desc())
        .limit(limite)
    ).all()

    return [
        {"fecha_hora": fecha_hora, "tipo_evento": tipo_evento, "descripcion": descripcion, "luminaria": nombre}
        for fecha_hora, tipo_evento, descripcion, nombre in filas
    ]


def comparar_actual_vs_optimizado(db: Session, limite: int = 200,
                                  id_zona: uuid.UUID | None = None) -> dict:
    """Promedio de consumo estimado/optimizado/ahorro sobre los ultimos
    `limite` reportes persistidos (consumo actual vs. consumo optimizado)."""
    filas = db.scalars(
        select(models.ConsumoEnergeticoEstimado)
        .where(*condiciones_zona(models.ConsumoEnergeticoEstimado, id_zona))
        .order_by(models.ConsumoEnergeticoEstimado.fecha.desc())
        .limit(limite)
    ).all()

    return {
        "muestras": len(filas),
        "consumo_estimado_kwh_promedio": _promedio([float(f.consumo_estimado_kwh) for f in filas]),
        "consumo_optimizado_kwh_promedio": _promedio([float(f.consumo_optimizado_kwh) for f in filas]),
        "ahorro_kwh_promedio": _promedio([float(f.ahorro_kwh) for f in filas]),
        "ahorro_porcentaje_promedio": _promedio([float(f.ahorro_porcentaje) for f in filas]),
        "co2_evitable_kg_total": round(sum(float(f.co2_evitable_kg) for f in filas), 4) if filas else None,
    }


def comparar_por_ocupacion(db: Session, limite: int = 500,
                           id_zona: uuid.UUID | None = None) -> list[dict]:
    """Agrupa el consumo estimado por nivel de ocupacion (bucket definido en
    configs/energy_context.yaml -> niveles_ocupacion), cruzando
    predicciones_consumo.variables_entrada['ocupacion_pct'] con
    consumo_energetico_estimado por id_deteccion."""
    predicciones = db.scalars(
        select(models.PrediccionConsumoDB)
        .where(*condiciones_zona(models.PrediccionConsumoDB, id_zona))
        .order_by(models.PrediccionConsumoDB.fecha.desc())
        .limit(limite)
    ).all()
    consumos_por_deteccion = {
        c.id_deteccion: c
        for c in db.scalars(
            select(models.ConsumoEnergeticoEstimado)
            .where(*condiciones_zona(models.ConsumoEnergeticoEstimado, id_zona))
            .order_by(models.ConsumoEnergeticoEstimado.fecha.desc())
            .limit(limite)
        ).all()
        if c.id_deteccion is not None
    }

    niveles = sorted(context.niveles_ocupacion().items(), key=lambda kv: kv[1])
    buckets: dict[str, list[float]] = {nombre: [] for nombre, _ in niveles}

    for prediccion in predicciones:
        consumo = consumos_por_deteccion.get(prediccion.id_deteccion)
        if consumo is None:
            continue
        ocupacion_pct = float(prediccion.variables_entrada.get("ocupacion_pct", 0.0))
        categoria = niveles[0][0]
        for nombre, umbral in niveles:
            if ocupacion_pct >= umbral:
                categoria = nombre
        buckets[categoria].append(float(consumo.consumo_estimado_kwh))

    return [
        {"nivel_ocupacion": nombre, "muestras": len(valores), "consumo_estimado_kwh_promedio": _promedio(valores)}
        for nombre, valores in buckets.items()
    ]


def resumen_por_luminaria(db: Session, desde: dt.datetime, hasta: dt.datetime | None = None, limite: int = 1000,
                          id_zona: uuid.UUID | None = None) -> list[dict]:
    """Consumo/ahorro estimado agrupado por luminaria y zona, cruzando
    `consumo_energetico_estimado -> detecciones_ocupacion -> luminarias/zonas`
    por `id_deteccion`. Los demas `resumen_*`/`comparar_*` de este modulo dan
    un solo total global; esto es lo que hace falta para un reporte que el
    usuario pida "sobre la sala X" o "comparando luminarias" -- sin este
    desglose, un reporte "detallado" no podria distinguir de donde viene el
    consumo, solo repetir el mismo total agregado con otras palabras."""
    hasta = hasta or dt.datetime.now(dt.timezone.utc)
    filas = db.execute(
        select(
            models.Luminaria.nombre,
            models.Zona.nombre,
            models.ConsumoEnergeticoEstimado.consumo_estimado_kwh,
            models.ConsumoEnergeticoEstimado.ahorro_kwh,
        )
        .select_from(models.ConsumoEnergeticoEstimado)
        .join(
            models.DeteccionOcupacion,
            models.ConsumoEnergeticoEstimado.id_deteccion == models.DeteccionOcupacion.id_deteccion,
        )
        .join(models.Luminaria, models.DeteccionOcupacion.id_luminaria == models.Luminaria.id_luminaria)
        .join(models.Zona, models.Luminaria.id_zona == models.Zona.id_zona)
        .where(
            models.ConsumoEnergeticoEstimado.fecha >= desde,
            models.ConsumoEnergeticoEstimado.fecha <= hasta,
            *([models.Zona.id_zona == id_zona] if id_zona is not None else []),
        )
        .order_by(models.ConsumoEnergeticoEstimado.fecha.desc())
        .limit(limite)
    ).all()

    por_luminaria: dict[tuple[str, str], list[tuple[float, float]]] = {}
    for nombre_luminaria, nombre_zona, consumo, ahorro in filas:
        por_luminaria.setdefault((nombre_luminaria, nombre_zona), []).append(
            (float(consumo), float(ahorro))
        )

    resultado = [
        {
            "luminaria": nombre_luminaria,
            "zona": nombre_zona,
            "muestras": len(valores),
            "consumo_estimado_kwh_total": round(sum(c for c, _ in valores), 4),
            "ahorro_kwh_total": round(sum(a for _, a in valores), 4),
        }
        for (nombre_luminaria, nombre_zona), valores in por_luminaria.items()
    ]
    return sorted(resultado, key=lambda r: r["consumo_estimado_kwh_total"], reverse=True)


def resumen_ocupacion(db: Session, desde: dt.datetime, hasta: dt.datetime | None = None,
                      id_zona: uuid.UUID | None = None) -> dict:
    """Ocupacion observada en el periodo, directo de `detecciones_ocupacion`.

    Es la unica tabla con una fila por FOTOGRAMA analizado (las del modulo
    energetico tienen una por reporte), asi que es la fuente correcta para
    "cuanto tiempo estuvo la sala ocupada" y no una derivada de consumo.
    `fraccion_ocupada` se calcula sobre numero de muestras y no sobre tiempo:
    los fotogramas se analizan a intervalo regular, asi que la proporcion de
    muestras ocupadas es una buena aproximacion de la proporcion de tiempo, y
    no exige suponer cuanto duro cada tramo.
    """
    hasta = hasta or dt.datetime.now(dt.timezone.utc)
    filas = db.scalars(
        select(models.DeteccionOcupacion)
        .where(
            models.DeteccionOcupacion.fecha_hora >= desde,
            models.DeteccionOcupacion.fecha_hora <= hasta,
            *condiciones_zona(models.DeteccionOcupacion, id_zona),
        )
        .order_by(models.DeteccionOcupacion.fecha_hora.asc())
    ).all()

    personas = [int(f.personas_detectadas or 0) for f in filas]
    ocupadas = [p for p in personas if p > 0]

    return {
        "muestras": len(filas),
        "muestras_ocupadas": len(ocupadas),
        "muestras_vacias": len(filas) - len(ocupadas),
        "fraccion_ocupada": round(len(ocupadas) / len(filas), 4) if filas else 0.0,
        "personas_promedio": _promedio(personas) or 0.0,
        # Promedio contando SOLO los fotogramas con gente: "cuanta gente hay
        # cuando hay gente", que es lo que describe el uso real del espacio.
        "personas_promedio_ocupada": _promedio(ocupadas) or 0.0,
        "personas_max": max(personas, default=0),
        "primera": filas[0].fecha_hora if filas else None,
        "ultima": filas[-1].fecha_hora if filas else None,
    }


def ocupacion_por_hora(db: Session, desde: dt.datetime, hasta: dt.datetime | None = None,
                       id_zona: uuid.UUID | None = None) -> list[dict]:
    """Personas promedio por hora del dia. Es la serie que dibuja la curva de
    ocupacion del reporte; solo devuelve las horas con al menos una muestra
    (dibujar ceros en horas que nadie midio seria inventar dato)."""
    hasta = hasta or dt.datetime.now(dt.timezone.utc)
    filas = db.scalars(
        select(models.DeteccionOcupacion)
        .where(
            models.DeteccionOcupacion.fecha_hora >= desde,
            models.DeteccionOcupacion.fecha_hora <= hasta,
            *condiciones_zona(models.DeteccionOcupacion, id_zona),
        )
        .order_by(models.DeteccionOcupacion.fecha_hora.asc())
    ).all()

    por_hora: dict[int, list[int]] = {}
    for f in filas:
        por_hora.setdefault(f.fecha_hora.hour, []).append(int(f.personas_detectadas or 0))

    return [
        {
            "hora": hora,
            "etiqueta": f"{hora:02d}:00",
            "personas_promedio": _promedio(valores) or 0.0,
            "muestras": len(valores),
        }
        for hora, valores in sorted(por_hora.items())
    ]


def resumen_iluminacion(db: Session, desde: dt.datetime, hasta: dt.datetime | None = None, limite: int = 1500,
                        id_zona: uuid.UUID | None = None) -> dict:
    """Reparto natural/artificial y conteo de elementos, leidos de
    `simulaciones.escenario_original`.

    Es el unico sitio donde queda persistido el escenario de vision tal como
    lo vio la camara (`predicciones_consumo.variables_entrada` guarda las
    features del modelo, que no incluyen el reparto de luz). Hay VARIAS filas
    de simulacion por deteccion —una por tipo de plan— con el mismo escenario
    original, asi que se agrupa por `id_deteccion` y se toma una sola: sin
    eso, un escenario con tres simulaciones pesaria el triple en el promedio.
    """
    hasta = hasta or dt.datetime.now(dt.timezone.utc)
    filas = db.scalars(
        select(models.Simulacion)
        .where(
            models.Simulacion.fecha >= desde,
            models.Simulacion.fecha <= hasta,
            *condiciones_zona(models.Simulacion, id_zona),
        )
        .order_by(models.Simulacion.fecha.asc())
        .limit(limite)
    ).all()

    escenarios: dict[object, dict] = {}
    for i, fila in enumerate(filas):
        escenario = fila.escenario_original or {}
        if not isinstance(escenario, dict):
            continue
        # Sin `id_deteccion` (escenario analizado sin persistir la deteccion)
        # se usa el indice para no descartar la fila.
        escenarios.setdefault(fila.id_deteccion if fila.id_deteccion is not None else f"s{i}", escenario)

    valores = list(escenarios.values())
    if not valores:
        return {
            "muestras": 0,
            "porcentaje_natural_promedio": 0.0,
            "porcentaje_artificial_promedio": 0.0,
            "luminarias_promedio": None,
            "ventanas_promedio": None,
            "por_tipo": [],
        }

    def _campo(nombre: str) -> list[float]:
        return [float(v[nombre]) for v in valores if v.get(nombre) is not None]

    naturales = _campo("porcentaje_natural")
    artificiales = _campo("porcentaje_artificial")
    luminarias = _campo("num_luminarias")
    # `num_ventanas` se agrego al escenario persistido despues de las primeras
    # versiones: las filas viejas no lo traen y quedan fuera del promedio en
    # vez de contar como cero.
    ventanas = _campo("num_ventanas")

    conteo_tipos: dict[str, int] = {}
    for v in valores:
        tipo = str(v.get("tipo_iluminacion") or "sin clasificar")
        conteo_tipos[tipo] = conteo_tipos.get(tipo, 0) + 1

    return {
        "muestras": len(valores),
        "porcentaje_natural_promedio": _promedio(naturales) or 0.0,
        "porcentaje_artificial_promedio": _promedio(artificiales) or 0.0,
        "luminarias_promedio": _promedio(luminarias),
        "ventanas_promedio": _promedio(ventanas),
        "por_tipo": sorted(
            ({"tipo": tipo, "muestras": n} for tipo, n in conteo_tipos.items()),
            key=lambda x: x["muestras"],
            reverse=True,
        ),
    }


def comparar_por_simulacion(db: Session, limite: int = 500,
                            id_zona: uuid.UUID | None = None) -> list[dict]:
    """Ahorro promedio observado por tipo de simulacion (cubre, de forma
    indirecta, la comparacion pedida por % de luz natural y por cantidad de
    luminarias activas: cada tipo de simulacion representa exactamente una de
    esas condiciones, ver `simulations.py`)."""
    simulaciones = db.scalars(
        select(models.Simulacion)
        .where(*condiciones_zona(models.Simulacion, id_zona))
        .order_by(models.Simulacion.fecha.desc())
        .limit(limite)
    ).all()

    por_tipo: dict[str, list[models.Simulacion]] = {}
    for sim in simulaciones:
        por_tipo.setdefault(sim.tipo_simulacion, []).append(sim)

    resultado = []
    for tipo, filas in por_tipo.items():
        ahorro_kwh = [float(f.ahorro_kwh) for f in filas]
        ahorro_pct = [float(f.ahorro_porcentaje) for f in filas]
        resultado.append({
            "tipo_simulacion": tipo,
            "muestras": len(filas),
            "ahorro_kwh_promedio": _promedio(ahorro_kwh),
            "ahorro_porcentaje_promedio": _promedio(ahorro_pct),
        })
    return sorted(resultado, key=lambda r: r["ahorro_kwh_promedio"] or 0.0, reverse=True)
