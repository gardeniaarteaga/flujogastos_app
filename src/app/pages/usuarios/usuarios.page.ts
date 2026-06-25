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
import { getCurrentUserId, isAdminUser, loadUserProfile } from '../../shared/user-profile';

type Estado = 'activo' | 'inactivo';

interface Usuario {
  id_usuario: number;
  username: string;
  nombre_completo: string | null;
  celular: string | null;
  pais: string | null;
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
  pais?: string | null;
  codigo_area?: string | number | null;
  id_rol?: number | null;
  estado: 'ACTIVO' | 'INACTIVO';
  cambiar_password?: boolean;
}

interface CountryOption {
  name: string;
  areaCode: string;
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
  private readonly apiUrl = apiUrl('usuarios');
  private readonly currentUserId = getCurrentUserId();
  readonly pageSize = 10;
  readonly roleOptions: RoleOption[] = [
    { value: 1, label: 'Administrador' },
    { value: 2, label: 'Usuario' },
  ];
  readonly countryOptions: CountryOption[] = [
    { name: 'Argentina', areaCode: '+54' },
    { name: 'Belice', areaCode: '+501' },
    { name: 'Bolivia', areaCode: '+591' },
    { name: 'Brasil', areaCode: '+55' },
    { name: 'Canada', areaCode: '+1' },
    { name: 'Chile', areaCode: '+56' },
    { name: 'Colombia', areaCode: '+57' },
    { name: 'Costa Rica', areaCode: '+506' },
    { name: 'Ecuador', areaCode: '+593' },
    { name: 'El Salvador', areaCode: '+503' },
    { name: 'Espana', areaCode: '+34' },
    { name: 'Estados Unidos', areaCode: '+1' },
    { name: 'Guatemala', areaCode: '+502' },
    { name: 'Honduras', areaCode: '+504' },
    { name: 'Mexico', areaCode: '+52' },
    { name: 'Nicaragua', areaCode: '+505' },
    { name: 'Panama', areaCode: '+507' },
    { name: 'Paraguay', areaCode: '+595' },
    { name: 'Peru', areaCode: '+51' },
    { name: 'Republica Dominicana', areaCode: '+1' },
    { name: 'Uruguay', areaCode: '+598' },
    { name: 'Venezuela', areaCode: '+58' },
  ];

  usuarios: Usuario[] = [];
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

  readonly usuarioForm = this.fb.group({
    username: this.fb.control('', [Validators.required, Validators.email, Validators.maxLength(255)]),
    password: this.fb.control('', [Validators.required, Validators.minLength(6), Validators.maxLength(255)]),
    nombre_completo: this.fb.control('', [Validators.maxLength(255)]),
    pais: this.fb.control('', [Validators.maxLength(80)]),
    codigo_area: this.fb.control('', [Validators.maxLength(10)]),
    celular: this.fb.control('', [Validators.maxLength(9)]),
    id_rol: this.fb.control(2, [Validators.required]),
    estado: this.fb.control('activo' as Estado, [Validators.required]),
    cambiar_password: this.fb.control(true, { nonNullable: true }),
  });

  constructor() {
    this.setPasswordRequired(true);
    this.usuarioForm.controls.pais.valueChanges.subscribe((pais) => {
      this.syncAreaCodeForCountry(pais ?? '');
    });
    void this.loadUsuarios();
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
      const currentProfileCountry = currentProfile.country.trim();
      this.usuarios = usuarios.map((usuario) =>
        usuario.id_usuario === currentProfile.id_usuario
          ? {
              ...usuario,
              celular: usuario.celular || currentProfilePhone || null,
              pais: usuario.pais || currentProfileCountry || null,
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
      pais: usuario.pais ?? '',
      codigo_area: this.getAreaCodeForCountry(usuario.pais) || this.normalizeAreaCodeInput(usuario.codigo_area),
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
      pais: '',
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
      pais: rawValue.pais?.trim() || null,
      codigo_area: this.normalizeAreaCodeForStorage(this.getAreaCodeForCountry(rawValue.pais)),
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
        { label: 'Pais', value: usuario.pais || '-' },
        { label: 'Telefono', value: this.formatPhoneDisplay(usuario.codigo_area, usuario.celular, usuario.pais) || '-' },
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

  formatPhoneDisplay(
    codigoArea?: string | number | null,
    celular?: string | null,
    pais?: string | null,
  ): string {
    const areaCode =
      this.normalizeAreaCodeInput(codigoArea) || this.normalizeAreaCodeInput(this.getAreaCodeForCountry(pais));
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
      .replace(/[^\d+]/g, '')
      .slice(0, 10);
  }

  private getAreaCodeForCountry(countryName?: string | null): string {
    const normalizedCountry = countryName?.trim() ?? '';
    return this.countryOptions.find((country) => country.name === normalizedCountry)?.areaCode ?? '';
  }

  private syncAreaCodeForCountry(countryName: string): void {
    const areaCodeControl = this.usuarioForm.controls.codigo_area;
    const nextAreaCode = this.getAreaCodeForCountry(countryName);

    if ((areaCodeControl.value ?? '') !== nextAreaCode) {
      areaCodeControl.setValue(nextAreaCode, { emitEvent: false });
    }
  }
}
