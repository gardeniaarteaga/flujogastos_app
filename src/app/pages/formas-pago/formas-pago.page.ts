import { DatePipe, NgClass, NgFor, NgIf } from '@angular/common';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectorRef, Component, OnInit, inject } from '@angular/core';
import { FormBuilder, FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { catchError, firstValueFrom, of, timeout } from 'rxjs';

import { apiUrl } from '../../shared/config/api.config';
import { MaintenanceActionsComponent } from '../../shared/maintenance-actions/maintenance-actions.component';
import { SessionStripComponent } from '../../shared/session-strip/session-strip.component';
import { SweetAlertService } from '../../shared/services/sweet-alert.service';
import { getCurrentUserId, isAdminUser } from '../../shared/user-profile';

type Estado = 'activo' | 'inactivo';
type SelectorMode = 'existente' | 'nuevo';
type AplicaMembresiaOption = boolean | 'no_aplica';

interface EntidadFinanciera {
  id_entidad: number;
  id_usuario?: number | null;
  nombre_entidad: string;
  tipo_entidad: number | null;
  estado: boolean;
  tipoEntidad?: TipoEntidad | null;
}

interface TipoEntidad {
  id_tipo_entidad: number;
  id_usuario?: number | null;
  descripcion: string;
  estado: boolean;
}

interface TipoProducto {
  id_tipo_producto: number;
  nombre_tipo: string;
}

interface FormaPago {
  id_forma: number;
  id_usuario?: number | null;
  nombre_forma: string;
  id_entidad: number;
  id_tipo: number;
  tasa_anual: number | null;
  calcula_interes: boolean | null;
  recibe_estado_cuenta: boolean | null;
  aplica_membresia: boolean | null;
  mes_pago_membresia: number | null;
  dia_corte: number | null;
  dia_ultimo_pago: number | null;
  dias_gracia: number | null;
  estado: boolean;
  fecha_creacion: string;
  entidad_financiera: EntidadFinanciera;
  tipo_producto: {
    id_tipo: number;
    nombre_tipo: string;
  };
  puede_editar?: boolean;
  puede_eliminar?: boolean;
}

interface FormaPagoPayload {
  nombre_forma: string;
  id_entidad?: number;
  new_entidad?: string;
  id_tipo_entidad?: number;
  new_tipo_entidad?: string;
  id_tipo?: number;
  new_tipo?: string;
  tasa_anual?: number | null;
  calcula_interes?: boolean;
  recibe_estado_cuenta?: boolean;
  aplica_membresia?: boolean;
  mes_pago_membresia?: number | null;
  dia_corte?: number | null;
  dia_ultimo_pago?: number | null;
  dias_gracia?: number | null;
  estado: boolean;
}

@Component({
  selector: 'app-formas-pago-page',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    RouterLinkActive,
    NgIf,
    NgFor,
    NgClass,
    DatePipe,
    MaintenanceActionsComponent,
    SessionStripComponent,
  ],
  templateUrl: './formas-pago.page.html',
  styleUrl: './formas-pago.page.css',
})
export class FormasPagoPage implements OnInit {
  readonly mesesPagoMembresia = [
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
  readonly pageSize = 10;

  private readonly fb = inject(FormBuilder);
  private readonly http = inject(HttpClient);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly alerts = inject(SweetAlertService);
  private readonly apiUrl = apiUrl('formas-pago');
  private readonly entidadesUrl = apiUrl('entidades-financieras');
  private readonly tiposEntidadUrl = apiUrl('tipo-entidad');
  private readonly tiposUrl = apiUrl('tipo-producto');
  private readonly currentUserId = getCurrentUserId();
  get isAdminSession(): boolean {
    return isAdminUser();
  }

  formasPago: FormaPago[] = [];
  entidades: EntidadFinanciera[] = [];
  tiposEntidad: TipoEntidad[] = [];
  tipos: TipoProducto[] = [];
  currentPage = 1;
  sidebarCollapsed = false;
  transactionsOpen = false;
  maintenanceOpen = false;
  loading = false;
  loadingCatalogs = false;
  saving = false;
  deletingId: number | null = null;
  editingId: number | null = null;
  errorMessage = '';
  successMessage = '';
  entidadMode: SelectorMode = 'existente';
  tipoEntidadMode: SelectorMode = 'existente';
  tipoMode: SelectorMode = 'existente';
  fechaCreacionActual = new Date();

  readonly formaPagoForm = this.fb.group({
    nombre_forma: this.fb.control('', [Validators.required, Validators.maxLength(100)]),
    id_entidad: this.fb.control<number | null>(null),
    new_entidad: this.fb.control('', [Validators.maxLength(100)]),
    id_tipo_entidad: this.fb.control<number | null>(null),
    new_tipo_entidad: this.fb.control('', [Validators.maxLength(100)]),
    id_tipo: this.fb.control<number | null>(null),
    new_tipo: this.fb.control('', [Validators.maxLength(100)]),
    tasa_anual: this.fb.control<number | null>(null),
    calcula_interes: this.fb.control(false, [Validators.required]),
    recibe_estado_cuenta: this.fb.control(false, [Validators.required]),
    aplica_membresia: this.fb.control<AplicaMembresiaOption>(false, [Validators.required]),
    mes_pago_membresia: this.fb.control<number | null>(null),
    dia_corte: this.fb.control<number | null>(null, [Validators.min(1), Validators.max(31)]),
    dia_ultimo_pago: this.fb.control<number | null>(null),
    dias_gracia: this.fb.control<number | null>(null),
    estado: this.fb.control('activo' as Estado, [Validators.required]),
  });

  constructor() {
    this.applyDefaultSelectorModes();
  }

  ngOnInit(): void {
    void this.loadFormasPagoList();
    void this.loadSupportCatalogs();
  }

  toggleTransactionsMenu(): void {
    this.transactionsOpen = !this.transactionsOpen;
  }

  toggleMaintenanceMenu(): void {
    this.maintenanceOpen = !this.maintenanceOpen;
  }

  get isEditing(): boolean {
    return this.editingId !== null;
  }

  get entidadControl(): FormControl<number | null> {
    return this.formaPagoForm.get('id_entidad') as FormControl<number | null>;
  }

  get newEntidadControl(): FormControl<string> {
    return this.formaPagoForm.get('new_entidad') as FormControl<string>;
  }

  get tipoEntidadControl(): FormControl<number | null> {
    return this.formaPagoForm.get('id_tipo_entidad') as FormControl<number | null>;
  }

  get newTipoEntidadControl(): FormControl<string> {
    return this.formaPagoForm.get('new_tipo_entidad') as FormControl<string>;
  }

  get tipoControl(): FormControl<number | null> {
    return this.formaPagoForm.get('id_tipo') as FormControl<number | null>;
  }

  get newTipoControl(): FormControl<string> {
    return this.formaPagoForm.get('new_tipo') as FormControl<string>;
  }

  get aplicaMembresiaValue(): AplicaMembresiaOption | null {
    return this.formaPagoForm.controls.aplica_membresia.value;
  }

  get isCreatingNewEntidad(): boolean {
    return this.entidadMode === 'nuevo';
  }

  get isCreatingNewTipoEntidad(): boolean {
    return this.tipoEntidadMode === 'nuevo';
  }

  get isCreatingNewTipo(): boolean {
    return this.tipoMode === 'nuevo';
  }

  get hasExistingEntidades(): boolean {
    return this.entidades.length > 0;
  }

  get hasExistingTiposEntidad(): boolean {
    return this.tiposEntidad.length > 0;
  }

  get hasExistingTiposProducto(): boolean {
    return this.tipos.length > 0;
  }

  get totalPages(): number {
    return Math.max(1, Math.ceil(this.formasPago.length / this.pageSize));
  }

  get paginatedFormasPago(): FormaPago[] {
    const startIndex = (this.currentPage - 1) * this.pageSize;
    return this.formasPago.slice(startIndex, startIndex + this.pageSize);
  }

  get pageNumbers(): number[] {
    return Array.from({ length: this.totalPages }, (_, index) => index + 1);
  }

  async loadData(): Promise<void> {
    this.errorMessage = '';

    await Promise.all([
      this.loadFormasPagoList(),
      this.loadSupportCatalogs(),
    ]);
  }

  setEntidadMode(mode: SelectorMode): void {
    if (mode === 'existente' && !this.hasExistingEntidades) {
      mode = 'nuevo';
    }

    this.entidadMode = mode;

    if (mode === 'nuevo') {
      this.entidadControl.setValue(null);
      this.entidadControl.clearValidators();
      this.newEntidadControl.setValidators([Validators.required, Validators.maxLength(100)]);
    } else {
      this.newEntidadControl.setValue('');
      this.newEntidadControl.clearValidators();
      this.entidadControl.setValidators([Validators.required]);
      this.tipoEntidadControl.setValue(null);
      this.newTipoEntidadControl.setValue('');
    }

    this.entidadControl.updateValueAndValidity();
    this.newEntidadControl.updateValueAndValidity();
    this.updateTipoEntidadValidators();
  }

  setTipoEntidadMode(mode: SelectorMode): void {
    if (mode === 'existente' && !this.hasExistingTiposEntidad) {
      mode = 'nuevo';
    }

    this.tipoEntidadMode = mode;

    if (mode === 'nuevo') {
      this.tipoEntidadControl.setValue(null);
      this.newTipoEntidadControl.setValue('');
    } else {
      this.newTipoEntidadControl.setValue('');
    }

    this.updateTipoEntidadValidators();
  }

  setTipoMode(mode: SelectorMode): void {
    if (mode === 'existente' && !this.hasExistingTiposProducto) {
      mode = 'nuevo';
    }

    this.tipoMode = mode;

    if (mode === 'nuevo') {
      this.tipoControl.setValue(null);
      this.tipoControl.clearValidators();
      this.newTipoControl.setValidators([Validators.required, Validators.maxLength(100)]);
    } else {
      this.newTipoControl.setValue('');
      this.newTipoControl.clearValidators();
      this.tipoControl.setValidators([Validators.required]);
    }

    this.tipoControl.updateValueAndValidity();
    this.newTipoControl.updateValueAndValidity();
  }

  private updateTipoEntidadValidators(): void {
    if (!this.isCreatingNewEntidad) {
      this.tipoEntidadControl.clearValidators();
      this.newTipoEntidadControl.clearValidators();
    } else if (this.isCreatingNewTipoEntidad) {
      this.tipoEntidadControl.clearValidators();
      this.newTipoEntidadControl.setValidators([Validators.required, Validators.maxLength(100)]);
    } else {
      this.newTipoEntidadControl.clearValidators();
      this.tipoEntidadControl.setValidators([Validators.required]);
    }

    this.tipoEntidadControl.updateValueAndValidity();
    this.newTipoEntidadControl.updateValueAndValidity();
  }

  editFormaPago(forma: FormaPago): void {
    if (!this.canEditFormaPago(forma)) {
      this.errorMessage = 'No tienes permisos para editar esta forma de pago.';
      void this.alerts.warning('Accion no permitida', this.errorMessage);
      return;
    }

    this.editingId = forma.id_forma;
    this.successMessage = '';
    this.errorMessage = '';
    this.setEntidadMode('existente');
    this.setTipoEntidadMode('existente');
    this.setTipoMode('existente');
    this.formaPagoForm.reset({
      nombre_forma: forma.nombre_forma,
      id_entidad: forma.id_entidad,
      new_entidad: '',
      id_tipo_entidad: null,
      new_tipo_entidad: '',
      id_tipo: forma.id_tipo,
      new_tipo: '',
      tasa_anual: forma.tasa_anual,
      calcula_interes: forma.calcula_interes ?? false,
      recibe_estado_cuenta: forma.recibe_estado_cuenta ?? false,
      aplica_membresia:
        forma.mes_pago_membresia === 0 ? 'no_aplica' : (forma.aplica_membresia ?? false),
      mes_pago_membresia: forma.mes_pago_membresia,
      dia_corte: forma.dia_corte,
      dia_ultimo_pago: forma.dia_ultimo_pago,
      dias_gracia: forma.dias_gracia,
      estado: forma.estado ? 'activo' : 'inactivo',
    });
    this.fechaCreacionActual = new Date(forma.fecha_creacion);
  }

  resetForm(): void {
    this.editingId = null;
    this.formaPagoForm.reset({
      nombre_forma: '',
      id_entidad: null,
      new_entidad: '',
      id_tipo_entidad: null,
      new_tipo_entidad: '',
      id_tipo: null,
      new_tipo: '',
      tasa_anual: null,
      calcula_interes: false,
      recibe_estado_cuenta: false,
      aplica_membresia: false,
      mes_pago_membresia: null,
      dia_corte: null,
      dia_ultimo_pago: null,
      dias_gracia: null,
      estado: 'activo',
    });
    this.applyDefaultSelectorModes();
    this.fechaCreacionActual = new Date();
  }

  cancelEdit(): void {
    this.successMessage = '';
    this.errorMessage = '';
    this.resetForm();
  }

  onAplicaMembresiaChange(): void {
    const aplicaMembresia = this.formaPagoForm.controls.aplica_membresia.value;
    const mesPagoMembresiaControl = this.formaPagoForm.controls.mes_pago_membresia;

    if (aplicaMembresia === 'no_aplica') {
      mesPagoMembresiaControl.setValue(0);
      return;
    }

    if (mesPagoMembresiaControl.value === 0) {
      mesPagoMembresiaControl.setValue(null);
    }
  }

  async onSubmit(): Promise<void> {
    this.successMessage = '';
    this.errorMessage = '';

    if (this.formaPagoForm.invalid) {
      this.formaPagoForm.markAllAsTouched();
      await this.alerts.warning(
        'Formulario incompleto',
        'Completa los campos obligatorios antes de continuar.',
      );
      return;
    }

    const formValue = this.formaPagoForm.getRawValue();
    const payload: FormaPagoPayload = {
      nombre_forma: formValue.nombre_forma?.trim() ?? '',
      estado: formValue.estado === 'activo',
    };

    if (this.isCreatingNewEntidad) {
      payload.new_entidad = formValue.new_entidad?.trim() ?? '';
      if (this.isCreatingNewTipoEntidad) {
        payload.new_tipo_entidad = formValue.new_tipo_entidad?.trim() ?? '';
      } else if (formValue.id_tipo_entidad !== null) {
        payload.id_tipo_entidad = formValue.id_tipo_entidad;
      }
    } else if (formValue.id_entidad !== null) {
      payload.id_entidad = formValue.id_entidad;
    }

    if (this.isCreatingNewTipo) {
      payload.new_tipo = formValue.new_tipo?.trim() ?? '';
    } else if (formValue.id_tipo !== null) {
      payload.id_tipo = formValue.id_tipo;
    }

    payload.calcula_interes = formValue.calcula_interes ?? false;
    payload.recibe_estado_cuenta = formValue.recibe_estado_cuenta ?? false;
    payload.aplica_membresia = formValue.aplica_membresia === true;

    if (formValue.tasa_anual !== null) {
      payload.tasa_anual = formValue.tasa_anual;
    }

    if (formValue.aplica_membresia === 'no_aplica') {
      payload.mes_pago_membresia = 0;
    } else if (formValue.mes_pago_membresia !== null) {
      payload.mes_pago_membresia = formValue.mes_pago_membresia;
    }

    if (formValue.dia_corte !== null) {
      payload.dia_corte = formValue.dia_corte;
    }

    if (formValue.dia_ultimo_pago !== null) {
      payload.dia_ultimo_pago = formValue.dia_ultimo_pago;
    }

    if (formValue.dias_gracia !== null) {
      payload.dias_gracia = formValue.dias_gracia;
    }

    this.saving = true;
    const wasEditing = this.isEditing;
    const currentId = this.editingId;

    try {
      if (wasEditing && currentId !== null) {
        await firstValueFrom(
          this.http
            .patch(`${this.apiUrl}/${currentId}`, payload, {
              params: { id_usuario: this.currentUserId },
            })
            .pipe(timeout(10000)),
        );
        this.successMessage = 'Forma de pago actualizada correctamente.';
        await this.alerts.success('Forma de pago actualizada', this.successMessage);
      } else {
        await firstValueFrom(
          this.http
            .post(this.apiUrl, payload, { params: { id_usuario: this.currentUserId } })
            .pipe(timeout(10000)),
        );
        this.successMessage = 'Forma de pago guardada correctamente.';
        await this.alerts.success('Forma de pago guardada', this.successMessage);
      }

      this.saving = false;
      this.resetForm();
      void this.loadData();
    } catch (error) {
      this.errorMessage = this.getErrorMessage(error, 'No se pudo guardar la forma de pago.');
      await this.alerts.error('No se pudo guardar', this.errorMessage);
      console.error(error);
    } finally {
      this.saving = false;
    }
  }

  async removeFormaPago(forma: FormaPago): Promise<void> {
    if (!this.canDeleteFormaPago(forma)) {
      this.errorMessage = 'No tienes permisos para eliminar esta forma de pago.';
      await this.alerts.warning('Accion no permitida', this.errorMessage);
      return;
    }

    const confirmed = await this.alerts.confirmDelete(
      'la forma de pago',
      forma.nombre_forma,
    );

    if (!confirmed) {
      return;
    }

    this.deletingId = forma.id_forma;
    this.successMessage = '';
    this.errorMessage = '';

    try {
      await firstValueFrom(
        this.http
          .delete(`${this.apiUrl}/${forma.id_forma}`, {
            params: { id_usuario: this.currentUserId },
          })
          .pipe(timeout(10000)),
      );

      this.formasPago = this.formasPago.filter((item) => item.id_forma !== forma.id_forma);
      this.currentPage = Math.min(this.currentPage, this.totalPages);

      if (this.editingId === forma.id_forma) {
        this.resetForm();
      }

      this.successMessage = 'Forma de pago eliminada correctamente.';
      await this.alerts.success('Forma de pago eliminada', this.successMessage);
    } catch (error) {
      this.errorMessage = this.getErrorMessage(error, 'No se pudo eliminar la forma de pago.');
      await this.alerts.error('No se pudo eliminar', this.errorMessage);
      console.error(error);
    } finally {
      this.deletingId = null;
    }
  }

  canDeleteFormaPago(forma: FormaPago): boolean {
    if (this.isAdminSession) {
      return true;
    }

    return forma.puede_eliminar ?? forma.id_usuario === this.currentUserId;
  }

  canEditFormaPago(forma: FormaPago): boolean {
    if (this.isAdminSession) {
      return true;
    }

    return forma.puede_editar ?? forma.id_usuario === this.currentUserId;
  }

  async showFormaPagoDetail(forma: FormaPago): Promise<void> {
    await this.alerts.detail(
      'Detalle de forma de pago',
      [
        { label: 'Nombre', value: forma.nombre_forma },
        { label: 'Entidad financiera', value: forma.entidad_financiera.nombre_entidad },
        {
          label: 'Tipo de entidad',
          value: forma.entidad_financiera.tipoEntidad?.descripcion ?? '-',
        },
        { label: 'Tipo de producto', value: forma.tipo_producto.nombre_tipo },
        { label: 'Tasa anual %', value: forma.tasa_anual },
        { label: 'Calcula interes', value: forma.calcula_interes },
        { label: 'Recibe estado de cuenta', value: forma.recibe_estado_cuenta },
        {
          label: 'Aplica membresia',
          value: forma.mes_pago_membresia === 0 ? 'No aplica' : forma.aplica_membresia,
        },
        {
          label: 'Mes pago membresia',
          value:
            forma.mes_pago_membresia === 0
              ? 'No aplica'
              : this.getMesPagoMembresiaLabel(forma.mes_pago_membresia),
        },
        { label: 'Dia corte', value: forma.dia_corte },
        { label: 'Dia ultimo pago', value: forma.dia_ultimo_pago },
        { label: 'Dias gracia', value: forma.dias_gracia },
        { label: 'Estado', value: forma.estado ? 'Activo' : 'Inactivo' },
        { label: 'Fecha creacion', value: forma.fecha_creacion.slice(0, 10) },
      ],
      {
        subtitle: `Forma de pago #${forma.id_forma}`,
      },
    );
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

  private ensureSelectorModes(): void {
    if (this.isEditing) {
      if (!this.hasExistingEntidades) {
        this.setEntidadMode('nuevo');
      }

      if (this.isCreatingNewEntidad && !this.hasExistingTiposEntidad) {
        this.setTipoEntidadMode('nuevo');
      }

      if (!this.hasExistingTiposProducto) {
        this.setTipoMode('nuevo');
      }

      return;
    }

    this.applyDefaultSelectorModes();
  }

  private applyDefaultSelectorModes(): void {
    this.setEntidadMode(this.hasExistingEntidades ? 'existente' : 'nuevo');
    this.setTipoEntidadMode(this.hasExistingTiposEntidad ? 'existente' : 'nuevo');
    this.setTipoMode(this.hasExistingTiposProducto ? 'existente' : 'nuevo');
  }

  private async loadFormasPagoList(): Promise<void> {
    this.loading = true;

    try {
      const formasResult = await this.loadCollection<FormaPago>(this.apiUrl);

      this.formasPago = this.sortByText(
        formasResult.data,
        (item) => item.nombre_forma,
      );
      this.currentPage = 1;

      if (formasResult.failed) {
        this.errorMessage = 'No se pudieron cargar por completo las formas de pago.';
      }
    } catch (error) {
      this.formasPago = [];
      this.currentPage = 1;
      this.errorMessage = this.getErrorMessage(
        error,
        'No se pudieron cargar las formas de pago.',
      );
      await this.alerts.error('Error al cargar', this.errorMessage);
      console.error(error);
    } finally {
      this.loading = false;
      this.cdr.detectChanges();
    }
  }

  private async loadSupportCatalogs(): Promise<void> {
    this.loadingCatalogs = true;

    try {
      const [entidadesResult, tiposEntidadResult, tiposResult] = await Promise.all([
        this.loadCollection<EntidadFinanciera>(this.entidadesUrl),
        this.loadCollection<TipoEntidad>(this.tiposEntidadUrl),
        this.loadCollection<TipoProducto>(this.tiposUrl),
      ]);

      this.entidades = this.sortByText(
        entidadesResult.data,
        (item) => item.nombre_entidad,
      );
      this.tiposEntidad = this.sortByText(
        tiposEntidadResult.data,
        (item) => item.descripcion,
      );
      this.tipos = this.sortByText(tiposResult.data, (item) => item.nombre_tipo);
      this.ensureSelectorModes();

      const failedCollections = [
        entidadesResult.failed ? 'entidades financieras' : null,
        tiposEntidadResult.failed ? 'tipos de entidad' : null,
        tiposResult.failed ? 'tipos de producto' : null,
      ].filter((item): item is string => item !== null);

      if (failedCollections.length > 0) {
        this.appendErrorMessage(
          `No se pudieron cargar por completo estos catalogos del formulario: ${failedCollections.join(', ')}.`,
        );
      }
    } catch (error) {
      this.entidades = [];
      this.tiposEntidad = [];
      this.tipos = [];
      this.ensureSelectorModes();
      this.appendErrorMessage(
        this.getErrorMessage(
          error,
          'No se pudieron cargar los catalogos auxiliares del formulario.',
        ),
      );
      console.error(error);
    } finally {
      this.loadingCatalogs = false;
      this.cdr.detectChanges();
    }
  }

  private async loadCollection<T extends object>(
    url: string,
  ): Promise<{ data: T[]; failed: boolean }> {
    const data = await firstValueFrom(
      this.http
        .get<T[]>(url, { params: { id_usuario: this.currentUserId } })
        .pipe(
          timeout(10000),
          catchError(() => of(null)),
        ),
    );

    return {
      data: data ?? [],
      failed: data === null,
    };
  }

  private sortByText<T>(items: T[], getText: (item: T) => string | null | undefined): T[] {
    return [...items].sort((left, right) =>
      (getText(left) ?? '').localeCompare(getText(right) ?? ''),
    );
  }

  private getMesPagoMembresiaLabel(value: number | null): string {
    if (value === null || value === undefined) {
      return '-';
    }

    return this.mesesPagoMembresia.find((mes) => mes.value === value)?.label ?? String(value);
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

  private appendErrorMessage(message: string): void {
    this.errorMessage = this.errorMessage
      ? `${this.errorMessage} ${message}`
      : message;
  }
}
