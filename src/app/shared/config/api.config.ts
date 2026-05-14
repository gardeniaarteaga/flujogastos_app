import { environment } from '../../../environments/environment';

type AppRuntimeConfig = {
  apiBaseUrl?: string;
};

declare global {
  interface Window {
    __APP_CONFIG__?: AppRuntimeConfig;
  }
}

const normalizeBaseUrl = (url: string): string => url.replace(/\/+$/, '');

export const API_BASE_URL = normalizeBaseUrl(
  window.__APP_CONFIG__?.apiBaseUrl || environment.apiBaseUrl,
);

export const apiUrl = (...segments: string[]): string => {
  const path = segments
    .filter(Boolean)
    .map((segment) => segment.replace(/^\/+|\/+$/g, ''))
    .join('/');

  return path ? `${API_BASE_URL}/${path}` : API_BASE_URL;
};

export const isApiUrl = (url: string): boolean =>
  url === API_BASE_URL || url.startsWith(`${API_BASE_URL}/`);
