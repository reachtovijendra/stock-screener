import { computed, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { of } from 'rxjs';

import { MARKETS } from '../../core/models';
import { MarketService } from '../../core/services';
import { RecommendationsComponent } from './recommendations.component';

describe('RecommendationsComponent', () => {
  let component: RecommendationsComponent;
  let fixture: ComponentFixture<RecommendationsComponent>;
  let httpGet: jasmine.Spy;

  beforeEach(async () => {
    const currentMarket = signal<'US' | 'IN'>('US');

    await TestBed.configureTestingModule({
      imports: [RecommendationsComponent],
      providers: [
        {
          provide: HttpClient,
          useValue: {
            get: jasmine.createSpy('get').and.returnValue(of({ picks: [], stocks: [] })),
          },
        },
        {
          provide: Router,
          useValue: {
            navigate: jasmine.createSpy('navigate'),
          },
        },
        {
          provide: MarketService,
          useValue: {
            currentMarket: currentMarket.asReadonly(),
            marketInfo: computed(() => MARKETS[currentMarket()]),
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(RecommendationsComponent);
    component = fixture.componentInstance;
    httpGet = TestBed.inject(HttpClient).get as jasmine.Spy;
  });

  it('treats stale unevaluated picks as not traded instead of pending', () => {
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const pick = {
      pick_date: yesterday,
      outcome: null,
      pnl_percent: null,
      buy_price: 100,
      sell_price: 101,
      stop_loss: 99,
    } as any;

    expect(component.getOutcome(pick)).toBe('no-trigger');
    expect(component.getOutcomeLabel(pick)).toBe('Not Traded');
    expect(component.shouldShowPnl(pick)).toBeFalse();
    expect(component.getPnlPercent(pick)).toBe(0);
  });

  it('keeps only future unevaluated picks pending', () => {
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const pick = {
      pick_date: tomorrow,
      outcome: null,
      pnl_percent: null,
      buy_price: 100,
      sell_price: 101,
      stop_loss: 99,
    } as any;

    expect(component.getOutcome(pick)).toBe('pending');
    expect(component.getOutcomeLabel(pick)).toBe('Pending');
  });

  it('shows automated paper results in a recommendations tab', () => {
    httpGet.and.returnValue(of({
      picks: [
        {
          id: 1,
          market: 'US',
          pick_date: '2026-04-01',
          symbol: 'AAPL',
          name: 'Apple',
          sector: 'Technology',
          market_cap: 1,
          price: 100,
          previous_close: 99,
          pre_market_price: null,
          gap_percent: null,
          change_percent: null,
          volume: null,
          avg_volume: null,
          relative_volume: null,
          buy_price: 100,
          sell_price: 103,
          stop_loss: 98,
          score: 75,
          priority: 'High',
          signals: [],
          rsi: null,
          beta: null,
          outcome: 'hit-target',
          actual_high: 104,
          actual_low: 99,
          actual_close: 102,
          pnl_percent: 3,
        },
      ],
    }));

    fixture.detectChanges();

    const native = fixture.nativeElement as HTMLElement;
    const tabs = Array.from(native.querySelectorAll('.reco-tab')).map(tab => tab.textContent?.trim());
    expect(tabs).toContain('Recommendations');
    expect(tabs).toContain('Automated Paper Results');

    native.querySelectorAll<HTMLButtonElement>('.reco-tab')[1].click();
    fixture.detectChanges();

    expect(native.textContent).toContain('Score-to-Investment Formula');
    expect(native.textContent).toContain('$4,000.00');
    expect(native.textContent).toContain('$120.00');
    expect(native.textContent).toContain('Shares');
    expect(native.textContent).toContain('Bought');
    expect(native.textContent).toContain('Sold');
    expect(native.textContent).toContain('40');
    expect(native.textContent).toContain('Apr 1, 2026, buy trigger hit intraday');
    expect(native.textContent).toContain('Apr 1, 2026, sell target hit intraday');
    expect(native.textContent).toContain('Sell target hit');
    const paperHeaders = Array.from(native.querySelectorAll<HTMLTableCellElement>('.paper-table th'))
      .map(header => header.textContent?.trim());
    expect(paperHeaders).toContain('Entry');
    expect(paperHeaders).toContain('Exit');
    expect(paperHeaders).not.toContain('Entry / Exit');
    expect(native.querySelector('.exit-price-badge.positive')?.textContent).toContain('$103.00');

    const plannedInfoButton = native.querySelector<HTMLButtonElement>('.planned-info-button');
    expect(plannedInfoButton?.getAttribute('aria-label')).toBe('Show planned investment calculation for AAPL');
    plannedInfoButton?.click();
    fixture.detectChanges();

    expect(native.textContent).toContain('Planned = $1,000.00 + (75 / 100 x $4,000.00) = $4,000.00');
    expect(native.querySelector('.paper-pnl .outcome-badge.compact.detailed.positive')?.textContent).toContain('+$120.00');
  });
});
