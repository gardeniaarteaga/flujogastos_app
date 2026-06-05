import { Routes } from '@angular/router';

import { authGuard } from './guards/auth.guard';
import { Login } from './pages/login/login';
import { QuickPayPage } from './pages/quick-pay/quick-pay.page';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'pago-rapido' },
  { path: 'login', component: Login },
  { path: 'pago-rapido', component: QuickPayPage, canActivate: [authGuard] },
  { path: '**', redirectTo: 'pago-rapido' },
];
