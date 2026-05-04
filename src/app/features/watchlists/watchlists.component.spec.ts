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
    const watchlists = signal([
      selectedWatchlist(),
      {
        id: 'watchlist-2',
        user_id: 'user-1',
        name: 'Second',
        created_at: '2026-04-30T00:00:00Z',
        updated_at: '2026-04-30T00:00:00Z',
        item_count: 3,
      },
    ]);
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

  it('keeps visible stock suggestions during transient blank autocomplete queries', async () => {
    const existingSuggestion = { symbol: 'SOXX', name: 'iShares Semiconductor ETF', market: 'US', price: 220 };
    component.searchResults.set([existingSuggestion]);

    await component.searchStocks({ originalEvent: new Event('input'), query: '' });

    expect(component.searchResults()).toEqual([existingSuggestion]);
  });

  it('collapses and expands the watchlist panel from the dock control', () => {
    fixture.detectChanges();

    const native = fixture.nativeElement as HTMLElement;
    const collapseButton = native.querySelector<HTMLButtonElement>('.sidebar-dock-toggle');

    expect(collapseButton?.getAttribute('aria-label')).toBe('Collapse watchlist panel');
    expect(collapseButton?.querySelector('.dock-pin-icon')).not.toBeNull();
    expect(native.querySelector('.wl-sidebar.collapsed')).toBeNull();

    collapseButton?.click();
    fixture.detectChanges();

    expect(component.watchlistPanelCollapsed()).toBeTrue();
    expect(native.querySelector('.content.sidebar-collapsed')).not.toBeNull();
    expect(native.querySelector('.wl-sidebar.collapsed')).not.toBeNull();

    const expandButton = native.querySelector<HTMLButtonElement>('.sidebar-dock-toggle');
    expect(expandButton?.getAttribute('aria-label')).toBe('Expand watchlist panel');
    expect(expandButton?.querySelector('.dock-pin-icon.collapsed')).not.toBeNull();

    expandButton?.click();
    fixture.detectChanges();

    expect(component.watchlistPanelCollapsed()).toBeFalse();
    expect(native.querySelector('.wl-sidebar.collapsed')).toBeNull();
  });

  it('auto-collapses the watchlist panel after selecting a watchlist', () => {
    fixture.detectChanges();

    const native = fixture.nativeElement as HTMLElement;
    native.querySelector<HTMLElement>('.wl-item')?.click();
    fixture.detectChanges();

    expect(component.wlService.selectWatchlist).toHaveBeenCalledWith(component.wlService.watchlists()[0]);
    expect(component.watchlistPanelCollapsed()).toBeTrue();
    expect(native.querySelector('.wl-sidebar.collapsed')).not.toBeNull();
  });

  it('expands the watchlist panel when clicking anywhere on the collapsed panel', () => {
    component.watchlistPanelCollapsed.set(true);
    fixture.detectChanges();

    const native = fixture.nativeElement as HTMLElement;
    const collapsedLabel = native.querySelector<HTMLElement>('.collapsed-watchlist-name');
    const collapsedCount = native.querySelector<HTMLElement>('.collapsed-watchlist-count');

    expect(collapsedLabel?.textContent?.trim()).toBe('Click to see watchlists');
    expect(getComputedStyle(collapsedLabel!).writingMode).toBe('vertical-rl');
    expect(getComputedStyle(collapsedLabel!).transform).not.toBe('none');
    expect(collapsedCount?.textContent?.trim()).toBe('2');

    native.querySelector<HTMLElement>('.wl-sidebar.collapsed')?.click();
    fixture.detectChanges();

    expect(component.watchlistPanelCollapsed()).toBeFalse();
    expect(native.querySelector('.wl-sidebar.collapsed')).toBeNull();
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
    expect(text).toContain('1M');
    expect(text).toContain('3M');
    expect(text).toContain('6M');
    expect(text).toContain('+4.20%');
    expect(text).toContain('-3.50%');
    expect(text).toContain('+12.75%');
    expect(httpGet.calls.mostRecent().args[0]).toContain('performance=true');
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
