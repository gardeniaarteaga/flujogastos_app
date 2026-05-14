import { DatePipe, NgClass, NgFor, NgIf } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Component, inject } from '@angular/core';
import { FormBuilder, FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { finalize, firstValueFrom, timeout } from 'rxjs';

import { apiUrl } from '../../shared/config/api.config';

type Estado = 'activo' | 'inactivo';

interface TipoEntidad {
  id_tipo_entidad: number;
  descripcion: string;
  estado: boolean;
}

interface EntidadFinanciera {
  id_entidad: number;
  nombre_entidad: string;
  tipo_entidad: number | null;
  pais: string | null;
  sitio_web: string | null;
  telefono_contacto: string | null;
  estado: boolean;
  fecha_creacion: string;
  tipoEntidad?: TipoEntidad | null;
}

interface EntidadFinancieraPayload {
  nombre_entidad: string;
  tipo_entidad: number | null;
  pais?: string;
  sitio_web?: string;
  telefono_contacto?: string;
  estado: boolean;
}

@Component({
  selector: 'app-entidades-financieras-page',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    RouterLinkActive,
    NgIf,
    NgFor,
    NgClass,
    DatePipe,
  ],
  templateUrl: './entidades-financieras.page.new.html',
  styleUrl: './entidades-financieras.page.css',
})
export class EntidadesFinancierasPage {
  private readonly fb = inject(FormBuilder);
  private readonly http = inject(HttpClient);
  private readonly apiUrl = apiUrl('entidades-financieras');
  private readonly tiposEntidadUrl = apiUrl('tipo-entidad');

  entidades: EntidadFinanciera[] = [];
  tiposEntidad: TipoEntidad[] = [];
  maintenanceOpen = true;
  loading = false;
  saving = false;
  deletingId: number | null = null;
  editingId: number | null = null;
  errorMessage = '';
  successMessage = '';
  fechaCreacionActual = new Date();

  readonly entidadForm = this.fb.group({
    nombre_entidad: this.fb.control('', [Validators.required, Validators.maxLength(100)]),
    tipo_entidad: this.fb.control<number | null>(null, [Validators.required]),
    pais: this.fb.control('', [Validators.maxLength(50)]),
    sitio_web: this.fb.control('', [Validators.maxLength(150)]),
    telefono_contacto: this.fb.control('', [Validators.maxLength(30)]),
    estado: this.fb.control('activo' as Estado, [Validators.required]),
  });

  constructor() {
    void this.loadData();
  }

  toggleMaintenanceMenu(): void {
    this.maintenanceOpen = !this.maintenanceOpen;
  }

  get isEditing(): boolean {
    return this.editingId !== null;
  }

  get tipoEntidadControl(): FormControl<number | null> {
    return this.entidadForm.get('tipo_entidad') as FormControl<number | null>;
  }

  async loadData(): Promise<void> {
    this.loading = true;
    this.errorMessage = '';

    try {
      const [entidades, tiposEntidad] = await Promise.all([
        firstValueFrom(this.http.get<EntidadFinanciera[]>(this.apiUrl).pipe(timeout(10000))),
        firstValueFrom(this.http.get<TipoEntidad[]>(this.tiposEntidadUrl).pipe(timeout(10000))),
      ]);

      this.entidades = entidades;
      this.tiposEntidad = tiposEntidad;
    } catch (error) {
      this.entidades = [];
      this.tiposEntidad = [];
      this.errorMessage =
        'No se pudieron cargar las entidades financieras o los tipos de entidad.';
      console.error(error);
    } finally {
      this.loading = false;
    }
  }

  editEntidad(entidad: EntidadFinanciera): void {
    this.editingId = entidad.id_entidad;
    this.successMessage = '';
    this.errorMessage = '';
    this.entidadForm.reset({
      nombre_entidad: entidad.nombre_entidad,
      tipo_entidad: entidad.tipo_entidad,
      pais: entidad.pais ?? '',
      sitio_web: entidad.sitio_web ?? '',
      telefono_contacto: entidad.telefono_contacto ?? '',
      estado: entidad.estado ? 'activo' : 'inactivo',
    });
    this.fechaCreacionActual = new Date(entidad.fecha_creacion);
  }

  resetForm(): void {
    this.editingId = null;
    this.entidadForm.reset({
      nombre_entidad: '',
      tipo_entidad: null,
      pais: '',
      sitio_web: '',
      telefono_contacto: '',
      estado: 'activo',
    });
    this.fechaCreacionActual = new Date();
  }

  cancelEdit(): void {
    this.successMessage = '';
    this.errorMessage = '';
    this.resetForm();
  }

  async onSubmit(): Promise<void> {
    this.successMessage = '';
    this.errorMessage = '';

    if (this.entidadForm.invalid) {
      this.entidadForm.markAllAsTouched();
      return;
    }

    const formValue = this.entidadForm.getRawValue();
    const payload: EntidadFinancieraPayload = {
      nombre_entidad: formValue.nombre_entidad?.trim() ?? '',
      tipo_entidad: formValue.tipo_entidad ?? null,
      pais: formValue.pais?.trim() || undefined,
      sitio_web: formValue.sitio_web?.trim() || undefined,
      telefono_contacto: formValue.telefono_contacto?.trim() || undefined,
      estado: formValue.estado === 'activo',
    };

    this.saving = true;
    const wasEditing = this.isEditing;
    const currentId = this.editingId;

    try {
      if (wasEditing && currentId !== null) {
        await firstValueFrom(
          this.http.patch(`${this.apiUrl}/${currentId}`, payload).pipe(timeout(10000)),
        );
        this.successMessage = 'Entidad financiera actualizada correctamente.';
      } else {
        await firstValueFrom(this.http.post(this.apiUrl, payload).pipe(timeout(10000)));
        this.successMessage = 'Entidad financiera guardada correctamente.';
      }

      this.resetForm();
      await this.loadData();
    } catch (error) {
      this.errorMessage = 'No se pudo guardar la entidad financiera.';
      console.error(error);
    } finally {
      this.saving = false;
    }
  }

  async removeEntidad(entidad: EntidadFinanciera): Promise<void> {
    const confirmed = window.confirm(
      `Se eliminara la entidad financiera "${entidad.nombre_entidad}". Deseas continuar?`,
    );

    if (!confirmed) {
      return;
    }

    this.deletingId = entidad.id_entidad;
    this.successMessage = '';
    this.errorMessage = '';
    const deletingId = entidad.id_entidad;
    const fallbackReset = window.setTimeout(() => {
      if (this.deletingId === deletingId) {
        this.deletingId = null;
        this.errorMessage =
          'La eliminacion tardo demasiado. Revisa si el backend sigue activo y vuelve a intentarlo.';
      }
    }, 12000);

    try {
      await firstValueFrom(
        this.http.delete(`${this.apiUrl}/${entidad.id_entidad}`).pipe(
          timeout(10000),
          finalize(() => window.clearTimeout(fallbackReset)),
        ),
      );

      this.entidades = this.entidades.filter((item) => item.id_entidad !== entidad.id_entidad);

      if (this.editingId === entidad.id_entidad) {
        this.resetForm();
      }

      this.successMessage = 'Entidad financiera eliminada correctamente.';
    } catch (error) {
      this.errorMessage = 'No se pudo eliminar la entidad financiera.';
      console.error(error);
    } finally {
      this.deletingId = null;
    }
  }
}
