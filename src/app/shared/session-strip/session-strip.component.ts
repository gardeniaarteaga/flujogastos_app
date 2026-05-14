import { CommonModule } from '@angular/common';
import {
  Component,
  ElementRef,
  HostListener,
  OnDestroy,
  OnInit,
  inject,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';

import { CatalogosTransaccionService } from '../services/catalogos-transaccion.service';
import {
  NotificacionItem,
  NotificacionesService,
} from '../services/notificaciones.service';
import { clearUserProfile, loadUserProfile, saveUserProfile } from '../user-profile';

@Component({
  selector: 'app-session-strip',
  imports: [CommonModule, RouterLink],
  templateUrl: './session-strip.component.html',
  styleUrl: './session-strip.component.css',
})
export class SessionStripComponent implements OnInit, OnDestroy {
  private readonly router = inject(Router);
  private readonly hostElement = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly catalogosTransaccionService = inject(CatalogosTransaccionService);
  private readonly notificacionesService = inject(NotificacionesService);
  readonly userProfile = loadUserProfile();
  notifications: NotificacionItem[] = [];
  unreadNotifications = 0;
  notificationsOpen = false;
  isLoadingNotifications = false;
  private refreshTimer: ReturnType<typeof setInterval> | null = null;

  get userInitials(): string {
    return this.userProfile.fullName
      .split(' ')
      .filter((part) => part.length > 0)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? '')
      .join('');
  }

  ngOnInit(): void {
    void this.loadNotifications();
    this.refreshTimer = setInterval(() => {
      void this.loadNotifications();
    }, 45000);
  }

  ngOnDestroy(): void {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = null;
    }
  }

  @HostListener('document:click', ['$event'])
  handleDocumentClick(event: MouseEvent): void {
    if (!this.hostElement.nativeElement.contains(event.target as Node)) {
      this.notificationsOpen = false;
    }
  }

  async toggleNotifications(): Promise<void> {
    this.notificationsOpen = !this.notificationsOpen;

    if (this.notificationsOpen) {
      await this.loadNotifications();
    }
  }

  async openNotification(notification: NotificacionItem): Promise<void> {
    if (!notification.leida) {
      const updatedNotification = await this.notificacionesService.markAsRead(
        notification.id_notificacion,
      );

      this.notifications = this.notifications.map((currentNotification) =>
        currentNotification.id_notificacion === updatedNotification.id_notificacion
          ? updatedNotification
          : currentNotification,
      );
      this.unreadNotifications = Math.max(0, this.unreadNotifications - 1);
      this.syncNotificationsLabel();
    }

    this.notificationsOpen = false;
    await this.router.navigate(['/transacciones/listado']);
  }

  async markAllNotificationsAsRead(): Promise<void> {
    const unreadItems = this.notifications.filter((notification) => !notification.leida);

    if (unreadItems.length === 0) {
      return;
    }

    await this.notificacionesService.markAllAsRead();
    this.notifications = this.notifications.map((notification) => ({
      ...notification,
      leida: true,
      fecha_leida: notification.fecha_leida ?? new Date().toISOString(),
    }));
    this.unreadNotifications = 0;
    this.syncNotificationsLabel();
  }

  formatNotificationDate(value: string): string {
    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      return '';
    }

    return new Intl.DateTimeFormat('es-SV', {
      dateStyle: 'short',
      timeStyle: 'short',
    }).format(date);
  }

  async logout(): Promise<void> {
    this.catalogosTransaccionService.clearCache();
    clearUserProfile();
    await this.router.navigate(['/']);
  }

  private async loadNotifications(): Promise<void> {
    if (this.isLoadingNotifications) {
      return;
    }

    this.isLoadingNotifications = true;

    try {
      const resumen = await this.notificacionesService.loadResumen();
      this.notifications = resumen.items;
      this.unreadNotifications = resumen.pendientes;
      this.syncNotificationsLabel();
    } catch {
      this.notifications = [];
      this.unreadNotifications = 0;
      this.syncNotificationsLabel();
    } finally {
      this.isLoadingNotifications = false;
    }
  }

  private syncNotificationsLabel(): void {
    this.userProfile.notificationsLabel =
      this.unreadNotifications === 0
        ? 'Sin notificaciones nuevas'
        : this.unreadNotifications === 1
          ? 'Tienes 1 notificacion nueva'
          : `Tienes ${this.unreadNotifications} notificaciones nuevas`;

    saveUserProfile(this.userProfile);
  }
}
