import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

@Injectable()
export class UsuariosSchemaBootstrapService implements OnModuleInit {
  private ensureSchemaPromise: Promise<void> | null = null;

  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.ensureSchemaReady();
  }

  private async ensureSchemaReady(): Promise<void> {
    if (!this.ensureSchemaPromise) {
      this.ensureSchemaPromise = this.syncLegacySchema().catch((error) => {
        this.ensureSchemaPromise = null;
        throw error;
      });
    }

    await this.ensureSchemaPromise;
  }

  private async syncLegacySchema(): Promise<void> {
    await this.dataSource.query(`
      ALTER TABLE usuarios
      ADD COLUMN IF NOT EXISTS cambiar_password BOOLEAN NOT NULL DEFAULT FALSE
    `);

    await this.dataSource.query(`
      UPDATE usuarios
      SET cambiar_password = FALSE
      WHERE cambiar_password IS NULL
    `);

    await this.dataSource.query(`
      ALTER TABLE usuarios
      ADD COLUMN IF NOT EXISTS fecha_ult_password TIMESTAMP NULL
    `);

    await this.dataSource.query(`
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
    `);

    await this.dataSource.query(`
      ALTER TABLE usuarios
      ADD COLUMN IF NOT EXISTS celular VARCHAR(25)
    `);

    await this.dataSource.query(`
      ALTER TABLE usuarios
      ADD COLUMN IF NOT EXISTS pais VARCHAR(80)
    `);

    await this.dataSource.query(`
      ALTER TABLE usuarios
      ADD COLUMN IF NOT EXISTS codigo_area VARCHAR(10)
    `);

    await this.dataSource.query(`
      ALTER TABLE usuarios
      ADD COLUMN IF NOT EXISTS ciudad VARCHAR(80)
    `);

    await this.dataSource.query(`
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
    `);

    await this.dataSource.query(`
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
    `);

    await this.dataSource.query(`
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
    `);

    await this.dataSource.query(`
      ALTER TABLE participantes
      ADD COLUMN IF NOT EXISTS correo_electronico VARCHAR(255)
    `);

    await this.dataSource.query(`
      ALTER TABLE participantes
      ADD COLUMN IF NOT EXISTS celular VARCHAR(25)
    `);

    await this.dataSource.query(`
      ALTER TABLE participantes
      ADD COLUMN IF NOT EXISTS id_usuario INTEGER
    `);

    await this.dataSource.query(`
      UPDATE participantes
      SET id_usuario = 1
      WHERE id_usuario IS NULL
    `);

    await this.dataSource.query(`
      ALTER TABLE participantes
      ALTER COLUMN id_usuario SET DEFAULT 1
    `);

    await this.dataSource.query(`
      ALTER TABLE participantes
      ALTER COLUMN id_usuario SET NOT NULL
    `);

    await this.dataSource.query(`
      ALTER TABLE participantes
      ADD COLUMN IF NOT EXISTS id_usuario_titular INTEGER
    `);

    await this.dataSource.query(`
      ALTER TABLE participantes
      ADD COLUMN IF NOT EXISTS id_usuario_relacionado INTEGER
    `);

    await this.dataSource.query(`
      UPDATE usuarios AS usuario
      SET celular = participante.celular
      FROM participantes AS participante
      WHERE participante.id_usuario_titular = usuario.id_usuario
        AND participante.celular IS NOT NULL
        AND BTRIM(participante.celular) <> ''
        AND (usuario.celular IS NULL OR BTRIM(usuario.celular) = '')
    `);

    await this.dataSource.query(`
      UPDATE participantes AS participante
      SET correo_electronico = LOWER(usuario.username)
      FROM usuarios AS usuario
      WHERE participante.id_usuario_titular = usuario.id_usuario
        AND usuario.username IS NOT NULL
        AND BTRIM(usuario.username) <> ''
        AND (
          participante.correo_electronico IS NULL
          OR BTRIM(participante.correo_electronico) = ''
        )
    `);

    await this.dataSource.query(`
      UPDATE participantes AS participante
      SET id_usuario_relacionado = usuario.id_usuario
      FROM usuarios AS usuario
      WHERE participante.id_usuario_titular IS NULL
        AND LOWER(COALESCE(participante.correo_electronico, '')) = LOWER(usuario.username)
        AND COALESCE(usuario.estado, 'ACTIVO') = 'ACTIVO'
        AND (
          participante.id_usuario_relacionado IS NULL
          OR participante.id_usuario_relacionado <> usuario.id_usuario
        )
    `);

    await this.dataSource.query(`
      CREATE INDEX IF NOT EXISTS idx_participantes_id_usuario
      ON participantes (id_usuario, id_participante)
    `);

    await this.dataSource.query(`
      CREATE INDEX IF NOT EXISTS idx_participantes_id_usuario_titular
      ON participantes (id_usuario_titular)
    `);
  }
}
