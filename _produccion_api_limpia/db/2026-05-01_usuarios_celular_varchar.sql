DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'usuarios'
      AND column_name = 'celular'
      AND udt_name <> 'varchar'
  ) THEN
    ALTER TABLE usuarios
    ALTER COLUMN celular TYPE VARCHAR(25)
    USING CASE
      WHEN celular IS NULL THEN NULL
      ELSE celular::text
    END;
  END IF;
END $$;

ALTER TABLE usuarios
ADD COLUMN IF NOT EXISTS celular VARCHAR(25);

UPDATE usuarios AS usuario
SET celular = participante.celular
FROM participantes AS participante
WHERE participante.id_usuario_titular = usuario.id_usuario
  AND participante.celular IS NOT NULL
  AND BTRIM(participante.celular) <> ''
  AND (usuario.celular IS NULL OR BTRIM(usuario.celular) = '');
