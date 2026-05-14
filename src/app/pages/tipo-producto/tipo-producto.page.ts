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

interface TipoProducto {
  id_tipo_producto: number;
  id_usuario: number;
  nombre_tipo: string;
  es_predeterminada?: boolean;
  puede_editar?: boolean;
  puede_eliminar?: boolean;
}

interface TipoProductoPayload {
  nombre_tipo: string;
}

@Component({
  selector: 'app-tipo-producto-page',
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
  templateUrl: './tipo-producto.page.html',
  styleUrl: './tipo-producto.page.css',
})
export class TipoProductoPage {
  private readonly fb = inject(FormBuilder);
  private readonly http = inject(HttpClient);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly alerts = inject(SweetAlertService);
  private readonly apiUrl = apiUrl('tipo-producto');
  private readonly currentUserId = getCurrentUserId();
  readonly pageSize = 10;

  get isAdminSession(): boolean {
    return isAdminUser();
  }

  tiposProducto: TipoProducto[] = [];
  currentPage = 1;
  transactionsOpen = false;
  maintenanceOpen = false;
  loading = false;
  saving = false;
  deletingId: number | null = null;
  editingId: number | null = null;
  errorMessage = '';
  successMessage = '';

  readonly tipoProductoForm = this.fb.group({
    nombre_tipo: ['', [Validators.required, Validators.maxLength(100)]],
  });

  constructor() {
    void this.loadTiposProducto();
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

  get totalPages(): number {
    return Math.max(1, Math.ceil(this.tiposProducto.length / this.pageSize));
  }

  get paginatedTiposProducto(): TipoProducto[] {
    const startIndex = (this.currentPage - 1) * this.pageSize;
    return this.tiposProducto.slice(startIndex, startIndex + this.pageSize);
  }

  get pageNumbers(): number[] {
    return Array.from({ length: this.totalPages }, (_, index) => index + 1);
  }

  async loadTiposProducto(): Promise<void> {
    this.loading = true;
    this.errorMessage = '';

    try {
      this.tiposProducto = await firstValueFrom(
        this.http
          .get<TipoProducto[]>(this.apiUrl, { params: { id_usuario: this.currentUserId } })
          .pipe(timeout(10000)),
      );
      this.currentPage = 1;
    } catch (error) {
      this.tiposProducto = [];
      this.currentPage = 1;
      this.errorMessage = 'No se pudieron cargar los tipos de producto.';
      await this.alerts.error('Error al cargar', this.errorMessage);
      console.error(error);
    } finally {
      this.loading = false;
      this.cdr.detectChanges();
    }
  }

  editTipoProducto(tipoProducto: TipoProducto): void {
    if (!this.canEditTipoProducto(tipoProducto)) {
      this.errorMessage = 'No tienes permisos para editar este tipo de producto.';
      void this.alerts.warning('Accion no permitida', this.errorMessage);
      return;
    }

    this.editingId = tipoProducto.id_tipo_producto;
    this.successMessage = '';
    this.errorMessage = '';
    this.tipoProductoForm.reset({
      nombre_tipo: tipoProducto.nombre_tipo,
    });
  }

  resetForm(): void {
    this.editingId = null;
    this.tipoProductoForm.reset({
      nombre_tipo: '',
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

    if (this.tipoProductoForm.invalid) {
      this.tipoProductoForm.markAllAsTouched();
      await this.alerts.warning(
        'Formulario incompleto',
        'Completa los campos obligatorios antes de continuar.',
      );
      return;
    }

    this.saving = true;

    const payload: TipoProductoPayload = {
      nombre_tipo: this.tipoProductoForm.value.nombre_tipo?.trim() ?? '',
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
        this.successMessage = 'Tipo de producto actualizado correctamente.';
        await this.alerts.success('Tipo de producto actualizado', this.successMessage);
      } else {
        await firstValueFrom(
          this.http
            .post(this.apiUrl, payload, { params: { id_usuario: this.currentUserId } })
            .pipe(timeout(10000)),
        );
        this.successMessage = 'Tipo de producto guardado correctamente.';
        await this.alerts.success('Tipo de producto guardado', this.successMessage);
      }

      this.resetForm();
      await this.loadTiposProducto();
    } catch (error) {
      this.errorMessage = 'No se pudo guardar el tipo de producto.';
      await this.alerts.error('No se pudo guardar', this.errorMessage);
      console.error(error);
    } finally {
      this.saving = false;
    }
  }

  async removeTipoProducto(tipoProducto: TipoProducto): Promise<void> {
    if (!this.canDeleteTipoProducto(tipoProducto)) {
      this.errorMessage = 'No tienes permisos para eliminar este tipo de producto.';
      await this.alerts.warning('Accion no permitida', this.errorMessage);
      return;
    }

    const confirmed = await this.alerts.confirmDelete(
      'el tipo de producto',
      tipoProducto.nombre_tipo,
    );

    if (!confirmed) {
      return;
    }

    this.deletingId = tipoProducto.id_tipo_producto;
    this.successMessage = '';
    this.errorMessage = '';

    try {
      await firstValueFrom(
        this.http
          .delete(`${this.apiUrl}/${tipoProducto.id_tipo_producto}`, {
            params: { id_usuario: this.currentUserId },
          })
          .pipe(timeout(10000)),
      );

      this.tiposProducto = this.tiposProducto.filter(
        (item) => item.id_tipo_producto !== tipoProducto.id_tipo_producto,
      );
      this.currentPage = Math.min(this.currentPage, this.totalPages);

      if (this.editingId === tipoProducto.id_tipo_producto) {
        this.resetForm();
      }

      this.successMessage = 'Tipo de producto eliminado correctamente.';
      await this.alerts.success('Tipo de producto eliminado', this.successMessage);
    } catch (error) {
      this.errorMessage = 'No se pudo eliminar el tipo de producto.';
      await this.alerts.error('No se pudo eliminar', this.errorMessage);
      console.error(error);
    } finally {
      this.deletingId = null;
    }
  }

  canEditTipoProducto(tipoProducto: TipoProducto): boolean {
    if (this.isAdminSession) {
      return true;
    }

    return tipoProducto.puede_editar ?? tipoProducto.id_usuario === this.currentUserId;
  }

  canDeleteTipoProducto(tipoProducto: TipoProducto): boolean {
    if (this.isAdminSession) {
      return true;
    }

    return tipoProducto.puede_eliminar ?? tipoProducto.id_usuario === this.currentUserId;
  }

  isPredeterminadoTipoProducto(tipoProducto: TipoProducto): boolean {
    return Boolean(tipoProducto.es_predeterminada);
  }

  async showTipoProductoDetail(tipoProducto: TipoProducto): Promise<void> {
    await this.alerts.detail(
      'Detalle de tipo de producto',
      [
        { label: 'Nombre', value: tipoProducto.nombre_tipo },
        {
          label: 'Origen',
          value: this.isPredeterminadoTipoProducto(tipoProducto)
            ? 'Predeterminada'
            : 'Personalizada',
        },
      ],
      {
        subtitle: `Tipo de producto #${tipoProducto.id_tipo_producto}`,
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
