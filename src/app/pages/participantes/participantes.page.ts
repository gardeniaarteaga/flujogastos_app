import { DatePipe, NgClass, NgFor, NgIf } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { ChangeDetectorRef, Component, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { firstValueFrom, timeout } from 'rxjs';

import { apiUrl } from '../../shared/config/api.config';
import { MaintenanceActionsComponent } from '../../shared/maintenance-actions/maintenance-actions.component';
import { SessionStripComponent } from '../../shared/session-strip/session-strip.component';
import { SweetAlertService } from '../../shared/services/sweet-alert.service';
import { getCurrentUserId, isAdminUser } from '../../shared/user-profile';

type Estado = 'activo' | 'inactivo';

interface Participante {
  id_participante: number;
  id_usuario: number;
  id_usuario_relacionado?: number | null;
  id_usuario_titular?: number | null;
  nombre_participante: string;
  correo_electronico?: string | null;
  celular?: string | null;
  porcentaje_participacion: number | null;
  estado: string;
  fecha_creacion: string;
  es_predeterminada?: boolean;
  puede_editar?: boolean;
  puede_eliminar?: boolean;
}

interface ParticipantePayload {
  nombre_participante: string;
  correo_electronico?: string | null;
  celular?: string | null;
  porcentaje_participacion?: number | null;
  estado: 'ACTIVO' | 'INACTIVO';
}

@Component({
  selector: 'app-participantes-page',
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
  templateUrl: './participantes.page.html',
  styleUrl: './participantes.page.css',
})
export class ParticipantesPage {
  private readonly fb = inject(FormBuilder);
  private readonly http = inject(HttpClient);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly alerts = inject(SweetAlertService);
  private readonly apiUrl = apiUrl('participantes');
  private readonly currentUserId = getCurrentUserId();
  readonly pageSize = 10;
  get isAdminSession(): boolean {
    return isAdminUser();
  }

  participantes: Participante[] = [];
  currentPage = 1;
  sidebarCollapsed = false;
  resumenOpen = false;
  transactionsOpen = false;
  maintenanceOpen = true;
  reportesOpen = false;
  loading = false;
  saving = false;
  deletingId: number | null = null;
  editingId: number | null = null;
  errorMessage = '';
  successMessage = '';
  readonly today = new Date();

  readonly participanteForm = this.fb.group({
    nombre_participante: ['', [Validators.required, Validators.maxLength(150)]],
    correo_electronico: ['', [Validators.email, Validators.maxLength(255)]],
    celular: ['', [Validators.maxLength(9)]],
    porcentaje_participacion: [null as number | null, [Validators.min(1), Validators.max(100)]],
    estado: ['activo' as Estado, [Validators.required]],
  });

  constructor() {
    void this.loadParticipantes();
  }

  get isResumenMenuOpen(): boolean {
    return false;
  }

  toggleTransactionsMenu(): void {
    this.transactionsOpen = !this.transactionsOpen;
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

  get isEditing(): boolean {
    return this.editingId !== null;
  }

  get totalPages(): number {
    return Math.max(1, Math.ceil(this.participantes.length / this.pageSize));
  }

  get paginatedParticipantes(): Participante[] {
    const startIndex = (this.currentPage - 1) * this.pageSize;
    return this.participantes.slice(startIndex, startIndex + this.pageSize);
  }

  get pageNumbers(): number[] {
    return Array.from({ length: this.totalPages }, (_, index) => index + 1);
  }

  get porcentajeParticipacionDisplayValue(): string {
    const value = this.participanteForm.controls.porcentaje_participacion.value;
    return value === null || value === undefined ? '' : String(value);
  }

  isParticipanteAsociado(participante: Participante | null | undefined): boolean {
    return Boolean(
      participante?.id_usuario_relacionado ?? participante?.id_usuario_titular ?? null,
    );
  }

  async loadParticipantes(): Promise<void> {
    this.loading = true;
    this.errorMessage = '';

    try {
      const participantes = await firstValueFrom(
        this.http
          .get<Participante[]>(this.apiUrl, {
            params: { id_usuario: this.currentUserId },
          })
          .pipe(timeout(10000)),
      );
      this.participantes = this.filterVisibleParticipantes(participantes);
      this.currentPage = 1;
    } catch (error) {
      this.participantes = [];
      this.currentPage = 1;
      this.errorMessage = this.getErrorMessage(
        error,
        'No se pudieron cargar los participantes.',
      );
      await this.alerts.error('Error al cargar', this.errorMessage);
      console.error(error);
    } finally {
      this.loading = false;
      this.cdr.detectChanges();
    }
  }

  editParticipante(participante: Participante): void {
    if (!this.canManageParticipante(participante)) {
      this.errorMessage = 'No tienes permisos para editar este participante.';
      void this.alerts.warning('Accion no permitida', this.errorMessage);
      return;
    }

    this.editingId = participante.id_participante;
    this.successMessage = '';
    this.errorMessage = '';
    this.participanteForm.reset({
      nombre_participante: participante.nombre_participante,
      correo_electronico: participante.correo_electronico ?? '',
      celular: this.formatCelular(participante.celular),
      porcentaje_participacion: participante.porcentaje_participacion,
      estado: participante.estado === 'INACTIVO' ? 'inactivo' : 'activo',
    });
  }

  resetForm(): void {
    this.editingId = null;
    this.participanteForm.reset({
      nombre_participante: '',
      correo_electronico: '',
      celular: '',
      porcentaje_participacion: null,
      estado: 'activo',
    });
  }

  cancelEdit(): void {
    this.successMessage = '';
    this.errorMessage = '';
    this.resetForm();
  }

  onCelularInput(): void {
    const control = this.participanteForm.controls.celular;
    const formattedValue = this.formatCelular(control.value);

    if (control.value !== formattedValue) {
      control.setValue(formattedValue, { emitEvent: false });
    }
  }

  async onSubmit(): Promise<void> {
    this.successMessage = '';
    this.errorMessage = '';

    if (this.participanteForm.invalid) {
      this.participanteForm.markAllAsTouched();
      await this.alerts.warning(
        'Formulario incompleto',
        'Completa los campos obligatorios antes de continuar.',
      );
      return;
    }

    this.saving = true;
    const rawValue = this.participanteForm.getRawValue();
    const payload: ParticipantePayload = {
      nombre_participante: rawValue.nombre_participante?.trim() ?? '',
      correo_electronico: rawValue.correo_electronico?.trim().toLowerCase() || null,
      celular: this.normalizeCelularForStorage(rawValue.celular),
      estado: rawValue.estado === 'inactivo' ? 'INACTIVO' : 'ACTIVO',
    };

    if (rawValue.porcentaje_participacion !== null) {
      payload.porcentaje_participacion = rawValue.porcentaje_participacion;
    }

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
        this.successMessage = 'Participante actualizado correctamente.';
        await this.alerts.success('Participante actualizado', this.successMessage);
      } else {
        await firstValueFrom(
          this.http
            .post(this.apiUrl, payload, {
              params: { id_usuario: this.currentUserId },
            })
            .pipe(timeout(10000)),
        );
        this.successMessage = 'Participante guardado correctamente.';
        await this.alerts.success('Participante guardado', this.successMessage);
      }

      this.resetForm();
      await this.loadParticipantes();
    } catch (error) {
      this.errorMessage = this.getErrorMessage(error, 'No se pudo guardar el participante.');
      await this.alerts.error('No se pudo guardar', this.errorMessage);
      console.error(error);
    } finally {
      this.saving = false;
    }
  }

  async removeParticipante(participante: Participante): Promise<void> {
    if (!this.canDeleteParticipante(participante)) {
      this.errorMessage = 'No tienes permisos para eliminar este participante.';
      await this.alerts.warning('Accion no permitida', this.errorMessage);
      return;
    }

    const confirmed = await this.alerts.confirmDelete(
      'el participante',
      participante.nombre_participante,
    );

    if (!confirmed) {
      return;
    }

    this.deletingId = participante.id_participante;
    this.successMessage = '';
    this.errorMessage = '';

    try {
      await firstValueFrom(
        this.http
          .delete(`${this.apiUrl}/${participante.id_participante}`, {
            params: { id_usuario: this.currentUserId },
          })
          .pipe(timeout(10000)),
      );

      this.participantes = this.participantes.filter(
        (item) => item.id_participante !== participante.id_participante,
      );
      this.currentPage = Math.min(this.currentPage, this.totalPages);

      if (this.editingId === participante.id_participante) {
        this.resetForm();
      }

      this.successMessage = 'Participante eliminado correctamente.';
      await this.alerts.success('Participante eliminado', this.successMessage);
    } catch (error) {
      this.errorMessage = this.getErrorMessage(error, 'No se pudo eliminar el participante.');
      await this.alerts.error('No se pudo eliminar', this.errorMessage);
      console.error(error);
    } finally {
      this.deletingId = null;
    }
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

  canManageParticipante(participante: Participante): boolean {
    return participante.puede_editar ?? false;
  }

  canDeleteParticipante(participante: Participante): boolean {
    return participante.puede_eliminar ?? false;
  }

  isCurrentUserLinkedParticipante(participante: Participante): boolean {
    return participante.id_usuario_titular === this.currentUserId;
  }

  async showParticipanteDetail(participante: Participante): Promise<void> {
    await this.alerts.detail(
      'Detalle de participante',
      [
        { label: 'Nombre', value: participante.nombre_participante },
        { label: 'Correo electronico', value: participante.correo_electronico },
        { label: 'Celular', value: this.formatCelular(participante.celular) || '-' },
        {
          label: 'Participacion',
          value:
            participante.porcentaje_participacion !== null
              ? `${participante.porcentaje_participacion}%`
              : '-',
        },
        { label: 'Estado', value: participante.estado === 'ACTIVO' ? 'Activo' : 'Inactivo' },
        {
          label: 'Origen',
          value: participante.es_predeterminada ? 'Predeterminado' : 'Personalizado',
        },
        {
          label: 'Vinculo',
          value: this.isCurrentUserLinkedParticipante(participante)
            ? 'Titular'
            : (this.isParticipanteAsociado(participante) ? 'Asociado' : 'Personal'),
        },
        { label: 'Fecha creacion', value: participante.fecha_creacion.slice(0, 10) },
      ],
      {
        subtitle: `Participante #${participante.id_participante}`,
      },
    );
  }

  private filterVisibleParticipantes(participantes: Participante[]): Participante[] {
    const visibles = participantes.filter(
      (participante) =>
        !Boolean(participante.es_predeterminada) &&
        (participante.id_usuario_titular === this.currentUserId ||
          (participante.id_usuario === this.currentUserId &&
            participante.id_usuario_titular === null)),
    );

    return this.dedupeSystemUserParticipantes(visibles);
  }

  private dedupeSystemUserParticipantes(participantes: Participante[]): Participante[] {
    const participantesBySystemUser = new Map<number, Participante>();
    const participantesSinSistema: Participante[] = [];

    participantes.forEach((participante) => {
      const systemUserId =
        participante.id_usuario_titular ?? participante.id_usuario_relacionado ?? null;

      if (!systemUserId) {
        participantesSinSistema.push(participante);
        return;
      }

      const existingParticipante = participantesBySystemUser.get(systemUserId);

      if (!existingParticipante) {
        participantesBySystemUser.set(systemUserId, participante);
        return;
      }

      const currentIsLinked = participante.id_usuario_titular === systemUserId;
      const existingIsLinked = existingParticipante.id_usuario_titular === systemUserId;

      if (currentIsLinked && !existingIsLinked) {
        participantesBySystemUser.set(systemUserId, participante);
      }
    });

    return [
      ...participantesSinSistema,
      ...Array.from(participantesBySystemUser.values()),
    ].sort((left, right) => left.id_participante - right.id_participante);
  }

  formatCelular(value?: string | null): string {
    const digits = (value ?? '').replace(/\D/g, '').slice(0, 8);

    if (digits.length <= 4) {
      return digits;
    }

    return `${digits.slice(0, 4)}-${digits.slice(4)}`;
  }

  onPorcentajeParticipacionInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    const numericValue = input.value.replace(/[^0-9.]/g, '');

    if (!numericValue) {
      this.participanteForm.controls.porcentaje_participacion.setValue(null);
      input.value = '';
      return;
    }

    const parsedValue = Number(numericValue);
    this.participanteForm.controls.porcentaje_participacion.setValue(
      Number.isFinite(parsedValue) ? parsedValue : null,
    );
    input.value = Number.isFinite(parsedValue) ? numericValue : '';
  }

  onPorcentajeParticipacionBlur(): void {
    this.participanteForm.controls.porcentaje_participacion.markAsTouched();
  }

  private getErrorMessage(error: unknown, fallback: string): string {
    if (typeof error === 'object' && error !== null && 'error' in error) {
      const httpError = error as {
        error?: { message?: string | string[] } | string;
      };

      if (typeof httpError.error === 'string' && httpError.error.trim()) {
        return httpError.error;
      }

      if (
        typeof httpError.error === 'object' &&
        httpError.error !== null &&
        'message' in httpError.error
      ) {
        const message = httpError.error.message;
        if (Array.isArray(message) && message.length > 0) {
          return message.join(' ');
        }
        if (typeof message === 'string' && message.trim()) {
          return message;
        }
      }
    }

    return fallback;
  }

  private normalizeCelularForStorage(value?: string | null): string | null {
    const digits = (value ?? '').replace(/\D/g, '');
    return digits || null;
  }
}
