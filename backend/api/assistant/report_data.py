"""Arma el DOCUMENTO de cada tipo de reporte: que secciones, en que orden y
con que bloques (ver el vocabulario en `pdf_renderer.py`).

Ningun numero se inventa aqui: todos salen de lo ya persistido por
`api.energy` — las mismas consultas que anclan al LLM en `context_builder`.

--------------------------------------------------------------------------
LA PLANTILLA NO ES RIGIDA: SE REORGANIZA SEGUN EL ENFOQUE
--------------------------------------------------------------------------
Un reporte de consumo y uno de ocupacion no son el mismo documento con otro
titulo. `ENFOQUE` decide dos cosas:

  1. **Que tarjeta manda.** `tarjetas_panorama` devuelve siempre el mismo
     repertorio de indicadores, pero ordenado por relevancia para ese
     enfoque, y marca la primera como destacada. Lo que el usuario pidio es
     lo primero que ve, siempre en el mismo sitio de la hoja.
  2. **Que grafica ocupa el protagonismo.** El reparto natural/artificial va
     primero en un reporte de iluminacion y despues en uno de consumo; la
     curva de ocupacion sube al principio en uno de ocupacion.

Y aun asi la identidad no cambia: los mismos bloques, la misma paleta, la
misma retícula. Es la diferencia entre reorganizar y rediseñar.
"""

from __future__ import annotations

import base64
import binascii
import calendar
import datetime as dt

from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import models
from ..energy import historical
from .pdf_theme import ASCUA, HOJA, SOL, numero as _n

# Factor de emision de la red colombiana (kg CO2 por kWh), el mismo que
# declara el panel lateral del frontend para que la cifra sea auditable.
KG_CO2_POR_KWH = 0.164

MESES = (
    "enero", "febrero", "marzo", "abril", "mayo", "junio",
    "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
)


def _fecha_larga(fecha: dt.date) -> str:
    return f"{fecha.day} de {MESES[fecha.month - 1]} de {fecha.year}"


def _pct(parte: float, total: float) -> float:
    return (parte / total * 100.0) if total else 0.0


# ============================== PANORAMA ==============================


def recolectar_panorama(db: Session, desde: dt.datetime, hasta: dt.datetime | None = None) -> dict:
    """Los tres angulos del periodo, medidos una sola vez. Cualquier tipo de
    reporte se sirve de aqui: asi el reporte de ocupacion y el de consumo
    hablan de los MISMOS numeros y no de dos consultas que pueden divergir."""
    hasta = hasta or dt.datetime.now(dt.timezone.utc)
    return {
        "desde": desde,
        "hasta": hasta,
        "consumo": historical.resumen_periodo(db, desde=desde, hasta=hasta),
        "ocupacion": historical.resumen_ocupacion(db, desde=desde, hasta=hasta),
        "iluminacion": historical.resumen_iluminacion(db, desde=desde, hasta=hasta),
        "por_luminaria": historical.resumen_por_luminaria(db, desde=desde, hasta=hasta),
    }


def hay_datos(panorama: dict) -> bool:
    return bool(panorama["consumo"]["muestras"] or panorama["ocupacion"]["muestras"])


def _indice_eficiencia(consumo: dict) -> float | None:
    """Que tan cerca esta el consumo real del optimo simulado, en %. Es el
    mismo indicador que calcula `energy/indicators.py` por escena, agregado
    aqui sobre el periodo completo."""
    total = consumo["consumo_estimado_kwh_total"]
    if not total:
        return None
    return min(100.0, consumo["consumo_optimizado_kwh_total"] / total * 100.0)


# --- Las tarjetas, una por indicador ---------------------------------------
# Cada entrada del catalogo es una funcion que recibe el panorama y devuelve
# la tarjeta ya formateada, o None si ese indicador no tiene dato. Que sea un
# catalogo (y no seis `if` en cada tipo de reporte) es lo que permite
# reordenarlas por enfoque sin duplicar nada.


def _tarjeta_consumo(p: dict) -> dict | None:
    c = p["consumo"]
    if not c["muestras"]:
        return None
    return {
        "icono": "energia",
        "valor": _n(c["consumo_estimado_kwh_total"], 3),
        "unidad": "kWh",
        "etiqueta": "consumo estimado",
        "nota": f"Suma de los {c['muestras']} tramos analizados en el período.",
    }


def _tarjeta_ahorro(p: dict) -> dict | None:
    c = p["consumo"]
    if not c["muestras"]:
        return None
    porcentaje = _pct(c["ahorro_kwh_total"], c["consumo_estimado_kwh_total"])
    return {
        "icono": "ahorro",
        "valor": _n(c["ahorro_kwh_total"], 3),
        "unidad": "kWh",
        "etiqueta": "ahorro potencial",
        "nota": "Energía que se habría evitado atendiendo las recomendaciones, sin cambiar el uso del espacio.",
        "color": HOJA,
        "tendencia": f"{_n(porcentaje, 0)} %",
        "tendencia_buena": True,
    }


def _tarjeta_eficiencia(p: dict) -> dict | None:
    indice = _indice_eficiencia(p["consumo"])
    if indice is None:
        return None
    return {
        "icono": "eficiencia",
        "valor": _n(indice, 0),
        "unidad": "%",
        "etiqueta": "índice de eficiencia",
        "nota": "100 % sería consumir ya lo mínimo simulado; por debajo, queda margen.",
    }


def _tarjeta_co2(p: dict) -> dict | None:
    c = p["consumo"]
    if not c["muestras"]:
        return None
    evitable = c["co2_evitable_kg_total"]
    tarjeta = {
        "icono": "co2",
        "valor": _n(c["co2_generado_kg_total"], 3),
        "unidad": "kg",
        "etiqueta": "CO2 generado",
        "nota": f"Factor de la red nacional: {_n(KG_CO2_POR_KWH, 3)} kg/kWh. Evitable: {_n(evitable, 3)} kg.",
    }
    # La insignia de tendencia solo aparece si dice algo: con 0,004 kg
    # evitables se leia "-0,00 kg", que es ruido con aspecto de dato.
    if evitable >= 0.05:
        tarjeta["tendencia"] = f"-{_n(evitable, 2)} kg"
        tarjeta["tendencia_buena"] = True
    return tarjeta


def _tarjeta_personas(p: dict) -> dict | None:
    o = p["ocupacion"]
    if not o["muestras"]:
        return None
    return {
        "icono": "personas",
        "valor": _n(o["personas_promedio"], 1),
        "unidad": "prom.",
        "etiqueta": "personas detectadas",
        "nota": f"Promedio por fotograma; el máximo observado fue {o['personas_max']}.",
    }


def _tarjeta_ocupacion(p: dict) -> dict | None:
    o = p["ocupacion"]
    if not o["muestras"]:
        return None
    return {
        "icono": "reloj",
        "valor": _n(o["fraccion_ocupada"] * 100, 0),
        "unidad": "%",
        "etiqueta": "tiempo con ocupación",
        "nota": f"{o['muestras_ocupadas']} de {o['muestras']} fotogramas con al menos una persona.",
    }


def _tarjeta_luminarias(p: dict) -> dict | None:
    i = p["iluminacion"]
    if i["luminarias_promedio"] is None:
        return None
    return {
        "icono": "luminarias",
        "valor": _n(i["luminarias_promedio"], 1),
        "unidad": "prom.",
        "etiqueta": "luminarias activas",
        "nota": "Luminarias encendidas que el modelo reconoció en el encuadre, por escena.",
    }


def _tarjeta_ventanas(p: dict) -> dict | None:
    i = p["iluminacion"]
    if i["ventanas_promedio"] is None:
        return None
    return {
        "icono": "ventanas",
        "valor": _n(i["ventanas_promedio"], 1),
        "unidad": "prom.",
        "etiqueta": "ventanas en el encuadre",
        "nota": "Aberturas por las que entra luz natural, detectadas por escena.",
    }


def _tarjeta_natural(p: dict) -> dict | None:
    i = p["iluminacion"]
    if not i["muestras"]:
        return None
    return {
        "icono": "iluminacion",
        "valor": _n(i["porcentaje_natural_promedio"], 0),
        "unidad": "%",
        "etiqueta": "luz natural aprovechada",
        "nota": f"El resto ({_n(i['porcentaje_artificial_promedio'], 0)} %) lo aportan las luminarias.",
    }


CATALOGO_TARJETAS = {
    "consumo": _tarjeta_consumo,
    "ahorro": _tarjeta_ahorro,
    "eficiencia": _tarjeta_eficiencia,
    "co2": _tarjeta_co2,
    "personas": _tarjeta_personas,
    "ocupacion": _tarjeta_ocupacion,
    "luminarias": _tarjeta_luminarias,
    "ventanas": _tarjeta_ventanas,
    "natural": _tarjeta_natural,
}

# El orden ES el diseño adaptativo: la primera de la lista se dibuja
# destacada y arriba a la izquierda, que es donde el ojo cae primero.
ORDEN_POR_ENFOQUE = {
    "consumo": ("consumo", "ahorro", "eficiencia", "co2", "personas", "luminarias"),
    "ocupacion": ("ocupacion", "personas", "consumo", "ahorro", "luminarias", "eficiencia"),
    "iluminacion": ("natural", "luminarias", "ventanas", "consumo", "ahorro", "eficiencia"),
    "general": ("consumo", "ahorro", "eficiencia", "personas", "luminarias", "natural"),
}


def tarjetas_panorama(panorama: dict, enfoque: str = "general", maximo: int = 6) -> dict | None:
    """El bloque de indicadores, ordenado por enfoque. Devuelve None si no hay
    ni un indicador con dato (el reporte lo dice con palabras en ese caso, en
    vez de mostrar seis tarjetas con guiones)."""
    orden = ORDEN_POR_ENFOQUE.get(enfoque, ORDEN_POR_ENFOQUE["general"])
    items: list[dict] = []
    for clave in orden:
        constructor = CATALOGO_TARJETAS.get(clave)
        tarjeta = constructor(panorama) if constructor else None
        if tarjeta:
            items.append(tarjeta)
        if len(items) >= maximo:
            break

    if not items:
        return None
    items[0] = {**items[0], "destacada": True}
    return {"tipo": "indicadores", "items": items, "columnas": 3 if len(items) >= 3 else len(items)}


# ============================== GRAFICAS ==============================


def grafica_reparto_luz(panorama: dict) -> dict | None:
    i = panorama["iluminacion"]
    if not i["muestras"]:
        return None
    natural = i["porcentaje_natural_promedio"]
    artificial = i["porcentaje_artificial_promedio"]

    if natural >= 55:
        lectura = (
            f"La sala se ilumina sobre todo con luz de día: el {_n(natural, 0)} % del aporte medido es natural. "
            "Es el escenario que menos cuesta, y conviene mantenerlo vigilando que las luminarias no se "
            "queden encendidas cuando ya no hacen falta."
        )
    elif natural >= 30:
        lectura = (
            f"El reparto está equilibrado ({_n(natural, 0)} % natural contra {_n(artificial, 0)} % artificial). "
            "Hay margen para apoyarse más en las ventanas en las horas centrales del día."
        )
    else:
        lectura = (
            f"Casi toda la iluminación es artificial ({_n(artificial, 0)} %). Con esa proporción, cada hora "
            "que la sala pasa encendida sin ocupación se traduce casi punto por punto en consumo evitable."
        )

    return {
        "tipo": "grafica",
        "forma": "division",
        "titulo": "origen de la luz en la escena",
        # Se pasan los valores reales, sin minimo artificial: la propia
        # grafica retira las partes demasiado finas para dibujarse. El color va
        # explicito por parte y no por posicion, porque si una de las dos
        # desaparece (100 % artificial, por ejemplo) la que queda heredaria el
        # color de la primera posicion — el sol pintando la luz artificial.
        "partes": [
            {"etiqueta": "luz natural aprovechada", "valor": natural, "color": SOL},
            {"etiqueta": "luz artificial", "valor": artificial, "color": ASCUA},
        ],
        "interpretacion": lectura,
    }


def grafica_por_luminaria(panorama: dict) -> dict | None:
    filas = panorama["por_luminaria"]
    if len(filas) < 2:
        return None

    total = sum(f["consumo_estimado_kwh_total"] for f in filas) or 1.0
    primera = filas[0]
    parte = _pct(primera["consumo_estimado_kwh_total"], total)

    return {
        "tipo": "grafica",
        "forma": "barras",
        "titulo": "consumo estimado acumulado por luminaria",
        "unidad": "kWh",
        "decimales": 3,
        "datos": [
            {"etiqueta": f"{f['luminaria']} · {f['zona']}", "valor": f["consumo_estimado_kwh_total"]}
            for f in filas
        ],
        "interpretacion": (
            f"{primera['luminaria']} ({primera['zona']}) concentra el {_n(parte, 0)} % del consumo estimado del "
            f"período. Es donde una sola corrección rinde más: {_n(primera['ahorro_kwh_total'], 3)} kWh de ahorro "
            "potencial acumulado solo en esa luminaria."
        ),
    }


def grafica_por_dia(por_dia: list[dict]) -> dict | None:
    if len(por_dia) < 2:
        return None

    pico = max(por_dia, key=lambda d: d["consumo_estimado_kwh_total"])
    promedio = sum(d["consumo_estimado_kwh_total"] for d in por_dia) / len(por_dia)
    veces = pico["consumo_estimado_kwh_total"] / promedio if promedio else 1.0

    return {
        "tipo": "grafica",
        "forma": "columnas",
        "titulo": "consumo estimado por día",
        "unidad": "kWh",
        "decimales": 2,
        "etiqueta_secundario": "ahorro potencial",
        "datos": [
            {
                "etiqueta": d["fecha"].strftime("%d/%m"),
                "valor": d["consumo_estimado_kwh_total"],
                "secundario": d["ahorro_kwh_total"],
            }
            for d in por_dia
        ],
        "interpretacion": (
            f"El día más alto del período es el {pico['fecha'].strftime('%d/%m')} con "
            f"{_n(pico['consumo_estimado_kwh_total'], 3)} kWh, {_n(veces, 1)} veces el promedio diario. "
            "La franja verde de cada columna es la parte que las simulaciones marcan como evitable."
        ),
    }


def grafica_ocupacion_por_hora(por_hora: list[dict]) -> dict | None:
    if len(por_hora) < 3:
        return None

    pico = max(por_hora, key=lambda h: h["personas_promedio"])
    vacias = [h for h in por_hora if h["personas_promedio"] < 0.5]

    lectura = (
        f"La ocupación más alta se observa alrededor de las {pico['etiqueta']} "
        f"({_n(pico['personas_promedio'], 1)} personas en promedio)."
    )
    if vacias:
        horas = ", ".join(h["etiqueta"] for h in vacias[:4])
        lectura += (
            f" Las franjas prácticamente vacías ({horas}) son las que hay que revisar: "
            "es ahí donde una luminaria encendida no ilumina a nadie."
        )

    return {
        "tipo": "grafica",
        "forma": "linea",
        "titulo": "ocupación promedio por hora del día",
        "unidad": "personas",
        "decimales": 1,
        "datos": [{"etiqueta": h["etiqueta"], "valor": h["personas_promedio"]} for h in por_hora],
        "interpretacion": lectura,
    }


# ============================== FIGURAS ==============================


def describir_figura(meta: dict, indice: int) -> str:
    """Pie de figura compuesto con los metadatos del propio analisis.

    No lo escribe un modelo a proposito: el pie de una figura tiene que
    describir exactamente lo que se ve, y una llamada al LLM aqui costaria
    tiempo, dinero y la posibilidad de que se invente una sala o una cifra.
    """
    partes: list[str] = []

    zona = str(meta.get("zona") or "").strip()
    luminaria = str(meta.get("luminaria") or "").strip()
    ubicacion = " · ".join(x for x in (zona, luminaria) if x) or "zona monitoreada"

    personas = meta.get("personas")
    if personas is None:
        partes.append(f"Fotograma analizado en {ubicacion}")
    elif int(personas) == 0:
        partes.append(f"{ubicacion} sin ocupación")
    elif int(personas) == 1:
        partes.append(f"{ubicacion} con 1 persona detectada")
    else:
        partes.append(f"{ubicacion} con {int(personas)} personas detectadas")

    luminarias = meta.get("luminarias")
    if luminarias:
        plural = "s activas" if int(luminarias) != 1 else " activa"
        partes[-1] += f" y {int(luminarias)} luminaria{plural}"

    marca = meta.get("ts")
    if marca:
        try:
            momento = dt.datetime.fromisoformat(str(marca).replace("Z", "+00:00"))
            partes[-1] += f", {momento.strftime('%d/%m/%Y a las %H:%M')}"
        except ValueError:
            pass

    frase = partes[0] + "."

    artificial = meta.get("porcentaje_artificial")
    if artificial is not None:
        frase += f" El {_n(artificial, 0)} % de la iluminación de la escena es artificial."

    if meta.get("origen") == "alerta":
        frase += " SELENE emitió una alerta de oportunidad sobre este fotograma."

    return frase


# Tope por imagen ya decodificada. El frontend manda miniaturas de 480 px
# (~20-40 KB); 600 KB deja margen de sobra y a la vez evita que una peticion
# manipulada meta un archivo de 50 MB dentro del PDF.
MAX_BYTES_FIGURA = 600 * 1024
MAX_FIGURAS = 4

_FIRMAS = (b"\xff\xd8\xff", b"\x89PNG\r\n\x1a\n")


def decodificar_figuras(entradas: list[dict]) -> list[dict]:
    """Convierte las figuras que llegaron por la API (imagen en base64 o
    dataURL) en figuras con `imagen` en bytes, listas para dibujarse.

    Descarta en silencio lo que no sea una imagen reconocible o pese
    demasiado: una figura corrupta no puede tumbar la generacion del reporte
    entero, y el documento se lee igual de bien con una figura menos. Se
    comprueban las firmas de JPEG y PNG y no la extension o el `mime` que
    diga el cliente, porque eso ultimo lo escribe quien llama.
    """
    figuras: list[dict] = []
    for entrada in entradas[:MAX_FIGURAS]:
        crudo = str(entrada.get("imagen") or "")
        if "," in crudo and crudo.strip().lower().startswith("data:"):
            crudo = crudo.split(",", 1)[1]
        if not crudo:
            continue
        try:
            imagen = base64.b64decode(crudo, validate=True)
        except (binascii.Error, ValueError):
            continue
        if not imagen or len(imagen) > MAX_BYTES_FIGURA:
            continue
        if not any(imagen.startswith(firma) for firma in _FIRMAS):
            continue
        figuras.append({**entrada, "imagen": imagen})
    return figuras


def bloques_de_figuras(figuras: list[dict], desde_numero: int = 1) -> list[dict]:
    """Convierte las figuras que envio el frontend en bloques del documento.
    Las imagenes no viven en el backend (ver `alertasAlmacen.js`): el registro
    visual lo guarda el navegador, asi que las manda con la peticion."""
    bloques = []
    for i, figura in enumerate(figuras):
        imagen = figura.get("imagen")
        if not imagen:
            continue
        bloques.append({
            "tipo": "figura",
            "imagen": imagen,
            "numero": desde_numero + len(bloques),
            "descripcion": describir_figura(figura, i),
        })
    return bloques


# ============================== OBSERVACIONES ==============================


def observaciones(panorama: dict, enfoque: str = "general", extra: list[str] | None = None) -> dict | None:
    """El bloque "Observaciones de SELENE": las conclusiones, en primera
    persona y compuestas a partir de los numeros del periodo.

    Son deterministas, no las redacta el LLM. Tres motivos, en orden de peso:
    cada llamada al modelo son segundos de espera y dinero; el modelo puede
    afirmar cosas que los datos no dicen; y estas frases tienen que salir
    igual aunque no haya clave de API configurada. Cuando SI hay texto del
    modelo (reportes `general` y `detallado`, donde el usuario pidio
    explicitamente una redaccion), llega en `extra` y se antepone: la
    redaccion del modelo primero, la lectura de las cifras despues.
    """
    frases: list[str] = []
    c = panorama["consumo"]
    o = panorama["ocupacion"]
    i = panorama["iluminacion"]

    if not hay_datos(panorama):
        frases.append(
            "Todavía no tengo registros suficientes de este período para sacar conclusiones. "
            "En cuanto el Centro de Monitoreo analice algunos fotogramas más, este bloque se llena solo."
        )
    else:
        if c["muestras"]:
            ahorro_pct = _pct(c["ahorro_kwh_total"], c["consumo_estimado_kwh_total"])
            frases.append(
                f"Estimé {_n(c['consumo_estimado_kwh_total'], 3)} kWh de consumo en {c['muestras']} tramos "
                f"analizados, de los cuales {_n(c['ahorro_kwh_total'], 3)} kWh ({_n(ahorro_pct, 0)} %) podrían "
                f"evitarse sin cambiar el uso del espacio. Son {_n(c['co2_evitable_kg_total'], 3)} kg de CO2 "
                "que no harían falta emitir."
            )

        if o["muestras"]:
            frases.append(
                f"La zona estuvo ocupada en el {_n(o['fraccion_ocupada'] * 100, 0)} % de los "
                f"{o['muestras']} fotogramas que revisé, con un máximo de {o['personas_max']} personas a la vez."
            )

        if i["muestras"] and i["porcentaje_artificial_promedio"] > 55:
            frases.append(
                f"El {_n(i['porcentaje_artificial_promedio'], 0)} % de la iluminación vino de las luminarias y no "
                "de las ventanas; con esa proporción, el tiempo encendido pesa directamente en el recibo."
            )

        principal = panorama["por_luminaria"][0] if panorama["por_luminaria"] else None
        if principal:
            frases.append(
                f"Mi recomendación concreta: empezar por {principal['luminaria']} en {principal['zona']}, que "
                f"acumula {_n(principal['consumo_estimado_kwh_total'], 3)} kWh estimados y "
                f"{_n(principal['ahorro_kwh_total'], 3)} kWh de ahorro potencial. Yo detecto y aviso; el apagado "
                "lo decide una persona."
            )
        elif c["muestras"]:
            frases.append(
                "Mi recomendación concreta: revisar el apagado al final de la jornada, que es cuando aparecen "
                "casi todas las alertas de sala vacía con luz encendida. Yo detecto y aviso; el apagado lo "
                "decide una persona."
            )

    parrafos = [p for p in (extra or []) if p and p.strip()]
    # Las frases de las cifras se agrupan de dos en dos: un solo parrafo de
    # cinco frases se lee como un muro.
    for inicio in range(0, len(frases), 2):
        parrafos.append(" ".join(frases[inicio : inicio + 2]))

    if not parrafos:
        return None
    return {"tipo": "observaciones", "parrafos": parrafos}


def _renglones_metodo(panorama: dict, extra: list[tuple] | None = None) -> dict:
    """El detalle tecnico que respalda las cifras. Va en renglones y no en una
    tabla: son pares etiqueta/valor, y una tabla de dos columnas con
    encabezados para esto es peso visual sin informacion."""
    c = panorama["consumo"]
    items: list[tuple] = [
        ("tramos de consumo analizados", str(c["muestras"])),
        ("fotogramas de ocupación revisados", str(panorama["ocupacion"]["muestras"])),
        ("escenas con reparto de luz medido", str(panorama["iluminacion"]["muestras"])),
        ("consumo optimizado simulado", f"{_n(c['consumo_optimizado_kwh_total'], 3)} kWh"),
        ("factor de emisión aplicado", f"{_n(KG_CO2_POR_KWH, 3)} kg CO2 / kWh"),
    ]
    items.extend(extra or [])
    return {"tipo": "renglones", "titulo": "cómo se calculó", "items": items}


def _seccion(titulo: str | None, bloques: list, anotacion: str | None = None) -> dict | None:
    """Descarta la seccion si no quedo ningun bloque con dato. Es lo que evita
    titulos elegantes seguidos de nada."""
    limpios = [b for b in bloques if b]
    if not limpios:
        return None
    return {"titulo": titulo, "anotacion": anotacion, "bloques": limpios}


# ============================== TIPOS DE REPORTE ==============================


def datos_consumo_diario(db: Session, figuras: list[dict] | None = None) -> dict:
    ahora = dt.datetime.now(dt.timezone.utc)
    inicio_dia = ahora.replace(hour=0, minute=0, second=0, microsecond=0)

    panorama = recolectar_panorama(db, desde=inicio_dia, hasta=ahora)
    c = panorama["consumo"]
    eventos = historical.eventos_recientes(db, desde=inicio_dia, limite=14)
    por_hora = historical.ocupacion_por_hora(db, desde=inicio_dia, hasta=ahora)

    principal = {
        "tipo": "destacado",
        "valor": _n(c["consumo_estimado_kwh_total"], 3),
        "unidad": "kWh",
        "etiqueta": "consumo estimado de hoy",
        "nota": (
            f"De ese total, {_n(c['ahorro_kwh_total'], 3)} kWh podrían evitarse manteniendo el mismo nivel de "
            f"servicio. Equivalen a {_n(c['co2_evitable_kg_total'], 3)} kg de CO2."
        ),
    } if c["muestras"] else None

    secciones = [
        _seccion(
            "Lo esencial de hoy",
            [principal, tarjetas_panorama(panorama, "consumo")],
            anotacion=f"{c['muestras']} tramos analizados" if c["muestras"] else "sin registros todavía",
        ),
        _seccion("Cómo se reparte la energía", [
            grafica_reparto_luz(panorama),
            grafica_por_luminaria(panorama),
            grafica_ocupacion_por_hora(por_hora),
        ]),
        _seccion("Evidencia visual", bloques_de_figuras(figuras or [])),
        _seccion("Registro del día", [
            {
                "tipo": "tabla",
                "filas": [["Hora", "Luminaria", "Evento"]] + [
                    [ev["fecha_hora"].strftime("%H:%M"), ev["luminaria"], ev["descripcion"] or ev["tipo_evento"]]
                    for ev in eventos
                ],
                "nota": "Encendidos, apagados y alertas registrados hoy, del más reciente al más antiguo.",
            } if eventos else None,
            _renglones_metodo(panorama),
        ]),
        _seccion(None, [observaciones(panorama, "consumo")]),
    ]

    return {
        "periodo": _fecha_larga(inicio_dia.date()),
        "enfoque": "consumo",
        "secciones": [s for s in secciones if s],
        "panorama": panorama,
    }


def datos_consumo_mensual(db: Session, figuras: list[dict] | None = None) -> dict:
    ahora = dt.datetime.now(dt.timezone.utc)
    inicio_mes = ahora.replace(day=1, hour=0, minute=0, second=0, microsecond=0)

    panorama = recolectar_panorama(db, desde=inicio_mes, hasta=ahora)
    c = panorama["consumo"]
    por_dia = historical.resumen_por_dia(db, desde=inicio_mes, hasta=ahora)
    periodo = f"{MESES[ahora.month - 1]} de {ahora.year}"

    dias_con_dato = len(por_dia) or 1
    promedio_diario = c["consumo_estimado_kwh_total"] / dias_con_dato
    dias_del_mes = calendar.monthrange(ahora.year, ahora.month)[1]

    principal = {
        "tipo": "destacado",
        "valor": _n(c["consumo_estimado_kwh_total"], 3),
        "unidad": "kWh",
        "etiqueta": f"consumo estimado de {periodo}",
        "nota": (
            f"Promedio de {_n(promedio_diario, 3)} kWh por día con dato. Al ritmo actual, el mes completo "
            f"({dias_del_mes} días) cerraría alrededor de {_n(promedio_diario * dias_del_mes, 2)} kWh."
        ),
    } if c["muestras"] else None

    secciones = [
        _seccion(
            "El mes en cifras",
            [principal, tarjetas_panorama(panorama, "consumo")],
            anotacion=f"{dias_con_dato} días con registros",
        ),
        _seccion("Cómo evolucionó el consumo", [
            grafica_por_dia(por_dia),
            grafica_por_luminaria(panorama),
        ]),
        _seccion("De dónde viene la luz", [grafica_reparto_luz(panorama)]),
        _seccion("Evidencia visual", bloques_de_figuras(figuras or [])),
        _seccion("Respaldo del cálculo", [_renglones_metodo(panorama, [
            ("días del mes con al menos una muestra", str(dias_con_dato)),
            ("promedio diario estimado", f"{_n(promedio_diario, 3)} kWh"),
        ])]),
        _seccion(None, [observaciones(panorama, "consumo")]),
    ]

    return {
        "periodo": periodo,
        "enfoque": "consumo",
        "secciones": [s for s in secciones if s],
        "panorama": panorama,
    }


def datos_plan_ahorro(db: Session, limite: int = 8, figuras: list[dict] | None = None) -> dict:
    ahora = dt.datetime.now(dt.timezone.utc)
    desde = ahora - dt.timedelta(days=30)

    panorama = recolectar_panorama(db, desde=desde, hasta=ahora)
    c = panorama["consumo"]
    por_simulacion = historical.comparar_por_simulacion(db, limite=500)
    recomendaciones = db.scalars(
        select(models.RecomendacionEnergetica)
        .order_by(models.RecomendacionEnergetica.ahorro_estimado_kwh.desc())
        .limit(limite)
    ).all()

    principal = {
        "tipo": "destacado",
        "valor": _n(c["ahorro_kwh_total"], 3),
        "unidad": "kWh",
        "etiqueta": "ahorro potencial de los últimos 30 días",
        "nota": (
            f"Es el {_n(_pct(c['ahorro_kwh_total'], c['consumo_estimado_kwh_total']), 0)} % de lo que estimé "
            f"consumido, y evitaría {_n(c['co2_evitable_kg_total'], 3)} kg de CO2. Ninguna de estas medidas "
            "exige apagar nada automáticamente: son decisiones para una persona."
        ),
        "color": HOJA,
    } if c["muestras"] else None

    grafica_planes = {
        "tipo": "grafica",
        "forma": "barras",
        "titulo": "ahorro promedio por tipo de plan",
        "unidad": "kWh",
        "decimales": 3,
        "datos": [
            {"etiqueta": f["tipo_simulacion"].replace("_", " "), "valor": f["ahorro_kwh_promedio"] or 0.0}
            for f in por_simulacion
        ],
        "interpretacion": (
            f"El plan más rentable de los simulados es «{por_simulacion[0]['tipo_simulacion'].replace('_', ' ')}», "
            f"con {_n(por_simulacion[0]['ahorro_kwh_promedio'] or 0, 3)} kWh de ahorro promedio por escena "
            f"({_n(por_simulacion[0]['ahorro_porcentaje_promedio'] or 0, 1)} %) sobre "
            f"{por_simulacion[0]['muestras']} muestras."
        ),
    } if por_simulacion else None

    # Las recomendaciones se agrupan por texto y se suman: el modulo
    # energetico emite una fila por escena, asi que la misma frase ("No se
    # detectaron personas: apagar") aparece decenas de veces y la grafica
    # salia con seis barras que parecian la misma. Agrupadas, cada barra dice
    # cuanto pesa ESE tipo de correccion en total, que es la pregunta real.
    acumulado: dict[str, float] = {}
    veces: dict[str, int] = {}
    for r in recomendaciones:
        clave = str(r.descripcion or "recomendacion")
        acumulado[clave] = acumulado.get(clave, 0.0) + float(r.ahorro_estimado_kwh)
        veces[clave] = veces.get(clave, 0) + 1
    ordenadas = sorted(acumulado.items(), key=lambda kv: kv[1], reverse=True)

    grafica_recomendaciones = {
        "tipo": "grafica",
        "forma": "barras",
        "titulo": "recomendaciones con mayor ahorro acumulado",
        "unidad": "kWh",
        "decimales": 3,
        # Las etiquetas son frases enteras: necesitan casi la mitad del ancho.
        "fraccion_etiqueta": 0.5,
        "datos": [
            {"etiqueta": f"{texto} ({veces[texto]}×)" if veces[texto] > 1 else texto, "valor": total}
            for texto, total in ordenadas
        ],
        "interpretacion": (
            "Cada barra suma lo que ahorraría atender un mismo tipo de recomendación en todas las escenas donde "
            "lo detecté. Las de arriba son las que conviene resolver primero."
        ),
    } if recomendaciones else None

    secciones = [
        _seccion(
            "Cuánto hay sobre la mesa",
            [principal, tarjetas_panorama(panorama, "consumo")],
            anotacion="últimos 30 días",
        ),
        _seccion("Qué plan rinde más", [grafica_planes]),
        _seccion("Por dónde empezar", [grafica_recomendaciones]),
        _seccion("Evidencia visual", bloques_de_figuras(figuras or [])),
        _seccion("Respaldo del cálculo", [_renglones_metodo(panorama, [
            ("planes simulados en el histórico", str(len(por_simulacion))),
            ("recomendaciones registradas", str(len(recomendaciones))),
        ])]),
        _seccion(None, [observaciones(panorama, "consumo")]),
    ]

    if not any(secciones):
        secciones = [_seccion("Plan de ahorro energético", [{
            "tipo": "parrafos",
            "parrafos": [
                "Todavía no hay suficiente historial para armar un plan de ahorro. Hacen falta algunas sesiones "
                "de monitoreo para que las simulaciones tengan con qué comparar.",
            ],
        }])]

    return {
        "periodo": f"{desde.strftime('%d/%m/%Y')} — {ahora.strftime('%d/%m/%Y')}",
        "enfoque": "consumo",
        "secciones": [s for s in secciones if s],
        "panorama": panorama,
    }
