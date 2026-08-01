-- =====================================================================
-- Migracion incremental: tipo_espacio en zonas + tabla consumo_energetico
-- =====================================================================
-- `tipo_espacio` es el campo que backend/api/energy/feature_mapping.py
-- necesita para armar EscenarioVision.tipo_espacio (mezcla de sector del
-- modelo LightGBM, ver mapeo_tipo_espacio en configs/energy_context.yaml).
-- La camara no puede inferir "que tipo de espacio es este" de forma
-- confiable (esta fuera del alcance de los detectores entrenados), asi que
-- se declara una sola vez por zona al crearla.
--
-- `consumo_energetico` (ciclos encendido/apagado reales por luminaria, ver
-- database/schema.sql seccion 7) ya existia en el esquema pero nunca tuvo
-- un modelo ORM (backend/api/models.py) ni nada que escribiera en ella;
-- este archivo no crea la tabla (ya existe si se corrio schema.sql), solo
-- documenta que esta migracion asume que existe.
--
-- Uso (con DATABASE_URL apuntando a la base ya inicializada):
--   psql "$DATABASE_URL" -f database/migrations/0002_tipo_espacio_zona.sql
-- =====================================================================

BEGIN;

ALTER TABLE zonas
    ADD COLUMN IF NOT EXISTS tipo_espacio VARCHAR(20) NOT NULL DEFAULT 'oficina';

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'chk_zonas_tipo_espacio'
    ) THEN
        ALTER TABLE zonas
            ADD CONSTRAINT chk_zonas_tipo_espacio
            CHECK (tipo_espacio IN ('comedor', 'salon', 'laboratorio', 'auditorio', 'oficina'));
    END IF;
END $$;

COMMENT ON COLUMN zonas.tipo_espacio IS
    'Mezcla de sector que usa el modelo LightGBM (ver mapeo_tipo_espacio en configs/energy_context.yaml). No lo infiere la vision por computador: se declara al crear la zona.';

COMMIT;
