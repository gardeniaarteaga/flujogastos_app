ALTER TABLE participantes
ADD COLUMN IF NOT EXISTS correo_electronico VARCHAR(255),
ADD COLUMN IF NOT EXISTS celular VARCHAR(25);

UPDATE participantes AS participante
SET correo_electronico = LOWER(usuario.username)
FROM usuarios AS usuario
WHERE participante.id_usuario_titular = usuario.id_usuario
  AND (
    participante.correo_electronico IS NULL
    OR BTRIM(participante.correo_electronico) = ''
  );
