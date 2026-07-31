"""Configuracion central del backend (variables de entorno + rutas al proyecto raiz)."""

from __future__ import annotations

from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

# backend/api/config.py -> backend/ -> raiz del proyecto (donde viven
# detectors/, lightingAnalyzer/, weights/, configs/, database/).
PROJECT_ROOT = Path(__file__).resolve().parents[2]
BACKEND_ROOT = Path(__file__).resolve().parents[1]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=BACKEND_ROOT / ".env", extra="ignore")

    # --- Base de datos -----------------------------------------------------
    database_url: str = "postgresql+psycopg://selene:selene@localhost:5432/selene_db"

    # --- Seguridad / JWT -----------------------------------------------------
    jwt_secret_key: str = "CAMBIAR_ESTE_SECRETO_EN_PRODUCCION"
    jwt_algorithm: str = "HS256"
    jwt_expire_minutes: int = 60 * 8  # 8 horas

    # --- CORS -----------------------------------------------------------------
    cors_origins: list[str] = ["http://localhost:5173", "http://127.0.0.1:5173"]

    # --- Modelos de IA (rutas relativas a PROJECT_ROOT, ver configs/models.yaml) ---
    models_config_path: str = "configs/models.yaml"
    device: str = "auto"

    # --- Modulo de prediccion energetica (LightGBM ya entrenado, proyecto externo) ---
    energy_model_dir: str = ""
    co2_emission_factor_kg_per_kwh: float = 0.126
    energy_context_config_path: str = "configs/energy_context.yaml"
    # % de iluminacion artificial a partir del cual se considera que una
    # luminaria esta "encendida" para efectos de tracking real de consumo
    # (ver energy/vision_bridge.py). Mismo umbral que el frontend usaba solo
    # para la alerta de ocupacion (CameraPanel.jsx -> LUZ_ENCENDIDA_UMBRAL).
    luz_encendida_umbral_pct: float = 35.0

    # --- Asistente de voz (backend/api/assistant/) ---------------------------
    # `gpt_api_key` lee la variable GPT_API_KEY ya presente en backend/.env
    # (pydantic-settings mapea el nombre de campo a su MAYUSCULAS por defecto).
    gpt_api_key: str = ""
    openai_chat_model: str = "gpt-4o-mini"
    openai_transcription_model: str = "whisper-1"
    openai_tts_model: str = "tts-1"
    openai_tts_voice: str = "alloy"
    asistente_reports_dir: str = "reports/asistente"

    @property
    def project_root(self) -> Path:
        return PROJECT_ROOT

    @property
    def energy_model_path(self) -> Path:
        return Path(self.energy_model_dir)


settings = Settings()
