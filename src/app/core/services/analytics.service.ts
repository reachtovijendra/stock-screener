import { Injectable, InjectionToken, NgZone, inject } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { filter } from 'rxjs';

import { environment } from '../../../environments/environment';

type AnalyticsProperty = string | number | boolean;
type AnalyticsProperties = Record<string, AnalyticsProperty | null | undefined>;

export type AnalyticsEventName =
  | '$pageview'
  | 'market_changed'
  | 'portfolio_projection_generated'
  | 'recommendations_viewed'
  | 'screener_run'
  | 'stock_detail_viewed'
  | 'watchlist_action';

export interface AnalyticsConfig {
  enabled: boolean;
  posthogKey: string;
  posthogHost: string;
}

export interface AnalyticsUser {
  id: string;
  email?: string | null;
  provider?: string | null;
}

export interface PostHogClient {
  init(token: string, config: Record<string, unknown>): void;
  capture(eventName: string, properties?: Record<string, AnalyticsProperty>): void;
  identify(distinctId: string, properties?: Record<string, AnalyticsProperty>): void;
  reset(): void;
}

type PostHogQueue = PostHogClient & {
  __SV?: number;
  _i?: unknown[];
  people?: unknown;
};

const POSTHOG_METHODS = [
  'capture',
  'identify',
  'reset',
] as const;

declare global {
  interface Window {
    posthog?: PostHogQueue;
  }
}

export const ANALYTICS_CONFIG = new InjectionToken<AnalyticsConfig>('ANALYTICS_CONFIG', {
  providedIn: 'root',
  factory: () => environment.analytics,
});

export const POSTHOG_CLIENT = new InjectionToken<PostHogClient>('POSTHOG_CLIENT', {
  providedIn: 'root',
  factory: () => createBrowserPostHogClient(),
});

function createBrowserPostHogClient(): PostHogClient {
  return {
    init(token: string, config: Record<string, unknown>): void {
      const win = getBrowserWindow();
      if (!win) return;

      installPostHogStub(win);
      win.posthog?.init(token, config);
    },
    capture(eventName: string, properties?: Record<string, AnalyticsProperty>): void {
      getBrowserWindow()?.posthog?.capture(eventName, properties);
    },
    identify(distinctId: string, properties?: Record<string, AnalyticsProperty>): void {
      getBrowserWindow()?.posthog?.identify(distinctId, properties);
    },
    reset(): void {
      getBrowserWindow()?.posthog?.reset();
    },
  };
}

function getBrowserWindow(): Window | null {
  return typeof window === 'undefined' ? null : window;
}

function installPostHogStub(win: Window): void {
  if (win.posthog?.__SV) return;

  const posthog = (Array.isArray(win.posthog) ? win.posthog : []) as unknown as PostHogQueue & unknown[];
  posthog._i = [];
  const queuedClient = posthog as unknown as Record<string, (...args: unknown[]) => void>;

  POSTHOG_METHODS.forEach(method => {
    queuedClient[method] = (...args: unknown[]) => {
      posthog.push([method, ...args]);
    };
  });

  posthog.init = (token: string, config: Record<string, unknown>) => {
    const script = win.document.createElement('script');
    script.type = 'text/javascript';
    script.async = true;
    script.crossOrigin = 'anonymous';
    const apiHost = String(config['api_host'] ?? 'https://us.i.posthog.com');
    script.src = apiHost.replace('.i.posthog.com', '-assets.i.posthog.com') + '/static/array.js';
    const firstScript = win.document.getElementsByTagName('script')[0];
    firstScript.parentNode?.insertBefore(script, firstScript);
    (posthog._i ??= []).push([token, config]);
  };

  posthog.__SV = 1;
  win.posthog = posthog;
}

@Injectable({ providedIn: 'root' })
export class AnalyticsService {
  private readonly config = inject(ANALYTICS_CONFIG);
  private readonly posthog = inject(POSTHOG_CLIENT);
  private readonly router = inject(Router);
  private readonly ngZone = inject(NgZone);
  private initialized = false;

  init(): void {
    if (this.initialized || !this.isEnabled()) return;

    this.ngZone.runOutsideAngular(() => {
      this.posthog.init(this.config.posthogKey, {
        api_host: this.config.posthogHost,
        defaults: '2026-01-30',
        autocapture: false,
        capture_pageview: false,
        disable_session_recording: true,
        advanced_disable_feature_flags: true,
      });

      this.router.events
        .pipe(filter((event): event is NavigationEnd => event instanceof NavigationEnd))
        .subscribe(event => this.capturePageView(event));
    });

    this.initialized = true;
  }

  capture(eventName: AnalyticsEventName, properties: AnalyticsProperties = {}): void {
    if (!this.initialized || !this.isEnabled()) return;
    this.posthog.capture(eventName, sanitizeProperties(properties));
  }

  identifyUser(user: AnalyticsUser): void {
    if (!this.initialized || !this.isEnabled()) return;

    this.posthog.identify(user.id, sanitizeProperties({
      email_domain: user.email?.split('@')[1]?.toLowerCase(),
      auth_provider: user.provider,
    }));
  }

  resetIdentity(): void {
    if (!this.initialized || !this.isEnabled()) return;
    this.posthog.reset();
  }

  private capturePageView(event: NavigationEnd): void {
    this.capture('$pageview', {
      path: event.urlAfterRedirects,
      url: getPageUrl(event.urlAfterRedirects),
    });
  }

  private isEnabled(): boolean {
    return this.config.enabled && this.config.posthogKey.trim().length > 0;
  }
}

function sanitizeProperties(properties: AnalyticsProperties): Record<string, AnalyticsProperty> {
  return Object.entries(properties).reduce<Record<string, AnalyticsProperty>>((acc, [key, value]) => {
    if (value !== null && value !== undefined) {
      acc[key] = value;
    }
    return acc;
  }, {});
}

function getPageUrl(path: string): string {
  const win = getBrowserWindow();
  return win ? `${win.location.origin}${path}` : path;
}
