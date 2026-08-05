"""Configuracion central del backend (variables de entorno + rutas al proyecto raiz)."""

from __future__ import annotations

from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

# backend/api/config.py -> backend/ (raiz del proyecto CV: detectors/,
# lightingAnalyzer/, weights/, configs/, database/ viven todas dentro de
# backend/ desde la compactacion a dos carpetas backend+frontend).
BACKEND_ROOT = Path(__file__).resolve().parents[1]
PROJECT_ROOT = BACKEND_ROOT

# `.as_posix()` (no `str()`) a proposito: en Windows da "C:/..." y en Linux
# "/app/...", y en ambos casos concatenar "sqlite:///" + esa ruta produce la
# URL absoluta correcta (3 barras + "C:/..." en Windows, 3 barras + la barra
# inicial de "/app/..." = 4 en Linux). Con `str()` puro, las backslashes de
# Windows romperian la URL.
_RUTA_SQLITE_DEFECTO = (PROJECT_ROOT / "database" / "selene.db").as_posix()


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=BACKEND_ROOT / ".env", extra="ignore")

    # --- Base de datos -----------------------------------------------------
    # SQLite: un archivo, no un servidor. Antes era Postgres
    # (postgresql+psycopg://...); ver database/schema_postgres.sql si hace
    # falta volver a esa version.
    database_url: str = f"sqlite:///{_RUTA_SQLITE_DEFECTO}"

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
    # Aqui vivia `luz_encendida_umbral_pct`: el % de iluminacion artificial a
    # partir del cual se daba una luminaria por "encendida". Se elimino porque
    # medía la cosa equivocada — `porcentaje_artificial` es un reparto relativo
    # frente a la luz natural, no un indicador de si la lampara emite. Ahora
    # `energy/vision_bridge.py` cuenta luminarias emitiendo, que se mide sobre
    # los pixeles de cada lampara; sus umbrales viven en
    # `configs/lighting_analysis.yaml: luminaire_on`.

    # --- Asistente de voz (backend/api/assistant/) ---------------------------
    # `gpt_api_key` lee la variable GPT_API_KEY ya presente en backend/.env
    # (pydantic-settings mapea el nombre de campo a su MAYUSCULAS por defecto).
    gpt_api_key: str = ""
    openai_chat_model: str = "gpt-4o-mini"
    openai_transcription_model: str = "whisper-1"
    openai_tts_model: str = "tts-1"
    openai_tts_voice: str = "alloy"
    asistente_reports_dir: str = "reports/asistente"

    # --- Voz de Lum, el recorrido de bienvenida (backend/api/routers/recorrido.py) ---
    # ElevenLabs es el motor PRINCIPAL de esta narración (voz cálida y natural
    # de verdad, a diferencia de `SpeechSynthesis` del navegador). Si no hay
    # clave configurada, `recorrido.py` cae al TTS de OpenAI de arriba, y si
    # ese también falla, el frontend cae a la voz del navegador — el
    # recorrido nunca se queda mudo, ver narracion.js.
    elevenlabs_api_key: str = ""
    elevenlabs_voice_id: str = "rEVYTKPqwSMhytFPayIb"
    elevenlabs_model_id: str = "eleven_multilingual_v2"

    @property
    def project_root(self) -> Path:
        return PROJECT_ROOT

    @property
    def energy_model_path(self) -> Path:
        return Path(self.energy_model_dir)


settings = Settings()
