import { DataSource, EntityManager } from 'typeorm';

import { InteresesService } from './intereses.service';

describe('InteresesService', () => {
  it('calcula dias_interes desde fecha_inicio_interes y evita intereses antes de esa fecha', async () => {
    const manager = {
      query: jest
        .fn()
        .mockResolvedValueOnce([
          {
            fecha_calculo: '2026-05-10',
            registros_procesados: '0',
            total_intereses_generados: '0.00',
          },
        ])
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce(undefined),
    } as unknown as EntityManager;

    const dataSource = {
      transaction: jest.fn(async (callback: (entityManager: EntityManager) => Promise<unknown>) =>
        callback(manager),
      ),
    } as unknown as DataSource;

    const service = new InteresesService(dataSource);

    await service.calculateDailyIntereses('manual');

    expect(dataSource.transaction).toHaveBeenCalledTimes(1);
    expect(manager.query).toHaveBeenCalledTimes(3);

    const [sql, params] = (manager.query as jest.Mock).mock.calls[0];

    expect(sql).toContain('COALESCE(dt.dias_interes, 0) AS dias_interes_actual');
    expect(sql).toContain('AS dias_a_calcular');
    expect(sql).toContain('AS dias_interes');
    expect(sql).toContain('p.fecha_actual < db.fecha_inicio_interes');
    expect(sql).toContain('INNER JOIN categorias c');
    expect(sql).toContain("UPPER(COALESCE(c.nombre_categoria, '')) <> 'INGRESOS'");
    expect(sql).toContain('interes_acumulado = objetivo.interes_acumulado_objetivo');
    expect(sql).toContain('dias_interes = objetivo.dias_interes');
    expect(sql).toContain(
      'objetivo.interes_acumulado_objetivo - COALESCE(dt.interes_pagado, 0)::numeric',
    );
    expect(params).toEqual(['America/El_Salvador']);
  });
});
