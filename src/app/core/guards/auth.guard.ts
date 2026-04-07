import { inject } from '@angular/core';
import { CanActivateFn, Router, ActivatedRouteSnapshot, RouterStateSnapshot } from '@angular/router';
import { AuthService } from '../services/auth.service';

/**
 * Auth guard that waits for Supabase to process OAuth callbacks.
 * After Google OAuth, the URL contains #access_token=... which Supabase
 * needs a moment to process. We wait up to 2s before redirecting to login.
 */
export const authGuard: CanActivateFn = async (route: ActivatedRouteSnapshot, state: RouterStateSnapshot) => {
  const auth = inject(AuthService);
  const router = inject(Router);

  // If already authenticated, allow
  if (auth.isAuthenticated()) return true;

  // Check if this might be an OAuth callback (URL has hash with access_token)
  const hasOAuthHash = window.location.hash.includes('access_token');

  if (hasOAuthHash) {
    // Wait for Supabase to process the OAuth token
    for (let i = 0; i < 20; i++) {
      await new Promise(r => setTimeout(r, 100));
      if (auth.isAuthenticated()) return true;
    }
  }

  // Not authenticated — redirect to login with return URL
  router.navigate(['/login'], { queryParams: { returnUrl: state.url } });
  return false;
};
