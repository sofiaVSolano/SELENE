# Build context: la RAIZ del repo (no backend/), porque la API importa
# directamente detectors/, lightingAnalyzer/, app/ y configs/ que viven ahi
# (ver api/detection_service.py). docker-compose.yml ya apunta el context
# correctamente; si se construye a mano, usar:
#   docker build -f backend/Dockerfile -t selene-backend .
FROM python:3.11-slim

# libGL/libglib: requeridos por opencv-python (headless) y torchvision.
RUN apt-get update && apt-get install -y --no-install-recommends \
    libgl1 \
    libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copiar solo los requirements primero para cachear la capa de pip install
# (pesada: torch/torchvision/ultralytics) y no invalidarla en cada cambio
# de codigo.
COPY requirements.txt ./requirements.txt
COPY backend/requirements.txt ./backend/requirements.txt
RUN pip install --no-cache-dir -r backend/requirements.txt

COPY app ./app
COPY detectors ./detectors
COPY lightingAnalyzer ./lightingAnalyzer
COPY configs ./configs
COPY weights ./weights
COPY database ./database
COPY backend ./backend

WORKDIR /app/backend
EXPOSE 8000

CMD ["uvicorn", "api.main:app", "--host", "0.0.0.0", "--port", "8000"]
