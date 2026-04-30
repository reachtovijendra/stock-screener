import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { Router, NavigationEnd } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { Subject, of } from 'rxjs';
import { AutoComplete } from 'primeng/autocomplete';

import { AuthService } from '../../core/services/auth.service';
import { MarketService, ThemeService } from '../../core/services';
import { HeaderComponent } from './header.component';

describe('HeaderComponent', () => {
  let fixture: ComponentFixture<HeaderComponent>;
  let routerEvents: Subject<NavigationEnd>;

  beforeEach(async () => {
    routerEvents = new Subject<NavigationEnd>();

    await TestBed.configureTestingModule({
      imports: [HeaderComponent],
      providers: [
        {
          provide: HttpClient,
          useValue: {
            get: jasmine.createSpy('get').and.returnValue(of({ indices: [] })),
          },
        },
        {
          provide: Router,
          useValue: {
            events: routerEvents.asObservable(),
            navigate: jasmine.createSpy('navigate'),
          },
        },
        {
          provide: MarketService,
          useValue: {
            currentMarket: signal<'US' | 'IN'>('US').asReadonly(),
            setMarket: jasmine.createSpy('setMarket'),
            isMarketOpen: jasmine.createSpy('isMarketOpen').and.returnValue(true),
            getMarketStatusMessage: jasmine.createSpy('getMarketStatusMessage').and.returnValue('Market is open'),
            formatMarketCap: jasmine.createSpy('formatMarketCap').and.returnValue('$1T'),
            formatCurrency: jasmine.createSpy('formatCurrency').and.returnValue('$100.00'),
          },
        },
        {
          provide: ThemeService,
          useValue: {
            isDark: signal(true).asReadonly(),
            toggleTheme: jasmine.createSpy('toggleTheme'),
          },
        },
        {
          provide: AuthService,
          useValue: {
            isAuthenticated: signal(false).asReadonly(),
            userAvatar: signal(null).asReadonly(),
            userName: signal(null).asReadonly(),
            signOut: jasmine.createSpy('signOut'),
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(HeaderComponent);
    fixture.detectChanges();
  });

  it('renders the stock search panel outside the clipped fixed header', () => {
    const autocomplete = fixture.debugElement.query(By.directive(AutoComplete)).componentInstance as AutoComplete;

    expect(autocomplete.appendTo).toBe('body');
    expect(autocomplete.panelStyleClass).toContain('header-stock-search-panel');
  });
});
