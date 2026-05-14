import { DatePipe, NgClass, NgFor, NgIf } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { ChangeDetectorRef, Component, inject } from '@angular/core';
import { FormBuilder, FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { firstValueFrom, timeout } from 'rxjs';

import { MaintenanceActionsComponent } from '../../shared/maintenance-actions/maintenance-actions.component';
import { SessionStripComponent } from '../../shared/session-strip/session-strip.component';
import { SweetAlertService } from '../../shared/services/sweet-alert.service';
import { getCurrentUserId, isAdminUser, loadUserProfile } from '../../shared/user-profile';

type Estado = 'activo' | 'inactivo';

interface Usuario {
  id_usuario: number;
  username: string;
  nombre_completo: string | null;
  celular: string | null;
  codigo_area: string | number | null;
  id_rol: number | null;
  estado: string | null;
  fecha_creacion: string;
  cambiar_password?: boolean;
  es_predeterminado?: boolean;
  puede_editar?: boolean;
  puede_eliminar?: boolean;
}

interface UsuarioPayload {
  username: string;
  password?: string;
  nombre_completo?: string;
  celular?: string | null;
  codigo_area?: string | number | null;
  id_rol?: number | null;
  estado: 'ACTIVO' | 'INACTIVO';
  cambiar_password?: boolean;
}

interface RoleOption {
  value: number;
  label: string;
}

@Component({
  selector: 'app-usuarios-page',
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
  templateUrl: './usuarios.page.html',
  styleUrl: './usuarios.page.css',
})
export class UsuariosPage {
  private readonly fb = inject(FormBuilder);
  private readonly http = inject(HttpClient);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly alerts = inject(SweetAlertService);
  private readonly apiUrl = 'http://localhost:3001/api/usuarios';
  private readonly currentUserId = getCurrentUserId();
  readonly pageSize = 10;
  readonly roleOptions: RoleOption[] = [
    { value: 1, label: 'Administrador' },
    { value: 2, label: 'Usuario' },
  ];

  usuarios: Usuario[] = [];
  currentPage = 1;
  transactionsOpen = false;
  maintenanceOpen = true;
  loading = false;
  saving = false;
  deletingId: number | null = null;
  editingId: number | null = null;
  errorMessage = '';
  successMessage = '';
  readonly today = new Date();

  readonly usuarioForm = this.fb.group({
    username: this.fb.control('', [Validators.required, Validators.email, Validators.maxLength(255)]),
    password: this.fb.control('', [Validators.required, Validators.minLength(6), Validators.maxLength(255)]),
    nombre_completo: this.fb.control('', [Validators.maxLength(255)]),
    codigo_area: this.fb.control('', [Validators.maxLength(10)]),
    celular: this.fb.control('', [Validators.maxLength(9)]),
    id_rol: this.fb.control(2, [Validators.required]),
    estado: this.fb.control('activo' as Estado, [Validators.required]),
    cambiar_password: this.fb.control(true, { nonNullable: true }),
  });

  constructor() {
    this.setPasswordRequired(true);
    void this.loadUsuarios();
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

  get isAdminSession(): boolean {
    return isAdminUser();
  }

  get passwordControl(): FormControl<string> {
    return this.usuarioForm.get('password') as FormControl<string>;
  }

  get totalPages(): number {
    return Math.max(1, Math.ceil(this.usuarios.length / this.pageSize));
  }

  get paginatedUsuarios(): Usuario[] {
    const startIndex = (this.currentPage - 1) * this.pageSize;
    return this.usuarios.slice(startIndex, startIndex + this.pageSize);
  }

  get pageNumbers(): number[] {
    return Array.from({ length: this.totalPages }, (_, index) => index + 1);
  }

  async loadUsuarios(): Promise<void> {
    this.loading = true;
    this.errorMessage = '';

    try {
      const usuarios = await firstValueFrom(
        this.http
          .get<Usuario[]>(this.apiUrl, {
            params: { id_usuario: this.currentUserId },
          })
          .pipe(timeout(10000)),
      );
      const currentProfile = loadUserProfile();
      const currentProfilePhone = currentProfile.celular.trim();
      const currentProfileAreaCode = currentProfile.areaCode.trim();
      this.usuarios = usuarios.map((usuario) =>
        usuario.id_usuario === currentProfile.id_usuario
          ? {
              ...usuario,
              celular: usuario.celular || currentProfilePhone || null,
              codigo_area: usuario.codigo_area || currentProfileAreaCode || null,
            }
          : usuario,
      );
      this.currentPage = 1;
    } catch (error) {
      this.usuarios = [];
      this.currentPage = 1;
      this.errorMessage = this.getErrorMessage(error, 'No se pudieron cargar los usuarios.');
      await this.alerts.error('Error al cargar', this.errorMessage);
      console.error(error);
    } finally {
      this.loading = false;
      this.cdr.detectChanges();
    }
  }

  editUsuario(usuario: Usuario): void {
    if (!this.canEditUsuario(usuario)) {
      this.errorMessage = 'No tienes permisos para editar este usuario.';
      void this.alerts.warning('Accion no permitida', this.errorMessage);
      return;
    }

    this.editingId = usuario.id_usuario;
    this.successMessage = '';
    this.errorMessage = '';
    this.usuarioForm.reset({
      username: usuario.username,
      password: '',
      nombre_completo: usuario.nombre_completo ?? '',
      codigo_area: this.normalizeAreaCodeInput(usuario.codigo_area),
      celular: this.formatCelular(usuario.celular),
      id_rol: usuario.id_rol ?? 2,
      estado: usuario.estado === 'INACTIVO' ? 'inactivo' : 'activo',
      cambiar_password: usuario.cambiar_password ?? false,
    });
    this.setPasswordRequired(false);
  }

  resetForm(): void {
    this.editingId = null;
    this.usuarioForm.reset({
      username: '',
      password: '',
      nombre_completo: '',
      codigo_area: '',
      celular: '',
      id_rol: 2,
      estado: 'activo',
      cambiar_password: true,
    });
    this.setPasswordRequired(true);
  }

  cancelEdit(): void {
    this.successMessage = '';
    this.errorMessage = '';
    this.resetForm();
  }

  onCelularInput(): void {
    const control = this.usuarioForm.controls.celular;
    const formattedValue = this.formatCelular(control.value);

    if (control.value !== formattedValue) {
      control.setValue(formattedValue, { emitEvent: false });
    }
  }

  onAreaCodeInput(): void {
    const control = this.usuarioForm.controls.codigo_area;
    const formattedValue = this.normalizeAreaCodeInput(control.value);

    if (control.value !== formattedValue) {
      control.setValue(formattedValue, { emitEvent: false });
    }
  }

  async onSubmit(): Promise<void> {
    this.successMessage = '';
    this.errorMessage = '';

    if (!this.isAdminSession && !this.isEditing) {
      this.errorMessage = 'Solo el administrador puede registrar nuevos usuarios.';
      await this.alerts.warning('Accion no permitida', this.errorMessage);
      return;
    }

    if (this.usuarioForm.invalid) {
      this.usuarioForm.markAllAsTouched();
      await this.alerts.warning(
        'Formulario incompleto',
        'Completa los campos obligatorios antes de continuar.',
      );
      return;
    }

    this.saving = true;
    const rawValue = this.usuarioForm.getRawValue();
    const wasEditing = this.isEditing;
    const currentId = this.editingId;
    const trimmedPassword = rawValue.password?.trim() ?? '';

    const payload: UsuarioPayload = {
      username: rawValue.username?.trim().toLowerCase() ?? '',
      nombre_completo: rawValue.nombre_completo?.trim() || undefined,
      codigo_area: this.normalizeAreaCodeForStorage(rawValue.codigo_area),
      celular: this.normalizeCelularForStorage(rawValue.celular),
      estado: rawValue.estado === 'inactivo' ? 'INACTIVO' : 'ACTIVO',
    };

    if (this.isAdminSession) {
      payload.id_rol = rawValue.id_rol ?? 2;
      payload.cambiar_password = rawValue.cambiar_password ?? false;
    }

    if (trimmedPassword || !wasEditing) {
      payload.password = trimmedPassword;
    }

    try {
      if (wasEditing && currentId !== null) {
        await firstValueFrom(
          this.http
            .patch(`${this.apiUrl}/${currentId}`, payload, {
              params: { id_usuario: this.currentUserId },
            })
            .pipe(timeout(10000)),
        );
        this.successMessage = 'Usuario actualizado correctamente.';
        await this.alerts.success('Usuario actualizado', this.successMessage);
      } else {
        await firstValueFrom(
          this.http
            .post(this.apiUrl, payload, {
              params: { id_usuario: this.currentUserId },
            })
            .pipe(timeout(10000)),
        );
        this.successMessage = 'Usuario guardado correctamente.';
        await this.alerts.success('Usuario guardado', this.successMessage);
      }

      this.resetForm();
      await this.loadUsuarios();
    } catch (error) {
      this.errorMessage = this.getErrorMessage(error, 'No se pudo guardar el usuario.');
      await this.alerts.error('No se pudo guardar', this.errorMessage);
      console.error(error);
    } finally {
      this.saving = false;
      this.cdr.detectChanges();
    }
  }

  async removeUsuario(usuario: Usuario): Promise<void> {
    if (!this.canDeleteUsuario(usuario)) {
      this.errorMessage = 'No tienes permisos para eliminar este usuario.';
      await this.alerts.warning('Accion no permitida', this.errorMessage);
      return;
    }

    const confirmed = await this.alerts.confirmDelete('el usuario', usuario.username);

    if (!confirmed) {
      return;
    }

    this.deletingId = usuario.id_usuario;
    this.successMessage = '';
    this.errorMessage = '';

    try {
      await firstValueFrom(
        this.http
          .delete(`${this.apiUrl}/${usuario.id_usuario}`, {
            params: { id_usuario: this.currentUserId },
          })
          .pipe(timeout(10000)),
      );

      this.usuarios = this.usuarios.filter((item) => item.id_usuario !== usuario.id_usuario);
      this.currentPage = Math.min(this.currentPage, this.totalPages);

      if (this.editingId === usuario.id_usuario) {
        this.resetForm();
      }

      this.successMessage = 'Usuario eliminado correctamente.';
      await this.alerts.success('Usuario eliminado', this.successMessage);
    } catch (error) {
      this.errorMessage = this.getErrorMessage(error, 'No se pudo eliminar el usuario.');
      await this.alerts.error('No se pudo eliminar', this.errorMessage);
      console.error(error);
    } finally {
      this.deletingId = null;
      this.cdr.detectChanges();
    }
  }

  getRoleLabel(idRol: number | null): string {
    if (idRol === null || idRol === undefined) {
      return '-';
    }

    return this.roleOptions.find((role) => role.value === idRol)?.label ?? `Rol ${idRol}`;
  }

  canEditUsuario(usuario: Usuario): boolean {
    return usuario.puede_editar ?? (this.isAdminSession || usuario.id_usuario === this.currentUserId);
  }

  canDeleteUsuario(usuario: Usuario): boolean {
    return usuario.puede_eliminar ?? false;
  }

  async showUsuarioDetail(usuario: Usuario): Promise<void> {
    await this.alerts.detail(
      'Detalle de usuario',
      [
        { label: 'Usuario', value: usuario.username },
        { label: 'Nombre completo', value: usuario.nombre_completo },
        { label: 'Telefono', value: this.formatPhoneDisplay(usuario.codigo_area, usuario.celular) || '-' },
        { label: 'Rol', value: this.getRoleLabel(usuario.id_rol) },
        { label: 'Estado', value: usuario.estado === 'INACTIVO' ? 'Inactivo' : 'Activo' },
        { label: 'Fecha creacion', value: usuario.fecha_creacion.slice(0, 10) },
      ],
      {
        subtitle: `Usuario #${usuario.id_usuario}`,
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

  formatCelular(value?: string | null): string {
    const digits = (value ?? '').replace(/\D/g, '').slice(0, 8);

    if (digits.length <= 4) {
      return digits;
    }

    return `${digits.slice(0, 4)}-${digits.slice(4)}`;
  }

  formatPhoneDisplay(codigoArea?: string | number | null, celular?: string | null): string {
    const areaCode = this.normalizeAreaCodeInput(codigoArea);
    const phone = this.formatCelular(celular);

    if (areaCode && phone) {
      return `${areaCode} ${phone}`;
    }

    return phone || areaCode;
  }

  private setPasswordRequired(required: boolean): void {
    if (required) {
      this.passwordControl.setValidators([
        Validators.required,
        Validators.minLength(6),
        Validators.maxLength(255),
      ]);
    } else {
      this.passwordControl.setValidators([Validators.minLength(6), Validators.maxLength(255)]);
    }

    this.passwordControl.updateValueAndValidity();
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

  private normalizeAreaCodeForStorage(value?: string | number | null): string | null {
    const digits = this.normalizeAreaCodeInput(value);
    return digits || null;
  }

  private normalizeAreaCodeInput(value?: string | number | null): string {
    return String(value ?? '')
      .replace(/\D/g, '')
      .slice(0, 10);
  }
}
