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
});
