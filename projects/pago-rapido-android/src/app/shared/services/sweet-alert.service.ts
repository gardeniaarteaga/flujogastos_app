import { Injectable } from '@angular/core';
import Swal, { SweetAlertIcon } from 'sweetalert2';

export interface DetailRow {
  label: string;
  value: string | number | boolean | null | undefined;
}

@Injectable({ providedIn: 'root' })
export class SweetAlertService {
  async success(title: string, text: string): Promise<void> {
    await this.fire('success', title, text);
  }

  async error(title: string, text: string): Promise<void> {
    await this.fire('error', title, text);
  }

  async warning(title: string, text: string): Promise<void> {
    await this.fire('warning', title, text);
  }

  async info(title: string, text: string): Promise<void> {
    await this.fire('info', title, text);
  }

  async detail(
    title: string,
    rows: DetailRow[],
    options?: {
      subtitle?: string;
      width?: string;
      confirmButtonText?: string;
    },
  ): Promise<void> {
    const rowsHtml = rows
      .map((row) => {
        const label = this.escapeHtml(row.label);
        const value = this.escapeHtml(this.normalizeDetailValue(row.value));

        return `
          <div style="display:grid;gap:0.2rem;">
            <span style="font-size:0.78rem;font-weight:700;letter-spacing:0.04em;text-transform:uppercase;color:#6b7a90;">${label}</span>
            <span style="font-size:0.98rem;color:#23364d;white-space:pre-wrap;word-break:break-word;">${value}</span>
          </div>
        `;
      })
      .join('');

    const subtitleHtml = options?.subtitle
      ? `<p style="margin:0 0 1rem 0;color:#5c6b77;font-size:0.95rem;">${this.escapeHtml(options.subtitle)}</p>`
      : '';

    await Swal.fire({
      title,
      html: `
        <div style="text-align:left;">
          ${subtitleHtml}
          <div style="display:grid;gap:0.9rem;grid-template-columns:repeat(auto-fit, minmax(180px, 1fr));">
            ${rowsHtml}
          </div>
        </div>
      `,
      confirmButtonText: options?.confirmButtonText ?? 'Cerrar',
      confirmButtonColor: '#2563eb',
      width: options?.width ?? '48rem',
      heightAuto: false,
    });
  }

  async confirmDelete(entityLabel: string, entityName: string): Promise<boolean> {
    const result = await Swal.fire({
      title: 'Confirmar eliminacion',
      text: `Se eliminara ${entityLabel} "${entityName}".`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Si, eliminar',
      cancelButtonText: 'Cancelar',
      reverseButtons: true,
      confirmButtonColor: '#dc2626',
      cancelButtonColor: '#6b7280',
      heightAuto: false,
    });

    return result.isConfirmed;
  }

  async confirm(
    title: string,
    text: string,
    confirmButtonText: string,
    options?: {
      cancelButtonText?: string;
      confirmButtonColor?: string;
      cancelButtonColor?: string;
      icon?: SweetAlertIcon;
    },
  ): Promise<boolean> {
    const result = await Swal.fire({
      title,
      text,
      icon: options?.icon ?? 'warning',
      showCancelButton: true,
      confirmButtonText,
      cancelButtonText: options?.cancelButtonText ?? 'Cancelar',
      reverseButtons: true,
      confirmButtonColor: options?.confirmButtonColor ?? '#dc2626',
      cancelButtonColor: options?.cancelButtonColor ?? '#6b7280',
      heightAuto: false,
    });

    return result.isConfirmed;
  }

  private async fire(icon: SweetAlertIcon, title: string, text: string): Promise<void> {
    await Swal.fire({
      icon,
      title,
      text,
      confirmButtonText: 'Aceptar',
      confirmButtonColor: '#2563eb',
      heightAuto: false,
    });
  }

  private normalizeDetailValue(value: DetailRow['value']): string {
    if (value === null || value === undefined || value === '') {
      return '-';
    }

    if (typeof value === 'boolean') {
      return value ? 'Si' : 'No';
    }

    return String(value);
  }

  private escapeHtml(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
}
