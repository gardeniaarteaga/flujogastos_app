import { CommonModule } from '@angular/common';
import {
  ChangeDetectorRef,
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
  private readonly notificationsAutoOpenStorageKey =
    'flujo-gastos.notifications.auto-open';
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly router = inject(Router);
  private readonly hostElement = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly catalogosTransaccionService = inject(CatalogosTransaccionService);
  private readonly notificacionesService = inject(NotificacionesService);
  private readonly notificationsLimit = 8;
  readonly userProfile = loadUserProfile();
  notifications: NotificacionItem[] = [];
  unreadNotifications = 0;
  notificationsOpen = false;
  isLoadingNotifications = false;
  private refreshTimer: ReturnType<typeof setInterval> | null = null;
  private destroyed = false;

  hasUnreadReceivedPaymentNotifications(): boolean {
    return this.notifications.some(
      (notification) => !notification.leida && this.isReceivedPaymentNotification(notification),
    );
  }

  hasUnreadAssignedPaymentNotifications(): boolean {
    return this.notifications.some(
      (notification) => !notification.leida && this.isAssignedPaymentNotification(notification),
    );
  }

  get userInitials(): string {
    return this.userProfile.fullName
      .split(' ')
      .filter((part) => part.length > 0)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? '')
      .join('');
  }

  ngOnInit(): void {
    void this.loadNotifications({ openAfterLoad: this.consumeNotificationsAutoOpenRequest() });
    this.refreshTimer = setInterval(() => {
      void this.loadNotifications();
    }, 45000);
  }

  ngOnDestroy(): void {
    this.destroyed = true;

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
    this.flushView();

    if (this.notificationsOpen) {
      await this.loadNotifications();
    }
  }

  async openNotification(notification: NotificacionItem): Promise<void> {
    if (!notification.leida) {
      await this.markNotificationAsRead(notification);
    }

    this.notificationsOpen = false;
    await this.router.navigate(
      this.resolveNotificationRoute(notification),
      this.resolveNotificationNavigationExtras(notification),
    );
  }

  async markNotificationAsRead(notification: NotificacionItem): Promise<void> {
    if (notification.leida) {
      return;
    }

    const updatedNotification = await this.notificacionesService.markAsRead(
      notification.id_notificacion,
    );

    this.notifications = this.notifications.filter(
      (currentNotification) =>
        currentNotification.id_notificacion !== updatedNotification.id_notificacion,
    );
    this.unreadNotifications = Math.max(0, this.unreadNotifications - 1);
    this.syncNotificationsLabel();
    this.flushView();
    await this.loadNotifications({ preserveStateOnError: true });
  }

  async markAllNotificationsAsRead(): Promise<void> {
    const unreadItems = this.notifications.filter((notification) => !notification.leida);

    if (unreadItems.length === 0) {
      return;
    }

    const result = await this.notificacionesService.markAllAsRead();
    const readIds = new Set(result.ids_notificacion);

    this.notifications = this.notifications.filter(
      (notification) => !readIds.has(notification.id_notificacion),
    );
    this.unreadNotifications = Math.max(0, this.unreadNotifications - result.updated);
    this.syncNotificationsLabel();
    this.flushView();
    await this.loadNotifications({ preserveStateOnError: true });
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
    this.clearNotificationsAutoOpenRequest();
    clearUserProfile();
    await this.router.navigate(['/']);
  }

  isReceivedPaymentNotificationItem(notification: NotificacionItem): boolean {
    return this.isReceivedPaymentNotification(notification);
  }

  isAssignedPaymentNotificationItem(notification: NotificacionItem): boolean {
    return this.isAssignedPaymentNotification(notification);
  }

  private async loadNotifications(
    options: { preserveStateOnError?: boolean; openAfterLoad?: boolean } = {},
  ): Promise<void> {
    if (this.isLoadingNotifications) {
      return;
    }

    this.isLoadingNotifications = true;

    try {
      const resumen = await this.notificacionesService.loadResumen(this.notificationsLimit);
      this.notifications = resumen.items;
      this.unreadNotifications = resumen.pendientes;
      this.syncNotificationsLabel();
      if (options.openAfterLoad) {
        this.notificationsOpen = true;
      }
      this.flushView();
    } catch {
      if (!options.preserveStateOnError) {
        this.notifications = [];
        this.unreadNotifications = 0;
        this.syncNotificationsLabel();
        this.flushView();
      }
    } finally {
      this.isLoadingNotifications = false;
      this.flushView();
    }
  }

  private consumeNotificationsAutoOpenRequest(): boolean {
    if (typeof sessionStorage === 'undefined') {
      return false;
    }

    const shouldAutoOpen =
      sessionStorage.getItem(this.notificationsAutoOpenStorageKey) === '1';

    if (shouldAutoOpen) {
      sessionStorage.removeItem(this.notificationsAutoOpenStorageKey);
    }

    return shouldAutoOpen;
  }

  private clearNotificationsAutoOpenRequest(): void {
    if (typeof sessionStorage === 'undefined') {
      return;
    }

    sessionStorage.removeItem(this.notificationsAutoOpenStorageKey);
  }

  private flushView(): void {
    if (this.destroyed) {
      return;
    }

    this.cdr.detectChanges();
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

  private resolveNotificationRoute(notification: NotificacionItem): string[] {
    if (
      (this.isReceivedPaymentNotification(notification) ||
        this.isAssignedPaymentNotification(notification)) &&
      notification.id_transaccion
    ) {
      return ['/resumen/detalle-transacciones'];
    }

    return ['/transacciones/listado'];
  }

  private resolveNotificationNavigationExtras(notification: NotificacionItem): {
    queryParams?: Record<string, string | number>;
  } {
    if (
      (this.isReceivedPaymentNotification(notification) ||
        this.isAssignedPaymentNotification(notification)) &&
      notification.id_transaccion
    ) {
      return {
        queryParams: {
          openPayment: 1,
          transactionId: notification.id_transaccion,
        },
      };
    }

    return {};
  }

  private isReceivedPaymentNotification(notification: NotificacionItem): boolean {
    const searchableText = this.normalizeNotificationText(
      `${notification.tipo} ${notification.titulo} ${notification.mensaje}`,
    );

    return searchableText.includes('pago recibido') || searchableText.includes('recibid');
  }

  private isAssignedPaymentNotification(notification: NotificacionItem): boolean {
    const searchableText = this.normalizeNotificationText(
      `${notification.tipo} ${notification.titulo} ${notification.mensaje}`,
    );

    return (
      searchableText.includes('pago asignado') ||
      searchableText.includes('cobro') ||
      searchableText.includes('asignad')
    );
  }

  private normalizeNotificationText(value: string): string {
    return value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim();
  }
}
