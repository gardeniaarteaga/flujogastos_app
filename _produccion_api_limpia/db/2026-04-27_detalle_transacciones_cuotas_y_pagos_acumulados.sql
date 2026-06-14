ALTER TABLE detalle_transacciones
ADD COLUMN IF NOT EXISTS monto_pagado NUMERIC(12,2) NOT NULL DEFAULT 0.00,
ADD COLUMN IF NOT EXISTS numero_cuota INT NOT NULL DEFAULT 1,
ADD COLUMN IF NOT EXISTS total_cuotas INT NOT NULL DEFAULT 1;

UPDATE detalle_transacciones
SET
  monto_pagado = CASE
    WHEN fecha_pago IS NOT NULL THEN monto
    ELSE 0.00
  END,
  numero_cuota = COALESCE(numero_cuota, 1),
  total_cuotas = COALESCE(total_cuotas, 1)
WHERE
  monto_pagado IS NULL
  OR numero_cuota IS NULL
  OR total_cuotas IS NULL
  OR (fecha_pago IS NOT NULL AND monto_pagado = 0.00);
