import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { TooltipModule } from 'primeng/tooltip';
import { WatchlistService, WatchlistItem } from '../../core/services/watchlist.service';
import { environment } from '../../../environments/environment';

type PerformancePeriod = '1D' | '1W' | '1M' | '3M' | '6M' | '1Y' | 'sinceAdded';

interface TopPerformerStock {
  symbol: string;
  name: string | null;
  market: string;
  currentPrice: number | null;
  marketCap: number | null;
  targetMeanPrice: number | null;
  oneDayChangePercent: number | null;
  oneWeekChangePercent: number | null;
  oneMonthChangePercent: number | null;
  threeMonthChangePercent: number | null;
  sixMonthChangePercent: number | null;
  oneYearChangePercent: number | null;
  sinceAddedChangePercent: number | null;
  priceWhenAdded: number;
  addedAt: string;
  watchlistNames: string[];
}

type SortColumn = PerformancePeriod | 'ticker' | 'price' | 'mcap' | 'target';
type SortDirection = 'asc' | 'desc';

const ENRICHMENT_BATCH_SIZE = 10;

@Component({
  selector: 'app-top-performers',
  imports: [CommonModule, TooltipModule],
  template: `
    <div class="top-performers-page">
      <section class="tp-hero">
        <button type="button" class="back-link" (click)="goBack()">
          <i class="pi pi-arrow-left"></i>
          Watchlists
        </button>
        <div class="hero-copy">
          <span class="eyebrow">Performance Leaderboard</span>
          <h1>Top Performers</h1>
          <p>Ranked view of the best-performing stocks across all your watchlists.</p>
        </div>
      </section>

      <section class="tp-controls">
        <div class="count-selector">
          <span class="count-label">Show:</span>
          @for (opt of countOptions; track opt) {
            <button
              type="button"
              class="count-btn"
              [class.active]="displayCount() === opt"
              (click)="setCount(opt)">
              {{ opt === 9999 ? 'All' : opt }}
            </button>
          }
        </div>
      </section>

      @if (loading()) {
        <section class="tp-loading">
          <i class="pi pi-spin pi-spinner"></i>
          <p>Aggregating performance data across {{ totalStocksCount() }} stocks...</p>
        </section>
      }

      @if (!loading() && rankedStocks().length === 0) {
        <section class="tp-empty">
          <div class="empty-icon"><i class="pi pi-chart-line"></i></div>
          <h2>No stocks to rank</h2>
          <p>Add stocks to your watchlists to see top performers here.</p>
        </section>
      }

      @if (!loading() && rankedStocks().length > 0) {
        <section class="tp-table-shell">
          <div class="tp-table-wrap">
            <table class="tp-table">
              <thead>
                <tr>
                  <th class="col-rank">#</th>
                  <th class="col-ticker">
                    <button type="button" class="sort-header" [class.active]="sortColumn() === 'ticker'" (click)="toggleSort('ticker')">
                      TICKER <span class="sort-indicator">{{ getSortIndicator('ticker') }}</span>
                    </button>
                  </th>
                  <th class="col-price">
                    <button type="button" class="sort-header" [class.active]="sortColumn() === 'price'" (click)="toggleSort('price')">
                      PRICE <span class="sort-indicator">{{ getSortIndicator('price') }}</span>
                    </button>
                  </th>
                  <th class="col-mcap">
                    <button type="button" class="sort-header" [class.active]="sortColumn() === 'mcap'" (click)="toggleSort('mcap')">
                      MKT CAP <span class="sort-indicator">{{ getSortIndicator('mcap') }}</span>
                    </button>
                  </th>
                  <th class="col-period" [class.active-period]="selectedPeriod() === '1D'">
                    <button type="button" class="sort-header" [class.active]="sortColumn() === '1D'" (click)="toggleSort('1D')">
                      1D <span class="sort-indicator">{{ getSortIndicator('1D') }}</span>
                    </button>
                  </th>
                  <th class="col-period" [class.active-period]="selectedPeriod() === '1W'">
                    <button type="button" class="sort-header" [class.active]="sortColumn() === '1W'" (click)="toggleSort('1W')">
                      1W <span class="sort-indicator">{{ getSortIndicator('1W') }}</span>
                    </button>
                  </th>
                  <th class="col-period" [class.active-period]="selectedPeriod() === '1M'">
                    <button type="button" class="sort-header" [class.active]="sortColumn() === '1M'" (click)="toggleSort('1M')">
                      1M <span class="sort-indicator">{{ getSortIndicator('1M') }}</span>
                    </button>
                  </th>
                  <th class="col-period" [class.active-period]="selectedPeriod() === '3M'">
                    <button type="button" class="sort-header" [class.active]="sortColumn() === '3M'" (click)="toggleSort('3M')">
                      3M <span class="sort-indicator">{{ getSortIndicator('3M') }}</span>
                    </button>
                  </th>
                  <th class="col-period" [class.active-period]="selectedPeriod() === '6M'">
                    <button type="button" class="sort-header" [class.active]="sortColumn() === '6M'" (click)="toggleSort('6M')">
                      6M <span class="sort-indicator">{{ getSortIndicator('6M') }}</span>
                    </button>
                  </th>
                  <th class="col-period" [class.active-period]="selectedPeriod() === '1Y'">
                    <button type="button" class="sort-header" [class.active]="sortColumn() === '1Y'" (click)="toggleSort('1Y')">
                      1Y <span class="sort-indicator">{{ getSortIndicator('1Y') }}</span>
                    </button>
                  </th>
                  <th class="col-period" [class.active-period]="selectedPeriod() === 'sinceAdded'">
                    <button type="button" class="sort-header" [class.active]="sortColumn() === 'sinceAdded'" (click)="toggleSort('sinceAdded')">
                      SINCE ADDED <span class="sort-indicator">{{ getSortIndicator('sinceAdded') }}</span>
                    </button>
                  </th>
                  <th class="col-target">
                    <button type="button" class="sort-header" [class.active]="sortColumn() === 'target'" (click)="toggleSort('target')">
                      TARGET <span class="sort-indicator">{{ getSortIndicator('target') }}</span>
                    </button>
                  </th>
                  <th class="col-wl">WATCHLIST(S)</th>
                </tr>
              </thead>
              <tbody>
                @for (stock of displayedStocks(); track stock.symbol; let i = $index) {
                  <tr class="stock-row" (click)="openStock(stock.symbol)" [style.animation-delay]="(i * 30) + 'ms'">
                    <td class="col-rank">
                      <span class="rank-badge" [class.gold]="i === 0" [class.silver]="i === 1" [class.bronze]="i === 2">
                        {{ i + 1 }}
                      </span>
                    </td>
                    <td class="col-ticker">
                      <span
                        class="ticker"
                        [pTooltip]="stock.name || formatSymbol(stock.symbol)"
                        tooltipPosition="top">
                        {{ formatSymbol(stock.symbol) }}
                      </span>
                    </td>
                    <td class="col-price">
                      @if (stock.currentPrice != null) {
                        <span class="price-text">{{ getCurrency(stock.market) }}{{ stock.currentPrice | number:'1.2-2' }}</span>
                      } @else {
                        <span class="muted-text">--</span>
                      }
                    </td>
                    <td class="col-mcap">
                      @if (stock.marketCap) {
                        <span class="mcap-text">{{ formatMarketCap(stock.marketCap) }}</span>
                      } @else {
                        <span class="muted-text">--</span>
                      }
                    </td>
                    <td class="col-period" [class.active-period]="selectedPeriod() === '1D'">
                      @if (stock.oneDayChangePercent != null) {
                        <span class="period-change" [class.up]="stock.oneDayChangePercent > 0" [class.down]="stock.oneDayChangePercent < 0">
                          {{ stock.oneDayChangePercent >= 0 ? '+' : '' }}{{ stock.oneDayChangePercent | number:'1.2-2' }}%
                        </span>
                      } @else {
                        <span class="muted-text">--</span>
                      }
                    </td>
                    <td class="col-period" [class.active-period]="selectedPeriod() === '1W'">
                      @if (stock.oneWeekChangePercent != null) {
                        <span class="period-change" [class.up]="stock.oneWeekChangePercent > 0" [class.down]="stock.oneWeekChangePercent < 0">
                          {{ stock.oneWeekChangePercent >= 0 ? '+' : '' }}{{ stock.oneWeekChangePercent | number:'1.2-2' }}%
                        </span>
                      } @else {
                        <span class="muted-text">--</span>
                      }
                    </td>
                    <td class="col-period" [class.active-period]="selectedPeriod() === '1M'">
                      @if (stock.oneMonthChangePercent != null) {
                        <span class="period-change" [class.up]="stock.oneMonthChangePercent > 0" [class.down]="stock.oneMonthChangePercent < 0">
                          {{ stock.oneMonthChangePercent >= 0 ? '+' : '' }}{{ stock.oneMonthChangePercent | number:'1.2-2' }}%
                        </span>
                      } @else {
                        <span class="muted-text">--</span>
                      }
                    </td>
                    <td class="col-period" [class.active-period]="selectedPeriod() === '3M'">
                      @if (stock.threeMonthChangePercent != null) {
                        <span class="period-change" [class.up]="stock.threeMonthChangePercent > 0" [class.down]="stock.threeMonthChangePercent < 0">
                          {{ stock.threeMonthChangePercent >= 0 ? '+' : '' }}{{ stock.threeMonthChangePercent | number:'1.2-2' }}%
                        </span>
                      } @else {
                        <span class="muted-text">--</span>
                      }
                    </td>
                    <td class="col-period" [class.active-period]="selectedPeriod() === '6M'">
                      @if (stock.sixMonthChangePercent != null) {
                        <span class="period-change" [class.up]="stock.sixMonthChangePercent > 0" [class.down]="stock.sixMonthChangePercent < 0">
                          {{ stock.sixMonthChangePercent >= 0 ? '+' : '' }}{{ stock.sixMonthChangePercent | number:'1.2-2' }}%
                        </span>
                      } @else {
                        <span class="muted-text">--</span>
                      }
                    </td>
                    <td class="col-period" [class.active-period]="selectedPeriod() === '1Y'">
                      @if (stock.oneYearChangePercent != null) {
                        <span class="period-change" [class.up]="stock.oneYearChangePercent > 0" [class.down]="stock.oneYearChangePercent < 0">
                          {{ stock.oneYearChangePercent >= 0 ? '+' : '' }}{{ stock.oneYearChangePercent | number:'1.2-2' }}%
                        </span>
                      } @else {
                        <span class="muted-text">--</span>
                      }
                    </td>
                    <td class="col-period" [class.active-period]="selectedPeriod() === 'sinceAdded'">
                      @if (stock.sinceAddedChangePercent != null) {
                        <span class="period-change" [class.up]="stock.sinceAddedChangePercent > 0" [class.down]="stock.sinceAddedChangePercent < 0">
                          {{ stock.sinceAddedChangePercent >= 0 ? '+' : '' }}{{ stock.sinceAddedChangePercent | number:'1.2-2' }}%
                        </span>
                      } @else {
                        <span class="muted-text">--</span>
                      }
                    </td>
                    <td class="col-target">
                      @if (stock.targetMeanPrice != null && stock.currentPrice != null) {
                        <div class="target-cell">
                          <span class="target-price">{{ getCurrency(stock.market) }}{{ stock.targetMeanPrice | number:'1.0-0' }}</span>
                          <span class="target-pct" [class.positive]="getTargetUpside(stock) >= 0" [class.negative]="getTargetUpside(stock) < 0">
                            {{ getTargetUpside(stock) >= 0 ? '+' : '' }}{{ getTargetUpside(stock) | number:'1.0-0' }}%
                          </span>
                        </div>
                      } @else {
                        <span class="muted-text">--</span>
                      }
                    </td>
                    <td class="col-wl">
                      <span class="wl-names" [pTooltip]="stock.watchlistNames.join(', ')" tooltipPosition="top">
                        {{ stock.watchlistNames.length <= 2 ? stock.watchlistNames.join(', ') : stock.watchlistNames[0] + ' +' + (stock.watchlistNames.length - 1) }}
                      </span>
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        </section>
      }
    </div>
  `,
  styles: [`
    .top-performers-page {
      min-height: calc(100vh - 56px);
      padding: 1.25rem;
      display: flex;
      flex-direction: column;
      gap: 0.9rem;
      background: linear-gradient(180deg, rgba(15, 23, 42, 0.16), transparent 34%);
    }

    .tp-hero {
      padding: 1rem 1.1rem;
      border: 1px solid rgba(148, 163, 184, 0.14);
      border-radius: 18px;
      background: rgba(15, 23, 42, 0.58);
    }

    .back-link {
      display: inline-flex;
      align-items: center;
      gap: 0.4rem;
      margin-bottom: 0.6rem;
      padding: 0;
      border: none;
      background: transparent;
      color: #94a3b8;
      font-size: 0.78rem;
      font-weight: 700;
      cursor: pointer;
      font-family: inherit;
      transition: color 0.14s ease;
    }

    .back-link:hover { color: #38bdf8; }

    .hero-copy h1 {
      margin: 0.1rem 0 0.2rem;
      color: #f8fafc;
      font-size: clamp(1.45rem, 2.8vw, 2.15rem);
      line-height: 1;
      letter-spacing: -0.045em;
    }

    .hero-copy p {
      margin: 0;
      color: #94a3b8;
      font-size: 0.9rem;
    }

    .eyebrow {
      color: #38bdf8;
      font-size: 0.7rem;
      font-weight: 900;
      letter-spacing: 0.14em;
      text-transform: uppercase;
    }

    .tp-controls {
      display: flex;
      align-items: center;
      justify-content: flex-end;
      gap: 1rem;
      padding: 0.7rem 1rem;
      border: 1px solid rgba(148, 163, 184, 0.14);
      border-radius: 14px;
      background: rgba(15, 23, 42, 0.48);
    }

    .count-selector {
      display: flex;
      align-items: center;
      gap: 0.35rem;
    }

    .count-label {
      color: #64748b;
      font-size: 0.68rem;
      font-weight: 800;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      margin-right: 0.2rem;
    }

    .count-btn {
      padding: 0.35rem 0.6rem;
      border: 1px solid rgba(148, 163, 184, 0.14);
      border-radius: 8px;
      background: transparent;
      color: #94a3b8;
      font-size: 0.72rem;
      font-weight: 700;
      cursor: pointer;
      font-family: inherit;
      transition: all 0.14s ease;
    }

    .count-btn:hover { color: #f8fafc; border-color: rgba(148, 163, 184, 0.28); }
    .count-btn.active { background: rgba(56, 189, 248, 0.12); color: #38bdf8; border-color: rgba(56, 189, 248, 0.35); }

    .tp-loading {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 0.75rem;
      min-height: 16rem;
      border: 1px solid rgba(148, 163, 184, 0.14);
      border-radius: 18px;
      background: rgba(15, 23, 42, 0.5);
      color: #94a3b8;
    }

    .tp-loading i { font-size: 1.5rem; color: #38bdf8; }
    .tp-loading p { margin: 0; font-size: 0.88rem; }

    .tp-empty {
      display: flex;
      min-height: 18rem;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 0.75rem;
      text-align: center;
      border: 1px solid rgba(148, 163, 184, 0.14);
      border-radius: 18px;
      background: rgba(15, 23, 42, 0.5);
      color: #cbd5e1;
    }

    .empty-icon {
      width: 3.5rem;
      height: 3.5rem;
      display: grid;
      place-items: center;
      border-radius: 16px;
      color: #38bdf8;
      background: rgba(56, 189, 248, 0.12);
    }

    .tp-empty h2 { margin: 0; color: #f8fafc; }
    .tp-empty p { margin: 0; color: #94a3b8; max-width: 34rem; }

    .tp-table-shell {
      border: 1px solid rgba(148, 163, 184, 0.14);
      border-radius: 18px;
      background: rgba(15, 23, 42, 0.56);
      overflow: hidden;
    }

    .tp-table-wrap { overflow-x: auto; max-height: calc(100vh - 220px); overflow-y: auto; }

    .tp-table {
      width: 100%;
      border-collapse: separate;
      border-spacing: 0;
      table-layout: fixed;
      min-width: 1280px;
    }

    .tp-table thead { position: sticky; top: 0; z-index: 2; }

    .tp-table th {
      padding: 0.65rem 0.7rem;
      color: #64748b;
      font-size: 0.64rem;
      font-weight: 900;
      letter-spacing: 0.08em;
      text-align: left;
      text-transform: uppercase;
      border-bottom: 1px solid rgba(148, 163, 184, 0.12);
      background: rgba(10, 15, 30, 0.97);
      white-space: nowrap;
    }

    .tp-table td {
      padding: 0.6rem 0.7rem;
      color: #cbd5e1;
      font-size: 0.82rem;
      border-bottom: 1px solid rgba(148, 163, 184, 0.08);
      vertical-align: middle;
    }

    .col-rank { width: 3.5%; text-align: center; }
    .col-ticker { width: 10%; }
    .col-price { width: 8%; }
    .col-mcap { width: 8%; }
    .col-period { width: 7.5%; }
    .col-target { width: 10%; }
    .col-wl { width: 12%; }

    th.active-period,
    td.active-period { background: rgba(56, 189, 248, 0.06); }

    .sort-header {
      display: inline-flex;
      align-items: center;
      gap: 0.25rem;
      padding: 0;
      border: none;
      background: transparent;
      color: inherit;
      font: inherit;
      cursor: pointer;
      white-space: nowrap;
      transition: color 0.14s ease;
    }

    .sort-header:hover { color: #f8fafc; }
    .sort-header.active { color: #38bdf8; }

    .sort-indicator {
      font-size: 0.6rem;
      opacity: 0.7;
    }

    .stock-row {
      cursor: pointer;
      transition: background 0.14s ease;
      animation: fadeSlideIn 0.3s ease both;
    }

    .stock-row:hover { background: rgba(56, 189, 248, 0.055); }

    @keyframes fadeSlideIn {
      from { opacity: 0; transform: translateY(4px); }
      to { opacity: 1; transform: translateY(0); }
    }

    .rank-badge {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 1.6rem;
      height: 1.6rem;
      border-radius: 8px;
      font-size: 0.7rem;
      font-weight: 900;
      background: rgba(148, 163, 184, 0.1);
      color: #94a3b8;
    }

    .rank-badge.gold { background: rgba(250, 204, 21, 0.15); color: #facc15; border: 1px solid rgba(250, 204, 21, 0.3); }
    .rank-badge.silver { background: rgba(203, 213, 225, 0.12); color: #e2e8f0; border: 1px solid rgba(203, 213, 225, 0.25); }
    .rank-badge.bronze { background: rgba(251, 146, 60, 0.12); color: #fb923c; border: 1px solid rgba(251, 146, 60, 0.25); }

    .ticker {
      color: #f8fafc;
      font-weight: 800;
      font-size: 0.84rem;
      cursor: default;
    }

    .price-text { color: #f8fafc; font-weight: 700; }
    .mcap-text { color: #cbd5e1; font-weight: 600; font-size: 0.78rem; }
    .muted-text { color: #475569; }

    .period-change { font-size: 0.78rem; font-weight: 600; }
    .period-change.up { color: #34d399; }
    .period-change.down { color: #f87171; }

    .target-cell {
      display: flex;
      flex-direction: column;
      gap: 0.1rem;
    }

    .target-price { color: #cbd5e1; font-size: 0.78rem; font-weight: 700; }
    .target-pct { font-size: 0.68rem; font-weight: 800; }
    .target-pct.positive { color: #34d399; }
    .target-pct.negative { color: #f87171; }

    .wl-names {
      color: #94a3b8;
      font-size: 0.74rem;
      font-weight: 600;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      max-width: 10rem;
      display: inline-block;
    }

    @media (max-width: 900px) {
      .tp-controls { flex-direction: column; align-items: flex-start; }
    }

    @media (max-width: 680px) {
      .top-performers-page { padding: 0.75rem; }
    }
  `]
})
export class TopPerformersComponent implements OnInit {
  private router = inject(Router);
  private http = inject(HttpClient);
  readonly wlService = inject(WatchlistService);

  readonly periods: { key: PerformancePeriod; label: string }[] = [
    { key: '1D', label: '1D' },
    { key: '1W', label: '1W' },
    { key: '1M', label: '1M' },
    { key: '3M', label: '3M' },
    { key: '6M', label: '6M' },
    { key: '1Y', label: '1Y' },
    { key: 'sinceAdded', label: 'Since Added' },
  ];

  readonly countOptions = [10, 25, 9999];

  selectedPeriod = signal<PerformancePeriod>('1D');
  displayCount = signal<number>(10);
  loading = signal(true);
  allStocks = signal<TopPerformerStock[]>([]);
  totalStocksCount = signal(0);
  sortColumn = signal<SortColumn>('1D');
  sortDirection = signal<SortDirection>('desc');

  rankedStocks = computed(() => {
    const stocks = this.allStocks();
    const col = this.sortColumn();
    const dir = this.sortDirection();
    const multiplier = dir === 'asc' ? 1 : -1;

    return [...stocks].sort((a, b) => {
      const aVal = this.getSortValue(a, col);
      const bVal = this.getSortValue(b, col);
      if (aVal == null && bVal == null) return 0;
      if (aVal == null) return 1;
      if (bVal == null) return -1;
      if (typeof aVal === 'string' && typeof bVal === 'string') {
        return aVal.localeCompare(bVal) * multiplier;
      }
      return ((aVal as number) - (bVal as number)) * multiplier;
    });
  });

  displayedStocks = computed(() => {
    const count = this.displayCount();
    return this.rankedStocks().slice(0, count === 9999 ? undefined : count);
  });

  async ngOnInit(): Promise<void> {
    await this.wlService.loadWatchlists();
    await this.loadAndEnrichStocks();
  }

  goBack(): void {
    this.router.navigate(['/watchlists']);
  }

  selectPeriod(period: PerformancePeriod): void {
    this.selectedPeriod.set(period);
    this.sortColumn.set(period);
    this.sortDirection.set('desc');
  }

  setCount(count: number): void {
    this.displayCount.set(count);
  }

  openStock(symbol: string): void {
    this.router.navigate(['/stock', symbol]);
  }

  formatSymbol(symbol: string): string {
    return symbol.replace('.NS', '').replace('.BO', '');
  }

  getCurrency(market: string): string {
    return market === 'IN' ? '\u20B9' : '$';
  }

  formatMarketCap(cap: number): string {
    if (cap >= 1e12) return (cap / 1e12).toFixed(1) + 'T';
    if (cap >= 1e9) return (cap / 1e9).toFixed(1) + 'B';
    if (cap >= 1e6) return (cap / 1e6).toFixed(1) + 'M';
    return cap.toLocaleString();
  }

  getChangeForPeriod(stock: TopPerformerStock, period: PerformancePeriod): number | null {
    switch (period) {
      case '1D': return stock.oneDayChangePercent;
      case '1W': return stock.oneWeekChangePercent;
      case '1M': return stock.oneMonthChangePercent;
      case '3M': return stock.threeMonthChangePercent;
      case '6M': return stock.sixMonthChangePercent;
      case '1Y': return stock.oneYearChangePercent;
      case 'sinceAdded': return stock.sinceAddedChangePercent;
    }
  }

  getTargetUpside(stock: TopPerformerStock): number {
    if (!stock.targetMeanPrice || !stock.currentPrice) return 0;
    return ((stock.targetMeanPrice - stock.currentPrice) / stock.currentPrice) * 100;
  }

  toggleSort(col: SortColumn): void {
    if (this.sortColumn() === col) {
      this.sortDirection.update(d => d === 'desc' ? 'asc' : 'desc');
    } else {
      this.sortColumn.set(col);
      this.sortDirection.set(col === 'ticker' ? 'asc' : 'desc');
    }
  }

  getSortIndicator(col: SortColumn): string {
    if (this.sortColumn() !== col) return '';
    return this.sortDirection() === 'asc' ? '\u25B2' : '\u25BC';
  }

  private getSortValue(stock: TopPerformerStock, col: SortColumn): string | number | null {
    switch (col) {
      case 'ticker': return stock.symbol.toUpperCase();
      case 'price': return stock.currentPrice;
      case 'mcap': return stock.marketCap;
      case 'target': return stock.targetMeanPrice && stock.currentPrice
        ? ((stock.targetMeanPrice - stock.currentPrice) / stock.currentPrice) * 100
        : null;
      case '1D': return stock.oneDayChangePercent;
      case '1W': return stock.oneWeekChangePercent;
      case '1M': return stock.oneMonthChangePercent;
      case '3M': return stock.threeMonthChangePercent;
      case '6M': return stock.sixMonthChangePercent;
      case '1Y': return stock.oneYearChangePercent;
      case 'sinceAdded': return stock.sinceAddedChangePercent;
    }
  }

  private async loadAndEnrichStocks(): Promise<void> {
    this.loading.set(true);

    const allItems = await this.wlService.loadAllWatchlistItems();
    if (allItems.length === 0) {
      this.loading.set(false);
      return;
    }

    const watchlistNameMap = new Map<string, string>();
    for (const wl of this.wlService.watchlists()) {
      watchlistNameMap.set(wl.id, wl.name);
    }

    const stockMap = new Map<string, {
      item: WatchlistItem;
      watchlistNames: string[];
    }>();

    for (const item of allItems) {
      const existing = stockMap.get(item.symbol);
      const wlName = watchlistNameMap.get(item.watchlist_id) ?? 'Unknown';

      if (existing) {
        if (!existing.watchlistNames.includes(wlName)) {
          existing.watchlistNames.push(wlName);
        }
        if (new Date(item.added_at) < new Date(existing.item.added_at)) {
          existing.item = item;
        }
      } else {
        stockMap.set(item.symbol, { item, watchlistNames: [wlName] });
      }
    }

    this.totalStocksCount.set(stockMap.size);

    const byMarket: Record<string, { item: WatchlistItem; watchlistNames: string[] }[]> = {};
    for (const entry of stockMap.values()) {
      const market = entry.item.market || 'US';
      if (!byMarket[market]) byMarket[market] = [];
      byMarket[market].push(entry);
    }

    const enriched: TopPerformerStock[] = [];

    const fetches = Object.entries(byMarket).flatMap(([market, entries]) => {
      const chunks: typeof entries[] = [];
      for (let i = 0; i < entries.length; i += ENRICHMENT_BATCH_SIZE) {
        chunks.push(entries.slice(i, i + ENRICHMENT_BATCH_SIZE));
      }

      return chunks.map(async chunk => {
        const symbols = chunk.map(e => e.item.symbol);
        const url = `${environment.apiBaseUrl}/api/stocks?action=search&q=${encodeURIComponent(symbols.join(','))}&market=${market}&performance=true`;
        try {
          const data: any = await this.http.get(url).toPromise();
          if (data?.stocks) {
            const apiMap = new Map<string, any>();
            for (const s of data.stocks) {
              apiMap.set(s.symbol, s);
            }

            for (const entry of chunk) {
              const api = apiMap.get(entry.item.symbol);
              const currentPrice = api?.price ?? null;
              const sinceAdded = currentPrice != null && entry.item.price_when_added > 0
                ? ((currentPrice - entry.item.price_when_added) / entry.item.price_when_added) * 100
                : null;

              enriched.push({
                symbol: entry.item.symbol,
                name: entry.item.name,
                market: entry.item.market,
                currentPrice,
                marketCap: api?.marketCap ?? null,
                targetMeanPrice: api?.targetMeanPrice ?? null,
                oneDayChangePercent: api?.changePercent ?? null,
                oneWeekChangePercent: api?.oneWeekChangePercent ?? null,
                oneMonthChangePercent: api?.oneMonthChangePercent ?? null,
                threeMonthChangePercent: api?.threeMonthChangePercent ?? null,
                sixMonthChangePercent: api?.sixMonthChangePercent ?? null,
                oneYearChangePercent: api?.oneYearChangePercent ?? null,
                sinceAddedChangePercent: sinceAdded,
                priceWhenAdded: entry.item.price_when_added,
                addedAt: entry.item.added_at,
                watchlistNames: entry.watchlistNames,
              });
            }
          }
        } catch {
          for (const entry of chunk) {
            enriched.push({
              symbol: entry.item.symbol,
              name: entry.item.name,
              market: entry.item.market,
              currentPrice: null,
              marketCap: null,
              targetMeanPrice: null,
              oneDayChangePercent: null,
              oneWeekChangePercent: null,
              oneMonthChangePercent: null,
              threeMonthChangePercent: null,
              sixMonthChangePercent: null,
              oneYearChangePercent: null,
              sinceAddedChangePercent: null,
              priceWhenAdded: entry.item.price_when_added,
              addedAt: entry.item.added_at,
              watchlistNames: entry.watchlistNames,
            });
          }
        }
      });
    });

    await Promise.all(fetches);
    this.allStocks.set(enriched);
    this.loading.set(false);
  }
}
