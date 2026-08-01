# lightingAnalyzer

Modulo de **analisis de iluminacion de escenas interiores** a partir de:

1. La imagen RGB original.
2. Las detecciones ya generadas por el detector **FasterRCNN_ADE20K** (clases
   `Window` y `Luminaire`, con `class`, `confidence` y `bbox`).

Este modulo **no entrena ni ejecuta ninguna red neuronal**. Todo el analisis
se realiza mediante **procesamiento clasico de imagenes** (OpenCV, NumPy,
opcionalmente scikit-image) y reglas numericas justificables y documentadas
en este archivo.

> **Aviso importante:** `natural_score`, `artificial_score` y sus porcentajes
> son una **estimacion relativa basada en vision por computador**, calculada
> unicamente a partir de la imagen RGB y las detecciones del modelo. **No es
> una medicion fisica de iluminancia** (lux/lumen) y no sustituye un
> luxometro ni un estudio luminotecnico profesional. El objetivo es apoyar
> decisiones de eficiencia energetica y confort visual con evidencia
> reproducible, no certificar niveles normativos de iluminacion.

## Instalacion / requisitos

Reutiliza las dependencias ya presentes en el proyecto: `opencv-python`,
`numpy`, `pyyaml`, `matplotlib`. `scikit-image` es opcional (no se usa en la
implementacion actual, mencionado en el enunciado como disponible si hiciera
falta).

## Uso

```python
import cv2
from lightingAnalyzer import LightingAnalyzer

image_bgr = cv2.imread("foto_habitacion.jpg")

detections = [
    {"class": "Window", "confidence": 0.95, "bbox": [120, 40, 430, 300]},
    {"class": "Luminaire", "confidence": 0.91, "bbox": [500, 10, 560, 60]},
]

analyzer = LightingAnalyzer()
result = analyzer.analyze(image_bgr, detections, image_name="foto_habitacion")

print(result["lighting_type"], result["natural_percentage"], result["artificial_percentage"])
print(result["recommendation"])
```

Si no se indica `output_dir`, las graficas y reportes se guardan
automaticamente en:

```
reports/lighting_analysis/<image_name>_<timestamp>/
  graphs/
    annotated.png
    scene_histograms.png
    brightness_heatmap.png
    intensity_distribution.png
    windows_histograms.png      (si hay ventanas detectadas)
    luminaires_histograms.png   (si hay luminarias detectadas)
  data/
    report.json
    report.csv
  report.md
  report.html
```

El diccionario devuelto por `analyze(...)` tiene, como minimo:

```python
{
    "scene_brightness": 186.3,
    "windows": 3,
    "luminaires": 5,
    "natural_score": 0.73,
    "artificial_score": 0.27,
    "natural_percentage": 73.0,
    "artificial_percentage": 27.0,
    "lighting_type": "Mixta",
    "recommendation": "...",
    "details": {...},    # resultados numericos completos por ROI
    "artifacts": {...},  # rutas de graficas y reportes guardados en disco
}
```

`natural_percentage + artificial_percentage` suman **siempre exactamente
100.0** (ver "Normalizacion" mas abajo).

## Estructura del modulo

| Archivo | Responsabilidad unica |
|---|---|
| `utils.py` | Config YAML, `Detection`, recorte de ROI, estadisticas basicas, escritura JSON/CSV |
| `brightness.py` | Etapa 1: brillo global de la escena |
| `windows.py` | Etapa 2: metricas por ROI de clase `Window` |
| `luminaires.py` | Etapa 3: metricas por ROI de clase `Luminaire` + hotspots |
| `indicators.py` | Natural Score / Artificial Score |
| `classifier.py` | Clasificacion Natural / Artificial / Mixta |
| `recommender.py` | Motor de reglas de recomendacion |
| `visualization.py` | Todas las graficas e imagen anotada (guardado en disco) |
| `analyzer.py` | Orquestador (`LightingAnalyzer`) + reportes JSON/CSV/MD/HTML |

Toda la configuracion numerica (pesos, umbrales, reglas, saturaciones) vive
en `configs/lighting_*.yaml`, **nunca hardcodeada** en el codigo:

- `configs/lighting_weights.yaml` — pesos de Natural Score / Artificial Score.
- `configs/lighting_thresholds.yaml` — umbrales de clasificacion.
- `configs/lighting_recommendations.yaml` — reglas de recomendacion.
- `configs/lighting_analysis.yaml` — umbral de hotspot, constantes de
  normalizacion/saturacion, bins de histograma, colormap del heatmap, bandas
  de intensidad.

## Metodologia y formulas

### Etapa 1 — Brillo global de la escena (`brightness.py`)

- **Brillo**: se define sobre el **canal V (Value) del espacio HSV**,
  `V = max(R, G, B)`. Es la medida de brillo estandar en vision por
  computador clasica (Gonzalez & Woods, *Digital Image Processing*) y la
  metrica principal usada en todo el modulo (`scene_brightness`, brillo por
  ROI, hotspots).
- **Canal L (LAB)**: se calcula tambien el histograma del canal `L*` de CIE
  LAB como referencia perceptual complementaria (aproxima la luminosidad tal
  como la percibe el ojo humano, a diferencia de V que es lineal en los
  canales RGB). No participa en `scene_brightness` ni en los scores; solo se
  reporta su histograma, tal como pide la especificacion.
- **Media / maximo / minimo / desviacion estandar**: estadisticos directos
  de NumPy sobre el canal V de la imagen completa.
- **Distribucion de intensidad luminosa**: porcentaje de pixeles del canal V
  en tres bandas configurables (`configs/lighting_analysis.yaml:
  intensity_bands`): oscura `[0,85)`, media `[85,170)`, clara `[170,256)`.
- **Mapa de calor de brillo**: el canal V completo, coloreado con un
  colormap **secuencial y perceptualmente uniforme** (`inferno` por
  defecto). Se evita deliberadamente una paleta tipo "rainbow"/`jet`, que
  introduce bandas de contraste falsas que no existen en los datos.

### Etapa 2 — Ventanas (`windows.py`)

Para cada deteccion `Window` (bbox recortado a los limites de la imagen):

- **Area** (`area_px`): `ancho x alto` del bounding box, en pixeles².
- **Area relativa** (`relative_area`): `area_px / (alto_imagen x ancho_imagen)`.
- **Brillo medio/maximo/minimo/desviacion estandar**: estadisticos del canal
  V dentro del ROI (misma definicion que en Etapa 1, aplicada al recorte).
- **Contraste**: **contraste de Michelson**,
  `C = (I_max - I_min) / (I_max + I_min)`, acotado en `[0, 1]`. Se elige esta
  formula (Michelson, 1927, *Studies in Optics*) en vez del contraste RMS
  (`std/mean`, ya reportado por separado como desviacion estandar) porque es
  la mas usada en literatura para caracterizar el contraste de una region
  localizada frente a un patron periodico global.
- **Histograma**: histograma de 256 bins del canal V del ROI.
- **Centroide**: centro geometrico del bounding box, `((x1+x2)/2, (y1+y2)/2)`.

### Etapa 3 — Luminarias (`luminaires.py`)

Mismas metricas que en la Etapa 2 (area, area relativa, brillo, contraste,
histograma, centroide) mas:

- **Hotspots**: componentes conexas (`cv2.connectedComponentsWithStats`,
  conectividad configurable, 8 por defecto) de pixeles con
  `V > hotspot.brightness_threshold` (240/255 por defecto — criterio habitual
  de "near-saturation"/clipping en fotografia digital). Se descartan
  componentes menores a `hotspot.min_area_px` (4 px por defecto) para filtrar
  ruido de sensor/compresion que no representa una fuente de luz real.
  - `hotspot_count`: numero de componentes validas.
  - `hotspot_area_px` / `hotspot_area_pct_of_roi`: area ocupada por hotspots
    validos, en pixeles y como porcentaje del ROI.
- **Porcentaje de pixeles muy brillantes** (`bright_pixel_pct`): porcentaje
  de pixeles del ROI por encima del mismo umbral, **sin** el filtro de area
  minima de `hotspot_count`/`hotspot_area_px`. Es deliberadamente una metrica
  distinta: `bright_pixel_pct` mide "cuanta luz muy intensa hay en total"
  (incluye reflejos/ruido puntual), mientras que `hotspot_count`/
  `hotspot_area_px` miden "cuantas fuentes de luz reales (agrupadas) hay".

### Indicadores — Natural Score / Artificial Score (`indicators.py`)

Cada score es una suma ponderada de **componentes normalizados a `[0, 1]`**
mediante una funcion de saturacion `componente = min(valor / saturacion, 1)`
(las saturaciones viven en `configs/lighting_analysis.yaml: normalization`):

**Natural** (`configs/lighting_weights.yaml: natural`):

| Componente | Definicion |
|---|---|
| `windows` | `min(num_ventanas / window_count_saturation, 1)` |
| `area` | `min(sum(area_relativa_ventanas) / window_area_saturation, 1)` |
| `brightness` | `brillo_medio_ventanas / 255` |
| `contrast` | `contraste_medio_ventanas` (Michelson, ya en `[0,1]`) |
| `distribution` | fraccion de los 3 tercios horizontales de la imagen que contienen al menos un centroide de ventana (`0`, `1/3`, `2/3` o `1`) — una mayor dispersion espacial de las ventanas favorece una luz natural mas uniforme sobre el espacio |

**Artificial** (`configs/lighting_weights.yaml: artificial`):

| Componente | Definicion |
|---|---|
| `luminaires` | `min(num_luminarias / luminaire_count_saturation, 1)` |
| `area` | `min(sum(area_relativa_luminarias) / luminaire_area_saturation, 1)` |
| `brightness` | `brillo_medio_luminarias / 255` |
| `contrast` | `contraste_medio_luminarias` (Michelson) |
| `hotspot` | `min(bright_pixel_pct_medio / hotspot_pct_saturation, 1)` |

Si no se detecta ninguna ventana (o ninguna luminaria), todos los componentes
de esa categoria que dependen de un ROI quedan en `0` (no hay evidencia que
medir); el componente de conteo (`windows`/`luminaires`) tambien es `0` de
forma natural.

Los dos bloques de pesos en `lighting_weights.yaml` **deben sumar 1.0 cada
uno**; se valida al cargar el archivo y se lanza un error explicito si no se
cumple.

### Normalizacion (porcentajes que siempre suman 100%)

```
natural_score     = natural_raw     / (natural_raw + artificial_raw)
artificial_score  = artificial_raw  / (natural_raw + artificial_raw)
natural_percentage    = natural_score * 100
artificial_percentage = 100 - natural_percentage
```

**Caso borde**: si `natural_raw + artificial_raw == 0` (no se detecto
ninguna ventana ni luminaria con evidencia util, p. ej. cero detecciones),
se usa el brillo global de la escena como referencia neutral:
`natural_score = scene_brightness / 255` (marcado con `fallback_used: True`
en el resultado, para trazabilidad).

### Clasificacion (`classifier.py`)

Umbrales en `configs/lighting_thresholds.yaml`. Reglas evaluadas en orden
(gana la primera que se cumple):

1. **Natural**: `natural_percentage > 70` **y** `artificial_percentage < 30`.
2. **Artificial**: `artificial_percentage > 70` **y** `natural_percentage < 30`.
3. **Mixta**: cualquier otro caso (incluye el 50/50 y las combinaciones que
   no disparan 1 ni 2 de forma inequivoca, p. ej. 65%/35%).

### Recomendaciones (`recommender.py`)

Motor de reglas ordenado, definido en `configs/lighting_recommendations.yaml`.
Se aplica la **primera** regla cuyas condiciones (`min_natural_pct`,
`max_natural_pct`, `min_artificial_pct`, `max_artificial_pct`, todas
opcionales) se cumplen. Reglas incluidas por defecto:

- `natural_percentage > 80` → apagar luminarias cercanas a ventanas.
- `60 <= natural_percentage <= 80` → luminarias solo como apoyo puntual.
- `40 <= natural_percentage <= 60` → iluminacion mixta equilibrada.
- `60 <= artificial_percentage <= 80` → maximizar luz natural disponible.
- `natural_percentage <= 20` → mantener luminarias encendidas.
- catch-all final (siempre presente) → recomendacion generica de revision.

## Visualizacion y reportes

`visualization.py` genera y guarda automaticamente:

- Imagen anotada con bounding boxes, etiqueta de clase, brillo medio por ROI
  y un panel resumen (brillo de escena, Natural %, Artificial %, tipo de
  iluminacion).
- Histogramas del canal V y L de la escena.
- Histogramas por ROI (una grilla por categoria, ventanas y luminarias).
- Mapa de calor de brillo.
- Grafica de distribucion de intensidad luminosa.

`analyzer.py` genera y guarda automaticamente, por cada analisis:

- `data/report.json` — todos los resultados numericos (escena, ventanas,
  luminarias, indicadores), en formato estructurado.
- `data/report.csv` — una fila por escena/ventana/luminaria, aplanada.
- `report.md` — informe legible en Markdown, con las graficas embebidas.
- `report.html` — mismo informe en HTML autocontenido (tema claro/oscuro).

## Notas de implementacion

- Todas las conversiones de color asumen el orden de canales **BGR** de
  OpenCV (`cv2.imread` por defecto). Si la imagen de entrada esta en RGB,
  conviertala antes: `cv2.cvtColor(image, cv2.COLOR_RGB2BGR)`.
- Los bounding boxes se recortan (`clip`) a los limites de la imagen antes de
  cualquier calculo; los que quedan degenerados (area 0 tras el recorte) se
  descartan con un aviso en el log.
- Manejo de errores: `utils.LightingAnalyzerError` se lanza de forma
  explicita ante configuracion invalida (pesos que no suman 1.0, archivos
  YAML faltantes o mal formados, reglas de recomendacion sin catch-all) o
  detecciones malformadas, en vez de fallar silenciosamente.
