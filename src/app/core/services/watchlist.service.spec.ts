import { HttpClient } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';

import { AuthService } from './auth.service';
import { WatchlistService } from './watchlist.service';

describe('WatchlistService', () => {
  let service: WatchlistService;
  let updates: Array<{ id: string; payload: { sort_order: number } }>;

  const ownedWatchlist = {
    id: 'owned-1',
    user_id: 'user-1',
    name: 'Owned Ideas',
    created_at: '2026-05-01T00:00:00Z',
    updated_at: '2026-05-01T00:00:00Z',
    sort_order: 0,
    watchlist_items: [{ count: 2 }],
  };

  const sharedWatchlist = {
    id: 'shared-1',
    user_id: 'user-2',
    name: 'Shared Momentum',
    created_at: '2026-05-02T00:00:00Z',
    updated_at: '2026-05-02T00:00:00Z',
    watchlist_items: [{ count: 4 }],
  };

  beforeEach(() => {
    updates = [];
    localStorage.clear();

    const user = signal({ id: 'user-1' });
    const supabaseClient = createSupabaseClient(updates);

    TestBed.configureTestingModule({
      providers: [
        WatchlistService,
        { provide: HttpClient, useValue: {} },
        {
          provide: AuthService,
          useValue: {
            user: user.asReadonly(),
            supabaseClient,
          },
        },
      ],
    });

    service = TestBed.inject(WatchlistService);
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('reapplies the saved combined watchlist order after reload', async () => {
    service.watchlists.set([
      { ...ownedWatchlist, item_count: 2, access_role: 'owner' },
      { ...sharedWatchlist, item_count: 4, access_role: 'viewer' },
    ]);

    await service.saveOrder([
      { id: 'shared-1', sort_order: 0 },
      { id: 'owned-1', sort_order: 1 },
    ]);
    await service.loadWatchlists();

    expect(service.watchlists().map(watchlist => watchlist.id)).toEqual(['shared-1', 'owned-1']);
    expect(updates).toEqual([{ id: 'owned-1', payload: { sort_order: 1 } }]);
  });

  function createSupabaseClient(updateCalls: Array<{ id: string; payload: { sort_order: number } }>) {
    return {
      from: (table: string) => new SupabaseQueryBuilder(table, updateCalls),
    };
  }

  class SupabaseQueryBuilder {
    private readonly result: { data: unknown; error: null };
    private updatePayload: { sort_order: number } | null = null;

    constructor(
      private readonly table: string,
      private readonly updateCalls: Array<{ id: string; payload: { sort_order: number } }>
    ) {
      this.result = { data: this.resolveData(table), error: null };
    }

    select(): this {
      return this;
    }

    eq(column: string, value: string): this {
      if (this.table === 'watchlists' && column === 'id' && this.updatePayload) {
        this.updateCalls.push({ id: value, payload: this.updatePayload });
      }
      return this;
    }

    order(): this {
      return this;
    }

    update(payload: { sort_order: number }): this {
      this.updatePayload = payload;
      return this;
    }

    then<TResult1 = { data: unknown; error: null }, TResult2 = never>(
      onfulfilled?: ((value: { data: unknown; error: null }) => TResult1 | PromiseLike<TResult1>) | null,
      onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
    ): PromiseLike<TResult1 | TResult2> {
      return Promise.resolve(this.result).then(onfulfilled, onrejected);
    }

    private resolveData(table: string): unknown[] {
      if (table === 'watchlists') return [ownedWatchlist];
      if (table === 'watchlist_shares') {
        return [
          {
            id: 'share-1',
            role: 'viewer',
            shared_by_user_id: 'user-2',
            watchlists: sharedWatchlist,
          },
        ];
      }
      return [];
    }
  }
});
