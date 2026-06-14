WITH recalculo AS (
  SELECT
    dt.id,
    ROUND(
      (
        (COALESCE(mp.tasa_anual, 0)::numeric / 100.0) / 365.0
      ) * GREATEST(
        COALESCE(dt.monto, 0)::numeric - COALESCE(dt.monto_pagado, 0)::numeric,
        0
      ) * GREATEST(
        (dt.fecha_ultimo_calculo - dt.fecha_inicio_interes) + 1,
        0
      ),
      2
    ) AS interes_acumulado_corregido
  FROM detalle_transacciones dt
  INNER JOIN metodos_pago mp
    ON mp.id_metodo = dt.id_metodo_pago
  WHERE dt.fecha_inicio_interes IS NOT NULL
    AND dt.fecha_ultimo_calculo IS NOT NULL
    AND COALESCE(mp.calcula_interes, false) = true
    AND COALESCE(mp.tasa_anual, 0) > 0
    AND COALESCE(dt.monto_pagado, 0)::numeric = 0
    AND COALESCE(dt.interes_pagado, 0)::numeric = 0
)
UPDATE detalle_transacciones dt
SET
  interes_acumulado = recalculo.interes_acumulado_corregido,
  interes_pendiente = recalculo.interes_acumulado_corregido
FROM recalculo
WHERE dt.id = recalculo.id
  AND (
    COALESCE(dt.interes_acumulado, 0)::numeric <> recalculo.interes_acumulado_corregido
    OR COALESCE(dt.interes_pendiente, 0)::numeric <> recalculo.interes_acumulado_corregido
  );

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
