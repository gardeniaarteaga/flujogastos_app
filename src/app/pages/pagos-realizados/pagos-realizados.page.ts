import { NgFor, NgIf } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Component, DestroyRef, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { firstValueFrom, timeout } from 'rxjs';

import { apiUrl } from '../../shared/config/api.config';
import { SessionStripComponent } from '../../shared/session-strip/session-strip.component';
import {
  CatalogoFormaPago,
  CatalogoParticipante,
  CatalogosTransaccionService,
} from '../../shared/services/catalogos-transaccion.service';
import { getCurrentUserId, isAdminUser, loadUserProfile } from '../../shared/user-profile';

const ESTADO_TRANSACCION_ANULADA_ID = 2;

interface ParticipanteDetalleListado {
  id: number;
  id_participante: number;
  id_usuario_relacionado: number | null;
  nombre_participante: string | null;
  monto: number;
  monto_pagado: number;
  interes_pagado: number;
  interes_pendiente: number;
  saldo_pendiente: number;
  fecha_pago: string | null;
  fecha_programada: string | null;
  numero_cuota: number;
  total_cuotas: number;
  id_metodo_pago: number;
  nombre_forma_pago: string | null;
  id_estado: number;
  nombre_estado: string | null;
  fecha_creacion: string;
  es_titular: boolean;
}

interface TransaccionListado {
  id_transaccion: number;
  es_propietario: boolean;
  fecha: string;
  monto: number;
  intereses: number;
  saldo_pendiente: number;
  id_tipo_transaccion: number;
  nombre_tipo_transaccion: string | null;
  id_metodo_pago: number;
  nombre_forma_pago: string | null;
  id_categoria: number;
  nombre_categoria: string | null;
  id_subcategoria: number | null;
  nombre_subcategoria: string | null;
  id_estado: number;
  nombre_estado: string | null;
  id_estado_registro: number | null;
  nombre_estado_registro: string | null;
  descripcion: string | null;
  pagocompartido: boolean;
  fecha_ultimo_pago: string | null;
  fecha_creacion: string;
  titular: string | null;
  cantidad_participantes: number;
  participantes_detalle: ParticipanteDetalleListado[];
}

interface PagoRealizadoRow {
  detalleId: number;
  transaccionId: number;
  descripcion: string;
  fechaPago: string;
  fechaPagoLabel: string;
  metodoPagoId: number | null;
  metodoPagoNombre: string;
  participanteKey: string;
  participanteNombre: string;
  cuotaLabel: string;
  montoCuota: number;
  montoPagado: number;
  interesPagado: number;
  totalPagado: number;
  estadoNombre: string;
}

interface SelectOption {
  value: string;
  label: string;
}

@Component({
  selector: 'app-pagos-realizados-page',
  imports: [
    RouterLink,
    RouterLinkActive,
    ReactiveFormsModule,
    NgIf,
    NgFor,
    SessionStripComponent,
  ],
  templateUrl: './pagos-realizados.page.html',
  styleUrl: './pagos-realizados.page.css',
})
export class PagosRealizadosPage {
  private readonly fb = inject(FormBuilder);
  private readonly http = inject(HttpClient);
  private readonly destroyRef = inject(DestroyRef);
  private readonly catalogosService = inject(CatalogosTransaccionService);
  private readonly apiUrl = apiUrl('transacciones');
  private readonly timeoutMs = 10000;
  private readonly currencyFormatter = new Intl.NumberFormat('es-SV', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  readonly userProfile = loadUserProfile();
  readonly today = new Date();
  readonly todayFilterValue = this.formatDateInput(this.today);
  readonly filtrosForm = this.fb.group({
    fechaDesde: [this.todayFilterValue],
    fechaHasta: [this.todayFilterValue],
    metodoPagoId: [''],
    participanteKey: [''],
  });

  sidebarCollapsed = false;
  maintenanceOpen = false;
  loading = false;
  errorMessage = '';
  currentUserId = getCurrentUserId();
  pagos: PagoRealizadoRow[] = [];
  filteredPagos: PagoRealizadoRow[] = [];
  formasPago: CatalogoFormaPago[] = [];
  participantes: CatalogoParticipante[] = [];
  metodoPagoOptions: SelectOption[] = [];
  participanteOptions: SelectOption[] = [];

  get isAdminSession(): boolean {
    return isAdminUser();
  }

  get totalPagado(): number {
    return this.filteredPagos.reduce((sum, row) => sum + row.totalPagado, 0);
  }

  get totalInteresesPagados(): number {
    return this.filteredPagos.reduce((sum, row) => sum + row.interesPagado, 0);
  }

  get totalCapitalPagado(): number {
    return this.filteredPagos.reduce((sum, row) => sum + row.montoPagado, 0);
  }

  get activeFilterChips(): string[] {
    const filtros = this.filtrosForm.getRawValue();
    const chips: string[] = [];

    if (!this.isTodayRange()) {
      chips.push(
        filtros.fechaDesde === filtros.fechaHasta
          ? `Fecha: ${filtros.fechaDesde}`
          : `${filtros.fechaDesde} a ${filtros.fechaHasta}`,
      );
    } else {
      chips.push('Hoy');
    }

    if (filtros.metodoPagoId) {
      const metodo = this.metodoPagoOptions.find((option) => option.value === filtros.metodoPagoId);
      if (metodo) {
        chips.push(metodo.label);
      }
    }

    if (filtros.participanteKey) {
      const participante = this.participanteOptions.find(
        (option) => option.value === filtros.participanteKey,
      );
      if (participante) {
        chips.push(participante.label);
      }
    }

    return chips;
  }

  get currentUserParticipante(): CatalogoParticipante | null {
    const candidateNames = [this.userProfile.fullName, this.userProfile.username]
      .filter((value): value is string => Boolean(value?.trim()))
      .map((value) => this.normalizeText(value));

    const linkedParticipante =
      this.participantes.find(
        (participante) => participante.id_usuario_titular === this.currentUserId,
      ) ?? null;

    if (linkedParticipante) {
      return linkedParticipante;
    }

    return (
      this.participantes.find(
        (participante) =>
          participante.id_usuario === this.currentUserId &&
          candidateNames.includes(this.normalizeText(participante.nombre_participante)),
      ) ??
      this.participantes.find((participante) => participante.id_usuario === this.currentUserId) ??
      null
    );
  }

  constructor() {
    this.filtrosForm.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        this.applyFilters();
      });

    void this.loadPage();
  }

  async loadPage(): Promise<void> {
    this.loading = true;
    this.errorMessage = '';

    try {
      const resolvedUserId = await this.catalogosService.syncCurrentUserId();
      this.currentUserId = resolvedUserId > 0 ? resolvedUserId : this.currentUserId;

      const [catalogos, transacciones] = await Promise.all([
        this.catalogosService.loadCatalogos(true),
        firstValueFrom(
          this.http
            .get<TransaccionListado[]>(this.apiUrl, {
              params: { id_usuario: this.currentUserId },
            })
            .pipe(timeout(this.timeoutMs)),
        ),
      ]);

      this.formasPago = catalogos.formasPago;
      this.participantes = catalogos.participantes;
      this.pagos = this.buildPagos(
        Array.isArray(transacciones) ? transacciones : [],
      );
      this.metodoPagoOptions = this.buildMetodoPagoOptions(this.pagos);
      this.participanteOptions = this.buildParticipanteOptions(this.pagos);
      this.applyFilters();
    } catch {
      this.pagos = [];
      this.filteredPagos = [];
      this.errorMessage = 'No se pudieron cargar los pagos realizados.';
    } finally {
      this.loading = false;
    }
  }

  toggleMaintenanceMenu(): void {
    this.maintenanceOpen = !this.maintenanceOpen;
  }

  clearFilters(): void {
    this.filtrosForm.setValue({
      fechaDesde: this.todayFilterValue,
      fechaHasta: this.todayFilterValue,
      metodoPagoId: '',
      participanteKey: '',
    });
  }

  setTodayFilters(): void {
    this.clearFilters();
  }

  setLastDaysRange(days: number): void {
    const end = new Date(this.today);
    const start = new Date(this.today);
    start.setDate(start.getDate() - Math.max(0, days - 1));

    this.filtrosForm.patchValue({
      fechaDesde: this.formatDateInput(start),
      fechaHasta: this.formatDateInput(end),
    });
  }

  setCurrentMonthFilters(): void {
    const start = new Date(this.today.getFullYear(), this.today.getMonth(), 1);
    const end = new Date(this.today.getFullYear(), this.today.getMonth() + 1, 0);

    this.filtrosForm.patchValue({
      fechaDesde: this.formatDateInput(start),
      fechaHasta: this.formatDateInput(end),
    });
  }

  isTodayRange(): boolean {
    const filtros = this.filtrosForm.getRawValue();
    return (
      (filtros.fechaDesde ?? '') === this.todayFilterValue &&
      (filtros.fechaHasta ?? '') === this.todayFilterValue
    );
  }

  isLastDaysRange(days: number): boolean {
    const filtros = this.filtrosForm.getRawValue();
    const expectedEnd = this.todayFilterValue;
    const expectedStart = this.formatDateInput(
      new Date(this.today.getFullYear(), this.today.getMonth(), this.today.getDate() - (days - 1)),
    );

    return (filtros.fechaDesde ?? '') === expectedStart && (filtros.fechaHasta ?? '') === expectedEnd;
  }

  isCurrentMonthRange(): boolean {
    const filtros = this.filtrosForm.getRawValue();
    const monthStart = this.formatDateInput(new Date(this.today.getFullYear(), this.today.getMonth(), 1));
    const monthEnd = this.formatDateInput(
      new Date(this.today.getFullYear(), this.today.getMonth() + 1, 0),
    );

    return (filtros.fechaDesde ?? '') === monthStart && (filtros.fechaHasta ?? '') === monthEnd;
  }

  formatCurrency(value: number): string {
    return this.currencyFormatter.format(value);
  }

  trackPago(_index: number, row: PagoRealizadoRow): number {
    return row.detalleId;
  }

  private buildPagos(transacciones: TransaccionListado[]): PagoRealizadoRow[] {
    return transacciones
      .flatMap((transaccion) =>
        this.getParticipantesDetalleForReport(transaccion)
          .filter((detalle) => this.isDetallePagoRealizado(detalle, transaccion))
          .map((detalle) => this.mapPagoRow(transaccion, detalle)),
      )
      .sort((left, right) => {
        if (left.fechaPago !== right.fechaPago) {
          return right.fechaPago.localeCompare(left.fechaPago);
        }

        if (left.transaccionId !== right.transaccionId) {
          return right.transaccionId - left.transaccionId;
        }

        return right.detalleId - left.detalleId;
      });
  }

  private buildMetodoPagoOptions(rows: PagoRealizadoRow[]): SelectOption[] {
    const seen = new Set<string>();
    const options: SelectOption[] = [];

    for (const row of rows) {
      const value = String(row.metodoPagoId ?? '');

      if (!value || seen.has(value)) {
        continue;
      }

      seen.add(value);
      options.push({ value, label: row.metodoPagoNombre });
    }

    return options.sort((left, right) => left.label.localeCompare(right.label));
  }

  private buildParticipanteOptions(rows: PagoRealizadoRow[]): SelectOption[] {
    const seen = new Set<string>();
    const options: SelectOption[] = [];

    for (const row of rows) {
      if (seen.has(row.participanteKey)) {
        continue;
      }

      seen.add(row.participanteKey);
      options.push({ value: row.participanteKey, label: row.participanteNombre });
    }

    return options.sort((left, right) => left.label.localeCompare(right.label));
  }

  private applyFilters(): void {
    const { fechaDesde, fechaHasta, metodoPagoId, participanteKey } =
      this.filtrosForm.getRawValue();

    this.filteredPagos = this.pagos.filter((row) => {
      if (fechaDesde && row.fechaPago < fechaDesde) {
        return false;
      }

      if (fechaHasta && row.fechaPago > fechaHasta) {
        return false;
      }

      if (metodoPagoId && String(row.metodoPagoId ?? '') !== metodoPagoId) {
        return false;
      }

      if (participanteKey && row.participanteKey !== participanteKey) {
        return false;
      }

      return true;
    });
  }

  private getParticipantesDetalleForReport(
    transaccion: Pick<TransaccionListado, 'es_propietario' | 'participantes_detalle'> | null | undefined,
  ): ParticipanteDetalleListado[] {
    const detalles = Array.isArray(transaccion?.participantes_detalle)
      ? transaccion.participantes_detalle.filter(
          (detalle) => detalle.id_estado !== ESTADO_TRANSACCION_ANULADA_ID,
        )
      : [];

    if (transaccion?.es_propietario) {
      return detalles;
    }

    const detallesAsociados = detalles.filter((detalle) =>
      this.isDetalleDelUsuarioLogueado(detalle, false),
    );

    return detallesAsociados.length > 0 ? detallesAsociados : detalles;
  }

  private isDetallePagoRealizado(
    detalle: ParticipanteDetalleListado,
    transaccion: Pick<TransaccionListado, 'fecha_ultimo_pago'>,
  ): boolean {
    if (detalle.id_estado === ESTADO_TRANSACCION_ANULADA_ID) {
      return false;
    }

    const totalPagado = Number(detalle.monto_pagado ?? 0) + Number(detalle.interes_pagado ?? 0);
    const fechaPago = this.normalizeDateOnly(detalle.fecha_pago ?? transaccion.fecha_ultimo_pago);

    return totalPagado > 0 && Boolean(fechaPago);
  }

  private mapPagoRow(
    transaccion: TransaccionListado,
    detalle: ParticipanteDetalleListado,
  ): PagoRealizadoRow {
    const metodoPagoId = this.resolveMetodoPagoId(detalle, transaccion);
    const fechaPago = this.normalizeDateOnly(detalle.fecha_pago ?? transaccion.fecha_ultimo_pago) ?? '';
    const montoPagado = Number(detalle.monto_pagado ?? 0);
    const interesPagado = Number(detalle.interes_pagado ?? 0);

    return {
      detalleId: detalle.id,
      transaccionId: transaccion.id_transaccion,
      descripcion: this.getTransaccionTitle(transaccion),
      fechaPago,
      fechaPagoLabel: this.formatDateLabel(fechaPago),
      metodoPagoId,
      metodoPagoNombre: this.resolveMetodoPagoNombre(detalle, transaccion, metodoPagoId),
      participanteKey: this.getParticipanteKey(detalle),
      participanteNombre: this.getParticipanteNombre(detalle),
      cuotaLabel: `${detalle.numero_cuota}/${detalle.total_cuotas}`,
      montoCuota: Number(detalle.monto ?? 0),
      montoPagado,
      interesPagado,
      totalPagado: montoPagado + interesPagado,
      estadoNombre: detalle.nombre_estado?.trim() || 'Sin estado',
    };
  }

  private resolveMetodoPagoId(
    detalle: ParticipanteDetalleListado,
    transaccion: TransaccionListado,
  ): number | null {
    const methodId = Number(detalle.id_metodo_pago ?? transaccion.id_metodo_pago);
    return Number.isFinite(methodId) && methodId > 0 ? methodId : null;
  }

  private resolveMetodoPagoNombre(
    detalle: ParticipanteDetalleListado,
    transaccion: TransaccionListado,
    metodoPagoId: number | null,
  ): string {
    const methodName =
      transaccion.nombre_forma_pago?.trim() || detalle.nombre_forma_pago?.trim();

    if (methodName) {
      return methodName;
    }

    return metodoPagoId === null ? 'Sin metodo asignado' : `Metodo #${metodoPagoId}`;
  }

  private getParticipanteKey(detalle: ParticipanteDetalleListado): string {
    return detalle.es_titular
      ? `titular:${detalle.id_participante}`
      : `participante:${detalle.id_participante}`;
  }

  private getParticipanteNombre(detalle: ParticipanteDetalleListado): string {
    if (detalle.es_titular) {
      return (
        this.currentUserParticipante?.nombre_participante ||
        this.userProfile.fullName ||
        this.userProfile.username ||
        'Titular'
      );
    }

    return detalle.nombre_participante?.trim() || 'Participante';
  }

  private isDetalleDelUsuarioLogueado(
    detalle: ParticipanteDetalleListado,
    transaccionEsPropietario = false,
  ): boolean {
    const currentUserParticipanteId = this.currentUserParticipante?.id_participante ?? null;

    return (
      detalle.id_usuario_relacionado === this.currentUserId ||
      (currentUserParticipanteId !== null &&
        detalle.id_participante === currentUserParticipanteId) ||
      (transaccionEsPropietario && detalle.es_titular)
    );
  }

  private getTransaccionTitle(
    transaccion: Pick<TransaccionListado, 'descripcion' | 'id_transaccion'> | null | undefined,
  ): string {
    const descripcion = transaccion?.descripcion?.trim();
    return descripcion && descripcion.length > 0
      ? descripcion
      : `Sin descripcion (${transaccion?.id_transaccion ?? '-'})`;
  }

  private normalizeText(value: string | null | undefined): string {
    return (value ?? '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim()
      .toLowerCase();
  }

  private normalizeDateOnly(value: string | null | undefined): string | null {
    if (!value) {
      return null;
    }

    const normalizedValue = value.trim();
    const match = normalizedValue.match(/^(\d{4})-(\d{2})-(\d{2})/);

    if (match) {
      return `${match[1]}-${match[2]}-${match[3]}`;
    }

    return null;
  }

  private formatDateInput(value: Date): string {
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, '0');
    const day = String(value.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  private formatDateLabel(value: string): string {
    if (!value) {
      return '-';
    }

    const [year, month, day] = value.split('-');
    return `${day}/${month}/${year}`;
  }
}
