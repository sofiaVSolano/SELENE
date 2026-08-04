"""Sistema de diseno del PDF de SELENE: "Papel y Luz" llevado al papel.

Un solo lugar decide color, tipografia, ritmo vertical e iconografia; los
bloques (`pdf_blocks.py`) y el renderer (`pdf_renderer.py`) solo componen con
lo que hay aqui. Es la misma regla que sostiene el frontend: si una pagina
necesita un color o un tamano que no esta en este archivo, casi siempre es que
la pagina esta mal, no que falte un token.

Tres decisiones que explican todo lo demas:

  * **La hoja es blanca.** El color no decora, senala: ambar para la luz y lo
    que hay que mirar, verde para lo que ya esta bien, terracota para lo que
    cuesta dinero, y grises para todo lo secundario. Un reporte donde todo
    grita no tiene jerarquia.
  * **Cero azul**, igual que en la aplicacion (ver
    `frontend/src/index.css`). La paleta de aqui son literalmente las mismas
    variables CSS, para que el PDF no se lea como el export de otra
    herramienta.
  * **Cero archivos de fuente.** Se usan las familias que ReportLab ya trae
    (Helvetica y Times) porque las de la marca solo existen como `woff2` en
    `node_modules` y ReportLab no lee `woff2`. El contraste que en pantalla
    dan Instrument Serif + Geist se consigue aqui con Times para los titulos
    y Helvetica para todo lo demas: misma idea (serif que exhibe, sans que
    informa), sin agregar dependencias ni pesar el repositorio.
"""

from __future__ import annotations

import math

from reportlab.lib import colors
from reportlab.lib.pagesizes import letter
from reportlab.lib.units import cm
from reportlab.pdfbase import pdfmetrics

# --- Superficies (mismos valores que las variables CSS del frontend) --------
PAPEL = colors.HexColor("#fdfcfa")
PAPEL_2 = colors.HexColor("#f7f4ef")
PAPEL_3 = colors.HexColor("#f1ece4")
LINO = colors.HexColor("#e8e2d8")

# --- Tinta: nunca negro puro ------------------------------------------------
TINTA = colors.HexColor("#191512")
TINTA_2 = colors.HexColor("#6b6257")
TINTA_3 = colors.HexColor("#9c948a")
TINTA_4 = colors.HexColor("#c3bcb2")

# --- Luz: el unico "color" del sistema --------------------------------------
AMBAR = colors.HexColor("#ffb020")
ASCUA = colors.HexColor("#ff7a18")
SOL = colors.HexColor("#ffd98a")
HOJA = colors.HexColor("#3e9b6b")  # indicadores positivos
ARCILLA = colors.HexColor("#d8503c")  # lo que cuesta

# --- Tipografia -------------------------------------------------------------
SERIF = "Times-Roman"
SERIF_CURSIVA = "Times-Italic"
SANS = "Helvetica"
SANS_FUERTE = "Helvetica-Bold"
SANS_CURSIVA = "Helvetica-Oblique"

# Escala tipografica. Los saltos son grandes a proposito: si el titulo de
# seccion y el cuerpo se diferencian en 1 pt, el lector no percibe jerarquia,
# percibe descuido.
TAM_TITULO = 26  # titulo del reporte
TAM_SECCION = 15  # titulo de seccion
TAM_CIFRA = 20  # valor principal de una tarjeta
TAM_CIFRA_GRANDE = 30  # la cifra protagonista del reporte
TAM_CUERPO = 9.5
TAM_MENUDA = 8  # descripciones de tarjeta, pies de figura
TAM_ANOTACION = 7  # etiquetas tecnicas en mayusculas

# --- Retícula ---------------------------------------------------------------
PAGINA = letter
MARGEN_X = 2.3 * cm
MARGEN_ARRIBA = 2.5 * cm
MARGEN_ABAJO = 2.2 * cm
ANCHO_UTIL = PAGINA[0] - 2 * MARGEN_X

# Ritmo vertical: todo espacio del documento es un multiplo de esto. Es lo que
# hace que dos secciones distintas "respiren" igual.
RITMO = 6.0

RADIO = 7  # esquinas de tarjetas y figuras
RADIO_CHICO = 4

# Version del sistema que se imprime en el pie.
VERSION_SISTEMA = "SELENE 1.0"


def numero(valor: float | int | None, decimales: int = 2, vacio: str = "—") -> str:
    """Formato numerico espanol: coma decimal y espacio fino de millar.

    Existe porque el reporte mezcla cifras escritas por Python (`f"{x:.2f}"` da
    punto decimal) con cifras dibujadas dentro de las graficas, y ver "2.418
    kWh" en una barra y "2,418 kWh" en la tarjeta de al lado hace dudar de si
    son el mismo numero o mil veces mas. Una sola funcion para todas.
    """
    if valor is None:
        return vacio
    texto = f"{float(valor):,.{decimales}f}"
    # Se cambia en dos pasos con un marcador para no pisar lo ya sustituido.
    return texto.replace(",", " ").replace(".", ",")


def gris_de(valor: float) -> colors.Color:
    """Gris de la familia de la tinta (nunca gris neutro azulado)."""
    return colors.Color(
        TINTA.red + (1 - TINTA.red) * valor,
        TINTA.green + (1 - TINTA.green) * valor,
        TINTA.blue + (1 - TINTA.blue) * valor,
    )


def sombra_suave(c, x: float, y: float, ancho: float, alto: float, radio: float = RADIO) -> None:
    """Sombra de tarjeta: tres rectangulos redondeados apilados con alfa muy
    bajo. ReportLab no tiene `box-shadow`, y un solo rectangulo gris se lee
    como un borde sucio; tres capas de 2 % dan el degradado que hace que la
    tarjeta parezca levantada del papel en vez de pegada.

    La sombra cae hacia abajo y a la derecha, que es donde caen todas las de
    la aplicacion cuando la luz esta arriba (ver `--shadow-raise`).
    """
    c.saveState()
    for i, (desplazamiento, alfa) in enumerate(((2.4, 0.05), (1.6, 0.05), (0.8, 0.06))):
        c.setFillColor(TINTA)
        c.setFillAlpha(alfa)
        c.roundRect(
            x + desplazamiento * 0.45,
            y - desplazamiento,
            ancho,
            alto,
            radio + (2 - i) * 0.5,
            stroke=0,
            fill=1,
        )
    c.restoreState()


# ============================== ICONOGRAFIA ==============================
# Los mismos objetos que dibuja el panel lateral del Centro de Monitoreo
# (`frontend/src/modules/monitoreo/PanelLateral.jsx`), redibujados con
# primitivas de ReportLab sobre una cuadricula normalizada 0..1. Que el icono
# de "luminarias" del PDF sea el MISMO bombillo que el de la pantalla es
# barato de hacer y es justo lo que separa un documento de la aplicacion que
# lo emitio de un PDF genérico.


def _trazo(c, color, grosor: float) -> None:
    c.setStrokeColor(color)
    c.setFillColor(color)
    c.setLineWidth(grosor)
    c.setLineCap(1)
    c.setLineJoin(1)


def _icono_personas(c, x, y, t, color, g) -> None:
    _trazo(c, color, g)
    c.circle(x + 0.5 * t, y + 0.68 * t, 0.15 * t, stroke=1, fill=0)
    p = c.beginPath()
    p.moveTo(x + 0.2 * t, y + 0.14 * t)
    p.curveTo(x + 0.22 * t, y + 0.46 * t, x + 0.78 * t, y + 0.46 * t, x + 0.8 * t, y + 0.14 * t)
    c.drawPath(p, stroke=1, fill=0)


def _icono_ventanas(c, x, y, t, color, g) -> None:
    _trazo(c, color, g)
    c.roundRect(x + 0.18 * t, y + 0.12 * t, 0.64 * t, 0.76 * t, 0.06 * t, stroke=1, fill=0)
    c.line(x + 0.5 * t, y + 0.12 * t, x + 0.5 * t, y + 0.88 * t)
    c.line(x + 0.18 * t, y + 0.5 * t, x + 0.82 * t, y + 0.5 * t)


def _icono_luminarias(c, x, y, t, color, g) -> None:
    """El bombillo: vidrio, cuello y rosca. El objeto de la marca."""
    _trazo(c, color, g)
    c.circle(x + 0.5 * t, y + 0.6 * t, 0.24 * t, stroke=1, fill=0)
    c.line(x + 0.38 * t, y + 0.34 * t, x + 0.38 * t, y + 0.22 * t)
    c.line(x + 0.62 * t, y + 0.34 * t, x + 0.62 * t, y + 0.22 * t)
    c.line(x + 0.36 * t, y + 0.18 * t, x + 0.64 * t, y + 0.18 * t)
    c.line(x + 0.41 * t, y + 0.1 * t, x + 0.59 * t, y + 0.1 * t)


def _icono_iluminacion(c, x, y, t, color, g) -> None:
    """Sol: el aprovechamiento de luz natural."""
    _trazo(c, color, g)
    c.circle(x + 0.5 * t, y + 0.5 * t, 0.18 * t, stroke=1, fill=0)
    for i in range(8):
        rad = math.radians(i * 45)
        c.line(
            x + 0.5 * t + math.cos(rad) * 0.28 * t,
            y + 0.5 * t + math.sin(rad) * 0.28 * t,
            x + 0.5 * t + math.cos(rad) * 0.4 * t,
            y + 0.5 * t + math.sin(rad) * 0.4 * t,
        )


def _icono_energia(c, x, y, t, color, g) -> None:
    """El rayo."""
    _trazo(c, color, g)
    p = c.beginPath()
    p.moveTo(x + 0.58 * t, y + 0.9 * t)
    p.lineTo(x + 0.26 * t, y + 0.46 * t)
    p.lineTo(x + 0.48 * t, y + 0.46 * t)
    p.lineTo(x + 0.44 * t, y + 0.1 * t)
    p.lineTo(x + 0.76 * t, y + 0.55 * t)
    p.lineTo(x + 0.54 * t, y + 0.55 * t)
    p.close()
    c.drawPath(p, stroke=1, fill=0)


def _icono_ahorro(c, x, y, t, color, g) -> None:
    """Hoja: lo que se deja de gastar."""
    _trazo(c, color, g)
    p = c.beginPath()
    p.moveTo(x + 0.24 * t, y + 0.2 * t)
    p.curveTo(x + 0.2 * t, y + 0.78 * t, x + 0.5 * t, y + 0.9 * t, x + 0.8 * t, y + 0.82 * t)
    p.curveTo(x + 0.84 * t, y + 0.4 * t, x + 0.58 * t, y + 0.18 * t, x + 0.24 * t, y + 0.2 * t)
    c.drawPath(p, stroke=1, fill=0)
    c.line(x + 0.3 * t, y + 0.26 * t, x + 0.68 * t, y + 0.7 * t)


def _icono_eficiencia(c, x, y, t, color, g) -> None:
    """Medidor con aguja: que tan cerca del optimo esta el consumo."""
    _trazo(c, color, g)
    p = c.beginPath()
    p.moveTo(x + 0.16 * t, y + 0.34 * t)
    p.curveTo(x + 0.18 * t, y + 0.86 * t, x + 0.82 * t, y + 0.86 * t, x + 0.84 * t, y + 0.34 * t)
    c.drawPath(p, stroke=1, fill=0)
    c.line(x + 0.5 * t, y + 0.34 * t, x + 0.66 * t, y + 0.66 * t)
    c.circle(x + 0.5 * t, y + 0.34 * t, 0.045 * t, stroke=0, fill=1)


def _icono_co2(c, x, y, t, color, g) -> None:
    """Nube de emisiones."""
    _trazo(c, color, g)
    p = c.beginPath()
    p.moveTo(x + 0.22 * t, y + 0.36 * t)
    p.curveTo(x + 0.1 * t, y + 0.62 * t, x + 0.34 * t, y + 0.76 * t, x + 0.44 * t, y + 0.66 * t)
    p.curveTo(x + 0.54 * t, y + 0.86 * t, x + 0.82 * t, y + 0.78 * t, x + 0.78 * t, y + 0.52 * t)
    p.curveTo(x + 0.9 * t, y + 0.4 * t, x + 0.72 * t, y + 0.28 * t, x + 0.22 * t, y + 0.36 * t)
    c.drawPath(p, stroke=1, fill=0)


def _icono_reloj(c, x, y, t, color, g) -> None:
    _trazo(c, color, g)
    c.circle(x + 0.5 * t, y + 0.5 * t, 0.34 * t, stroke=1, fill=0)
    c.line(x + 0.5 * t, y + 0.5 * t, x + 0.5 * t, y + 0.72 * t)
    c.line(x + 0.5 * t, y + 0.5 * t, x + 0.66 * t, y + 0.44 * t)


def _icono_alerta(c, x, y, t, color, g) -> None:
    _trazo(c, color, g)
    p = c.beginPath()
    p.moveTo(x + 0.5 * t, y + 0.88 * t)
    p.lineTo(x + 0.9 * t, y + 0.16 * t)
    p.lineTo(x + 0.1 * t, y + 0.16 * t)
    p.close()
    c.drawPath(p, stroke=1, fill=0)
    c.line(x + 0.5 * t, y + 0.36 * t, x + 0.5 * t, y + 0.58 * t)
    c.circle(x + 0.5 * t, y + 0.27 * t, 0.035 * t, stroke=0, fill=1)


def _icono_zona(c, x, y, t, color, g) -> None:
    """Planta del espacio: cuatro modulos, como el icono de historial."""
    _trazo(c, color, g)
    c.roundRect(x + 0.14 * t, y + 0.52 * t, 0.32 * t, 0.34 * t, 0.05 * t, stroke=1, fill=0)
    c.roundRect(x + 0.54 * t, y + 0.52 * t, 0.32 * t, 0.34 * t, 0.05 * t, stroke=1, fill=0)
    c.roundRect(x + 0.14 * t, y + 0.14 * t, 0.32 * t, 0.3 * t, 0.05 * t, stroke=1, fill=0)
    c.roundRect(x + 0.54 * t, y + 0.14 * t, 0.32 * t, 0.3 * t, 0.05 * t, stroke=1, fill=0)


def _icono_camara(c, x, y, t, color, g) -> None:
    _trazo(c, color, g)
    c.roundRect(x + 0.1 * t, y + 0.28 * t, 0.52 * t, 0.42 * t, 0.08 * t, stroke=1, fill=0)
    p = c.beginPath()
    p.moveTo(x + 0.66 * t, y + 0.42 * t)
    p.lineTo(x + 0.88 * t, y + 0.28 * t)
    p.lineTo(x + 0.88 * t, y + 0.7 * t)
    p.lineTo(x + 0.66 * t, y + 0.56 * t)
    p.close()
    c.drawPath(p, stroke=1, fill=0)


ICONOS = {
    "personas": _icono_personas,
    "ventanas": _icono_ventanas,
    "luminarias": _icono_luminarias,
    "iluminacion": _icono_iluminacion,
    "energia": _icono_energia,
    "ahorro": _icono_ahorro,
    "eficiencia": _icono_eficiencia,
    "co2": _icono_co2,
    "reloj": _icono_reloj,
    "alerta": _icono_alerta,
    "zona": _icono_zona,
    "camara": _icono_camara,
}


def dibujar_icono(c, nombre: str, x: float, y: float, tamano: float, color=TINTA_2, grosor: float = 0.9) -> None:
    """Dibuja el icono `nombre` en una caja de `tamano` x `tamano` con la
    esquina inferior izquierda en (x, y). Un nombre desconocido no rompe el
    reporte: cae al bombillo, que es el objeto neutro de la marca."""
    funcion = ICONOS.get(nombre, _icono_luminarias)
    c.saveState()
    funcion(c, x, y, tamano, color, grosor)
    c.restoreState()


def dibujar_bombillo(
    c,
    cx: float,
    y_base: float,
    tamano: float,
    color=AMBAR,
    opacidad: float = 1.0,
    grosor: float = 1.4,
) -> None:
    """El bombillo de SELENE dibujado a linea: vidrio, cuello, rosca y
    filamento, centrado en `cx` y apoyado en `y_base`.

    Mismo dibujo para los dos usos que tiene en el documento —la marca de agua
    tenue del fondo y el logo de cierre—, solo cambian tamano, opacidad y
    grosor. Que sea el MISMO trazo en los dos sitios es lo que hace que se lea
    como una marca y no como dos adornos distintos.
    """
    radio = tamano * 0.28
    cy_vidrio = y_base + tamano * 0.72
    ancho_cuello_arriba = radio * 0.6
    ancho_cuello_abajo = radio * 0.4
    y_cuello_arriba = cy_vidrio - radio * 0.75
    y_cuello_abajo = y_base + tamano * 0.22

    c.saveState()
    c.setStrokeColor(color)
    c.setStrokeAlpha(opacidad)
    c.setFillAlpha(0)  # solo contorno: relleno haria de esto una mancha
    c.setLineWidth(grosor)
    c.setLineCap(1)
    c.setLineJoin(1)

    c.circle(cx, cy_vidrio, radio, stroke=1, fill=0)

    cuello = c.beginPath()
    cuello.moveTo(cx - ancho_cuello_arriba, y_cuello_arriba)
    cuello.lineTo(cx - ancho_cuello_abajo, y_cuello_abajo)
    cuello.lineTo(cx + ancho_cuello_abajo, y_cuello_abajo)
    cuello.lineTo(cx + ancho_cuello_arriba, y_cuello_arriba)
    c.drawPath(cuello, stroke=1, fill=0)

    for i in range(3):
        y = y_cuello_abajo - (tamano * 0.06) * (i + 1)
        c.line(cx - ancho_cuello_abajo, y, cx + ancho_cuello_abajo, y)

    # Filamento: el zigzag que en la aplicacion es la boca de Lum.
    c.setLineWidth(max(grosor * 0.6, 0.4))
    c.line(cx - radio * 0.3, cy_vidrio - radio * 0.2, cx, cy_vidrio + radio * 0.25)
    c.line(cx, cy_vidrio + radio * 0.25, cx + radio * 0.3, cy_vidrio - radio * 0.2)

    c.restoreState()


def dibujar_palabra_marca(
    c, x: float, y: float, ancho: float, tamano: float = TAM_ANOTACION, color=TINTA_3, espaciado: float = 2.8
) -> None:
    """«S E L E N E» centrada en `ancho`, con el mismo espaciado generoso que
    el logotipo de la aplicacion (`tracking-[0.42em]` en `Marca.jsx`).

    Se dibuja letra a letra en vez de con un `charSpace` del canvas: ese ajuste
    no esta expuesto como metodo publico en ReportLab (`setCharSpace` no existe
    en el Canvas), y tocar `_charSpace` seria depender de un atributo privado.
    Ademas asi el centrado es exacto, porque `stringWidth` no cuenta el
    espaciado anadido.
    """
    texto = "SELENE"
    anchos = [pdfmetrics.stringWidth(letra, SANS, tamano) for letra in texto]
    ancho_total = sum(anchos) + espaciado * (len(texto) - 1)

    c.saveState()
    c.setFont(SANS, tamano)
    c.setFillColor(color)
    cursor = x + (ancho - ancho_total) / 2
    for letra, ancho_letra in zip(texto, anchos):
        c.drawString(cursor, y, letra)
        cursor += ancho_letra + espaciado
    c.restoreState()


def dibujar_marca(c, x: float, y: float, tamano: float, color=TINTA, opacidad: float = 1.0) -> None:
    """La marca de SELENE: un punto de luz con ocho rayos. El mismo dibujo que
    `frontend/src/components/Marca.jsx`."""
    c.saveState()
    c.setStrokeColor(color)
    c.setFillColor(color)
    c.setStrokeAlpha(opacidad)
    c.setFillAlpha(opacidad)
    c.setLineWidth(tamano * 0.055)
    c.setLineCap(1)
    cx, cy = x + tamano / 2, y + tamano / 2
    for i in range(8):
        rad = math.radians(i * 45)
        c.line(
            cx + math.cos(rad) * tamano * 0.3,
            cy + math.sin(rad) * tamano * 0.3,
            cx + math.cos(rad) * tamano * 0.47,
            cy + math.sin(rad) * tamano * 0.47,
        )
    c.circle(cx, cy, tamano * 0.16, stroke=0, fill=1)
    c.restoreState()
