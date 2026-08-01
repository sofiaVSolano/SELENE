-- =====================================================================
-- Migracion incremental: clave_reporte en reportes
-- =====================================================================
-- `tipo_reporte_enum` (consumo/ocupacion/patrones/alertas/general) es una
-- categoria amplia. `backend/api/assistant/report_types.py` introduce un
-- catalogo mas especifico (consumo_diario, consumo_mensual, plan_ahorro,
-- general) que el usuario elige/recibe sugerido segun la conversacion con
-- el asistente; se guarda aqui para que el frontend pueda mostrar/filtrar
-- por el tipo exacto sin tener que ampliar el ENUM de Postgres.
--
-- Uso (con DATABASE_URL apuntando a la base ya inicializada):
--   psql "$DATABASE_URL" -f database/migrations/0003_clave_reporte.sql
-- =====================================================================

BEGIN;

ALTER TABLE reportes
    ADD COLUMN IF NOT EXISTS clave_reporte VARCHAR(30);

COMMENT ON COLUMN reportes.clave_reporte IS
    'Clave especifica del catalogo de report_types.py (p. ej. consumo_diario, plan_ahorro). NULL para reportes generados antes de este cambio.';

COMMIT;
