import { computed, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';

import { MARKETS } from '../../core/models';
import { MarketService, PaperTradingService, StockService } from '../../core/services';
import { AuthService } from '../../core/services/auth.service';
import { PaperTradingComponent } from './paper-trading.component';

describe('PaperTradingComponent', () => {
  let component: PaperTradingComponent;
  let fixture: ComponentFixture<PaperTradingComponent>;
  let stockService: jasmine.SpyObj<StockService>;
  let positionsSignal: ReturnType<typeof signal>;
  let tradesSignal: ReturnType<typeof signal>;

  beforeEach(async () => {
    const currentMarket = signal<'US' | 'IN'>('US');
    stockService = jasmine.createSpyObj<StockService>('StockService', ['searchStocks', 'getQuote', 'getQuotes']);
    stockService.searchStocks.and.returnValue(of([
      { symbol: 'MU', name: 'Micron Technology', exchange: 'NASDAQ', type: 'equity', market: 'US' },
    ]));
    stockService.getQuote.and.returnValue(of({
      symbol: 'MU',
      name: 'Micron Technology',
      price: 112,
    } as any));
    stockService.getQuotes.and.returnValue(of([]));
    positionsSignal = signal([]);
    tradesSignal = signal([]);

    await TestBed.configureTestingModule({
      imports: [PaperTradingComponent],
      providers: [
        {
          provide: MarketService,
          useValue: {
            currentMarket: currentMarket.asReadonly(),
            marketInfo: computed(() => MARKETS[currentMarket()]),
          },
        },
        {
          provide: AuthService,
          useValue: {
            user: signal({ id: 'user-1' }).asReadonly(),
          },
        },
        {
          provide: PaperTradingService,
          useValue: {
            enabled: () => true,
            loading: () => false,
            positions: positionsSignal.asReadonly(),
            trades: tradesSignal.asReadonly(),
            loadData: jasmine.createSpy('loadData').and.resolveTo(),
            enableAccount: jasmine.createSpy('enableAccount').and.resolveTo(),
            resetAccount: jasmine.createSpy('resetAccount').and.resolveTo(),
            placeOrder: jasmine.createSpy('placeOrder').and.resolveTo(),
            getSummary: jasmine.createSpy('getSummary').and.returnValue({
              cashBalance: 100000,
              marketValue: 0,
              totalEquity: 100000,
              realizedPnl: 0,
              unrealizedPnl: 0,
              totalPnl: 0,
              totalReturnPercent: 0,
            }),
          },
        },
        { provide: StockService, useValue: stockService },
        provideRouter([]),
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(PaperTradingComponent);
    component = fixture.componentInstance;
  });

  it('shows search suggestions and fills quote details when a stock is selected', () => {
    component.searchStocks({ target: { value: 'mu' } } as unknown as Event);
    expect(component.stockSuggestions()[0].symbol).toBe('MU');

    component.selectStock(component.stockSuggestions()[0]);

    expect(component.orderForm.controls.symbol.value).toBe('MU');
    expect(component.orderForm.controls.name.value).toBe('Micron Technology');
    expect(component.orderForm.controls.execution_price.value).toBe(112);
  });

  it('clears stale quote details when the user types a different stock', () => {
    component.orderForm.patchValue({
      symbol: 'WDC',
      name: 'Western Digital Corporation',
      execution_price: 426.08,
    });

    component.searchStocks({ target: { value: 'corning' } } as unknown as Event);

    expect(component.orderForm.controls.symbol.value).toBe('CORNING');
    expect(component.orderForm.controls.name.value).toBeNull();
    expect(component.orderForm.controls.execution_price.value).toBe(0);
    expect(component.canPlaceOrder()).toBeFalse();
  });

  it('uses the first company-name suggestion when refreshing quote without a selected stock', () => {
    stockService.searchStocks.and.returnValue(of([
      { symbol: 'GLW', name: 'Corning Incorporated', exchange: 'NYSE', type: 'equity', market: 'US' },
    ]));
    stockService.getQuote.and.returnValue(of({
      symbol: 'GLW',
      name: 'Corning Incorporated',
      price: 48.25,
    } as any));

    component.searchStocks({ target: { value: 'corning' } } as unknown as Event);
    component.refreshQuote();

    expect(stockService.getQuote).toHaveBeenCalledWith('GLW', 'US');
    expect(component.orderForm.controls.symbol.value).toBe('GLW');
    expect(component.orderForm.controls.name.value).toBe('Corning Incorporated');
    expect(component.orderForm.controls.execution_price.value).toBe(48.25);
  });

  it('does not request a quote while the stock field is blank', () => {
    component.orderForm.patchValue({ symbol: '', name: null, execution_price: 0 });

    component.refreshQuote();

    expect(stockService.getQuote).not.toHaveBeenCalled();
    expect(component.canRefreshQuote()).toBeFalse();
  });

  it('searches for a company name before quoting when suggestions are not loaded yet', () => {
    stockService.searchStocks.and.returnValue(of([
      { symbol: 'GLW', name: 'Corning Incorporated', exchange: 'NYSE', type: 'equity', market: 'US' },
    ]));
    stockService.getQuote.and.returnValue(of({
      symbol: 'GLW',
      name: 'Corning Incorporated',
      price: 48.25,
    } as any));
    component.orderForm.patchValue({ symbol: 'CORNING', name: null, execution_price: 0 });
    component.stockSuggestions.set([]);

    component.refreshQuote();

    expect(stockService.searchStocks).toHaveBeenCalledWith('CORNING', 'US');
    expect(stockService.getQuote).toHaveBeenCalledWith('GLW', 'US');
  });

  it('allows selling an existing position without reselecting the stock suggestion', () => {
    positionsSignal.set([
      {
        symbol: 'MU',
        name: 'Micron Technology, Inc.',
        market: 'US',
        quantity: 1,
        average_cost: 529.51,
      },
    ]);
    component.orderForm.patchValue({
      action: 'SELL',
      symbol: 'MU',
      name: null,
      quantity: 1,
      execution_price: 539.51,
    });

    expect(component.canPlaceOrder()).toBeTrue();
  });

  it('refreshes open position prices from live quotes instead of using cost basis as current price', async () => {
    positionsSignal.set([
      {
        symbol: 'WDC',
        name: 'Western Digital Corporation',
        market: 'US',
        quantity: 10,
        average_cost: 426.08,
      },
    ]);
    stockService.getQuotes.and.returnValue(of([
      { symbol: 'WDC', name: 'Western Digital Corporation', price: 430.12, lastUpdated: '2026-04-30T19:45:11.826Z' } as any,
    ]));

    await component.refreshLivePrices();

    expect(stockService.getQuotes).toHaveBeenCalledWith(['WDC'], 'US', { forceRefresh: true });
    expect(component.getPositionCurrentPrice('WDC')).toBe(430.12);
    expect(component.getPositionQuoteTime('WDC')).toContain('PM');
    expect(component.getPositionMarketValue('WDC', 10)).toBe(4301.2);
  });

  it('shows no current price until a live quote has loaded', () => {
    expect(component.getPositionCurrentPrice('WDC')).toBeNull();
  });

  it('links open positions and trade history stocks to the stock detail page', () => {
    positionsSignal.set([
      {
        symbol: 'MU',
        name: 'Micron Technology, Inc.',
        market: 'US',
        quantity: 1,
        average_cost: 112,
      },
    ]);
    tradesSignal.set([
      {
        id: 'trade-1',
        action: 'BUY',
        symbol: 'WDC',
        name: 'Western Digital Corporation',
        market: 'US',
        quantity: 1,
        execution_price: 430,
        realized_pnl: null,
        realized_pnl_percent: null,
        executed_at: '2026-04-30T19:45:11.826Z',
      },
    ]);

    fixture.detectChanges();

    const stockLinks = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll<HTMLAnchorElement>('a.stock-link')
    ).map(link => link.getAttribute('href'));
    expect(stockLinks).toContain('/stock/MU');
    expect(stockLinks).toContain('/stock/WDC');
  });
});
