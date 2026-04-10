import { Component, inject, signal, computed, effect, OnInit } from '@angular/core';
import { CommonModule, DecimalPipe } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';

import { ButtonModule } from 'primeng/button';
import { ProgressSpinnerModule } from 'primeng/progressspinner';
import { TooltipModule } from 'primeng/tooltip';
import { TagModule } from 'primeng/tag';

import { MarketService } from '../../core/services';

interface DailyPick {
  id: number;
  market: string;
  pick_date: string;
  symbol: string;
  name: string;
  sector: string | null;
  market_cap: number | null;
  price: number;
  previous_close: number | null;
  pre_market_price: number | null;
  gap_percent: number | null;
  change_percent: number | null;
  volume: number | null;
  avg_volume: number | null;
  relative_volume: number | null;
  buy_price: number;
  sell_price: number;
  stop_loss: number;
  score: number;
  priority: string;
  signals: string[];
  rsi: number | null;
  beta: number | null;
  outcome: string | null;       // 'hit-target' | 'hit-sl' | 'no-trigger' | null
  actual_high: number | null;
  actual_low: number | null;
  actual_close: number | null;
  pnl_percent: number | null;
}

interface DateGroup {
  date: string;
  displayDate: string;
  picks: DailyPick[];
  highCount: number;
  mediumCount: number;
  hitTargetCount: number;
  hitStopLossCount: number;
  pendingCount: number;
}

interface MonthOption {
  label: string;
  value: string;
}

@Component({
  selector: 'app-recommendations',
  standalone: true,
  imports: [
    CommonModule,
    DecimalPipe,
    ButtonModule,
    ProgressSpinnerModule,
    TooltipModule,
    TagModule,
  ],
  template: `
    <div class="reco-container">
      <!-- Header -->
      <div class="page-header">
        <div class="header-left">
          <h1>
            <i class="pi pi-star"></i>
            Day Trade Recommendations
          </h1>
          <span class="subtitle">Track daily picks and their outcomes</span>
        </div>
        <div class="header-right">
          <div class="month-nav">
            <button pButton icon="pi pi-chevron-left" class="p-button-text p-button-sm"
              (click)="prevMonth()" [pTooltip]="'Previous month'"></button>
            <span class="month-label">{{ selectedMonthLabel() }}</span>
            <button pButton icon="pi pi-chevron-right" class="p-button-text p-button-sm"
              (click)="nextMonth()" [disabled]="isCurrentMonth()"
              [pTooltip]="'Next month'"></button>
          </div>
        </div>
      </div>

      <!-- Summary Cards -->
      <div class="summary-strip" *ngIf="!loading() && dateGroups().length > 0">
        <div class="summary-card">
          <div class="summary-value">{{ totalPicks() }}</div>
          <div class="summary-label">Total Picks</div>
        </div>
        <div class="summary-card hit-target">
          <div class="summary-value">{{ totalTargetHit() }}</div>
          <div class="summary-label">Target Hit</div>
        </div>
        <div class="summary-card hit-target">
          <div class="summary-value">{{ totalClosedProfitable() }}</div>
          <div class="summary-label">Closed Profitable</div>
        </div>
        <div class="summary-card hit-sl">
          <div class="summary-value">{{ totalClosedAtLoss() }}</div>
          <div class="summary-label">Closed at Loss</div>
        </div>
        <div class="summary-card hit-sl">
          <div class="summary-value">{{ totalStoppedOut() }}</div>
          <div class="summary-label">Stopped Out</div>
        </div>
        <div class="summary-card pending">
          <div class="summary-value">{{ totalNotTraded() }}</div>
          <div class="summary-label">Not Traded</div>
        </div>
        <div class="summary-card pending">
          <div class="summary-value">{{ totalPending() }}</div>
          <div class="summary-label">Pending</div>
        </div>
        <div class="summary-card" [class.positive]="winRate() >= 50" [class.negative]="winRate() < 50 && winRate() >= 0">
          <div class="summary-value">{{ winRate() >= 0 ? (winRate() | number:'1.0-0') + '%' : '--' }}</div>
          <div class="summary-label">Win Rate</div>
        </div>
      </div>

      <!-- Loading -->
      <div class="loading-container" *ngIf="loading()">
        <p-progressSpinner strokeWidth="3" animationDuration="1s"></p-progressSpinner>
        <p>Loading recommendations...</p>
      </div>

      <!-- Empty State -->
      <div class="empty-state" *ngIf="!loading() && dateGroups().length === 0">
        <i class="pi pi-inbox"></i>
        <h3>No recommendations found</h3>
        <p>No day trade picks for {{ marketService.marketInfo().name }} in {{ selectedMonthLabel() }}.</p>
      </div>

      <!-- Date Groups -->
      <div class="date-groups" *ngIf="!loading() && dateGroups().length > 0">
        <div class="date-group" *ngFor="let group of dateGroups()">
          <div class="date-header">
            <div class="date-title">
              <span class="date-text">{{ group.displayDate }}</span>
              <span class="pick-count" *ngIf="group.picks.length > 0">{{ group.picks.length }} pick{{ group.picks.length > 1 ? 's' : '' }}</span>
              <span class="pick-count no-picks" *ngIf="group.picks.length === 0">No recommendations</span>
            </div>
            <div class="date-stats">
              <span class="stat-badge hit-target" *ngIf="group.hitTargetCount > 0">
                <i class="pi pi-check-circle"></i> {{ group.hitTargetCount }} profitable
              </span>
              <span class="stat-badge hit-sl" *ngIf="group.hitStopLossCount > 0">
                <i class="pi pi-times-circle"></i> {{ group.hitStopLossCount }} stopped out
              </span>
              <span class="stat-badge pending" *ngIf="group.pendingCount > 0">
                <i class="pi pi-clock"></i> {{ group.pendingCount }} pending
              </span>
            </div>
          </div>

          <div class="picks-table-wrap" *ngIf="group.picks.length > 0">
            <table class="picks-table">
              <thead>
                <tr>
                  <th class="col-score">Score</th>
                  <th class="col-stock">Stock</th>
                  <th class="col-price">Rec. Price</th>
                  <th class="col-targets">Buy / Sell / Stop</th>
                  <th class="col-outcome">Outcome</th>
                  <th class="col-signals">Signals</th>
                </tr>
              </thead>
              <tbody>
                <tr *ngFor="let pick of group.picks" class="pick-row" [class.row-hit-target]="getOutcome(pick) === 'hit-target'" [class.row-hit-sl]="getOutcome(pick) === 'hit-sl'">
                  <td class="col-score">
                    <span class="score-badge" [class.high]="pick.priority === 'High'" [class.medium]="pick.priority === 'Medium'">
                      {{ pick.score }}
                    </span>
                  </td>
                  <td class="col-stock">
                    <div class="stock-symbol-row">
                      <span class="stock-symbol" (click)="navigateToStock(pick.symbol)">{{ formatSymbol(pick.symbol) }}</span>
                      <a class="rh-icon"
                         *ngIf="pick.market === 'US'"
                         [href]="'https://robinhood.com/stocks/' + formatSymbol(pick.symbol) + '?source=search'"
                         target="_blank" rel="noopener noreferrer"
                         (click)="$event.stopPropagation()"
                         pTooltip="Trade on Robinhood" tooltipPosition="top">
                        <img src="robinhood.png" alt="RH" />
                      </a>
                      <a class="detail-icon-link"
                         [href]="'/stock/' + pick.symbol"
                         target="_blank"
                         (click)="$event.stopPropagation()"
                         pTooltip="Stock details" tooltipPosition="top">
                        <img src="stock-detail.svg" alt="Details" />
                      </a>
                    </div>
                    <div class="stock-name" (click)="navigateToStock(pick.symbol)">{{ pick.name | slice:0:30 }}</div>
                    <div class="stock-meta">{{ pick.sector }}</div>
                  </td>
                  <td class="col-price">
                    <div class="price-value">{{ currencySymbol() }}{{ pick.price | number:'1.2-2' }}</div>
                    <div class="price-sub" *ngIf="pick.gap_percent != null">
                      Gap {{ pick.gap_percent >= 0 ? '+' : '' }}{{ pick.gap_percent | number:'1.1-1' }}%
                    </div>
                    <div class="price-sub" *ngIf="pick.change_percent != null">
                      {{ pick.change_percent >= 0 ? '+' : '' }}{{ pick.change_percent | number:'1.1-1' }}%
                    </div>
                  </td>
                  <td class="col-targets">
                    <div class="target buy">Buy: {{ currencySymbol() }}{{ pick.buy_price | number:'1.2-2' }}</div>
                    <div class="target sell">Sell: {{ currencySymbol() }}{{ pick.sell_price | number:'1.2-2' }} <span class="target-pct positive">(+{{ getTargetPct(pick) | number:'1.1-1' }}%)</span></div>
                    <div class="target stop">Stop: {{ currencySymbol() }}{{ pick.stop_loss | number:'1.2-2' }} <span class="target-pct negative">(-{{ getStopPct(pick) | number:'1.1-1' }}%)</span></div>
                  </td>
                  <td class="col-outcome">
                    <span class="outcome-badge" [ngClass]="getOutcome(pick)">
                      <i [class]="getOutcomeIcon(pick)"></i>
                      {{ getOutcomeLabel(pick) }}
                    </span>
                    <div class="outcome-pnl" *ngIf="getOutcome(pick) !== 'pending'">
                      {{ getOutcome(pick) === 'hit-target' ? '+' : '' }}{{ getPnlPercent(pick) | number:'1.1-1' }}%
                    </div>
                    <div class="outcome-high" *ngIf="pick.actual_high">
                      Day High: {{ currencySymbol() }}{{ pick.actual_high | number:'1.2-2' }}
                    </div>
                  </td>
                  <td class="col-signals">
                    <div class="signal-list">
                      <span class="signal-chip" *ngFor="let s of pick.signals | slice:0:3">{{ s }}</span>
                    </div>
                    <div class="tech-meta">
                      <span *ngIf="pick.relative_volume">RVOL: {{ pick.relative_volume | number:'1.1-1' }}x</span>
                      <span *ngIf="pick.rsi"> · RSI: {{ pick.rsi | number:'1.0-0' }}</span>
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .reco-container {
      padding: 1.25rem 1.5rem;
      max-width: 1400px;
    }

    .page-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 1.25rem;
      flex-wrap: wrap;
      gap: 1rem;
    }

    .header-left h1 {
      font-size: 1.35rem;
      font-weight: 700;
      margin: 0;
      color: var(--text-color);
      display: flex;
      align-items: center;
      gap: 0.5rem;

      i { color: var(--primary-color); }
    }

    .subtitle {
      font-size: 0.8rem;
      color: var(--text-color-secondary);
    }

    .month-nav {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      background: var(--surface-card);
      border: 1px solid var(--surface-border);
      border-radius: 8px;
      padding: 0.25rem 0.5rem;
    }

    .month-label {
      font-weight: 600;
      font-size: 0.9rem;
      min-width: 130px;
      text-align: center;
      color: var(--text-color);
    }

    /* Summary Strip */
    .summary-strip {
      display: flex;
      gap: 0.75rem;
      margin-bottom: 1.5rem;
      flex-wrap: wrap;
    }

    .summary-card {
      flex: 1;
      min-width: 100px;
      background: var(--surface-card);
      border: 1px solid var(--surface-border);
      border-radius: 10px;
      padding: 0.85rem 1rem;
      text-align: center;
    }

    .summary-value {
      font-size: 1.5rem;
      font-weight: 800;
      font-family: 'JetBrains Mono', monospace;
      color: var(--text-color);
    }

    .summary-label {
      font-size: 0.7rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.03em;
      color: var(--text-color-secondary);
      margin-top: 0.15rem;
    }

    .summary-card.high .summary-value { color: var(--orange-400, #fb923c); }
    .summary-card.hit-target .summary-value { color: var(--green-400, #4ade80); }
    .summary-card.hit-sl .summary-value { color: var(--red-400, #f87171); }
    .summary-card.pending .summary-value { color: var(--blue-400, #60a5fa); }
    .summary-card.positive .summary-value { color: var(--green-400, #4ade80); }
    .summary-card.negative .summary-value { color: var(--red-400, #f87171); }

    /* Loading */
    .loading-container {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 1rem;
      padding: 4rem 0;
      color: var(--text-color-secondary);
    }

    /* Empty state */
    .empty-state {
      text-align: center;
      padding: 4rem 1rem;
      color: var(--text-color-secondary);

      i { font-size: 3rem; margin-bottom: 1rem; opacity: 0.4; }
      h3 { margin: 0.5rem 0; color: var(--text-color); }
      p { margin: 0; font-size: 0.85rem; }
    }

    /* Date Groups */
    .date-group {
      margin-bottom: 1.5rem;
    }

    .date-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 0.6rem 0;
      border-bottom: 2px solid var(--surface-border);
      margin-bottom: 0;
      flex-wrap: wrap;
      gap: 0.5rem;
    }

    .date-title {
      display: flex;
      align-items: baseline;
      gap: 0.75rem;
    }

    .date-text {
      font-size: 1rem;
      font-weight: 700;
      color: var(--text-color);
    }

    .pick-count {
      font-size: 0.75rem;
      color: var(--text-color-secondary);
    }

    .pick-count.no-picks {
      color: #64748b;
      font-style: italic;
    }

    .date-stats {
      display: flex;
      gap: 0.75rem;
    }

    .stat-badge {
      font-size: 0.72rem;
      font-weight: 600;
      display: flex;
      align-items: center;
      gap: 0.25rem;
    }

    .stat-badge.hit-target { color: var(--green-400, #4ade80); }
    .stat-badge.hit-sl { color: var(--red-400, #f87171); }
    .stat-badge.pending { color: var(--blue-400, #60a5fa); }

    /* Picks Table */
    .picks-table-wrap {
      overflow-x: auto;
    }

    .picks-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 0.82rem;
      table-layout: fixed;
    }

    .col-score    { width: 65px; padding-right: 16px !important; }
    .col-stock    { width: 200px; padding-right: 20px !important; }
    .col-price    { width: 120px; padding-right: 20px !important; }
    .col-targets  { width: 190px; padding-right: 24px !important; }
    .col-outcome  { width: 150px; text-align: center; padding-right: 20px !important; }
    .col-signals  { }

    .picks-table thead th {
      padding: 0.6rem 0.75rem;
      text-align: left;
      font-size: 0.7rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      color: var(--text-color-secondary);
      background: var(--surface-hover, var(--surface-100));
      white-space: nowrap;
    }

    .picks-table tbody tr {
      border-bottom: 1px solid var(--surface-border);
      transition: background 0.15s;
    }

    .picks-table tbody tr:hover {
      background: var(--surface-hover, var(--surface-50));
    }

    .picks-table td {
      padding: 0.65rem 0.75rem;
      vertical-align: top;
    }

    .row-hit-target {
      background: rgba(74, 222, 128, 0.04);
    }

    .row-hit-sl {
      background: rgba(248, 113, 113, 0.04);
    }

    /* Score badge */
    .score-badge {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 36px;
      height: 36px;
      border-radius: 8px;
      font-weight: 800;
      font-size: 0.85rem;
      font-family: 'JetBrains Mono', monospace;
    }

    .score-badge.high {
      background: var(--green-400, #4ade80);
      color: #0f172a;
    }

    .score-badge.medium {
      background: var(--orange-400, #fbbf24);
      color: #0f172a;
    }

    /* Stock cell */
    .col-stock { cursor: pointer; }

    .stock-symbol-row {
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .stock-symbol {
      font-weight: 700;
      color: var(--text-color);
      font-size: 0.85rem;
      cursor: pointer;
    }

    .stock-symbol:hover { color: #3b82f6; }

    .rh-icon, .detail-icon-link {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 20px;
      height: 20px;
      border-radius: 4px;
      overflow: hidden;
      transition: transform 0.15s, box-shadow 0.2s;
    }

    .rh-icon img, .detail-icon-link img {
      width: 20px;
      height: 20px;
      object-fit: cover;
      display: block;
    }

    .rh-icon:hover { transform: scale(1.1); box-shadow: 0 0 6px rgba(192, 255, 0, 0.4); }
    .detail-icon-link:hover { transform: scale(1.1); box-shadow: 0 0 6px rgba(99, 102, 241, 0.5); }

    .stock-name {
      font-size: 0.72rem;
      color: var(--text-color-secondary);
      margin-top: 1px;
    }

    .stock-meta {
      font-size: 0.65rem;
      color: var(--text-color-secondary);
      opacity: 0.7;
    }

    /* Price */
    .price-value {
      font-weight: 600;
      font-family: 'JetBrains Mono', monospace;
      color: var(--text-color);
    }

    .price-sub {
      font-size: 0.72rem;
      color: var(--text-color-secondary);
    }

    /* Targets */
    .target {
      font-family: 'JetBrains Mono', monospace;
      font-size: 0.78rem;
      line-height: 1.5;
    }

    .target.buy { color: var(--green-400, #4ade80); }
    .target.sell { color: var(--red-400, #f87171); }
    .target.stop { color: var(--orange-400, #fbbf24); }
    .outcome-high {
      font-size: 0.7rem;
      color: var(--text-color-secondary);
      margin-top: 2px;
      opacity: 0.7;
    }

    .target-pct { font-size: 0.7rem; opacity: 0.7; }
    .target-pct.positive { color: var(--green-400, #4ade80); }
    .target-pct.negative { color: var(--red-400, #f87171); }

    /* Outcome */
    .outcome-badge {
      display: inline-flex;
      align-items: center;
      gap: 0.3rem;
      padding: 0.25rem 0.6rem;
      border-radius: 6px;
      font-size: 0.72rem;
      font-weight: 600;
    }

    .outcome-badge.hit-target {
      background: rgba(74, 222, 128, 0.15);
      color: var(--green-400, #4ade80);
    }

    .outcome-badge.hit-sl {
      background: rgba(248, 113, 113, 0.15);
      color: var(--red-400, #f87171);
    }

    .outcome-badge.pending {
      background: rgba(96, 165, 250, 0.12);
      color: var(--blue-400, #60a5fa);
    }

    .outcome-pnl {
      font-size: 0.75rem;
      font-weight: 700;
      font-family: 'JetBrains Mono', monospace;
      margin-top: 0.2rem;
    }

    /* Signals */
    .signal-list {
      display: flex;
      flex-wrap: wrap;
      gap: 0.3rem;
    }

    .signal-chip {
      display: inline-block;
      padding: 0.15rem 0.4rem;
      border-radius: 4px;
      font-size: 0.65rem;
      background: var(--surface-hover, var(--surface-100));
      color: var(--text-color-secondary);
      white-space: nowrap;
    }

    .tech-meta {
      font-size: 0.65rem;
      color: var(--text-color-secondary);
      opacity: 0.7;
      margin-top: 0.3rem;
    }

    /* Responsive */
    @media (max-width: 900px) {
      .reco-container { padding: 1rem; }
      .col-signals { display: none; }
      .summary-strip { gap: 0.4rem; flex-wrap: wrap; }
      .summary-card { min-width: 70px; padding: 0.6rem; }
      .summary-value { font-size: 1.15rem; }
    }

    @media (max-width: 768px) {
      .reco-container { padding: 0.75rem; }
      .picks-table-wrap { overflow-x: auto; -webkit-overflow-scrolling: touch; }
      .picks-table { min-width: 700px; table-layout: auto; }
      .summary-strip { gap: 0.35rem; }
      .summary-card { min-width: 55px; padding: 0.5rem; }
      .summary-value { font-size: 1rem; }
      .summary-label { font-size: 0.55rem; }
      .col-price { display: none; }
      .date-header { flex-direction: column; gap: 0.4rem; }
      .page-header h1 { font-size: 1.1rem; }
      .month-nav .month-label { font-size: 0.85rem; }
    }

    @media (max-width: 480px) {
      .reco-container { padding: 0.5rem; }
      .picks-table { font-size: 0.7rem; min-width: 550px; }
      .col-outcome .outcome-badge { padding: 0.15rem 0.35rem; font-size: 0.6rem; }
      .score-badge { width: 30px; height: 30px; font-size: 0.75rem; }
      .summary-card { min-width: 45px; }
      .summary-value { font-size: 0.9rem; }
    }
  `]
})
export class RecommendationsComponent implements OnInit {
  private http = inject(HttpClient);
  private router = inject(Router);
  public marketService = inject(MarketService);

  loading = signal(false);
  picks = signal<DailyPick[]>([]);
  selectedMonth = signal(this.getCurrentMonth());

  selectedMonthLabel = computed(() => {
    const [y, m] = this.selectedMonth().split('-').map(Number);
    return new Date(y, m - 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  });

  dateGroups = computed<DateGroup[]>(() => {
    const all = this.picks();
    const grouped = new Map<string, DailyPick[]>();

    for (const pick of all) {
      const d = pick.pick_date;
      if (!grouped.has(d)) grouped.set(d, []);
      grouped.get(d)!.push(pick);
    }

    // Fill in all weekdays in the month up to today
    const [year, month] = this.selectedMonth().split('-').map(Number);
    const today = new Date().toISOString().slice(0, 10);
    const daysInMonth = new Date(year, month, 0).getDate();

    for (let day = 1; day <= daysInMonth; day++) {
      const d = new Date(year, month - 1, day);
      const dateStr = d.toISOString().slice(0, 10);
      if (dateStr > today) break; // don't show future dates
      const dow = d.getDay();
      if (dow === 0 || dow === 6) continue; // skip weekends
      if (!grouped.has(dateStr)) grouped.set(dateStr, []);
    }

    // Sort descending by date
    const sortedEntries = Array.from(grouped.entries()).sort((a, b) => b[0].localeCompare(a[0]));

    return sortedEntries.map(([date, picks]) => {
      const wins = picks.filter(p => p.outcome === 'hit-target' || (p.outcome === 'exit-at-close' && p.pnl_percent != null && p.pnl_percent > 0)).length;
      const losses = picks.filter(p => p.outcome === 'hit-sl' || (p.outcome === 'exit-at-close' && (p.pnl_percent == null || p.pnl_percent <= 0))).length;
      return {
        date,
        displayDate: new Date(date + 'T00:00:00').toLocaleDateString('en-US', {
          weekday: 'long', month: 'short', day: 'numeric',
        }),
        picks,
        highCount: picks.filter(p => p.priority === 'High').length,
        mediumCount: picks.filter(p => p.priority === 'Medium').length,
        hitTargetCount: wins,
        hitStopLossCount: losses,
        pendingCount: picks.filter(p => date >= today || p.outcome == null).length,
      };
    });
  });

  totalPicks = computed(() => this.picks().length);
  totalTargetHit = computed(() => this.picks().filter(p => p.outcome === 'hit-target').length);
  totalClosedProfitable = computed(() => this.picks().filter(p => p.outcome === 'exit-at-close' && p.pnl_percent != null && p.pnl_percent > 0).length);
  totalClosedAtLoss = computed(() => this.picks().filter(p => p.outcome === 'exit-at-close' && (p.pnl_percent == null || p.pnl_percent <= 0)).length);
  totalStoppedOut = computed(() => this.picks().filter(p => p.outcome === 'hit-sl').length);
  totalNotTraded = computed(() => this.picks().filter(p => p.outcome === 'no-trigger').length);
  totalPending = computed(() => {
    const today = new Date().toISOString().slice(0, 10);
    return this.picks().filter(p => p.pick_date >= today || p.outcome == null).length;
  });
  winRate = computed(() => {
    const wins = this.totalTargetHit() + this.totalClosedProfitable();
    const losses = this.totalStoppedOut() + this.totalClosedAtLoss();
    const resolved = wins + losses;
    return resolved > 0 ? (wins / resolved) * 100 : -1;
  });

  currencySymbol = computed(() => this.marketService.marketInfo().currencySymbol);

  constructor() {
    // Reload when market changes
    effect(() => {
      const _m = this.marketService.currentMarket();
      const _month = this.selectedMonth();
      this.fetchPicks();
    });
  }

  ngOnInit(): void {}

  private getCurrentMonth(): string {
    return new Date().toISOString().slice(0, 7);
  }

  prevMonth(): void {
    const [y, m] = this.selectedMonth().split('-').map(Number);
    const prev = m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
    this.selectedMonth.set(prev);
  }

  nextMonth(): void {
    const [y, m] = this.selectedMonth().split('-').map(Number);
    const next = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
    if (next <= this.getCurrentMonth()) {
      this.selectedMonth.set(next);
    }
  }

  isCurrentMonth(): boolean {
    return this.selectedMonth() === this.getCurrentMonth();
  }

  private fetchPicks(): void {
    this.loading.set(true);
    const market = this.marketService.currentMarket();
    const month = this.selectedMonth();

    this.http.get<{ picks: DailyPick[] }>(`/api/stocks?action=daily-picks&market=${market}&month=${month}`)
      .subscribe({
        next: (res) => {
          this.picks.set(res.picks || []);
          this.loading.set(false);
        },
        error: (err) => {
          console.error('Failed to fetch picks:', err);
          this.picks.set([]);
          this.loading.set(false);
        },
      });
  }

  /**
   * Determine outcome from stored evaluation data.
   * The evaluate-picks cron runs each morning and updates outcomes
   * based on actual intraday price data from Yahoo Finance.
   */
  getOutcome(pick: DailyPick): 'hit-target' | 'hit-sl' | 'pending' {
    const today = new Date().toISOString().slice(0, 10);
    if (pick.pick_date >= today) return 'pending';

    // Use stored outcome from the evaluate-picks cron
    if (pick.outcome === 'hit-target') return 'hit-target';
    if (pick.outcome === 'hit-sl') return 'hit-sl';
    // exit-at-close: determine by actual P&L
    if (pick.outcome === 'exit-at-close') {
      return (pick.pnl_percent != null && pick.pnl_percent > 0) ? 'hit-target' : 'hit-sl';
    }
    if (pick.outcome === 'no-trigger') return 'pending'; // no-trigger = trade never activated

    // Not yet evaluated
    return 'pending';
  }

  getOutcomeLabel(pick: DailyPick): string {
    if (pick.outcome === 'hit-target') return 'Target Hit';
    if (pick.outcome === 'hit-sl') return 'Stopped Out';
    if (pick.outcome === 'exit-at-close') {
      return (pick.pnl_percent != null && pick.pnl_percent > 0) ? 'Closed Profitable' : 'Closed at Loss';
    }
    if (pick.outcome === 'no-trigger') return 'Not Traded';
    return 'Pending';
  }

  getOutcomeIcon(pick: DailyPick): string {
    const o = this.getOutcome(pick);
    if (o === 'hit-target') return 'pi pi-check-circle';
    if (o === 'hit-sl') return 'pi pi-times-circle';
    return 'pi pi-clock';
  }

  getPnlPercent(pick: DailyPick): number {
    // Use actual P&L from evaluation cron if available
    if (pick.pnl_percent != null) return pick.pnl_percent;

    // Fallback to estimated P&L based on targets
    const o = this.getOutcome(pick);
    if (o === 'hit-target') {
      return ((pick.sell_price - pick.buy_price) / pick.buy_price) * 100;
    }
    return ((pick.stop_loss - pick.buy_price) / pick.buy_price) * 100;
  }

  getTargetPct(pick: DailyPick): number {
    return pick.buy_price > 0 ? ((pick.sell_price - pick.buy_price) / pick.buy_price) * 100 : 0;
  }

  getStopPct(pick: DailyPick): number {
    return pick.buy_price > 0 ? ((pick.buy_price - pick.stop_loss) / pick.buy_price) * 100 : 0;
  }

  formatSymbol(symbol: string): string {
    return symbol.replace('.NS', '').replace('.BO', '');
  }

  navigateToStock(symbol: string): void {
    this.router.navigate(['/stock', symbol]);
  }
}
