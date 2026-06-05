import { NgIf } from '@angular/common';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectorRef, Component, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { firstValueFrom, timeout } from 'rxjs';

import { apiUrl } from '../../shared/config/api.config';
import { CatalogosTransaccionService } from '../../shared/services/catalogos-transaccion.service';
import { SweetAlertService } from '../../shared/services/sweet-alert.service';
import { seedUserProfileFromLogin } from '../../shared/user-profile';

interface UsuarioSesion {
  id_usuario: number;
  username: string;
  nombre_completo: string | null;
  celular: string | null;
  pais: string | null;
  codigo_area: string | null;
  ciudad: string | null;
  id_rol: number | null;
  estado: string | null;
  cambiar_password?: boolean | number;
  requiere_cambio_password?: boolean;
}

@Component({
  selector: 'app-login',
  imports: [ReactiveFormsModule, NgIf],
  templateUrl: './login.html',
  styleUrl: './login.css',
})
export class Login {
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly fb = inject(FormBuilder);
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  private readonly catalogosTransaccionService = inject(CatalogosTransaccionService);
  private readonly alerts = inject(SweetAlertService);
  private readonly usuariosBaseUrl = apiUrl('usuarios');
  private readonly usuariosUrl = `${this.usuariosBaseUrl}/login`;

  loginForm = this.fb.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(6)]],
  });

  passwordChangeForm = this.fb.group({
    newPassword: ['', [Validators.required, Validators.minLength(6)]],
    confirmPassword: ['', [Validators.required, Validators.minLength(6)]],
  });

  submitted = false;
  loading = false;
  errorMessage = '';
  successMessage = '';
  pendingUsuario: UsuarioSesion | null = null;

  async onSubmit(): Promise<void> {
    this.submitted = true;
    this.clearMessages();

    if (this.loginForm.invalid) {
      this.loginForm.markAllAsTouched();
      return;
    }

    this.loading = true;

    try {
      const email = this.loginForm.value.email?.trim().toLowerCase() ?? '';
      const password = this.loginForm.value.password ?? '';
      const usuario = await firstValueFrom(
        this.http
          .post<UsuarioSesion>(this.usuariosUrl, {
            username: email,
            password,
          })
          .pipe(timeout(10000)),
      );

      if (
        usuario.requiere_cambio_password ||
        usuario.cambiar_password === true ||
        usuario.cambiar_password === 1
      ) {
        this.pendingUsuario = usuario;
        this.passwordChangeForm.reset({
          newPassword: '',
          confirmPassword: '',
        });
        this.successMessage = 'Necesitas cambiar tu contrasena para continuar.';
        this.loading = false;
        this.cdr.detectChanges();
        return;
      }

      await this.completeLogin(usuario);
    } catch (error) {
      const shouldClearCredentials = this.shouldClearCredentialsAfterAuthError(error);
      await this.showAuthError(
        'No se pudo iniciar sesion',
        this.getLoginErrorMessage(error),
      );

      if (shouldClearCredentials) {
        this.resetLoginCredentials();
      }
    } finally {
      this.loading = false;
    }
  }

  async onPasswordChangeSubmit(): Promise<void> {
    this.clearMessages();

    if (!this.pendingUsuario) {
      await this.showAuthError(
        'Sesion no disponible',
        'Tu sesion de cambio de contrasena ya no esta disponible.',
      );
      return;
    }

    if (this.passwordChangeForm.invalid) {
      this.passwordChangeForm.markAllAsTouched();
      return;
    }

    const newPassword = this.passwordChangeForm.value.newPassword?.trim() ?? '';
    const confirmPassword = this.passwordChangeForm.value.confirmPassword?.trim() ?? '';

    if (newPassword !== confirmPassword) {
      await this.showAuthError(
        'Contrasenas diferentes',
        'La confirmacion no coincide con la nueva contrasena.',
      );
      return;
    }

    this.loading = true;

    try {
      const usuarioActualizado = await firstValueFrom(
        this.http
          .patch<UsuarioSesion>(
            `${this.usuariosBaseUrl}/${this.pendingUsuario.id_usuario}`,
            {
              password: newPassword,
            },
            {
              params: { id_usuario: this.pendingUsuario.id_usuario },
            },
          )
          .pipe(timeout(10000)),
      );

      this.pendingUsuario = null;
      this.passwordChangeForm.reset({
        newPassword: '',
        confirmPassword: '',
      });
      await this.completeLogin(usuarioActualizado);
    } catch (error) {
      await this.showAuthError(
        'No se pudo actualizar la contrasena',
        this.getErrorMessage(
          error,
          'No se pudo actualizar la contrasena. Intenta nuevamente.',
        ),
      );
    } finally {
      this.loading = false;
    }
  }

  returnToLogin(): void {
    this.pendingUsuario = null;
    this.passwordChangeForm.reset({
      newPassword: '',
      confirmPassword: '',
    });
    this.successMessage = '';
    this.errorMessage = '';
  }

  private clearMessages(): void {
    this.errorMessage = '';
    this.successMessage = '';
  }

  private async completeLogin(usuario: UsuarioSesion): Promise<void> {
    seedUserProfileFromLogin(usuario.username, {
      idUsuario: usuario.id_usuario,
      fullName: usuario.nombre_completo,
      idRol: usuario.id_rol,
      celular: usuario.celular,
      country: usuario.pais,
      areaCode: usuario.codigo_area,
      city: usuario.ciudad,
    });
    this.catalogosTransaccionService.clearCache();
    await this.router.navigate(['/pago-rapido']);
  }

  private async showAuthError(title: string, message: string): Promise<void> {
    this.errorMessage = message;
    await this.alerts.error(title, message);
  }

  private resetLoginCredentials(): void {
    this.loginForm.reset({
      email: '',
      password: '',
    });
    this.submitted = false;
    this.cdr.detectChanges();
  }

  private shouldClearCredentialsAfterAuthError(error: unknown): boolean {
    if (!(error instanceof HttpErrorResponse) || error.status !== 403) {
      return false;
    }

    const backendMessage = this.getErrorMessage(error, '').trim().toLowerCase();
    return backendMessage === 'el usuario no se encuentra activo';
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

  private getLoginErrorMessage(error: unknown): string {
    if (error instanceof HttpErrorResponse) {
      if (error.status === 401) {
        return 'Usuario o contrasena incorrectos.';
      }

      if (error.status === 403) {
        const backendMessage = this.getErrorMessage(error, '').trim().toLowerCase();
        if (backendMessage === 'el usuario no se encuentra activo') {
          return 'Este usuario esta inactivo y no puede ingresar.';
        }
      }

      const backendMessage = this.getErrorMessage(error, '').trim().toLowerCase();
      if (
        backendMessage === 'usuario o contrasena incorrectos' ||
        backendMessage === 'no existe un usuario con ese correo'
      ) {
        return 'Usuario o contrasena incorrectos.';
      }
    }

    return this.getErrorMessage(
      error,
      'No se pudo iniciar sesion. Verifica usuario, contrasena y que el backend este activo.',
    );
  }
}
