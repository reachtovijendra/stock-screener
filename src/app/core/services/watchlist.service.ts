import { Injectable, inject, signal } from '@angular/core';
import { AuthService } from './auth.service';

export interface Watchlist {
  id: string;
  user_id: string;
  name: string;
  created_at: string;
  updated_at: string;
  item_count?: number;
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

  private get db() { return this.auth.supabaseClient; }

  readonly watchlists = signal<Watchlist[]>([]);
  readonly selectedWatchlist = signal<Watchlist | null>(null);
  readonly items = signal<WatchlistItem[]>([]);
  readonly loading = signal(false);

  async loadWatchlists(): Promise<void> {
    this.loading.set(true);
    const { data, error } = await this.db
      .from('watchlists')
      .select('*, watchlist_items(count)')
      .order('created_at', { ascending: true });

    if (!error && data) {
      const mapped = data.map((w: any) => ({
        ...w,
        item_count: w.watchlist_items?.[0]?.count ?? 0,
      }));
      this.watchlists.set(mapped);

      // Auto-select first if none selected
      if (!this.selectedWatchlist() && mapped.length > 0) {
        this.selectedWatchlist.set(mapped[0]);
        await this.loadItems(mapped[0].id);
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
      await this.loadWatchlists();
      this.selectedWatchlist.set(data);
      this.items.set([]);
      return data;
    }
    return null;
  }

  async deleteWatchlist(id: string): Promise<void> {
    await this.db.from('watchlists').delete().eq('id', id);
    if (this.selectedWatchlist()?.id === id) {
      this.selectedWatchlist.set(null);
      this.items.set([]);
    }
    await this.loadWatchlists();
  }

  async renameWatchlist(id: string, name: string): Promise<void> {
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
    await this.db
      .from('watchlist_items')
      .insert({ watchlist_id: watchlistId, symbol, name, market, price_when_added: price });

    if (this.selectedWatchlist()?.id === watchlistId) {
      await this.loadItems(watchlistId);
    }
    await this.loadWatchlists();
  }

  async removeItem(itemId: string): Promise<void> {
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

  selectWatchlist(wl: Watchlist): void {
    this.selectedWatchlist.set(wl);
    this.loadItems(wl.id);
  }
}
