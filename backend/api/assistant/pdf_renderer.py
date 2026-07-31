"""Render de reportes en PDF con ReportLab (puro Python, sin dependencias de
sistema nuevas -- ver decision registrada en el plan de esta iteracion).

`render_pdf` es generico: recibe un titulo + una lista de secciones
(`{"titulo": str, "parrafos": list[str] | None, "tabla": list[list[str]] | None}`,
la primera fila de `tabla` es el encabezado) y las dibuja en orden. Cada
`report_data.datos_*` arma sus propias secciones; este modulo solo sabe
dibujar, no conoce de donde salen los numeros.
"""

from __future__ import annotations

from pathlib import Path
from xml.sax.saxutils import escape

from reportlab.lib import colors
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import cm
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

_ESTILOS = getSampleStyleSheet()
_ESTILO_TITULO = ParagraphStyle("TituloSelene", parent=_ESTILOS["Title"], textColor=colors.HexColor("#1f2937"))
_ESTILO_SUBTITULO = ParagraphStyle(
    "Subtitulo", parent=_ESTILOS["Normal"], textColor=colors.HexColor("#4b5563"), spaceAfter=12,
)
_ESTILO_SECCION = ParagraphStyle(
    "Seccion", parent=_ESTILOS["Heading2"], textColor=colors.HexColor("#111827"), spaceBefore=14, spaceAfter=6,
)
_ESTILO_PARRAFO = ParagraphStyle("Parrafo", parent=_ESTILOS["Normal"], spaceAfter=4)
_ESTILO_PIE = ParagraphStyle(
    "Pie", parent=_ESTILOS["Normal"], fontSize=8, textColor=colors.HexColor("#6b7280"), spaceBefore=18,
)
_ESTILO_CELDA = ParagraphStyle("Celda", parent=_ESTILOS["Normal"], fontSize=8, leading=10)
_ESTILO_CELDA_ENCABEZADO = ParagraphStyle(
    "CeldaEncabezado", parent=_ESTILO_CELDA, textColor=colors.white, fontName="Helvetica-Bold",
)

_MARGEN = 2 * cm
_ANCHO_DISPONIBLE = letter[0] - 2 * _MARGEN
_ANCHO_MINIMO_COLUMNA = 2.6 * cm

_DISCLAIMER = (
    "Reporte generado automaticamente por el asistente de voz de SELENE. Las cifras citadas provienen "
    "del modulo de prediccion energetica (modelo LightGBM ya entrenado); son una estimacion, no una "
    "medicion de un medidor fisico."
)

# Colores de marca (ver frontend/tailwind.config.js -> beam/glow) para que el
# bombillo del PDF combine con el resto de SELENE (naranja/ambar).
_COLOR_BOMBILLO_MARCA_AGUA = colors.HexColor("#ffb800")
_COLOR_BOMBILLO_LOGO = colors.HexColor("#ff7a00")


def _dibujar_bombillo(c, cx: float, y_base: float, tamano: float, color, opacidad: float, grosor: float = 1.4) -> None:
    """Icono de bombillo dibujado con primitivas vectoriales (sin imagen
    externa): vidrio (circulo) + cuello (trapecio) + base/rosca (lineas),
    centrado en `cx` y apoyado en `y_base`. Se reusa tanto para la marca de
    agua tenue de fondo como para el logo pequeno del pie de pagina -- mismo
    dibujo, distinto tamano/opacidad/color."""
    radio = tamano * 0.28
    cy_vidrio = y_base + tamano * 0.72
    ancho_cuello_arriba = radio * 0.6
    ancho_cuello_abajo = radio * 0.4
    y_cuello_arriba = cy_vidrio - radio * 0.75
    y_cuello_abajo = y_base + tamano * 0.22

    c.saveState()
    c.setStrokeColor(color)
    c.setFillColor(color)
    c.setStrokeAlpha(opacidad)
    c.setFillAlpha(0)
    c.setLineWidth(grosor)
    c.setLineCap(1)
    c.setLineJoin(1)

    # Vidrio del bombillo.
    c.circle(cx, cy_vidrio, radio, stroke=1, fill=0)

    # Cuello: conecta el vidrio con la base.
    cuello = c.beginPath()
    cuello.moveTo(cx - ancho_cuello_arriba, y_cuello_arriba)
    cuello.lineTo(cx - ancho_cuello_abajo, y_cuello_abajo)
    cuello.lineTo(cx + ancho_cuello_abajo, y_cuello_abajo)
    cuello.lineTo(cx + ancho_cuello_arriba, y_cuello_arriba)
    c.drawPath(cuello, stroke=1, fill=0)

    # Base/rosca: 3 lineas horizontales.
    for i in range(3):
        y = y_cuello_abajo - (tamano * 0.06) * (i + 1)
        c.line(cx - ancho_cuello_abajo, y, cx + ancho_cuello_abajo, y)

    # Filamento (zigzag simple) dentro del vidrio.
    c.setLineWidth(max(grosor * 0.6, 0.4))
    c.line(cx - radio * 0.3, cy_vidrio - radio * 0.2, cx, cy_vidrio + radio * 0.25)
    c.line(cx, cy_vidrio + radio * 0.25, cx + radio * 0.3, cy_vidrio - radio * 0.2)

    c.restoreState()


def _decorar_pagina(canvas_obj, doc) -> None:
    """Callback de pagina (`onFirstPage`/`onLaterPages` de `SimpleDocTemplate`):
    dibuja el bombillo grande y tenue de fondo (marca de agua, apenas visible
    detras del contenido) y uno pequeno junto al pie, a modo de logo."""
    ancho_pagina, alto_pagina = letter

    _dibujar_bombillo(
        canvas_obj, cx=ancho_pagina / 2, y_base=alto_pagina / 2 - 110, tamano=220,
        color=_COLOR_BOMBILLO_MARCA_AGUA, opacidad=0.16, grosor=2.6,
    )
    _dibujar_bombillo(
        canvas_obj, cx=ancho_pagina / 2, y_base=_MARGEN * 0.28, tamano=26,
        color=_COLOR_BOMBILLO_LOGO, opacidad=0.85, grosor=1.1,
    )


def _construir_tabla(filas: list[list[str]]) -> Table:
    """Cada celda se envuelve en un `Paragraph` para que el texto largo (p. ej.
    la descripcion de un evento o una recomendacion) haga salto de linea en
    vez de desbordarse fuera de la columna/pagina. El ancho de columna es
    proporcional al contenido mas largo que tenga esa columna (heuristica
    simple: cuenta de caracteres), no un ancho fijo -- las tablas de cada
    tipo de reporte tienen columnas de texto largo en posiciones distintas
    (ver `report_data.py`)."""
    num_cols = len(filas[0])
    anchos_relativos = [
        max((len(str(fila[col])) for fila in filas), default=8)
        for col in range(num_cols)
    ]
    total_relativo = sum(anchos_relativos) or 1
    col_widths = [_ANCHO_DISPONIBLE * (ancho / total_relativo) for ancho in anchos_relativos]

    # Piso minimo por columna (evita que "Hora"/"Fecha" queden tan angostas
    # que cada caracter salte de linea): se lo restamos a la columna mas
    # ancha (la de texto largo), que sí tiene margen para encogerse porque
    # sus celdas igual van a wrappear a varias lineas.
    idx_mas_ancha = max(range(num_cols), key=lambda i: col_widths[i])
    faltante = sum(
        max(_ANCHO_MINIMO_COLUMNA - w, 0) for i, w in enumerate(col_widths) if i != idx_mas_ancha
    )
    col_widths = [w if i == idx_mas_ancha else max(w, _ANCHO_MINIMO_COLUMNA) for i, w in enumerate(col_widths)]
    col_widths[idx_mas_ancha] = max(col_widths[idx_mas_ancha] - faltante, _ANCHO_MINIMO_COLUMNA)

    filas_pdf = [
        [
            Paragraph(escape(str(celda)), _ESTILO_CELDA_ENCABEZADO if i == 0 else _ESTILO_CELDA)
            for celda in fila
        ]
        for i, fila in enumerate(filas)
    ]

    tabla = Table(filas_pdf, colWidths=col_widths, hAlign="LEFT", repeatRows=1)
    tabla.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1f2937")),
        ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#d1d5db")),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f3f4f6")]),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
    ]))
    return tabla


def render_pdf(ruta: Path, titulo: str, subtitulo: str, secciones: list[dict]) -> None:
    doc = SimpleDocTemplate(
        str(ruta), pagesize=letter,
        topMargin=_MARGEN, bottomMargin=_MARGEN, leftMargin=_MARGEN, rightMargin=_MARGEN,
    )
    flujo = [Paragraph(escape(titulo), _ESTILO_TITULO), Paragraph(escape(subtitulo), _ESTILO_SUBTITULO)]

    for seccion in secciones:
        flujo.append(Paragraph(escape(seccion["titulo"]), _ESTILO_SECCION))

        for parrafo in seccion.get("parrafos") or []:
            flujo.append(Paragraph(escape(parrafo), _ESTILO_PARRAFO))

        tabla = seccion.get("tabla")
        if tabla:
            flujo.append(Spacer(1, 4))
            flujo.append(_construir_tabla(tabla))

        flujo.append(Spacer(1, 6))

    flujo.append(Spacer(1, 14))
    flujo.append(Paragraph(_DISCLAIMER, _ESTILO_PIE))

    doc.build(flujo, onFirstPage=_decorar_pagina, onLaterPages=_decorar_pagina)
