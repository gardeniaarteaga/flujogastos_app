import { NgClass, NgFor, NgIf } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Component, DestroyRef, OnInit, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { firstValueFrom, timeout } from 'rxjs';

import { apiUrl } from '../../shared/config/api.config';
import { SessionStripComponent } from '../../shared/session-strip/session-strip.component';
import {
  CatalogoCategoria,
  CatalogoEntidadFinanciera,
  CatalogoFormaPago,
  CatalogoParticipante,
  CatalogoSubcategoria,
  CatalogosTransaccionService,
} from '../../shared/services/catalogos-transaccion.service';
import { getCurrentUserId, isAdminUser, loadUserProfile } from '../../shared/user-profile';

type DashboardTone = 'good' | 'warning' | 'danger' | 'info' | 'neutral';
type TrafficLightTone = 'green' | 'yellow' | 'red';

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
  titular: string | null;
  cantidad_participantes: number;
  participantes_detalle: ParticipanteDetalleListado[];
}

interface AnalysisRecord {
  id: string;
  transactionId: number;
  type: 'income' | 'expense';
  analysisDate: Date | null;
  monthKey: string | null;
  amount: number;
  baseAmount: number;
  interestPaid: number;
  interestPending: number;
  pendingDebt: number;
  debtDue: number;
  isDebtLike: boolean;
  categoryId: number;
  categoryName: string;
  subcategoryId: number | null;
  subcategoryName: string;
  paymentMethodId: number;
  paymentMethodName: string;
  entityId: number | null;
  entityName: string;
  participantKey: string;
  participantLabel: string;
  isTitular: boolean;
  statusName: string;
  description: string;
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

interface KpiCard {
  label: string;
  value: number;
  detail: string;
  helper: string;
  tone: DashboardTone;
}

interface CategoryStat {
  name: string;
  amount: number;
  share: number;
  count: number;
  color: string;
}

interface SubcategoryBreakdownStat {
  name: string;
  amount: number;
  count: number;
  shareOfCategory: number;
  shareOfTotal: number;
}

interface CategoryBreakdownItem {
  name: string;
  amount: number;
  share: number;
  count: number;
  color: string;
  summary: string;
  subcategories: SubcategoryBreakdownStat[];
}

interface TrendPoint {
  key: string;
  label: string;
  income: number;
  expense: number;
  balance: number;
  debtDue: number;
}

interface TrendChartModel {
  incomePoints: string;
  expensePoints: string;
  balancePoints: string;
  zeroLineY: number;
}

interface DebtEntityItem {
  name: string;
  pendingDebt: number;
  interestPending: number;
  monthlyDue: number;
  tone: DashboardTone;
}

interface InsightItem {
  title: string;
  text: string;
  tone: DashboardTone;
}

interface TrafficLightModel {
  tone: TrafficLightTone;
  label: string;
  description: string;
}

interface AnalysisViewModel {
  hasData: boolean;
  monthLabel: string;
  summary: string;
  trafficLight: TrafficLightModel;
  kpis: KpiCard[];
  topCategories: CategoryStat[];
  topSubcategories: CategoryStat[];
  categoryBreakdowns: CategoryBreakdownItem[];
  categoryDonutStyle: string;
  categoryDonutCenter: string;
  incomeExpenseBarStyle: string;
  trend: TrendPoint[];
  trendChart: TrendChartModel;
  debtEntities: DebtEntityItem[];
  insights: InsightItem[];
  recommendations: InsightItem[];
  answers: InsightItem[];
  debtPending: number;
  interestPaid: number;
  interestPending: number;
  debtMonthly: number;
  totalIncome: number;
  totalExpense: number;
  balance: number;
}

@Component({
  selector: 'app-analisis-financiero-page',
  imports: [RouterLink, RouterLinkActive, ReactiveFormsModule, NgIf, NgFor, NgClass, SessionStripComponent],
  templateUrl: './analisis-financiero.page.html',
  styleUrl: './analisis-financiero.page.css',
})
export class AnalisisFinancieroPage implements OnInit {
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
  private readonly percentFormatter = new Intl.NumberFormat('es-SV', {
    style: 'percent',
    minimumFractionDigits: 0,
    maximumFractionDigits: 1,
  });
  private readonly monthFormatter = new Intl.DateTimeFormat('es-SV', {
    month: 'long',
    year: 'numeric',
  });
  private readonly shortMonthFormatter = new Intl.DateTimeFormat('es-SV', {
    month: 'short',
  });
  private readonly chartColors = ['#2563eb', '#f97316', '#dc2626', '#0f766e', '#7c3aed', '#ca8a04'];

  readonly monthOptions: SelectOption[] = [
    { value: '1', label: 'Enero' },
    { value: '2', label: 'Febrero' },
    { value: '3', label: 'Marzo' },
    { value: '4', label: 'Abril' },
    { value: '5', label: 'Mayo' },
    { value: '6', label: 'Junio' },
    { value: '7', label: 'Julio' },
    { value: '8', label: 'Agosto' },
    { value: '9', label: 'Septiembre' },
    { value: '10', label: 'Octubre' },
    { value: '11', label: 'Noviembre' },
    { value: '12', label: 'Diciembre' },
  ];

  readonly userProfile = loadUserProfile();
  readonly filtrosForm = this.fb.group({
    month: [String(new Date().getMonth() + 1)],
    year: [String(new Date().getFullYear())],
    categoryId: [''],
    subcategoryId: [''],
    paymentMethodId: [''],
    participantKey: [''],
    entityId: [''],
    state: [''],
  });

  loading = false;
  errorMessage = '';
  sidebarCollapsed = false;
  maintenanceOpen = false;
  currentUserId = getCurrentUserId();
  records: AnalysisRecord[] = [];
  years: SelectOption[] = [];
  categoryOptions: SelectOption[] = [];
  subcategoryOptions: SelectOption[] = [];
  paymentMethodOptions: SelectOption[] = [];
  participantOptions: SelectOption[] = [];
  entityOptions: SelectOption[] = [];
  stateOptions: SelectOption[] = [];
  analysis = this.createEmptyAnalysis();

  private categorias: CatalogoCategoria[] = [];
  private subcategorias: CatalogoSubcategoria[] = [];
  private formasPago: CatalogoFormaPago[] = [];
  private entidades: CatalogoEntidadFinanciera[] = [];
  private participantes: CatalogoParticipante[] = [];

  get isAdminSession(): boolean {
    return isAdminUser();
  }

  get currentUserParticipante(): CatalogoParticipante | null {
    const candidateNames = [
      this.userProfile.fullName,
      this.userProfile.username,
    ]
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
      this.participantes.find(
        (participante) => participante.id_usuario === this.currentUserId,
      ) ??
      null
    );
  }

  ngOnInit(): void {
    this.filtrosForm.controls.categoryId.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((selectedCategoryId) => {
        this.updateSubcategoryOptions(selectedCategoryId ?? '');

        const currentSubcategory = this.filtrosForm.controls.subcategoryId.value ?? '';
        if (
          currentSubcategory &&
          !this.subcategoryOptions.some((item) => item.value === currentSubcategory)
        ) {
          this.filtrosForm.controls.subcategoryId.setValue('', { emitEvent: false });
        }
      });

    this.filtrosForm.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        this.rebuildAnalysis();
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

      this.categorias = catalogos.categorias;
      this.subcategorias = catalogos.subcategorias;
      this.formasPago = catalogos.formasPago;
      this.entidades = catalogos.entidadesFinancieras;
      this.participantes = catalogos.participantes;
      this.records = this.buildRecords(Array.isArray(transacciones) ? transacciones : []);

      this.buildFilterOptions();
      this.rebuildAnalysis();
    } catch {
      this.records = [];
      this.analysis = this.createEmptyAnalysis();
      this.errorMessage =
        'No se pudo construir el analisis financiero con la informacion disponible.';
    } finally {
      this.loading = false;
    }
  }

  toggleMaintenanceMenu(): void {
    this.maintenanceOpen = !this.maintenanceOpen;
  }

  resetSecondaryFilters(): void {
    this.filtrosForm.patchValue(
      {
        categoryId: '',
        subcategoryId: '',
        paymentMethodId: '',
        participantKey: '',
        entityId: '',
        state: '',
      },
      { emitEvent: true },
    );
  }

  formatCurrency(value: number): string {
    return this.currencyFormatter.format(Number.isFinite(value) ? value : 0);
  }

  formatPercent(value: number | null): string {
    if (value === null || !Number.isFinite(value)) {
      return 'Sin base';
    }

    return this.percentFormatter.format(value);
  }

  getSelectedMonthName(): string {
    const selectedMonth = Number(this.filtrosForm.controls.month.value ?? new Date().getMonth() + 1);
    return this.monthOptions.find((item) => Number(item.value) === selectedMonth)?.label ?? 'Mes';
  }

  private buildRecords(transacciones: TransaccionListado[]): AnalysisRecord[] {
    const formsById = new Map(this.formasPago.map((item) => [item.id_forma, item]));
    const entityById = new Map(this.entidades.map((item) => [item.id_entidad, item.nombre_entidad]));
    const participantById = new Map(
      this.participantes.map((item) => [item.id_participante, item.nombre_participante]),
    );

    return transacciones.flatMap<AnalysisRecord>((transaction) => {
      const paymentMethod = formsById.get(transaction.id_metodo_pago);
      const entityId = paymentMethod?.id_entidad ?? null;
      const entityName =
        (entityId !== null ? entityById.get(entityId) : null) ??
        'Sin entidad financiera';
      const transactionType: AnalysisRecord['type'] =
        transaction.id_tipo_transaccion === 2 ? 'income' : 'expense';
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

      return detailRows.reduce<AnalysisRecord[]>((records, detail, index) => {
          const resolvedStatusName = detail.nombre_estado?.trim() || statusName;

          if (!this.isVisiblePaymentStatus(resolvedStatusName)) {
            return records;
          }

          const normalized = this.normalizeDetailAmounts(detail, paymentMethod);
          const analysisDate =
            this.parseDateOnly(detail.fecha_programada) ??
            this.parseDateOnly(detail.fecha_pago);

          if (!analysisDate) {
            return records;
          }

          const participantKey = detail.es_titular
            ? 'titular'
            : String(detail.id_participante || detail.id_usuario_relacionado || `p-${index}`);
          const participantLabel = detail.es_titular
            ? 'Titular'
            : detail.nombre_participante?.trim() ||
              participantById.get(detail.id_participante)?.trim() ||
              'Participante';
          const isDebtLike =
            transactionType === 'expense' &&
            (detail.total_cuotas > 1 ||
              normalized.pendingDebt > 0 ||
              normalized.interestPaid > 0 ||
              normalized.interestPending > 0 ||
              paymentMethod?.calcula_interes === true);
          const amount =
            transactionType === 'income'
              ? normalized.baseAmount
              : normalized.totalAmount;

          records.push({
            id: `${transactionType}-${transaction.id_transaccion}-${detail.id || index}`,
            transactionId: transaction.id_transaccion,
            type: transactionType,
            analysisDate,
            monthKey: this.getMonthKey(analysisDate),
            amount,
            baseAmount: normalized.baseAmount,
            interestPaid: transactionType === 'income' ? 0 : normalized.interestPaid,
            interestPending: transactionType === 'income' ? 0 : normalized.interestPending,
            pendingDebt: transactionType === 'income' ? 0 : normalized.pendingDebt,
            debtDue: isDebtLike ? amount : 0,
            isDebtLike,
            categoryId: transaction.id_categoria,
            categoryName,
            subcategoryId: transaction.id_subcategoria,
            subcategoryName,
            paymentMethodId: transaction.id_metodo_pago,
            paymentMethodName,
            entityId,
            entityName,
            participantKey,
            participantLabel,
            isTitular: detail.es_titular,
            statusName: resolvedStatusName,
            description,
          });

          return records;
        }, []);
    });
  }

  private buildFilterOptions(): void {
    const years = new Set<number>();

    for (const record of this.records) {
      if (record.analysisDate) {
        years.add(record.analysisDate.getFullYear());
      }
    }

    years.add(new Date().getFullYear());

    this.years = Array.from(years)
      .sort((a, b) => b - a)
      .map((year) => ({ value: String(year), label: String(year) }));

    if (!this.years.some((item) => item.value === (this.filtrosForm.controls.year.value ?? ''))) {
      this.filtrosForm.controls.year.setValue(this.years[0]?.value ?? String(new Date().getFullYear()), {
        emitEvent: false,
      });
    }

    this.categoryOptions = this.categorias
      .slice()
      .sort((a, b) => a.nombre_categoria.localeCompare(b.nombre_categoria))
      .map((item) => ({
        value: String(item.id_categoria),
        label: item.nombre_categoria,
      }));

    this.paymentMethodOptions = this.formasPago
      .slice()
      .sort((a, b) => a.nombre_forma.localeCompare(b.nombre_forma))
      .map((item) => ({
        value: String(item.id_forma),
        label: item.nombre_forma,
      }));

    const participantMap = new Map<string, string>([['titular', 'Titular']]);
    for (const record of this.records) {
      if (!participantMap.has(record.participantKey)) {
        participantMap.set(record.participantKey, record.participantLabel);
      }
    }
    this.participantOptions = Array.from(participantMap.entries()).map(([value, label]) => ({
      value,
      label,
    }));

    this.entityOptions = this.entidades
      .slice()
      .sort((a, b) => a.nombre_entidad.localeCompare(b.nombre_entidad))
      .map((item) => ({
        value: String(item.id_entidad),
        label: item.nombre_entidad,
      }));

    const stateMap = new Map<string, string>();
    for (const record of this.records) {
      const normalized = this.normalizeText(record.statusName);
      if (!stateMap.has(normalized)) {
        stateMap.set(normalized, record.statusName);
      }
    }
    this.stateOptions = Array.from(stateMap.entries())
      .sort((a, b) => a[1].localeCompare(b[1]))
      .map(([value, label]) => ({ value, label }));

    this.updateSubcategoryOptions(this.filtrosForm.controls.categoryId.value ?? '');
  }

  private getParticipantesDetalleForAnalysis(
    transaccion: Pick<TransaccionListado, 'es_propietario' | 'participantes_detalle'> | null | undefined,
  ): ParticipanteDetalleListado[] {
    const detalles = Array.isArray(transaccion?.participantes_detalle)
      ? transaccion.participantes_detalle
      : [];

    if (transaccion?.es_propietario) {
      return detalles;
    }

    const detallesDelUsuario = detalles.filter((detalle) =>
      this.isDetalleDelUsuarioLogueado(detalle, false),
    );

    return detallesDelUsuario.length > 0 ? detallesDelUsuario : detalles;
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

  private updateSubcategoryOptions(categoryId: string): void {
    const numericCategoryId = Number(categoryId);
    this.subcategoryOptions = this.subcategorias
      .filter((item) => !numericCategoryId || item.id_categoria === numericCategoryId)
      .slice()
      .sort((a, b) => a.nombre_subcategoria.localeCompare(b.nombre_subcategoria))
      .map((item) => ({
        value: String(item.id_subcategoria),
        label: item.nombre_subcategoria,
      }));
  }

  private rebuildAnalysis(): void {
    const selectedMonth = Number(this.filtrosForm.controls.month.value ?? new Date().getMonth() + 1);
    const selectedYear = Number(this.filtrosForm.controls.year.value ?? new Date().getFullYear());
    const monthDate = new Date(selectedYear, Math.max(0, selectedMonth - 1), 1);
    const monthKey = this.getMonthKey(monthDate);

    const monthRecords = this.filterRecords(true);
    const trendRecords = this.filterRecords(false);

    if (monthRecords.length === 0) {
      this.analysis = {
        ...this.createEmptyAnalysis(),
        monthLabel: this.capitalizeText(this.monthFormatter.format(monthDate)),
        summary:
          'No hay detalles pagados o pendientes de pago visibles para este mes.',
      };
      return;
    }

    const incomeRecords = monthRecords.filter((item) => item.type === 'income');
    const expenseRecords = monthRecords.filter((item) => item.type === 'expense');

    const totalIncome = this.roundMoney(incomeRecords.reduce((sum, item) => sum + item.amount, 0));
    const totalExpense = this.roundMoney(expenseRecords.reduce((sum, item) => sum + item.amount, 0));
    const balance = this.roundMoney(totalIncome - totalExpense);
    const debtMonthly = this.roundMoney(
      expenseRecords.filter((item) => item.isDebtLike).reduce((sum, item) => sum + item.debtDue, 0),
    );
    const debtPending = this.roundMoney(expenseRecords.reduce((sum, item) => sum + item.pendingDebt, 0));
    const interestPaid = this.roundMoney(expenseRecords.reduce((sum, item) => sum + item.interestPaid, 0));
    const interestPending = this.roundMoney(
      expenseRecords.reduce((sum, item) => sum + item.interestPending, 0),
    );
    const freeMoney = this.roundMoney(Math.max(0, balance));
    const estimatedSavings = freeMoney;
    const savingsRate = totalIncome > 0 ? estimatedSavings / totalIncome : null;
    const debtRatio = totalIncome > 0 ? debtMonthly / totalIncome : debtMonthly > 0 ? 1 : null;
    const expenseRatio = totalIncome > 0 ? totalExpense / totalIncome : totalExpense > 0 ? 1 : null;
    const interestRatio = totalIncome > 0 ? (interestPaid + interestPending) / totalIncome : null;
    const hormigaIndicator = this.detectGastosHormiga(expenseRecords, totalExpense);
    const topCategories = this.buildCategoryStats(expenseRecords, totalExpense, 'category');
    const topSubcategories = this.buildCategoryStats(expenseRecords, totalExpense, 'subcategory');
    const categoryBreakdowns = this.buildCategoryBreakdowns(expenseRecords, totalExpense);
    const debtEntities = this.buildDebtEntities(expenseRecords);
    const trend = this.buildTrend(trendRecords, monthDate);
    const trafficLight = this.buildTrafficLight(
      balance,
      debtRatio,
      savingsRate,
      interestRatio,
      hormigaIndicator.share,
    );
    const answers = this.buildAnswers(
      balance,
      debtRatio,
      topCategories,
      trend,
      interestRatio,
      totalIncome,
    );
    const insights = this.buildInsights(
      topCategories,
      topSubcategories,
      totalIncome,
      debtRatio,
      balance,
      trend,
      interestRatio,
    );
    const recommendations = this.buildRecommendations(
      balance,
      debtRatio,
      savingsRate,
      interestRatio,
      hormigaIndicator,
      topCategories,
    );

    this.analysis = {
      hasData: true,
      monthLabel: this.capitalizeText(this.monthFormatter.format(monthDate)),
      summary: this.buildSummary(balance, debtRatio, trend, interestRatio, topCategories[0]?.name ?? ''),
      trafficLight,
      kpis: [
        {
          label: 'Total ingresos del mes',
          value: totalIncome,
          detail: `${incomeRecords.length} movimientos considerados`,
          helper: 'Entradas del periodo filtradas con la fecha principal del movimiento.',
          tone: 'good',
        },
        {
          label: 'Total gastos del mes',
          value: totalExpense,
          detail: topCategories[0]
            ? `${topCategories[0].name} concentra ${this.formatPercent(topCategories[0].share)}`
            : 'Sin categoria dominante',
          helper: 'Incluye gastos, cuotas, pagos compartidos e intereses del periodo.',
          tone: expenseRatio !== null && expenseRatio > 0.85 ? 'warning' : 'info',
        },
        {
          label: 'Balance mensual',
          value: balance,
          detail: balance >= 0 ? 'Estas cerrando el mes en positivo' : 'Estas gastando mas de lo que ingresa',
          helper: 'Mide si el mes se sostiene por si mismo.',
          tone: balance >= 0 ? 'good' : 'danger',
        },
        {
          label: 'Total deuda pendiente',
          value: debtPending,
          detail: debtEntities[0] ? `${debtEntities[0].name} es la mayor presion` : 'Sin deuda visible',
          helper: 'Saldo pendiente ligado a lo filtrado en este mes.',
          tone: debtPending > 0 ? 'warning' : 'good',
        },
        {
          label: 'Intereses generados/pagados',
          value: interestPaid + interestPending,
          detail:
            interestPending > 0
              ? `${this.formatCurrency(interestPending)} siguen pendientes`
              : 'Sin interes pendiente relevante',
          helper: 'Combina intereses ya pagados y por pagar para medir costo financiero.',
          tone: interestRatio !== null && interestRatio > 0.12 ? 'danger' : 'neutral',
        },
        {
          label: 'Capacidad de pago',
          value: debtMonthly,
          detail:
            debtRatio !== null
              ? `${this.formatPercent(debtRatio)} de los ingresos del mes`
              : 'No hay ingresos para medir la carga de deuda',
          helper: 'Relacion entre deuda mensual y capacidad real de generar ingresos.',
          tone: debtRatio === null ? 'neutral' : debtRatio > 0.5 ? 'danger' : debtRatio >= 0.3 ? 'warning' : 'good',
        },
        {
          label: 'Dinero libre restante',
          value: freeMoney,
          detail:
            freeMoney > 0
              ? 'Espacio libre despues de cubrir compromisos del mes'
              : 'No queda margen libre este mes',
          helper: 'Caja disponible para imprevistos, ahorro o amortizar deuda.',
          tone: freeMoney > 0 ? 'good' : 'danger',
        },
        {
          label: 'Ahorro estimado',
          value: estimatedSavings,
          detail:
            savingsRate !== null
              ? `${this.formatPercent(savingsRate)} del ingreso del mes`
              : 'Sin ingresos suficientes para estimar ahorro',
          helper: 'Excedente potencial si mantienes este cierre mensual.',
          tone: savingsRate !== null && savingsRate >= 0.1 ? 'good' : 'warning',
        },
      ],
      topCategories,
      topSubcategories,
      categoryBreakdowns,
      categoryDonutStyle: this.buildConicGradient(topCategories),
      categoryDonutCenter: totalExpense > 0 ? this.formatCurrency(totalExpense) : this.formatCurrency(0),
      incomeExpenseBarStyle: this.buildIncomeExpenseBar(totalIncome, totalExpense),
      trend,
      trendChart: this.buildTrendChart(trend),
      debtEntities,
      insights,
      recommendations,
      answers,
      debtPending,
      interestPaid,
      interestPending,
      debtMonthly,
      totalIncome,
      totalExpense,
      balance,
    };

    if (this.analysis.hasData && this.analysis.monthLabel && monthKey !== this.getMonthKey(monthDate)) {
      this.analysis.monthLabel = this.capitalizeText(this.monthFormatter.format(monthDate));
    }
  }

  private filterRecords(applyMonthFilter: boolean): AnalysisRecord[] {
    const selectedMonth = Number(this.filtrosForm.controls.month.value ?? new Date().getMonth() + 1);
    const selectedYear = Number(this.filtrosForm.controls.year.value ?? new Date().getFullYear());
    const categoryId = this.filtrosForm.controls.categoryId.value ?? '';
    const subcategoryId = this.filtrosForm.controls.subcategoryId.value ?? '';
    const paymentMethodId = this.filtrosForm.controls.paymentMethodId.value ?? '';
    const participantKey = this.filtrosForm.controls.participantKey.value ?? '';
    const entityId = this.filtrosForm.controls.entityId.value ?? '';
    const state = this.filtrosForm.controls.state.value ?? '';

    return this.records.filter((record) => {
      if (!record.analysisDate) {
        return false;
      }

      if (applyMonthFilter) {
        if (record.analysisDate.getMonth() + 1 !== selectedMonth) {
          return false;
        }

        if (record.analysisDate.getFullYear() !== selectedYear) {
          return false;
        }
      }

      if (categoryId && String(record.categoryId) !== categoryId) {
        return false;
      }

      if (subcategoryId && String(record.subcategoryId ?? '') !== subcategoryId) {
        return false;
      }

      if (paymentMethodId && String(record.paymentMethodId) !== paymentMethodId) {
        return false;
      }

      if (participantKey && record.participantKey !== participantKey) {
        return false;
      }

      if (entityId && String(record.entityId ?? '') !== entityId) {
        return false;
      }

      if (state && this.normalizeText(record.statusName) !== state) {
        return false;
      }

      return true;
    });
  }

  private buildCategoryStats(
    records: AnalysisRecord[],
    totalAmount: number,
    type: 'category' | 'subcategory',
  ): CategoryStat[] {
    const groups = new Map<string, { amount: number; count: number }>();

    for (const record of records) {
      const name = type === 'category' ? record.categoryName : record.subcategoryName;
      const current = groups.get(name) ?? { amount: 0, count: 0 };
      current.amount += record.amount;
      current.count += 1;
      groups.set(name, current);
    }

    return Array.from(groups.entries())
      .map(([name, value], index) => ({
        name,
        amount: this.roundMoney(value.amount),
        share: totalAmount > 0 ? value.amount / totalAmount : 0,
        count: value.count,
        color: this.chartColors[index % this.chartColors.length],
      }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 6);
  }

  private buildCategoryBreakdowns(
    records: AnalysisRecord[],
    totalAmount: number,
  ): CategoryBreakdownItem[] {
    const groups = new Map<
      string,
      {
        name: string;
        amount: number;
        count: number;
        subcategories: Map<string, { name: string; amount: number; count: number }>;
      }
    >();

    for (const record of records) {
      const categoryKey = `${record.categoryId}::${record.categoryName}`;
      const subcategoryKey = `${record.subcategoryId ?? 'none'}::${record.subcategoryName}`;
      const currentCategory = groups.get(categoryKey) ?? {
        name: record.categoryName,
        amount: 0,
        count: 0,
        subcategories: new Map<string, { name: string; amount: number; count: number }>(),
      };

      currentCategory.amount += record.amount;
      currentCategory.count += 1;

      const currentSubcategory = currentCategory.subcategories.get(subcategoryKey) ?? {
        name: record.subcategoryName,
        amount: 0,
        count: 0,
      };
      currentSubcategory.amount += record.amount;
      currentSubcategory.count += 1;
      currentCategory.subcategories.set(subcategoryKey, currentSubcategory);
      groups.set(categoryKey, currentCategory);
    }

    return Array.from(groups.values())
      .sort((left, right) => right.amount - left.amount)
      .slice(0, 5)
      .map((category, index) => {
        const amount = this.roundMoney(category.amount);
        const share = totalAmount > 0 ? category.amount / totalAmount : 0;
        const subcategories = Array.from(category.subcategories.values())
          .sort((left, right) => right.amount - left.amount)
          .slice(0, 4)
          .map((subcategory) => ({
            name: subcategory.name,
            amount: this.roundMoney(subcategory.amount),
            count: subcategory.count,
            shareOfCategory: amount > 0 ? subcategory.amount / amount : 0,
            shareOfTotal: totalAmount > 0 ? subcategory.amount / totalAmount : 0,
          }));

        return {
          name: category.name,
          amount,
          share,
          count: category.count,
          color: this.chartColors[index % this.chartColors.length],
          summary: this.buildCategoryBreakdownSummary(category.name, subcategories),
          subcategories,
        };
      });
  }

  private buildTrend(records: AnalysisRecord[], endMonth: Date): TrendPoint[] {
    const months = Array.from({ length: 6 }, (_, index) => {
      const date = new Date(endMonth.getFullYear(), endMonth.getMonth() - (5 - index), 1);
      return {
        key: this.getMonthKey(date),
        label: this.capitalizeText(this.shortMonthFormatter.format(date)),
        income: 0,
        expense: 0,
        balance: 0,
        debtDue: 0,
      };
    });

    const monthMap = new Map(months.map((item) => [item.key, item]));

    for (const record of records) {
      if (!record.monthKey || !monthMap.has(record.monthKey)) {
        continue;
      }

      const bucket = monthMap.get(record.monthKey)!;
      if (record.type === 'income') {
        bucket.income += record.amount;
      } else {
        bucket.expense += record.amount;
        bucket.debtDue += record.debtDue;
      }
    }

    return months.map((item) => ({
      ...item,
      income: this.roundMoney(item.income),
      expense: this.roundMoney(item.expense),
      debtDue: this.roundMoney(item.debtDue),
      balance: this.roundMoney(item.income - item.expense),
    }));
  }

  private buildTrendChart(points: TrendPoint[]): TrendChartModel {
    if (points.length === 0) {
      return {
        incomePoints: '',
        expensePoints: '',
        balancePoints: '',
        zeroLineY: 50,
      };
    }

    const values = points.flatMap((item) => [item.income, item.expense, item.balance]);
    const min = Math.min(0, ...values);
    const max = Math.max(1, ...values);
    const range = max - min || 1;

    const pointString = (resolver: (point: TrendPoint) => number) =>
      points
        .map((point, index) => {
          const x = points.length === 1 ? 50 : (index / (points.length - 1)) * 100;
          const value = resolver(point);
          const y = 100 - ((value - min) / range) * 100;
          return `${x},${y}`;
        })
        .join(' ');

    return {
      incomePoints: pointString((point) => point.income),
      expensePoints: pointString((point) => point.expense),
      balancePoints: pointString((point) => point.balance),
      zeroLineY: 100 - ((0 - min) / range) * 100,
    };
  }

  private buildTrafficLight(
    balance: number,
    debtRatio: number | null,
    savingsRate: number | null,
    interestRatio: number | null,
    hormigaShare: number,
  ): TrafficLightModel {
    if (balance < 0 || (debtRatio !== null && debtRatio > 0.5) || (interestRatio !== null && interestRatio > 0.15)) {
      return {
        tone: 'red',
        label: 'Riesgo financiero',
        description:
          'El mes muestra una presion alta entre gasto, deuda e intereses. Conviene corregir rapido para evitar sobreendeudamiento.',
      };
    }

    if (
      (debtRatio !== null && debtRatio >= 0.3) ||
      (savingsRate !== null && savingsRate < 0.1) ||
      hormigaShare >= 0.12
    ) {
      return {
        tone: 'yellow',
        label: 'Advertencia financiera',
        description:
          'Tu mes aun es manejable, pero ya hay senales que pueden apretar caja si no haces ajustes pequenos.',
      };
    }

    return {
      tone: 'green',
      label: 'Saludable',
      description:
        'Tus ingresos sostienen bien el mes, la deuda luce controlada y existe margen para ahorro o pago anticipado.',
    };
  }

  private buildAnswers(
    balance: number,
    debtRatio: number | null,
    topCategories: CategoryStat[],
    trend: TrendPoint[],
    interestRatio: number | null,
    totalIncome: number,
  ): InsightItem[] {
    const lastMonth = trend[trend.length - 1];
    const previousMonth = trend[trend.length - 2];
    const trendText =
      previousMonth && lastMonth
        ? lastMonth.balance >= previousMonth.balance
          ? 'Estas mejorando frente al mes anterior.'
          : 'Tu cierre empeoro frente al mes anterior.'
        : 'Aun no hay historial suficiente para comparar tendencia.';
    const topCategory = topCategories[0];

    return [
      {
        title: 'Estoy gastando mas de lo que gano?',
        text:
          balance < 0
            ? 'Si. El balance mensual es negativo y el egreso supera al ingreso del periodo.'
            : 'No. Tus ingresos alcanzan para cubrir los egresos del mes seleccionado.',
        tone: balance < 0 ? 'danger' : 'good',
      },
      {
        title: 'Tengo capacidad para pagar mis deudas?',
        text:
          debtRatio === null
            ? 'No hay ingresos suficientes para medir la capacidad de pago este mes.'
            : debtRatio > 0.5
              ? 'La deuda mensual absorbe demasiado ingreso y existe riesgo de sobreendeudamiento.'
              : debtRatio >= 0.3
                ? 'La deuda aun cabe, pero ya esta cerca del umbral de advertencia.'
                : 'La carga mensual de deuda esta en un rango razonable frente a tus ingresos.',
        tone: debtRatio === null ? 'neutral' : debtRatio > 0.5 ? 'danger' : debtRatio >= 0.3 ? 'warning' : 'good',
      },
      {
        title: 'Donde gasto mas dinero?',
        text: topCategory
          ? `${topCategory.name} es tu mayor salida del mes con ${this.formatCurrency(topCategory.amount)} y ${this.formatPercent(topCategory.share)} del gasto.`
          : 'No hay una categoria dominante en el periodo filtrado.',
        tone: topCategory ? 'info' : 'neutral',
      },
      {
        title: 'Estoy mejorando o empeorando financieramente?',
        text: trendText,
        tone: previousMonth && lastMonth && lastMonth.balance < previousMonth.balance ? 'warning' : 'good',
      },
      {
        title: 'Mis intereses son altos?',
        text:
          interestRatio === null
            ? 'No hay base suficiente para medir la carga de intereses.'
            : interestRatio > 0.15
              ? 'Si. El costo financiero ya pesa demasiado frente a tu ingreso disponible.'
              : interestRatio >= 0.08
                ? 'Estan en una zona intermedia y conviene vigilarlo de cerca.'
                : 'No lucen elevados frente a tu capacidad del mes.',
        tone: interestRatio === null ? 'neutral' : interestRatio > 0.15 ? 'danger' : interestRatio >= 0.08 ? 'warning' : 'good',
      },
      {
        title: 'Que deberia corregir?',
        text:
          balance < 0
            ? 'Empieza por bajar gasto variable y proteger el ingreso libre antes de asumir nuevas cuotas.'
            : totalIncome === 0
              ? 'Registra o consolida mejor los ingresos del mes para tener una lectura realista.'
              : 'Mantener ahorro automatico y atacar primero la deuda con interes mas alto te dara el mejor impacto.',
        tone: balance < 0 ? 'danger' : 'info',
      },
    ];
  }

  private buildInsights(
    topCategories: CategoryStat[],
    topSubcategories: CategoryStat[],
    totalIncome: number,
    debtRatio: number | null,
    balance: number,
    trend: TrendPoint[],
    interestRatio: number | null,
  ): InsightItem[] {
    const insights: InsightItem[] = [];
    const topCategory = topCategories[0];
    const topSubcategory = topSubcategories[0];
    const lastMonth = trend[trend.length - 1];
    const previousMonth = trend[trend.length - 2];

    if (topCategory && totalIncome > 0) {
      insights.push({
        title: 'Categoria dominante',
        text: `Tu mayor gasto del mes fue ${topCategory.name} y representa ${this.formatPercent(topCategory.amount / totalIncome)} de tus ingresos.`,
        tone: topCategory.share > 0.35 ? 'warning' : 'info',
      });
    }

    if (topSubcategory && totalIncome > 0) {
      insights.push({
        title: 'Habito principal',
        text: `${topSubcategory.name} absorbe ${this.formatPercent(topSubcategory.amount / totalIncome)} del ingreso mensual analizado.`,
        tone: topSubcategory.share > 0.2 ? 'warning' : 'neutral',
      });
    }

    if (debtRatio !== null) {
      insights.push({
        title: 'Peso de la deuda',
        text:
          debtRatio > 0.5
            ? `Tu deuda mensual representa ${this.formatPercent(debtRatio)} de tus ingresos y existe riesgo claro de sobreendeudamiento.`
            : debtRatio >= 0.3
              ? `Tu deuda mensual representa ${this.formatPercent(debtRatio)} de tus ingresos, ya en zona de advertencia.`
              : `Tu deuda mensual representa ${this.formatPercent(debtRatio)} de tus ingresos y se mantiene en rango saludable.`,
        tone: debtRatio > 0.5 ? 'danger' : debtRatio >= 0.3 ? 'warning' : 'good',
      });
    }

    if (interestRatio !== null) {
      insights.push({
        title: 'Costo financiero',
        text:
          interestRatio > 0.15
            ? 'Tus intereses financieros son elevados respecto a tu capacidad de pago actual.'
            : interestRatio >= 0.08
              ? 'Tus intereses aun son manejables, pero ya estan recortando espacio para ahorro.'
              : 'La presion por intereses luce contenida en este mes.',
        tone: interestRatio > 0.15 ? 'danger' : interestRatio >= 0.08 ? 'warning' : 'good',
      });
    }

    if (previousMonth && lastMonth) {
      insights.push({
        title: 'Direccion mensual',
        text:
          lastMonth.balance >= previousMonth.balance
            ? 'La evolucion mensual muestra mejora reciente en el balance.'
            : 'La evolucion mensual muestra deterioro reciente y conviene revisar que disparo el gasto.',
        tone: lastMonth.balance >= previousMonth.balance ? 'good' : 'warning',
      });
    }

    insights.push({
      title: 'Lectura general',
      text:
        balance >= 0
          ? 'El mes se sostiene con caja positiva, ahora la oportunidad es convertir esa holgura en ahorro o amortizacion.'
          : 'El mes no se sostiene por si solo; necesitas corregir una mezcla de gasto variable y presion de deuda.',
      tone: balance >= 0 ? 'good' : 'danger',
    });

    return insights.slice(0, 6);
  }

  private buildRecommendations(
    balance: number,
    debtRatio: number | null,
    savingsRate: number | null,
    interestRatio: number | null,
    hormigaIndicator: { share: number; count: number; amount: number },
    topCategories: CategoryStat[],
  ): InsightItem[] {
    const recommendations: InsightItem[] = [];

    if (balance < 0) {
      recommendations.push({
        title: 'Recupera balance positivo',
        text: 'Congela gasto variable por dos semanas y evita nuevas cuotas hasta que el mes vuelva a cerrar en positivo.',
        tone: 'danger',
      });
    }

    if (debtRatio !== null && debtRatio > 0.5) {
      recommendations.push({
        title: 'Baja la presion de deuda',
        text: 'Prioriza pagos con mayor interes y evita refinanciar consumo corriente; tu deuda ya consume demasiado ingreso.',
        tone: 'danger',
      });
    } else if (debtRatio !== null && debtRatio >= 0.3) {
      recommendations.push({
        title: 'Protege tu capacidad de pago',
        text: 'Mantente debajo del 30% de deuda mensual contra ingresos para recuperar margen de maniobra.',
        tone: 'warning',
      });
    }

    if (interestRatio !== null && interestRatio > 0.12) {
      recommendations.push({
        title: 'Reduce intereses caros',
        text: 'Ataca primero la deuda con mayor tasa efectiva; bajar interes suele liberar caja mas rapido que repartir pagos.',
        tone: 'danger',
      });
    }

    if (hormigaIndicator.share >= 0.12 && hormigaIndicator.count >= 5) {
      recommendations.push({
        title: 'Controla los gastos hormiga',
        text: `${this.formatCurrency(hormigaIndicator.amount)} se fue en gastos pequenos repetidos. Un tope semanal puede recuperar ahorro sin cambios extremos.`,
        tone: 'warning',
      });
    }

    if (topCategories[0]) {
      recommendations.push({
        title: 'Pon limite a tu categoria principal',
        text: `Define un presupuesto puntual para ${topCategories[0].name}; es el mejor lugar para corregir rapido el gasto total.`,
        tone: 'info',
      });
    }

    if (savingsRate !== null && savingsRate >= 0.1) {
      recommendations.push({
        title: 'Convierte el buen mes en patrimonio',
        text: 'Automatiza el ahorro del excedente o amortiza deuda cara para que el resultado saludable se mantenga.',
        tone: 'good',
      });
    }

    return recommendations.slice(0, 5);
  }

  private buildCategoryBreakdownSummary(
    categoryName: string,
    subcategories: SubcategoryBreakdownStat[],
  ): string {
    const topSubcategory = subcategories[0] ?? null;
    const secondSubcategory = subcategories[1] ?? null;
    const normalizedCategory = this.normalizeText(categoryName);

    if (!topSubcategory) {
      return `${categoryName} no tiene subcategorias visibles en el periodo analizado.`;
    }

    if (
      normalizedCategory.includes('alimentacion') ||
      normalizedCategory.includes('alimento') ||
      normalizedCategory.includes('comida')
    ) {
      if (secondSubcategory) {
        return `En ${categoryName}, ${topSubcategory.name} lidera con ${this.formatPercent(topSubcategory.shareOfCategory)} de la categoria; luego sigue ${secondSubcategory.name}.`;
      }

      return `En ${categoryName}, ${topSubcategory.name} explica ${this.formatPercent(topSubcategory.shareOfCategory)} del gasto de la categoria.`;
    }

    if (topSubcategory.shareOfCategory >= 0.6) {
      return `${topSubcategory.name} concentra ${this.formatPercent(topSubcategory.shareOfCategory)} del gasto de ${categoryName}.`;
    }

    if (secondSubcategory) {
      return `${categoryName} se reparte sobre todo entre ${topSubcategory.name} y ${secondSubcategory.name}.`;
    }

    return `${topSubcategory.name} es la principal salida dentro de ${categoryName}.`;
  }

  private buildDebtEntities(records: AnalysisRecord[]): DebtEntityItem[] {
    const groups = new Map<string, DebtEntityItem>();

    for (const record of records) {
      if (!record.isDebtLike) {
        continue;
      }

      const current = groups.get(record.entityName) ?? {
        name: record.entityName,
        pendingDebt: 0,
        interestPending: 0,
        monthlyDue: 0,
        tone: 'neutral' as DashboardTone,
      };

      current.pendingDebt += record.pendingDebt;
      current.interestPending += record.interestPending;
      current.monthlyDue += record.debtDue;
      groups.set(record.entityName, current);
    }

    return Array.from(groups.values())
      .map((item) => ({
        ...item,
        pendingDebt: this.roundMoney(item.pendingDebt),
        interestPending: this.roundMoney(item.interestPending),
        monthlyDue: this.roundMoney(item.monthlyDue),
        tone:
          item.interestPending > item.monthlyDue * 0.25
            ? ('danger' as DashboardTone)
            : item.pendingDebt > 0
              ? ('warning' as DashboardTone)
              : ('good' as DashboardTone),
      }))
      .sort((a, b) => b.pendingDebt - a.pendingDebt)
      .slice(0, 5);
  }

  private buildConicGradient(items: CategoryStat[]): string {
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

  private buildIncomeExpenseBar(income: number, expense: number): string {
    const total = income + expense;
    if (total <= 0) {
      return 'linear-gradient(90deg, #dbe4f0 0 100%)';
    }

    const incomeShare = (income / total) * 100;
    return `linear-gradient(90deg, #22c55e 0 ${incomeShare}%, #ef4444 ${incomeShare}% 100%)`;
  }

  private detectGastosHormiga(
    expenseRecords: AnalysisRecord[],
    totalExpense: number,
  ): { share: number; count: number; amount: number } {
    const hormiga = expenseRecords.filter((item) => item.amount <= 20);
    const amount = this.roundMoney(hormiga.reduce((sum, item) => sum + item.amount, 0));
    return {
      share: totalExpense > 0 ? amount / totalExpense : 0,
      count: hormiga.length,
      amount,
    };
  }

  private buildSummary(
    balance: number,
    debtRatio: number | null,
    trend: TrendPoint[],
    interestRatio: number | null,
    topCategoryName: string,
  ): string {
    const lastMonth = trend[trend.length - 1];
    const previousMonth = trend[trend.length - 2];
    const trendText =
      previousMonth && lastMonth
        ? lastMonth.balance >= previousMonth.balance
          ? 'La tendencia reciente viene mejorando.'
          : 'La tendencia reciente muestra deterioro.'
        : 'Aun hay poco historial para medir tendencia.';
    const balanceText =
      balance >= 0
        ? 'El mes cierra en positivo.'
        : 'El mes cierra en negativo y exige correccion.';
    const debtText =
      debtRatio === null
        ? 'No hay base suficiente para medir deuda contra ingresos.'
        : `La deuda mensual consume ${this.formatPercent(debtRatio)} de tus ingresos.`;
    const interestText =
      interestRatio === null
        ? 'La carga de intereses no pudo medirse con precision.'
        : interestRatio > 0.12
          ? 'Los intereses ya pesan de forma importante.'
          : 'Los intereses siguen contenidos.';
    const categoryText = topCategoryName
      ? `${topCategoryName} es la categoria con mayor salida.`
      : 'No hay una categoria dominante este mes.';

    return `${balanceText} ${debtText} ${interestText} ${trendText} ${categoryText}`;
  }

  private createEmptyAnalysis(): AnalysisViewModel {
    return {
      hasData: false,
      monthLabel: this.capitalizeText(
        this.monthFormatter.format(new Date(new Date().getFullYear(), new Date().getMonth(), 1)),
      ),
      summary:
        'Selecciona mes y anio para revisar ingresos, gastos, deuda e intereses usando solo detalles pagados o pendientes de pago.',
      trafficLight: {
        tone: 'yellow',
        label: 'Sin datos suficientes',
        description: 'Aun no hay movimientos visibles para construir el analisis financiero del periodo.',
      },
      kpis: [],
      topCategories: [],
      topSubcategories: [],
      categoryBreakdowns: [],
      categoryDonutStyle: 'conic-gradient(#dbe4f0 0 100%)',
      categoryDonutCenter: this.formatCurrency(0),
      incomeExpenseBarStyle: 'linear-gradient(90deg, #dbe4f0 0 100%)',
      trend: [],
      trendChart: {
        incomePoints: '',
        expensePoints: '',
        balancePoints: '',
        zeroLineY: 50,
      },
      debtEntities: [],
      insights: [],
      recommendations: [],
      answers: [],
      debtPending: 0,
      interestPaid: 0,
      interestPending: 0,
      debtMonthly: 0,
      totalIncome: 0,
      totalExpense: 0,
      balance: 0,
    };
  }

  private getMonthKey(date: Date): string {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
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

    if (paymentMethod?.calcula_interes !== true || !this.shouldApplyInterestToDetail(detail)) {
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

  private normalizeText(value: string): string {
    return value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim()
      .toLowerCase();
  }

  private capitalizeText(value: string): string {
    if (!value) {
      return value;
    }

    return value.charAt(0).toUpperCase() + value.slice(1);
  }
}
