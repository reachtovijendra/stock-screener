import { Injectable, signal, computed } from '@angular/core';
import { createClient, SupabaseClient, User, Session } from '@supabase/supabase-js';
import { environment } from '../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private supabase: SupabaseClient;
  private currentUser = signal<User | null>(null);

  readonly user = this.currentUser.asReadonly();
  readonly isAuthenticated = computed(() => !!this.currentUser());
  readonly userEmail = computed(() => this.currentUser()?.email ?? null);
  readonly userAvatar = computed(() => this.currentUser()?.user_metadata?.['avatar_url'] ?? null);
  readonly userName = computed(() =>
    this.currentUser()?.user_metadata?.['full_name'] ??
    this.currentUser()?.email?.split('@')[0] ?? null
  );

  get supabaseClient(): SupabaseClient { return this.supabase; }

  /** Resolves once the initial auth check is complete (session restored or confirmed empty) */
  readonly initialized: Promise<void>;

  constructor() {
    this.supabase = createClient(environment.supabaseUrl, environment.supabaseAnonKey, {
      auth: {
        storageKey: 'stockscreen-auth',
        flowType: 'pkce',
      },
    });

    // Listen for auth state changes
    this.supabase.auth.onAuthStateChange((_event, session) => {
      this.currentUser.set(session?.user ?? null);
    });

    // Check initial session — expose as a promise the guard can await
    this.initialized = this.supabase.auth.getSession().then(({ data: { session } }) => {
      this.currentUser.set(session?.user ?? null);
    });
  }

  async signUp(email: string, password: string): Promise<{ error: string | null }> {
    const { error } = await this.supabase.auth.signUp({ email, password });
    return { error: error?.message ?? null };
  }

  async signIn(email: string, password: string): Promise<{ error: string | null }> {
    const { error } = await this.supabase.auth.signInWithPassword({ email, password });
    return { error: error?.message ?? null };
  }

  async signInWithGoogle(returnUrl?: string): Promise<{ error: string | null }> {
    const redirectTo = window.location.origin + (returnUrl || '/recommendations');
    const { error } = await this.supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo },
    });
    return { error: error?.message ?? null };
  }

  async resetPassword(email: string): Promise<{ error: string | null }> {
    const { error } = await this.supabase.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin + '/login',
    });
    return { error: error?.message ?? null };
  }

  async signOut(): Promise<void> {
    await this.supabase.auth.signOut();
    window.location.href = '/';
  }
}
