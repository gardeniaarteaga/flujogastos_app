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

@Injectable({ providedIn: 'root' })
export class NotificacionesService {
  private readonly http = inject(HttpClient);
  private readonly catalogosTransaccionService = inject(CatalogosTransaccionService);
  private readonly timeoutMs = 10000;
  private readonly baseUrl = apiUrl('notificaciones');

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
}
