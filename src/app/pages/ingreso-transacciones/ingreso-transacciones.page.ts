import { DecimalPipe, NgFor, NgIf } from '@angular/common';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectorRef, Component, DestroyRef, OnInit, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  AbstractControl,
  FormArray,
  FormBuilder,
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  ValidationErrors,
  ValidatorFn,
  Validators,
} from '@angular/forms';
import { ActivatedRoute, Router, RouterLink, RouterLinkActive } from '@angular/router';
import { firstValueFrom, timeout } from 'rxjs';

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
type ExpenseMode = 'individual' | 'shared';
const TIPO_CUOTA_FIJA_ID = 1;
const TIPO_CUOTA_VARIABLE_ID = 2;

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
  cuotas: FormArray<CuotaMontoForm>;
}>;

interface CuotaPageItem {
  index: number;
  control: CuotaMontoForm;
}

interface CreateTransaccionPayload {
  fecha: string;
  monto: number;
  id_tipo_cuota: number;
  id_tipo_transaccion: TipoTransaccionId;
  id_metodo_pago: number;
  id_categoria: number;
  id_subcategoria?: number;
  id_estado: number;
  descripcion?: string;
  pago_variable?: boolean;
  cuotas_sin_intereses: boolean;
  pagocompartido: boolean;
  titular_cuota_unica_pagada?: boolean;
  cantidad_cuotas_titular: number;
  cuotas_titular: CuotaPayload[];
  participantes_detalle?: Array<{
    id_participante: number;
    monto: number;
    cantidad_cuotas: number;
    cuotas: CuotaPayload[];
  }>;
}

interface TransactionFlowConfig {
  defaultTipoTransaccionId: TipoTransaccionId;
  sectionLabel: string;
  pageTitle: string;
  formTitle: string;
  submitLabel: string;
  successMessage: string;
}

interface TransaccionDescripcionAutocompleteItem {
  id_tipo_transaccion: TipoTransaccionId;
  descripcion: string | null;
}

@Component({
  selector: 'app-ingreso-transacciones-page',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    RouterLinkActive,
    NgIf,
    NgFor,
    DecimalPipe,
    SessionStripComponent,
  ],
  templateUrl: './ingreso-transacciones.page.html',
  styleUrl: './ingreso-transacciones.page.css',
})
export class IngresoTransaccionesPage implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly http = inject(HttpClient);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly destroyRef = inject(DestroyRef);
  private readonly alerts = inject(SweetAlertService);
  private readonly catalogosService = inject(CatalogosTransaccionService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly legacyCurrentUserDisplayName = `${this.currentUserProfile.fullName || this.currentUserProfile.username
  } (Tú)`;
  private readonly apiUrl = apiUrl('transacciones');
  private readonly flowConfig = this.resolveFlowConfig();
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

  get isIncomeMode(): boolean {
    return this.flowConfig.defaultTipoTransaccionId === 2;
  }

  get expenseMode(): ExpenseMode {
    return this.route.snapshot.data['expenseMode'] === 'shared' ? 'shared' : 'individual';
  }

  get isSharedExpenseMode(): boolean {
    return !this.isIncomeMode && this.expenseMode === 'shared';
  }

  get isIndividualExpenseMode(): boolean {
    return !this.isIncomeMode && this.expenseMode === 'individual';
  }

  get sectionLabel(): string {
    return this.flowConfig.sectionLabel;
  }

  get pageTitle(): string {
    return this.flowConfig.pageTitle;
  }

  get formTitle(): string {
    return this.flowConfig.formTitle;
  }

  get submitLabel(): string {
    return this.flowConfig.submitLabel;
  }

  get transactionTypePillLabel(): string {
    return this.isIncomeMode ? 'Credito' : 'Debito';
  }

  get shouldManageTitularCuotas(): boolean {
    return this.isIncomeMode || this.isSharedExpenseMode;
  }

  get shouldShowExpenseCuotasSetup(): boolean {
    return (
      this.isSharedExpenseMode &&
      Boolean(this.selectedFormaPago) &&
      this.isSharedExpenseCategorySelectionReady
    );
  }

  get isVariablePaymentMode(): boolean {
    return this.isSharedExpenseMode && Boolean(this.transaccionForm.controls.pago_variable.value);
  }

  get isSharedExpenseCuotasDesdeFechaProgramadaMode(): boolean {
    return this.isSharedExpenseMode && Boolean(this.transaccionForm.controls.cuotas_sin_intereses.value);
  }

  get isSharedExpenseTotalEditable(): boolean {
    if (this.isVariablePaymentMode || this.isSharedExpenseCuotasDesdeFechaProgramadaMode) {
      return false;
    }

    return Boolean(this.isSharedExpenseMode && this.titularDetalleGroup?.controls.dividir_monto.value);
  }

  get isIncomeMontoEnabled(): boolean {
    return true;
  }

  get isMontoPrincipalReadonly(): boolean {
    if (this.isIncomeMode) {
      return !this.isIncomeMontoEnabled;
    }

    return this.isSharedExpenseMode ? !this.isSharedExpenseTotalEditable : false;
  }

  get montoPrincipalLabel(): string {
    if (this.isSharedExpenseMode) {
      return 'Monto total';
    }

    if (!this.isIncomeMode) {
      return 'Monto';
    }

    const titularGroup = this.titularDetalleGroup;

    if (!titularGroup || !this.isIncomeTitularGroup(titularGroup)) {
      return 'Monto';
    }

    return this.isFixedCuotasMode(titularGroup)
      ? 'Monto por cuota'
      : 'Monto total a dividir';
  }

  get titularMontoLabel(): string {
    const titularGroup = this.titularDetalleGroup;

    if (this.isIncomeMode) {
      return 'Monto total programado';
    }

    if (!titularGroup) {
      return 'Monto del titular';
    }

    return this.isFixedCuotasMode(titularGroup)
      ? 'Monto por cuota'
      : 'Monto total a dividir';
  }

  get montoPrincipalHint(): string {
    const titularGroup = this.titularDetalleGroup;

    if (this.isSharedExpenseMode) {
      return '';
    }

    if (!titularGroup || !this.isIncomeTitularGroup(titularGroup)) {
      return this.shouldShowExpenseCuotasSetup
        ? 'Este campo muestra el total acumulado de las cuotas del gasto.'
        : '';
    }

    return '';
  }

  get shouldShowEstadoPago(): boolean {
    return this.isIncomeMode || Boolean(this.transaccionForm.controls.forma_pago.value);
  }

  get estadosIngresoDisponibles(): CatalogoEstadoTransaccion[] {
    if (!this.usesLimitedEstadoPagoOptions) {
      return this.estadosTransaccion;
    }

    return this.estadosTransaccion.filter((item) => {
      const nombreEstado = item.nombre_estado.trim().toUpperCase();
      return (
        nombreEstado === 'PAGADO' ||
        nombreEstado === 'PENDIENTE' ||
        nombreEstado === 'PAGO PARCIAL'
      );
    });
  }

  get isIngresoPagadoSelected(): boolean {
    return this.transaccionForm.controls.estado_transaccion.value?.trim().toUpperCase() === 'PAGADO';
  }

  get shouldShowIngresoPagadoCuotasHint(): boolean {
    return (
      this.usesLimitedEstadoPagoOptions &&
      this.isIngresoPagadoSelected &&
      this.hasConfiguredMultipleEstadoPagoCuotas()
    );
  }

  get ingresoEstadoHint(): string {
    if (!this.usesLimitedEstadoPagoOptions) {
      return '';
    }

    if (this.isIncomeMode) {
      return this.isIngresoPagadoSelected
        ? 'Si lo guardas como PAGADO, todas las cuotas nacen pagadas.'
        : 'Si lo guardas como PENDIENTE, las cuotas seguiran pendientes hasta que registres su pago desde Listado o Pago Rapido.';
    }

    return this.isIngresoPagadoSelected
      ? 'Si lo guardas como PAGADO, todas las cuotas del gasto compartido quedaran pagadas.'
      : 'Si lo guardas como PENDIENTE, las cuotas del gasto compartido seguiran pendientes hasta que registres su pago desde Listado o Pago Rapido.';
  }

  get requiresDeferredPaymentSetup(): boolean {
    return !this.isIncomeMode && this.selectedFormaPago?.tipo_producto?.pago_inmediato === false;
  }

  get showCuotasSinInteresesOption(): boolean {
    return this.selectedFormaPago?.calcula_interes === true;
  }

  get shouldShowEntidadFinancieraNote(): boolean {
    return Boolean(this.transaccionForm.controls.entidad_financiera.value) && !this.isCashFormaPagoSelected;
  }

  get isImmediatePaymentSelected(): boolean {
    return !this.isIncomeMode && this.selectedFormaPago?.tipo_producto?.pago_inmediato === true;
  }

  get titularCuotaUnicaPagadaControl(): FormControl<boolean | null> {
    return this.transaccionForm.get('titular_cuota_unica_pagada') as FormControl<boolean | null>;
  }

  get isTitularCuotaUnicaPagadaSelected(): boolean {
    return Boolean(this.titularCuotaUnicaPagadaControl.value);
  }

  getParticipanteMontoLabel(group: ParticipanteDetalleForm): string {
    return this.isFixedCuotasMode(group)
      ? 'Monto por cuota'
      : 'Monto total a dividir';
  }

  getParticipanteMontoHint(group: ParticipanteDetalleForm): string {
    return this.isFixedCuotasMode(group)
      ? ''
      : this.isIncomeMode
        ? 'Este monto total se dividira automaticamente entre las cuotas de la persona.'
        : '';
  }

  canGroupUseZeroCuotas(group: ParticipanteDetalleForm): boolean {
    return Boolean(
      this.isSharedExpenseMode &&
      group.controls.es_titular.value &&
      this.toCents(this.normalizeDecimalValue(Number(group.controls.monto.value ?? 0))) === 0,
    );
  }

  canRemoveTitularCuota(group: ParticipanteDetalleForm): boolean {
    return Boolean(
      this.isSharedExpenseMode &&
      group.controls.es_titular.value &&
      this.getCuotasArray(group).length > 0,
    );
  }

  shouldShowTitularSection(group: ParticipanteDetalleForm): boolean {
    return !group.controls.es_titular.value || !this.titularSectionDismissed;
  }

  get dividirMontoLabel(): string {
    return this.isSharedExpenseMode
      ? 'Dividir monto en cuotas/participantes'
      : 'Dividir monto en cuotas';
  }

  shouldShowTitularCuotaUnicaPagadaOption(group: ParticipanteDetalleForm): boolean {
    if (!this.isSharedExpenseMode || !group.controls.es_titular.value) {
      return false;
    }

    if (this.isVariablePaymentMode) {
      return false;
    }

    if (Number(group.controls.cantidad_cuotas.value ?? 0) !== 1) {
      return false;
    }

    return this.toCents(this.getGroupMontoTarget(group)) > 0;
  }

  getModoCuotasLabel(group: ParticipanteDetalleForm): string {
    return (
      this.modosCuotas.find((modo) => modo.value === group.controls.modo_cuotas.value)?.label ??
      'Variables / divididas'
    );
  }

  getParticipantePorcentajeSugerido(group: ParticipanteDetalleForm): number | null {
    const participante = this.getCatalogParticipanteForGroup(group);
    const porcentaje = participante?.porcentaje_participacion;

    if (porcentaje === null || porcentaje === undefined) {
      return null;
    }

    return this.normalizePercentageValue(Number(porcentaje));
  }

  private getPorcentajeValidators(): ValidatorFn[] {
    return [Validators.min(0), Validators.max(100), this.maxSixDecimalsValidator()];
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

  sidebarCollapsed = false;
  maintenanceOpen = false;
  transactionsOpen = false;
  reportesOpen = false;
  loading = false;
  saving = false;
  errorMessage = '';
  successMessage = '';
  showMontoRequiredForParticipantMessage = false;
  private readonly openCuotasGroups = new WeakSet<ParticipanteDetalleForm>();
  private readonly cuotasPageByGroup = new WeakMap<ParticipanteDetalleForm, number>();
  private readonly manualAmountGroups = new WeakSet<ParticipanteDetalleForm>();
  private readonly pendingDismissedTitularFullShareGroups = new WeakSet<ParticipanteDetalleForm>();
  private syncingSharedExpenseCalculatedMonto = false;
  titularSectionDismissed = false;
  private titularManualOverride = false;
  selectedFormaPago: CatalogoFormaPago | null = null;
  readonly today = new Date();
  readonly cuotasPageSize = 12;

  formasPago: CatalogoFormaPago[] = [];
  entidadesFinancieras: CatalogoEntidadFinanciera[] = [];
  tiposEntidad: CatalogoTipoEntidad[] = [];
  participantes: CatalogoParticipante[] = [];
  categorias: CatalogoCategoria[] = [];
  subcategorias: CatalogoSubcategoria[] = [];
  estadosTransaccion: CatalogoEstadoTransaccion[] = [];
  descripcionAutocompleteOptions: string[] = [];
  descripcionAutocompleteFilteredOptions: string[] = [];
  isDescripcionAutocompleteOpen = false;
  private isDescripcionAutocompleteFocused = false;

  readonly transaccionForm = this.fb.group({
    fecha_transaccion: [
      this.formatDateDisplay(this.today),
      [Validators.required, this.dateDisplayValidator()],
    ],
    id_tipo_transaccion: [
      { value: this.flowConfig.defaultTipoTransaccionId, disabled: true },
      [Validators.required],
    ],
    forma_pago: [null as number | null, [Validators.required]],
    id_categoria: [null as number | null, [Validators.required]],
    id_subcategoria: [null as number | null],
    entidad_financiera: [{ value: '', disabled: true }],
    tipo_entidad: [{ value: '', disabled: true }],
    usar_participantes: [false],
    pago_variable: [false],
    cuotas_sin_intereses: [false],
    titular_cuota_unica_pagada: [false],
    participantes_detalle: this.fb.array<ParticipanteDetalleForm>([]),
    id_estado: [null as number | null, [Validators.required]],
    estado_transaccion: [{ value: this.getDefaultStatusName(), disabled: true }],
    estado_registro: [{ value: this.getDefaultStatusName(), disabled: true }],
    monto: [
      null as number | null,
      [Validators.required, Validators.min(0.01), this.maxTwoDecimalsValidator()],
    ],
    descripcion: ['', [this.requiredTrimmedValidator(), Validators.maxLength(250)]],
  });

  ngOnInit(): void {
    this.titularCuotaUnicaPagadaControl.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        this.syncSharedExpenseEstadoForTitularCuotaUnica();
        this.updateEstadoRegistroPreview();
      });

    this.transaccionForm.controls.cuotas_sin_intereses.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        if (!this.isSharedExpenseMode || !this.usarParticipantesControl.value) {
          return;
        }

        this.applySharedExpenseCuotaDrivenMode();
        this.syncSharedExpenseCalculatedMonto();
        this.updateEstadoRegistroPreview();
      });

    this.transaccionForm.controls.pago_variable.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        this.applyVariablePaymentMode();
      });

    this.transaccionForm.controls.descripcion.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((descripcion) => {
        this.refreshDescripcionAutocomplete(descripcion);
      });

    this.applyScreenModeRestrictions();
    void this.loadCatalogos(true);
    void this.loadDescripcionAutocompleteOptions();
  }

  toggleMaintenanceMenu(): void {
    this.maintenanceOpen = !this.maintenanceOpen;
  }

  toggleTransactionsMenu(): void {
    this.transactionsOpen = !this.transactionsOpen;
  }

  onReportesToggle(open: boolean): void {
    this.reportesOpen = open;
  }

  onDescripcionFocus(): void {
    this.isDescripcionAutocompleteFocused = true;
    this.refreshDescripcionAutocomplete(this.transaccionForm.controls.descripcion.value ?? '');
  }

  onDescripcionBlur(): void {
    this.isDescripcionAutocompleteFocused = false;

    window.setTimeout(() => {
      if (!this.isDescripcionAutocompleteFocused) {
        this.isDescripcionAutocompleteOpen = false;
        this.cdr.detectChanges();
      }
    }, 120);
  }

  selectDescripcionSuggestion(descripcion: string, event: Event): void {
    event.preventDefault();
    this.transaccionForm.controls.descripcion.setValue(descripcion);
    this.isDescripcionAutocompleteOpen = false;
    this.cdr.detectChanges();
  }

  get usarParticipantesControl(): FormControl<boolean | null> {
    return this.transaccionForm.get('usar_participantes') as FormControl<boolean | null>;
  }

  get currentUserId(): number {
    return getCurrentUserId();
  }

  get currentUserProfile() {
    return loadUserProfile();
  }

  get currentUserDisplayName(): string {
    return `${this.currentUserParticipante?.nombre_participante?.trim() || this.currentUserProfile.fullName || this.currentUserProfile.username} (T\u00FA)`;
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

  isCuotasAccordionOpen(group: ParticipanteDetalleForm): boolean {
    return this.openCuotasGroups.has(group);
  }

  onCuotasAccordionToggle(group: ParticipanteDetalleForm, event: Event): void {
    const detailsElement = event.target as HTMLDetailsElement | null;

    if (this.isSharedExpenseCuotasDesdeFechaProgramadaMode) {
      if (detailsElement && !detailsElement.open) {
        detailsElement.open = true;
      }

      this.openCuotasGroups.add(group);
      return;
    }

    if (!detailsElement?.open) {
      this.openCuotasGroups.delete(group);
      return;
    }

    this.openCuotasGroups.add(group);
  }

  isCuotaMontoReadonly(group: ParticipanteDetalleForm): boolean {
    if (this.isVariablePaymentMode) {
      return true;
    }

    if (this.isSharedExpenseMode) {
      if (this.isSharedExpenseCuotasDesdeFechaProgramadaMode) {
        return false;
      }

      return this.isIncomeTitularGroup(group);
    }

    return this.isIncomeTitularGroup(group) || this.isFixedCuotasMode(group);
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

  trackCuotaPageItem(_index: number, item: CuotaPageItem): CuotaMontoForm {
    return item.control;
  }

  getFechaProgramadaDisplay(value: string | null | undefined): string {
    return value ? this.formatDateDisplayFromApi(value) : '';
  }

  get titularDetalleGroup(): ParticipanteDetalleForm | null {
    return (
      this.participantesDetalleArray.controls.find(
        (group) => group.controls.es_titular.value,
      ) ?? null
    );
  }

  get hasAdditionalParticipantsInForm(): boolean {
    return this.participantesDetalleArray.controls.some(
      (group) => !group.controls.es_titular.value,
    );
  }

  get sharedExpenseCalculatedTotal(): number {
    if (!this.isSharedExpenseMode) {
      return this.normalizeDecimalValue(Number(this.transaccionForm.controls.monto.value ?? 0));
    }

    return this.normalizeDecimalValue(
      this.participantesDetalleArray.controls.reduce(
        (sum, group) => sum + this.getCuotasTotal(group),
        0,
      ),
    );
  }

  get currentUserParticipante(): CatalogoParticipante | null {
    const nombresCandidato = [
      this.currentUserProfile.fullName,
      this.currentUserProfile.username,
    ]
      .filter((value): value is string => Boolean(value?.trim()))
      .map((value) => this.normalizeText(value));

    const participanteVinculado =
      this.participantes.find(
        (participante) => participante.id_usuario_titular === this.currentUserId,
      ) ?? null;

    if (participanteVinculado) {
      return participanteVinculado;
    }

    return (
      this.participantes.find(
        (participante) =>
          participante.id_usuario === this.currentUserId &&
          nombresCandidato.includes(this.normalizeText(participante.nombre_participante)),
      ) ??
      this.participantes.find(
        (participante) => participante.id_usuario === this.currentUserId,
      ) ??
      null
    );
  }

  get selectableParticipantes(): CatalogoParticipante[] {
    return this.participantes.filter(
      (participante) => !this.isCurrentUserSystemParticipante(participante),
    );
  }

  isParticipanteAsociado(
    participante: Pick<CatalogoParticipante, 'id_usuario_relacionado' | 'id_usuario_titular'> | null | undefined,
  ): boolean {
    return Boolean(
      participante?.id_usuario_relacionado ?? participante?.id_usuario_titular ?? null,
    );
  }

  private isCurrentUserSystemParticipante(
    participante: Pick<CatalogoParticipante, 'id_usuario_relacionado' | 'id_usuario_titular'> | null | undefined,
  ): boolean {
    const systemUserId =
      participante?.id_usuario_titular ?? participante?.id_usuario_relacionado ?? null;

    return systemUserId === this.currentUserId;
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

  get filteredSubcategorias(): CatalogoSubcategoria[] {
    const categoriaId = this.transaccionForm.controls.id_categoria.value;

    if (!categoriaId) {
      return [];
    }

    return this.subcategorias
      .filter((item) => item.id_categoria === categoriaId)
      .sort((a, b) => a.nombre_subcategoria.localeCompare(b.nombre_subcategoria));
  }

  get selectedCategoriaHasSubcategorias(): boolean {
    return this.filteredSubcategorias.length > 0;
  }

  get isSharedExpenseCategorySelectionReady(): boolean {
    const categoriaId = this.transaccionForm.controls.id_categoria.value;

    if (!this.isSharedExpenseMode || categoriaId === null || categoriaId === undefined) {
      return false;
    }

    return this.selectedCategoriaHasSubcategorias
      ? this.transaccionForm.controls.id_subcategoria.value !== null
      : true;
  }

  async loadCatalogos(forceRefresh = false): Promise<void> {
    this.loading = true;
    this.errorMessage = '';

    try {
      const catalogos = await this.catalogosService.loadCatalogos(forceRefresh);

      this.formasPago = catalogos.formasPago
        .filter((item) => item.estado)
        .filter(
          (item) => !this.isIncomeMode || item.tipo_producto?.pago_inmediato === true,
        )
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
        (item) =>
          item.estado === 'ACTIVO' &&
          item.flag?.trim().toUpperCase() === 'T',
      );

      const selectedFormaPagoId = this.transaccionForm.controls.forma_pago.value;
      if (
        selectedFormaPagoId !== null &&
        !this.formasPago.some((item) => item.id_forma === selectedFormaPagoId)
      ) {
        this.transaccionForm.patchValue(
          {
            forma_pago: null,
            entidad_financiera: '',
            tipo_entidad: '',
          },
          { emitEvent: false },
        );
      }

      this.applyDefaultEstado();
      this.onFormaPagoChange();
      this.onCategoriaChange();
      this.updateEstadoRegistroPreview();

      const failedCriticalCatalogs = catalogos.failedCatalogs.filter(
        (item) => item !== 'estados de transaccion',
      );
      const noCatalogosBase =
        this.formasPago.length === 0 &&
        this.entidadesFinancieras.length === 0 &&
        this.tiposEntidad.length === 0 &&
        this.participantes.length === 0 &&
        this.categorias.length === 0;

      this.errorMessage =
        failedCriticalCatalogs.length > 0 && noCatalogosBase
          ? 'No se pudieron cargar los catalogos base para ingreso de transacciones.'
          : '';
    } catch {
      this.formasPago = [];
      this.entidadesFinancieras = [];
      this.tiposEntidad = [];
      this.participantes = [];
      this.categorias = [];
      this.subcategorias = [];
      this.estadosTransaccion = [];
      this.transaccionForm.patchValue({
        estado_transaccion: this.getDefaultStatusName(),
        estado_registro: this.getDefaultStatusName(),
      });
      this.errorMessage =
        'No se pudieron cargar los catalogos base para ingreso de transacciones.';
    } finally {
      this.loading = false;
      this.cdr.detectChanges();
    }
  }

  private async loadDescripcionAutocompleteOptions(): Promise<void> {
    try {
      const transacciones = await firstValueFrom(
        this.http
          .get<TransaccionDescripcionAutocompleteItem[]>(this.apiUrl, {
            params: { id_usuario: this.currentUserId },
          })
          .pipe(timeout(10000)),
      );

      const frequencyByDescripcion = new Map<string, number>();

      for (const transaccion of transacciones) {
        if (transaccion.id_tipo_transaccion !== this.flowConfig.defaultTipoTransaccionId) {
          continue;
        }

        const descripcion = transaccion.descripcion?.trim();

        if (!descripcion) {
          continue;
        }

        frequencyByDescripcion.set(
          descripcion,
          (frequencyByDescripcion.get(descripcion) ?? 0) + 1,
        );
      }

      this.descripcionAutocompleteOptions = Array.from(frequencyByDescripcion.entries())
        .sort((first, second) => {
          if (second[1] !== first[1]) {
            return second[1] - first[1];
          }

          return first[0].localeCompare(second[0], 'es');
        })
        .map(([descripcion]) => descripcion)
        .slice(0, 150);
    } catch {
      this.descripcionAutocompleteOptions = [];
    } finally {
      this.refreshDescripcionAutocomplete(this.transaccionForm.controls.descripcion.value ?? '');
      this.cdr.detectChanges();
    }
  }

  onUsarParticipantesChange(event: Event): void {
    const checked = (event.target as HTMLInputElement).checked;
    this.usarParticipantesControl.setValue(checked);
    this.updateMontoPrincipalValidators();

    if (checked) {
      this.titularManualOverride = false;
      if (this.participantesDetalleArray.length === 0) {
        this.addTitularDetalle();
      }
      this.refreshParticipantesMontos();
      this.updateEstadoRegistroPreview();
      return;
    }

    this.titularManualOverride = false;
    this.participantesDetalleArray.clear();
    this.updateEstadoRegistroPreview();
  }

  addTitularDetalle(): void {
    if (this.titularDetalleGroup) {
      return;
    }

    this.titularSectionDismissed = false;

    const titularMontoInicial = this.isSharedExpenseMode
      ? 0
      : (this.transaccionForm.controls.monto.value ?? 0);
    const titularPorcentajeInicial = this.isSharedExpenseMode ? 0 : 100;

    const dividirMontoTitularInicial = this.isIncomeMode ? false : true;
    const modoCuotasTitularInicial: ModoCuotas = dividirMontoTitularInicial
      ? 'divididas'
      : 'fijas';

    this.participantesDetalleArray.push(
      this.fb.group({
        id_participante: this.fb.control<number | null>(
          this.currentUserParticipante?.id_participante ?? null,
        ),
        nombre_mostrado: this.fb.control(this.currentUserDisplayName, { nonNullable: true }),
        es_titular: this.fb.control(true, { nonNullable: true }),
        dividir_monto: this.fb.control(dividirMontoTitularInicial, { nonNullable: true }),
        modo_cuotas: this.fb.control<ModoCuotas>(modoCuotasTitularInicial, { nonNullable: true }),
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
          this.getPorcentajeValidators(),
        ),
        monto: this.fb.control<number | null>(titularMontoInicial, [
          Validators.required,
          Validators.min(0),
          this.maxTwoDecimalsValidator(),
        ]),
        cuotas: this.createCuotasArray(titularMontoInicial, 1),
      }),
    );
    this.updateParticipantAmountValidators();
    this.titularManualOverride = false;
    this.refreshProgramacionForAllGroups();
    this.syncSharedExpenseCalculatedMonto();
    this.updateEstadoRegistroPreview();
  }

  addParticipanteDetalle(): void {
    if (!this.titularDetalleGroup) {
      this.addTitularDetalle();
    }

    if (!this.canAddSharedExpenseParticipant()) {
      this.transaccionForm.controls.monto.markAsTouched();
      this.showMontoRequiredForParticipantMessage = true;
      this.focusSharedExpenseMontoWhenReady();
      return;
    }

    const dividirMontoInicial = this.titularDetalleGroup?.controls.dividir_monto.value ?? true;
    const modoCuotasInicial: ModoCuotas = dividirMontoInicial ? 'divididas' : 'fijas';

    const newGroup = this.fb.group({
      id_participante: this.fb.control<number | null>(null, [Validators.required]),
      nombre_mostrado: this.fb.control('', { nonNullable: true }),
      es_titular: this.fb.control(false, { nonNullable: true }),
      dividir_monto: this.fb.control(dividirMontoInicial, { nonNullable: true }),
      modo_cuotas: this.fb.control<ModoCuotas>(modoCuotasInicial, { nonNullable: true }),
      cantidad_cuotas: this.fb.control<number | null>(1, [
        Validators.required,
        Validators.min(1),
        this.wholeNumberValidator(),
      ]),
      tipo_programacion: this.fb.control<ProgramacionCuotaTipo>('ninguna', {
        nonNullable: true,
      }),
      dia_programado: this.fb.control<number | null>(null),
      porcentaje: this.fb.control<number | null>(
        this.isSharedExpenseMode ? 0 : null,
        this.getPorcentajeValidators(),
      ),
      monto: this.fb.control<number | null>(this.isSharedExpenseMode ? 0 : null, [
        Validators.required,
        Validators.min(0.01),
        this.maxTwoDecimalsValidator(),
      ]),
      cuotas: this.createCuotasArray(0, 1),
    });

    this.participantesDetalleArray.push(newGroup);
    this.updateParticipantAmountValidators();
    this.showMontoRequiredForParticipantMessage = false;
    this.applyDismissedTitularDefaultShare(newGroup);
    this.refreshProgramacionForAllGroups();
    this.syncSharedExpenseCalculatedMonto();
    this.updateEstadoRegistroPreview();
  }

  syncCuotasCount(group: ParticipanteDetalleForm): void {
    const cuotasCount = this.normalizeCuotasCountValue(
      group,
      group.controls.cantidad_cuotas.value,
    );
    group.controls.cantidad_cuotas.setValue(cuotasCount, { emitEvent: false });

    if (cuotasCount > 1) {
      this.openCuotasGroups.add(group);
    } else {
      this.openCuotasGroups.delete(group);
    }

    if (this.isIncomeTitularGroup(group)) {
      this.updateIncomeTitularMonto(group, cuotasCount);
    }

    this.replaceCuotasArray(
      group,
      this.buildCuotasForConfiguredCount(group, cuotasCount),
    );
    this.syncStandaloneExpenseMonto(group);
    this.ensureProgramacionConfig(group);
    this.refreshProgramacionCuotas(group);

    if (this.isSharedExpenseMode) {
      this.syncSharedExpenseCalculatedMonto();
    }
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

    if (this.isSharedExpenseMode && !this.isCuotaMontoReadonly(group)) {
      if (group.controls.es_titular.value) {
        this.titularManualOverride = true;
      }

      this.clearDismissedTitularFullShareDefault(group);
      this.markGroupAmountAsManual(group);
      this.syncSharedExpenseGroupFromCuotas(group);
      this.updateEstadoRegistroPreview();
      return;
    }

    this.syncLastCuotaWithMonto(group);
    this.updateEstadoRegistroPreview();
  }

  removeParticipanteDetalle(index: number): void {
    this.participantesDetalleArray.removeAt(index);

    if (!this.hasAdditionalParticipantsInForm) {
      this.titularManualOverride = false;
    }

    if (this.isSharedExpenseMode) {
      this.syncSharedExpenseCalculatedMonto();
    } else {
      this.rebalanceMontoDistribution();
    }

    this.updateEstadoRegistroPreview();
  }

  onFormaPagoChange(forceSingleCuotaDefault = false): void {
    const formaPagoId = this.transaccionForm.controls.forma_pago.value;
    this.selectedFormaPago =
      this.formasPago.find((item) => item.id_forma === formaPagoId) ?? null;

    if (!this.selectedFormaPago) {
      this.transaccionForm.patchValue({
        entidad_financiera: '',
        tipo_entidad: '',
      });
      this.applyExpenseFormaPagoRules();
      if (forceSingleCuotaDefault) {
        this.refreshProgramacionForAllGroups(true);
      }
      return;
    }

    if (this.isCashFormaPagoSelected) {
      this.transaccionForm.patchValue({
        entidad_financiera: '',
        tipo_entidad: '',
      });
      this.applyExpenseFormaPagoRules();
      if (forceSingleCuotaDefault) {
        this.refreshProgramacionForAllGroups(true);
      }
      this.focusSharedExpenseMontoWhenReady();
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
    this.applyExpenseFormaPagoRules();
    if (forceSingleCuotaDefault) {
      this.refreshProgramacionForAllGroups(true);
    }
    this.focusSharedExpenseMontoWhenReady();
  }

  onCategoriaChange(): void {
    const subcategoriaControl = this.transaccionForm.controls.id_subcategoria;
    const subcategoriaId = this.transaccionForm.controls.id_subcategoria.value;
    const filteredSubcategorias = this.filteredSubcategorias;

    if (
      subcategoriaId &&
      !filteredSubcategorias.some((item) => item.id_subcategoria === subcategoriaId)
    ) {
      this.transaccionForm.patchValue({
        id_subcategoria: null,
      });
    }

    subcategoriaControl.setValidators(
      filteredSubcategorias.length > 0 ? [Validators.required] : [],
    );
    subcategoriaControl.updateValueAndValidity({ emitEvent: false });
    this.focusSharedExpenseMontoWhenReady();
  }

  onSubcategoriaChange(): void {
    this.focusSharedExpenseMontoWhenReady();
  }

  async onSubmit(): Promise<void> {
    this.successMessage = '';
    this.errorMessage = '';

    this.applyScreenModeRestrictions();
    this.normalizeFormForSubmit();

    if (this.shouldManageTitularCuotas && this.participantesDetalleArray.length === 0) {
      this.addTitularDetalle();
    }

    if (this.shouldManageTitularCuotas) {
      this.refreshParticipantesMontos();
    }

    this.transaccionForm.markAllAsTouched();
    this.participantesDetalleArray.markAllAsTouched();

    if (this.transaccionForm.invalid) {
      this.errorMessage = this.buildIncompleteFormMessage();
      await this.alerts.warning(
        'Formulario incompleto',
        this.errorMessage,
      );
      return;
    }

    if (!(await this.confirmIngresoPagadoConCuotasIfNeeded())) {
      return;
    }

    if (!this.validateCuotasConfiguration()) {
      await this.alerts.warning(
        'Cuotas inconsistentes',
        'La suma de cuotas del titular y de cada participante debe cubrir exactamente su monto.',
      );
      return;
    }

    this.syncTitularCuotaUnicaPagadaOption();
    const formValue = this.transaccionForm.getRawValue();
    const participantesDetalle = this.usarParticipantesControl.value
      ? this.participantesDetalleArray.controls
          .filter((group) => !group.controls.es_titular.value)
          .map((group) => ({
            id_participante: group.controls.id_participante.value,
            monto: this.getGroupMontoTarget(group),
            porcentaje: group.controls.porcentaje.value,
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
        'El monto total de la transaccion debe quedar cubierto completamente por el titular o por los participantes del pago compartido.',
      );
      return;
    }

    const normalizedFecha =
      this.normalizeDateInputValue(formValue.fecha_transaccion ?? '') ??
      this.formatDateApi(this.today);
    const usarParticipantes = Boolean(this.usarParticipantesControl.value);
    const titularDetalleGroup = this.titularDetalleGroup;
    const cuotasTitularPayload =
      titularDetalleGroup
        ? this.getCuotasPayload(titularDetalleGroup)
        : [{
            monto: this.normalizeDecimalValue(montoTotal),
            fecha_programada: this.getSingleCuotaDefaultFechaProgramada(),
          }];
    const cantidadCuotasTitularPayload =
      titularDetalleGroup
        ? (titularDetalleGroup.controls.cantidad_cuotas.value ?? cuotasTitularPayload.length)
        : 1;
    const titularCuotaUnicaPagada =
      titularDetalleGroup
        ? (
            this.shouldShowTitularCuotaUnicaPagadaOption(titularDetalleGroup) &&
            Boolean(formValue.titular_cuota_unica_pagada)
          )
        : false;

    const payload: CreateTransaccionPayload = {
      fecha: normalizedFecha,
      monto: montoTotal,
      id_tipo_cuota: this.isVariablePaymentMode ? TIPO_CUOTA_VARIABLE_ID : TIPO_CUOTA_FIJA_ID,
      id_tipo_transaccion: formValue.id_tipo_transaccion as TipoTransaccionId,
      id_metodo_pago: formValue.forma_pago as number,
      id_categoria: formValue.id_categoria as number,
      id_estado: formValue.id_estado as number,
      pago_variable: this.isVariablePaymentMode,
      cuotas_sin_intereses:
        this.showCuotasSinInteresesOption && Boolean(formValue.cuotas_sin_intereses),
      pagocompartido: Boolean(usarParticipantes && hasAdditionalParticipants),
      titular_cuota_unica_pagada: titularCuotaUnicaPagada,
      cantidad_cuotas_titular: cantidadCuotasTitularPayload,
      cuotas_titular: cuotasTitularPayload,
    };

    if (formValue.id_subcategoria !== null) {
      payload.id_subcategoria = formValue.id_subcategoria;
    }

    const descripcionNormalizada = formValue.descripcion?.trim();
    if (descripcionNormalizada) {
      payload.descripcion = descripcionNormalizada;
    }

    if (payload.pagocompartido) {
      payload.participantes_detalle = participantesDetalle.map((detalle) => ({
        id_participante: detalle.id_participante as number,
        monto: Number(detalle.monto),
        cantidad_cuotas: Number(detalle.cantidad_cuotas),
        cuotas: detalle.cuotas,
      }));
    }

    this.saving = true;

    try {
      await firstValueFrom(
        this.http
          .post(this.apiUrl, payload, {
            params: { id_usuario: this.currentUserId },
          })
          .pipe(timeout(10000)),
      );

      this.successMessage = this.flowConfig.successMessage;
      this.registerDescripcionAutocompleteOption(payload.descripcion);
      await this.alerts.success('Transaccion guardada', this.successMessage);
      this.resetForm();
    } catch (error) {
      this.errorMessage = this.getErrorMessage(
        error,
        'No se pudo guardar la transaccion.',
      );
      await this.alerts.error('No se pudo guardar', this.errorMessage);
    } finally {
      this.saving = false;
    }
  }

  reloadCatalogos(): void {
    void this.loadCatalogos(true);
  }

  get fechaCalendarioValue(): string {
    return this.normalizeDateInputValue(this.transaccionForm.controls.fecha_transaccion.value ?? '') ?? '';
  }

  normalizeMoneyInput(controlName: 'monto', event?: Event): void;
  normalizeMoneyInput(controlName: 'monto', group: ParticipanteDetalleForm, event?: Event): void;
  normalizeMoneyInput(
    controlName: 'monto',
    groupOrEvent?: ParticipanteDetalleForm | Event,
    event?: Event,
  ): void {
    const group =
      groupOrEvent instanceof Event || groupOrEvent === undefined
        ? undefined
        : groupOrEvent;
    const targetEvent =
      groupOrEvent instanceof Event
        ? groupOrEvent
        : event;
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
      if (group.controls.es_titular.value) {
        this.titularManualOverride = true;
      }

      this.markGroupAmountAsManual(group);
      this.updatePorcentajeFromMonto(group, this.shouldRebalanceCounterpart(group));
    } else if (this.shouldManageTitularCuotas) {
      if (this.isSharedExpenseTotalEditable) {
        this.syncSharedExpenseCalculatedMonto();
      } else {
        this.refreshParticipantesMontos();
      }
    }

    this.syncParticipantMontoGuardHint();

    this.updateEstadoRegistroPreview();

    const input = targetEvent?.target as HTMLInputElement | null;
    const formattedValue = control.value;

    if (input && formattedValue !== null && formattedValue !== undefined) {
      input.value = this.normalizeDecimalValue(Number(formattedValue)).toFixed(2);
    }
  }

  onMontoInput(event?: Event): void {
    if (!this.shouldManageTitularCuotas) {
      return;
    }

    if (this.isMoneyInputPendingDecimal(event)) {
      return;
    }

    if (this.isSharedExpenseTotalEditable) {
      this.syncSharedExpenseCalculatedMonto();
      this.syncParticipantMontoGuardHint();
      this.updateEstadoRegistroPreview();
      return;
    }

    this.refreshParticipantesMontos();
    this.syncParticipantMontoGuardHint();
  }

  private focusSharedExpenseMontoWhenReady(): void {
    if (!this.shouldShowExpenseCuotasSetup || this.isVariablePaymentMode) {
      return;
    }

    setTimeout(() => {
      const montoInput = document.getElementById('monto') as HTMLInputElement | null;

      if (!montoInput || montoInput.readOnly || montoInput.disabled) {
        return;
      }

      montoInput.focus();
      montoInput.setSelectionRange(0, montoInput.value.length);
    });
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

  onFechaInput(event: Event): void {
    const input = event.target as HTMLInputElement | null;

    if (!input) {
      return;
    }

    const formattedValue = this.formatDateDisplayInputValue(input.value);

    if (formattedValue !== input.value) {
      input.value = formattedValue;
    }

    this.transaccionForm.controls.fecha_transaccion.setValue(formattedValue, {
      emitEvent: false,
    });
    this.clearInvalidDateError();
  }

  onFechaBlur(): void {
    const control = this.transaccionForm.controls.fecha_transaccion;
    const rawValue = String(control.value ?? '').trim();

    if (!rawValue) {
      return;
    }

    const normalizedValue = this.normalizeDateInputValue(rawValue);

    if (!normalizedValue) {
      control.setErrors({ ...(control.errors ?? {}), invalidDate: true });
      return;
    }

    this.clearInvalidDateError();
    control.setValue(this.formatDateDisplayFromApi(normalizedValue), { emitEvent: false });
    control.updateValueAndValidity({ emitEvent: false });
    this.refreshProgramacionForAllGroups(true);
    this.updateEstadoRegistroPreview();
  }

  onFechaCalendarChange(event: Event): void {
    const input = event.target as HTMLInputElement | null;
    const isoValue = input?.value?.trim() ?? '';

    if (!isoValue) {
      return;
    }

    const normalizedValue = this.normalizeDateInputValue(isoValue);

    if (!normalizedValue) {
      return;
    }

    this.clearInvalidDateError();
    this.transaccionForm.controls.fecha_transaccion.setValue(
      this.formatDateDisplayFromApi(normalizedValue),
      { emitEvent: false },
    );
    this.transaccionForm.controls.fecha_transaccion.updateValueAndValidity({
      emitEvent: false,
    });
    this.refreshProgramacionForAllGroups(true);
    this.updateEstadoRegistroPreview();
  }

  openNativeDatePicker(input: HTMLInputElement): void {
    if (typeof input.showPicker === 'function') {
      input.showPicker();
      return;
    }

    input.click();
  }

  normalizePercentageInput(group: ParticipanteDetalleForm): void {
    const control = group.controls.porcentaje;
    const rawValue = control.value;

    if (this.isSharedExpenseMode) {
      if (group.controls.es_titular.value) {
        this.titularManualOverride = true;
      }

      this.clearDismissedTitularFullShareDefault(group);
      this.recalculateSharedExpensePercentageDistribution(group);
      return;
    }

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

    if (group.controls.es_titular.value) {
      this.titularManualOverride = true;
    }

    this.clearDismissedTitularFullShareDefault(group);
    this.markGroupAmountAsAutomatic(group);
    this.updateMontoFromPorcentaje(group, this.shouldRebalanceCounterpart(group));
  }

  onParticipantePorcentajeInput(group: ParticipanteDetalleForm, event?: Event): void {
    const input = event?.target as HTMLInputElement | null;

    if (input?.type === 'number') {
      const rawValue = input.value.trim();

      group.controls.porcentaje.setValue(
        (rawValue === '' ? null : Number(rawValue)) as number | null,
        { emitEvent: false },
      );
      group.controls.porcentaje.updateValueAndValidity({ emitEvent: false });

      if (this.isSharedExpenseMode) {
        if (group.controls.es_titular.value) {
          this.titularManualOverride = true;
        }

        this.clearDismissedTitularFullShareDefault(group);
        this.recalculateSharedExpensePercentageDistribution(group);
        return;
      }

      if (!rawValue) {
        this.updateEstadoRegistroPreview();
        return;
      }

      if (Number.isNaN(Number(rawValue))) {
        return;
      }

      if (group.controls.es_titular.value) {
        this.titularManualOverride = true;
      }

      this.clearDismissedTitularFullShareDefault(group);
      this.markGroupAmountAsAutomatic(group);
      this.updateMontoFromPorcentaje(group, this.shouldRebalanceCounterpart(group));
      this.updateEstadoRegistroPreview();
      return;
    }

    if (input) {
      input.dataset['replaceOnNextInput'] = 'false';
    }

    this.sanitizePercentageInput(group, event);

    if (this.isPercentageInputPendingDecimal(event)) {
      return;
    }

    if (group.controls.es_titular.value) {
      this.titularManualOverride = true;
    }

    this.clearDismissedTitularFullShareDefault(group);
    this.markGroupAmountAsAutomatic(group);
    this.updateMontoFromPorcentaje(group, this.shouldRebalanceCounterpart(group));
    this.updateEstadoRegistroPreview();
  }

  onParticipanteMontoInput(group: ParticipanteDetalleForm, event?: Event): void {
    if (this.isMoneyInputPendingDecimal(event)) {
      return;
    }

    if (group.controls.es_titular.value) {
      this.titularManualOverride = true;
    }

    this.clearDismissedTitularFullShareDefault(group);
    this.markGroupAmountAsManual(group);
    this.updatePorcentajeFromMonto(group, this.shouldRebalanceCounterpart(group));
    this.updateEstadoRegistroPreview();
  }

  onCuotaMontoInput(
    group: ParticipanteDetalleForm,
    cuotaIndex: number,
    event?: Event,
  ): void {
    if (this.isCuotaMontoReadonly(group)) {
      return;
    }

    if (this.isMoneyInputPendingDecimal(event)) {
      return;
    }

    if (!this.isSharedExpenseMode) {
      this.syncLastCuotaWithMonto(group);
      this.updateEstadoRegistroPreview();
      return;
    }

    if (group.controls.es_titular.value) {
      this.titularManualOverride = true;
    }

    this.clearDismissedTitularFullShareDefault(group);
    this.markGroupAmountAsManual(group);
    this.syncSharedExpenseGroupFromCuotas(group);
    this.updateEstadoRegistroPreview();
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
    this.updateEstadoRegistroPreview();
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
    this.titularCuotaUnicaPagadaControl.setValue(false, { emitEvent: false });
    this.markGroupAmountAsManual(group);
    this.titularSectionDismissed = true;
    this.syncCuotasCount(group);
    this.applyDismissedTitularDefaultShare();
    this.updateEstadoRegistroPreview();
  }

  onTipoProgramacionChange(group: ParticipanteDetalleForm): void {
    this.ensureProgramacionConfig(group);
    this.refreshProgramacionCuotas(group);
  }

  onDiaProgramadoBlur(group: ParticipanteDetalleForm): void {
    const diaControl = group.controls.dia_programado;
    const rawValue = diaControl.value;

    if (rawValue === null || rawValue === undefined) {
      diaControl.setValue(this.getDefaultDiaProgramado(), { emitEvent: false });
    } else {
      diaControl.setValue(this.normalizeDiaProgramado(Number(rawValue)), { emitEvent: false });
    }

    diaControl.updateValueAndValidity({ emitEvent: false });
    this.refreshProgramacionCuotas(group);
  }

  onDividirMontoChange(group: ParticipanteDetalleForm): void {
    if (this.isSharedExpenseCuotasDesdeFechaProgramadaMode) {
      return;
    }

    const gruposObjetivo =
      this.isSharedExpenseMode && group.controls.es_titular.value
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
    const montoObjetivoActual = this.getCuotasTotal(group);

    if (this.shouldPreserveGroupTargetOnCuotaModeChange(group)) {
      group.controls.monto.setValue(
        this.getMontoInputValueForTarget(group, montoObjetivoActual),
        { emitEvent: false },
      );
      group.controls.monto.updateValueAndValidity({ emitEvent: false });
    }

    if (!this.isIncomeMode && group.controls.es_titular.value) {
      this.titularManualOverride = true;
    }

    if (!this.isIncomeMode) {
      this.updatePorcentajeFromMonto(group, this.shouldRebalanceCounterpart(group));
      this.updateEstadoRegistroPreview();
    } else {
      if (group.controls.es_titular.value) {
        this.syncCuotasWithMonto(group);
      } else {
        this.updatePorcentajeFromMonto(group, this.shouldRebalanceCounterpart(group));
      }
      this.updateEstadoRegistroPreview();
      return;
    }
  }

  private shouldPreserveGroupTargetOnCuotaModeChange(
    group: ParticipanteDetalleForm,
  ): boolean {
    if (this.isIncomeMode) {
      return false;
    }

    return true;
  }

  onMontoPaste(event: ClipboardEvent): void {
    const input = event.target as HTMLInputElement | null;
    const sanitizeValue =
      input?.dataset['sanitize'] === 'percentage'
        ? (value: string) => this.sanitizePercentageInputValue(value)
        : (value: string) => this.sanitizeMoneyInputValue(value);

    this.sanitizeDecimalPaste(event, sanitizeValue);
  }

  onFechaPaste(event: ClipboardEvent): void {
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
    this.transaccionForm.controls.fecha_transaccion.setValue(sanitizedValue, {
      emitEvent: false,
    });
    this.clearInvalidDateError();
  }

  onParticipanteSelectionChange(group: ParticipanteDetalleForm): void {
    const participanteId = group.controls.id_participante.value;
    const participante =
      this.participantes.find((item) => item.id_participante === participanteId) ?? null;

    group.controls.nombre_mostrado.setValue(participante?.nombre_participante ?? '', {
      emitEvent: false,
    });

    if (this.shouldDefaultToFullShare(group)) {
      this.assignFullShareToGroup(group);
      this.updateEstadoRegistroPreview();
      return;
    }

    if (participante?.porcentaje_participacion !== null && participante?.porcentaje_participacion !== undefined) {
      group.controls.porcentaje.setValue(participante.porcentaje_participacion, {
        emitEvent: false,
      });
      this.markGroupAmountAsAutomatic(group);

      if (this.isSharedExpenseMode) {
        this.recalculateSharedExpensePercentageDistribution(group);
      } else {
        this.updateMontoFromPorcentaje(group);
      }
    }

    this.updateEstadoRegistroPreview();
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

  private resetForm(): void {
    this.selectedFormaPago = null;
    this.titularManualOverride = false;
    this.showMontoRequiredForParticipantMessage = false;
    this.participantesDetalleArray.clear();
    this.transaccionForm.reset({
      fecha_transaccion: this.formatDateDisplay(new Date()),
      id_tipo_transaccion: this.flowConfig.defaultTipoTransaccionId,
      forma_pago: null,
      id_categoria: null,
      id_subcategoria: null,
      entidad_financiera: '',
      tipo_entidad: '',
      usar_participantes: false,
      pago_variable: false,
      cuotas_sin_intereses: false,
      titular_cuota_unica_pagada: false,
      participantes_detalle: [],
      id_estado: null,
      estado_transaccion: this.getDefaultStatusName(),
      estado_registro: this.getDefaultStatusName(),
      monto: null,
      descripcion: '',
    });
    this.applyDefaultEstado();
    this.onFormaPagoChange();
    this.onCategoriaChange();
    this.applyScreenModeRestrictions();
    this.updateEstadoRegistroPreview();
  }

  private registerDescripcionAutocompleteOption(
    descripcion: string | null | undefined,
  ): void {
    const normalizedDescripcion = descripcion?.trim();

    if (!normalizedDescripcion) {
      return;
    }

    const alreadyExists = this.descripcionAutocompleteOptions.some(
      (item) => item.localeCompare(normalizedDescripcion, 'es', { sensitivity: 'accent' }) === 0,
    );

    if (alreadyExists) {
      return;
    }

    this.descripcionAutocompleteOptions = [
      normalizedDescripcion,
      ...this.descripcionAutocompleteOptions,
    ].slice(0, 150);
    this.refreshDescripcionAutocomplete(this.transaccionForm.controls.descripcion.value ?? '');
  }

  private refreshDescripcionAutocomplete(descripcion: string | null | undefined): void {
    const normalizedDescripcion = this.normalizeText(descripcion ?? '');

    if (!normalizedDescripcion) {
      this.descripcionAutocompleteFilteredOptions = [];
      this.isDescripcionAutocompleteOpen = false;
      return;
    }

    this.descripcionAutocompleteFilteredOptions = this.descripcionAutocompleteOptions
      .filter((item) => {
        const normalizedItem = this.normalizeText(item);
        return (
          normalizedItem.includes(normalizedDescripcion) &&
          normalizedItem !== normalizedDescripcion
        );
      })
      .slice(0, 8);

    this.isDescripcionAutocompleteOpen =
      this.isDescripcionAutocompleteFocused &&
      this.descripcionAutocompleteFilteredOptions.length > 0;
  }

  private canAddSharedExpenseParticipant(): boolean {
    if (!this.isSharedExpenseMode) {
      return true;
    }

    if (this.isVariablePaymentMode) {
      return true;
    }

    return this.normalizeDecimalValue(Number(this.transaccionForm.controls.monto.value ?? 0)) > 0;
  }

  private syncParticipantMontoGuardHint(): void {
    if (!this.showMontoRequiredForParticipantMessage) {
      return;
    }

    if (this.canAddSharedExpenseParticipant()) {
      this.showMontoRequiredForParticipantMessage = false;
    }
  }

  private resolveFlowConfig(): TransactionFlowConfig {
    if (this.route.snapshot.data['transactionFlow'] === 'income') {
      return {
        defaultTipoTransaccionId: 2,
        sectionLabel: 'Ingresos',
        pageTitle: 'Ingreso de Entradas',
        formTitle: 'Registrar ingreso',
        submitLabel: 'Guardar',
        successMessage: 'Ingreso guardado correctamente.',
      };
    }

    if (this.route.snapshot.data['expenseMode'] === 'shared') {
      return {
        defaultTipoTransaccionId: 1,
        sectionLabel: 'Cuotas/Compartidos',
        pageTitle: 'Ingreso de Gastos Compartidos',
        formTitle: 'Registrar gasto compartido',
        submitLabel: 'Guardar',
        successMessage: 'Gasto compartido guardado correctamente.',
      };
    }

    return {
      defaultTipoTransaccionId: 1,
      sectionLabel: 'Gastos',
      pageTitle: 'Ingreso de Gastos Individuales',
      formTitle: 'Registrar gasto individual',
      submitLabel: 'Guardar',
      successMessage: 'Gasto individual guardado correctamente.',
    };
  }

  private applyDefaultEstado(): void {
    const estadoDefaultName = this.getDefaultStatusName();
    const estadoDefault =
      this.getEstadosDisponiblesParaSeleccion().find(
        (item) => item.nombre_estado.trim().toUpperCase() === estadoDefaultName,
      ) ?? this.getEstadosDisponiblesParaSeleccion()[0];

    this.transaccionForm.patchValue({
      id_estado: estadoDefault?.id_estado ?? null,
      estado_transaccion: estadoDefault?.nombre_estado ?? estadoDefaultName,
    });
  }

  private setEstadoTransaccionByName(estadoName: string): void {
    const normalizedEstadoName = estadoName.trim().toUpperCase();
    const estadoSeleccionado =
      this.getEstadosDisponiblesParaSeleccion().find(
        (item) => item.nombre_estado.trim().toUpperCase() === normalizedEstadoName,
      ) ?? null;

    this.transaccionForm.patchValue(
      {
        id_estado: estadoSeleccionado?.id_estado ?? null,
        estado_transaccion: estadoSeleccionado?.nombre_estado ?? estadoName,
      },
      { emitEvent: false },
    );
  }

  onEstadoIngresoChange(): void {
    const estadoId = this.transaccionForm.controls.id_estado.value;
    this.syncEstadoTransaccionFromId(estadoId);
    this.syncIngresoPagadoCuotasProgramacion();
    this.updateEstadoRegistroPreview();
  }

  private syncEstadoTransaccionFromId(estadoId: number | null): void {
    const estadoSeleccionado =
      this.getEstadosDisponiblesParaSeleccion().find((item) => item.id_estado === estadoId) ?? null;

    this.transaccionForm.patchValue(
      {
        id_estado: estadoSeleccionado?.id_estado ?? null,
        estado_transaccion:
          estadoSeleccionado?.nombre_estado ??
          (this.isIncomeMode ? this.getDefaultStatusName() : this.transaccionForm.controls.estado_transaccion.value),
      },
      { emitEvent: false },
    );
  }

  private getEstadosDisponiblesParaSeleccion(): CatalogoEstadoTransaccion[] {
    return this.usesLimitedEstadoPagoOptions ? this.estadosIngresoDisponibles : this.estadosTransaccion;
  }

  private applyExpenseFormaPagoRules(): void {
    if (this.isIncomeMode) {
      this.transaccionForm.controls.cuotas_sin_intereses.setValue(false, {
        emitEvent: false,
      });
      this.applyDefaultEstado();
      this.updateEstadoRegistroPreview();
      return;
    }

    if (!this.selectedFormaPago) {
      this.transaccionForm.controls.cuotas_sin_intereses.setValue(false, {
        emitEvent: false,
      });
      this.applyDefaultEstado();
      this.usarParticipantesControl.setValue(false, { emitEvent: false });
      this.titularManualOverride = false;
      this.participantesDetalleArray.clear();
      this.updateEstadoRegistroPreview();
      return;
    }

    if (!this.showCuotasSinInteresesOption) {
      this.transaccionForm.controls.cuotas_sin_intereses.setValue(false, {
        emitEvent: false,
      });
    }

    this.setEstadoTransaccionByName(
      this.isSharedExpenseMode
        ? this.resolveSharedExpenseEstadoName()
        : this.selectedFormaPago.tipo_producto?.pago_inmediato === true
          ? 'PAGADO'
          : 'PENDIENTE',
    );

    if (this.isIndividualExpenseMode) {
      this.usarParticipantesControl.setValue(false, { emitEvent: false });
      this.titularManualOverride = false;
      this.participantesDetalleArray.clear();
      this.updateEstadoRegistroPreview();
      return;
    }

    this.usarParticipantesControl.setValue(true, { emitEvent: false });

    if (!this.titularDetalleGroup) {
      this.addTitularDetalle();
    }

    this.refreshParticipantesMontos();
    this.updateEstadoRegistroPreview();
  }

  private getDefaultStatusName(): string {
    return 'PENDIENTE';
  }

  private hasConfiguredMultipleIncomeCuotas(): boolean {
    if (!this.isIncomeMode) {
      return false;
    }

    return this.participantesDetalleArray.controls.some(
      (group) => Number(group.controls.cantidad_cuotas.value ?? 1) > 1,
    );
  }

  private get usesLimitedEstadoPagoOptions(): boolean {
    return this.isIncomeMode || this.isSharedExpenseMode;
  }

  private hasConfiguredMultipleSharedExpenseCuotas(): boolean {
    if (!this.isSharedExpenseMode) {
      return false;
    }

    return this.participantesDetalleArray.controls.some(
      (group) => Number(group.controls.cantidad_cuotas.value ?? 1) > 1,
    );
  }

  private hasConfiguredMultipleEstadoPagoCuotas(): boolean {
    return this.isIncomeMode
      ? this.hasConfiguredMultipleIncomeCuotas()
      : this.hasConfiguredMultipleSharedExpenseCuotas();
  }

  private async confirmIngresoPagadoConCuotasIfNeeded(): Promise<boolean> {
    if (!this.shouldShowIngresoPagadoCuotasHint) {
      return true;
    }

    const message = this.isIncomeMode
      ? 'Este ingreso se guardara como PAGADO, por lo que todas sus cuotas naceran pagadas. Deseas continuar?'
      : 'Este gasto compartido se guardara como PAGADO, por lo que todas sus cuotas naceran pagadas. Deseas continuar?';

    return this.alerts.confirm(
      'Confirmar estado pagado',
      message,
      'Aceptar',
      {
        icon: 'warning',
        confirmButtonColor: '#2563eb',
      },
    );
  }

  private applyIncomeModeRestrictions(): void {
    if (!this.isIncomeMode) {
      return;
    }

    this.titularManualOverride = false;
    for (let index = this.participantesDetalleArray.length - 1; index >= 0; index -= 1) {
      const group = this.participantesDetalleArray.at(index);

      if (!group.controls.es_titular.value) {
        this.participantesDetalleArray.removeAt(index);
      }
    }

    if (!this.titularDetalleGroup) {
      this.addTitularDetalle();
    }

    this.transaccionForm.patchValue(
      {
        usar_participantes: false,
        estado_registro: this.resolveEstadoRegistroPreview(),
      },
      { emitEvent: false },
    );
  }

  private applyExpenseModeRestrictions(): void {
    if (this.isIncomeMode) {
      return;
    }

    if (this.isIndividualExpenseMode) {
      this.titularManualOverride = false;
      this.participantesDetalleArray.clear();
      this.transaccionForm.patchValue(
        {
          usar_participantes: false,
          pago_variable: false,
          cuotas_sin_intereses: false,
        },
        { emitEvent: false },
      );
    }
  }

  private applyScreenModeRestrictions(): void {
    this.applyIncomeModeRestrictions();
    this.applyExpenseModeRestrictions();
    this.updateMontoPrincipalValidators();
    this.updateParticipantAmountValidators();
  }

  private updateMontoPrincipalValidators(): void {
    const control = this.transaccionForm.controls.monto;
    const validators = this.isSharedExpenseMode
      ? [this.maxTwoDecimalsValidator()]
      : [Validators.required, Validators.min(0.01), this.maxTwoDecimalsValidator()];

    control.setValidators(validators);
    control.updateValueAndValidity({ emitEvent: false });
  }

  private updateParticipantAmountValidators(): void {
    this.participantesDetalleArray.controls.forEach((group) => {
      const minAmount = group.controls.es_titular.value ? 0 : 0.01;
      const validators = this.isVariablePaymentMode
        ? [Validators.min(0), this.maxTwoDecimalsValidator()]
        : [Validators.required, Validators.min(minAmount), this.maxTwoDecimalsValidator()];

      group.controls.monto.setValidators(validators);
      group.controls.monto.updateValueAndValidity({ emitEvent: false });
    });
  }

  private formatDateApi(date: Date): string {
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

  private refreshParticipantesMontos(): void {
    if (this.isIncomeMode) {
      const titularGroup = this.titularDetalleGroup;

      if (titularGroup) {
        this.syncCuotasWithMonto(titularGroup);
      }

      this.updateEstadoRegistroPreview();
      return;
    }

    if (this.isSharedExpenseMode) {
      if (this.isSharedExpenseCuotasDesdeFechaProgramadaMode) {
        this.participantesDetalleArray.controls.forEach((group) =>
          this.syncSharedExpenseGroupMontoControlFromCuotas(group),
        );
        this.syncSharedExpenseCalculatedMonto();
        this.updateEstadoRegistroPreview();
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
        this.syncSharedExpenseTitularResidual();
      } else if (this.titularDetalleGroup) {
        this.syncCuotasWithMonto(this.titularDetalleGroup);
      }

      this.syncSharedExpenseCalculatedMonto();
      this.updateEstadoRegistroPreview();
      return;
    }

    const titularGroup = this.titularDetalleGroup;
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

    if (titularGroup) {
      if (participantesAdicionales.length === 0) {
        if (
          !this.isGroupAmountManual(titularGroup) &&
          titularGroup.controls.porcentaje.value !== null &&
          titularGroup.controls.porcentaje.value !== undefined
        ) {
          this.updateMontoFromPorcentaje(titularGroup, false);
        }
      } else {
        this.syncSharedExpenseTitularResidual();
      }
    }

    this.updateEstadoRegistroPreview();
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

  private requiredTrimmedValidator(): ValidatorFn {
    return (control: AbstractControl): ValidationErrors | null => {
      const value = String(control.value ?? '').trim();
      return value.length > 0 ? null : { required: true };
    };
  }

  private toCents(value: number): number {
    return Math.round(value * 100);
  }

  private centsToAmount(value: number): number {
    return Number((value / 100).toFixed(2));
  }

  private normalizeDecimalValue(value: number): number {
    return this.centsToAmount(this.toCents(Math.max(0, value)));
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
    const normalizedValue = rawValue.replace(/,/g, '.');
    const decimalPart = normalizedValue.includes('.')
      ? normalizedValue.split('.').slice(1).join('')
      : '';

    return (
      rawValue.endsWith('.') ||
      rawValue.endsWith(',') ||
      (decimalPart.length > 0 && decimalPart.endsWith('0'))
    );
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
    const nextCursorPosition = Math.min(sanitizedValue.length, selectionStart + 1);

    input.value = sanitizedValue;
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

  public getGroupMontoTarget(group: ParticipanteDetalleForm): number {
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

  private createCuotasArray(
    montoTotal: number,
    cantidadCuotas: number,
    fechasProgramadas: Array<string | null> = [],
  ): FormArray<CuotaMontoForm> {
    if (cantidadCuotas <= 0) {
      return this.fb.array<CuotaMontoForm>([]);
    }

    return this.fb.array(
      this.distributeMontoEnCuotas(montoTotal, cantidadCuotas).map((monto, index) =>
        this.createCuotaGroup(
          monto,
          fechasProgramadas[index] ??
            (cantidadCuotas === 1 ? this.getSingleCuotaDefaultFechaProgramada() : null),
        ),
      ),
    );
  }

  private replaceCuotasArray(group: ParticipanteDetalleForm, cuotas: CuotaPayload[]): void {
    const cuotasArray = group.controls.cuotas;
    cuotasArray.clear();
    cuotas.forEach((cuota) =>
      cuotasArray.push(this.createCuotaGroup(cuota.monto, cuota.fecha_programada)),
    );
    this.syncCuotasPage(group);
  }

  private getCuotasPayload(group: ParticipanteDetalleForm): CuotaPayload[] {
    return this.getCuotasArray(group).controls.map((cuotaGroup) => ({
      monto: this.normalizeDecimalValue(Number(cuotaGroup.controls.monto.value ?? 0)),
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
    if (this.isVariablePaymentMode) {
      return true;
    }

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
      this.buildCuotasForConfiguredCount(group, cantidadCuotas),
    );
    this.syncStandaloneExpenseMonto(group);
    this.ensureProgramacionConfig(group);
    this.refreshProgramacionCuotas(group);
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

    if (cuotasArray.length === 1) {
      cuotasArray.at(0)?.controls.monto.setValue(
        this.normalizeDecimalValue(Number(group.controls.monto.value ?? 0)),
        { emitEvent: false },
      );
      return;
    }

    const montoObjetivoCentavos = this.toCents(this.getGroupMontoTarget(group));
    const sumaSinUltimaCentavos = cuotasArray.controls.slice(0, -1).reduce(
      (sum, cuotaGroup) =>
        sum + this.toCents(this.normalizeDecimalValue(Number(cuotaGroup.controls.monto.value ?? 0))),
      0,
    );
    const ultimaCuota = cuotasArray.at(cuotasArray.length - 1);
    const montoUltimaCuota = this.centsToAmount(
      Math.max(0, montoObjetivoCentavos - sumaSinUltimaCentavos),
    );

    ultimaCuota?.controls.monto.setValue(montoUltimaCuota, { emitEvent: false });
    ultimaCuota?.controls.monto.updateValueAndValidity({ emitEvent: false });
    this.refreshProgramacionCuotas(group);
  }

  private validateCuotasConfiguration(): boolean {
    if (this.isVariablePaymentMode) {
      return true;
    }

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

    if (this.isIncomeMode && this.isIngresoPagadoSelected) {
      const todayIso = this.formatDateApi(new Date());

      cuotasArray.controls.forEach((cuota) => {
        cuota.controls.fecha_programada.setValue(todayIso, { emitEvent: false });
      });
      return;
    }

    if (cuotasCount <= 1) {
      const defaultFechaProgramada = this.getSingleCuotaDefaultFechaProgramada();

      cuotasArray.controls.forEach((cuota) =>
        cuota.controls.fecha_programada.setValue(
          forceSingleCuotaDefault
            ? defaultFechaProgramada
            : (cuota.controls.fecha_programada.value ?? defaultFechaProgramada),
          { emitEvent: false },
        ),
      );
      return;
    }

    this.ensureProgramacionConfig(group);

    const fechasProgramadas = this.buildFechasProgramadas(
      cuotasCount,
      group.controls.tipo_programacion.value,
      group.controls.dia_programado.value,
    );

    cuotasArray.controls.forEach((cuota, index) => {
      cuota.controls.fecha_programada.setValue(fechasProgramadas[index] ?? null, {
        emitEvent: false,
      });
    });
  }

  private syncIngresoPagadoCuotasProgramacion(): void {
    if (!this.isIncomeMode) {
      return;
    }

    this.refreshProgramacionForAllGroups();
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
      this.formatDateApi(this.today);

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
    const idTipoTransaccion = Number(
      this.transaccionForm.controls.id_tipo_transaccion.getRawValue() ??
        this.flowConfig.defaultTipoTransaccionId,
    );

    if (idTipoTransaccion !== 1) {
      return null;
    }

    const fechaBase =
      this.normalizeDateInputValue(this.transaccionForm.controls.fecha_transaccion.value ?? '') ??
      this.formatDateApi(this.today);

    return this.buildSingleCuotaFechaProgramada(fechaBase);
  }

  private buildSingleCuotaFechaProgramada(fechaBaseIso: string): string {
    const diasGracia = Number(this.getCurrentFormaPago()?.dias_gracia);
    const diasProgramados =
      Number.isFinite(diasGracia) && diasGracia > 0
        ? Math.max(0, Math.trunc(diasGracia) - 1)
        : 7;

    return this.formatDateApi(this.addDays(this.parseIsoDate(fechaBaseIso), diasProgramados));
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
        fechas.push(this.formatDateApi(candidate));
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
        fechas.push(this.formatDateApi(candidate));
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
      fechas.push(this.formatDateApi(cursor));
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

  private addDays(date: Date, days: number): Date {
    const result = new Date(date);
    result.setDate(result.getDate() + days);

    return result;
  }

  private getDefaultDiaProgramado(): number {
    const fechaBase =
      this.normalizeDateInputValue(this.transaccionForm.controls.fecha_transaccion.value ?? '') ??
      this.formatDateApi(this.today);

    return Math.min(30, Math.max(1, Number(fechaBase.slice(8, 10))));
  }

  private normalizeDiaProgramado(value: number | null | undefined): number {
    const normalizedValue = Number.isFinite(Number(value))
      ? Number(value)
      : this.getDefaultDiaProgramado();
    return Math.min(30, Math.max(1, Math.trunc(normalizedValue)));
  }

  private clearInvalidDateError(): void {
    const control = this.transaccionForm.controls.fecha_transaccion;

    if (!control.hasError('invalidDate')) {
      return;
    }

    const { invalidDate, ...remainingErrors } = control.errors ?? {};
    control.setErrors(Object.keys(remainingErrors).length > 0 ? remainingErrors : null);
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

    const [, year, month, day] = normalizedValue.match(/^(\d{4})-(\d{2})-(\d{2})$/) ?? [];

    if (!year || !month || !day) {
      return value;
    }

    return `${day}/${month}/${year}`;
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

  private dateDisplayValidator(): ValidatorFn {
    return (control: AbstractControl): ValidationErrors | null => {
      const rawValue = String(control.value ?? '').trim();

      if (!rawValue) {
        return null;
      }

      return this.normalizeDateInputValue(rawValue) ? null : { invalidDate: true };
    };
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

  private normalizeFormForSubmit(): void {
    this.onFechaBlur();
    this.normalizeMoneyInput('monto');
    const shouldNormalizePorcentaje = !this.isSharedExpenseMode;

    this.participantesDetalleArray.controls.forEach((group) => {
      if (
        shouldNormalizePorcentaje &&
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

  private validateMontoCubiertoPorParticipantes(
    montoTotal: number,
    montoTitular: number,
    montoParticipantes: number,
    hasAdditionalParticipants: boolean,
  ): boolean {
    if (this.isVariablePaymentMode) {
      return true;
    }

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

  private updateEstadoRegistroPreview(): void {
    this.syncTitularCuotaUnicaPagadaOption();
    this.transaccionForm.patchValue(
      {
        estado_registro: this.resolveEstadoRegistroPreview(),
      },
      { emitEvent: false },
    );
  }

  private syncTitularCuotaUnicaPagadaOption(): void {
    const titularGroup = this.titularDetalleGroup;

    if (titularGroup && this.shouldShowTitularCuotaUnicaPagadaOption(titularGroup)) {
      this.syncSharedExpenseEstadoForTitularCuotaUnica();
      return;
    }

    this.titularCuotaUnicaPagadaControl.setValue(false, { emitEvent: false });
    this.syncSharedExpenseEstadoForTitularCuotaUnica();
  }

  private syncSharedExpenseEstadoForTitularCuotaUnica(): void {
    if (!this.isSharedExpenseMode) {
      return;
    }

    const titularGroup = this.titularDetalleGroup;

    if (!titularGroup || !this.shouldShowTitularCuotaUnicaPagadaOption(titularGroup)) {
      return;
    }

    if (!this.isTitularCuotaUnicaPagadaSelected) {
      return;
    }

    this.setEstadoTransaccionByName(this.resolveTitularCuotaUnicaPagadaEstadoName());
  }

  private resolveSharedExpenseEstadoName(): string {
    if (
      this.titularDetalleGroup &&
      this.shouldShowTitularCuotaUnicaPagadaOption(this.titularDetalleGroup) &&
      this.isTitularCuotaUnicaPagadaSelected
    ) {
      return this.resolveTitularCuotaUnicaPagadaEstadoName();
    }

    const estadoActual = this.transaccionForm.controls.estado_transaccion.value?.trim().toUpperCase();
    const estadoDisponible = this.estadosIngresoDisponibles.some(
      (item) => item.nombre_estado.trim().toUpperCase() === estadoActual,
    );

    return estadoDisponible ? (estadoActual ?? this.getDefaultStatusName()) : this.getDefaultStatusName();
  }

  private resolveEstadoRegistroPreview(): string {
    if (this.isIncomeMode) {
      return this.transaccionForm.controls.estado_transaccion.value?.trim().toUpperCase() || this.getDefaultStatusName();
    }

    if (this.isVariablePaymentMode) {
      return 'PENDIENTE';
    }

    if (
      this.titularDetalleGroup &&
      this.shouldShowTitularCuotaUnicaPagadaOption(this.titularDetalleGroup) &&
      this.isTitularCuotaUnicaPagadaSelected
    ) {
      return this.resolveTitularCuotaUnicaPagadaEstadoName();
    }

    if (this.isImmediatePaymentSelected) {
      return 'COMPLETADO';
    }

    if (!this.usarParticipantesControl.value) {
      return 'PENDIENTE';
    }

    const participantesAdicionales = this.participantesDetalleArray.controls.filter(
      (group) => !group.controls.es_titular.value,
    );

    if (participantesAdicionales.length === 0) {
      return 'PENDIENTE';
    }

    if (
      participantesAdicionales.some(
        (group) =>
          group.controls.id_participante.value === null ||
          group.controls.monto.value === null,
      )
    ) {
      return 'PENDIENTE';
    }

    const montoTotal = this.getResolvedSubmitMontoTotal(
      Number(this.transaccionForm.controls.monto.value ?? 0),
    );

    if (this.toCents(montoTotal) <= 0) {
      return 'PENDIENTE';
    }

    const montoTitular = this.titularDetalleGroup
      ? this.getGroupMontoTarget(this.titularDetalleGroup)
      : 0;
    const montoParticipantes = participantesAdicionales.reduce(
      (sum, group) =>
        sum + this.getGroupMontoTarget(group),
      0,
    );

    return this.validateMontoCubiertoPorParticipantes(
      montoTotal,
      montoTitular,
      montoParticipantes,
      true,
    )
      ? 'COMPLETADO'
      : 'PENDIENTE';
  }

  private resolveTitularCuotaUnicaPagadaEstadoName(): 'PAGO PARCIAL' | 'PAGADO' {
    const hasPendingAdditionalParticipants = this.getAdditionalParticipants().some(
      (group) => this.toCents(this.getGroupMontoTarget(group)) > 0,
    );

    return hasPendingAdditionalParticipants ? 'PAGO PARCIAL' : 'PAGADO';
  }

  private updateMontoFromPorcentaje(
    group: ParticipanteDetalleForm,
    shouldRebalanceTitular = true,
  ): void {
    if (this.isSharedExpenseMode) {
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

      this.syncSharedExpenseCalculatedMonto();
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

    if (shouldRebalanceTitular) {
      if (this.isSharedExpenseMode) {
        this.syncSharedExpenseTitularResidual();
      } else {
        this.rebalanceMontoDistribution(group);
      }
    }
  }

  private updatePorcentajeFromMonto(
    group: ParticipanteDetalleForm,
    shouldRebalanceTitular = true,
  ): void {
    if (this.isSharedExpenseMode) {
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

      this.syncSharedExpenseCalculatedMonto();
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

    if (shouldRebalanceTitular) {
      if (this.isSharedExpenseMode) {
        this.syncSharedExpenseTitularResidual();
      } else {
        this.rebalanceMontoDistribution(group);
      }
    }
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
        (sum, group) =>
          sum + this.toCents(this.getGroupMontoTarget(group)),
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

  private shouldRebalanceCounterpart(group: ParticipanteDetalleForm): boolean {
    if (this.isSharedExpenseCuotasDesdeFechaProgramadaMode) {
      return false;
    }

    if (this.usesIndependentSharedExpenseAmounts) {
      return false;
    }

    if (!this.titularManualOverride) {
      return true;
    }

    return (
      group.controls.es_titular.value ||
      this.getAdditionalParticipants().length === 1
    );
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
      !this.isSharedExpenseMode ||
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
      this.isSharedExpenseMode &&
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

  private markGroupAmountAsManual(group: ParticipanteDetalleForm): void {
    if (!this.isSharedExpenseMode) {
      return;
    }

    this.manualAmountGroups.add(group);
  }

  private markGroupAmountAsAutomatic(group: ParticipanteDetalleForm): void {
    if (!this.isSharedExpenseMode) {
      return;
    }

    this.manualAmountGroups.delete(group);
  }

  private isGroupAmountManual(group: ParticipanteDetalleForm): boolean {
    return this.isSharedExpenseMode && this.manualAmountGroups.has(group);
  }

  private get usesIndependentSharedExpenseAmounts(): boolean {
    return this.isSharedExpenseMode && !Boolean(this.transaccionForm.controls.cuotas_sin_intereses.value);
  }

  private syncSharedExpenseCounterpart(group: ParticipanteDetalleForm): void {
    if (
      !this.isSharedExpenseMode ||
      this.usesIndependentSharedExpenseAmounts ||
      this.isSharedExpenseCuotasDesdeFechaProgramadaMode
    ) {
      return;
    }

    const counterpartGroup = this.getSharedExpenseCounterpartGroup(group);

    if (!counterpartGroup) {
      return;
    }

    this.rebalanceMontoDistributionToGroup(counterpartGroup);
  }

  private syncSharedExpenseGroupMontoControlFromCuotas(group: ParticipanteDetalleForm): void {
    const montoActual = this.getCuotasTotal(group);

    group.controls.monto.setValue(this.getMontoInputValueForTarget(group, montoActual), {
      emitEvent: false,
    });
    group.controls.monto.updateValueAndValidity({ emitEvent: false });
  }

  private syncSharedExpenseGroupFromCuotas(group: ParticipanteDetalleForm): void {
    this.syncSharedExpenseGroupMontoControlFromCuotas(group);

    if (this.shouldRebalanceCounterpart(group)) {
      this.syncSharedExpenseCounterpart(group);
    }

    this.syncSharedExpenseCalculatedMonto();
  }

  private recalculateSharedExpensePercentageDistribution(
    editedGroup: ParticipanteDetalleForm,
  ): void {
    if (!this.isSharedExpenseMode) {
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
    this.updateEstadoRegistroPreview();
  }

  private syncSharedExpensePercentagesToHundred(
    totalMonto: number,
    preferredResidualGroup?: ParticipanteDetalleForm,
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
      this.resolveResidualGroup(preferredResidualGroup) ?? groups[groups.length - 1] ?? null;

    if (!residualGroup) {
      return;
    }

    let porcentajeAsignado = 0;

    groups.forEach((group) => {
      if (group === residualGroup) {
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

  private syncSharedExpenseMainMontoToTitular(): void {
    if (!this.isSharedExpenseMode || !this.isSharedExpenseTotalEditable) {
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

  private syncSharedExpenseTitularResidual(): void {
    if (
      !this.isSharedExpenseMode ||
      this.usesIndependentSharedExpenseAmounts ||
      this.isSharedExpenseCuotasDesdeFechaProgramadaMode
    ) {
      return;
    }

    const titularGroup = this.titularDetalleGroup;

    if (!titularGroup || this.isGroupAmountManual(titularGroup)) {
      return;
    }

    this.rebalanceTitularParticipation();
  }

  private getSharedExpenseGroupTotal(group: ParticipanteDetalleForm): number {
    return this.getGroupCuotasCount(group) > 1
      ? this.getCuotasTotal(group)
      : this.getGroupMontoTarget(group);
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
      this.isIncomeMode ||
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
    if (this.isIncomeMode) {
      return Number(this.titularDetalleGroup?.controls.monto.value ?? formMonto ?? 0);
    }

    if (this.isSharedExpenseMode) {
      if (this.isVariablePaymentMode) {
        return 0;
      }

      return this.isSharedExpenseTotalEditable
        ? this.normalizeDecimalValue(Number(formMonto ?? 0))
        : this.sharedExpenseCalculatedTotal;
    }

    const titularGroup = this.titularDetalleGroup;

    if (titularGroup && this.getAdditionalParticipants().length === 0) {
      return this.getGroupMontoTarget(titularGroup);
    }

    return this.normalizeDecimalValue(Number(formMonto ?? 0));
  }

  private syncSharedExpenseCalculatedMonto(): void {
    if (!this.isSharedExpenseMode || this.syncingSharedExpenseCalculatedMonto) {
      return;
    }

    this.syncingSharedExpenseCalculatedMonto = true;

    try {
      if (this.isVariablePaymentMode) {
        this.transaccionForm.controls.monto.setValue(0, { emitEvent: false });
        this.transaccionForm.controls.monto.updateValueAndValidity({ emitEvent: false });
        return;
      }

      if (this.getAdditionalParticipants().length > 0) {
        this.syncSharedExpenseTitularResidual();
      } else {
        this.syncSharedExpenseMainMontoToTitular();
      }

      const montoTotal = this.isSharedExpenseTotalEditable
        ? this.normalizeDecimalValue(Number(this.transaccionForm.controls.monto.value ?? 0))
        : this.sharedExpenseCalculatedTotal;

      if (!this.isSharedExpenseTotalEditable) {
        this.transaccionForm.controls.monto.setValue(montoTotal, { emitEvent: false });
        this.transaccionForm.controls.monto.updateValueAndValidity({ emitEvent: false });
      }

      this.syncSharedExpensePercentagesToHundred(montoTotal);
    } finally {
      this.syncingSharedExpenseCalculatedMonto = false;
    }
  }

  private applySharedExpenseCuotaDrivenMode(): void {
    if (!this.isSharedExpenseCuotasDesdeFechaProgramadaMode) {
      return;
    }

    this.participantesDetalleArray.controls.forEach((group) => {
      group.controls.dividir_monto.setValue(true, { emitEvent: false });
      group.controls.dividir_monto.updateValueAndValidity({ emitEvent: false });
      group.controls.modo_cuotas.setValue('divididas', { emitEvent: false });
      group.controls.modo_cuotas.updateValueAndValidity({ emitEvent: false });
      this.syncSharedExpenseGroupMontoControlFromCuotas(group);
    });
  }

  private isIncomeTitularGroup(group: ParticipanteDetalleForm): boolean {
    return this.isIncomeMode && group.controls.es_titular.value;
  }

  private buildCuotasForConfiguredCount(
    group: ParticipanteDetalleForm,
    cantidadCuotas: number,
  ): CuotaPayload[] {
    const cuotasCount = this.normalizeCuotasCountValue(group, cantidadCuotas);

    if (cuotasCount <= 0) {
      return [];
    }

    if (this.isVariablePaymentMode) {
      return Array.from({ length: cuotasCount }, () => ({
        monto: 0,
        fecha_programada:
          cuotasCount === 1 ? this.getSingleCuotaDefaultFechaProgramada() : null,
      }));
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
          cuotasCount === 1 ? this.getSingleCuotaDefaultFechaProgramada() : null,
      }));
    }

    const montoObjetivo = this.normalizeDecimalValue(Number(group.controls.monto.value ?? 0));

    if (this.isFixedCuotasMode(group)) {
      return Array.from({ length: cuotasCount }, () => ({
        monto: montoObjetivo,
        fecha_programada:
          cuotasCount === 1 ? this.getSingleCuotaDefaultFechaProgramada() : null,
      }));
    }

    return this.distributeMontoEnCuotas(montoObjetivo, cuotasCount).map((monto) => ({
      monto,
      fecha_programada:
        cuotasCount === 1 ? this.getSingleCuotaDefaultFechaProgramada() : null,
    }));
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

    if (this.transaccionForm.controls.id_subcategoria.invalid) {
      missingFields.push('Subcategoria');
    }

    if (this.transaccionForm.controls.id_estado.invalid) {
      missingFields.push('Estado');
    }

    if (this.transaccionForm.controls.descripcion.invalid) {
      missingFields.push('Descripcion/Comercio');
    }

    if (!this.isSharedExpenseMode && this.transaccionForm.controls.monto.invalid) {
      missingFields.push('Monto total');
    }

    if (this.isSharedExpenseMode && !this.isVariablePaymentMode && this.transaccionForm.controls.monto.invalid) {
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

      if (
        !this.isVariablePaymentMode &&
        this.toCents(this.getCuotasTotal(group)) !== this.toCents(this.getGroupMontoTarget(group))
      ) {
        missingFields.push(`${label}: suma de cuotas`);
      }

      if (this.getCuotasArray(group).controls.some((cuotaGroup) => cuotaGroup.controls.monto.invalid)) {
        missingFields.push(`${label}: monto de cuotas`);
      }

      if (!this.isVariablePaymentMode && group.controls.monto.invalid) {
        if (this.isSharedExpenseMode && group.controls.dividir_monto.value) {
          missingFields.push(
            group.controls.es_titular.value ? 'Monto total' : `${label}: porcentaje de participacion`,
          );
        } else {
          missingFields.push(`${label}: monto`);
        }
      }
    });

    if (missingFields.length === 0) {
      return 'Completa los campos obligatorios antes de guardar la transaccion.';
    }

    return `Completa estos campos: ${missingFields.join(', ')}.`;
  }

  private applyVariablePaymentMode(): void {
    if (!this.isSharedExpenseMode) {
      this.transaccionForm.controls.pago_variable.setValue(false, { emitEvent: false });
      return;
    }

    this.updateMontoPrincipalValidators();
    this.updateParticipantAmountValidators();
    this.showMontoRequiredForParticipantMessage = false;

    if (!this.isVariablePaymentMode) {
      this.updateEstadoRegistroPreview();
      return;
    }

    this.titularCuotaUnicaPagadaControl.setValue(false, { emitEvent: false });
    this.transaccionForm.controls.monto.setValue(0, { emitEvent: false });
    this.transaccionForm.controls.monto.updateValueAndValidity({ emitEvent: false });

    this.participantesDetalleArray.controls.forEach((group) => {
      group.controls.monto.setValue(0, { emitEvent: false });
      group.controls.monto.updateValueAndValidity({ emitEvent: false });

      this.getCuotasArray(group).controls.forEach((cuotaGroup) => {
        cuotaGroup.controls.monto.setValue(0, { emitEvent: false });
        cuotaGroup.controls.monto.updateValueAndValidity({ emitEvent: false });
      });
    });

    this.refreshProgramacionForAllGroups();
    this.updateEstadoRegistroPreview();
  }

  private isCurrentRouteIn(routes: string[]): boolean {
    const currentUrl = this.router.url.split('?')[0];
    return routes.some((route) => currentUrl === route || currentUrl.startsWith(`${route}/`));
  }
}
