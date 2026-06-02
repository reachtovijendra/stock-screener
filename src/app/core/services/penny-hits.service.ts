import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { MarketService } from './market.service';

export interface PennyHit {
  id: number;
  market: string;
  pick_date: string;
  symbol: string;
  name: string;
  sector: string | null;
  industry: string | null;
  market_cap: number | null;
  price: number;
  score: number;
  catalysts: string[];
  thesis: string;
  target_mean_price: number | null;
  upside_percent: number | null;
  recommendation_mean: number | null;
  num_analysts: number | null;
  insider_net_shares: number | null;
  insider_net_value: number | null;
  relative_volume: number | null;
  one_month_change_percent: number | null;
  change_percent: number | null;
}

export interface PennyHitsResponse {
  market: string;
  date: string | null;
  count: number;
  picks: PennyHit[];
}

@Injectable({ providedIn: 'root' })
export class PennyHitsService {
  private http = inject(HttpClient);
  private marketService = inject(MarketService);

  readonly hits = signal<PennyHit[]>([]);
  readonly pickDate = signal<string | null>(null);
  readonly loading = signal<boolean>(false);
  readonly error = signal<string | null>(null);

  async load(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    // Penny Hits is US-only for v1.
    const market = 'US';
    try {
      const result = await firstValueFrom(
        this.http.get<PennyHitsResponse>(`/api/stocks?action=penny-hits&market=${market}`)
      );
      const picks = result?.picks ?? [];
      this.hits.set(picks);
      this.pickDate.set(result?.date ?? null);
      // The cached rows carry the price captured at the last daily scan. Overlay
      // live quotes so the price, change %, and upside reflect the current market.
      void this.refreshLivePrices(picks, market);
    } catch (err: any) {
      console.error('[PennyHits] Load failed:', err);
      this.error.set('Could not load Penny Hits. Please try again later.');
      this.hits.set([]);
    } finally {
      this.loading.set(false);
    }
  }

  private async refreshLivePrices(picks: PennyHit[], market: string): Promise<void> {
    if (!picks.length) return;
    try {
      const symbols = picks.map(p => p.symbol).join(',');
      const quotes = await firstValueFrom(
        this.http.get<Array<{ symbol: string; price: number; changePercent: number; sector?: string; industry?: string }>>(
          `/api/stocks?action=quote&symbols=${encodeURIComponent(symbols)}&market=${market}`
        )
      );
      if (!Array.isArray(quotes) || quotes.length === 0) return;

      const isMeaningful = (v?: string | null): v is string =>
        !!v && v.toLowerCase() !== 'unknown';

      const bySymbol = new Map(quotes.map(q => [q.symbol, q]));
      const updated = this.hits().map(pick => {
        const quote = bySymbol.get(pick.symbol);
        if (!quote) return pick;
        // Overlay classification when the daily scan stored "Unknown" but the
        // live quote carries a real sector/industry.
        const sector = isMeaningful(quote.sector) ? quote.sector : pick.sector;
        const industry = isMeaningful(quote.industry) ? quote.industry : pick.industry;
        if (!quote.price || quote.price <= 0) {
          return { ...pick, sector, industry };
        }
        const price = quote.price;
        const upside_percent = pick.target_mean_price != null
          ? ((pick.target_mean_price - price) / price) * 100
          : pick.upside_percent;
        return {
          ...pick,
          price,
          change_percent: quote.changePercent ?? pick.change_percent,
          upside_percent,
          sector,
          industry,
        };
      });
      this.hits.set(updated);
    } catch (err: any) {
      console.warn('[PennyHits] Live price refresh failed; showing cached prices:', err);
    }
  }
}
