import { NgClass, NgFor, NgIf } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import {
  AbstractControl,
  FormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { RouterLink, RouterLinkActive } from '@angular/router';

import { SessionStripComponent } from '../../shared/session-strip/session-strip.component';
import { SweetAlertService } from '../../shared/services/sweet-alert.service';
import {
  ConfiguracionNotificacionPago,
  NotificacionesService,
  PeriodicidadCatalogo,
  PrioridadNotificacion,
} from '../../shared/services/notificaciones.service';
import { MaintenanceActionsComponent } from '../../shared/maintenance-actions/maintenance-actions.component';
import { isAdminUser, loadUserProfile } from '../../shared/user-profile';

type PrioridadOption = {
  value: PrioridadNotificacion;
  label: string;
};

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const DISPLAY_DATE_PATTERN = /^\d{2}\/\d{2}\/\d{4}$/;

const QUINCENAL_FALLBACK: PeriodicidadCatalogo = {
  id_periodicidad: 4,
  nombre_periodicidad: 'Quincenal',
  descripcion: 'Se ejecutara dos veces al mes: el dia 15 y el ultimo dia del mes.',
  codigo: 'quincenal',
  estado: true,
};

const parseSupportedDate = (value: string | null | undefined): Date | null => {
  const normalized = (value ?? '').trim();

  if (!normalized) {
    return null;
  }

  let year = 0;
  let month = 0;
  let day = 0;

  if (ISO_DATE_PATTERN.test(normalized)) {
    [year, month, day] = normalized.split('-').map((part) => Number(part));
  } else if (DISPLAY_DATE_PATTERN.test(normalized)) {
    [day, month, year] = normalized.split('/').map((part) => Number(part));
  } else {
    return null;
  }

  const parsed = new Date(year, month - 1, day);

  if (
    Number.isNaN(parsed.getTime()) ||
    parsed.getFullYear() !== year ||
    parsed.getMonth() !== month - 1 ||
    parsed.getDate() !== day
  ) {
    return null;
  }

  return parsed;
};

const formatDisplayDate = (date: Date): string => {
  const day = `${date.getDate()}`.padStart(2, '0');
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const year = date.getFullYear();
  return `${day}/${month}/${year}`;
};

const formatApiDate = (date: Date): string => {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const dateInputValidator = (control: AbstractControl): ValidationErrors | null => {
  const value = control.value as string | null | undefined;

  if (!value) {
    return null;
  }

  return parseSupportedDate(value) ? null : { invalidDate: true };
};

const dateRangeValidator = (
  control: AbstractControl,
): ValidationErrors | null => {
  const fechaInicio = control.get('fecha_inicio')?.value as string | null | undefined;
  const fechaFin = control.get('fecha_fin')?.value as string | null | undefined;

  if (!fechaInicio || !fechaFin) {
    return null;
  }

  const parsedInicio = parseSupportedDate(fechaInicio);
  const parsedFin = parseSupportedDate(fechaFin);

  if (!parsedInicio || !parsedFin) {
    return null;
  }

  return parsedFin.getTime() >= parsedInicio.getTime() ? null : { invalidDateRange: true };
};

@Component({
  selector: 'app-resumen-notificaciones-page',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    RouterLinkActive,
    NgIf,
    NgFor,
    NgClass,
    MaintenanceActionsComponent,
    SessionStripComponent,
  ],
  templateUrl: './resumen-notificaciones.page.html',
  styleUrl: './resumen-notificaciones.page.css',
})
export class ResumenNotificacionesPage implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly alerts = inject(SweetAlertService);
  private readonly notificacionesService = inject(NotificacionesService);
  private readonly dateFormatter = new Intl.DateTimeFormat('es-SV', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
  private readonly dateTimeFormatter = new Intl.DateTimeFormat('es-SV', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  sidebarCollapsed = false;
  maintenanceOpen = false;
  saving = false;
  deletingId: number | null = null;
  editingId: number | null = null;
  successMessage = '';
  errorMessage = '';
  loadingPeriodicidades = false;
  periodicidadesDisponibles = false;
  readonly today = new Date();
  readonly todayDateInput = this.toDateInputValue(this.today);
  readonly defaultEndDateInput = this.getDefaultEndDate(this.todayDateInput);
  readonly userProfile = loadUserProfile();
  configuraciones: ConfiguracionNotificacionPago[] = [];
  periodicidadOptions: PeriodicidadCatalogo[] = [];
  readonly prioridadOptions: PrioridadOption[] = [
    {
      value: 'alta',
      label: 'Alta',
    },
    {
      value: 'media',
      label: 'Media',
    },
    {
      value: 'baja',
      label: 'Baja',
    },
  ];

  readonly notificacionForm = this.fb.group({
    descripcion: this.fb.control('', [Validators.required, Validators.maxLength(160)]),
    prioridad: this.fb.control<PrioridadNotificacion>('media', [Validators.required]),
    fecha_inicio: this.fb.control(this.todayDateInput, [Validators.required, dateInputValidator]),
    fecha_fin: this.fb.control(this.defaultEndDateInput, [Validators.required, dateInputValidator]),
    dia_pago_programado: this.fb.control<number | null>(null, [
      Validators.required,
      Validators.min(1),
      Validators.max(31),
    ]),
    id_periodicidad: this.fb.control<number | null>(null, [Validators.required]),
  }, { validators: [dateRangeValidator] });

  get isAdminSession(): boolean {
    return isAdminUser();
  }

  get isEditing(): boolean {
    return this.editingId !== null;
  }

  get submitButtonLabel(): string {
    if (this.saving) {
      return 'Guardando...';
    }

    return this.isEditing ? 'Actualizar configuracion' : 'Guardar configuracion';
  }

  get totalConfiguraciones(): number {
    return this.configuraciones.length;
  }

  get proximaConfiguracion(): ConfiguracionNotificacionPago | null {
    return this.configuraciones[0] ?? null;
  }

  get selectedPeriodicidad(): PeriodicidadCatalogo | null {
    const id = this.notificacionForm.controls.id_periodicidad.value;
    return this.periodicidadOptions.find((item) => item.id_periodicidad === id) ?? null;
  }

  get isSelectedPeriodicidadQuincenal(): boolean {
    return this.isQuincenalPeriodicidad(this.selectedPeriodicidad);
  }

  get editingConfiguracion(): ConfiguracionNotificacionPago | null {
    if (!this.isEditing) {
      return null;
    }

    return (
      this.configuraciones.find(
        (item) => item.id_notificacion_programada === this.editingId,
      ) ?? null
    );
  }

  async ngOnInit(): Promise<void> {
    await this.loadPeriodicidades();
    await this.loadConfiguraciones();
    this.applyPeriodicidadRules();

    this.notificacionForm.controls.id_periodicidad.valueChanges.subscribe(() => {
      this.applyPeriodicidadRules();
    });

    this.notificacionForm.controls.descripcion.valueChanges.subscribe((descripcion) => {
      const descripcionControl = this.notificacionForm.controls.descripcion;
      const descripcionNormalizada = this.normalizeDescripcion(descripcion);

      if (descripcionNormalizada === descripcion) {
        return;
      }

      descripcionControl.setValue(descripcionNormalizada, { emitEvent: false });
    });

    this.notificacionForm.controls.fecha_inicio.valueChanges.subscribe((fechaInicio) => {
      const fechaInicioControl = this.notificacionForm.controls.fecha_inicio;
      const fechaInicioNormalizada = this.normalizeDateInput(fechaInicio);

      if (fechaInicioNormalizada !== fechaInicio) {
        fechaInicioControl.setValue(fechaInicioNormalizada, { emitEvent: false });
      }

      if (this.isEditing) {
        return;
      }

      const fechaFinControl = this.notificacionForm.controls.fecha_fin;
      const shouldSyncFechaFin = fechaFinControl.pristine || !fechaFinControl.value;

      if (!shouldSyncFechaFin || !this.isCompleteDateInput(fechaInicioNormalizada)) {
        return;
      }

      fechaFinControl.setValue(this.getDefaultEndDate(fechaInicioNormalizada), { emitEvent: false });
    });

    this.notificacionForm.controls.fecha_fin.valueChanges.subscribe((fechaFin) => {
      const fechaFinControl = this.notificacionForm.controls.fecha_fin;
      const fechaFinNormalizada = this.normalizeDateInput(fechaFin);

      if (fechaFinNormalizada === fechaFin) {
        return;
      }

      fechaFinControl.setValue(fechaFinNormalizada, { emitEvent: false });
    });
  }

  toggleMaintenanceMenu(): void {
    this.maintenanceOpen = !this.maintenanceOpen;
  }

  async loadConfiguraciones(): Promise<void> {
    if (this.periodicidadesDisponibles) {
      this.errorMessage = '';
    }

    try {
      this.configuraciones = await this.notificacionesService.loadConfiguracionesPago(
        this.periodicidadOptions,
      );
      this.mergePeriodicidadesFromConfiguraciones();
    } catch {
      this.configuraciones = [];
      this.errorMessage =
        'No se pudieron cargar las notificaciones programadas del usuario actual.';
    }
  }

  async loadPeriodicidades(): Promise<void> {
    this.loadingPeriodicidades = true;

    try {
      const periodicidades = await this.notificacionesService.loadPeriodicidades();
      this.periodicidadOptions = this.buildPeriodicidadOptions(periodicidades);
      this.periodicidadesDisponibles = this.periodicidadOptions.length > 0;

      if (this.periodicidadOptions.length > 0) {
        this.notificacionForm.controls.id_periodicidad.setValue(
          this.getDefaultPeriodicidadId(),
        );
      } else {
        this.errorMessage =
          'La tabla de periodicidad no devolvio registros disponibles.';
      }
    } catch {
      this.periodicidadOptions = [];
      this.periodicidadesDisponibles = false;
      this.errorMessage =
        'No se pudo cargar la tabla de periodicidad desde el backend. El formulario queda bloqueado hasta que exista ese endpoint.';
    } finally {
      this.loadingPeriodicidades = false;
    }
  }

  async onSubmit(): Promise<void> {
    this.successMessage = '';

    if (!this.periodicidadesDisponibles) {
      await this.alerts.warning(
        'Periodicidad no disponible',
        'La lista de periodicidad debe venir desde la tabla del backend antes de guardar.',
      );
      return;
    }

    if (this.notificacionForm.invalid) {
      this.notificacionForm.markAllAsTouched();
      await this.alerts.warning(
        'Formulario incompleto',
        'Completa nombre de la notificacion, prioridad, fechas de inicio y fin, dia de pago entre 1 y 31 y periodicidad.',
      );
      return;
    }

    this.saving = true;
    const wasEditing = this.isEditing;
    const periodicidadSeleccionada =
      this.periodicidadOptions.find(
        (item) => item.id_periodicidad === this.notificacionForm.value.id_periodicidad,
      ) ?? null;

    if (!periodicidadSeleccionada) {
      this.saving = false;
      await this.alerts.warning(
        'Periodicidad invalida',
        'Selecciona una periodicidad valida de la tabla cargada.',
      );
      return;
    }

    try {
      await this.notificacionesService.saveConfiguracionPago({
        id_notificacion_programada: this.editingId,
        descripcion: this.normalizeDescripcion(this.notificacionForm.value.descripcion).trim(),
        prioridad: this.notificacionForm.value.prioridad ?? 'media',
        fecha_inicio: this.toApiDateValue(this.notificacionForm.value.fecha_inicio),
        fecha_fin: this.toApiDateValue(this.notificacionForm.value.fecha_fin),
        dia_pago_programado: this.resolveDiaPagoProgramado(periodicidadSeleccionada),
        id_periodicidad: periodicidadSeleccionada.id_periodicidad,
      });

      await this.loadConfiguraciones();
      this.successMessage = wasEditing
        ? 'La configuracion de notificacion fue actualizada correctamente.'
        : 'La configuracion de notificacion fue creada correctamente.';
      this.resetForm();

      await this.alerts.success(
        wasEditing ? 'Configuracion actualizada' : 'Configuracion guardada',
        this.successMessage,
      );
    } catch {
      this.errorMessage =
        'No se pudo guardar la configuracion de notificaciones en este momento.';
      await this.alerts.error('No se pudo guardar', this.errorMessage);
    } finally {
      this.saving = false;
    }
  }

  editConfiguracion(configuracion: ConfiguracionNotificacionPago): void {
    this.successMessage = '';
    this.errorMessage = this.periodicidadesDisponibles ? '' : this.errorMessage;
    this.ensurePeriodicidadOption(configuracion.periodicidad);
    this.editingId = configuracion.id_notificacion_programada;
    this.notificacionForm.patchValue({
      descripcion: this.normalizeDescripcion(configuracion.descripcion),
      prioridad: configuracion.prioridad,
      fecha_inicio: this.toDisplayDateValue(configuracion.fecha_inicio),
      fecha_fin: this.toDisplayDateValue(configuracion.fecha_fin),
      dia_pago_programado: configuracion.dia_pago_programado,
      id_periodicidad: configuracion.id_periodicidad > 0 ? configuracion.id_periodicidad : null,
    });
    this.notificacionForm.markAsPristine();
    this.notificacionForm.markAsUntouched();
    this.applyPeriodicidadRules();
  }

  async removeConfiguracion(configuracion: ConfiguracionNotificacionPago): Promise<void> {
    const confirmed = await this.alerts.confirmDelete(
      'la configuracion',
      configuracion.descripcion,
    );

    if (!confirmed) {
      return;
    }

    this.deletingId = configuracion.id_notificacion_programada;
    this.successMessage = '';
    this.errorMessage = this.periodicidadesDisponibles ? '' : this.errorMessage;

    try {
      await this.notificacionesService.deleteConfiguracionPago(
        configuracion.id_notificacion_programada,
      );

      if (this.editingId === configuracion.id_notificacion_programada) {
        this.resetForm();
      }

      await this.loadConfiguraciones();
      this.successMessage = 'La configuracion fue eliminada correctamente.';
      await this.alerts.success('Configuracion eliminada', this.successMessage);
    } catch {
      this.errorMessage = 'No se pudo eliminar la configuracion seleccionada.';
      await this.alerts.error('No se pudo eliminar', this.errorMessage);
    } finally {
      this.deletingId = null;
    }
  }

  async showConfiguracionDetail(configuracion: ConfiguracionNotificacionPago): Promise<void> {
    await this.alerts.detail(
      'Detalle de notificacion',
      [
        { label: 'Id notificacion programada', value: configuracion.id_notificacion_programada },
        { label: 'Id usuario', value: configuracion.id_usuario },
        { label: 'Nombre de la notificacion', value: configuracion.descripcion },
        { label: 'Prioridad', value: this.getPrioridadLabel(configuracion.prioridad) },
        { label: 'Fecha inicio', value: this.formatDateLabel(configuracion.fecha_inicio) },
        { label: 'Fecha fin', value: this.formatDateLabel(configuracion.fecha_fin) },
        {
          label: 'Dia pago programado',
          value: configuracion.dia_pago_programado,
        },
        {
          label: 'Quincena',
          value: this.getQuincenaLabel(configuracion),
        },
        {
          label: 'Id periodicidad',
          value: configuracion.id_periodicidad,
        },
        {
          label: 'Nombre periodicidad',
          value: this.getPeriodicidadLabel(configuracion),
        },
        {
          label: 'Codigo',
          value: configuracion.periodicidad?.codigo || 'Sin codigo',
        },
        {
          label: 'Descripcion periodicidad',
          value: configuracion.periodicidad?.descripcion || 'Sin descripcion',
        },
        {
          label: 'Estado',
          value: this.getEstadoLabel(configuracion.estado),
        },
        {
          label: 'Fecha creacion',
          value: this.formatTimestampLabel(configuracion.fecha_creacion),
        },
        {
          label: 'Fecha actualizacion',
          value: this.formatTimestampLabel(configuracion.fecha_actualizacion),
        },
      ],
      {
        subtitle: `Configuracion #${configuracion.id_notificacion_programada}`,
        width: '48rem',
      },
    );
  }

  cancelEdit(): void {
    this.successMessage = '';
    this.errorMessage = this.periodicidadesDisponibles ? '' : this.errorMessage;
    this.resetForm();
  }

  trackConfiguracion(index: number, configuracion: ConfiguracionNotificacionPago): number {
    return configuracion.id_notificacion_programada;
  }

  getPeriodicidadLabel(configuracion: ConfiguracionNotificacionPago): string {
    return configuracion.periodicidad?.nombre_periodicidad || 'No definida';
  }

  getPeriodicidadDescription(periodicidad: PeriodicidadCatalogo | null): string {
    if (!periodicidad) {
      return 'Sin descripcion disponible.';
    }

    if (this.isQuincenalPeriodicidad(periodicidad)) {
      return 'Se ejecuta el dia 15 y el ultimo dia de cada mes.';
    }

    return periodicidad.descripcion || 'Sin descripcion disponible.';
  }

  getFrecuenciaLabel(configuracion: ConfiguracionNotificacionPago): string {
    if (this.isQuincenalPeriodicidad(configuracion.periodicidad, configuracion.id_periodicidad)) {
      return '15 y ultimo dia del mes';
    }

    return `Dia ${configuracion.dia_pago_programado}`;
  }

  getQuincenaLabel(configuracion: ConfiguracionNotificacionPago): string {
    if (this.isQuincenalPeriodicidad(configuracion.periodicidad, configuracion.id_periodicidad)) {
      return 'Primera y segunda quincena';
    }

    const day = Number(configuracion.dia_pago_programado);
    if (!Number.isInteger(day) || day < 1 || day > 31) {
      return 'Sin quincena definida';
    }

    return day >= 15 ? 'Primera quincena' : 'Segunda quincena';
  }

  getVigenciaLabel(configuracion: ConfiguracionNotificacionPago): string {
    return `${this.formatDateLabel(configuracion.fecha_inicio)} a ${this.formatDateLabel(configuracion.fecha_fin)}`;
  }

  getPrioridadLabel(prioridad: PrioridadNotificacion): string {
    switch (prioridad) {
      case 'alta':
        return 'Alta';
      case 'media':
        return 'Media';
      default:
        return 'Baja';
    }
  }

  getPrioridadTone(prioridad: PrioridadNotificacion): 'high' | 'medium' | 'low' {
    switch (prioridad) {
      case 'alta':
        return 'high';
      case 'media':
        return 'medium';
      default:
        return 'low';
    }
  }

  formatTimestampLabel(value: string | Date | null | undefined): string {
    if (!value) {
      return 'Sin fecha disponible';
    }

    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? 'Sin fecha disponible' : this.dateTimeFormatter.format(parsed);
  }

  formatDateLabel(value: string | null | undefined): string {
    const parsed = this.parseDateOnly(value);
    return parsed ? this.dateFormatter.format(parsed) : 'Sin fecha valida';
  }

  getEstadoLabel(estado: boolean): string {
    return estado ? 'Activo' : 'Inactivo';
  }

  getEstadoTone(estado: boolean): 'high' | 'low' {
    return estado ? 'low' : 'high';
  }

  getCatalogStateLabel(estado: boolean): string {
    return estado ? 'Activa' : 'Inactiva';
  }

  private toDateInputValue(date: Date): string {
    return formatDisplayDate(date);
  }

  private normalizeDescripcion(value: string | null | undefined): string {
    return (value ?? '').toUpperCase();
  }

  private normalizeDateInput(value: string | null | undefined): string {
    const digits = (value ?? '').replace(/\D/g, '').slice(0, 8);

    if (digits.length <= 2) {
      return digits;
    }

    if (digits.length <= 4) {
      return `${digits.slice(0, 2)}/${digits.slice(2)}`;
    }

    return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
  }

  private isCompleteDateInput(value: string | null | undefined): boolean {
    return DISPLAY_DATE_PATTERN.test((value ?? '').trim()) && !!parseSupportedDate(value);
  }

  private toDisplayDateValue(value: string | null | undefined): string {
    const parsed = parseSupportedDate(value);
    return parsed ? formatDisplayDate(parsed) : '';
  }

  private toApiDateValue(value: string | null | undefined): string {
    const parsed = parseSupportedDate(value);
    return parsed ? formatApiDate(parsed) : '';
  }

  private getDefaultEndDate(fechaInicio: string): string {
    const fechaBase = this.parseDateOnly(fechaInicio) ?? this.today;
    return this.toDateInputValue(
      new Date(fechaBase.getFullYear() + 1, fechaBase.getMonth(), fechaBase.getDate()),
    );
  }

  private resolveDiaPagoProgramado(periodicidad: PeriodicidadCatalogo): number {
    if (this.isQuincenalPeriodicidad(periodicidad)) {
      return 15;
    }

    return Number(this.notificacionForm.value.dia_pago_programado ?? 0);
  }

  private applyPeriodicidadRules(): void {
    if (!this.isSelectedPeriodicidadQuincenal) {
      return;
    }

    const diaControl = this.notificacionForm.controls.dia_pago_programado;
    if (diaControl.value !== 15) {
      diaControl.setValue(15);
    }
  }

  private buildPeriodicidadOptions(periodicidades: PeriodicidadCatalogo[]): PeriodicidadCatalogo[] {
    const merged = [...periodicidades];

    if (!merged.some((item) => this.isQuincenalPeriodicidad(item))) {
      merged.push(QUINCENAL_FALLBACK);
    }

    return merged.sort((a, b) => a.id_periodicidad - b.id_periodicidad);
  }

  private mergePeriodicidadesFromConfiguraciones(): void {
    for (const configuracion of this.configuraciones) {
      this.ensurePeriodicidadOption(configuracion.periodicidad);
    }

    this.periodicidadOptions = [...this.periodicidadOptions].sort(
      (a, b) => a.id_periodicidad - b.id_periodicidad,
    );
  }

  private ensurePeriodicidadOption(periodicidad: PeriodicidadCatalogo | null): void {
    if (!periodicidad) {
      return;
    }

    const exists = this.periodicidadOptions.some(
      (item) => item.id_periodicidad === periodicidad.id_periodicidad,
    );

    if (!exists) {
      this.periodicidadOptions = [...this.periodicidadOptions, periodicidad];
    }
  }

  private isQuincenalPeriodicidad(
    periodicidad: PeriodicidadCatalogo | null | undefined,
    fallbackId?: number | null,
  ): boolean {
    const codigo = (periodicidad?.codigo ?? '').trim().toLowerCase();
    return codigo === 'quincenal' || fallbackId === 4 || periodicidad?.id_periodicidad === 4;
  }

  private getDefaultPeriodicidadId(): number | null {
    const mensual = this.periodicidadOptions.find((item) => {
      const codigo = (item.codigo ?? '').trim().toLowerCase();
      const nombre = (item.nombre_periodicidad ?? '').trim().toLowerCase();

      return codigo === 'mes' || codigo === 'mensual' || nombre === 'mes' || nombre === 'mensual';
    });

    return mensual?.id_periodicidad ?? this.periodicidadOptions[0]?.id_periodicidad ?? null;
  }

  private parseDateOnly(value: string | null | undefined): Date | null {
    return parseSupportedDate(value);
  }

  private resetForm(): void {
    this.editingId = null;
    this.notificacionForm.reset({
      descripcion: '',
      prioridad: 'media',
      fecha_inicio: this.todayDateInput,
      fecha_fin: this.defaultEndDateInput,
      dia_pago_programado: null,
      id_periodicidad: this.getDefaultPeriodicidadId(),
    });
    this.notificacionForm.markAsPristine();
    this.notificacionForm.markAsUntouched();
  }
}
