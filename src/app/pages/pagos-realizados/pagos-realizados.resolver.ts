import { HttpClient } from '@angular/common/http';
import { inject } from '@angular/core';
import { ResolveFn } from '@angular/router';
import { firstValueFrom, timeout } from 'rxjs';

import { apiUrl } from '../../shared/config/api.config';
import {
  CatalogosTransaccion,
  CatalogosTransaccionService,
} from '../../shared/services/catalogos-transaccion.service';

export interface PagosEstadoResolvedData {
  currentUserId: number;
  catalogos: CatalogosTransaccion;
  transacciones: unknown[];
}

export const pagosEstadoResolver: ResolveFn<PagosEstadoResolvedData | null> = async () => {
  const catalogosService = inject(CatalogosTransaccionService);
  const http = inject(HttpClient);
  const timeoutMs = 10000;
  const transaccionesUrl = apiUrl('transacciones');

  try {
    const currentUserId = await catalogosService.syncCurrentUserId();
    const [catalogos, transacciones] = await Promise.all([
      catalogosService.loadCatalogos(true),
      firstValueFrom(
        http
          .get<unknown[]>(transaccionesUrl, {
            params: { id_usuario: currentUserId },
          })
          .pipe(timeout(timeoutMs)),
      ),
    ]);

    return {
      currentUserId,
      catalogos,
      transacciones: Array.isArray(transacciones) ? transacciones : [],
    };
  } catch {
    return null;
  }
};
