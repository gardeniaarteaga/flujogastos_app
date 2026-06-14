ALTER TABLE participantes
ADD COLUMN IF NOT EXISTS celular VARCHAR(25);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'participantes'
      AND column_name = 'celular'
      AND udt_name <> 'varchar'
  ) THEN
    ALTER TABLE participantes
    ALTER COLUMN celular TYPE VARCHAR(25)
    USING CASE
      WHEN celular IS NULL THEN NULL
      ELSE celular::text
    END;
  END IF;
END $$;
