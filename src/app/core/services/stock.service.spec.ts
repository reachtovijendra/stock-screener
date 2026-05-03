import { TestBed } from '@angular/core/testing';
import { HttpClient, HttpParams } from '@angular/common/http';
import { of } from 'rxjs';

import { StockService } from './stock.service';

describe('StockService', () => {
  let service: StockService;
  let httpGet: jasmine.Spy;

  beforeEach(() => {
    httpGet = jasmine.createSpy('get').and.returnValue(of({
      stocks: [
        { symbol: 'MU', name: 'Micron Technology', exchange: 'NASDAQ', type: 'equity', market: 'US' },
      ],
    }));

    TestBed.configureTestingModule({
      providers: [
        StockService,
        {
          provide: HttpClient,
          useValue: { get: httpGet },
        },
      ],
    });

    service = TestBed.inject(StockService);
  });

  it('normalizes search responses returned as { stocks }', (done) => {
    service.searchStocks('mu', 'US').subscribe(results => {
      try {
        expect(results.length).toBe(1);
        expect(results[0].symbol).toBe('MU');
        const [, options] = httpGet.calls.mostRecent().args as [string, { params: HttpParams }];
        expect(options.params.get('fuzzy')).toBe('true');
        done();
      } catch (error) {
        done.fail(error instanceof Error ? error : String(error));
      }
    });
  });

  it('does not call the quote API for a blank symbol', (done) => {
    service.getQuote('', 'US').subscribe({
      next: () => done.fail('Expected blank quote lookup to fail before HTTP'),
      error: error => {
        expect(error.message).toContain('Symbol is required');
        expect(httpGet).not.toHaveBeenCalled();
        done();
      },
    });
  });

  it('bypasses cached quotes when force refresh is requested', (done) => {
    const cachedStock = { symbol: 'MU', price: 100 } as any;
    const liveStock = { symbol: 'MU', price: 105 } as any;
    httpGet.and.returnValues(of(cachedStock), of([liveStock]));

    service.getQuote('MU', 'US').subscribe(() => {
      service.getQuotes(['MU'], 'US', { forceRefresh: true }).subscribe(results => {
        expect(results[0].price).toBe(105);
        expect(httpGet).toHaveBeenCalledTimes(2);
        done();
      });
    });
  });
});
