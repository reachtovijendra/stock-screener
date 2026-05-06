import { HttpClient } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { AuthService } from './auth.service';

export type WatchlistAccessRole = 'owner' | 'viewer' | 'editor';
export type ShareRole = 'viewer' | 'editor';

export interface Watchlist {
  id: string;
  user_id: string;
  name: string;
  created_at: string;
  updated_at: string;
  item_count?: number;
  sort_order?: number;
  access_role: WatchlistAccessRole;
  share_id?: string | null;
  shared_by_user_id?: string | null;
}

export interface WatchlistShare {
  id: string;
  watchlist_id: string;
  shared_with_user_id: string;
  shared_with_email: string | null;
  role: ShareRole;
  shared_by_user_id: string;
  created_at: string;
  updated_at: string | null;
}

export interface WatchlistItem {
  id: string;
  watchlist_id: string;
  symbol: string;
  name: string | null;
  market: string;
  price_when_added: number;
  added_at: string;
  // Enriched at runtime (not stored)
  currentPrice?: number | null;
  changePercent?: number | null;
  changeDollar?: number | null;
  sector?: string;
}

@Injectable({ providedIn: 'root' })
export class WatchlistService {
  private auth = inject(AuthService);
  private http = inject(HttpClient);

  private get db() { return this.auth.supabaseClient; }

  readonly watchlists = signal<Watchlist[]>([]);
  readonly selectedWatchlist = signal<Watchlist | null>(null);
  readonly items = signal<WatchlistItem[]>([]);
  readonly shares = signal<WatchlistShare[]>([]);
  readonly loading = signal(false);

  async loadWatchlists(): Promise<void> {
    this.loading.set(true);

    const user = this.auth.user();
    if (!user) {
      this.watchlists.set([]);
      this.selectedWatchlist.set(null);
      this.items.set([]);
      this.loading.set(false);
      return;
    }

    const { data: ownedData, error: ownedError } = await this.db
      .from('watchlists')
      .select('*, watchlist_items(count)')
      .eq('user_id', user.id)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true });

    const { data: sharedData, error: sharedError } = await this.db
      .from('watchlist_shares')
      .select('id, role, shared_by_user_id, watchlists(*, watchlist_items(count))')
      .eq('shared_with_user_id', user.id)
      .order('created_at', { ascending: true });

    if (!ownedError && !sharedError) {
      const owned = (ownedData ?? []).map((w: any) => ({
        ...w,
        item_count: w.watchlist_items?.[0]?.count ?? 0,
        access_role: 'owner' as const,
      }));

      const shared = (sharedData ?? [])
        .map((share: any) => {
          const watchlist = Array.isArray(share.watchlists) ? share.watchlists[0] : share.watchlists;
          if (!watchlist) return null;

          return {
            ...watchlist,
            item_count: watchlist.watchlist_items?.[0]?.count ?? 0,
            access_role: share.role as ShareRole,
            share_id: share.id,
            shared_by_user_id: share.shared_by_user_id,
          };
        })
        .filter(Boolean) as Watchlist[];

      const mapped = [...owned, ...shared];
      this.watchlists.set(mapped);

      const current = this.selectedWatchlist();
      const nextSelection = current ? mapped.find(w => w.id === current.id) ?? null : mapped[0] ?? null;

      if (nextSelection) {
        this.selectedWatchlist.set(nextSelection);
        await this.loadItems(nextSelection.id);
      } else {
        this.selectedWatchlist.set(null);
        this.items.set([]);
      }
    }
    this.loading.set(false);
  }

  async createWatchlist(name: string): Promise<Watchlist | null> {
    const user = this.auth.user();
    if (!user) return null;

    const { data, error } = await this.db
      .from('watchlists')
      .insert({ user_id: user.id, name })
      .select()
      .single();

    if (!error && data) {
      const created = { ...data, access_role: 'owner' as const };
      await this.loadWatchlists();
      this.selectedWatchlist.set(created);
      this.items.set([]);
      return created;
    }
    return null;
  }

  async deleteWatchlist(id: string): Promise<void> {
    if (!this.canManageWatchlist(id)) throw new Error('Only the owner can delete this watchlist.');

    await this.db.from('watchlists').delete().eq('id', id);
    if (this.selectedWatchlist()?.id === id) {
      this.selectedWatchlist.set(null);
      this.items.set([]);
    }
    await this.loadWatchlists();
  }

  async renameWatchlist(id: string, name: string): Promise<void> {
    if (!this.canManageWatchlist(id)) throw new Error('Only the owner can rename this watchlist.');

    await this.db
      .from('watchlists')
      .update({ name, updated_at: new Date().toISOString() })
      .eq('id', id);
    await this.loadWatchlists();
  }

  async loadItems(watchlistId: string): Promise<void> {
    this.loading.set(true);
    const { data, error } = await this.db
      .from('watchlist_items')
      .select('*')
      .eq('watchlist_id', watchlistId)
      .order('added_at', { ascending: false });

    if (!error && data) {
      this.items.set(data);
    }
    this.loading.set(false);
  }

  async addItem(watchlistId: string, symbol: string, name: string, market: string, price: number): Promise<void> {
    if (!this.canEditWatchlist(watchlistId)) throw new Error('You need Editor access to update this watchlist.');

    await this.db
      .from('watchlist_items')
      .insert({ watchlist_id: watchlistId, symbol, name, market, price_when_added: price });

    if (this.selectedWatchlist()?.id === watchlistId) {
      await this.loadItems(watchlistId);
    }
    await this.loadWatchlists();
  }

  async removeItem(itemId: string): Promise<void> {
    const selected = this.selectedWatchlist();
    if (selected && !this.canEditWatchlist(selected.id)) throw new Error('You need Editor access to update this watchlist.');

    await this.db.from('watchlist_items').delete().eq('id', itemId);
    const wl = this.selectedWatchlist();
    if (wl) await this.loadItems(wl.id);
    await this.loadWatchlists();
  }

  async getWatchlistsForSymbol(symbol: string): Promise<{ watchlistId: string; watchlistName: string }[]> {
    const { data } = await this.db
      .from('watchlist_items')
      .select('watchlist_id, watchlists(name)')
      .eq('symbol', symbol);

    if (data) {
      return data.map((d: any) => ({
        watchlistId: d.watchlist_id,
        watchlistName: d.watchlists?.name ?? 'Unknown',
      }));
    }
    return [];
  }

  async saveOrder(order: { id: string; sort_order: number }[]): Promise<void> {
    for (const item of order.filter(entry => this.canManageWatchlist(entry.id))) {
      await this.db.from('watchlists').update({ sort_order: item.sort_order }).eq('id', item.id);
    }
  }

  selectWatchlist(wl: Watchlist): void {
    this.selectedWatchlist.set(wl);
    this.loadItems(wl.id);
  }

  canEditWatchlist(watchlistId: string): boolean {
    const role = this.findWatchlist(watchlistId)?.access_role;
    return role === 'owner' || role === 'editor';
  }

  canManageWatchlist(watchlistId: string): boolean {
    return this.findWatchlist(watchlistId)?.access_role === 'owner';
  }

  async loadShares(watchlistId: string): Promise<WatchlistShare[]> {
    if (!this.canManageWatchlist(watchlistId)) {
      this.shares.set([]);
      return [];
    }

    const response = await firstValueFrom(this.http.get<{ shares: WatchlistShare[] }>(
      `/api/watchlists/share?watchlistId=${encodeURIComponent(watchlistId)}`,
      { headers: await this.authHeaders() }
    ));
    const shares = response.shares ?? [];
    this.shares.set(shares);
    return shares;
  }

  async shareWatchlist(watchlistId: string, email: string, role: ShareRole): Promise<WatchlistShare> {
    if (!this.canManageWatchlist(watchlistId)) throw new Error('Only the owner can share this watchlist.');

    const response = await firstValueFrom(this.http.post<{ share: WatchlistShare }>(
      '/api/watchlists/share',
      { watchlistId, email, role },
      { headers: await this.authHeaders() }
    ));
    await this.loadShares(watchlistId);
    return response.share;
  }

  async updateShareRole(shareId: string, role: ShareRole): Promise<WatchlistShare> {
    const response = await firstValueFrom(this.http.patch<{ share: WatchlistShare }>(
      `/api/watchlists/share/${encodeURIComponent(shareId)}`,
      { role },
      { headers: await this.authHeaders() }
    ));
    const selected = this.selectedWatchlist();
    if (selected) await this.loadShares(selected.id);
    return response.share;
  }

  async revokeShare(shareId: string): Promise<void> {
    await firstValueFrom(this.http.delete<void>(
      `/api/watchlists/share/${encodeURIComponent(shareId)}`,
      { headers: await this.authHeaders() }
    ));
    const selected = this.selectedWatchlist();
    if (selected) await this.loadShares(selected.id);
  }

  private findWatchlist(watchlistId: string): Watchlist | undefined {
    return this.watchlists().find(w => w.id === watchlistId);
  }

  private async authHeaders(): Promise<{ Authorization: string }> {
    const token = await this.auth.getAccessToken();
    if (!token) throw new Error('Authentication required.');
    return { Authorization: `Bearer ${token}` };
  }
}
