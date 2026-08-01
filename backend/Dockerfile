# Build context: backend/ (el motor CV -- app/, detectors/, lightingAnalyzer/,
# configs/, weights/, database/ -- vive todo dentro de backend/ desde la
# compactacion a dos carpetas backend+frontend). docker-compose.yml ya apunta
# el context correctamente; si se construye a mano, usar (desde backend/):
#   docker build -t selene-backend .
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
COPY requirements-core.txt ./requirements-core.txt
COPY requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 8000

CMD ["uvicorn", "api.main:app", "--host", "0.0.0.0", "--port", "8000"]
