import { Component, EventEmitter, Input, Output } from '@angular/core';
import { NgIf } from '@angular/common';

@Component({
  selector: 'app-maintenance-actions',
  standalone: true,
  imports: [NgIf],
  template: `
    <div class="icon-actions">
      <button
        type="button"
        class="icon-action-button detail"
        [attr.title]="detailTitle"
        [attr.aria-label]="detailTitle"
        (click)="detail.emit()"
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path
            d="M1.5 12s3.75-6.75 10.5-6.75S22.5 12 22.5 12s-3.75 6.75-10.5 6.75S1.5 12 1.5 12Z"
            fill="none"
            stroke="currentColor"
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="1.8"
          />
          <circle cx="12" cy="12" r="3.25" fill="none" stroke="currentColor" stroke-width="1.8" />
        </svg>
      </button>

      <button
        *ngIf="showEdit"
        type="button"
        class="icon-action-button edit"
        [disabled]="editDisabled"
        [attr.title]="editTitle"
        [attr.aria-label]="editTitle"
        (click)="edit.emit()"
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path
            d="m4.5 19.5 4.25-.8L18.5 8.95a1.59 1.59 0 0 0 0-2.24l-1.2-1.2a1.59 1.59 0 0 0-2.24 0L5.3 15.26l-.8 4.24Z"
            fill="none"
            stroke="currentColor"
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="1.8"
          />
          <path
            d="m13.75 6.75 3.5 3.5"
            fill="none"
            stroke="currentColor"
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="1.8"
          />
        </svg>
      </button>

      <button
        *ngIf="showDelete"
        type="button"
        class="icon-action-button delete"
        [disabled]="deleteDisabled"
        [attr.title]="deleteTitle"
        [attr.aria-label]="deleteTitle"
        (click)="remove.emit()"
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path
            d="M4.5 7.5h15"
            fill="none"
            stroke="currentColor"
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="1.8"
          />
          <path
            d="M9.5 3.75h5l.5 2.25h3.25v1.5l-.75 11a2.25 2.25 0 0 1-2.24 2.1H8.74A2.25 2.25 0 0 1 6.5 18.5l-.75-11V6h3.25l.5-2.25Z"
            fill="none"
            stroke="currentColor"
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="1.8"
          />
          <path
            d="M10 10.5v5M14 10.5v5"
            fill="none"
            stroke="currentColor"
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="1.8"
          />
        </svg>
      </button>
    </div>
  `,
  styles: [`
    .icon-actions {
      display: inline-flex;
      align-items: center;
      gap: 0.35rem;
      position: relative;
      z-index: 1;
    }

    .icon-action-button {
      width: 2.2rem;
      height: 2.2rem;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      padding: 0;
      border: 1px solid #d6dfec;
      border-radius: 999px;
      background: #ffffff;
      color: #48617f;
      cursor: pointer;
      transition: background-color 0.2s ease, border-color 0.2s ease, color 0.2s ease;
    }

    .icon-action-button svg {
      width: 1.35rem;
      height: 1.35rem;
      pointer-events: none;
    }

    .icon-action-button.detail:hover:not(:disabled),
    .icon-action-button.detail:focus-visible:not(:disabled) {
      background: #eef4ff;
      border-color: #bfd4ff;
      color: #2457b8;
    }

    .icon-action-button.edit:hover:not(:disabled),
    .icon-action-button.edit:focus-visible:not(:disabled) {
      background: #fff4e8;
      border-color: #f4c995;
      color: #b76416;
    }

    .icon-action-button.delete:hover:not(:disabled),
    .icon-action-button.delete:focus-visible:not(:disabled) {
      background: #fff0f1;
      border-color: #f2b8bf;
      color: #c62839;
    }

    .icon-action-button:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
  `],
})
export class MaintenanceActionsComponent {
  @Input() showEdit = true;
  @Input() showDelete = true;
  @Input() editDisabled = false;
  @Input() deleteDisabled = false;
  @Input() detailTitle = 'Detalle';
  @Input() editTitle = 'Editar';
  @Input() deleteTitle = 'Eliminar';

  @Output() readonly detail = new EventEmitter<void>();
  @Output() readonly edit = new EventEmitter<void>();
  @Output() readonly remove = new EventEmitter<void>();
}
