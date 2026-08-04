"""Ensambla el PDF: pagina, encabezado, pie y el orden de los bloques.

`render_pdf` recibe un DOCUMENTO ya decidido (`report_data.py` / `reports.py`)
y no toma ni una decision de contenido: no sabe de donde salen los numeros ni
por que esta seccion va antes que la otra. Lo unico que sabe es como se ve un
reporte de SELENE.

El documento es:

    {
      "titulo": str,
      "subtitulo": str,          # una linea: quien lo pidio y cuando
      "periodo": str,
      "secciones": [ {"titulo": str, "anotacion": str|None, "bloques": [...]} ]
    }

y cada bloque es uno de estos (`tipo` decide como se dibuja):

    {"tipo": "destacado",     "valor","unidad","etiqueta","nota","color"}
    {"tipo": "indicadores",   "items": [...], "columnas": 3}
    {"tipo": "grafica",       "forma": "columnas|barras|linea|division", ...,
                              "interpretacion": str}
    {"tipo": "figura",        "imagen": bytes, "descripcion": str}
    {"tipo": "observaciones", "parrafos": [...]}
    {"tipo": "renglones",     "items": [(etiqueta, valor)], "titulo": str|None}
    {"tipo": "parrafos",      "parrafos": [...]}
    {"tipo": "tabla",         "filas": [[...]], "nota": str|None}

`tabla` sigue existiendo pero es el ultimo recurso: una tabla es la forma
correcta solo cuando el usuario de verdad va a leer celda por celda (un
registro de eventos con hora, sala y descripcion). Para todo lo demas hay
tarjetas, renglones y graficas, que se leen de un vistazo.
"""

from __future__ import annotations

import datetime as dt
from pathlib import Path
from xml.sax.saxutils import escape

from reportlab.lib.styles import ParagraphStyle
from reportlab.platypus import (
    BaseDocTemplate,
    Frame,
    KeepTogether,
    PageTemplate,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
)

from . import pdf_blocks as b
from . import pdf_theme as t

# --- Estilos de texto corrido ----------------------------------------------
ESTILO_CUERPO = ParagraphStyle(
    "Cuerpo",
    fontName=t.SANS,
    fontSize=t.TAM_CUERPO,
    leading=t.TAM_CUERPO + 4.8,
    textColor=t.TINTA,
    spaceAfter=t.RITMO,
)
ESTILO_SUBTITULO = ParagraphStyle(
    "Subtitulo",
    fontName=t.SANS,
    fontSize=t.TAM_MENUDA + 0.5,
    leading=t.TAM_MENUDA + 4,
    textColor=t.TINTA_3,
)
ESTILO_NOTA = ParagraphStyle(
    "Nota",
    fontName=t.SANS,
    fontSize=t.TAM_MENUDA,
    leading=t.TAM_MENUDA + 3.5,
    textColor=t.TINTA_3,
)
ESTILO_CELDA = ParagraphStyle(
    "Celda", fontName=t.SANS, fontSize=t.TAM_MENUDA, leading=t.TAM_MENUDA + 2.6, textColor=t.TINTA_2
)
ESTILO_CELDA_ENCABEZADO = ParagraphStyle(
    "CeldaEncabezado", parent=ESTILO_CELDA, fontName=t.SANS_FUERTE, fontSize=t.TAM_ANOTACION, textColor=t.TINTA_2
)

_ANCHO_MINIMO_COLUMNA = 2.2 * 28.35  # ~2,2 cm

_PIE_LEYENDA = "Reporte generado por SELENE"

# Texto visible por el usuario: CON tildes. Los comentarios y los nombres del
# backend siguen sin tildes (convencion del proyecto), pero lo que se imprime
# en el documento es espanol correcto -- una tilde faltante en un PDF que
# presume de disenado se lee como un error, no como una convencion.
# Corta a proposito: con la version larga, la nota se partia y dejaba una
# linea suelta en una pagina nueva, entera en blanco. Cabe en el pie de
# cualquier pagina y va agrupada para no volver a partirse.
_NOTA_METODO = (
    "Método. Cifras estimadas por el módulo de predicción energética de SELENE (LightGBM) a partir "
    "de lo que la cámara observó; no son lecturas de un medidor físico. SELENE detecta, calcula y "
    "recomienda: no acciona luminarias."
)


class _Documento(BaseDocTemplate):
    """Plantilla de dos paginas-tipo: la primera sin encabezado (el titulo hace
    de encabezado, como en una portada de articulo) y las siguientes con un
    encabezado corrido discreto. Las dos comparten el mismo pie.

    Se usa `BaseDocTemplate` y no `SimpleDocTemplate` justamente para poder
    tener dos `PageTemplate` distintos sin trucos.
    """

    def __init__(self, ruta: Path, titulo: str, generado_en: dt.datetime, **kwargs):
        super().__init__(
            str(ruta),
            pagesize=t.PAGINA,
            leftMargin=t.MARGEN_X,
            rightMargin=t.MARGEN_X,
            topMargin=t.MARGEN_ARRIBA,
            bottomMargin=t.MARGEN_ABAJO,
            title=titulo,
            author="SELENE",
            subject="Reporte de eficiencia energetica",
            creator=t.VERSION_SISTEMA,
            **kwargs,
        )
        self.titulo_corrido = titulo
        self.generado_en = generado_en

        marco = Frame(
            self.leftMargin,
            self.bottomMargin,
            self.width,
            self.height,
            leftPadding=0,
            rightPadding=0,
            topPadding=0,
            bottomPadding=0,
            id="cuerpo",
        )
        self.addPageTemplates([
            PageTemplate(id="primera", frames=[marco], onPage=self._primera_pagina),
            PageTemplate(id="siguientes", frames=[marco], onPage=self._pagina_siguiente),
        ])

    # -- decoraciones de pagina ------------------------------------------
    def _marca_de_agua(self, c) -> None:
        """El bombillo grande y tenue del fondo, en TODAS las paginas.

        Se dibuja desde el callback de la plantilla, que ReportLab ejecuta al
        empezar la pagina y por tanto ANTES de los flowables: queda debajo del
        contenido. Las tarjetas y las figuras tienen relleno opaco, asi que la
        marca solo asoma en el aire de la hoja, que es donde debe verse.

        La opacidad es deliberadamente baja (10 %): a la del diseno anterior
        (16 % sobre un fondo con tablas grises) el trazo competia con el texto
        menudo que le pasa por encima.
        """
        ancho, alto = t.PAGINA
        t.dibujar_bombillo(
            c,
            cx=ancho / 2,
            y_base=alto / 2 - 120,
            tamano=240,
            color=t.AMBAR,
            opacidad=0.10,
            grosor=2.2,
        )

    def _pie(self, c) -> None:
        ancho, _ = t.PAGINA
        y = t.MARGEN_ABAJO - 26

        c.saveState()
        c.setStrokeColor(t.LINO)
        c.setLineWidth(0.5)
        c.line(t.MARGEN_X, y + 14, ancho - t.MARGEN_X, y + 14)

        c.setFont(t.SANS, t.TAM_ANOTACION)
        c.setFillColor(t.TINTA_3)
        izquierda = " · ".join((
            _PIE_LEYENDA,
            t.VERSION_SISTEMA,
            self.generado_en.strftime("%d/%m/%Y"),
        ))
        c.drawString(t.MARGEN_X, y, izquierda.upper())
        c.drawRightString(ancho - t.MARGEN_X, y, f"PÁGINA {c.getPageNumber()}")
        c.restoreState()

    def _primera_pagina(self, c, doc) -> None:
        self._marca_de_agua(c)
        self._pie(c)

    def _pagina_siguiente(self, c, doc) -> None:
        self._marca_de_agua(c)
        ancho, alto = t.PAGINA
        y = alto - t.MARGEN_ARRIBA + 16

        c.saveState()
        t.dibujar_marca(c, t.MARGEN_X, y - 1, 9, color=t.TINTA_3)
        c.setFont(t.SANS, t.TAM_ANOTACION)
        c.setFillColor(t.TINTA_3)
        c.drawString(t.MARGEN_X + 14, y + 1, self.titulo_corrido.upper())
        # Fecha y hora de generacion, en el encabezado corrido: cualquier
        # pagina suelta impresa sigue diciendo de cuando es.
        c.drawRightString(
            ancho - t.MARGEN_X, y + 1, self.generado_en.strftime("%d/%m/%Y · %H:%M").upper()
        )
        c.setStrokeColor(t.LINO)
        c.setLineWidth(0.5)
        c.line(t.MARGEN_X, y - 7, ancho - t.MARGEN_X, y - 7)
        c.restoreState()

        self._pie(c)

    def handle_pageBegin(self):
        """Tras la primera pagina se cambia de plantilla, y asi aparece el
        encabezado corrido. Es la receta de la documentacion de ReportLab para
        "primera pagina distinta": hay que llamar a `_handle_pageBegin` (no a
        `handle_pageBegin` del padre) y pedir la plantilla siguiente aqui
        mismo, porque el cambio solo tiene efecto a partir del salto."""
        self._handle_pageBegin()
        self._handle_nextPageTemplate("siguientes")


# ============================== BLOQUES ==============================


def _tabla(filas: list[list[str]], ancho_disponible: float) -> Table:
    """Tabla despojada: sin bordes verticales, sin encabezado en negativo y sin
    zebra. Solo una hairline bajo el encabezado y otra entre filas. Que se lea
    como una lista ordenada y no como una hoja de calculo.

    El ancho de cada columna sigue siendo proporcional al contenido mas largo
    que tenga (heuristica de conteo de caracteres) con un piso por columna,
    porque las columnas de texto largo caen en posiciones distintas segun el
    reporte.
    """
    num_cols = len(filas[0])
    relativos = [max((len(str(fila[col])) for fila in filas), default=8) for col in range(num_cols)]
    total = sum(relativos) or 1
    anchos = [ancho_disponible * (r / total) for r in relativos]

    idx_ancha = max(range(num_cols), key=lambda i: anchos[i])
    faltante = sum(max(_ANCHO_MINIMO_COLUMNA - w, 0) for i, w in enumerate(anchos) if i != idx_ancha)
    anchos = [w if i == idx_ancha else max(w, _ANCHO_MINIMO_COLUMNA) for i, w in enumerate(anchos)]
    anchos[idx_ancha] = max(anchos[idx_ancha] - faltante, _ANCHO_MINIMO_COLUMNA)

    contenido = [
        [
            Paragraph(
                escape(str(celda)).upper() if i == 0 else escape(str(celda)),
                ESTILO_CELDA_ENCABEZADO if i == 0 else ESTILO_CELDA,
            )
            for celda in fila
        ]
        for i, fila in enumerate(filas)
    ]

    tabla = Table(contenido, colWidths=anchos, hAlign="LEFT", repeatRows=1)
    estilo = [
        ("LINEBELOW", (0, 0), (-1, 0), 0.7, t.TINTA_4),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ("LEFTPADDING", (0, 0), (0, -1), 0),
        ("RIGHTPADDING", (-1, 0), (-1, -1), 0),
    ]
    # Hairline entre filas, pero NO debajo de la ultima (la tabla tiene que
    # terminar en aire, no en una raya). El rango se calcula porque con una
    # sola fila de datos "1 hasta -2" queda invertido.
    if len(filas) > 2:
        estilo.append(("LINEBELOW", (0, 1), (-1, -2), 0.4, t.LINO))
    tabla.setStyle(TableStyle(estilo))
    return tabla


def _grafica(bloque: dict):
    forma = bloque.get("forma", "columnas")
    datos = bloque.get("datos") or []
    titulo = bloque.get("titulo")
    unidad = bloque.get("unidad", "")

    if forma == "barras":
        return b.GraficaBarras(
            datos,
            unidad=unidad,
            titulo=titulo,
            decimales=int(bloque.get("decimales", 3)),
            fraccion_etiqueta=float(bloque.get("fraccion_etiqueta", 0.34)),
        )
    if forma == "linea":
        return b.GraficaLinea(
            datos, unidad=unidad, titulo=titulo, decimales=int(bloque.get("decimales", 1))
        )
    if forma == "division":
        return b.GraficaDivision(bloque.get("partes") or datos, titulo=titulo)
    return b.GraficaColumnas(
        datos,
        unidad=unidad,
        titulo=titulo,
        etiqueta_secundario=bloque.get("etiqueta_secundario", "ahorro potencial"),
        decimales=int(bloque.get("decimales", 2)),
    )


def _grupos_de_bloque(bloque: dict, ancho: float) -> list[list]:
    """Traduce un bloque del documento a GRUPOS de flowables.

    Cada grupo es una lista de piezas que no deben separarse en dos paginas
    (una grafica y su interpretacion, por ejemplo). El renderer decide luego
    como agruparlas, y por eso esta funcion **no** devuelve `KeepTogether`
    ella misma: `KeepTogether.wrap()` de ReportLab devuelve a proposito una
    altura enorme para forzar el `split`, asi que meter un `KeepTogether`
    dentro de otro hace que el de fuera lo mida como infinito y salte de
    pagina SIEMPRE. Sintoma: cada seccion empezaba en una hoja nueva con tres
    cuartos de hoja en blanco.

    Un bloque que no se reconozca se ignora: es preferible un reporte con una
    seccion de menos que un reporte que no se genera (aplica sobre todo a lo
    que redacta el LLM).
    """
    tipo = bloque.get("tipo")

    if tipo == "destacado":
        return [[
            b.Destacado(
                str(bloque.get("valor", "—")),
                str(bloque.get("unidad") or ""),
                str(bloque.get("etiqueta") or ""),
                bloque.get("nota"),
                color=bloque.get("color"),
            ),
            Spacer(1, t.RITMO * 2),
        ]]

    if tipo == "indicadores":
        items = [i for i in (bloque.get("items") or []) if isinstance(i, dict)]
        if not items:
            return []
        columnas = int(bloque.get("columnas") or (3 if len(items) >= 3 else len(items)))
        columnas = max(1, min(4, columnas))
        # Un grupo por FILA de tarjetas: asi el salto de pagina cae entre
        # filas y nunca corta una tarjeta por la mitad.
        grupos = []
        for inicio in range(0, len(items), columnas):
            grupos.append([
                b.FilaIndicadores(items[inicio : inicio + columnas], columnas=columnas),
                Spacer(1, b.FilaIndicadores.SEPARACION),
            ])
        grupos[-1].append(Spacer(1, t.RITMO))
        return grupos

    if tipo == "grafica":
        # La grafica y su lectura van en el MISMO grupo: media grafica en una
        # pagina y su interpretacion en la siguiente no se entiende.
        piezas = [_grafica(bloque)]
        interpretacion = (bloque.get("interpretacion") or "").strip()
        if interpretacion:
            piezas.append(Spacer(1, t.RITMO))
            piezas.append(b.Interpretacion(interpretacion))
        piezas.append(Spacer(1, t.RITMO * 2))
        return [piezas]

    if tipo == "figura":
        imagen = bloque.get("imagen")
        if not imagen:
            return []
        return [[
            b.Figura(
                imagen,
                int(bloque.get("numero") or 1),
                str(bloque.get("descripcion") or ""),
                ancho_maximo=bloque.get("ancho_maximo") or ancho * 0.74,
            ),
            Spacer(1, t.RITMO * 2.5),
        ]]

    if tipo == "observaciones":
        parrafos = [str(p) for p in (bloque.get("parrafos") or []) if str(p).strip()]
        if not parrafos:
            return []
        return [[
            b.Observaciones(parrafos, titulo=bloque.get("titulo") or "Observaciones de SELENE"),
            Spacer(1, t.RITMO * 2),
        ]]

    if tipo == "renglones":
        items = [tuple(i) for i in (bloque.get("items") or []) if isinstance(i, (list, tuple)) and len(i) >= 2]
        if not items:
            return []
        return [[b.Renglones(items, titulo=bloque.get("titulo")), Spacer(1, t.RITMO * 2)]]

    if tipo == "parrafos":
        # Cada parrafo es su propio grupo: un texto largo SI debe poder
        # partirse entre paginas.
        return [[Paragraph(escape(str(p)), ESTILO_CUERPO)] for p in (bloque.get("parrafos") or [])]

    if tipo == "tabla":
        filas = bloque.get("filas") or []
        if len(filas) < 2:
            return []
        # La tabla va sola en su grupo (puede y debe partirse; repite el
        # encabezado); la nota, aparte.
        grupos = [[_tabla(filas, ancho)]]
        nota = (bloque.get("nota") or "").strip()
        if nota:
            grupos.append([Spacer(1, t.RITMO), Paragraph(escape(nota), ESTILO_NOTA)])
        grupos[-1].append(Spacer(1, t.RITMO * 2))
        return grupos

    if tipo == "separador":
        return [[b.Separador()]]

    return []


# ============================== ENSAMBLADO ==============================


def render_pdf(ruta: Path, documento: dict) -> None:
    titulo = str(documento.get("titulo") or "Reporte SELENE")
    generado_en = documento.get("generado_en") or dt.datetime.now()

    doc = _Documento(ruta, titulo, generado_en)
    ancho = doc.width
    flujo: list = []

    # ------------------------------ PORTADILLA ------------------------------
    # Anotacion, titulo grande en serif y una linea de contexto. Nada mas: la
    # primera cosa que el lector encuentra despues es ya el dato principal.
    periodo = str(documento.get("periodo") or "").strip()
    encabezado = " · ".join(x for x in ("REPORTE", periodo.upper()) if x)
    flujo.append(Paragraph(escape(encabezado), ParagraphStyle(
        "Anotacion", fontName=t.SANS, fontSize=t.TAM_ANOTACION, leading=t.TAM_ANOTACION + 4, textColor=t.TINTA_3,
    )))
    flujo.append(Spacer(1, t.RITMO))
    flujo.append(Paragraph(escape(titulo), ParagraphStyle(
        "Titulo", fontName=t.SERIF, fontSize=t.TAM_TITULO, leading=t.TAM_TITULO + 2, textColor=t.TINTA,
    )))
    subtitulo = str(documento.get("subtitulo") or "").strip()
    if subtitulo:
        flujo.append(Spacer(1, t.RITMO * 1.5))
        flujo.append(Paragraph(escape(subtitulo), ESTILO_SUBTITULO))
    flujo.append(b.Separador(alto=t.RITMO * 5))

    # ------------------------------ SECCIONES ------------------------------
    numero = 0
    for seccion in documento.get("secciones") or []:
        bloques = seccion.get("bloques") or []
        if not bloques:
            continue
        grupos: list[list] = []
        for bloque in bloques:
            if isinstance(bloque, dict):
                grupos.extend(_grupos_de_bloque(bloque, ancho))
        if not grupos:
            continue

        titulo_seccion = str(seccion.get("titulo") or "").strip()
        if titulo_seccion:
            numero += 1
            # El titulo viaja junto al primer grupo de la seccion.
            # `keepWithNext` no basta con Flowables propios (comprobado: el
            # titulo se quedaba solo al pie de la pagina y la tabla arrancaba
            # en la siguiente). `KeepTogether` si, y si el contenido no cabe
            # entero en una pagina lo parte igual, sin dejar huecos absurdos.
            grupos[0] = [
                b.TituloSeccion(titulo_seccion, numero=numero, anotacion=seccion.get("anotacion")),
                Spacer(1, t.RITMO * 1.5),
            ] + grupos[0]

        for grupo in grupos:
            flujo.append(KeepTogether(grupo) if len(grupo) > 1 else grupo[0])

        flujo.append(Spacer(1, t.RITMO * 3))

    # --------------------------- METODO Y CIERRE ---------------------------
    # Los tres van juntos: la nota de metodo y el logo de cierre son una sola
    # unidad de cierre, y el logo solo en una pagina nueva se leeria como un
    # error de maquetacion.
    flujo.append(KeepTogether([
        b.Separador(alto=t.RITMO * 2),
        Paragraph(escape(_NOTA_METODO), ESTILO_NOTA),
        b.Cierre(),
    ]))

    doc.build(flujo)
