DO $$
DECLARE
  duplicate_username text;
BEGIN
  SELECT LOWER(username)
  INTO duplicate_username
  FROM usuarios
  GROUP BY LOWER(username)
  HAVING COUNT(*) > 1
  LIMIT 1;

  IF duplicate_username IS NOT NULL THEN
    RAISE EXCEPTION 'No se puede crear la restriccion unica. Hay usuarios duplicados para: %', duplicate_username;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_usuarios_username_lower
ON usuarios (LOWER(username));
