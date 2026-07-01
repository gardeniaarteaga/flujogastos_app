import { DecimalPipe, NgClass, NgFor, NgIf } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Component, DestroyRef, HostListener, OnInit, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink, RouterLinkActive } from '@angular/router';
import { firstValueFrom, timeout } from 'rxjs';

import { apiUrl } from '../../shared/config/api.config';
import { SessionStripComponent } from '../../shared/session-strip/session-strip.component';
import { PagosEstadoResolvedData } from './pagos-realizados.resolver';
import {
  CatalogoFormaPago,
  CatalogoParticipante,
  CatalogosTransaccionService,
} from '../../shared/services/catalogos-transaccion.service';
import { getCurrentUserId, isAdminUser, loadUserProfile } from '../../shared/user-profile';

const ESTADO_TRANSACCION_ANULADA_ID = 2;
const ESTADOS_REPORTE_PERMITIDOS = new Set(['pagado', 'pendiente']);

type EstadoReportePago = 'pagado' | 'pendiente';

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
  id_usuario_origen?: number | null;
  enviado_por?: string | null;
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
  tasa_interes_anual?: number | null;
}

interface PagoRealizadoRow {
  detalleId: number;
  transaccionId: number;
  descripcion: string;
  fechaReferencia: string;
  fechaReferenciaLabel: string;
  fechaProgramada: string;
  fechaProgramadaLabel: string;
  fechaPago: string;
  fechaPagoLabel: string;
  metodoPagoId: number | null;
  metodoPagoNombre: string;
  enviadorNombre: string | null;
  esParticipanteAsignado: boolean;
  esTitular: boolean;
  participanteKey: string;
  participanteNombre: string;
  cuotaLabel: string;
  montoCuota: number;
  montoPendiente: number;
  montoPagado: number;
  interesPagado: number;
  interesPendiente: number;
  totalPagado: number;
  estadoNombre: string;
  estadoKey: EstadoReportePago;
  isVencido: boolean;
  transaccionData: TransaccionListado;
}

interface SelectOption {
  value: string;
  label: string;
}

interface ParticipanteGroup {
  participanteKey: string;
  label: string;
  isTitular: boolean;
  totalPagado: number;
  totalPendiente: number;
  cuotasPagadas: number;
  cuotasPendientes: number;
  cuotasTotal: number;
  rows: PagoRealizadoRow[];
}

@Component({
  selector: 'app-pagos-realizados-page',
  imports: [
    RouterLink,
    RouterLinkActive,
    ReactiveFormsModule,
    NgClass,
    NgIf,
    NgFor,
    DecimalPipe,
    SessionStripComponent,
  ],
  templateUrl: './pagos-realizados.page.html',
  styleUrl: './pagos-realizados.page.css',
})
export class PagosRealizadosPage implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly http = inject(HttpClient);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
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
  readonly currentMonthStart = this.formatDateInput(new Date(this.today.getFullYear(), this.today.getMonth(), 1));
  readonly currentMonthEnd = this.formatDateInput(new Date(this.today.getFullYear(), this.today.getMonth() + 1, 0));
  readonly pageSize = 25;
  readonly filtrosForm = this.fb.group({
    fechaDesde: [this.currentMonthStart],
    fechaHasta: [this.currentMonthEnd],
    metodoPagoId: [''],
    participanteKey: [''],
    incluirPagados: [true],
    incluirPendientes: [false],
  });

  sidebarCollapsed = false;
  resumenOpen = false;
  maintenanceOpen = false;
  reportesOpen = false;
  loading = false;
  errorMessage = '';
  currentUserId = getCurrentUserId();
  currentPage = 1;
  pagos: PagoRealizadoRow[] = [];
  filteredPagos: PagoRealizadoRow[] = [];
  formasPago: CatalogoFormaPago[] = [];
  participantes: CatalogoParticipante[] = [];
  metodoPagoOptions: SelectOption[] = [];
  participanteOptions: SelectOption[] = [];
  readonly activeMethodFilters = new Map<string, number | null>();
  readonly fechaSortOrders = new Map<string, 'asc' | 'desc'>();
  readonly groupCurrentPages = new Map<string, number>();
  readonly expandedGroups = new Set<string>();
  readonly groupPageSize = 10;
  private lastParticipanteKey: string | null = null;
  detailModalTransaccion: TransaccionListado | null = null;
  detailModalLoading = false;

  get isAdminSession(): boolean {
    return isAdminUser();
  }

  get isResumenMenuOpen(): boolean {
    return this.isCurrentRouteIn([
      '/transacciones/listado',
      '/resumen/detalle-transacciones',
      '/resumen/notificaciones',
    ]);
  }

  get isMaintenanceMenuOpen(): boolean {
    return this.isCurrentRouteIn([
      '/categorias',
      '/formas-pago',
      '/participantes',
      '/subcategorias',
      '/entidades-financieras',
      '/tipo-entidad',
      '/tipo-producto',
      '/usuarios',
    ]);
  }

  get isReportesMenuOpen(): boolean {
    return this.isCurrentRouteIn([
      '/reportes/analisis-financiero',
      '/reportes/gastos-por-categoria',
      '/reportes/pagos-realizados',
    ]);
  }

  get fechaColumnSuffix(): string {
    const { incluirPagados, incluirPendientes } = this.filtrosForm.getRawValue();
    if (incluirPagados && !incluirPendientes) return 'Pago';
    if (!incluirPagados && incluirPendientes) return 'Programada';
    return '';
  }

  get displayedRows(): PagoRealizadoRow[] {
    return this.groupedPagos.flatMap((group) => this.getGroupFilteredRows(group));
  }

  get totalPagado(): number {
    return this.displayedRows.reduce((sum, row) => sum + row.totalPagado, 0);
  }

  get totalPendiente(): number {
    return this.displayedRows.reduce((sum, row) => sum + row.montoPendiente, 0);
  }

  get totalInteresesPagados(): number {
    return this.displayedRows.reduce((sum, row) => sum + row.interesPagado, 0);
  }

  get groupedPagos(): ParticipanteGroup[] {
    const map = new Map<string, PagoRealizadoRow[]>();

    for (const row of this.filteredPagos) {
      const key = row.participanteKey;
      if (!map.has(key)) {
        map.set(key, []);
      }
      map.get(key)!.push(row);
    }

    return Array.from(map.entries())
      .map(([key, rows]) => {
        const sortedRows = [...rows].sort((a, b) => {
          if (!a.fechaReferencia && !b.fechaReferencia) return 0;
          if (!a.fechaReferencia) return 1;
          if (!b.fechaReferencia) return -1;
          return a.fechaReferencia.localeCompare(b.fechaReferencia);
        });

        const isTitular = rows.some((r) => r.esTitular);
        const nombre = rows[0]?.participanteNombre ?? 'Sin nombre';
        const label = isTitular ? `Titular - ${nombre}` : nombre;
        const cuotasPagadas = rows.filter((r) => r.estadoKey === 'pagado').length;

        return {
          participanteKey: key,
          label,
          isTitular,
          totalPagado: rows.reduce((sum, r) => sum + r.totalPagado, 0),
          totalPendiente: rows.reduce((sum, r) => sum + r.montoPendiente, 0),
          cuotasPagadas,
          cuotasPendientes: rows.length - cuotasPagadas,
          cuotasTotal: rows.length,
          rows: sortedRows,
        };
      })
      .sort((a, b) => {
        if (a.isTitular && !b.isTitular) return -1;
        if (!a.isTitular && b.isTitular) return 1;
        return a.label.localeCompare(b.label);
      });
  }

  get paginationStartRecord(): number {
    return this.filteredPagos.length === 0 ? 0 : (this.currentPage - 1) * this.pageSize + 1;
  }

  get paginationEndRecord(): number {
    return Math.min(this.currentPage * this.pageSize, this.filteredPagos.length);
  }

  get totalPages(): number {
    return Math.max(1, Math.ceil(this.filteredPagos.length / this.pageSize));
  }

  get paginatedFilteredPagos(): PagoRealizadoRow[] {
    const startIndex = (this.currentPage - 1) * this.pageSize;
    return this.filteredPagos.slice(startIndex, startIndex + this.pageSize);
  }

  get visiblePageNumbers(): number[] {
    return Array.from({ length: this.totalPages }, (_value, index) => index + 1);
  }

  get activeFilterChips(): string[] {
    const filtros = this.filtrosForm.getRawValue();
    const chips: string[] = [];

    if (!filtros.fechaDesde && !filtros.fechaHasta) {
      chips.push('Todo');
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

    if (!filtros.incluirPagados && filtros.incluirPendientes) {
      chips.push('Pendiente');
    }

    if (filtros.incluirPagados && !filtros.incluirPendientes) {
      chips.push('Pagado');
    }

    if (!filtros.incluirPagados && !filtros.incluirPendientes) {
      chips.push('Sin estados');
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

  get currentUserParticipanteIds(): Set<number> {
    return new Set(
      this.participantes
        .filter(
          (participante) =>
            participante.id_usuario_titular === this.currentUserId ||
            participante.id_usuario === this.currentUserId ||
            participante.id_usuario_relacionado === this.currentUserId,
        )
        .map((participante) => participante.id_participante),
    );
  }

  get titularParticipanteIds(): Set<number> {
    return new Set(
      this.participantes
        .filter((participante) => this.isTitularScopedParticipante(participante))
        .map((participante) => participante.id_participante),
    );
  }

  constructor() {
    this.filtrosForm.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        this.currentPage = 1;
        this.applyFilters();
      });
  }

  ngOnInit(): void {
    const resolvedData =
      (this.route.snapshot.data['initialData'] as PagosEstadoResolvedData | null) ?? null;

    if (resolvedData) {
      this.applyResolvedData(resolvedData);
      return;
    }

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

      this.applyResolvedData({
        currentUserId: this.currentUserId,
        catalogos,
        transacciones: Array.isArray(transacciones) ? transacciones : [],
      });
    } catch {
      this.pagos = [];
      this.filteredPagos = [];
      this.errorMessage = 'No se pudo cargar el estado de pagos.';
    } finally {
      this.loading = false;
    }
  }

  private applyResolvedData(data: PagosEstadoResolvedData): void {
    this.currentUserId = data.currentUserId > 0 ? data.currentUserId : this.currentUserId;
    this.formasPago = data.catalogos.formasPago;
    this.participantes = data.catalogos.participantes;
    this.pagos = this.buildPagos(
      Array.isArray(data.transacciones) ? (data.transacciones as TransaccionListado[]) : [],
    );
    this.metodoPagoOptions = this.buildMetodoPagoOptions(this.pagos);
    this.participanteOptions = this.buildParticipanteOptions();
    this.applyDefaultParticipanteFilter();
    this.applyFilters();
  }

  toggleMaintenanceMenu(): void {
    this.maintenanceOpen = !this.maintenanceOpen;
    if (this.maintenanceOpen) {
      this.resumenOpen = false;
      this.reportesOpen = false;
    }
  }

  onReportesToggle(open: boolean): void {
    this.reportesOpen = open;
    if (open) {
      this.resumenOpen = false;
      this.maintenanceOpen = false;
    }
  }

  clearFilters(): void {
    this.filtrosForm.setValue({
      fechaDesde: this.currentMonthStart,
      fechaHasta: this.currentMonthEnd,
      metodoPagoId: '',
      participanteKey: this.getDefaultParticipanteKey(),
      incluirPagados: true,
      incluirPendientes: false,
    });
  }

  onEstadoFilterToggle(estado: EstadoReportePago, checked: boolean): void {
    if (estado === 'pagado') {
      this.filtrosForm.patchValue(
        {
          incluirPagados: checked,
          incluirPendientes: !checked,
        },
        { emitEvent: true },
      );
      return;
    }

    this.filtrosForm.patchValue(
      {
        incluirPagados: !checked,
        incluirPendientes: checked,
      },
      { emitEvent: true },
    );
  }

  setTodayFilters(): void {
    this.filtrosForm.patchValue({
      fechaDesde: this.todayFilterValue,
      fechaHasta: this.todayFilterValue,
    });
  }

  setAllFilters(): void {
    this.filtrosForm.patchValue({
      fechaDesde: '',
      fechaHasta: '',
    });
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

  isAllRange(): boolean {
    const filtros = this.filtrosForm.getRawValue();
    return !filtros.fechaDesde && !filtros.fechaHasta;
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

  trackGroup(_index: number, group: ParticipanteGroup): string {
    return group.participanteKey;
  }

  getGroupAvailableMethods(group: ParticipanteGroup): SelectOption[] {
    const seen = new Set<string>();
    const options: SelectOption[] = [];

    for (const row of group.rows) {
      const value = String(row.metodoPagoId ?? '');
      if (!value || seen.has(value)) continue;
      seen.add(value);
      options.push({ value, label: row.metodoPagoNombre });
    }

    return options.sort((a, b) => a.label.localeCompare(b.label));
  }

  getGroupActiveMethodId(groupKey: string): number | null {
    return this.activeMethodFilters.get(groupKey) ?? null;
  }

  setGroupMethodFilter(group: ParticipanteGroup, methodId: number | null): void {
    this.activeMethodFilters.set(group.participanteKey, methodId);
    this.groupCurrentPages.set(group.participanteKey, 1);
  }

  getFechaSortOrder(groupKey: string): 'asc' | 'desc' {
    return this.fechaSortOrders.get(groupKey) ?? 'asc';
  }

  toggleFechaSort(groupKey: string): void {
    const current = this.getFechaSortOrder(groupKey);
    this.fechaSortOrders.set(groupKey, current === 'asc' ? 'desc' : 'asc');
  }

  getGroupFilteredRows(group: ParticipanteGroup): PagoRealizadoRow[] {
    const activeMethod = this.activeMethodFilters.get(group.participanteKey) ?? null;
    const sortOrder = this.getFechaSortOrder(group.participanteKey);
    const filtered = group.rows.filter((row) => {
      if (activeMethod !== null && row.metodoPagoId !== activeMethod) return false;
      return true;
    });

    return [...filtered].sort((a, b) => {
      const cmp = a.fechaReferencia.localeCompare(b.fechaReferencia);
      return sortOrder === 'asc' ? cmp : -cmp;
    });
  }

  getGroupCurrentPage(groupKey: string): number {
    return this.groupCurrentPages.get(groupKey) ?? 1;
  }

  getGroupTotalPages(group: ParticipanteGroup): number {
    return Math.max(1, Math.ceil(this.getGroupFilteredRows(group).length / this.groupPageSize));
  }

  getGroupPagedRows(group: ParticipanteGroup): PagoRealizadoRow[] {
    const filtered = this.getGroupFilteredRows(group);
    const currentPage = this.getGroupCurrentPage(group.participanteKey);
    const start = (currentPage - 1) * this.groupPageSize;
    return filtered.slice(start, start + this.groupPageSize);
  }

  getGroupVisiblePages(group: ParticipanteGroup): number[] {
    const total = this.getGroupTotalPages(group);
    const current = this.getGroupCurrentPage(group.participanteKey);
    const maxVisible = 5;
    if (total <= maxVisible) {
      return Array.from({ length: total }, (_, i) => i + 1);
    }
    let start = Math.max(1, current - Math.floor(maxVisible / 2));
    const end = Math.min(total, start + maxVisible - 1);
    start = Math.max(1, end - maxVisible + 1);
    return Array.from({ length: end - start + 1 }, (_, i) => start + i);
  }

  goToGroupPage(groupKey: string, page: number, totalPages: number): void {
    if (page < 1 || page > totalPages) return;
    this.groupCurrentPages.set(groupKey, page);
  }

  get isOnlyPendienteFilter(): boolean {
    const { incluirPagados, incluirPendientes } = this.filtrosForm.getRawValue();
    return !incluirPagados && Boolean(incluirPendientes);
  }

  get isOnlyPagadoFilter(): boolean {
    const { incluirPagados, incluirPendientes } = this.filtrosForm.getRawValue();
    return Boolean(incluirPagados) && !incluirPendientes;
  }

  getGroupDisplayStats(group: ParticipanteGroup): { cuotasPagadas: number; cuotasPendientes: number; totalPagado: number; totalPendiente: number } {
    const rows = this.getGroupFilteredRows(group);
    const cuotasPagadas = rows.filter((r) => r.estadoKey === 'pagado').length;
    return {
      cuotasPagadas,
      cuotasPendientes: rows.length - cuotasPagadas,
      totalPagado: rows.reduce((sum, r) => sum + r.totalPagado, 0),
      totalPendiente: rows.reduce((sum, r) => sum + r.montoPendiente, 0),
    };
  }

  goToPage(page: number): void {
    if (page < 1 || page > this.totalPages || page === this.currentPage) {
      return;
    }

    this.currentPage = page;
  }

  goToPreviousPage(): void {
    this.goToPage(this.currentPage - 1);
  }

  goToNextPage(): void {
    this.goToPage(this.currentPage + 1);
  }

  openDetailModal(t: TransaccionListado): void {
    this.detailModalTransaccion = t;
    this.detailModalLoading = true;

    firstValueFrom(
      this.http
        .get<TransaccionListado>(`${this.apiUrl}/${t.id_transaccion}`)
        .pipe(timeout(this.timeoutMs)),
    )
      .then((full) => {
        if (
          this.detailModalTransaccion?.id_transaccion === t.id_transaccion &&
          full &&
          Array.isArray(full.participantes_detalle)
        ) {
          this.detailModalTransaccion = { ...t, participantes_detalle: full.participantes_detalle };
        }
      })
      .catch(() => { /* mantiene datos existentes */ })
      .finally(() => {
        this.detailModalLoading = false;
      });
  }

  @HostListener('document:keydown.escape')
  closeDetailModal(): void {
    this.detailModalTransaccion = null;
  }

  getDetailModalTitle(t: TransaccionListado): string {
    return this.getTransaccionTitle(t);
  }

  getModalCompartidoCon(t: TransaccionListado): string | null {
    if (!t.pagocompartido) return null;
    const seen = new Set<string>();
    const nombres: string[] = [];
    for (const d of t.participantes_detalle) {
      if (d.es_titular) continue;
      const nombre = d.nombre_participante?.trim();
      if (!nombre || seen.has(nombre)) continue;
      seen.add(nombre);
      nombres.push(nombre);
    }
    return nombres.length > 0 ? nombres.join(', ') : null;
  }

  isCreditoTransaccion(t: TransaccionListado): boolean {
    if (t.id_tipo_transaccion === 2) return true;
    if (t.id_tipo_transaccion === 1) return false;
    const n = (t.nombre_tipo_transaccion ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    return n === 'credito';
  }

  formatDetalleDate(value: string | null): string {
    return this.formatDateLabel(this.normalizeDateOnly(value) ?? '');
  }

  private buildPagos(transacciones: TransaccionListado[]): PagoRealizadoRow[] {
    return transacciones
      .filter((transaccion) => !this.isIncomeCategory(transaccion.nombre_categoria))
      .flatMap((transaccion) =>
        this.getParticipantesDetalleForReport(transaccion)
          .filter((detalle) => this.isDetalleVisibleEnReporte(detalle))
          .map((detalle) => this.mapPagoRow(transaccion, detalle)),
      )
      .sort((left, right) => {
        const fechaProgramadaComparison = this.compareByClosestDueDate(left, right);

        if (fechaProgramadaComparison !== 0) {
          return fechaProgramadaComparison;
        }

        if (left.transaccionId !== right.transaccionId) {
          return right.transaccionId - left.transaccionId;
        }

        return right.detalleId - left.detalleId;
      });
  }

  private compareByClosestDueDate(left: PagoRealizadoRow, right: PagoRealizadoRow): number {
    if (!left.fechaReferencia && !right.fechaReferencia) {
      return 0;
    }

    if (!left.fechaReferencia) {
      return 1;
    }

    if (!right.fechaReferencia) {
      return -1;
    }

    const today = this.todayFilterValue;
    const leftIsUpcoming = left.fechaReferencia >= today;
    const rightIsUpcoming = right.fechaReferencia >= today;

    if (leftIsUpcoming !== rightIsUpcoming) {
      return leftIsUpcoming ? -1 : 1;
    }

    if (leftIsUpcoming) {
      return left.fechaReferencia.localeCompare(right.fechaReferencia);
    }

    return right.fechaReferencia.localeCompare(left.fechaReferencia);
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

  private buildParticipanteOptions(): SelectOption[] {
    const seen = new Set<string>();

    return this.participantes
      .filter((participante) => this.isTitularScopedParticipante(participante))
      .map((participante) => ({
        value: String(participante.id_participante),
        label: this.getParticipanteDisplayName(participante),
      }))
      .filter((option) => {
        if (seen.has(option.value)) {
          return false;
        }

        seen.add(option.value);
        return true;
      })
      .sort((left, right) => left.label.localeCompare(right.label));
  }

  private applyDefaultParticipanteFilter(): void {
    this.filtrosForm.patchValue({ participanteKey: '' }, { emitEvent: false });
  }

  private getDefaultParticipanteKey(): string {
    const currentUserParticipanteId = this.currentUserParticipante?.id_participante ?? null;

    if (currentUserParticipanteId === null) {
      return '';
    }

    const key = String(currentUserParticipanteId);
    const availableKeys = new Set([
      ...this.participanteOptions.map((option) => option.value),
      ...this.pagos.map((row) => row.participanteKey),
    ]);

    return availableKeys.has(key) ? key : '';
  }

  private applyFilters(): void {
    const {
      fechaDesde,
      fechaHasta,
      metodoPagoId,
      participanteKey,
      incluirPagados,
      incluirPendientes,
    } =
      this.filtrosForm.getRawValue();

    const fechaDesdeISO = this.toISODate(fechaDesde);
    const fechaHastaISO = this.toISODate(fechaHasta);

    this.filteredPagos = this.pagos.filter((row) => {
      if (fechaDesdeISO && row.fechaReferencia < fechaDesdeISO) {
        return false;
      }

      if (fechaHastaISO && row.fechaReferencia > fechaHastaISO) {
        return false;
      }

      if (metodoPagoId && String(row.metodoPagoId ?? '') !== metodoPagoId) {
        return false;
      }

      if (participanteKey && row.participanteKey !== participanteKey) {
        return false;
      }

      if (!incluirPagados && !incluirPendientes) {
        return false;
      }

      if (!incluirPagados && row.estadoKey === 'pagado') {
        return false;
      }

      if (!incluirPendientes && row.estadoKey === 'pendiente') {
        return false;
      }

      return true;
    });

    this.currentPage = Math.min(this.currentPage, this.totalPages);

    if (this.currentPage < 1) {
      this.currentPage = 1;
    }

    this.groupCurrentPages.clear();

    const currentKey = participanteKey ?? '';
    if (currentKey !== (this.lastParticipanteKey ?? '')) {
      if (currentKey) {
        for (const group of this.groupedPagos) {
          this.expandedGroups.add(group.participanteKey);
        }
      } else {
        this.expandedGroups.clear();
      }
    }
    this.lastParticipanteKey = currentKey;
  }

  onGroupToggle(groupKey: string, open: boolean): void {
    if (open) {
      this.expandedGroups.add(groupKey);
    } else {
      this.expandedGroups.delete(groupKey);
    }
  }

  private getParticipantesDetalleForReport(
    transaccion: Pick<TransaccionListado, 'es_propietario' | 'participantes_detalle'> | null | undefined,
  ): ParticipanteDetalleListado[] {
    const detalles = Array.isArray(transaccion?.participantes_detalle)
      ? transaccion.participantes_detalle.filter(
          (detalle) => detalle.id_estado !== ESTADO_TRANSACCION_ANULADA_ID,
        )
      : [];

    return detalles.filter((detalle) =>
      this.isDetalleDelUsuarioLogueado(detalle, Boolean(transaccion?.es_propietario)),
    );
  }

  private isDetalleVisibleEnReporte(detalle: ParticipanteDetalleListado): boolean {
    if (detalle.id_estado === ESTADO_TRANSACCION_ANULADA_ID) {
      return false;
    }

    return this.resolveEstadoKey(detalle) !== null;
  }

  private mapPagoRow(
    transaccion: TransaccionListado,
    detalle: ParticipanteDetalleListado,
  ): PagoRealizadoRow {
    const estadoKey = this.resolveEstadoKey(detalle) ?? 'pendiente';
    const metodoPagoId = this.resolveMetodoPagoId(detalle, transaccion);
    const fechaProgramada = this.resolveFechaProgramada(detalle) ?? '';
    const fechaPago = this.resolveFechaPago(detalle) ?? '';
    const fechaReferencia =
      (estadoKey === 'pagado' ? fechaPago : '') || fechaProgramada || fechaPago || this.normalizeDateOnly(transaccion.fecha) || '';
    const montoPagado = Number(detalle.monto_pagado ?? 0);
    const interesPagado = Number(detalle.interes_pagado ?? 0);
    const interesPendiente = Number(detalle.interes_pendiente ?? 0);
    const montoPendiente = Number(detalle.saldo_pendiente ?? 0);
    const isVencido =
      estadoKey !== 'pagado' &&
      fechaProgramada.length > 0 &&
      new Date(fechaProgramada + 'T00:00:00') < new Date(new Date().toDateString());

    return {
      detalleId: detalle.id,
      transaccionId: transaccion.id_transaccion,
      descripcion: this.getTransaccionTitle(transaccion),
      fechaReferencia,
      fechaReferenciaLabel: this.formatDateLabel(fechaReferencia),
      fechaProgramada,
      fechaProgramadaLabel: this.formatDateLabel(fechaProgramada),
      fechaPago,
      fechaPagoLabel: this.formatDateLabel(fechaPago),
      metodoPagoId,
      metodoPagoNombre: this.resolveMetodoPagoNombre(detalle, transaccion, metodoPagoId),
      enviadorNombre: this.resolveTransactionSenderFirstName(transaccion, detalle),
      esParticipanteAsignado: !detalle.es_titular,
      esTitular: detalle.es_titular,
      participanteKey: this.getParticipanteKey(detalle),
      participanteNombre: this.getParticipanteNombre(detalle),
      cuotaLabel: `${detalle.numero_cuota}/${detalle.total_cuotas}`,
      montoCuota: Number(detalle.monto ?? 0),
      montoPendiente,
      montoPagado,
      interesPagado,
      interesPendiente,
      totalPagado: montoPagado + interesPagado,
      estadoNombre: this.resolveEstadoNombre(detalle, estadoKey),
      estadoKey,
      isVencido,
      transaccionData: transaccion,
    };
  }

  private resolveEstadoKey(detalle: ParticipanteDetalleListado): EstadoReportePago | null {
    const normalizedEstado = this.normalizeText(detalle.nombre_estado);

    if (ESTADOS_REPORTE_PERMITIDOS.has(normalizedEstado)) {
      return normalizedEstado as EstadoReportePago;
    }

    if (Number(detalle.saldo_pendiente ?? 0) > 0) {
      return 'pendiente';
    }

    if (Number(detalle.monto_pagado ?? 0) + Number(detalle.interes_pagado ?? 0) > 0) {
      return 'pagado';
    }

    return null;
  }

  private resolveEstadoNombre(
    detalle: Pick<ParticipanteDetalleListado, 'nombre_estado'>,
    estadoKey: EstadoReportePago,
  ): string {
    const estadoNombre = detalle.nombre_estado?.trim();

    if (estadoNombre && ESTADOS_REPORTE_PERMITIDOS.has(this.normalizeText(estadoNombre))) {
      return estadoNombre;
    }

    return estadoKey === 'pagado' ? 'Pagado' : 'Pendiente';
  }

  private resolveFechaProgramada(
    detalle: Pick<ParticipanteDetalleListado, 'fecha_programada'>,
  ): string | null {
    return this.normalizeDateOnly(detalle.fecha_programada);
  }

  private resolveFechaPago(detalle: Pick<ParticipanteDetalleListado, 'fecha_pago'>): string | null {
    return this.normalizeDateOnly(detalle.fecha_pago);
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
      detalle.nombre_forma_pago?.trim() ||
      (metodoPagoId !== null
        ? this.formasPago.find((item) => item.id_forma === metodoPagoId)?.nombre_forma?.trim()
        : null) ||
      transaccion.nombre_forma_pago?.trim();

    if (methodName) {
      return methodName;
    }

    return metodoPagoId === null ? 'Sin metodo asignado' : `Metodo #${metodoPagoId}`;
  }

  private getParticipanteKey(detalle: ParticipanteDetalleListado): string {
    return String(detalle.id_participante);
  }

  private getParticipanteNombre(
    detalle: Pick<ParticipanteDetalleListado, 'es_titular' | 'nombre_participante' | 'id_participante'>,
  ): string {
    if (detalle.es_titular) {
      return (
        this.currentUserParticipante?.nombre_participante ||
        this.userProfile.fullName ||
        this.userProfile.username ||
        'Titular'
      );
    }

    return (
      detalle.nombre_participante?.trim() ||
      this.participantes.find((participante) => participante.id_participante === detalle.id_participante)
        ?.nombre_participante?.trim() ||
      'Participante'
    );
  }

  openWhatsApp(group: ParticipanteGroup): void {
    window.open(this.buildWhatsAppUrl(group), '_blank', 'noopener,noreferrer');
  }

  buildWhatsAppUrl(group: ParticipanteGroup): string {
    const rows = this.getGroupFilteredRows(group);
    const totalPendiente = rows.reduce((sum, r) => sum + r.montoPendiente, 0);
    const totalPagado = rows.reduce((sum, r) => sum + r.totalPagado, 0);

    const byMethod = new Map<string, { pendiente: number; pagado: number }>();
    for (const row of rows) {
      const key = row.metodoPagoNombre;
      if (!byMethod.has(key)) byMethod.set(key, { pendiente: 0, pagado: 0 });
      const entry = byMethod.get(key)!;
      entry.pendiente += row.montoPendiente;
      entry.pagado += row.totalPagado;
    }

    const lines: string[] = [
      `*Estado de Pagos*`,
      `Hola ${group.label}`,
      '',
      `*Saldo por metodo de pago:*`,
    ];

    for (const [method, totals] of byMethod.entries()) {
      const parts: string[] = [];
      if (totals.pendiente > 0) parts.push(`Pendiente: *${this.formatCurrency(totals.pendiente)}*`);
      if (totals.pagado > 0) parts.push(`Pagado: *${this.formatCurrency(totals.pagado)}*`);
      lines.push(`• *${method}* - ${parts.join(' | ')}`);
    }

    lines.push('');
    if (totalPendiente > 0) lines.push(`*Total pendiente: ${this.formatCurrency(totalPendiente)}*`);
    if (totalPagado > 0) lines.push(`*Total pagado: ${this.formatCurrency(totalPagado)}*`);

    lines.push('');
    lines.push(`*Detalle:*`);
    lines.push('```');

    const D = 14;
    const F = 10;
    const M = 11;
    const A = 9;
    const E = 9;

    lines.push(
      `${'Fecha'.padEnd(F)}  ${'Descripcion'.padEnd(D)}  ${'Metodo'.padEnd(M)}  ${'Monto'.padStart(A)}  Estado`,
    );
    lines.push(`${'-'.repeat(F)}  ${'-'.repeat(D)}  ${'-'.repeat(M)}  ${'-'.repeat(A)}  ${'-'.repeat(E)}`);

    const sortedRows = [...rows].sort((a, b) => a.metodoPagoNombre.localeCompare(b.metodoPagoNombre));

    for (const row of sortedRows) {
      const fecha = (row.fechaProgramadaLabel !== '-' ? row.fechaProgramadaLabel : row.fechaReferenciaLabel).padEnd(F);
      const desc = row.descripcion.length > D
        ? row.descripcion.substring(0, D - 1) + '.'
        : row.descripcion.padEnd(D);
      const metodo = row.metodoPagoNombre.length > M
        ? row.metodoPagoNombre.substring(0, M - 1) + '.'
        : row.metodoPagoNombre.padEnd(M);
      const montoVal = row.estadoKey === 'pendiente' ? row.montoPendiente : row.totalPagado;
      const monto = this.formatCurrency(montoVal).padStart(A);
      const estado = row.estadoKey === 'pendiente' ? (row.isVencido ? 'Vencido' : 'Pendiente') : 'Pagado';
      lines.push(`${fecha}  ${desc}  ${metodo}  ${monto}  ${estado}`);
    }

    lines.push('```');

    const message = encodeURIComponent(lines.join('\n'));
    const celular = this.getParticipanteCelular(group.participanteKey);
    const phone = celular ? celular.replace(/\D/g, '') : '';

    return `https://wa.me/${phone}?text=${message}`;
  }

  private getParticipanteCelular(participanteKey: string): string | null {
    const id = Number(participanteKey);
    const participante = this.participantes.find((p) => p.id_participante === id);
    return participante?.celular ?? null;
  }

  private resolveTransactionSenderFirstName(
    transaccion: Pick<
      TransaccionListado,
      'enviado_por' | 'titular'
    >,
    detalle: Pick<ParticipanteDetalleListado, 'es_titular'>,
  ): string | null {
    if (!detalle.es_titular) {
      return null;
    }

    const directSender = transaccion.enviado_por?.trim();

    if (!directSender) {
      return null;
    }

    const normalizedSender = this.normalizeText(directSender);
    const ownAliases = new Set(
      [
        this.currentUserParticipante?.nombre_participante,
        this.userProfile.fullName,
        this.userProfile.username,
        transaccion.titular,
      ]
        .map((value) => this.normalizeText(value))
        .filter((value) => value.length > 0),
    );

    return ownAliases.has(normalizedSender) ? null : directSender;
  }



  private getParticipanteDisplayName(
    participante: Pick<
      CatalogoParticipante,
      'nombre_participante' | 'id_usuario_relacionado' | 'id_usuario_titular'
    >,
  ): string {
    return this.isParticipanteAsociado(participante)
      ? `${participante.nombre_participante} ★`
      : participante.nombre_participante;
  }

  private isParticipanteAsociado(
    participante:
      | Pick<CatalogoParticipante, 'id_usuario_relacionado' | 'id_usuario_titular'>
      | null
      | undefined,
  ): boolean {
    return Boolean(
      participante?.id_usuario_relacionado ?? participante?.id_usuario_titular ?? null,
    );
  }

  private isDetalleDelUsuarioLogueado(
    detalle: ParticipanteDetalleListado,
    transaccionEsPropietario = false,
  ): boolean {
    return (
      this.titularParticipanteIds.has(detalle.id_participante) ||
      (transaccionEsPropietario && detalle.es_titular)
    );
  }

  private isTitularScopedParticipante(
    participante:
      | Pick<CatalogoParticipante, 'id_participante' | 'id_usuario' | 'id_usuario_titular'>
      | null
      | undefined,
  ): boolean {
    return (
      Number(participante?.id_usuario ?? 0) === this.currentUserId ||
      Number(participante?.id_usuario_titular ?? 0) === this.currentUserId
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

  private isCurrentRouteIn(routes: string[]): boolean {
    const currentUrl = this.router.url.split('?')[0];
    return routes.some((route) => currentUrl === route || currentUrl.startsWith(`${route}/`));
  }

  private isIncomeCategory(categoryName: string | null | undefined): boolean {
    return this.normalizeText(categoryName) === 'ingresos';
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
    return `${day}/${month}/${year}`;
  }

  toISODate(value: string | null | undefined): string {
    if (!value) return '';
    const parts = value.split('/');
    if (parts.length !== 3) return '';
    const [day, month, year] = parts;
    if (!day || !month || !year || year.length !== 4) return '';
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }

  onDatePickerChange(event: Event, controlName: 'fechaDesde' | 'fechaHasta'): void {
    const isoValue = (event.target as HTMLInputElement).value;
    if (!isoValue) {
      this.filtrosForm.get(controlName)?.setValue('', { emitEvent: true });
      return;
    }
    const [year, month, day] = isoValue.split('-');
    this.filtrosForm.get(controlName)?.setValue(`${day}/${month}/${year}`, { emitEvent: true });
  }

  onDateInput(event: Event, controlName: 'fechaDesde' | 'fechaHasta'): void {
    const input = event.target as HTMLInputElement;
    const digits = input.value.replace(/\D/g, '').slice(0, 8);
    let formatted = digits;
    if (digits.length > 2) formatted = digits.slice(0, 2) + '/' + digits.slice(2);
    if (digits.length > 4) formatted = digits.slice(0, 2) + '/' + digits.slice(2, 4) + '/' + digits.slice(4);
    input.value = formatted;
    this.filtrosForm.get(controlName)?.setValue(formatted, { emitEvent: true });
  }

  private formatDateLabel(value: string): string {
    if (!value) return '-';
    const parts = value.split('-');
    if (parts.length < 3 || !parts[0] || !parts[1] || !parts[2]) return '-';
    const [year, month, day] = parts;
    return `${day.padStart(2, '0')}/${month.padStart(2, '0')}/${year}`;
  }
}
