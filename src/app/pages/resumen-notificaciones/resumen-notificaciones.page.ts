import { NgClass, NgFor, NgIf } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink, RouterLinkActive } from '@angular/router';

import { SessionStripComponent } from '../../shared/session-strip/session-strip.component';
import { SweetAlertService } from '../../shared/services/sweet-alert.service';
import {
  ConfiguracionNotificacionPago,
  NotificacionesService,
  PeriodicidadCatalogo,
} from '../../shared/services/notificaciones.service';
import { isAdminUser, loadUserProfile } from '../../shared/user-profile';

type TimelineTone = 'upcoming' | 'today' | 'expired';

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
  readonly userProfile = loadUserProfile();
  configuraciones: ConfiguracionNotificacionPago[] = [];
  periodicidadOptions: PeriodicidadCatalogo[] = [];

  readonly notificacionForm = this.fb.group({
    descripcion: this.fb.control('', [Validators.required, Validators.maxLength(120)]),
    dia_pago_programado: this.fb.control<number | null>(null, [
      Validators.required,
      Validators.min(1),
      Validators.max(31),
    ]),
    id_periodicidad: this.fb.control<number | null>(null, [Validators.required]),
  });

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
        'Completa descripcion, dia de pago entre 1 y 31 y periodicidad.',
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
        { label: 'Descripcion', value: configuracion.descripcion },
        {
          label: 'Dia de pago programado',
          value: configuracion.dia_pago_programado,
        },
        {
          label: 'Periodicidad',
          value: this.getPeriodicidadLabel(configuracion),
        },
        { label: 'Proxima ejecucion', value: this.getNextExecutionLabel(configuracion) },
        { label: 'Estado', value: this.getTimelineLabel(configuracion) },
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

  private resetForm(): void {
    this.editingId = null;
    this.notificacionForm.reset({
      descripcion: '',
      dia_pago_programado: null,
      id_periodicidad: this.periodicidadOptions[0]?.id_periodicidad ?? null,
    });
    this.notificacionForm.markAsPristine();
    this.notificacionForm.markAsUntouched();
  }

  private resolveNextExecution(configuracion: ConfiguracionNotificacionPago): Date | null {
    const today = this.getToday();
    const day = configuracion.dia_pago_programado;

    if (configuracion.periodicidad_codigo === 'fecha-especifica') {
      return this.buildMonthlyOccurrence(today, day);
    }

    if (configuracion.periodicidad_codigo === 'mensual') {
      const currentMonthDate = this.buildMonthlyOccurrence(today, day);
      return currentMonthDate.getTime() >= today.getTime()
        ? currentMonthDate
        : this.buildMonthlyOccurrence(new Date(today.getFullYear(), today.getMonth() + 1, 1), day);
    }

    const currentYearDate = this.buildYearlyOccurrence(today.getFullYear(), today.getMonth(), day);

    return currentYearDate.getTime() >= today.getTime()
      ? currentYearDate
      : this.buildYearlyOccurrence(today.getFullYear() + 1, today.getMonth(), day);
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
}
