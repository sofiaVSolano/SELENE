-- =====================================================================
-- Migracion incremental: modulo de prediccion energetica
-- =====================================================================
-- `backend/scripts/init_db.py` ejecuta TODO `database/schema.sql` dentro de
-- un unico BEGIN/COMMIT; si la base de datos ya estaba inicializada, el
-- primer "CREATE TYPE ya existe" aborta la transaccion completa antes de
-- llegar a las tablas nuevas (comportamiento documentado en ese script). Este
-- archivo aplica SOLO lo nuevo del modulo energetico (backend/api/energy/) y
-- es seguro de re-ejecutar (CREATE ... IF NOT EXISTS).
--
-- Uso (con DATABASE_URL apuntando a la base ya inicializada):
--   psql "$DATABASE_URL" -f database/migrations/0001_modulo_energetico.sql
--
-- Ver database/schema.sql (seccion "7.1. MODULO DE PREDICCION ENERGETICA")
-- para el detalle/justificacion de cada tabla; este archivo debe mantenerse
-- en sincronia con esa seccion.
-- =====================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS consumo_energetico_estimado (
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

CREATE TABLE IF NOT EXISTS predicciones_consumo (
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

CREATE TABLE IF NOT EXISTS recomendaciones_energeticas (
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

CREATE TABLE IF NOT EXISTS simulaciones (
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

CREATE INDEX IF NOT EXISTS idx_consumo_estimado_deteccion_fecha ON consumo_energetico_estimado (id_deteccion, fecha DESC);
CREATE INDEX IF NOT EXISTS idx_predicciones_consumo_deteccion_fecha ON predicciones_consumo (id_deteccion, fecha DESC);
CREATE INDEX IF NOT EXISTS idx_predicciones_consumo_variables_gin ON predicciones_consumo USING GIN (variables_entrada);
CREATE INDEX IF NOT EXISTS idx_recomendaciones_energeticas_deteccion_fecha ON recomendaciones_energeticas (id_deteccion, fecha DESC);
CREATE INDEX IF NOT EXISTS idx_recomendaciones_energeticas_pendientes ON recomendaciones_energeticas (tipo_recomendacion, fecha) WHERE aplicada = FALSE;
CREATE INDEX IF NOT EXISTS idx_simulaciones_deteccion_fecha ON simulaciones (id_deteccion, fecha DESC);
CREATE INDEX IF NOT EXISTS idx_simulaciones_tipo ON simulaciones (tipo_simulacion, fecha DESC);

COMMIT;
