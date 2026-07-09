import { DecimalPipe, NgClass, NgFor, NgIf } from '@angular/common';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectorRef, Component, OnInit, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { catchError, firstValueFrom, of, timeout } from 'rxjs';

import { apiUrl } from '../../shared/config/api.config';
import { MaintenanceActionsComponent } from '../../shared/maintenance-actions/maintenance-actions.component';
import { SessionStripComponent } from '../../shared/session-strip/session-strip.component';
import { SweetAlertService } from '../../shared/services/sweet-alert.service';
import {
  EstadoCuenta,
  EstadoCuentaPayload,
  EstadoCuentaService,
} from '../../shared/services/estado-cuenta.service';
import { getCurrentUserId } from '../../shared/user-profile';

interface FormaPagoOption {
  id_forma: number;
  nombre_forma: string;
  dia_corte: number | null;
  dia_ultimo_pago: number | null;
  recibe_estado_cuenta: boolean | null;
  estado: boolean;
}

@Component({
  selector: 'app-estado-cuenta-page',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    RouterLinkActive,
    NgIf,
    NgFor,
    NgClass,
    DecimalPipe,
    SessionStripComponent,
    MaintenanceActionsComponent,
  ],
  templateUrl: './estado-cuenta.page.html',
  styleUrl: './estado-cuenta.page.css',
})
export class EstadoCuentaPage implements OnInit {
  readonly meses = [
    { value: 1, label: 'Enero' },
    { value: 2, label: 'Febrero' },
    { value: 3, label: 'Marzo' },
    { value: 4, label: 'Abril' },
    { value: 5, label: 'Mayo' },
    { value: 6, label: 'Junio' },
    { value: 7, label: 'Julio' },
    { value: 8, label: 'Agosto' },
    { value: 9, label: 'Septiembre' },
    { value: 10, label: 'Octubre' },
    { value: 11, label: 'Noviembre' },
    { value: 12, label: 'Diciembre' },
  ];

  private readonly fb = inject(FormBuilder);
  private readonly http = inject(HttpClient);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly alerts = inject(SweetAlertService);
  private readonly estadoCuentaService = inject(EstadoCuentaService);
  private readonly formasPagoUrl = apiUrl('formas-pago');
  private readonly currentUserId = getCurrentUserId();

  sidebarCollapsed = false;
  resumenOpen = true;
  maintenanceOpen = false;
  reportesOpen = false;

  loading = false;
  loadingFormasPago = false;
  saving = false;
  deletingId: number | null = null;
  editingId: number | null = null;
  viewOnly = false;
  errorMessage = '';
  successMessage = '';

  readonly pageSize = 6;
  currentPage = 1;
  selectedFilterFormaPago: number | null = null;
  selectedFilterMes: number | null = null;
  selectedFilterAnio: number | null = null;

  formasPago: FormaPagoOption[] = [];
  estadosCuenta: EstadoCuenta[] = [];
  ultimoResultado: EstadoCuenta | null = null;

  readonly today = new Date();

  readonly estadoCuentaForm = this.fb.group({
    id_metodo_pago: this.fb.control<number | null>(null, [Validators.required]),
    anio: this.fb.control(this.today.getFullYear(), [Validators.required, Validators.min(2000)]),
    mes: this.fb.control(this.today.getMonth() + 1, [Validators.required, Validators.min(1), Validators.max(12)]),
    saldo_anterior_capital: this.fb.control(0, [Validators.required]),
    saldo_anterior_intereses: this.fb.control(0, [Validators.required]),
    saldo_anterior_recargos: this.fb.control(0, [Validators.required]),
    saldo_anterior_comisiones: this.fb.control(0, [Validators.required]),
    pagos_acreditaciones: this.fb.control(0, [Validators.required]),
    devoluciones: this.fb.control(0, [Validators.required]),
    cuota_extrafinanciamiento: this.fb.control(0, [Validators.required]),
    cuota_infrafinanciamiento: this.fb.control(0, [Validators.required]),
    compras_retiros: this.fb.control(0, [Validators.required]),
    interes_corriente_bonificable: this.fb.control(0, [Validators.required]),
    interes_corriente: this.fb.control(0, [Validators.required]),
    recargos_comisiones: this.fb.control(0, [Validators.required]),
    debitos: this.fb.control(0, [Validators.required]),
    saldo_contado: this.fb.control(0, [Validators.required]),
    saldo_a_plazos: this.fb.control(0, [Validators.required]),
    pago_minimo: this.fb.control(0, [Validators.required]),
  });

  ngOnInit(): void {
    void this.loadData();
  }

  get isEditing(): boolean {
    return this.editingId !== null;
  }

  get formasPagoConHistorial(): Array<{ id_metodo_pago: number; nombre_forma: string }> {
    const mapa = new Map<number, string>();

    for (const item of this.estadosCuenta) {
      if (!mapa.has(item.id_metodo_pago)) {
        mapa.set(item.id_metodo_pago, item.nombre_forma);
      }
    }

    return Array.from(mapa.entries())
      .map(([id_metodo_pago, nombre_forma]) => ({ id_metodo_pago, nombre_forma }))
      .sort((a, b) => a.nombre_forma.localeCompare(b.nombre_forma));
  }

  get aniosConHistorial(): number[] {
    return Array.from(new Set(this.estadosCuenta.map((item) => item.anio))).sort(
      (a, b) => b - a,
    );
  }

  get filteredEstadosCuenta(): EstadoCuenta[] {
    return this.estadosCuenta.filter((item) => {
      if (this.selectedFilterFormaPago !== null && item.id_metodo_pago !== this.selectedFilterFormaPago) {
        return false;
      }

      if (this.selectedFilterMes !== null && item.mes !== this.selectedFilterMes) {
        return false;
      }

      if (this.selectedFilterAnio !== null && item.anio !== this.selectedFilterAnio) {
        return false;
      }

      return true;
    });
  }

  get totalPages(): number {
    return Math.max(1, Math.ceil(this.filteredEstadosCuenta.length / this.pageSize));
  }

  get paginatedEstadosCuenta(): EstadoCuenta[] {
    const startIndex = (this.currentPage - 1) * this.pageSize;
    return this.filteredEstadosCuenta.slice(startIndex, startIndex + this.pageSize);
  }

  get pageNumbers(): number[] {
    return Array.from({ length: this.totalPages }, (_, index) => index + 1);
  }

  setFilterFormaPago(idMetodoPago: number | null): void {
    if (this.selectedFilterFormaPago === idMetodoPago) {
      return;
    }

    this.selectedFilterFormaPago = idMetodoPago;
    this.currentPage = 1;
  }

  onFilterMesChange(value: string): void {
    const parsed = Number(value);
    this.selectedFilterMes = Number.isInteger(parsed) && parsed >= 1 && parsed <= 12 ? parsed : null;
    this.currentPage = 1;
  }

  onFilterAnioChange(value: string): void {
    const parsed = Number(value);
    this.selectedFilterAnio = Number.isInteger(parsed) && parsed > 0 ? parsed : null;
    this.currentPage = 1;
  }

  clearPeriodoFilter(): void {
    this.selectedFilterMes = null;
    this.selectedFilterAnio = null;
    this.currentPage = 1;
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

  get resolvedPeriodoLabel(): string {
    const idMetodoPago = this.estadoCuentaForm.controls.id_metodo_pago.value;
    const anio = this.estadoCuentaForm.controls.anio.value;
    const mes = this.estadoCuentaForm.controls.mes.value;

    if (!idMetodoPago || !anio || !mes) {
      return 'Selecciona forma de pago, mes y anio para ver el periodo.';
    }

    const forma = this.formasPago.find((item) => item.id_forma === idMetodoPago);
    const diaCorte = forma?.dia_corte ?? 31;
    const fin = this.buildFechaCorte(anio, mes, diaCorte);
    const mesAnterior = new Date(anio, mes - 2, 1);
    const inicioAnclado = this.buildFechaCorte(
      mesAnterior.getFullYear(),
      mesAnterior.getMonth() + 1,
      diaCorte,
    );
    const inicio = new Date(inicioAnclado);
    inicio.setDate(inicio.getDate() + 1);

    return `Del ${this.formatDateLabel(inicio)} al ${this.formatDateLabel(fin)}`;
  }

  get fechaLimitePagoLabel(): string {
    const idMetodoPago = this.estadoCuentaForm.controls.id_metodo_pago.value;
    const anio = this.estadoCuentaForm.controls.anio.value;
    const mes = this.estadoCuentaForm.controls.mes.value;

    if (!idMetodoPago || !anio || !mes) {
      return '';
    }

    const forma = this.formasPago.find((item) => item.id_forma === idMetodoPago);
    const diaUltimoPago = forma?.dia_ultimo_pago;

    if (!diaUltimoPago) {
      return '';
    }

    const siguienteMesAnclado = new Date(anio, mes, 1);
    const fechaLimite = this.buildFechaCorte(
      siguienteMesAnclado.getFullYear(),
      siguienteMesAnclado.getMonth() + 1,
      diaUltimoPago,
    );

    return this.formatDateLabel(fechaLimite);
  }

  async loadData(): Promise<void> {
    this.errorMessage = '';
    await Promise.all([this.loadFormasPago(), this.loadEstadosCuenta()]);
  }

  async onSubmit(): Promise<void> {
    if (this.viewOnly) {
      return;
    }

    this.successMessage = '';
    this.errorMessage = '';

    if (this.estadoCuentaForm.invalid) {
      this.estadoCuentaForm.markAllAsTouched();
      await this.alerts.warning(
        'Formulario incompleto',
        'Completa todos los campos del estado de cuenta antes de continuar.',
      );
      return;
    }

    const formValue = this.estadoCuentaForm.getRawValue();
    const payload: EstadoCuentaPayload = {
      id_metodo_pago: formValue.id_metodo_pago!,
      anio: formValue.anio!,
      mes: formValue.mes!,
      saldo_anterior_capital: formValue.saldo_anterior_capital!,
      saldo_anterior_intereses: formValue.saldo_anterior_intereses!,
      saldo_anterior_recargos: formValue.saldo_anterior_recargos!,
      saldo_anterior_comisiones: formValue.saldo_anterior_comisiones!,
      pagos_acreditaciones: formValue.pagos_acreditaciones!,
      devoluciones: formValue.devoluciones!,
      cuota_extrafinanciamiento: formValue.cuota_extrafinanciamiento!,
      cuota_infrafinanciamiento: formValue.cuota_infrafinanciamiento!,
      compras_retiros: formValue.compras_retiros!,
      interes_corriente_bonificable: formValue.interes_corriente_bonificable!,
      interes_corriente: formValue.interes_corriente!,
      recargos_comisiones: formValue.recargos_comisiones!,
      debitos: formValue.debitos!,
      saldo_contado: formValue.saldo_contado!,
      saldo_a_plazos: formValue.saldo_a_plazos!,
      pago_minimo: formValue.pago_minimo!,
    };

    this.saving = true;

    try {
      const resultado = await this.estadoCuentaService.saveEstadoCuenta(payload, this.editingId);
      this.ultimoResultado = resultado;
      this.successMessage = this.isEditing
        ? 'Estado de cuenta actualizado correctamente.'
        : 'Estado de cuenta guardado correctamente.';
      await this.alerts.success('Estado de cuenta guardado', this.successMessage);
      this.resetForm();
      void this.loadEstadosCuenta();
    } catch (error) {
      this.errorMessage = this.getErrorMessage(error, 'No se pudo guardar el estado de cuenta.');
      await this.alerts.error('No se pudo guardar', this.errorMessage);
      console.error(error);
    } finally {
      this.saving = false;
    }
  }

  verEstadoCuentaDetalle(item: EstadoCuenta): void {
    this.editingId = null;
    this.viewOnly = true;
    this.successMessage = '';
    this.errorMessage = '';
    this.populateForm(item);
    this.estadoCuentaForm.disable();
  }

  editEstadoCuenta(item: EstadoCuenta): void {
    this.editingId = item.id_estado_cuenta;
    this.viewOnly = false;
    this.successMessage = '';
    this.errorMessage = '';
    this.populateForm(item);
    this.estadoCuentaForm.enable();
  }

  private populateForm(item: EstadoCuenta): void {
    this.ultimoResultado = item;
    this.estadoCuentaForm.reset({
      id_metodo_pago: item.id_metodo_pago,
      anio: item.anio,
      mes: item.mes,
      saldo_anterior_capital: item.saldo_anterior_capital,
      saldo_anterior_intereses: item.saldo_anterior_intereses,
      saldo_anterior_recargos: item.saldo_anterior_recargos,
      saldo_anterior_comisiones: item.saldo_anterior_comisiones,
      pagos_acreditaciones: item.pagos_acreditaciones,
      devoluciones: item.devoluciones,
      cuota_extrafinanciamiento: item.cuota_extrafinanciamiento,
      cuota_infrafinanciamiento: item.cuota_infrafinanciamiento,
      compras_retiros: item.compras_retiros,
      interes_corriente_bonificable: item.interes_corriente_bonificable,
      interes_corriente: item.interes_corriente,
      recargos_comisiones: item.recargos_comisiones,
      debitos: item.debitos,
      saldo_contado: item.saldo_contado,
      saldo_a_plazos: item.saldo_a_plazos,
      pago_minimo: item.pago_minimo,
    });
  }

  cancelEdit(): void {
    this.successMessage = '';
    this.errorMessage = '';
    this.ultimoResultado = null;
    this.resetForm();
  }

  async removeEstadoCuenta(item: EstadoCuenta): Promise<void> {
    const confirmed = await this.alerts.confirmDelete(
      'el estado de cuenta',
      `${this.getMesLabel(item.mes)} ${item.anio} - ${item.nombre_forma}`,
    );

    if (!confirmed) {
      return;
    }

    this.deletingId = item.id_estado_cuenta;

    try {
      await this.estadoCuentaService.deleteEstadoCuenta(item.id_estado_cuenta);
      this.estadosCuenta = this.estadosCuenta.filter(
        (registro) => registro.id_estado_cuenta !== item.id_estado_cuenta,
      );
      this.currentPage = Math.min(this.currentPage, this.totalPages);

      if (this.ultimoResultado?.id_estado_cuenta === item.id_estado_cuenta) {
        this.ultimoResultado = null;
      }

      if (this.editingId === item.id_estado_cuenta) {
        this.resetForm();
      }

      await this.alerts.success('Estado de cuenta eliminado', 'El registro se elimino correctamente.');
    } catch (error) {
      this.errorMessage = this.getErrorMessage(error, 'No se pudo eliminar el estado de cuenta.');
      await this.alerts.error('No se pudo eliminar', this.errorMessage);
      console.error(error);
    } finally {
      this.deletingId = null;
    }
  }

  getMesLabel(mes: number): string {
    return this.meses.find((item) => item.value === mes)?.label ?? String(mes);
  }

  private resetForm(): void {
    this.editingId = null;
    this.viewOnly = false;
    this.estadoCuentaForm.enable();
    this.estadoCuentaForm.reset({
      id_metodo_pago: null,
      anio: this.today.getFullYear(),
      mes: this.today.getMonth() + 1,
      saldo_anterior_capital: 0,
      saldo_anterior_intereses: 0,
      saldo_anterior_recargos: 0,
      saldo_anterior_comisiones: 0,
      pagos_acreditaciones: 0,
      devoluciones: 0,
      cuota_extrafinanciamiento: 0,
      cuota_infrafinanciamiento: 0,
      compras_retiros: 0,
      interes_corriente_bonificable: 0,
      interes_corriente: 0,
      recargos_comisiones: 0,
      debitos: 0,
      saldo_contado: 0,
      saldo_a_plazos: 0,
      pago_minimo: 0,
    });
  }

  private async loadFormasPago(): Promise<void> {
    this.loadingFormasPago = true;

    try {
      const data = await firstValueFrom(
        this.http
          .get<FormaPagoOption[]>(this.formasPagoUrl, { params: { id_usuario: this.currentUserId } })
          .pipe(
            timeout(10000),
            catchError(() => of(null)),
          ),
      );

      this.formasPago = (data ?? []).filter((forma) => forma.estado && forma.recibe_estado_cuenta);

      if (data === null) {
        this.errorMessage = 'No se pudieron cargar las formas de pago.';
      }
    } finally {
      this.loadingFormasPago = false;
      this.cdr.detectChanges();
    }
  }

  private async loadEstadosCuenta(): Promise<void> {
    this.loading = true;

    try {
      this.estadosCuenta = await this.estadoCuentaService.loadEstadosCuenta();
      this.currentPage = 1;
    } catch (error) {
      this.estadosCuenta = [];
      this.currentPage = 1;
      this.errorMessage = this.getErrorMessage(error, 'No se pudieron cargar los estados de cuenta.');
      console.error(error);
    } finally {
      this.loading = false;
      this.cdr.detectChanges();
    }
  }

  private buildFechaCorte(anio: number, mes: number, diaCorte: number): Date {
    const ultimoDiaDelMes = new Date(anio, mes, 0).getDate();
    const dia = Math.min(diaCorte, ultimoDiaDelMes);
    return new Date(anio, mes - 1, dia);
  }

  private formatDateLabel(date: Date): string {
    return date.toLocaleDateString('es-SV', { day: '2-digit', month: '2-digit', year: 'numeric' });
  }

  private getErrorMessage(error: unknown, fallback: string): string {
    if (error instanceof HttpErrorResponse) {
      const backendMessage = error.error?.message;

      if (Array.isArray(backendMessage) && backendMessage.length > 0) {
        return backendMessage.join(' ');
      }

      if (typeof backendMessage === 'string' && backendMessage.trim()) {
        return backendMessage;
      }
    }

    return fallback;
  }
}
