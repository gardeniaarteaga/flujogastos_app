import { NgClass, NgFor, NgIf } from '@angular/common';
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

interface TipoEntidad {
  id_tipo_entidad: number;
  id_usuario?: number | null;
  descripcion: string;
  estado: boolean;
  es_predeterminada?: boolean;
  puede_editar?: boolean;
  puede_eliminar?: boolean;
}

interface TipoEntidadPayload {
  descripcion: string;
  estado: boolean;
}

@Component({
  selector: 'app-tipo-entidad-page',
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
  templateUrl: './tipo-entidad.page.html',
  styleUrl: './tipo-entidad.tail.css',
})
export class TipoEntidadPage {
  private readonly fb = inject(FormBuilder);
  private readonly http = inject(HttpClient);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly alerts = inject(SweetAlertService);
  private readonly apiUrl = apiUrl('tipo-entidad');
  private readonly currentUserId = getCurrentUserId();
  readonly pageSize = 10;
  get isAdminSession(): boolean {
    return isAdminUser();
  }

  tiposEntidad: TipoEntidad[] = [];
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

  readonly tipoEntidadForm = this.fb.group({
    descripcion: ['', [Validators.required, Validators.maxLength(100)]],
    estado: ['activo' as Estado, [Validators.required]],
  });

  constructor() {
    void this.loadTiposEntidad();
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
    return Math.max(1, Math.ceil(this.tiposEntidad.length / this.pageSize));
  }

  get paginatedTiposEntidad(): TipoEntidad[] {
    const startIndex = (this.currentPage - 1) * this.pageSize;
    return this.tiposEntidad.slice(startIndex, startIndex + this.pageSize);
  }

  get pageNumbers(): number[] {
    return Array.from({ length: this.totalPages }, (_, index) => index + 1);
  }

  async loadTiposEntidad(): Promise<void> {
    this.loading = true;
    this.errorMessage = '';

    try {
      this.tiposEntidad = await firstValueFrom(
        this.http
          .get<TipoEntidad[]>(this.apiUrl, { params: { id_usuario: this.currentUserId } })
          .pipe(timeout(10000)),
      );
      this.currentPage = 1;
    } catch (error) {
      this.tiposEntidad = [];
      this.currentPage = 1;
      this.errorMessage = 'No se pudieron cargar los tipos de entidad.';
      await this.alerts.error('Error al cargar', this.errorMessage);
      console.error(error);
    } finally {
      this.loading = false;
      this.cdr.detectChanges();
    }
  }

  editTipoEntidad(tipoEntidad: TipoEntidad): void {
    if (!this.canEditTipoEntidad(tipoEntidad)) {
      this.errorMessage = 'No tienes permisos para editar este tipo de entidad.';
      void this.alerts.warning('Accion no permitida', this.errorMessage);
      return;
    }

    this.editingId = tipoEntidad.id_tipo_entidad;
    this.successMessage = '';
    this.errorMessage = '';
    this.tipoEntidadForm.reset({
      descripcion: tipoEntidad.descripcion,
      estado: tipoEntidad.estado ? 'activo' : 'inactivo',
    });
  }

  resetForm(): void {
    this.editingId = null;
    this.tipoEntidadForm.reset({
      descripcion: '',
      estado: 'activo',
    });
  }

  cancelEdit(): void {
    this.successMessage = '';
    this.errorMessage = '';
    this.resetForm();
  }

  async onSubmit(): Promise<void> {
    this.successMessage = '';
    this.errorMessage = '';

    if (this.tipoEntidadForm.invalid) {
      this.tipoEntidadForm.markAllAsTouched();
      await this.alerts.warning(
        'Formulario incompleto',
        'Completa los campos obligatorios antes de continuar.',
      );
      return;
    }

    this.saving = true;

    const payload: TipoEntidadPayload = {
      descripcion: this.tipoEntidadForm.value.descripcion?.trim() ?? '',
      estado: this.tipoEntidadForm.value.estado === 'activo',
    };

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
        this.successMessage = 'Tipo de entidad actualizado correctamente.';
        await this.alerts.success('Tipo de entidad actualizado', this.successMessage);
      } else {
        await firstValueFrom(
          this.http
            .post(this.apiUrl, payload, { params: { id_usuario: this.currentUserId } })
            .pipe(timeout(10000)),
        );
        this.successMessage = 'Tipo de entidad guardado correctamente.';
        await this.alerts.success('Tipo de entidad guardado', this.successMessage);
      }

      this.resetForm();
      await this.loadTiposEntidad();
    } catch (error) {
      this.errorMessage = 'No se pudo guardar el tipo de entidad.';
      await this.alerts.error('No se pudo guardar', this.errorMessage);
      console.error(error);
    } finally {
      this.saving = false;
    }
  }

  async removeTipoEntidad(tipoEntidad: TipoEntidad): Promise<void> {
    if (!this.canDeleteTipoEntidad(tipoEntidad)) {
      this.errorMessage = 'No tienes permisos para eliminar este tipo de entidad.';
      await this.alerts.warning('Accion no permitida', this.errorMessage);
      return;
    }

    const confirmed = await this.alerts.confirmDelete(
      'el tipo de entidad',
      tipoEntidad.descripcion,
    );

    if (!confirmed) {
      return;
    }

    this.deletingId = tipoEntidad.id_tipo_entidad;
    this.successMessage = '';
    this.errorMessage = '';

    try {
      await firstValueFrom(
        this.http
          .delete(`${this.apiUrl}/${tipoEntidad.id_tipo_entidad}`, {
            params: { id_usuario: this.currentUserId },
          })
          .pipe(timeout(10000)),
      );

      this.tiposEntidad = this.tiposEntidad.filter(
        (item) => item.id_tipo_entidad !== tipoEntidad.id_tipo_entidad,
      );
      this.currentPage = Math.min(this.currentPage, this.totalPages);

      if (this.editingId === tipoEntidad.id_tipo_entidad) {
        this.resetForm();
      }

      this.successMessage = 'Tipo de entidad eliminado correctamente.';
      await this.alerts.success('Tipo de entidad eliminado', this.successMessage);
    } catch (error) {
      this.errorMessage = 'No se pudo eliminar el tipo de entidad.';
      await this.alerts.error('No se pudo eliminar', this.errorMessage);
      console.error(error);
    } finally {
      this.deletingId = null;
    }
  }

  canDeleteTipoEntidad(tipoEntidad: TipoEntidad): boolean {
    if (this.isAdminSession) {
      return true;
    }

    if (typeof tipoEntidad.puede_eliminar === 'boolean') {
      return tipoEntidad.puede_eliminar;
    }

    return true;
  }

  canEditTipoEntidad(tipoEntidad: TipoEntidad): boolean {
    if (this.isAdminSession) {
      return true;
    }

    if (typeof tipoEntidad.puede_editar === 'boolean') {
      return tipoEntidad.puede_editar;
    }

    return true;
  }

  isPredeterminadaTipoEntidad(tipoEntidad: TipoEntidad): boolean {
    return Boolean(tipoEntidad.es_predeterminada);
  }

  async showTipoEntidadDetail(tipoEntidad: TipoEntidad): Promise<void> {
    await this.alerts.detail(
      'Detalle de tipo de entidad',
      [
        { label: 'Descripcion', value: tipoEntidad.descripcion },
        { label: 'Estado', value: tipoEntidad.estado ? 'Activo' : 'Inactivo' },
        {
          label: 'Origen',
          value: this.isPredeterminadaTipoEntidad(tipoEntidad)
            ? 'Predeterminada'
            : 'Personalizada',
        },
      ],
      {
        subtitle: `Tipo de entidad #${tipoEntidad.id_tipo_entidad}`,
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
}
