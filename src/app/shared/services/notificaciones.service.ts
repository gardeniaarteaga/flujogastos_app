import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom, timeout } from 'rxjs';

import { apiUrl } from '../config/api.config';
import { CatalogosTransaccionService } from './catalogos-transaccion.service';

export interface NotificacionItem {
  id_notificacion: number;
  id_usuario_destino: number;
  id_usuario_origen: number | null;
  id_transaccion: number | null;
  tipo: string;
  titulo: string;
  mensaje: string;
  leida: boolean;
  fecha_leida: string | null;
  fecha_creacion: string;
}

export interface NotificacionesResumen {
  pendientes: number;
  items: NotificacionItem[];
}

export interface MarcarTodasLeidasResponse {
  updated: number;
  ids_notificacion: number[];
  fecha_leida: string | null;
}

export type PeriodicidadNotificacionPagoCodigo = 'mensual' | 'fecha-especifica' | 'anual';

interface PeriodicidadApiItem {
  id_periodicidad?: number | string | null;
  nombre_periodicidad?: string | null;
  periodicidad?: string | null;
  nombre?: string | null;
  descripcion?: string | null;
  codigo?: string | null;
}

export interface PeriodicidadCatalogo {
  id_periodicidad: number;
  nombre: string;
  descripcion: string | null;
  codigo: PeriodicidadNotificacionPagoCodigo;
}

export interface ConfiguracionNotificacionPago {
  id_notificacion_programada: number;
  id_usuario: number;
  descripcion: string;
  dia_pago_programado: number;
  id_periodicidad: number;
  periodicidad_nombre: string;
  periodicidad_codigo: PeriodicidadNotificacionPagoCodigo;
  fecha_creacion: string;
  fecha_actualizacion: string;
}

export interface ConfiguracionNotificacionPagoPayload {
  id_notificacion_programada?: number | null;
  descripcion: string;
  dia_pago_programado: number;
  periodicidad: PeriodicidadCatalogo;
}

@Injectable({ providedIn: 'root' })
export class NotificacionesService {
  private readonly http = inject(HttpClient);
  private readonly catalogosTransaccionService = inject(CatalogosTransaccionService);
  private readonly timeoutMs = 10000;
  private readonly baseUrl = apiUrl('notificaciones');
  private readonly periodicidadUrl = apiUrl('periodicidad');

  async loadResumen(limite = 8): Promise<NotificacionesResumen> {
    const idUsuario = await this.catalogosTransaccionService.syncCurrentUserId();

    return firstValueFrom(
      this.http
        .get<NotificacionesResumen>(this.baseUrl, {
          params: {
            id_usuario: idUsuario,
            limite,
          },
        })
        .pipe(timeout(this.timeoutMs)),
    );
  }

  async markAllAsRead(): Promise<MarcarTodasLeidasResponse> {
    const idUsuario = await this.catalogosTransaccionService.syncCurrentUserId();

    return firstValueFrom(
      this.http
        .patch<MarcarTodasLeidasResponse>(
          `${this.baseUrl}/marcar-todas`,
          {},
          {
            params: { id_usuario: idUsuario },
          },
        )
        .pipe(timeout(this.timeoutMs)),
    );
  }

  async markAsRead(idNotificacion: number): Promise<NotificacionItem> {
    const idUsuario = await this.catalogosTransaccionService.syncCurrentUserId();

    return firstValueFrom(
      this.http
        .patch<NotificacionItem>(
          `${this.baseUrl}/${idNotificacion}/marcar-leida`,
          {},
          {
            params: { id_usuario: idUsuario },
          },
        )
        .pipe(timeout(this.timeoutMs)),
    );
  }

  async loadPeriodicidades(): Promise<PeriodicidadCatalogo[]> {
    const response = await firstValueFrom(
      this.http.get<PeriodicidadApiItem[]>(this.periodicidadUrl).pipe(timeout(this.timeoutMs)),
    );

    const normalized = Array.isArray(response)
      ? response
          .map((item) => this.normalizePeriodicidad(item))
          .filter((item): item is PeriodicidadCatalogo => item !== null)
      : [];

    return normalized.sort((a, b) => a.id_periodicidad - b.id_periodicidad);
  }

  async loadConfiguracionesPago(): Promise<ConfiguracionNotificacionPago[]> {
    const idUsuario = await this.catalogosTransaccionService.syncCurrentUserId();
    const response = await firstValueFrom(
      this.http
        .get<ConfiguracionNotificacionPago[]>(`${this.baseUrl}/programadas`, {
          params: { id_usuario: idUsuario },
        })
        .pipe(timeout(this.timeoutMs)),
    );
    const configuraciones = Array.isArray(response) ? response : [];

    return configuraciones.sort((a, b) => {
      const nextA = this.resolveSortDate(a);
      const nextB = this.resolveSortDate(b);

      if (nextA !== nextB) {
        return nextA - nextB;
      }

      return b.id_notificacion_programada - a.id_notificacion_programada;
    });
  }

  async saveConfiguracionPago(
    payload: ConfiguracionNotificacionPagoPayload,
  ): Promise<ConfiguracionNotificacionPago> {
    const idUsuario = await this.catalogosTransaccionService.syncCurrentUserId();
    const descripcion = payload.descripcion.trim();
    const diaPagoProgramado = Number(payload.dia_pago_programado);

    if (!descripcion || !Number.isInteger(diaPagoProgramado)) {
      throw new Error('La descripcion y el dia programado son obligatorios.');
    }

    if (diaPagoProgramado < 1 || diaPagoProgramado > 31) {
      throw new Error('El dia de pago programado debe estar entre 1 y 31.');
    }

    const requestPayload = {
      descripcion,
      dia_pago_programado: diaPagoProgramado,
      id_periodicidad: payload.periodicidad.id_periodicidad,
    };

    if (payload.id_notificacion_programada) {
      return firstValueFrom(
        this.http
          .patch<ConfiguracionNotificacionPago>(
            `${this.baseUrl}/programadas/${payload.id_notificacion_programada}`,
            requestPayload,
            {
              params: { id_usuario: idUsuario },
            },
          )
          .pipe(timeout(this.timeoutMs)),
      );
    }

    return firstValueFrom(
      this.http
        .post<ConfiguracionNotificacionPago>(
          `${this.baseUrl}/programadas`,
          requestPayload,
          {
            params: { id_usuario: idUsuario },
          },
        )
        .pipe(timeout(this.timeoutMs)),
    );
  }

  async deleteConfiguracionPago(idNotificacionProgramada: number): Promise<void> {
    const idUsuario = await this.catalogosTransaccionService.syncCurrentUserId();

    await firstValueFrom(
      this.http
        .delete(`${this.baseUrl}/programadas/${idNotificacionProgramada}`, {
          params: { id_usuario: idUsuario },
        })
        .pipe(timeout(this.timeoutMs)),
    );
  }

  private resolveSortDate(configuracion: ConfiguracionNotificacionPago): number {
    const today = this.getToday();
    let nextDate: Date;
    const day = configuracion.dia_pago_programado;

    if (configuracion.periodicidad_codigo === 'fecha-especifica') {
      nextDate = this.buildMonthlyOccurrence(today, day);
    } else if (configuracion.periodicidad_codigo === 'mensual') {
      nextDate = this.buildMonthlyOccurrence(today, day);

      if (nextDate.getTime() < today.getTime()) {
        nextDate = this.buildMonthlyOccurrence(
          new Date(today.getFullYear(), today.getMonth() + 1, 1),
          day,
        );
      }
    } else {
      nextDate = this.buildYearlyOccurrence(today, today.getMonth(), day);

      if (nextDate.getTime() < today.getTime()) {
        nextDate = this.buildYearlyOccurrence(
          new Date(today.getFullYear() + 1, 0, 1),
          today.getMonth(),
          day,
        );
      }
    }

    return nextDate.getTime();
  }

  private buildMonthlyOccurrence(referenceDate: Date, day: number): Date {
    const year = referenceDate.getFullYear();
    const month = referenceDate.getMonth();
    const maxDay = new Date(year, month + 1, 0).getDate();

    return new Date(year, month, Math.min(day, maxDay));
  }

  private buildYearlyOccurrence(referenceDate: Date, month: number, day: number): Date {
    const year = referenceDate.getFullYear();
    const maxDay = new Date(year, month + 1, 0).getDate();

    return new Date(year, month, Math.min(day, maxDay));
  }

  private normalizePeriodicidad(item: PeriodicidadApiItem): PeriodicidadCatalogo | null {
    const id = Number(item.id_periodicidad);
    const nombre =
      item.nombre_periodicidad?.trim() ||
      item.periodicidad?.trim() ||
      item.nombre?.trim() ||
      '';
    const codigo = this.resolvePeriodicidadCodigo(
      item.codigo?.trim() || nombre || item.descripcion?.trim() || '',
    );

    if (!Number.isInteger(id) || id < 1 || !nombre || !codigo) {
      return null;
    }

    return {
      id_periodicidad: id,
      nombre,
      descripcion: item.descripcion?.trim() || null,
      codigo,
    };
  }

  private resolvePeriodicidadCodigo(
    value: string | null | undefined,
  ): PeriodicidadNotificacionPagoCodigo | null {
    const normalized = (value ?? '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim();

    if (normalized.includes('mensual') || normalized.includes('cada mes')) {
      return 'mensual';
    }

    if (
      normalized.includes('anual') ||
      normalized.includes('cada ano') ||
      normalized.includes('cada a')
    ) {
      return 'anual';
    }

    if (
      normalized.includes('especific') ||
      normalized.includes('unica') ||
      normalized.includes('dia')
    ) {
      return 'fecha-especifica';
    }

    return null;
  }

  private getToday(): Date {
    const today = new Date();
    return new Date(today.getFullYear(), today.getMonth(), today.getDate());
  }
}
