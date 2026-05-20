import { DatePipe, NgClass, NgFor, NgIf } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { ChangeDetectorRef, Component, inject } from '@angular/core';
import { FormBuilder, FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { firstValueFrom, timeout } from 'rxjs';

import { apiUrl } from '../../shared/config/api.config';
import { MaintenanceActionsComponent } from '../../shared/maintenance-actions/maintenance-actions.component';
import { SessionStripComponent } from '../../shared/session-strip/session-strip.component';
import { SweetAlertService } from '../../shared/services/sweet-alert.service';
import { getCurrentUserId, isAdminUser } from '../../shared/user-profile';

type Estado = 'activo' | 'inactivo';
type SelectorMode = 'existente' | 'nuevo';

interface TipoEntidad {
  id_tipo_entidad: number;
  id_usuario?: number | null;
  descripcion: string;
  estado: boolean;
}

interface EntidadFinanciera {
  id_entidad: number;
  id_usuario?: number | null;
  nombre_entidad: string;
  tipo_entidad: number | null;
  pais: string | null;
  sitio_web: string | null;
  telefono_contacto: string | null;
  estado: boolean;
  fecha_creacion: string;
  tipoEntidad?: TipoEntidad | null;
  puede_editar?: boolean;
  puede_eliminar?: boolean;
}

interface EntidadFinancieraPayload {
  nombre_entidad: string;
  tipo_entidad: number | null;
  pais?: string;
  sitio_web?: string;
  telefono_contacto?: string;
  estado: boolean;
}

interface CountryOption {
  code: string;
  name: string;
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
    MaintenanceActionsComponent,
    SessionStripComponent,
  ],
  templateUrl: './entidades-financieras.page.html',
  styleUrl: './entidades-financieras.tail.css',
})
export class EntidadesFinancierasPage {
  private readonly fb = inject(FormBuilder);
  private readonly http = inject(HttpClient);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly alerts = inject(SweetAlertService);
  private readonly apiUrl = apiUrl('entidades-financieras');
  private readonly tiposEntidadUrl = apiUrl('tipo-entidad');
  private readonly currentUserId = getCurrentUserId();
  readonly pageSize = 10;
  get isAdminSession(): boolean {
    return isAdminUser();
  }

  entidades: EntidadFinanciera[] = [];
  tiposEntidad: TipoEntidad[] = [];
  currentPage = 1;
  readonly countryOptions: CountryOption[] = [
    { code: 'BZ', name: 'Belice' },
    { code: 'CR', name: 'Costa Rica' },
    { code: 'SV', name: 'El Salvador' },
    { code: 'GT', name: 'Guatemala' },
    { code: 'HN', name: 'Honduras' },
    { code: 'NI', name: 'Nicaragua' },
    { code: 'PA', name: 'Panama' },
    { code: 'US', name: 'Estados Unidos' },
  ];
  sidebarCollapsed = false;
  transactionsOpen = false;
  maintenanceOpen = false;
  loading = false;
  saving = false;
  deletingId: number | null = null;
  editingId: number | null = null;
  errorMessage = '';
  successMessage = '';
  tipoEntidadMode: SelectorMode = 'existente';
  fechaCreacionActual = new Date();

  readonly entidadForm = this.fb.group({
    nombre_entidad: this.fb.control('', [Validators.required, Validators.maxLength(100)]),
    tipo_entidad: this.fb.control<number | null>(null, [Validators.required]),
    new_tipo_entidad: this.fb.control('', [Validators.maxLength(100)]),
    pais: this.fb.control('', [Validators.maxLength(50)]),
    sitio_web: this.fb.control('', [Validators.maxLength(150)]),
    telefono_contacto: this.fb.control('', [Validators.maxLength(30)]),
    estado: this.fb.control('activo' as Estado, [Validators.required]),
  });

  constructor() {
    this.setTipoEntidadMode('existente');
    void this.loadData();
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

  get tipoEntidadControl(): FormControl<number | null> {
    return this.entidadForm.get('tipo_entidad') as FormControl<number | null>;
  }

  get newTipoEntidadControl(): FormControl<string> {
    return this.entidadForm.get('new_tipo_entidad') as FormControl<string>;
  }

  get isCreatingNewTipoEntidad(): boolean {
    return this.tipoEntidadMode === 'nuevo';
  }

  get totalPages(): number {
    return Math.max(1, Math.ceil(this.entidades.length / this.pageSize));
  }

  get paginatedEntidades(): EntidadFinanciera[] {
    const startIndex = (this.currentPage - 1) * this.pageSize;
    return this.entidades.slice(startIndex, startIndex + this.pageSize);
  }

  get pageNumbers(): number[] {
    return Array.from({ length: this.totalPages }, (_, index) => index + 1);
  }

  setTipoEntidadMode(mode: SelectorMode): void {
    this.tipoEntidadMode = mode;

    if (mode === 'nuevo') {
      this.tipoEntidadControl.setValue(null);
      this.tipoEntidadControl.clearValidators();
      this.newTipoEntidadControl.setValidators([Validators.required, Validators.maxLength(100)]);
    } else {
      this.newTipoEntidadControl.setValue('');
      this.newTipoEntidadControl.clearValidators();
      this.tipoEntidadControl.setValidators([Validators.required]);
    }

    this.tipoEntidadControl.updateValueAndValidity();
    this.newTipoEntidadControl.updateValueAndValidity();
  }

  async loadData(): Promise<void> {
    this.loading = true;
    this.errorMessage = '';

    try {
      const [entidades, tiposEntidad] = await Promise.all([
        firstValueFrom(
          this.http
            .get<EntidadFinanciera[]>(this.apiUrl, { params: { id_usuario: this.currentUserId } })
            .pipe(timeout(10000)),
        ),
        firstValueFrom(
          this.http
            .get<TipoEntidad[]>(this.tiposEntidadUrl, { params: { id_usuario: this.currentUserId } })
            .pipe(timeout(10000)),
        ),
      ]);

      this.entidades = [...entidades].sort((a, b) => {
        const usuarioA = a.id_usuario ?? Number.MAX_SAFE_INTEGER;
        const usuarioB = b.id_usuario ?? Number.MAX_SAFE_INTEGER;

        if (usuarioA !== usuarioB) {
          return usuarioA - usuarioB;
        }

        return a.id_entidad - b.id_entidad;
      });
      this.currentPage = 1;
      this.tiposEntidad = [...tiposEntidad].sort((a, b) => {
        const usuarioA = a.id_usuario ?? Number.MAX_SAFE_INTEGER;
        const usuarioB = b.id_usuario ?? Number.MAX_SAFE_INTEGER;

        if (usuarioA !== usuarioB) {
          return usuarioA - usuarioB;
        }

        return a.id_tipo_entidad - b.id_tipo_entidad;
      });
    } catch (error) {
      this.entidades = [];
      this.tiposEntidad = [];
      this.currentPage = 1;
      this.errorMessage = this.getErrorMessage(
        error,
        'No se pudieron cargar las entidades financieras o los tipos de entidad.',
      );
      await this.alerts.error('Error al cargar', this.errorMessage);
      console.error(error);
    } finally {
      this.loading = false;
      this.cdr.detectChanges();
    }
  }

  editEntidad(entidad: EntidadFinanciera): void {
    if (!this.canEditEntidad(entidad)) {
      this.errorMessage = 'No tienes permisos para editar esta entidad financiera.';
      void this.alerts.warning('Accion no permitida', this.errorMessage);
      return;
    }

    this.editingId = entidad.id_entidad;
    this.successMessage = '';
    this.errorMessage = '';
    this.entidadForm.reset({
      nombre_entidad: entidad.nombre_entidad,
      tipo_entidad: entidad.tipo_entidad,
      new_tipo_entidad: '',
      pais: this.normalizeCountryCode(entidad.pais),
      sitio_web: entidad.sitio_web ?? '',
      telefono_contacto: entidad.telefono_contacto ?? '',
      estado: entidad.estado ? 'activo' : 'inactivo',
    });
    this.setTipoEntidadMode('existente');
    this.fechaCreacionActual = new Date(entidad.fecha_creacion);
  }

  resetForm(): void {
    this.editingId = null;
    this.entidadForm.reset({
      nombre_entidad: '',
      tipo_entidad: null,
      new_tipo_entidad: '',
      pais: '',
      sitio_web: '',
      telefono_contacto: '',
      estado: 'activo',
    });
    this.setTipoEntidadMode('existente');
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
      await this.alerts.warning(
        'Formulario incompleto',
        'Completa los campos obligatorios antes de continuar.',
      );
      return;
    }

    this.saving = true;
    const wasEditing = this.isEditing;
    const currentId = this.editingId;

    try {
      const formValue = this.entidadForm.getRawValue();
      const resolvedTipoEntidad = await this.resolveTipoEntidadId();
      const tipoEntidadId = resolvedTipoEntidad.id;
      if (tipoEntidadId === null) {
        this.errorMessage = 'Debes seleccionar o escribir un tipo de entidad valido.';
        await this.alerts.warning('Tipo de entidad requerido', this.errorMessage);
        return;
      }

      const payload: EntidadFinancieraPayload = {
        nombre_entidad: formValue.nombre_entidad?.trim() ?? '',
        tipo_entidad: tipoEntidadId,
        pais: this.normalizeCountryCode(formValue.pais) || undefined,
        sitio_web: formValue.sitio_web?.trim() || undefined,
        telefono_contacto: formValue.telefono_contacto?.trim() || undefined,
        estado: formValue.estado === 'activo',
      };

      if (wasEditing && currentId !== null) {
        await firstValueFrom(
          this.http
            .patch(`${this.apiUrl}/${currentId}`, payload, {
              params: { id_usuario: this.currentUserId },
            })
            .pipe(timeout(10000)),
        );
        this.successMessage = 'Entidad financiera actualizada correctamente.';
        await this.alerts.success('Entidad actualizada', this.successMessage);
      } else {
        await firstValueFrom(
          this.http
            .post(this.apiUrl, payload, { params: { id_usuario: this.currentUserId } })
            .pipe(timeout(10000)),
        );
        this.successMessage = resolvedTipoEntidad.created
          ? 'Entidad financiera guardada correctamente. Tambien se creo el tipo de entidad.'
          : 'Entidad financiera guardada correctamente.';
        await this.alerts.success('Entidad guardada', this.successMessage);
      }

      this.resetForm();
      await this.loadData();
    } catch (error) {
      this.errorMessage = this.getErrorMessage(
        error,
        'No se pudo guardar la entidad financiera.',
      );
      await this.alerts.error('No se pudo guardar', this.errorMessage);
      console.error(error);
    } finally {
      this.saving = false;
      this.cdr.detectChanges();
    }
  }

  private async resolveTipoEntidadId(): Promise<{ id: number | null; created: boolean }> {
    if (!this.isCreatingNewTipoEntidad) {
      return {
        id: this.entidadForm.getRawValue().tipo_entidad ?? null,
        created: false,
      };
    }

    const descripcion = this.entidadForm.getRawValue().new_tipo_entidad?.trim() ?? '';
    if (!descripcion) {
      return { id: null, created: false };
    }

    const tipoExistente = this.tiposEntidad.find(
      (item) => item.descripcion.trim().toLocaleLowerCase() === descripcion.toLocaleLowerCase(),
    );

    if (tipoExistente) {
      return { id: tipoExistente.id_tipo_entidad, created: false };
    }

    const nuevoTipo = await firstValueFrom(
      this.http
        .post<TipoEntidad>(this.tiposEntidadUrl, {
          descripcion,
          estado: true,
        }, {
          params: { id_usuario: this.currentUserId },
        })
        .pipe(timeout(10000)),
    );

    this.tiposEntidad = [...this.tiposEntidad, nuevoTipo].sort(
      (a, b) => a.id_tipo_entidad - b.id_tipo_entidad,
    );

    return { id: nuevoTipo.id_tipo_entidad, created: true };
  }

  async removeEntidad(entidad: EntidadFinanciera): Promise<void> {
    if (!this.canDeleteEntidad(entidad)) {
      this.errorMessage = 'No tienes permisos para eliminar esta entidad financiera.';
      await this.alerts.warning('Accion no permitida', this.errorMessage);
      return;
    }

    const confirmed = await this.alerts.confirmDelete(
      'la entidad financiera',
      entidad.nombre_entidad,
    );

    if (!confirmed) {
      return;
    }

    this.deletingId = entidad.id_entidad;
    this.successMessage = '';
    this.errorMessage = '';

    try {
      await firstValueFrom(
        this.http
          .delete(`${this.apiUrl}/${entidad.id_entidad}`, {
            params: { id_usuario: this.currentUserId },
          })
          .pipe(timeout(10000)),
      );

      this.entidades = this.entidades.filter((item) => item.id_entidad !== entidad.id_entidad);
      this.currentPage = Math.min(this.currentPage, this.totalPages);

      if (this.editingId === entidad.id_entidad) {
        this.resetForm();
      }

      this.successMessage = 'Entidad financiera eliminada correctamente.';
      await this.alerts.success('Entidad eliminada', this.successMessage);
    } catch (error) {
      this.errorMessage = this.getErrorMessage(
        error,
        'No se pudo eliminar la entidad financiera.',
      );
      await this.alerts.error('No se pudo eliminar', this.errorMessage);
      console.error(error);
    } finally {
      this.deletingId = null;
      this.cdr.detectChanges();
    }
  }

  getCountryDisplay(value: string | null): string {
    const code = this.normalizeCountryCode(value);
    const country = this.countryOptions.find((item) => item.code === code);

    if (country) {
      return `${country.name} (${country.code})`;
    }

    return value?.trim() || '-';
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

  private normalizeCountryCode(value: string | null | undefined): string {
    const normalized = value?.trim();
    if (!normalized) {
      return '';
    }

    const upperValue = normalized.toUpperCase();
    if (this.countryOptions.some((item) => item.code === upperValue)) {
      return upperValue;
    }

    const aliases: Record<string, string> = {
      belice: 'BZ',
      'costa rica': 'CR',
      'el salvador': 'SV',
      guatemala: 'GT',
      honduras: 'HN',
      nicaragua: 'NI',
      panama: 'PA',
      'panama ': 'PA',
      'estados unidos': 'US',
      'united states': 'US',
      usa: 'US',
    };

    return aliases[normalized.toLowerCase()] ?? normalized;
  }

  canDeleteEntidad(entidad: EntidadFinanciera): boolean {
    if (this.isAdminSession) {
      return true;
    }

    if (typeof entidad.puede_eliminar === 'boolean') {
      return entidad.puede_eliminar;
    }

    return true;
  }

  canEditEntidad(entidad: EntidadFinanciera): boolean {
    if (this.isAdminSession) {
      return true;
    }

    if (typeof entidad.puede_editar === 'boolean') {
      return entidad.puede_editar;
    }

    return true;
  }

  async showEntidadDetail(entidad: EntidadFinanciera): Promise<void> {
    await this.alerts.detail(
      'Detalle de entidad financiera',
      [
        { label: 'Nombre', value: entidad.nombre_entidad },
        { label: 'Tipo de entidad', value: entidad.tipoEntidad?.descripcion ?? 'Sin tipo asignado' },
        { label: 'Pais', value: this.getCountryDisplay(entidad.pais) },
        { label: 'Sitio web', value: entidad.sitio_web },
        { label: 'Telefono', value: entidad.telefono_contacto },
        { label: 'Estado', value: entidad.estado ? 'Activo' : 'Inactivo' },
        { label: 'Fecha creacion', value: entidad.fecha_creacion.slice(0, 10) },
      ],
      {
        subtitle: `Entidad #${entidad.id_entidad}`,
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
