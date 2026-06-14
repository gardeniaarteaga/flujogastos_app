ALTER TABLE detalle_transacciones
ADD COLUMN IF NOT EXISTS id_usuario_relacionado integer;

CREATE INDEX IF NOT EXISTS idx_detalle_transacciones_id_usuario_relacionado
ON detalle_transacciones (id_usuario_relacionado);
