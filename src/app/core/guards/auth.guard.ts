import { inject } from '@angular/core';
import { CanActivateFn, Router, ActivatedRouteSnapshot, RouterStateSnapshot } from '@angular/router';
import { AuthService } from '../services/auth.service';

/**
 * Auth guard that waits for Supabase to finish initializing before checking.
 * This ensures the OAuth callback token is processed before we decide to redirect.
 */
export const authGuard: CanActivateFn = async (route: ActivatedRouteSnapshot, state: RouterStateSnapshot) => {
  const auth = inject(AuthService);
  const router = inject(Router);

  // Wait for Supabase to finish restoring session (handles OAuth callbacks)
  await auth.initialized;

  if (auth.isAuthenticated()) return true;

  // Store the target URL so login can redirect back after auth
  sessionStorage.setItem('authReturnUrl', state.url);
  router.navigate(['/login'], { queryParams: { returnUrl: state.url } });
  return false;
};
