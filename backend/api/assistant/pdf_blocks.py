"""Las piezas con las que se compone un reporte de SELENE.

Cada clase de aqui es un `Flowable` de ReportLab que se dibuja solo: sabe
cuanto alto necesita (`wrap`) y como pintarse (`draw`). El renderer
(`pdf_renderer.py`) solo las ordena; los datos los arma `report_data.py`.

Por que Flowables a mano y no `reportlab.graphics.charts`: el look por
defecto de esa libreria (ejes gruesos, cuadricula completa, leyendas en caja)
es exactamente lo que este reporte NO quiere, y pelearse con sus decenas de
atributos para apagarlo todo cuesta mas que dibujar cuatro rectangulos. Es la
misma decision que en el frontend, donde ninguna cifra se dibuja con una
libreria de graficos.

Regla de composicion que siguen todos los bloques: **el dato manda y el
adorno no existe**. Sin cuadriculas, sin ejes con marcas, sin sombras
duras, sin rellenos que no signifiquen nada. Si algo tiene color es porque
ese color quiere decir algo.
"""

from __future__ import annotations

from io import BytesIO

from reportlab.lib.utils import ImageReader
from reportlab.pdfbase import pdfmetrics
from reportlab.platypus import Flowable

from . import pdf_theme as t


# ============================== UTILIDADES ==============================


def ancho_texto(texto: str, fuente: str, tamano: float) -> float:
    return pdfmetrics.stringWidth(texto, fuente, tamano)


def partir_texto(texto: str, fuente: str, tamano: float, ancho: float, max_lineas: int | None = None) -> list[str]:
    """Corta `texto` en lineas que caben en `ancho`. Si se pasa de
    `max_lineas`, la ultima termina en elipsis: en una tarjeta es mejor una
    descripcion recortada que una tarjeta que crece y desalinea la fila."""
    palabras = texto.split()
    lineas: list[str] = []
    actual = ""

    for palabra in palabras:
        tentativa = f"{actual} {palabra}".strip()
        if ancho_texto(tentativa, fuente, tamano) <= ancho or not actual:
            actual = tentativa
        else:
            lineas.append(actual)
            actual = palabra

    if actual:
        lineas.append(actual)

    if max_lineas is not None and len(lineas) > max_lineas:
        lineas = lineas[:max_lineas]
        ultima = lineas[-1]
        while ultima and ancho_texto(ultima + "...", fuente, tamano) > ancho:
            ultima = ultima[:-1].rstrip()
        lineas[-1] = ultima + "..."

    return lineas or [""]


def _tamano_que_cabe(texto: str, fuente: str, tamano: float, ancho: float, minimo: float = 9) -> float:
    """Baja el cuerpo de una cifra hasta que quepa en su tarjeta. Preferible a
    dejar que se salga o a truncar un numero (un numero a medias es un dato
    falso)."""
    while tamano > minimo and ancho_texto(texto, fuente, tamano) > ancho:
        tamano -= 0.5
    return tamano


def _dibujar_lineas(c, lineas: list[str], x: float, y: float, fuente: str, tamano: float, color, interlinea: float) -> float:
    c.setFont(fuente, tamano)
    c.setFillColor(color)
    for linea in lineas:
        c.drawString(x, y, linea)
        y -= interlinea
    return y


# ============================== TITULOS ==============================


class TituloSeccion(Flowable):
    """El comienzo de una seccion: numero tenue, titulo en serif y un filo de
    luz corto debajo. Nada de barras de color ni fondos: el aire alrededor es
    lo que la separa de lo anterior."""

    def __init__(self, texto: str, numero: int | None = None, anotacion: str | None = None):
        super().__init__()
        self.texto = texto
        self.numero = numero
        self.anotacion = anotacion
        # Un titulo nunca debe quedar solo al final de una pagina.
        self.keepWithNext = 1

    def wrap(self, ancho_disp, alto_disp):
        self.ancho = ancho_disp
        self.lineas = partir_texto(self.texto, t.SERIF, t.TAM_SECCION, ancho_disp - 26)
        self.alto = 14 + len(self.lineas) * (t.TAM_SECCION + 3) + (10 if self.anotacion else 0)
        return ancho_disp, self.alto

    def draw(self):
        c = self.canv
        y = self.alto - 14

        if self.numero is not None:
            # El numero de seccion vive en el margen, en mayusculas menudas:
            # ayuda a ubicarse sin competir con el titulo.
            c.setFont(t.SANS, t.TAM_ANOTACION)
            c.setFillColor(t.TINTA_4)
            c.drawString(0, y + 1, f"{self.numero:02d}")

        x = 26 if self.numero is not None else 0
        for linea in self.lineas:
            c.setFont(t.SERIF, t.TAM_SECCION)
            c.setFillColor(t.TINTA)
            c.drawString(x, y, linea)
            y -= t.TAM_SECCION + 3

        if self.anotacion:
            c.setFont(t.SANS, t.TAM_ANOTACION)
            c.setFillColor(t.TINTA_3)
            c.drawString(x, y + 1, self.anotacion.upper())
            y -= 10

        # Filo de luz: 34 pt de ambar, no una regla de lado a lado.
        c.setStrokeColor(t.AMBAR)
        c.setLineWidth(1.2)
        c.setLineCap(1)
        c.line(x, y + 3, x + 34, y + 3)


class Separador(Flowable):
    """Separador discreto: una hairline que se desvanece en los extremos,
    dibujada como una fila de segmentos con alfa decreciente. Una linea recta
    de borde a borde corta la pagina en dos; esta solo sugiere."""

    def __init__(self, alto: float = 16):
        super().__init__()
        self.alto_total = alto

    def wrap(self, ancho_disp, alto_disp):
        self.ancho = ancho_disp
        return ancho_disp, self.alto_total

    def draw(self):
        c = self.canv
        y = self.alto_total / 2
        pasos = 40
        paso = self.ancho / pasos
        c.saveState()
        c.setLineWidth(0.5)
        for i in range(pasos):
            # Campana: transparente en los bordes, 100 % en el centro.
            posicion = i / (pasos - 1)
            alfa = 1 - abs(posicion - 0.5) * 2
            c.setStrokeColor(t.LINO)
            c.setStrokeAlpha(max(0.0, alfa) * 0.9)
            c.line(i * paso, y, (i + 1) * paso, y)
        c.restoreState()


# ============================== TARJETAS ==============================


class FilaIndicadores(Flowable):
    """Una fila de tarjetas de indicador, todas del mismo alto y del mismo
    ancho. El alto lo fija la tarjeta que mas necesita: dos tarjetas vecinas
    de alto distinto es lo primero que delata un documento generado sin
    cuidado.

    Cada tarjeta: icono, valor grande, etiqueta y una descripcion breve. Ese
    orden es la jerarquia — se ve el numero, se lee que es, y solo si
    interesa, por que.
    """

    RELLENO = 10
    SEPARACION = 9
    # Alto de la tarjeta SIN descripcion, derivado del propio dibujo y no
    # elegido a ojo: relleno arriba y abajo + icono + hueco + el salto de la
    # cifra a la etiqueta + el descendente de la etiqueta. Si se cambia el
    # orden de `_tarjeta`, hay que recalcular esto o el texto se sale por
    # abajo (fue exactamente lo que paso con el primer valor tanteado).
    ALTO_BASE = 2 * RELLENO + 17 + 12 + 11 + 4
    INTERLINEA_NOTA = t.TAM_MENUDA + 2

    def __init__(self, items: list[dict], columnas: int = 3):
        super().__init__()
        self.items = items[:columnas]
        self.columnas = columnas

    def _ancho_tarjeta(self, ancho_disp: float) -> float:
        return (ancho_disp - self.SEPARACION * (self.columnas - 1)) / self.columnas

    def wrap(self, ancho_disp, alto_disp):
        self.ancho = ancho_disp
        ancho_tarjeta = self._ancho_tarjeta(ancho_disp)
        ancho_texto_util = ancho_tarjeta - 2 * self.RELLENO

        alto = self.ALTO_BASE
        self._descripciones = []
        for item in self.items:
            descripcion = str(item.get("nota") or "")
            lineas = (
                partir_texto(descripcion, t.SANS, t.TAM_MENUDA, ancho_texto_util, max_lineas=3)
                if descripcion
                else []
            )
            self._descripciones.append(lineas)
            if lineas:
                # 11 pt para bajar de la etiqueta a la primera linea, mas el
                # resto de lineas, mas 2 pt de descendente.
                alto = max(alto, self.ALTO_BASE + 11 + (len(lineas) - 1) * self.INTERLINEA_NOTA + 2)

        # Todas las tarjetas de la fila comparten alto: dos vecinas de alto
        # distinto es lo primero que delata un documento generado sin cuidado.
        self.alto = alto
        return ancho_disp, alto

    def draw(self):
        c = self.canv
        ancho_tarjeta = self._ancho_tarjeta(self.ancho)

        for i, item in enumerate(self.items):
            x = i * (ancho_tarjeta + self.SEPARACION)
            self._tarjeta(c, item, x, 0, ancho_tarjeta, self.alto, self._descripciones[i])

    def _tarjeta(self, c, item: dict, x: float, y: float, ancho: float, alto: float, descripcion: list[str]) -> None:
        destacada = bool(item.get("destacada"))

        t.sombra_suave(c, x, y, ancho, alto)

        c.setFillColor(t.PAPEL)
        c.setStrokeColor(t.AMBAR if destacada else t.LINO)
        c.setLineWidth(1 if destacada else 0.7)
        c.roundRect(x, y, ancho, alto, t.RADIO, stroke=1, fill=1)

        interior_x = x + self.RELLENO
        cursor = y + alto - self.RELLENO

        # --- Icono, en su cuadradito de papel ---
        caja = 17
        c.setFillColor(t.PAPEL_2)
        c.setStrokeColor(t.LINO)
        c.setLineWidth(0.6)
        c.roundRect(interior_x, cursor - caja, caja, caja, t.RADIO_CHICO, stroke=1, fill=1)
        t.dibujar_icono(
            c,
            str(item.get("icono") or "luminarias"),
            interior_x + 3.2,
            cursor - caja + 3.2,
            caja - 6.4,
            color=t.ASCUA if destacada else t.TINTA_2,
            grosor=0.85,
        )

        # --- Tendencia, alineada a la derecha del icono ---
        tendencia = item.get("tendencia")
        if tendencia:
            color_tendencia = t.HOJA if item.get("tendencia_buena", True) else t.ARCILLA
            c.setFont(t.SANS_FUERTE, t.TAM_ANOTACION)
            c.setFillColor(color_tendencia)
            c.drawRightString(x + ancho - self.RELLENO, cursor - caja + 5, str(tendencia))

        cursor -= caja + 12

        # --- El valor: lo unico que se ve desde lejos ---
        valor = str(item.get("valor", "—"))
        unidad = str(item.get("unidad") or "")
        color_valor = item.get("color") or (t.ASCUA if destacada else t.TINTA)
        ancho_unidad = ancho_texto(f" {unidad}", t.SANS, t.TAM_MENUDA + 1) if unidad else 0
        tamano_valor = _tamano_que_cabe(
            valor, t.SANS_FUERTE, t.TAM_CIFRA, ancho - 2 * self.RELLENO - ancho_unidad
        )
        c.setFont(t.SANS_FUERTE, tamano_valor)
        c.setFillColor(color_valor)
        c.drawString(interior_x, cursor, valor)
        if unidad:
            c.setFont(t.SANS, t.TAM_MENUDA + 1)
            c.setFillColor(t.TINTA_3)
            c.drawString(interior_x + ancho_texto(valor, t.SANS_FUERTE, tamano_valor) + 2.5, cursor, unidad)

        cursor -= 11

        # --- La etiqueta: que es ese numero ---
        etiqueta = str(item.get("etiqueta") or "")
        c.setFont(t.SANS_FUERTE, t.TAM_ANOTACION)
        c.setFillColor(t.TINTA_2)
        for linea in partir_texto(etiqueta.upper(), t.SANS_FUERTE, t.TAM_ANOTACION, ancho - 2 * self.RELLENO, max_lineas=1):
            c.drawString(interior_x, cursor, linea)

        # --- La descripcion: el detalle tecnico, hasta abajo ---
        if descripcion:
            cursor -= 11
            _dibujar_lineas(
                c, descripcion, interior_x, cursor, t.SANS, t.TAM_MENUDA, t.TINTA_3, self.INTERLINEA_NOTA
            )


class Renglones(Flowable):
    """Lista etiqueta/valor separada por hairlines. Es el reemplazo de las
    tablas de dos columnas: la misma informacion sin encabezados, sin bordes
    verticales y sin el peso visual de una tabla. Se usa para el detalle
    tecnico que acompana a las tarjetas (muestras, umbrales, factores).

    `items`: [(etiqueta, valor)] o [(etiqueta, valor, "acento")]
    """

    ALTO_FILA = 15

    def __init__(self, items: list[tuple], titulo: str | None = None):
        super().__init__()
        self.items = items
        self.titulo = titulo

    def wrap(self, ancho_disp, alto_disp):
        self.ancho = ancho_disp
        self.alto = len(self.items) * self.ALTO_FILA + (13 if self.titulo else 0)
        return ancho_disp, self.alto

    def draw(self):
        c = self.canv
        y = self.alto

        if self.titulo:
            c.setFont(t.SANS_FUERTE, t.TAM_ANOTACION)
            c.setFillColor(t.TINTA_3)
            c.drawString(0, y - t.TAM_ANOTACION - 1, self.titulo.upper())
            y -= 13

        for i, fila in enumerate(self.items):
            etiqueta, valor = str(fila[0]), str(fila[1])
            acento = len(fila) > 2 and fila[2] == "acento"

            if i:
                c.setStrokeColor(t.LINO)
                c.setLineWidth(0.5)
                c.setStrokeAlpha(0.8)
                c.line(0, y, self.ancho, y)
                c.setStrokeAlpha(1)

            linea_base = y - self.ALTO_FILA + 4.5
            c.setFont(t.SANS, t.TAM_ANOTACION)
            c.setFillColor(t.TINTA_3)
            c.drawString(0, linea_base, etiqueta.upper())

            c.setFont(t.SANS_FUERTE if acento else t.SANS, t.TAM_MENUDA + 0.5)
            c.setFillColor(t.TINTA if acento else t.TINTA_2)
            c.drawRightString(self.ancho, linea_base, valor)

            y -= self.ALTO_FILA


class Destacado(Flowable):
    """La cifra protagonista del reporte, sola, enorme y sin caja. Es lo que
    contesta la pregunta del usuario en el primer segundo; todo lo demas del
    documento la explica."""

    def __init__(self, valor: str, unidad: str, etiqueta: str, nota: str | None = None, color=None):
        super().__init__()
        self.valor = valor
        self.unidad = unidad
        self.etiqueta = etiqueta
        self.nota = nota
        self.color = color or t.TINTA

    def wrap(self, ancho_disp, alto_disp):
        self.ancho = ancho_disp
        self.lineas_nota = (
            partir_texto(self.nota, t.SANS, t.TAM_CUERPO, ancho_disp * 0.72) if self.nota else []
        )
        self.alto = t.TAM_CIFRA_GRANDE + 16 + len(self.lineas_nota) * (t.TAM_CUERPO + 3)
        return ancho_disp, self.alto

    def draw(self):
        c = self.canv
        y = self.alto - t.TAM_CIFRA_GRANDE

        c.setFont(t.SANS_FUERTE, t.TAM_CIFRA_GRANDE)
        c.setFillColor(self.color)
        c.drawString(0, y, self.valor)
        x = ancho_texto(self.valor, t.SANS_FUERTE, t.TAM_CIFRA_GRANDE) + 4

        if self.unidad:
            c.setFont(t.SANS, t.TAM_SECCION)
            c.setFillColor(t.TINTA_3)
            c.drawString(x, y, self.unidad)

        y -= 12
        c.setFont(t.SANS_FUERTE, t.TAM_ANOTACION)
        c.setFillColor(t.TINTA_2)
        c.drawString(0, y, self.etiqueta.upper())

        if self.lineas_nota:
            y -= 13
            _dibujar_lineas(c, self.lineas_nota, 0, y, t.SANS, t.TAM_CUERPO, t.TINTA_2, t.TAM_CUERPO + 3)


# ============================== GRAFICAS ==============================


class _GraficaBase(Flowable):
    """Lo comun a todas: titulo menudo opcional, area de dibujo y ninguna
    cuadricula. La linea base es la unica regla que se dibuja, y es una
    hairline."""

    ALTO_AREA = 88

    def __init__(self, titulo: str | None = None, alto_area: float | None = None):
        super().__init__()
        self.titulo = titulo
        self.alto_area = alto_area or self.ALTO_AREA

    def wrap(self, ancho_disp, alto_disp):
        self.ancho = ancho_disp
        self.alto = self.alto_area + (14 if self.titulo else 0)
        return ancho_disp, self.alto

    def _dibujar_titulo(self, c) -> float:
        """Devuelve la coordenada Y superior del area de dibujo."""
        if not self.titulo:
            return self.alto
        c.setFont(t.SANS_FUERTE, t.TAM_ANOTACION)
        c.setFillColor(t.TINTA_3)
        c.drawString(0, self.alto - t.TAM_ANOTACION - 1, self.titulo.upper())
        return self.alto - 14


class GraficaColumnas(_GraficaBase):
    """Serie temporal en columnas. Dos tonos como maximo: el total en un ambar
    claro y, dentro de cada columna, la porcion ahorrable en verde — asi la
    grafica no compara dos series lado a lado, muestra cuanto de lo gastado
    sobraba. La columna mas alta se pinta en ambar pleno: es la unica que
    lleva su valor escrito.

    `datos`: [{"etiqueta": str, "valor": float, "secundario": float|None}]
    """

    def __init__(self, datos: list[dict], unidad: str = "", titulo: str | None = None, etiqueta_secundario: str = "ahorrable", alto_area: float | None = None, decimales: int = 2):
        super().__init__(titulo, alto_area)
        self.datos = datos
        self.unidad = unidad
        self.etiqueta_secundario = etiqueta_secundario
        self.decimales = decimales

    def draw(self):
        c = self.canv
        techo = self._dibujar_titulo(c)
        base = 22  # espacio para las etiquetas del eje X
        hay_secundario = any(d.get("secundario") for d in self.datos)
        # Se reserva sitio para la leyenda (si la hay) Y para la cifra que
        # corona la columna mas alta; sin ese margen la cifra se dibujaba
        # justo encima de la leyenda.
        alto_util = techo - base - 11 - (12 if hay_secundario else 0)

        maximo = max((float(d["valor"]) for d in self.datos), default=0.0) or 1.0
        indice_max = max(range(len(self.datos)), key=lambda i: float(self.datos[i]["valor"]))

        n = len(self.datos)
        hueco = min(9.0, self.ancho / (n * 4)) if n else 0
        ancho_col = (self.ancho - hueco * (n - 1)) / n if n else self.ancho
        ancho_col = min(ancho_col, 46)  # con 3 dias, columnas de 150 pt son absurdas
        paso = ancho_col + hueco
        # Con pocas columnas la serie no llena el ancho: se centra en vez de
        # quedar amontonada a la izquierda con media hoja vacia al lado.
        ancho_serie = n * paso - hueco if n else 0
        margen = max(0.0, (self.ancho - ancho_serie) / 2)

        # Linea base: la unica regla del grafico.
        c.setStrokeColor(t.LINO)
        c.setLineWidth(0.7)
        c.line(margen, base, margen + ancho_serie, base)

        for i, dato in enumerate(self.datos):
            x = margen + i * paso
            valor = float(dato["valor"])
            alto_col = (valor / maximo) * alto_util
            es_max = i == indice_max

            c.setFillColor(t.AMBAR if es_max else t.SOL)
            c.roundRect(x, base, ancho_col, max(alto_col, 0.8), min(2.5, ancho_col / 4), stroke=0, fill=1)

            secundario = dato.get("secundario")
            if secundario:
                alto_sec = (float(secundario) / maximo) * alto_util
                c.setFillColor(t.HOJA)
                c.setFillAlpha(0.85)
                c.roundRect(x, base, ancho_col, max(min(alto_sec, alto_col), 0.8), min(2.5, ancho_col / 4), stroke=0, fill=1)
                c.setFillAlpha(1)

            # Solo el maximo lleva cifra: etiquetar las 30 columnas de un mes
            # convierte la grafica en una tabla mal dibujada.
            if es_max:
                texto = t.numero(valor, self.decimales)
                c.setFont(t.SANS_FUERTE, t.TAM_ANOTACION)
                c.setFillColor(t.TINTA)
                c.drawCentredString(x + ancho_col / 2, base + alto_col + 4, texto)

            # Etiquetas del eje: la primera, la ultima y la del maximo. Con
            # muchas columnas, todas juntas se pisan.
            if n <= 8 or i in (0, n - 1, indice_max):
                c.setFont(t.SANS, t.TAM_ANOTACION - 0.5)
                c.setFillColor(t.TINTA_3)
                c.drawCentredString(x + ancho_col / 2, base - 10, str(dato["etiqueta"]))

        if hay_secundario:
            self._leyenda(c, techo)

    def _leyenda(self, c, techo: float) -> None:
        """Dos puntos y dos palabras, en una fila. Sin caja alrededor: una
        leyenda enmarcada pesa mas que la grafica que explica."""
        y = techo - 6
        x = 0.0
        for color, etiqueta in (
            (t.SOL, "consumo estimado"),
            (t.HOJA, self.etiqueta_secundario),
        ):
            c.setFillColor(color)
            c.circle(x + 3, y + 2, 2.6, stroke=0, fill=1)
            c.setFont(t.SANS, t.TAM_ANOTACION)
            c.setFillColor(t.TINTA_3)
            c.drawString(x + 9, y, etiqueta)
            x += 9 + ancho_texto(etiqueta, t.SANS, t.TAM_ANOTACION) + 16


class GraficaBarras(_GraficaBase):
    """Ranking en barras horizontales: etiqueta, barra y cifra. Es la forma
    correcta cuando lo que se compara son categorias con nombre largo (una
    luminaria, una zona, un tipo de plan) y no un eje temporal.

    `datos`: [{"etiqueta": str, "valor": float, "nota": str|None}]
    """

    ALTO_BARRA = 9
    SEPARACION = 15

    def __init__(self, datos: list[dict], unidad: str = "", titulo: str | None = None, maximo_filas: int = 6, decimales: int = 3, fraccion_etiqueta: float = 0.34):
        super().__init__(titulo)
        self.datos = datos[:maximo_filas]
        self.unidad = unidad
        self.decimales = decimales
        # Cuanto del ancho se lleva la columna de etiquetas. Se sube cuando
        # las etiquetas son frases (una recomendacion) y no nombres cortos
        # (una luminaria); con el 34 % por defecto, tres recomendaciones
        # distintas se recortaban al mismo "No se detectaron personas: apag..."
        # y la grafica dejaba de informar.
        self.fraccion_etiqueta = fraccion_etiqueta

    def wrap(self, ancho_disp, alto_disp):
        self.ancho = ancho_disp
        self.alto = len(self.datos) * self.SEPARACION + 4 + (14 if self.titulo else 0)
        return ancho_disp, self.alto

    def draw(self):
        c = self.canv
        techo = self._dibujar_titulo(c)

        ancho_etiqueta = min(self.ancho * self.fraccion_etiqueta, 240)
        maximo = max((float(d["valor"]) for d in self.datos), default=0.0) or 1.0
        ancho_cifra = 54
        ancho_pista = self.ancho - ancho_etiqueta - ancho_cifra - 12

        y = techo - self.ALTO_BARRA - 2
        for i, dato in enumerate(self.datos):
            etiqueta = partir_texto(str(dato["etiqueta"]), t.SANS, t.TAM_MENUDA, ancho_etiqueta, max_lineas=1)[0]
            c.setFont(t.SANS, t.TAM_MENUDA)
            c.setFillColor(t.TINTA_2 if i else t.TINTA)
            c.drawString(0, y + 1.5, etiqueta)

            x_pista = ancho_etiqueta + 8
            # Pista de fondo: da la escala sin necesidad de cuadricula.
            c.setFillColor(t.PAPEL_3)
            c.roundRect(x_pista, y, ancho_pista, self.ALTO_BARRA, self.ALTO_BARRA / 2, stroke=0, fill=1)

            largo = max((float(dato["valor"]) / maximo) * ancho_pista, 1.2)
            c.setFillColor(t.AMBAR if i == 0 else t.SOL)
            c.roundRect(x_pista, y, largo, self.ALTO_BARRA, self.ALTO_BARRA / 2, stroke=0, fill=1)

            cifra = t.numero(dato["valor"], self.decimales)
            c.setFont(t.SANS_FUERTE if i == 0 else t.SANS, t.TAM_MENUDA)
            c.setFillColor(t.TINTA if i == 0 else t.TINTA_2)
            c.drawRightString(self.ancho, y + 1.5, f"{cifra} {self.unidad}".strip())

            y -= self.SEPARACION


class GraficaDivision(_GraficaBase):
    """Una sola barra partida: como se reparte un total entre dos o tres
    partes (luz natural contra artificial, consumo contra ahorro). Reemplaza
    al grafico de torta, que para dos valores es siempre peor: la longitud se
    compara con el ojo, el angulo no."""

    ALTO_BARRA = 15

    # Una parte por debajo de este porcentaje no se dibuja: un segmento de
    # medio punto no se ve, pero su etiqueta si, y se monta encima de la
    # etiqueta de al lado (paso con un reparto 0 % natural / 100 % artificial).
    MINIMO_VISIBLE_PCT = 1.5

    def __init__(self, partes: list[dict], titulo: str | None = None):
        super().__init__(titulo)
        crudas = [p for p in partes if float(p.get("valor") or 0) > 0]
        total = sum(float(p["valor"]) for p in crudas) or 1.0
        self.partes = [
            p for p in crudas if float(p["valor"]) / total * 100 >= self.MINIMO_VISIBLE_PCT
        ] or crudas[:1]

    def wrap(self, ancho_disp, alto_disp):
        self.ancho = ancho_disp
        self.alto = self.ALTO_BARRA + 30 + (14 if self.titulo else 0)
        return ancho_disp, self.alto

    def draw(self):
        c = self.canv
        techo = self._dibujar_titulo(c)
        y = techo - self.ALTO_BARRA - 14

        total = sum(float(p["valor"]) for p in self.partes) or 1.0
        colores = (t.SOL, t.ASCUA, t.TINTA_4)

        # Las etiquetas van ancladas al inicio de su segmento, salvo que dos
        # queden tan juntas que se pisen: en ese caso pasan a leerse como una
        # fila corrida, que es peor colocada pero siempre legible.
        anchos = [float(p["valor"]) / total * self.ancho for p in self.partes]
        x_acumulado = 0.0
        posiciones: list[float] = []
        for ancho_parte in anchos:
            posiciones.append(x_acumulado)
            x_acumulado += ancho_parte
        en_fila = any(
            posiciones[i] + ancho_texto(str(self.partes[i]["etiqueta"]), t.SANS, t.TAM_MENUDA) + 10 > posiciones[i + 1]
            for i in range(len(self.partes) - 1)
        )

        x = 0.0
        x_etiqueta = 0.0
        for i, parte in enumerate(self.partes):
            fraccion = float(parte["valor"]) / total
            ancho_parte = fraccion * self.ancho
            color = parte.get("color") or colores[min(i, len(colores) - 1)]

            c.setFillColor(color)
            # Solo los extremos van redondeados: en el medio, las esquinas
            # dejarian huecos blancos entre partes.
            if i == 0 or i == len(self.partes) - 1:
                c.roundRect(x, y, max(ancho_parte, 1), self.ALTO_BARRA, 3.5, stroke=0, fill=1)
                c.rect(
                    x + (3.5 if i == 0 else 0),
                    y,
                    max(ancho_parte - 3.5, 0.5),
                    self.ALTO_BARRA,
                    stroke=0,
                    fill=1,
                )
            else:
                c.rect(x, y, max(ancho_parte, 1), self.ALTO_BARRA, stroke=0, fill=1)

            # Porcentaje dentro de la parte si cabe; si no, encima.
            texto = f"{fraccion * 100:.0f} %"
            if ancho_texto(texto, t.SANS_FUERTE, t.TAM_ANOTACION) + 10 < ancho_parte:
                c.setFont(t.SANS_FUERTE, t.TAM_ANOTACION)
                c.setFillColor(t.TINTA)
                c.drawCentredString(x + ancho_parte / 2, y + self.ALTO_BARRA / 2 - 2.4, texto)

            # Etiqueta debajo: con su punto de color si van en fila.
            etiqueta = str(parte["etiqueta"])
            c.setFont(t.SANS, t.TAM_MENUDA)
            c.setFillColor(t.TINTA_2)
            if en_fila:
                c.setFillColor(color)
                c.circle(x_etiqueta + 2.6, y - 9, 2.4, stroke=0, fill=1)
                c.setFillColor(t.TINTA_2)
                c.drawString(x_etiqueta + 8, y - 12, etiqueta)
                x_etiqueta += 8 + ancho_texto(etiqueta, t.SANS, t.TAM_MENUDA) + 14
            elif x + ancho_texto(etiqueta, t.SANS, t.TAM_MENUDA) > self.ancho:
                c.drawRightString(self.ancho, y - 12, etiqueta)
            else:
                c.drawString(x, y - 12, etiqueta)

            x += ancho_parte


class GraficaLinea(_GraficaBase):
    """Curva con area: la forma de algo que evoluciona (ocupacion a lo largo
    del dia, consumo hora por hora). Sin cuadricula y sin eje Y — se anotan
    el maximo y los extremos, que es lo unico que se lee de verdad en una
    curva de reporte.

    `datos`: [{"etiqueta": str, "valor": float}]
    """

    def __init__(self, datos: list[dict], unidad: str = "", titulo: str | None = None, decimales: int = 0):
        super().__init__(titulo)
        self.datos = datos
        self.unidad = unidad
        self.decimales = decimales

    def draw(self):
        c = self.canv
        techo = self._dibujar_titulo(c)
        base = 20
        alto_util = techo - base - 14

        n = len(self.datos)
        if n < 2:
            c.setFont(t.SANS_CURSIVA, t.TAM_MENUDA)
            c.setFillColor(t.TINTA_3)
            c.drawString(0, techo - 20, "Se necesitan al menos dos puntos para dibujar la tendencia.")
            return

        maximo = max(float(d["valor"]) for d in self.datos) or 1.0
        paso = self.ancho / (n - 1)
        puntos = [
            (i * paso, base + (float(d["valor"]) / maximo) * alto_util)
            for i, d in enumerate(self.datos)
        ]

        # Area bajo la curva, en ambar muy diluido.
        area = c.beginPath()
        area.moveTo(0, base)
        for x, y in puntos:
            area.lineTo(x, y)
        area.lineTo(puntos[-1][0], base)
        area.close()
        c.saveState()
        c.setFillColor(t.SOL)
        c.setFillAlpha(0.4)
        c.drawPath(area, stroke=0, fill=1)
        c.restoreState()

        # La curva.
        c.setStrokeColor(t.ASCUA)
        c.setLineWidth(1.4)
        c.setLineJoin(1)
        linea = c.beginPath()
        linea.moveTo(*puntos[0])
        for punto in puntos[1:]:
            linea.lineTo(*punto)
        c.drawPath(linea, stroke=1, fill=0)

        # Linea base.
        c.setStrokeColor(t.LINO)
        c.setLineWidth(0.7)
        c.line(0, base, self.ancho, base)

        # El punto mas alto, marcado y anotado.
        indice_max = max(range(n), key=lambda i: float(self.datos[i]["valor"]))
        px, py = puntos[indice_max]
        c.setFillColor(t.PAPEL)
        c.setStrokeColor(t.ASCUA)
        c.setLineWidth(1.2)
        c.circle(px, py, 2.6, stroke=1, fill=1)
        c.setFont(t.SANS_FUERTE, t.TAM_ANOTACION)
        c.setFillColor(t.TINTA)
        texto = f"{t.numero(self.datos[indice_max]['valor'], self.decimales)} {self.unidad}".strip()
        if px + ancho_texto(texto, t.SANS_FUERTE, t.TAM_ANOTACION) > self.ancho:
            c.drawRightString(self.ancho, py + 6, texto)
        else:
            c.drawString(px + 5, py + 6, texto)

        # Extremos del eje X.
        c.setFont(t.SANS, t.TAM_ANOTACION - 0.5)
        c.setFillColor(t.TINTA_3)
        c.drawString(0, base - 10, str(self.datos[0]["etiqueta"]))
        c.drawRightString(self.ancho, base - 10, str(self.datos[-1]["etiqueta"]))
        if 0 < indice_max < n - 1:
            c.drawCentredString(px, base - 10, str(self.datos[indice_max]["etiqueta"]))


class Interpretacion(Flowable):
    """La lectura que hace SELENE de la grafica de arriba. Va en cursiva y con
    un filo ambar a la izquierda: se distingue del cuerpo del reporte porque
    no es un dato, es una lectura de los datos."""

    def __init__(self, texto: str):
        super().__init__()
        self.texto = texto

    def wrap(self, ancho_disp, alto_disp):
        self.ancho = ancho_disp
        self.lineas = partir_texto(self.texto, t.SERIF_CURSIVA, t.TAM_CUERPO, ancho_disp - 14)
        self.alto = len(self.lineas) * (t.TAM_CUERPO + 3) + 6
        return ancho_disp, self.alto

    def draw(self):
        c = self.canv
        c.setStrokeColor(t.AMBAR)
        c.setLineWidth(1.4)
        c.setLineCap(1)
        c.line(0.7, 2, 0.7, self.alto - 4)
        _dibujar_lineas(
            c, self.lineas, 10, self.alto - t.TAM_CUERPO - 2, t.SERIF_CURSIVA, t.TAM_CUERPO, t.TINTA_2, t.TAM_CUERPO + 3
        )


# ============================== FIGURAS ==============================


class Figura(Flowable):
    """Una imagen de deteccion presentada como figura de articulo: esquinas
    redondeadas, sombra muy suave, marco de una hairline, numero de figura en
    ambar y descripcion debajo.

    La descripcion NO la escribe un modelo: se compone con los metadatos del
    propio analisis (ver `report_data.describir_figura`), asi que siempre dice
    la verdad sobre lo que se ve y no cuesta ni una llamada de red.
    """

    RELLENO = 7

    def __init__(self, imagen: bytes, numero: int, descripcion: str, ancho_maximo: float | None = None):
        super().__init__()
        self.imagen = imagen
        self.numero = numero
        self.descripcion = descripcion
        self.ancho_maximo = ancho_maximo
        self._lector = ImageReader(BytesIO(imagen))

    def wrap(self, ancho_disp, alto_disp):
        ancho_marco = min(self.ancho_maximo or ancho_disp, ancho_disp)
        self.ancho = ancho_marco
        ancho_imagen = ancho_marco - 2 * self.RELLENO

        ancho_original, alto_original = self._lector.getSize()
        proporcion = (alto_original / ancho_original) if ancho_original else 0.5625
        self.alto_imagen = ancho_imagen * proporcion
        self.ancho_imagen = ancho_imagen

        # El pie se mide contra el ancho que queda a la derecha de "Figura N ·",
        # porque todas sus lineas van sangradas hasta ahi.
        self.sangria = ancho_texto(f"Figura {self.numero} · ", t.SANS_FUERTE, t.TAM_MENUDA)
        self.lineas = partir_texto(self.descripcion, t.SANS, t.TAM_MENUDA, ancho_marco - self.sangria)
        self.alto = self.alto_imagen + 2 * self.RELLENO + 8 + len(self.lineas) * (t.TAM_MENUDA + 2.5)
        return ancho_disp, self.alto

    def draw(self):
        c = self.canv
        alto_marco = self.alto_imagen + 2 * self.RELLENO
        y_marco = self.alto - alto_marco

        t.sombra_suave(c, 0, y_marco, self.ancho, alto_marco)

        c.setFillColor(t.PAPEL)
        c.setStrokeColor(t.LINO)
        c.setLineWidth(0.7)
        c.roundRect(0, y_marco, self.ancho, alto_marco, t.RADIO, stroke=1, fill=1)

        # La imagen, recortada a esquinas redondeadas con un clip.
        c.saveState()
        recorte = c.beginPath()
        recorte.roundRect(
            self.RELLENO, y_marco + self.RELLENO, self.ancho_imagen, self.alto_imagen, t.RADIO_CHICO
        )
        c.clipPath(recorte, stroke=0, fill=0)
        c.drawImage(
            self._lector,
            self.RELLENO,
            y_marco + self.RELLENO,
            width=self.ancho_imagen,
            height=self.alto_imagen,
            preserveAspectRatio=True,
            anchor="c",
        )
        c.restoreState()

        # Pie: "Figura N ·" en ambar, y la descripcion sangrada a su derecha.
        y = y_marco - 10
        c.setFont(t.SANS_FUERTE, t.TAM_MENUDA)
        c.setFillColor(t.ASCUA)
        c.drawString(0, y, f"Figura {self.numero}")
        c.setFillColor(t.TINTA_4)
        c.drawString(ancho_texto(f"Figura {self.numero}", t.SANS_FUERTE, t.TAM_MENUDA) + 3, y, "·")

        _dibujar_lineas(
            c, self.lineas, self.sangria, y, t.SANS, t.TAM_MENUDA, t.TINTA_2, t.TAM_MENUDA + 2.5
        )


# ============================== OBSERVACIONES ==============================


class Cierre(Flowable):
    """El logo del final del documento: el logotipo de SELENE (el punto de luz
    con rayos) sobre la palabra, centrados.

    Es un colofon, no un pie de pagina: aparece UNA vez, despues de la nota de
    metodo, y su unica funcion es decir "aqui termina, y esto lo hizo SELENE".
    Va centrado y no alineado al margen porque un elemento centrado se lee como
    cierre; uno alineado a la izquierda, como que sigue algo debajo.

    Usa el LOGOTIPO y no el bombillo a proposito: el bombillo ya es la marca de
    agua del fondo, y el cierre acababa cayendo dentro de ella —un bombillo
    pequeno dibujado justo en medio del bombillo grande, que se lee como un
    error de montaje y no como una composicion. Son los dos simbolos de la
    marca; cada uno hace un trabajo distinto.

    Compacto a proposito: viaja en el mismo grupo que la nota de metodo, y cada
    punto que ocupa es un punto mas de probabilidad de que el grupo entero no
    quepa y se lleve una pagina para el solo.
    """

    def __init__(self, alto: float = 32):
        super().__init__()
        self.alto_total = alto

    def wrap(self, ancho_disp, alto_disp):
        self.ancho = ancho_disp
        return ancho_disp, self.alto_total

    def draw(self):
        c = self.canv
        marca = 14
        t.dibujar_marca(
            c, (self.ancho - marca) / 2, self.alto_total - marca - 2, marca, color=t.ASCUA
        )
        t.dibujar_palabra_marca(c, 0, 1, self.ancho)


class Observaciones(Flowable):
    """"Observaciones de SELENE": el bloque donde el sistema habla en primera
    persona. Papel crema en vez de blanco, marca de luz en la esquina y un
    filo ambar arriba — se tiene que leer como una nota escrita al margen del
    reporte, no como otro parrafo mas del cuerpo."""

    RELLENO = 13

    def __init__(self, parrafos: list[str], titulo: str = "Observaciones de SELENE"):
        super().__init__()
        self.parrafos = [p for p in parrafos if p and p.strip()]
        self.titulo = titulo

    def wrap(self, ancho_disp, alto_disp):
        self.ancho = ancho_disp
        util = ancho_disp - 2 * self.RELLENO - 22
        self.bloques = [partir_texto(p, t.SERIF, t.TAM_CUERPO + 0.5, util) for p in self.parrafos]
        alto_texto = sum(len(b) * (t.TAM_CUERPO + 4.5) for b in self.bloques) + max(0, len(self.bloques) - 1) * 5
        self.alto = alto_texto + 2 * self.RELLENO + 22
        return ancho_disp, self.alto

    def draw(self):
        c = self.canv

        t.sombra_suave(c, 0, 0, self.ancho, self.alto)
        c.setFillColor(t.PAPEL_2)
        c.setStrokeColor(t.LINO)
        c.setLineWidth(0.7)
        c.roundRect(0, 0, self.ancho, self.alto, t.RADIO, stroke=1, fill=1)

        # Filo de luz superior, como el de los modulos de la aplicacion.
        c.saveState()
        recorte = c.beginPath()
        recorte.roundRect(0, 0, self.ancho, self.alto, t.RADIO)
        c.clipPath(recorte, stroke=0, fill=0)
        c.setFillColor(t.AMBAR)
        c.rect(0, self.alto - 2, self.ancho, 2, stroke=0, fill=1)
        c.restoreState()

        y = self.alto - self.RELLENO - 9
        t.dibujar_marca(c, self.RELLENO, y - 2, 11, color=t.ASCUA)
        c.setFont(t.SANS_FUERTE, t.TAM_ANOTACION)
        c.setFillColor(t.TINTA_2)
        c.drawString(self.RELLENO + 16, y + 1, self.titulo.upper())

        y -= 16
        for bloque in self.bloques:
            y = _dibujar_lineas(
                c, bloque, self.RELLENO + 22, y, t.SERIF, t.TAM_CUERPO + 0.5, t.TINTA, t.TAM_CUERPO + 4.5
            )
            y -= 5
