import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom, timeout } from 'rxjs';

import { apiUrl } from '../config/api.config';
import { CatalogosTransaccionService } from './catalogos-transaccion.service';
import { getCurrentUserId } from '../user-profile';

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

export type PrioridadNotificacion = 'alta' | 'media' | 'baja';

interface PeriodicidadApiItem {
  id_periodicidad?: number | string | null;
  nombre_periodicidad?: string | null;
  descripcion?: string | null;
  codigo?: string | null;
  estado?: boolean | null;
}

export interface PeriodicidadCatalogo {
  id_periodicidad: number;
  nombre_periodicidad: string;
  descripcion: string | null;
  codigo: string;
  estado: boolean;
}

interface ConfiguracionNotificacionPagoApiItem {
  id_notificacion_programada?: number | string | null;
  id_usuario?: number | string | null;
  descripcion?: string | null;
  prioridad?: PrioridadNotificacion | string | null;
  fecha_inicio?: string | null;
  fecha_fin?: string | null;
  dia_pago_programado?: number | string | null;
  id_periodicidad?: number | string | null;
  periodicidad_nombre?: string | null;
  periodicidad_codigo?: string | null;
  periodicidad?: PeriodicidadApiItem | null;
  estado?: boolean | null;
  fecha_creacion?: string | null;
  fecha_actualizacion?: string | null;
}

export interface ConfiguracionNotificacionPago {
  id_notificacion_programada: number;
  id_usuario: number;
  descripcion: string;
  prioridad: PrioridadNotificacion;
  fecha_inicio: string;
  fecha_fin: string;
  dia_pago_programado: number;
  id_periodicidad: number;
  periodicidad: PeriodicidadCatalogo | null;
  estado: boolean;
  fecha_creacion: string;
  fecha_actualizacion: string;
}

export interface ConfiguracionNotificacionPagoPayload {
  id_notificacion_programada?: number | null;
  descripcion: string;
  prioridad: PrioridadNotificacion;
  fecha_inicio: string;
  fecha_fin: string;
  dia_pago_programado: number;
  id_periodicidad: number;
}

interface FinalizarConfiguracionNotificacionPagoPayload {
  estado: boolean;
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

  async loadConfiguracionesPago(
    periodicidades?: PeriodicidadCatalogo[],
  ): Promise<ConfiguracionNotificacionPago[]> {
    const idUsuario = await this.catalogosTransaccionService.syncCurrentUserId();
    const [response, resolvedPeriodicidades] = await Promise.all([
      firstValueFrom(
        this.http
          .get<ConfiguracionNotificacionPagoApiItem[]>(`${this.baseUrl}/programadas`, {
            params: { id_usuario: idUsuario },
          })
          .pipe(timeout(this.timeoutMs)),
      ),
      periodicidades === undefined ? this.loadPeriodicidades() : Promise.resolve(periodicidades),
    ]);
    const periodicidadMap = new Map(
      resolvedPeriodicidades.map((periodicidad) => [periodicidad.id_periodicidad, periodicidad]),
    );
    const configuraciones = Array.isArray(response)
      ? response
          .map((item) => this.normalizeConfiguracion(item, periodicidadMap))
          .filter((item): item is ConfiguracionNotificacionPago => item !== null)
          .filter((item) => this.isConfiguracionVisible(item))
      : [];

    return configuraciones.sort((a, b) => {
      if (a.estado !== b.estado) {
        return Number(b.estado) - Number(a.estado);
      }

      const prioridadDiff =
        this.resolvePrioridadRank(a.prioridad) - this.resolvePrioridadRank(b.prioridad);

      if (prioridadDiff !== 0) {
        return prioridadDiff;
      }

      const fechaInicioDiff = a.fecha_inicio.localeCompare(b.fecha_inicio);
      if (fechaInicioDiff !== 0) {
        return fechaInicioDiff;
      }

      if (a.dia_pago_programado !== b.dia_pago_programado) {
        return a.dia_pago_programado - b.dia_pago_programado;
      }

      return b.id_notificacion_programada - a.id_notificacion_programada;
    });
  }

  async saveConfiguracionPago(
    payload: ConfiguracionNotificacionPagoPayload,
  ): Promise<ConfiguracionNotificacionPago> {
    const idUsuario = await this.catalogosTransaccionService.syncCurrentUserId();
    const descripcion = this.normalizeDescripcion(payload.descripcion);
    const prioridad = this.normalizePrioridad(payload.prioridad);
    const fechaInicio = this.normalizeDateOnly(payload.fecha_inicio);
    const fechaFin = this.normalizeDateOnly(payload.fecha_fin);
    const diaPagoProgramado = Number(payload.dia_pago_programado);
    const idPeriodicidad = Number(payload.id_periodicidad);

    if (!descripcion || !Number.isInteger(diaPagoProgramado) || !Number.isInteger(idPeriodicidad)) {
      throw new Error('La descripcion, el dia programado y la periodicidad son obligatorios.');
    }

    if (diaPagoProgramado < 1 || diaPagoProgramado > 31) {
      throw new Error('El dia de pago programado debe estar entre 1 y 31.');
    }

    if (fechaFin < fechaInicio) {
      throw new Error('La fecha fin no puede ser menor que la fecha inicio.');
    }

    const requestPayload = {
      descripcion,
      prioridad,
      fecha_inicio: fechaInicio,
      fecha_fin: fechaFin,
      dia_pago_programado: diaPagoProgramado,
      id_periodicidad: idPeriodicidad,
    };

    const response = payload.id_notificacion_programada
      ? await firstValueFrom(
          this.http
            .patch<ConfiguracionNotificacionPagoApiItem>(
              `${this.baseUrl}/programadas/${payload.id_notificacion_programada}`,
              requestPayload,
              {
                params: { id_usuario: idUsuario },
              },
            )
            .pipe(timeout(this.timeoutMs)),
        )
      : await firstValueFrom(
          this.http
            .post<ConfiguracionNotificacionPagoApiItem>(
              `${this.baseUrl}/programadas`,
              requestPayload,
              {
                params: { id_usuario: idUsuario },
              },
        )
            .pipe(timeout(this.timeoutMs)),
        );
    const periodicidades = await this.loadPeriodicidades();
    const configuracion = this.normalizeConfiguracion(
      response,
      new Map(periodicidades.map((periodicidad) => [periodicidad.id_periodicidad, periodicidad])),
    );

    if (!configuracion) {
      throw new Error('La respuesta del backend no contiene una configuracion valida.');
    }

    return configuracion;
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

  async finalizeConfiguracionPago(idNotificacionProgramada: number): Promise<void> {
    const storedUserId = getCurrentUserId();
    const idUsuario =
      Number.isInteger(storedUserId) && storedUserId > 0
        ? storedUserId
        : await this.catalogosTransaccionService.syncCurrentUserId();
    const requestPayload: FinalizarConfiguracionNotificacionPagoPayload = {
      estado: false,
    };

    await firstValueFrom(
      this.http
        .patch<ConfiguracionNotificacionPagoApiItem>(
          `${this.baseUrl}/programadas/${idNotificacionProgramada}`,
          requestPayload,
          {
            params: { id_usuario: idUsuario },
          },
        )
        .pipe(timeout(this.timeoutMs)),
    );
  }

  private normalizePeriodicidad(item: PeriodicidadApiItem): PeriodicidadCatalogo | null {
    const id = Number(item.id_periodicidad);
    const nombre = item.nombre_periodicidad?.trim() || '';
    const codigo = item.codigo?.trim() || '';

    if (!Number.isInteger(id) || id < 1 || !nombre || !codigo) {
      return null;
    }

    return {
      id_periodicidad: id,
      nombre_periodicidad: nombre,
      descripcion: item.descripcion?.trim() || null,
      codigo,
      estado: item.estado !== false,
    };
  }

  private resolvePrioridadRank(prioridad: PrioridadNotificacion | null | undefined): number {
    switch (prioridad) {
      case 'alta':
        return 0;
      case 'media':
        return 1;
      case 'baja':
        return 2;
      default:
        return 3;
    }
  }

  private normalizePrioridad(value: string | null | undefined): PrioridadNotificacion {
    const normalized = (value ?? '').trim().toLowerCase();

    if (normalized === 'alta' || normalized === 'media' || normalized === 'baja') {
      return normalized;
    }

    throw new Error('La prioridad debe ser alta, media o baja.');
  }

  private normalizeDescripcion(value: string | null | undefined): string {
    return (value ?? '').trim().toUpperCase();
  }

  private normalizeDateOnly(value: string | null | undefined): string {
    const normalized = (value ?? '').trim();

    if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
      throw new Error('Las fechas deben estar en formato YYYY-MM-DD.');
    }

    return normalized;
  }

  private isConfiguracionVisible(configuracion: ConfiguracionNotificacionPago): boolean {
    if (!configuracion.estado) {
      return false;
    }

    const fechaFin = new Date(`${configuracion.fecha_fin}T00:00:00`);

    if (Number.isNaN(fechaFin.getTime())) {
      return true;
    }

    const limiteVisible = new Date(fechaFin);
    limiteVisible.setDate(limiteVisible.getDate() + 15);

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return today.getTime() <= limiteVisible.getTime();
  }

  private normalizeConfiguracion(
    item: ConfiguracionNotificacionPagoApiItem,
    periodicidadMap: Map<number, PeriodicidadCatalogo>,
  ): ConfiguracionNotificacionPago | null {
    try {
      const idNotificacionProgramada = Number(item.id_notificacion_programada);
      const idUsuario = Number(item.id_usuario);
      const diaPagoProgramado = Number(item.dia_pago_programado);
      const idPeriodicidad = Number(item.id_periodicidad);
      const descripcion = this.normalizeDescripcion(item.descripcion);
      const prioridad = item.prioridad ? this.normalizePrioridad(item.prioridad) : null;
      const fechaInicio = item.fecha_inicio?.trim() || '';
      const fechaFin = item.fecha_fin?.trim() || '';

      if (
        !Number.isInteger(idNotificacionProgramada) ||
        idNotificacionProgramada < 1 ||
        !Number.isInteger(idUsuario) ||
        idUsuario < 1 ||
        !descripcion ||
        !prioridad ||
        !Number.isInteger(diaPagoProgramado) ||
        !Number.isInteger(idPeriodicidad)
      ) {
        return null;
      }

      const periodicidad =
        periodicidadMap.get(idPeriodicidad) ??
        this.normalizePeriodicidad({
          id_periodicidad: idPeriodicidad,
          nombre_periodicidad:
            item.periodicidad?.nombre_periodicidad ?? item.periodicidad_nombre ?? null,
          descripcion: item.periodicidad?.descripcion ?? null,
          codigo: item.periodicidad?.codigo ?? item.periodicidad_codigo ?? null,
          estado: item.periodicidad?.estado ?? true,
        });

      return {
        id_notificacion_programada: idNotificacionProgramada,
        id_usuario: idUsuario,
        descripcion,
        prioridad,
        fecha_inicio: this.normalizeDateOnly(fechaInicio),
        fecha_fin: this.normalizeDateOnly(fechaFin),
        dia_pago_programado: diaPagoProgramado,
        id_periodicidad: idPeriodicidad,
        periodicidad,
        estado: item.estado !== false,
        fecha_creacion: item.fecha_creacion?.trim() || '',
        fecha_actualizacion: item.fecha_actualizacion?.trim() || '',
      };
    } catch {
      return null;
    }
  }
}
