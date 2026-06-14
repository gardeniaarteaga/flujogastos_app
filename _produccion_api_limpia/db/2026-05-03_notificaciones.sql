CREATE TABLE IF NOT EXISTS notificaciones (
  id_notificacion SERIAL PRIMARY KEY,
  id_usuario_destino INTEGER NOT NULL,
  id_usuario_origen INTEGER NULL,
  id_transaccion INTEGER NULL,
  tipo VARCHAR(50) NOT NULL,
  titulo VARCHAR(160) NOT NULL,
  mensaje VARCHAR(500) NOT NULL,
  leida BOOLEAN NOT NULL DEFAULT FALSE,
  fecha_leida TIMESTAMP NULL,
  fecha_creacion TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_notificaciones_usuario_leida
  ON notificaciones (id_usuario_destino, leida, fecha_creacion DESC);

CREATE INDEX IF NOT EXISTS idx_notificaciones_transaccion_tipo
  ON notificaciones (id_transaccion, tipo);
