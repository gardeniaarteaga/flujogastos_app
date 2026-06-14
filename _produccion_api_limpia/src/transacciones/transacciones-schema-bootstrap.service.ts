import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

@Injectable()
export class TransaccionesSchemaBootstrapService implements OnModuleInit {
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
      ALTER TABLE estados_transaccion
      ADD COLUMN IF NOT EXISTS flag VARCHAR(20)
    `);

    await this.dataSource.query(`
      ALTER TABLE transacciones
      ADD COLUMN IF NOT EXISTS id_estado_registro INTEGER
    `);

    await this.dataSource.query(`
      ALTER TABLE transacciones
      ADD COLUMN IF NOT EXISTS intereses NUMERIC(12, 2) NOT NULL DEFAULT 0.00
    `);

    await this.dataSource.query(`
      ALTER TABLE transacciones
      ADD COLUMN IF NOT EXISTS saldo_pendiente NUMERIC(12, 2) NOT NULL DEFAULT 0.00
    `);

    await this.dataSource.query(`
      ALTER TABLE transacciones
      ADD COLUMN IF NOT EXISTS cuotas_sin_intereses BOOLEAN NOT NULL DEFAULT FALSE
    `);

    await this.dataSource.query(`
      ALTER TABLE transacciones
      ADD COLUMN IF NOT EXISTS fecha_ultimo_pago TIMESTAMP NULL
    `);

    await this.dataSource.query(`
      ALTER TABLE transacciones
      ADD COLUMN IF NOT EXISTS pagocompartido BOOLEAN NOT NULL DEFAULT FALSE
    `);

    await this.dataSource.query(`
      UPDATE transacciones
      SET
        intereses = COALESCE(intereses, 0),
        saldo_pendiente = COALESCE(saldo_pendiente, 0),
        cuotas_sin_intereses = COALESCE(cuotas_sin_intereses, FALSE),
        pagocompartido = COALESCE(pagocompartido, FALSE)
      WHERE intereses IS NULL
         OR saldo_pendiente IS NULL
         OR cuotas_sin_intereses IS NULL
         OR pagocompartido IS NULL
    `);

    await this.dataSource.query(`
      ALTER TABLE detalle_transacciones
      ALTER COLUMN fecha_pago DROP NOT NULL
    `);

    await this.dataSource.query(`
      ALTER TABLE detalle_transacciones
      ADD COLUMN IF NOT EXISTS monto_pagado NUMERIC(12, 2) NOT NULL DEFAULT 0.00
    `);

    await this.dataSource.query(`
      ALTER TABLE detalle_transacciones
      ADD COLUMN IF NOT EXISTS numero_cuota INT NOT NULL DEFAULT 1
    `);

    await this.dataSource.query(`
      ALTER TABLE detalle_transacciones
      ADD COLUMN IF NOT EXISTS total_cuotas INT NOT NULL DEFAULT 1
    `);

    await this.dataSource.query(`
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
         OR (fecha_pago IS NOT NULL AND monto_pagado = 0.00)
    `);

    await this.dataSource.query(`
      ALTER TABLE detalle_transacciones
      ADD COLUMN IF NOT EXISTS id_usuario_relacionado INTEGER
    `);

    await this.dataSource.query(`
      CREATE INDEX IF NOT EXISTS idx_detalle_transacciones_id_usuario_relacionado
      ON detalle_transacciones (id_usuario_relacionado)
    `);

    await this.dataSource.query(`
      ALTER TABLE detalle_transacciones
      ADD COLUMN IF NOT EXISTS fecha_programada DATE NULL
    `);

    await this.dataSource.query(`
      UPDATE detalle_transacciones AS detalle
      SET fecha_programada = transaccion.fecha::date
      FROM transacciones AS transaccion
      WHERE detalle.id_transaccion = transaccion.id_transaccion
        AND detalle.fecha_programada IS NULL
    `);

    await this.dataSource.query(`
      ALTER TABLE detalle_transacciones
      ADD COLUMN IF NOT EXISTS fecha_inicio_interes DATE NULL
    `);

    await this.dataSource.query(`
      ALTER TABLE detalle_transacciones
      ADD COLUMN IF NOT EXISTS interes_acumulado NUMERIC(12, 2) NOT NULL DEFAULT 0.00
    `);

    await this.dataSource.query(`
      ALTER TABLE detalle_transacciones
      ADD COLUMN IF NOT EXISTS interes_pagado NUMERIC(12, 2) NOT NULL DEFAULT 0.00
    `);

    await this.dataSource.query(`
      ALTER TABLE detalle_transacciones
      ADD COLUMN IF NOT EXISTS interes_pendiente NUMERIC(12, 2) NOT NULL DEFAULT 0.00
    `);

    await this.dataSource.query(`
      ALTER TABLE detalle_transacciones
      ADD COLUMN IF NOT EXISTS fecha_ultimo_calculo DATE NULL
    `);

    await this.dataSource.query(`
      ALTER TABLE detalle_transacciones
      ADD COLUMN IF NOT EXISTS dias_interes INT NOT NULL DEFAULT 0
    `);

    await this.dataSource.query(`
      UPDATE detalle_transacciones
      SET
        interes_acumulado = COALESCE(interes_acumulado, 0),
        interes_pagado = COALESCE(interes_pagado, 0),
        interes_pendiente = COALESCE(interes_pendiente, 0),
        dias_interes = COALESCE(dias_interes, 0)
      WHERE interes_acumulado IS NULL
         OR interes_pagado IS NULL
         OR interes_pendiente IS NULL
         OR dias_interes IS NULL
    `);

    await this.dataSource.query(`
      UPDATE detalle_transacciones AS detalle
      SET id_usuario_relacionado = participante.id_usuario_relacionado
      FROM participantes AS participante
      WHERE detalle.id_participante = participante.id_participante
        AND detalle.id_usuario_relacionado IS NULL
        AND participante.id_usuario_relacionado IS NOT NULL
    `);
  }
}
