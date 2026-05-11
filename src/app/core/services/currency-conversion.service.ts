import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { Stock } from '../models';

type SupportedCurrency = 'USD' | 'INR';

const FALLBACK_USD_INR_RATE = 95;

@Injectable({ providedIn: 'root' })
export class CurrencyConversionService {
  private readonly http = inject(HttpClient);
  private readonly usdInrRate = signal(FALLBACK_USD_INR_RATE);
  private readonly rateLoaded = signal(false);

  readonly loading = signal(false);
  readonly error = signal<string | null>(null);

  get rate(): number {
    return this.usdInrRate();
  }

  async loadUsdInrRate(): Promise<void> {
    if (this.rateLoaded() || this.loading()) return;

    this.loading.set(true);
    this.error.set(null);
    try {
      const params = new HttpParams()
        .set('action', 'quote')
        .set('symbol', 'INR=X')
        .set('market', 'US');
      const quote = await firstValueFrom(this.http.get<Stock>('/api/stocks', { params }));
      if (Number.isFinite(quote.price) && quote.price > 0) {
        this.usdInrRate.set(quote.price);
      }
      this.rateLoaded.set(true);
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'Unable to load USD/INR rate');
      this.rateLoaded.set(true);
    } finally {
      this.loading.set(false);
    }
  }

  convert(value: number, fromCurrency: string, toCurrency: string): number {
    const from = this.normalizeCurrency(fromCurrency);
    const to = this.normalizeCurrency(toCurrency);
    if (from === to) return value;
    if (from === 'USD' && to === 'INR') return value * this.usdInrRate();
    if (from === 'INR' && to === 'USD') return value / this.usdInrRate();
    return value;
  }

  private normalizeCurrency(currency: string): SupportedCurrency {
    return currency === 'INR' ? 'INR' : 'USD';
  }
}
