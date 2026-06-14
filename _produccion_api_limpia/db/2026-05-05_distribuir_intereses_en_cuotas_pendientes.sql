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
    total_interes_centavos := transaccion_rec.intereses_centavos;

    SELECT
      COALESCE(
        SUM(
          ROUND(
            GREATEST(dt.monto::numeric - COALESCE(dt.monto_pagado, 0)::numeric, 0) * 100
          )
        ),
        0
      )::bigint,
      COUNT(*)
    INTO total_saldo_centavos, detalle_count
    FROM detalle_transacciones dt
    WHERE dt.id_transaccion = transaccion_rec.id_transaccion
      AND GREATEST(dt.monto::numeric - COALESCE(dt.monto_pagado, 0)::numeric, 0) > 0;

    IF total_saldo_centavos <= 0 OR detalle_count = 0 THEN
      CONTINUE;
    END IF;

    detalle_index := 0;
    interes_acumulado_centavos := 0;

    FOR detalle_rec IN
      SELECT
        dt.id,
        ROUND(dt.monto::numeric * 100)::bigint AS monto_centavos,
        ROUND(
          GREATEST(dt.monto::numeric - COALESCE(dt.monto_pagado, 0)::numeric, 0) * 100
        )::bigint AS saldo_centavos
      FROM detalle_transacciones dt
      WHERE dt.id_transaccion = transaccion_rec.id_transaccion
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
      SET monto = ((detalle_rec.monto_centavos + interes_asignado_centavos)::numeric / 100.0)
      WHERE id = detalle_rec.id;
    END LOOP;
  END LOOP;
END $$;
