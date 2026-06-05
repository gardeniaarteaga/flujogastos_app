import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';

import { getCurrentUserId } from '../shared/user-profile';

export const authGuard: CanActivateFn = () => {
  if (getCurrentUserId() > 0) {
    return true;
  }

  return inject(Router).createUrlTree(['/login']);
};
