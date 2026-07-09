import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom, timeout } from 'rxjs';

import { apiUrl } from '../config/api.config';
import { getCurrentUserId } from '../user-profile';

export interface EstadoCuenta {
  id_estado_cuenta: number;
  id_usuario: number;
  id_metodo_pago: number;
  nombre_forma: string;
  anio: number;
  mes: number;
  fecha_inicio_periodo: string;
  fecha_fin_periodo: string;
  saldo_anterior_capital: number;
  saldo_anterior_intereses: number;
  saldo_anterior_recargos: number;
  saldo_anterior_comisiones: number;
  pagos_acreditaciones: number;
  devoluciones: number;
  cuota_extrafinanciamiento: number;
  cuota_infrafinanciamiento: number;
  compras_retiros: number;
  interes_corriente_bonificable: number;
  interes_corriente: number;
  recargos_comisiones: number;
  debitos: number;
  saldo_contado: number;
  saldo_a_plazos: number;
  pago_minimo: number;
  fecha_creacion: string;
  total_deuda: number;
  compras_calculado: number;
  compras_estado_cuenta: number;
  compras_diferencia: number;
  pagos_calculado: number;
  pagos_diferencia: number;
}

export interface EstadoCuentaPayload {
  id_metodo_pago: number;
  anio: number;
  mes: number;
  saldo_anterior_capital: number;
  saldo_anterior_intereses: number;
  saldo_anterior_recargos: number;
  saldo_anterior_comisiones: number;
  pagos_acreditaciones: number;
  devoluciones: number;
  cuota_extrafinanciamiento: number;
  cuota_infrafinanciamiento: number;
  compras_retiros: number;
  interes_corriente_bonificable: number;
  interes_corriente: number;
  recargos_comisiones: number;
  debitos: number;
  saldo_contado: number;
  saldo_a_plazos: number;
  pago_minimo: number;
}

@Injectable({ providedIn: 'root' })
export class EstadoCuentaService {
  private readonly http = inject(HttpClient);
  private readonly timeoutMs = 10000;
  private readonly baseUrl = apiUrl('estado-cuenta');
  private readonly currentUserId = getCurrentUserId();

  async loadEstadosCuenta(idMetodoPago?: number): Promise<EstadoCuenta[]> {
    return firstValueFrom(
      this.http
        .get<EstadoCuenta[]>(this.baseUrl, {
          params: {
            id_usuario: this.currentUserId,
            ...(idMetodoPago ? { id_metodo_pago: idMetodoPago } : {}),
          },
        })
        .pipe(timeout(this.timeoutMs)),
    );
  }

  async saveEstadoCuenta(
    payload: EstadoCuentaPayload,
    idEstadoCuenta?: number | null,
  ): Promise<EstadoCuenta> {
    if (idEstadoCuenta) {
      return firstValueFrom(
        this.http
          .patch<EstadoCuenta>(`${this.baseUrl}/${idEstadoCuenta}`, payload, {
            params: { id_usuario: this.currentUserId },
          })
          .pipe(timeout(this.timeoutMs)),
      );
    }

    return firstValueFrom(
      this.http
        .post<EstadoCuenta>(this.baseUrl, payload, {
          params: { id_usuario: this.currentUserId },
        })
        .pipe(timeout(this.timeoutMs)),
    );
  }

  async deleteEstadoCuenta(idEstadoCuenta: number): Promise<void> {
    await firstValueFrom(
      this.http
        .delete(`${this.baseUrl}/${idEstadoCuenta}`, {
          params: { id_usuario: this.currentUserId },
        })
        .pipe(timeout(this.timeoutMs)),
    );
  }
}
