import { TestBed } from '@angular/core/testing';
import { NavigationEnd, Router } from '@angular/router';
import { Subject } from 'rxjs';

import {
  ANALYTICS_CONFIG,
  AnalyticsService,
  POSTHOG_CLIENT,
  PostHogClient,
} from './analytics.service';

describe('AnalyticsService', () => {
  let routerEvents: Subject<NavigationEnd>;
  let posthog: jasmine.SpyObj<PostHogClient>;

  beforeEach(() => {
    routerEvents = new Subject<NavigationEnd>();
    posthog = jasmine.createSpyObj<PostHogClient>('posthog', [
      'capture',
      'identify',
      'init',
      'reset',
    ]);

    TestBed.configureTestingModule({
      providers: [
        AnalyticsService,
        {
          provide: ANALYTICS_CONFIG,
          useValue: {
            enabled: true,
            posthogKey: 'ph_test_key',
            posthogHost: 'https://us.i.posthog.com',
          },
        },
        { provide: POSTHOG_CLIENT, useValue: posthog },
        { provide: Router, useValue: { events: routerEvents.asObservable() } },
      ],
    });
  });

  it('initializes PostHog with cost-control defaults', () => {
    TestBed.inject(AnalyticsService).init();

    expect(posthog.init).toHaveBeenCalledOnceWith('ph_test_key', jasmine.objectContaining({
      api_host: 'https://us.i.posthog.com',
      autocapture: false,
      capture_pageview: false,
      disable_session_recording: true,
      advanced_disable_feature_flags: true,
    }));
  });

  it('captures SPA page views from Angular navigation events', () => {
    const service = TestBed.inject(AnalyticsService);
    service.init();

    routerEvents.next(new NavigationEnd(1, '/recommendations', '/recommendations'));

    expect(posthog.capture).toHaveBeenCalledWith('$pageview', jasmine.objectContaining({
      path: '/recommendations',
      url: jasmine.stringMatching(/\/recommendations$/),
    }));
  });

  it('does not initialize or capture events when analytics is disabled', () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        AnalyticsService,
        {
          provide: ANALYTICS_CONFIG,
          useValue: {
            enabled: false,
            posthogKey: 'ph_test_key',
            posthogHost: 'https://us.i.posthog.com',
          },
        },
        { provide: POSTHOG_CLIENT, useValue: posthog },
        { provide: Router, useValue: { events: routerEvents.asObservable() } },
      ],
    });

    const service = TestBed.inject(AnalyticsService);
    service.init();
    service.capture('screener_run', { market: 'US' });

    expect(posthog.init).not.toHaveBeenCalled();
    expect(posthog.capture).not.toHaveBeenCalled();
  });

  it('captures named product events with sanitized properties', () => {
    const service = TestBed.inject(AnalyticsService);
    service.init();

    service.capture('market_changed', {
      market: 'IN',
      previousMarket: undefined,
      resultCount: 25,
      emptyValue: null,
    });

    expect(posthog.capture).toHaveBeenCalledWith('market_changed', {
      market: 'IN',
      resultCount: 25,
    });
  });

  it('identifies authenticated users without sending email addresses', () => {
    const service = TestBed.inject(AnalyticsService);
    service.init();

    service.identifyUser({
      id: 'user-123',
      email: 'investor@example.com',
      provider: 'google',
    });

    expect(posthog.identify).toHaveBeenCalledOnceWith('user-123', {
      email_domain: 'example.com',
      auth_provider: 'google',
    });
  });

  it('resets the PostHog identity on sign out', () => {
    const service = TestBed.inject(AnalyticsService);
    service.init();

    service.resetIdentity();

    expect(posthog.reset).toHaveBeenCalled();
  });
});
