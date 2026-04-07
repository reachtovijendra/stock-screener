import { Component, signal, effect, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="login-page">
      <!-- Animated background -->
      <div class="bg-pattern"></div>

      <!-- Show spinner while checking auth (OAuth callback) -->
      <div *ngIf="checkingAuth()" class="auth-loading">
        <div class="spinner"></div>
        <p>Signing you in...</p>
      </div>

      <div class="login-container" *ngIf="!checkingAuth()">
        <!-- Branding -->
        <div class="branding">
          <div class="logo">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none">
              <path d="M3 17L9 11L13 15L21 7" stroke="#3b82f6" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
              <path d="M17 7H21V11" stroke="#3b82f6" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
            <span class="logo-text">StockScreen</span>
          </div>
          <p class="tagline">Your day trade edge, powered by data</p>
        </div>

        <!-- Login Card -->
        <div class="login-card">
          <!-- Tabs -->
          <div class="tabs">
            <button
              class="tab" [class.active]="mode() === 'signin'"
              (click)="mode.set('signin'); error.set(null)">
              Sign In
            </button>
            <button
              class="tab" [class.active]="mode() === 'signup'"
              (click)="mode.set('signup'); error.set(null)">
              Create Account
            </button>
          </div>

          <!-- Forgot password mode -->
          <div *ngIf="mode() === 'forgot'" class="form-section">
            <p class="forgot-desc">Enter your email and we'll send you a reset link.</p>
            <div class="input-group">
              <label>Email</label>
              <input
                type="email"
                [(ngModel)]="email"
                placeholder="you@example.com"
                (keydown.enter)="handleForgot()"
                autofocus />
            </div>
            <button class="btn-primary" (click)="handleForgot()" [disabled]="loading()">
              {{ loading() ? 'Sending...' : 'Send Reset Link' }}
            </button>
            <button class="btn-link" (click)="mode.set('signin'); error.set(null)">
              Back to Sign In
            </button>
          </div>

          <!-- Sign In / Sign Up form -->
          <div *ngIf="mode() !== 'forgot'" class="form-section">
            <div *ngIf="message()" class="message success">{{ message() }}</div>
            <div *ngIf="error()" class="message error">{{ error() }}</div>

            <div class="input-group">
              <label>Email</label>
              <input
                type="email"
                [(ngModel)]="email"
                placeholder="you@example.com"
                (keydown.enter)="passwordInput.focus()"
                autofocus />
            </div>

            <div class="input-group">
              <label>Password</label>
              <div class="password-wrapper">
                <input
                  #passwordInput
                  [type]="showPassword() ? 'text' : 'password'"
                  [(ngModel)]="password"
                  placeholder="Enter password"
                  (keydown.enter)="handleSubmit()" />
                <button class="toggle-pw" (click)="showPassword.set(!showPassword())">
                  <i [class]="showPassword() ? 'pi pi-eye-slash' : 'pi pi-eye'"></i>
                </button>
              </div>
            </div>

            <button class="btn-primary" (click)="handleSubmit()" [disabled]="loading()">
              {{ loading()
                ? (mode() === 'signin' ? 'Signing in...' : 'Creating account...')
                : (mode() === 'signin' ? 'Sign In' : 'Create Account')
              }}
            </button>

            <div class="divider">
              <span>or continue with</span>
            </div>

            <button class="btn-google" (click)="handleGoogle()" [disabled]="loading()">
              <svg width="18" height="18" viewBox="0 0 24 24">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
              </svg>
              Sign in with Google
            </button>

            <button *ngIf="mode() === 'signin'" class="btn-link" (click)="mode.set('forgot'); error.set(null)">
              Forgot password?
            </button>
          </div>
        </div>

        <!-- Footer info -->
        <div class="footer-info">
          <span>Free access:</span> Screener · Breakouts · News · DMA
          <span class="separator">|</span>
          <span>Login for:</span> Day Trade Picks
        </div>
      </div>
    </div>
  `,
  styles: [`
    .login-page {
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      background: #0a0a0b;
      position: relative;
      overflow: hidden;
    }

    .bg-pattern {
      position: absolute;
      inset: 0;
      background:
        radial-gradient(ellipse at 20% 50%, rgba(59, 130, 246, 0.08) 0%, transparent 50%),
        radial-gradient(ellipse at 80% 20%, rgba(16, 185, 129, 0.06) 0%, transparent 50%),
        radial-gradient(ellipse at 50% 80%, rgba(139, 92, 246, 0.05) 0%, transparent 50%);
      animation: bgShift 20s ease-in-out infinite alternate;
    }

    @keyframes bgShift {
      0% { opacity: 0.7; transform: scale(1); }
      100% { opacity: 1; transform: scale(1.05); }
    }

    .login-container {
      position: relative;
      z-index: 1;
      width: 100%;
      max-width: 420px;
      padding: 24px;
    }

    .branding {
      text-align: center;
      margin-bottom: 32px;
    }

    .logo {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 10px;
      margin-bottom: 8px;
    }

    .logo-text {
      font-size: 24px;
      font-weight: 700;
      color: #f8fafc;
      letter-spacing: -0.5px;
    }

    .tagline {
      color: #64748b;
      font-size: 14px;
      margin: 0;
    }

    .login-card {
      background: #131416;
      border: 1px solid #1e1e22;
      border-radius: 16px;
      padding: 28px;
      box-shadow: 0 24px 48px rgba(0, 0, 0, 0.4);
    }

    .tabs {
      display: flex;
      gap: 4px;
      background: #0a0a0b;
      border-radius: 10px;
      padding: 4px;
      margin-bottom: 24px;
    }

    .tab {
      flex: 1;
      padding: 10px;
      border: none;
      border-radius: 8px;
      background: transparent;
      color: #64748b;
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s;
    }

    .tab.active {
      background: #1e1e22;
      color: #f8fafc;
    }

    .tab:hover:not(.active) {
      color: #94a3b8;
    }

    .form-section {
      display: flex;
      flex-direction: column;
      gap: 16px;
    }

    .input-group {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }

    .input-group label {
      font-size: 13px;
      font-weight: 500;
      color: #94a3b8;
    }

    .input-group input {
      width: 100%;
      padding: 12px 14px;
      background: #18191c;
      border: 1px solid #2a2a2e;
      border-radius: 10px;
      color: #f8fafc;
      font-size: 14px;
      font-family: inherit;
      outline: none;
      transition: border-color 0.2s;
      box-sizing: border-box;
    }

    .input-group input:focus {
      border-color: #3b82f6;
    }

    .input-group input::placeholder {
      color: #4a4a50;
    }

    .password-wrapper {
      position: relative;
    }

    .password-wrapper input {
      padding-right: 44px;
    }

    .toggle-pw {
      position: absolute;
      right: 8px;
      top: 50%;
      transform: translateY(-50%);
      background: none;
      border: none;
      color: #64748b;
      cursor: pointer;
      padding: 6px;
      font-size: 16px;
    }

    .toggle-pw:hover {
      color: #94a3b8;
    }

    .btn-primary {
      width: 100%;
      padding: 12px;
      background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);
      border: none;
      border-radius: 10px;
      color: #fff;
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s;
      font-family: inherit;
    }

    .btn-primary:hover:not(:disabled) {
      transform: translateY(-1px);
      box-shadow: 0 4px 16px rgba(59, 130, 246, 0.3);
    }

    .btn-primary:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }

    .divider {
      display: flex;
      align-items: center;
      gap: 12px;
      color: #4a4a50;
      font-size: 12px;
    }

    .divider::before,
    .divider::after {
      content: '';
      flex: 1;
      height: 1px;
      background: #1e1e22;
    }

    .btn-google {
      width: 100%;
      padding: 12px;
      background: #fff;
      border: none;
      border-radius: 10px;
      color: #1f2937;
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 10px;
      transition: all 0.2s;
      font-family: inherit;
    }

    .btn-google:hover:not(:disabled) {
      background: #f3f4f6;
      transform: translateY(-1px);
    }

    .btn-google:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }

    .btn-link {
      background: none;
      border: none;
      color: #3b82f6;
      font-size: 13px;
      cursor: pointer;
      padding: 4px;
      text-align: center;
      font-family: inherit;
    }

    .btn-link:hover {
      color: #60a5fa;
      text-decoration: underline;
    }

    .message {
      padding: 10px 14px;
      border-radius: 8px;
      font-size: 13px;
      line-height: 1.4;
    }

    .message.error {
      background: rgba(239, 68, 68, 0.1);
      border: 1px solid rgba(239, 68, 68, 0.2);
      color: #fca5a5;
    }

    .message.success {
      background: rgba(16, 185, 129, 0.1);
      border: 1px solid rgba(16, 185, 129, 0.2);
      color: #6ee7b7;
    }

    .forgot-desc {
      color: #94a3b8;
      font-size: 13px;
      margin: 0;
    }

    .footer-info {
      text-align: center;
      margin-top: 24px;
      font-size: 12px;
      color: #4a4a50;
      line-height: 1.6;
    }

    .footer-info span:first-child,
    .footer-info span:nth-child(3) {
      color: #64748b;
      font-weight: 600;
    }

    .separator {
      margin: 0 6px;
      color: #2a2a2e;
    }

    .auth-loading {
      position: relative;
      z-index: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 16px;
      color: #94a3b8;
      font-size: 14px;
    }

    .auth-loading p { margin: 0; }

    .spinner {
      width: 36px;
      height: 36px;
      border: 3px solid #1e1e22;
      border-top-color: #3b82f6;
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
    }

    @keyframes spin {
      to { transform: rotate(360deg); }
    }

    @media (max-width: 480px) {
      .login-container { padding: 16px; }
      .login-card { padding: 20px; }
    }
  `],
})
export class LoginComponent {
  email = '';
  password = '';
  mode = signal<'signin' | 'signup' | 'forgot'>('signin');
  loading = signal(false);
  error = signal<string | null>(null);
  message = signal<string | null>(null);
  showPassword = signal(false);
  checkingAuth = signal(true);

  private returnUrl: string;

  constructor(
    private auth: AuthService,
    private router: Router,
    private route: ActivatedRoute
  ) {
    // Restore return URL from query param or sessionStorage (survives OAuth round-trip)
    const queryReturn = this.route.snapshot.queryParams['returnUrl'];
    if (queryReturn) {
      this.returnUrl = queryReturn;
      sessionStorage.setItem('authReturnUrl', queryReturn);
    } else {
      this.returnUrl = sessionStorage.getItem('authReturnUrl') || '/recommendations';
    }

    // Watch for auth state changes (handles OAuth callback)
    effect(() => {
      if (this.auth.isAuthenticated()) {
        sessionStorage.removeItem('authReturnUrl');
        this.router.navigate([this.returnUrl]);
      }
    });

    // Give Supabase up to 2 seconds to restore session, then show form
    setTimeout(() => {
      if (!this.auth.isAuthenticated()) {
        this.checkingAuth.set(false);
      }
    }, 2000);
  }

  async handleSubmit() {
    if (!this.email || !this.password) {
      this.error.set('Please enter email and password.');
      return;
    }

    this.loading.set(true);
    this.error.set(null);
    this.message.set(null);

    const result = this.mode() === 'signin'
      ? await this.auth.signIn(this.email, this.password)
      : await this.auth.signUp(this.email, this.password);

    this.loading.set(false);

    if (result.error) {
      this.error.set(result.error);
    } else if (this.mode() === 'signup') {
      this.message.set('Account created! Check your email to confirm, then sign in.');
      this.mode.set('signin');
      this.password = '';
    } else {
      this.router.navigate([this.returnUrl]);
    }
  }

  async handleGoogle() {
    this.loading.set(true);
    this.error.set(null);
    const result = await this.auth.signInWithGoogle(this.returnUrl);
    this.loading.set(false);
    if (result.error) {
      this.error.set(result.error);
    }
    // Google OAuth redirects — no need to navigate manually
  }

  async handleForgot() {
    if (!this.email) {
      this.error.set('Please enter your email address.');
      return;
    }

    this.loading.set(true);
    this.error.set(null);
    const result = await this.auth.resetPassword(this.email);
    this.loading.set(false);

    if (result.error) {
      this.error.set(result.error);
    } else {
      this.message.set('Password reset email sent. Check your inbox.');
      this.mode.set('signin');
    }
  }
}
