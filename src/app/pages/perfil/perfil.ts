import { DatePipe, NgFor, NgIf } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Component, computed, inject, signal } from '@angular/core';
import {
  AbstractControl,
  FormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  ValidatorFn,
  Validators,
} from '@angular/forms';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { firstValueFrom, timeout } from 'rxjs';

import { SessionStripComponent } from '../../shared/session-strip/session-strip.component';
import { UserProfile, isAdminUser, loadUserProfile, saveUserProfile } from '../../shared/user-profile';

interface CountryOption {
  name: string;
  areaCode: string;
}

interface UsuarioPerfilResponse {
  nombre_completo: string | null;
  celular: string | null;
  pais: string | null;
  codigo_area: string | null;
  ciudad: string | null;
}

@Component({
  selector: 'app-perfil-page',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    RouterLinkActive,
    NgIf,
    NgFor,
    DatePipe,
    SessionStripComponent,
  ],
  templateUrl: './perfil.html',
  styleUrl: './perfil.css',
})
export class PerfilPage {
  private readonly fb = inject(FormBuilder);
  private readonly http = inject(HttpClient);
  private readonly apiUrl = 'http://localhost:3001/api/usuarios';

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

  maintenanceOpen = false;
  saving = false;
  changingPassword = false;
  profileErrorMessage = '';
  profileSuccessMessage = '';
  passwordErrorMessage = '';
  passwordSuccessMessage = '';
  readonly today = new Date();

  get isAdminSession(): boolean {
    return isAdminUser();
  }

  readonly userProfile = signal<UserProfile>(loadUserProfile());
  readonly profileCompletion = computed(() => {
    const profile = this.userProfile();
    const fields = [
      profile.fullName,
      profile.email,
      profile.country,
      profile.areaCode,
      profile.celular,
      profile.city,
      profile.bio,
    ];
    const completeFields = fields.filter((field) => field.trim().length > 0).length;

    return Math.round((completeFields / fields.length) * 100);
  });

  readonly profileForm = this.fb.group({
    fullName: [this.userProfile().fullName, [Validators.required, Validators.maxLength(60)]],
    email: [this.userProfile().email, [Validators.required, Validators.email]],
    role: [this.userProfile().role, [Validators.required, Validators.maxLength(40)]],
    country: [this.userProfile().country, [Validators.required, Validators.maxLength(80)]],
    areaCode: [this.userProfile().areaCode, [Validators.maxLength(10)]],
    celular: [this.userProfile().celular, [Validators.maxLength(20)]],
    city: [this.userProfile().city, [Validators.maxLength(80)]],
    bio: [this.userProfile().bio, [Validators.maxLength(180)]],
  });

  readonly passwordChangeForm = this.fb.group({
    newPassword: ['', [Validators.required, Validators.minLength(6)]],
    confirmPassword: ['', [Validators.required, Validators.minLength(6)]],
  });

  constructor() {
    this.profileForm.controls.celular.addValidators(this.phoneValidator());
    this.profileForm.controls.country.valueChanges.subscribe((country) => {
      this.syncAreaCodeForCountry(country ?? '');
    });

    this.patchProfileForm(this.userProfile());
  }

  toggleMaintenanceMenu(): void {
    this.maintenanceOpen = !this.maintenanceOpen;
  }

  get initials(): string {
    return this.userProfile()
      .fullName.split(' ')
      .filter((part) => part.length > 0)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? '')
      .join('');
  }

  get selectedCountry(): CountryOption | null {
    const currentCountry = this.profileForm.controls.country.value?.trim() ?? '';
    return this.countryOptions.find((country) => country.name === currentCountry) ?? null;
  }

  get isElSalvadorSelected(): boolean {
    return this.selectedCountry?.name === 'El Salvador';
  }

  get phonePlaceholder(): string {
    return this.isElSalvadorSelected ? '1234-5678' : 'Solo numeros y guion medio';
  }

  onPhoneInput(): void {
    const control = this.profileForm.controls.celular;
    const currentValue = control.value ?? '';
    const nextValue = this.isElSalvadorSelected
      ? this.formatElSalvadorPhone(currentValue)
      : this.sanitizeGenericPhone(currentValue);

    if (currentValue !== nextValue) {
      control.setValue(nextValue, { emitEvent: false });
    }
  }

  async onSubmit(): Promise<void> {
    this.clearProfileMessages();

    if (this.profileForm.invalid) {
      this.profileForm.markAllAsTouched();
      return;
    }

    const currentProfile = this.userProfile();
    const nextProfile: UserProfile = {
      id_usuario: currentProfile.id_usuario,
      id_rol: currentProfile.id_rol,
      username: currentProfile.username,
      fullName: this.profileForm.value.fullName?.trim() ?? '',
      email: this.profileForm.value.email?.trim() ?? '',
      role: this.profileForm.value.role?.trim() ?? '',
      celular: this.profileForm.value.celular?.trim() ?? '',
      country: this.profileForm.value.country?.trim() ?? '',
      areaCode: this.profileForm.value.areaCode?.trim() ?? '',
      city: this.profileForm.value.city?.trim() ?? '',
      bio: this.profileForm.value.bio?.trim() ?? '',
      notificationsLabel: currentProfile.notificationsLabel,
    };

    this.saving = true;

    try {
      const usuarioActualizado = await firstValueFrom(
        this.http
          .patch<UsuarioPerfilResponse>(
            `${this.apiUrl}/${currentProfile.id_usuario}`,
            {
              nombre_completo: nextProfile.fullName,
              celular: nextProfile.celular || null,
              pais: nextProfile.country || null,
              codigo_area: nextProfile.areaCode || null,
              ciudad: nextProfile.city || null,
            },
            {
              params: { id_usuario: currentProfile.id_usuario },
            },
          )
          .pipe(timeout(10000)),
      );

      const syncedProfile: UserProfile = {
        ...nextProfile,
        fullName: usuarioActualizado.nombre_completo?.trim() || nextProfile.fullName,
        celular: usuarioActualizado.celular?.trim() || '',
        country: usuarioActualizado.pais?.trim() || '',
        areaCode: usuarioActualizado.codigo_area?.trim() || '',
        city: usuarioActualizado.ciudad?.trim() || '',
      };

      saveUserProfile(syncedProfile);
      this.userProfile.set(syncedProfile);
      this.patchProfileForm(syncedProfile);
      this.profileSuccessMessage = 'Perfil actualizado correctamente.';
    } catch (error) {
      this.profileErrorMessage = this.getErrorMessage(
        error,
        'No se pudo guardar el perfil en el servidor. Intenta nuevamente con el backend activo.',
      );
      console.error(error);
    } finally {
      this.saving = false;
    }
  }

  async onPasswordChangeSubmit(): Promise<void> {
    this.clearPasswordMessages();

    if (this.passwordChangeForm.invalid) {
      this.passwordChangeForm.markAllAsTouched();
      return;
    }

    const newPassword = this.passwordChangeForm.value.newPassword?.trim() ?? '';
    const confirmPassword = this.passwordChangeForm.value.confirmPassword?.trim() ?? '';

    if (newPassword !== confirmPassword) {
      this.passwordErrorMessage = 'La confirmacion no coincide con la nueva contrasena.';
      return;
    }

    this.changingPassword = true;

    try {
      await firstValueFrom(
        this.http
          .patch(
            `${this.apiUrl}/${this.userProfile().id_usuario}`,
            {
              password: newPassword,
            },
            {
              params: { id_usuario: this.userProfile().id_usuario },
            },
          )
          .pipe(timeout(10000)),
      );

      this.passwordChangeForm.reset({
        newPassword: '',
        confirmPassword: '',
      });
      this.passwordSuccessMessage = 'Contrasena actualizada correctamente.';
    } catch (error) {
      this.passwordErrorMessage = this.getErrorMessage(
        error,
        'No se pudo actualizar la contrasena. Intenta nuevamente.',
      );
      console.error(error);
    } finally {
      this.changingPassword = false;
    }
  }

  private patchProfileForm(profile: UserProfile): void {
    this.profileForm.patchValue(
      {
        fullName: profile.fullName,
        email: profile.email,
        role: profile.role,
        country: profile.country,
        areaCode: profile.areaCode,
        celular: profile.celular,
        city: profile.city,
        bio: profile.bio,
      },
      { emitEvent: false },
    );

    this.syncAreaCodeForCountry(profile.country, true);
    this.onPhoneInput();
    this.profileForm.controls.celular.updateValueAndValidity({ emitEvent: false });
  }

  private syncAreaCodeForCountry(countryName: string, keepExistingAreaCode = false): void {
    const selectedCountry = this.countryOptions.find((country) => country.name === countryName);
    const currentAreaCode = this.profileForm.controls.areaCode.value?.trim() ?? '';
    const nextAreaCode = selectedCountry?.areaCode ?? '';

    if (!keepExistingAreaCode || !currentAreaCode) {
      this.profileForm.controls.areaCode.setValue(nextAreaCode, { emitEvent: false });
    }

    this.onPhoneInput();
    this.profileForm.controls.celular.updateValueAndValidity({ emitEvent: false });
  }

  private phoneValidator(): ValidatorFn {
    return (control: AbstractControl): ValidationErrors | null => {
      const rawValue = `${control.value ?? ''}`.trim();

      if (!rawValue) {
        return null;
      }

      if (this.isElSalvadorSelected) {
        return /^\d{4}-\d{4}$/.test(rawValue) ? null : { elSalvadorPhone: true };
      }

      return /^[0-9-]+$/.test(rawValue) ? null : { genericPhone: true };
    };
  }

  private formatElSalvadorPhone(value: string): string {
    const digits = value.replace(/\D/g, '').slice(0, 8);

    if (digits.length <= 4) {
      return digits;
    }

    return `${digits.slice(0, 4)}-${digits.slice(4)}`;
  }

  private sanitizeGenericPhone(value: string): string {
    return value.replace(/[^0-9-]/g, '').replace(/-{2,}/g, '-').slice(0, 20);
  }

  private clearProfileMessages(): void {
    this.profileErrorMessage = '';
    this.profileSuccessMessage = '';
  }

  private clearPasswordMessages(): void {
    this.passwordErrorMessage = '';
    this.passwordSuccessMessage = '';
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
}
