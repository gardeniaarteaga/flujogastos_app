ALTER TABLE detalle_transacciones
ADD COLUMN IF NOT EXISTS interes_acumulado NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
ADD COLUMN IF NOT EXISTS interes_pagado NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
ADD COLUMN IF NOT EXISTS interes_pendiente NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
ADD COLUMN IF NOT EXISTS fecha_ultimo_calculo DATE NULL;

UPDATE detalle_transacciones
SET
  interes_acumulado = COALESCE(interes_acumulado, 0),
  interes_pagado = COALESCE(interes_pagado, 0),
  interes_pendiente = COALESCE(interes_pendiente, 0)
WHERE interes_acumulado IS NULL
   OR interes_pagado IS NULL
   OR interes_pendiente IS NULL;

DO $$
DECLARE
  transaccion_rec RECORD;
  detalle_rec RECORD;
  total_saldo_centavos BIGINT;
  total_interes_centavos BIGINT;
  detalle_count INT;
  detalle_index INT;
  interes_asignado_centavos BIGINT;
  interes_acumulado_centavos BIGINT;
BEGIN
  FOR transaccion_rec IN
    SELECT
      t.id_transaccion,
      ROUND(COALESCE(t.intereses, 0)::numeric * 100)::bigint AS intereses_centavos
    FROM transacciones t
    WHERE COALESCE(t.intereses, 0) > 0
  LOOP
    SELECT COUNT(*)
    INTO detalle_count
    FROM detalle_transacciones dt
    WHERE dt.id_transaccion = transaccion_rec.id_transaccion
      AND COALESCE(dt.interes_acumulado, 0) = 0
      AND COALESCE(dt.interes_pendiente, 0) = 0
      AND GREATEST(dt.monto::numeric - COALESCE(dt.monto_pagado, 0)::numeric, 0) > 0;

    IF detalle_count = 0 THEN
      CONTINUE;
    END IF;

    total_interes_centavos := transaccion_rec.intereses_centavos;

    SELECT
      COALESCE(
        SUM(
          ROUND(
            GREATEST(dt.monto::numeric - COALESCE(dt.monto_pagado, 0)::numeric, 0) * 100
          )
        ),
        0
      )::bigint
    INTO total_saldo_centavos
    FROM detalle_transacciones dt
    WHERE dt.id_transaccion = transaccion_rec.id_transaccion
      AND COALESCE(dt.interes_acumulado, 0) = 0
      AND COALESCE(dt.interes_pendiente, 0) = 0
      AND GREATEST(dt.monto::numeric - COALESCE(dt.monto_pagado, 0)::numeric, 0) > 0;

    IF total_saldo_centavos <= 0 THEN
      CONTINUE;
    END IF;

    detalle_index := 0;
    interes_acumulado_centavos := 0;

    FOR detalle_rec IN
      SELECT
        dt.id,
        ROUND(
          GREATEST(dt.monto::numeric - COALESCE(dt.monto_pagado, 0)::numeric, 0) * 100
        )::bigint AS saldo_centavos
      FROM detalle_transacciones dt
      WHERE dt.id_transaccion = transaccion_rec.id_transaccion
        AND COALESCE(dt.interes_acumulado, 0) = 0
        AND COALESCE(dt.interes_pendiente, 0) = 0
        AND GREATEST(dt.monto::numeric - COALESCE(dt.monto_pagado, 0)::numeric, 0) > 0
      ORDER BY dt.id
    LOOP
      detalle_index := detalle_index + 1;

      IF detalle_index < detalle_count THEN
        interes_asignado_centavos := FLOOR(
          (total_interes_centavos::numeric * detalle_rec.saldo_centavos::numeric) /
          total_saldo_centavos::numeric
        )::bigint;
      ELSE
        interes_asignado_centavos := total_interes_centavos - interes_acumulado_centavos;
      END IF;

      interes_acumulado_centavos := interes_acumulado_centavos + interes_asignado_centavos;

      UPDATE detalle_transacciones
      SET
        interes_acumulado = (interes_asignado_centavos::numeric / 100.0),
        interes_pendiente = (interes_asignado_centavos::numeric / 100.0)
      WHERE id = detalle_rec.id;
    END LOOP;
  END LOOP;
END $$;

UPDATE transacciones t
SET intereses = COALESCE(resumen.total_interes_pendiente, 0)
FROM (
  SELECT
    dt.id_transaccion,
    COALESCE(SUM(COALESCE(dt.interes_pendiente, 0)::numeric), 0)::numeric(12, 2) AS total_interes_pendiente
  FROM detalle_transacciones dt
  GROUP BY dt.id_transaccion
) resumen
WHERE t.id_transaccion = resumen.id_transaccion;
