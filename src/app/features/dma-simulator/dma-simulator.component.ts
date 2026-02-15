import { Component, inject, signal } from '@angular/core';
import { CommonModule, DecimalPipe } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { FormsModule } from '@angular/forms';

import { AutoCompleteModule, AutoCompleteCompleteEvent } from 'primeng/autocomplete';
import { ProgressSpinnerModule } from 'primeng/progressspinner';
import { TooltipModule } from 'primeng/tooltip';

import { MarketService } from '../../core/services';

interface Crossover {
  date: string;
  type: 'golden_cross' | 'death_cross';
  sma50: number;
  sma200: number;
  close: number;
}

interface DmaCrossoverResponse {
  symbol: string;
  crossovers: Crossover[];
  currentSMA50: number | null;
  currentSMA200: number | null;
  currentClose: number;
  currentDate: string;
  currentState: 'golden' | 'death' | 'unknown';
  totalTradingDays: number;
}

@Component({
  selector: 'app-dma-simulator',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    AutoCompleteModule,
    ProgressSpinnerModule,
    TooltipModule,
    DecimalPipe,
  ],
  template: `
    <div class="dma-container">
      <!-- Page Header -->
      <div class="dma-header">
        <div class="dma-title-row">
          <h1 class="dma-title">DMA Simulator</h1>
          <span class="dma-subtitle">50 / 200 Day Moving Average Crossover Analysis</span>
        </div>
      </div>

      <!-- Search Bar -->
      <div class="dma-search-section">
        <div class="search-wrapper">
          <i class="pi pi-search search-icon"></i>
          <p-autoComplete
            [(ngModel)]="searchSelected"
            [suggestions]="searchSuggestions()"
            (completeMethod)="onSearchComplete($event)"
            (onSelect)="onStockSelect($event)"
            [minLength]="1"
            [delay]="300"
            placeholder="Search for a stock (e.g., TQQQ, AAPL, RELIANCE.NS)"
            [showEmptyMessage]="true"
            emptyMessage="No stocks found"
            [forceSelection]="false"
            field="symbol"
            appendTo="body"
            [scrollHeight]="'400px'"
            styleClass="dma-search-autocomplete"
            inputStyleClass="dma-search-input">
            <ng-template let-stock pTemplate="item">
              <div class="search-item">
                <span class="si-symbol">{{ stock.symbol }}</span>
                <span class="si-name">{{ stock.name }}</span>
                <span class="si-price" [class.positive]="stock.changePercent >= 0" [class.negative]="stock.changePercent < 0">
                  {{ marketService.formatCurrency(stock.price, stock.market) }}
                  ({{ stock.changePercent >= 0 ? '+' : '' }}{{ stock.changePercent | number:'1.2-2' }}%)
                </span>
              </div>
            </ng-template>
          </p-autoComplete>
        </div>
      </div>

      <!-- Loading State -->
      @if (loading()) {
        <div class="dma-loading">
          <p-progressSpinner [style]="{ width: '50px', height: '50px' }" strokeWidth="3"></p-progressSpinner>
          <p class="loading-text">Analyzing {{ selectedSymbol() }} crossovers...</p>
        </div>
      }

      <!-- Error State -->
      @if (error()) {
        <div class="dma-error">
          <i class="pi pi-exclamation-triangle"></i>
          <p>{{ error() }}</p>
        </div>
      }

      <!-- Results -->
      @if (result() && !loading()) {
        <div class="dma-results">
          <!-- Current State Banner -->
          <div class="current-state-banner" [class.golden]="result()!.currentState === 'golden'" [class.death]="result()!.currentState === 'death'">
            <div class="state-icon">
              @if (result()!.currentState === 'golden') {
                <i class="pi pi-arrow-up"></i>
              } @else if (result()!.currentState === 'death') {
                <i class="pi pi-arrow-down"></i>
              } @else {
                <i class="pi pi-minus"></i>
              }
            </div>
            <div class="state-info">
              <div class="state-label">
                {{ result()!.symbol }} is currently in a
                <strong>{{ result()!.currentState === 'golden' ? 'Golden Cross' : result()!.currentState === 'death' ? 'Death Cross' : 'Unknown' }}</strong>
                state
              </div>
              <div class="state-details">
                Close: <strong>{{ result()!.currentClose | number:'1.2-2' }}</strong>
                &nbsp;|&nbsp;
                50 DMA: <strong>{{ result()!.currentSMA50 | number:'1.2-2' }}</strong>
                &nbsp;|&nbsp;
                200 DMA: <strong>{{ result()!.currentSMA200 | number:'1.2-2' }}</strong>
                &nbsp;|&nbsp;
                As of {{ result()!.currentDate }}
              </div>
            </div>
          </div>

          <!-- Crossover Timeline -->
          @if (result()!.crossovers.length > 0) {
            <div class="timeline-header">
              <h2>Crossover Events <span class="event-count">({{ result()!.crossovers.length }})</span></h2>
              <span class="timeline-period">Last 3 years</span>
            </div>

            <div class="timeline">
              @for (cross of result()!.crossovers; track cross.date; let idx = $index) {
                <div class="timeline-event" [class.golden]="cross.type === 'golden_cross'" [class.death]="cross.type === 'death_cross'">
                  <div class="event-connector">
                    <div class="connector-dot"></div>
                    <div class="connector-line"></div>
                  </div>
                  <div class="event-card">
                    <div class="event-card-header">
                      <div class="event-type-badge" [class.golden]="cross.type === 'golden_cross'" [class.death]="cross.type === 'death_cross'">
                        @if (cross.type === 'golden_cross') {
                          <i class="pi pi-arrow-up"></i> Golden Cross
                        } @else {
                          <i class="pi pi-arrow-down"></i> Death Cross
                        }
                      </div>
                      @if (idx > 0) {
                        <span class="price-change-badge"
                          [class.positive]="getPriceChangeFromPrevious(idx) >= 0"
                          [class.negative]="getPriceChangeFromPrevious(idx) < 0">
                          {{ getPriceChangeFromPrevious(idx) >= 0 ? '+' : '' }}{{ getPriceChangeFromPrevious(idx) | number:'1.2-2' }}% since previous cross
                        </span>
                      }
                    </div>
                    <div class="event-date">{{ formatDate(cross.date) }}</div>
                    <div class="event-metrics">
                      <div class="metric">
                        <span class="metric-label">Close</span>
                        <span class="metric-value">{{ cross.close | number:'1.2-2' }}</span>
                      </div>
                      <div class="metric">
                        <span class="metric-label">50 DMA</span>
                        <span class="metric-value">{{ cross.sma50 | number:'1.2-2' }}</span>
                      </div>
                      <div class="metric">
                        <span class="metric-label">200 DMA</span>
                        <span class="metric-value">{{ cross.sma200 | number:'1.2-2' }}</span>
                      </div>
                    </div>
                  </div>
                </div>
              }
            </div>
          } @else {
            <div class="no-crossovers">
              <i class="pi pi-info-circle"></i>
              <p>No golden cross or death cross events found for <strong>{{ result()!.symbol }}</strong> in the last 3 years.</p>
            </div>
          }
        </div>
      }

      <!-- Empty State -->
      @if (!result() && !loading() && !error()) {
        <div class="dma-empty">
          <div class="empty-icon">
            <i class="pi pi-chart-bar"></i>
          </div>
          <h2>Search for a stock to begin</h2>
          <p>Enter a stock symbol or name above to see its 50/200 DMA crossover history over the last 3 years.</p>
          <div class="empty-examples">
            <span class="example-chip" (click)="quickSearch('TQQQ')">TQQQ</span>
            <span class="example-chip" (click)="quickSearch('AAPL')">AAPL</span>
            <span class="example-chip" (click)="quickSearch('NVDA')">NVDA</span>
            <span class="example-chip" (click)="quickSearch('RELIANCE.NS')">RELIANCE.NS</span>
            <span class="example-chip" (click)="quickSearch('SPY')">SPY</span>
          </div>
        </div>
      }
    </div>
  `,
  styles: [`
    .dma-container {
      padding: 1.5rem 2rem;
      max-width: 900px;
      margin: 0 auto;
    }

    /* Header */
    .dma-header {
      margin-bottom: 1.5rem;
    }
    .dma-title-row {
      display: flex;
      align-items: baseline;
      gap: 1rem;
      flex-wrap: wrap;
    }
    .dma-title {
      font-size: 1.5rem;
      font-weight: 700;
      color: var(--text-color);
      margin: 0;
    }
    .dma-subtitle {
      font-size: 0.85rem;
      color: var(--text-color-secondary);
    }

    /* Search */
    .dma-search-section {
      margin-bottom: 2rem;
    }
    .search-wrapper {
      position: relative;
      max-width: 600px;
    }
    .search-icon {
      position: absolute;
      left: 14px;
      top: 50%;
      transform: translateY(-50%);
      color: var(--text-color-secondary);
      z-index: 1;
      font-size: 1rem;
    }
    :host ::ng-deep .dma-search-autocomplete {
      width: 100%;
    }
    :host ::ng-deep .dma-search-autocomplete .p-autocomplete-input,
    :host ::ng-deep .dma-search-autocomplete input {
      width: 100%;
      padding: 0.75rem 1rem 0.75rem 2.5rem;
      border-radius: 10px;
      border: 1px solid var(--surface-border);
      background: var(--surface-card);
      color: var(--text-color);
      font-size: 0.95rem;
    }
    :host ::ng-deep .dma-search-autocomplete .p-autocomplete-input:focus,
    :host ::ng-deep .dma-search-autocomplete input:focus {
      border-color: var(--primary-color);
      box-shadow: 0 0 0 2px rgba(99, 102, 241, 0.15);
    }
    .search-item {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      padding: 0.35rem 0;
    }
    .si-symbol {
      font-weight: 700;
      color: var(--text-color);
      min-width: 80px;
    }
    .si-name {
      color: var(--text-color-secondary);
      font-size: 0.85rem;
      flex: 1;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .si-price {
      font-size: 0.85rem;
      font-weight: 600;
      white-space: nowrap;
    }
    .si-price.positive { color: var(--green-400); }
    .si-price.negative { color: var(--red-400); }

    /* Loading */
    .dma-loading {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 1rem;
      padding: 3rem 0;
    }
    .loading-text {
      color: var(--text-color-secondary);
      font-size: 0.9rem;
    }

    /* Error */
    .dma-error {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      padding: 1rem 1.25rem;
      background: rgba(239, 68, 68, 0.1);
      border: 1px solid rgba(239, 68, 68, 0.25);
      border-radius: 10px;
      color: var(--red-400);
      font-size: 0.9rem;
    }
    .dma-error i { font-size: 1.25rem; }

    /* Current State Banner */
    .current-state-banner {
      display: flex;
      align-items: center;
      gap: 1rem;
      padding: 1.25rem 1.5rem;
      border-radius: 12px;
      margin-bottom: 2rem;
      border: 1px solid var(--surface-border);
    }
    .current-state-banner.golden {
      background: linear-gradient(135deg, rgba(34, 197, 94, 0.08) 0%, rgba(34, 197, 94, 0.02) 100%);
      border-color: rgba(34, 197, 94, 0.25);
    }
    .current-state-banner.death {
      background: linear-gradient(135deg, rgba(239, 68, 68, 0.08) 0%, rgba(239, 68, 68, 0.02) 100%);
      border-color: rgba(239, 68, 68, 0.25);
    }
    .state-icon {
      width: 48px;
      height: 48px;
      border-radius: 12px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 1.5rem;
      flex-shrink: 0;
    }
    .current-state-banner.golden .state-icon {
      background: rgba(34, 197, 94, 0.15);
      color: var(--green-400);
    }
    .current-state-banner.death .state-icon {
      background: rgba(239, 68, 68, 0.15);
      color: var(--red-400);
    }
    .state-info { flex: 1; }
    .state-label {
      font-size: 1rem;
      color: var(--text-color);
      margin-bottom: 0.35rem;
    }
    .state-details {
      font-size: 0.8rem;
      color: var(--text-color-secondary);
    }
    .state-details strong {
      color: var(--text-color);
    }

    /* Timeline Header */
    .timeline-header {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      margin-bottom: 1.25rem;
    }
    .timeline-header h2 {
      font-size: 1.1rem;
      font-weight: 600;
      color: var(--text-color);
      margin: 0;
    }
    .event-count {
      font-weight: 400;
      color: var(--text-color-secondary);
      font-size: 0.9rem;
    }
    .timeline-period {
      font-size: 0.8rem;
      color: var(--text-color-secondary);
    }

    /* Timeline */
    .timeline {
      display: flex;
      flex-direction: column;
      gap: 0;
    }
    .timeline-event {
      display: flex;
      gap: 1.25rem;
      position: relative;
    }

    /* Connector */
    .event-connector {
      display: flex;
      flex-direction: column;
      align-items: center;
      width: 20px;
      flex-shrink: 0;
    }
    .connector-dot {
      width: 14px;
      height: 14px;
      border-radius: 50%;
      flex-shrink: 0;
      margin-top: 1.25rem;
      border: 3px solid;
    }
    .timeline-event.golden .connector-dot {
      border-color: var(--green-400);
      background: rgba(34, 197, 94, 0.3);
    }
    .timeline-event.death .connector-dot {
      border-color: var(--red-400);
      background: rgba(239, 68, 68, 0.3);
    }
    .connector-line {
      width: 2px;
      flex: 1;
      min-height: 16px;
    }
    .timeline-event.golden .connector-line { background: rgba(34, 197, 94, 0.2); }
    .timeline-event.death .connector-line { background: rgba(239, 68, 68, 0.2); }
    .timeline-event:last-child .connector-line { display: none; }

    /* Event Card */
    .event-card {
      flex: 1;
      background: var(--surface-card);
      border: 1px solid var(--surface-border);
      border-radius: 10px;
      padding: 1rem 1.25rem;
      margin-bottom: 0.75rem;
      transition: border-color 0.2s;
    }
    .timeline-event.golden .event-card:hover { border-color: rgba(34, 197, 94, 0.4); }
    .timeline-event.death .event-card:hover { border-color: rgba(239, 68, 68, 0.4); }

    .event-card-header {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      margin-bottom: 0.5rem;
      flex-wrap: wrap;
    }
    .event-type-badge {
      display: inline-flex;
      align-items: center;
      gap: 0.4rem;
      padding: 0.25rem 0.75rem;
      border-radius: 6px;
      font-size: 0.8rem;
      font-weight: 700;
    }
    .price-change-badge {
      font-size: 0.8rem;
      font-weight: 600;
      padding: 0.2rem 0.6rem;
      border-radius: 6px;
    }
    .price-change-badge.positive {
      color: var(--green-400);
      background: rgba(34, 197, 94, 0.1);
    }
    .price-change-badge.negative {
      color: var(--red-400);
      background: rgba(239, 68, 68, 0.1);
    }
    .event-type-badge.golden {
      background: rgba(34, 197, 94, 0.12);
      color: var(--green-400);
    }
    .event-type-badge.death {
      background: rgba(239, 68, 68, 0.12);
      color: var(--red-400);
    }
    .event-type-badge i { font-size: 0.75rem; }

    .event-date {
      font-size: 0.95rem;
      font-weight: 600;
      color: var(--text-color);
      margin-bottom: 0.75rem;
    }

    .event-metrics {
      display: flex;
      gap: 2rem;
    }
    .metric {
      display: flex;
      flex-direction: column;
      gap: 0.15rem;
    }
    .metric-label {
      font-size: 0.7rem;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: var(--text-color-secondary);
      font-weight: 600;
    }
    .metric-value {
      font-size: 0.95rem;
      font-weight: 600;
      color: var(--text-color);
    }

    /* No Crossovers */
    .no-crossovers {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      padding: 1.25rem 1.5rem;
      background: var(--surface-card);
      border: 1px solid var(--surface-border);
      border-radius: 10px;
      color: var(--text-color-secondary);
      font-size: 0.9rem;
    }
    .no-crossovers i { font-size: 1.25rem; color: var(--primary-color); }

    /* Empty State */
    .dma-empty {
      display: flex;
      flex-direction: column;
      align-items: center;
      text-align: center;
      padding: 4rem 2rem;
    }
    .empty-icon {
      width: 80px;
      height: 80px;
      border-radius: 20px;
      background: rgba(99, 102, 241, 0.1);
      display: flex;
      align-items: center;
      justify-content: center;
      margin-bottom: 1.5rem;
    }
    .empty-icon i {
      font-size: 2.5rem;
      color: var(--primary-color);
    }
    .dma-empty h2 {
      font-size: 1.2rem;
      font-weight: 600;
      color: var(--text-color);
      margin: 0 0 0.5rem 0;
    }
    .dma-empty p {
      color: var(--text-color-secondary);
      font-size: 0.9rem;
      max-width: 420px;
      margin: 0 0 1.5rem 0;
    }
    .empty-examples {
      display: flex;
      gap: 0.5rem;
      flex-wrap: wrap;
      justify-content: center;
    }
    .example-chip {
      padding: 0.4rem 0.9rem;
      border-radius: 8px;
      background: var(--surface-card);
      border: 1px solid var(--surface-border);
      color: var(--text-color);
      font-size: 0.85rem;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s;
    }
    .example-chip:hover {
      border-color: var(--primary-color);
      background: rgba(99, 102, 241, 0.08);
      color: var(--primary-color);
    }
  `]
})
export class DmaSimulatorComponent {
  private http = inject(HttpClient);
  marketService = inject(MarketService);

  searchSelected: any = null;
  searchSuggestions = signal<any[]>([]);
  selectedSymbol = signal<string>('');
  loading = signal(false);
  error = signal<string>('');
  result = signal<DmaCrossoverResponse | null>(null);

  onSearchComplete(event: AutoCompleteCompleteEvent): void {
    const query = event.query.toLowerCase().trim();
    if (query.length < 1) {
      this.searchSuggestions.set([]);
      return;
    }

    this.http.get<{ stocks: any[] }>(`/api/stocks/search?q=${encodeURIComponent(query)}&fuzzy=true`).subscribe({
      next: (res) => {
        if (res.stocks && res.stocks.length > 0) {
          this.searchSuggestions.set(res.stocks.slice(0, 15));
        } else {
          this.searchSuggestions.set([]);
        }
      },
      error: () => {
        this.searchSuggestions.set([]);
      },
    });
  }

  onStockSelect(event: any): void {
    const stock = event.value || event;
    if (stock?.symbol) {
      this.fetchCrossovers(stock.symbol);
    }
  }

  quickSearch(symbol: string): void {
    this.searchSelected = { symbol };
    this.fetchCrossovers(symbol);
  }

  private fetchCrossovers(symbol: string): void {
    this.selectedSymbol.set(symbol);
    this.loading.set(true);
    this.error.set('');
    this.result.set(null);

    this.http.get<DmaCrossoverResponse>(`/api/stocks/dma-crossovers?symbol=${encodeURIComponent(symbol)}`).subscribe({
      next: (data) => {
        this.result.set(data);
        this.loading.set(false);
      },
      error: (err) => {
        const msg = err.error?.error || `Failed to fetch crossover data for ${symbol}`;
        this.error.set(msg);
        this.loading.set(false);
      },
    });
  }

  getPriceChangeFromPrevious(idx: number): number {
    const crossovers = this.result()?.crossovers;
    if (!crossovers || idx < 1) return 0;
    const current = crossovers[idx];
    const previous = crossovers[idx - 1];
    return ((current.close - previous.close) / previous.close) * 100;
  }

  formatDate(dateStr: string): string {
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  }
}
