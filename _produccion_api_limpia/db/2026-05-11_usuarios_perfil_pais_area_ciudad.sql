DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'usuarios'
      AND column_name = 'pais'
  ) THEN
    ALTER TABLE usuarios
    ADD COLUMN pais varchar(80);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'usuarios'
      AND column_name = 'codigo_area'
  ) THEN
    ALTER TABLE usuarios
    ADD COLUMN codigo_area varchar(10);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'usuarios'
      AND column_name = 'ciudad'
  ) THEN
    ALTER TABLE usuarios
    ADD COLUMN ciudad varchar(80);
  END IF;
END $$;
