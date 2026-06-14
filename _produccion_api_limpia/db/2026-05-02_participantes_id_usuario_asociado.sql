ALTER TABLE participantes
ADD COLUMN IF NOT EXISTS id_usuario_asociado integer;

UPDATE participantes
SET id_usuario_asociado = id_usuario_titular
WHERE id_usuario_asociado IS NULL
  AND id_usuario_titular IS NOT NULL;
