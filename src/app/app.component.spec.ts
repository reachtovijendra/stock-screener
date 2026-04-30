import { TestBed } from '@angular/core/testing';
import { computed, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';

import { MARKETS } from './core/models';
import { AnalyticsService, MarketService } from './core/services';
import { AuthService } from './core/services/auth.service';
import { AppComponent } from './app.component';

describe('AppComponent', () => {
  let currentUser: ReturnType<typeof signal>;
  let analytics: jasmine.SpyObj<AnalyticsService>;

  beforeEach(async () => {
    const currentMarket = signal<'US' | 'IN'>('US');
    currentUser = signal(null);
    analytics = jasmine.createSpyObj<AnalyticsService>('AnalyticsService', [
      'identifyUser',
      'init',
      'resetIdentity',
    ]);

    await TestBed.configureTestingModule({
      imports: [AppComponent],
      providers: [
        provideRouter([]),
        {
          provide: HttpClient,
          useValue: {
            get: jasmine.createSpy('get').and.returnValue(of({ indices: [] })),
          },
        },
        {
          provide: MarketService,
          useValue: {
            currentMarket: currentMarket.asReadonly(),
            marketInfo: computed(() => MARKETS[currentMarket()]),
            setMarket: jasmine.createSpy('setMarket'),
            isMarketOpen: () => false,
            getMarketStatusMessage: () => 'Closed',
            formatMarketCap: () => '',
            formatCurrency: (value: number) => `$${value}`,
          },
        },
        {
          provide: AuthService,
          useValue: {
            isAuthenticated: () => false,
            user: currentUser.asReadonly(),
            userAvatar: () => null,
            userName: () => null,
            signOut: jasmine.createSpy('signOut'),
          },
        },
        { provide: AnalyticsService, useValue: analytics },
      ],
    }).compileComponents();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(AppComponent);
    const app = fixture.componentInstance;
    expect(app).toBeTruthy();
  });

  it('initializes analytics when the app starts', () => {
    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();

    expect(analytics.init).toHaveBeenCalled();
  });

  it('identifies authenticated users for analytics without exposing the full user object', () => {
    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();
    analytics.identifyUser.calls.reset();

    currentUser.set({
      id: 'user-123',
      email: 'investor@example.com',
      app_metadata: { provider: 'google' },
    });
    fixture.detectChanges();

    expect(analytics.identifyUser).toHaveBeenCalledOnceWith({
      id: 'user-123',
      email: 'investor@example.com',
      provider: 'google',
    });
  });
});
