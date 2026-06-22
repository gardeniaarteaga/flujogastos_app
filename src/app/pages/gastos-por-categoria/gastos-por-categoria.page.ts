import { NgClass, NgFor, NgIf } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Component, DestroyRef, HostListener, OnInit, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink, RouterLinkActive } from '@angular/router';
import { firstValueFrom, timeout } from 'rxjs';

import { apiUrl } from '../../shared/config/api.config';
import { SessionStripComponent } from '../../shared/session-strip/session-strip.component';
import {
  CatalogoFormaPago,
  CatalogoParticipante,
  CatalogosTransaccionService,
} from '../../shared/services/catalogos-transaccion.service';
import { getCurrentUserId, isAdminUser, loadUserProfile } from '../../shared/user-profile';
import { AnalisisFinancieroResolvedData } from '../analisis-financiero/analisis-financiero.resolver';

type ReportPeriodType = 'month' | 'quincena';
type ReportQuincena = 'first' | 'second';
type ExpenseSourceType = 'own' | 'assigned';

interface ReportPeriodRange {
  type: ReportPeriodType;
  start: Date;
  end: Date;
  label: string;
  descriptionLabel: string;
}

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
  cuotas_sin_intereses?: boolean;
  tasa_interes_anual?: number | null;
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
  enviado_por?: string | null;
  titular: string | null;
  remitente?: string | null;
  nombre_titular?: string | null;
  nombre_remitente?: string | null;
  cantidad_participantes: number;
  participantes_detalle: ParticipanteDetalleListado[];
}

interface NormalizedDetailAmounts {
  baseAmount: number;
  amountPaid: number;
  interestPaid: number;
  interestPending: number;
  pendingDebt: number;
  totalAmount: number;
}

interface SelectOption {
  value: string;
  label: string;
}

interface ExpenseRecord {
  id: string;
  transactionId: number;
  analysisDate: Date;
  amount: number;
  categoryId: number;
  categoryName: string;
  subcategoryId: number | null;
  subcategoryName: string;
  description: string;
  statusName: string;
  paymentMethodName: string;
  originLabel: string;
  sourceType: ExpenseSourceType;
}

interface CategorySubcategoryBreakdown {
  key: string;
  name: string;
  amount: number;
  count: number;
  shareOfCategory: number;
  shareOfTotal: number;
  ownAmount: number;
  assignedAmount: number;
}

interface SubcategoryTransactionModalData {
  categoryKey: string;
  categoryName: string;
  subcategoryKey: string;
  subcategoryName: string;
  periodLabel: string;
  totalAmount: number;
  ownAmount: number;
  assignedAmount: number;
  totalTransactions: number;
  transactions: ExpenseRecord[];
}

interface CategoryBreakdown {
  key: string;
  name: string;
  amount: number;
  count: number;
  share: number;
  ownAmount: number;
  assignedAmount: number;
  color: string;
  subcategories: CategorySubcategoryBreakdown[];
}

interface ReportKpiCard {
  label: string;
  value: number;
  displayValue?: string;
  helper: string;
  tone: 'good' | 'info' | 'warning' | 'neutral';
}

interface ExpenseCategoryReport {
  hasData: boolean;
  periodLabel: string;
  summary: string;
  totalExpense: number;
  ownExpense: number;
  assignedExpense: number;
  categoriesCount: number;
  subcategoriesCount: number;
  kpis: ReportKpiCard[];
  categories: CategoryBreakdown[];
  selectedCategory: CategoryBreakdown | null;
  categoryDonutStyle: string;
  categoryDonutCenter: string;
}

@Component({
  selector: 'app-gastos-por-categoria-page',
  imports: [
    RouterLink,
    RouterLinkActive,
    ReactiveFormsModule,
    NgIf,
    NgFor,
    NgClass,
    SessionStripComponent,
  ],
  templateUrl: './gastos-por-categoria.page.html',
  styleUrl: './gastos-por-categoria.page.css',
})
export class GastosPorCategoriaPage implements OnInit {
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
  private readonly percentFormatter = new Intl.NumberFormat('es-SV', {
    style: 'percent',
    minimumFractionDigits: 0,
    maximumFractionDigits: 1,
  });
  private readonly monthFormatter = new Intl.DateTimeFormat('es-SV', {
    month: 'long',
    year: 'numeric',
  });
  private readonly monthNameFormatter = new Intl.DateTimeFormat('es-SV', {
    month: 'long',
  });
  private readonly chartColors = ['#2563eb', '#f97316', '#dc2626', '#0f766e', '#7c3aed', '#ca8a04'];

  readonly monthOptions: SelectOption[] = Array.from({ length: 12 }, (_, index) => ({
    value: String(index + 1),
    label: this.capitalizeText(this.monthNameFormatter.format(new Date(2024, index, 1))),
  }));
  readonly periodTypeOptions: Array<{ value: ReportPeriodType; label: string }> = [
    { value: 'month', label: 'Mes' },
    { value: 'quincena', label: 'Quincena' },
  ];
  readonly quincenaOptions: Array<{ value: ReportQuincena; label: string }> = [
    { value: 'first', label: '1 - 15' },
    { value: 'second', label: '16 - fin de mes' },
  ];
  readonly userProfile = loadUserProfile();
  readonly filtrosForm = this.fb.group({
    periodType: ['month' as ReportPeriodType],
    month: [String(new Date().getMonth() + 1)],
    year: [String(new Date().getFullYear())],
    quincena: [this.getDefaultQuincena()],
  });

  loading = false;
  errorMessage = '';
  sidebarCollapsed = false;
  maintenanceOpen = false;
  reportesOpen = false;
  currentUserId = getCurrentUserId();
  years: SelectOption[] = [];
  report: ExpenseCategoryReport = this.createEmptyReport();
  selectedCategoryKey = '';
  private subcategoryDetailModalOpenState = false;
  public subcategoryDetailModalData: SubcategoryTransactionModalData =
    this.createEmptySubcategoryDetailModalData();

  private formasPago: CatalogoFormaPago[] = [];
  private participantes: CatalogoParticipante[] = [];
  private records: ExpenseRecord[] = [];

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

  get selectedPeriodType(): ReportPeriodType {
    return this.filtrosForm.controls.periodType.value === 'quincena' ? 'quincena' : 'month';
  }

  get isSubcategoryDetailModalOpen(): boolean {
    return this.subcategoryDetailModalOpenState;
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

  ngOnInit(): void {
    this.filtrosForm.valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      this.rebuildReport();
    });

    this.route.data.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((data) => {
      const resolvedData = (data['initialData'] as AnalisisFinancieroResolvedData | null) ?? null;

      if (resolvedData) {
        this.applyResolvedData(resolvedData);
        return;
      }

      void this.loadPage();
    });
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
        transacciones,
      });
    } catch {
      this.records = [];
      this.years = this.buildYears([]);
      this.report = this.createEmptyReport();
      this.errorMessage =
        'No se pudo construir el reporte de gastos por categoria con la informacion disponible.';
    } finally {
      this.loading = false;
    }
  }

  toggleMaintenanceMenu(): void {
    this.maintenanceOpen = !this.maintenanceOpen;
  }

  onReportesToggle(open: boolean): void {
    this.reportesOpen = open;
  }

  formatCurrency(value: number): string {
    return this.currencyFormatter.format(Number.isFinite(value) ? value : 0);
  }

  formatPercent(value: number): string {
    return this.percentFormatter.format(Number.isFinite(value) ? value : 0);
  }

  formatDate(value: Date | null | undefined): string {
    if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
      return '-';
    }

    const day = String(value.getDate()).padStart(2, '0');
    const month = String(value.getMonth() + 1).padStart(2, '0');
    return `${day}/${month}/${value.getFullYear()}`;
  }

  readonly handleOpenSubcategoryDetailModal = (
    category: CategoryBreakdown,
    subcategory: CategorySubcategoryBreakdown,
  ): void => {
    this.subcategoryDetailModalData = this.buildSubcategoryDetailModalData(
      category.key,
      category.name,
      subcategory.key,
      subcategory.name,
    );
    this.subcategoryDetailModalOpenState = true;
  };

  selectCategory(categoryKey: string): void {
    if (!categoryKey || categoryKey === this.selectedCategoryKey) {
      return;
    }

    this.selectedCategoryKey = categoryKey;
    this.rebuildReport();
  }

  closeSubcategoryDetailModal(): void {
    this.subcategoryDetailModalOpenState = false;
  }

  @HostListener('document:keydown.escape')
  onEscapeKey(): void {
    if (this.isSubcategoryDetailModalOpen) {
      this.closeSubcategoryDetailModal();
    }
  }

  private applyResolvedData(data: AnalisisFinancieroResolvedData): void {
    this.loading = false;
    this.errorMessage = '';
    this.currentUserId = data.currentUserId > 0 ? data.currentUserId : this.currentUserId;
    this.formasPago = data.catalogos.formasPago;
    this.participantes = data.catalogos.participantes;
    this.records = this.buildExpenseRecords(
      this.filterVisibleTransactions(
        Array.isArray(data.transacciones) ? (data.transacciones as TransaccionListado[]) : [],
      ),
    );
    this.years = this.buildYears(this.records);

    if (!this.years.some((item) => item.value === (this.filtrosForm.controls.year.value ?? ''))) {
      this.filtrosForm.controls.year.setValue(this.years[0]?.value ?? String(new Date().getFullYear()), {
        emitEvent: false,
      });
    }

    this.rebuildReport();
  }

  private rebuildReport(): void {
    const period = this.getSelectedPeriodRange();
    const filteredRecords = this.getFilteredRecordsForPeriod(period);

    if (filteredRecords.length === 0) {
      this.report = {
        ...this.createEmptyReport(),
        periodLabel: period.label,
        summary: `No hay gastos visibles para ${period.descriptionLabel}. Solo se consideran movimientos del usuario logueado y cuotas asignadas por otros usuarios al titular, sin anuladas.`,
      };
      if (this.isSubcategoryDetailModalOpen) {
        this.syncSubcategoryDetailModal();
      }
      return;
    }

    const totalExpense = this.roundMoney(
      filteredRecords.reduce((sum, record) => sum + record.amount, 0),
    );
    const ownExpense = this.roundMoney(
      filteredRecords
        .filter((record) => record.sourceType === 'own')
        .reduce((sum, record) => sum + record.amount, 0),
    );
    const assignedExpense = this.roundMoney(
      filteredRecords
        .filter((record) => record.sourceType === 'assigned')
        .reduce((sum, record) => sum + record.amount, 0),
    );
    const categories = this.buildCategoryBreakdowns(filteredRecords, totalExpense);
    const selectedCategory =
      categories.find((item) => item.key === this.selectedCategoryKey) ?? categories[0] ?? null;
    this.selectedCategoryKey = selectedCategory?.key ?? '';

    const subcategoriesCount = new Set(
      categories.flatMap((category) => category.subcategories.map((subcategory) => subcategory.key)),
    ).size;

    this.report = {
      hasData: true,
      periodLabel: period.label,
      summary: '',
      totalExpense,
      ownExpense,
      assignedExpense,
      categoriesCount: categories.length,
      subcategoriesCount,
      kpis: [
        {
          label: 'Gasto total visible',
          value: totalExpense,
          helper: 'Suma del corte seleccionado sin transacciones anuladas.',
          tone: totalExpense > 0 ? 'warning' : 'neutral',
        },
        {
          label: 'Gasto propio del titular',
          value: ownExpense,
          helper: 'Movimientos registrados como propios del usuario logueado.',
          tone: ownExpense > 0 ? 'info' : 'neutral',
        },
        {
          label: 'Asignado por otros usuarios',
          value: assignedExpense,
          helper: 'Cuotas o gastos que otros usuarios cargaron al titular.',
          tone: assignedExpense > 0 ? 'good' : 'neutral',
        },
        {
          label: 'Categorias con movimiento',
          value: categories.length,
          displayValue: String(categories.length),
          helper: `${subcategoriesCount} subcategorias visibles dentro del corte.`,
          tone: 'neutral',
        },
      ],
      categories,
      selectedCategory,
      categoryDonutStyle: this.buildConicGradient(categories),
      categoryDonutCenter: this.formatCurrency(totalExpense),
    };

    if (this.isSubcategoryDetailModalOpen) {
      this.syncSubcategoryDetailModal();
    }
  }

  private buildExpenseRecords(transacciones: TransaccionListado[]): ExpenseRecord[] {
    const formsById = new Map(this.formasPago.map((item) => [item.id_forma, item]));

    return transacciones.flatMap<ExpenseRecord>((transaction) => {
      if (transaction.id_tipo_transaccion === 2) {
        return [];
      }

      const paymentMethod = formsById.get(transaction.id_metodo_pago);
      const categoryName = transaction.nombre_categoria?.trim() || 'Sin categoria';
      const subcategoryName = transaction.nombre_subcategoria?.trim() || 'Sin subcategoria';
      const paymentMethodName =
        transaction.nombre_forma_pago?.trim() ||
        paymentMethod?.nombre_forma?.trim() ||
        'Sin metodo de pago';
      const statusName =
        transaction.nombre_estado?.trim() ||
        transaction.nombre_estado_registro?.trim() ||
        'Sin estado';
      const description = transaction.descripcion?.trim() || 'Sin descripcion';
      const detailRows = this.getParticipantesDetalleForAnalysis(transaction);

      if (detailRows.length === 0) {
        return [];
      }

      return detailRows.reduce<ExpenseRecord[]>((records, detail, index) => {
        const resolvedStatusName = detail.nombre_estado?.trim() || statusName;

        if (!this.isVisiblePaymentStatus(resolvedStatusName)) {
          return records;
        }

        const normalized = this.normalizeDetailAmounts(detail, paymentMethod);
        const analysisDate =
          this.parseDateOnly(detail.fecha_programada) ??
          this.parseDateOnly(detail.fecha_pago) ??
          this.parseDateOnly(transaction.fecha);

        if (!analysisDate) {
          return records;
        }

        records.push({
          id: `expense-${transaction.id_transaccion}-${detail.id || index}`,
          transactionId: transaction.id_transaccion,
          analysisDate,
          amount: normalized.totalAmount,
          categoryId: transaction.id_categoria,
          categoryName,
          subcategoryId: transaction.id_subcategoria,
          subcategoryName,
          description,
          statusName: resolvedStatusName,
          paymentMethodName,
          originLabel: this.resolveExpenseOriginLabel(transaction),
          sourceType: transaction.es_propietario ? 'own' : 'assigned',
        });

        return records;
      }, []);
    });
  }

  private getParticipantesDetalleForAnalysis(
    transaccion: Pick<
      TransaccionListado,
      'es_propietario' | 'id_tipo_transaccion' | 'participantes_detalle'
    > | null | undefined,
  ): ParticipanteDetalleListado[] {
    const detalles = Array.isArray(transaccion?.participantes_detalle)
      ? transaccion.participantes_detalle
      : [];

    const detallesTitular = detalles.filter((detalle) => detalle.es_titular);

    if (transaccion?.id_tipo_transaccion === 2 || transaccion?.es_propietario) {
      return detallesTitular;
    }

    const detallesDelUsuario = detalles.filter((detalle) =>
      this.isDetalleDelUsuarioLogueado(detalle, false),
    );

    return detallesDelUsuario;
  }

  private resolveExpenseOriginLabel(
    transaction: Pick<
      TransaccionListado,
      | 'es_propietario'
      | 'enviado_por'
      | 'remitente'
      | 'nombre_remitente'
      | 'participantes_detalle'
    >,
  ): string {
    if (transaction.es_propietario) {
      return 'Titular';
    }

    const senderName = this.resolveAssignedSenderName(transaction);
    return senderName ? this.extractFirstName(senderName) : 'Participante';
  }

  private resolveAssignedSenderName(
    transaction: Pick<
      TransaccionListado,
      'enviado_por' | 'remitente' | 'nombre_remitente' | 'participantes_detalle'
    >,
  ): string | null {
    const explicitSender =
      transaction.enviado_por?.trim() ||
      transaction.remitente?.trim() ||
      transaction.nombre_remitente?.trim();

    if (explicitSender) {
      return explicitSender;
    }

    const participantSender = (Array.isArray(transaction.participantes_detalle)
      ? transaction.participantes_detalle
      : []
    ).find((detail) => !detail.es_titular && detail.nombre_participante?.trim());

    return participantSender?.nombre_participante?.trim() || null;
  }

  private extractFirstName(value: string | null | undefined): string {
    const normalized = value?.trim() || '';

    if (!normalized) {
      return 'Participante';
    }

    return normalized.split(/\s+/)[0] || 'Participante';
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

  private buildCategoryBreakdowns(
    records: ExpenseRecord[],
    totalAmount: number,
  ): CategoryBreakdown[] {
    const groups = new Map<
      string,
      {
        name: string;
        amount: number;
        count: number;
        ownAmount: number;
        assignedAmount: number;
        subcategories: Map<
          string,
          {
            name: string;
            amount: number;
            count: number;
            ownAmount: number;
            assignedAmount: number;
          }
        >;
      }
    >();

    for (const record of records) {
      const categoryKey = this.buildCategoryKey(record.categoryId, record.categoryName);
      const subcategoryKey = this.buildSubcategoryKey(record.subcategoryId, record.subcategoryName);
      const currentCategory = groups.get(categoryKey) ?? {
        name: record.categoryName,
        amount: 0,
        count: 0,
        ownAmount: 0,
        assignedAmount: 0,
        subcategories: new Map<
          string,
          {
            name: string;
            amount: number;
            count: number;
            ownAmount: number;
            assignedAmount: number;
          }
        >(),
      };

      currentCategory.amount += record.amount;
      currentCategory.count += 1;

      if (record.sourceType === 'own') {
        currentCategory.ownAmount += record.amount;
      } else {
        currentCategory.assignedAmount += record.amount;
      }

      const currentSubcategory = currentCategory.subcategories.get(subcategoryKey) ?? {
        name: record.subcategoryName,
        amount: 0,
        count: 0,
        ownAmount: 0,
        assignedAmount: 0,
      };

      currentSubcategory.amount += record.amount;
      currentSubcategory.count += 1;

      if (record.sourceType === 'own') {
        currentSubcategory.ownAmount += record.amount;
      } else {
        currentSubcategory.assignedAmount += record.amount;
      }

      currentCategory.subcategories.set(subcategoryKey, currentSubcategory);
      groups.set(categoryKey, currentCategory);
    }

    return Array.from(groups.entries())
      .map(([key, category], index) => {
        const amount = this.roundMoney(category.amount);
        const subcategories = Array.from(category.subcategories.entries())
          .map(([subcategoryKey, subcategory]) => ({
            key: subcategoryKey,
            name: subcategory.name,
            amount: this.roundMoney(subcategory.amount),
            count: subcategory.count,
            shareOfCategory: amount > 0 ? subcategory.amount / amount : 0,
            shareOfTotal: totalAmount > 0 ? subcategory.amount / totalAmount : 0,
            ownAmount: this.roundMoney(subcategory.ownAmount),
            assignedAmount: this.roundMoney(subcategory.assignedAmount),
          }))
          .sort((left, right) => right.amount - left.amount);

        return {
          key,
          name: category.name,
          amount,
          count: category.count,
          share: totalAmount > 0 ? category.amount / totalAmount : 0,
          ownAmount: this.roundMoney(category.ownAmount),
          assignedAmount: this.roundMoney(category.assignedAmount),
          color: this.chartColors[index % this.chartColors.length],
          subcategories,
        };
      })
      .sort((left, right) => right.amount - left.amount);
  }

  private buildConicGradient(items: CategoryBreakdown[]): string {
    if (items.length === 0) {
      return 'conic-gradient(#dbe4f0 0 100%)';
    }

    let current = 0;
    const segments = items.map((item) => {
      const start = current;
      const end = current + item.share * 100;
      current = end;
      return `${item.color} ${start}% ${end}%`;
    });

    if (current < 100) {
      segments.push(`#e2e8f0 ${current}% 100%`);
    }

    return `conic-gradient(${segments.join(', ')})`;
  }

  private buildYears(records: ExpenseRecord[]): SelectOption[] {
    const years = new Set<number>([new Date().getFullYear()]);

    for (const record of records) {
      years.add(record.analysisDate.getFullYear());
    }

    return Array.from(years)
      .sort((a, b) => b - a)
      .map((year) => ({ value: String(year), label: String(year) }));
  }

  private createEmptyReport(): ExpenseCategoryReport {
    return {
      hasData: false,
      periodLabel: this.getSelectedPeriodRange().label,
      summary:
        'Selecciona mes o quincena para ver cuanto se gasto por categoria y como se reparte en subcategorias.',
      totalExpense: 0,
      ownExpense: 0,
      assignedExpense: 0,
      categoriesCount: 0,
      subcategoriesCount: 0,
      kpis: [
        {
          label: 'Gasto total visible',
          value: 0,
          helper: 'Sin movimientos visibles para este corte.',
          tone: 'neutral',
        },
        {
          label: 'Gasto propio del titular',
          value: 0,
          helper: 'Movimientos propios del usuario logueado.',
          tone: 'neutral',
        },
        {
          label: 'Asignado por otros usuarios',
          value: 0,
          helper: 'Cuotas o gastos asignados al titular.',
          tone: 'neutral',
        },
        {
          label: 'Categorias con movimiento',
          value: 0,
          displayValue: '0',
          helper: 'Aun no hay categorias visibles en este corte.',
          tone: 'neutral',
        },
      ],
      categories: [],
      selectedCategory: null,
      categoryDonutStyle: 'conic-gradient(#dbe4f0 0 100%)',
      categoryDonutCenter: this.formatCurrency(0),
    };
  }

  private createEmptySubcategoryDetailModalData(): SubcategoryTransactionModalData {
    return {
      categoryKey: '',
      categoryName: '',
      subcategoryKey: '',
      subcategoryName: '',
      periodLabel: this.getSelectedPeriodRange().label,
      totalAmount: 0,
      ownAmount: 0,
      assignedAmount: 0,
      totalTransactions: 0,
      transactions: [],
    };
  }

  private getSelectedPeriodRange(): ReportPeriodRange {
    const selectedMonth = Number(this.filtrosForm.controls.month.value ?? new Date().getMonth() + 1);
    const selectedYear = Number(this.filtrosForm.controls.year.value ?? new Date().getFullYear());
    const monthStart = new Date(selectedYear, Math.max(0, selectedMonth - 1), 1);
    const monthLabel = this.capitalizeText(this.monthFormatter.format(monthStart));

    if (this.selectedPeriodType === 'month') {
      return {
        type: 'month',
        start: monthStart,
        end: this.getEndOfMonthDate(selectedYear, monthStart.getMonth()),
        label: monthLabel,
        descriptionLabel: monthLabel,
      };
    }

    if (this.getSelectedQuincena() === 'first') {
      return {
        type: 'quincena',
        start: monthStart,
        end: new Date(selectedYear, monthStart.getMonth(), 15),
        label: `${monthLabel} | 1 - 15`,
        descriptionLabel: `1 al 15 de ${monthLabel}`,
      };
    }

    const monthEnd = this.getEndOfMonthDate(selectedYear, monthStart.getMonth());
    return {
      type: 'quincena',
      start: new Date(selectedYear, monthStart.getMonth(), 16),
      end: monthEnd,
      label: `${monthLabel} | 16 - ${monthEnd.getDate()}`,
      descriptionLabel: `16 al ${monthEnd.getDate()} de ${monthLabel}`,
    };
  }

  private getSelectedQuincena(): ReportQuincena {
    return this.filtrosForm.controls.quincena.value === 'second' ? 'second' : 'first';
  }

  private getDefaultQuincena(): ReportQuincena {
    return new Date().getDate() <= 15 ? 'first' : 'second';
  }

  private getEndOfMonthDate(year: number, monthIndex: number): Date {
    return new Date(year, monthIndex + 1, 0);
  }

  private isDateWithinPeriod(date: Date, selectedPeriod: ReportPeriodRange): boolean {
    const time = date.getTime();
    return time >= selectedPeriod.start.getTime() && time <= selectedPeriod.end.getTime();
  }

  private getFilteredRecordsForPeriod(period: ReportPeriodRange): ExpenseRecord[] {
    return this.records.filter((record) => this.isDateWithinPeriod(record.analysisDate, period));
  }

  private buildCategoryKey(categoryId: number, categoryName: string): string {
    return `${categoryId}::${categoryName}`;
  }

  private buildSubcategoryKey(subcategoryId: number | null, subcategoryName: string): string {
    return `${subcategoryId ?? 'none'}::${subcategoryName}`;
  }

  private buildSubcategoryDetailModalData(
    categoryKey: string,
    categoryName: string,
    subcategoryKey: string,
    subcategoryName: string,
  ): SubcategoryTransactionModalData {
    const period = this.getSelectedPeriodRange();
    const transactions = this.getFilteredRecordsForPeriod(period)
      .filter(
        (record) =>
          this.buildCategoryKey(record.categoryId, record.categoryName) === categoryKey &&
          this.buildSubcategoryKey(record.subcategoryId, record.subcategoryName) === subcategoryKey,
      )
      .sort((left, right) => right.analysisDate.getTime() - left.analysisDate.getTime());

    return {
      categoryKey,
      categoryName,
      subcategoryKey,
      subcategoryName,
      periodLabel: period.label,
      totalAmount: this.roundMoney(transactions.reduce((sum, item) => sum + item.amount, 0)),
      ownAmount: this.roundMoney(
        transactions
          .filter((item) => item.sourceType === 'own')
          .reduce((sum, item) => sum + item.amount, 0),
      ),
      assignedAmount: this.roundMoney(
        transactions
          .filter((item) => item.sourceType === 'assigned')
          .reduce((sum, item) => sum + item.amount, 0),
      ),
      totalTransactions: transactions.length,
      transactions,
    };
  }

  private syncSubcategoryDetailModal(): void {
    const { categoryKey, categoryName, subcategoryKey, subcategoryName } =
      this.subcategoryDetailModalData;

    if (!categoryKey || !subcategoryKey) {
      this.closeSubcategoryDetailModal();
      return;
    }

    this.subcategoryDetailModalData = this.buildSubcategoryDetailModalData(
      categoryKey,
      categoryName,
      subcategoryKey,
      subcategoryName,
    );
  }

  private filterVisibleTransactions(transacciones: TransaccionListado[]): TransaccionListado[] {
    return transacciones.filter((transaccion) => !this.isCancelledTransaction(transaccion));
  }

  private isCancelledTransaction(transaccion: TransaccionListado): boolean {
    const transactionStatus = this.normalizeTransactionStatus(
      transaccion.nombre_estado_registro ?? transaccion.nombre_estado ?? '',
    );

    return transactionStatus === 'anulado';
  }

  private normalizeTransactionStatus(value: string): string {
    switch (this.normalizeText(value)) {
      case 'anulada':
      case 'anulado':
        return 'anulado';
      default:
        return this.normalizeText(value);
    }
  }

  private parseDateOnly(value: string | null | undefined): Date | null {
    if (!value) {
      return null;
    }

    const plainValue = value.includes('T') ? value.slice(0, 10) : value;
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(plainValue);

    if (!match) {
      const fallback = new Date(value);
      return Number.isNaN(fallback.getTime())
        ? null
        : new Date(fallback.getFullYear(), fallback.getMonth(), fallback.getDate());
    }

    const [, year, month, day] = match;
    return new Date(Number(year), Number(month) - 1, Number(day));
  }

  private normalizeDetailAmounts(
    detail: ParticipanteDetalleListado,
    paymentMethod?: CatalogoFormaPago | null,
  ): NormalizedDetailAmounts {
    const baseAmount = this.roundMoney(Math.max(0, this.normalizeAmount(detail.monto)));
    const amountPaid = this.roundMoney(Math.max(0, this.normalizeAmount(detail.monto_pagado)));
    const interestPaid = this.roundMoney(
      Math.max(0, this.normalizeAmount(detail.interes_pagado)),
    );
    const interestPending = this.roundMoney(
      Math.max(0, this.normalizeAmount(detail.interes_pendiente)),
    );
    const pendingDebt = this.roundMoney(
      Math.max(0, this.normalizeAmount(detail.saldo_pendiente)),
    );

    if (!paymentMethod || paymentMethod.calcula_interes !== true || !this.shouldApplyInterestToDetail(detail)) {
      return {
        baseAmount,
        amountPaid,
        interestPaid,
        interestPending,
        pendingDebt,
        totalAmount: this.roundMoney(baseAmount + interestPaid + interestPending),
      };
    }

    return {
      baseAmount,
      amountPaid: this.roundMoney(amountPaid + interestPaid),
      interestPaid,
      interestPending,
      pendingDebt: this.roundMoney(Math.max(0, baseAmount + interestPending - amountPaid)),
      totalAmount: this.roundMoney(baseAmount + interestPaid + interestPending),
    };
  }

  private shouldApplyInterestToDetail(
    detail: Pick<ParticipanteDetalleListado, 'id_estado'>,
  ): boolean {
    return detail.id_estado === 3 || detail.id_estado === 4;
  }

  private isVisiblePaymentStatus(statusName: string): boolean {
    const normalized = this.normalizeText(statusName);

    return (
      normalized === 'pagado' ||
      normalized === 'pagada' ||
      normalized === 'pendiente' ||
      normalized === 'pago parcial'
    );
  }

  private normalizeAmount(value: number | null | undefined): number {
    const parsed = Number(value ?? 0);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  private roundMoney(value: number): number {
    return Math.round((value + Number.EPSILON) * 100) / 100;
  }

  getEstadoClass(statusName: string | null | undefined): string {
    const normalized = this.normalizeText(statusName ?? '');
    switch (normalized) {
      case 'pago parcial': return 'status-pill-parcial';
      case 'pendiente': return 'status-pill-pendiente';
      case 'anulado':
      case 'anulada': return 'status-pill-anulada';
      case 'pagado':
      case 'pagada': return 'status-pill-completado';
      case 'sin registro': return 'status-pill-sin-registro';
      default: return 'status-pill-default';
    }
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

  private capitalizeText(value: string): string {
    if (!value) {
      return value;
    }

    return value.charAt(0).toUpperCase() + value.slice(1);
  }
}
