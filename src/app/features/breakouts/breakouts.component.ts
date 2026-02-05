import { Component, OnInit, OnDestroy, inject, signal, computed } from '@angular/core';
import { CommonModule, DecimalPipe } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';

import { ButtonModule } from 'primeng/button';
import { ProgressSpinnerModule } from 'primeng/progressspinner';
import { TooltipModule } from 'primeng/tooltip';

import { MarketService } from '../../core/services';
import { Market } from '../../core/models';

interface BreakoutStock {
  symbol: string;
  name: string;
  price: number;
  change: number;
  changePercent: number;
  marketCap: number;
  volume: number;
  avgVolume: number;
  relativeVolume: number;
  // Technical data
  fiftyDayMA?: number;
  twoHundredDayMA?: number;
  percentFromFiftyDayMA?: number;
  percentFromTwoHundredDayMA?: number;
  fiftyTwoWeekHigh?: number;
  fiftyTwoWeekLow?: number;
  percentFromFiftyTwoWeekHigh?: number;
  percentFromFiftyTwoWeekLow?: number;
  rsi?: number;
  macdSignalType?: string;
  // Alert info
  alertType: string;
  alertCategory: string;
  alertDescription: string;
  severity: 'bullish' | 'bearish' | 'neutral';
  market?: Market;
}

interface AlertCategory {
  id: string;
  label: string;
  icon: string;
  description: string;
  color: string;
  bgColor: string;
}

@Component({
  selector: 'app-breakouts',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ButtonModule,
    ProgressSpinnerModule,
    TooltipModule,
    DecimalPipe
  ],
  template: `
    <div class="breakouts-container">
      <!-- Header -->
      <div class="page-header">
        <div class="header-left">
          <h1>
            <i class="pi pi-chart-line"></i>
            Technical Breakouts
          </h1>
          <span class="subtitle">Stocks crossing critical technical levels</span>
        </div>
        <div class="header-right">
          <div class="last-updated" *ngIf="lastUpdated()">
            <i class="pi pi-clock"></i>
            Updated {{ getTimeAgo(lastUpdated()!) }}
          </div>
          <button 
            pButton 
            type="button" 
            icon="pi pi-refresh" 
            class="p-button-rounded p-button-text refresh-btn"
            [class.spinning]="loading()"
            (click)="refreshData()"
            pTooltip="Refresh Data"
            tooltipPosition="bottom">
          </button>
        </div>
      </div>

      <!-- Filter Bar -->
      <div class="filter-bar">
        <div class="signal-filter">
          <span class="filter-label">Filter:</span>
          <div class="filter-buttons">
            <button 
              class="filter-btn" 
              [class.active]="selectedSignal() === 'all'"
              (click)="setSignalFilter('all')">
              <span class="btn-label">All</span>
              <span class="btn-count">{{ allBreakouts().length }}</span>
            </button>
            <button 
              class="filter-btn bullish" 
              [class.active]="selectedSignal() === 'bullish'"
              (click)="setSignalFilter('bullish')">
              <i class="pi pi-arrow-up"></i>
              <span class="btn-label">Bullish</span>
              <span class="btn-count">{{ bullishCount() }}</span>
            </button>
            <button 
              class="filter-btn bearish" 
              [class.active]="selectedSignal() === 'bearish'"
              (click)="setSignalFilter('bearish')">
              <i class="pi pi-arrow-down"></i>
              <span class="btn-label">Bearish</span>
              <span class="btn-count">{{ bearishCount() }}</span>
            </button>
            @if (neutralCount() > 0) {
              <button 
                class="filter-btn neutral" 
                [class.active]="selectedSignal() === 'neutral'"
                (click)="setSignalFilter('neutral')">
                <i class="pi pi-minus"></i>
                <span class="btn-label">Neutral</span>
                <span class="btn-count">{{ neutralCount() }}</span>
              </button>
            }
          </div>
        </div>
        <div class="stats-summary">
          <div class="stat">
            <span class="stat-value">{{ totalAlerts() }}</span>
            <span class="stat-label">Showing</span>
          </div>
        </div>
      </div>

      <!-- Loading State -->
      @if (loading()) {
        <div class="loading-container">
          <p-progressSpinner strokeWidth="3" [style]="{ width: '50px', height: '50px' }"></p-progressSpinner>
          <span>Scanning stocks for technical breakouts...</span>
        </div>
      }

      <!-- Alert Categories -->
      @if (!loading()) {
        <div class="categories-grid">
          @for (category of alertCategories; track category.id) {
            <div class="category-section" [class.collapsed]="collapsedCategories().includes(category.id)">
              <div class="category-header" (click)="toggleCategory(category.id)">
                <div class="category-title">
                  <i [class]="category.icon" [style.color]="category.color"></i>
                  <h2>{{ category.label }}</h2>
                  <span class="category-count">{{ getCategoryCount(category.id) }}</span>
                </div>
                <div class="category-desc">{{ category.description }}</div>
                <i class="pi collapse-icon" [class.pi-chevron-down]="collapsedCategories().includes(category.id)" [class.pi-chevron-up]="!collapsedCategories().includes(category.id)"></i>
              </div>
              
              @if (!collapsedCategories().includes(category.id)) {
                <div class="category-content">
                  @if (getStocksByCategory(category.id).length === 0) {
                    <div class="empty-category">
                      <i class="pi pi-check-circle"></i>
                      <span>No alerts in this category</span>
                    </div>
                  } @else {
                    <div class="stocks-grid">
                      @for (stock of getStocksByCategory(category.id); track stock.symbol + stock.alertType) {
                        <div class="stock-card" [class]="stock.severity" (click)="goToStock(stock.symbol)">
                          <div class="card-header">
                            <div class="stock-info">
                              <span class="symbol">{{ stock.symbol }}</span>
                              <span class="name">{{ stock.name }}</span>
                            </div>
                            <div class="alert-badge" [class]="stock.severity">
                              {{ stock.severity === 'bullish' ? 'Bullish' : stock.severity === 'bearish' ? 'Bearish' : 'Neutral' }}
                            </div>
                          </div>
                          
                          <div class="price-row">
                            <span class="price">{{ marketService.formatCurrency(stock.price, stock.market || 'US') }}</span>
                            <span class="change" [class.positive]="stock.changePercent >= 0" [class.negative]="stock.changePercent < 0">
                              {{ stock.changePercent >= 0 ? '+' : '' }}{{ stock.changePercent | number:'1.2-2' }}%
                            </span>
                          </div>
                          
                          <div class="alert-description">
                            <i class="pi pi-info-circle"></i>
                            {{ stock.alertDescription }}
                          </div>
                          
                          <div class="metrics-row">
                            @if (stock.rsi != null) {
                              <div class="metric">
                                <span class="metric-label">RSI</span>
                                <span class="metric-value" [class.oversold]="stock.rsi < 30" [class.overbought]="stock.rsi > 70">
                                  {{ stock.rsi | number:'1.0-0' }}
                                </span>
                              </div>
                            }
                            @if (stock.relativeVolume > 1) {
                              <div class="metric">
                                <span class="metric-label">Vol</span>
                                <span class="metric-value highlight">{{ stock.relativeVolume | number:'1.1-1' }}x</span>
                              </div>
                            }
                            @if (stock.percentFromFiftyDayMA != null) {
                              <div class="metric">
                                <span class="metric-label">vs 50MA</span>
                                <span class="metric-value" [class.positive]="stock.percentFromFiftyDayMA > 0" [class.negative]="stock.percentFromFiftyDayMA < 0">
                                  {{ stock.percentFromFiftyDayMA > 0 ? '+' : '' }}{{ stock.percentFromFiftyDayMA | number:'1.1-1' }}%
                                </span>
                              </div>
                            }
                            @if (stock.percentFromTwoHundredDayMA != null) {
                              <div class="metric">
                                <span class="metric-label">vs 200MA</span>
                                <span class="metric-value" [class.positive]="stock.percentFromTwoHundredDayMA > 0" [class.negative]="stock.percentFromTwoHundredDayMA < 0">
                                  {{ stock.percentFromTwoHundredDayMA > 0 ? '+' : '' }}{{ stock.percentFromTwoHundredDayMA | number:'1.1-1' }}%
                                </span>
                              </div>
                            }
                          </div>
                          <div class="metrics-row secondary">
                            @if (stock.fiftyTwoWeekHigh != null) {
                              <div class="metric">
                                <span class="metric-label">52W High</span>
                                <span class="metric-value">{{ stock.fiftyTwoWeekHigh | number:'1.2-2' }}</span>
                              </div>
                            }
                            @if (stock.fiftyTwoWeekLow != null) {
                              <div class="metric">
                                <span class="metric-label">52W Low</span>
                                <span class="metric-value">{{ stock.fiftyTwoWeekLow | number:'1.2-2' }}</span>
                              </div>
                            }
                            @if (stock.percentFromFiftyTwoWeekHigh != null) {
                              <div class="metric">
                                <span class="metric-label">from High</span>
                                <span class="metric-value" [class.positive]="stock.percentFromFiftyTwoWeekHigh >= -2" [class.negative]="stock.percentFromFiftyTwoWeekHigh < -20">
                                  {{ stock.percentFromFiftyTwoWeekHigh | number:'1.1-1' }}%
                                </span>
                              </div>
                            }
                          </div>
                        </div>
                      }
                    </div>
                  }
                </div>
              }
            </div>
          }
        </div>
      }
    </div>
  `,
  styles: [`
    .breakouts-container {
      width: 100%;
      min-height: calc(100vh - 70px);
      padding: 1.5rem 2.5rem;
      background: var(--surface-ground);
    }

    /* Header */
    .page-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 1.5rem;
    }

    .header-left h1 {
      margin: 0;
      font-size: 1.75rem;
      font-weight: 700;
      display: flex;
      align-items: center;
      gap: 0.75rem;
      color: var(--text-color);
    }

    .header-left h1 i {
      color: var(--primary-color);
    }

    .subtitle {
      display: block;
      margin-top: 0.35rem;
      font-size: 0.9rem;
      color: var(--text-color-secondary);
    }

    .header-right {
      display: flex;
      align-items: center;
      gap: 1rem;
    }

    .last-updated {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      font-size: 0.8rem;
      color: var(--text-color-secondary);
    }

    .refresh-btn.spinning {
      animation: spin 1s linear infinite;
    }

    @keyframes spin {
      from { transform: rotate(0deg); }
      to { transform: rotate(360deg); }
    }

    /* Filter Bar */
    .filter-bar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      background: var(--surface-card);
      border-radius: 12px;
      padding: 1rem 1.5rem;
      margin-bottom: 1.5rem;
      gap: 2rem;
    }

    .signal-filter {
      display: flex;
      align-items: center;
      gap: 1rem;
    }

    .filter-label {
      font-size: 0.85rem;
      font-weight: 600;
      color: var(--text-color-secondary);
    }

    .filter-buttons {
      display: flex;
      gap: 0.5rem;
    }

    .filter-btn {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.5rem 1rem;
      border: 1px solid var(--surface-border);
      border-radius: 8px;
      background: var(--surface-ground);
      color: var(--text-color-secondary);
      font-size: 0.85rem;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.2s ease;
    }

    .filter-btn i {
      font-size: 0.75rem;
    }

    .filter-btn .btn-count {
      background: var(--surface-border);
      padding: 0.15rem 0.5rem;
      border-radius: 10px;
      font-size: 0.75rem;
      font-weight: 600;
    }

    .filter-btn:hover {
      background: var(--surface-hover);
      border-color: var(--surface-hover);
    }

    .filter-btn.active {
      background: var(--primary-color);
      border-color: var(--primary-color);
      color: white;
    }

    .filter-btn.active .btn-count {
      background: rgba(255, 255, 255, 0.2);
      color: white;
    }

    .filter-btn.bullish:hover {
      border-color: #22c55e;
      color: #22c55e;
    }

    .filter-btn.bullish.active {
      background: #22c55e;
      border-color: #22c55e;
      color: white;
    }

    .filter-btn.bearish:hover {
      border-color: #ef4444;
      color: #ef4444;
    }

    .filter-btn.bearish.active {
      background: #ef4444;
      border-color: #ef4444;
      color: white;
    }

    .filter-btn.neutral:hover {
      border-color: #6b7280;
      color: #9ca3af;
    }

    .filter-btn.neutral.active {
      background: #6b7280;
      border-color: #6b7280;
      color: white;
    }

    .stats-summary {
      display: flex;
      gap: 2rem;
    }

    .stat {
      display: flex;
      align-items: baseline;
      gap: 0.5rem;
    }

    .stat-value {
      font-size: 1.5rem;
      font-weight: 700;
      color: var(--text-color);
    }

    .stat-label {
      font-size: 0.8rem;
      color: var(--text-color-secondary);
    }

    /* Loading */
    .loading-container {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 1rem;
      padding: 4rem;
      color: var(--text-color-secondary);
    }

    /* Categories */
    .categories-grid {
      display: flex;
      flex-direction: column;
      gap: 1rem;
    }

    .category-section {
      background: var(--surface-card);
      border-radius: 12px;
      overflow: hidden;
    }

    .category-header {
      display: flex;
      align-items: center;
      padding: 1rem 1.5rem;
      cursor: pointer;
      transition: background 0.2s;
      gap: 1rem;
    }

    .category-header:hover {
      background: var(--surface-hover);
    }

    .category-title {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      min-width: 250px;
    }

    .category-title i {
      font-size: 1.25rem;
    }

    .category-title h2 {
      margin: 0;
      font-size: 1rem;
      font-weight: 600;
    }

    .category-count {
      background: var(--surface-ground);
      padding: 0.2rem 0.6rem;
      border-radius: 10px;
      font-size: 0.75rem;
      font-weight: 600;
      color: var(--text-color-secondary);
    }

    .category-desc {
      flex: 1;
      font-size: 0.8rem;
      color: var(--text-color-secondary);
    }

    .collapse-icon {
      color: var(--text-color-secondary);
      font-size: 0.9rem;
    }

    .category-content {
      padding: 0 1.5rem 1.5rem;
    }

    .empty-category {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 0.5rem;
      padding: 2rem;
      color: var(--text-color-secondary);
      font-size: 0.85rem;
    }

    .empty-category i {
      color: #22c55e;
    }

    /* Stocks Grid */
    .stocks-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
      gap: 1rem;
    }

    .stock-card {
      background: var(--surface-ground);
      border-radius: 10px;
      padding: 1rem;
      cursor: pointer;
      transition: all 0.2s;
      border-left: 4px solid var(--surface-border);
    }

    .stock-card:hover {
      transform: translateY(-2px);
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
    }

    .stock-card.bullish {
      border-left-color: #22c55e;
    }

    .stock-card.bearish {
      border-left-color: #ef4444;
    }

    .card-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 0.75rem;
    }

    .stock-info {
      display: flex;
      flex-direction: column;
      gap: 0.15rem;
    }

    .symbol {
      font-size: 1rem;
      font-weight: 700;
      color: var(--primary-color);
    }

    .name {
      font-size: 0.75rem;
      color: var(--text-color-secondary);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      max-width: 150px;
    }

    .alert-badge {
      font-size: 0.65rem;
      font-weight: 700;
      padding: 0.25rem 0.5rem;
      border-radius: 4px;
      text-transform: uppercase;
    }

    .alert-badge.bullish {
      background: rgba(34, 197, 94, 0.15);
      color: #22c55e;
    }

    .alert-badge.bearish {
      background: rgba(239, 68, 68, 0.15);
      color: #ef4444;
    }

    .alert-badge.neutral {
      background: rgba(107, 114, 128, 0.15);
      color: #6b7280;
    }

    .price-row {
      display: flex;
      align-items: baseline;
      gap: 0.75rem;
      margin-bottom: 0.75rem;
    }

    .price {
      font-size: 1.1rem;
      font-weight: 600;
    }

    .change {
      font-size: 0.85rem;
      font-weight: 500;
    }

    .change.positive { color: #22c55e; }
    .change.negative { color: #ef4444; }

    .alert-description {
      display: flex;
      align-items: flex-start;
      gap: 0.5rem;
      font-size: 0.8rem;
      color: var(--text-color-secondary);
      margin-bottom: 0.75rem;
      line-height: 1.4;
    }

    .alert-description i {
      margin-top: 0.15rem;
      font-size: 0.75rem;
      flex-shrink: 0;
    }

    .metrics-row {
      display: flex;
      gap: 1rem;
      padding-top: 0.75rem;
      border-top: 1px solid var(--surface-border);
      flex-wrap: wrap;
    }

    .metrics-row.secondary {
      border-top: none;
      padding-top: 0.5rem;
    }

    .metric {
      display: flex;
      flex-direction: column;
      gap: 0.15rem;
    }

    .metric-label {
      font-size: 0.65rem;
      color: var(--text-color-secondary);
      text-transform: uppercase;
    }

    .metric-value {
      font-size: 0.85rem;
      font-weight: 600;
    }

    .metric-value.positive { color: #22c55e; }
    .metric-value.negative { color: #ef4444; }
    .metric-value.oversold { color: #22c55e; }
    .metric-value.overbought { color: #ef4444; }
    .metric-value.highlight { color: var(--primary-color); }

    /* Responsive */
    @media (max-width: 1024px) {
      .breakouts-container {
        padding: 1rem 1.5rem;
      }

      .filter-bar {
        flex-direction: column;
        align-items: flex-start;
        gap: 1rem;
      }

      .stats-summary {
        width: 100%;
        justify-content: space-around;
      }
    }

    @media (max-width: 768px) {
      .breakouts-container {
        padding: 1rem;
      }

      .page-header {
        flex-direction: column;
        gap: 1rem;
      }

      .category-header {
        flex-wrap: wrap;
      }

      .category-desc {
        width: 100%;
        order: 3;
        margin-top: 0.5rem;
      }

      .stocks-grid {
        grid-template-columns: 1fr;
      }
    }
  `]
})
export class BreakoutsComponent implements OnInit, OnDestroy {
  private http = inject(HttpClient);
  private router = inject(Router);
  marketService = inject(MarketService);

  // Alert category definitions
  alertCategories: AlertCategory[] = [
    { 
      id: 'ma_crossover', 
      label: 'Moving Average Crossovers', 
      icon: 'pi pi-arrows-h',
      description: 'Stocks crossing above or below key moving averages (50 & 200 day)',
      color: '#3b82f6',
      bgColor: 'rgba(59, 130, 246, 0.12)'
    },
    { 
      id: '52w_levels', 
      label: '52-Week Highs & Lows', 
      icon: 'pi pi-chart-bar',
      description: 'Stocks at or near their 52-week extremes',
      color: '#f97316',
      bgColor: 'rgba(249, 115, 22, 0.12)'
    },
    { 
      id: 'rsi_signals', 
      label: 'RSI Signals', 
      icon: 'pi pi-sliders-h',
      description: 'Overbought (RSI > 70) or oversold (RSI < 30) conditions',
      color: '#a855f7',
      bgColor: 'rgba(168, 85, 247, 0.12)'
    },
    { 
      id: 'macd_signals', 
      label: 'MACD Crossovers', 
      icon: 'pi pi-sort-alt',
      description: 'Bullish or bearish MACD line crossovers',
      color: '#14b8a6',
      bgColor: 'rgba(20, 184, 166, 0.12)'
    },
    { 
      id: 'volume_breakout', 
      label: 'Volume Breakouts', 
      icon: 'pi pi-chart-line',
      description: 'Unusual trading volume (2x+ average)',
      color: '#ec4899',
      bgColor: 'rgba(236, 72, 153, 0.12)'
    }
  ];

  // State
  allBreakouts = signal<BreakoutStock[]>([]);
  loading = signal(false);
  lastUpdated = signal<Date | null>(null);
  collapsedCategories = signal<string[]>([]);
  selectedSignal = signal<'all' | 'bullish' | 'bearish' | 'neutral'>('all');

  // Computed
  filteredBreakouts = computed(() => {
    const breakouts = this.allBreakouts();
    const filter = this.selectedSignal();
    if (filter === 'all') return breakouts;
    return breakouts.filter(b => b.severity === filter);
  });

  bullishCount = computed(() => this.allBreakouts().filter(b => b.severity === 'bullish').length);
  bearishCount = computed(() => this.allBreakouts().filter(b => b.severity === 'bearish').length);
  neutralCount = computed(() => this.allBreakouts().filter(b => b.severity === 'neutral').length);
  totalAlerts = computed(() => this.filteredBreakouts().length);

  private refreshInterval: ReturnType<typeof setInterval> | null = null;

  ngOnInit(): void {
    this.loadBreakouts();
    
    // Auto-refresh every 5 minutes
    this.refreshInterval = setInterval(() => {
      this.loadBreakouts();
    }, 5 * 60 * 1000);
  }

  ngOnDestroy(): void {
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
    }
  }

  async loadBreakouts(): Promise<void> {
    this.loading.set(true);
    
    try {
      const result = await this.http.get<{ breakouts: BreakoutStock[] }>(
        '/api/market/breakouts'
      ).toPromise();
      
      if (result?.breakouts) {
        this.allBreakouts.set(result.breakouts);
        this.lastUpdated.set(new Date());
      }
    } catch (err) {
      console.error('Failed to fetch breakouts:', err);
    } finally {
      this.loading.set(false);
    }
  }

  refreshData(): void {
    if (!this.loading()) {
      this.loadBreakouts();
    }
  }

  setSignalFilter(filter: 'all' | 'bullish' | 'bearish' | 'neutral'): void {
    this.selectedSignal.set(filter);
  }

  toggleCategory(categoryId: string): void {
    const current = this.collapsedCategories();
    if (current.includes(categoryId)) {
      this.collapsedCategories.set(current.filter(c => c !== categoryId));
    } else {
      this.collapsedCategories.set([...current, categoryId]);
    }
  }

  getCategoryCount(categoryId: string): number {
    return this.filteredBreakouts().filter(b => b.alertCategory === categoryId).length;
  }

  getStocksByCategory(categoryId: string): BreakoutStock[] {
    return this.filteredBreakouts().filter(b => b.alertCategory === categoryId);
  }

  goToStock(symbol: string): void {
    this.router.navigate(['/stock', symbol]);
  }

  getTimeAgo(date: Date): string {
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    
    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    
    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays}d ago`;
  }
}
