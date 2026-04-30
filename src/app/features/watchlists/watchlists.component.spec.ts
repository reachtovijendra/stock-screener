import { signal, WritableSignal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { of, Subject } from 'rxjs';

import { MarketService } from '../../core/services';
import { WatchlistItem, WatchlistService } from '../../core/services/watchlist.service';
import { WatchlistsComponent } from './watchlists.component';

describe('WatchlistsComponent', () => {
  let component: WatchlistsComponent;
  let fixture: ComponentFixture<WatchlistsComponent>;
  let httpGet: jasmine.Spy;
  let watchlistItems: WritableSignal<WatchlistItem[]>;

  beforeEach(async () => {
    const currentMarket = signal<'US' | 'IN'>('US');
    const selectedWatchlist = signal({
      id: 'watchlist-1',
      user_id: 'user-1',
      name: 'Test',
      created_at: '2026-04-30T00:00:00Z',
      updated_at: '2026-04-30T00:00:00Z',
      item_count: 0,
    });
    const watchlists = signal([selectedWatchlist()]);
    watchlistItems = signal<WatchlistItem[]>([]);
    const loading = signal(false);

    httpGet = jasmine.createSpy('get');

    await TestBed.configureTestingModule({
      imports: [WatchlistsComponent],
      providers: [
        {
          provide: WatchlistService,
          useValue: {
            watchlists,
            selectedWatchlist,
            items: watchlistItems,
            loading,
            addItem: jasmine.createSpy('addItem').and.resolveTo(),
            createWatchlist: jasmine.createSpy('createWatchlist').and.resolveTo(null),
            deleteWatchlist: jasmine.createSpy('deleteWatchlist').and.resolveTo(),
            loadItems: jasmine.createSpy('loadItems').and.resolveTo(),
            loadWatchlists: jasmine.createSpy('loadWatchlists').and.resolveTo(),
            removeItem: jasmine.createSpy('removeItem').and.resolveTo(),
            renameWatchlist: jasmine.createSpy('renameWatchlist').and.resolveTo(),
            saveOrder: jasmine.createSpy('saveOrder').and.resolveTo(),
            selectWatchlist: jasmine.createSpy('selectWatchlist'),
          },
        },
        {
          provide: MarketService,
          useValue: {
            currentMarket: currentMarket.asReadonly(),
          },
        },
        {
          provide: HttpClient,
          useValue: {
            get: httpGet,
          },
        },
        {
          provide: Router,
          useValue: {
            navigate: jasmine.createSpy('navigate'),
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(WatchlistsComponent);
    component = fixture.componentInstance;
  });

  it('keeps newer stock search results when an older request finishes later', async () => {
    const olderUs = new Subject<any>();
    const olderIn = new Subject<any>();
    const newerUs = new Subject<any>();
    const newerIn = new Subject<any>();

    httpGet.and.returnValues(olderUs, olderIn, newerUs, newerIn);

    const olderSearch = component.searchStocks({ originalEvent: new Event('input'), query: 'aa' });
    const newerSearch = component.searchStocks({ originalEvent: new Event('input'), query: 'aao' });

    newerUs.next({ stocks: [{ symbol: 'AAON', name: 'AAON, Inc.', market: 'US', price: 88 }] });
    newerUs.complete();
    newerIn.next({ stocks: [] });
    newerIn.complete();
    await newerSearch;

    expect(component.searchResults()).toEqual([
      { symbol: 'AAON', name: 'AAON, Inc.', market: 'US', price: 88 },
    ]);

    olderUs.next({ stocks: [] });
    olderUs.complete();
    olderIn.next({ stocks: [] });
    olderIn.complete();
    await olderSearch;

    expect(component.searchResults()).toEqual([
      { symbol: 'AAON', name: 'AAON, Inc.', market: 'US', price: 88 },
    ]);
  });

  it('maps and displays 1M, 3M, and 6M percent changes for watchlist rows', async () => {
    watchlistItems.set([
      {
        id: 'item-1',
        watchlist_id: 'watchlist-1',
        symbol: 'AAON',
        name: 'AAON, Inc.',
        market: 'US',
        price_when_added: 80,
        added_at: '2026-04-01T00:00:00Z',
      },
    ]);

    httpGet.and.returnValue(of({
      stocks: [{
        symbol: 'AAON',
        price: 100,
        oneMonthChangePercent: 4.2,
        threeMonthChangePercent: -3.5,
        sixMonthChangePercent: 12.75,
      }],
    }));

    await (component as any).fetchPrices();
    fixture.detectChanges();

    const [item] = component.enrichedItems();
    expect((item as any).oneMonthChangePercent).toBe(4.2);
    expect((item as any).threeMonthChangePercent).toBe(-3.5);
    expect((item as any).sixMonthChangePercent).toBe(12.75);

    const text = fixture.nativeElement.textContent;
    expect(text).toContain('1M % CHANGE');
    expect(text).toContain('3M % CHANGE');
    expect(text).toContain('6M % CHANGE');
    expect(text).toContain('+4.20%');
    expect(text).toContain('-3.50%');
    expect(text).toContain('+12.75%');
    expect(httpGet.calls.mostRecent().args[0]).toContain('performance=true');
  });
});
