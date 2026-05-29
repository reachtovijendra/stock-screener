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
      this.hits.set(result?.picks ?? []);
      this.pickDate.set(result?.date ?? null);
    } catch (err: any) {
      console.error('[PennyHits] Load failed:', err);
      this.error.set('Could not load Penny Hits. Please try again later.');
      this.hits.set([]);
    } finally {
      this.loading.set(false);
    }
  }
}
