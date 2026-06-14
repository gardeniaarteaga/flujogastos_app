ALTER TABLE estados_transaccion
ADD COLUMN IF NOT EXISTS flag VARCHAR(20);

ALTER TABLE detalle_transacciones
ALTER COLUMN fecha_pago DROP NOT NULL;
