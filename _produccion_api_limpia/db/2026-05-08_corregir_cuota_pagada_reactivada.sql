CREATE TEMP TABLE tmp_transacciones_corregidas AS
SELECT DISTINCT pagada.id_transaccion
FROM detalle_transacciones pagada
JOIN estados_transaccion estado_pagada
  ON estado_pagada.id_estado = pagada.id_estado
WHERE estado_pagada.flag = 'T'
  AND UPPER(estado_pagada.nombre_estado) = 'PAGADO'
  AND COALESCE(pagada.monto_pagado, 0)::numeric > 0
  AND COALESCE(pagada.monto, 0)::numeric > COALESCE(pagada.monto_pagado, 0)::numeric
  AND EXISTS (
    SELECT 1
    FROM detalle_transacciones pendiente
    JOIN estados_transaccion estado_pendiente
      ON estado_pendiente.id_estado = pendiente.id_estado
    WHERE pendiente.id_transaccion = pagada.id_transaccion
      AND pendiente.id_participante = pagada.id_participante
      AND pendiente.id <> pagada.id
      AND estado_pendiente.flag = 'T'
      AND UPPER(estado_pendiente.nombre_estado) IN ('PENDIENTE', 'PAGO PARCIAL')
      AND COALESCE(pendiente.monto, 0)::numeric =
        COALESCE(pagada.monto, 0)::numeric - COALESCE(pagada.monto_pagado, 0)::numeric
  );

UPDATE detalle_transacciones detalle
SET monto = detalle.monto_pagado
FROM estados_transaccion estado_pagada
WHERE estado_pagada.id_estado = detalle.id_estado
  AND detalle.id_transaccion IN (
    SELECT id_transaccion
    FROM tmp_transacciones_corregidas
  )
  AND estado_pagada.flag = 'T'
  AND UPPER(estado_pagada.nombre_estado) = 'PAGADO'
  AND COALESCE(detalle.monto_pagado, 0)::numeric > 0
  AND COALESCE(detalle.monto, 0)::numeric > COALESCE(detalle.monto_pagado, 0)::numeric;

UPDATE transacciones transaccion
SET saldo_pendiente = resumen.saldo_pendiente
FROM (
  SELECT
    detalle.id_transaccion,
    COALESCE(
      SUM(
        GREATEST(
          0,
          COALESCE(detalle.monto, 0)::numeric - COALESCE(detalle.monto_pagado, 0)::numeric
        ) + CASE
          WHEN UPPER(COALESCE(estado.nombre_estado, '')) IN ('PENDIENTE', 'PAGO PARCIAL')
            THEN COALESCE(detalle.interes_pendiente, 0)::numeric
          ELSE 0::numeric
        END
      ),
      0::numeric
    )::numeric(12, 2) AS saldo_pendiente
  FROM detalle_transacciones detalle
  LEFT JOIN estados_transaccion estado
    ON estado.id_estado = detalle.id_estado
  WHERE detalle.id_transaccion IN (
    SELECT id_transaccion
    FROM tmp_transacciones_corregidas
  )
  GROUP BY detalle.id_transaccion
) resumen
WHERE transaccion.id_transaccion = resumen.id_transaccion;

DROP TABLE tmp_transacciones_corregidas;
