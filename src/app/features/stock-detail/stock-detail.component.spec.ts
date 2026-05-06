import { signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { convertToParamMap, ActivatedRoute, Router } from '@angular/router';
import { of } from 'rxjs';

import { Stock } from '../../core/models/stock.model';
import { AuthService } from '../../core/services/auth.service';
import { MarketService } from '../../core/services';
import { WatchlistService } from '../../core/services/watchlist.service';
import { StockDetailComponent } from './stock-detail.component';

describe('StockDetailComponent', () => {
  let fixture: ComponentFixture<StockDetailComponent>;
  let httpGet: jasmine.Spy;

  const glwStock: Stock = {
    symbol: 'GLW',
    name: 'Corning Incorporated',
    price: 158.26,
    change: -5.98,
    changePercent: -3.64,
    market: 'US',
    exchange: 'NYQ',
    currency: 'USD',
    marketCap: 135_950_000_000,
    marketCapCategory: 'large',
    fiftyTwoWeekHigh: 179.08,
    fiftyTwoWeekLow: 44.33,
    percentFromFiftyTwoWeekHigh: -11.6,
    percentFromFiftyTwoWeekLow: 257,
    peRatio: 76.45,
    forwardPeRatio: 39.31,
    pbRatio: null,
    psRatio: null,
    eps: null,
    forwardEps: null,
    earningsGrowth: null,
    revenueGrowth: null,
    dividendYield: 0.68,
    avgVolume: 12_320_000,
    volume: 7_150_000,
    relativeVolume: 0.58,
    sector: 'Technology',
    industry: 'Electronic Components',
    beta: null,
    fiftyDayMA: null,
    twoHundredDayMA: null,
    percentFromFiftyDayMA: null,
    percentFromTwoHundredDayMA: null,
    rsi: 50.2,
    macdLine: -1.89,
    macdSignal: null,
    macdHistogram: null,
    macdSignalType: 'bearish',
    targetMeanPrice: 162.6,
    targetHighPrice: null,
    targetLowPrice: null,
    numberOfAnalystOpinions: 15,
    recommendationMean: 2,
    heldPercentInstitutions: null,
    heldPercentInsiders: null,
    earningsTimestamp: 1777334400,
    oneWeekChangePercent: -2.34,
    oneMonthChangePercent: 11.15,
    threeMonthChangePercent: 53.28,
    sixMonthChangePercent: 75.28,
    ytdChangePercent: 44.44,
    oneYearChangePercent: 140.42,
    lastUpdated: new Date('2026-05-03T12:00:00Z'),
  };

  beforeEach(async () => {
    httpGet = jasmine.createSpy('get').and.callFake((url: string) => {
      if (url.includes('/news')) {
        return of({ news: [] });
      }

      return of({ stocks: [glwStock] });
    });

    await TestBed.configureTestingModule({
      imports: [StockDetailComponent],
      providers: [
        {
          provide: ActivatedRoute,
          useValue: {
            paramMap: of(convertToParamMap({ symbol: 'GLW' })),
          },
        },
        {
          provide: Router,
          useValue: {
            navigate: jasmine.createSpy('navigate'),
          },
        },
        {
          provide: AuthService,
          useValue: {
            isAuthenticated: () => false,
          },
        },
        {
          provide: MarketService,
          useValue: {
            formatCurrency: (value: number) => `$${value.toFixed(2)}`,
            formatMarketCap: () => '$135.95B',
            formatVolume: (value: number) => `${(value / 1_000_000).toFixed(2)}M`,
          },
        },
        {
          provide: WatchlistService,
          useValue: {
            watchlists: signal([]),
            loadWatchlists: jasmine.createSpy('loadWatchlists').and.resolveTo(),
            getWatchlistsForSymbol: jasmine.createSpy('getWatchlistsForSymbol').and.resolveTo([]),
            addItem: jasmine.createSpy('addItem').and.resolveTo(),
            createWatchlist: jasmine.createSpy('createWatchlist').and.resolveTo(null),
          },
        },
        {
          provide: HttpClient,
          useValue: {
            get: httpGet,
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(StockDetailComponent);
  });

  it('requests and displays period percent changes', async () => {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const searchUrl = httpGet.calls.first().args[0] as string;
    expect(searchUrl).toContain('performance=true');

    const text = (fixture.nativeElement as HTMLElement).textContent || '';
    expect(text).toContain('1W');
    expect(text).toContain('1M');
    expect(text).toContain('3M');
    expect(text).toContain('6M');
    expect(text).toContain('YTD');
    expect(text).toContain('1Y');
    expect(text).toContain('-2.34%');
    expect(text).toContain('+11.15%');
    expect(text).toContain('+53.28%');
    expect(text).toContain('+75.28%');
    expect(text).toContain('+44.44%');
    expect(text).toContain('+140.42%');

    const periodLabels = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll('.period-stats-row .stat-label')
    ).map(label => label.textContent?.trim());
    expect(periodLabels).toEqual(['1W', '1M', '3M', '6M', 'YTD', '1Y']);
  });

  it('explains RSI signal thresholds for tooltips', () => {
    const component = fixture.componentInstance;

    expect(component.getRsiSignalExplanation(24.8)).toContain('below 30');
    expect(component.getRsiSignalExplanation(24.8)).toContain('Buy');
    expect(component.getRsiSignalExplanation(76.1)).toContain('above 70');
    expect(component.getRsiSignalExplanation(76.1)).toContain('Sell');
    expect(component.getRsiSignalExplanation(50.2)).toContain('30 to 70');
    expect(component.getRsiSignalExplanation(null)).toContain('not available');
  });

  it('explains MACD signal direction for tooltips', () => {
    const component = fixture.componentInstance;

    expect(component.getMacdSignalExplanation('bullish', 2.45)).toContain('above the signal line');
    expect(component.getMacdSignalExplanation('bullish', 2.45)).toContain('Buy');
    expect(component.getMacdSignalExplanation('bearish', -1.25)).toContain('below the signal line');
    expect(component.getMacdSignalExplanation('bearish', -1.25)).toContain('Sell');
    expect(component.getMacdSignalExplanation(null, null)).toContain('not available');
  });

  it('renders visible RSI and MACD explanation controls', async () => {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const helpButtons = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll('.signal-help-btn')
    ) as HTMLButtonElement[];

    expect(helpButtons.length).toBe(2);
    expect(helpButtons.map(button => button.textContent?.trim())).toEqual(['Why?', 'Why?']);
    expect(helpButtons.map(button => button.getAttribute('aria-label'))).toEqual([
      'Why is RSI marked this way?',
      'Why is MACD marked this way?',
    ]);
  });
});
