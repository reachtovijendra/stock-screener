import { signal, WritableSignal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';

import { Watchlist, WatchlistService } from '../../core/services/watchlist.service';
import { WatchlistsComponent } from './watchlists.component';

describe('WatchlistsComponent', () => {
  let component: WatchlistsComponent;
  let fixture: ComponentFixture<WatchlistsComponent>;
  let routerNavigate: jasmine.Spy;
  let watchlists: WritableSignal<Watchlist[]>;
  let selectedWatchlist: WritableSignal<Watchlist | null>;

  const ownedWatchlist: Watchlist = {
    id: 'watchlist-1',
    user_id: 'user-1',
    name: 'Long Term Ideas',
    created_at: '2026-04-30T00:00:00Z',
    updated_at: '2026-05-01T00:00:00Z',
    item_count: 4,
    access_role: 'owner',
  };

  const sharedWatchlist: Watchlist = {
    id: 'watchlist-2',
    user_id: 'user-2',
    name: 'Shared Momentum',
    created_at: '2026-04-20T00:00:00Z',
    updated_at: '2026-04-25T00:00:00Z',
    item_count: 3,
    access_role: 'viewer',
  };

  beforeEach(async () => {
    watchlists = signal<Watchlist[]>([ownedWatchlist, sharedWatchlist]);
    selectedWatchlist = signal<Watchlist | null>(ownedWatchlist);
    const loading = signal(false);
    const shares = signal([]);
    routerNavigate = jasmine.createSpy('navigate');

    await TestBed.configureTestingModule({
      imports: [WatchlistsComponent],
      providers: [
        {
          provide: WatchlistService,
          useValue: {
            watchlists,
            selectedWatchlist,
            shares,
            loading,
            createWatchlist: jasmine.createSpy('createWatchlist').and.resolveTo({ ...ownedWatchlist, id: 'created-1', name: 'AI Leaders' }),
            deleteWatchlist: jasmine.createSpy('deleteWatchlist').and.resolveTo(),
            loadShares: jasmine.createSpy('loadShares').and.resolveTo([]),
            loadWatchlists: jasmine.createSpy('loadWatchlists').and.resolveTo(),
            renameWatchlist: jasmine.createSpy('renameWatchlist').and.resolveTo(),
            revokeShare: jasmine.createSpy('revokeShare').and.resolveTo(),
            saveOrder: jasmine.createSpy('saveOrder').and.resolveTo(),
            shareWatchlist: jasmine.createSpy('shareWatchlist').and.resolveTo(null),
            selectWatchlist: jasmine.createSpy('selectWatchlist'),
            updateShareRole: jasmine.createSpy('updateShareRole').and.resolveTo(null),
          },
        },
        {
          provide: Router,
          useValue: {
            navigate: routerNavigate,
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(WatchlistsComponent);
    component = fixture.componentInstance;
  });

  it('renders a compact watchlist table without the old dock or sidebar controls', () => {
    fixture.detectChanges();

    const native = fixture.nativeElement as HTMLElement;
    expect(native.querySelector('.watchlist-header')?.textContent).toContain('Stock decks');
    expect(native.querySelectorAll('.watchlist-row').length).toBe(2);
    expect(native.querySelector('.watchlist-table')?.textContent).toContain('Watchlist Name');
    expect(native.querySelector('.watchlist-table')?.textContent).toContain('Access Role');
    expect(native.querySelector('.watchlist-table')?.textContent).toContain('Created On');
    expect(native.querySelector('.watchlist-table')?.textContent).toContain('#Stocks');
    expect(native.querySelector('.sidebar-dock-toggle')).toBeNull();
    expect(native.querySelector('.wl-sidebar')).toBeNull();
    expect(native.querySelector('.wl-collapsed-rail')).toBeNull();
  });

  it('shows summary metrics for lists, stocks, owned, and shared watchlists', () => {
    fixture.detectChanges();

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('Total Lists');
    expect(text).toContain('Tracked Stocks');
    expect(component.totalStocks()).toBe(7);
    expect(component.ownedCount()).toBe(1);
    expect(component.sharedCount()).toBe(1);
  });

  it('opens a watchlist from the watchlist name link', () => {
    fixture.detectChanges();

    const nameLink = (fixture.nativeElement as HTMLElement).querySelector<HTMLAnchorElement>('.name-button');
    nameLink?.click();

    expect(component.wlService.selectWatchlist).toHaveBeenCalledWith(ownedWatchlist);
    expect(nameLink?.getAttribute('href')).toBe('/watchlists/watchlist-1');
    expect(routerNavigate).toHaveBeenCalledWith(['/watchlists', 'watchlist-1']);
    expect((fixture.nativeElement as HTMLElement).querySelector('.open-btn')).toBeNull();
  });

  it('creates a watchlist and opens the new stocks page', async () => {
    component.newWatchlistName = 'AI Leaders';

    await component.createWatchlist();

    expect(component.wlService.createWatchlist).toHaveBeenCalledWith('AI Leaders');
    expect(routerNavigate).toHaveBeenCalledWith(['/watchlists', 'created-1']);
    expect(component.showCreateDialog()).toBeFalse();
  });

  it('hides rename and delete actions for viewer watchlists', () => {
    fixture.detectChanges();

    const rows = (fixture.nativeElement as HTMLElement).querySelectorAll<HTMLElement>('.watchlist-row');
    expect(rows[0].querySelectorAll('.icon-btn').length).toBe(3);
    expect(rows[1].querySelector('.icon-btn')).toBeNull();
  });

  it('opens the share dialog from the owner row share icon', async () => {
    fixture.detectChanges();

    const shareButton = (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>('.share-action');
    shareButton?.click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(component.wlService.loadShares).toHaveBeenCalledWith('watchlist-1');
    expect(component.activeShareWatchlist()).toEqual(ownedWatchlist);
    expect(component.showShareDialog()).toBeTrue();
    expect((fixture.nativeElement as HTMLElement).querySelector('.share-dialog')?.textContent).toContain('Long Term Ideas');
  });

  it('reorders watchlist cards and persists the new order', () => {
    component.dragIndex = 0;

    component.onDrop(1, new DragEvent('drop'));

    expect(component.wlService.watchlists().map(wl => wl.id)).toEqual(['watchlist-2', 'watchlist-1']);
    expect(component.wlService.saveOrder).toHaveBeenCalledWith([
      { id: 'watchlist-2', sort_order: 0 },
      { id: 'watchlist-1', sort_order: 1 },
    ]);
  });
});
