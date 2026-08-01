-- =====================================================================
-- Sistema Inteligente Autonomo de Gestion de Luminarias
-- Esquema PostgreSQL (3FN) para backend FastAPI
-- =====================================================================
-- Ver database/DISENO_BASE_DATOS.md para el ERD y la justificacion de
-- cada decision de diseno (tipos, particionado, indices).
--
-- Convenciones:
--   - PK de catalogos/entidades de bajo volumen: UUID (gen_random_uuid()).
--   - PK de tablas de series temporales de alto volumen (detecciones,
--     eventos, consumo): BIGINT GENERATED ALWAYS AS IDENTITY.
--   - Timestamps siempre en TIMESTAMPTZ (UTC en servidor, conversion de
--     zona horaria en la capa de aplicacion / FastAPI).
--   - Dominios cerrados (rol, estado, tipo, prioridad) como ENUM nativo
--     de PostgreSQL en lugar de VARCHAR + CHECK, para integridad y para
--     mapeo directo a Enum de Python/Pydantic.
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 0. Extensiones
-- ---------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS pgcrypto;  -- gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS pg_trgm;   -- busqueda por similitud en consultas.pregunta

-- ---------------------------------------------------------------------
-- 1. Tipos ENUM (dominios cerrados)
-- ---------------------------------------------------------------------
CREATE TYPE rol_usuario_enum        AS ENUM ('administrador', 'operador', 'analista', 'visor');
CREATE TYPE tipo_luminaria_enum     AS ENUM ('LED', 'fluorescente', 'sodio', 'halogena', 'induccion', 'otro');
CREATE TYPE estado_luminaria_enum   AS ENUM ('encendida', 'apagada', 'falla', 'mantenimiento');
CREATE TYPE estado_ocupacion_enum   AS ENUM ('ocupado', 'vacio');
CREATE TYPE tipo_evento_enum        AS ENUM (
    'encendido', 'apagado', 'alerta_ocupacion', 'alerta_falla',
    'mantenimiento', 'conexion', 'desconexion', 'cambio_configuracion'
);
CREATE TYPE prioridad_enum          AS ENUM ('baja', 'media', 'alta', 'critica');
CREATE TYPE tipo_reporte_enum       AS ENUM ('consumo', 'ocupacion', 'patrones', 'alertas', 'general');

-- ---------------------------------------------------------------------
-- Funcion utilitaria: mantener updated_at automaticamente
-- ---------------------------------------------------------------------
CREATE FUNCTION fn_set_updated_at() RETURNS trigger AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- =====================================================================
-- 2. ZONAS (tabla catalogo -- normaliza el atributo "zona" de Luminarias)
-- =====================================================================
CREATE TABLE zonas (
    id_zona      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nombre       VARCHAR(100) NOT NULL UNIQUE,
    edificio     VARCHAR(100),
    piso         VARCHAR(50),
    descripcion  TEXT,
    tipo_espacio VARCHAR(20) NOT NULL DEFAULT 'oficina'
                 CHECK (tipo_espacio IN ('comedor', 'salon', 'laboratorio', 'auditorio', 'oficina')),
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE zonas IS 'Catalogo de zonas/ubicaciones fisicas donde se instalan luminarias.';
COMMENT ON COLUMN zonas.tipo_espacio IS
    'Mezcla de sector que usa el modelo LightGBM del modulo energetico (ver mapeo_tipo_espacio en configs/energy_context.yaml). No lo infiere la vision por computador.';

-- =====================================================================
-- 3. USUARIOS
-- =====================================================================
CREATE TABLE usuarios (
    id_usuario        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nombre            VARCHAR(150) NOT NULL,
    correo            VARCHAR(255) NOT NULL UNIQUE,
    contrasena_hash   VARCHAR(255) NOT NULL,
    rol               rol_usuario_enum NOT NULL DEFAULT 'visor',
    activo            BOOLEAN NOT NULL DEFAULT TRUE,
    fecha_registro    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_usuarios_correo_formato
        CHECK (correo ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$')
);

COMMENT ON TABLE usuarios IS 'Cuentas de acceso al sistema (operadores, analistas, administradores).';
COMMENT ON COLUMN usuarios.contrasena_hash IS 'Hash (bcrypt/argon2), nunca texto plano. Se genera y valida en FastAPI.';

CREATE TRIGGER trg_usuarios_updated_at
    BEFORE UPDATE ON usuarios
    FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

-- =====================================================================
-- 4. LUMINARIAS
-- =====================================================================
CREATE TABLE luminarias (
    id_luminaria       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nombre             VARCHAR(150) NOT NULL,
    id_zona            UUID NOT NULL REFERENCES zonas(id_zona) ON DELETE RESTRICT,
    tipo               tipo_luminaria_enum NOT NULL,
    potencia_w         NUMERIC(6,2) NOT NULL CHECK (potencia_w > 0),
    estado_actual      estado_luminaria_enum NOT NULL DEFAULT 'apagada',
    fecha_instalacion  DATE NOT NULL DEFAULT CURRENT_DATE,
    activa             BOOLEAN NOT NULL DEFAULT TRUE,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_luminarias_nombre_zona UNIQUE (nombre, id_zona)
);

COMMENT ON TABLE luminarias IS 'Inventario de luminarias fisicas monitoreadas por el sistema de vision.';

CREATE TRIGGER trg_luminarias_updated_at
    BEFORE UPDATE ON luminarias
    FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

-- =====================================================================
-- 5. DETECCIONES_OCUPACION
-- ---------------------------------------------------------------------
-- Tabla de mayor volumen de escritura del sistema: una fila por cada
-- inferencia de ocupacion sobre un frame/intervalo de video analizado.
-- Particionada por rango de fecha_hora (mensual) para escalabilidad
-- (insercion rapida, poda de particion en consultas, purga/archivado
-- barato de historico via DROP PARTITION en vez de DELETE masivo).
-- =====================================================================
CREATE TABLE detecciones_ocupacion (
    id_deteccion          BIGINT GENERATED ALWAYS AS IDENTITY,
    id_luminaria           UUID NOT NULL REFERENCES luminarias(id_luminaria) ON DELETE CASCADE,
    fecha_hora             TIMESTAMPTZ NOT NULL DEFAULT now(),  -- momento exacto de cada deteccion de persona
    personas_detectadas    SMALLINT NOT NULL DEFAULT 0 CHECK (personas_detectadas >= 0),
    confianza              NUMERIC(5,4) CHECK (confianza BETWEEN 0 AND 1),
    imagen_referencia      TEXT,
    estado_ocupacion       estado_ocupacion_enum NOT NULL,
    PRIMARY KEY (id_deteccion, fecha_hora),
    CONSTRAINT chk_deteccion_consistencia CHECK (
        (estado_ocupacion = 'vacio'    AND personas_detectadas = 0) OR
        (estado_ocupacion = 'ocupado'  AND personas_detectadas >= 1)
    )
) PARTITION BY RANGE (fecha_hora);

COMMENT ON TABLE detecciones_ocupacion IS
    'Registro de cada deteccion de ocupacion por vision computacional. fecha_hora guarda el instante exacto en que se detecto (o no) una persona.';
COMMENT ON COLUMN detecciones_ocupacion.fecha_hora IS
    'Timestamp exacto de la deteccion; se inserta una fila por cada evaluacion de frame/intervalo, nunca se sobreescribe.';

-- Particiones iniciales (crear nuevas mensualmente via job/cron o pg_partman)
CREATE TABLE detecciones_ocupacion_2026_07 PARTITION OF detecciones_ocupacion
    FOR VALUES FROM ('2026-07-01') TO ('2026-08-01');
CREATE TABLE detecciones_ocupacion_2026_08 PARTITION OF detecciones_ocupacion
    FOR VALUES FROM ('2026-08-01') TO ('2026-09-01');
CREATE TABLE detecciones_ocupacion_2026_09 PARTITION OF detecciones_ocupacion
    FOR VALUES FROM ('2026-09-01') TO ('2026-10-01');
-- Particion de resguardo para fechas fuera de rango (evita insert-fail)
CREATE TABLE detecciones_ocupacion_default PARTITION OF detecciones_ocupacion DEFAULT;

-- =====================================================================
-- 6. EVENTOS
-- ---------------------------------------------------------------------
-- id_deteccion_origen/fecha_hora_origen son una referencia "suave"
-- (sin FK) hacia la deteccion que disparo el evento: una FK real contra
-- una tabla particionada de alto volumen de escritura anadiria overhead
-- a cada insercion en detecciones_ocupacion. La integridad se valida en
-- la capa de aplicacion (FastAPI) al momento de crear el evento.
-- =====================================================================
CREATE TABLE eventos (
    id_evento             BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    id_luminaria           UUID NOT NULL REFERENCES luminarias(id_luminaria) ON DELETE CASCADE,
    id_deteccion_origen    BIGINT,
    fecha_hora_origen      TIMESTAMPTZ,
    fecha_hora             TIMESTAMPTZ NOT NULL DEFAULT now(),
    tipo_evento            tipo_evento_enum NOT NULL,
    descripcion            TEXT
);

COMMENT ON TABLE eventos IS 'Bitacora de eventos por luminaria: encendidos, apagados, alertas, fallas, mantenimiento.';
COMMENT ON COLUMN eventos.id_deteccion_origen IS 'Referencia informativa (sin FK) a detecciones_ocupacion.id_deteccion que origino el evento, si aplica.';

-- =====================================================================
-- 7. CONSUMO_ENERGETICO
-- =====================================================================
CREATE TABLE consumo_energetico (
    id_consumo              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    id_luminaria             UUID NOT NULL REFERENCES luminarias(id_luminaria) ON DELETE CASCADE,
    fecha_hora_inicio        TIMESTAMPTZ NOT NULL,
    fecha_hora_fin           TIMESTAMPTZ,
    tiempo_encendida         INTERVAL GENERATED ALWAYS AS (fecha_hora_fin - fecha_hora_inicio) STORED,
    energia_consumida_kwh    NUMERIC(10,4) CHECK (energia_consumida_kwh >= 0),
    CONSTRAINT chk_consumo_rango_fechas
        CHECK (fecha_hora_fin IS NULL OR fecha_hora_fin > fecha_hora_inicio)
);

COMMENT ON TABLE consumo_energetico IS 'Ciclos de encendido/apagado por luminaria y su consumo energetico asociado.';
COMMENT ON COLUMN consumo_energetico.tiempo_encendida IS 'Columna generada: fecha_hora_fin - fecha_hora_inicio.';

-- =====================================================================
-- 8. PATRONES_USO
-- =====================================================================
CREATE TABLE patrones_uso (
    id_patron            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    id_luminaria          UUID NOT NULL REFERENCES luminarias(id_luminaria) ON DELETE CASCADE,
    horario_inicio        TIME NOT NULL,
    horario_fin            TIME NOT NULL,
    ocupacion_promedio    NUMERIC(5,2) CHECK (ocupacion_promedio BETWEEN 0 AND 100),
    consumo_promedio      NUMERIC(10,4) CHECK (consumo_promedio >= 0),
    frecuencia_uso        INTEGER CHECK (frecuencia_uso >= 0),
    fecha_calculo          TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_patron_horario CHECK (horario_fin > horario_inicio)
);

COMMENT ON TABLE patrones_uso IS 'Patrones de uso agregados por luminaria, calculados periodicamente a partir de detecciones y consumo.';

-- =====================================================================
-- 9. RECOMENDACIONES
-- =====================================================================
CREATE TABLE recomendaciones (
    id_recomendacion    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    id_luminaria         UUID NOT NULL REFERENCES luminarias(id_luminaria) ON DELETE CASCADE,
    id_patron            UUID REFERENCES patrones_uso(id_patron) ON DELETE SET NULL,
    fecha_hora            TIMESTAMPTZ NOT NULL DEFAULT now(),
    recomendacion        TEXT NOT NULL,
    prioridad             prioridad_enum NOT NULL DEFAULT 'media',
    aplicada               BOOLEAN NOT NULL DEFAULT FALSE,
    fecha_aplicacion      TIMESTAMPTZ,
    CONSTRAINT chk_recomendacion_fecha_aplicacion
        CHECK (fecha_aplicacion IS NULL OR fecha_aplicacion >= fecha_hora)
);

COMMENT ON TABLE recomendaciones IS 'Recomendaciones generadas por el modulo de IA a partir de patrones de uso.';

-- =====================================================================
-- 7.1. MODULO DE PREDICCION ENERGETICA (backend/api/energy/)
-- ---------------------------------------------------------------------
-- Convierte la salida del sistema de vision (personas, ventanas, luminarias,
-- brillo, natural/artificial score...) en indicadores de consumo y
-- recomendaciones de ahorro usando el modelo LightGBM ya entrenado en el
-- proyecto externo ProyectoPrediccionEnergetica (no se reentrena nada aqui).
--
-- `consumo_energetico_estimado` es DISTINTA de `consumo_energetico` (arriba):
-- esa mide ciclos encendido/apagado de UNA luminaria; esta mide el consumo de
-- una ESCENA completa (N luminarias a la vez) calculado por el modelo + el
-- motor de simulacion, por eso se le da nombre propio en vez de reusar la
-- tabla existente.
--
-- `id_deteccion` en las 4 tablas es una referencia SUAVE (sin FK) hacia
-- `detecciones_ocupacion.id_deteccion`, con el mismo motivo que
-- `eventos.id_deteccion_origen`: esa tabla esta particionada y es de alta
-- frecuencia de escritura, y el modulo energetico debe poder generar/persistir
-- un reporte standalone (sin una captura de vision ya guardada).
-- =====================================================================
CREATE TABLE consumo_energetico_estimado (
    id_consumo_estimado          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    id_deteccion                  BIGINT,
    consumo_real_kwh              NUMERIC(12,4) CHECK (consumo_real_kwh >= 0),
    consumo_estimado_kwh          NUMERIC(12,4) NOT NULL CHECK (consumo_estimado_kwh >= 0),
    consumo_optimizado_kwh        NUMERIC(12,4) NOT NULL CHECK (consumo_optimizado_kwh >= 0),
    ahorro_kwh                    NUMERIC(12,4) NOT NULL,
    ahorro_porcentaje             NUMERIC(6,2) NOT NULL,
    co2_generado_kg                NUMERIC(12,4) NOT NULL,
    co2_evitable_kg                NUMERIC(12,4) NOT NULL,
    intensidad_energetica_kwh_m2  NUMERIC(10,4),
    fecha                          TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE consumo_energetico_estimado IS
    'Consumo real/estimado/optimizado por escena analizada (modelo LightGBM + motor de simulacion). Ver consumo_energetico para consumo real por ciclo encendido/apagado de una luminaria individual.';
COMMENT ON COLUMN consumo_energetico_estimado.id_deteccion IS 'Referencia informativa (sin FK) a detecciones_ocupacion.id_deteccion.';

CREATE TABLE predicciones_consumo (
    id_prediccion         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    id_deteccion           BIGINT,
    modelo_utilizado       VARCHAR(50) NOT NULL DEFAULT 'LightGBM',
    variables_entrada      JSONB NOT NULL,
    prediccion_kwh          NUMERIC(12,4) NOT NULL,
    tiempo_inferencia_ms   NUMERIC(10,4),
    confianza                NUMERIC(5,4),
    fecha                    TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE predicciones_consumo IS 'Cada llamada al modelo LightGBM: features crudas de entrada y consumo predicho, para trazabilidad.';

CREATE TABLE recomendaciones_energeticas (
    id_recomendacion_energetica  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    id_deteccion                  BIGINT,
    tipo_recomendacion            VARCHAR(50) NOT NULL,
    descripcion                    TEXT NOT NULL,
    ahorro_estimado_kwh           NUMERIC(12,4) NOT NULL,
    ahorro_porcentaje              NUMERIC(6,2) NOT NULL,
    co2_estimado_kg                 NUMERIC(12,4) NOT NULL,
    aplicada                        BOOLEAN NOT NULL DEFAULT FALSE,
    fecha                            TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE recomendaciones_energeticas IS
    'Recomendacion de ahorro generada por reglas (energy/recommendations.py). Distinta de recomendaciones (generica, ligada a una luminaria y a patrones de uso).';

CREATE TABLE simulaciones (
    id_simulacion         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    id_deteccion           BIGINT,
    tipo_simulacion         VARCHAR(50) NOT NULL,
    escenario_original      JSONB NOT NULL,
    escenario_simulado      JSONB NOT NULL,
    consumo_original_kwh    NUMERIC(12,4) NOT NULL,
    consumo_simulado_kwh    NUMERIC(12,4) NOT NULL,
    ahorro_kwh               NUMERIC(12,4) NOT NULL,
    ahorro_porcentaje         NUMERIC(6,2) NOT NULL,
    fecha                     TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE simulaciones IS 'Cada corrida del motor de simulacion (energy/simulations.py): escenario original vs. simulado y el ahorro resultante.';

-- =====================================================================
-- 10. CONSULTAS
-- =====================================================================
CREATE TABLE consultas (
    id_consulta         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    id_usuario           UUID NOT NULL REFERENCES usuarios(id_usuario) ON DELETE CASCADE,
    pregunta             TEXT NOT NULL,
    respuesta            TEXT,
    fecha_hora            TIMESTAMPTZ NOT NULL DEFAULT now(),
    tiempo_respuesta     NUMERIC(8,3) CHECK (tiempo_respuesta >= 0)
);

COMMENT ON TABLE consultas IS 'Consultas en lenguaje natural realizadas por usuarios y respuestas generadas por el sistema (NLP/LLM).';

-- =====================================================================
-- 11. REPORTES
-- =====================================================================
CREATE TABLE reportes (
    id_reporte           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    id_usuario            UUID NOT NULL REFERENCES usuarios(id_usuario) ON DELETE RESTRICT,
    fecha_generacion      TIMESTAMPTZ NOT NULL DEFAULT now(),
    tipo_reporte          tipo_reporte_enum NOT NULL,
    clave_reporte         VARCHAR(30),
    periodo               VARCHAR(50) NOT NULL,
    ruta_archivo          TEXT NOT NULL,
    resumen               TEXT
);

COMMENT ON TABLE reportes IS 'Reportes generados (PDF/HTML/CSV) sobre consumo, ocupacion, patrones o alertas.';
COMMENT ON COLUMN reportes.clave_reporte IS
    'Clave especifica del catalogo de backend/api/assistant/report_types.py (p. ej. consumo_diario, plan_ahorro).';

-- =====================================================================
-- 12. INDICES
-- =====================================================================

-- luminarias
CREATE INDEX idx_luminarias_zona    ON luminarias (id_zona);
CREATE INDEX idx_luminarias_estado  ON luminarias (estado_actual) WHERE activa = TRUE;

-- detecciones_ocupacion (se crean sobre la tabla particionada => se propagan a cada particion)
CREATE INDEX idx_detecciones_luminaria_fecha ON detecciones_ocupacion (id_luminaria, fecha_hora DESC);
CREATE INDEX idx_detecciones_fecha_brin      ON detecciones_ocupacion USING BRIN (fecha_hora);
CREATE INDEX idx_detecciones_ocupado         ON detecciones_ocupacion (id_luminaria, fecha_hora DESC) WHERE estado_ocupacion = 'ocupado';

-- eventos
CREATE INDEX idx_eventos_luminaria_fecha ON eventos (id_luminaria, fecha_hora DESC);
CREATE INDEX idx_eventos_tipo            ON eventos (tipo_evento);

-- consumo_energetico
CREATE INDEX idx_consumo_luminaria_fecha ON consumo_energetico (id_luminaria, fecha_hora_inicio DESC);

-- modulo de prediccion energetica
CREATE INDEX idx_consumo_estimado_deteccion_fecha ON consumo_energetico_estimado (id_deteccion, fecha DESC);
CREATE INDEX idx_predicciones_consumo_deteccion_fecha ON predicciones_consumo (id_deteccion, fecha DESC);
CREATE INDEX idx_predicciones_consumo_variables_gin ON predicciones_consumo USING GIN (variables_entrada);
CREATE INDEX idx_recomendaciones_energeticas_deteccion_fecha ON recomendaciones_energeticas (id_deteccion, fecha DESC);
CREATE INDEX idx_recomendaciones_energeticas_pendientes ON recomendaciones_energeticas (tipo_recomendacion, fecha) WHERE aplicada = FALSE;
CREATE INDEX idx_simulaciones_deteccion_fecha ON simulaciones (id_deteccion, fecha DESC);
CREATE INDEX idx_simulaciones_tipo ON simulaciones (tipo_simulacion, fecha DESC);

-- patrones_uso
CREATE INDEX idx_patrones_luminaria ON patrones_uso (id_luminaria, horario_inicio);

-- recomendaciones
CREATE INDEX idx_recomendaciones_luminaria    ON recomendaciones (id_luminaria, fecha_hora DESC);
CREATE INDEX idx_recomendaciones_pendientes   ON recomendaciones (prioridad, fecha_hora) WHERE aplicada = FALSE;

-- consultas
CREATE INDEX idx_consultas_usuario_fecha ON consultas (id_usuario, fecha_hora DESC);
CREATE INDEX idx_consultas_pregunta_trgm ON consultas USING GIN (pregunta gin_trgm_ops);

-- reportes
CREATE INDEX idx_reportes_usuario_fecha ON reportes (id_usuario, fecha_generacion DESC);
CREATE INDEX idx_reportes_tipo          ON reportes (tipo_reporte);

COMMIT;
