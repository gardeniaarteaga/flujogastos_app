import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { catchError, firstValueFrom, map, of, timeout } from 'rxjs';

import { apiUrl } from '../config/api.config';
import {
  filterVisibleForCurrentUser,
} from '../catalog-visibility';
import { getCurrentUserId, loadUserProfile, saveUserProfile } from '../user-profile';

export interface CatalogoFormaPago {
  id_forma: number;
  nombre_forma: string;
  id_entidad: number;
  id_tipo: number;
  tasa_anual?: number | null;
  calcula_interes?: boolean | null;
  dias_gracia?: number | null;
  estado: boolean;
  id_usuario?: number | null;
  tipo_producto?: {
    id_tipo: number;
    nombre_tipo: string;
    pago_inmediato: boolean | null;
  } | null;
}

export interface CatalogoEntidadFinanciera {
  id_entidad: number;
  nombre_entidad: string;
  tipo_entidad: number | null;
  estado: boolean;
  id_usuario?: number | null;
}

export interface CatalogoTipoEntidad {
  id_tipo_entidad: number;
  descripcion: string;
  estado: boolean;
  id_usuario?: number | null;
}

export interface CatalogoParticipante {
  id_participante: number;
  nombre_participante: string;
  porcentaje_participacion: number | null;
  estado: string;
  id_usuario: number;
  id_usuario_relacionado?: number | null;
  id_usuario_titular?: number | null;
  es_predeterminada: boolean;
  puede_editar: boolean;
  puede_eliminar: boolean;
}

export interface CatalogoCategoria {
  id_categoria: number;
  nombre_categoria: string;
  estado: boolean;
  id_usuario: number;
  es_predeterminada?: boolean;
}

export interface CatalogoSubcategoria {
  id_subcategoria: number;
  id_categoria: number;
  nombre_subcategoria: string;
  descripcion: string | null;
  estado: boolean;
  id_usuario?: number | null;
  es_predeterminada?: boolean;
}

export interface CatalogoEstadoTransaccion {
  id_estado: number;
  nombre_estado: string;
  descripcion: string | null;
  estado: string;
  fecha_creacion: string;
  flag: string | null;
}

export interface CatalogosTransaccion {
  formasPago: CatalogoFormaPago[];
  entidadesFinancieras: CatalogoEntidadFinanciera[];
  tiposEntidad: CatalogoTipoEntidad[];
  participantes: CatalogoParticipante[];
  categorias: CatalogoCategoria[];
  subcategorias: CatalogoSubcategoria[];
  estadosTransaccion: CatalogoEstadoTransaccion[];
  failedCatalogs: string[];
}

interface UsuarioResuelto {
  id_usuario: number;
  username: string;
  nombre_completo: string | null;
  celular: string | null;
  pais: string | null;
  codigo_area: string | null;
  ciudad: string | null;
  id_rol: number | null;
}

@Injectable({ providedIn: 'root' })
export class CatalogosTransaccionService {
  private readonly http = inject(HttpClient);
  private readonly timeoutMs = 10000;
  private readonly baseUrl = apiUrl();
  private pendingCatalogosRequest: Promise<CatalogosTransaccion> | null = null;

  async loadCatalogos(forceRefresh = false): Promise<CatalogosTransaccion> {
    if (forceRefresh) {
      this.pendingCatalogosRequest = null;
    }

    if (this.pendingCatalogosRequest) {
      return this.pendingCatalogosRequest;
    }

    this.pendingCatalogosRequest = this.fetchCatalogos();

    try {
      return await this.pendingCatalogosRequest;
    } finally {
      this.pendingCatalogosRequest = null;
    }
  }

  clearCache(): void {
    this.pendingCatalogosRequest = null;
  }

  async syncCurrentUserId(): Promise<number> {
    return this.resolveCurrentUserId();
  }

  private async fetchCatalogos(): Promise<CatalogosTransaccion> {
    const currentUserId = await this.resolveCurrentUserId();
    const params = { id_usuario: currentUserId };
    const [
      formasPagoResult,
      entidadesFinancierasResult,
      tiposEntidadResult,
      participantesResult,
      categoriasResult,
      subcategoriasResult,
      estadosTransaccionResult,
    ] =
      await Promise.all([
        this.loadCatalogo<CatalogoFormaPago[]>('formas de pago', `${this.baseUrl}/formas-pago`, {
          params,
        }),
        this.loadCatalogo<CatalogoEntidadFinanciera[]>(
          'entidades financieras',
          `${this.baseUrl}/entidades-financieras`,
          {
            params,
          },
        ),
        this.loadCatalogo<CatalogoTipoEntidad[]>('tipos de entidad', `${this.baseUrl}/tipo-entidad`, {
          params,
        }),
        this.loadCatalogo<CatalogoParticipante[]>('participantes', `${this.baseUrl}/participantes`, {
          params,
        }),
        this.loadCatalogo<CatalogoCategoria[]>('categorias', `${this.baseUrl}/categorias`, {
          params,
        }),
        this.loadCatalogo<CatalogoSubcategoria[]>('subcategorias', `${this.baseUrl}/subcategorias`, {
          params,
        }),
        this.loadCatalogo<CatalogoEstadoTransaccion[]>(
          'estados de transaccion',
          `${this.baseUrl}/estados-transaccion`,
        ),
      ]);

    const failedCatalogs = [
      formasPagoResult,
      entidadesFinancierasResult,
      tiposEntidadResult,
      participantesResult,
      categoriasResult,
      subcategoriasResult,
      estadosTransaccionResult,
    ]
      .filter((item) => item.failed)
      .map((item) => item.name);

    return {
      formasPago: formasPagoResult.data,
      entidadesFinancieras: entidadesFinancierasResult.data,
      tiposEntidad: tiposEntidadResult.data,
      participantes: participantesResult.data,
      categorias: filterVisibleForCurrentUser(categoriasResult.data, currentUserId),
      subcategorias: filterVisibleForCurrentUser(subcategoriasResult.data, currentUserId),
      estadosTransaccion: estadosTransaccionResult.data,
      failedCatalogs,
    };
  }

  private async loadCatalogo<T>(
    name: string,
    url: string,
    options?: { params?: { id_usuario: number } },
  ): Promise<{ name: string; data: T; failed: boolean }> {
    return firstValueFrom(
      this.http.get<T>(url, options).pipe(
        timeout(this.timeoutMs),
        map((data) => ({ name, data, failed: false })),
        catchError(() => of({ name, data: [] as T, failed: true })),
      ),
    );
  }

  private async resolveCurrentUserId(): Promise<number> {
    const profile = loadUserProfile();
    const fallbackUserId = getCurrentUserId();
    const username = profile.username?.trim();

    if (!username) {
      return fallbackUserId;
    }

    try {
      const resolvedUser = await firstValueFrom(
        this.http
          .get<UsuarioResuelto>(`${this.baseUrl}/usuarios/resolve`, {
            params: { username },
          })
          .pipe(timeout(this.timeoutMs)),
      );

      if (
        resolvedUser.id_usuario !== profile.id_usuario ||
        resolvedUser.id_rol !== profile.id_rol ||
        resolvedUser.username !== profile.username ||
        (resolvedUser.nombre_completo?.trim() || '') !== profile.fullName ||
        (resolvedUser.celular?.trim() || '') !== profile.celular ||
        (resolvedUser.pais?.trim() || '') !== profile.country ||
        (resolvedUser.codigo_area?.trim() || '') !== profile.areaCode ||
        (resolvedUser.ciudad?.trim() || '') !== profile.city
      ) {
        saveUserProfile({
          ...profile,
          id_usuario: resolvedUser.id_usuario,
          id_rol: resolvedUser.id_rol,
          username: resolvedUser.username,
          email: resolvedUser.username,
          fullName: resolvedUser.nombre_completo?.trim() || profile.fullName,
          celular: resolvedUser.celular?.trim() || '',
          country: resolvedUser.pais?.trim() || '',
          areaCode: resolvedUser.codigo_area?.trim() || '',
          city: resolvedUser.ciudad?.trim() || '',
          role: resolvedUser.id_rol === 1 ? 'Administrador' : 'Usuario',
        });
      }

      return resolvedUser.id_usuario;
    } catch {
      return fallbackUserId;
    }
  }
}
