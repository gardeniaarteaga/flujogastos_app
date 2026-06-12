import { Routes } from '@angular/router';
import { analisisFinancieroResolver } from './pages/analisis-financiero/analisis-financiero.resolver';
import { pagosEstadoResolver } from './pages/pagos-realizados/pagos-realizados.resolver';
import { adminOnlyGuard } from './shared/guards/admin-only.guard';

const loadLogin = () => import('./pages/login/login').then((module) => module.Login);
const loadDashboard = () =>
  import('./pages/dashboard/dashboard').then((module) => module.Dashboard);
const loadGastosPorCategoriaPage = () =>
  import('./pages/gastos-por-categoria/gastos-por-categoria.page').then(
    (module) => module.GastosPorCategoriaPage,
  );
const loadIngresoTransaccionesPage = () =>
  import('./pages/ingreso-transacciones/ingreso-transacciones.page').then(
    (module) => module.IngresoTransaccionesPage,
  );
const loadListadoTransaccionesPage = () =>
  import('./pages/listado-transacciones/listado-transacciones.page').then(
    (module) => module.ListadoTransaccionesPage,
  );
const loadResumenNotificacionesPage = () =>
  import('./pages/resumen-notificaciones/resumen-notificaciones.page').then(
    (module) => module.ResumenNotificacionesPage,
  );
const loadCategoriasPage = () =>
  import('./pages/categorias/categorias.page').then((module) => module.CategoriasPage);
const loadSubcategoriasPage = () =>
  import('./pages/subcategorias/subcategorias.page').then(
    (module) => module.SubcategoriasPage,
  );
const loadFormasPagoPage = () =>
  import('./pages/formas-pago/formas-pago.page').then((module) => module.FormasPagoPage);
const loadEntidadesFinancierasPage = () =>
  import('./pages/entidades-financieras/entidades-financieras.page').then(
    (module) => module.EntidadesFinancierasPage,
  );
const loadTipoEntidadPage = () =>
  import('./pages/tipo-entidad/tipo-entidad.page').then(
    (module) => module.TipoEntidadPage,
  );
const loadTipoProductoPage = () =>
  import('./pages/tipo-producto/tipo-producto.page').then(
    (module) => module.TipoProductoPage,
  );
const loadParticipantesPage = () =>
  import('./pages/participantes/participantes.page').then(
    (module) => module.ParticipantesPage,
  );
const loadUsuariosPage = () =>
  import('./pages/usuarios/usuarios.page').then((module) => module.UsuariosPage);
const loadPerfilPage = () =>
  import('./pages/perfil/perfil').then((module) => module.PerfilPage);

export const routes: Routes = [
  { path: '', loadComponent: loadLogin },
  { path: 'dashboard', loadComponent: loadDashboard },
  {
    path: 'ingresos/ingreso',
    loadComponent: loadIngresoTransaccionesPage,
    data: { transactionFlow: 'income' },
  },
  {
    path: 'gastos/individual',
    loadComponent: loadIngresoTransaccionesPage,
    data: { transactionFlow: 'expense', expenseMode: 'individual' },
  },
  {
    path: 'gastos/compartidos',
    loadComponent: loadIngresoTransaccionesPage,
    data: { transactionFlow: 'expense', expenseMode: 'shared' },
  },
  {
    path: 'transacciones/ingreso',
    redirectTo: 'gastos/individual',
    pathMatch: 'full',
  },
  {
    path: 'transacciones/listado',
    loadComponent: loadListadoTransaccionesPage,
    data: { viewMode: 'transacciones' },
  },
  {
    path: 'resumen/detalle-transacciones',
    loadComponent: loadListadoTransaccionesPage,
    data: { viewMode: 'detalle' },
  },
  {
    path: 'resumen/notificaciones',
    loadComponent: loadResumenNotificacionesPage,
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
    resolve: {
      initialData: pagosEstadoResolver,
    },
    loadComponent: () =>
      import('./pages/pagos-realizados/pagos-realizados.page').then(
        (module) => module.PagosRealizadosPage,
      ),
  },
  {
    path: 'reportes/gastos-por-categoria',
    resolve: {
      initialData: analisisFinancieroResolver,
    },
    loadComponent: loadGastosPorCategoriaPage,
  },
  { path: 'categorias', loadComponent: loadCategoriasPage },
  { path: 'subcategorias', loadComponent: loadSubcategoriasPage },
  { path: 'formas-pago', loadComponent: loadFormasPagoPage },
  { path: 'entidades-financieras', loadComponent: loadEntidadesFinancierasPage },
  { path: 'tipo-entidad', loadComponent: loadTipoEntidadPage },
  { path: 'tipo-producto', loadComponent: loadTipoProductoPage },
  { path: 'participantes', loadComponent: loadParticipantesPage },
  { path: 'usuarios', loadComponent: loadUsuariosPage, canActivate: [adminOnlyGuard] },
  { path: 'perfil', loadComponent: loadPerfilPage },
  { path: '**', redirectTo: '' },
];
