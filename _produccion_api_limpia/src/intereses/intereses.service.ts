import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';

export type CalculoInteresesOrigen = 'manual' | 'scheduler';

export interface CalculoInteresesResult {
  fecha_calculo: string;
  origen: CalculoInteresesOrigen;
  registros_procesados: number;
  total_intereses_generados: number;
}

type RawCalculoInteresesRow = {
  fecha_calculo: string;
  registros_procesados: string | number;
  total_intereses_generados: string | number | null;
};

@Injectable()
export class InteresesService {
  private static readonly BUSINESS_TIME_ZONE = 'America/El_Salvador';

  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  async calculateDailyIntereses(
    origen: CalculoInteresesOrigen = 'manual',
  ): Promise<CalculoInteresesResult> {
    return this.dataSource.transaction(async (manager) => {
      const calculationSummary = await this.calculateDetalleIntereses(manager);

      await this.syncTransaccionesIntereses(manager);

      return {
        fecha_calculo: calculationSummary.fecha_calculo,
        origen,
        registros_procesados: calculationSummary.registros_procesados,
        total_intereses_generados: calculationSummary.total_intereses_generados,
      };
    });
  }

  private async calculateDetalleIntereses(
    manager: EntityManager,
  ): Promise<Omit<CalculoInteresesResult, 'origen'>> {
    const [result] = await manager.query(
      `
        WITH parametros AS (
          SELECT
            ((NOW() AT TIME ZONE $1)::date - INTERVAL '1 day')::date AS fecha_calculo,
            (NOW() AT TIME ZONE $1)::date AS fecha_actual
        ),
        detalles_base AS (
          SELECT
            dt.id,
            dt.fecha_inicio_interes,
            COALESCE(dt.dias_interes, 0) AS dias_interes_actual,
            COALESCE(dt.interes_acumulado, 0)::numeric AS interes_acumulado_actual,
            (
              (COALESCE(mp.tasa_anual, 0)::numeric / 100.0) / 365.0
            ) * GREATEST(
              COALESCE(dt.monto, 0)::numeric - COALESCE(dt.monto_pagado, 0)::numeric,
              0
            ) AS interes_diario_exacto
          FROM detalle_transacciones dt
          INNER JOIN transacciones t
            ON t.id_transaccion = dt.id_transaccion
          INNER JOIN categorias c
            ON c.id_categoria = t.id_categoria
          INNER JOIN estados_transaccion et
            ON et.id_estado = t.id_estado
          INNER JOIN metodos_pago mp
            ON mp.id_metodo = dt.id_metodo_pago
          WHERE et.flag = 'T'
            AND UPPER(COALESCE(et.estado, '')) = 'ACTIVO'
            AND UPPER(COALESCE(et.nombre_estado, '')) <> 'ANULADO'
            AND UPPER(COALESCE(c.nombre_categoria, '')) <> 'INGRESOS'
            AND COALESCE(mp.calcula_interes, false) = true
            AND COALESCE(mp.tasa_anual, 0) > 0
            AND dt.fecha_inicio_interes IS NOT NULL
            AND GREATEST(
              COALESCE(dt.monto, 0)::numeric - COALESCE(dt.monto_pagado, 0)::numeric,
              0
            ) > 0
        ),
        detalles_objetivo AS (
          SELECT
            db.id,
            CASE
              WHEN p.fecha_actual < db.fecha_inicio_interes
                OR p.fecha_calculo < db.fecha_inicio_interes
              THEN 0
              ELSE ((p.fecha_calculo - db.fecha_inicio_interes) + 1)
            END::int AS dias_a_calcular,
            CASE
              WHEN p.fecha_actual < db.fecha_inicio_interes
                OR p.fecha_calculo < db.fecha_inicio_interes
              THEN 0
              ELSE ((p.fecha_calculo - db.fecha_inicio_interes) + 1)
            END::int AS dias_interes,
            db.dias_interes_actual,
            ROUND(
              db.interes_diario_exacto * CASE
                WHEN p.fecha_actual < db.fecha_inicio_interes
                  OR p.fecha_calculo < db.fecha_inicio_interes
                THEN 0
                ELSE ((p.fecha_calculo - db.fecha_inicio_interes) + 1)
              END,
              2
            ) AS interes_acumulado_objetivo,
            GREATEST(
              ROUND(
                db.interes_diario_exacto * CASE
                  WHEN p.fecha_actual < db.fecha_inicio_interes
                    OR p.fecha_calculo < db.fecha_inicio_interes
                  THEN 0
                  ELSE ((p.fecha_calculo - db.fecha_inicio_interes) + 1)
                END,
                2
              ) - db.interes_acumulado_actual,
              0
            ) AS interes_generado_total
          FROM detalles_base db
          CROSS JOIN parametros p
        ),
        actualizados AS (
          UPDATE detalle_transacciones dt
          SET
            dias_interes = objetivo.dias_interes,
            interes_acumulado = objetivo.interes_acumulado_objetivo,
            fecha_ultimo_calculo =
              CASE
                WHEN objetivo.dias_interes > 0 THEN p.fecha_calculo
                ELSE dt.fecha_ultimo_calculo
              END,
            interes_pendiente = GREATEST(
              objetivo.interes_acumulado_objetivo - COALESCE(dt.interes_pagado, 0)::numeric,
              0
            )
          FROM detalles_objetivo objetivo
          CROSS JOIN parametros p
          WHERE dt.id = objetivo.id
            AND (
              COALESCE(dt.dias_interes, 0) <> objetivo.dias_interes
              OR COALESCE(dt.interes_acumulado, 0)::numeric <> objetivo.interes_acumulado_objetivo
              OR COALESCE(dt.interes_pendiente, 0)::numeric <> GREATEST(
                objetivo.interes_acumulado_objetivo - COALESCE(dt.interes_pagado, 0)::numeric,
                0
              )
            )
          RETURNING objetivo.interes_generado_total
        )
        SELECT
          p.fecha_calculo::text AS fecha_calculo,
          COUNT(*) FILTER (WHERE a.interes_generado_total > 0)::int AS registros_procesados,
          COALESCE(SUM(a.interes_generado_total), 0)::numeric(12, 2) AS total_intereses_generados
        FROM parametros p
        LEFT JOIN actualizados a ON true
        GROUP BY p.fecha_calculo
      `,
      [InteresesService.BUSINESS_TIME_ZONE],
    );

    const summary = result as RawCalculoInteresesRow;

    return {
      fecha_calculo: summary?.fecha_calculo ?? this.getLocalDateKey(-1),
      registros_procesados: Number(summary?.registros_procesados ?? 0),
      total_intereses_generados: Number(summary?.total_intereses_generados ?? 0),
    };
  }

  private async syncTransaccionesIntereses(manager: EntityManager): Promise<void> {
    await manager.query(`
      UPDATE transacciones t
      SET intereses = COALESCE(resumen.total_interes_pendiente, 0)
      FROM (
        SELECT
          dt.id_transaccion,
          COALESCE(SUM(COALESCE(dt.interes_pendiente, 0)::numeric), 0)::numeric(12, 2) AS total_interes_pendiente
        FROM detalle_transacciones dt
        GROUP BY dt.id_transaccion
      ) resumen
      WHERE t.id_transaccion = resumen.id_transaccion
    `);

    await manager.query(`
      UPDATE transacciones t
      SET intereses = 0
      WHERE NOT EXISTS (
        SELECT 1
        FROM detalle_transacciones dt
        WHERE dt.id_transaccion = t.id_transaccion
      )
    `);
  }

  private getLocalDateKey(offsetDays = 0): string {
    const currentDate = new Date();
    currentDate.setDate(currentDate.getDate() + offsetDays);
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: InteresesService.BUSINESS_TIME_ZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });

    return formatter.format(currentDate);
  }
}
