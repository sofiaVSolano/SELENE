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

    # --- Consumo acotado del asistente (OWASP LLM10) -------------------------
    # La ENTRADA ya estaba acotada (`PreguntaTextoRequest.pregunta` con
    # max_length=4000 y `_MAX_AUDIO_BYTES` de 20 MB en el router). Lo que
    # faltaba era acotar la SALIDA y la FRECUENCIA: sin `max_tokens` el modelo
    # puede responder hasta el tope de su ventana, y sin limite de tasa una
    # sola cuenta puede encadenar peticiones hasta agotar la cuota de OpenAI.
    #
    # Timeout y reintentos del cliente: por defecto el SDK de OpenAI espera 10
    # MINUTOS y reintenta 2 veces, asi que una llamada colgada podia ocupar un
    # worker de uvicorn media hora. 30 s cubre de sobra la latencia real de
    # gpt-4o-mini (unos pocos segundos) y 1 reintento absorbe un fallo de red
    # puntual sin multiplicar el gasto por tres.
    openai_timeout_seconds: float = 30.0
    openai_max_retries: int = 1

    # Techo de tokens de SALIDA por llamada de chat, uno por tipo de llamada
    # (no un valor unico: pedirle el mismo techo a una respuesta hablada que a
    # un reporte de 6 secciones trunca uno o desperdicia el otro).
    #
    # - respuesta: el propio SYSTEM_PROMPT pide respuestas breves porque se
    #   leen en voz alta; 300 tokens son ~200 palabras en espanol, mas de lo
    #   que nadie quiere escuchar de corrido. Cubre tambien el resumen de la
    #   conversacion (`reports._generar_resumen`, tope de 120 palabras).
    # - reporte: el JSON de `generar_reporte_detallado` lleva resumen + 3 a 6
    #   secciones con parrafos, renglones y tablas. ~900 palabras de prosa en
    #   espanol rondan los 1.300 tokens; 2.000 deja holgura para la sintaxis
    #   JSON y una seccion larga sin quedarse corto. Si aun asi truncara, el
    #   JSON llega incompleto, `json.loads` falla y el router responde 422
    #   ("intenta de nuevo") en vez de un PDF a medias.
    # - clasificacion: la respuesta es {"tipos_relevantes": [...]} con como
    #   mucho 4 claves cortas del catalogo (~40 tokens); 60 es el minimo
    #   razonable con margen para el formato.
    openai_max_tokens_respuesta: int = 300
    openai_max_tokens_reporte: int = 2000
    openai_max_tokens_clasificacion: int = 60

    # Limite de tasa por usuario y por minuto (ver `api/rate_limit.py`). El de
    # reportes es mas estricto a proposito: generar un reporte cuesta una
    # llamada de redaccion larga (hasta `openai_max_tokens_reporte`) mas el
    # renderizado del PDF y su escritura en disco, mientras que una pregunta
    # cuesta una respuesta corta. 12/min es una pregunta cada 5 segundos:
    # holgado para una persona conversando, inutil para un script.
    # OJO: 0 o menos NO desactiva el limite, lo cierra por completo (ver el
    # comentario de `_limite_por_minuto`): es un control de seguridad, un
    # valor mal puesto tiene que romper de forma visible, no en silencio.
    asistente_max_preguntas_por_minuto: int = 12
    asistente_max_reportes_por_minuto: int = 3

    # --- Voz de Lum, el recorrido de bienvenida (backend/api/routers/recorrido.py) ---
    # ElevenLabs es el motor PRINCIPAL de esta narración (voz cálida y natural
    # de verdad, a diferencia de `SpeechSynthesis` del navegador). Si no hay
    # clave configurada, `recorrido.py` cae al TTS de OpenAI de arriba, y si
    # ese también falla, el frontend cae a la voz del navegador — el
    # recorrido nunca se queda mudo, ver narracion.js.
    elevenlabs_api_key: str = ""
    elevenlabs_voice_id: str = "rEVYTKPqwSMhytFPayIb"
    elevenlabs_model_id: str = "eleven_multilingual_v2"

    # --- Reporte diario de actividad por correo (backend/api/email_reports.py) ---
    # SMTP puro (smtplib de la libreria estandar, sin dependencia nueva), tal
    # como lo pidio el profesor -- nada de un proveedor transaccional por API.
    # `smtp_host` vacio es la señal de "todavia sin configurar": el hilo de
    # fondo (ver main.py) se lo salta sin fallar, y `POST
    # /api/configuracion/reportes-email/probar` responde 503 explicando por
    # que en vez de intentar conectar a un host vacio.
    smtp_host: str = ""
    smtp_port: int = 587
    smtp_user: str = ""
    smtp_password: str = ""
    # Remitente que ve quien recibe el correo. Si queda vacio se usa smtp_user.
    smtp_from: str = ""
    # STARTTLS (puerto 587, el tipico de Gmail/Outlook) vs. TLS implicito
    # (puerto 465). En false y sin TLS en absoluto solo tiene sentido contra
    # un relay SMTP interno de pruebas.
    smtp_use_tls: bool = True
    # Zona horaria en la que la persona escribe `hora_envio` en el formulario
    # y en la que se compara "es la hora" cada minuto -- IANA (ver la lista de
    # la base de datos de zonas horarias), no un offset fijo, para que no se
    # desalinee con el horario de verano donde aplique.
    app_timezone: str = "America/Bogota"

    @property
    def project_root(self) -> Path:
        return PROJECT_ROOT

    @property
    def energy_model_path(self) -> Path:
        return Path(self.energy_model_dir)

    @property
    def smtp_from_effective(self) -> str:
        return self.smtp_from or self.smtp_user

    @property
    def smtp_configurado(self) -> bool:
        return bool(self.smtp_host and self.smtp_user and self.smtp_password)


settings = Settings()
