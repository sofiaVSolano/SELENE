-- =====================================================================
-- Sistema Inteligente Autonomo de Gestion de Luminarias
-- Esquema SQLite (3FN) para backend FastAPI
-- =====================================================================
-- Migrado desde PostgreSQL (ver database/schema_postgres.sql para el
-- original y database/DISENO_BASE_DATOS.md para el ERD). Diferencias
-- deliberadas frente a la version Postgres, todas por limitaciones reales
-- de SQLite y no por descuido:
--
--   - Sin tipos ENUM nativos: cada dominio cerrado (rol, estado, tipo,
--     prioridad) se declara como TEXT + CHECK inline, en vez de un tipo
--     aparte. La aplicacion (backend/api/models.py, Enum de SQLAlchemy)
--     sigue validando los mismos valores del lado de Python.
--   - Sin gen_random_uuid(): los UUID se generan en Python al insertar
--     (ver `default=uuid.uuid4` en models.py) y se guardan como TEXT.
--   - `detecciones_ocupacion` ya NO esta particionada por rango de fecha:
--     el particionado en Postgres existia para escalar a millones de filas
--     por mes con poda de particion; SQLite no soporta particionado nativo
--     y el volumen de un despliegue de una sola instalacion no lo necesita.
--     La PK vuelve a ser un unico id_deteccion autoincremental.
--   - Sin BRIN/GIN: se usan indices B-tree normales. La busqueda por
--     similitud (pg_trgm) y el indice GIN sobre JSON no los usa ningun
--     query de la aplicacion (se verifico antes de migrar), asi que se
--     omiten en vez de simularlos.
--   - Sin trigger `updated_at`: SQLAlchemy lo actualiza via `onupdate=`
--     en el modelo (ver Usuario/Luminaria en models.py), asi que no hace
--     falta un trigger de base de datos para lo mismo.
--   - Se quito el CHECK de formato de correo con regex POSIX (`~*`):
--     SQLite no tiene operador de regex nativo: la validacion de formato
--     ya la hace `EmailStr` de Pydantic en la capa de API.
--   - Se quito `tiempo_encendida` (columna generada tipo INTERVAL) de
--     `consumo_energetico`: SQLite no tiene tipo INTERVAL, y se confirmo
--     que ningun codigo de la aplicacion la lee (la duracion se calcula en
--     Python en `energy/vision_bridge.py`).
--
-- Convenciones que SÍ se mantienen:
--   - PK de catalogos/entidades de bajo volumen: TEXT (UUID como string).
--   - PK de tablas de series temporales de alto volumen: INTEGER
--     autoincremental (SQLite trata INTEGER PRIMARY KEY como alias del
--     rowid, tan eficiente como BIGINT GENERATED ALWAYS AS IDENTITY).
--   - Timestamps siempre en UTC, generados en Python
--     (`dt.datetime.now(dt.timezone.utc)`) y guardados vía el tipo
--     `UTCDateTime` (ver backend/api/database.py) para que se lean de
--     vuelta como datetime *aware*, igual que con TIMESTAMPTZ en Postgres.
-- =====================================================================

PRAGMA foreign_keys = ON;

BEGIN;

-- =====================================================================
-- 2. ZONAS (tabla catalogo -- normaliza el atributo "zona" de Luminarias)
-- =====================================================================
CREATE TABLE IF NOT EXISTS zonas (
    id_zona      TEXT PRIMARY KEY,
    nombre       TEXT NOT NULL UNIQUE,
    edificio     TEXT,
    piso         TEXT,
    descripcion  TEXT,
    tipo_espacio TEXT NOT NULL DEFAULT 'oficina'
                 CHECK (tipo_espacio IN ('comedor', 'salon', 'laboratorio', 'auditorio', 'oficina')),
    -- Potencia tipica de las luminarias de esta sala. Las luminarias las
    -- detecta la camara, pero los vatios no se ven en una imagen: es el unico
    -- dato del consumo que declara el usuario, y se declara una vez por sala.
    potencia_luminaria_w REAL NOT NULL DEFAULT 18.0 CHECK (potencia_luminaria_w > 0),
    created_at   TEXT NOT NULL
);

-- =====================================================================
-- 3. USUARIOS
-- =====================================================================
CREATE TABLE IF NOT EXISTS usuarios (
    id_usuario        TEXT PRIMARY KEY,
    nombre            TEXT NOT NULL,
    correo            TEXT NOT NULL UNIQUE,
    contrasena_hash   TEXT NOT NULL,
    rol               TEXT NOT NULL DEFAULT 'visor'
                      CHECK (rol IN ('administrador', 'operador', 'analista', 'visor')),
    activo            INTEGER NOT NULL DEFAULT 1,
    -- Recorrido de bienvenida: 0 = nunca lo ha hecho. Vive en la base y no en
    -- el navegador porque la regla es "un correo que nunca ha entrado a la
    -- plataforma", no "un navegador que nunca la ha abierto": con
    -- localStorage, el mismo correo en otro equipo volveria a verlo.
    -- Para bases ya creadas, la columna la agrega `_migrar_columnas()` en
    -- db_init.py (un CREATE TABLE IF NOT EXISTS no altera una tabla que ya existe).
    onboarding_completado INTEGER NOT NULL DEFAULT 0,
    fecha_registro    TEXT NOT NULL,
    updated_at        TEXT NOT NULL
);

-- =====================================================================
-- 4. LUMINARIAS
-- =====================================================================
CREATE TABLE IF NOT EXISTS luminarias (
    id_luminaria       TEXT PRIMARY KEY,
    nombre             TEXT NOT NULL,
    id_zona            TEXT NOT NULL REFERENCES zonas(id_zona) ON DELETE RESTRICT,
    tipo               TEXT NOT NULL
                       CHECK (tipo IN ('LED', 'fluorescente', 'sodio', 'halogena', 'induccion', 'otro')),
    potencia_w         REAL NOT NULL CHECK (potencia_w > 0),
    estado_actual      TEXT NOT NULL DEFAULT 'apagada'
                       CHECK (estado_actual IN ('encendida', 'apagada', 'falla', 'mantenimiento')),
    fecha_instalacion  TEXT NOT NULL,
    activa             INTEGER NOT NULL DEFAULT 1,
    created_at         TEXT NOT NULL,
    updated_at         TEXT NOT NULL,
    CONSTRAINT uq_luminarias_nombre_zona UNIQUE (nombre, id_zona)
);

-- =====================================================================
-- 5. DETECCIONES_OCUPACION
-- ---------------------------------------------------------------------
-- Tabla de mayor volumen de escritura del sistema: una fila por cada
-- inferencia de ocupacion sobre un frame/intervalo de video analizado.
-- Sin particionar (ver nota de cabecera): PK autoincremental simple.
-- =====================================================================
CREATE TABLE IF NOT EXISTS detecciones_ocupacion (
    id_deteccion          INTEGER PRIMARY KEY AUTOINCREMENT,
    id_luminaria           TEXT NOT NULL REFERENCES luminarias(id_luminaria) ON DELETE CASCADE,
    -- Sala activa al momento de la captura, sellada aqui (ver el mismo
    -- comentario en api/models.py::DeteccionOcupacion). Sin ON DELETE propio:
    -- la fila entera ya se va en cascada cuando se borra la luminaria.
    id_zona                TEXT REFERENCES zonas(id_zona),
    fecha_hora             TEXT NOT NULL,
    personas_detectadas    INTEGER NOT NULL DEFAULT 0 CHECK (personas_detectadas >= 0),
    confianza              REAL CHECK (confianza IS NULL OR (confianza BETWEEN 0 AND 1)),
    imagen_referencia      TEXT,
    estado_ocupacion       TEXT NOT NULL CHECK (estado_ocupacion IN ('ocupado', 'vacio')),
    -- Snapshot del analisis completo del fotograma (ver el comentario largo
    -- en api/models.py::DeteccionOcupacion): antes solo vivia en la
    -- respuesta HTTP y en el localStorage del navegador.
    num_ventanas               INTEGER NOT NULL DEFAULT 0,
    num_luminarias              INTEGER NOT NULL DEFAULT 0,
    num_luminarias_encendidas   INTEGER NOT NULL DEFAULT 0,
    porcentaje_natural           REAL NOT NULL DEFAULT 0,
    porcentaje_artificial        REAL NOT NULL DEFAULT 0,
    natural_score                 REAL NOT NULL DEFAULT 0,
    artificial_score              REAL NOT NULL DEFAULT 0,
    consumo_estimado_kwh          REAL,
    ahorro_estimado_kwh           REAL,
    recomendacion                 TEXT,
    CONSTRAINT chk_deteccion_consistencia CHECK (
        (estado_ocupacion = 'vacio'    AND personas_detectadas = 0) OR
        (estado_ocupacion = 'ocupado'  AND personas_detectadas >= 1)
    )
);

-- =====================================================================
-- 6. EVENTOS
-- ---------------------------------------------------------------------
-- id_deteccion_origen/fecha_hora_origen son una referencia "suave" (sin
-- FK) hacia la deteccion que disparo el evento -- igual que en la version
-- Postgres, la integridad se valida en la capa de aplicacion.
-- =====================================================================
CREATE TABLE IF NOT EXISTS eventos (
    id_evento             INTEGER PRIMARY KEY AUTOINCREMENT,
    id_luminaria           TEXT NOT NULL REFERENCES luminarias(id_luminaria) ON DELETE CASCADE,
    id_deteccion_origen    INTEGER,
    fecha_hora_origen      TEXT,
    fecha_hora             TEXT NOT NULL,
    tipo_evento            TEXT NOT NULL CHECK (tipo_evento IN (
                               'encendido', 'apagado', 'alerta_ocupacion', 'alerta_falla',
                               'mantenimiento', 'conexion', 'desconexion', 'cambio_configuracion'
                           )),
    descripcion            TEXT
);

-- =====================================================================
-- 7. CONSUMO_ENERGETICO
-- =====================================================================
CREATE TABLE IF NOT EXISTS consumo_energetico (
    id_consumo              INTEGER PRIMARY KEY AUTOINCREMENT,
    id_luminaria             TEXT NOT NULL REFERENCES luminarias(id_luminaria) ON DELETE CASCADE,
    fecha_hora_inicio        TEXT NOT NULL,
    fecha_hora_fin           TEXT,
    energia_consumida_kwh    REAL CHECK (energia_consumida_kwh IS NULL OR energia_consumida_kwh >= 0),
    CONSTRAINT chk_consumo_rango_fechas
        CHECK (fecha_hora_fin IS NULL OR fecha_hora_fin > fecha_hora_inicio)
);

-- =====================================================================
-- 8. PATRONES_USO
-- =====================================================================
CREATE TABLE IF NOT EXISTS patrones_uso (
    id_patron            TEXT PRIMARY KEY,
    id_luminaria          TEXT NOT NULL REFERENCES luminarias(id_luminaria) ON DELETE CASCADE,
    horario_inicio        TEXT NOT NULL,
    horario_fin            TEXT NOT NULL,
    ocupacion_promedio    REAL CHECK (ocupacion_promedio IS NULL OR (ocupacion_promedio BETWEEN 0 AND 100)),
    consumo_promedio      REAL CHECK (consumo_promedio IS NULL OR consumo_promedio >= 0),
    frecuencia_uso        INTEGER CHECK (frecuencia_uso IS NULL OR frecuencia_uso >= 0),
    fecha_calculo          TEXT NOT NULL,
    CONSTRAINT chk_patron_horario CHECK (horario_fin > horario_inicio)
);

-- =====================================================================
-- 9. RECOMENDACIONES
-- =====================================================================
CREATE TABLE IF NOT EXISTS recomendaciones (
    id_recomendacion    TEXT PRIMARY KEY,
    id_luminaria         TEXT NOT NULL REFERENCES luminarias(id_luminaria) ON DELETE CASCADE,
    id_patron            TEXT REFERENCES patrones_uso(id_patron) ON DELETE SET NULL,
    -- Sala sellada al momento de la alerta (ver el mismo comentario en
    -- api/models.py::Recomendacion).
    id_zona               TEXT REFERENCES zonas(id_zona),
    -- Deteccion cuyo fotograma disparo esta alerta -- referencia "suave", sin
    -- FK, igual que eventos.id_deteccion_origen (ver comentario ahi).
    id_deteccion_origen  INTEGER,
    segundos_sin_ocupacion INTEGER,
    fecha_hora            TEXT NOT NULL,
    recomendacion        TEXT NOT NULL,
    prioridad             TEXT NOT NULL DEFAULT 'media'
                          CHECK (prioridad IN ('baja', 'media', 'alta', 'critica')),
    aplicada               INTEGER NOT NULL DEFAULT 0,
    fecha_aplicacion      TEXT,
    CONSTRAINT chk_recomendacion_fecha_aplicacion
        CHECK (fecha_aplicacion IS NULL OR fecha_aplicacion >= fecha_hora)
);

-- =====================================================================
-- 7.1. MODULO DE PREDICCION ENERGETICA (backend/api/energy/)
-- ---------------------------------------------------------------------
-- `id_deteccion` en las 4 tablas de abajo sigue siendo una referencia
-- SUAVE (sin FK), mismo motivo que en la version Postgres.
-- =====================================================================
CREATE TABLE IF NOT EXISTS consumo_energetico_estimado (
    id_consumo_estimado          INTEGER PRIMARY KEY AUTOINCREMENT,
    id_deteccion                  INTEGER,
    consumo_real_kwh              REAL CHECK (consumo_real_kwh IS NULL OR consumo_real_kwh >= 0),
    consumo_estimado_kwh          REAL NOT NULL CHECK (consumo_estimado_kwh >= 0),
    consumo_optimizado_kwh        REAL NOT NULL CHECK (consumo_optimizado_kwh >= 0),
    ahorro_kwh                    REAL NOT NULL,
    ahorro_porcentaje             REAL NOT NULL,
    co2_generado_kg                REAL NOT NULL,
    co2_evitable_kg                REAL NOT NULL,
    intensidad_energetica_kwh_m2  REAL,
    fecha                          TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS predicciones_consumo (
    id_prediccion         INTEGER PRIMARY KEY AUTOINCREMENT,
    id_deteccion           INTEGER,
    modelo_utilizado       TEXT NOT NULL DEFAULT 'LightGBM',
    variables_entrada      TEXT NOT NULL,  -- JSON serializado (SQLAlchemy JSON generico)
    prediccion_kwh          REAL NOT NULL,
    tiempo_inferencia_ms   REAL,
    confianza                REAL,
    fecha                    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS recomendaciones_energeticas (
    id_recomendacion_energetica  TEXT PRIMARY KEY,
    id_deteccion                  INTEGER,
    tipo_recomendacion            TEXT NOT NULL,
    descripcion                    TEXT NOT NULL,
    ahorro_estimado_kwh           REAL NOT NULL,
    ahorro_porcentaje              REAL NOT NULL,
    co2_estimado_kg                 REAL NOT NULL,
    aplicada                        INTEGER NOT NULL DEFAULT 0,
    fecha                            TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS simulaciones (
    id_simulacion         INTEGER PRIMARY KEY AUTOINCREMENT,
    id_deteccion           INTEGER,
    tipo_simulacion         TEXT NOT NULL,
    escenario_original      TEXT NOT NULL,  -- JSON serializado
    escenario_simulado      TEXT NOT NULL,  -- JSON serializado
    consumo_original_kwh    REAL NOT NULL,
    consumo_simulado_kwh    REAL NOT NULL,
    ahorro_kwh               REAL NOT NULL,
    ahorro_porcentaje         REAL NOT NULL,
    fecha                     TEXT NOT NULL
);

-- =====================================================================
-- 10. CONSULTAS
-- =====================================================================
CREATE TABLE IF NOT EXISTS consultas (
    id_consulta         TEXT PRIMARY KEY,
    id_usuario           TEXT NOT NULL REFERENCES usuarios(id_usuario) ON DELETE CASCADE,
    pregunta             TEXT NOT NULL,
    respuesta            TEXT,
    fecha_hora            TEXT NOT NULL,
    tiempo_respuesta     REAL CHECK (tiempo_respuesta IS NULL OR tiempo_respuesta >= 0)
);

-- =====================================================================
-- 11. REPORTES
-- =====================================================================
CREATE TABLE IF NOT EXISTS reportes (
    id_reporte           TEXT PRIMARY KEY,
    id_usuario            TEXT NOT NULL REFERENCES usuarios(id_usuario) ON DELETE RESTRICT,
    fecha_generacion      TEXT NOT NULL,
    tipo_reporte          TEXT NOT NULL
                          CHECK (tipo_reporte IN ('consumo', 'ocupacion', 'patrones', 'alertas', 'general')),
    clave_reporte         TEXT,
    periodo               TEXT NOT NULL,
    ruta_archivo          TEXT NOT NULL,
    resumen               TEXT
);

-- =====================================================================
-- 12. INDICES
-- =====================================================================

CREATE INDEX IF NOT EXISTS idx_luminarias_zona    ON luminarias (id_zona);
CREATE INDEX IF NOT EXISTS idx_luminarias_estado  ON luminarias (estado_actual) WHERE activa = 1;

CREATE INDEX IF NOT EXISTS idx_detecciones_luminaria_fecha ON detecciones_ocupacion (id_luminaria, fecha_hora DESC);
CREATE INDEX IF NOT EXISTS idx_detecciones_fecha             ON detecciones_ocupacion (fecha_hora);
CREATE INDEX IF NOT EXISTS idx_detecciones_ocupado           ON detecciones_ocupacion (id_luminaria, fecha_hora DESC) WHERE estado_ocupacion = 'ocupado';

CREATE INDEX IF NOT EXISTS idx_eventos_luminaria_fecha ON eventos (id_luminaria, fecha_hora DESC);
CREATE INDEX IF NOT EXISTS idx_eventos_tipo            ON eventos (tipo_evento);

CREATE INDEX IF NOT EXISTS idx_consumo_luminaria_fecha ON consumo_energetico (id_luminaria, fecha_hora_inicio DESC);

CREATE INDEX IF NOT EXISTS idx_consumo_estimado_deteccion_fecha ON consumo_energetico_estimado (id_deteccion, fecha DESC);
CREATE INDEX IF NOT EXISTS idx_predicciones_consumo_deteccion_fecha ON predicciones_consumo (id_deteccion, fecha DESC);
CREATE INDEX IF NOT EXISTS idx_recomendaciones_energeticas_deteccion_fecha ON recomendaciones_energeticas (id_deteccion, fecha DESC);
CREATE INDEX IF NOT EXISTS idx_recomendaciones_energeticas_pendientes ON recomendaciones_energeticas (tipo_recomendacion, fecha) WHERE aplicada = 0;
CREATE INDEX IF NOT EXISTS idx_simulaciones_deteccion_fecha ON simulaciones (id_deteccion, fecha DESC);
CREATE INDEX IF NOT EXISTS idx_simulaciones_tipo ON simulaciones (tipo_simulacion, fecha DESC);

CREATE INDEX IF NOT EXISTS idx_patrones_luminaria ON patrones_uso (id_luminaria, horario_inicio);

CREATE INDEX IF NOT EXISTS idx_recomendaciones_luminaria    ON recomendaciones (id_luminaria, fecha_hora DESC);
CREATE INDEX IF NOT EXISTS idx_recomendaciones_pendientes   ON recomendaciones (prioridad, fecha_hora) WHERE aplicada = 0;

CREATE INDEX IF NOT EXISTS idx_consultas_usuario_fecha ON consultas (id_usuario, fecha_hora DESC);

CREATE INDEX IF NOT EXISTS idx_reportes_usuario_fecha ON reportes (id_usuario, fecha_generacion DESC);
CREATE INDEX IF NOT EXISTS idx_reportes_tipo          ON reportes (tipo_reporte);

COMMIT;
