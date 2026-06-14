ALTER TABLE participantes
ADD COLUMN IF NOT EXISTS id_usuario integer;

UPDATE participantes
SET id_usuario = 1
WHERE id_usuario IS NULL;

ALTER TABLE participantes
ALTER COLUMN id_usuario SET DEFAULT 1;

ALTER TABLE participantes
ALTER COLUMN id_usuario SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_participantes_id_usuario
ON participantes (id_usuario, id_participante);
