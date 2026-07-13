import { DatePipe, DecimalPipe, NgClass, NgFor, NgIf, NgTemplateOutlet } from '@angular/common';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import {
  ChangeDetectorRef,
  Component,
  DestroyRef,
  HostListener,
  OnInit,
  inject,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  AbstractControl,
  FormArray,
  FormBuilder,
  FormControl,
  FormGroup,
  FormsModule,
  ReactiveFormsModule,
  ValidationErrors,
  ValidatorFn,
  Validators,
} from '@angular/forms';
import {
  ActivatedRoute,
  NavigationEnd,
  Router,
  RouterLink,
  RouterLinkActive,
} from '@angular/router';
import { filter, firstValueFrom, timeout } from 'rxjs';

import { apiUrl } from '../../shared/config/api.config';
import { SessionStripComponent } from '../../shared/session-strip/session-strip.component';
import {
  CatalogoCategoria,
  CatalogoEntidadFinanciera,
  CatalogoEstadoTransaccion,
  CatalogoFormaPago,
  CatalogoParticipante,
  CatalogoSubcategoria,
  CatalogoTipoEntidad,
  CatalogosTransaccionService,
} from '../../shared/services/catalogos-transaccion.service';
import { SweetAlertService } from '../../shared/services/sweet-alert.service';
import { getCurrentUserId, isAdminUser, loadUserProfile } from '../../shared/user-profile';

type TipoTransaccionId = number;
type ProgramacionCuotaTipo = 'ninguna' | 'dia_mes' | 'quincenal' | 'fin_mes';
type ModoCuotas = 'fijas' | 'divididas';
const TIPO_CUOTA_FIJA_ID = 1;
const TIPO_CUOTA_VARIABLE_ID = 2;
const ESTADO_TRANSACCION_ANULADA_ID = 2;
const PRIORITY_WINDOW_DAYS = 7;
const QUICK_PAY_DEFAULT_PRIORITY_WINDOW_DAYS = 15;
const QUICK_PAY_PRIORITY_FILTER_STORAGE_KEY =
  'flujo-gastos.quick-pay.prioritarios';
const QUICK_PAY_FILTERS_COLLAPSED_KEY = 'flujo-gastos.quick-pay.filters-collapsed';
const ESTADOS_LISTADO_PERMITIDOS = new Set(['pagado', 'pendiente', 'anulado']);
const ESTADOS_FILTRO_DISPONIBLES = new Set([...ESTADOS_LISTADO_PERMITIDOS]);

interface CuotaPayload {
  monto: number;
  fecha_programada: string | null;
}

type CuotaMontoForm = FormGroup<{
  monto: FormControl<number | null>;
  fecha_programada: FormControl<string | null>;
}>;

type ParticipanteDetalleForm = FormGroup<{
  id_participante: FormControl<number | null>;
  nombre_mostrado: FormControl<string>;
  es_titular: FormControl<boolean>;
  dividir_monto: FormControl<boolean>;
  modo_cuotas: FormControl<ModoCuotas>;
  cantidad_cuotas: FormControl<number | null>;
  tipo_programacion: FormControl<ProgramacionCuotaTipo>;
  dia_programado: FormControl<number | null>;
  porcentaje: FormControl<number | null>;
  monto: FormControl<number | null>;
  id_metodo_pago: FormControl<number | null>;
  cuotas: FormArray<CuotaMontoForm>;
}>;

interface CuotaPageItem {
  index: number;
  control: CuotaMontoForm;
}

type PagoDetalleForm = FormGroup<{
  id_detalle: FormControl<number>;
  id_participante: FormControl<number>;
  nombre_mostrado: FormControl<string>;
  es_titular: FormControl<boolean>;
  numero_cuota: FormControl<number>;
  total_cuotas: FormControl<number>;
  monto_cuota: FormControl<number>;
  monto_pagado: FormControl<number>;
  interes_pagado: FormControl<number>;
  interes_pendiente: FormControl<number>;
  saldo_pendiente: FormControl<number>;
  monto_aplicar: FormControl<string | number | null>;
  fecha_pago: FormControl<string | null>;
  fecha_programada: FormControl<string | null>;
  nombre_estado: FormControl<string>;
}>;

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
  recordatorio_pago?: boolean;
  tasa_interes_anual?: number | null;
  saldo_pendiente: number;
  id_tipo_transaccion: TipoTransaccionId;
  id_tipo_cuota?: number | null;
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
  comentario: string | null;
  pagocompartido: boolean;
  fecha_ultimo_pago: string | null;
  fecha_creacion: string;
  titular: string | null;
  cantidad_participantes: number;
  participantes_detalle: ParticipanteDetalleListado[];
}

interface DetalleTransaccionListadoRow {
  transaccion: TransaccionListado;
  detalle: ParticipanteDetalleListado;
  nombre_mostrado: string;
  descripcion: string;
  metodo_pago: string | null;
  quickPayGroupKey: string;
  quickPayMetodoPagoId: number | null;
  quickPayMetodoPagoNombre: string;
  quickPayCanPagar: boolean;
  quickPayCanSelectBase: boolean;
  quickPayIsOwnedByCurrentUser: boolean;
  quickPaySelected: boolean;
  quickPaySelectionDisabled: boolean;
  quickPaySelectionHint: string;
  quickPayIsVencido: boolean;
  quickPayFechaProgramadaLabel: string;
  quickPayFechaPagoLabel: string;
  quickPayMontoLabel: string;
  quickPayInteresPendienteLabel: string;
  quickPayMontoPagadoLabel: string;
  quickPaySaldoPendienteLabel: string;
  quickPayEstadoClass: string;
  quickPayEstadoLabel: string;
  quickPayTitle: string;
  categoria: string | null;
  subcategoria: string | null;
}

interface UpdateTransaccionPayload {
  fecha: string;
  monto: number;
  id_tipo_cuota: number;
  pago_variable?: boolean;
  intereses?: number;
  cuotas_sin_intereses: boolean;
  recordatorio_pago?: boolean;
  id_tipo_transaccion: TipoTransaccionId;
  id_metodo_pago: number;
  id_categoria: number;
  id_subcategoria?: number | null;
  id_estado: number;
  descripcion?: string | null;
  comentario?: string | null;
  pagocompartido: boolean;
  cantidad_cuotas_titular: number;
  cuotas_titular: CuotaPayload[];
  participantes_detalle?: Array<{
    id_participante: number;
    monto: number;
    cantidad_cuotas: number;
    cuotas: CuotaPayload[];
  }>;
}

interface ApplyPagosPayload {
  pagos: Array<{
    id_detalle: number;
    monto: number;
  }>;
  cuotas_actualizadas?: Array<{
    id_detalle: number;
    monto: number;
  }>;
}

interface CalculoInteresesResponse {
  fecha_calculo: string;
  origen: 'manual' | 'scheduler';
  registros_procesados: number;
  total_intereses_generados: number;
}

interface PagoDetalleGroupView {
  id_participante: number;
  nombre_mostrado: string;
  es_titular: boolean;
  cuotas: PagoDetalleForm[];
  saldo_pendiente_total: number;
  monto_pagado_total: number;
}

interface QuickPaySubtotalSummary {
  pendiente: number;
  pagado: number;
  ingresos: number;
}

interface QuickPayAccentPalette {
  accent: string;
  border: string;
  soft: string;
  glow: string;
  chipBorder: string;
  chipBg: string;
  chipColor: string;
  methodBorder: string;
  methodBg: string;
  methodColor: string;
}

interface QuickPayMetodoGroup {
  key: string;
  metodoPagoId: number | null;
  metodoPagoNombre: string;
  oldestScheduledDate: string | null;
  rows: DetalleTransaccionListadoRow[];
  totalPendiente: number;
  expanded: boolean;
  currentPage: number;
  selectableCount: number;
  selectedCount: number;
  selectionDisabled: boolean;
  fullySelected: boolean;
  partiallySelected: boolean;
}

type FiltroDateControlName = 'fechaDesde' | 'fechaHasta';
type QuickPaySortColumn = 'fecha_transaccion' | 'fecha_programada';
type QuickPaySortDirection = 'asc' | 'desc';

@Component({
  selector: 'app-listado-transacciones-page',
    imports: [
      FormsModule,
      ReactiveFormsModule,
      RouterLink,
      RouterLinkActive,
      NgIf,
    NgFor,
    NgClass,
    NgTemplateOutlet,
    DatePipe,
    DecimalPipe,
    SessionStripComponent,
  ],
  templateUrl: './listado-transacciones.page.html',
  styleUrl: './listado-transacciones.page.css',
})
export class ListadoTransaccionesPage implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly http = inject(HttpClient);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly destroyRef = inject(DestroyRef);
  private readonly alerts = inject(SweetAlertService);
  private readonly catalogosService = inject(CatalogosTransaccionService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly apiUrl = apiUrl('transacciones');
  private readonly interesesApiUrl = apiUrl('intereses', 'calcular');
  private readonly quickPayCurrencyFormatter = new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  private readonly monthYearFormatter = new Intl.DateTimeFormat('es-SV', {
    month: 'long',
    year: 'numeric',
  });
  readonly viewMode =
    this.route.snapshot.data['viewMode'] === 'detalle' ? 'detalle' : 'transacciones';
  readonly today = new Date();
  readonly todayFilterValue = this.formatDateInput(this.today);
  readonly currentMonthStartValue = this.formatDateInput(this.getStartOfMonth(this.today));
  readonly currentMonthEndValue = this.formatDateInput(this.getEndOfMonth(this.today));
  readonly mesesNombreFiltroOptions: Array<{ value: number; label: string }> = [
    { value: 1, label: 'Enero' },
    { value: 2, label: 'Febrero' },
    { value: 3, label: 'Marzo' },
    { value: 4, label: 'Abril' },
    { value: 5, label: 'Mayo' },
    { value: 6, label: 'Junio' },
    { value: 7, label: 'Julio' },
    { value: 8, label: 'Agosto' },
    { value: 9, label: 'Septiembre' },
    { value: 10, label: 'Octubre' },
    { value: 11, label: 'Noviembre' },
    { value: 12, label: 'Diciembre' },
  ];
  readonly aniosFiltroOptions: number[] = Array.from(
    { length: 8 },
    (_, index) => this.today.getFullYear() - index,
  );
  get isAdminSession(): boolean {
    return isAdminUser();
  }

  readonly tiposTransaccion: Array<{ value: TipoTransaccionId; label: string }> = [
    { value: 1, label: 'Debito' },
    { value: 2, label: 'Credito' },
  ];
  readonly tiposProgramacionCuota: Array<{
    value: Exclude<ProgramacionCuotaTipo, 'ninguna'>;
    label: string;
  }> = [
    { value: 'dia_mes', label: 'Dia fijo del mes' },
    { value: 'quincenal', label: 'Cada quincena' },
    { value: 'fin_mes', label: 'Fin de mes' },
  ];
  readonly modosCuotas: Array<{ value: ModoCuotas; label: string }> = [
    { value: 'fijas', label: 'Cuotas fijas' },
    { value: 'divididas', label: 'Variables / divididas' },
  ];
  readonly diasProgramacion = Array.from({ length: 31 }, (_, index) => index + 1);
  readonly filtrosForm = this.fb.group({
    todos: [this.viewMode !== 'detalle'],
    soloHoy: [false],
    mesActual: [false],
    mesFiltro: [null as number | null],
    anioFiltro: [null as number | null],
    prioritarios: [this.getInitialQuickPayPriorityFilterValue()],
    vencidos: [this.viewMode === 'detalle'],
    diasPrioridad: [
      this.viewMode === 'detalle'
        ? QUICK_PAY_DEFAULT_PRIORITY_WINDOW_DAYS
        : PRIORITY_WINDOW_DAYS,
    ],
    pendientePago: [false],
    enviadas: [false],
    compartidos: [false],
    pendienteRegistro: [false],
    fechaDesde: ['', [this.dateDisplayValidator()]],
    fechaHasta: ['', [this.dateDisplayValidator()]],
    estado: [this.viewMode === 'detalle' ? 'PENDIENTE' : null as string | null],
    tipoTransaccion: [null as 'credito' | 'debito' | null],
    idMetodoPago: [null as number | null],
    idParticipante: [null as number | null],
    idCategoria: [null as number | null],
    idSubcategoria: [null as number | null],
    busquedaDescripcion: [''],
    busquedaId: [''],
  });

  sidebarCollapsed = false;
  resumenOpen = true;
  maintenanceOpen = false;
  reportesOpen = false;
  transactionsOpen = true;
  loading = false;
  loadingCatalogos = false;
  calculatingIntereses = false;
  saving = false;
  private pageEnterLoadPromise: Promise<void> | null = null;
  editModalOpen = false;
  applyingFullPayment = false;
  applyingPaymentDetailId: number | null = null;
  applyingPaymentGroupId: number | null = null;
  completingId: number | null = null;
  paymentModalOpen = false;
  notaTooltipText: string | null = null;
  notaTooltipX = 0;
  notaTooltipY = 0;
  private paymentModalOpenedAt = 0;
  detailModalTransaccion: TransaccionListado | null = null;
  detailModalCuotasPage = 1;
  detailExpandedParticipanteIds = new Set<number>();
  applyingBulkQuickPayments = false;
  selectedQuickPayDetalleIds = new Set<number>();
  montoAplicarDrafts: Record<number, string> = {};
  showAdvancedFilters = false;
  quickPayFiltersCollapsed = false;
  listadoCurrentPage = 1;
  errorMessage = '';
  successMessage = '';
  selectedFormaPago: CatalogoFormaPago | null = null;
  editingTransaccionId: number | null = null;
  paymentTransaccionId: number | null = null;
  selectedTransaccion: TransaccionListado | null = null;
  paymentModalTransaccion: TransaccionListado | null = null;
  pagosDetalleGroupViews: PagoDetalleGroupView[] = [];
  editorDetallesOriginales: ParticipanteDetalleListado[] = [];
  private hasManualEstadoSelectionInEdit = false;
  private isSyncingEstadoTransaccion = false;
  titularSectionDismissed = false;
  private titularManualOverride = false;
  private syncingSharedExpenseCalculatedMonto = false;
  private sharedParticipantFilterAutoReset = false;
  private readonly manualAmountGroups = new WeakSet<ParticipanteDetalleForm>();
  private readonly pendingDismissedTitularFullShareGroups = new WeakSet<ParticipanteDetalleForm>();
  private readonly cuotasPageByGroup = new WeakMap<ParticipanteDetalleForm, number>();
  private readonly zeroBalancePeriodPercentagesByGroup = new WeakMap<
    ParticipanteDetalleForm,
    number[]
  >();
  private autoOpenPaymentHandledKey: string | null = null;
  private cameFromDashboardReminder = false;
  private readonly quickPayMetodoGroupExpansionState: Record<string, boolean> = {};
  readonly listadoPageSize = 10;
  readonly cuotasPageSize = 12;

  transacciones: TransaccionListado[] = [];
  formasPago: CatalogoFormaPago[] = [];
  entidadesFinancieras: CatalogoEntidadFinanciera[] = [];
  tiposEntidad: CatalogoTipoEntidad[] = [];
  participantes: CatalogoParticipante[] = [];
  quickPayParticipantesFiltro: CatalogoParticipante[] = [];
  categorias: CatalogoCategoria[] = [];
  subcategorias: CatalogoSubcategoria[] = [];
  filteredSubcategoriasFiltro: CatalogoSubcategoria[] = [];
  estadosTransaccion: CatalogoEstadoTransaccion[] = [];
  private detalleTransaccionRowsCache: DetalleTransaccionListadoRow[] = [];
  private filteredDetalleTransaccionesCache: DetalleTransaccionListadoRow[] = [];
  private quickPayBulkSelectedRowsCache: DetalleTransaccionListadoRow[] = [];
  private quickPayBulkSelectedCountCache = 0;
  private quickPayBulkSelectedMontoTotalCache = 0;
  private quickPayBulkSelectedMetodoPagoIdCache: number | null = null;
  private quickPayBulkSelectedMetodoPagoCache = '';
  private canApplyQuickPayBulkCache = false;
  private quickPayFilteredSubtotalSummaryCache: QuickPaySubtotalSummary = {
    pendiente: 0,
    pagado: 0,
    ingresos: 0,
  };
  private quickPayDetalleMetodoGroupsCache: QuickPayMetodoGroup[] = [];
  quickPayBulkAccentPalette: QuickPayAccentPalette =
    this.getQuickPayMethodAccentPalette(null, '');
  quickPaySortColumn: QuickPaySortColumn | null =
    this.viewMode === 'detalle' ? 'fecha_transaccion' : null;
  quickPaySortDirection: QuickPaySortDirection = 'asc';
  listadoSortDirection: 'asc' | 'desc' = 'desc';

  readonly transaccionForm = this.fb.group({
    fecha_transaccion: ['', [Validators.required, this.dateDisplayValidator()]],
    id_tipo_transaccion: [null as TipoTransaccionId | null, [Validators.required]],
    forma_pago: [null as number | null, [Validators.required]],
    id_categoria: [null as number | null, [Validators.required]],
    id_subcategoria: [null as number | null],
    entidad_financiera: [{ value: '', disabled: true }],
    tipo_entidad: [{ value: '', disabled: true }],
    usar_participantes: [false],
    cuotas_sin_intereses: [false],
    recordatorio_pago: [false],
    participantes_detalle: this.fb.array<ParticipanteDetalleForm>([]),
    id_estado: [null as number | null, [Validators.required]],
    intereses: [{ value: 0 as number | null, disabled: true }, [Validators.min(0), this.maxTwoDecimalsValidator()]],
    monto: [
      null as number | null,
      [Validators.required, Validators.min(0.01), this.maxTwoDecimalsValidator()],
    ],
    descripcion: ['', [Validators.maxLength(250)]],
    comentario: [null as string | null, [Validators.maxLength(75)]],
  });

  readonly aplicarPagosForm = this.fb.group({
    pagos_detalle: this.fb.array<PagoDetalleForm>([]),
  });

  ngOnInit(): void {
    try {
      const stored = window.sessionStorage.getItem(QUICK_PAY_FILTERS_COLLAPSED_KEY);
      if (stored !== null) this.quickPayFiltersCollapsed = stored === 'true';
    } catch { /* Ignore storage errors */ }

    this.syncQuickPayPriorityControlState(this.filtrosForm.controls.prioritarios.value);

    this.filtrosForm.valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      if (!this.isDetalleViewMode) {
        this.listadoCurrentPage = 1;
      }

      this.syncListadoTodosControlState();
      this.syncSelectedTransaccionWithFilters();
      this.syncQuickPayBulkSelectionWithFilters();
    });

    this.filtrosForm.controls.prioritarios.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((isEnabled) => {
        this.persistQuickPayPriorityFilterPreference(isEnabled);
        this.syncQuickPayPriorityControlState(isEnabled);
      });

    this.filtrosForm.controls.idParticipante.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((participanteId) => {
        if (!this.isDetalleViewMode) {
          return;
        }

        if (!this.filtrosForm.controls.compartidos.value || participanteId !== null) {
          this.sharedParticipantFilterAutoReset = false;
        }
      });

    this.filtrosForm.controls.idCategoria.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        this.refreshFilteredSubcategoriasFiltro();
        this.syncFiltroSubcategoriaSelection();
      });

    this.transaccionForm.controls.id_tipo_transaccion.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        this.refreshProgramacionForAllGroups();
        this.refreshEstadoTransaccionForEdit();
      });

    this.transaccionForm.controls.id_estado.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        if (!this.isEditing || this.isSyncingEstadoTransaccion) {
          return;
        }

        this.hasManualEstadoSelectionInEdit = true;
      });

    this.transaccionForm.controls.cuotas_sin_intereses.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        if (!this.isEditingSharedExpenseMode || !this.isEditing) {
          return;
        }

        this.applySharedExpenseCuotaDrivenModeForEdit();
        this.syncCalculatedExpenseMontoForEdit();
      });

    this.aplicarPagosForm.valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      this.refreshPagosDetalleGroups();
    });

    this.router.events
      .pipe(
        filter((event): event is NavigationEnd => event instanceof NavigationEnd),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((event) => {
        const currentUrl = event.urlAfterRedirects || event.url;

        if (this.isListadoTransaccionesRoute(currentUrl)) {
          void this.loadPageForToday();
        }
      });

    void this.loadPageForToday();
  }

  @HostListener('window:focus')
  handleWindowFocus(): void {
    if (!this.isListadoTransaccionesRoute(this.router.url)) {
      return;
    }

    void this.reloadAll();
  }

  @HostListener('document:keydown.escape', ['$event'])
  handleEscapeKey(event: Event): void {
    if (this.paymentModalOpen) {
      event.preventDefault();
      this.dismissPaymentModal();
      return;
    }

    if (this.detailModalTransaccion) {
      event.preventDefault();
      this.closeDetailModal();
      return;
    }

    if (this.editModalOpen) {
      event.preventDefault();
      this.closeEditModal();
    }
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

  showNotaTooltip(text: string | null | undefined, event: MouseEvent): void {
    if (!text) return;
    this.notaTooltipText = text;
    this.notaTooltipX = event.clientX + 14;
    this.notaTooltipY = event.clientY + 14;
  }

  moveNotaTooltip(event: MouseEvent): void {
    if (!this.notaTooltipText) return;
    this.notaTooltipX = event.clientX + 14;
    this.notaTooltipY = event.clientY + 14;
  }

  hideNotaTooltip(): void {
    this.notaTooltipText = null;
  }

  get isResumenMenuOpen(): boolean {
    return false;
  }

  toggleTransactionsMenu(): void {
    this.transactionsOpen = !this.transactionsOpen;
  }

  get isEditing(): boolean {
    return this.editingTransaccionId !== null;
  }

  get filteredTransacciones(): TransaccionListado[] {
    const filtros = this.filtrosForm.getRawValue();
    const fechaDesde = this.normalizeDateInputValue(filtros.fechaDesde ?? '');
    const fechaHasta = this.normalizeDateInputValue(filtros.fechaHasta ?? '');
    const estadoFiltro = this.getNormalizedEstadoListado(filtros.estado ?? '');
    const descripcionFiltro = this.normalizeText(filtros.busquedaDescripcion ?? '');
    const idFiltro = (filtros.busquedaId ?? '').trim();
    const mostrarTodas = !!filtros.todos;
    const prioridadActiva = !!filtros.prioritarios;
    const vencidosActivos = !!filtros.vencidos;
    const mesFiltro = filtros.mesFiltro;
    const anioFiltro = filtros.anioFiltro;

    return this.transacciones.filter((transaccion) => {
      const fechaTransaccion = this.normalizeDateOnly(transaccion.fecha);
      const estadoTransaccion = this.getNormalizedEstadoListado(transaccion.nombre_estado ?? '');
      const estadoCoincideFiltro = !!estadoFiltro && estadoTransaccion === estadoFiltro;
      const descripcionTransaccion = this.normalizeText(transaccion.descripcion ?? '');

      if (
        !mostrarTodas &&
        !this.isEstadoVisibleEnListado(estadoTransaccion) &&
        !estadoCoincideFiltro
      ) {
        return false;
      }

      if (mesFiltro !== null || anioFiltro !== null) {
        const anioTransaccion = Number(fechaTransaccion.slice(0, 4));
        const mesTransaccion = Number(fechaTransaccion.slice(5, 7));

        if (mesFiltro !== null && mesTransaccion !== mesFiltro) {
          return false;
        }

        if (anioFiltro !== null && anioTransaccion !== anioFiltro) {
          return false;
        }
      }

      if (filtros.soloHoy && fechaTransaccion !== this.todayFilterValue) {
        return false;
      }

      if (prioridadActiva || vencidosActivos) {
        const coincideConFiltroRapidoFecha =
          (prioridadActiva && this.hasPriorityPendingSchedule(transaccion)) ||
          (vencidosActivos && this.hasOverduePendingSchedule(transaccion));

        if (!coincideConFiltroRapidoFecha) {
          return false;
        }
      }

      if (
        filtros.pendientePago &&
        estadoTransaccion !== 'pendiente'
      ) {
        return false;
      }

      if (filtros.enviadas && transaccion.es_propietario) {
        return false;
      }

      if (
        filtros.pendienteRegistro &&
        this.normalizeText(transaccion.nombre_estado_registro ?? '') !== 'pendiente'
      ) {
        return false;
      }

      if (!this.matchesDateRange(fechaTransaccion, fechaDesde, fechaHasta)) {
        return false;
      }

      if (estadoFiltro && estadoTransaccion !== estadoFiltro) {
        return false;
      }

      if (
        filtros.idMetodoPago !== null &&
        transaccion.id_metodo_pago !== filtros.idMetodoPago
      ) {
        return false;
      }

      if (
        filtros.idParticipante !== null &&
        !this.getParticipantesDetalleSafe(transaccion).some(
          (detalle) => detalle.id_participante === filtros.idParticipante,
        )
      ) {
        return false;
      }

      if (filtros.idCategoria !== null && transaccion.id_categoria !== filtros.idCategoria) {
        return false;
      }

      if (
        filtros.idSubcategoria !== null &&
        transaccion.id_subcategoria !== filtros.idSubcategoria
      ) {
        return false;
      }

      if (descripcionFiltro && !descripcionTransaccion.includes(descripcionFiltro)) {
        return false;
      }

      if (idFiltro && !String(transaccion.id_transaccion).includes(idFiltro)) {
        return false;
      }

      return true;
    }).sort((left, right) => this.compareTransaccionesByFecha(left, right));
  }

  private compareTransaccionesByFecha(
    left: TransaccionListado,
    right: TransaccionListado,
  ): number {
    const direction = this.listadoSortDirection === 'desc' ? -1 : 1;
    const fechaLeft = this.normalizeDateOnly(left.fecha);
    const fechaRight = this.normalizeDateOnly(right.fecha);

    if (fechaLeft !== fechaRight) {
      return fechaLeft.localeCompare(fechaRight) * direction;
    }

    return (left.id_transaccion - right.id_transaccion) * direction;
  }

  toggleListadoSort(): void {
    this.listadoSortDirection = this.listadoSortDirection === 'desc' ? 'asc' : 'desc';
    this.listadoCurrentPage = 1;
  }

  getListadoSortIndicator(): 'asc' | 'desc' {
    return this.listadoSortDirection;
  }

  get paginatedFilteredTransacciones(): TransaccionListado[] {
    const filtered = this.filteredTransacciones;
    const currentPage = this.getListadoCurrentPage();
    const startIndex = (currentPage - 1) * this.listadoPageSize;

    return filtered.slice(startIndex, startIndex + this.listadoPageSize);
  }

  get isDetalleViewMode(): boolean {
    return this.viewMode === 'detalle';
  }

  get filteredDetalleTransacciones(): DetalleTransaccionListadoRow[] {
    return this.filteredDetalleTransaccionesCache;
  }

  private computeFilteredDetalleTransacciones(): DetalleTransaccionListadoRow[] {
    const filtros = this.filtrosForm.getRawValue();
    const estadoFiltro = this.getNormalizedEstadoListado(filtros.estado ?? '');
    const tipoTransaccionFiltro =
      (this.normalizeText(filtros.tipoTransaccion ?? '') as 'credito' | 'debito' | '') || null;
    const prioridadActiva = !!filtros.prioritarios;
    const vencidosActivos = !!filtros.vencidos;
    const fechaDesde = this.normalizeDateInputValue(filtros.fechaDesde ?? '');
    const fechaHasta = this.normalizeDateInputValue(filtros.fechaHasta ?? '');
    const descripcionFiltro = this.normalizeText(filtros.busquedaDescripcion ?? '');
    const idFiltroDetalle = (filtros.busquedaId ?? '').trim();

    return this.detalleTransaccionRowsCache
      .filter((row) => {
        const estadoDetalle = this.getNormalizedEstadoListado(row.detalle.nombre_estado ?? '');
        const estadoCoincideFiltro = !!estadoFiltro && estadoDetalle === estadoFiltro;
        const fechaProgramada = this.normalizeDateOnly(row.detalle.fecha_programada);
        const descripcionTransaccion = this.normalizeText(row.descripcion ?? '');

        if (!this.isEstadoVisibleEnListado(estadoDetalle) && !estadoCoincideFiltro) {
          return false;
        }

        if (prioridadActiva || vencidosActivos) {
          const coincideConFiltroRapidoFecha =
            (prioridadActiva && this.isDetallePrioritario(row.detalle)) ||
            (vencidosActivos && this.isDetalleVencido(row.detalle));

          if (!coincideConFiltroRapidoFecha) {
            return false;
          }
        }

        if (filtros.enviadas && row.transaccion.es_propietario) {
          return false;
        }

        if (filtros.compartidos && row.detalle.es_titular) {
          return false;
        }

        if (!this.matchesDateRange(fechaProgramada, fechaDesde, fechaHasta)) {
          return false;
        }

        if (estadoFiltro && estadoDetalle !== estadoFiltro) {
          return false;
        }

        if (
          tipoTransaccionFiltro &&
          this.resolveTipoTransaccion(row.transaccion) !== tipoTransaccionFiltro
        ) {
          return false;
        }

        if (
          filtros.idParticipante !== null &&
          row.detalle.id_participante !== filtros.idParticipante
        ) {
          return false;
        }

        if (
          filtros.idMetodoPago !== null &&
          row.quickPayMetodoPagoId !== filtros.idMetodoPago
        ) {
          return false;
        }

        if (descripcionFiltro && !descripcionTransaccion.includes(descripcionFiltro)) {
          return false;
        }

        if (idFiltroDetalle && !String(row.transaccion.id_transaccion).includes(idFiltroDetalle)) {
          return false;
        }

        return true;
      })
      .sort((left, right) => {
        if (this.quickPaySortColumn) {
          const direction = this.quickPaySortDirection === 'asc' ? 1 : -1;
          return this.compareQuickPayRowsByDate(left, right, this.quickPaySortColumn) * direction;
        }

        return this.compareDetalleRowsByFechaTransaccion(left, right);
      });
  }

  isDetalleVencido(detalle: ParticipanteDetalleListado): boolean {
    if (detalle.id_estado === ESTADO_TRANSACCION_ANULADA_ID) {
      return false;
    }

    const estadoNorm = this.normalizeText(detalle.nombre_estado ?? '');
    if (estadoNorm === 'pagado' || estadoNorm === 'pagada') {
      return false;
    }

    const hasPendingSaldo = Number(detalle.saldo_pendiente ?? 0) > 0;
    const isPendingStatus = estadoNorm === 'pendiente' || estadoNorm === 'pago parcial';

    if (!hasPendingSaldo && !isPendingStatus) {
      return false;
    }

    const scheduledDate = this.parseIsoDateOnly(detalle.fecha_programada);

    if (!scheduledDate) {
      return false;
    }

    return scheduledDate < this.getDateOnlyValue(new Date());
  }

  private isDetallePendienteEnPeriodoActual(detalle: ParticipanteDetalleListado): boolean {
    if (detalle.id_estado === ESTADO_TRANSACCION_ANULADA_ID) {
      return false;
    }

    const estadoNorm = this.normalizeText(detalle.nombre_estado ?? '');
    if (estadoNorm === 'pagado' || estadoNorm === 'pagada') {
      return false;
    }

    const hasPendingSaldo = Number(detalle.saldo_pendiente ?? 0) > 0;
    const isPendingStatus = estadoNorm === 'pendiente' || estadoNorm === 'pago parcial';

    if (!hasPendingSaldo && !isPendingStatus) {
      return false;
    }

    const scheduledDate = this.parseIsoDateOnly(detalle.fecha_programada);

    if (!scheduledDate) {
      return false;
    }

    const today = this.getDateOnlyValue(new Date());
    const finDeMesActual = this.getDateOnlyValue(new Date(today.getFullYear(), today.getMonth() + 1, 0));

    return scheduledDate <= finDeMesActual;
  }

  readonly isTransaccionVencida = (transaccion: TransaccionListado): boolean =>
    this.getParticipantesDetalleSafe(transaccion).some((detalle) =>
      this.isDetalleVencido(detalle),
    );

  get quickPayBulkSelectedRows(): DetalleTransaccionListadoRow[] {
    return this.quickPayBulkSelectedRowsCache;
  }

  get quickPayBulkSelectedCount(): number {
    return this.quickPayBulkSelectedCountCache;
  }

  get quickPayBulkSelectedMontoTotal(): number {
    return this.quickPayBulkSelectedMontoTotalCache;
  }

  get quickPayBulkSelectedMetodoPago(): string {
    return this.quickPayBulkSelectedMetodoPagoCache;
  }

  private resolveQuickPayBulkAccentPalette(): QuickPayAccentPalette {
    const selectedGroupIndex = this.quickPayDetalleMetodoGroupsCache.findIndex(
      (group) =>
        group.metodoPagoId === this.quickPayBulkSelectedMetodoPagoIdCache &&
        group.metodoPagoNombre === this.quickPayBulkSelectedMetodoPagoCache,
    );

    if (selectedGroupIndex >= 0) {
      return this.getQuickPayGroupAccentPalette(selectedGroupIndex);
    }

    return this.getQuickPayMethodAccentPalette(
      this.quickPayBulkSelectedMetodoPagoIdCache,
      this.quickPayBulkSelectedMetodoPagoCache,
    );
  }

  get canApplyQuickPayBulk(): boolean {
    return this.canApplyQuickPayBulkCache;
  }

  get quickPayFilteredSubtotalSummary(): QuickPaySubtotalSummary {
    return this.quickPayFilteredSubtotalSummaryCache;
  }

  get quickPayDetalleMetodoGroups(): QuickPayMetodoGroup[] {
    return this.quickPayDetalleMetodoGroupsCache;
  }

  get activeQuickPayFilterChips(): string[] {
    if (!this.isDetalleViewMode) return [];
    const f = this.filtrosForm.getRawValue();
    const chips: string[] = [];
    if (f.prioritarios) chips.push('Proximos 15 dias');
    if (f.vencidos) chips.push('Vencidos');
    if (f.mesActual) chips.push('Mes actual');
    if (f.enviadas) chips.push('Recibidos');
    if (f.compartidos) chips.push('Compartidos');
    if (f.estado) chips.push(String(f.estado));
    if (f.idParticipante !== null && f.idParticipante !== undefined) {
      const p = this.quickPayParticipantesFiltro.find((x) => x.id_participante === f.idParticipante);
      if (p) chips.push(p.nombre_participante);
    }
    return chips;
  }

  private buildQuickPayDetalleMetodoGroups(
    rows: DetalleTransaccionListadoRow[],
  ): QuickPayMetodoGroup[] {
    const groups = new Map<string, QuickPayMetodoGroup>();
    const idMetodoPagoFiltrado = this.filtrosForm.getRawValue().idMetodoPago;

    for (const row of rows) {
      const metodoPagoId = row.quickPayMetodoPagoId;
      const metodoPagoNombre = row.quickPayMetodoPagoNombre;
      const groupKey = row.quickPayGroupKey;
      const saldoPendiente = Number(row.detalle.saldo_pendiente ?? 0);
      const fechaProgramada = this.normalizeDateOnly(row.detalle.fecha_programada);
      const currentGroup = groups.get(groupKey);

      if (currentGroup) {
        currentGroup.rows.push(row);
        currentGroup.totalPendiente = this.roundMoneyValue(
          currentGroup.totalPendiente + saldoPendiente,
        );

        if (
          fechaProgramada &&
          (!currentGroup.oldestScheduledDate ||
            fechaProgramada < currentGroup.oldestScheduledDate)
        ) {
          currentGroup.oldestScheduledDate = fechaProgramada;
        }

        continue;
      }

      const expandedByFilter = idMetodoPagoFiltrado !== null;
      groups.set(groupKey, {
        key: groupKey,
        metodoPagoId,
        metodoPagoNombre,
        oldestScheduledDate: fechaProgramada,
        rows: [row],
        totalPendiente: this.roundMoneyValue(saldoPendiente),
        expanded: expandedByFilter || (this.quickPayMetodoGroupExpansionState[groupKey] ?? false),
        currentPage: 1,
        selectableCount: 0,
        selectedCount: 0,
        selectionDisabled: false,
        fullySelected: false,
        partiallySelected: false,
      });
    }

    return Array.from(groups.values()).sort((left, right) =>
      this.compareQuickPayMetodoGroups(left, right),
    );
  }

  private compareQuickPayRowsByDate(
    left: DetalleTransaccionListadoRow,
    right: DetalleTransaccionListadoRow,
    column: QuickPaySortColumn,
  ): number {
    const leftDate =
      column === 'fecha_transaccion'
        ? this.parseIsoDateOnly(left.transaccion.fecha)
        : this.parseIsoDateOnly(left.detalle.fecha_programada);
    const rightDate =
      column === 'fecha_transaccion'
        ? this.parseIsoDateOnly(right.transaccion.fecha)
        : this.parseIsoDateOnly(right.detalle.fecha_programada);

    if (leftDate && rightDate && leftDate.getTime() !== rightDate.getTime()) {
      return leftDate.getTime() - rightDate.getTime();
    }

    if (leftDate && !rightDate) return -1;
    if (!leftDate && rightDate) return 1;

    return left.detalle.id - right.detalle.id;
  }

  toggleQuickPaySort(column: QuickPaySortColumn): void {
    if (this.quickPaySortColumn === column) {
      this.quickPaySortDirection = this.quickPaySortDirection === 'asc' ? 'desc' : 'asc';
    } else {
      this.quickPaySortColumn = column;
      this.quickPaySortDirection = 'asc';
    }

    this.filteredDetalleTransaccionesCache = this.computeFilteredDetalleTransacciones();
    this.quickPayDetalleMetodoGroupsCache = this.buildQuickPayDetalleMetodoGroups(
      this.filteredDetalleTransaccionesCache,
    );
  }

  getQuickPaySortIndicator(column: QuickPaySortColumn): QuickPaySortDirection | null {
    return this.quickPaySortColumn === column ? this.quickPaySortDirection : null;
  }

  isQuickPayMetodoGroupExpanded(group: QuickPayMetodoGroup, index: number): boolean {
    return group.expanded;
  }

  toggleQuickPayMetodoGroup(group: QuickPayMetodoGroup, index: number): void {
    group.expanded = !group.expanded;
    this.quickPayMetodoGroupExpansionState[group.key] = group.expanded;
  }

  readonly quickPayGroupPageSize = 10;

  getGroupPagedRows(group: QuickPayMetodoGroup): DetalleTransaccionListadoRow[] {
    const start = (group.currentPage - 1) * this.quickPayGroupPageSize;
    return group.rows.slice(start, start + this.quickPayGroupPageSize);
  }

  getGroupTotalPages(group: QuickPayMetodoGroup): number {
    return Math.max(1, Math.ceil(group.rows.length / this.quickPayGroupPageSize));
  }

  changeGroupPage(group: QuickPayMetodoGroup, delta: number): void {
    const next = group.currentPage + delta;
    const total = this.getGroupTotalPages(group);
    if (next >= 1 && next <= total) {
      group.currentPage = next;
    }
  }

  goToGroupPage(group: QuickPayMetodoGroup, page: number): void {
    const total = this.getGroupTotalPages(group);
    if (page >= 1 && page <= total) {
      group.currentPage = page;
    }
  }

  getGroupVisiblePages(group: QuickPayMetodoGroup): number[] {
    const total = this.getGroupTotalPages(group);
    const current = group.currentPage;
    const windowSize = 5;
    let start = Math.max(1, current - Math.floor(windowSize / 2));
    const end = Math.min(total, start + windowSize - 1);
    start = Math.max(1, end - windowSize + 1);
    return Array.from({ length: end - start + 1 }, (_, i) => start + i);
  }

  getQuickPayMetodoGroupSelectableCount(group: QuickPayMetodoGroup): number {
    return group.selectableCount;
  }

  getQuickPayMetodoGroupSelectedCount(group: QuickPayMetodoGroup): number {
    return group.selectedCount;
  }

  isQuickPayMetodoGroupSelectionDisabled(group: QuickPayMetodoGroup): boolean {
    return group.selectionDisabled;
  }

  isQuickPayMetodoGroupFullySelected(group: QuickPayMetodoGroup): boolean {
    return group.fullySelected;
  }

  isQuickPayMetodoGroupPartiallySelected(group: QuickPayMetodoGroup): boolean {
    return group.partiallySelected;
  }

  toggleQuickPayMetodoGroupSelection(group: QuickPayMetodoGroup, event?: Event): void {
    event?.stopPropagation();

    if (this.isQuickPayMetodoGroupSelectionDisabled(group)) {
      return;
    }

    const selectableRows = group.rows.filter((row) => !row.quickPaySelectionDisabled);
    const shouldSelectAll = !this.isQuickPayMetodoGroupFullySelected(group);

    selectableRows.forEach((row) => {
      if (shouldSelectAll) {
        this.selectedQuickPayDetalleIds.add(row.detalle.id);
        return;
      }

      this.selectedQuickPayDetalleIds.delete(row.detalle.id);
    });

    this.refreshQuickPaySelectionState();
  }

  getQuickPayMetodoGroupAccentColor(index: number): string {
    return this.getPaymentGroupAccentColor(index);
  }

  getQuickPayMetodoGroupSurfaceColor(index: number): string {
    const surfacePalette = ['#eaf1ff', '#fff1e8', '#f3ecff', '#e8f7f4', '#fff1eb', '#fdebf4'];
    return surfacePalette[index % surfacePalette.length];
  }

  getQuickPayMetodoGroupTextColor(index: number): string {
    const textPalette = ['#1e3a8a', '#9a3412', '#5b21b6', '#115e59', '#9a3412', '#9d174d'];
    return textPalette[index % textPalette.length];
  }

  private getQuickPayGroupAccentPalette(index: number): QuickPayAccentPalette {
    const borderPalette = ['#bfd4ff', '#ffd8bf', '#ddd6fe', '#bfe7df', '#fed7c8', '#f7cad9'];
    const surfacePalette = ['#eaf1ff', '#fff1e8', '#f3ecff', '#e8f7f4', '#fff1eb', '#fdebf4'];
    const methodSurfacePalette = ['#dbeafe', '#ffedd5', '#f3e8ff', '#ccfbf1', '#ffedd5', '#fce7f3'];
    const methodBorderPalette = ['#93c5fd', '#fdba74', '#d8b4fe', '#5eead4', '#fdba74', '#f9a8d4'];
    const accent = this.getPaymentGroupAccentColor(index);
    const text = this.getQuickPayMetodoGroupTextColor(index);

    return {
      accent,
      border: borderPalette[index % borderPalette.length],
      soft: surfacePalette[index % surfacePalette.length],
      glow: 'rgba(15, 23, 42, 0.08)',
      chipBorder: borderPalette[index % borderPalette.length],
      chipBg: 'rgba(255, 255, 255, 0.94)',
      chipColor: text,
      methodBorder: methodBorderPalette[index % methodBorderPalette.length],
      methodBg: methodSurfacePalette[index % methodSurfacePalette.length],
      methodColor: text,
    };
  }

  get pageEyebrow(): string {
    return this.isDetalleViewMode ? 'Resumen' : 'Transacciones';
  }

  get pageTitle(): string {
    return this.isDetalleViewMode ? 'Pago Rapido' : 'Todas las Transacciones';
  }

  get panelTitle(): string {
    return this.isDetalleViewMode ? 'Detalle de cuotas' : 'Transacciones';
  }

  get panelSubtitle(): string {
    return this.isDetalleViewMode ? 'Detalle programado para pago' : 'Todas las Transacciones';
  }

  get currentUserIdValue(): number {
    return getCurrentUserId();
  }

  get fechaDesdeCalendarioValue(): string {
    return this.normalizeDateInputValue(this.filtrosForm.controls.fechaDesde.value ?? '') ?? '';
  }

  get fechaHastaCalendarioValue(): string {
    return this.normalizeDateInputValue(this.filtrosForm.controls.fechaHasta.value ?? '') ?? '';
  }

  get fechaTransaccionCalendarioValue(): string {
    return this.normalizeDateInputValue(this.transaccionForm.controls.fecha_transaccion.value ?? '') ?? '';
  }

  get showCuotasSinInteresesOption(): boolean {
    return this.selectedFormaPago?.calcula_interes === true;
  }

  get shouldShowEntidadFinancieraNote(): boolean {
    return Boolean(this.transaccionForm.controls.entidad_financiera.value) && !this.isCashFormaPagoSelected;
  }

  get isEditingIncomeMode(): boolean {
    return Number(this.transaccionForm.controls.id_tipo_transaccion.value ?? 0) === 2;
  }

  get isEditingSharedExpenseMode(): boolean {
    return !this.isEditingIncomeMode && Boolean(this.usarParticipantesControl.value);
  }

  get isEditingSharedExpenseCuotasDesdeFechaProgramadaMode(): boolean {
    return this.isEditingSharedExpenseMode && Boolean(this.transaccionForm.controls.cuotas_sin_intereses.value);
  }

  get isEditingSharedExpenseTotalEditable(): boolean {
    return Boolean(
      this.isEditingSharedExpenseMode &&
        !this.isEditingSharedExpenseCuotasDesdeFechaProgramadaMode &&
        !this.showZeroBalancePeriodGrouping &&
        this.titularDetalleGroup?.controls.dividir_monto.value,
    );
  }

  get editingIncomeMontoHint(): string {
    const titularGroup = this.titularDetalleGroup;

    if (this.isEditingSharedExpenseMode) {
      return '';
    }

    if (!titularGroup || !this.isIncomeTitularGroup(titularGroup)) {
      return this.isImmediatePaymentSelectedForEdit
        ? ''
        : 'Este campo muestra el monto total acumulado de las cuotas.';
    }

    return this.isFixedCuotasMode(titularGroup)
      ? ''
      : 'El monto principal se toma como monto total y se distribuye automaticamente entre las cuotas.';
  }

  get editingMontoLabel(): string {
    if (this.isEditingSharedExpenseMode) {
      return 'Monto total';
    }

    return this.isEditingIncomeMode ? 'Monto' : 'Monto total';
  }

  get editModalTransactionKindLabel(): string {
    if (this.isEditingIncomeMode) {
      return 'Ingreso';
    }

    return this.usarParticipantesControl.value ? 'Compartido' : 'Individual';
  }

  get hasMultipleCuotasInEditor(): boolean {
    return this.participantesDetalleArray.controls.some(
      (group) => this.getGroupCuotasCount(group) > 1,
    );
  }

  get isVariablePaymentTransactionInEditor(): boolean {
    if (!this.isEditingSharedExpenseMode) {
      return false;
    }

    return (
      Number(this.selectedTransaccion?.id_tipo_cuota ?? 0) === TIPO_CUOTA_VARIABLE_ID ||
      this.hasLegacyZeroBalanceCuotasInEditor
    );
  }

  private get hasLegacyZeroBalanceCuotasInEditor(): boolean {
    return this.editorDetallesOriginales.some((detalle) =>
      this.isZeroBalancePlannedDetail(detalle),
    );
  }

  get hasZeroBalanceCuotasInEditor(): boolean {
    return this.isVariablePaymentTransactionInEditor;
  }

  get showZeroBalancePeriodGrouping(): boolean {
    return Boolean(
      this.isEditingSharedExpenseMode &&
      this.hasZeroBalanceCuotasInEditor &&
      this.usarParticipantesControl.value,
    );
  }

  get editModalCuotasKindLabel(): string {
    if (this.isVariablePaymentTransactionInEditor) {
      return 'Pago variable';
    }

    if (this.hasLegacyZeroBalanceCuotasInEditor) {
      return 'Saldos en 0.00';
    }

    if (this.hasMultipleCuotasInEditor) {
      return 'Edita por mes';
    }

    return this.usarParticipantesControl.value ? 'Con cuotas' : 'Cuota unica';
  }

  get participantsEditorTitle(): string {
    if (this.isEditingSharedExpenseMode) {
      return 'Participantes y cuotas';
    }

    if (this.hasMultipleCuotasInEditor || this.hasZeroBalanceCuotasInEditor) {
      return 'Cuotas';
    }

    return 'Detalle';
  }

  get participantsEditorHint(): string {
    if (this.isEditingSharedExpenseMode && this.isVariablePaymentTransactionInEditor) {
      return 'Esta transaccion esta marcada como pago variable. Configura las cuotas una sola vez y cambia el monto desde cada mes.';
    }

    if (this.isEditingSharedExpenseMode) {
      return 'El modal ya detecto que esta transaccion es compartida.';
    }

    if (this.hasZeroBalanceCuotasInEditor) {
      return 'Esta transaccion viene planificada en 0.00 y aqui puedes ajustar cada mes.';
    }

    if (this.hasMultipleCuotasInEditor) {
      return 'Edita las cuotas del titular sin abrir campos extra.';
    }

    return 'Abre el detalle solo si necesitas dividir cuotas o agregar participantes.';
  }

  get shouldShowCompactParticipantsLauncher(): boolean {
    return !Boolean(this.usarParticipantesControl.value);
  }

  get participantsLauncherLabel(): string {
    if (this.isEditingIncomeMode) {
      return 'Editar cuotas';
    }

    return 'Editar cuotas y participantes';
  }

  get dividirMontoLabel(): string {
    return this.isEditingSharedExpenseMode
      ? 'Dividir monto en cuotas/participantes'
      : 'Dividir monto en cuotas';
  }

  get currentUserProfileValue() {
    return loadUserProfile();
  }

  get isImmediatePaymentSelectedForEdit(): boolean {
    return this.selectedFormaPago?.tipo_producto?.pago_inmediato === true;
  }

  get currentUserDisplayName(): string {
    return `${
      this.currentUserProfileValue.fullName || this.currentUserProfileValue.username
    } (Tú)`;
  }

  get transaccionesPagadasCount(): number {
    return this.filteredTransacciones.filter(
      (item) => this.getNormalizedEstadoListado(item.nombre_estado) === 'pagado',
    ).length;
  }

  get transaccionesPagoParcialCount(): number {
    return 0;
  }

  get transaccionesPendientesCount(): number {
    return this.filteredTransacciones.filter(
      (item) => this.getNormalizedEstadoListado(item.nombre_estado) === 'pendiente',
    ).length;
  }

  get transaccionesPendientesRegistroCount(): number {
    return this.filteredTransacciones.filter(
      (item) => item.nombre_estado_registro === 'PENDIENTE',
    ).length;
  }

  getListadoCurrentPage(): number {
    const totalPages = this.getListadoTotalPages();
    const normalizedPage = Math.min(Math.max(1, this.listadoCurrentPage), totalPages);

    if (normalizedPage !== this.listadoCurrentPage) {
      this.listadoCurrentPage = normalizedPage;
    }

    return normalizedPage;
  }

  getListadoTotalPages(): number {
    return Math.max(1, Math.ceil(this.filteredTransacciones.length / this.listadoPageSize));
  }

  getListadoPageStart(): number {
    const totalTransacciones = this.filteredTransacciones.length;

    if (totalTransacciones === 0) {
      return 0;
    }

    return (this.getListadoCurrentPage() - 1) * this.listadoPageSize + 1;
  }

  getListadoPageEnd(): number {
    return Math.min(
      this.getListadoCurrentPage() * this.listadoPageSize,
      this.filteredTransacciones.length,
    );
  }

  changeListadoPage(delta: number): void {
    this.listadoCurrentPage = Math.min(
      this.getListadoTotalPages(),
      Math.max(1, this.getListadoCurrentPage() + delta),
    );
  }

  get isOnlyPagadoFilter(): boolean {
    const estado = this.filtrosForm.getRawValue().estado ?? '';
    return estado.trim().toUpperCase() === 'PAGADO';
  }

  get estadosTransaccionFiltro(): CatalogoEstadoTransaccion[] {
    return this.estadosTransaccion.filter((estado) =>
      this.isEstadoDisponibleEnFiltro(estado.nombre_estado),
    );
  }

  get estadosPagoEdicionDisponibles(): CatalogoEstadoTransaccion[] {
    return this.estadosTransaccion.filter((estado) => {
      const nombreEstado = estado.nombre_estado.trim().toUpperCase();
      return (
        nombreEstado === 'PENDIENTE' ||
        nombreEstado === 'PAGADO' ||
        nombreEstado === 'ANULADO' ||
        nombreEstado === 'ANULADA'
      );
    });
  }

  get usarParticipantesControl(): FormControl<boolean | null> {
    return this.transaccionForm.get('usar_participantes') as FormControl<boolean | null>;
  }

  get participantesDetalleArray(): FormArray<ParticipanteDetalleForm> {
    return this.transaccionForm.get('participantes_detalle') as FormArray<ParticipanteDetalleForm>;
  }

  get participantesDetalleControls(): ParticipanteDetalleForm[] {
    return this.participantesDetalleArray.controls;
  }

  getCuotasArray(group: ParticipanteDetalleForm): FormArray<CuotaMontoForm> {
    return group.controls.cuotas;
  }

  getProgramacionVisible(group: ParticipanteDetalleForm): boolean {
    return Number(group.controls.cantidad_cuotas.value ?? 1) > 1;
  }

  getFechaProgramadaDisplay(value: string | null | undefined): string {
    return value ? this.formatDateDisplayFromApi(value) : '';
  }

  isCuotaMontoReadonly(group: ParticipanteDetalleForm): boolean {
    if (this.isEditingSharedExpenseMode) {
      return this.isIncomeTitularGroup(group);
    }

    return this.isIncomeTitularGroup(group) || this.isFixedCuotasMode(group);
  }

  getEditorParticipanteMontoLabel(group: ParticipanteDetalleForm): string {
    return this.isFixedCuotasMode(group)
      ? 'Monto por cuota'
      : 'Monto total a dividir';
  }

  getEditorParticipanteMontoHint(group: ParticipanteDetalleForm): string {
    return this.isFixedCuotasMode(group)
      ? ''
      : this.isEditingIncomeMode
        ? 'Este monto total se dividira automaticamente entre las cuotas.'
        : '';
  }

  canGroupUseZeroCuotas(group: ParticipanteDetalleForm): boolean {
    const montoBase = this.normalizeDecimalValue(Number(group.controls.monto.value ?? 0));
    const montoBloqueado = this.getLockedGroupMontoTarget(group);

    return Boolean(
      this.isEditingSharedExpenseMode &&
      group.controls.es_titular.value &&
      !this.isFixedCuotasMode(group) &&
      this.toCents(Math.max(montoBloqueado, montoBase)) === 0,
    );
  }

  canRemoveTitularCuota(group: ParticipanteDetalleForm): boolean {
    return Boolean(
      this.isEditingSharedExpenseMode &&
      group.controls.es_titular.value &&
      !this.hasAppliedPagosInEditor &&
      this.getCuotasArray(group).length > 0,
    );
  }

  shouldShowTitularSection(group: ParticipanteDetalleForm): boolean {
    return !group.controls.es_titular.value || !this.titularSectionDismissed;
  }

  getModoCuotasLabel(group: ParticipanteDetalleForm): string {
    return (
      this.modosCuotas.find((modo) => modo.value === group.controls.modo_cuotas.value)?.label ??
      'Variables / divididas'
    );
  }

  getEditorParticipanteMontoTotal(group: ParticipanteDetalleForm): number {
    return this.getGroupMontoTarget(group);
  }

  private getEditorParticipanteMontoValidators(esTitular: boolean): ValidatorFn[] {
    const minimumAmount =
      !esTitular && this.isEditingSharedExpenseMode && this.hasZeroBalanceCuotasInEditor
        ? 0
        : (esTitular ? 0 : 0.01);

    return [
      Validators.required,
      Validators.min(minimumAmount),
      this.maxTwoDecimalsValidator(),
    ];
  }

  shouldStartCuotasExpanded(group: ParticipanteDetalleForm): boolean {
    return this.hasZeroBalanceCuotasInEditor || !this.isCuotasTotalValid(group);
  }

  get zeroBalanceConfigGroup(): ParticipanteDetalleForm | null {
    return this.titularDetalleGroup ?? this.getZeroBalanceParticipantGroups()[0] ?? null;
  }

  get shouldShowZeroBalanceGeneralDaySelector(): boolean {
    return (
      this.getZeroBalanceGeneralTipoProgramacion() === 'dia_mes' &&
      this.getZeroBalanceGeneralCuotasCount() > 1
    );
  }

  get canAddZeroBalanceGeneralCuota(): boolean {
    return this.getZeroBalanceParticipantGroups().length > 0;
  }

  getZeroBalanceParticipantGroups(): ParticipanteDetalleForm[] {
    return this.participantesDetalleArray.controls.filter((group) =>
      this.shouldShowTitularSection(group),
    );
  }

  getZeroBalancePeriodIndexes(): number[] {
    const maxCuotas = this.getZeroBalanceParticipantGroups().reduce(
      (max, group) => Math.max(max, this.getCuotasArray(group).length),
      0,
    );

    return Array.from({ length: maxCuotas }, (_value, index) => index);
  }

  getZeroBalanceGeneralCuotasCount(): number {
    return this.getZeroBalancePeriodIndexes().length;
  }

  getZeroBalanceGeneralTipoProgramacion(): ProgramacionCuotaTipo {
    return this.zeroBalanceConfigGroup?.controls.tipo_programacion.value ?? 'ninguna';
  }

  getZeroBalanceGeneralDiaProgramado(): number | null {
    return this.zeroBalanceConfigGroup?.controls.dia_programado.value ?? null;
  }

  getZeroBalanceGroupsForPeriod(periodIndex: number): ParticipanteDetalleForm[] {
    return this.getZeroBalanceParticipantGroups().filter(
      (group) => this.getCuotasArray(group).length > periodIndex,
    );
  }

  getZeroBalancePeriodTotal(periodIndex: number): number {
    return this.centsToAmount(
      this.getZeroBalanceGroupsForPeriod(periodIndex).reduce((sum, group) => {
        const cuotaGroup = this.getCuotasArray(group).at(periodIndex);

        if (!cuotaGroup) {
          return sum;
        }

        return sum + this.toCents(this.getCuotaMontoForPayload(group, cuotaGroup, periodIndex));
      }, 0),
    );
  }

  getZeroBalancePeriodTitle(periodIndex: number): string {
    const isoDate = this.getZeroBalancePeriodDateIso(periodIndex);

    if (!isoDate) {
      return `Mes ${periodIndex + 1}`;
    }

    const formatted = this.monthYearFormatter.format(this.parseIsoDate(isoDate));
    return formatted.charAt(0).toUpperCase() + formatted.slice(1);
  }

  getZeroBalancePeriodDateLabel(periodIndex: number): string {
    return this.getFechaProgramadaDisplay(this.getZeroBalancePeriodDateIso(periodIndex));
  }

  getZeroBalanceParticipantLabel(group: ParticipanteDetalleForm): string {
    return group.controls.es_titular.value
      ? (group.controls.nombre_mostrado.value || this.currentUserDisplayName)
      : (group.controls.nombre_mostrado.value || 'Participante por definir');
  }

  getZeroBalancePeriodParticipantMonto(
    group: ParticipanteDetalleForm,
    periodIndex: number,
  ): number {
    const cuotaGroup = this.getCuotasArray(group).at(periodIndex);
    return this.normalizeDecimalValue(Number(cuotaGroup?.controls.monto.value ?? 0));
  }

  getZeroBalancePeriodParticipantPercentage(
    group: ParticipanteDetalleForm,
    periodIndex: number,
  ): number {
    return this.ensureZeroBalancePeriodPercentages(group)[periodIndex] ?? 0;
  }

  canEditZeroBalancePeriodParticipantMonto(
    group: ParticipanteDetalleForm,
    periodIndex: number,
  ): boolean {
    return this.canEditParticipanteMonto(group) && !this.isCuotaBloqueadaEnEditor(group, periodIndex);
  }

  onZeroBalanceGeneralCuotasInput(event: Event): void {
    const input = event.target as HTMLInputElement | null;
    const rawValue = input?.value ?? '';

    if (!rawValue.trim()) {
      return;
    }

    const normalizedValue = Math.trunc(Number(rawValue));

    if (Number.isNaN(normalizedValue)) {
      return;
    }

    this.applyZeroBalanceGeneralCuotasCount(normalizedValue);
    this.cdr.detectChanges();
  }

  normalizeZeroBalanceGeneralCuotasInput(): void {
    this.applyZeroBalanceGeneralCuotasCount(this.getZeroBalanceGeneralCuotasCount());
  }

  onZeroBalanceGeneralTipoProgramacionChange(event: Event): void {
    const value = (event.target as HTMLSelectElement | null)?.value;
    const tipoProgramacion: ProgramacionCuotaTipo =
      value === 'dia_mes' || value === 'quincenal' || value === 'fin_mes' || value === 'ninguna'
        ? value
        : 'ninguna';

    this.applyZeroBalanceGeneralProgramacionConfig(
      tipoProgramacion,
      this.getZeroBalanceGeneralDiaProgramado(),
    );
  }

  onZeroBalanceGeneralDiaProgramadoChange(event: Event): void {
    const value = Number((event.target as HTMLSelectElement | null)?.value ?? null);
    const diaProgramado = Number.isNaN(value)
      ? this.getDefaultDiaProgramado()
      : this.normalizeDiaProgramado(value);

    this.applyZeroBalanceGeneralProgramacionConfig(
      this.getZeroBalanceGeneralTipoProgramacion(),
      diaProgramado,
    );
  }

  addZeroBalanceGeneralCuota(): void {
    if (!this.canAddZeroBalanceGeneralCuota) {
      return;
    }

    this.applyZeroBalanceGeneralCuotasCount(this.getZeroBalanceGeneralCuotasCount() + 1);
    this.cdr.detectChanges();
  }

  onZeroBalancePeriodMontoInput(periodIndex: number, event?: Event): void {
    const input = event?.target as HTMLInputElement | null;
    const rawValue = input?.value ?? '';

    if (!rawValue.trim()) {
      return;
    }

    const normalizedValue = this.normalizeDecimalValue(Number(rawValue));

    if (Number.isNaN(normalizedValue)) {
      return;
    }

    this.setZeroBalancePeriodTotal(periodIndex, normalizedValue);
  }

  normalizeZeroBalancePeriodMontoInput(periodIndex: number): void {
    this.setZeroBalancePeriodTotal(periodIndex, this.getZeroBalancePeriodTotal(periodIndex));
  }

  onZeroBalancePeriodParticipantMontoInput(
    group: ParticipanteDetalleForm,
    periodIndex: number,
    event?: Event,
  ): void {
    if (!this.canEditZeroBalancePeriodParticipantMonto(group, periodIndex)) {
      return;
    }

    if (this.isMoneyInputPendingDecimal(event)) {
      return;
    }

    const input = event?.target as HTMLInputElement | null;
    const rawValue = input?.value ?? '';

    if (!rawValue.trim()) {
      return;
    }

    const normalizedValue = this.normalizeDecimalValue(Number(rawValue));

    if (Number.isNaN(normalizedValue)) {
      return;
    }

    this.applyZeroBalancePeriodParticipantMonto(group, periodIndex, normalizedValue);
  }

  normalizeZeroBalancePeriodParticipantMontoInput(
    group: ParticipanteDetalleForm,
    periodIndex: number,
  ): void {
    this.applyZeroBalancePeriodParticipantMonto(
      group,
      periodIndex,
      this.getZeroBalancePeriodParticipantMonto(group, periodIndex),
    );
  }

  onZeroBalancePeriodPercentageInput(
    group: ParticipanteDetalleForm,
    periodIndex: number,
    event?: Event,
  ): void {
    const input = event?.target as HTMLInputElement | null;
    const rawValue = input?.value ?? '';

    if (!rawValue.trim()) {
      return;
    }

    const normalizedValue = this.normalizePercentageValue(Number(rawValue));

    if (Number.isNaN(normalizedValue)) {
      return;
    }

    this.applyZeroBalancePeriodPercentage(group, periodIndex, normalizedValue);
  }

  normalizeZeroBalancePeriodPercentageInput(
    group: ParticipanteDetalleForm,
    periodIndex: number,
  ): void {
    this.applyZeroBalancePeriodPercentage(
      group,
      periodIndex,
      this.getZeroBalancePeriodParticipantPercentage(group, periodIndex),
    );
  }

  private resolveDetallePercentageFromMonto(
    transaccionMonto: number,
    detalleMonto: number,
  ): number {
    if (transaccionMonto <= 0) {
      return 0;
    }

    return this.normalizePercentageValue((detalleMonto * 100) / transaccionMonto);
  }

  getParticipantePorcentajeSugerido(group: ParticipanteDetalleForm): number | null {
    const participante = this.getCatalogParticipanteForGroup(group);
    const porcentaje = participante?.porcentaje_participacion;

    if (porcentaje === null || porcentaje === undefined) {
      return null;
    }

    return this.normalizePercentageValue(Number(porcentaje));
  }

  canEditParticipantePorcentaje(group: ParticipanteDetalleForm): boolean {
    if (this.isEditingSharedExpenseMode && group.controls.es_titular.value) {
      return true;
    }

    if (!this.hasAppliedPagosInEditor) {
      return true;
    }

    return this.getCuotasArray(group).controls.some(
      (_cuotaGroup, index) => !this.isCuotaBloqueadaEnEditor(group, index),
    );
  }

  canEditParticipanteMonto(group: ParticipanteDetalleForm): boolean {
    if (this.isEditingSharedExpenseCuotasDesdeFechaProgramadaMode) {
      return false;
    }

    if (!this.hasAppliedPagosInEditor) {
      return true;
    }

    return this.getCuotasArray(group).controls.some(
      (_cuotaGroup, index) => !this.isCuotaBloqueadaEnEditor(group, index),
    );
  }

  private getPorcentajeValidatorsForEditor(): ValidatorFn[] {
    return [Validators.min(0), Validators.max(100), this.maxSixDecimalsValidator()];
  }

  getPaginatedCuotas(group: ParticipanteDetalleForm): CuotaPageItem[] {
    const cuotasArray = this.getCuotasArray(group);
    const currentPage = this.getCuotasCurrentPage(group);
    const startIndex = (currentPage - 1) * this.cuotasPageSize;

    return cuotasArray.controls
      .slice(startIndex, startIndex + this.cuotasPageSize)
      .map((control, offset) => ({
        index: startIndex + offset,
        control,
      }));
  }

  getCuotasCurrentPage(group: ParticipanteDetalleForm): number {
    const totalPages = this.getCuotasTotalPages(group);
    const currentPage = this.cuotasPageByGroup.get(group) ?? 1;
    const normalizedPage = Math.min(Math.max(1, currentPage), totalPages);

    if (normalizedPage !== currentPage) {
      this.cuotasPageByGroup.set(group, normalizedPage);
    }

    return normalizedPage;
  }

  getCuotasTotalPages(group: ParticipanteDetalleForm): number {
    return Math.max(1, Math.ceil(this.getCuotasArray(group).length / this.cuotasPageSize));
  }

  getCuotasPageStart(group: ParticipanteDetalleForm): number {
    const totalCuotas = this.getCuotasArray(group).length;

    if (totalCuotas === 0) {
      return 0;
    }

    return (this.getCuotasCurrentPage(group) - 1) * this.cuotasPageSize + 1;
  }

  getCuotasPageEnd(group: ParticipanteDetalleForm): number {
    return Math.min(
      this.getCuotasCurrentPage(group) * this.cuotasPageSize,
      this.getCuotasArray(group).length,
    );
  }

  changeCuotasPage(group: ParticipanteDetalleForm, delta: number): void {
    const nextPage = Math.min(
      this.getCuotasTotalPages(group),
      Math.max(1, this.getCuotasCurrentPage(group) + delta),
    );

    this.cuotasPageByGroup.set(group, nextPage);
  }

  trackCuotaPageItem(_index: number, item: CuotaPageItem): number {
    return item.index;
  }

  canAddCuotaToParticipante(group: ParticipanteDetalleForm): boolean {
    if (!this.hasAppliedPagosInEditor) {
      return true;
    }

    return this.toCents(this.getGroupMontoTarget(group)) > this.getCuotasBloqueadasTotalCentavos(group);
  }

  addCuotaToParticipante(group: ParticipanteDetalleForm): void {
    if (!this.canAddCuotaToParticipante(group)) {
      return;
    }

    if (this.hasAppliedPagosInEditor) {
      this.appendEditableCuotaForAppliedPayments(group);
      this.cdr.detectChanges();
      return;
    }

    const siguienteCantidad =
      this.normalizeCuotasCountValue(group, group.controls.cantidad_cuotas.value) + 1;

    group.controls.cantidad_cuotas.setValue(siguienteCantidad, { emitEvent: false });
    group.controls.cantidad_cuotas.updateValueAndValidity({ emitEvent: false });
    this.syncCuotasCount(group);
    this.cdr.detectChanges();
  }

  canRemoveCuotaFromParticipante(
    group: ParticipanteDetalleForm,
    cuotaIndex: number,
  ): boolean {
    const cuotasArray = this.getCuotasArray(group);

    if (cuotasArray.length === 0 || this.isCuotaBloqueadaEnEditor(group, cuotaIndex)) {
      return false;
    }

    return cuotasArray.length - 1 >= this.getMinimumCuotasAllowedForGroup(group);
  }

  removeCuotaFromParticipante(
    group: ParticipanteDetalleForm,
    cuotaIndex: number,
  ): void {
    if (!this.canRemoveCuotaFromParticipante(group, cuotaIndex)) {
      return;
    }

    const cuotasActualizadas = this.buildCuotasAfterRemovingIndex(group, cuotaIndex);

    group.controls.cantidad_cuotas.setValue(cuotasActualizadas.length, { emitEvent: false });
    group.controls.cantidad_cuotas.updateValueAndValidity({ emitEvent: false });
    this.replaceCuotasArray(group, cuotasActualizadas);
    this.ensureProgramacionConfig(group);
    this.refreshProgramacionCuotas(group);
    this.cdr.detectChanges();
  }

  clearTitularCuota(group: ParticipanteDetalleForm): void {
    if (!this.canRemoveTitularCuota(group)) {
      return;
    }

    const montoParticipantes = this.normalizeDecimalValue(
      this.getAdditionalParticipants().reduce(
        (sum, participanteGroup) => sum + this.getGroupMontoTarget(participanteGroup),
        0,
      ),
    );

    group.controls.porcentaje.setValue(0, { emitEvent: false });
    group.controls.porcentaje.updateValueAndValidity({ emitEvent: false });
    group.controls.monto.setValue(0, { emitEvent: false });
    group.controls.monto.updateValueAndValidity({ emitEvent: false });
    group.controls.cantidad_cuotas.setValue(0, { emitEvent: false });
    group.controls.cantidad_cuotas.updateValueAndValidity({ emitEvent: false });
    this.transaccionForm.controls.monto.setValue(montoParticipantes, { emitEvent: false });
    this.transaccionForm.controls.monto.updateValueAndValidity({ emitEvent: false });
    this.markGroupAmountAsManual(group);
    this.titularSectionDismissed = true;
    this.syncCuotasCount(group);
    this.applyDismissedTitularDefaultShare();
    this.refreshEstadoTransaccionForEdit();
  }

  get pagosDetalleArray(): FormArray<PagoDetalleForm> {
    return this.aplicarPagosForm.get('pagos_detalle') as FormArray<PagoDetalleForm>;
  }

  get pagosDetalleControls(): PagoDetalleForm[] {
    return this.pagosDetalleArray.controls;
  }

  get titularDetalleGroup(): ParticipanteDetalleForm | null {
    return (
      this.participantesDetalleArray.controls.find(
        (group) => group.controls.es_titular.value,
      ) ?? null
    );
  }

  isParticipanteAsociado(
    participante: Pick<CatalogoParticipante, 'id_usuario_relacionado' | 'id_usuario_titular'> | null | undefined,
  ): boolean {
    return Boolean(
      participante?.id_usuario_relacionado ?? participante?.id_usuario_titular ?? null,
    );
  }

  getParticipanteDisplayName(
    participante: Pick<
      CatalogoParticipante,
      'nombre_participante' | 'id_usuario_relacionado' | 'id_usuario_titular'
    >,
  ): string {
    return this.isParticipanteAsociado(participante)
      ? `${participante.nombre_participante} ★`
      : participante.nombre_participante;
  }

  isDetalleParticipanteAsociado(detalle: ParticipanteDetalleListado): boolean {
    if (detalle.es_titular) {
      return true;
    }

    if (detalle.id_usuario_relacionado !== null && detalle.id_usuario_relacionado !== undefined) {
      return true;
    }

    const participante =
      this.participantes.find(
        (item) => item.id_participante === detalle.id_participante,
      ) ?? null;

    return this.isParticipanteAsociado(participante);
  }

  get currentUserParticipante(): CatalogoParticipante | null {
    const candidateNames = [
      this.currentUserProfileValue.fullName,
      this.currentUserProfileValue.username,
    ]
      .filter((value): value is string => Boolean(value?.trim()))
      .map((value) => this.normalizeText(value));

    const linkedParticipante =
      this.participantes.find(
        (participante) => participante.id_usuario_titular === this.currentUserIdValue,
      ) ?? null;

    if (linkedParticipante) {
      return linkedParticipante;
    }

    return (
      this.participantes.find(
        (participante) =>
          participante.id_usuario === this.currentUserIdValue &&
          candidateNames.includes(this.normalizeText(participante.nombre_participante)),
      ) ??
      this.participantes.find(
        (participante) => participante.id_usuario === this.currentUserIdValue,
      ) ??
      null
    );
  }

  get selectableParticipantes(): CatalogoParticipante[] {
    const currentUserParticipanteId = this.currentUserParticipante?.id_participante ?? null;

    return this.participantes.filter(
      (participante) => participante.id_participante !== currentUserParticipanteId,
    );
  }

  private buildQuickPayParticipantesFiltro(): CatalogoParticipante[] {
    return [...this.participantes].sort((left, right) =>
      this.getParticipanteDisplayName(left).localeCompare(this.getParticipanteDisplayName(right)),
    );
  }

  get filteredSubcategorias(): CatalogoSubcategoria[] {
    const categoriaId = this.transaccionForm.controls.id_categoria.value;

    if (!categoriaId) {
      return [];
    }

    return this.subcategorias
      .filter((item) => item.id_categoria === categoriaId)
      .sort((a, b) => a.nombre_subcategoria.localeCompare(b.nombre_subcategoria));
  }

  async loadInitialData(): Promise<void> {
    await this.loadCatalogos(true);
    const resolvedUserId = await this.catalogosService.syncCurrentUserId();
    await this.loadTransacciones(resolvedUserId);
    this.syncSelectedTransaccionWithFilters();
  }

  async loadCatalogos(forceRefresh = false): Promise<void> {
    this.loadingCatalogos = true;

    try {
      const catalogos = await this.catalogosService.loadCatalogos(forceRefresh);

      this.formasPago = catalogos.formasPago
        .filter((item) => item.estado)
        .sort((a, b) => a.nombre_forma.localeCompare(b.nombre_forma));
      this.entidadesFinancieras = catalogos.entidadesFinancieras.filter(
        (item) => item.estado,
      );
      this.tiposEntidad = catalogos.tiposEntidad.filter(
        (item) => item.estado,
      );
      this.participantes = catalogos.participantes.filter(
        (item) => (item.estado ?? 'ACTIVO') === 'ACTIVO',
      );
      this.quickPayParticipantesFiltro = this.buildQuickPayParticipantesFiltro();
      this.categorias = catalogos.categorias
        .filter((item) => item.estado)
        .sort((a, b) => a.nombre_categoria.localeCompare(b.nombre_categoria));
      this.subcategorias = catalogos.subcategorias.filter(
        (item) => item.estado,
      );
      this.refreshFilteredSubcategoriasFiltro();
      this.estadosTransaccion = catalogos.estadosTransaccion.filter(
        (item) => item.estado === 'ACTIVO' && item.flag?.trim().toUpperCase() === 'T',
      );
      this.syncFiltroSubcategoriaSelection();
      this.syncQuickPayParticipantFilterDefault();
      this.onFormaPagoChange();
      this.onCategoriaChange();
    } catch {
      this.errorMessage = 'No se pudieron cargar los catalogos de transacciones.';
    } finally {
      this.loadingCatalogos = false;
      this.cdr.detectChanges();
    }
  }

  async loadTransacciones(userId = this.currentUserIdValue): Promise<void> {
    this.loading = true;
    this.errorMessage = '';

    try {
      const transacciones = await firstValueFrom(
        this.http
          .get<TransaccionListado[]>(this.apiUrl, {
            params: { id_usuario: userId },
          })
          .pipe(timeout(10000)),
      );
      this.transacciones = transacciones.map((transaccion) => ({
        ...transaccion,
        fecha: this.normalizeDateOnly(transaccion.fecha),
        participantes_detalle: this.getParticipantesDetalleSafe(transaccion),
      }));
      this.syncSelectedTransaccionWithFilters();
      this.refreshQuickPayFilterState(true);
    } catch (error) {
      this.transacciones = [];
      this.refreshQuickPayFilterState(true);
      this.clearSelection(false);
      this.errorMessage = this.getErrorMessage(
        error,
        'No se pudo cargar el listado de transacciones.',
      );
      await this.alerts.error('Error al cargar', this.errorMessage);
    } finally {
      this.loading = false;
      this.cdr.detectChanges();
    }
  }

  async reloadAll(): Promise<void> {
    await this.loadCatalogos(true);
    const resolvedUserId = await this.catalogosService.syncCurrentUserId();
    await this.loadTransacciones(resolvedUserId);
    this.syncSelectedTransaccionWithFilters();
  }

  async calcularIntereses(): Promise<void> {
    if (this.calculatingIntereses) {
      return;
    }

    this.calculatingIntereses = true;
    this.errorMessage = '';
    this.successMessage = '';

    try {
      const result = await firstValueFrom(
        this.http
          .post<CalculoInteresesResponse>(this.interesesApiUrl, {})
          .pipe(timeout(20000)),
      );

      const successText = this.buildCalculoInteresesSuccessMessage(result);
      this.successMessage = successText;
      await this.alerts.success('Intereses calculados', successText);

      const resolvedUserId = await this.catalogosService.syncCurrentUserId();
      await this.loadTransacciones(resolvedUserId);
    } catch (error) {
      this.errorMessage = this.getErrorMessage(
        error,
        'No se pudieron calcular los intereses diarios.',
      );
      await this.alerts.error('No se pudo calcular', this.errorMessage);
    } finally {
      this.calculatingIntereses = false;
      this.cdr.detectChanges();
    }
  }

  clearFiltros(): void {
    this.resetDefaultFilters();
  }

  toggleAdvancedFilters(): void {
    this.showAdvancedFilters = !this.showAdvancedFilters;
  }

  toggleQuickPayFiltersCollapsed(): void {
    this.quickPayFiltersCollapsed = !this.quickPayFiltersCollapsed;
    try {
      window.sessionStorage.setItem(QUICK_PAY_FILTERS_COLLAPSED_KEY, String(this.quickPayFiltersCollapsed));
    } catch { /* Ignore storage errors */ }
  }

  onSoloHoyToggle(event: Event): void {
    const checked = (event.target as HTMLInputElement | null)?.checked ?? false;

    if (checked) {
      this.applyTodayQuickFilter();
      return;
    }

    this.syncQuickFilterFlagsWithRange();
  }

  onMesActualToggle(event: Event): void {
    const checked = (event.target as HTMLInputElement | null)?.checked ?? false;

    if (checked) {
      this.applyCurrentMonthQuickFilter();
      return;
    }

    if (this.isDetalleViewMode) {
      this.clearDetalleDateQuickFilters();
      return;
    }

    this.syncQuickFilterFlagsWithRange();
  }

  onPrioritariosToggle(event: Event): void {
    const checked = (event.target as HTMLInputElement | null)?.checked ?? false;
    this.setQuickPayScheduleFilterState('prioritarios', checked);
  }

  onVencidosToggle(event: Event): void {
    const checked = (event.target as HTMLInputElement | null)?.checked ?? false;
    this.setQuickPayScheduleFilterState('vencidos', checked);
  }

  onTodosToggle(event: Event): void {
    const checked = (event.target as HTMLInputElement | null)?.checked ?? false;

    if (checked) {
      this.applyAllListadoQuickFilter();
    }
  }

  onFiltroFechaInput(controlName: FiltroDateControlName, event: Event): void {
    this.handleDateInput(this.getFiltroDateControl(controlName), event);
  }

  onFiltroFechaBlur(controlName: FiltroDateControlName): void {
    const isValid = this.normalizeAndValidateDateControl(
      this.getFiltroDateControl(controlName),
    );

    if (isValid) {
      this.syncQuickFilterFlagsWithRange();
    }
  }

  onFiltroFechaPaste(controlName: FiltroDateControlName, event: ClipboardEvent): void {
    this.handleDatePaste(this.getFiltroDateControl(controlName), event);
  }

  onFiltroFechaCalendarChange(
    controlName: FiltroDateControlName,
    event: Event,
  ): void {
    this.handleDateCalendarChange(this.getFiltroDateControl(controlName), event);
    this.syncQuickFilterFlagsWithRange();
  }

  onFechaTransaccionInput(event: Event): void {
    this.handleDateInput(this.transaccionForm.controls.fecha_transaccion, event);
  }

  onFechaTransaccionBlur(): void {
    const isValid = this.normalizeAndValidateDateControl(this.transaccionForm.controls.fecha_transaccion);

    if (isValid) {
      this.refreshProgramacionForAllGroups(true);
    }
  }

  onFechaTransaccionPaste(event: ClipboardEvent): void {
    this.handleDatePaste(this.transaccionForm.controls.fecha_transaccion, event);
  }

  onFechaTransaccionCalendarChange(event: Event): void {
    this.handleDateCalendarChange(this.transaccionForm.controls.fecha_transaccion, event);
    this.refreshProgramacionForAllGroups(true);
  }

  openNativeDatePicker(input: HTMLInputElement): void {
    if (typeof input.showPicker === 'function') {
      input.showPicker();
      return;
    }

    input.click();
  }

  editTransaccion(transaccion: TransaccionListado): void {
    if (!this.canEditTransaccion(transaccion)) {
      return;
    }

    void this.openEditModal(transaccion);
  }

  editTransaccionFromAction(transaccion: TransaccionListado, event?: Event): void {
    event?.stopPropagation();

    if (!this.canEditTransaccion(transaccion)) {
      return;
    }

    void this.openEditModal(transaccion);
  }

  async openPaymentModal(
    transaccion: TransaccionListado,
    event?: Event,
    detallesOverride?: ParticipanteDetalleListado[],
  ): Promise<void> {
    event?.preventDefault();
    event?.stopPropagation();
    if (!this.canPagarTransaccion(transaccion)) {
      return;
    }

    try {
      const transaccionParaPago = this.buildPaymentModalTransaccion(transaccion, detallesOverride);
      this.editModalOpen = false;
      this.paymentTransaccionId = transaccion.id_transaccion;
      this.paymentModalTransaccion = transaccionParaPago;
      this.loadTransaccionIntoEditor(transaccionParaPago, false);
      this.paymentModalOpenedAt = Date.now();
      setTimeout(() => {
        this.paymentModalOpen = true;
        this.cdr.detectChanges();
      });
    } catch (error) {
      console.error('Error opening payment modal', error);
      this.errorMessage = 'No se pudieron cargar los datos de la transaccion para pagar.';
      await this.alerts.error('No se pudo abrir pago', this.errorMessage);
    }
  }

  async openPaymentModalForDetalle(
    row: DetalleTransaccionListadoRow,
    event?: Event,
  ): Promise<void> {
    event?.preventDefault();
    event?.stopPropagation();

    if (!this.canPagarDetalle(row)) {
      return;
    }

    try {
      const transaccionParaPago = this.buildPaymentModalTransaccion(
        row.transaccion,
        [row.detalle],
      );
      this.editModalOpen = false;
      this.paymentTransaccionId = row.transaccion.id_transaccion;
      this.paymentModalTransaccion = transaccionParaPago;
      this.loadTransaccionIntoEditor(transaccionParaPago, false);
      this.paymentModalOpenedAt = Date.now();
      setTimeout(() => {
        this.paymentModalOpen = true;
        this.cdr.detectChanges();
      });
    } catch (error) {
      console.error('Error opening detail payment modal', error);
      this.errorMessage = 'No se pudieron cargar los datos del detalle para pagar.';
      await this.alerts.error('No se pudo abrir pago', this.errorMessage);
    }
  }

  openDetailModal(transaccion: TransaccionListado, event?: Event): void {
    event?.stopPropagation();
    this.detailModalTransaccion = this.buildDetailModalTransaccion(transaccion);
    this.detailModalCuotasPage = 1;
    this.detailExpandedParticipanteIds = new Set();

    firstValueFrom(
      this.http
        .get<TransaccionListado>(`${this.apiUrl}/${transaccion.id_transaccion}`)
        .pipe(timeout(10000)),
    )
      .then((full) => {
        if (
          this.detailModalTransaccion?.id_transaccion === transaccion.id_transaccion &&
          full &&
          Array.isArray(full.participantes_detalle)
        ) {
          this.detailModalTransaccion = this.buildDetailModalTransaccion({
            ...transaccion,
            participantes_detalle: full.participantes_detalle,
          });
          this.cdr.detectChanges();
        }
      })
      .catch(() => { /* mantiene datos existentes si falla */ });
  }

  closeDetailModal(): void {
    this.detailModalTransaccion = null;
    this.detailModalCuotasPage = 1;
  }

  canPagarTransaccion(transaccion: TransaccionListado): boolean {
    if (this.isAnuladaTransaccion(transaccion)) {
      return false;
    }

    return this.getParticipantesDetalleForPayment(transaccion).some(
      (detalle) =>
        detalle.id_estado !== ESTADO_TRANSACCION_ANULADA_ID &&
        this.toCents(Number(detalle.saldo_pendiente ?? 0)) > 0,
    );
  }

  canPagarDetalle(row: DetalleTransaccionListadoRow): boolean {
    return row.quickPayCanPagar;
  }

  canSelectQuickPayDetalle(row: DetalleTransaccionListadoRow): boolean {
    return this.canSelectQuickPayDetalleForMethod(row, this.quickPayBulkSelectedMetodoPagoIdCache);
  }

  isQuickPayDetalleSelected(row: DetalleTransaccionListadoRow): boolean {
    return row.quickPaySelected;
  }

  isQuickPayDetalleSelectionDisabled(row: DetalleTransaccionListadoRow): boolean {
    return row.quickPaySelectionDisabled;
  }

  getQuickPayDetalleSelectionHint(row: DetalleTransaccionListadoRow): string {
    return row.quickPaySelectionHint;
  }

  private getQuickPayDetalleSelectionHintText(
    row: DetalleTransaccionListadoRow,
    selectedMetodoPagoNombre: string,
  ): string {
    if (!this.canPagarDetalle(row)) {
      return 'La cuota ya no tiene saldo pendiente para pagar.';
    }

    if (!this.hasQuickPayMetodoPagoValido(row)) {
      return 'La cuota no tiene un metodo de pago valido para usar pago masivo.';
    }

    if (!this.isDetalleDelUsuarioLogueado(row.detalle, row.transaccion.es_propietario)) {
      return 'Solo puedes incluir pagos que pertenezcan al usuario logueado.';
    }

    if (!this.isQuickPayMetodoPagoCompatible(row)) {
      return `Solo puedes combinar cuotas del mismo metodo de pago (${selectedMetodoPagoNombre}).`;
    }

    return 'Seleccionar para pago masivo.';
  }

  onQuickPayDetalleSelectionChange(
    row: DetalleTransaccionListadoRow,
    event: Event,
  ): void {
    const checked = (event.target as HTMLInputElement).checked;

    if (!checked) {
      this.selectedQuickPayDetalleIds.delete(row.detalle.id);
      this.refreshQuickPaySelectionState();
      return;
    }

    if (this.isQuickPayDetalleSelectionDisabled(row)) {
      (event.target as HTMLInputElement).checked = false;
      return;
    }

    this.selectedQuickPayDetalleIds.add(row.detalle.id);
    this.refreshQuickPaySelectionState();
  }

  clearQuickPayBulkSelection(): void {
    this.selectedQuickPayDetalleIds.clear();
    this.refreshQuickPaySelectionState();
  }

  async applyQuickPayBulkSelection(): Promise<void> {
    if (!this.canApplyQuickPayBulk) {
      return;
    }

    const selectedRows = this.quickPayBulkSelectedRows.filter((row) =>
      this.canSelectQuickPayDetalle(row),
    );

    if (selectedRows.length === 0) {
      this.clearQuickPayBulkSelection();
      await this.alerts.warning(
        'Sin pagos seleccionados',
        'Selecciona al menos una cuota valida del usuario logueado para aplicar el pago masivo.',
      );
      return;
    }

    if (this.hasMixedQuickPayBulkMethods(selectedRows)) {
      await this.alerts.warning(
        'Metodos de pago incompatibles',
        'El pago masivo en Pago Rapido solo permite cuotas del mismo metodo de pago.',
      );
      return;
    }

    const totalCancelado = this.roundMoneyValue(
      selectedRows.reduce((sum, row) => sum + Number(row.detalle.saldo_pendiente ?? 0), 0),
    );
    const confirmed = await this.alerts.confirm(
      'Confirmar pagos masivos',
      `Se marcaran ${selectedRows.length} cuotas como pagadas por un total de $${totalCancelado.toFixed(2)} con la fecha actual. Deseas continuar?`,
      'Pagar lo seleccionado',
      {
        icon: 'warning',
        confirmButtonColor: '#1f7a46',
      },
    );

    if (!confirmed) {
      return;
    }

    this.applyingBulkQuickPayments = true;
    this.refreshQuickPaySelectionState();
    this.errorMessage = '';
    this.successMessage = '';

    try {
      await firstValueFrom(
        this.http
          .patch(
            `${this.apiUrl}/aplicar-pagos-masivos`,
            {
              ids_detalle: selectedRows.map((row) => row.detalle.id),
            },
            {
              params: { id_usuario: this.currentUserIdValue },
            },
          )
          .pipe(timeout(10000)),
      );

      this.clearQuickPayBulkSelection();
      await this.loadTransacciones();
      this.successMessage = `Se marcaron ${selectedRows.length} cuotas como pagadas por $${totalCancelado.toFixed(2)}. El detalle se actualizo correctamente.`;
      await this.alerts.success('Pagos aplicados', this.successMessage);
    } catch (error) {
      this.clearQuickPayBulkSelection();
      await this.loadTransacciones();
      this.errorMessage = this.getErrorMessage(
        error,
        'No se pudieron aplicar los pagos seleccionados.',
      );
      await this.alerts.error('No se pudieron aplicar los pagos', this.errorMessage);
    } finally {
      this.applyingBulkQuickPayments = false;
      this.refreshQuickPaySelectionState();
    }
  }

  canEditTransaccion(transaccion: TransaccionListado): boolean {
    return transaccion.es_propietario;
  }

  canAnularTransaccion(transaccion: TransaccionListado): boolean {
    return transaccion.es_propietario && !this.isAnuladaTransaccion(transaccion);
  }

  canReactivarTransaccion(transaccion: TransaccionListado): boolean {
    return transaccion.es_propietario && this.isAnuladaTransaccion(transaccion);
  }

  isCreditoTransaccion(
    transaccion: Pick<TransaccionListado, 'id_tipo_transaccion' | 'nombre_tipo_transaccion'>,
  ): boolean {
    return this.resolveTipoTransaccion(transaccion) === 'credito';
  }

  isAnuladaTransaccion(transaccion: TransaccionListado): boolean {
    return this.getNormalizedEstadoListado(transaccion.nombre_estado ?? '') === 'anulado';
  }

  async anularTransaccion(
    transaccion: TransaccionListado,
    event?: Event,
  ): Promise<void> {
    event?.stopPropagation();

    if (!this.canAnularTransaccion(transaccion)) {
      return;
    }

    const confirmed = await this.alerts.confirm(
      'Confirmar anulacion',
      `Se anulara la transaccion ${this.getTransaccionAnularLabel(transaccion)}. Todas las cuotas quedaran ANULADO y se limpiaran los pagos aplicados.`,
      'Si, anular',
      {
        icon: 'warning',
        confirmButtonColor: '#dc2626',
      },
    );

    if (!confirmed) {
      return;
    }

    this.successMessage = '';
    this.errorMessage = '';
    this.completingId = transaccion.id_transaccion;

    try {
      await firstValueFrom(
        this.http
          .patch(
            `${this.apiUrl}/${transaccion.id_transaccion}/anular`,
            {},
            {
              params: { id_usuario: this.currentUserIdValue },
            },
          )
          .pipe(timeout(10000)),
      );

      if (this.detailModalTransaccion?.id_transaccion === transaccion.id_transaccion) {
        this.closeDetailModal();
      }

      if (
        this.paymentModalOpen &&
        this.paymentModalTransaccion?.id_transaccion === transaccion.id_transaccion
      ) {
        this.closePaymentModal();
      }

      this.successMessage = 'Transaccion anulada correctamente.';
      await this.alerts.success('Transaccion anulada', this.successMessage);
      await this.loadTransacciones();
    } catch (error) {
      this.errorMessage = this.getErrorMessage(
        error,
        'No se pudo anular la transaccion.',
      );
      await this.alerts.error('No se pudo anular', this.errorMessage);
    } finally {
      this.completingId = null;
    }
  }

  async reactivarTransaccion(
    transaccion: TransaccionListado,
    event?: Event,
  ): Promise<void> {
    event?.stopPropagation();

    if (!this.canReactivarTransaccion(transaccion)) {
      return;
    }

    const confirmed = await this.alerts.confirm(
      'Confirmar cambio a pendiente',
      `La transaccion "${transaccion.nombre_forma_pago || `#${transaccion.id_transaccion}`}" volvera a PENDIENTE. Todas las cuotas se reactivaran y se limpiaran los pagos aplicados.`,
      'Si, dejar pendiente',
      {
        icon: 'question',
        confirmButtonColor: '#1f7a46',
      },
    );

    if (!confirmed) {
      return;
    }

    this.successMessage = '';
    this.errorMessage = '';
    this.completingId = transaccion.id_transaccion;

    try {
      await firstValueFrom(
        this.http
          .patch(
            `${this.apiUrl}/${transaccion.id_transaccion}/reactivar`,
            {},
            {
              params: { id_usuario: this.currentUserIdValue },
            },
          )
          .pipe(timeout(10000)),
      );

      if (this.detailModalTransaccion?.id_transaccion === transaccion.id_transaccion) {
        this.closeDetailModal();
      }

      if (
        this.paymentModalOpen &&
        this.paymentModalTransaccion?.id_transaccion === transaccion.id_transaccion
      ) {
        this.closePaymentModal();
      }

      this.successMessage = 'Transaccion actualizada a pendiente correctamente.';
      await this.alerts.success('Transaccion en pendiente', this.successMessage);
      await this.loadTransacciones();
    } catch (error) {
      this.errorMessage = this.getErrorMessage(
        error,
        'No se pudo dejar la transaccion en pendiente.',
      );
      await this.alerts.error('No se pudo actualizar', this.errorMessage);
    } finally {
      this.completingId = null;
    }
  }

  closePaymentModal(): void {
    this.paymentModalOpen = false;
    this.paymentTransaccionId = null;
    this.paymentModalTransaccion = null;
    this.paymentModalOpenedAt = 0;
    this.applyingFullPayment = false;
    this.applyingPaymentDetailId = null;
    this.applyingPaymentGroupId = null;
    this.montoAplicarDrafts = {};
    this.cameFromDashboardReminder = false;
    this.refreshPagosDetalleGroups();
  }

  dismissPaymentModal(): void {
    const shouldReturnToDashboard = this.cameFromDashboardReminder;
    this.closePaymentModal();

    if (shouldReturnToDashboard) {
      void this.router.navigate(['/dashboard']);
    }
  }

  onPaymentBackdropClick(event: MouseEvent): void {
    if (event.target !== event.currentTarget) {
      return;
    }

    if (Date.now() - this.paymentModalOpenedAt < 150) {
      return;
    }

    this.dismissPaymentModal();
  }

  closeEditModal(): void {
    this.clearSelection(false);
  }

  cancelEdit(): void {
    this.closeEditModal();
  }

  completeSelectedRegistro(): void {
    if (!this.selectedTransaccion) {
      return;
    }

    void this.completeRegistro(this.selectedTransaccion);
  }

  setFullPago(group: PagoDetalleForm): void {
    if (this.toCents(group.controls.saldo_pendiente.value) <= 0) {
      return;
    }

    this.setMontoAplicarValue(
      group,
      this.formatMoneyInputValue(group.controls.saldo_pendiente.value),
    );
  }

  clearPago(group: PagoDetalleForm): void {
    this.setMontoAplicarValue(group, null);
  }

  isApplyingPago(group: PagoDetalleForm): boolean {
    return this.applyingPaymentDetailId === group.controls.id_detalle.value;
  }

  isApplyingPagoGroup(group: PagoDetalleGroupView): boolean {
    return this.applyingPaymentGroupId === group.id_participante;
  }

  canApplyPago(group: PagoDetalleForm): boolean {
    if (
      this.toCents(group.controls.saldo_pendiente.value) <= 0 ||
      this.applyingFullPayment ||
      this.applyingPaymentDetailId !== null ||
      this.applyingPaymentGroupId !== null
    ) {
      return false;
    }

    const montoAplicar = this.getMontoAplicarNumericValue(group);

    return (
      !Number.isNaN(montoAplicar) &&
      this.toCents(montoAplicar) > 0 &&
      this.toCents(montoAplicar) <= this.toCents(group.controls.saldo_pendiente.value)
    );
  }

  canApplyPagoGroup(group: PagoDetalleGroupView): boolean {
    if (
      this.applyingFullPayment ||
      this.applyingPaymentDetailId !== null ||
      this.applyingPaymentGroupId !== null
    ) {
      return false;
    }

    return group.cuotas.some((cuota) => this.canApplyPago(cuota));
  }

  normalizePagoAplicarInput(group: PagoDetalleForm): void {
    const sanitizedValue = this.sanitizeMoneyInputValue(this.getMontoAplicarDisplay(group));

    if (sanitizedValue === '') {
      this.setMontoAplicarValue(group, null);
      return;
    }

    const normalizedValue = this.normalizeDecimalValue(Number(sanitizedValue));

    if (Number.isNaN(normalizedValue)) {
      return;
    }

    const montoAcotado = Math.min(normalizedValue, group.controls.saldo_pendiente.value);
    this.setMontoAplicarValue(group, this.formatMoneyInputValue(montoAcotado));
  }

  getMontoAplicarDisplay(group: PagoDetalleForm): string {
    return this.montoAplicarDrafts[group.controls.id_detalle.value] ?? '';
  }

  onMontoAplicarDraftChange(value: string, group: PagoDetalleForm): void {
    const sanitizedValue = this.sanitizeMoneyInputValue(value);
    this.setMontoAplicarValue(group, sanitizedValue === '' ? null : sanitizedValue);
  }

  normalizeMontoCuotaInput(
    paymentGroup: PagoDetalleGroupView,
    cuotaGroup: PagoDetalleForm,
  ): void {
    if (this.toCents(cuotaGroup.controls.saldo_pendiente.value) <= 0) {
      return;
    }

    const editableCuotas = paymentGroup.cuotas.filter(
      (cuota) => this.toCents(cuota.controls.saldo_pendiente.value) > 0,
    );

    if (editableCuotas.length === 0) {
      return;
    }

    if (!editableCuotas.includes(cuotaGroup)) {
      return;
    }

    const otherCuotas = editableCuotas.filter((cuota) => cuota !== cuotaGroup);
    const totalEditableCentavos = editableCuotas.reduce(
      (sum, cuota) => sum + this.toCents(cuota.controls.monto_cuota.value),
      0,
    );
    const minimumCurrentCuota = this.getEditableCuotaMinimumCents(cuotaGroup);
    const minimumsOtherCuotas = otherCuotas.map((cuota) =>
      this.getEditableCuotaMinimumCents(cuota),
    );
    const maxCurrentCuota =
      totalEditableCentavos -
      minimumsOtherCuotas.reduce((sum, minimum) => sum + minimum, 0);
    const desiredCuotaCentavos = Math.min(
      Math.max(
        this.toCents(
          this.normalizeDecimalValue(Number(cuotaGroup.controls.monto_cuota.value ?? 0)),
        ),
        minimumCurrentCuota,
      ),
      maxCurrentCuota,
    );
    const remainingCentavos = totalEditableCentavos - desiredCuotaCentavos;
    const redistributedOtherCuotas = this.distributeCentavosWithMinimums(
      remainingCentavos,
      minimumsOtherCuotas,
    );

    this.updateMontoCuotaState(
      cuotaGroup,
      this.centsToAmount(desiredCuotaCentavos),
    );

    otherCuotas.forEach((cuota, index) => {
      this.updateMontoCuotaState(
        cuota,
        this.centsToAmount(redistributedOtherCuotas[index] ?? 0),
      );
    });
  }

  setFullPagoGroup(group: PagoDetalleGroupView): void {
    group.cuotas.forEach((cuota) => {
      if (this.toCents(cuota.controls.saldo_pendiente.value) <= 0) {
        return;
      }

      this.setMontoAplicarValue(
        cuota,
        this.formatMoneyInputValue(cuota.controls.saldo_pendiente.value),
      );
    });
  }

  clearPagoGroup(group: PagoDetalleGroupView): void {
    group.cuotas.forEach((cuota) => {
      if (this.toCents(cuota.controls.saldo_pendiente.value) <= 0) {
        return;
      }

      this.setMontoAplicarValue(cuota, null);
    });
  }

  async applyPagoDetalle(group: PagoDetalleForm): Promise<void> {
    if (!this.isEditing || this.editingTransaccionId === null) {
      return;
    }

    if (this.toCents(group.controls.saldo_pendiente.value) <= 0) {
      return;
    }

    this.normalizePagoAplicarInput(group);
    group.controls.monto_aplicar.markAsTouched();
    group.controls.monto_aplicar.updateValueAndValidity({ emitEvent: false });

    const montoAplicar = this.getMontoAplicarNumericValue(group);

    if (this.toCents(montoAplicar) <= 0) {
      await this.alerts.warning(
        'Monto requerido',
        `Ingresa un monto valido para aplicar el pago de ${group.controls.nombre_mostrado.value}.`,
      );
      return;
    }

    if (
      this.toCents(montoAplicar) > this.toCents(group.controls.saldo_pendiente.value)
    ) {
      await this.alerts.warning(
        'Monto invalido',
        `El monto a pagar de ${group.controls.nombre_mostrado.value} no puede ser mayor al saldo pendiente.`,
      );
      return;
    }

    const partialSplitConfirmed = await this.confirmPartialSplitIfNeeded([
      {
        nombre: group.controls.nombre_mostrado.value,
        montoAplicar,
        saldoPendiente: group.controls.saldo_pendiente.value,
      },
    ]);

    if (!partialSplitConfirmed) {
      return;
    }

    const payload: ApplyPagosPayload = {
      pagos: [
        {
          id_detalle: group.controls.id_detalle.value,
          monto: montoAplicar,
        },
      ],
    };

    this.applyingPaymentDetailId = group.controls.id_detalle.value;

    try {
      await this.applyPagosToCurrentTransaction(
        payload,
        this.buildPagoSuccessMessage([
          {
            nombre: group.controls.nombre_mostrado.value,
            montoAplicar,
            saldoPendiente: group.controls.saldo_pendiente.value,
          },
        ]),
        'No se pudo aplicar el pago de este item.',
      );
    } catch (error) {
      this.errorMessage = this.getErrorMessage(
        error,
        'No se pudo aplicar el pago de este item.',
      );
      await this.alerts.error('No se pudo aplicar el pago', this.errorMessage);
    } finally {
      this.applyingPaymentDetailId = null;
    }
  }

  async applyPagosGroup(group: PagoDetalleGroupView): Promise<void> {
    if (!this.isEditing || this.editingTransaccionId === null) {
      return;
    }

    const pagosConContexto = group.cuotas
      .map((cuota) => {
        this.normalizePagoAplicarInput(cuota);
        const montoAplicar = this.getMontoAplicarNumericValue(cuota);

        if (
          Number.isNaN(montoAplicar) ||
          this.toCents(montoAplicar) <= 0 ||
          this.toCents(montoAplicar) > this.toCents(cuota.controls.saldo_pendiente.value)
        ) {
          return null;
        }

        return {
          id_detalle: cuota.controls.id_detalle.value,
          monto: montoAplicar,
          nombre: cuota.controls.nombre_mostrado.value,
          saldoPendiente: cuota.controls.saldo_pendiente.value,
        };
      })
      .filter(
        (
          pago,
        ): pago is {
          id_detalle: number;
          monto: number;
          nombre: string;
          saldoPendiente: number;
        } => pago !== null,
      );

    if (pagosConContexto.length === 0) {
      await this.alerts.warning(
        'Sin pagos capturados',
        `Ingresa al menos un monto valido para ${group.nombre_mostrado}.`,
      );
      return;
    }

    const partialSplitConfirmed = await this.confirmPartialSplitIfNeeded(
      pagosConContexto.map((pago) => ({
        nombre: pago.nombre,
        montoAplicar: pago.monto,
        saldoPendiente: pago.saldoPendiente,
      })),
    );

    if (!partialSplitConfirmed) {
      return;
    }

    const pagos = pagosConContexto.map(({ id_detalle, monto }) => ({
      id_detalle,
      monto,
    }));

    this.applyingPaymentGroupId = group.id_participante;

    try {
      await this.applyPagosToCurrentTransaction(
        { pagos },
        this.buildPagoSuccessMessage(
          pagosConContexto.map((pago) => ({
            nombre: pago.nombre,
            montoAplicar: pago.monto,
            saldoPendiente: pago.saldoPendiente,
          })),
        ),
        'No se pudieron aplicar los pagos capturados.',
      );
    } catch (error) {
      this.errorMessage = this.getErrorMessage(
        error,
        'No se pudieron aplicar los pagos capturados.',
      );
      await this.alerts.error('No se pudieron aplicar los pagos', this.errorMessage);
    } finally {
      this.applyingPaymentGroupId = null;
    }
  }

  async applyFullPagoGroup(group: PagoDetalleGroupView): Promise<void> {
    if (!this.isEditing || this.editingTransaccionId === null) {
      return;
    }

    const pagos = group.cuotas
      .filter((cuota) => this.toCents(cuota.controls.saldo_pendiente.value) > 0)
      .map((cuota) => ({
        id_detalle: cuota.controls.id_detalle.value,
        monto: cuota.controls.saldo_pendiente.value,
      }));

    if (pagos.length === 0) {
      return;
    }

    this.applyingPaymentGroupId = group.id_participante;

    try {
      await this.applyPagosToCurrentTransaction(
        { pagos },
        `${group.nombre_mostrado} quedo pagado completamente.`,
        'No se pudo aplicar el pago completo del participante.',
      );
    } catch (error) {
      this.errorMessage = this.getErrorMessage(
        error,
        'No se pudo aplicar el pago completo del participante.',
      );
      await this.alerts.error('No se pudo aplicar el pago', this.errorMessage);
    } finally {
      this.applyingPaymentGroupId = null;
    }
  }

  get canApplyFullTransaction(): boolean {
    if (
      this.applyingFullPayment ||
      this.applyingPaymentDetailId !== null ||
      this.applyingPaymentGroupId !== null
    ) {
      return false;
    }

    return this.getFullPagoTransaccionControls().some(
      (cuota) => this.toCents(cuota.controls.saldo_pendiente.value) > 0,
    );
  }

  async applyFullPagoTransaccion(): Promise<void> {
    if (!this.isEditing || this.editingTransaccionId === null || !this.canApplyFullTransaction) {
      return;
    }

    const confirmed = await this.alerts.confirm(
      'Confirmar pago total',
      this.paymentModalTransaccion?.es_propietario
        ? 'Se pagaran todas las cuotas pendientes del titular y de los participantes. Deseas continuar?'
        : 'Se pagaran solo las cuotas pendientes del usuario logueado. Deseas continuar?',
      'Aceptar',
      {
        icon: 'warning',
        confirmButtonColor: '#2563eb',
      },
    );

    if (!confirmed) {
      return;
    }

    const pagos = this.getFullPagoTransaccionControls()
      .filter((cuota) => this.toCents(cuota.controls.saldo_pendiente.value) > 0)
      .map((cuota) => ({
        id_detalle: cuota.controls.id_detalle.value,
        monto: cuota.controls.saldo_pendiente.value,
      }));

    if (pagos.length === 0) {
      return;
    }

    this.applyingFullPayment = true;

    try {
      await this.applyPagosToCurrentTransaction(
        { pagos },
        this.paymentModalTransaccion?.es_propietario
          ? 'Se pagaron todas las cuotas pendientes del titular y participantes.'
          : 'Se pagaron todas las cuotas pendientes del usuario logueado.',
        'No se pudo aplicar el pago total de la transaccion.',
      );
    } catch (error) {
      this.errorMessage = this.getErrorMessage(
        error,
        'No se pudo aplicar el pago total de la transaccion.',
      );
      await this.alerts.error('No se pudo aplicar el pago', this.errorMessage);
    } finally {
      this.applyingFullPayment = false;
    }
  }

  private getFullPagoTransaccionControls(): PagoDetalleForm[] {
    if (this.paymentModalTransaccion?.es_propietario) {
      return this.pagosDetalleControls;
    }

    return this.pagosDetalleControls.filter((cuota) =>
      this.isPagoDetalleDelUsuarioLogueado(cuota),
    );
  }

  private isPagoDetalleDelUsuarioLogueado(cuota: PagoDetalleForm): boolean {
    const detalle =
      this.getParticipantesDetalleSafe(this.paymentModalTransaccion).find(
        (item) => item.id === cuota.controls.id_detalle.value,
      ) ?? null;

    if (!detalle) {
      return false;
    }

    return this.isDetalleDelUsuarioLogueado(
      detalle,
      this.paymentModalTransaccion?.es_propietario ?? false,
    );
  }

  private clearSelection(clearMessages = true): void {
    this.editingTransaccionId = null;
    this.paymentTransaccionId = null;
    this.selectedTransaccion = null;
    this.paymentModalTransaccion = null;
    this.editorDetallesOriginales = [];
    this.editModalOpen = false;
    this.applyingFullPayment = false;
    this.applyingPaymentDetailId = null;
    this.applyingPaymentGroupId = null;
    this.paymentModalOpen = false;
    this.selectedFormaPago = null;
    this.montoAplicarDrafts = {};
    this.hasManualEstadoSelectionInEdit = false;
    this.isSyncingEstadoTransaccion = false;
    this.titularManualOverride = false;
    this.participantesDetalleArray.clear();
    this.pagosDetalleArray.clear();
    this.refreshPagosDetalleGroups();
    this.isSyncingEstadoTransaccion = true;
    this.transaccionForm.reset({
      fecha_transaccion: '',
      id_tipo_transaccion: null,
      forma_pago: null,
      id_categoria: null,
      id_subcategoria: null,
      entidad_financiera: '',
      tipo_entidad: '',
      usar_participantes: false,
      cuotas_sin_intereses: false,
      recordatorio_pago: false,
      participantes_detalle: [],
      id_estado: null,
      intereses: 0,
      monto: null,
      descripcion: '',
      comentario: null,
    });
    this.isSyncingEstadoTransaccion = false;

    if (clearMessages) {
      this.successMessage = '';
      this.errorMessage = '';
    }
  }

  private loadTransaccionIntoEditor(
    transaccion: TransaccionListado,
    clearMessages = true,
  ): void {
    if (clearMessages) {
      this.successMessage = '';
      this.errorMessage = '';
    }

    const detalles = [...this.getParticipantesDetalleForEditor(transaccion)].sort((left, right) => {
      if (left.es_titular === right.es_titular) {
        if (left.id_participante === right.id_participante) {
          return left.numero_cuota - right.numero_cuota;
        }

        return left.id_participante - right.id_participante;
      }

      return left.es_titular ? -1 : 1;
    });
    const shouldEnableParticipantesEditor = this.shouldEnableParticipantesEditor(
      transaccion,
      detalles,
    );
    const incomeCuotasMode = this.inferIncomeCuotasMode(transaccion, detalles);

    this.editingTransaccionId = transaccion.id_transaccion;
    this.selectedTransaccion = transaccion;
    this.editorDetallesOriginales = detalles.map((detalle) => ({ ...detalle }));
    this.participantesDetalleArray.clear();
    this.pagosDetalleArray.clear();
    this.hasManualEstadoSelectionInEdit = false;
    this.isSyncingEstadoTransaccion = true;
    this.titularManualOverride = false;

    this.transaccionForm.reset({
      fecha_transaccion: this.formatDateDisplayFromApi(this.normalizeDateOnly(transaccion.fecha)),
      id_tipo_transaccion: transaccion.id_tipo_transaccion,
      forma_pago: transaccion.id_metodo_pago,
      id_categoria: transaccion.id_categoria,
      id_subcategoria: transaccion.id_subcategoria,
      entidad_financiera: '',
      tipo_entidad: '',
      usar_participantes: shouldEnableParticipantesEditor,
      cuotas_sin_intereses: Boolean(transaccion.cuotas_sin_intereses),
      recordatorio_pago: Boolean(transaccion.recordatorio_pago),
      participantes_detalle: [],
      id_estado: transaccion.id_estado,
      intereses: transaccion.intereses,
      monto: this.resolveEditorMontoBase(transaccion, detalles, incomeCuotasMode),
      descripcion: transaccion.descripcion ?? '',
      comentario: transaccion.comentario ?? null,
    });
    this.isSyncingEstadoTransaccion = false;
    this.updateEditingMontoValidators();

    const detallesAgrupados = this.summarizeDetallesForEditor(detalles);
    const dividirMontoInicial = this.shouldStartEditingSharedExpenseWithDividedAmount(
      transaccion,
      detallesAgrupados,
    );

    detallesAgrupados.forEach((detalle) => {
      const cuotasParticipante = this.getCuotasForParticipante(detalles, detalle.id_participante);
      const modoCuotas =
        !this.isCreditoTransaccion(transaccion) && shouldEnableParticipantesEditor
          ? (dividirMontoInicial ? 'divididas' : 'fijas')
          : detalle.es_titular && this.isCreditoTransaccion(transaccion)
            ? incomeCuotasMode
            : this.inferEditorCuotasMode(cuotasParticipante);
      const programacion = this.inferProgramacionConfig(
        cuotasParticipante,
        this.normalizeDateOnly(transaccion.fecha),
      );
      const montoParticipante = this.resolveEditorParticipanteMontoBase(
        transaccion,
        detalle,
        cuotasParticipante,
        modoCuotas,
      );

      this.participantesDetalleArray.push(
        this.registerParticipanteDetalleGroup(this.fb.group({
          id_participante: this.fb.control<number | null>(detalle.id_participante),
          nombre_mostrado: this.fb.control(
            detalle.es_titular
              ? this.currentUserDisplayName
              : (detalle.nombre_participante ?? ''),
            { nonNullable: true },
          ),
          es_titular: this.fb.control(detalle.es_titular, { nonNullable: true }),
          dividir_monto: this.fb.control(
            !this.isCreditoTransaccion(transaccion) && shouldEnableParticipantesEditor
              ? dividirMontoInicial
              : false,
            { nonNullable: true },
          ),
          modo_cuotas: this.fb.control<ModoCuotas>(modoCuotas, {
            nonNullable: true,
          }),
          cantidad_cuotas: this.fb.control<number | null>(detalle.total_cuotas, [
            Validators.required,
            Validators.min(detalle.es_titular ? 0 : 1),
            this.wholeNumberValidator(),
          ]),
          tipo_programacion: this.fb.control<ProgramacionCuotaTipo>(programacion.tipo, {
            nonNullable: true,
          }),
          dia_programado: this.fb.control<number | null>(programacion.dia),
          porcentaje: this.fb.control<number | null>(
            this.resolveDetallePercentageFromMonto(Number(transaccion.monto ?? 0), montoParticipante),
            this.getPorcentajeValidatorsForEditor(),
          ),
          monto: this.fb.control<number | null>(
            montoParticipante,
            this.getEditorParticipanteMontoValidators(detalle.es_titular),
          ),
          id_metodo_pago: this.fb.control<number | null>(
            detalle.id_metodo_pago ?? null,
          ),
          cuotas: this.createCuotasArray(cuotasParticipante, detalle.monto, detalle.total_cuotas),
        })),
      );
    });

    if (this.hasAppliedPagosInEditor) {
      this.participantesDetalleArray.controls.forEach((group) => {
        this.syncCuotasWithMonto(group);
      });
    }

    detalles.forEach((detalle) => {
      this.pagosDetalleArray.push(
        this.fb.group({
          id_detalle: this.fb.control(detalle.id, { nonNullable: true }),
          id_participante: this.fb.control(detalle.id_participante, { nonNullable: true }),
          nombre_mostrado: this.fb.control(
            detalle.es_titular
              ? `${detalle.nombre_participante ?? 'Titular'} (Titular)`
              : (detalle.nombre_participante ?? 'Participante'),
            { nonNullable: true },
          ),
          es_titular: this.fb.control(detalle.es_titular, { nonNullable: true }),
          numero_cuota: this.fb.control(detalle.numero_cuota, { nonNullable: true }),
          total_cuotas: this.fb.control(detalle.total_cuotas, { nonNullable: true }),
          monto_cuota: this.fb.control(detalle.monto, {
            nonNullable: true,
            validators: [Validators.min(0.01), this.maxTwoDecimalsValidator()],
          }),
          monto_pagado: this.fb.control(detalle.monto_pagado, { nonNullable: true }),
          interes_pagado: this.fb.control(detalle.interes_pagado ?? 0, {
            nonNullable: true,
          }),
          interes_pendiente: this.fb.control(detalle.interes_pendiente ?? 0, {
            nonNullable: true,
          }),
          saldo_pendiente: this.fb.control(detalle.saldo_pendiente, { nonNullable: true }),
            monto_aplicar: this.fb.control<string | number | null>(null, [
              Validators.min(0.01),
              this.maxTwoDecimalsValidator(),
            ]),
          fecha_pago: this.fb.control<string | null>(detalle.fecha_pago),
          fecha_programada: this.fb.control<string | null>(detalle.fecha_programada),
          nombre_estado: this.fb.control(detalle.nombre_estado ?? 'Sin estado', {
            nonNullable: true,
          }),
        }),
      );
      this.montoAplicarDrafts[detalle.id] = '';
    });

    this.refreshPagosDetalleGroups();

    if (this.participantesDetalleArray.length === 0) {
      this.addTitularDetalle();
    }

    if (this.showZeroBalancePeriodGrouping) {
      this.initializeZeroBalanceBasePercentagesFromCurrentContext();
      this.initializeZeroBalanceGeneralProgramacionFromCurrentCuotas();
      this.initializeZeroBalancePeriodPercentagesFromCurrentCuotas();
    }

    if (this.isEditingSharedExpenseMode) {
      this.applySharedExpenseCuotaDrivenModeForEdit();
      this.syncCalculatedExpenseMontoForEdit();
    }

    this.onFormaPagoChange();
    this.onCategoriaChange();
    this.refreshEstadoTransaccionForEdit();

    const diagTitular = this.titularDetalleGroup;
    console.warn('[Editor diagnostico] estado tras cargar', {
      transaccionMonto: transaccion.monto,
      formMonto: this.transaccionForm.controls.monto.value,
      titularMontoControl: diagTitular?.controls.monto.value,
      titularModoCuotas: diagTitular?.controls.modo_cuotas.value,
      titularCantidadCuotas: diagTitular?.controls.cantidad_cuotas.value,
      getGroupMontoTarget: diagTitular ? this.getGroupMontoTarget(diagTitular) : null,
      getCuotasTotal: diagTitular ? this.getCuotasTotal(diagTitular) : null,
      getLockedGroupMontoTarget: diagTitular ? this.getLockedGroupMontoTarget(diagTitular) : null,
      isEditingSharedExpenseMode: this.isEditingSharedExpenseMode,
      isEditingSharedExpenseTotalEditable: this.isEditingSharedExpenseTotalEditable,
      showZeroBalancePeriodGrouping: this.showZeroBalancePeriodGrouping,
      hasAppliedPagosInEditor: this.hasAppliedPagosInEditor,
    });
  }

  private async openEditModal(transaccion: TransaccionListado): Promise<void> {
    try {
      this.loadTransaccionIntoEditor(transaccion);
      this.paymentTransaccionId = null;
      this.paymentModalTransaccion = null;
      this.paymentModalOpen = false;
      this.editModalOpen = true;
      this.cdr.detectChanges();
    } catch (error) {
      console.error('Error opening edit modal', error);
      this.errorMessage = 'No se pudieron cargar los datos de la transaccion para editar.';
      await this.alerts.error('No se pudo abrir edicion', this.errorMessage);
    }
  }

  onUsarParticipantesChange(event: Event): void {
    const checked = (event.target as HTMLInputElement).checked;
    this.setParticipantesEditorEnabled(checked);
  }

  enableParticipantesEditor(): void {
    if (this.hasAppliedPagosInEditor) {
      return;
    }

    this.setParticipantesEditorEnabled(true);
  }

  private setParticipantesEditorEnabled(enabled: boolean): void {
    this.usarParticipantesControl.setValue(enabled);
    this.updateEditingMontoValidators();

    if (enabled) {
      this.titularManualOverride = false;
      if (this.participantesDetalleArray.length === 0) {
        this.addTitularDetalle();
      }
      this.refreshParticipantesMontos();
      return;
    }

    this.titularManualOverride = false;
    this.participantesDetalleArray.clear();
  }

  addTitularDetalle(): void {
    if (this.titularDetalleGroup) {
      return;
    }

    this.titularSectionDismissed = false;

    const titularMontoInicial = this.isEditingSharedExpenseMode
      ? 0
      : (this.transaccionForm.controls.monto.value ?? 0);
    const titularPorcentajeInicial = this.isEditingSharedExpenseMode ? 0 : 100;

    this.participantesDetalleArray.push(
      this.registerParticipanteDetalleGroup(this.fb.group({
        id_participante: this.fb.control<number | null>(
          this.currentUserParticipante?.id_participante ?? null,
        ),
        nombre_mostrado: this.fb.control(this.currentUserDisplayName, { nonNullable: true }),
        es_titular: this.fb.control(true, { nonNullable: true }),
        dividir_monto: this.fb.control(this.isEditingSharedExpenseMode, { nonNullable: true }),
        modo_cuotas: this.fb.control<ModoCuotas>(
          this.isEditingSharedExpenseMode ? 'divididas' : 'fijas',
          { nonNullable: true },
        ),
        cantidad_cuotas: this.fb.control<number | null>(1, [
          Validators.required,
          Validators.min(0),
          this.wholeNumberValidator(),
        ]),
        tipo_programacion: this.fb.control<ProgramacionCuotaTipo>('ninguna', {
          nonNullable: true,
        }),
        dia_programado: this.fb.control<number | null>(null),
        porcentaje: this.fb.control<number | null>(
          titularPorcentajeInicial,
          this.getPorcentajeValidatorsForEditor(),
        ),
        monto: this.fb.control<number | null>(
          titularMontoInicial,
          this.getEditorParticipanteMontoValidators(true),
        ),
        id_metodo_pago: this.fb.control<number | null>(null),
        cuotas: this.createCuotasArray(undefined, titularMontoInicial, 1),
      })),
    );
    this.syncCalculatedExpenseMontoForEdit();
  }

  addParticipanteDetalle(): void {
    if (!this.titularDetalleGroup) {
      this.addTitularDetalle();
    }

    const dividirMontoInicial = this.titularDetalleGroup?.controls.dividir_monto.value ?? true;
    const modoCuotasInicial: ModoCuotas = dividirMontoInicial ? 'divididas' : 'fijas';
    const cuotasTitularIniciales = this.normalizeCuotasCountValue(
      this.titularDetalleGroup as ParticipanteDetalleForm,
      this.titularDetalleGroup?.controls.cantidad_cuotas.value ?? 1,
    );
    const tipoProgramacionInicial =
      cuotasTitularIniciales > 1
        ? (this.titularDetalleGroup?.controls.tipo_programacion.value ?? 'dia_mes')
        : 'ninguna';
    const diaProgramadoInicial =
      cuotasTitularIniciales > 1
        ? (this.titularDetalleGroup?.controls.dia_programado.value ?? this.getDefaultDiaProgramado())
        : null;

    const newGroup = this.registerParticipanteDetalleGroup(this.fb.group({
      id_participante: this.fb.control<number | null>(null, [Validators.required]),
      nombre_mostrado: this.fb.control('', { nonNullable: true }),
      es_titular: this.fb.control(false, { nonNullable: true }),
      dividir_monto: this.fb.control(dividirMontoInicial, { nonNullable: true }),
      modo_cuotas: this.fb.control<ModoCuotas>(modoCuotasInicial, { nonNullable: true }),
      cantidad_cuotas: this.fb.control<number | null>(cuotasTitularIniciales, [
        Validators.required,
        Validators.min(1),
        this.wholeNumberValidator(),
      ]),
      tipo_programacion: this.fb.control<ProgramacionCuotaTipo>(tipoProgramacionInicial, {
        nonNullable: true,
      }),
      dia_programado: this.fb.control<number | null>(diaProgramadoInicial),
      porcentaje: this.fb.control<number | null>(
        this.isEditingSharedExpenseMode ? 0 : null,
        this.getPorcentajeValidatorsForEditor(),
      ),
      monto: this.fb.control<number | null>(
        this.isEditingSharedExpenseMode ? 0 : null,
        this.getEditorParticipanteMontoValidators(false),
      ),
      id_metodo_pago: this.fb.control<number | null>(
        this.transaccionForm.controls.forma_pago.value,
      ),
      cuotas: this.createCuotasArray(undefined, 0, cuotasTitularIniciales),
    }));

    this.participantesDetalleArray.push(newGroup);
    this.applyDismissedTitularDefaultShare(newGroup);

    if (this.showZeroBalancePeriodGrouping) {
      this.applyZeroBalanceGeneralCuotasCount(this.getZeroBalanceGeneralCuotasCount());
      this.syncZeroBalanceSharedStateFromPeriods();
      return;
    }

    this.syncCalculatedExpenseMontoForEdit();
  }

  removeParticipanteDetalle(index: number): void {
    this.participantesDetalleArray.removeAt(index);

    if (!this.getAdditionalParticipants().length) {
      this.titularManualOverride = false;
    }

    if (this.showZeroBalancePeriodGrouping) {
      this.redistributeZeroBalancePeriodsFromPercentages();
      return;
    }

    if (this.isEditingSharedExpenseMode) {
      this.syncCalculatedExpenseMontoForEdit();
      return;
    }

    this.rebalanceTitularParticipation();
  }

  onFormaPagoChange(forceSingleCuotaDefault = false): void {
    const formaPagoId = this.transaccionForm.controls.forma_pago.value;
    this.selectedFormaPago =
      this.formasPago.find((item) => item.id_forma === formaPagoId) ?? null;

    if (!this.selectedFormaPago) {
      this.transaccionForm.patchValue({
        entidad_financiera: '',
        tipo_entidad: '',
        cuotas_sin_intereses: false,
      });
      if (forceSingleCuotaDefault) {
        this.refreshProgramacionForAllGroups(true);
      }
      this.refreshEstadoTransaccionForEdit();
      return;
    }

    if (this.isCashFormaPagoSelected) {
      this.transaccionForm.patchValue({
        entidad_financiera: '',
        tipo_entidad: '',
      });

      if (!this.showCuotasSinInteresesOption) {
        this.transaccionForm.controls.cuotas_sin_intereses.setValue(false, {
          emitEvent: false,
        });
      }

      if (forceSingleCuotaDefault) {
        this.refreshProgramacionForAllGroups(true);
      }
      this.refreshEstadoTransaccionForEdit();
      return;
    }

    const entidad =
      this.entidadesFinancieras.find(
        (item) => item.id_entidad === this.selectedFormaPago?.id_entidad,
      ) ?? null;
    const tipoEntidad =
      this.tiposEntidad.find((item) => item.id_tipo_entidad === entidad?.tipo_entidad) ?? null;

    this.transaccionForm.patchValue({
      entidad_financiera: entidad?.nombre_entidad ?? '',
      tipo_entidad: tipoEntidad?.descripcion ?? '',
    });

    if (!this.showCuotasSinInteresesOption) {
      this.transaccionForm.controls.cuotas_sin_intereses.setValue(false, {
        emitEvent: false,
      });
    }

    if (forceSingleCuotaDefault) {
      this.refreshProgramacionForAllGroups(true);
    }
    this.refreshEstadoTransaccionForEdit();
  }

  onCategoriaChange(): void {
    const subcategoriaId = this.transaccionForm.controls.id_subcategoria.value;

    if (
      subcategoriaId &&
      !this.filteredSubcategorias.some((item) => item.id_subcategoria === subcategoriaId)
    ) {
      this.transaccionForm.patchValue({
        id_subcategoria: null,
      });
    }
  }

  private refreshEstadoTransaccionForEdit(): void {
    if (!this.isEditing) {
      return;
    }

    if (this.hasManualEstadoSelectionInEdit) {
      return;
    }

    const estadoName = this.resolveEstadoTransaccionNameForEdit();
    const estadoSeleccionado =
      this.estadosTransaccion.find(
        (item) => item.nombre_estado.trim().toUpperCase() === estadoName,
      ) ?? null;

    if (!estadoSeleccionado) {
      return;
    }

    this.isSyncingEstadoTransaccion = true;
    this.transaccionForm.controls.id_estado.setValue(estadoSeleccionado.id_estado, {
      emitEvent: false,
    });
    this.transaccionForm.controls.id_estado.updateValueAndValidity({
      emitEvent: false,
    });
    this.isSyncingEstadoTransaccion = false;
  }

  private resolveEstadoTransaccionNameForEdit(): string {
    return this.isEditingIncomeMode
      ? this.resolveIncomeEstadoNameForEdit()
      : this.resolveExpenseEstadoNameForEdit();
  }

  private resolveExpenseEstadoNameForEdit(): string {
    if (this.selectedTransaccion && this.isAnuladaTransaccion(this.selectedTransaccion)) {
      return 'ANULADO';
    }

    if (!this.hasAppliedPagosInEditor) {
      return this.isImmediatePaymentSelectedForEdit ? 'PAGADO' : 'PENDIENTE';
    }

    const detalles = this.buildDetallesEstadoSnapshotForEdit();
    const hayPendientes = detalles.some(
      (detalle) => detalle.saldoPendienteCentavos > 0,
    );
    const hayPagados = detalles.some(
      (detalle) => detalle.montoPagadoTotalCentavos > 0,
    );

    if (!hayPendientes && (hayPagados || this.isImmediatePaymentSelectedForEdit)) {
      return 'PAGADO';
    }

    return 'PENDIENTE';
  }

  private resolveIncomeEstadoNameForEdit(): string {
    if (this.selectedTransaccion && this.isAnuladaTransaccion(this.selectedTransaccion)) {
      return 'ANULADO';
    }

    const detalles = this.buildDetallesEstadoSnapshotForEdit();

    if (detalles.length === 0) {
      return 'PENDIENTE';
    }

    if (detalles.every((detalle) => detalle.saldoPendienteCentavos === 0)) {
      return 'PAGADO';
    }

    return 'PENDIENTE';
  }

  private buildDetallesEstadoSnapshotForEdit(): Array<{
    fecha_programada: string | null;
    montoPagadoTotalCentavos: number;
    saldoPendienteCentavos: number;
  }> {
    const detallesPorParticipante = new Map<number, ParticipanteDetalleListado[]>();

    [...this.editorDetallesOriginales]
      .filter((detalle) => detalle.id_estado !== ESTADO_TRANSACCION_ANULADA_ID)
      .sort((left, right) => {
        if (left.id_participante !== right.id_participante) {
          return left.id_participante - right.id_participante;
        }

        if (left.numero_cuota !== right.numero_cuota) {
          return left.numero_cuota - right.numero_cuota;
        }

        return left.id - right.id;
      })
      .forEach((detalle) => {
        const detallesParticipante =
          detallesPorParticipante.get(detalle.id_participante) ?? [];
        detallesParticipante.push(detalle);
        detallesPorParticipante.set(detalle.id_participante, detallesParticipante);
      });

    return this.participantesDetalleArray.controls.flatMap((group) => {
      const cuotasActuales = this.getCuotasPayload(group);
      const idParticipante = group.controls.id_participante.value;
      const detallesOriginales =
        idParticipante !== null
          ? (detallesPorParticipante.get(idParticipante) ?? [])
          : [];

      return cuotasActuales.map((cuota, index) => {
        const detalleOriginal = detallesOriginales[index] ?? null;
        const montoCuotaCentavos = this.toCents(
          this.normalizeDecimalValue(Number(cuota.monto ?? 0)),
        );
        const montoPagadoCentavos = this.toCents(
          Number(detalleOriginal?.monto_pagado ?? 0),
        );
        const interesPagadoCentavos = this.toCents(
          Number(detalleOriginal?.interes_pagado ?? 0),
        );
        const interesPendienteCentavos = Math.max(
          0,
          this.toCents(Number(detalleOriginal?.interes_pendiente ?? 0)),
        );

        return {
          fecha_programada:
            cuota.fecha_programada ?? detalleOriginal?.fecha_programada ?? null,
          montoPagadoTotalCentavos:
            Math.max(0, montoPagadoCentavos) + Math.max(0, interesPagadoCentavos),
          saldoPendienteCentavos:
            Math.max(0, montoCuotaCentavos - montoPagadoCentavos) +
            interesPendienteCentavos,
        };
      });
    });
  }

  async onSubmit(): Promise<void> {
    this.successMessage = '';
    this.errorMessage = '';

    this.normalizeFormForSubmit();
    this.refreshEstadoTransaccionForEdit();

    if (!this.isEditing || this.editingTransaccionId === null) {
      await this.alerts.warning(
        'Selecciona una transaccion',
        'Elige una transaccion del listado antes de guardar cambios.',
      );
      return;
    }

    if (this.usarParticipantesControl.value && this.participantesDetalleArray.length === 0) {
      this.addTitularDetalle();
    }

    if (
      this.usarParticipantesControl.value &&
      !this.hasAppliedPagosInEditor &&
      !this.showZeroBalancePeriodGrouping
    ) {
      this.refreshParticipantesMontos();
    } else if (this.showZeroBalancePeriodGrouping) {
      this.syncZeroBalanceSharedStateFromPeriods();
    }

    this.transaccionForm.markAllAsTouched();
    this.participantesDetalleArray.markAllAsTouched();

    if (this.transaccionForm.invalid) {
      await this.alerts.warning(
        'Formulario incompleto',
        this.buildIncompleteFormMessage(),
      );
      return;
    }

    if (!this.validateCuotasConfiguration()) {
      await this.alerts.warning(
        'Cuotas inconsistentes',
        'La suma de cuotas del titular y de cada participante debe cubrir exactamente su monto.',
      );
      return;
    }

    if (!(await this.confirmEstadoMasivoChangeIfNeeded())) {
      return;
    }

    const formValue = this.transaccionForm.getRawValue();
    const participantesDetalle = this.usarParticipantesControl.value
      ? this.participantesDetalleArray.controls
          .filter((group) => !group.controls.es_titular.value)
          .map((group) => ({
            id_participante: group.controls.id_participante.value,
            monto: this.getGroupMontoTarget(group),
            cantidad_cuotas: group.controls.cantidad_cuotas.value,
            cuotas: this.getCuotasPayload(group),
            id_metodo_pago: group.controls.id_metodo_pago.value,
          }))
      : [];
    const hasAdditionalParticipants = participantesDetalle.length > 0;

    if (
      this.usarParticipantesControl.value &&
      hasAdditionalParticipants &&
      participantesDetalle.some(
        (detalle) =>
          detalle.id_participante === null ||
          detalle.monto === null ||
          detalle.cantidad_cuotas === null ||
          detalle.cuotas.length === 0,
      )
    ) {
      await this.alerts.warning(
        'Participantes incompletos',
        'Completa el nombre y el monto de cada participante antes de guardar.',
      );
      return;
    }

    const montoTotal =
      this.hasAppliedPagosInEditor && this.selectedTransaccion
        ? Number(this.selectedTransaccion.monto)
        : this.getResolvedSubmitMontoTotal(Number(formValue.monto ?? 0));
    const montoTitular = this.titularDetalleGroup
      ? this.getGroupMontoTarget(this.titularDetalleGroup)
      : 0;
    const montoParticipantes = participantesDetalle.reduce(
      (sum, detalle) => sum + Number(detalle.monto ?? 0),
      0,
    );

    if (
      !this.validateMontoCubiertoPorParticipantes(
        montoTotal,
        montoTitular,
        montoParticipantes,
        hasAdditionalParticipants,
      )
    ) {
      console.warn('[Monto inconsistente] diagnostico', {
        montoTotal,
        montoTitular,
        montoParticipantes,
        hasAdditionalParticipants,
        montoTotalCents: this.toCents(montoTotal),
        montoTitularCents: this.toCents(montoTitular),
        sumaCents: this.toCents(montoTitular + montoParticipantes),
      });
      await this.alerts.warning(
        'Monto inconsistente',
        'La suma del titular y los participantes debe cubrir exactamente el monto total de la transaccion.',
      );
      return;
    }

    const payload: UpdateTransaccionPayload = {
      fecha: this.normalizeDateInputValue(formValue.fecha_transaccion ?? '') ?? '',
      monto: montoTotal,
      id_tipo_cuota:
        this.isEditingSharedExpenseMode && this.hasZeroBalanceCuotasInEditor
          ? TIPO_CUOTA_VARIABLE_ID
          : TIPO_CUOTA_FIJA_ID,
      pago_variable: this.isEditingSharedExpenseMode && this.hasZeroBalanceCuotasInEditor,
      cuotas_sin_intereses:
        this.showCuotasSinInteresesOption && Boolean(formValue.cuotas_sin_intereses),
      recordatorio_pago: Boolean(formValue.recordatorio_pago),
      id_tipo_transaccion: formValue.id_tipo_transaccion as TipoTransaccionId,
      id_metodo_pago: formValue.forma_pago as number,
      id_categoria: formValue.id_categoria as number,
      id_subcategoria: formValue.id_subcategoria ?? null,
      id_estado: formValue.id_estado as number,
      descripcion: formValue.descripcion ?? '',
      comentario: this.isEditingSharedExpenseMode ? (formValue.comentario?.trim() || null) : null,
      pagocompartido: Boolean(this.usarParticipantesControl.value && hasAdditionalParticipants),
      cantidad_cuotas_titular: this.titularDetalleGroup?.controls.cantidad_cuotas.value ?? 1,
      cuotas_titular: this.titularDetalleGroup
        ? this.getCuotasPayload(this.titularDetalleGroup)
        : [{
            monto: this.normalizeDecimalValue(montoTotal),
            fecha_programada: this.getSingleCuotaDefaultFechaProgramada(),
          }],
    };

    if (payload.pagocompartido) {
      const titularMetodoPagoId = formValue.forma_pago as number;
      payload.participantes_detalle = participantesDetalle.map((detalle) => {
        const item: {
          id_participante: number;
          monto: number;
          cantidad_cuotas: number;
          cuotas: typeof detalle.cuotas;
          id_metodo_pago?: number;
        } = {
          id_participante: detalle.id_participante as number,
          monto: Number(detalle.monto),
          cantidad_cuotas: Number(detalle.cantidad_cuotas),
          cuotas: detalle.cuotas,
        };
        const participanteMetodo = detalle.id_metodo_pago;
        if (participanteMetodo && participanteMetodo !== titularMetodoPagoId) {
          item.id_metodo_pago = participanteMetodo;
        }
        return item;
      });
    } else {
      payload.participantes_detalle = undefined;
    }

    this.saving = true;

    try {
      await firstValueFrom(
        this.http
          .patch(`${this.apiUrl}/${this.editingTransaccionId}`, payload, {
            params: { id_usuario: this.currentUserIdValue },
          })
          .pipe(timeout(10000)),
      );

      this.successMessage = 'Transaccion actualizada correctamente.';
      await this.alerts.success('Transaccion actualizada', this.successMessage);
      await this.loadTransacciones();
      this.closeEditModal();
    } catch (error) {
      this.errorMessage = this.getErrorMessage(
        error,
        'No se pudo actualizar la transaccion.',
      );
      await this.alerts.error('No se pudo guardar', this.errorMessage);
    } finally {
      this.saving = false;
    }
  }

  async completeRegistro(transaccion: TransaccionListado): Promise<void> {
    this.successMessage = '';
    this.errorMessage = '';
    this.completingId = transaccion.id_transaccion;

    try {
      await firstValueFrom(
        this.http
          .patch(
            `${this.apiUrl}/${transaccion.id_transaccion}/completar`,
            {},
            {
              params: { id_usuario: this.currentUserIdValue },
            },
          )
          .pipe(timeout(10000)),
      );

      this.successMessage = 'Registro completado correctamente.';
      await this.alerts.success('Registro completado', this.successMessage);
      await this.loadTransacciones();
    } catch (error) {
      this.errorMessage = this.getErrorMessage(
        error,
        'No se pudo completar el registro de la transaccion.',
      );
      await this.alerts.error('No se pudo completar', this.errorMessage);
    } finally {
      this.completingId = null;
    }
  }

  normalizeMoneyInput(controlName: 'monto'): void;
  normalizeMoneyInput(controlName: 'monto', group: ParticipanteDetalleForm): void;
  normalizeMoneyInput(controlName: 'monto', group?: ParticipanteDetalleForm): void {
    const control = group
      ? (group.get(controlName) as FormControl<number | null>)
      : (this.transaccionForm.get(controlName) as FormControl<number | null>);
    const rawValue = control.value;

    if (rawValue === null || rawValue === undefined) {
      return;
    }

    const normalizedValue = Number(rawValue);

    if (Number.isNaN(normalizedValue)) {
      return;
    }

    control.setValue(this.normalizeDecimalValue(normalizedValue), { emitEvent: false });
    control.updateValueAndValidity({ emitEvent: false });

    if (group) {
      if (!this.isEditingIncomeMode && group.controls.es_titular.value) {
        this.titularManualOverride = true;
      }

      this.markGroupAmountAsManual(group);
      this.updatePorcentajeFromMonto(group, this.shouldRebalanceCounterpart(group));
    } else if (this.usarParticipantesControl.value) {
      if (this.isEditingSharedExpenseTotalEditable) {
        this.syncCalculatedExpenseMontoForEdit();
      } else {
        this.refreshParticipantesMontos();
      }
    } else {
      this.syncStandaloneMontoToTitular();
    }

    this.refreshEstadoTransaccionForEdit();
  }

  onMontoInput(event?: Event): void {
    if (this.isMoneyInputPendingDecimal(event)) {
      return;
    }

    if (!this.usarParticipantesControl.value) {
      this.syncStandaloneMontoToTitular();
      return;
    }

    if (this.isEditingSharedExpenseTotalEditable) {
      this.syncCalculatedExpenseMontoForEdit();
      this.refreshEstadoTransaccionForEdit();
      return;
    }

    this.refreshParticipantesMontos();
  }

  onMoneyInputActivate(event: Event): void {
    const input = event.target as HTMLInputElement | null;

    if (!input || input.readOnly || input.disabled) {
      return;
    }

    if (input.dataset['sanitize'] === 'percentage') {
      if (input.type === 'number') {
        input.dataset['replaceOnNextInput'] = 'true';
        return;
      }

      setTimeout(() => input.setSelectionRange(0, input.value.length));
      return;
    }

    const sanitizedValue = this.sanitizeMoneyInputValue(input.value);

    if (!sanitizedValue) {
      return;
    }

    const numericValue = Number(sanitizedValue);

    if (Number.isNaN(numericValue) || this.toCents(numericValue) !== 0) {
      return;
    }

    setTimeout(() => input.setSelectionRange(0, input.value.length));
  }

  onMontoKeydown(event: KeyboardEvent): void {
    const input = event.target as HTMLInputElement | null;
    const maxDecimals = Number(input?.dataset['decimals'] ?? '2');
    const sanitizeValue =
      input?.dataset['sanitize'] === 'percentage'
        ? (value: string) => this.sanitizePercentageInputValue(value)
        : (value: string) => this.sanitizeMoneyInputValue(value);

    if (input?.dataset['replaceOnNextInput'] === 'true') {
      const allowedReplacementKeys = new Set(['Backspace', 'Delete']);

      if (/^\d$/.test(event.key) || allowedReplacementKeys.has(event.key)) {
        event.preventDefault();
        input.dataset['replaceOnNextInput'] = 'false';
        input.value = /^\d$/.test(event.key) ? event.key : '';
        input.dispatchEvent(new Event('input', { bubbles: true }));
        return;
      }

      if (this.isDecimalSeparatorKey(event.key)) {
        event.preventDefault();
        input.dataset['replaceOnNextInput'] = 'false';
        input.value = '0.';
        input.dispatchEvent(new Event('input', { bubbles: true }));
        return;
      }
    }

    this.blockDecimalInput(event, Number.isFinite(maxDecimals) ? maxDecimals : 2, sanitizeValue);
  }

  normalizePercentageInput(group: ParticipanteDetalleForm): void {
    const control = group.controls.porcentaje;
    const rawValue = control.value;

    if (this.isEditingSharedExpenseMode) {
      if (this.showZeroBalancePeriodGrouping) {
        this.clearDismissedTitularFullShareDefault(group);
        this.recalculateZeroBalanceSharedPercentageDistribution(group);
        return;
      }

      if (!this.isEditingIncomeMode && group.controls.es_titular.value) {
        this.titularManualOverride = true;
      }

      this.clearDismissedTitularFullShareDefault(group);
      this.recalculateSharedExpensePercentageDistribution(group);
      return;
    }

    if (rawValue === null || rawValue === undefined) {
      if (!this.isEditingIncomeMode && group.controls.es_titular.value) {
        this.titularManualOverride = true;
      }

      this.clearDismissedTitularFullShareDefault(group);
      this.markGroupAmountAsAutomatic(group);
      this.updateMontoFromPorcentaje(group, this.shouldRebalanceCounterpart(group));
      this.refreshEstadoTransaccionForEdit();
      return;
    }

    const normalizedValue = Number(rawValue);

    if (Number.isNaN(normalizedValue)) {
      return;
    }

    const boundedValue = this.normalizePercentageValue(normalizedValue);
    control.setValue(boundedValue, { emitEvent: false });
    control.updateValueAndValidity({ emitEvent: false });

    if (!this.isEditingIncomeMode && group.controls.es_titular.value) {
      this.titularManualOverride = true;
    }

    this.clearDismissedTitularFullShareDefault(group);
    this.markGroupAmountAsAutomatic(group);
    this.updateMontoFromPorcentaje(group, this.shouldRebalanceCounterpart(group));
    this.refreshEstadoTransaccionForEdit();
  }

  normalizeCuotasInput(group: ParticipanteDetalleForm): void {
    const control = group.controls.cantidad_cuotas;
    const rawValue = control.value;

    if (rawValue === null || rawValue === undefined) {
      return;
    }

    const normalizedValue = this.normalizeCuotasCountValue(group, rawValue);

    if (Number.isNaN(normalizedValue)) {
      return;
    }

    control.setValue(normalizedValue, { emitEvent: false });
    control.updateValueAndValidity({ emitEvent: false });
    this.syncCuotasCount(group);
  }

  onCuotasInput(event: Event, group: ParticipanteDetalleForm): void {
    const input = event.target as HTMLInputElement | null;
    const rawValue = input?.value ?? '';

    if (!rawValue.trim()) {
      return;
    }

    const normalizedValue = this.normalizeCuotasCountValue(group, rawValue);

    if (Number.isNaN(normalizedValue)) {
      return;
    }

    group.controls.cantidad_cuotas.setValue(normalizedValue, { emitEvent: false });
    group.controls.cantidad_cuotas.updateValueAndValidity({ emitEvent: false });

    if (this.getCuotasArray(group).length !== normalizedValue) {
      this.syncCuotasCount(group);
      this.cdr.detectChanges();
    }
  }

  onTipoProgramacionChange(group: ParticipanteDetalleForm): void {
    if (this.hasAppliedPagosInEditor) {
      return;
    }

    this.ensureProgramacionConfig(group);
    this.refreshProgramacionCuotas(group);
    this.refreshEstadoTransaccionForEdit();
  }

  onDiaProgramadoBlur(group: ParticipanteDetalleForm): void {
    if (this.hasAppliedPagosInEditor) {
      return;
    }

    const diaControl = group.controls.dia_programado;
    const rawValue = diaControl.value;

    if (rawValue === null || rawValue === undefined) {
      diaControl.setValue(this.getDefaultDiaProgramado(), { emitEvent: false });
    } else {
      diaControl.setValue(this.normalizeDiaProgramado(Number(rawValue)), { emitEvent: false });
    }

    diaControl.updateValueAndValidity({ emitEvent: false });
    this.refreshProgramacionCuotas(group);
    this.refreshEstadoTransaccionForEdit();
  }

  onDividirMontoChange(group: ParticipanteDetalleForm): void {
    if (
      this.hasAppliedPagosInEditor ||
      this.isEditingSharedExpenseCuotasDesdeFechaProgramadaMode
    ) {
      return;
    }

    const gruposObjetivo =
      this.isEditingSharedExpenseMode && group.controls.es_titular.value
        ? this.participantesDetalleArray.controls
        : [group];

    gruposObjetivo.forEach((targetGroup) => {
      targetGroup.controls.dividir_monto.setValue(group.controls.dividir_monto.value, {
        emitEvent: false,
      });
      targetGroup.controls.modo_cuotas.setValue(
        group.controls.dividir_monto.value ? 'divididas' : 'fijas',
        { emitEvent: false },
      );
      targetGroup.controls.modo_cuotas.updateValueAndValidity({ emitEvent: false });
      this.onCuotaModeChange(targetGroup);
    });
  }

  onCuotaModeChange(group: ParticipanteDetalleForm): void {
    if (this.hasAppliedPagosInEditor) {
      return;
    }

    const montoObjetivoActual = this.getCuotasTotal(group);

    if (this.shouldPreserveGroupTargetOnCuotaModeChange(group)) {
      group.controls.monto.setValue(
        this.getMontoInputValueForTarget(group, montoObjetivoActual),
        { emitEvent: false },
      );
      group.controls.monto.updateValueAndValidity({ emitEvent: false });
    }

    if (!this.isEditingIncomeMode && group.controls.es_titular.value) {
      this.titularManualOverride = true;
    }

    if (!this.isEditingIncomeMode) {
      this.updatePorcentajeFromMonto(group, this.shouldRebalanceCounterpart(group));
      this.refreshEstadoTransaccionForEdit();
      return;
    }

    if (group.controls.es_titular.value) {
      this.syncCuotasWithMonto(group);
    } else {
      this.updatePorcentajeFromMonto(group, this.shouldRebalanceCounterpart(group));
    }
    this.refreshEstadoTransaccionForEdit();
  }

  private shouldPreserveGroupTargetOnCuotaModeChange(
    _group: ParticipanteDetalleForm,
  ): boolean {
    return !this.isEditingIncomeMode;
  }

  onParticipantePorcentajeInput(group: ParticipanteDetalleForm, event?: Event): void {
    if (!this.canEditParticipantePorcentaje(group)) {
      return;
    }

    const input = event?.target as HTMLInputElement | null;

    if (input?.type === 'number') {
      const rawValue = input.value.trim();

      group.controls.porcentaje.setValue(
        (rawValue === '' ? null : Number(rawValue)) as number | null,
        { emitEvent: false },
      );
      group.controls.porcentaje.updateValueAndValidity({ emitEvent: false });

      if (this.isEditingSharedExpenseMode) {
        if (this.showZeroBalancePeriodGrouping) {
          this.clearDismissedTitularFullShareDefault(group);
          this.recalculateZeroBalanceSharedPercentageDistribution(group);
          return;
        }

        if (!this.isEditingIncomeMode && group.controls.es_titular.value) {
          this.titularManualOverride = true;
        }

        this.clearDismissedTitularFullShareDefault(group);
        this.recalculateSharedExpensePercentageDistribution(group);
        return;
      }

      if (!rawValue) {
        if (!this.isEditingIncomeMode && group.controls.es_titular.value) {
          this.titularManualOverride = true;
        }

        this.clearDismissedTitularFullShareDefault(group);
        this.markGroupAmountAsAutomatic(group);
        this.updateMontoFromPorcentaje(group, this.shouldRebalanceCounterpart(group));
        this.refreshEstadoTransaccionForEdit();
        return;
      }

      if (Number.isNaN(Number(rawValue))) {
        return;
      }

      if (!this.isEditingIncomeMode && group.controls.es_titular.value) {
        this.titularManualOverride = true;
      }

      this.clearDismissedTitularFullShareDefault(group);
      this.markGroupAmountAsAutomatic(group);
      this.updateMontoFromPorcentaje(group, this.shouldRebalanceCounterpart(group));
      this.refreshEstadoTransaccionForEdit();
      return;
    }

    if (input) {
      input.dataset['replaceOnNextInput'] = 'false';
    }

    this.sanitizePercentageInput(group, event);
    this.refreshEstadoTransaccionForEdit();
  }

  onParticipanteMontoInput(group: ParticipanteDetalleForm, event?: Event): void {
    if (!this.canEditParticipanteMonto(group)) {
      return;
    }

    if (this.isMoneyInputPendingDecimal(event)) {
      return;
    }

    if (!this.isEditingIncomeMode && group.controls.es_titular.value) {
      this.titularManualOverride = true;
    }

    this.clearDismissedTitularFullShareDefault(group);
    this.markGroupAmountAsManual(group);
    this.updatePorcentajeFromMonto(group, this.shouldRebalanceCounterpart(group));
    this.refreshEstadoTransaccionForEdit();
  }

  onCuotaMontoInput(
    group: ParticipanteDetalleForm,
    cuotaIndex: number,
    event?: Event,
  ): void {
    if (this.isCuotaMontoReadonly(group) || this.isCuotaBloqueadaEnEditor(group, cuotaIndex)) {
      return;
    }

    if (this.isMoneyInputPendingDecimal(event)) {
      return;
    }

    if (!this.isEditingSharedExpenseMode) {
      this.syncLastCuotaWithMonto(group);
      return;
    }

    if (!this.isEditingIncomeMode && group.controls.es_titular.value) {
      this.titularManualOverride = true;
    }

    this.markGroupAmountAsManual(group);
    this.syncSharedExpenseGroupFromCuotas(group);
  }

  normalizeCuotaMontoInput(group: ParticipanteDetalleForm, cuotaIndex: number): void {
    const cuotasArray = this.getCuotasArray(group);
    const cuotaGroup = cuotasArray.at(cuotaIndex);

    if (!cuotaGroup) {
      return;
    }

    const rawValue = cuotaGroup.controls.monto.value;

    if (rawValue === null || rawValue === undefined) {
      return;
    }

    const normalizedValue = this.normalizeDecimalValue(Number(rawValue));

    if (Number.isNaN(normalizedValue)) {
      return;
    }

    cuotaGroup.controls.monto.setValue(normalizedValue, { emitEvent: false });
    cuotaGroup.controls.monto.updateValueAndValidity({ emitEvent: false });

    if (
      this.isEditingSharedExpenseMode &&
      !this.isCuotaMontoReadonly(group) &&
      !this.isCuotaBloqueadaEnEditor(group, cuotaIndex)
    ) {
      if (!this.isEditingIncomeMode && group.controls.es_titular.value) {
        this.titularManualOverride = true;
      }

      this.clearDismissedTitularFullShareDefault(group);
      this.markGroupAmountAsManual(group);
      this.syncSharedExpenseGroupFromCuotas(group);
      return;
    }

    this.syncLastCuotaWithMonto(group);
  }

  onMontoPaste(event: ClipboardEvent): void {
    const input = event.target as HTMLInputElement | null;
    const sanitizeValue =
      input?.dataset['sanitize'] === 'percentage'
        ? (value: string) => this.sanitizePercentageInputValue(value)
        : (value: string) => this.sanitizeMoneyInputValue(value);

    this.sanitizeDecimalPaste(event, sanitizeValue);
  }

  onParticipanteSelectionChange(group: ParticipanteDetalleForm): void {
    if (this.hasAppliedPagosInEditor) {
      return;
    }

    const participanteId = group.controls.id_participante.value;
    const participante =
      this.participantes.find((item) => item.id_participante === participanteId) ?? null;

    group.controls.nombre_mostrado.setValue(participante?.nombre_participante ?? '', {
      emitEvent: false,
    });

    if (this.shouldDefaultToFullShare(group)) {
      this.assignFullShareToGroup(group);
      this.refreshEstadoTransaccionForEdit();
      return;
    }

    if (
      participante?.porcentaje_participacion !== null &&
      participante?.porcentaje_participacion !== undefined
    ) {
      const porcentajeParticipante = this.normalizePercentageValue(
        Number(participante.porcentaje_participacion),
      );

      group.controls.porcentaje.setValue(porcentajeParticipante, {
        emitEvent: false,
      });
      this.markGroupAmountAsAutomatic(group);

      if (this.isEditingSharedExpenseMode) {
        if (this.showZeroBalancePeriodGrouping) {
          const percentages = this.ensureZeroBalancePeriodPercentages(group);
          for (let index = 0; index < percentages.length; index += 1) {
            percentages[index] = porcentajeParticipante;
          }
          this.zeroBalancePeriodPercentagesByGroup.set(group, percentages);
          this.recalculateZeroBalanceSharedPercentageDistribution(group);
        } else {
          this.recalculateSharedExpensePercentageDistribution(group);
        }
      } else {
        this.updateMontoFromPorcentaje(group, this.shouldRebalanceCounterpart(group));
      }
    }

    this.refreshEstadoTransaccionForEdit();
  }

  isParticipanteOptionDisabled(
    participanteId: number,
    currentGroup: ParticipanteDetalleForm,
  ): boolean {
    return this.participantesDetalleArray.controls.some(
      (group) =>
        group !== currentGroup &&
        !group.controls.es_titular.value &&
        group.controls.id_participante.value === participanteId,
    );
  }

  trackTransaccion(index: number, transaccion: TransaccionListado): number {
    return transaccion.id_transaccion;
  }

  trackDetalleTransaccion(index: number, row: DetalleTransaccionListadoRow): number {
    return row.detalle.id;
  }

  trackQuickPayMetodoGroup(index: number, group: QuickPayMetodoGroup): string {
    return group.key;
  }

  trackDetalleCuota(_index: number, detalle: ParticipanteDetalleListado): number {
    return detalle.id;
  }

  getDetalleRowParticipanteLabel(row: DetalleTransaccionListadoRow): string {
    if (row.detalle.es_titular) {
      return this.currentUserDisplayName;
    }

    return row.detalle.nombre_participante || 'Participante';
  }

  getDetalleRowCategoriaLabel(row: DetalleTransaccionListadoRow): string {
    const categoria = row.categoria?.trim() || 'Sin categoria';
    const subcategoria = row.subcategoria?.trim();
    return subcategoria ? `${categoria} / ${subcategoria}` : categoria;
  }

  getTransaccionTitle(
    transaccion: Pick<TransaccionListado, 'descripcion' | 'id_transaccion'> | null | undefined,
  ): string {
    const descripcion = transaccion?.descripcion;
    return typeof descripcion === 'string' && descripcion.length > 0
      ? descripcion
      : `Sin descripcion (${transaccion?.id_transaccion ?? '-'})`;
  }

  getTransaccionTableLabel(
    transaccion: Pick<TransaccionListado, 'descripcion' | 'id_transaccion'> | null | undefined,
  ): string {
    return `#${transaccion?.id_transaccion ?? '-'} - ${this.getTransaccionTitle(transaccion)}`;
  }

  getTransaccionModalTitle(
    transaccion: Pick<TransaccionListado, 'descripcion' | 'id_transaccion'> | null | undefined,
  ): string {
    const descripcion =
      typeof transaccion?.descripcion === 'string' && transaccion.descripcion.length > 0
        ? transaccion.descripcion
        : 'Sin descripcion';
    return `${descripcion} #${transaccion?.id_transaccion ?? '-'}`;
  }

  getDetailModalCuotas(): ParticipanteDetalleListado[] {
    if (!this.detailModalTransaccion) {
      return [];
    }

    return this.detailModalTransaccion.participantes_detalle ?? [];
  }

  getDetailModalMontoCuota(): number {
    return this.roundMoneyValue(
      this.getDetailModalCuotas()
        .filter((d) => d.numero_cuota === 1)
        .reduce((sum, d) => sum + Number(d.monto ?? 0), 0),
    );
  }

  getPaymentModalMontoCuota(): number {
    const transaccionOriginal =
      this.transacciones.find((item) => item.id_transaccion === this.paymentTransaccionId) ??
      this.paymentModalTransaccion;

    if (!transaccionOriginal) {
      return 0;
    }

    const transaccionConInteres = this.buildTransaccionWithInteresEnCuotas(transaccionOriginal);

    return this.roundMoneyValue(
      this.getParticipantesDetalleSafe(transaccionConInteres)
        .filter((d) => d.numero_cuota === 1)
        .reduce((sum, d) => sum + Number(d.monto ?? 0), 0),
    );
  }

  getDetailModalCuotaActual(): string {
    const userCuotas = this.getDetailModalCurrentUserCuotas()
      .slice()
      .sort((a, b) => a.numero_cuota - b.numero_cuota);
    if (userCuotas.length === 0) return '';
    const vigente =
      userCuotas.find((d) => {
        const estado = (d.nombre_estado ?? '').toLowerCase();
        return !estado.includes('pagado') && !estado.includes('anulado');
      }) ?? userCuotas[userCuotas.length - 1];
    return `${vigente.numero_cuota}/${vigente.total_cuotas}`;
  }

  getDetailModalMetodoPago(): string {
    const cuotaUsuario = this.getDetailModalCurrentUserCuotas()[0];
    return (
      cuotaUsuario?.nombre_forma_pago ||
      this.detailModalTransaccion?.nombre_forma_pago ||
      '-'
    );
  }

  getDetailModalCurrentUserCuotas(): ParticipanteDetalleListado[] {
    const esPropietario = this.detailModalTransaccion?.es_propietario ?? false;
    return this.getDetailModalCuotas().filter((d) =>
      this.isDetalleDelUsuarioLogueado(d, esPropietario),
    );
  }

  getDetailModalOtherParticipantGroups(): Array<{
    id_participante: number;
    nombre: string;
    cuotas: ParticipanteDetalleListado[];
  }> {
    const esPropietario = this.detailModalTransaccion?.es_propietario ?? false;
    const others = this.getDetailModalCuotas().filter(
      (d) => !this.isDetalleDelUsuarioLogueado(d, esPropietario),
    );
    const groupMap = new Map<
      number,
      { id_participante: number; nombre: string; cuotas: ParticipanteDetalleListado[] }
    >();
    for (const cuota of others) {
      if (!groupMap.has(cuota.id_participante)) {
        groupMap.set(cuota.id_participante, {
          id_participante: cuota.id_participante,
          nombre: cuota.nombre_participante?.trim() || '-',
          cuotas: [],
        });
      }
      groupMap.get(cuota.id_participante)!.cuotas.push(cuota);
    }
    return Array.from(groupMap.values());
  }

  toggleDetailParticipante(id: number): void {
    if (this.detailExpandedParticipanteIds.has(id)) {
      this.detailExpandedParticipanteIds.delete(id);
    } else {
      this.detailExpandedParticipanteIds.add(id);
    }
  }

  isDetailParticipanteExpanded(id: number): boolean {
    return this.detailExpandedParticipanteIds.has(id);
  }

  getDetailModalRelationText(
    transaccion: Pick<
      TransaccionListado,
      'pagocompartido' | 'participantes_detalle' | 'es_propietario' | 'titular'
    > | null | undefined,
  ): string {
    if (!transaccion?.pagocompartido) {
      return 'Titular';
    }

    if (!transaccion.es_propietario) {
      return `Recibido de: ${transaccion.titular?.trim() || 'Titular'}`;
    }

    const participantes = Array.from(
      new Set(
        this.getParticipantesDetalleSafe(transaccion)
          .filter((detalle) => !detalle.es_titular)
          .map((detalle) => detalle.nombre_participante?.trim() || 'Participante')
          .filter((value) => value.length > 0),
      ),
    );

    return participantes.length > 0
      ? `Compartido con: ${participantes.join(', ')}`
      : 'Titular';
  }

  getDetailModalSenderDisplay(
    transaccion: Pick<
      TransaccionListado,
      'pagocompartido' | 'participantes_detalle' | 'es_propietario' | 'titular'
    > | null | undefined,
  ): string {
    return this.getDetailModalRelationText(transaccion);
  }

  getDetailModalCuotasTotalPages(): number {
    return Math.max(
      1,
      Math.ceil(this.getDetailModalCurrentUserCuotas().length / this.cuotasPageSize),
    );
  }

  getDetailModalCuotasPageItems(): ParticipanteDetalleListado[] {
    const cuotas = this.getDetailModalCurrentUserCuotas();
    const startIndex = (this.detailModalCuotasPage - 1) * this.cuotasPageSize;

    return cuotas.slice(startIndex, startIndex + this.cuotasPageSize);
  }

  getDetailModalCuotasPageStart(): number {
    const totalCuotas = this.getDetailModalCurrentUserCuotas().length;

    if (totalCuotas === 0) {
      return 0;
    }

    return (this.detailModalCuotasPage - 1) * this.cuotasPageSize + 1;
  }

  getDetailModalCuotasPageEnd(): number {
    return Math.min(
      this.detailModalCuotasPage * this.cuotasPageSize,
      this.getDetailModalCurrentUserCuotas().length,
    );
  }

  changeDetailModalCuotasPage(delta: number): void {
    this.detailModalCuotasPage = Math.min(
      this.getDetailModalCuotasTotalPages(),
      Math.max(1, this.detailModalCuotasPage + delta),
    );
  }

  private getTransaccionAnularLabel(
    transaccion: Pick<
      TransaccionListado,
      'descripcion' | 'id_transaccion' | 'nombre_forma_pago'
    > | null | undefined,
  ): string {
    const descripcion = transaccion?.descripcion?.trim() || `#${transaccion?.id_transaccion ?? '-'}`;
    const metodoPago = transaccion?.nombre_forma_pago?.trim() || 'Sin metodo de pago';
    return `${descripcion} -${metodoPago}`;
  }

  get hasAppliedPagosInEditor(): boolean {
    return this.editorDetallesOriginales.some((detalle) =>
      this.detalleTienePagosAplicados(detalle),
    );
  }

  isCuotaBloqueadaEnEditor(
    group: ParticipanteDetalleForm,
    cuotaIndex: number,
  ): boolean {
    const detalle = this.getDetalleEditorPorCuota(group, cuotaIndex);
    return detalle ? this.detalleTienePagosAplicados(detalle) : false;
  }

  getCuotaDetalleEditor(
    group: ParticipanteDetalleForm,
    cuotaIndex: number,
  ): ParticipanteDetalleListado | null {
    const detalle = this.getDetalleEditorPorCuota(group, cuotaIndex);

    return detalle ? this.getDetalleWithAdjustedInteres(detalle) : null;
  }

  getPaymentGroupAccentColor(index: number): string {
    const accentPalette = ['#2f6fed', '#ea580c', '#7c3aed', '#0f766e', '#c2410c', '#be185d'];
    return accentPalette[index % accentPalette.length];
  }

  private getQuickPayMethodAccentPalette(
    metodoPagoId: number | null,
    metodoPagoNombre: string | null | undefined,
  ): QuickPayAccentPalette {
    const metodoNormalizado = this.normalizeText(metodoPagoNombre ?? '');

    if (metodoNormalizado.includes('efectivo')) {
      return {
        accent: '#16a34a',
        border: '#bbf7d0',
        soft: '#f0fdf4',
        glow: 'rgba(22, 163, 74, 0.10)',
        chipBorder: '#bbf7d0',
        chipBg: 'rgba(255, 255, 255, 0.94)',
        chipColor: '#166534',
        methodBorder: '#86efac',
        methodBg: '#dcfce7',
        methodColor: '#166534',
      };
    }

    if (
      metodoNormalizado.includes('credito') ||
      metodoNormalizado.includes('credit') ||
      metodoNormalizado.includes('tc') ||
      metodoNormalizado.includes('tarjeta')
    ) {
      return {
        accent: '#7c3aed',
        border: '#ddd6fe',
        soft: '#f5f3ff',
        glow: 'rgba(124, 58, 237, 0.10)',
        chipBorder: '#ddd6fe',
        chipBg: 'rgba(255, 255, 255, 0.94)',
        chipColor: '#5b21b6',
        methodBorder: '#d8b4fe',
        methodBg: '#f3e8ff',
        methodColor: '#7e22ce',
      };
    }

    if (metodoNormalizado.includes('debito') || metodoNormalizado.includes('débito')) {
      return {
        accent: '#2563eb',
        border: '#bfdbfe',
        soft: '#eff6ff',
        glow: 'rgba(37, 99, 235, 0.10)',
        chipBorder: '#bfdbfe',
        chipBg: 'rgba(255, 255, 255, 0.94)',
        chipColor: '#1d4ed8',
        methodBorder: '#93c5fd',
        methodBg: '#dbeafe',
        methodColor: '#1d4ed8',
      };
    }

    if (
      metodoNormalizado.includes('transfer') ||
      metodoNormalizado.includes('deposit') ||
      metodoNormalizado.includes('banco')
    ) {
      return {
        accent: '#0f766e',
        border: '#99f6e4',
        soft: '#f0fdfa',
        glow: 'rgba(15, 118, 110, 0.10)',
        chipBorder: '#99f6e4',
        chipBg: 'rgba(255, 255, 255, 0.94)',
        chipColor: '#0f766e',
        methodBorder: '#5eead4',
        methodBg: '#ccfbf1',
        methodColor: '#115e59',
      };
    }

    const paletteCycle: QuickPayAccentPalette[] = [
      {
        accent: '#7c3aed',
        border: '#ddd6fe',
        soft: '#f5f3ff',
        glow: 'rgba(124, 58, 237, 0.10)',
        chipBorder: '#ddd6fe',
        chipBg: 'rgba(255, 255, 255, 0.94)',
        chipColor: '#5b21b6',
        methodBorder: '#d8b4fe',
        methodBg: '#f3e8ff',
        methodColor: '#7e22ce',
      },
      {
        accent: '#2563eb',
        border: '#bfdbfe',
        soft: '#eff6ff',
        glow: 'rgba(37, 99, 235, 0.10)',
        chipBorder: '#bfdbfe',
        chipBg: 'rgba(255, 255, 255, 0.94)',
        chipColor: '#1d4ed8',
        methodBorder: '#93c5fd',
        methodBg: '#dbeafe',
        methodColor: '#1d4ed8',
      },
      {
        accent: '#0f766e',
        border: '#99f6e4',
        soft: '#f0fdfa',
        glow: 'rgba(15, 118, 110, 0.10)',
        chipBorder: '#99f6e4',
        chipBg: 'rgba(255, 255, 255, 0.94)',
        chipColor: '#0f766e',
        methodBorder: '#5eead4',
        methodBg: '#ccfbf1',
        methodColor: '#115e59',
      },
      {
        accent: '#ea580c',
        border: '#fed7aa',
        soft: '#fff7ed',
        glow: 'rgba(234, 88, 12, 0.10)',
        chipBorder: '#fed7aa',
        chipBg: 'rgba(255, 255, 255, 0.94)',
        chipColor: '#c2410c',
        methodBorder: '#fdba74',
        methodBg: '#ffedd5',
        methodColor: '#c2410c',
      },
    ];

    if (metodoPagoId === null) {
      return paletteCycle[0];
    }

    return paletteCycle[Math.abs(metodoPagoId) % paletteCycle.length];
  }

  getTipoTransaccionSign(
    transaccion: Pick<TransaccionListado, 'id_tipo_transaccion' | 'nombre_tipo_transaccion'>,
  ): string {
    const tipo = this.resolveTipoTransaccion(transaccion);

    if (tipo === 'credito') {
      return '+';
    }

    if (tipo === 'debito') {
      return '-';
    }

    return '';
  }

  getTipoTransaccionClass(
    transaccion: Pick<TransaccionListado, 'id_tipo_transaccion' | 'nombre_tipo_transaccion'>,
  ): string {
    const tipo = this.resolveTipoTransaccion(transaccion);

    if (tipo === 'credito') {
      return 'transaction-type-credito';
    }

    if (tipo === 'debito') {
      return 'transaction-type-debito';
    }

    return '';
  }

  getEstadoClass(nombreEstado: string | null | undefined): string {
    const estadoOriginal = this.normalizeText(nombreEstado ?? '');

    if (estadoOriginal === 'pago parcial') {
      return 'status-pill-parcial';
    }

    const estado = this.getNormalizedEstadoListado(nombreEstado ?? '');

    switch (estado) {
      case 'pendiente':
        return 'status-pill-pendiente';
      case 'anulado':
        return 'status-pill-anulada';
      case 'pagado':
        return 'status-pill-completado';
      case 'sin registro':
        return 'status-pill-sin-registro';
      default:
        return 'status-pill-default';
    }
  }

  private syncSelectedTransaccionWithFilters(): void {
    const filtered = this.filteredTransacciones;

    if (filtered.length === 0) {
      this.clearSelection(false);
      return;
    }

    if (
      this.paymentTransaccionId !== null &&
      !this.transacciones.some((item) => item.id_transaccion === this.paymentTransaccionId)
    ) {
      this.closePaymentModal();
    } else if (this.paymentTransaccionId !== null) {
      this.paymentModalTransaccion =
        this.transacciones.find(
          (item) => item.id_transaccion === this.paymentTransaccionId,
        ) ?? null;
    }

    if (
      this.editingTransaccionId !== null &&
      filtered.some((item) => item.id_transaccion === this.editingTransaccionId)
    ) {
      const currentSelection = filtered.find(
        (item) => item.id_transaccion === this.editingTransaccionId,
      );

      if (currentSelection) {
        this.selectedTransaccion = currentSelection;
        this.loadTransaccionIntoEditor(currentSelection, false);
      }

      return;
    }
  }

  private getParticipantesDetalleSafe(
    transaccion: Pick<TransaccionListado, 'participantes_detalle'> | null | undefined,
  ): ParticipanteDetalleListado[] {
    return Array.isArray(transaccion?.participantes_detalle)
      ? transaccion.participantes_detalle
      : [];
  }

  private getParticipantesDetalleForEditor(
    transaccion: Pick<TransaccionListado, 'participantes_detalle'> | null | undefined,
  ): ParticipanteDetalleListado[] {
    return this.getParticipantesDetalleSafe(transaccion)
      .filter((detalle) => detalle.id_estado !== ESTADO_TRANSACCION_ANULADA_ID)
      .map((detalle) => ({
        ...detalle,
        fecha_pago: this.normalizeDateOnly(detalle.fecha_pago),
        fecha_programada: this.normalizeDateOnly(detalle.fecha_programada),
      }));
  }

  private getParticipantesDetalleForPayment(
    transaccion: Pick<
      TransaccionListado,
      'es_propietario' | 'participantes_detalle'
    > | null | undefined,
  ): ParticipanteDetalleListado[] {
    const detalles = this.getParticipantesDetalleSafe(transaccion).filter(
      (detalle) => detalle.id_estado !== ESTADO_TRANSACCION_ANULADA_ID,
    );

    if (transaccion?.es_propietario) {
      return detalles;
    }

    const detallesAsociados = detalles.filter((detalle) =>
      this.isDetalleDelUsuarioLogueado(detalle, false),
    );

    return detallesAsociados.length > 0 ? detallesAsociados : detalles;
  }

  private getParticipantesDetalleParaQuickPayRows(
    transaccion: Pick<
      TransaccionListado,
      'es_propietario' | 'participantes_detalle'
    > | null | undefined,
  ): ParticipanteDetalleListado[] {
    const detalles = this.getParticipantesDetalleSafe(transaccion).filter(
      (detalle) => detalle.id_estado !== ESTADO_TRANSACCION_ANULADA_ID,
    );

    const detallesAsociados = detalles.filter((detalle) =>
      this.isDetalleDelUsuarioLogueado(detalle, !!transaccion?.es_propietario),
    );

    return detallesAsociados.length > 0 ? detallesAsociados : detalles;
  }

  private syncQuickPayBulkSelectionWithFilters(): void {
    this.refreshQuickPayFilterState(true);
  }

  private refreshQuickPayFilterState(syncSelectionWithFilters = false): void {
    this.detalleTransaccionRowsCache = this.buildDetalleTransaccionRows();
    this.filteredDetalleTransaccionesCache = this.computeFilteredDetalleTransacciones();

    if (syncSelectionWithFilters && this.isDetalleViewMode && this.selectedQuickPayDetalleIds.size > 0) {
      const visibleDetalleIds = new Set(
        this.filteredDetalleTransaccionesCache
          .filter((row) => row.quickPayCanSelectBase)
          .map((row) => row.detalle.id),
      );

      this.selectedQuickPayDetalleIds = new Set(
        Array.from(this.selectedQuickPayDetalleIds).filter((id) => visibleDetalleIds.has(id)),
      );
    }

    this.quickPayFilteredSubtotalSummaryCache =
      this.computeQuickPayFilteredSubtotalSummary(this.filteredDetalleTransaccionesCache);
    this.quickPayDetalleMetodoGroupsCache = this.buildQuickPayDetalleMetodoGroups(
      this.filteredDetalleTransaccionesCache,
    );
    this.refreshQuickPaySelectionState();
  }

  private refreshQuickPaySelectionState(): void {
    if (!this.isDetalleViewMode) {
      this.quickPayBulkSelectedRowsCache = [];
      this.quickPayBulkSelectedCountCache = 0;
      this.quickPayBulkSelectedMontoTotalCache = 0;
      this.quickPayBulkSelectedMetodoPagoIdCache = null;
      this.quickPayBulkSelectedMetodoPagoCache = '';
      this.canApplyQuickPayBulkCache = false;
      this.quickPayBulkAccentPalette = this.resolveQuickPayBulkAccentPalette();
      return;
    }

    const selectedRows: DetalleTransaccionListadoRow[] = [];
    let selectedMontoTotal = 0;
    let selectedMetodoPagoId: number | null = null;
    let selectedMetodoPagoNombre = '';
    const groupCounts = new Map<string, { selectable: number; selected: number }>();

    for (const group of this.quickPayDetalleMetodoGroupsCache) {
      groupCounts.set(group.key, { selectable: 0, selected: 0 });
    }

    for (const row of this.filteredDetalleTransaccionesCache) {
      const rowIsSelected = this.selectedQuickPayDetalleIds.has(row.detalle.id);

      if (rowIsSelected) {
        selectedRows.push(row);
        selectedMontoTotal += Number(row.detalle.saldo_pendiente ?? 0);

        if (selectedMetodoPagoId === null) {
          selectedMetodoPagoId = row.quickPayMetodoPagoId;
          selectedMetodoPagoNombre = row.quickPayMetodoPagoNombre;
        }
      }

      row.quickPaySelected = rowIsSelected;
    }

    this.quickPayBulkSelectedRowsCache = selectedRows;
    this.quickPayBulkSelectedCountCache = selectedRows.length;
    this.quickPayBulkSelectedMontoTotalCache = this.roundMoneyValue(selectedMontoTotal);
    this.quickPayBulkSelectedMetodoPagoIdCache = selectedMetodoPagoId;
    this.quickPayBulkSelectedMetodoPagoCache = selectedMetodoPagoNombre;
    this.quickPayBulkAccentPalette = this.resolveQuickPayBulkAccentPalette();

    for (const row of this.filteredDetalleTransaccionesCache) {
      const rowCanSelect = this.canSelectQuickPayDetalleForMethod(
        row,
        this.quickPayBulkSelectedMetodoPagoIdCache,
      );
      const currentGroupCounts = groupCounts.get(row.quickPayGroupKey);

      row.quickPaySelectionDisabled = this.applyingBulkQuickPayments || !rowCanSelect;
      row.quickPaySelectionHint = this.getQuickPayDetalleSelectionHintText(
        row,
        this.quickPayBulkSelectedMetodoPagoCache,
      );

      if (!currentGroupCounts) {
        continue;
      }

      if (row.quickPayCanSelectBase) {
        currentGroupCounts.selectable += 1;
      }

      if (row.quickPaySelected) {
        currentGroupCounts.selected += 1;
      }
    }

    this.canApplyQuickPayBulkCache =
      this.isDetalleViewMode &&
      !this.applyingBulkQuickPayments &&
      this.quickPayBulkSelectedCountCache > 0 &&
      !this.hasMixedQuickPayBulkMethods(this.quickPayBulkSelectedRowsCache);

    for (const group of this.quickPayDetalleMetodoGroupsCache) {
      const counts = groupCounts.get(group.key) ?? { selectable: 0, selected: 0 };
      group.selectableCount = counts.selectable;
      group.selectedCount = counts.selected;
      group.selectionDisabled =
        this.applyingBulkQuickPayments ||
        counts.selectable === 0 ||
        (this.quickPayBulkSelectedMetodoPagoIdCache !== null &&
          group.metodoPagoId !== this.quickPayBulkSelectedMetodoPagoIdCache);
      group.fullySelected = counts.selectable > 0 && counts.selected === counts.selectable;
      group.partiallySelected = counts.selected > 0 && !group.fullySelected;
    }
  }

  private computeQuickPayFilteredSubtotalSummary(
    rows: DetalleTransaccionListadoRow[],
  ): QuickPaySubtotalSummary {
    const summary = rows.reduce<QuickPaySubtotalSummary>(
      (totals, row) => {
        const detalleAjustado = this.getDetalleWithAdjustedInteres(row.detalle);
        const saldoPendiente = Number(detalleAjustado.saldo_pendiente ?? 0);
        const montoPagado = this.getDetalleMontoPagadoTotal(detalleAjustado);

        totals.pagado += montoPagado;

        if (this.isIngresoDetalleRow(row)) {
          totals.ingresos += montoPagado;
          return totals;
        }

        totals.pendiente += saldoPendiente;
        return totals;
      },
      { pendiente: 0, pagado: 0, ingresos: 0 },
    );

    return {
      pendiente: this.roundMoneyValue(summary.pendiente),
      pagado: this.roundMoneyValue(summary.pagado),
      ingresos: this.roundMoneyValue(summary.ingresos),
    };
  }

  private isDetalleDelUsuarioLogueado(
    detalle: ParticipanteDetalleListado,
    transaccionEsPropietario = false,
  ): boolean {
    const currentUserParticipanteId = this.currentUserParticipante?.id_participante ?? null;

    return (
      detalle.id_usuario_relacionado === this.currentUserIdValue ||
      (currentUserParticipanteId !== null &&
        detalle.id_participante === currentUserParticipanteId) ||
      (transaccionEsPropietario && detalle.es_titular)
    );
  }

  private buildDetalleTransaccionRows(): DetalleTransaccionListadoRow[] {
    return this.transacciones.flatMap((transaccion) =>
      this.getParticipantesDetalleParaQuickPayRows(transaccion).map((detalle) => {
        const quickPayMetodoPagoId = this.resolveQuickPayMetodoPagoId(detalle, transaccion);
        const quickPayMetodoPagoNombre = this.resolveQuickPayMetodoPagoNombre(
          detalle,
          transaccion,
          quickPayMetodoPagoId,
        );
        const quickPayGroupKey = this.getQuickPayMetodoGroupKey({
          metodoPagoId: quickPayMetodoPagoId,
          metodoPagoNombre: quickPayMetodoPagoNombre,
        });
        const quickPayCanPagar =
          this.canPagarTransaccion(transaccion) &&
          detalle.id_estado !== ESTADO_TRANSACCION_ANULADA_ID &&
          this.toCents(Number(detalle.saldo_pendiente ?? 0)) > 0;
        const quickPayIsOwnedByCurrentUser = this.isDetalleDelUsuarioLogueado(
          detalle,
          transaccion.es_propietario,
        );

        return {
          transaccion,
          detalle,
          nombre_mostrado: this.getQuickPayParticipanteGridName(detalle),
          descripcion: this.getTransaccionTitle(transaccion),
          metodo_pago: transaccion.nombre_forma_pago ?? detalle.nombre_forma_pago ?? null,
          quickPayGroupKey,
          quickPayMetodoPagoId,
          quickPayMetodoPagoNombre,
          quickPayCanPagar,
          quickPayCanSelectBase:
            quickPayCanPagar && quickPayMetodoPagoId !== null && quickPayIsOwnedByCurrentUser,
          quickPayIsOwnedByCurrentUser,
          quickPaySelected: false,
          quickPaySelectionDisabled: true,
          quickPaySelectionHint: '',
          quickPayIsVencido: this.isDetalleVencido(detalle),
          quickPayFechaProgramadaLabel: this.formatQuickPayDateLabel(detalle.fecha_programada),
          quickPayFechaPagoLabel: this.formatQuickPayDateLabel(detalle.fecha_pago),
          quickPayMontoLabel: this.formatQuickPayCurrencyLabel(detalle.monto),
          quickPayInteresPendienteLabel: this.formatQuickPayCurrencyLabel(detalle.interes_pendiente),
          quickPayMontoPagadoLabel: this.formatQuickPayCurrencyLabel(detalle.monto_pagado),
          quickPaySaldoPendienteLabel: this.formatQuickPayCurrencyLabel(detalle.saldo_pendiente),
          quickPayEstadoClass: this.getEstadoClass(detalle.nombre_estado || 'Sin estado'),
          quickPayEstadoLabel: this.getEstadoDisplayLabel(detalle.nombre_estado),
          quickPayTitle: this.getTransaccionTitle(transaccion),
          categoria: transaccion.nombre_categoria ?? null,
          subcategoria: transaccion.nombre_subcategoria ?? null,
        };
      }),
    );
  }

  private getQuickPayParticipanteGridName(detalle: ParticipanteDetalleListado): string {
    if (typeof detalle.nombre_participante === 'string' && detalle.nombre_participante.length > 0) {
      return detalle.nombre_participante;
    }

    return (
      this.currentUserParticipante?.nombre_participante ||
      this.currentUserProfileValue.fullName ||
      this.currentUserProfileValue.username ||
      'Participante'
    );
  }

  getQuickPayParticipanteDisplay(row: DetalleTransaccionListadoRow): string {
    if (row.detalle.es_titular) {
      return 'Titular';
    }

    if (!row.transaccion.es_propietario) {
      return this.getFirstName(row.transaccion.titular) || 'Titular';
    }

    return this.getFirstName(row.nombre_mostrado);
  }

  private getFirstName(fullName: string | null | undefined): string {
    return fullName?.trim().split(/\s+/)[0] ?? '';
  }

  private hasPriorityPendingSchedule(transaccion: TransaccionListado): boolean {
    const today = this.getDateOnlyValue(new Date());
    const limitDate = this.addDays(today, this.getPriorityWindowDays());

    return this.getParticipantesDetalleSafe(transaccion).some((detalle) => {
      if (detalle.id_estado === ESTADO_TRANSACCION_ANULADA_ID) {
        return false;
      }

      if (Number(detalle.saldo_pendiente ?? 0) <= 0) {
        return false;
      }

      const scheduledDate = this.parseIsoDateOnly(detalle.fecha_programada);

      if (!scheduledDate) {
        return false;
      }

      return scheduledDate >= today && scheduledDate <= limitDate;
    });
  }

  private hasOverduePendingSchedule(transaccion: TransaccionListado): boolean {
    return this.getParticipantesDetalleSafe(transaccion).some((detalle) =>
      this.isDetalleVencido(detalle),
    );
  }

  private isDetallePrioritario(detalle: ParticipanteDetalleListado): boolean {
    if (detalle.id_estado === ESTADO_TRANSACCION_ANULADA_ID) {
      return false;
    }

    if (Number(detalle.saldo_pendiente ?? 0) <= 0) {
      return false;
    }

    const today = this.getDateOnlyValue(new Date());
    const limitDate = this.addDays(today, this.getPriorityWindowDays());
    const scheduledDate = this.parseIsoDateOnly(detalle.fecha_programada);

    if (!scheduledDate) {
      return false;
    }

    return scheduledDate >= today && scheduledDate <= limitDate;
  }

  private compareDetalleRowsByFechaProgramada(
    left: DetalleTransaccionListadoRow,
    right: DetalleTransaccionListadoRow,
  ): number {
    const leftDate = this.parseIsoDateOnly(left.detalle.fecha_programada);
    const rightDate = this.parseIsoDateOnly(right.detalle.fecha_programada);

    if (leftDate && rightDate && leftDate.getTime() !== rightDate.getTime()) {
      return leftDate.getTime() - rightDate.getTime();
    }

    if (leftDate && !rightDate) {
      return -1;
    }

    if (!leftDate && rightDate) {
      return 1;
    }

    if (left.transaccion.id_transaccion !== right.transaccion.id_transaccion) {
      return left.transaccion.id_transaccion - right.transaccion.id_transaccion;
    }

    if (left.detalle.numero_cuota !== right.detalle.numero_cuota) {
      return left.detalle.numero_cuota - right.detalle.numero_cuota;
    }

    return left.detalle.id - right.detalle.id;
  }

  private compareDetalleRowsByFechaTransaccion(
    left: DetalleTransaccionListadoRow,
    right: DetalleTransaccionListadoRow,
  ): number {
    const leftTx = this.parseIsoDateOnly(left.transaccion.fecha);
    const rightTx = this.parseIsoDateOnly(right.transaccion.fecha);

    if (leftTx && rightTx && leftTx.getTime() !== rightTx.getTime()) {
      return rightTx.getTime() - leftTx.getTime();
    }

    if (leftTx && !rightTx) return -1;
    if (!leftTx && rightTx) return 1;

    const leftProg = this.parseIsoDateOnly(left.detalle.fecha_programada);
    const rightProg = this.parseIsoDateOnly(right.detalle.fecha_programada);

    if (leftProg && rightProg && leftProg.getTime() !== rightProg.getTime()) {
      return rightProg.getTime() - leftProg.getTime();
    }

    if (left.transaccion.id_transaccion !== right.transaccion.id_transaccion) {
      return right.transaccion.id_transaccion - left.transaccion.id_transaccion;
    }

    if (left.detalle.numero_cuota !== right.detalle.numero_cuota) {
      return left.detalle.numero_cuota - right.detalle.numero_cuota;
    }

    return left.detalle.id - right.detalle.id;
  }

  private compareQuickPayMetodoGroups(
    left: QuickPayMetodoGroup,
    right: QuickPayMetodoGroup,
  ): number {
    const leftDate = this.parseIsoDateOnly(left.oldestScheduledDate);
    const rightDate = this.parseIsoDateOnly(right.oldestScheduledDate);

    if (leftDate && rightDate && leftDate.getTime() !== rightDate.getTime()) {
      return leftDate.getTime() - rightDate.getTime();
    }

    if (leftDate && !rightDate) {
      return -1;
    }

    if (!leftDate && rightDate) {
      return 1;
    }

    return left.metodoPagoNombre.localeCompare(right.metodoPagoNombre);
  }

  private getQuickPayMetodoGroupKey(
    group: Pick<QuickPayMetodoGroup, 'metodoPagoId' | 'metodoPagoNombre'>,
  ): string {
    return group.metodoPagoId === null
      ? `sin-metodo:${group.metodoPagoNombre}`
      : `metodo:${group.metodoPagoId}`;
  }

  private formatQuickPayDateLabel(value: string | null | undefined): string {
    const normalizedValue = this.normalizeDateOnly(value);

    if (!normalizedValue) {
      return '-';
    }

    const [year, month, day] = normalizedValue.split('-');
    return `${day}/${month}/${year}`;
  }

  private formatQuickPayCurrencyLabel(value: number | null | undefined): string {
    const normalizedValue = Number(value ?? 0);
    return `$${this.quickPayCurrencyFormatter.format(normalizedValue)}`;
  }

  private getPriorityWindowDays(): number {
    if (!this.isDetalleViewMode) {
      return PRIORITY_WINDOW_DAYS;
    }

    const selectedDays = Number(this.filtrosForm.controls.diasPrioridad.value ?? QUICK_PAY_DEFAULT_PRIORITY_WINDOW_DAYS);

    if (!Number.isFinite(selectedDays)) {
      return QUICK_PAY_DEFAULT_PRIORITY_WINDOW_DAYS;
    }

    return Math.min(30, Math.max(1, Math.trunc(selectedDays)));
  }

  private detalleTienePagosAplicados(
    detalle: Pick<ParticipanteDetalleListado, 'monto_pagado' | 'interes_pagado' | 'fecha_pago'>,
  ): boolean {
    return (
      this.toCents(Number(detalle.monto_pagado ?? 0)) > 0 ||
      this.toCents(Number(detalle.interes_pagado ?? 0)) > 0 ||
      Boolean(detalle.fecha_pago)
    );
  }

  private getDetalleEditorPorCuota(
    group: ParticipanteDetalleForm,
    cuotaIndex: number,
  ): ParticipanteDetalleListado | null {
    const participanteId = group.controls.id_participante.value;

    if (participanteId === null || participanteId === undefined) {
      return null;
    }

    const cuotasParticipante = this.editorDetallesOriginales
      .filter((detalle) => detalle.id_participante === participanteId)
      .sort((left, right) => left.numero_cuota - right.numero_cuota);

    return cuotasParticipante[cuotaIndex] ?? null;
  }

  private shouldEnableParticipantesEditor(
    transaccion: Pick<TransaccionListado, 'pagocompartido'>,
    detalles: ParticipanteDetalleListado[],
  ): boolean {
    if (transaccion.pagocompartido) {
      return true;
    }

    return detalles.some(
      (detalle) =>
        !detalle.es_titular ||
        detalle.total_cuotas > 1 ||
        detalle.numero_cuota > 1 ||
        this.isZeroBalancePlannedDetail(detalle),
    );
  }

  private isZeroBalancePlannedDetail(detalle: ParticipanteDetalleListado): boolean {
    return Boolean(
      !this.detalleTienePagosAplicados(detalle) &&
      this.toCents(Number(detalle.monto ?? 0)) === 0 &&
      this.toCents(Number(detalle.saldo_pendiente ?? 0)) === 0,
    );
  }

  private refreshPagosDetalleGroups(): void {
    const groups = new Map<number, PagoDetalleGroupView>();

    for (const cuota of this.pagosDetalleControls) {
      const participanteId = cuota.controls.id_participante.value;
      const existingGroup = groups.get(participanteId);

      if (existingGroup) {
        existingGroup.cuotas.push(cuota);
        existingGroup.saldo_pendiente_total = this.normalizeDecimalValue(
          existingGroup.saldo_pendiente_total + cuota.controls.saldo_pendiente.value,
        );
        existingGroup.monto_pagado_total = this.normalizeDecimalValue(
          existingGroup.monto_pagado_total + cuota.controls.monto_pagado.value,
        );
        continue;
      }

      groups.set(participanteId, {
        id_participante: participanteId,
        nombre_mostrado: cuota.controls.nombre_mostrado.value,
        es_titular: cuota.controls.es_titular.value,
        cuotas: [cuota],
        saldo_pendiente_total: cuota.controls.saldo_pendiente.value,
        monto_pagado_total: cuota.controls.monto_pagado.value,
      });
    }

    this.pagosDetalleGroupViews = Array.from(groups.values());
  }

  private summarizeDetallesForEditor(
    detalles: ParticipanteDetalleListado[],
  ): ParticipanteDetalleListado[] {
    const detallesPorParticipante = new Map<number, ParticipanteDetalleListado>();

    for (const detalle of detalles) {
      const existing = detallesPorParticipante.get(detalle.id_participante);

      if (existing) {
        existing.monto = this.normalizeDecimalValue(existing.monto + detalle.monto);
        existing.monto_pagado = this.normalizeDecimalValue(
          existing.monto_pagado + detalle.monto_pagado,
        );
        existing.saldo_pendiente = this.normalizeDecimalValue(
          existing.saldo_pendiente + detalle.saldo_pendiente,
        );
        existing.total_cuotas += 1;
        continue;
      }

      detallesPorParticipante.set(detalle.id_participante, {
        ...detalle,
        numero_cuota: 1,
        total_cuotas: 1,
      });
    }

    return Array.from(detallesPorParticipante.values());
  }

  private getCuotasForParticipante(
    detalles: ParticipanteDetalleListado[],
    participanteId: number,
  ): CuotaPayload[] {
    return detalles
      .filter((detalle) => detalle.id_participante === participanteId)
      .sort((left, right) => left.numero_cuota - right.numero_cuota)
      .map((detalle) => ({
        monto: this.normalizeDecimalValue(Number(detalle.monto ?? 0)),
        fecha_programada: this.normalizeDateOnly(detalle.fecha_programada) || null,
      }));
  }

  private resolveEditorMontoBase(
    transaccion: TransaccionListado,
    detalles: ParticipanteDetalleListado[],
    incomeCuotasMode: ModoCuotas,
  ): number {
    if (!this.isCreditoTransaccion(transaccion)) {
      return transaccion.monto;
    }

    if (incomeCuotasMode === 'divididas') {
      return this.normalizeDecimalValue(Number(transaccion.monto ?? 0));
    }

    const cuotaTitular =
      [...detalles]
        .sort((left, right) => left.numero_cuota - right.numero_cuota)
        .find((detalle) => detalle.es_titular) ?? detalles[0];

    return this.normalizeDecimalValue(Number(cuotaTitular?.monto ?? transaccion.monto ?? 0));
  }

  private inferEditorCuotasMode(cuotas: CuotaPayload[]): ModoCuotas {
    if (cuotas.length <= 1) {
      return 'divididas';
    }

    const primerMontoCentavos = this.toCents(
      this.normalizeDecimalValue(Number(cuotas[0]?.monto ?? 0)),
    );

    return cuotas.every(
      (cuota) =>
        this.toCents(this.normalizeDecimalValue(Number(cuota.monto ?? 0))) ===
        primerMontoCentavos,
    )
      ? 'fijas'
      : 'divididas';
  }

  private shouldStartEditingSharedExpenseWithDividedAmount(
    transaccion: Pick<TransaccionListado, 'pagocompartido' | 'id_tipo_transaccion' | 'nombre_tipo_transaccion'>,
    detalles: ParticipanteDetalleListado[],
  ): boolean {
    if (this.resolveTipoTransaccion(transaccion) === 'credito') {
      return false;
    }

    if (transaccion.pagocompartido || detalles.some((detalle) => !detalle.es_titular)) {
      return true;
    }

    const titular = detalles.find((detalle) => detalle.es_titular) ?? detalles[0];

    if (!titular) {
      return true;
    }

    return (
      this.inferEditorCuotasMode(
        this.getCuotasForParticipante(this.editorDetallesOriginales, titular.id_participante),
      ) === 'divididas'
    );
  }

  private resolveEditorParticipanteMontoBase(
    transaccion: TransaccionListado,
    detalle: ParticipanteDetalleListado,
    cuotas: CuotaPayload[],
    modoCuotas: ModoCuotas,
  ): number {
    const montoTotal = this.normalizeDecimalValue(Number(detalle.monto ?? 0));

    if (detalle.es_titular && this.isCreditoTransaccion(transaccion)) {
      return montoTotal;
    }

    if (modoCuotas !== 'fijas') {
      return montoTotal;
    }

    return this.normalizeDecimalValue(Number(cuotas[0]?.monto ?? montoTotal));
  }

  private inferIncomeCuotasMode(
    transaccion: TransaccionListado,
    detalles: ParticipanteDetalleListado[],
  ): ModoCuotas {
    if (!this.isCreditoTransaccion(transaccion)) {
      return 'divididas';
    }

    const cuotasTitular = [...detalles]
      .filter((detalle) => detalle.es_titular)
      .sort((left, right) => left.numero_cuota - right.numero_cuota);

    if (cuotasTitular.length <= 1) {
      return 'fijas';
    }

    const primerMontoCentavos = this.toCents(
      this.normalizeDecimalValue(Number(cuotasTitular[0]?.monto ?? 0)),
    );

    return cuotasTitular.every(
      (cuota) =>
        this.toCents(this.normalizeDecimalValue(Number(cuota.monto ?? 0))) ===
        primerMontoCentavos,
    )
      ? 'fijas'
      : 'divididas';
  }

  private inferProgramacionConfig(
    cuotas: CuotaPayload[],
    fechaBaseIso: string,
  ): { tipo: ProgramacionCuotaTipo; dia: number | null } {
    if (cuotas.length <= 1) {
      return { tipo: 'ninguna', dia: null };
    }

    const fechasProgramadas = cuotas
      .map((cuota) => this.normalizeDateOnly(cuota.fecha_programada))
      .filter(Boolean) as string[];

    return this.inferProgramacionFromFechas(
      fechasProgramadas,
      fechaBaseIso,
      cuotas.length,
    );
  }

  private inferProgramacionFromFechas(
    fechasProgramadas: string[],
    fechaBaseIso: string,
    cantidadCuotas = fechasProgramadas.length,
  ): { tipo: ProgramacionCuotaTipo; dia: number | null } {
    const fechasNormalizadas = fechasProgramadas
      .map((value) => this.normalizeDateOnly(value))
      .filter(Boolean);

    if (cantidadCuotas <= 1) {
      return { tipo: 'ninguna', dia: null };
    }

    if (fechasNormalizadas.length !== cantidadCuotas) {
      return { tipo: 'dia_mes', dia: this.getDefaultDiaProgramado() };
    }

    const quincenales = this.buildFechasQuincenales(fechaBaseIso, cantidadCuotas);
    if (this.areProgramadasEqual(fechasNormalizadas, quincenales)) {
      return { tipo: 'quincenal', dia: null };
    }

    const finMes = this.buildFechasFinMes(fechaBaseIso, cantidadCuotas);
    if (this.areProgramadasEqual(fechasNormalizadas, finMes)) {
      return { tipo: 'fin_mes', dia: null };
    }

    for (const dia of this.diasProgramacion) {
      const fechasDiaMes = this.buildFechasDiaMes(fechaBaseIso, cantidadCuotas, dia);

      if (this.areProgramadasEqual(fechasNormalizadas, fechasDiaMes)) {
        return { tipo: 'dia_mes', dia };
      }
    }

    return { tipo: 'ninguna', dia: null };
  }

  private areProgramadasEqual(left: string[], right: string[]): boolean {
    return left.length === right.length && left.every((value, index) => value === right[index]);
  }

  private async applyPagosToCurrentTransaction(
    payload: ApplyPagosPayload,
    successMessage: string,
    fallbackErrorMessage: string,
    cuotasActualizadas?: Array<{ id_detalle: number; monto: number }>,
  ): Promise<void> {
    if (!this.isEditing || this.editingTransaccionId === null) {
      return;
    }

    if (cuotasActualizadas && cuotasActualizadas.length > 0) {
      payload.cuotas_actualizadas = cuotasActualizadas;
    } else {
      delete payload.cuotas_actualizadas;
    }

    await firstValueFrom(
      this.http
        .patch(`${this.apiUrl}/${this.editingTransaccionId}/aplicar-pagos`, payload, {
          params: { id_usuario: this.currentUserIdValue },
        })
        .pipe(timeout(10000)),
    );

    this.successMessage = successMessage;
    await this.alerts.success('Pago aplicado', this.successMessage);

    try {
      await this.loadTransacciones();

      if (this.isDetalleViewMode) {
        const shouldReturnToDashboard = this.cameFromDashboardReminder;
        this.closePaymentModal();
        this.clearSelection(false);

        if (shouldReturnToDashboard) {
          await this.router.navigate(['/dashboard']);
        }
      }
    } catch (error) {
      this.errorMessage = this.getErrorMessage(error, fallbackErrorMessage);
      throw error;
    }
  }

  private refreshParticipantesMontos(): void {
    if (this.isEditingIncomeMode) {
      const titularGroup = this.titularDetalleGroup;

      if (titularGroup) {
        this.syncCuotasWithMonto(titularGroup);
      }

      return;
    }

    if (this.isEditingSharedExpenseMode) {
      const participantesAdicionales = this.getAdditionalParticipants();

      participantesAdicionales.forEach((group) => {
        if (
          this.isGroupAmountManual(group) ||
          group.controls.porcentaje.value === null ||
          group.controls.porcentaje.value === undefined
        ) {
          return;
        }

        this.updateMontoFromPorcentaje(group, false);
      });

      if (participantesAdicionales.length > 0) {
        this.syncSharedExpenseTitularResidual();
      } else if (this.titularDetalleGroup) {
        this.syncCuotasWithMonto(this.titularDetalleGroup);
      }

      this.syncCalculatedExpenseMontoForEdit();
      return;
    }

    const participantesAdicionales = this.getAdditionalParticipants();

    participantesAdicionales.forEach((group) => {
      if (
        this.isGroupAmountManual(group) ||
        group.controls.porcentaje.value === null ||
        group.controls.porcentaje.value === undefined
      ) {
        return;
      }

      this.updateMontoFromPorcentaje(group, false);
    });

    if (participantesAdicionales.length > 0) {
      this.rebalanceTitularParticipation();
    }
  }

  private maxTwoDecimalsValidator(): ValidatorFn {
    return (control: AbstractControl): ValidationErrors | null => {
      const value = control.value;

      if (value === null || value === undefined || value === '') {
        return null;
      }

      return /^\d+(\.\d{1,2})?$/.test(String(value)) ? null : { maxTwoDecimals: true };
    };
  }

  private maxSixDecimalsValidator(): ValidatorFn {
    return (control: AbstractControl): ValidationErrors | null => {
      const value = control.value;

      if (value === null || value === undefined || value === '') {
        return null;
      }

      return /^\d+(\.\d{1,6})?$/.test(String(value)) ? null : { maxSixDecimals: true };
    };
  }

  private wholeNumberValidator(): ValidatorFn {
    return (control: AbstractControl): ValidationErrors | null => {
      const value = control.value;

      if (value === null || value === undefined || value === '') {
        return null;
      }

      return Number.isInteger(Number(value)) ? null : { wholeNumber: true };
    };
  }

  private toCents(value: number): number {
    return Math.round(value * 100);
  }

  private centsToAmount(value: number): number {
    return Number((value / 100).toFixed(2));
  }

  private normalizeDecimalValue(value: number): number {
    return this.centsToAmount(Math.round(Math.max(0, value) * 100));
  }

  private roundMoneyValue(value: number): number {
    return this.centsToAmount(this.toCents(Math.max(0, value)));
  }

  private isIncomeTitularGroup(group: ParticipanteDetalleForm): boolean {
    return this.isEditingIncomeMode && group.controls.es_titular.value;
  }

  private updateIncomeTitularMonto(
    group: ParticipanteDetalleForm,
    cantidadCuotas = Math.max(1, Math.trunc(Number(group.controls.cantidad_cuotas.value ?? 1))),
  ): void {
    if (!this.isIncomeTitularGroup(group)) {
      return;
    }

    const montoBase = this.normalizeDecimalValue(
      Number(this.transaccionForm.controls.monto.value ?? 0),
    );
    const montoTotalProgramado = this.isFixedCuotasMode(group)
      ? this.normalizeDecimalValue(montoBase * cantidadCuotas)
      : montoBase;

    group.controls.monto.setValue(montoTotalProgramado, { emitEvent: false });
    group.controls.monto.updateValueAndValidity({ emitEvent: false });
  }

  private syncCuotasPage(group: ParticipanteDetalleForm): void {
    const totalPages = this.getCuotasTotalPages(group);
    const currentPage = this.cuotasPageByGroup.get(group) ?? 1;

    this.cuotasPageByGroup.set(group, Math.min(Math.max(1, currentPage), totalPages));
  }

  private getCuotaMontoForPayload(
    group: ParticipanteDetalleForm,
    cuotaGroup: CuotaMontoForm,
    cuotaIndex: number,
  ): number {
    if (!this.isCuotaBloqueadaEnEditor(group, cuotaIndex)) {
      return this.normalizeDecimalValue(Number(cuotaGroup.controls.monto.value ?? 0));
    }

    const detalle = this.getDetalleEditorPorCuota(group, cuotaIndex);

    if (!detalle) {
      return this.normalizeDecimalValue(Number(cuotaGroup.controls.monto.value ?? 0));
    }

    return this.normalizeDecimalValue(Number(detalle.monto ?? 0));
  }

  private getCuotasBloqueadasTotalCentavos(group: ParticipanteDetalleForm): number {
    return this.getCuotasArray(group).controls.reduce(
      (sum, cuotaGroup, index) =>
        sum +
        (this.isCuotaBloqueadaEnEditor(group, index)
          ? this.toCents(this.getCuotaMontoForPayload(group, cuotaGroup, index))
          : 0),
      0,
    );
  }

  private sanitizeMoneyInputValue(value: string): string {
    const sanitizedValue = value.replace(/,/g, '.').replace(/[^0-9.]/g, '');
    const [integerPart, ...decimalParts] = sanitizedValue.split('.');
    const decimalPart = decimalParts.join('').slice(0, 2);

    return decimalParts.length > 0
      ? `${integerPart || '0'}.${decimalPart}`
      : integerPart;
  }

  private sanitizePercentageInputValue(value: string): string {
    const sanitizedValue = value.replace(/,/g, '.').replace(/[^0-9.]/g, '');
    const [integerPart, ...decimalParts] = sanitizedValue.split('.');
    const decimalPart = decimalParts.join('').slice(0, 6);

    return decimalParts.length > 0
      ? `${integerPart || '0'}.${decimalPart}`
      : integerPart;
  }

  private isMoneyInputPendingDecimal(event?: Event): boolean {
    const input = event?.target as HTMLInputElement | null;
    const rawValue = input?.value ?? '';

    return rawValue.endsWith('.') || rawValue.endsWith(',');
  }

  private isPercentageInputPendingDecimal(event?: Event): boolean {
    const input = event?.target as HTMLInputElement | null;
    const rawValue = input?.value ?? '';

    return rawValue.endsWith('.') || rawValue.endsWith(',');
  }

  private sanitizePercentageInput(group: ParticipanteDetalleForm, event?: Event): void {
    const input = event?.target as HTMLInputElement | null;

    if (!input) {
      return;
    }

    const sanitizedValue = this.sanitizePercentageInputValue(input.value);

    if (input.value !== sanitizedValue) {
      input.value = sanitizedValue;
    }

    group.controls.porcentaje.setValue(
      (sanitizedValue === '' ? null : sanitizedValue) as unknown as number | null,
      { emitEvent: false },
    );
    group.controls.porcentaje.updateValueAndValidity({ emitEvent: false });
  }

  private formatMoneyInputValue(value: number): string {
    return value.toFixed(2).replace(/\.?0+$/, '');
  }

  formatMoneyFixedDisplay(value: number | null | undefined): string {
    return Number(value ?? 0).toFixed(2);
  }

  private getMontoAplicarNumericValue(group: PagoDetalleForm): number {
    const rawValue = this.getMontoAplicarDisplay(group);

    if (rawValue === null || rawValue === undefined || rawValue === '') {
      return 0;
    }

    return this.normalizeDecimalValue(Number(rawValue));
  }

  private setMontoAplicarValue(
    group: PagoDetalleForm,
    value: string | number | null,
  ): void {
    const detalleId = group.controls.id_detalle.value;
    const normalizedDraft =
      value === null || value === undefined
        ? ''
        : this.sanitizeMoneyInputValue(String(value));

    this.montoAplicarDrafts[detalleId] = normalizedDraft;
    group.controls.monto_aplicar.setValue(
      normalizedDraft === '' ? null : normalizedDraft,
      { emitEvent: false },
    );
    group.controls.monto_aplicar.updateValueAndValidity({ emitEvent: false });
  }

  private blockThirdDecimal(event: KeyboardEvent): void {
    this.blockDecimalInput(event, 2, (value) => this.sanitizeMoneyInputValue(value));
  }

  private blockDecimalInput(
    event: KeyboardEvent,
    maxDecimals: number,
    sanitizeValue: (value: string) => string,
  ): void {
    const input = event.target as HTMLInputElement | null;

    if (!input) {
      return;
    }

    const allowedKeys = new Set([
      'Backspace',
      'Delete',
      'Tab',
      'Enter',
      'Escape',
      'ArrowLeft',
      'ArrowRight',
      'ArrowUp',
      'ArrowDown',
      'Home',
      'End',
    ]);

    if (allowedKeys.has(event.key)) {
      return;
    }

    if (event.ctrlKey || event.metaKey) {
      return;
    }

    if (this.isDecimalSeparatorKey(event.key)) {
      event.preventDefault();
      this.insertDecimalSeparator(input, sanitizeValue);
      return;
    }

    if (!/^\d$/.test(event.key)) {
      event.preventDefault();
      return;
    }

    const decimalIndex = input.value.indexOf('.');

    if (decimalIndex === -1) {
      return;
    }

    const selectionStart = input.selectionStart ?? input.value.length;
    const selectionEnd = input.selectionEnd ?? selectionStart;
    const decimalDigits = input.value.slice(decimalIndex + 1);
    const replacingDecimalDigits = Math.max(0, selectionEnd - Math.max(selectionStart, decimalIndex + 1));
    const currentDecimalLength =
      decimalDigits.length - replacingDecimalDigits;

    if (selectionStart > decimalIndex && currentDecimalLength >= maxDecimals) {
      event.preventDefault();
    }
  }

  private isDecimalSeparatorKey(key: string): boolean {
    return key === '.' || key === ',' || key === 'Decimal';
  }

  private insertDecimalSeparator(
    input: HTMLInputElement,
    sanitizeValue: (value: string) => string,
  ): void {
    const normalizedValue = input.value.replace(/,/g, '.');
    const selectionStart = input.selectionStart ?? normalizedValue.length;
    const selectionEnd = input.selectionEnd ?? selectionStart;
    const decimalIndex = normalizedValue.indexOf('.');
    const isReplacingCurrentDecimal =
      decimalIndex >= selectionStart && decimalIndex < selectionEnd;

    if (decimalIndex !== -1 && !isReplacingCurrentDecimal) {
      return;
    }

    const nextValue =
      normalizedValue.slice(0, selectionStart) +
      '.' +
      normalizedValue.slice(selectionEnd);
    const sanitizedValue = sanitizeValue(nextValue);

    input.value = sanitizedValue;
    const nextCursorPosition = Math.min(sanitizedValue.length, selectionStart + 1);
    input.setSelectionRange(nextCursorPosition, nextCursorPosition);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }

  private sanitizeMoneyPaste(event: ClipboardEvent): void {
    this.sanitizeDecimalPaste(event, (value) => this.sanitizeMoneyInputValue(value));
  }

  private sanitizeDecimalPaste(
    event: ClipboardEvent,
    sanitizeValue: (value: string) => string,
  ): void {
    const input = event.target as HTMLInputElement | null;
    const pastedText = event.clipboardData?.getData('text') ?? '';

    if (!input || !pastedText) {
      return;
    }

    event.preventDefault();

    const selectionStart = input.selectionStart ?? input.value.length;
    const selectionEnd = input.selectionEnd ?? selectionStart;
    const nextValue =
      input.value.slice(0, selectionStart) +
      pastedText +
      input.value.slice(selectionEnd);
    const sanitizedValue = sanitizeValue(nextValue);

    input.value = sanitizedValue;
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }

  private normalizePercentageValue(value: number): number {
    const boundedValue = Math.min(100, Math.max(0, value));
    return Math.round(boundedValue * 1_000_000) / 1_000_000;
  }

  private normalizeText(value: string): string {
    return value.trim().toLowerCase();
  }

  private get isCashFormaPagoSelected(): boolean {
    return this.normalizeText(this.selectedFormaPago?.nombre_forma ?? '') === 'efectivo';
  }

  private shouldRebalanceCounterpart(group: ParticipanteDetalleForm): boolean {
    if (this.usesIndependentSharedExpenseAmounts) {
      return false;
    }

    if (!this.titularManualOverride) {
      return true;
    }

    return group.controls.es_titular.value || this.getAdditionalParticipants().length === 1;
  }

  private resolveResidualGroup(
    preferredGroup?: ParticipanteDetalleForm,
  ): ParticipanteDetalleForm | null {
    const titularGroup = this.titularDetalleGroup;

    if (!titularGroup) {
      return null;
    }

    const additionalParticipants = this.getAdditionalParticipants();

    if (this.titularSectionDismissed && additionalParticipants.length > 0) {
      if (preferredGroup && !preferredGroup.controls.es_titular.value) {
        return preferredGroup;
      }

      return additionalParticipants[additionalParticipants.length - 1] ?? titularGroup;
    }

    if (!this.titularManualOverride) {
      return titularGroup;
    }

    if (additionalParticipants.length === 0) {
      return titularGroup;
    }

    if (additionalParticipants.length === 1) {
      return preferredGroup?.controls.es_titular.value
        ? additionalParticipants[0]
        : titularGroup;
    }

    if (preferredGroup && !preferredGroup.controls.es_titular.value) {
      return preferredGroup;
    }

    return additionalParticipants[additionalParticipants.length - 1] ?? titularGroup;
  }

  private getAdditionalParticipants(): ParticipanteDetalleForm[] {
    return this.participantesDetalleArray.controls.filter(
      (group) => !group.controls.es_titular.value,
    );
  }

  private shouldDefaultToFullShare(group: ParticipanteDetalleForm): boolean {
    return Boolean(
      this.shouldKeepDismissedTitularFullShareDefault(group),
    );
  }

  private shouldKeepDismissedTitularFullShareDefault(
    group?: ParticipanteDetalleForm,
  ): boolean {
    const additionalParticipants = this.getAdditionalParticipants();

    if (
      !this.isEditingSharedExpenseMode ||
      !this.titularSectionDismissed ||
      additionalParticipants.length !== 1
    ) {
      return false;
    }

    if (!group) {
      return additionalParticipants.some((item) =>
        this.pendingDismissedTitularFullShareGroups.has(item),
      );
    }

    return (
      !group.controls.es_titular.value &&
      additionalParticipants[0] === group &&
      this.pendingDismissedTitularFullShareGroups.has(group)
    );
  }

  private shouldPreserveManualPercentageWithoutTitular(
    group: ParticipanteDetalleForm,
    totalMonto: number,
  ): boolean {
    return Boolean(
      this.isEditingSharedExpenseMode &&
      this.titularSectionDismissed &&
      !group.controls.es_titular.value &&
      this.getAdditionalParticipants().length === 1 &&
      this.toCents(totalMonto) <= 0,
    );
  }

  private assignFullShareToGroup(group: ParticipanteDetalleForm): void {
    this.pendingDismissedTitularFullShareGroups.add(group);
    group.controls.porcentaje.setValue(100, { emitEvent: false });
    group.controls.porcentaje.updateValueAndValidity({ emitEvent: false });
    this.markGroupAmountAsAutomatic(group);
    this.updateMontoFromPorcentaje(group, this.shouldRebalanceCounterpart(group));
  }

  private clearDismissedTitularFullShareDefault(group: ParticipanteDetalleForm): void {
    this.pendingDismissedTitularFullShareGroups.delete(group);
  }

  private applyDismissedTitularDefaultShare(
    preferredGroup?: ParticipanteDetalleForm,
  ): void {
    const targetGroup =
      preferredGroup && this.shouldDefaultToFullShare(preferredGroup)
        ? preferredGroup
        : this.getAdditionalParticipants().find((group) => this.shouldDefaultToFullShare(group));

    if (!targetGroup) {
      return;
    }

    this.assignFullShareToGroup(targetGroup);
  }

  private rebalanceMontoDistribution(preferredGroup?: ParticipanteDetalleForm): void {
    const residualGroup = this.resolveResidualGroup(preferredGroup);

    if (!residualGroup) {
      return;
    }

    this.rebalanceMontoDistributionToGroup(residualGroup);
  }

  private rebalanceMontoDistributionToGroup(residualGroup: ParticipanteDetalleForm): void {
    if (!residualGroup) {
      return;
    }

    const totalMonto = this.normalizeDecimalValue(
      Number(this.transaccionForm.controls.monto.value ?? 0),
    );
    const totalMontoCentavos = this.toCents(totalMonto);
    const montoOtrosCentavos = this.participantesDetalleArray.controls
      .filter((group) => group !== residualGroup)
      .reduce(
        (sum, group) => sum + this.toCents(this.getGroupMontoTarget(group)),
        0,
      );
    const montoResidual = this.centsToAmount(
      Math.max(0, totalMontoCentavos - montoOtrosCentavos),
    );
    const porcentajeResidual =
      totalMonto > 0
        ? this.normalizePercentageValue((montoResidual / totalMonto) * 100)
        : (
            this.shouldKeepDismissedTitularFullShareDefault(residualGroup)
              ? 100
              : 0
          );

    residualGroup.controls.monto.setValue(
      this.getMontoInputValueForTarget(residualGroup, montoResidual),
      { emitEvent: false },
    );
    residualGroup.controls.monto.updateValueAndValidity({ emitEvent: false });
    residualGroup.controls.porcentaje.setValue(porcentajeResidual, { emitEvent: false });
    residualGroup.controls.porcentaje.updateValueAndValidity({ emitEvent: false });
    this.syncCuotasWithMonto(residualGroup);
  }

  private getSharedExpenseCounterpartGroup(
    editedGroup: ParticipanteDetalleForm,
  ): ParticipanteDetalleForm | null {
    const titularGroup = this.titularDetalleGroup;

    if (!titularGroup) {
      return null;
    }

    const additionalParticipants = this.getAdditionalParticipants();

    if (additionalParticipants.length === 0) {
      return null;
    }

    if (editedGroup.controls.es_titular.value) {
      return additionalParticipants[additionalParticipants.length - 1] ?? null;
    }

    if (!this.titularManualOverride || additionalParticipants.length === 1) {
      return titularGroup;
    }

    const residualParticipant = [...additionalParticipants]
      .reverse()
      .find((group) => group !== editedGroup);

    return residualParticipant ?? titularGroup;
  }

  private markGroupAmountAsManual(group: ParticipanteDetalleForm): void {
    if (!this.isEditingSharedExpenseMode) {
      return;
    }

    this.manualAmountGroups.add(group);
  }

  private markGroupAmountAsAutomatic(group: ParticipanteDetalleForm): void {
    if (!this.isEditingSharedExpenseMode) {
      return;
    }

    this.manualAmountGroups.delete(group);
  }

  private isGroupAmountManual(group: ParticipanteDetalleForm): boolean {
    return this.isEditingSharedExpenseMode && this.manualAmountGroups.has(group);
  }

  private get usesIndependentSharedExpenseAmounts(): boolean {
    return (
      this.isEditingSharedExpenseMode &&
      !Boolean(this.transaccionForm.controls.cuotas_sin_intereses.value)
    );
  }

  private syncSharedExpenseCounterpart(group: ParticipanteDetalleForm): void {
    if (!this.isEditingSharedExpenseMode || this.usesIndependentSharedExpenseAmounts) {
      return;
    }

    const counterpartGroup = this.getSharedExpenseCounterpartGroup(group);

    if (!counterpartGroup) {
      return;
    }

    this.rebalanceMontoDistributionToGroup(counterpartGroup);
  }

  private syncSharedExpenseMainMontoToTitular(): void {
    if (!this.isEditingSharedExpenseMode || !this.isEditingSharedExpenseTotalEditable) {
      return;
    }

    const titularGroup = this.titularDetalleGroup;

    if (!titularGroup || this.getAdditionalParticipants().length > 0) {
      return;
    }

    const montoTotal = this.normalizeDecimalValue(
      Number(this.transaccionForm.controls.monto.value ?? 0),
    );
    const porcentajeTitular = montoTotal > 0 ? 100 : 0;

    titularGroup.controls.monto.setValue(
      this.getMontoInputValueForTarget(titularGroup, montoTotal),
      { emitEvent: false },
    );
    titularGroup.controls.monto.updateValueAndValidity({ emitEvent: false });
    titularGroup.controls.porcentaje.setValue(porcentajeTitular, { emitEvent: false });
    titularGroup.controls.porcentaje.updateValueAndValidity({ emitEvent: false });
    this.syncCuotasWithMonto(titularGroup);
  }

  private syncStandaloneMontoToTitular(): void {
    if (this.isEditingSharedExpenseMode || this.isEditingIncomeMode) {
      return;
    }

    const titularGroup = this.titularDetalleGroup;

    if (!titularGroup) {
      return;
    }

    const montoTotal = this.normalizeDecimalValue(
      Number(this.transaccionForm.controls.monto.value ?? 0),
    );

    titularGroup.controls.monto.setValue(
      this.getMontoInputValueForTarget(titularGroup, montoTotal),
      { emitEvent: false },
    );
    titularGroup.controls.monto.updateValueAndValidity({ emitEvent: false });
    this.syncCuotasWithMonto(titularGroup);
  }

  private syncSharedExpenseTitularResidual(): void {
    if (!this.isEditingSharedExpenseMode || this.usesIndependentSharedExpenseAmounts) {
      return;
    }

    const titularGroup = this.titularDetalleGroup;

    if (!titularGroup || this.isGroupAmountManual(titularGroup)) {
      return;
    }

    this.rebalanceTitularParticipation();
  }

  private syncSharedExpenseGroupFromCuotas(group: ParticipanteDetalleForm): void {
    const montoActual = this.getCuotasTotal(group);

    group.controls.monto.setValue(this.getMontoInputValueForTarget(group, montoActual), {
      emitEvent: false,
    });
    group.controls.monto.updateValueAndValidity({ emitEvent: false });

    if (this.shouldRebalanceCounterpart(group)) {
      this.syncSharedExpenseCounterpart(group);
    }

    this.syncCalculatedExpenseMontoForEdit();
  }

  private recalculateSharedExpensePercentageDistribution(
    editedGroup: ParticipanteDetalleForm,
  ): void {
    if (!this.isEditingSharedExpenseMode) {
      return;
    }

    const groups = this.participantesDetalleArray.controls;

    if (groups.length === 0) {
      return;
    }

    const otherGroups = groups.filter((group) => group !== editedGroup);
    const totalMonto = this.normalizeDecimalValue(
      Number(this.transaccionForm.controls.monto.value ?? 0),
    );
    const totalMontoCentavos = this.toCents(totalMonto);
    const editedPercentage =
      otherGroups.length === 0
        ? 100
        : this.normalizePercentageValue(Number(editedGroup.controls.porcentaje.value ?? 0));

    editedGroup.controls.porcentaje.setValue(editedPercentage, { emitEvent: false });
    editedGroup.controls.porcentaje.updateValueAndValidity({ emitEvent: false });

    const totalOtherPercentage = otherGroups.reduce(
      (sum, group) =>
        sum + this.normalizePercentageValue(Number(group.controls.porcentaje.value ?? 0)),
      0,
    );
    let assignedPercentage = editedPercentage;

    otherGroups.forEach((group, index) => {
      const isLastGroup = index === otherGroups.length - 1;
      let nextPercentage = 0;

      if (isLastGroup) {
        nextPercentage = this.normalizePercentageValue(Math.max(0, 100 - assignedPercentage));
      } else if (totalOtherPercentage > 0) {
        nextPercentage = this.normalizePercentageValue(
          ((100 - editedPercentage) *
            this.normalizePercentageValue(Number(group.controls.porcentaje.value ?? 0))) /
            totalOtherPercentage,
        );
        assignedPercentage = this.normalizePercentageValue(assignedPercentage + nextPercentage);
      }

      group.controls.porcentaje.setValue(nextPercentage, { emitEvent: false });
      group.controls.porcentaje.updateValueAndValidity({ emitEvent: false });
    });

    groups.forEach((group) => this.markGroupAmountAsAutomatic(group));

    const residualAmountGroup = otherGroups[otherGroups.length - 1] ?? editedGroup;
    let assignedMontoCentavos = 0;

    groups.forEach((group) => {
      if (group === residualAmountGroup) {
        return;
      }

      const porcentaje = this.normalizePercentageValue(Number(group.controls.porcentaje.value ?? 0));
      const montoCentavos =
        totalMontoCentavos > 0 ? Math.floor((totalMontoCentavos * porcentaje) / 100) : 0;

      assignedMontoCentavos += montoCentavos;
      group.controls.monto.setValue(
        this.getMontoInputValueForTarget(group, this.centsToAmount(montoCentavos)),
        { emitEvent: false },
      );
      group.controls.monto.updateValueAndValidity({ emitEvent: false });
      this.syncCuotasWithMonto(group);
    });

    const residualMontoCentavos = Math.max(0, totalMontoCentavos - assignedMontoCentavos);
    residualAmountGroup.controls.monto.setValue(
      this.getMontoInputValueForTarget(
        residualAmountGroup,
        this.centsToAmount(residualMontoCentavos),
      ),
      { emitEvent: false },
    );
    residualAmountGroup.controls.monto.updateValueAndValidity({ emitEvent: false });
    this.syncCuotasWithMonto(residualAmountGroup);
    this.refreshEstadoTransaccionForEdit();
  }

  private syncSharedExpensePercentagesToHundred(
    totalMonto: number,
    preferredResidualGroup?: ParticipanteDetalleForm,
    preservedPercentageGroup?: ParticipanteDetalleForm,
  ): void {
    const groups = this.participantesDetalleArray.controls;

    if (groups.length === 0) {
      return;
    }

    if (totalMonto <= 0) {
      groups.forEach((group) => {
        group.controls.porcentaje.setValue(0, { emitEvent: false });
        group.controls.porcentaje.updateValueAndValidity({ emitEvent: false });
      });

      const fullShareGroup =
        preferredResidualGroup && this.shouldKeepDismissedTitularFullShareDefault(preferredResidualGroup)
          ? preferredResidualGroup
          : this.getAdditionalParticipants().find((group) =>
              this.shouldKeepDismissedTitularFullShareDefault(group),
            );

      if (fullShareGroup) {
        fullShareGroup.controls.porcentaje.setValue(100, { emitEvent: false });
        fullShareGroup.controls.porcentaje.updateValueAndValidity({ emitEvent: false });
      }

      return;
    }

    const residualGroup =
      (preservedPercentageGroup
        ? this.getSharedExpenseCounterpartGroup(preservedPercentageGroup)
        : null) ??
      this.resolveResidualGroup(preferredResidualGroup ?? preservedPercentageGroup) ??
      groups[groups.length - 1] ??
      null;

    if (!residualGroup) {
      return;
    }

    let porcentajeAsignado = 0;

    groups.forEach((group) => {
      if (group === residualGroup) {
        return;
      }

      if (preservedPercentageGroup && group === preservedPercentageGroup) {
        porcentajeAsignado = this.normalizePercentageValue(
          porcentajeAsignado +
            this.normalizePercentageValue(Number(group.controls.porcentaje.value ?? 0)),
        );
        return;
      }

      const montoGrupo = this.getCuotasTotal(group);
      const porcentaje = this.normalizePercentageValue((montoGrupo / totalMonto) * 100);

      porcentajeAsignado = this.normalizePercentageValue(porcentajeAsignado + porcentaje);
      group.controls.porcentaje.setValue(porcentaje, { emitEvent: false });
      group.controls.porcentaje.updateValueAndValidity({ emitEvent: false });
    });

    const porcentajeResidual = this.normalizePercentageValue(100 - porcentajeAsignado);
    residualGroup.controls.porcentaje.setValue(porcentajeResidual, { emitEvent: false });
    residualGroup.controls.porcentaje.updateValueAndValidity({ emitEvent: false });
  }

  private getCatalogParticipanteForGroup(
    group: ParticipanteDetalleForm,
  ): CatalogoParticipante | null {
    if (group.controls.es_titular.value) {
      return this.currentUserParticipante;
    }

    const participanteId = group.controls.id_participante.value;

    if (participanteId === null || participanteId === undefined) {
      return null;
    }

    return this.participantes.find((item) => item.id_participante === participanteId) ?? null;
  }

  private isEstadoVisibleEnListado(nombreEstado: string | null | undefined): boolean {
    return ESTADOS_LISTADO_PERMITIDOS.has(this.getNormalizedEstadoListado(nombreEstado ?? ''));
  }

  private isEstadoDisponibleEnFiltro(nombreEstado: string | null | undefined): boolean {
    return ESTADOS_FILTRO_DISPONIBLES.has(this.getNormalizedEstadoListado(nombreEstado ?? ''));
  }

  getEstadoDisplayLabel(nombreEstado: string | null | undefined): string {
    const estadoOriginal = this.normalizeText(nombreEstado ?? '');

    if (estadoOriginal === 'pago parcial') {
      return 'PAGO PARCIAL';
    }

    const estado = this.getNormalizedEstadoListado(nombreEstado ?? '');

    switch (estado) {
      case 'anulado':
        return 'ANULADO';
      case 'pagado':
        return 'PAGADO';
      case 'pendiente':
        return 'PENDIENTE';
      default:
        return nombreEstado?.trim() || 'Sin estado';
    }
  }

  private getNormalizedEstadoListado(nombreEstado: string | null | undefined): string {
    const estado = this.normalizeText(nombreEstado ?? '');

    switch (estado) {
      case 'anulada':
      case 'anulado':
      case 'cancelada':
      case 'cancelado':
        return 'anulado';
      case 'pagado':
      case 'pagada':
      case 'completado':
      case 'completada':
        return 'pagado';
      case 'pendiente':
      case 'pago parcial':
        return 'pendiente';
      default:
        return estado;
    }
  }

  private getEstadoCatalogoById(estadoId: number | null | undefined): CatalogoEstadoTransaccion | null {
    if (estadoId === null || estadoId === undefined) {
      return null;
    }

    return this.estadosTransaccion.find((estado) => estado.id_estado === estadoId) ?? null;
  }

  private getManagedEstadoNameById(estadoId: number | null | undefined): string | null {
    if (estadoId === ESTADO_TRANSACCION_ANULADA_ID) {
      return 'ANULADO';
    }

    const estado = this.getEstadoCatalogoById(estadoId);
    const normalizedEstado = this.getNormalizedEstadoListado(estado?.nombre_estado ?? '');

    switch (normalizedEstado) {
      case 'anulado':
        return 'ANULADO';
      case 'pagado':
        return 'PAGADO';
      case 'pendiente':
        return 'PENDIENTE';
      default:
        return null;
    }
  }

  private async confirmEstadoMasivoChangeIfNeeded(): Promise<boolean> {
    if (!this.isEditing || !this.selectedTransaccion) {
      return true;
    }

    const estadoActual = this.getManagedEstadoNameById(this.selectedTransaccion.id_estado);
    const estadoSiguiente = this.getManagedEstadoNameById(this.transaccionForm.controls.id_estado.value);

    if (!estadoSiguiente || estadoActual === estadoSiguiente) {
      return true;
    }

    if (estadoSiguiente === 'ANULADO') {
      return this.alerts.confirm(
        'Confirmar anulacion',
        'Esta accion anulara la transaccion completa, dejara todas las cuotas como ANULADO y limpiara todos los pagos aplicados. Deseas continuar?',
        'Si, anular todo',
        {
          icon: 'warning',
          confirmButtonColor: '#dc2626',
        },
      );
    }

    if (estadoSiguiente === 'PAGADO') {
      return this.alerts.confirm(
        'Confirmar pago total',
        'Esta accion marcara todas las cuotas como PAGADO y liquidara todos los saldos pendientes. Deseas continuar?',
        'Si, pagar todo',
        {
          icon: 'question',
          confirmButtonColor: '#1f7a46',
        },
      );
    }

    return this.alerts.confirm(
      'Confirmar cambio a pendiente',
      'Esta accion pondra toda la transaccion en PENDIENTE, reactivara todas las cuotas y limpiara los pagos aplicados. Deseas continuar?',
      'Si, dejar pendiente',
      {
        icon: 'warning',
        confirmButtonColor: '#d97706',
      },
    );
  }

  private isFixedCuotasMode(group: ParticipanteDetalleForm): boolean {
    return group.controls.modo_cuotas.value === 'fijas';
  }

  private getGroupCuotasCount(group: ParticipanteDetalleForm): number {
    return this.normalizeCuotasCountValue(group, group.controls.cantidad_cuotas.value);
  }

  private normalizeCuotasCountValue(
    group: ParticipanteDetalleForm,
    value: number | string | null | undefined,
  ): number {
    const parsedValue = Math.trunc(Number(value));
    const minimumValue = this.canGroupUseZeroCuotas(group) ? 0 : 1;

    if (Number.isNaN(parsedValue)) {
      return minimumValue;
    }

    return Math.max(minimumValue, parsedValue);
  }

  private getGroupMontoTarget(group: ParticipanteDetalleForm): number {
    const montoBase = this.normalizeDecimalValue(Number(group.controls.monto.value ?? 0));
    const montoBloqueado = this.getLockedGroupMontoTarget(group);

    if (!this.isIncomeTitularGroup(group) && this.isFixedCuotasMode(group)) {
      return Math.max(
        montoBloqueado,
        this.normalizeDecimalValue(montoBase * this.getGroupCuotasCount(group)),
      );
    }

    return Math.max(montoBloqueado, montoBase);
  }

  private getLockedGroupMontoTarget(group: ParticipanteDetalleForm): number {
    if (!this.hasAppliedPagosInEditor) {
      return 0;
    }

    const participanteId = group.controls.id_participante.value;

    if (participanteId === null || participanteId === undefined) {
      return 0;
    }

    const detallesOriginales = this.editorDetallesOriginales.filter(
      (detalle) =>
        detalle.id_participante === participanteId && this.detalleTienePagosAplicados(detalle),
    );

    if (detallesOriginales.length === 0) {
      return 0;
    }

    return this.normalizeDecimalValue(
      detallesOriginales.reduce(
        (sum, detalle) => sum + this.normalizeDecimalValue(Number(detalle.monto ?? 0)),
        0,
      ),
    );
  }

  private getMontoInputValueForTarget(
    group: ParticipanteDetalleForm,
    montoObjetivo: number,
  ): number {
    const montoNormalizado = this.normalizeDecimalValue(montoObjetivo);

    if (!this.isIncomeTitularGroup(group) && this.isFixedCuotasMode(group)) {
      const cuotasCount = this.getGroupCuotasCount(group);
      return cuotasCount > 0 ? this.normalizeDecimalValue(montoNormalizado / cuotasCount) : 0;
    }

    return montoNormalizado;
  }

  private createCuotaGroup(monto: number, fechaProgramada: string | null = null): CuotaMontoForm {
    return this.fb.group({
      monto: this.fb.control<number | null>(monto, [
        Validators.required,
        Validators.min(0),
        this.maxTwoDecimalsValidator(),
      ]),
      fecha_programada: this.fb.control<string | null>(fechaProgramada),
    });
  }

  private registerParticipanteDetalleGroup(group: ParticipanteDetalleForm): ParticipanteDetalleForm {
    group.controls.cantidad_cuotas.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((value) => {
        if (value === null || value === undefined) {
          return;
        }

        const normalizedValue = this.normalizeCuotasCountValue(group, value);

        if (Number.isNaN(normalizedValue)) {
          return;
        }

        if (group.controls.cantidad_cuotas.value !== normalizedValue) {
          group.controls.cantidad_cuotas.setValue(normalizedValue, { emitEvent: false });
          group.controls.cantidad_cuotas.updateValueAndValidity({ emitEvent: false });
        }

        if (this.getCuotasArray(group).length !== normalizedValue) {
          this.syncCuotasCount(group);
          this.cdr.detectChanges();
        }
      });

    return group;
  }

  private createCuotasArray(
    cuotas: CuotaPayload[] | undefined,
    montoTotal: number,
    cantidadCuotas: number,
  ): FormArray<CuotaMontoForm> {
    if ((!cuotas || cuotas.length === 0) && cantidadCuotas <= 0) {
      return this.fb.array<CuotaMontoForm>([]);
    }

    const cuotasNormalizadas =
      cuotas && cuotas.length > 0
        ? cuotas.map((cuota) => ({
            monto: this.normalizeDecimalValue(Number(cuota.monto)),
            fecha_programada: this.normalizeDateOnly(cuota.fecha_programada) || null,
          }))
        : this.distributeMontoEnCuotas(montoTotal, cantidadCuotas).map((monto) => ({
            monto,
            fecha_programada:
              cantidadCuotas === 1
                ? this.getSingleCuotaDefaultFechaProgramada()
                : null,
          }));

    return this.fb.array(
      cuotasNormalizadas.map((cuota) =>
        this.createCuotaGroup(cuota.monto, cuota.fecha_programada),
      ),
    );
  }

  private replaceCuotasArray(group: ParticipanteDetalleForm, cuotas: CuotaPayload[]): void {
    group.setControl(
      'cuotas',
      this.createCuotasArray(
        cuotas,
        group.controls.monto.value ?? 0,
        cuotas.length,
      ),
    );
    this.syncCuotasPage(group);
  }

  private appendEditableCuotaForAppliedPayments(group: ParticipanteDetalleForm): void {
    const siguienteCantidad = this.getCuotasArray(group).length + 1;
    group.controls.cantidad_cuotas.setValue(siguienteCantidad, { emitEvent: false });
    group.controls.cantidad_cuotas.updateValueAndValidity({ emitEvent: false });
    this.syncCuotasCount(group);
  }

  private getZeroBalancePeriodDateIso(periodIndex: number): string | null {
    for (const group of this.getZeroBalanceGroupsForPeriod(periodIndex)) {
      const cuotaGroup = this.getCuotasArray(group).at(periodIndex);
      const fechaProgramada =
        this.normalizeDateOnly(cuotaGroup?.controls.fecha_programada.value ?? null) || null;

      if (fechaProgramada) {
        return fechaProgramada;
      }
    }

    return null;
  }

  private getZeroBalanceGeneralMinimumCuotasCount(): number {
    let minimumCount = 0;

    this.getZeroBalanceParticipantGroups().forEach((group) => {
      this.getCuotasArray(group).controls.forEach((_cuotaGroup, index) => {
        if (this.isCuotaBloqueadaEnEditor(group, index)) {
          minimumCount = Math.max(minimumCount, index + 1);
        }
      });
    });

    return minimumCount;
  }

  private resolveZeroBalanceDefaultPercentage(group: ParticipanteDetalleForm): number {
    const currentValue = group.controls.porcentaje.value;

    if (currentValue !== null && currentValue !== undefined) {
      return this.normalizePercentageValue(Number(currentValue));
    }

    const suggestedValue = this.getParticipantePorcentajeSugerido(group);

    if (suggestedValue !== null && suggestedValue !== undefined) {
      return this.normalizePercentageValue(Number(suggestedValue));
    }

    return this.getZeroBalanceParticipantGroups().length <= 1 ? 100 : 0;
  }

  private ensureZeroBalancePeriodPercentages(group: ParticipanteDetalleForm): number[] {
    const desiredCount = this.getCuotasArray(group).length;
    const current = [...(this.zeroBalancePeriodPercentagesByGroup.get(group) ?? [])];
    const defaultValue = this.resolveZeroBalanceDefaultPercentage(group);

    while (current.length < desiredCount) {
      current.push(defaultValue);
    }

    if (current.length > desiredCount) {
      current.length = desiredCount;
    }

    const normalized = current.map((value) =>
      this.normalizePercentageValue(Number(value ?? defaultValue)),
    );
    this.zeroBalancePeriodPercentagesByGroup.set(group, normalized);
    return normalized;
  }

  private ensureZeroBalancePeriodPercentagesForAll(): void {
    this.getZeroBalanceParticipantGroups().forEach((group) => {
      this.ensureZeroBalancePeriodPercentages(group);
    });
  }

  private initializeZeroBalancePeriodPercentagesFromCurrentCuotas(): void {
    const groups = this.getZeroBalanceParticipantGroups();

    if (!groups.length) {
      return;
    }

    groups.forEach((group) => {
      this.zeroBalancePeriodPercentagesByGroup.delete(group);
      this.ensureZeroBalancePeriodPercentages(group);
    });

    this.getZeroBalancePeriodIndexes().forEach((periodIndex) => {
      this.syncZeroBalancePeriodPercentagesFromCurrentMontos(periodIndex);
    });
  }

  private initializeZeroBalanceBasePercentagesFromCurrentContext(): void {
    const groups = this.getZeroBalanceParticipantGroups();

    if (!groups.length) {
      return;
    }

    const desiredPercentages = groups.map((group) => {
      const currentPercentage = this.normalizePercentageValue(
        Number(group.controls.porcentaje.value ?? 0),
      );

      if (currentPercentage > 0) {
        return currentPercentage;
      }

      const suggestedPercentage = this.getParticipantePorcentajeSugerido(group);
      return suggestedPercentage !== null && suggestedPercentage !== undefined
        ? this.normalizePercentageValue(Number(suggestedPercentage))
        : null;
    });
    const assignedPercentage = desiredPercentages.reduce<number>(
      (sum, value) => sum + this.normalizePercentageValue(Number(value ?? 0)),
      0,
    );

    if (assignedPercentage > 100) {
      groups.forEach((group, index) => {
        const sourcePercentage = this.normalizePercentageValue(
          Number(desiredPercentages[index] ?? 0),
        );
        const normalizedPercentage = this.normalizePercentageValue(
          (sourcePercentage * 100) / assignedPercentage,
        );

        group.controls.porcentaje.setValue(normalizedPercentage, { emitEvent: false });
        group.controls.porcentaje.updateValueAndValidity({ emitEvent: false });
      });
      return;
    }

    const pendingIndexes = desiredPercentages.reduce<number[]>((indexes, value, index) => {
      if (value === null || value === undefined) {
        indexes.push(index);
      }

      return indexes;
    }, []);
    const remainingPercentage = this.normalizePercentageValue(
      Math.max(0, 100 - assignedPercentage),
    );

    groups.forEach((group, index) => {
      let nextPercentage = desiredPercentages[index];

      if (nextPercentage === null || nextPercentage === undefined) {
        if (pendingIndexes.length === 0) {
          nextPercentage = 0;
        } else if (pendingIndexes.length === 1) {
          nextPercentage = remainingPercentage;
        } else {
          const pendingPosition = pendingIndexes.indexOf(index);
          const distributedPercentage = this.normalizePercentageValue(
            remainingPercentage / pendingIndexes.length,
          );
          const assignedPendingPercentage =
            pendingPosition <= 0 ? 0 : distributedPercentage * pendingPosition;

          nextPercentage =
            pendingPosition === pendingIndexes.length - 1
              ? this.normalizePercentageValue(
                  Math.max(0, remainingPercentage - assignedPendingPercentage),
                )
              : distributedPercentage;
        }
      }

      group.controls.porcentaje.setValue(
        this.normalizePercentageValue(Number(nextPercentage ?? 0)),
        { emitEvent: false },
      );
      group.controls.porcentaje.updateValueAndValidity({ emitEvent: false });
    });
  }

  private initializeZeroBalanceGeneralProgramacionFromCurrentCuotas(): void {
    const groups = this.getZeroBalanceParticipantGroups();
    const programacion = this.resolveZeroBalanceGeneralProgramacionFromCurrentCuotas();

    if (!groups.length || !programacion) {
      return;
    }

    groups.forEach((group) => {
      group.controls.tipo_programacion.setValue(programacion.tipo, { emitEvent: false });
      group.controls.tipo_programacion.updateValueAndValidity({ emitEvent: false });
      group.controls.dia_programado.setValue(programacion.dia, { emitEvent: false });
      group.controls.dia_programado.updateValueAndValidity({ emitEvent: false });
    });
  }

  private resolveZeroBalanceGeneralProgramacionFromCurrentCuotas():
    | { tipo: ProgramacionCuotaTipo; dia: number | null }
    | null {
    const cantidadCuotas = this.getZeroBalanceGeneralCuotasCount();

    if (cantidadCuotas <= 1) {
      return null;
    }

    const fechaBaseIso =
      this.normalizeDateInputValue(this.transaccionForm.controls.fecha_transaccion.value ?? '') ??
      this.formatDateInput(this.today);
    const candidateFechas: string[][] = [];
    const fechasGenerales = this.getZeroBalancePeriodIndexes()
      .map((periodIndex) => this.getZeroBalancePeriodDateIso(periodIndex))
      .filter((value): value is string => Boolean(value));

    if (fechasGenerales.length === cantidadCuotas) {
      candidateFechas.push(fechasGenerales);
    }

    this.getZeroBalanceParticipantGroups().forEach((group) => {
      const fechasGrupo = this.getCuotasArray(group).controls
        .map((cuotaGroup) => cuotaGroup.controls.fecha_programada.value)
        .filter((value): value is string => Boolean(value));

      if (fechasGrupo.length === cantidadCuotas) {
        candidateFechas.push(fechasGrupo);
      }
    });

    for (const fechasProgramadas of candidateFechas) {
      const programacion = this.inferProgramacionFromFechas(
        fechasProgramadas,
        fechaBaseIso,
        cantidadCuotas,
      );

      if (programacion.tipo !== 'ninguna') {
        return programacion;
      }
    }

    if (candidateFechas.length > 0) {
      return this.inferProgramacionFromFechas(
        candidateFechas[0],
        fechaBaseIso,
        cantidadCuotas,
      );
    }

    return null;
  }

  private syncZeroBalanceParticipantBasePercentages(): void {
    const groups = this.getZeroBalanceParticipantGroups();

    groups.forEach((group) => {
      const percentages = this.ensureZeroBalancePeriodPercentages(group);
      const average =
        percentages.length > 0
          ? percentages.reduce((sum, value) => sum + value, 0) / percentages.length
          : this.resolveZeroBalanceDefaultPercentage(group);
      const normalizedAverage = this.normalizePercentageValue(average);

      group.controls.porcentaje.setValue(normalizedAverage, { emitEvent: false });
      group.controls.porcentaje.updateValueAndValidity({ emitEvent: false });
    });
  }

  private rebalanceZeroBalancePeriodPercentages(
    periodIndex: number,
    editedGroup?: ParticipanteDetalleForm,
  ): void {
    const groups = this.getZeroBalanceGroupsForPeriod(periodIndex);

    if (!groups.length) {
      return;
    }

    if (groups.length === 1) {
      const singlePercentages = this.ensureZeroBalancePeriodPercentages(groups[0]);
      singlePercentages[periodIndex] = 100;
      this.zeroBalancePeriodPercentagesByGroup.set(groups[0], singlePercentages);
      return;
    }

    const otherGroups = editedGroup ? groups.filter((group) => group !== editedGroup) : groups.slice(0, -1);
    const residualGroup = editedGroup
      ? groups.find((group) => group !== editedGroup && !otherGroups.slice(0, -1).includes(group)) ?? groups[groups.length - 1]
      : groups[groups.length - 1];

    if (!residualGroup) {
      return;
    }

    const editedPercentage = editedGroup
      ? this.getZeroBalancePeriodParticipantPercentage(editedGroup, periodIndex)
      : null;
    const sourceGroups = editedGroup ? otherGroups : groups.slice(0, -1);
    const totalSourcePercentages = sourceGroups.reduce(
      (sum, group) => sum + this.getZeroBalancePeriodParticipantPercentage(group, periodIndex),
      0,
    );
    let assigned = editedPercentage ?? 0;

    sourceGroups.forEach((group, index) => {
      if (editedGroup && group === residualGroup) {
        return;
      }

      if (!editedGroup && group === residualGroup) {
        return;
      }

      const percentages = this.ensureZeroBalancePeriodPercentages(group);
      const isLastAdjustable = index === sourceGroups.length - 1;
      let nextPercentage = this.getZeroBalancePeriodParticipantPercentage(group, periodIndex);

      if (editedGroup) {
        if (isLastAdjustable) {
          nextPercentage = this.normalizePercentageValue(Math.max(0, 100 - assigned));
        } else if (totalSourcePercentages > 0) {
          nextPercentage = this.normalizePercentageValue(
            ((100 - (editedPercentage ?? 0)) *
              this.getZeroBalancePeriodParticipantPercentage(group, periodIndex)) /
              totalSourcePercentages,
          );
          assigned = this.normalizePercentageValue(assigned + nextPercentage);
        } else {
          nextPercentage = this.normalizePercentageValue((100 - (editedPercentage ?? 0)) / sourceGroups.length);
          assigned = this.normalizePercentageValue(assigned + nextPercentage);
        }
      }

      percentages[periodIndex] = nextPercentage;
      this.zeroBalancePeriodPercentagesByGroup.set(group, percentages);
    });

    const residualPercentages = this.ensureZeroBalancePeriodPercentages(residualGroup);
    const residualValue = this.normalizePercentageValue(
      Math.max(
        0,
        100 -
          groups
            .filter((group) => group !== residualGroup)
            .reduce(
              (sum, group) => sum + this.getZeroBalancePeriodParticipantPercentage(group, periodIndex),
              0,
            ),
      ),
    );
    residualPercentages[periodIndex] = residualValue;
    this.zeroBalancePeriodPercentagesByGroup.set(residualGroup, residualPercentages);
  }

  private applyZeroBalancePeriodPercentage(
    group: ParticipanteDetalleForm,
    periodIndex: number,
    porcentaje: number,
  ): void {
    const percentages = this.ensureZeroBalancePeriodPercentages(group);
    percentages[periodIndex] = this.normalizePercentageValue(porcentaje);
    this.zeroBalancePeriodPercentagesByGroup.set(group, percentages);
    this.rebalanceZeroBalancePeriodPercentages(periodIndex, group);
    this.setZeroBalancePeriodTotal(periodIndex, this.getZeroBalancePeriodTotal(periodIndex), false);
    this.syncZeroBalanceSharedStateFromPeriods();
  }

  private applyZeroBalancePeriodParticipantMonto(
    group: ParticipanteDetalleForm,
    periodIndex: number,
    monto: number,
  ): void {
    const cuotaGroup = this.getCuotasArray(group).at(periodIndex);

    if (!cuotaGroup || !this.canEditZeroBalancePeriodParticipantMonto(group, periodIndex)) {
      return;
    }

    cuotaGroup.controls.monto.setValue(this.normalizeDecimalValue(Number(monto ?? 0)), {
      emitEvent: false,
    });
    cuotaGroup.controls.monto.updateValueAndValidity({ emitEvent: false });
    this.syncZeroBalancePeriodPercentagesFromCurrentMontos(periodIndex);
    this.syncZeroBalanceSharedStateFromPeriods();
  }

  private applyZeroBalanceGeneralCuotasCount(requestedCount: number): void {
    const groups = this.getZeroBalanceParticipantGroups();

    if (!groups.length) {
      return;
    }

    const normalizedCount = Math.max(
      this.getZeroBalanceGeneralMinimumCuotasCount(),
      Math.max(0, Math.trunc(Number(requestedCount) || 0)),
    );

    groups.forEach((group) => {
      const cuotasArray = this.getCuotasArray(group);

      while (cuotasArray.length < normalizedCount) {
        cuotasArray.push(this.createCuotaGroup(0, null));
      }

      while (cuotasArray.length > normalizedCount) {
        cuotasArray.removeAt(cuotasArray.length - 1);
      }

      group.controls.cantidad_cuotas.setValue(normalizedCount, { emitEvent: false });
      group.controls.cantidad_cuotas.updateValueAndValidity({ emitEvent: false });
      this.syncCuotasPage(group);
    });

    this.ensureZeroBalancePeriodPercentagesForAll();

    this.applyZeroBalanceGeneralProgramacionConfig(
      this.getZeroBalanceGeneralTipoProgramacion(),
      this.getZeroBalanceGeneralDiaProgramado(),
      false,
    );
    this.syncZeroBalanceSharedStateFromPeriods();
  }

  private applyZeroBalanceGeneralProgramacionConfig(
    tipoProgramacion: ProgramacionCuotaTipo,
    diaProgramado: number | null,
    syncState = true,
  ): void {
    const groups = this.getZeroBalanceParticipantGroups();
    const cuotasCount = this.getZeroBalanceGeneralCuotasCount();
    const resolvedTipo = cuotasCount <= 1 ? 'ninguna' : tipoProgramacion;
    const resolvedDia =
      resolvedTipo === 'dia_mes' && cuotasCount > 1
        ? this.normalizeDiaProgramado(Number(diaProgramado ?? this.getDefaultDiaProgramado()))
        : null;

    groups.forEach((group) => {
      group.controls.tipo_programacion.setValue(resolvedTipo, { emitEvent: false });
      group.controls.tipo_programacion.updateValueAndValidity({ emitEvent: false });
      group.controls.dia_programado.setValue(resolvedDia, { emitEvent: false });
      group.controls.dia_programado.updateValueAndValidity({ emitEvent: false });
      this.refreshProgramacionCuotas(group);
    });

    if (syncState) {
      this.syncZeroBalanceSharedStateFromPeriods();
    }
  }

  private getZeroBalanceDistributionWeights(
    groups: ParticipanteDetalleForm[],
    periodIndex?: number,
  ): number[] {
    if (!groups.length) {
      return [];
    }

    const percentages = groups.map((group) =>
      periodIndex === undefined
        ? this.normalizePercentageValue(Number(group.controls.porcentaje.value ?? 0))
        : this.getZeroBalancePeriodParticipantPercentage(group, periodIndex),
    );
    const totalPercentage = percentages.reduce((sum, value) => sum + value, 0);

    if (totalPercentage > 0) {
      return percentages.map((value) => value / totalPercentage);
    }

    const fallbackWeight = 1 / groups.length;
    return groups.map(() => fallbackWeight);
  }

  private setZeroBalancePeriodTotal(
    periodIndex: number,
    montoTotal: number,
    syncState = true,
  ): void {
    const groups = this.getZeroBalanceGroupsForPeriod(periodIndex);

    if (!groups.length) {
      return;
    }

    const blockedTotalCentavos = groups.reduce((sum, group) => {
      if (!this.isCuotaBloqueadaEnEditor(group, periodIndex)) {
        return sum;
      }

      return sum + this.toCents(this.getZeroBalancePeriodParticipantMonto(group, periodIndex));
    }, 0);
    const targetTotalCentavos = Math.max(
      blockedTotalCentavos,
      this.toCents(this.normalizeDecimalValue(Number(montoTotal ?? 0))),
    );
    const editableGroups = groups.filter(
      (group) => !this.isCuotaBloqueadaEnEditor(group, periodIndex),
    );
    const editableTargetCentavos = Math.max(0, targetTotalCentavos - blockedTotalCentavos);
    const weights = this.getZeroBalanceDistributionWeights(editableGroups, periodIndex);
    let assignedCentavos = 0;

    editableGroups.forEach((group, index) => {
      const cuotaGroup = this.getCuotasArray(group).at(periodIndex);

      if (!cuotaGroup) {
        return;
      }

      const cuotaCentavos =
        index === editableGroups.length - 1
          ? Math.max(0, editableTargetCentavos - assignedCentavos)
          : Math.max(0, Math.floor(editableTargetCentavos * (weights[index] ?? 0)));

      assignedCentavos += cuotaCentavos;
      cuotaGroup.controls.monto.setValue(this.centsToAmount(cuotaCentavos), {
        emitEvent: false,
      });
      cuotaGroup.controls.monto.updateValueAndValidity({ emitEvent: false });
    });

    if (syncState) {
      this.syncZeroBalanceSharedStateFromPeriods();
    }
  }

  private syncZeroBalanceSharedStateFromPeriods(): void {
    const groups = this.getZeroBalanceParticipantGroups();

    if (!groups.length) {
      return;
    }

    this.ensureZeroBalancePeriodPercentagesForAll();
    this.syncZeroBalanceParticipantBasePercentages();

    groups.forEach((group) => {
      const montoTotal = this.getCuotasTotal(group);

      group.controls.monto.setValue(this.getMontoInputValueForTarget(group, montoTotal), {
        emitEvent: false,
      });
      group.controls.monto.updateValueAndValidity({ emitEvent: false });
      group.controls.cantidad_cuotas.setValue(this.getCuotasArray(group).length, {
        emitEvent: false,
      });
      group.controls.cantidad_cuotas.updateValueAndValidity({ emitEvent: false });
    });

    const montoTransaccion = this.normalizeDecimalValue(
      groups.reduce((sum, group) => sum + this.getCuotasTotal(group), 0),
    );

    this.transaccionForm.controls.monto.setValue(montoTransaccion, { emitEvent: false });
    this.transaccionForm.controls.monto.updateValueAndValidity({ emitEvent: false });
    this.refreshEstadoTransaccionForEdit();
  }

  private syncZeroBalancePeriodPercentagesFromCurrentMontos(periodIndex: number): void {
    const periodGroups = this.getZeroBalanceGroupsForPeriod(periodIndex);

    if (!periodGroups.length) {
      return;
    }

    const totalCentavos = periodGroups.reduce((sum, group) => {
      const cuotaGroup = this.getCuotasArray(group).at(periodIndex);
      return sum + this.toCents(Number(cuotaGroup?.controls.monto.value ?? 0));
    }, 0);

    if (totalCentavos <= 0) {
      const fallbackWeights = this.getZeroBalanceDistributionWeights(periodGroups);
      let assignedFallback = 0;

      periodGroups.forEach((group, index) => {
        const percentages = this.ensureZeroBalancePeriodPercentages(group);
        const nextPercentage =
          index === periodGroups.length - 1
            ? this.normalizePercentageValue(Math.max(0, 100 - assignedFallback))
            : this.normalizePercentageValue((fallbackWeights[index] ?? 0) * 100);

        assignedFallback = this.normalizePercentageValue(assignedFallback + nextPercentage);
        percentages[periodIndex] = nextPercentage;
        this.zeroBalancePeriodPercentagesByGroup.set(group, percentages);
      });

      return;
    }

    let assignedPercentage = 0;

    periodGroups.forEach((group, index) => {
      const cuotaGroup = this.getCuotasArray(group).at(periodIndex);
      const cuotaCentavos = this.toCents(Number(cuotaGroup?.controls.monto.value ?? 0));
      const percentages = this.ensureZeroBalancePeriodPercentages(group);
      const nextPercentage =
        index === periodGroups.length - 1
          ? this.normalizePercentageValue(Math.max(0, 100 - assignedPercentage))
          : this.normalizePercentageValue((cuotaCentavos * 100) / totalCentavos);

      assignedPercentage = this.normalizePercentageValue(assignedPercentage + nextPercentage);
      percentages[periodIndex] = nextPercentage;
      this.zeroBalancePeriodPercentagesByGroup.set(group, percentages);
    });
  }

  private redistributeZeroBalancePeriodsFromPercentages(): void {
    const periodTotals = this.getZeroBalancePeriodIndexes().map((periodIndex) =>
      this.getZeroBalancePeriodTotal(periodIndex),
    );

    periodTotals.forEach((montoTotal, periodIndex) =>
      this.setZeroBalancePeriodTotal(periodIndex, montoTotal, false),
    );

    this.syncZeroBalanceSharedStateFromPeriods();
  }

  private recalculateZeroBalanceSharedPercentageDistribution(
    editedGroup: ParticipanteDetalleForm,
  ): void {
    const groups = this.getZeroBalanceParticipantGroups();

    if (groups.length === 0) {
      return;
    }

    const otherGroups = groups.filter((group) => group !== editedGroup);
    const editedPercentage =
      otherGroups.length === 0
        ? 100
        : this.normalizePercentageValue(Number(editedGroup.controls.porcentaje.value ?? 0));

    editedGroup.controls.porcentaje.setValue(editedPercentage, { emitEvent: false });
    editedGroup.controls.porcentaje.updateValueAndValidity({ emitEvent: false });

    const totalOtherPercentage = otherGroups.reduce(
      (sum, group) =>
        sum + this.normalizePercentageValue(Number(group.controls.porcentaje.value ?? 0)),
      0,
    );
    let assignedPercentage = editedPercentage;

    otherGroups.forEach((group, index) => {
      const isLastGroup = index === otherGroups.length - 1;
      let nextPercentage = 0;

      if (isLastGroup) {
        nextPercentage = this.normalizePercentageValue(Math.max(0, 100 - assignedPercentage));
      } else if (totalOtherPercentage > 0) {
        nextPercentage = this.normalizePercentageValue(
          ((100 - editedPercentage) *
            this.normalizePercentageValue(Number(group.controls.porcentaje.value ?? 0))) /
            totalOtherPercentage,
        );
        assignedPercentage = this.normalizePercentageValue(assignedPercentage + nextPercentage);
      }

      group.controls.porcentaje.setValue(nextPercentage, { emitEvent: false });
      group.controls.porcentaje.updateValueAndValidity({ emitEvent: false });
    });

    this.redistributeZeroBalancePeriodsFromPercentages();
  }

  private getCuotasPayload(group: ParticipanteDetalleForm): CuotaPayload[] {
    return this.getCuotasArray(group).controls.map((cuotaGroup, index) => ({
      monto: this.getCuotaMontoForPayload(group, cuotaGroup, index),
      fecha_programada: cuotaGroup.controls.fecha_programada.value,
    }));
  }

  getCuotasTotal(group: ParticipanteDetalleForm): number {
    return this.centsToAmount(
      this.getCuotasPayload(group).reduce(
        (sum, cuota) => sum + this.toCents(cuota.monto),
        0,
      ),
    );
  }

  getCuotasRemaining(group: ParticipanteDetalleForm): number {
    return this.centsToAmount(
      this.toCents(this.getGroupMontoTarget(group)) -
        this.toCents(this.getCuotasTotal(group)),
    );
  }

  isCuotasTotalValid(group: ParticipanteDetalleForm): boolean {
    return this.toCents(this.getCuotasTotal(group)) === this.toCents(this.getGroupMontoTarget(group));
  }

  private distributeMontoEnCuotas(montoTotal: number, cantidadCuotas: number): number[] {
    const cuotas = Math.max(0, Math.trunc(cantidadCuotas || 0));

    if (cuotas === 0) {
      return [];
    }

    const totalCentavos = this.toCents(this.normalizeDecimalValue(Number(montoTotal ?? 0)));
    const cuotaBase = Math.floor(totalCentavos / cuotas);
    const residuo = totalCentavos % cuotas;

    return Array.from({ length: cuotas }, (_, index) =>
      this.centsToAmount(cuotaBase + (index < residuo ? 1 : 0)),
    );
  }

  private buildCuotasForConfiguredCount(
    group: ParticipanteDetalleForm,
    requestedCuotasCount: number,
  ): CuotaPayload[] {
    const montoObjetivo = this.normalizeDecimalValue(Number(group.controls.monto.value ?? 0));
    const montoObjetivoTotal = this.getGroupMontoTarget(group);
    const cuotasCount = this.normalizeCuotasCountValue(group, requestedCuotasCount);

    if (cuotasCount <= 0) {
      return [];
    }

    if (this.isIncomeTitularGroup(group)) {
      const montoBase = this.normalizeDecimalValue(
        Number(this.transaccionForm.controls.monto.value ?? 0),
      );
      const montos = this.isFixedCuotasMode(group)
        ? Array.from({ length: cuotasCount }, () => montoBase)
        : this.distributeMontoEnCuotas(montoBase, cuotasCount);

      return montos.map((monto) => ({
        monto,
        fecha_programada:
          cuotasCount === 1
            ? this.getSingleCuotaDefaultFechaProgramada()
            : null,
      }));
    }

    if (!this.hasAppliedPagosInEditor) {
      if (this.isFixedCuotasMode(group)) {
        return Array.from({ length: cuotasCount }, () => ({
          monto: montoObjetivo,
          fecha_programada:
            cuotasCount === 1
              ? this.getSingleCuotaDefaultFechaProgramada()
              : null,
        }));
      }

      return this.distributeMontoEnCuotas(montoObjetivo, cuotasCount).map((monto) => ({
        monto,
        fecha_programada:
          cuotasCount === 1
            ? this.getSingleCuotaDefaultFechaProgramada()
            : null,
      }));
    }

    const cuotasActuales = this.getCuotasPayload(group);
    const cuotasBloqueadas = cuotasActuales.filter((_cuota, index) =>
      this.isCuotaBloqueadaEnEditor(group, index),
    );
    const totalBloqueadoCentavos = cuotasBloqueadas.reduce(
      (sum, cuota) => sum + this.toCents(cuota.monto),
      0,
    );
    const montoEditableCentavos = Math.max(
      0,
      this.toCents(montoObjetivoTotal) - totalBloqueadoCentavos,
    );
    const minCuotasPermitidas =
      cuotasBloqueadas.length + (montoEditableCentavos > 0 ? 1 : 0);
    const totalCuotas = Math.max(cuotasCount, minCuotasPermitidas);
    const cuotasEditablesDeseadas = Math.max(0, totalCuotas - cuotasBloqueadas.length);
    const montosEditables =
      cuotasEditablesDeseadas > 0
        ? this.distributeMontoEnCuotas(
            this.centsToAmount(montoEditableCentavos),
            cuotasEditablesDeseadas,
          )
        : [];

    const cuotasReconstruidas: CuotaPayload[] = [];
    let editableIndex = 0;

    cuotasActuales.forEach((cuota, index) => {
      if (this.isCuotaBloqueadaEnEditor(group, index)) {
        cuotasReconstruidas.push(cuota);
        return;
      }

      if (editableIndex >= montosEditables.length) {
        return;
      }

      cuotasReconstruidas.push({
        monto: montosEditables[editableIndex],
        fecha_programada: cuota.fecha_programada,
      });
      editableIndex += 1;
    });

    while (editableIndex < montosEditables.length) {
      cuotasReconstruidas.push({
        monto: montosEditables[editableIndex],
        fecha_programada:
          montosEditables.length === 1 && cuotasReconstruidas.length === 0
            ? this.getSingleCuotaDefaultFechaProgramada()
            : null,
      });
      editableIndex += 1;
    }

    return cuotasReconstruidas;
  }

  private syncCuotasWithMonto(group: ParticipanteDetalleForm): void {
    const cantidadCuotas = this.normalizeCuotasCountValue(
      group,
      group.controls.cantidad_cuotas.value,
    );

    if (this.isIncomeTitularGroup(group)) {
      this.updateIncomeTitularMonto(group, cantidadCuotas);
    }

    this.replaceCuotasArray(
      group,
      this.buildCuotasForConfiguredCount(group, cantidadCuotas).map((cuota) => ({
        monto: cuota.monto,
        fecha_programada: cuota.fecha_programada,
      })),
    );
    this.syncStandaloneExpenseMonto(group);
    this.ensureProgramacionConfig(group);
    this.alignCuotasToGroupTarget(group);
    this.refreshProgramacionCuotas(group);
    this.refreshEstadoTransaccionForEdit();
  }

  private syncCuotasCount(group: ParticipanteDetalleForm): void {
    const cuotasCount = this.normalizeCuotasCountValue(
      group,
      group.controls.cantidad_cuotas.value,
    );
    group.controls.cantidad_cuotas.setValue(cuotasCount, { emitEvent: false });

    if (this.isIncomeTitularGroup(group)) {
      this.updateIncomeTitularMonto(group, cuotasCount);
    }

    this.replaceCuotasArray(
      group,
      this.buildCuotasForConfiguredCount(group, cuotasCount).map((cuota) => ({
        monto: cuota.monto,
        fecha_programada: cuota.fecha_programada,
      })),
    );
    this.syncStandaloneExpenseMonto(group);
    this.ensureProgramacionConfig(group);
    this.alignCuotasToGroupTarget(group);
    this.refreshProgramacionCuotas(group);

    if (this.isEditingSharedExpenseMode) {
      this.syncCalculatedExpenseMontoForEdit();
      return;
    }

    this.refreshEstadoTransaccionForEdit();
  }

  private getMinimumCuotasAllowedForGroup(group: ParticipanteDetalleForm): number {
    const cuotasActuales = this.getCuotasPayload(group);
    const cuotasBloqueadas = cuotasActuales.filter((_cuota, index) =>
      this.isCuotaBloqueadaEnEditor(group, index),
    );
    const totalBloqueadoCentavos = cuotasBloqueadas.reduce(
      (sum, cuota) => sum + this.toCents(cuota.monto),
      0,
    );
    const montoObjetivoCentavos = this.toCents(this.getGroupMontoTarget(group));
    const montoEditableCentavos = Math.max(0, montoObjetivoCentavos - totalBloqueadoCentavos);

    return cuotasBloqueadas.length + (montoEditableCentavos > 0 ? 1 : 0);
  }

  private buildCuotasAfterRemovingIndex(
    group: ParticipanteDetalleForm,
    cuotaIndex: number,
  ): CuotaPayload[] {
    const cuotasRestantes = this.getCuotasPayload(group)
      .map((cuota, index) => ({
        cuota,
        bloqueada: this.isCuotaBloqueadaEnEditor(group, index),
      }))
      .filter((_item, index) => index !== cuotaIndex);
    const montoObjetivo = this.normalizeDecimalValue(Number(group.controls.monto.value ?? 0));
    const montoObjetivoTotal = this.getGroupMontoTarget(group);

    if (cuotasRestantes.length === 0) {
      return [];
    }

    if (this.isIncomeTitularGroup(group)) {
      this.updateIncomeTitularMonto(group, cuotasRestantes.length);
      return this.buildCuotasForConfiguredCount(group, cuotasRestantes.length);
    }

    if (!this.hasAppliedPagosInEditor) {
      if (this.isFixedCuotasMode(group)) {
        return cuotasRestantes.map((item) => ({
          monto: montoObjetivo,
          fecha_programada: item.cuota.fecha_programada,
        }));
      }

      const montosRedistribuidos = this.distributeMontoEnCuotas(
        montoObjetivo,
        cuotasRestantes.length,
      );

      return cuotasRestantes.map((item, index) => ({
        monto: montosRedistribuidos[index] ?? 0,
        fecha_programada: item.cuota.fecha_programada,
      }));
    }

    const totalBloqueadoCentavos = cuotasRestantes.reduce(
      (sum, item) => sum + (item.bloqueada ? this.toCents(item.cuota.monto) : 0),
      0,
    );
    const cuotasEditablesRestantes = cuotasRestantes.filter((item) => !item.bloqueada).length;
    const montoEditableCentavos = Math.max(
      0,
      this.toCents(montoObjetivoTotal) - totalBloqueadoCentavos,
    );
    const montosEditablesRedistribuidos =
      cuotasEditablesRestantes > 0
        ? this.distributeMontoEnCuotas(
            this.centsToAmount(montoEditableCentavos),
            cuotasEditablesRestantes,
          )
        : [];
    let editableIndex = 0;

    return cuotasRestantes.map((item) => {
      if (item.bloqueada) {
        return item.cuota;
      }

      const montoRedistribuido = montosEditablesRedistribuidos[editableIndex] ?? 0;
      editableIndex += 1;

      return {
        monto: montoRedistribuido,
        fecha_programada: item.cuota.fecha_programada,
      };
    });
  }

  private syncLastCuotaWithMonto(group: ParticipanteDetalleForm): void {
    if (this.isCuotaMontoReadonly(group)) {
      this.syncCuotasWithMonto(group);
      return;
    }

    const cuotasArray = this.getCuotasArray(group);

    if (cuotasArray.length === 0) {
      return;
    }

    const cuotasEditables = cuotasArray.controls.filter(
      (_cuotaGroup, index) => !this.isCuotaBloqueadaEnEditor(group, index),
    );
    const montoObjetivoCentavos = this.toCents(this.getGroupMontoTarget(group));
    const totalBloqueadoCentavos = cuotasArray.controls.reduce(
      (sum, cuotaGroup, index) =>
        sum +
        (this.isCuotaBloqueadaEnEditor(group, index)
          ? this.toCents(this.normalizeDecimalValue(Number(cuotaGroup.controls.monto.value ?? 0)))
          : 0),
      0,
    );
    const montoEditableObjetivoCentavos = Math.max(
      0,
      montoObjetivoCentavos - totalBloqueadoCentavos,
    );

    if (cuotasEditables.length === 0) {
      return;
    }

    if (cuotasEditables.length === 1) {
      cuotasEditables[0]?.controls.monto.setValue(
        this.centsToAmount(montoEditableObjetivoCentavos),
        { emitEvent: false },
      );
      cuotasEditables[0]?.controls.monto.updateValueAndValidity({ emitEvent: false });
      this.refreshProgramacionCuotas(group);
      this.refreshEstadoTransaccionForEdit();
      return;
    }

    const sumaSinUltimaCentavos = cuotasEditables.slice(0, -1).reduce(
      (sum, cuotaGroup) =>
        sum + this.toCents(this.normalizeDecimalValue(Number(cuotaGroup.controls.monto.value ?? 0))),
      0,
    );
    const ultimaCuota = cuotasEditables[cuotasEditables.length - 1];
    const montoUltimaCuota = this.centsToAmount(
      Math.max(0, montoEditableObjetivoCentavos - sumaSinUltimaCentavos),
    );

    ultimaCuota?.controls.monto.setValue(montoUltimaCuota, { emitEvent: false });
    ultimaCuota?.controls.monto.updateValueAndValidity({ emitEvent: false });
    this.refreshProgramacionCuotas(group);
    this.refreshEstadoTransaccionForEdit();
  }

  private alignCuotasToGroupTarget(group: ParticipanteDetalleForm): void {
    const cuotasArray = this.getCuotasArray(group);

    if (cuotasArray.length === 0) {
      return;
    }

    const diffCentavos =
      this.toCents(this.getGroupMontoTarget(group)) - this.toCents(this.getCuotasTotal(group));

    if (diffCentavos === 0) {
      return;
    }

    const editableCuotas = cuotasArray.controls
      .map((cuotaGroup, index) => ({ cuotaGroup, index }))
      .filter(({ index }) => !this.isCuotaBloqueadaEnEditor(group, index));

    const cuotaObjetivo = editableCuotas[editableCuotas.length - 1]?.cuotaGroup;

    if (!cuotaObjetivo) {
      return;
    }

    const montoActualCentavos = this.toCents(
      this.normalizeDecimalValue(Number(cuotaObjetivo.controls.monto.value ?? 0)),
    );
    const montoAjustado = this.centsToAmount(Math.max(0, montoActualCentavos + diffCentavos));

    cuotaObjetivo.controls.monto.setValue(montoAjustado, { emitEvent: false });
    cuotaObjetivo.controls.monto.updateValueAndValidity({ emitEvent: false });
  }

  private validateCuotasConfiguration(): boolean {
    return this.participantesDetalleArray.controls.every((group) => {
      const montoGrupo = this.getGroupMontoTarget(group);
      const totalCuotas = this.getCuotasTotal(group);

      return this.toCents(montoGrupo) === this.toCents(totalCuotas);
    });
  }

  private ensureProgramacionConfig(group: ParticipanteDetalleForm): void {
    const cuotasCount = this.normalizeCuotasCountValue(
      group,
      group.controls.cantidad_cuotas.value,
    );

    if (cuotasCount <= 1) {
      group.controls.tipo_programacion.setValue('ninguna', { emitEvent: false });
      group.controls.dia_programado.setValue(null, { emitEvent: false });
      return;
    }

    if (group.controls.tipo_programacion.value === 'ninguna') {
      group.controls.tipo_programacion.setValue('dia_mes', { emitEvent: false });
    }

    if (
      group.controls.tipo_programacion.value === 'dia_mes' &&
      (group.controls.dia_programado.value === null || group.controls.dia_programado.value === undefined)
    ) {
      group.controls.dia_programado.setValue(this.getDefaultDiaProgramado(), { emitEvent: false });
    }
  }

  private refreshProgramacionForAllGroups(forceSingleCuotaDefault = false): void {
    this.participantesDetalleArray.controls.forEach((group) =>
      this.refreshProgramacionCuotas(group, forceSingleCuotaDefault),
    );
  }

  private refreshProgramacionCuotas(
    group: ParticipanteDetalleForm,
    forceSingleCuotaDefault = false,
  ): void {
    const cuotasArray = this.getCuotasArray(group);
    const cuotasCount = cuotasArray.length;

    if (cuotasCount <= 1) {
      const defaultFechaProgramada = this.getSingleCuotaDefaultFechaProgramada();

      cuotasArray.controls.forEach((cuota, index) => {
        if (this.isCuotaBloqueadaEnEditor(group, index)) {
          return;
        }

        cuota.controls.fecha_programada.setValue(
          forceSingleCuotaDefault
            ? defaultFechaProgramada
            : (cuota.controls.fecha_programada.value ?? defaultFechaProgramada),
          { emitEvent: false },
        );
      });
      return;
    }

    this.ensureProgramacionConfig(group);

    const fechasProgramadas = this.buildFechasProgramadas(
      cuotasCount,
      group.controls.tipo_programacion.value,
      group.controls.dia_programado.value,
    );

    cuotasArray.controls.forEach((cuota, index) => {
      if (this.isCuotaBloqueadaEnEditor(group, index)) {
        return;
      }

      cuota.controls.fecha_programada.setValue(fechasProgramadas[index] ?? null, {
        emitEvent: false,
      });
    });
  }

  private buildFechasProgramadas(
    cantidadCuotas: number,
    tipoProgramacion: ProgramacionCuotaTipo,
    diaProgramado: number | null,
  ): Array<string | null> {
    if (cantidadCuotas <= 1 || tipoProgramacion === 'ninguna') {
      return Array.from({ length: cantidadCuotas }, () => null);
    }

    const fechaBase =
      this.normalizeDateInputValue(this.transaccionForm.controls.fecha_transaccion.value ?? '') ??
      this.formatDateInput(this.today);

    switch (tipoProgramacion) {
      case 'dia_mes':
        return this.buildFechasDiaMes(fechaBase, cantidadCuotas, this.normalizeDiaProgramado(diaProgramado));
      case 'quincenal':
        return this.buildFechasQuincenales(fechaBase, cantidadCuotas);
      case 'fin_mes':
        return this.buildFechasFinMes(fechaBase, cantidadCuotas);
      default:
        return Array.from({ length: cantidadCuotas }, () => null);
    }
  }

  private getSingleCuotaDefaultFechaProgramada(): string | null {
    if (
      this.resolveTipoTransaccion({
        id_tipo_transaccion: Number(this.transaccionForm.controls.id_tipo_transaccion.value ?? 0),
        nombre_tipo_transaccion: null,
      }) !== 'debito'
    ) {
      return null;
    }

    const fechaBase =
      this.normalizeDateInputValue(this.transaccionForm.controls.fecha_transaccion.value ?? '') ??
      this.formatDateInput(this.today);

    return this.buildSingleCuotaFechaProgramada(fechaBase);
  }

  private buildSingleCuotaFechaProgramada(fechaBaseIso: string): string {
    const diasGracia = Number(this.getCurrentFormaPago()?.dias_gracia);
    const diasProgramados =
      Number.isFinite(diasGracia) && diasGracia > 0
        ? Math.max(0, Math.trunc(diasGracia) - 1)
        : 7;

    return this.formatDateInput(this.addDays(this.parseIsoDate(fechaBaseIso), diasProgramados));
  }

  private getCurrentFormaPago(): CatalogoFormaPago | null {
    const formaPagoId = Number(this.transaccionForm.controls.forma_pago.value ?? 0);

    return this.formasPago.find((item) => item.id_forma === formaPagoId) ?? this.selectedFormaPago;
  }

  private buildFechasDiaMes(
    fechaBaseIso: string,
    cantidadCuotas: number,
    diaProgramado: number,
  ): string[] {
    const fechas: string[] = [];
    let year = Number(fechaBaseIso.slice(0, 4));
    let month = Number(fechaBaseIso.slice(5, 7)) - 1;
    const fechaBase = this.parseIsoDate(fechaBaseIso);

    while (fechas.length < cantidadCuotas) {
      const candidate = this.createDateWithPreferredDay(year, month, diaProgramado);

      if (candidate.getTime() > fechaBase.getTime()) {
        fechas.push(this.formatDateInput(candidate));
      }

      month += 1;
      if (month > 11) {
        month = 0;
        year += 1;
      }
    }

    return fechas;
  }

  private buildFechasFinMes(fechaBaseIso: string, cantidadCuotas: number): string[] {
    const fechas: string[] = [];
    let year = Number(fechaBaseIso.slice(0, 4));
    let month = Number(fechaBaseIso.slice(5, 7)) - 1;
    const fechaBase = this.parseIsoDate(fechaBaseIso);

    while (fechas.length < cantidadCuotas) {
      const candidate = this.getEndOfMonthDate(year, month);

      if (candidate.getTime() > fechaBase.getTime()) {
        fechas.push(this.formatDateInput(candidate));
      }

      month += 1;
      if (month > 11) {
        month = 0;
        year += 1;
      }
    }

    return fechas;
  }

  private buildFechasQuincenales(fechaBaseIso: string, cantidadCuotas: number): string[] {
    const fechas: string[] = [];
    let cursor = this.parseIsoDate(fechaBaseIso);

    while (fechas.length < cantidadCuotas) {
      cursor = this.getNextQuincenalDate(cursor);
      fechas.push(this.formatDateInput(cursor));
    }

    return fechas;
  }

  private getNextQuincenalDate(referenceDate: Date): Date {
    const year = referenceDate.getFullYear();
    const month = referenceDate.getMonth();
    const quincenaActual = new Date(year, month, 15);
    const finMesActual = this.getEndOfMonthDate(year, month);

    if (referenceDate.getTime() < quincenaActual.getTime()) {
      return quincenaActual;
    }

    if (referenceDate.getTime() < finMesActual.getTime()) {
      return finMesActual;
    }

    return new Date(year, month + 1, 15);
  }

  private getEndOfMonthDate(year: number, month: number): Date {
    return new Date(year, month + 1, 0);
  }

  private createDateWithPreferredDay(year: number, month: number, day: number): Date {
    const lastDay = this.getEndOfMonthDate(year, month).getDate();
    return new Date(year, month, Math.min(day, lastDay));
  }

  private parseIsoDate(value: string): Date {
    const [year, month, day] = value.split('-').map(Number);
    return new Date(year, month - 1, day);
  }

  private getDefaultDiaProgramado(): number {
    const fechaBase =
      this.normalizeDateInputValue(this.transaccionForm.controls.fecha_transaccion.value ?? '') ??
      this.formatDateInput(this.today);

    return Math.min(30, Math.max(1, Number(fechaBase.slice(8, 10))));
  }

  private normalizeDiaProgramado(value: number | null | undefined): number {
    const normalizedValue = Number.isFinite(Number(value))
      ? Number(value)
      : this.getDefaultDiaProgramado();
    return Math.min(30, Math.max(1, Math.trunc(normalizedValue)));
  }

  private async confirmPartialSplitIfNeeded(
    pagos: Array<{ nombre: string; montoAplicar: number; saldoPendiente: number }>,
  ): Promise<boolean> {
    const pagosParciales = pagos.filter(
      (pago) =>
        this.toCents(pago.montoAplicar) > 0 &&
        this.toCents(pago.montoAplicar) < this.toCents(pago.saldoPendiente),
    );

    if (pagosParciales.length === 0) {
      return true;
    }

    const montoRestanteTotal = this.getMontoRestantePagoParcialTotal(pagosParciales);
    const texto =
      pagosParciales.length === 1
        ? `Se pagara solo una parte de la cuota de ${pagosParciales[0].nombre}. Se creara otra cuota con el saldo restante de $${this.normalizeDecimalValue(montoRestanteTotal).toFixed(2)}.`
        : `Se detectaron ${pagosParciales.length} pagos parciales. Se crearan nuevas cuotas con un saldo restante total de $${this.normalizeDecimalValue(montoRestanteTotal).toFixed(2)}.`;

    return this.alerts.confirm(
      'Pago parcial detectado',
      texto,
      'Aceptar',
      {
        icon: 'warning',
        confirmButtonColor: '#2563eb',
      },
    );
  }

  private buildPagoSuccessMessage(
    pagos: Array<{ nombre: string; montoAplicar: number; saldoPendiente: number }>,
  ): string {
    const montoAplicado = this.roundMoneyValue(
      pagos.reduce((sum, pago) => sum + Number(pago.montoAplicar ?? 0), 0),
    );
    const pagosParciales = pagos.filter(
      (pago) =>
        this.toCents(pago.montoAplicar) > 0 &&
        this.toCents(pago.montoAplicar) < this.toCents(pago.saldoPendiente),
    );

    if (pagosParciales.length === 0) {
      return `Pago aplicado correctamente. Se cancelaron $${montoAplicado.toFixed(2)} y el estado del detalle se actualizo.`;
    }

    const montoRestanteTotal = this.getMontoRestantePagoParcialTotal(pagosParciales);

    return `Pago aplicado correctamente. Se cancelaron $${montoAplicado.toFixed(2)}, el estado del detalle se actualizo y se genero ${pagosParciales.length === 1 ? 'una nueva cuota' : 'nuevas cuotas'} con saldo restante por $${this.normalizeDecimalValue(montoRestanteTotal).toFixed(2)}.`;
  }

  private getQuickPaySelectedMetodoPagoId(): number | null {
    return this.quickPayBulkSelectedMetodoPagoIdCache;
  }

  private hasQuickPayMetodoPagoValido(row: DetalleTransaccionListadoRow): boolean {
    return row.quickPayMetodoPagoId !== null;
  }

  private isQuickPayMetodoPagoCompatible(row: DetalleTransaccionListadoRow): boolean {
    if (this.selectedQuickPayDetalleIds.has(row.detalle.id)) {
      return true;
    }

    const rowMetodoPagoId = row.quickPayMetodoPagoId;

    if (rowMetodoPagoId === null) {
      return false;
    }

    const selectedMetodoPagoId = this.getQuickPaySelectedMetodoPagoId();
    return selectedMetodoPagoId === null || rowMetodoPagoId === selectedMetodoPagoId;
  }

  private hasMixedQuickPayBulkMethods(rows: DetalleTransaccionListadoRow[]): boolean {
    if (rows.length <= 1) {
      return false;
    }

    const firstMetodoPagoId = rows[0].quickPayMetodoPagoId;

    if (firstMetodoPagoId === null) {
      return true;
    }

    return rows.some((row) => row.quickPayMetodoPagoId !== firstMetodoPagoId);
  }

  private canSelectQuickPayDetalleForMethod(
    row: DetalleTransaccionListadoRow,
    selectedMetodoPagoId: number | null,
  ): boolean {
    return (
      row.quickPayCanSelectBase &&
      (this.selectedQuickPayDetalleIds.has(row.detalle.id) ||
        selectedMetodoPagoId === null ||
        row.quickPayMetodoPagoId === selectedMetodoPagoId)
    );
  }

  private getQuickPayMetodoPagoId(row: DetalleTransaccionListadoRow): number | null {
    return row.quickPayMetodoPagoId;
  }

  private resolveQuickPayMetodoPagoId(
    detalle: ParticipanteDetalleListado,
    transaccion: TransaccionListado,
  ): number | null {
    const methodId = Number(detalle.id_metodo_pago ?? transaccion.id_metodo_pago);

    if (!Number.isFinite(methodId) || methodId <= 0) {
      return null;
    }

    return methodId;
  }

  private getQuickPayMetodoPagoNombre(row: DetalleTransaccionListadoRow): string {
    return row.quickPayMetodoPagoNombre;
  }

  private resolveQuickPayMetodoPagoNombre(
    detalle: ParticipanteDetalleListado,
    transaccion: TransaccionListado,
    methodId: number | null,
  ): string {
    const methodName =
      transaccion.nombre_forma_pago ||
      detalle.nombre_forma_pago;

    if (methodName) {
      return methodName;
    }

    return methodId === null ? 'Sin metodo asignado' : `Metodo #${methodId}`;
  }

  private getMontoRestantePagoParcialTotal(
    pagos: Array<{ montoAplicar: number; saldoPendiente: number }>,
  ): number {
    const restanteCentavos = pagos.reduce((sum, pago) => {
      const saldoPendienteCentavos = this.toCents(pago.saldoPendiente);
      const montoAplicarCentavos = this.toCents(pago.montoAplicar);

      return sum + Math.max(0, saldoPendienteCentavos - montoAplicarCentavos);
    }, 0);

    return this.centsToAmount(restanteCentavos);
  }

  private getEditableCuotaMinimumCents(group: PagoDetalleForm): number {
    const montoMinimoTotal = this.getPagoDetalleMontoMinimoTotal(group);
    return Math.max(this.toCents(montoMinimoTotal), 1);
  }

  private distributeCentavosWithMinimums(
    totalCentavos: number,
    minimums: number[],
  ): number[] {
    if (minimums.length === 0) {
      return [];
    }

    const baseTotal = minimums.reduce((sum, minimum) => sum + minimum, 0);
    const extraCentavos = Math.max(0, totalCentavos - baseTotal);
    const cuotaBase = Math.floor(extraCentavos / minimums.length);
    const residuo = extraCentavos % minimums.length;

    return minimums.map((minimum, index) => minimum + cuotaBase + (index < residuo ? 1 : 0));
  }

  private updateMontoCuotaState(group: PagoDetalleForm, montoCuota: number): void {
    const montoNormalizado = this.normalizeDecimalValue(montoCuota);
    const montoPagadoConInteres = this.getPagoDetalleMontoPagadoConInteres(group);
    const saldoPendiente = this.normalizeDecimalValue(
      Math.max(0, montoNormalizado - montoPagadoConInteres),
    );

    group.controls.monto_cuota.setValue(montoNormalizado, { emitEvent: false });
    group.controls.monto_cuota.updateValueAndValidity({ emitEvent: false });
    group.controls.saldo_pendiente.setValue(saldoPendiente, { emitEvent: false });
    group.controls.saldo_pendiente.updateValueAndValidity({ emitEvent: false });

    if (this.getMontoAplicarNumericValue(group) > saldoPendiente) {
      this.setMontoAplicarValue(
        group,
        saldoPendiente > 0 ? this.formatMoneyInputValue(saldoPendiente) : null,
      );
    }
  }

  private getPagoDetalleMontoPagadoConInteres(group: PagoDetalleForm): number {
    return this.roundMoneyValue(
      Number(group.controls.monto_pagado.value ?? 0) +
        Number(group.controls.interes_pagado.value ?? 0),
    );
  }

  private getPagoDetalleMontoMinimoTotal(group: PagoDetalleForm): number {
    return this.roundMoneyValue(
      Number(group.controls.monto_pagado.value ?? 0) +
        this.getPagoDetalleInteresTotal(group),
    );
  }

  private buildTransaccionWithInteresEnCuotas(
    transaccion: TransaccionListado,
  ): TransaccionListado {
    const formaPago =
      this.formasPago.find((item) => item.id_forma === transaccion.id_metodo_pago) ?? null;
    const participantesDetalle = this.getParticipantesDetalleSafe(transaccion).map((detalle) =>
      this.getDetalleWithAdjustedInteres(detalle, formaPago),
    );

    const saldoPendiente = this.normalizeDecimalValue(
      participantesDetalle.reduce(
        (sum, detalle) => sum + Number(detalle.saldo_pendiente ?? 0),
        0,
      ),
    );

    return {
      ...transaccion,
      tasa_interes_anual:
        transaccion.tasa_interes_anual ??
        (formaPago?.calcula_interes === true ? (formaPago?.tasa_anual ?? null) : null),
      saldo_pendiente: saldoPendiente,
      participantes_detalle: participantesDetalle,
    };
  }

  private buildDetailModalTransaccion(
    transaccion: TransaccionListado,
  ): TransaccionListado {
    const transaccionConInteres = this.buildTransaccionWithInteresEnCuotas(transaccion);
    const formaPago =
      this.formasPago.find((item) => item.id_forma === transaccionConInteres.id_metodo_pago) ?? null;
    const participantesDetalle = this.getParticipantesDetalleSafe(transaccionConInteres).map(
      (detalle) => ({
        ...detalle,
        monto: this.roundMoneyValue(Number(detalle.monto ?? 0)),
        monto_pagado: this.roundMoneyValue(Number(detalle.monto_pagado ?? 0)),
        interes_pagado: this.roundMoneyValue(Number(detalle.interes_pagado ?? 0)),
        interes_pendiente: this.roundMoneyValue(Number(detalle.interes_pendiente ?? 0)),
        saldo_pendiente: this.roundMoneyValue(Number(detalle.saldo_pendiente ?? 0)),
      }),
    );

    return {
      ...transaccionConInteres,
      monto: this.roundMoneyValue(Number(transaccionConInteres.monto ?? 0)),
      intereses: this.roundMoneyValue(Number(transaccionConInteres.intereses ?? 0)),
      tasa_interes_anual:
        transaccionConInteres.tasa_interes_anual ??
        (formaPago?.calcula_interes === true ? (formaPago?.tasa_anual ?? null) : null),
      saldo_pendiente: this.roundMoneyValue(Number(transaccionConInteres.saldo_pendiente ?? 0)),
      participantes_detalle: participantesDetalle,
    };
  }

  private buildPaymentModalTransaccion(
    transaccion: TransaccionListado,
    detallesOverride?: ParticipanteDetalleListado[],
  ): TransaccionListado {
    const detalles = detallesOverride ?? this.getParticipantesDetalleForPayment(transaccion);
    const transaccionParaPago = this.buildTransaccionWithInteresEnCuotas({
      ...transaccion,
      participantes_detalle: detalles,
    });

    if (!detallesOverride) {
      return transaccionParaPago;
    }

    const detallesAjustados = this.getParticipantesDetalleSafe(transaccionParaPago);
    const monto = this.roundMoneyValue(
      detallesAjustados.reduce((sum, detalle) => sum + Number(detalle.monto ?? 0), 0),
    );
    const intereses = this.roundMoneyValue(
      detallesAjustados.reduce(
        (sum, detalle) =>
          sum +
          Number(detalle.interes_pagado ?? 0) +
          Number(detalle.interes_pendiente ?? 0),
        0,
      ),
    );
    const saldoPendiente = this.roundMoneyValue(
      detallesAjustados.reduce((sum, detalle) => sum + Number(detalle.saldo_pendiente ?? 0), 0),
    );
    const detalleEstado = detallesAjustados[0]?.nombre_estado ?? transaccionParaPago.nombre_estado;
    const fechaUltimoPago =
      detallesAjustados
        .map((detalle) => detalle.fecha_pago)
        .filter((value): value is string => Boolean(value))
        .sort()
        .pop() ?? transaccionParaPago.fecha_ultimo_pago;

    return {
      ...transaccionParaPago,
      monto,
      intereses,
      saldo_pendiente: saldoPendiente,
      nombre_estado: detalleEstado,
      fecha_ultimo_pago: fechaUltimoPago,
    };
  }

  private shouldApplyInteresToCuota(
    detalle: Pick<ParticipanteDetalleListado, 'id_estado'>,
  ): boolean {
    return detalle.id_estado === 3 || detalle.id_estado === 4;
  }

  private getDetalleWithAdjustedInteres(
    detalle: ParticipanteDetalleListado,
    formaPago?: CatalogoFormaPago | null,
  ): ParticipanteDetalleListado {
    const resolvedFormaPago =
      formaPago ??
      this.formasPago.find((item) => item.id_forma === detalle.id_metodo_pago) ??
      null;

    if (resolvedFormaPago?.calcula_interes !== true || !this.shouldApplyInteresToCuota(detalle)) {
      return {
        ...detalle,
        monto: this.roundMoneyValue(Number(detalle.monto ?? 0)),
        monto_pagado: this.roundMoneyValue(Number(detalle.monto_pagado ?? 0)),
        interes_pagado: this.roundMoneyValue(Number(detalle.interes_pagado ?? 0)),
        interes_pendiente: this.roundMoneyValue(Number(detalle.interes_pendiente ?? 0)),
        saldo_pendiente: this.roundMoneyValue(Number(detalle.saldo_pendiente ?? 0)),
      };
    }

    const interesPagado = Math.max(0, Number(detalle.interes_pagado ?? 0));
    const interesPendiente = Math.max(0, Number(detalle.interes_pendiente ?? 0));
    const montoBase = Number(detalle.monto ?? 0);
    const montoPagadoBase = Number(detalle.monto_pagado ?? 0);

    return {
      ...detalle,
      monto: this.roundMoneyValue(montoBase + interesPagado + interesPendiente),
      monto_pagado: this.roundMoneyValue(montoPagadoBase + interesPagado),
      interes_pagado: this.roundMoneyValue(interesPagado),
      interes_pendiente: this.roundMoneyValue(interesPendiente),
      saldo_pendiente: this.roundMoneyValue(
        Math.max(0, montoBase + interesPendiente - montoPagadoBase),
      ),
    };
  }

  private getDetalleMontoPagadoTotal(
    detalle: Pick<ParticipanteDetalleListado, 'id_estado' | 'monto_pagado' | 'interes_pagado'>,
  ): number {
    const montoPagado = Number(detalle.monto_pagado ?? 0);

    if (this.shouldApplyInteresToCuota(detalle)) {
      return this.roundMoneyValue(montoPagado);
    }

    return this.roundMoneyValue(montoPagado + Number(detalle.interes_pagado ?? 0));
  }

  private getPagoDetalleInteresTotal(group: PagoDetalleForm): number {
    return this.roundMoneyValue(
      Number(group.controls.interes_pagado.value ?? 0) +
        Number(group.controls.interes_pendiente.value ?? 0),
    );
  }

  private formatDateInput(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');

    return `${year}-${month}-${day}`;
  }

  private formatDateDisplay(date: Date): string {
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();

    return `${day}/${month}/${year}`;
  }

  private formatDateDisplayInputValue(value: string): string {
    const digitsOnly = value.replace(/\D/g, '').slice(0, 8);
    const day = digitsOnly.slice(0, 2);
    const month = digitsOnly.slice(2, 4);
    const year = digitsOnly.slice(4, 8);

    return [day, month, year].filter((part) => part.length > 0).join('/');
  }

  private formatDateDisplayFromApi(value: string): string {
    const normalizedValue = this.normalizeDateInputValue(value);

    if (!normalizedValue) {
      return value;
    }

    const [, year, month, day] =
      normalizedValue.match(/^(\d{4})-(\d{2})-(\d{2})$/) ?? [];

    if (!year || !month || !day) {
      return value;
    }

    return `${day}/${month}/${year}`;
  }

  private normalizeDateOnly(value: string | Date | null | undefined): string {
    if (!value) {
      return '';
    }

    if (value instanceof Date) {
      return this.formatDateInput(value);
    }

    return value.slice(0, 10);
  }

  private normalizeDateInputValue(value: string): string | null {
    const isoMatch = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);

    if (isoMatch) {
      return this.isValidDateParts(
        Number(isoMatch[1]),
        Number(isoMatch[2]),
        Number(isoMatch[3]),
      )
        ? value
        : null;
    }

    const displayMatch = value.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);

    if (!displayMatch) {
      return null;
    }

    const day = Number(displayMatch[1]);
    const month = Number(displayMatch[2]);
    const year = Number(displayMatch[3]);

    if (!this.isValidDateParts(year, month, day)) {
      return null;
    }

    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }

  private parseIsoDateOnly(value: string | null | undefined): Date | null {
    const normalizedValue = this.normalizeDateOnly(value);

    if (!normalizedValue) {
      return null;
    }

    const match = normalizedValue.match(/^(\d{4})-(\d{2})-(\d{2})$/);

    if (!match) {
      return null;
    }

    const [, year, month, day] = match;

    return new Date(Number(year), Number(month) - 1, Number(day));
  }

  private getDateOnlyValue(date: Date): Date {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
  }

  private addDays(date: Date, days: number): Date {
    const result = new Date(date);
    result.setDate(result.getDate() + days);

    return result;
  }

  private normalizeFormForSubmit(): void {
    this.onFechaTransaccionBlur();
    this.normalizeMoneyInput('monto');
    const interesesControl = this.transaccionForm.controls.intereses;

    if (interesesControl.value !== null && interesesControl.value !== undefined) {
      const interesesNormalizados = this.normalizeDecimalValue(
        Number(interesesControl.value),
      );
      interesesControl.setValue(interesesNormalizados, { emitEvent: false });
      interesesControl.updateValueAndValidity({ emitEvent: false });
    }

    if (this.showZeroBalancePeriodGrouping) {
      this.participantesDetalleArray.controls.forEach((group) => {
        if (
          group.controls.cantidad_cuotas.value !== null &&
          group.controls.cantidad_cuotas.value !== undefined
        ) {
          const cuotasNormalizadas = Math.max(
            1,
            Math.trunc(Number(group.controls.cantidad_cuotas.value)),
          );
          group.controls.cantidad_cuotas.setValue(cuotasNormalizadas, {
            emitEvent: false,
          });
          group.controls.cantidad_cuotas.updateValueAndValidity({
            emitEvent: false,
          });
        }

        if (group.controls.monto.value !== null && group.controls.monto.value !== undefined) {
          const montoNormalizado = this.normalizeDecimalValue(
            Number(group.controls.monto.value),
          );
          group.controls.monto.setValue(montoNormalizado, { emitEvent: false });
          group.controls.monto.updateValueAndValidity({ emitEvent: false });
        }

        this.getCuotasArray(group).controls.forEach((cuotaGroup) => {
          const montoCuota = cuotaGroup.controls.monto.value;

          if (montoCuota === null || montoCuota === undefined) {
            return;
          }

          const montoNormalizado = this.normalizeDecimalValue(Number(montoCuota));
          cuotaGroup.controls.monto.setValue(montoNormalizado, { emitEvent: false });
          cuotaGroup.controls.monto.updateValueAndValidity({ emitEvent: false });
        });
      });

      this.syncZeroBalanceSharedStateFromPeriods();
      return;
    }

    this.participantesDetalleArray.controls.forEach((group) => {
      if (
        !this.isEditingSharedExpenseMode &&
        group.controls.porcentaje.value !== null &&
        group.controls.porcentaje.value !== undefined
      ) {
        const porcentajeNormalizado = this.normalizePercentageValue(
          Number(group.controls.porcentaje.value),
        );
        group.controls.porcentaje.setValue(porcentajeNormalizado, { emitEvent: false });
        group.controls.porcentaje.updateValueAndValidity({ emitEvent: false });
      }

      if (group.controls.monto.value !== null && group.controls.monto.value !== undefined) {
        const montoNormalizado = this.normalizeDecimalValue(
          Number(group.controls.monto.value),
        );
        group.controls.monto.setValue(montoNormalizado, { emitEvent: false });
        group.controls.monto.updateValueAndValidity({ emitEvent: false });
      }

      if (
        group.controls.cantidad_cuotas.value !== null &&
        group.controls.cantidad_cuotas.value !== undefined
      ) {
        const cuotasNormalizadas = Math.max(
          1,
          Math.trunc(Number(group.controls.cantidad_cuotas.value)),
        );
        group.controls.cantidad_cuotas.setValue(cuotasNormalizadas, {
          emitEvent: false,
        });
        group.controls.cantidad_cuotas.updateValueAndValidity({
          emitEvent: false,
        });
      }

      this.syncCuotasWithMonto(group);
    });
  }

  private matchesDateRange(
    fecha: string,
    fechaDesde: string | null,
    fechaHasta: string | null,
  ): boolean {
    if (fechaDesde && fecha < fechaDesde) {
      return false;
    }

    if (fechaHasta && fecha > fechaHasta) {
      return false;
    }

    return true;
  }

  private resolveTipoTransaccion(
    transaccion: Pick<TransaccionListado, 'id_tipo_transaccion' | 'nombre_tipo_transaccion'>,
  ): 'credito' | 'debito' | null {
    if (transaccion.id_tipo_transaccion === 2) {
      return 'credito';
    }

    if (transaccion.id_tipo_transaccion === 1) {
      return 'debito';
    }

    const tipoNormalizado = this.normalizeText(transaccion.nombre_tipo_transaccion ?? '');

    if (tipoNormalizado === 'credito') {
      return 'credito';
    }

    if (tipoNormalizado === 'debito') {
      return 'debito';
    }

    return null;
  }

  private validateMontoCubiertoPorParticipantes(
    montoTotal: number,
    montoTitular: number,
    montoParticipantes: number,
    hasAdditionalParticipants: boolean,
  ): boolean {
    if (!this.usarParticipantesControl.value) {
      return this.toCents(montoTotal) > 0;
    }

    if (!hasAdditionalParticipants) {
      return this.toCents(montoTitular) === this.toCents(montoTotal);
    }

    if (this.toCents(montoTitular) < 0 || this.toCents(montoParticipantes) < 0) {
      return false;
    }

    return this.toCents(montoTitular + montoParticipantes) === this.toCents(montoTotal);
  }

  private updateMontoFromPorcentaje(
    group: ParticipanteDetalleForm,
    shouldRebalanceTitular = true,
  ): void {
    if (this.isEditingSharedExpenseMode) {
      const totalMonto = this.normalizeDecimalValue(
        Number(this.transaccionForm.controls.monto.value ?? 0),
      );
      const totalMontoCentavos = this.toCents(totalMonto);
      const porcentaje = this.normalizePercentageValue(
        Number(group.controls.porcentaje.value ?? 0),
      );
      const monto =
        totalMontoCentavos > 0
          ? this.centsToAmount(Math.floor((totalMontoCentavos * porcentaje) / 100))
          : 0;

      group.controls.monto.setValue(this.getMontoInputValueForTarget(group, monto), {
        emitEvent: false,
      });
      group.controls.monto.updateValueAndValidity({ emitEvent: false });
      this.syncCuotasWithMonto(group);

      if (this.shouldPreserveManualPercentageWithoutTitular(group, totalMonto)) {
        return;
      }

      if (shouldRebalanceTitular) {
        this.syncSharedExpenseCounterpart(group);
      }

      this.syncCalculatedExpenseMontoForEdit();
      return;
    }

    const totalMonto = this.normalizeDecimalValue(
      Number(this.transaccionForm.controls.monto.value ?? 0),
    );
    const totalMontoCentavos = this.toCents(totalMonto);
    const porcentaje = this.normalizePercentageValue(
      Number(group.controls.porcentaje.value ?? 0),
    );
    const monto =
      totalMontoCentavos > 0
        ? this.centsToAmount(Math.floor((totalMontoCentavos * porcentaje) / 100))
        : 0;

    group.controls.monto.setValue(this.getMontoInputValueForTarget(group, monto), { emitEvent: false });
    group.controls.monto.updateValueAndValidity({ emitEvent: false });
    this.syncCuotasWithMonto(group);

    if (shouldRebalanceTitular && !group.controls.es_titular.value) {
      this.rebalanceTitularParticipation();
    }
  }

  private updatePorcentajeFromMonto(
    group: ParticipanteDetalleForm,
    shouldRebalanceTitular = true,
  ): void {
    if (this.isEditingSharedExpenseMode) {
      this.syncCuotasWithMonto(group);

      const totalMonto = this.normalizeDecimalValue(
        Number(this.transaccionForm.controls.monto.value ?? 0),
      );
      const monto = this.getGroupMontoTarget(group);
      const porcentaje =
        totalMonto > 0 ? this.normalizePercentageValue((monto / totalMonto) * 100) : 0;

      group.controls.porcentaje.setValue(porcentaje, { emitEvent: false });
      group.controls.porcentaje.updateValueAndValidity({ emitEvent: false });

      if (shouldRebalanceTitular) {
        this.syncSharedExpenseCounterpart(group);
      }

      this.syncCalculatedExpenseMontoForEdit();
      return;
    }

    const totalMonto = this.normalizeDecimalValue(
      Number(this.transaccionForm.controls.monto.value ?? 0),
    );
    const monto = this.getGroupMontoTarget(group);
    const porcentaje =
      totalMonto > 0 ? this.normalizePercentageValue((monto / totalMonto) * 100) : 0;

    group.controls.porcentaje.setValue(porcentaje, { emitEvent: false });
    group.controls.porcentaje.updateValueAndValidity({ emitEvent: false });
    this.syncCuotasWithMonto(group);

    if (shouldRebalanceTitular && !group.controls.es_titular.value) {
      this.rebalanceTitularParticipation();
    }
  }

  private rebalanceTitularParticipation(): void {
    const titularGroup = this.titularDetalleGroup;

    if (!titularGroup) {
      return;
    }

    const totalMonto = this.normalizeDecimalValue(
      Number(this.transaccionForm.controls.monto.value ?? 0),
    );
    const totalMontoCentavos = this.toCents(totalMonto);
    const additionalParticipants = this.getAdditionalParticipants();
    const montoParticipantesCentavos = additionalParticipants.reduce(
      (sum, group) =>
        sum + this.toCents(this.getGroupMontoTarget(group)),
      0,
    );
    const montoTitular = this.centsToAmount(
      Math.max(0, totalMontoCentavos - montoParticipantesCentavos),
    );
    const porcentajeTitular =
      totalMonto > 0 ? this.normalizePercentageValue((montoTitular / totalMonto) * 100) : 0;

    titularGroup.controls.monto.setValue(
      this.getMontoInputValueForTarget(titularGroup, montoTitular),
      { emitEvent: false },
    );
    titularGroup.controls.monto.updateValueAndValidity({ emitEvent: false });
    titularGroup.controls.porcentaje.setValue(porcentajeTitular, { emitEvent: false });
    titularGroup.controls.porcentaje.updateValueAndValidity({ emitEvent: false });
    this.syncCuotasWithMonto(titularGroup);
  }

  private syncStandaloneExpenseMonto(group: ParticipanteDetalleForm): void {
    if (
      this.isEditingIncomeMode ||
      !group.controls.es_titular.value ||
      this.getAdditionalParticipants().length > 0
    ) {
      return;
    }

    const montoTotal = this.getGroupMontoTarget(group);
    this.transaccionForm.controls.monto.setValue(montoTotal, { emitEvent: false });
    this.transaccionForm.controls.monto.updateValueAndValidity({ emitEvent: false });
  }

  private getResolvedSubmitMontoTotal(formMonto: number): number {
    if (this.isEditingIncomeMode) {
      return Number(this.titularDetalleGroup?.controls.monto.value ?? formMonto ?? 0);
    }

    if (this.isEditingSharedExpenseMode) {
      return this.isEditingSharedExpenseTotalEditable
        ? this.normalizeDecimalValue(Number(formMonto ?? 0))
        : this.getCalculatedExpenseSubmitMontoTotal(formMonto);
    }

    const titularGroup = this.titularDetalleGroup;

    if (titularGroup && this.getAdditionalParticipants().length === 0) {
      return this.getGroupMontoTarget(titularGroup);
    }

    return this.normalizeDecimalValue(Number(formMonto ?? 0));
  }

  private getCalculatedExpenseSubmitMontoTotal(formMonto: number): number {
    if (this.participantesDetalleArray.length === 0) {
      return this.normalizeDecimalValue(Number(formMonto ?? 0));
    }

    return this.normalizeDecimalValue(
      this.participantesDetalleArray.controls.reduce(
        (sum, group) => sum + this.getCuotasTotal(group),
        0,
      ),
    );
  }

  private updateEditingMontoValidators(): void {
    const control = this.transaccionForm.controls.monto;
    const validators = this.isEditingSharedExpenseMode
      ? [this.maxTwoDecimalsValidator()]
      : [Validators.required, Validators.min(0.01), this.maxTwoDecimalsValidator()];

    control.setValidators(validators);
    control.updateValueAndValidity({ emitEvent: false });
  }

  private syncCalculatedExpenseMontoForEdit(
    preservedPercentageGroup?: ParticipanteDetalleForm,
  ): void {
    if (!this.isEditingSharedExpenseMode || this.syncingSharedExpenseCalculatedMonto) {
      return;
    }

    if (this.showZeroBalancePeriodGrouping) {
      this.syncZeroBalanceSharedStateFromPeriods();
      return;
    }

    this.syncingSharedExpenseCalculatedMonto = true;

    try {
      if (this.getAdditionalParticipants().length > 0) {
        this.syncSharedExpenseTitularResidual();
      } else {
        this.syncSharedExpenseMainMontoToTitular();
      }

      const montoTotal = this.isEditingSharedExpenseTotalEditable
        ? this.normalizeDecimalValue(Number(this.transaccionForm.controls.monto.value ?? 0))
        : this.getCalculatedExpenseSubmitMontoTotal(
            Number(this.transaccionForm.controls.monto.value ?? 0),
          );

      if (!this.isEditingSharedExpenseTotalEditable) {
        this.transaccionForm.controls.monto.setValue(montoTotal, { emitEvent: false });
        this.transaccionForm.controls.monto.updateValueAndValidity({ emitEvent: false });
      }

      this.syncSharedExpensePercentagesToHundred(
        montoTotal,
        undefined,
        preservedPercentageGroup,
      );
    } finally {
      this.syncingSharedExpenseCalculatedMonto = false;
    }

    this.refreshEstadoTransaccionForEdit();
  }

  private applySharedExpenseCuotaDrivenModeForEdit(): void {
    if (!this.isEditingSharedExpenseCuotasDesdeFechaProgramadaMode) {
      return;
    }

    this.participantesDetalleArray.controls.forEach((group) => {
      const wasFixedCuotasMode = this.isFixedCuotasMode(group);

      group.controls.dividir_monto.setValue(true, { emitEvent: false });
      group.controls.dividir_monto.updateValueAndValidity({ emitEvent: false });
      group.controls.modo_cuotas.setValue('divididas', { emitEvent: false });
      group.controls.modo_cuotas.updateValueAndValidity({ emitEvent: false });

      if (wasFixedCuotasMode) {
        group.controls.monto.setValue(this.getCuotasTotal(group), { emitEvent: false });
        group.controls.monto.updateValueAndValidity({ emitEvent: false });
      }
    });
  }

  private getErrorMessage(error: unknown, fallback: string): string {
    if (error instanceof HttpErrorResponse) {
      const backendMessage = error.error?.message;

      if (Array.isArray(backendMessage) && backendMessage.length > 0) {
        return backendMessage.join(' ');
      }

      if (typeof backendMessage === 'string' && backendMessage.trim()) {
        return backendMessage;
      }
    }

    return fallback;
  }

  private buildIncompleteFormMessage(): string {
    const missingFields: string[] = [];

    if (this.transaccionForm.controls.fecha_transaccion.invalid) {
      missingFields.push('Fecha');
    }

    if (this.transaccionForm.controls.id_tipo_transaccion.invalid) {
      missingFields.push('Tipo de transaccion');
    }

    if (this.transaccionForm.controls.forma_pago.invalid) {
      missingFields.push('Forma de pago');
    }

    if (this.transaccionForm.controls.id_categoria.invalid) {
      missingFields.push('Categoria');
    }

    if (this.transaccionForm.controls.id_estado.invalid) {
      missingFields.push('Estado');
    }

    if (this.transaccionForm.controls.intereses.invalid) {
      missingFields.push('Intereses');
    }

    if (!this.isEditingSharedExpenseMode && this.transaccionForm.controls.monto.invalid) {
      missingFields.push('Monto total');
    }

    this.participantesDetalleArray.controls.forEach((group, index) => {
      const label = group.controls.es_titular.value ? 'Titular' : `Participante ${index}`;

      if (!group.controls.es_titular.value && group.controls.id_participante.invalid) {
        missingFields.push(`${label}: nombre`);
      }

      if (group.controls.cantidad_cuotas.invalid) {
        missingFields.push(`${label}: cuotas`);
      }

      if (group.controls.monto.invalid) {
        missingFields.push(`${label}: monto`);
      }
    });

    if (missingFields.length === 0) {
      return 'Completa los campos obligatorios antes de guardar la transaccion.';
    }

    return `Completa estos campos: ${missingFields.join(', ')}.`;
  }

  private buildCalculoInteresesSuccessMessage(
    result: CalculoInteresesResponse,
  ): string {
    if (result.registros_procesados <= 0) {
      return 'Intereses calculados correctamente. No hubo registros pendientes para procesar.';
    }

    return `Se procesaron ${result.registros_procesados} registros, total intereses: $${result.total_intereses_generados.toFixed(2)}.`;
  }

  private async loadPageForToday(): Promise<void> {
    if (this.pageEnterLoadPromise) {
      return this.pageEnterLoadPromise;
    }

    this.pageEnterLoadPromise = this.loadPageForTodayInternal();

    try {
      await this.pageEnterLoadPromise;
    } finally {
      this.pageEnterLoadPromise = null;
    }
  }

  private async loadPageForTodayInternal(): Promise<void> {
    this.resetDefaultFilters();
    await this.loadInitialData();
    await this.processAutoOpenPaymentRequest();
  }

  private resetDefaultFilters(): void {
    const useTodayDefaults = false;
    const useAllListadoDefaults = this.viewMode !== 'detalle';
    const usePriorityDefaults = false;
    const useOverdueDefaults = this.viewMode === 'detalle';
    this.filtrosForm.reset({
      todos: useAllListadoDefaults,
      soloHoy: useTodayDefaults,
      mesActual: false,
      mesFiltro: null,
      anioFiltro: null,
      prioritarios: usePriorityDefaults,
      vencidos: useOverdueDefaults,
      diasPrioridad: this.viewMode === 'detalle'
        ? QUICK_PAY_DEFAULT_PRIORITY_WINDOW_DAYS
        : PRIORITY_WINDOW_DAYS,
      pendientePago: false,
      enviadas: false,
      compartidos: false,
      pendienteRegistro: false,
      fechaDesde: '',
      fechaHasta: '',
      estado: this.viewMode === 'detalle' ? 'PENDIENTE' : null,
      tipoTransaccion: null,
      idMetodoPago: null,
      idParticipante: this.getDefaultQuickPayParticipanteFilterId(),
      idCategoria: null,
      idSubcategoria: null,
      busquedaDescripcion: '',
      busquedaId: '',
    });
    this.syncQuickPayPriorityControlState(this.filtrosForm.controls.prioritarios.value);
    this.listadoCurrentPage = 1;
    this.showAdvancedFilters = false;
    this.sharedParticipantFilterAutoReset = false;
    this.quickPaySortColumn = this.viewMode === 'detalle' ? 'fecha_transaccion' : null;
    this.quickPaySortDirection = 'asc';
    this.listadoSortDirection = 'desc';
  }

  private getInitialQuickPayPriorityFilterValue(): boolean {
    if (!this.isDetalleViewMode) {
      return false;
    }

    return this.getStoredQuickPayPriorityFilterPreference() ?? true;
  }

  private getStoredQuickPayPriorityFilterPreference(): boolean | null {
    if (!this.isDetalleViewMode || typeof window === 'undefined') {
      return null;
    }

    try {
      const storedValue = window.sessionStorage.getItem(
        QUICK_PAY_PRIORITY_FILTER_STORAGE_KEY,
      );

      if (storedValue === 'true') {
        return true;
      }

      if (storedValue === 'false') {
        return false;
      }
    } catch {
      return null;
    }

    return null;
  }

  private persistQuickPayPriorityFilterPreference(isEnabled: boolean | null): void {
    if (!this.isDetalleViewMode || typeof window === 'undefined') {
      return;
    }

    try {
      window.sessionStorage.setItem(
        QUICK_PAY_PRIORITY_FILTER_STORAGE_KEY,
        String(!!isEnabled),
      );
    } catch {
      // Ignore storage access issues and keep the in-memory filter state.
    }
  }

  private syncQuickPayPriorityControlState(isEnabled: boolean | null): void {
    if (!this.isDetalleViewMode) {
      return;
    }

    const diasPrioridadControl = this.filtrosForm.controls.diasPrioridad;

    if (isEnabled) {
      if (diasPrioridadControl.disabled) {
        diasPrioridadControl.enable({ emitEvent: false });
      }

      if (
        diasPrioridadControl.value === null ||
        diasPrioridadControl.value === undefined
      ) {
        diasPrioridadControl.setValue(QUICK_PAY_DEFAULT_PRIORITY_WINDOW_DAYS, {
          emitEvent: false,
        });
      }

      return;
    }

    if (diasPrioridadControl.enabled) {
      diasPrioridadControl.disable({ emitEvent: false });
    }
  }

  private dateDisplayValidator(): ValidatorFn {
    return (control: AbstractControl): ValidationErrors | null => {
      const rawValue = String(control.value ?? '').trim();

      if (!rawValue) {
        return null;
      }

      return this.normalizeDateInputValue(rawValue) ? null : { invalidDate: true };
    };
  }

  private clearInvalidDateError(control: AbstractControl): void {
    if (!control.hasError('invalidDate')) {
      return;
    }

    const { invalidDate, ...remainingErrors } = control.errors ?? {};
    control.setErrors(Object.keys(remainingErrors).length > 0 ? remainingErrors : null);
  }

  private handleDateInput(control: FormControl<string | null>, event: Event): void {
    const input = event.target as HTMLInputElement | null;

    if (!input) {
      return;
    }

    const formattedValue = this.formatDateDisplayInputValue(input.value);

    if (formattedValue !== input.value) {
      input.value = formattedValue;
    }

    control.setValue(formattedValue, { emitEvent: false });
    this.clearInvalidDateError(control);
  }

  private handleDatePaste(control: FormControl<string | null>, event: ClipboardEvent): void {
    const input = event.target as HTMLInputElement | null;
    const pastedText = event.clipboardData?.getData('text') ?? '';

    if (!input || !pastedText) {
      return;
    }

    event.preventDefault();

    const selectionStart = input.selectionStart ?? input.value.length;
    const selectionEnd = input.selectionEnd ?? selectionStart;
    const nextValue =
      input.value.slice(0, selectionStart) +
      pastedText +
      input.value.slice(selectionEnd);
    const sanitizedValue = this.formatDateDisplayInputValue(nextValue);

    input.value = sanitizedValue;
    control.setValue(sanitizedValue, { emitEvent: false });
    this.clearInvalidDateError(control);
  }

  private normalizeAndValidateDateControl(control: FormControl<string | null>): boolean {
    const rawValue = String(control.value ?? '').trim();

    if (!rawValue) {
      return true;
    }

    const normalizedValue = this.normalizeDateInputValue(rawValue);

    if (!normalizedValue) {
      control.setErrors({ ...(control.errors ?? {}), invalidDate: true });
      return false;
    }

    this.clearInvalidDateError(control);
    control.setValue(this.formatDateDisplayFromApi(normalizedValue), { emitEvent: false });
    control.updateValueAndValidity({ emitEvent: false });
    return true;
  }

  private handleDateCalendarChange(
    control: FormControl<string | null>,
    event: Event,
  ): void {
    const input = event.target as HTMLInputElement | null;
    const isoValue = input?.value?.trim() ?? '';

    if (!isoValue) {
      return;
    }

    const normalizedValue = this.normalizeDateInputValue(isoValue);

    if (!normalizedValue) {
      return;
    }

    this.clearInvalidDateError(control);
    control.setValue(this.formatDateDisplayFromApi(normalizedValue), {
      emitEvent: false,
    });
    control.updateValueAndValidity({ emitEvent: false });
  }

  private getFiltroDateControl(controlName: FiltroDateControlName): FormControl<string | null> {
    return this.filtrosForm.controls[controlName] as FormControl<string | null>;
  }

  private getStartOfMonth(date: Date): Date {
    return new Date(date.getFullYear(), date.getMonth(), 1);
  }

  private getEndOfMonth(date: Date): Date {
    return new Date(date.getFullYear(), date.getMonth() + 1, 0);
  }

  private applyTodayQuickFilter(): void {
    this.filtrosForm.patchValue(
      {
        todos: false,
        soloHoy: true,
        mesActual: false,
        mesFiltro: null,
        anioFiltro: null,
        prioritarios: false,
        vencidos: false,
        fechaDesde: this.formatDateDisplayFromApi(this.todayFilterValue),
        fechaHasta: this.formatDateDisplayFromApi(this.todayFilterValue),
      },
      { emitEvent: true },
    );
  }

  private applyCurrentMonthQuickFilter(): void {
    this.filtrosForm.patchValue(
      {
        todos: false,
        soloHoy: false,
        mesActual: true,
        mesFiltro: null,
        anioFiltro: null,
        prioritarios: false,
        vencidos: false,
        fechaDesde: this.formatDateDisplayFromApi(this.currentMonthStartValue),
        fechaHasta: this.formatDateDisplayFromApi(this.currentMonthEndValue),
      },
      { emitEvent: true },
    );
  }

  private clearDetalleDateQuickFilters(): void {
    this.filtrosForm.patchValue(
      {
        mesActual: false,
        fechaDesde: '',
        fechaHasta: '',
      },
      { emitEvent: true },
    );
  }

  private syncQuickFilterFlagsWithRange(): void {
    const fechaDesde = this.normalizeDateInputValue(this.filtrosForm.controls.fechaDesde.value ?? '');
    const fechaHasta = this.normalizeDateInputValue(this.filtrosForm.controls.fechaHasta.value ?? '');
    const soloHoySeleccionado = !!this.filtrosForm.controls.soloHoy.value;
    const mesActualSeleccionado = !!this.filtrosForm.controls.mesActual.value;

    const isTodayRange =
      fechaDesde === this.todayFilterValue && fechaHasta === this.todayFilterValue;
    const isCurrentMonthRange =
      fechaDesde === this.currentMonthStartValue &&
      fechaHasta === this.currentMonthEndValue;

    this.filtrosForm.patchValue(
      {
        soloHoy: soloHoySeleccionado && isTodayRange,
        mesActual:
          !isTodayRange && mesActualSeleccionado && isCurrentMonthRange,
      },
      { emitEvent: false },
    );
  }

  private applyAllListadoQuickFilter(): void {
    if (this.isDetalleViewMode) {
      return;
    }

    this.filtrosForm.patchValue(
      {
        todos: true,
        soloHoy: false,
        mesActual: false,
        mesFiltro: null,
        anioFiltro: null,
        prioritarios: false,
        vencidos: false,
        pendientePago: false,
        enviadas: false,
        compartidos: false,
        pendienteRegistro: false,
        fechaDesde: '',
        fechaHasta: '',
        estado: null,
        idMetodoPago: null,
        idParticipante: null,
        idCategoria: null,
        idSubcategoria: null,
        busquedaDescripcion: '',
        busquedaId: '',
      },
      { emitEvent: true },
    );
    this.showAdvancedFilters = false;
    this.sharedParticipantFilterAutoReset = false;
  }

  private syncListadoTodosControlState(): void {
    if (this.isDetalleViewMode) {
      return;
    }

    const filtros = this.filtrosForm.getRawValue();
    const isShowingAll =
      !filtros.soloHoy &&
      !filtros.mesActual &&
      !filtros.prioritarios &&
      !filtros.vencidos &&
      !filtros.pendientePago &&
      !filtros.enviadas &&
      !filtros.compartidos &&
      !filtros.pendienteRegistro &&
      filtros.mesFiltro === null &&
      filtros.anioFiltro === null &&
      !this.normalizeDateInputValue(filtros.fechaDesde ?? '') &&
      !this.normalizeDateInputValue(filtros.fechaHasta ?? '') &&
      !this.normalizeText(filtros.estado ?? '') &&
      !this.normalizeText(filtros.busquedaDescripcion ?? '') &&
      !(filtros.busquedaId ?? '').trim() &&
      filtros.idMetodoPago === null &&
      filtros.idParticipante === null &&
      filtros.idCategoria === null &&
      filtros.idSubcategoria === null;

    if (isShowingAll) {
      return;
    }

    if (this.filtrosForm.controls.todos.value) {
      this.filtrosForm.controls.todos.setValue(false, { emitEvent: false });
    }
  }

  private getDefaultQuickPayParticipanteFilterId(): number | null {
    if (!this.isDetalleViewMode) {
      return null;
    }

    return this.currentUserParticipante?.id_participante ?? null;
  }

  private syncQuickPayParticipantFilterDefault(): void {
    if (!this.isDetalleViewMode) {
      return;
    }

    if (
      this.filtrosForm.controls.enviadas.value ||
      this.filtrosForm.controls.compartidos.value
    ) {
      return;
    }

    const participanteDefaultId = this.getDefaultQuickPayParticipanteFilterId();

    if (
      participanteDefaultId !== null &&
      this.filtrosForm.controls.idParticipante.value === null
    ) {
      this.filtrosForm.controls.idParticipante.setValue(participanteDefaultId, {
        emitEvent: false,
      });
    }
  }

  onEnviadasToggle(event: Event): void {
    const checked = (event.target as HTMLInputElement).checked;
    if (checked && this.isDetalleViewMode) {
      this.applyQuickPayRecibidosFilterDefaults();
      return;
    }

    this.filtrosForm.controls.enviadas.setValue(checked);
  }

  onCompartidosToggle(event: Event): void {
    const checked = (event.target as HTMLInputElement).checked;
    this.setQuickPayCompartidosFilterState(checked);

    if (checked && this.filtrosForm.controls.enviadas.value) {
      this.filtrosForm.controls.enviadas.setValue(false);
    }
  }

  private setQuickPayCompartidosFilterState(checked: boolean): void {
    const currentUserParticipanteId = this.currentUserParticipante?.id_participante ?? null;
    const currentParticipanteId = this.filtrosForm.controls.idParticipante.value;

    this.filtrosForm.controls.compartidos.setValue(checked);

    if (!this.isDetalleViewMode || currentUserParticipanteId === null) {
      return;
    }

    if (checked && currentParticipanteId === currentUserParticipanteId) {
      this.sharedParticipantFilterAutoReset = true;
      this.filtrosForm.controls.idParticipante.setValue(null);
      return;
    }

    if (
      !checked &&
      this.sharedParticipantFilterAutoReset &&
      this.filtrosForm.controls.idParticipante.value === null
    ) {
      this.sharedParticipantFilterAutoReset = false;
      this.filtrosForm.controls.idParticipante.setValue(currentUserParticipanteId);
      return;
    }

    this.sharedParticipantFilterAutoReset = false;
  }

  private applyQuickPayRecibidosFilterDefaults(): void {
    this.sharedParticipantFilterAutoReset = false;
    this.showAdvancedFilters = false;

    this.filtrosForm.patchValue(
      {
        todos: false,
        soloHoy: false,
        mesActual: false,
        prioritarios: true,
        vencidos: true,
        pendientePago: false,
        enviadas: true,
        compartidos: false,
        pendienteRegistro: false,
        fechaDesde: '',
        fechaHasta: '',
        estado: 'PENDIENTE',
        tipoTransaccion: null,
        idMetodoPago: null,
        idParticipante: null,
        idCategoria: null,
        idSubcategoria: null,
        busquedaDescripcion: '',
      },
      { emitEvent: true },
    );
  }

  private setQuickPayScheduleFilterState(
    controlName: 'prioritarios' | 'vencidos',
    checked: boolean,
  ): void {
    if (checked) {
      this.filtrosForm.patchValue(
        {
          soloHoy: false,
          mesActual: false,
          ...(this.isDetalleViewMode ? {} : { mesFiltro: null, anioFiltro: null }),
          fechaDesde: '',
          fechaHasta: '',
        },
        { emitEvent: false },
      );
    }

    this.filtrosForm.controls[controlName].setValue(checked);
  }

  private refreshFilteredSubcategoriasFiltro(): void {
    const categoriaId = this.filtrosForm.controls.idCategoria.value;

    this.filteredSubcategoriasFiltro = this.subcategorias
      .filter((item) => categoriaId === null || item.id_categoria === categoriaId)
      .sort((a, b) => a.nombre_subcategoria.localeCompare(b.nombre_subcategoria));
  }

  private syncFiltroSubcategoriaSelection(): void {
    const subcategoriaId = this.filtrosForm.controls.idSubcategoria.value;

    if (subcategoriaId === null) {
      return;
    }

    if (
      !this.filteredSubcategoriasFiltro.some(
        (item) => item.id_subcategoria === subcategoriaId,
      )
    ) {
      this.filtrosForm.controls.idSubcategoria.setValue(null, { emitEvent: false });
    }
  }

  private isIngresoDetalleRow(
    row: Pick<DetalleTransaccionListadoRow, 'transaccion' | 'categoria'>,
  ): boolean {
    if (this.isCreditoTransaccion(row.transaccion)) {
      return true;
    }

    return (
      this.normalizeText(row.categoria ?? row.transaccion.nombre_categoria ?? '') === 'ingresos'
    );
  }

  private isValidDateParts(year: number, month: number, day: number): boolean {
    if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
      return false;
    }

    if (month < 1 || month > 12 || day < 1) {
      return false;
    }

    const candidate = new Date(year, month - 1, day);

    return (
      candidate.getFullYear() === year &&
      candidate.getMonth() === month - 1 &&
      candidate.getDate() === day
    );
  }

  private isListadoTransaccionesRoute(url: string): boolean {
    return (
      url === '/transacciones/listado' ||
      url.startsWith('/transacciones/listado?') ||
      url === '/resumen/detalle-transacciones' ||
      url.startsWith('/resumen/detalle-transacciones?')
    );
  }

  private async processAutoOpenPaymentRequest(): Promise<void> {
    const openPaymentFlag = this.route.snapshot.queryParamMap.get('openPayment');
    const transactionIdParam = this.route.snapshot.queryParamMap.get('transactionId');

    if (openPaymentFlag !== '1' || !transactionIdParam) {
      this.autoOpenPaymentHandledKey = null;
      return;
    }

    const transactionId = Number(transactionIdParam);
    const requestKey = `${openPaymentFlag}:${transactionIdParam}`;

    if (!Number.isInteger(transactionId) || transactionId < 1) {
      await this.clearAutoOpenPaymentRequestFromUrl();
      this.autoOpenPaymentHandledKey = null;
      return;
    }

    if (this.autoOpenPaymentHandledKey === requestKey) {
      return;
    }

    const transaccion = this.transacciones.find((item) => item.id_transaccion === transactionId);

    if (!transaccion) {
      await this.clearAutoOpenPaymentRequestFromUrl();
      this.autoOpenPaymentHandledKey = null;
      return;
    }

    this.autoOpenPaymentHandledKey = requestKey;
    this.cameFromDashboardReminder = true;
    const detallesPropiosEnPeriodo = this.getParticipantesDetalleForPayment(transaccion).filter(
      (detalle) =>
        this.isDetalleDelUsuarioLogueado(detalle, transaccion.es_propietario) &&
        this.isDetallePendienteEnPeriodoActual(detalle),
    );
    await this.openPaymentModal(
      transaccion,
      undefined,
      detallesPropiosEnPeriodo.length > 0 ? detallesPropiosEnPeriodo : undefined,
    );
    await this.clearAutoOpenPaymentRequestFromUrl();
  }

  private async clearAutoOpenPaymentRequestFromUrl(): Promise<void> {
    await this.router.navigate([], {
      relativeTo: this.route,
      queryParams: {
        openPayment: null,
        transactionId: null,
      },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }
}
