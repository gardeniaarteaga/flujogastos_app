import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';

import { isAdminUser } from '../user-profile';

export const adminOnlyGuard: CanActivateFn = () => {
  if (isAdminUser()) {
    return true;
  }

  return inject(Router).createUrlTree(['/dashboard']);
};
