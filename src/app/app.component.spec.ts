import { TestBed } from '@angular/core/testing';
import { computed, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';

import { MARKETS } from './core/models';
import { MarketService } from './core/services';
import { AuthService } from './core/services/auth.service';
import { AppComponent } from './app.component';

describe('AppComponent', () => {
  beforeEach(async () => {
    const currentMarket = signal<'US' | 'IN'>('US');

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
            userAvatar: () => null,
            userName: () => null,
            signOut: jasmine.createSpy('signOut'),
          },
        },
      ],
    }).compileComponents();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(AppComponent);
    const app = fixture.componentInstance;
    expect(app).toBeTruthy();
  });
});
