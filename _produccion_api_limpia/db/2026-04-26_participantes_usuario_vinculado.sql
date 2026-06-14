ALTER TABLE participantes
ADD COLUMN IF NOT EXISTS id_usuario_titular integer;

ALTER TABLE participantes
ADD COLUMN IF NOT EXISTS bloqueado_eliminacion boolean;

UPDATE participantes
SET bloqueado_eliminacion = false
WHERE bloqueado_eliminacion IS NULL;

ALTER TABLE participantes
ALTER COLUMN bloqueado_eliminacion SET DEFAULT false;

ALTER TABLE participantes
ALTER COLUMN bloqueado_eliminacion SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_participantes_id_usuario_titular
ON participantes (id_usuario_titular);
