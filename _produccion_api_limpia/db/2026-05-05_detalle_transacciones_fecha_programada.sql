ALTER TABLE detalle_transacciones
ADD COLUMN IF NOT EXISTS fecha_programada DATE NULL;
