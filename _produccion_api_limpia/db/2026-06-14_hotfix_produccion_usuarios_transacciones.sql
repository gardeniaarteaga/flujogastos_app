-- Hotfix idempotente para produccion.
-- Cubre el desfase de esquema que puede provocar 500 en:
-- GET /api/transacciones?id_usuario=...

BEGIN;

-- =========================
-- catalogos usados por transacciones
-- =========================

ALTER TABLE categorias
ADD COLUMN IF NOT EXISTS id_usuario INTEGER;

UPDATE categorias
SET id_usuario = 1
WHERE id_usuario IS NULL;

ALTER TABLE subcategorias
ADD COLUMN IF NOT EXISTS id_usuario INTEGER;

UPDATE subcategorias
SET id_usuario = 1
WHERE id_usuario IS NULL;

ALTER TABLE tipo_entidad
ADD COLUMN IF NOT EXISTS id_usuario INTEGER;

UPDATE tipo_entidad
SET id_usuario = 1
WHERE id_usuario IS NULL;

ALTER TABLE tipo_producto
ADD COLUMN IF NOT EXISTS id_usuario INTEGER;

UPDATE tipo_producto
SET id_usuario = 1
WHERE id_usuario IS NULL;

ALTER TABLE tipo_producto
ADD COLUMN IF NOT EXISTS pago_inmediato BOOLEAN DEFAULT TRUE;

UPDATE tipo_producto
SET pago_inmediato = COALESCE(pago_inmediato, TRUE)
WHERE pago_inmediato IS NULL;

ALTER TABLE entidades_financieras
ADD COLUMN IF NOT EXISTS id_usuario INTEGER;

UPDATE entidades_financieras
SET id_usuario = 1
WHERE id_usuario IS NULL;

ALTER TABLE entidades_financieras
ADD COLUMN IF NOT EXISTS pais VARCHAR(100);

ALTER TABLE entidades_financieras
ADD COLUMN IF NOT EXISTS sitio_web VARCHAR(200);

ALTER TABLE entidades_financieras
ADD COLUMN IF NOT EXISTS telefono_contacto VARCHAR(50);

ALTER TABLE metodos_pago
ADD COLUMN IF NOT EXISTS id_usuario INTEGER;

UPDATE metodos_pago
SET id_usuario = 1
WHERE id_usuario IS NULL;

ALTER TABLE metodos_pago
ADD COLUMN IF NOT EXISTS tasa_anual NUMERIC(10, 2);

ALTER TABLE metodos_pago
ADD COLUMN IF NOT EXISTS calcula_interes BOOLEAN DEFAULT FALSE;

ALTER TABLE metodos_pago
ADD COLUMN IF NOT EXISTS recibe_estado_cuenta BOOLEAN DEFAULT FALSE;

ALTER TABLE metodos_pago
ADD COLUMN IF NOT EXISTS aplica_membresia BOOLEAN DEFAULT FALSE;

ALTER TABLE metodos_pago
ADD COLUMN IF NOT EXISTS mes_pago_membresia INTEGER;

ALTER TABLE metodos_pago
ADD COLUMN IF NOT EXISTS dia_corte INTEGER;

ALTER TABLE metodos_pago
ADD COLUMN IF NOT EXISTS dia_ultimo_pago INTEGER;

ALTER TABLE metodos_pago
ADD COLUMN IF NOT EXISTS dias_gracia INTEGER;

UPDATE metodos_pago
SET
  calcula_interes = COALESCE(calcula_interes, FALSE),
  recibe_estado_cuenta = COALESCE(recibe_estado_cuenta, FALSE),
  aplica_membresia = COALESCE(aplica_membresia, FALSE)
WHERE calcula_interes IS NULL
   OR recibe_estado_cuenta IS NULL
   OR aplica_membresia IS NULL;

-- =========================
-- usuarios
-- =========================

ALTER TABLE usuarios
ADD COLUMN IF NOT EXISTS cambiar_password BOOLEAN NOT NULL DEFAULT FALSE;

UPDATE usuarios
SET cambiar_password = FALSE
WHERE cambiar_password IS NULL;

ALTER TABLE usuarios
ADD COLUMN IF NOT EXISTS fecha_ult_password TIMESTAMP NULL;

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

ALTER TABLE usuarios
ADD COLUMN IF NOT EXISTS pais VARCHAR(80);

ALTER TABLE usuarios
ADD COLUMN IF NOT EXISTS codigo_area VARCHAR(10);

ALTER TABLE usuarios
ADD COLUMN IF NOT EXISTS ciudad VARCHAR(80);

-- =========================
-- participantes
-- =========================

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

ALTER TABLE participantes
ADD COLUMN IF NOT EXISTS correo_electronico VARCHAR(255);

ALTER TABLE participantes
ADD COLUMN IF NOT EXISTS celular VARCHAR(25);

ALTER TABLE participantes
ADD COLUMN IF NOT EXISTS id_usuario INTEGER;

UPDATE participantes
SET id_usuario = 1
WHERE id_usuario IS NULL;

ALTER TABLE participantes
ALTER COLUMN id_usuario SET DEFAULT 1;

ALTER TABLE participantes
ALTER COLUMN id_usuario SET NOT NULL;

ALTER TABLE participantes
ADD COLUMN IF NOT EXISTS id_usuario_titular INTEGER;

ALTER TABLE participantes
ADD COLUMN IF NOT EXISTS id_usuario_relacionado INTEGER;

UPDATE usuarios AS usuario
SET celular = participante.celular
FROM participantes AS participante
WHERE participante.id_usuario_titular = usuario.id_usuario
  AND participante.celular IS NOT NULL
  AND BTRIM(participante.celular) <> ''
  AND (usuario.celular IS NULL OR BTRIM(usuario.celular) = '');

UPDATE participantes AS participante
SET correo_electronico = LOWER(usuario.username)
FROM usuarios AS usuario
WHERE participante.id_usuario_titular = usuario.id_usuario
  AND usuario.username IS NOT NULL
  AND BTRIM(usuario.username) <> ''
  AND (
    participante.correo_electronico IS NULL
    OR BTRIM(participante.correo_electronico) = ''
  );

UPDATE participantes AS participante
SET id_usuario_relacionado = usuario.id_usuario
FROM usuarios AS usuario
WHERE participante.id_usuario_titular IS NULL
  AND LOWER(COALESCE(participante.correo_electronico, '')) = LOWER(usuario.username)
  AND COALESCE(usuario.estado, 'ACTIVO') = 'ACTIVO'
  AND (
    participante.id_usuario_relacionado IS NULL
    OR participante.id_usuario_relacionado <> usuario.id_usuario
  );

CREATE INDEX IF NOT EXISTS idx_participantes_id_usuario
ON participantes (id_usuario, id_participante);

CREATE INDEX IF NOT EXISTS idx_participantes_id_usuario_titular
ON participantes (id_usuario_titular);

-- =========================
-- estados_transaccion
-- =========================

ALTER TABLE estados_transaccion
ADD COLUMN IF NOT EXISTS flag VARCHAR(20);

-- Ajuste conservador de flags si estan vacios.
UPDATE estados_transaccion
SET flag = 'T'
WHERE COALESCE(flag, '') = ''
  AND UPPER(COALESCE(nombre_estado, '')) IN ('PENDIENTE', 'PAGO PARCIAL', 'PAGADO', 'ANULADO');

UPDATE estados_transaccion
SET flag = 'R'
WHERE COALESCE(flag, '') = ''
  AND UPPER(COALESCE(nombre_estado, '')) IN ('COMPLETADO');

-- =========================
-- transacciones
-- =========================

ALTER TABLE transacciones
ADD COLUMN IF NOT EXISTS id_estado_registro INTEGER;

ALTER TABLE transacciones
ADD COLUMN IF NOT EXISTS intereses NUMERIC(12, 2) NOT NULL DEFAULT 0.00;

ALTER TABLE transacciones
ADD COLUMN IF NOT EXISTS saldo_pendiente NUMERIC(12, 2) NOT NULL DEFAULT 0.00;

ALTER TABLE transacciones
ADD COLUMN IF NOT EXISTS cuotas_sin_intereses BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE transacciones
ADD COLUMN IF NOT EXISTS fecha_ultimo_pago TIMESTAMP NULL;

ALTER TABLE transacciones
ADD COLUMN IF NOT EXISTS pagocompartido BOOLEAN NOT NULL DEFAULT FALSE;

UPDATE transacciones
SET
  intereses = COALESCE(intereses, 0),
  saldo_pendiente = COALESCE(saldo_pendiente, 0),
  cuotas_sin_intereses = COALESCE(cuotas_sin_intereses, FALSE),
  pagocompartido = COALESCE(pagocompartido, FALSE)
WHERE intereses IS NULL
   OR saldo_pendiente IS NULL
   OR cuotas_sin_intereses IS NULL
   OR pagocompartido IS NULL;

UPDATE transacciones
SET saldo_pendiente = COALESCE(monto, 0)
WHERE COALESCE(saldo_pendiente, 0) = 0;

-- =========================
-- detalle_transacciones
-- =========================

ALTER TABLE detalle_transacciones
ALTER COLUMN fecha_pago DROP NOT NULL;

ALTER TABLE detalle_transacciones
ADD COLUMN IF NOT EXISTS monto_pagado NUMERIC(12, 2) NOT NULL DEFAULT 0.00;

ALTER TABLE detalle_transacciones
ADD COLUMN IF NOT EXISTS numero_cuota INT NOT NULL DEFAULT 1;

ALTER TABLE detalle_transacciones
ADD COLUMN IF NOT EXISTS total_cuotas INT NOT NULL DEFAULT 1;

UPDATE detalle_transacciones
SET
  monto_pagado = CASE
    WHEN fecha_pago IS NOT NULL THEN monto
    ELSE COALESCE(monto_pagado, 0.00)
  END,
  numero_cuota = COALESCE(numero_cuota, 1),
  total_cuotas = COALESCE(total_cuotas, 1)
WHERE monto_pagado IS NULL
   OR numero_cuota IS NULL
   OR total_cuotas IS NULL
   OR (fecha_pago IS NOT NULL AND monto_pagado = 0.00);

ALTER TABLE detalle_transacciones
ADD COLUMN IF NOT EXISTS id_usuario_relacionado INTEGER;

CREATE INDEX IF NOT EXISTS idx_detalle_transacciones_id_usuario_relacionado
ON detalle_transacciones (id_usuario_relacionado);

ALTER TABLE detalle_transacciones
ADD COLUMN IF NOT EXISTS fecha_programada DATE NULL;

UPDATE detalle_transacciones AS detalle
SET fecha_programada = transaccion.fecha::date
FROM transacciones AS transaccion
WHERE detalle.id_transaccion = transaccion.id_transaccion
  AND detalle.fecha_programada IS NULL;

ALTER TABLE detalle_transacciones
ADD COLUMN IF NOT EXISTS fecha_inicio_interes DATE NULL;

ALTER TABLE detalle_transacciones
ADD COLUMN IF NOT EXISTS interes_acumulado NUMERIC(12, 2) NOT NULL DEFAULT 0.00;

ALTER TABLE detalle_transacciones
ADD COLUMN IF NOT EXISTS interes_pagado NUMERIC(12, 2) NOT NULL DEFAULT 0.00;

ALTER TABLE detalle_transacciones
ADD COLUMN IF NOT EXISTS interes_pendiente NUMERIC(12, 2) NOT NULL DEFAULT 0.00;

ALTER TABLE detalle_transacciones
ADD COLUMN IF NOT EXISTS fecha_ultimo_calculo DATE NULL;

ALTER TABLE detalle_transacciones
ADD COLUMN IF NOT EXISTS dias_interes INT NOT NULL DEFAULT 0;

UPDATE detalle_transacciones
SET
  interes_acumulado = COALESCE(interes_acumulado, 0),
  interes_pagado = COALESCE(interes_pagado, 0),
  interes_pendiente = COALESCE(interes_pendiente, 0),
  dias_interes = COALESCE(dias_interes, 0)
WHERE interes_acumulado IS NULL
   OR interes_pagado IS NULL
   OR interes_pendiente IS NULL
   OR dias_interes IS NULL;

UPDATE detalle_transacciones AS detalle
SET id_usuario_relacionado = participante.id_usuario_relacionado
FROM participantes AS participante
WHERE detalle.id_participante = participante.id_participante
  AND detalle.id_usuario_relacionado IS NULL
  AND participante.id_usuario_relacionado IS NOT NULL;

COMMIT;
