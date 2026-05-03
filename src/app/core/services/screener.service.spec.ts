import { TestBed } from '@angular/core/testing';
import { HttpClient } from '@angular/common/http';
import { of } from 'rxjs';

import { ScreenerService } from './screener.service';

describe('ScreenerService', () => {
  let service: ScreenerService;
  let httpGet: jasmine.Spy;

  beforeEach(() => {
    httpGet = jasmine.createSpy('get').and.returnValue(of({
      stocks: [
        {
          symbol: 'AAA',
          name: 'A Test Stock',
          price: 100,
          change: 1,
          changePercent: 1,
          market: 'US',
          marketCap: 2_000_000_000,
          oneMonthChangePercent: 18,
          threeMonthChangePercent: 12,
          sixMonthChangePercent: 8,
          oneYearChangePercent: 4,
          sector: 'Technology',
          industry: 'Software',
        },
      ],
      totalCount: 1,
      executionTimeMs: 42,
      timestamp: new Date().toISOString(),
    }));

    TestBed.configureTestingModule({
      providers: [
        ScreenerService,
        {
          provide: HttpClient,
          useValue: { get: httpGet },
        },
      ],
    });

    service = TestBed.inject(ScreenerService);
  });

  it('loads Raising Stocks as an active quick view', () => {
    service.runRaisingStocks();

    expect(httpGet).toHaveBeenCalledWith('/api/stocks?action=raising&market=US');
    expect(service.activeQuickView()).toBe('raising-stocks');
    expect(service.quickViewContext()).toContain('1M > 3M > 6M > 1Y');
    expect(service.results().map(stock => stock.symbol)).toEqual(['AAA']);
    expect(service.totalCount()).toBe(1);
    expect(service.executionTime()).toBe(42);
    expect(service.sort()).toEqual({ field: 'oneMonthChangePercent', direction: 'desc' });
  });

  it('clears the quick view when standard filters change', () => {
    service.runRaisingStocks();
    service.updateFilters({ price: { min: 50 } }, false);

    expect(service.activeQuickView()).toBeNull();
  });
});
