DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'participantes'
      AND column_name = 'id_usuario_vinculado'
  ) AND NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'participantes'
      AND column_name = 'id_usuario_titular'
  ) THEN
    ALTER TABLE participantes
    RENAME COLUMN id_usuario_vinculado TO id_usuario_titular;
  END IF;
END $$;

ALTER TABLE participantes
ADD COLUMN IF NOT EXISTS id_usuario_titular integer;

CREATE INDEX IF NOT EXISTS idx_participantes_id_usuario_titular
ON participantes (id_usuario_titular);
