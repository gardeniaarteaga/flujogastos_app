import { Routes } from '@angular/router';
import { Login } from './pages/login/login';
import { Dashboard } from './pages/dashboard/dashboard';
import { CategoriasPage } from './pages/categorias/categorias.page';
import { SubcategoriasPage } from './pages/subcategorias/subcategorias.page';
import { PerfilPage } from './pages/perfil/perfil';
import { FormasPagoPage } from './pages/formas-pago/formas-pago.page';
import { EntidadesFinancierasPage } from './pages/entidades-financieras/entidades-financieras.page';
import { TipoEntidadPage } from './pages/tipo-entidad/tipo-entidad.page';
import { ParticipantesPage } from './pages/participantes/participantes.page';
import { UsuariosPage } from './pages/usuarios/usuarios.page';
import { IngresoTransaccionesPage } from './pages/ingreso-transacciones/ingreso-transacciones.page';
import { ListadoTransaccionesPage } from './pages/listado-transacciones/listado-transacciones.page';
import { TipoProductoPage } from './pages/tipo-producto/tipo-producto.page';
import { ResumenNotificacionesPage } from './pages/resumen-notificaciones/resumen-notificaciones.page';
import { analisisFinancieroResolver } from './pages/analisis-financiero/analisis-financiero.resolver';
import { adminOnlyGuard } from './shared/guards/admin-only.guard';

export const routes: Routes = [
  { path: '', component: Login },
  { path: 'dashboard', component: Dashboard },
  {
    path: 'ingresos/ingreso',
    component: IngresoTransaccionesPage,
    data: { transactionFlow: 'income' },
  },
  {
    path: 'gastos/individual',
    component: IngresoTransaccionesPage,
    data: { transactionFlow: 'expense', expenseMode: 'individual' },
  },
  {
    path: 'gastos/compartidos',
    component: IngresoTransaccionesPage,
    data: { transactionFlow: 'expense', expenseMode: 'shared' },
  },
  {
    path: 'transacciones/ingreso',
    redirectTo: 'gastos/individual',
    pathMatch: 'full',
  },
  {
    path: 'transacciones/listado',
    component: ListadoTransaccionesPage,
    data: { viewMode: 'transacciones' },
  },
  {
    path: 'resumen/detalle-transacciones',
    component: ListadoTransaccionesPage,
    data: { viewMode: 'detalle' },
  },
  {
    path: 'resumen/notificaciones',
    component: ResumenNotificacionesPage,
  },
  {
    path: 'reportes/analisis-financiero',
    resolve: {
      initialData: analisisFinancieroResolver,
    },
    loadComponent: () =>
      import('./pages/analisis-financiero/analisis-financiero.page').then(
        (module) => module.AnalisisFinancieroPage,
      ),
  },
  {
    path: 'reportes/pagos-realizados',
    loadComponent: () =>
      import('./pages/pagos-realizados/pagos-realizados.page').then(
        (module) => module.PagosRealizadosPage,
      ),
  },
  { path: 'categorias', component: CategoriasPage },
  { path: 'subcategorias', component: SubcategoriasPage },
  { path: 'formas-pago', component: FormasPagoPage },
  { path: 'entidades-financieras', component: EntidadesFinancierasPage },
  { path: 'tipo-entidad', component: TipoEntidadPage },
  { path: 'tipo-producto', component: TipoProductoPage },
  { path: 'participantes', component: ParticipantesPage },
  { path: 'usuarios', component: UsuariosPage, canActivate: [adminOnlyGuard] },
  { path: 'perfil', component: PerfilPage },
  { path: '**', redirectTo: '' },
];
