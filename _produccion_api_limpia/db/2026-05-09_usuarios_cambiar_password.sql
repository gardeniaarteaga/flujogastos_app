DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'usuarios'
      AND column_name = 'cambiar_password'
  ) THEN
    ALTER TABLE usuarios
    ADD COLUMN cambiar_password boolean NOT NULL DEFAULT FALSE;
  END IF;
END $$;

UPDATE usuarios
SET cambiar_password = FALSE
WHERE cambiar_password IS NULL;
