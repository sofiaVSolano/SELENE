# SELENE — Backend (FastAPI)

API para autenticación (registro/login con JWT) y para el panel de escaneo en
vivo: recibe un frame de cámara, ejecuta los detectores ya entrenados del
proyecto (`detectors/person_detector.py`, `detectors/lighting_detector.py`
y `lightingAnalyzer/`, todos dentro de esta misma carpeta) y persiste cada
detección en SQLite.

No reimplementa nada de visión por computador: reutiliza los mismos wrappers
que ya usa `scripts/run_realtime.py`, así que necesita los checkpoints en
`weights/` para poder responder `/api/deteccion/frame`.

> **¿Querés levantar todo (backend + frontend) con un solo comando?**
> Usá el `docker-compose.yml` de la raíz del repo, no este archivo — ver la
> sección "Levantar todo con Docker" en `../README.md`. Lo que sigue acá es
> el flujo local (venv, sin Docker), útil para desarrollar la API con
> `--reload`.

## 1. Entorno Python

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate            # Windows
pip install -r requirements.txt   # instala tambien requirements-core.txt (torch, ultralytics, opencv, etc.)

cp .env.example .env              # ajustar JWT_SECRET_KEY, GPT_API_KEY, etc.
```

## 2. Crear el esquema

SQLite es un archivo, no un servidor: no hace falta levantar nada aparte.
`api/db_init.py` aplica `database/schema.sql` (fuente única de verdad del
esquema) contra `DATABASE_URL` la primera vez que arranca la API, pero
también se puede aplicar a mano:

```bash
python scripts/init_db.py
```

## 3. Levantar la API

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

- El paquete de la API se llama `api/` (no `app/`) a propósito: `backend/`
  también tiene un paquete `app/` del que dependen los detectores
  (`app.device_utils`); usar el mismo nombre generaría un choque de imports
  según desde dónde se lance uvicorn.
- Los modelos de IA se cargan una única vez al arrancar (`startup` event de
  FastAPI, ver `api/main.py`), no en cada request.
- Las contraseñas nunca se devuelven ni se registran en logs; se guardan
  únicamente como hash bcrypt (`usuarios.contrasena_hash`).
- Dependencias divididas en dos archivos: `requirements-core.txt` (motor CV:
  torch, ultralytics, opencv, etc., también usado por los scripts CLI de
  `scripts/`) y `requirements.txt` (API: fastapi, sqlalchemy, etc., que
  incluye al primero con `-r requirements-core.txt`).
