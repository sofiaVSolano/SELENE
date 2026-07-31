# SELENE — Backend (FastAPI)

API para autenticación (registro/login con JWT) y para el panel de escaneo en
vivo: recibe un frame de cámara, ejecuta los detectores ya entrenados del
proyecto (`../detectors/person_detector.py`, `../detectors/lighting_detector.py`
y `../lightingAnalyzer/`) y persiste cada detección en PostgreSQL.

No reimplementa nada de visión por computador: reutiliza los mismos wrappers
que ya usa `scripts/run_realtime.py` en la raíz del repo, así que necesita los
checkpoints en `../weights/` para poder responder `/api/deteccion/frame`.

> **¿Querés levantar todo (DB + backend + frontend) con un solo comando?**
> Usá el `docker-compose.yml` de la raíz del repo, no este archivo — ver la
> sección "Levantar todo con Docker" en `../README.md`. Lo que sigue acá es
> el flujo local (venv + Postgres en Docker solo para la base de datos), útil
> para desarrollar la API con `--reload`.

## 1. Base de datos

```bash
# Levanta SOLO un Postgres local (backend y frontend corren fuera de Docker)
docker compose up -d

cp .env.example .env      # ajustar JWT_SECRET_KEY en produccion
```

## 2. Entorno Python

Se reutiliza el mismo entorno virtual que el resto del repo (torch,
ultralytics, opencv, etc. ya definidos en `../requirements.txt`):

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate            # Windows
pip install -r requirements.txt
```

## 3. Crear el esquema

Aplica `../database/schema.sql` (fuente única de verdad del esquema, ver
`../database/DISENO_BASE_DATOS.md`) contra `DATABASE_URL`:

```bash
python scripts/init_db.py
```

## 4. Levantar la API

```bash
uvicorn api.main:app --reload --port 8000
```

Docs interactivas en `http://localhost:8000/docs`.

## Endpoints principales

| Método | Ruta | Descripción |
|---|---|---|
| POST | `/api/auth/register` | Crea usuario (hash bcrypt) y devuelve JWT |
| POST | `/api/auth/login` | Verifica credenciales y devuelve JWT |
| GET | `/api/auth/me` | Usuario autenticado actual |
| GET | `/api/luminarias` | Lista luminarias (requiere JWT) |
| POST | `/api/luminarias` | Crea luminaria (crea la zona si no existe) |
| POST | `/api/deteccion/frame` | Sube un frame (`multipart/form-data`), corre personas + iluminación, inserta en `detecciones_ocupacion` y devuelve bounding boxes + confianza + % de iluminación |
| GET | `/api/deteccion/historial/{id_luminaria}` | Últimas detecciones guardadas de una luminaria |

`/api/deteccion/frame` es la ruta que consume el panel del frontend en cada
ciclo de escaneo (ver `frontend/src/components/dashboard/CameraPanel.jsx`).

## Notas de diseño

- El paquete de la API se llama `api/` (no `app/`) a propósito: la raíz del
  repo ya tiene un paquete `app/` del que dependen los detectores
  (`app.device_utils`); usar el mismo nombre en `backend/` generaría un
  choque de imports según desde dónde se lance uvicorn.
- Los modelos de IA se cargan una única vez al arrancar (`startup` event de
  FastAPI, ver `api/main.py`), no en cada request.
- Las contraseñas nunca se devuelven ni se registran en logs; se guardan
  únicamente como hash bcrypt (`usuarios.contrasena_hash`).
