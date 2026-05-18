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
import { isAdminUser, loadUserProfile } from '../../shared/user-profile';

type TimelineTone = 'upcoming' | 'today' | 'expired';
type PrioridadOption = {
  value: PrioridadNotificacion;
  label: string;
};

const dateRangeValidator = (
  control: AbstractControl,
): ValidationErrors | null => {
  const fechaInicio = control.get('fecha_inicio')?.value as string | null | undefined;
  const fechaFin = control.get('fecha_fin')?.value as string | null | undefined;

  if (!fechaInicio || !fechaFin) {
    return null;
  }

  return fechaFin >= fechaInicio ? null : { invalidDateRange: true };
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
  private readonly relativeDayFormatter = new Intl.RelativeTimeFormat('es', {
    numeric: 'auto',
  });

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
    fecha_inicio: this.fb.control(this.todayDateInput, [Validators.required]),
    fecha_fin: this.fb.control(this.todayDateInput, [Validators.required]),
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
  }

  toggleMaintenanceMenu(): void {
    this.maintenanceOpen = !this.maintenanceOpen;
  }

  async loadConfiguraciones(): Promise<void> {
    if (this.periodicidadesDisponibles) {
      this.errorMessage = '';
    }

    try {
      this.configuraciones = await this.notificacionesService.loadConfiguracionesPago();
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
      this.periodicidadOptions = periodicidades;
      this.periodicidadesDisponibles = periodicidades.length > 0;

      if (periodicidades.length > 0) {
        this.notificacionForm.controls.id_periodicidad.setValue(
          periodicidades[0].id_periodicidad,
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
        'Completa descripcion, prioridad, fechas de inicio y fin, dia de pago entre 1 y 31 y periodicidad.',
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
        descripcion: this.notificacionForm.value.descripcion?.trim() ?? '',
        prioridad: this.notificacionForm.value.prioridad ?? 'media',
        fecha_inicio: this.notificacionForm.value.fecha_inicio ?? '',
        fecha_fin: this.notificacionForm.value.fecha_fin ?? '',
        dia_pago_programado: Number(this.notificacionForm.value.dia_pago_programado ?? 0),
        periodicidad: periodicidadSeleccionada,
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
    this.editingId = configuracion.id_notificacion_programada;
    this.notificacionForm.patchValue({
      descripcion: configuracion.descripcion,
      prioridad: configuracion.prioridad,
      fecha_inicio: configuracion.fecha_inicio,
      fecha_fin: configuracion.fecha_fin,
      dia_pago_programado: configuracion.dia_pago_programado,
      id_periodicidad: configuracion.id_periodicidad > 0 ? configuracion.id_periodicidad : null,
    });
    this.notificacionForm.markAsPristine();
    this.notificacionForm.markAsUntouched();
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
        { label: 'id_notificacion_programada', value: configuracion.id_notificacion_programada },
        { label: 'id_usuario', value: configuracion.id_usuario },
        { label: 'descripcion', value: configuracion.descripcion },
        { label: 'prioridad', value: configuracion.prioridad },
        { label: 'fecha_inicio', value: configuracion.fecha_inicio },
        { label: 'fecha_fin', value: configuracion.fecha_fin },
        {
          label: 'dia_pago_programado',
          value: configuracion.dia_pago_programado,
        },
        {
          label: 'id_periodicidad',
          value: configuracion.id_periodicidad,
        },
        {
          label: 'nombre_periodicidad',
          value: this.getPeriodicidadLabel(configuracion),
        },
        {
          label: 'codigo',
          value: configuracion.periodicidad_codigo,
        },
        {
          label: 'estado',
          value: this.getEstadoLabel(configuracion.estado),
        },
        {
          label: 'fecha_creacion',
          value: this.formatTimestampLabel(configuracion.fecha_creacion),
        },
        {
          label: 'fecha_actualizacion',
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
    return configuracion.periodicidad_nombre || 'No definida';
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

  formatDateLabel(value: string | null | undefined): string {
    const parsed = this.parseDateOnly(value);
    return parsed ? this.formatDateObject(parsed) : 'Sin fecha valida';
  }

  formatTimestampLabel(value: string | Date | null | undefined): string {
    if (!value) {
      return 'Sin fecha disponible';
    }

    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? 'Sin fecha disponible' : this.dateTimeFormatter.format(parsed);
  }

  getVigenciaLabel(configuracion: ConfiguracionNotificacionPago): string {
    return `${this.formatDateLabel(configuracion.fecha_inicio)} al ${this.formatDateLabel(configuracion.fecha_fin)}`;
  }

  getNextExecutionLabel(configuracion: ConfiguracionNotificacionPago): string {
    const nextDate = this.resolveNextExecution(configuracion);

    return nextDate ? this.formatDateObject(nextDate) : 'Sin fecha valida';
  }

  getRelativeExecutionLabel(configuracion: ConfiguracionNotificacionPago): string {
    const nextDate = this.resolveNextExecution(configuracion);

    if (!nextDate) {
      return 'Sin fecha valida';
    }

    const today = this.getToday();
    const msPerDay = 24 * 60 * 60 * 1000;
    const diffInDays = Math.round((nextDate.getTime() - today.getTime()) / msPerDay);

    return this.relativeDayFormatter.format(diffInDays, 'day');
  }

  getTimelineTone(configuracion: ConfiguracionNotificacionPago): TimelineTone {
    if (!configuracion.estado) {
      return 'expired';
    }

    const nextDate = this.resolveNextExecution(configuracion);

    if (!nextDate) {
      return 'expired';
    }

    const diffInDays = this.calculateDiffInDays(nextDate, this.getToday());

    if (diffInDays < 0) {
      return 'expired';
    }

    if (diffInDays === 0) {
      return 'today';
    }

    return 'upcoming';
  }

  getTimelineLabel(configuracion: ConfiguracionNotificacionPago): string {
    if (!configuracion.estado) {
      return 'Configuracion inactiva';
    }

    const tone = this.getTimelineTone(configuracion);

    if (tone === 'today') {
      return 'Programada para hoy';
    }

    if (tone === 'expired') {
      return configuracion.periodicidad_codigo === 'fecha-especifica'
        ? 'Fecha unica vencida'
        : 'Pendiente de nuevo ciclo';
    }

    return 'Proxima notificacion pendiente';
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

  private resetForm(): void {
    this.editingId = null;
    this.notificacionForm.reset({
      descripcion: '',
      prioridad: 'media',
      fecha_inicio: this.todayDateInput,
      fecha_fin: this.todayDateInput,
      dia_pago_programado: null,
      id_periodicidad: this.periodicidadOptions[0]?.id_periodicidad ?? null,
    });
    this.notificacionForm.markAsPristine();
    this.notificacionForm.markAsUntouched();
  }

  private resolveNextExecution(configuracion: ConfiguracionNotificacionPago): Date | null {
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

    if (configuracion.periodicidad_codigo === 'fecha-especifica') {
      return startDate;
    }

    if (configuracion.periodicidad_codigo === 'mensual') {
      const currentMonthDate = this.buildMonthlyOccurrence(referenceDate, day);
      const nextDate = currentMonthDate.getTime() >= referenceDate.getTime()
        ? currentMonthDate
        : this.buildMonthlyOccurrence(
            new Date(referenceDate.getFullYear(), referenceDate.getMonth() + 1, 1),
            day,
          );

      return nextDate.getTime() <= endDate.getTime() ? nextDate : null;
    }

    const anchorMonth = startDate.getMonth();
    const currentYearDate = this.buildYearlyOccurrence(
      referenceDate.getFullYear(),
      anchorMonth,
      day,
    );
    const nextDate =
      currentYearDate.getTime() >= referenceDate.getTime()
        ? currentYearDate
        : this.buildYearlyOccurrence(referenceDate.getFullYear() + 1, anchorMonth, day);

    return nextDate.getTime() <= endDate.getTime() ? nextDate : null;
  }

  private buildMonthlyOccurrence(referenceDate: Date, day: number): Date {
    const year = referenceDate.getFullYear();
    const month = referenceDate.getMonth();
    const maxDay = new Date(year, month + 1, 0).getDate();

    return new Date(year, month, Math.min(day, maxDay));
  }

  private buildYearlyOccurrence(year: number, month: number, day: number): Date {
    const maxDay = new Date(year, month + 1, 0).getDate();

    return new Date(year, month, Math.min(day, maxDay));
  }

  private getToday(): Date {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  }

  private calculateDiffInDays(left: Date, right: Date): number {
    const msPerDay = 24 * 60 * 60 * 1000;
    return Math.round((left.getTime() - right.getTime()) / msPerDay);
  }

  private formatDateObject(date: Date): string {
    return this.dateFormatter.format(date);
  }

  private parseDateOnly(value: string | null | undefined): Date | null {
    if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      return null;
    }

    const [year, month, day] = value.split('-').map((part) => Number(part));
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
  }

  private toDateInputValue(date: Date): string {
    const year = date.getFullYear();
    const month = `${date.getMonth() + 1}`.padStart(2, '0');
    const day = `${date.getDate()}`.padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
}
