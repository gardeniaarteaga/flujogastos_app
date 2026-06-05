import { HttpClient } from '@angular/common/http';
import { NgClass, NgFor, NgIf } from '@angular/common';
import { ChangeDetectorRef, Component, HostListener, OnInit, inject } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { firstValueFrom, timeout } from 'rxjs';

import { SessionStripComponent } from '../../shared/session-strip/session-strip.component';
import {
  CatalogoEntidadFinanciera,
  CatalogoFormaPago,
  CatalogosTransaccionService,
} from '../../shared/services/catalogos-transaccion.service';
import {
  ConfiguracionNotificacionPago,
  NotificacionesService,
} from '../../shared/services/notificaciones.service';
import { apiUrl } from '../../shared/config/api.config';
import { getCurrentUserId, isAdminUser, loadUserProfile } from '../../shared/user-profile';

type DashboardTone = 'good' | 'warning' | 'danger' | 'info' | 'neutral';
type DashboardPeriodType = 'month' | 'quincena';
type DashboardQuincena = 'first' | 'second';

interface DashboardPeriodRange {
  type: DashboardPeriodType;
  start: Date;
  end: Date;
  label: string;
  descriptionLabel: string;
}

interface ScheduledNotificationView {
  id_notificacion_programada: number;
  descripcion: string;
  prioridad: string;
  vigenciaLabel: string;
  frecuenciaLabel: string;
  quincenaLabel: string;
  periodicidadNombre: string;
  nextDateLabel: string;
  relativeLabel: string;
  statusLabel: string;
  tone: DashboardTone;
}

interface ParticipanteDetalleListado {
  id_usuario_relacionado: number | null;
  monto: number;
  monto_pagado: number;
  interes_pagado: number;
  interes_pendiente: number;
  saldo_pendiente: number;
  fecha_programada: string | null;
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
  id_estado?: number | null;
  nombre_estado?: string | null;
  id_estado_registro?: number | null;
  nombre_estado_registro?: string | null;
  id_metodo_pago: number;
  nombre_forma_pago?: string | null;
  id_categoria: number;
  nombre_categoria: string | null;
  id_subcategoria: number | null;
  nombre_subcategoria: string | null;
  descripcion: string | null;
  titular?: string | null;
  participantes_detalle: ParticipanteDetalleListado[];
}

interface PersonalDebtDetail {
  amount: number;
  amountPaid: number;
  pending: number;
  pendingInterest: number;
  totalInterest: number;
  dueDate: Date | null;
  scheduledTotal: number;
}

interface EnrichedTransaction {
  source: TransaccionListado;
  type: 'income' | 'expense';
  date: Date | null;
  monthKey: string | null;
  categoryName: string;
  subcategoryName: string;
  description: string;
  paymentMethodName: string;
  personalAmount: number;
  personalDebt: number;
  pendingInterest: number;
  totalInterest: number;
  pendingInstallments: number;
  latestDueDate: Date | null;
  entityName: string;
  details: PersonalDebtDetail[];
}

interface DashboardKpi {
  key: 'income' | 'expense' | 'shared';
  label: string;
  value: number;
  detail: string;
  helper: string;
  tone: DashboardTone;
}

interface DashboardTransactionModalRow {
  date: Date | null;
  dateLabel: string;
  description: string;
  categoryName: string;
  subcategoryName: string;
  paymentMethodName: string;
  statusLabel: string;
  statusTone: DashboardTone;
  amount: number;
  senderName: string | null;
}

interface DashboardTransactionModalData {
  title: string;
  subtitle: string;
  rows: DashboardTransactionModalRow[];
  showSender: boolean;
}

interface QuickAccessItem {
  label: string;
  helper: string;
  route: string;
  accent: 'violet' | 'amber' | 'teal';
}

interface RankingItem {
  name: string;
  amount: number;
  share: number;
  count: number;
  secondary: string;
  color: string;
  tone: DashboardTone;
}

interface DonutSegment {
  label: string;
  value: number;
  share: number;
  color: string;
  dasharray: string;
  dashoffset: string;
}

interface DonutChartModel {
  title: string;
  subtitle: string;
  total: number;
  totalLabel: string;
  empty: boolean;
  segments: DonutSegment[];
  legend: RankingItem[];
}

interface TrendMonth {
  key: string;
  label: string;
  income: number;
  expense: number;
  balance: number;
  debtDue: number;
  paymentCapacity: number | null;
}

interface TrendChartModel {
  months: TrendMonth[];
  incomePoints: string;
  expensePoints: string;
  balancePoints: string;
  zeroLineY: number;
}

interface CapacityModel {
  ratio: number | null;
  tone: DashboardTone;
  headline: string;
  description: string;
  income: number;
  debtDue: number;
  progress: number;
}

interface HormigaGroup {
  label: string;
  category: string;
  count: number;
  total: number;
  average: number;
  share: number;
}

interface InsightAnswer {
  question: string;
  answer: string;
  tone: DashboardTone;
}

interface Recommendation {
  title: string;
  message: string;
  metric: string;
  tone: DashboardTone;
}

interface DebtEntitySummary {
  entityName: string;
  debt: number;
  pendingInterest: number;
  pendingInstallments: number;
  projectedEnd: string;
  tone: DashboardTone;
}

interface DebtSummaryModel {
  totalDebt: number;
  totalInterest: number;
  pendingInstallments: number;
  projectedEndLabel: string;
  highestDebtEntity: string;
  highestInterestEntity: string;
}

interface ScheduledTransactionDetail {
  scheduledDate: string;
  description: string;
  categoryName: string;
  subcategoryName: string;
  paymentMethodName: string;
  entityName: string;
  amount: number;
  amountPaid: number;
  pending: number;
  statusLabel: string;
  tone: DashboardTone;
}

interface DashboardAnalytics {
  hasData: boolean;
  currentPeriodLabel: string;
  healthScore: number;
  healthTone: DashboardTone;
  healthLabel: string;
  summary: string;
  kpis: DashboardKpi[];
  capacity: CapacityModel;
  categoryDonut: DonutChartModel;
  subcategoryDonut: DonutChartModel;
  trendChart: TrendChartModel;
  topCategories: RankingItem[];
  hormigas: HormigaGroup[];
  insights: InsightAnswer[];
  debtSummary: DebtSummaryModel;
  debtEntities: DebtEntitySummary[];
  recommendations: Recommendation[];
  trendTable: TrendMonth[];
  scheduledDetails: ScheduledTransactionDetail[];
}

@Component({
  selector: 'app-dashboard',
  imports: [RouterLink, RouterLinkActive, NgIf, NgFor, NgClass, SessionStripComponent],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.css',
})
export class Dashboard implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly catalogosService = inject(CatalogosTransaccionService);
  private readonly notificacionesService = inject(NotificacionesService);
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
  private readonly monthNameFormatter = new Intl.DateTimeFormat('es-SV', {
    month: 'long',
  });
  private readonly monthFormatter = new Intl.DateTimeFormat('es-SV', {
    month: 'long',
    year: 'numeric',
  });
  private readonly shortMonthFormatter = new Intl.DateTimeFormat('es-SV', {
    month: 'short',
  });
  private readonly fullDateFormatter = new Intl.DateTimeFormat('es-SV', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
  private readonly relativeDayFormatter = new Intl.RelativeTimeFormat('es', {
    numeric: 'auto',
  });
  private readonly chartColors = ['#2563eb', '#f97316', '#e11d48', '#0f766e', '#8b5cf6'];
  private readonly quickAccessCatalog: QuickAccessItem[] = [
    {
      label: 'Formas de pago',
      helper: 'Metodos y cuentas',
      route: '/formas-pago',
      accent: 'violet',
    },
    {
      label: 'Categorias',
      helper: 'Ordena tus gastos',
      route: '/categorias',
      accent: 'amber',
    },
    {
      label: 'Participantes',
      helper: 'Miembros y cuotas',
      route: '/participantes',
      accent: 'teal',
    },
  ];

  loading = false;
  errorMessage = '';
  scheduledNotificationsError = '';
  sidebarCollapsed = false;
  transactionsOpen = true;
  maintenanceOpen = false;
  readonly userProfile = loadUserProfile();
  currentUserId = getCurrentUserId();
  selectedPeriodType: DashboardPeriodType = 'month';
  selectedMonth = this.getToday().getMonth() + 1;
  selectedYear = this.getToday().getFullYear();
  selectedQuincena: DashboardQuincena = this.getToday().getDate() <= 15 ? 'first' : 'second';
  availableYears: number[] = [this.selectedYear];
  readonly periodTypeOptions: Array<{ value: DashboardPeriodType; label: string }> = [
    { value: 'month', label: 'Mes' },
    { value: 'quincena', label: 'Quincena' },
  ];
  readonly monthOptions = Array.from({ length: 12 }, (_, index) => ({
    value: index + 1,
    label: this.capitalizeText(this.monthNameFormatter.format(new Date(2024, index, 1))),
  }));
  readonly quincenaOptions: Array<{ value: DashboardQuincena; label: string }> = [
    { value: 'first', label: '1 - 15' },
    { value: 'second', label: '16 - fin de mes' },
  ];
  analytics = this.createEmptyAnalytics();
  scheduledNotifications: ScheduledNotificationView[] = [];
  transactions: TransaccionListado[] = [];
  dashboardTransactionsModalOpen = false;
  dashboardTransactionsModalTitle = '';
  dashboardTransactionsModalSubtitle = '';
  dashboardTransactionsModalRows: DashboardTransactionModalRow[] = [];
  dashboardTransactionsModalShowSender = false;
  dashboardTransactionsModalData: Record<'income' | 'expense' | 'shared', DashboardTransactionModalData> = {
    income: { title: '', subtitle: '', rows: [], showSender: false },
    expense: { title: '', subtitle: '', rows: [], showSender: false },
    shared: { title: '', subtitle: '', rows: [], showSender: true },
  };

  get isAdminSession(): boolean {
    return isAdminUser();
  }

  get dashboardQuickAccessItems(): QuickAccessItem[] {
    return this.quickAccessCatalog;
  }

  ngOnInit(): void {
    void this.loadDashboard();
  }

  async loadDashboard(): Promise<void> {
    this.loading = true;
    this.errorMessage = '';
    this.scheduledNotificationsError = '';

    try {
      const resolvedUserId = await this.catalogosService.syncCurrentUserId();
      this.currentUserId = resolvedUserId > 0 ? resolvedUserId : this.currentUserId;

      const [transacciones, programadas] = await Promise.all([
        firstValueFrom(
          this.http
            .get<TransaccionListado[]>(this.apiUrl, {
              params: { id_usuario: this.currentUserId },
            })
            .pipe(timeout(this.timeoutMs)),
        ),
        this.notificacionesService.loadConfiguracionesPago().catch(() => {
          this.scheduledNotificationsError =
            'No se pudieron cargar las notificaciones programadas del usuario actual.';
          return [];
        }),
      ]);

      this.transactions = this.filterVisibleTransactions(Array.isArray(transacciones) ? transacciones : []);
      this.availableYears = this.buildAvailableYears(this.transactions);
      this.refreshDashboardSummary();
      this.scheduledNotifications = this.buildScheduledNotifications(programadas);
    } catch {
      this.transactions = [];
      this.availableYears = this.buildAvailableYears([]);
      this.analytics = this.createEmptyAnalytics();
      this.prepareDashboardTransactionsModalData();
      this.scheduledNotifications = [];
      this.errorMessage =
        'No se pudo construir la reporteria financiera con la informacion disponible.';
    } finally {
      this.loading = false;
      this.cdr.detectChanges();
    }
  }

  toggleMaintenanceMenu(): void {
    this.maintenanceOpen = !this.maintenanceOpen;
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

  formatFullDate(value: string): string {
    if (!value || value === 'Sin fecha definida') {
      return value || 'Sin fecha definida';
    }

    const date = this.parseDateOnly(value);

    if (!date) {
      return value;
    }

    return this.fullDateFormatter.format(date);
  }

  formatScheduledDateLabel(configuracion: ScheduledNotificationView): string {
    return `${configuracion.nextDateLabel} | ${configuracion.relativeLabel}`;
  }

  onSelectedMonthChange(value: string): void {
    const nextMonth = Number(value);

    if (!Number.isInteger(nextMonth) || nextMonth < 1 || nextMonth > 12 || nextMonth === this.selectedMonth) {
      return;
    }

    this.selectedMonth = nextMonth;
    this.refreshDashboardSummary();
  }

  onSelectedPeriodTypeChange(value: string): void {
    if (value !== 'month' && value !== 'quincena') {
      return;
    }

    if (value === this.selectedPeriodType) {
      return;
    }

    this.selectedPeriodType = value;
    this.refreshDashboardSummary();
  }

  onSelectedQuincenaChange(value: string): void {
    if (value !== 'first' && value !== 'second') {
      return;
    }

    if (value === this.selectedQuincena) {
      return;
    }

    this.selectedQuincena = value;
    this.refreshDashboardSummary();
  }

  onSelectedYearChange(value: string): void {
    const nextYear = Number(value);

    if (!Number.isInteger(nextYear) || nextYear === this.selectedYear) {
      return;
    }

    this.selectedYear = nextYear;
    this.refreshDashboardSummary();
  }

  openTransactionsSummaryModal(kpi: DashboardKpi): void {
    const modalData = this.dashboardTransactionsModalData[kpi.key];

    this.dashboardTransactionsModalTitle = modalData.title;
    this.dashboardTransactionsModalSubtitle = modalData.subtitle;
    this.dashboardTransactionsModalRows = modalData.rows;
    this.dashboardTransactionsModalShowSender = modalData.showSender;

    this.dashboardTransactionsModalOpen = true;
  }

  closeTransactionsSummaryModal(): void {
    this.dashboardTransactionsModalOpen = false;
  }

  @HostListener('document:keydown.escape')
  onEscapeKey(): void {
    if (this.dashboardTransactionsModalOpen) {
      this.closeTransactionsSummaryModal();
    }
  }

  private buildAnalytics(
    transacciones: TransaccionListado[],
    selectedPeriod: DashboardPeriodRange = this.getSelectedPeriodRange(),
  ): DashboardAnalytics {
    const currentPeriodLabel = selectedPeriod.label;
    const incomeLabelSuffix = selectedPeriod.type === 'month' ? 'del mes' : 'de la quincena';
    const expenseLabelSuffix = incomeLabelSuffix;
    const periodSummary =
      selectedPeriod.type === 'month' ? 'del mes seleccionado' : 'de la quincena seleccionada';

    const currentPeriodIncome = this.roundMoney(
      transacciones.reduce(
        (sum, transaction) => sum + this.resolveTitularIncomeForPeriod(transaction, selectedPeriod),
        0,
      ),
    );
    const currentPeriodExpense = this.roundMoney(
      transacciones.reduce(
        (sum, transaction) => sum + this.resolveTitularExpenseForPeriod(transaction, selectedPeriod),
        0,
      ),
    );
    const currentPeriodSharedExpenseAssigned = this.roundMoney(
      transacciones.reduce(
        (sum, transaction) =>
          sum + this.resolveSharedExpenseAssignedForPeriod(transaction, selectedPeriod),
        0,
      ),
    );
    const hasData =
      currentPeriodIncome > 0 ||
      currentPeriodExpense > 0 ||
      currentPeriodSharedExpenseAssigned > 0;

    return {
      hasData,
      currentPeriodLabel,
      healthScore: 0,
      healthTone: 'neutral',
      healthLabel: 'Resumen del titular',
      summary: `Vista del titular para ${selectedPeriod.descriptionLabel}.`,
      kpis: [
        {
          key: 'income',
          label: `Total ingresos ${incomeLabelSuffix}`,
          value: currentPeriodIncome,
          detail: 'Solo titular',
          helper: '',
          tone: 'good',
        },
        {
          key: 'expense',
          label: `Total gastos ${expenseLabelSuffix}`,
          value: currentPeriodExpense,
          detail: 'Solo titular',
          helper: '',
          tone: currentPeriodExpense > 0 ? 'warning' : 'neutral',
        },
        {
          key: 'shared',
          label: 'Gastos compartidos a mi nombre',
          value: currentPeriodSharedExpenseAssigned,
          detail: 'Registrados por otros',
          helper: '',
          tone: currentPeriodSharedExpenseAssigned > 0 ? 'info' : 'neutral',
        },
      ],
      capacity: {
        ratio: null,
        tone: 'neutral',
        headline: 'No aplica',
        description: '',
        income: 0,
        debtDue: 0,
        progress: 0,
      },
      categoryDonut: {
        title: '',
        subtitle: '',
        total: 0,
        totalLabel: '',
        empty: true,
        segments: [],
        legend: [],
      },
      subcategoryDonut: {
        title: '',
        subtitle: '',
        total: 0,
        totalLabel: '',
        empty: true,
        segments: [],
        legend: [],
      },
      trendChart: {
        months: [],
        incomePoints: '',
        expensePoints: '',
        balancePoints: '',
        zeroLineY: 0,
      },
      topCategories: [],
      hormigas: [],
      insights: [],
      debtSummary: {
        totalDebt: 0,
        totalInterest: 0,
        pendingInstallments: 0,
        projectedEndLabel: '',
        highestDebtEntity: '',
        highestInterestEntity: '',
      },
      debtEntities: [],
      recommendations: [],
      trendTable: [],
      scheduledDetails: [],
    };
  }

  private resolveTitularIncomeForPeriod(
    transaction: TransaccionListado,
    selectedPeriod: DashboardPeriodRange,
  ): number {
    if (transaction.id_tipo_transaccion !== 2) {
      return 0;
    }

    const titularDetails = this.getTitularDetails(transaction);

    if (titularDetails.length === 0) {
      const date = this.parseDateOnly(transaction.fecha);
      return date && this.isDateWithinPeriod(date, selectedPeriod)
        ? this.roundMoney(Math.max(0, this.normalizeAmount(transaction.monto)))
        : 0;
    }

    return this.roundMoney(
      titularDetails.reduce((sum, detail) => {
        const detailDate =
          this.parseDateOnly(detail.fecha_programada) ??
          this.parseDateOnly(transaction.fecha);

        if (!detailDate || !this.isDateWithinPeriod(detailDate, selectedPeriod)) {
          return sum;
        }

        return sum + Math.max(0, this.normalizeAmount(detail.monto));
      }, 0),
    );
  }

  private resolveTitularExpenseForPeriod(
    transaction: TransaccionListado,
    selectedPeriod: DashboardPeriodRange,
  ): number {
    if (transaction.id_tipo_transaccion === 2) {
      return 0;
    }

    const titularDetails = this.getTitularDetails(transaction);

    return this.roundMoney(
      titularDetails.reduce((sum, detail) => {
        const detailDate =
          this.parseDateOnly(detail.fecha_programada) ??
          this.parseDateOnly(transaction.fecha);

        if (!detailDate || !this.isDateWithinPeriod(detailDate, selectedPeriod)) {
          return sum;
        }

        return (
          sum +
          Math.max(0, this.normalizeAmount(detail.monto)) +
          Math.max(0, this.normalizeAmount(detail.interes_pagado)) +
          Math.max(0, this.normalizeAmount(detail.interes_pendiente))
        );
      }, 0),
    );
  }

  private getTitularDetails(transaction: TransaccionListado): ParticipanteDetalleListado[] {
    const details = Array.isArray(transaction.participantes_detalle)
      ? transaction.participantes_detalle
      : [];

    return details.filter((detail) => detail.es_titular);
  }

  private resolveSharedExpenseAssignedForPeriod(
    transaction: TransaccionListado,
    selectedPeriod: DashboardPeriodRange,
  ): number {
    if (transaction.id_tipo_transaccion === 2 || transaction.es_propietario || this.currentUserId <= 0) {
      return 0;
    }

    const assignedDetails = this.getCurrentUserAssignedSharedDetails(transaction);

    return this.roundMoney(
      assignedDetails.reduce((sum, detail) => {
        const detailDate =
          this.parseDateOnly(detail.fecha_programada) ??
          this.parseDateOnly(transaction.fecha);

        if (!detailDate || !this.isDateWithinPeriod(detailDate, selectedPeriod)) {
          return sum;
        }

        return (
          sum +
          Math.max(0, this.normalizeAmount(detail.monto)) +
          Math.max(0, this.normalizeAmount(detail.interes_pagado)) +
          Math.max(0, this.normalizeAmount(detail.interes_pendiente))
        );
      }, 0),
    );
  }

  private getCurrentUserAssignedSharedDetails(
    transaction: TransaccionListado,
  ): ParticipanteDetalleListado[] {
    const details = Array.isArray(transaction.participantes_detalle)
      ? transaction.participantes_detalle
      : [];

    return details.filter(
      (detail) =>
        !detail.es_titular && detail.id_usuario_relacionado === this.currentUserId,
    );
  }

  private buildIncomeModalRows(selectedPeriod: DashboardPeriodRange): DashboardTransactionModalRow[] {
    const rows: DashboardTransactionModalRow[] = [];

    for (const transaction of this.transactions) {
      if (transaction.id_tipo_transaccion !== 2) {
        continue;
      }

      const titularDetails = this.getTitularDetails(transaction);

      if (titularDetails.length === 0) {
        const transactionDate = this.parseDateOnly(transaction.fecha);

        if (!transactionDate || !this.isDateWithinPeriod(transactionDate, selectedPeriod)) {
          continue;
        }

        rows.push(this.createDashboardTransactionModalRow(transaction, transactionDate, transaction.monto));
        continue;
      }

      for (const detail of titularDetails) {
        const detailDate =
          this.parseDateOnly(detail.fecha_programada) ??
          this.parseDateOnly(transaction.fecha);

        if (!detailDate || !this.isDateWithinPeriod(detailDate, selectedPeriod)) {
          continue;
        }

        rows.push(
          this.createDashboardTransactionModalRow(
            transaction,
            detailDate,
            Math.max(0, this.normalizeAmount(detail.monto)),
          ),
        );
      }
    }

    return this.sortDashboardTransactionModalRows(rows);
  }

  private buildExpenseModalRows(selectedPeriod: DashboardPeriodRange): DashboardTransactionModalRow[] {
    const rows: DashboardTransactionModalRow[] = [];

    for (const transaction of this.transactions) {
      if (transaction.id_tipo_transaccion === 2) {
        continue;
      }

      for (const detail of this.getTitularDetails(transaction)) {
        const detailDate =
          this.parseDateOnly(detail.fecha_programada) ??
          this.parseDateOnly(transaction.fecha);

        if (!detailDate || !this.isDateWithinPeriod(detailDate, selectedPeriod)) {
          continue;
        }

        rows.push(
          this.createDashboardTransactionModalRow(
            transaction,
            detailDate,
            Math.max(0, this.normalizeAmount(detail.monto)) +
              Math.max(0, this.normalizeAmount(detail.interes_pagado)) +
              Math.max(0, this.normalizeAmount(detail.interes_pendiente)),
          ),
        );
      }
    }

    return this.sortDashboardTransactionModalRows(rows);
  }

  private buildSharedExpenseModalRows(selectedPeriod: DashboardPeriodRange): DashboardTransactionModalRow[] {
    const rows: DashboardTransactionModalRow[] = [];

    for (const transaction of this.transactions) {
      if (transaction.id_tipo_transaccion === 2 || transaction.es_propietario || this.currentUserId <= 0) {
        continue;
      }

      for (const detail of this.getCurrentUserAssignedSharedDetails(transaction)) {
        const detailDate =
          this.parseDateOnly(detail.fecha_programada) ??
          this.parseDateOnly(transaction.fecha);

        if (!detailDate || !this.isDateWithinPeriod(detailDate, selectedPeriod)) {
          continue;
        }

        rows.push(
          this.createDashboardTransactionModalRow(
            transaction,
            detailDate,
            Math.max(0, this.normalizeAmount(detail.monto)) +
              Math.max(0, this.normalizeAmount(detail.interes_pagado)) +
              Math.max(0, this.normalizeAmount(detail.interes_pendiente)),
            transaction.titular?.trim() || 'Sin remitente',
          ),
        );
      }
    }

    return this.sortDashboardTransactionModalRows(rows);
  }

  private createDashboardTransactionModalRow(
    transaction: TransaccionListado,
    detailDate: Date | null,
    amount: number,
    senderName: string | null = null,
  ): DashboardTransactionModalRow {
    const statusLabel = this.getDashboardTransactionStatusLabel(transaction);

    return {
      date: detailDate,
      dateLabel: detailDate ? this.fullDateFormatter.format(detailDate) : 'Sin fecha definida',
      description: transaction.descripcion?.trim() || 'Sin detalle',
      categoryName: transaction.nombre_categoria?.trim() || 'Sin categoria',
      subcategoryName: transaction.nombre_subcategoria?.trim() || 'Sin subcategoria',
      paymentMethodName: transaction.nombre_forma_pago?.trim() || 'Sin forma de pago',
      statusLabel,
      statusTone: this.getDashboardTransactionStatusTone(statusLabel),
      amount: this.roundMoney(Math.max(0, this.normalizeAmount(amount))),
      senderName,
    };
  }

  private sortDashboardTransactionModalRows(
    rows: DashboardTransactionModalRow[],
  ): DashboardTransactionModalRow[] {
    return [...rows].sort((left, right) => {
      const leftTime = left.date?.getTime() ?? 0;
      const rightTime = right.date?.getTime() ?? 0;

      if (rightTime !== leftTime) {
        return rightTime - leftTime;
      }

      return left.description.localeCompare(right.description, 'es');
    });
  }

  private prepareDashboardTransactionsModalData(): void {
    const selectedPeriod = this.getSelectedPeriodRange();
    const subtitle = this.buildTransactionsModalSubtitle(selectedPeriod);

    this.dashboardTransactionsModalData = {
      income: {
        title: 'Detalle de ingresos',
        subtitle,
        rows: this.buildIncomeModalRows(selectedPeriod),
        showSender: false,
      },
      expense: {
        title: 'Detalle de gastos',
        subtitle,
        rows: this.buildExpenseModalRows(selectedPeriod),
        showSender: false,
      },
      shared: {
        title: 'Detalle de gastos compartidos',
        subtitle,
        rows: this.buildSharedExpenseModalRows(selectedPeriod),
        showSender: true,
      },
    };
  }

  private buildTransactionsModalSubtitle(selectedPeriod: DashboardPeriodRange): string {
    if (selectedPeriod.type === 'quincena') {
      return `Movimientos visibles correspondientes a la quincena del ${selectedPeriod.descriptionLabel}.`;
    }

    return `Movimientos visibles correspondientes a ${selectedPeriod.descriptionLabel}.`;
  }

  private enrichTransaction(
    transaction: TransaccionListado,
    formsById: Map<number, CatalogoFormaPago>,
    entitiesById: Map<number, string>,
  ): EnrichedTransaction {
    const type = transaction.id_tipo_transaccion === 2 ? 'income' : 'expense';
    const date = this.parseDateOnly(transaction.fecha);
    const monthKey = date ? this.getMonthKey(date) : null;
    const details = type === 'expense' ? this.buildPersonalDetails(transaction) : [];
    const form = formsById.get(transaction.id_metodo_pago);
    const entityName =
      entitiesById.get(form?.id_entidad ?? -1) ??
      form?.nombre_forma?.trim() ??
      'Sin entidad financiera';
    const personalAmount =
      type === 'income'
        ? this.roundMoney(this.normalizeAmount(transaction.monto))
        : details.length > 0
          ? this.roundMoney(details.reduce((sum, item) => sum + item.amount, 0))
          : this.roundMoney(this.normalizeAmount(transaction.monto));
    const personalDebt =
      type === 'expense'
        ? details.length > 0
          ? this.roundMoney(details.reduce((sum, item) => sum + item.pending, 0))
          : this.roundMoney(Math.max(0, this.normalizeAmount(transaction.saldo_pendiente)))
        : 0;
    const pendingInterest =
      type === 'expense'
        ? details.length > 0
          ? this.roundMoney(details.reduce((sum, item) => sum + item.pendingInterest, 0))
          : this.roundMoney(Math.max(0, this.normalizeAmount(transaction.intereses)))
        : 0;
    const totalInterest =
      type === 'expense'
        ? details.length > 0
          ? this.roundMoney(details.reduce((sum, item) => sum + item.totalInterest, 0))
          : this.roundMoney(Math.max(0, this.normalizeAmount(transaction.intereses)))
        : 0;
    const pendingInstallments = details.filter((item) => item.pending > 0).length;
    const latestDueDate = details
      .map((item) => item.dueDate)
      .filter((item): item is Date => item instanceof Date)
      .sort((a, b) => a.getTime() - b.getTime())
      .pop() ?? null;

    return {
      source: transaction,
      type,
      date,
      monthKey,
      categoryName: transaction.nombre_categoria?.trim() || 'Sin categoria',
      subcategoryName: transaction.nombre_subcategoria?.trim() || 'Sin subcategoria',
      description: transaction.descripcion?.trim() || 'Sin detalle',
      paymentMethodName: form?.nombre_forma?.trim() || 'Sin forma de pago',
      personalAmount,
      personalDebt,
      pendingInterest,
      totalInterest,
      pendingInstallments,
      latestDueDate,
      entityName,
      details,
    };
  }

  private buildPersonalDetails(transaction: TransaccionListado): PersonalDebtDetail[] {
    const details = Array.isArray(transaction.participantes_detalle)
      ? transaction.participantes_detalle
      : [];

    if (details.length === 0) {
      return [];
    }

    const scopedDetails = details.filter((detail) => {
      if (detail.es_titular) {
        return true;
      }

      return this.currentUserId > 0 && detail.id_usuario_relacionado === this.currentUserId;
    });

    const effectiveDetails = scopedDetails.length > 0 ? scopedDetails : details;

    return effectiveDetails.map((detail) => {
      const amount = Math.max(0, this.normalizeAmount(detail.monto));
      const amountPaid = Math.max(0, this.normalizeAmount(detail.monto_pagado));
      const pending = Math.max(0, this.normalizeAmount(detail.saldo_pendiente));
      const pendingInterest = Math.max(0, this.normalizeAmount(detail.interes_pendiente));
      const totalInterest =
        Math.max(0, this.normalizeAmount(detail.interes_pagado)) + pendingInterest;
      const scheduledTotal = this.roundMoney(
        Math.max(amount + totalInterest, pending + amountPaid),
      );

      return {
        amount,
        amountPaid,
        pending,
        pendingInterest,
        totalInterest: this.roundMoney(totalInterest),
        dueDate: this.parseDateOnly(detail.fecha_programada),
        scheduledTotal,
      };
    });
  }

  private buildCapacityModel(income: number, debtDue: number): CapacityModel {
    const ratio = income > 0 ? debtDue / income : debtDue > 0 ? 1 : null;
    let tone: DashboardTone = 'neutral';
    let headline = 'Sin presion de deuda';
    let description = 'No hay cuotas del mes que presionen tus ingresos actuales.';

    if (ratio !== null && ratio > 0.5) {
      tone = 'danger';
      headline = 'Riesgo alto de sobreendeudamiento';
      description =
        'Tus cuotas del mes consumen mas de la mitad del ingreso actual. Conviene recortar gasto variable y priorizar deuda.';
    } else if (ratio !== null && ratio > 0.35) {
      tone = 'warning';
      headline = 'Capacidad de pago comprometida';
      description =
        'La carga de deuda esta por encima del umbral recomendado para un mes saludable.';
    } else if (ratio !== null && ratio > 0.2) {
      tone = 'info';
      headline = 'Capacidad de pago vigilada';
      description =
        'La deuda es manejable, pero conviene vigilar gastos del mes para no reducir el ahorro.';
    } else if (ratio !== null) {
      tone = 'good';
      headline = 'Capacidad de pago saludable';
      description =
        'Las cuotas del mes caben dentro de un rango razonable frente a tus ingresos.';
    }

    return {
      ratio,
      tone,
      headline,
      description,
      income: this.roundMoney(income),
      debtDue: this.roundMoney(debtDue),
      progress: Math.min(1, Math.max(0, ratio ?? 0)),
    };
  }

  private buildRanking(
    transactions: EnrichedTransaction[],
    totalAmount: number,
    pickLabel: (item: EnrichedTransaction) => string,
    groupingLabel: string,
  ): RankingItem[] {
    const grouped = new Map<string, { amount: number; count: number }>();

    for (const item of transactions) {
      const label = pickLabel(item);
      const current = grouped.get(label) ?? { amount: 0, count: 0 };
      current.amount += item.personalAmount;
      current.count += 1;
      grouped.set(label, current);
    }

    return Array.from(grouped.entries())
      .map(([name, value], index) => {
        const share = totalAmount > 0 ? value.amount / totalAmount : 0;

        return {
          name,
          amount: this.roundMoney(value.amount),
          share,
          count: value.count,
          secondary: `${value.count} mov. | ${this.formatPercent(share)} del gasto por ${groupingLabel}`,
          color: this.chartColors[index % this.chartColors.length],
          tone: share > 0.3 ? ('warning' as DashboardTone) : ('info' as DashboardTone),
        };
      })
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 5);
  }

  private buildDonutChart(
    title: string,
    subtitle: string,
    ranking: RankingItem[],
    total: number,
  ): DonutChartModel {
    if (ranking.length === 0 || total <= 0) {
      return {
        title,
        subtitle,
        total: 0,
        totalLabel: 'Sin datos del mes',
        empty: true,
        segments: [],
        legend: [],
      };
    }

    const radius = 38;
    const circumference = 2 * Math.PI * radius;
    let accumulated = 0;

    return {
      title,
      subtitle,
      total,
      totalLabel: this.formatCurrency(total),
      empty: false,
      segments: ranking.map((item) => {
        const segmentLength = circumference * item.share;
        const segment = {
          label: item.name,
          value: item.amount,
          share: item.share,
          color: item.color,
          dasharray: `${segmentLength} ${circumference - segmentLength}`,
          dashoffset: `${-accumulated}`,
        };

        accumulated += segmentLength;
        return segment;
      }),
      legend: ranking,
    };
  }

  private detectGastosHormiga(
    transactions: EnrichedTransaction[],
    currentMonthExpense: number,
    currentMonthIncome: number,
  ): HormigaGroup[] {
    const recentThreshold = new Date();
    recentThreshold.setDate(recentThreshold.getDate() - 90);

    const recentExpenses = transactions.filter(
      (item) =>
        item.type === 'expense' &&
        item.date !== null &&
        item.date >= recentThreshold &&
        item.personalAmount > 0,
    );

    if (recentExpenses.length === 0) {
      return [];
    }

    const averageExpense =
      recentExpenses.reduce((sum, item) => sum + item.personalAmount, 0) / recentExpenses.length;
    const maxThreshold = Math.min(
      25,
      Math.max(6, averageExpense * 0.4, currentMonthIncome > 0 ? currentMonthIncome * 0.025 : 6),
    );
    const grouped = new Map<
      string,
      { label: string; category: string; count: number; total: number }
    >();

    for (const item of recentExpenses) {
      if (item.personalAmount > maxThreshold) {
        continue;
      }

      const label = item.subcategoryName !== 'Sin subcategoria' ? item.subcategoryName : item.description;
      const key = `${item.categoryName}|${label}`;
      const current = grouped.get(key) ?? {
        label,
        category: item.categoryName,
        count: 0,
        total: 0,
      };

      current.count += 1;
      current.total += item.personalAmount;
      grouped.set(key, current);
    }

    return Array.from(grouped.values())
      .filter((item) => item.count >= 3)
      .map((item) => ({
        label: item.label,
        category: item.category,
        count: item.count,
        total: this.roundMoney(item.total),
        average: this.roundMoney(item.total / item.count),
        share: currentMonthExpense > 0 ? item.total / currentMonthExpense : 0,
      }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 5);
  }

  private buildDebtEntities(transactions: EnrichedTransaction[]): DebtEntitySummary[] {
    const grouped = new Map<
      string,
      {
        debt: number;
        pendingInterest: number;
        pendingInstallments: number;
        latestDueDate: Date | null;
      }
    >();

    for (const item of transactions.filter((entry) => entry.type === 'expense' && entry.personalDebt > 0)) {
      const current = grouped.get(item.entityName) ?? {
        debt: 0,
        pendingInterest: 0,
        pendingInstallments: 0,
        latestDueDate: null,
      };

      current.debt += item.personalDebt;
      current.pendingInterest += item.pendingInterest;
      current.pendingInstallments += item.pendingInstallments;

      if (
        item.latestDueDate &&
        (!current.latestDueDate || item.latestDueDate.getTime() > current.latestDueDate.getTime())
      ) {
        current.latestDueDate = item.latestDueDate;
      }

      grouped.set(item.entityName, current);
    }

    return Array.from(grouped.entries())
      .map(([entityName, value]) => ({
        entityName,
        debt: this.roundMoney(value.debt),
        pendingInterest: this.roundMoney(value.pendingInterest),
        pendingInstallments: value.pendingInstallments,
        projectedEnd: value.latestDueDate
          ? this.fullDateFormatter.format(value.latestDueDate)
          : 'Sin fecha definida',
        tone:
          value.debt > 0 && value.pendingInterest / Math.max(value.debt, 1) > 0.12
            ? ('warning' as DashboardTone)
            : ('info' as DashboardTone),
      }))
      .sort((a, b) => b.debt - a.debt)
      .slice(0, 5);
  }

  private buildScheduledTransactionDetails(
    transactions: EnrichedTransaction[],
    monthKey: string,
  ): ScheduledTransactionDetail[] {
    return transactions
      .filter((item) => item.type === 'expense')
      .flatMap((item) =>
        item.details
          .filter((detail) => detail.dueDate && this.getMonthKey(detail.dueDate) === monthKey)
          .map((detail) => {
            const amountPaid = this.roundMoney(detail.amountPaid);
            const pending = this.roundMoney(detail.pending);
            const amount = this.roundMoney(detail.scheduledTotal);
            const statusLabel =
              pending <= 0
                ? 'Pagado'
                : amountPaid > 0
                  ? 'Pago parcial'
                  : 'Pendiente';

            return {
              scheduledDate: this.formatIsoDate(detail.dueDate),
              description: item.description,
              categoryName: item.categoryName,
              subcategoryName: item.subcategoryName,
              paymentMethodName: item.paymentMethodName,
              entityName: item.entityName,
              amount,
              amountPaid,
              pending,
              statusLabel,
              tone:
                pending <= 0
                  ? ('good' as DashboardTone)
                  : amountPaid > 0
                    ? ('info' as DashboardTone)
                    : ('warning' as DashboardTone),
            };
          }),
      )
      .sort((left, right) => {
        if (left.scheduledDate !== right.scheduledDate) {
          return left.scheduledDate.localeCompare(right.scheduledDate);
        }

        if (right.pending !== left.pending) {
          return right.pending - left.pending;
        }

        return left.description.localeCompare(right.description);
      });
  }

  private buildInsights(
    data: {
      topCategories: RankingItem[];
      currentMonthBalance: number;
      currentMonthIncome: number;
      paymentCapacity: CapacityModel;
      pendingInterest: number;
      trendText: string;
      recommendations: Recommendation[];
    },
    currentMonthExpense: number,
  ): InsightAnswer[] {
    const topCategory = data.topCategories[0];
    const insightExpense = topCategory
      ? `Tu mayor foco de gasto es ${topCategory.name} con ${this.formatCurrency(topCategory.amount)}, equivalente a ${this.formatPercent(topCategory.share)} del gasto del mes.`
      : 'Todavia no hay gasto suficiente en el mes para detectar una categoria dominante.';
    const canPayDebt =
      data.paymentCapacity.ratio === null
        ? 'No hay base suficiente para medir capacidad de pago este mes.'
        : `${data.paymentCapacity.headline}. Hoy tus cuotas del mes representan ${this.formatPercent(data.paymentCapacity.ratio)} del ingreso actual.`;
    const interestAnswer =
      data.pendingInterest > 0
        ? `Si mantienes la deuda activa, aun te faltan ${this.formatCurrency(data.pendingInterest)} en intereses pendientes visibles.`
        : 'No se observan intereses pendientes relevantes en las deudas activas.';

    return [
      {
        question: 'En que gasto mas?',
        answer: insightExpense,
        tone: topCategory && topCategory.share > 0.35 ? 'warning' : 'info',
      },
      {
        question: 'Estoy mejorando financieramente?',
        answer: `${data.trendText} El balance del mes actual cierra en ${this.formatCurrency(data.currentMonthBalance)} frente a ${this.formatCurrency(currentMonthExpense)} en gastos.`,
        tone: data.currentMonthBalance >= 0 ? 'good' : 'warning',
      },
      {
        question: 'Puedo pagar mis deudas?',
        answer: canPayDebt,
        tone: data.paymentCapacity.tone,
      },
      {
        question: 'Cuanto pagare en intereses?',
        answer: interestAnswer,
        tone: data.pendingInterest > 0 ? 'warning' : 'neutral',
      },
      {
        question: 'Como puedo mejorar mis finanzas?',
        answer:
          data.recommendations[0]?.message ??
          'Mantener un balance positivo y revisar categorias dominantes cada mes ayuda a sostener una mejora real.',
        tone: data.recommendations[0]?.tone ?? 'good',
      },
    ];
  }

  private buildRecommendations(
    metrics: {
      income: number;
      expense: number;
      balance: number;
      savingsRate: number | null;
      paymentCapacity: number | null;
      pendingInterest: number;
      totalDebt: number;
    },
    topCategories: RankingItem[],
    hormigas: HormigaGroup[],
  ): Recommendation[] {
    const recommendations: Recommendation[] = [];
    const leisureKeywords = [
      'salidas',
      'ocio',
      'entretenimiento',
      'restaurante',
      'restaurantes',
      'delivery',
      'comida',
      'cafes',
      'cafe',
      'gustos',
    ];
    const leisureCategory = topCategories.find((item) =>
      leisureKeywords.some((keyword) => this.normalizeText(item.name).includes(keyword)),
    );
    const hormigaTotal = hormigas.reduce((sum, item) => sum + item.total, 0);

    if (metrics.paymentCapacity !== null && metrics.paymentCapacity > 0.35) {
      recommendations.push({
        title: 'Baja la presion de deuda',
        message:
          'La deuda mensual ya consume una porcion alta del ingreso. Conviene frenar gasto variable y priorizar pagos con interes mas alto.',
        metric: `${this.formatPercent(metrics.paymentCapacity)} de capacidad comprometida`,
        tone: metrics.paymentCapacity > 0.5 ? 'danger' : 'warning',
      });
    }

    if (metrics.savingsRate !== null && metrics.savingsRate < 0.1) {
      recommendations.push({
        title: 'Activa una meta de ahorro',
        message:
          'Tu ahorro del mes esta por debajo del 10%. Apartar primero una cuota fija despues del ingreso puede mejorar disciplina y liquidez.',
        metric: `${this.formatPercent(metrics.savingsRate)} de ahorro actual`,
        tone: 'warning',
      });
    }

    if (leisureCategory && metrics.income > 0 && leisureCategory.amount / metrics.income > 0.15) {
      recommendations.push({
        title: 'Controla gasto discrecional',
        message:
          `El gasto en ${leisureCategory.name} es alto frente a tus ingresos. Un limite semanal puede liberar espacio para ahorro o deuda.`,
        metric: `${this.formatPercent(leisureCategory.amount / metrics.income)} del ingreso`,
        tone: 'warning',
      });
    }

    if (hormigaTotal > 0 && metrics.expense > 0 && hormigaTotal / metrics.expense > 0.08) {
      recommendations.push({
        title: 'Recorta gastos hormiga',
        message:
          'Los consumos pequenos y repetitivos ya tienen peso real en el mes. Consolidarlos o fijar topes diarios puede mejorar el balance.',
        metric: `${this.formatPercent(hormigaTotal / metrics.expense)} del gasto mensual`,
        tone: 'info',
      });
    }

    if (
      metrics.pendingInterest > 0 &&
      metrics.totalDebt > 0 &&
      metrics.pendingInterest / metrics.totalDebt > 0.1
    ) {
      recommendations.push({
        title: 'Ataca el interes primero',
        message:
          'La carga de intereses pendiente es alta respecto a la deuda. Acelerar el pago de la deuda mas cara puede reducir el costo total.',
        metric: `${this.formatPercent(metrics.pendingInterest / metrics.totalDebt)} del saldo en intereses`,
        tone: 'warning',
      });
    }

    if (recommendations.length === 0) {
      recommendations.push({
        title: 'Mantienes una base estable',
        message:
          'Tus indicadores del mes no muestran una alerta fuerte. La siguiente mejora natural es formalizar metas de ahorro y seguimiento mensual.',
        metric: metrics.balance >= 0 ? `Balance ${this.formatCurrency(metrics.balance)}` : 'Monitorea el proximo cierre',
        tone: 'good',
      });
    }

    return recommendations.slice(0, 5);
  }

  private buildTrendChart(months: TrendMonth[]): TrendChartModel {
    const allValues = months.flatMap((month) => [month.income, month.expense, month.balance]);
    const minValue = Math.min(0, ...allValues);
    const maxValue = Math.max(1, ...allValues);
    const range = Math.max(1, maxValue - minValue);
    const top = 6;
    const height = 28;

    const toY = (value: number): number =>
      Number((top + ((maxValue - value) / range) * height).toFixed(2));
    const toPoints = (values: number[]): string =>
      values
        .map((value, index) => {
          const x = months.length === 1 ? 50 : (index / (months.length - 1)) * 100;
          return `${Number(x.toFixed(2))},${toY(value)}`;
        })
        .join(' ');

    return {
      months,
      incomePoints: toPoints(months.map((item) => item.income)),
      expensePoints: toPoints(months.map((item) => item.expense)),
      balancePoints: toPoints(months.map((item) => item.balance)),
      zeroLineY: toY(0),
    };
  }

  private buildTrendNarrative(months: TrendMonth[]): string {
    if (months.length < 2) {
      return 'Aun no hay historial suficiente para medir tendencia.';
    }

    const recent = months.slice(-3);
    const previous = months.slice(0, Math.max(1, months.length - 3));
    const avgRecent = recent.reduce((sum, item) => sum + item.balance, 0) / recent.length;
    const avgPrevious =
      previous.reduce((sum, item) => sum + item.balance, 0) / Math.max(previous.length, 1);
    const delta = avgRecent - avgPrevious;

    if (delta > 0) {
      return `La tendencia mejora: el balance promedio reciente subio ${this.formatCurrency(delta)} frente al periodo previo.`;
    }

    if (delta < 0) {
      return `La tendencia se debilita: el balance promedio reciente cayo ${this.formatCurrency(Math.abs(delta))} frente al periodo previo.`;
    }

    return 'La tendencia se mantiene estable frente a los meses anteriores.';
  }

  private buildSummaryText(
    balance: number,
    paymentCapacityRatio: number | null,
    trendText: string,
    pendingInterest: number,
  ): string {
    const balanceText =
      balance >= 0
        ? `Tu balance del mes va positivo en ${this.formatCurrency(balance)}.`
        : `Tu balance del mes va en rojo por ${this.formatCurrency(Math.abs(balance))}.`;
    const debtText =
      paymentCapacityRatio === null
        ? 'No hay base suficiente para medir capacidad de pago.'
        : `La deuda del mes absorbe ${this.formatPercent(paymentCapacityRatio)} de tus ingresos.`;
    const interestText =
      pendingInterest > 0
        ? `Todavia tienes ${this.formatCurrency(pendingInterest)} en intereses pendientes visibles.`
        : 'No se observan intereses pendientes relevantes.';

    return `${balanceText} ${debtText} ${trendText} ${interestText}`;
  }

  private buildScheduledNotifications(
    configuraciones: ConfiguracionNotificacionPago[],
  ): ScheduledNotificationView[] {
    return configuraciones
      .flatMap((configuracion) => {
        const nextDate = this.resolveScheduledNotificationDate(configuracion);
        const status = this.resolveScheduledStatus(configuracion, nextDate);

        if (!nextDate && status.tone === 'neutral' && status.label !== 'Pendiente de inicio') {
          return [];
        }

        const diffInDays = nextDate
          ? this.calculateScheduledDiffInDays(nextDate, this.getToday())
          : null;

        return [{
          id_notificacion_programada: configuracion.id_notificacion_programada,
          descripcion: configuracion.descripcion,
          prioridad: this.getNotificationPriorityLabel(configuracion.prioridad),
          vigenciaLabel: `${this.formatFullDate(configuracion.fecha_inicio)} al ${this.formatFullDate(configuracion.fecha_fin)}`,
          frecuenciaLabel: this.getScheduledFrequencyLabel(configuracion),
          quincenaLabel: this.getScheduledQuincenaLabel(configuracion, nextDate),
          periodicidadNombre:
            configuracion.periodicidad?.nombre_periodicidad || 'Sin periodicidad',
          nextDateLabel: nextDate ? this.fullDateFormatter.format(nextDate) : 'Sin proxima fecha',
          relativeLabel:
            diffInDays === null
              ? status.label
              : this.relativeDayFormatter.format(diffInDays, 'day'),
          statusLabel: status.label,
          tone: status.tone,
        }];
      })
      .sort((a, b) => {
        const toneRank = { danger: 0, warning: 1, info: 2, good: 3, neutral: 4 };
        return (
          (toneRank[a.tone] ?? 5) - (toneRank[b.tone] ?? 5) ||
          a.nextDateLabel.localeCompare(b.nextDateLabel)
        );
      })
      .slice(0, 4);
  }

  private buildHealthScore(
    expenseRatio: number | null,
    savingsRate: number | null,
    paymentCapacity: number | null,
    pendingInterest: number,
    totalDebt: number,
  ): number {
    let score = 100;

    if (expenseRatio !== null) {
      if (expenseRatio > 1) {
        score -= 30;
      } else if (expenseRatio > 0.85) {
        score -= 16;
      } else if (expenseRatio > 0.7) {
        score -= 8;
      }
    }

    if (savingsRate !== null) {
      if (savingsRate <= 0) {
        score -= 22;
      } else if (savingsRate < 0.1) {
        score -= 12;
      }
    }

    if (paymentCapacity !== null) {
      if (paymentCapacity > 0.5) {
        score -= 30;
      } else if (paymentCapacity > 0.35) {
        score -= 18;
      } else if (paymentCapacity > 0.2) {
        score -= 8;
      }
    }

    if (totalDebt > 0 && pendingInterest / totalDebt > 0.1) {
      score -= 10;
    }

    return Math.max(12, Math.min(100, Math.round(score)));
  }

  private resolveHealthLabel(score: number): string {
    if (score >= 80) {
      return 'Salud financiera fuerte';
    }

    if (score >= 60) {
      return 'Salud financiera estable';
    }

    if (score >= 40) {
      return 'Salud financiera en alerta';
    }

    return 'Salud financiera en riesgo';
  }

  private resolveHealthTone(score: number): DashboardTone {
    if (score >= 80) {
      return 'good';
    }

    if (score >= 60) {
      return 'info';
    }

    if (score >= 40) {
      return 'warning';
    }

    return 'danger';
  }

  private resolveProjectedEndLabel(transactions: EnrichedTransaction[]): string {
    const latestDate = transactions
      .filter((item) => item.type === 'expense')
      .map((item) => item.latestDueDate)
      .filter((item): item is Date => item instanceof Date)
      .sort((a, b) => a.getTime() - b.getTime())
      .pop();

    return latestDate ? this.fullDateFormatter.format(latestDate) : 'Sin fecha definida';
  }

  private resolveScheduledStatus(
    configuracion: ConfiguracionNotificacionPago,
    nextDate: Date | null,
  ): { label: string; tone: DashboardTone } {
    if (!configuracion.estado) {
      return { label: 'Inactiva', tone: 'neutral' };
    }

    const startDate = this.parseDateOnly(configuracion.fecha_inicio);
    const endDate = this.parseDateOnly(configuracion.fecha_fin);

    if (!startDate || !endDate || endDate.getTime() < startDate.getTime()) {
      return { label: 'Fechas invalidas', tone: 'danger' };
    }

    const today = this.getToday();

    if (today.getTime() < startDate.getTime()) {
      return { label: 'Pendiente de inicio', tone: 'info' };
    }

    if (!nextDate || today.getTime() > endDate.getTime()) {
      return { label: 'Fuera de vigencia', tone: 'neutral' };
    }

    const diffInDays = this.calculateScheduledDiffInDays(nextDate, today);

    if (diffInDays === 0) {
      return { label: 'Vence hoy', tone: 'danger' };
    }

    if (diffInDays === 1) {
      return { label: 'Vence manana', tone: 'warning' };
    }

    if (diffInDays <= 7) {
      return { label: 'Proximo recordatorio', tone: 'warning' };
    }

    return {
      label: 'Vigente',
      tone: configuracion.prioridad === 'alta' ? 'warning' : 'good',
    };
  }

  private resolveScheduledNotificationDate(
    configuracion: ConfiguracionNotificacionPago,
  ): Date | null {
    if (!configuracion.estado) {
      return null;
    }

    const startDate = this.parseDateOnly(configuracion.fecha_inicio);
    const endDate = this.parseDateOnly(configuracion.fecha_fin);

    if (!startDate || !endDate || endDate.getTime() < startDate.getTime()) {
      return null;
    }

    const today = this.getToday();
    if (today.getTime() > endDate.getTime()) {
      return null;
    }

    const referenceDate = today.getTime() < startDate.getTime() ? startDate : today;
    const day = configuracion.dia_pago_programado;

    if (!Number.isInteger(day) || day < 1 || day > 31) {
      return null;
    }

    const periodicidadCode = this.resolvePeriodicidadCode(configuracion);

    let nextDate: Date | null;
    switch (periodicidadCode) {
      case 'fecha-especifica':
        nextDate = startDate.getTime() >= referenceDate.getTime() ? startDate : null;
        break;
      case 'quincenal':
        nextDate = this.buildQuincenalOccurrence(referenceDate);
        break;
      case 'anual':
        nextDate = this.buildNextYearlyOccurrence(referenceDate, startDate.getMonth(), day);
        break;
      default:
        nextDate = this.buildNextMonthlyOccurrence(referenceDate, day);
        break;
    }

    return nextDate && nextDate.getTime() <= endDate.getTime() ? nextDate : null;
  }

  private getScheduledFrequencyLabel(configuracion: ConfiguracionNotificacionPago): string {
    switch (this.resolvePeriodicidadCode(configuracion)) {
      case 'quincenal':
        return 'Cada 15 y 30';
      case 'anual':
        return 'Cada ano';
      case 'fecha-especifica':
        return 'Fecha especifica';
      default:
        return 'Cada mes';
    }
  }

  private getScheduledQuincenaLabel(
    configuracion: ConfiguracionNotificacionPago,
    nextDate: Date | null,
  ): string {
    if (this.resolvePeriodicidadCode(configuracion) === 'quincenal') {
      return nextDate ? this.getQuincenaLabelFromDay(nextDate.getDate()) : 'Primera y segunda quincena';
    }

    if (nextDate) {
      return this.getQuincenaLabelFromDay(nextDate.getDate());
    }

    const day = Number(configuracion.dia_pago_programado);
    return Number.isInteger(day) && day >= 1 && day <= 31
      ? this.getQuincenaLabelFromDay(day)
      : 'Sin quincena definida';
  }

  private resolvePeriodicidadCode(configuracion: ConfiguracionNotificacionPago): string {
    const code = this.normalizeText(configuracion.periodicidad?.codigo || '');

    if (code) {
      return code;
    }

    return configuracion.id_periodicidad === 4 ? 'quincenal' : '';
  }

  private buildNextMonthlyOccurrence(referenceDate: Date, day: number): Date {
    const currentMonthDate = this.createDateWithPreferredDay(
      referenceDate.getFullYear(),
      referenceDate.getMonth(),
      day,
    );

    if (currentMonthDate.getTime() >= referenceDate.getTime()) {
      return currentMonthDate;
    }

    return this.createDateWithPreferredDay(
      referenceDate.getFullYear(),
      referenceDate.getMonth() + 1,
      day,
    );
  }

  private buildNextYearlyOccurrence(referenceDate: Date, month: number, day: number): Date {
    const currentYearDate = this.createDateWithPreferredDay(
      referenceDate.getFullYear(),
      month,
      day,
    );

    if (currentYearDate.getTime() >= referenceDate.getTime()) {
      return currentYearDate;
    }

    return this.createDateWithPreferredDay(referenceDate.getFullYear() + 1, month, day);
  }

  private buildQuincenalOccurrence(referenceDate: Date): Date {
    const year = referenceDate.getFullYear();
    const month = referenceDate.getMonth();
    const firstCut = new Date(year, month, 15);
    const secondCut = this.getEndOfMonthDate(year, month);

    if (firstCut.getTime() >= referenceDate.getTime()) {
      return firstCut;
    }

    if (secondCut.getTime() >= referenceDate.getTime()) {
      return secondCut;
    }

    return new Date(year, month + 1, 15);
  }

  private createDateWithPreferredDay(year: number, month: number, day: number): Date {
    const lastDay = this.getEndOfMonthDate(year, month).getDate();
    return new Date(year, month, Math.min(day, lastDay));
  }

  private getEndOfMonthDate(year: number, month: number): Date {
    return new Date(year, month + 1, 0);
  }

  private getQuincenaLabelFromDay(day: number): string {
    return day >= 15 ? 'Primera quincena' : 'Segunda quincena';
  }

  private calculateScheduledDiffInDays(left: Date, right: Date): number {
    const msPerDay = 24 * 60 * 60 * 1000;
    return Math.round((left.getTime() - right.getTime()) / msPerDay);
  }

  private getNotificationPriorityLabel(value: string | null | undefined): string {
    switch ((value ?? '').toLowerCase()) {
      case 'alta':
        return 'Alta';
      case 'media':
        return 'Media';
      case 'baja':
        return 'Baja';
      default:
        return 'Sin prioridad';
    }
  }

  private buildDeltaLabel(current: number, previous: number): string {
    if (previous === 0 && current === 0) {
      return 'Sin movimiento frente al mes anterior';
    }

    if (previous === 0) {
      return 'Primer mes con movimiento visible';
    }

    const delta = current - previous;
    const ratio = Math.abs(delta) / Math.abs(previous);

    if (delta === 0) {
      return 'Sin cambio frente al mes anterior';
    }

    return `${delta > 0 ? 'Sube' : 'Baja'} ${this.formatPercent(ratio)} vs mes anterior`;
  }

  private createRollingMonths(size: number): Array<{ key: string; label: string }> {
    const end = this.getSelectedMonthStart();
    const months: Array<{ key: string; label: string }> = [];

    for (let index = size - 1; index >= 0; index -= 1) {
      const date = new Date(end);
      date.setMonth(date.getMonth() - index);
      months.push({
        key: this.getMonthKey(date),
        label: this.capitalizeText(this.shortMonthFormatter.format(date)),
      });
    }

    return months;
  }

  private createEmptyAnalytics(): DashboardAnalytics {
    return {
      hasData: false,
      currentPeriodLabel: this.getSelectedPeriodRange().label,
      healthScore: 0,
      healthTone: 'neutral',
      healthLabel: 'Resumen del titular',
      summary: `Vista del titular para ${this.getSelectedPeriodRange().descriptionLabel}.`,
      kpis: [
        {
          key: 'income',
          label: 'Total ingresos del mes',
          value: 0,
          detail: 'Solo titular',
          helper: 'Suma de ingresos del mes visibles para el titular.',
          tone: 'good',
        },
        {
          key: 'expense',
          label: 'Total gastos del mes',
          value: 0,
          detail: 'Solo titular',
          helper: 'Suma de gastos del mes visibles para el titular.',
          tone: 'neutral',
        },
        {
          key: 'shared',
          label: 'Gastos compartidos a mi nombre',
          value: 0,
          detail: 'Registrados por otros',
          helper: 'Monto del mes asignado al usuario actual en gastos compartidos.',
          tone: 'neutral',
        },
      ],
      capacity: {
        ratio: null,
        tone: 'neutral',
        headline: 'Sin base para calcular',
        description: 'Registra ingresos y pagos para activar la capacidad de pago.',
        income: 0,
        debtDue: 0,
        progress: 0,
      },
      categoryDonut: {
        title: 'Gasto por categoria',
        subtitle: '',
        total: 0,
        totalLabel: 'Sin datos',
        empty: true,
        segments: [],
        legend: [],
      },
      subcategoryDonut: {
        title: 'Gasto por subcategoria',
        subtitle: '',
        total: 0,
        totalLabel: 'Sin datos',
        empty: true,
        segments: [],
        legend: [],
      },
      trendChart: {
        months: this.createRollingMonths(6).map((month) => ({
          key: month.key,
          label: month.label,
          income: 0,
          expense: 0,
          balance: 0,
          debtDue: 0,
          paymentCapacity: null,
        })),
        incomePoints: '0,34 100,34',
        expensePoints: '0,34 100,34',
        balancePoints: '0,34 100,34',
        zeroLineY: 34,
      },
      topCategories: [],
      hormigas: [],
      insights: [],
      debtSummary: {
        totalDebt: 0,
        totalInterest: 0,
        pendingInstallments: 0,
        projectedEndLabel: 'Sin fecha definida',
        highestDebtEntity: 'Sin deuda activa',
        highestInterestEntity: 'Sin interes pendiente',
      },
      debtEntities: [],
      recommendations: [],
      trendTable: [],
      scheduledDetails: [],
    };
  }

  private getMonthStart(date: Date): Date {
    return new Date(date.getFullYear(), date.getMonth(), 1);
  }

  private getSelectedMonthStart(): Date {
    return new Date(this.selectedYear, this.selectedMonth - 1, 1);
  }

  private getSelectedPeriodRange(): DashboardPeriodRange {
    const monthStart = this.getSelectedMonthStart();
    const monthLabel = this.capitalizeText(this.monthFormatter.format(monthStart));

    if (this.selectedPeriodType === 'month') {
      return {
        type: 'month',
        start: monthStart,
        end: this.getEndOfMonthDate(monthStart.getFullYear(), monthStart.getMonth()),
        label: monthLabel,
        descriptionLabel: monthLabel,
      };
    }

    if (this.selectedQuincena === 'first') {
      return {
        type: 'quincena',
        start: monthStart,
        end: new Date(monthStart.getFullYear(), monthStart.getMonth(), 15),
        label: `${monthLabel} (1 al 15)`,
        descriptionLabel: `1 al 15 de ${monthLabel}`,
      };
    }

    const monthEnd = this.getEndOfMonthDate(monthStart.getFullYear(), monthStart.getMonth());
    return {
      type: 'quincena',
      start: new Date(monthStart.getFullYear(), monthStart.getMonth(), 16),
      end: monthEnd,
      label: `${monthLabel} (16 al ${monthEnd.getDate()})`,
      descriptionLabel: `16 al ${monthEnd.getDate()} de ${monthLabel}`,
    };
  }

  private getToday(): Date {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  }

  private getMonthKey(date: Date): string {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
  }

  private buildAvailableYears(transacciones: TransaccionListado[]): number[] {
    const years = new Set<number>([this.getToday().getFullYear(), this.selectedYear]);

    for (const transaction of transacciones) {
      const transactionDate = this.parseDateOnly(transaction.fecha);
      if (transactionDate) {
        years.add(transactionDate.getFullYear());
      }

      for (const detail of Array.isArray(transaction.participantes_detalle)
        ? transaction.participantes_detalle
        : []) {
        const detailDate = this.parseDateOnly(detail.fecha_programada);
        if (detailDate) {
          years.add(detailDate.getFullYear());
        }
      }
    }

    return [...years].sort((left, right) => right - left);
  }

  private refreshDashboardSummary(): void {
    this.analytics = this.buildAnalytics(this.transactions, this.getSelectedPeriodRange());
    this.prepareDashboardTransactionsModalData();
    this.cdr.detectChanges();
  }

  private isDateWithinPeriod(date: Date, selectedPeriod: DashboardPeriodRange): boolean {
    const time = date.getTime();
    return time >= selectedPeriod.start.getTime() && time <= selectedPeriod.end.getTime();
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

  private getDashboardTransactionStatusLabel(transaccion: TransaccionListado): string {
    const rawStatus =
      transaccion.nombre_estado?.trim() ||
      transaccion.nombre_estado_registro?.trim() ||
      'Sin estado';
    const normalizedStatus = this.normalizeTransactionStatus(rawStatus);

    switch (normalizedStatus) {
      case 'anulado':
        return 'ANULADO';
      case 'pagado':
      case 'completado':
        return 'PAGADO';
      case 'pendiente':
      case 'pago parcial':
        return 'PENDIENTE';
      default:
        return rawStatus;
    }
  }

  private getDashboardTransactionStatusTone(statusLabel: string): DashboardTone {
    const normalizedStatus = this.normalizeTransactionStatus(statusLabel);

    switch (normalizedStatus) {
      case 'pagado':
      case 'completado':
        return 'good';
      case 'pendiente':
      case 'pago parcial':
        return 'warning';
      case 'anulado':
        return 'neutral';
      default:
        return 'info';
    }
  }

  private normalizeTransactionStatus(value: string): string {
    switch (this.normalizeText(value)) {
      case 'anulada':
      case 'anulado':
      case 'cancelada':
      case 'cancelado':
        return 'anulado';
      default:
        return this.normalizeText(value);
    }
  }

  private formatIsoDate(date: Date | null): string {
    if (!date) {
      return '';
    }

    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');

    return `${year}-${month}-${day}`;
  }

  private parseDateOnly(value: string | null | undefined): Date | null {
    if (!value) {
      return null;
    }

    const normalized = value.trim().slice(0, 10);
    const match = normalized.match(/^(\d{4})-(\d{2})-(\d{2})$/);

    if (!match) {
      return null;
    }

    const [, year, month, day] = match;
    const date = new Date(Number(year), Number(month) - 1, Number(day));

    return Number.isNaN(date.getTime()) ? null : date;
  }

  private normalizeAmount(value: number | null | undefined): number {
    const amount = Number(value ?? 0);
    return Number.isFinite(amount) ? amount : 0;
  }

  private roundMoney(value: number): number {
    return Math.round((value + Number.EPSILON) * 100) / 100;
  }

  private normalizeText(value: string): string {
    return value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim();
  }

  private capitalizeText(value: string): string {
    return value.charAt(0).toUpperCase() + value.slice(1);
  }
}
