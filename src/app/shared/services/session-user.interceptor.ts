import { HttpInterceptorFn } from '@angular/common/http';

import { getCurrentUserId } from '../user-profile';

export const sessionUserInterceptor: HttpInterceptorFn = (req, next) => {
  const currentUserId = getCurrentUserId();
  const isApiRequest = req.url.startsWith('http://localhost:3001/api/');
  const alreadyHasUserParam = req.params.has('id_usuario');

  if (!isApiRequest || currentUserId <= 0 || alreadyHasUserParam) {
    return next(req);
  }

  return next(
    req.clone({
      setHeaders: {
        'x-user-id': String(currentUserId),
      },
    }),
  );
};
