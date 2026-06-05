export interface UserProfile {
  id_usuario: number;
  id_rol: number | null;
  username: string;
  fullName: string;
  email: string;
  role: string;
  celular: string;
  country: string;
  areaCode: string;
  city: string;
  bio: string;
  notificationsLabel: string;
}

export interface SeedUserProfileOptions {
  idUsuario?: number;
  fullName?: string | null;
  idRol?: number | null;
  celular?: string | null;
  country?: string | null;
  areaCode?: string | null;
  city?: string | null;
}

const USER_PROFILE_STORAGE_KEY = 'flujo-gastos.user-profile';

function createDefaultProfile(email = 'usuario@empresa.com', idUsuario = 0): UserProfile {
  return {
    id_usuario: idUsuario,
    id_rol: null,
    username: email,
    fullName: 'Usuario de Flujo',
    email,
    role: 'Usuario',
    celular: '',
    country: '',
    areaCode: '',
    city: '',
    bio: 'Completa tu perfil para personalizar tu experiencia en el sistema.',
    notificationsLabel: 'Sin notificaciones nuevas',
  };
}

export function loadUserProfile(fallbackEmail?: string): UserProfile {
  const defaultProfile = createDefaultProfile(fallbackEmail);

  if (typeof localStorage === 'undefined') {
    return defaultProfile;
  }

  try {
    const rawProfile = localStorage.getItem(USER_PROFILE_STORAGE_KEY);

    if (!rawProfile) {
      return defaultProfile;
    }

    const parsedProfile = JSON.parse(rawProfile) as Partial<UserProfile> & {
      phone?: string;
      pais?: string;
      codigo_area?: string;
      ciudad?: string;
    };

    return {
      ...defaultProfile,
      ...parsedProfile,
      celular:
        typeof parsedProfile.celular === 'string'
          ? parsedProfile.celular
          : typeof parsedProfile.phone === 'string'
            ? parsedProfile.phone
            : defaultProfile.celular,
      id_usuario:
        typeof parsedProfile.id_usuario === 'number' && parsedProfile.id_usuario > 0
          ? parsedProfile.id_usuario
          : defaultProfile.id_usuario,
      id_rol: typeof parsedProfile.id_rol === 'number' ? parsedProfile.id_rol : defaultProfile.id_rol,
      username: parsedProfile.username || parsedProfile.email || defaultProfile.username,
      email: parsedProfile.email || defaultProfile.email,
      country:
        typeof parsedProfile.country === 'string'
          ? parsedProfile.country
          : typeof parsedProfile.pais === 'string'
            ? parsedProfile.pais
            : defaultProfile.country,
      areaCode:
        typeof parsedProfile.areaCode === 'string'
          ? parsedProfile.areaCode
          : typeof parsedProfile.codigo_area === 'string'
            ? parsedProfile.codigo_area
            : defaultProfile.areaCode,
      city:
        typeof parsedProfile.city === 'string'
          ? parsedProfile.city
          : typeof parsedProfile.ciudad === 'string'
            ? parsedProfile.ciudad
            : defaultProfile.city,
    };
  } catch {
    return defaultProfile;
  }
}

export function saveUserProfile(profile: UserProfile): void {
  if (typeof localStorage === 'undefined') {
    return;
  }

  localStorage.setItem(USER_PROFILE_STORAGE_KEY, JSON.stringify(profile));
}

export function clearUserProfile(): void {
  if (typeof localStorage === 'undefined') {
    return;
  }

  localStorage.removeItem(USER_PROFILE_STORAGE_KEY);
}

export function seedUserProfileFromLogin(
  email: string,
  options: SeedUserProfileOptions = {},
): UserProfile {
  const currentProfile = loadUserProfile(email);
  const nextProfile: UserProfile = {
    ...currentProfile,
    id_usuario: options.idUsuario ?? 1,
    id_rol: options.idRol ?? null,
    username: email,
    email,
    role: options.idRol === 1 ? 'Administrador' : 'Usuario',
    fullName:
      options.fullName?.trim() ||
      (currentProfile.fullName === 'Usuario de Flujo'
        ? email.split('@')[0].replace(/[._-]+/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase())
        : currentProfile.fullName),
    celular: options.celular?.trim() || currentProfile.celular,
    country: options.country?.trim() || currentProfile.country,
    areaCode: options.areaCode?.trim() || currentProfile.areaCode,
    city: options.city?.trim() || currentProfile.city,
  };

  saveUserProfile(nextProfile);

  return nextProfile;
}

export function getCurrentUserId(): number {
  return loadUserProfile().id_usuario;
}

export function getCurrentUserRoleId(): number | null {
  return loadUserProfile().id_rol;
}

export function isAdminUser(): boolean {
  const profile = loadUserProfile();
  return profile.id_rol === 1 || profile.role === 'Administrador';
}
