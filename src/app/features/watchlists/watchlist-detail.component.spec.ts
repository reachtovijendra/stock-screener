import { signal, WritableSignal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { ComponentFixture, TestBed, fakeAsync, tick, discardPeriodicTasks } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, Router } from '@angular/router';
import { of, Subject } from 'rxjs';

import { MarketService } from '../../core/services';
import { Watchlist, WatchlistItem, WatchlistService } from '../../core/services/watchlist.service';
import { WatchlistDetailComponent } from './watchlist-detail.component';

describe('WatchlistDetailComponent', () => {
  let component: WatchlistDetailComponent;
  let fixture: ComponentFixture<WatchlistDetailComponent>;
  let httpGet: jasmine.Spy;
  let watchlistItems: WritableSignal<WatchlistItem[]>;

  beforeEach(async () => {
    const currentMarket = signal<'US' | 'IN'>('US');
    const selectedWatchlist = signal<Watchlist>({
      id: 'watchlist-1',
      user_id: 'user-1',
      name: 'Test',
      created_at: '2026-04-30T00:00:00Z',
      updated_at: '2026-04-30T00:00:00Z',
      item_count: 0,
      access_role: 'owner' as const,
    });
    const watchlists = signal<Watchlist[]>([
      selectedWatchlist(),
      {
        id: 'watchlist-2',
        user_id: 'user-1',
        name: 'Second',
        created_at: '2026-04-30T00:00:00Z',
        updated_at: '2026-04-30T00:00:00Z',
        item_count: 3,
        access_role: 'viewer' as const,
      },
    ]);
    watchlistItems = signal<WatchlistItem[]>([]);
    const loading = signal(false);
    const shares = signal([]);

    httpGet = jasmine.createSpy('get');

    await TestBed.configureTestingModule({
      imports: [WatchlistDetailComponent],
      providers: [
        {
          provide: WatchlistService,
          useValue: {
            watchlists,
            selectedWatchlist,
            items: watchlistItems,
            shares,
            loading,
            addItem: jasmine.createSpy('addItem').and.resolveTo(),
            canEditWatchlist: jasmine.createSpy('canEditWatchlist').and.callFake((id: string) => selectedWatchlist()?.id === id && selectedWatchlist()?.access_role !== 'viewer'),
            canManageWatchlist: jasmine.createSpy('canManageWatchlist').and.callFake((id: string) => selectedWatchlist()?.id === id && selectedWatchlist()?.access_role === 'owner'),
            createWatchlist: jasmine.createSpy('createWatchlist').and.resolveTo(null),
            deleteWatchlist: jasmine.createSpy('deleteWatchlist').and.resolveTo(),
            loadShares: jasmine.createSpy('loadShares').and.resolveTo([]),
            loadItems: jasmine.createSpy('loadItems').and.resolveTo(),
            loadWatchlists: jasmine.createSpy('loadWatchlists').and.resolveTo(),
            removeItem: jasmine.createSpy('removeItem').and.resolveTo(),
            renameWatchlist: jasmine.createSpy('renameWatchlist').and.resolveTo(),
            saveOrder: jasmine.createSpy('saveOrder').and.resolveTo(),
            shareWatchlist: jasmine.createSpy('shareWatchlist').and.resolveTo(null),
            updateShareRole: jasmine.createSpy('updateShareRole').and.resolveTo(null),
            revokeShare: jasmine.createSpy('revokeShare').and.resolveTo(),
            selectWatchlist: jasmine.createSpy('selectWatchlist'),
            selectWatchlistById: jasmine.createSpy('selectWatchlistById').and.resolveTo(true),
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
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: {
              paramMap: convertToParamMap({ watchlistId: 'watchlist-1' }),
            },
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(WatchlistDetailComponent);
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

  it('keeps visible stock suggestions during transient blank autocomplete queries', async () => {
    const existingSuggestion = { symbol: 'SOXX', name: 'iShares Semiconductor ETF', market: 'US', price: 220 };
    component.searchResults.set([existingSuggestion]);

    await component.searchStocks({ originalEvent: new Event('input'), query: '' });

    expect(component.searchResults()).toEqual([existingSuggestion]);
  });

  it('does not render the old watchlist sidebar or dock controls', () => {
    fixture.detectChanges();

    const native = fixture.nativeElement as HTMLElement;
    expect(native.querySelector('.wl-sidebar')).toBeNull();
    expect(native.querySelector('.sidebar-dock-toggle')).toBeNull();
    expect(native.querySelector('.wl-collapsed-rail')).toBeNull();
    expect(native.querySelector('.detail-hero')?.textContent).toContain('Test');
    expect(native.querySelector('.detail-hero')?.textContent).not.toContain('Focused watchlist');
    expect(native.querySelector('.today-date')).toBeNull();
  });

  it('switches watchlists from the hero dropdown', async () => {
    fixture.detectChanges();

    await component.switchWatchlistFromHero('watchlist-2');

    const routerNavigate = TestBed.inject(Router).navigate as jasmine.Spy;
    expect(component.wlService.selectWatchlistById).toHaveBeenCalledWith('watchlist-2');
    expect(routerNavigate).toHaveBeenCalledWith(['/watchlists', 'watchlist-2']);
    expect((fixture.nativeElement as HTMLElement).querySelector('#watchlist-switcher')).not.toBeNull();
  });

  it('renders a styled watchlist switcher menu instead of the native select menu', () => {
    fixture.detectChanges();

    component.toggleWatchlistSwitcher();
    fixture.detectChanges();

    const native = fixture.nativeElement as HTMLElement;
    expect(native.querySelector('select#watchlist-switcher')).toBeNull();
    expect(native.querySelector('.switcher-menu')?.textContent).toContain('Second');
    expect(native.querySelectorAll('.switcher-option').length).toBe(2);
    expect(getComputedStyle(native.querySelector('.detail-hero')!).overflow).toBe('visible');
    expect(Number(getComputedStyle(native.querySelector('.detail-hero')!).zIndex)).toBeGreaterThan(1);
  });

  it('hides edit controls for viewer watchlists', () => {
    component.wlService.selectedWatchlist.set({
      ...component.wlService.selectedWatchlist()!,
      access_role: 'viewer',
    });
    watchlistItems.set([
      {
        id: 'item-1',
        watchlist_id: 'watchlist-1',
        symbol: 'AAPL',
        name: 'Apple',
        market: 'US',
        price_when_added: 100,
        added_at: '2026-04-30T00:00:00Z',
      },
    ]);
    httpGet.and.returnValue(of({ stocks: [] }));

    fixture.detectChanges();

    const native: HTMLElement = fixture.nativeElement;
    expect(native.querySelector('.add-stock-search')).toBeNull();
    expect(native.querySelector('.readonly-notice')?.textContent).toContain('View only');
    expect(native.querySelector('.remove-btn')).toBeNull();
    expect(native.querySelector('.row-lock')).not.toBeNull();
  });

  it('loads collaborators when owner opens the share dialog', async () => {
    fixture.detectChanges();

    await component.openShareDialog();
    fixture.detectChanges();

    expect(component.wlService.loadShares).toHaveBeenCalledWith('watchlist-1');
    expect(component.showShareDialog()).toBeTrue();
    expect((fixture.nativeElement as HTMLElement).querySelector('.share-dialog')).not.toBeNull();
  });

  it('maps and displays live 1D, 1M, 3M, 6M, and 1Y percent changes for watchlist rows', async () => {
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
        changePercent: -1.25,
        oneMonthChangePercent: 4.2,
        threeMonthChangePercent: -3.5,
        sixMonthChangePercent: 12.75,
        oneYearChangePercent: 44.8,
      }],
    }));

    await (component as any).fetchPrices();
    fixture.detectChanges();

    const [item] = component.enrichedItems();
    expect((item as any).oneDayChangePercent).toBe(-1.25);
    expect((item as any).oneMonthChangePercent).toBe(4.2);
    expect((item as any).threeMonthChangePercent).toBe(-3.5);
    expect((item as any).sixMonthChangePercent).toBe(12.75);
    expect((item as any).oneYearChangePercent).toBe(44.8);

    const text = fixture.nativeElement.textContent;
    expect(text).toContain('1D');
    expect(text).toContain('1M');
    expect(text).toContain('3M');
    expect(text).toContain('6M');
    expect(text).toContain('1Y');
    expect(text).toContain('-1.25%');
    expect(text).toContain('+4.20%');
    expect(text).toContain('-3.50%');
    expect(text).toContain('+12.75%');
    expect(text).toContain('+44.80%');
    expect(httpGet.calls.mostRecent().args[0]).toContain('performance=true');
  });

  it('renders the larger add-stock search area and renamed share action', () => {
    fixture.detectChanges();

    const native = fixture.nativeElement as HTMLElement;
    expect(native.querySelector('.btn-share')?.textContent).toContain('Share Watchlist');
    expect(native.querySelector('.add-stock-search')).not.toBeNull();
  });

  it('removes the company column from the watchlist table', async () => {
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

    fixture.detectChanges();

    const headerText = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll('thead th')
    ).map(th => th.textContent?.trim().replace(/\s+/g, ' '));
    expect(headerText).not.toContain('COMPANY');
  });

  it('uses the company name as the ticker tooltip with a symbol fallback', () => {
    expect(component.getTickerTooltip({
      id: 'item-1',
      watchlist_id: 'watchlist-1',
      symbol: 'AAON',
      name: 'AAON, Inc.',
      market: 'US',
      price_when_added: 80,
      added_at: '2026-04-01T00:00:00Z',
    })).toBe('AAON, Inc.');

    expect(component.getTickerTooltip({
      id: 'item-2',
      watchlist_id: 'watchlist-1',
      symbol: 'RELIANCE.NS',
      name: '   ',
      market: 'IN',
      price_when_added: 100,
      added_at: '2026-04-01T00:00:00Z',
    })).toBe('RELIANCE');
  });

  it('sorts enriched watchlist rows by sortable header fields', () => {
    watchlistItems.set([
      {
        id: 'item-1',
        watchlist_id: 'watchlist-1',
        symbol: 'AAA',
        name: 'AAA Corp',
        market: 'US',
        price_when_added: 100,
        added_at: '2026-04-01T00:00:00Z',
      },
      {
        id: 'item-2',
        watchlist_id: 'watchlist-1',
        symbol: 'BBB',
        name: 'BBB Corp',
        market: 'US',
        price_when_added: 100,
        added_at: '2026-04-01T00:00:00Z',
      },
    ]);
    (component as any).currentPrices.set({ AAA: 90, BBB: 120 });
    (component as any).stockExtras.set({
      AAA: { oneDayChangePercent: 2.5, oneYearChangePercent: 30 },
      BBB: { oneDayChangePercent: -1.5, oneYearChangePercent: 10 },
    });

    component.setSort('last');
    expect(component.enrichedItems().map(item => item.symbol)).toEqual(['AAA', 'BBB']);

    component.setSort('last');
    expect(component.enrichedItems().map(item => item.symbol)).toEqual(['BBB', 'AAA']);

    component.setSort('oneDay');
    expect(component.enrichedItems().map(item => item.symbol)).toEqual(['BBB', 'AAA']);

    component.setSort('oneYear');
    expect(component.enrichedItems().map(item => item.symbol)).toEqual(['BBB', 'AAA']);
  });

  it('refreshes only 1D percent data every 60 seconds while visible', fakeAsync(() => {
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
    (component as any).currentPrices.set({ AAON: 100 });
    (component as any).stockExtras.set({
      AAON: {
        targetMeanPrice: 125,
        oneDayChangePercent: 1.25,
        oneMonthChangePercent: 4.2,
      },
    });
    httpGet.and.returnValue(of({
      stocks: [{
        symbol: 'AAON',
        price: 999,
        changePercent: 2.5,
        oneMonthChangePercent: 99,
      }],
    }));

    spyOnProperty(document, 'visibilityState', 'get').and.returnValue('visible');
    (component as any).startPriceRefresh();
    const callsAfterSetup = httpGet.calls.count();

    tick(60_000);

    expect(httpGet.calls.count()).toBeGreaterThan(callsAfterSetup);
    expect(httpGet.calls.mostRecent().args[0]).not.toContain('performance=true');
    expect((component as any).currentPrices().AAON).toBe(100);
    expect((component as any).stockExtras().AAON.oneMonthChangePercent).toBe(4.2);
    expect(component.getDisplayedOneDayChange(component.enrichedItems()[0] as any)).toBe(2.5);
    component.ngOnDestroy();
    discardPeriodicTasks();
  }));

  it('defaults to sorting watchlist rows by live 1D percent change descending', () => {
    watchlistItems.set([
      {
        id: 'item-1',
        watchlist_id: 'watchlist-1',
        symbol: 'AAA',
        name: 'AAA Corp',
        market: 'US',
        price_when_added: 100,
        added_at: '2026-04-01T00:00:00Z',
      },
      {
        id: 'item-2',
        watchlist_id: 'watchlist-1',
        symbol: 'BBB',
        name: 'BBB Corp',
        market: 'US',
        price_when_added: 100,
        added_at: '2026-04-01T00:00:00Z',
      },
      {
        id: 'item-3',
        watchlist_id: 'watchlist-1',
        symbol: 'CCC',
        name: 'CCC Corp',
        market: 'US',
        price_when_added: 100,
        added_at: '2026-04-01T00:00:00Z',
      },
    ]);
    (component as any).currentPrices.set({ AAA: 100, BBB: 100, CCC: 100 });
    (component as any).stockExtras.set({
      AAA: { oneDayChangePercent: -1 },
      BBB: { oneDayChangePercent: 4.5 },
      CCC: { oneDayChangePercent: 1.2 },
    });

    expect(component.sortKey()).toBe('oneDay');
    expect(component.sortDirection()).toBe('desc');
    expect(component.enrichedItems().map(item => item.symbol)).toEqual(['BBB', 'CCC', 'AAA']);
  });

  it('chunks watchlist enrichment so more than 10 rows receive quote and performance data', async () => {
    const symbols = ['AAA', 'BBB', 'CCC', 'DDD', 'EEE', 'FFF', 'GGG', 'HHH', 'III', 'JJJ', 'KKK', 'LLL'];
    httpGet.and.callFake((url: string) => {
      const parsed = new URL(url, 'http://localhost');
      const requestedSymbols = (parsed.searchParams.get('q') || '').split(',').filter(Boolean);
      return of({
        // Mirrors the backend cap that caused later watchlist rows to stay blank.
        stocks: requestedSymbols.slice(0, 10).map((symbol, index) => ({
          symbol,
          price: 100 + index,
          oneMonthChangePercent: 5,
          threeMonthChangePercent: 3,
          sixMonthChangePercent: 1,
        })),
      });
    });

    httpGet.calls.reset();
    watchlistItems.set(symbols.map((symbol, index) => ({
      id: `item-${index}`,
      watchlist_id: 'watchlist-1',
      symbol,
      name: symbol,
      market: 'US',
      price_when_added: 80,
      added_at: '2026-04-01T00:00:00Z',
    })));
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const requestedSymbolGroups = httpGet.calls.allArgs()
      .map(([url]) => new URL(url as string, 'http://localhost').searchParams.get('q') || '')
      .filter(Boolean)
      .map(q => q.split(',').filter(Boolean));

    expect(requestedSymbolGroups.length).toBeGreaterThan(1);
    expect(requestedSymbolGroups.every(group => group.length <= 10)).toBeTrue();
    expect(component.enrichedItems().every(item => (item as any).currentPrice != null)).toBeTrue();
    expect(component.enrichedItems().every(item => (item as any).oneMonthChangePercent === 5)).toBeTrue();
  });

  it('renders analyst target as separated price and percent lines', async () => {
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

    fixture.detectChanges();
    (component as any).currentPrices.set({ AAON: 100 });
    (component as any).stockExtras.set({ AAON: { targetMeanPrice: 125 } });
    fixture.detectChanges();

    const targetCell = (fixture.nativeElement as HTMLElement).querySelector('tbody td.col-target-wl');
    expect(targetCell?.querySelector('.target-price')?.textContent).toContain('$125');
    expect(targetCell?.querySelector('.target-pct')?.textContent).toContain('+25%');
  });
});
