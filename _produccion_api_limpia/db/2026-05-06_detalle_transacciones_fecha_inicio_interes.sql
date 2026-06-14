ALTER TABLE detalle_transacciones
ADD COLUMN IF NOT EXISTS fecha_inicio_interes DATE NULL;

UPDATE detalle_transacciones dt
SET fecha_inicio_interes = (t.fecha::date + COALESCE(mp.dias_gracia, 0))::date
FROM transacciones t
LEFT JOIN metodos_pago mp
  ON mp.id_metodo = t.id_metodo_pago
WHERE dt.id_transaccion = t.id_transaccion
  AND dt.fecha_inicio_interes IS NULL;
