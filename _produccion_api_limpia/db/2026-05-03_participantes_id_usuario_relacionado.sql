DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'participantes'
      AND column_name = 'id_usuario_asociado'
  ) AND NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'participantes'
      AND column_name = 'id_usuario_relacionado'
  ) THEN
    ALTER TABLE participantes
    RENAME COLUMN id_usuario_asociado TO id_usuario_relacionado;
  END IF;
END $$;

ALTER TABLE participantes
ADD COLUMN IF NOT EXISTS id_usuario_relacionado integer;

UPDATE participantes
SET id_usuario_relacionado = NULL;

UPDATE participantes p
SET id_usuario_relacionado = u.id_usuario
FROM usuarios u
WHERE p.id_usuario_titular IS NULL
  AND LOWER(COALESCE(p.correo_electronico, '')) = LOWER(u.username)
  AND COALESCE(u.estado, 'ACTIVO') = 'ACTIVO';
