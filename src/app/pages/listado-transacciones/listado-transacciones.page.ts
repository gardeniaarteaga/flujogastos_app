import { DatePipe, DecimalPipe, NgClass, NgFor, NgIf } from '@angular/common';
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
const ESTADO_TRANSACCION_ANULADA_ID = 2;
const PRIORITY_WINDOW_DAYS = 7;
const ESTADOS_LISTADO_PERMITIDOS = new Set([
  'pagado',
  'pagada',
  'pendiente',
  'pago parcial',
]);
const ESTADOS_FILTRO_DISPONIBLES = new Set([
  ...ESTADOS_LISTADO_PERMITIDOS,
  'anulada',
  'anulado',
]);

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
  modo_cuotas: FormControl<ModoCuotas>;
  cantidad_cuotas: FormControl<number | null>;
  tipo_programacion: FormControl<ProgramacionCuotaTipo>;
  dia_programado: FormControl<number | null>;
  porcentaje: FormControl<number | null>;
  monto: FormControl<number | null>;
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
  porcentaje: number;
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
  id_tipo_transaccion: TipoTransaccionId;
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

interface DetalleTransaccionListadoRow {
  transaccion: TransaccionListado;
  detalle: ParticipanteDetalleListado;
  nombre_mostrado: string;
  descripcion: string;
  metodo_pago: string | null;
  categoria: string | null;
  subcategoria: string | null;
}

interface UpdateTransaccionPayload {
  fecha: string;
  monto: number;
  intereses?: number;
  cuotas_sin_intereses: boolean;
  id_tipo_transaccion: TipoTransaccionId;
  id_metodo_pago: number;
  id_categoria: number;
  id_subcategoria?: number | null;
  id_estado: number;
  descripcion?: string | null;
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

type FiltroDateControlName = 'fechaDesde' | 'fechaHasta';

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
  readonly viewMode =
    this.route.snapshot.data['viewMode'] === 'detalle' ? 'detalle' : 'transacciones';
  readonly today = new Date();
  readonly todayFilterValue = this.formatDateInput(this.today);
  readonly currentMonthStartValue = this.formatDateInput(this.getStartOfMonth(this.today));
  readonly currentMonthEndValue = this.formatDateInput(this.getEndOfMonth(this.today));
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
    soloHoy: [this.viewMode === 'detalle'],
    mesActual: [this.viewMode !== 'detalle'],
    prioritarios: [this.viewMode === 'detalle'],
    pendientePago: [false],
    enviadas: [false],
    pendienteRegistro: [false],
    fechaDesde: [
      this.viewMode === 'detalle'
        ? this.formatDateDisplayFromApi(this.todayFilterValue)
        : this.formatDateDisplayFromApi(this.currentMonthStartValue),
      [this.dateDisplayValidator()],
    ],
    fechaHasta: [
      this.viewMode === 'detalle'
        ? this.formatDateDisplayFromApi(this.todayFilterValue)
        : this.formatDateDisplayFromApi(this.currentMonthEndValue),
      [this.dateDisplayValidator()],
    ],
    estado: [null as string | null],
    idMetodoPago: [null as number | null],
    idParticipante: [null as number | null],
  });

  maintenanceOpen = false;
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
  private paymentModalOpenedAt = 0;
  detailModalTransaccion: TransaccionListado | null = null;
  detailModalCuotasPage = 1;
  montoAplicarDrafts: Record<number, string> = {};
  showAdvancedFilters = false;
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
  private readonly cuotasPageByGroup = new WeakMap<ParticipanteDetalleForm, number>();
  readonly cuotasPageSize = 12;

  transacciones: TransaccionListado[] = [];
  formasPago: CatalogoFormaPago[] = [];
  entidadesFinancieras: CatalogoEntidadFinanciera[] = [];
  tiposEntidad: CatalogoTipoEntidad[] = [];
  participantes: CatalogoParticipante[] = [];
  categorias: CatalogoCategoria[] = [];
  subcategorias: CatalogoSubcategoria[] = [];
  estadosTransaccion: CatalogoEstadoTransaccion[] = [];

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
    participantes_detalle: this.fb.array<ParticipanteDetalleForm>([]),
    id_estado: [null as number | null, [Validators.required]],
    intereses: [{ value: 0 as number | null, disabled: true }, [Validators.min(0), this.maxTwoDecimalsValidator()]],
    monto: [
      null as number | null,
      [Validators.required, Validators.min(0.01), this.maxTwoDecimalsValidator()],
    ],
    descripcion: ['', [Validators.maxLength(250)]],
  });

  readonly aplicarPagosForm = this.fb.group({
    pagos_detalle: this.fb.array<PagoDetalleForm>([]),
  });

  ngOnInit(): void {
    this.filtrosForm.valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      this.syncSelectedTransaccionWithFilters();
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

    void this.loadPageForToday();
  }

  @HostListener('document:keydown.escape', ['$event'])
  handleEscapeKey(event: Event): void {
    if (this.paymentModalOpen) {
      event.preventDefault();
      this.closePaymentModal();
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
    const estadoFiltro = this.normalizeText(filtros.estado ?? '');

    return this.transacciones.filter((transaccion) => {
      const fechaTransaccion = this.normalizeDateOnly(transaccion.fecha);
      const estadoTransaccion = this.normalizeText(transaccion.nombre_estado ?? '');
      const estadoCoincideFiltro = !!estadoFiltro && estadoTransaccion === estadoFiltro;

      if (!this.isEstadoVisibleEnListado(estadoTransaccion) && !estadoCoincideFiltro) {
        return false;
      }

      if (filtros.soloHoy && fechaTransaccion !== this.todayFilterValue) {
        return false;
      }

      if (
        filtros.prioritarios &&
        !this.hasPriorityPendingSchedule(transaccion)
      ) {
        return false;
      }

      if (
        filtros.pendientePago &&
        !['pendiente', 'pago parcial'].includes(estadoTransaccion)
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

      return true;
    });
  }

  get isDetalleViewMode(): boolean {
    return this.viewMode === 'detalle';
  }

  get filteredDetalleTransacciones(): DetalleTransaccionListadoRow[] {
    const filtros = this.filtrosForm.getRawValue();
    const estadoFiltro = this.normalizeText(filtros.estado ?? '');

    return this.buildDetalleTransaccionRows()
      .filter((row) => {
        const estadoDetalle = this.normalizeText(row.detalle.nombre_estado ?? '');
        const estadoCoincideFiltro = !!estadoFiltro && estadoDetalle === estadoFiltro;

        if (!this.isEstadoVisibleEnListado(estadoDetalle) && !estadoCoincideFiltro) {
          return false;
        }

        if (filtros.prioritarios && !this.isDetallePrioritario(row.detalle)) {
          return false;
        }

        if (estadoFiltro && estadoDetalle !== estadoFiltro) {
          return false;
        }

        return true;
      })
      .sort((left, right) => this.compareDetalleRowsByFechaProgramada(left, right));
  }

  get pageEyebrow(): string {
    return this.isDetalleViewMode ? 'Resumen' : 'Transacciones';
  }

  get pageTitle(): string {
    return this.isDetalleViewMode ? 'Pago Rapido' : 'Listado de Transacciones';
  }

  get panelTitle(): string {
    return this.isDetalleViewMode ? 'Detalle de cuotas' : 'Transacciones';
  }

  get panelSubtitle(): string {
    return this.isDetalleViewMode ? 'Detalle programado para pago' : 'Listado general';
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

  get isEditingIncomeMode(): boolean {
    return Number(this.transaccionForm.controls.id_tipo_transaccion.value ?? 0) === 2;
  }

  get editingIncomeMontoHint(): string {
    const titularGroup = this.titularDetalleGroup;

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
    return this.isEditingIncomeMode ? 'Monto' : 'Monto total';
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
    return this.filteredTransacciones.filter((item) => item.nombre_estado === 'PAGADO').length;
  }

  get transaccionesPagoParcialCount(): number {
    return this.filteredTransacciones.filter((item) => item.nombre_estado === 'PAGO PARCIAL').length;
  }

  get transaccionesPendientesCount(): number {
    return this.filteredTransacciones.filter((item) => item.nombre_estado === 'PENDIENTE').length;
  }

  get transaccionesPendientesRegistroCount(): number {
    return this.filteredTransacciones.filter(
      (item) => item.nombre_estado_registro === 'PENDIENTE',
    ).length;
  }

  get estadosTransaccionFiltro(): CatalogoEstadoTransaccion[] {
    return this.estadosTransaccion.filter((estado) =>
      this.isEstadoDisponibleEnFiltro(estado.nombre_estado),
    );
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
    return this.isIncomeTitularGroup(group) || this.isFixedCuotasMode(group);
  }

  getEditorParticipanteMontoLabel(group: ParticipanteDetalleForm): string {
    return this.isFixedCuotasMode(group)
      ? 'Monto por cuota'
      : 'Monto total a dividir';
  }

  getEditorParticipanteMontoHint(group: ParticipanteDetalleForm): string {
    return this.isFixedCuotasMode(group)
      ? `Total programado: $${this.getGroupMontoTarget(group).toFixed(2)}.`
      : 'Este monto total se dividira automaticamente entre las cuotas.';
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

    const siguienteCantidad = Math.max(
      1,
      Math.trunc(Number(group.controls.cantidad_cuotas.value ?? 1)),
    ) + 1;

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

    if (cuotasArray.length <= 1 || this.isCuotaBloqueadaEnEditor(group, cuotaIndex)) {
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

    if (cuotasActualizadas.length === 0) {
      return;
    }

    group.controls.cantidad_cuotas.setValue(cuotasActualizadas.length, { emitEvent: false });
    group.controls.cantidad_cuotas.updateValueAndValidity({ emitEvent: false });
    this.replaceCuotasArray(group, cuotasActualizadas);
    this.ensureProgramacionConfig(group);
    this.refreshProgramacionCuotas(group);
    this.cdr.detectChanges();
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
      this.categorias = catalogos.categorias
        .filter((item) => item.estado)
        .sort((a, b) => a.nombre_categoria.localeCompare(b.nombre_categoria));
      this.subcategorias = catalogos.subcategorias.filter(
        (item) => item.estado,
      );
      this.estadosTransaccion = catalogos.estadosTransaccion.filter(
        (item) => item.estado === 'ACTIVO' && item.flag?.trim().toUpperCase() === 'T',
      );
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
    } catch (error) {
      this.transacciones = [];
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

  onSoloHoyToggle(): void {
    if (this.filtrosForm.controls.soloHoy.value) {
      this.applyTodayQuickFilter();
      return;
    }

    this.syncQuickFilterFlagsWithRange();
  }

  onMesActualToggle(): void {
    if (this.filtrosForm.controls.mesActual.value) {
      this.applyCurrentMonthQuickFilter();
      return;
    }

    this.syncQuickFilterFlagsWithRange();
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
      this.refreshProgramacionForAllGroups();
    }
  }

  onFechaTransaccionPaste(event: ClipboardEvent): void {
    this.handleDatePaste(this.transaccionForm.controls.fecha_transaccion, event);
  }

  onFechaTransaccionCalendarChange(event: Event): void {
    this.handleDateCalendarChange(this.transaccionForm.controls.fecha_transaccion, event);
    this.refreshProgramacionForAllGroups();
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

  async openPaymentModal(transaccion: TransaccionListado, event?: Event): Promise<void> {
    event?.preventDefault();
    event?.stopPropagation();
    if (!this.canPagarTransaccion(transaccion)) {
      return;
    }

    try {
      const transaccionParaPago = this.buildPaymentModalTransaccion(transaccion);
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
    return (
      this.canPagarTransaccion(row.transaccion) &&
      row.detalle.id_estado !== ESTADO_TRANSACCION_ANULADA_ID &&
      this.toCents(Number(row.detalle.saldo_pendiente ?? 0)) > 0
    );
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
    return this.normalizeText(transaccion.nombre_estado ?? '') === 'anulada';
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
      `Se anulara la transaccion ${this.getTransaccionAnularLabel(transaccion)}.`,
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
      'Confirmar reactivacion',
      `Se reactivara la transaccion "${transaccion.nombre_forma_pago || `#${transaccion.id_transaccion}`}".`,
      'Si, reactivar',
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

      this.successMessage = 'Transaccion reactivada correctamente.';
      await this.alerts.success('Transaccion reactivada', this.successMessage);
      await this.loadTransacciones();
    } catch (error) {
      this.errorMessage = this.getErrorMessage(
        error,
        'No se pudo reactivar la transaccion.',
      );
      await this.alerts.error('No se pudo reactivar', this.errorMessage);
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
    this.refreshPagosDetalleGroups();
  }

  onPaymentBackdropClick(event: MouseEvent): void {
    if (event.target !== event.currentTarget) {
      return;
    }

    if (Date.now() - this.paymentModalOpenedAt < 150) {
      return;
    }

    this.closePaymentModal();
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

    return this.pagosDetalleControls.some(
      (cuota) => this.toCents(cuota.controls.saldo_pendiente.value) > 0,
    );
  }

  async applyFullPagoTransaccion(): Promise<void> {
    if (!this.isEditing || this.editingTransaccionId === null || !this.canApplyFullTransaction) {
      return;
    }

    const confirmed = await this.alerts.confirm(
      'Confirmar pago total',
      'Se pagaran todas las cuotas pendientes del titular y de los participantes. Deseas continuar?',
      'Aceptar',
      {
        icon: 'warning',
        confirmButtonColor: '#2563eb',
      },
    );

    if (!confirmed) {
      return;
    }

    const pagos = this.pagosDetalleControls
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
        'Se pagaron todas las cuotas pendientes del titular y participantes.',
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
      participantes_detalle: [],
      id_estado: null,
      intereses: 0,
      monto: null,
      descripcion: '',
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
      participantes_detalle: [],
      id_estado: transaccion.id_estado,
      intereses: transaccion.intereses,
      monto: this.resolveEditorMontoBase(transaccion, detalles, incomeCuotasMode),
      descripcion: transaccion.descripcion ?? '',
    });
    this.isSyncingEstadoTransaccion = false;

    const detallesAgrupados = this.summarizeDetallesForEditor(detalles);

    detallesAgrupados.forEach((detalle) => {
      const cuotasParticipante = this.getCuotasForParticipante(detalles, detalle.id_participante);
      const modoCuotas =
        detalle.es_titular && this.isCreditoTransaccion(transaccion)
          ? incomeCuotasMode
          : this.inferEditorCuotasMode(cuotasParticipante);
      const programacion = this.inferProgramacionConfig(
        cuotasParticipante,
        this.normalizeDateOnly(transaccion.fecha),
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
          modo_cuotas: this.fb.control<ModoCuotas>(modoCuotas, {
            nonNullable: true,
          }),
          cantidad_cuotas: this.fb.control<number | null>(detalle.total_cuotas, [
            Validators.required,
            Validators.min(1),
            this.wholeNumberValidator(),
          ]),
          tipo_programacion: this.fb.control<ProgramacionCuotaTipo>(programacion.tipo, {
            nonNullable: true,
          }),
          dia_programado: this.fb.control<number | null>(programacion.dia),
          porcentaje: this.fb.control<number | null>(detalle.porcentaje, [
            Validators.min(0),
            Validators.max(100),
            this.maxTwoDecimalsValidator(),
          ]),
          monto: this.fb.control<number | null>(
            this.resolveEditorParticipanteMontoBase(
              transaccion,
              detalle,
              cuotasParticipante,
              modoCuotas,
            ),
            [
              Validators.required,
              Validators.min(detalle.es_titular ? 0 : 0.01),
              this.maxTwoDecimalsValidator(),
            ],
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

    this.refreshProgramacionForAllGroups();
    this.onFormaPagoChange();
    this.onCategoriaChange();
    this.refreshEstadoTransaccionForEdit();
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
    this.usarParticipantesControl.setValue(checked);

    if (checked) {
      if (this.participantesDetalleArray.length === 0) {
        this.addTitularDetalle();
      }
      this.refreshParticipantesMontos();
      return;
    }

    this.participantesDetalleArray.clear();
  }

  addTitularDetalle(): void {
    if (this.titularDetalleGroup) {
      return;
    }

    this.participantesDetalleArray.push(
      this.registerParticipanteDetalleGroup(this.fb.group({
        id_participante: this.fb.control<number | null>(
          this.currentUserParticipante?.id_participante ?? null,
        ),
        nombre_mostrado: this.fb.control(this.currentUserDisplayName, { nonNullable: true }),
        es_titular: this.fb.control(true, { nonNullable: true }),
        modo_cuotas: this.fb.control<ModoCuotas>('fijas', { nonNullable: true }),
        cantidad_cuotas: this.fb.control<number | null>(1, [
          Validators.required,
          Validators.min(1),
          this.wholeNumberValidator(),
        ]),
        tipo_programacion: this.fb.control<ProgramacionCuotaTipo>('ninguna', {
          nonNullable: true,
        }),
        dia_programado: this.fb.control<number | null>(null),
        porcentaje: this.fb.control<number | null>(100, [
          Validators.min(0),
          Validators.max(100),
          this.maxTwoDecimalsValidator(),
        ]),
        monto: this.fb.control<number | null>(this.transaccionForm.controls.monto.value, [
          Validators.required,
          Validators.min(0),
          this.maxTwoDecimalsValidator(),
        ]),
        cuotas: this.createCuotasArray(undefined, this.transaccionForm.controls.monto.value ?? 0, 1),
      })),
    );
  }

  addParticipanteDetalle(): void {
    if (!this.titularDetalleGroup) {
      this.addTitularDetalle();
    }

    this.participantesDetalleArray.push(
      this.registerParticipanteDetalleGroup(this.fb.group({
        id_participante: this.fb.control<number | null>(null, [Validators.required]),
        nombre_mostrado: this.fb.control('', { nonNullable: true }),
        es_titular: this.fb.control(false, { nonNullable: true }),
        modo_cuotas: this.fb.control<ModoCuotas>('divididas', { nonNullable: true }),
        cantidad_cuotas: this.fb.control<number | null>(1, [
          Validators.required,
          Validators.min(1),
          this.wholeNumberValidator(),
        ]),
        tipo_programacion: this.fb.control<ProgramacionCuotaTipo>('ninguna', {
          nonNullable: true,
        }),
        dia_programado: this.fb.control<number | null>(null),
        porcentaje: this.fb.control<number | null>(null, [
          Validators.min(0),
          Validators.max(100),
          this.maxTwoDecimalsValidator(),
        ]),
        monto: this.fb.control<number | null>(null, [
          Validators.required,
          Validators.min(0.01),
          this.maxTwoDecimalsValidator(),
        ]),
        cuotas: this.createCuotasArray(undefined, 0, 1),
      })),
    );
  }

  removeParticipanteDetalle(index: number): void {
    this.participantesDetalleArray.removeAt(index);
    this.rebalanceTitularParticipation();
  }

  onFormaPagoChange(): void {
    const formaPagoId = this.transaccionForm.controls.forma_pago.value;
    this.selectedFormaPago =
      this.formasPago.find((item) => item.id_forma === formaPagoId) ?? null;

    if (!this.selectedFormaPago) {
      this.transaccionForm.patchValue({
        entidad_financiera: '',
        tipo_entidad: '',
        cuotas_sin_intereses: false,
      });
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

    if (hayPendientes && hayPagados) {
      return 'PAGO PARCIAL';
    }

    if (hayPagados || (this.isImmediatePaymentSelectedForEdit && !hayPendientes)) {
      return 'PAGADO';
    }

    return this.isImmediatePaymentSelectedForEdit ? 'PAGADO' : 'PENDIENTE';
  }

  private resolveIncomeEstadoNameForEdit(): string {
    const detalles = this.buildDetallesEstadoSnapshotForEdit();

    if (detalles.length === 0) {
      return 'PENDIENTE';
    }

    if (detalles.every((detalle) => detalle.saldoPendienteCentavos === 0)) {
      return 'PAGADO';
    }

    const today = this.normalizeDateOnly(this.today);
    const hayFechaProgramadaVencida = detalles.some((detalle) => {
      const fechaProgramada = this.normalizeDateOnly(detalle.fecha_programada);
      return Boolean(fechaProgramada) && fechaProgramada < today;
    });
    const hayPagosAplicados = detalles.some(
      (detalle) => detalle.montoPagadoTotalCentavos > 0,
    );

    return hayFechaProgramadaVencida || hayPagosAplicados
      ? 'PAGO PARCIAL'
      : 'PENDIENTE';
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

    if (this.usarParticipantesControl.value && !this.hasAppliedPagosInEditor) {
      this.refreshParticipantesMontos();
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

    const formValue = this.transaccionForm.getRawValue();
    const participantesDetalle = this.usarParticipantesControl.value
      ? this.participantesDetalleArray.controls
          .filter((group) => !group.controls.es_titular.value)
          .map((group) => ({
            id_participante: group.controls.id_participante.value,
            monto: this.getGroupMontoTarget(group),
            cantidad_cuotas: group.controls.cantidad_cuotas.value,
            cuotas: this.getCuotasPayload(group),
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

    const montoTotal = this.getResolvedSubmitMontoTotal(Number(formValue.monto ?? 0));
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
      await this.alerts.warning(
        'Monto inconsistente',
        'La suma del titular y los participantes debe cubrir exactamente el monto total de la transaccion.',
      );
      return;
    }

    const payload: UpdateTransaccionPayload = {
      fecha: this.normalizeDateInputValue(formValue.fecha_transaccion ?? '') ?? '',
      monto: montoTotal,
      cuotas_sin_intereses:
        this.showCuotasSinInteresesOption && Boolean(formValue.cuotas_sin_intereses),
      id_tipo_transaccion: formValue.id_tipo_transaccion as TipoTransaccionId,
      id_metodo_pago: formValue.forma_pago as number,
      id_categoria: formValue.id_categoria as number,
      id_subcategoria: formValue.id_subcategoria ?? null,
      id_estado: formValue.id_estado as number,
      descripcion: formValue.descripcion ?? '',
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
      payload.participantes_detalle = participantesDetalle.map((detalle) => ({
        id_participante: detalle.id_participante as number,
        monto: Number(detalle.monto),
        cantidad_cuotas: Number(detalle.cantidad_cuotas),
        cuotas: detalle.cuotas,
      }));
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
      this.updatePorcentajeFromMonto(group);
    } else if (this.usarParticipantesControl.value) {
      this.refreshParticipantesMontos();
    }
  }

  onMontoKeydown(event: KeyboardEvent): void {
    this.blockThirdDecimal(event);
  }

  normalizePercentageInput(group: ParticipanteDetalleForm): void {
    const control = group.controls.porcentaje;
    const rawValue = control.value;

    if (rawValue === null || rawValue === undefined) {
      return;
    }

    const normalizedValue = Number(rawValue);

    if (Number.isNaN(normalizedValue)) {
      return;
    }

    const boundedValue = this.normalizePercentageValue(normalizedValue);
    control.setValue(boundedValue, { emitEvent: false });
    control.updateValueAndValidity({ emitEvent: false });
    this.updateMontoFromPorcentaje(group);
  }

  normalizeCuotasInput(group: ParticipanteDetalleForm): void {
    const control = group.controls.cantidad_cuotas;
    const rawValue = control.value;

    if (rawValue === null || rawValue === undefined) {
      return;
    }

    const normalizedValue = Math.max(1, Math.trunc(Number(rawValue)));

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

    const normalizedValue = Math.max(1, Math.trunc(Number(rawValue)));

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

  onCuotaModeChange(group: ParticipanteDetalleForm): void {
    if (this.hasAppliedPagosInEditor) {
      return;
    }

    if (this.isIncomeTitularGroup(group)) {
      const cuotasCount = Math.max(
        1,
        Math.trunc(Number(group.controls.cantidad_cuotas.value ?? 1)),
      );
      const montoActual = this.normalizeDecimalValue(Number(group.controls.monto.value ?? 0));
      const siguienteMonto =
        group.controls.modo_cuotas.value === 'fijas'
          ? this.normalizeDecimalValue(montoActual / cuotasCount)
          : montoActual;

      this.transaccionForm.controls.monto.setValue(siguienteMonto, { emitEvent: false });
      this.transaccionForm.controls.monto.updateValueAndValidity({ emitEvent: false });
      this.syncCuotasWithMonto(group);
      this.refreshEstadoTransaccionForEdit();
      return;
    }

    this.updatePorcentajeFromMonto(group);
    this.refreshEstadoTransaccionForEdit();
  }

  onParticipantePorcentajeInput(group: ParticipanteDetalleForm): void {
    if (this.hasAppliedPagosInEditor) {
      return;
    }

    this.updateMontoFromPorcentaje(group);
  }

  onParticipanteMontoInput(group: ParticipanteDetalleForm): void {
    if (this.hasAppliedPagosInEditor) {
      return;
    }

    this.updatePorcentajeFromMonto(group);
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
    this.syncLastCuotaWithMonto(group);
  }

  onMontoPaste(event: ClipboardEvent): void {
    this.sanitizeMoneyPaste(event);
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

    if (
      participante?.porcentaje_participacion !== null &&
      participante?.porcentaje_participacion !== undefined
    ) {
      group.controls.porcentaje.setValue(participante.porcentaje_participacion, {
        emitEvent: false,
      });
      this.updateMontoFromPorcentaje(group);
    }
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

  trackDetalleCuota(_index: number, detalle: ParticipanteDetalleListado): number {
    return detalle.id;
  }

  getDetalleRowParticipanteLabel(row: DetalleTransaccionListadoRow): string {
    if (row.detalle.es_titular) {
      return this.currentUserDisplayName;
    }

    return row.detalle.nombre_participante?.trim() || 'Participante';
  }

  getDetalleRowCategoriaLabel(row: DetalleTransaccionListadoRow): string {
    const categoria = row.categoria?.trim() || 'Sin categoria';
    const subcategoria = row.subcategoria?.trim();
    return subcategoria ? `${categoria} / ${subcategoria}` : categoria;
  }

  getTransaccionTitle(
    transaccion: Pick<TransaccionListado, 'descripcion' | 'id_transaccion'> | null | undefined,
  ): string {
    const descripcion = transaccion?.descripcion?.trim();
    return descripcion && descripcion.length > 0
      ? descripcion
      : `Sin descripcion (${transaccion?.id_transaccion ?? '-'})`;
  }

  getTransaccionModalTitle(
    transaccion: Pick<TransaccionListado, 'descripcion' | 'id_transaccion'> | null | undefined,
  ): string {
    const descripcion = transaccion?.descripcion?.trim() || 'Sin descripcion';
    return `${descripcion} #${transaccion?.id_transaccion ?? '-'}`;
  }

  getDetailModalCuotas(): ParticipanteDetalleListado[] {
    if (!this.detailModalTransaccion) {
      return [];
    }

    return this.detailModalTransaccion.participantes_detalle ?? [];
  }

  getDetailModalCuotasTotalPages(): number {
    return Math.max(
      1,
      Math.ceil(this.getDetailModalCuotas().length / this.cuotasPageSize),
    );
  }

  getDetailModalCuotasPageItems(): ParticipanteDetalleListado[] {
    const cuotas = this.getDetailModalCuotas();
    const startIndex = (this.detailModalCuotasPage - 1) * this.cuotasPageSize;

    return cuotas.slice(startIndex, startIndex + this.cuotasPageSize);
  }

  getDetailModalCuotasPageStart(): number {
    const totalCuotas = this.getDetailModalCuotas().length;

    if (totalCuotas === 0) {
      return 0;
    }

    return (this.detailModalCuotasPage - 1) * this.cuotasPageSize + 1;
  }

  getDetailModalCuotasPageEnd(): number {
    return Math.min(
      this.detailModalCuotasPage * this.cuotasPageSize,
      this.getDetailModalCuotas().length,
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
    const estado = this.normalizeText(nombreEstado ?? '');

    switch (estado) {
      case 'pendiente':
        return 'status-pill-pendiente';
      case 'pago parcial':
        return 'status-pill-parcial';
      case 'anulada':
      case 'anulado':
      case 'cancelada':
      case 'cancelado':
        return 'status-pill-anulada';
      case 'pagado':
      case 'completado':
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
    return this.getParticipantesDetalleSafe(transaccion).filter(
      (detalle) => detalle.id_estado !== ESTADO_TRANSACCION_ANULADA_ID,
    );
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

    const detallesAsociados = detalles.filter(
      (detalle) => detalle.id_usuario_relacionado === this.currentUserIdValue,
    );

    return detallesAsociados.length > 0 ? detallesAsociados : detalles;
  }

  private buildDetalleTransaccionRows(): DetalleTransaccionListadoRow[] {
    return this.transacciones.flatMap((transaccion) =>
      this.getParticipantesDetalleForPayment(transaccion).map((detalle) => ({
        transaccion,
        detalle,
        nombre_mostrado: detalle.es_titular
          ? this.currentUserDisplayName
          : (detalle.nombre_participante ?? 'Participante'),
        descripcion: this.getTransaccionTitle(transaccion),
        metodo_pago: transaccion.nombre_forma_pago ?? detalle.nombre_forma_pago ?? null,
        categoria: transaccion.nombre_categoria ?? null,
        subcategoria: transaccion.nombre_subcategoria ?? null,
      })),
    );
  }

  private hasPriorityPendingSchedule(transaccion: TransaccionListado): boolean {
    const today = this.getDateOnlyValue(new Date());
    const limitDate = this.addDays(today, PRIORITY_WINDOW_DAYS);

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

  private isDetallePrioritario(detalle: ParticipanteDetalleListado): boolean {
    if (detalle.id_estado === ESTADO_TRANSACCION_ANULADA_ID) {
      return false;
    }

    if (Number(detalle.saldo_pendiente ?? 0) <= 0) {
      return false;
    }

    const today = this.getDateOnlyValue(new Date());
    const limitDate = this.addDays(today, PRIORITY_WINDOW_DAYS);
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
      (detalle) => !detalle.es_titular || detalle.total_cuotas > 1 || detalle.numero_cuota > 1,
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
        existing.porcentaje = this.normalizeDecimalValue(existing.porcentaje + detalle.porcentaje);
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
        fecha_programada: detalle.fecha_programada ?? null,
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

    const fechasProgramadas = cuotas.map((cuota) => cuota.fecha_programada).filter(Boolean) as string[];

    if (fechasProgramadas.length !== cuotas.length) {
      return { tipo: 'dia_mes', dia: this.getDefaultDiaProgramado() };
    }

    const quincenales = this.buildFechasQuincenales(fechaBaseIso, cuotas.length);
    if (this.areProgramadasEqual(fechasProgramadas, quincenales)) {
      return { tipo: 'quincenal', dia: null };
    }

    const finMes = this.buildFechasFinMes(fechaBaseIso, cuotas.length);
    if (this.areProgramadasEqual(fechasProgramadas, finMes)) {
      return { tipo: 'fin_mes', dia: null };
    }

    for (const dia of this.diasProgramacion) {
      const fechasDiaMes = this.buildFechasDiaMes(fechaBaseIso, cuotas.length, dia);

      if (this.areProgramadasEqual(fechasProgramadas, fechasDiaMes)) {
        return { tipo: 'dia_mes', dia };
      }
    }

    return { tipo: 'dia_mes', dia: this.normalizeDiaProgramado(Number(fechasProgramadas[0]?.slice(8, 10))) };
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
        this.closePaymentModal();
        this.clearSelection(false);
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

    const participantesAdicionales = this.participantesDetalleArray.controls.filter(
      (group) => !group.controls.es_titular.value,
    );

    participantesAdicionales.forEach((group) => {
      if (group.controls.porcentaje.value === null || group.controls.porcentaje.value === undefined) {
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
    return this.centsToAmount(Math.trunc(Math.max(0, value) * 100));
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

    const detalle = this.getCuotaDetalleEditor(group, cuotaIndex);

    if (!detalle) {
      return this.normalizeDecimalValue(Number(cuotaGroup.controls.monto.value ?? 0));
    }

    return this.normalizeDecimalValue(Number(detalle.monto_pagado ?? 0));
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
    const sanitizedValue = value.replace(/[^0-9.]/g, '');
    const [integerPart, ...decimalParts] = sanitizedValue.split('.');
    const decimalPart = decimalParts.join('').slice(0, 2);

    return decimalParts.length > 0
      ? `${integerPart || '0'}.${decimalPart}`
      : integerPart;
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

    if (event.key === '.') {
      if (input.value.includes('.')) {
        event.preventDefault();
      }
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

    if (selectionStart > decimalIndex && currentDecimalLength >= 2) {
      event.preventDefault();
    }
  }

  private sanitizeMoneyPaste(event: ClipboardEvent): void {
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
    const sanitizedValue = this.sanitizeMoneyInputValue(nextValue);

    input.value = sanitizedValue;
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }

  private normalizePercentageValue(value: number): number {
    return this.normalizeDecimalValue(Math.min(100, Math.max(0, value)));
  }

  private normalizeText(value: string): string {
    return value.trim().toLowerCase();
  }

  private isEstadoVisibleEnListado(nombreEstado: string | null | undefined): boolean {
    return ESTADOS_LISTADO_PERMITIDOS.has(this.normalizeText(nombreEstado ?? ''));
  }

  private isEstadoDisponibleEnFiltro(nombreEstado: string | null | undefined): boolean {
    return ESTADOS_FILTRO_DISPONIBLES.has(this.normalizeText(nombreEstado ?? ''));
  }

  private isFixedCuotasMode(group: ParticipanteDetalleForm): boolean {
    return group.controls.modo_cuotas.value === 'fijas';
  }

  private getGroupCuotasCount(group: ParticipanteDetalleForm): number {
    return Math.max(1, Math.trunc(Number(group.controls.cantidad_cuotas.value ?? 1)));
  }

  private getGroupMontoTarget(group: ParticipanteDetalleForm): number {
    const montoBase = this.normalizeDecimalValue(Number(group.controls.monto.value ?? 0));

    if (!this.isIncomeTitularGroup(group) && this.isFixedCuotasMode(group)) {
      return this.normalizeDecimalValue(montoBase * this.getGroupCuotasCount(group));
    }

    return montoBase;
  }

  private getMontoInputValueForTarget(
    group: ParticipanteDetalleForm,
    montoObjetivo: number,
  ): number {
    const montoNormalizado = this.normalizeDecimalValue(montoObjetivo);

    if (!this.isIncomeTitularGroup(group) && this.isFixedCuotasMode(group)) {
      return this.normalizeDecimalValue(montoNormalizado / this.getGroupCuotasCount(group));
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

        const normalizedValue = Math.max(1, Math.trunc(Number(value)));

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
    const cuotasNormalizadas =
      cuotas && cuotas.length > 0
        ? cuotas.map((cuota) => ({
            monto: this.normalizeDecimalValue(Number(cuota.monto)),
            fecha_programada: cuota.fecha_programada,
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
    const cuotas = Math.max(1, Math.trunc(cantidadCuotas || 1));
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
    const cuotasCount = Math.max(1, Math.trunc(Number(requestedCuotasCount ?? 1)));

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
    const cantidadCuotas = Math.max(
      1,
      Math.trunc(Number(group.controls.cantidad_cuotas.value ?? 1)),
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
    this.refreshProgramacionCuotas(group);
    this.refreshEstadoTransaccionForEdit();
  }

  private syncCuotasCount(group: ParticipanteDetalleForm): void {
    const cuotasCount = Math.max(1, Math.trunc(Number(group.controls.cantidad_cuotas.value ?? 1)));
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
    this.refreshProgramacionCuotas(group);
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

  private validateCuotasConfiguration(): boolean {
    return this.participantesDetalleArray.controls.every((group) => {
      const montoGrupo = this.getGroupMontoTarget(group);
      const totalCuotas = this.getCuotasTotal(group);

      return this.toCents(montoGrupo) === this.toCents(totalCuotas);
    });
  }

  private ensureProgramacionConfig(group: ParticipanteDetalleForm): void {
    const cuotasCount = Math.max(1, Math.trunc(Number(group.controls.cantidad_cuotas.value ?? 1)));

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

  private refreshProgramacionForAllGroups(): void {
    this.participantesDetalleArray.controls.forEach((group) => this.refreshProgramacionCuotas(group));
  }

  private refreshProgramacionCuotas(group: ParticipanteDetalleForm): void {
    const cuotasArray = this.getCuotasArray(group);
    const cuotasCount = cuotasArray.length;

    if (cuotasCount <= 1) {
      const defaultFechaProgramada = this.getSingleCuotaDefaultFechaProgramada();

      cuotasArray.controls.forEach((cuota, index) => {
        if (this.isCuotaBloqueadaEnEditor(group, index)) {
          return;
        }

        cuota.controls.fecha_programada.setValue(
          cuota.controls.fecha_programada.value ?? defaultFechaProgramada,
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

    return this.buildFechasQuincenales(fechaBase, 1)[0] ?? null;
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
    const pagosParciales = pagos.filter(
      (pago) =>
        this.toCents(pago.montoAplicar) > 0 &&
        this.toCents(pago.montoAplicar) < this.toCents(pago.saldoPendiente),
    );

    if (pagosParciales.length === 0) {
      return 'Pago aplicado correctamente.';
    }

    const montoRestanteTotal = this.getMontoRestantePagoParcialTotal(pagosParciales);

    return `Pago aplicado correctamente. Se genero ${pagosParciales.length === 1 ? 'una nueva cuota' : 'nuevas cuotas'} con saldo restante por $${this.normalizeDecimalValue(montoRestanteTotal).toFixed(2)}.`;
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

    this.participantesDetalleArray.controls.forEach((group) => {
      if (group.controls.porcentaje.value !== null && group.controls.porcentaje.value !== undefined) {
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
    const additionalParticipants = this.participantesDetalleArray.controls.filter(
      (group) => !group.controls.es_titular.value,
    );
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
      this.participantesDetalleArray.controls.some((item) => !item.controls.es_titular.value)
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

    const titularGroup = this.titularDetalleGroup;

    if (
      titularGroup &&
      !this.participantesDetalleArray.controls.some((group) => !group.controls.es_titular.value)
    ) {
      return this.getGroupMontoTarget(titularGroup);
    }

    return this.normalizeDecimalValue(Number(formMonto ?? 0));
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

    if (this.transaccionForm.controls.monto.invalid) {
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
  }

  private resetDefaultFilters(): void {
    const useTodayDefaults = this.viewMode === 'detalle';
    const useCurrentMonthDefaults = this.viewMode !== 'detalle';
    this.filtrosForm.reset({
      soloHoy: useTodayDefaults,
      mesActual: useCurrentMonthDefaults,
      prioritarios: this.viewMode === 'detalle',
      pendientePago: false,
      enviadas: false,
      pendienteRegistro: false,
      fechaDesde: useTodayDefaults
        ? this.formatDateDisplayFromApi(this.todayFilterValue)
        : useCurrentMonthDefaults
          ? this.formatDateDisplayFromApi(this.currentMonthStartValue)
          : '',
      fechaHasta: useTodayDefaults
        ? this.formatDateDisplayFromApi(this.todayFilterValue)
        : useCurrentMonthDefaults
          ? this.formatDateDisplayFromApi(this.currentMonthEndValue)
          : '',
      estado: null,
      idMetodoPago: null,
      idParticipante: null,
    });
    this.showAdvancedFilters = false;
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
        soloHoy: true,
        mesActual: false,
        fechaDesde: this.formatDateDisplayFromApi(this.todayFilterValue),
        fechaHasta: this.formatDateDisplayFromApi(this.todayFilterValue),
      },
      { emitEvent: true },
    );
  }

  private applyCurrentMonthQuickFilter(): void {
    this.filtrosForm.patchValue(
      {
        soloHoy: false,
        mesActual: true,
        fechaDesde: this.formatDateDisplayFromApi(this.currentMonthStartValue),
        fechaHasta: this.formatDateDisplayFromApi(this.currentMonthEndValue),
      },
      { emitEvent: true },
    );
  }

  private syncQuickFilterFlagsWithRange(): void {
    const fechaDesde = this.normalizeDateInputValue(this.filtrosForm.controls.fechaDesde.value ?? '');
    const fechaHasta = this.normalizeDateInputValue(this.filtrosForm.controls.fechaHasta.value ?? '');

    const isTodayRange =
      fechaDesde === this.todayFilterValue && fechaHasta === this.todayFilterValue;
    const isCurrentMonthRange =
      fechaDesde === this.currentMonthStartValue &&
      fechaHasta === this.currentMonthEndValue;

    this.filtrosForm.patchValue(
      {
        soloHoy: isTodayRange,
        mesActual: !isTodayRange && isCurrentMonthRange,
      },
      { emitEvent: false },
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
}
