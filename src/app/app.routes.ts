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
    path: 'transacciones/ingreso',
    component: IngresoTransaccionesPage,
    data: { transactionFlow: 'expense' },
  },
  { path: 'transacciones/listado', component: ListadoTransaccionesPage },
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
