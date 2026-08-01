# ModeloDeteccionLamp_App

Aplicacion de inferencia que fusiona dos modelos entrenados en proyectos de
investigacion independientes para deteccion **en tiempo real** (webcam o
video) de:

1. **Iluminacion** (`Window`, `Luminaire`) — `fasterrcnn_resnet50_fpn_v2`
   (torchvision), entrenado en
   [`ModeloDeteccionLamp`](../ModeloDeteccionLamp), mas el modulo
   `lightingAnalyzer/` (CV clasico, sin redes neuronales) que calcula
   brillo, contraste, hotspots y un indicador Natural/Artificial a partir de
   esas detecciones.
2. **Personas** (`person`) — RT-DETR (Ultralytics, variante "l"), entrenado
   sobre COCO 2017 (clase unica "person") en
   [`ModelosDeteccionComp/Proyecto_RTDETR_COCO`](../ModelosDeteccionComp/Proyecto_RTDETR_COCO).

Ambos detectores son pesados en relacion a un detector liviano de una sola
pasada (dos etapas el de iluminacion, transformer sin NMS el de personas):
ninguno de los dos corre en cada frame en modo tiempo real (ver "Diseno
tecnico relevante").

Este workspace **no entrena nada**: solo consume los checkpoints ya
entregados por ambos proyectos de investigacion (copiados en `weights/`, ver
"Origen de los pesos" mas abajo). Los repos de investigacion originales no
se modifican.

## Alcance actual

Ambos detectores corren **en paralelo sobre el mismo stream de video**,
dibujando cajas y un panel de estado en vivo (personas detectadas,
%natural/artificial, tipo de iluminacion). La deteccion de personas es por
ahora **informativa** (conteo + cajas en pantalla); que la ocupacion
modifique las recomendaciones de `lightingAnalyzer` es un follow-up futuro,
fuera de alcance de esta version.

## Instalacion

```bash
cd ModeloDeteccionLamp_App
python -m venv .venv
.venv\Scripts\activate            # Windows
pip install -r requirements.txt
```

Si se reinstala `torch`/`torchvision` en otra maquina con GPU, usar el
indice de PyTorch correspondiente a la version de CUDA del driver instalado:

```bash
pip install torch==2.12.1 torchvision==0.27.1 --index-url https://download.pytorch.org/whl/cu130
```

## Uso

### Tiempo real (webcam o video)

```bash
python scripts/run_realtime.py                        # webcam por defecto (indice 0)
python scripts/run_realtime.py --source 1              # otra camara
python scripts/run_realtime.py --source ruta\video.mp4 # archivo de video
python scripts/run_realtime.py --lighting-interval 20 --person-interval 8 --device cpu --no-async
```

Teclas: `q` para salir, `s` para guardar un snapshot con reporte completo
(graficas + JSON/CSV/MD/HTML) en `reports/lighting_analysis/`.

### Imagen unica (reporte completo)

```bash
python scripts/analyze_image.py --image test_media/casaSofia.jpeg
```

## Estructura

```
ModeloDeteccionLamp_App/
├── configs/
│   ├── models.yaml                      # pesos, umbrales, throttling, fuente de video
│   └── lighting_*.yaml                  # config de lightingAnalyzer (pesos/umbrales/reglas)
├── lightingAnalyzer/                    # modulo de analisis de iluminacion (CV clasico)
├── weights/
│   ├── lighting/FasterRCNN_ADE20KOnly_best.pth
│   └── person/RTDETR_COCO.pt
├── detectors/
│   ├── lighting_detector.py             # wrapper FasterRCNN+ADE20K -> list[dict]
│   └── person_detector.py               # wrapper RT-DETR+COCO -> list[dict]
├── app/
│   ├── device_utils.py                  # seleccion cuda/cpu
│   ├── overlay.py                       # HUD (cajas, FPS, %natural/artificial)
│   ├── throttled_detector.py            # re-ejecuta un detector cada N frames (opcional: en hilo aparte)
│   └── realtime_pipeline.py             # loop de video + throttling de ambos detectores
├── scripts/
│   ├── run_realtime.py
│   └── analyze_image.py
├── test_media/                          # imagen + detecciones de referencia para pruebas
└── reports/lighting_analysis/           # salida en runtime
```

## Diseno tecnico relevante

- **Throttling de ambos detectores:** tanto `fasterrcnn_resnet50_fpn_v2`
  (dos etapas) como RT-DETR (transformer sin NMS, ~33M parametros) son mucho
  mas pesados que un detector de una sola pasada convencional (p. ej. el
  YOLOv11n que usaba antes el detector de personas). Como ni la geometria de
  ventanas/luminarias ni la posicion de las personas cambian drasticamente
  frame a frame, ambos detectores se re-ejecutan solo cada `interval_frames`
  propio (`configs/models.yaml`: 15 para iluminacion, 5 para personas), en un
  `ThreadPoolExecutor(max_workers=2)` compartido (`app/throttled_detector.py`)
  para no congelar el loop de captura/display. Como ambos modelos comparten
  la misma GPU, el trabajo se serializa igual que si cada uno tuviera su
  propio hilo; lo que se gana es que ninguno de los dos bloquea el hilo
  principal mientras infiere.
- **Modo ligero de `lightingAnalyzer`:** se anadio el parametro
  `generate_report: bool = True` a `LightingAnalyzer.analyze()` (cambio
  aditivo, no rompe el uso existente). En `generate_report=False` se omiten
  las graficas matplotlib y la escritura de reportes a disco (demasiado
  costoso por frame); el snapshot bajo demanda (tecla `s`) sí usa
  `generate_report=True`.
- **Checkpoint de iluminacion sin descarga de internet:** `lighting_detector.py`
  construye su modelo con `weights=None` (sin volver a descargar los pesos
  base preentrenados en COCO) porque el fine-tuning completo ya vive en el
  `state_dict` del checkpoint entregado. `person_detector.py` (RT-DETR) usa
  el checkpoint nativo de Ultralytics, que ya incluye la arquitectura
  completa (no requiere reconstruir el modelo a mano).

## Aplicación web SELENE (`backend/` + `frontend/`)

Además del pipeline de escritorio (`scripts/run_realtime.py`), el repo
incluye la aplicación web **SELENE**: landing page, login/registro con
persistencia en SQLite y un panel en vivo donde, tras iniciar sesión, se
ve la cámara con los bounding boxes y el % de iluminación calculados por
estos mismos modelos.

```
├── backend/    # FastAPI: auth (JWT), luminarias, /api/deteccion/frame
│               # (reutiliza detectors/ y lightingAnalyzer/ sin duplicarlos)
├── frontend/   # React + Vite + Tailwind: landing, acceso, panel de escaneo
└── database/   # schema.sql (SQLite, fuente de verdad del esquema) + ERD.
                # schema_postgres.sql es la version anterior, de referencia.
```

`backend/api/detection_service.py` es el puente: agrega la raíz del repo a
`sys.path` e importa `detectors.person_detector`, `detectors.lighting_detector`
y `lightingAnalyzer.analyzer` directamente, así que necesita los mismos
checkpoints en `weights/` que el pipeline de escritorio. Ver
`backend/README.md` y `frontend/README.md` para instrucciones de arranque sin
Docker (venv + npm).

### Levantar todo con Docker

El `docker-compose.yml` de la raíz levanta 2 servicios (backend y frontend).
No hay un servicio de base de datos aparte: SQLite es un archivo, no un
servidor, y el propio backend crea/actualiza el esquema al arrancar (ver
`backend/api/db_init.py`, idempotente):

```bash
cp backend/.env.example backend/.env    # ajustar JWT_SECRET_KEY para produccion
docker compose up --build
```

El primer build tarda varios minutos (instala torch/torchvision/ultralytics
dentro de la imagen del backend); los siguientes usan la cache de capas de
Docker. Necesita los checkpoints ya copiados en `weights/` (ver más abajo),
porque se incluyen en la imagen del backend.

Servicios y puertos:

| Servicio | Puerto | Qué es |
|---|---|---|
| `backend` | 8000 | API FastAPI — `http://localhost:8000/docs`. La base SQLite vive en el volumen `selene_db_data` (montado en `/app/data`, no en `/app/database`, donde ya vive `schema.sql` horneado en la imagen). |
| `frontend` | 5173 | SELENE — `http://localhost:5173` |

El frontend corre con hot-reload (el código de `frontend/` está montado como
volumen); el backend **no** tiene `--reload` en Docker — para iterar rápido
sobre la API es más cómodo el flujo sin Docker de `backend/README.md`.

Comandos útiles:

```bash
docker compose logs -f backend       # ver logs de la API (carga de modelos, errores)
docker compose exec backend python scripts/init_db.py   # re-aplicar el esquema a mano
docker compose down                  # parar todo (con -v para borrar tambien la DB)
```

## Origen de los pesos (para reproducir o actualizar)

| Archivo en este repo | Copiado desde |
|---|---|
| `weights/lighting/FasterRCNN_ADE20KOnly_best.pth` | `ModeloDeteccionLamp/modelosEntrenados/FasterRCNN_ADE20KOnly_best.pth` |
| `weights/person/RTDETR_COCO.pt` | `ModelosDeteccionComp/Proyecto_RTDETR_COCO/modelosEntrenados/RTDETR_COCO.pt` |

Los pesos se **copiaron**, no se movieron: los proyectos de investigacion
originales quedan intactos y siguen siendo la fuente de verdad si se
reentrena cualquiera de los dos modelos.
