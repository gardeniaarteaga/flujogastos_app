import { NgClass, NgFor, NgIf } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { ChangeDetectorRef, Component, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { finalize, firstValueFrom, timeout } from 'rxjs';

import { apiUrl } from '../../shared/config/api.config';

type Estado = 'activo' | 'inactivo';

interface TipoEntidad {
  id_tipo_entidad: number;
  descripcion: string;
  estado: boolean;
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
  ],
  templateUrl: './tipo-entidad.page.new.html',
  styleUrl: './tipo-entidad.page.css',
})
export class TipoEntidadPage {
  private readonly fb = inject(FormBuilder);
  private readonly http = inject(HttpClient);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly apiUrl = apiUrl('tipo-entidad');

  tiposEntidad: TipoEntidad[] = [];
  resumenOpen = true;
  maintenanceOpen = true;
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

  toggleMaintenanceMenu(): void {
    this.maintenanceOpen = !this.maintenanceOpen;
    if (this.maintenanceOpen) {
      this.resumenOpen = false;
    }
  }

  get isEditing(): boolean {
    return this.editingId !== null;
  }

  async loadTiposEntidad(): Promise<void> {
    this.loading = true;
    this.errorMessage = '';

    try {
      this.tiposEntidad = await firstValueFrom(
        this.http.get<TipoEntidad[]>(this.apiUrl).pipe(timeout(10000)),
      );
    } catch (error) {
      this.tiposEntidad = [];
      this.errorMessage = 'No se pudieron cargar los tipos de entidad.';
      console.error(error);
    } finally {
      this.loading = false;
      this.cdr.detectChanges();
    }
  }

  editTipoEntidad(tipoEntidad: TipoEntidad): void {
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
          this.http.patch(`${this.apiUrl}/${currentId}`, payload).pipe(timeout(10000)),
        );
        this.successMessage = 'Tipo de entidad actualizado correctamente.';
      } else {
        await firstValueFrom(this.http.post(this.apiUrl, payload).pipe(timeout(10000)));
        this.successMessage = 'Tipo de entidad guardado correctamente.';
      }

      this.resetForm();
      await this.loadTiposEntidad();
    } catch (error) {
      this.errorMessage = 'No se pudo guardar el tipo de entidad.';
      console.error(error);
    } finally {
      this.saving = false;
    }
  }

  async removeTipoEntidad(tipoEntidad: TipoEntidad): Promise<void> {
    const confirmed = window.confirm(
      `Se eliminara el tipo de entidad "${tipoEntidad.descripcion}". Deseas continuar?`,
    );

    if (!confirmed) {
      return;
    }

    this.deletingId = tipoEntidad.id_tipo_entidad;
    this.successMessage = '';
    this.errorMessage = '';
    const deletingId = tipoEntidad.id_tipo_entidad;
    const fallbackReset = window.setTimeout(() => {
      if (this.deletingId === deletingId) {
        this.deletingId = null;
        this.errorMessage =
          'La eliminacion tardo demasiado. Revisa si el backend sigue activo y vuelve a intentarlo.';
      }
    }, 12000);

    try {
      await firstValueFrom(
        this.http.delete(`${this.apiUrl}/${tipoEntidad.id_tipo_entidad}`).pipe(
          timeout(10000),
          finalize(() => window.clearTimeout(fallbackReset)),
        ),
      );

      this.tiposEntidad = this.tiposEntidad.filter(
        (item) => item.id_tipo_entidad !== tipoEntidad.id_tipo_entidad,
      );

      if (this.editingId === tipoEntidad.id_tipo_entidad) {
        this.resetForm();
      }

      this.successMessage = 'Tipo de entidad eliminado correctamente.';
    } catch (error) {
      this.errorMessage = 'No se pudo eliminar el tipo de entidad.';
      console.error(error);
    } finally {
      this.deletingId = null;
    }
  }
}
