import { Component, inject, signal, OnInit, OnDestroy, effect } from '@angular/core';
import { CommonModule, DecimalPipe } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Router, NavigationEnd } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { SelectButtonModule } from 'primeng/selectbutton';
import { TooltipModule } from 'primeng/tooltip';
import { AutoCompleteModule, AutoCompleteCompleteEvent } from 'primeng/autocomplete';
import { FormsModule } from '@angular/forms';
import { filter } from 'rxjs/operators';

import { MarketService, ThemeService } from '../../core/services';
import { Market, MARKETS, Stock } from '../../core/models';

interface MarketIndex {
  symbol: string;
  name: string;
  price: number;
  change: number;
  changePercent: number;
  fiftyTwoWeekLow: number;
  fiftyTwoWeekHigh: number;
}

@Component({
  selector: 'app-header',
  standalone: true,
  imports: [CommonModule, ButtonModule, SelectButtonModule, TooltipModule, AutoCompleteModule, FormsModule, DecimalPipe],
  template: `
    <header class="app-header">
      <div class="header-content">
        <!-- Left section: Logo + Search -->
        <div class="header-left">
          <!-- Logo - Clickable to go home -->
          <div class="header-brand" (click)="goHome()" [pTooltip]="'Go to Screener'" tooltipPosition="bottom">
            <i class="pi pi-chart-bar brand-icon"></i>
            <span class="brand-name">StockScreen</span>
          </div>

          <!-- Stock Search (always visible) -->
          <div class="header-search">
            <p-autoComplete 
              [(ngModel)]="searchQuery"
              [suggestions]="filteredStocks()"
              (completeMethod)="searchStocks($event)"
              (onSelect)="onStockSelect($event)"
              [minLength]="1"
              [delay]="300"
              placeholder="Search stocks..."
              [showEmptyMessage]="true"
              emptyMessage="No stocks found"
              [forceSelection]="false"
              styleClass="header-stock-search"
              inputStyleClass="search-input">
              <ng-template let-stock pTemplate="item">
                <div class="search-item" (click)="navigateToStock(stock.symbol)">
                  <span class="search-symbol">{{ stock.symbol }}</span>
                  <span class="search-name">{{ stock.name }}</span>
                  <span class="search-cap">{{ marketService.formatMarketCap(stock.marketCap, stock.market) }}</span>
                  <span class="search-price" [class.positive]="stock.changePercent >= 0" [class.negative]="stock.changePercent < 0">
                    {{ formatPrice(stock.price, stock.market) }}
                  </span>
                </div>
              </ng-template>
            </p-autoComplete>
          </div>
        </div>

        <!-- Market Indices -->
        <div class="market-indices">
          @for (index of indices(); track index.symbol) {
            <div class="index-item">
              <div class="index-main">
                <span class="index-name">{{ index.name }}</span>
                <span class="index-price">{{ index.price | number:'1.0-0' }}</span>
                <span class="index-change" [class.up]="index.changePercent >= 0" [class.down]="index.changePercent < 0">
                  {{ index.changePercent >= 0 ? '+' : '' }}{{ index.changePercent | number:'1.2-2' }}%
                </span>
              </div>
              <div class="index-range" [pTooltip]="'52W: ' + (index.fiftyTwoWeekLow | number:'1.0-0') + ' - ' + (index.fiftyTwoWeekHigh | number:'1.0-0')" tooltipPosition="bottom">
                <span class="range-label">{{ index.fiftyTwoWeekLow | number:'1.0-0' }}</span>
                <div class="range-bar">
                  <div class="range-fill" [style.left.%]="getRangePosition(index)"></div>
                </div>
                <span class="range-label">{{ index.fiftyTwoWeekHigh | number:'1.0-0' }}</span>
              </div>
            </div>
          }
          @if (indicesLoading()) {
            <div class="index-loading">
              <i class="pi pi-spin pi-spinner"></i>
            </div>
          }
        </div>

        <!-- Right: Controls -->
        <div class="header-controls">
          <!-- Market Status -->
          <div class="market-status" [class.open]="marketService.isMarketOpen()">
            <span class="status-dot"></span>
            <span class="status-text">{{ marketService.getMarketStatusMessage() }}</span>
          </div>

          <!-- Market Toggle -->
          <div class="market-toggle">
            <button 
              class="market-btn" 
              [class.active]="selectedMarket === 'US'"
              (click)="onMarketChange('US')"
              pTooltip="United States"
              tooltipPosition="bottom">
              <svg viewBox="0 0 640 480" class="flag-icon">
                <g fill-rule="evenodd">
                  <g stroke-width="1pt">
                    <path fill="#bd3d44" d="M0 0h640v37H0zm0 74h640v37H0zm0 73h640v37H0zm0 74h640v37H0zm0 73h640v37H0zm0 74h640v37H0z"/>
                    <path fill="#fff" d="M0 37h640v37H0zm0 73h640v37H0zm0 74h640v37H0zm0 73h640v37H0zm0 74h640v37H0zm0 73h640v37H0z"/>
                  </g>
                  <path fill="#192f5d" d="M0 0h260v258H0z"/>
                </g>
              </svg>
            </button>
            <button 
              class="market-btn" 
              [class.active]="selectedMarket === 'IN'"
              (click)="onMarketChange('IN')"
              pTooltip="India"
              tooltipPosition="bottom">
              <svg viewBox="0 0 640 480" class="flag-icon">
                <path fill="#f93" d="M0 0h640v160H0z"/>
                <path fill="#fff" d="M0 160h640v160H0z"/>
                <path fill="#128807" d="M0 320h640v160H0z"/>
                <circle cx="320" cy="240" r="55" fill="#008" stroke="#008" stroke-width="4"/>
                <circle cx="320" cy="240" r="45" fill="#fff"/>
                <circle cx="320" cy="240" r="10" fill="#008"/>
              </svg>
            </button>
          </div>

          <!-- Theme Toggle -->
          <button 
            pButton 
            type="button" 
            [icon]="themeService.isDark() ? 'pi pi-sun' : 'pi pi-moon'"
            class="p-button-rounded p-button-text theme-toggle"
            (click)="themeService.toggleTheme()"
            [pTooltip]="themeService.isDark() ? 'Light Mode' : 'Dark Mode'"
            tooltipPosition="bottom">
          </button>
        </div>
      </div>
    </header>
  `,
  styles: [`
    .app-header {
      background: var(--surface-card);
      border-bottom: 1px solid var(--surface-border);
      padding: 0 1rem;
      height: 52px;
      display: flex;
      align-items: center;
      position: sticky;
      top: 0;
      z-index: 1000;
    }

    .header-content {
      display: flex;
      align-items: center;
      justify-content: space-between;
      width: 100%;
      max-width: 1900px;
      margin: 0 auto;
    }

    .header-left {
      display: flex;
      align-items: center;
      gap: 1.5rem;
    }

    .header-brand {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      cursor: pointer;
      padding: 0.25rem 0.5rem;
      border-radius: 6px;
      transition: background 0.2s;

      &:hover {
        background: var(--surface-hover);
      }
    }

    .brand-icon {
      font-size: 1.25rem;
      color: var(--primary-color);
    }

    .brand-name {
      font-size: 1rem;
      font-weight: 700;
      color: var(--text-color);
      letter-spacing: -0.02em;
    }

    .header-search {
      flex: 0 0 auto;
      min-width: 220px;
      max-width: 300px;
    }

    :host ::ng-deep .header-stock-search {
      width: 100%;

      .p-autocomplete-input {
        width: 100%;
        padding: 0.4rem 0.75rem;
        font-size: 0.8rem;
        background: var(--surface-section);
        border-color: var(--surface-border);
        border-radius: 6px;

        &:focus {
          border-color: var(--primary-color);
          box-shadow: 0 0 0 1px var(--primary-color);
        }
      }

      .p-autocomplete-panel {
        min-width: 350px;
      }
    }

    .search-item {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.4rem 0;
      font-size: 0.8rem;
    }

    .search-symbol {
      font-weight: 600;
      min-width: 60px;
      color: var(--primary-color);
    }

    .search-name {
      flex: 1;
      color: var(--text-color-secondary);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      max-width: 150px;
    }

    .search-cap {
      font-size: 0.7rem;
      color: var(--text-color-secondary);
      font-family: 'JetBrains Mono', monospace;
      min-width: 50px;
      text-align: right;
    }

    .search-price {
      font-family: 'JetBrains Mono', monospace;
      min-width: 60px;
      text-align: right;

      &.positive { color: var(--green-500); }
      &.negative { color: var(--red-500); }
    }

    .market-indices {
      display: flex;
      align-items: center;
      gap: 8rem;
      margin: 0 4rem;
    }

    .index-item {
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      gap: 0.15rem;
      font-size: 0.75rem;
    }

    .index-main {
      display: flex;
      align-items: center;
      gap: 0.4rem;
    }

    .index-name {
      color: var(--text-color-secondary);
      font-weight: 500;
    }

    .index-price {
      color: var(--text-color);
      font-family: 'JetBrains Mono', monospace;
      font-weight: 600;
    }

    .index-change {
      font-family: 'JetBrains Mono', monospace;
      font-size: 0.7rem;
      padding: 0.1rem 0.3rem;
      border-radius: 3px;
      
      &.up {
        color: #10b981;
        background: rgba(16, 185, 129, 0.1);
      }
      
      &.down {
        color: #ef4444;
        background: rgba(239, 68, 68, 0.1);
      }
    }

    .index-loading {
      color: var(--text-color-secondary);
      font-size: 0.75rem;
    }

    .index-range {
      display: flex;
      align-items: center;
      gap: 0.25rem;
      width: 100%;
    }

    .range-bar {
      flex: 1;
      height: 3px;
      background: var(--surface-border);
      border-radius: 2px;
      position: relative;
      min-width: 50px;
    }

    .range-fill {
      position: absolute;
      width: 5px;
      height: 5px;
      background: var(--primary-color);
      border-radius: 50%;
      top: 50%;
      transform: translate(-50%, -50%);
    }

    .range-label {
      font-size: 0.55rem;
      color: var(--text-color-secondary);
      font-family: 'JetBrains Mono', monospace;
      opacity: 0.7;
    }

    .header-controls {
      display: flex;
      align-items: center;
      gap: 1.5rem;
    }

    .market-status {
      display: flex;
      align-items: center;
      gap: 0.375rem;
      padding: 0.25rem 0.625rem;
      border-radius: 12px;
      background: rgba(239, 68, 68, 0.1);
      font-size: 0.7rem;
      color: #ef4444;

      &.open {
        background: rgba(16, 185, 129, 0.1);
        color: #10b981;
      }
    }

    .status-dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: currentColor;
    }

    .market-toggle {
      display: flex;
      align-items: center;
      gap: 0.35rem;
      background: linear-gradient(135deg, rgba(30, 41, 59, 0.95), rgba(51, 65, 85, 0.95));
      border-radius: 24px;
      padding: 0.35rem;
      border: 1px solid rgba(255, 255, 255, 0.15);
      box-shadow: 0 2px 10px rgba(0, 0, 0, 0.25);
      margin-left: 1.5rem;
    }

    .market-btn {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 42px;
      height: 32px;
      padding: 0.3rem;
      background: transparent;
      border: none;
      border-radius: 18px;
      cursor: pointer;
      transition: all 0.25s ease;
      
      &:hover:not(.active) {
        background: rgba(255, 255, 255, 0.15);
      }
      
      &.active:first-child {
        background: linear-gradient(135deg, #3b82f6, #1d4ed8);
        box-shadow: 0 2px 10px rgba(59, 130, 246, 0.5);
      }
      
      &.active:last-child {
        background: linear-gradient(135deg, #f97316, #16a34a);
        box-shadow: 0 2px 10px rgba(249, 115, 22, 0.4);
      }
    }

    .flag-icon {
      width: 28px;
      height: 20px;
      border-radius: 3px;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
    }

    .theme-toggle {
      width: 2rem !important;
      height: 2rem !important;
      color: var(--text-color-secondary);
      
      &:hover {
        color: var(--text-color);
        background: var(--surface-hover);
      }
    }

    @media (max-width: 1024px) {
      .market-indices {
        display: none;
      }
    }

    @media (max-width: 768px) {
      .market-status {
        display: none;
      }
    }
  `]
})
export class HeaderComponent implements OnInit, OnDestroy {
  private http = inject(HttpClient);
  private router = inject(Router);
  marketService = inject(MarketService);
  themeService = inject(ThemeService);

  marketOptions = [
    { label: 'US', value: 'US' as Market, flag: MARKETS.US.flag },
    { label: 'India', value: 'IN' as Market, flag: MARKETS.IN.flag }
  ];

  selectedMarket: Market = this.marketService.currentMarket();
  
  indices = signal<MarketIndex[]>([]);
  indicesLoading = signal(false);
  
  // Search functionality
  showSearch = signal(false);
  searchQuery: string = '';
  filteredStocks = signal<Stock[]>([]);
  
  private refreshInterval: ReturnType<typeof setInterval> | null = null;

  constructor() {
    // Re-fetch indices when market changes
    effect(() => {
      const market = this.marketService.currentMarket();
      this.selectedMarket = market;
      this.fetchIndices(market);
    });

    // Check current route to show/hide search
    this.router.events.pipe(
      filter(event => event instanceof NavigationEnd)
    ).subscribe((event: NavigationEnd) => {
      this.showSearch.set(event.url.startsWith('/stock/'));
    });
  }

  ngOnInit(): void {
    // Refresh indices every 60 seconds
    this.refreshInterval = setInterval(() => {
      this.fetchIndices(this.marketService.currentMarket());
    }, 60000);
  }

  ngOnDestroy(): void {
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
    }
  }

  onMarketChange(market: Market): void {
    this.marketService.setMarket(market);
  }

  private fetchIndices(market: Market): void {
    this.indicesLoading.set(true);
    this.http.get<{ indices: MarketIndex[] }>(`/api/market/indices?market=${market}`).subscribe({
      next: (response) => {
        this.indices.set(response.indices || []);
        this.indicesLoading.set(false);
      },
      error: (err) => {
        console.error('Failed to fetch indices:', err);
        this.indicesLoading.set(false);
      }
    });
  }

  getRangePosition(index: MarketIndex): number {
    if (!index.fiftyTwoWeekLow || !index.fiftyTwoWeekHigh || index.fiftyTwoWeekHigh === index.fiftyTwoWeekLow) {
      return 50;
    }
    const range = index.fiftyTwoWeekHigh - index.fiftyTwoWeekLow;
    const position = ((index.price - index.fiftyTwoWeekLow) / range) * 100;
    return Math.max(0, Math.min(100, position));
  }

  goHome(): void {
    this.router.navigate(['/']);
  }

  searchStocks(event: AutoCompleteCompleteEvent): void {
    const query = event.query.toLowerCase().trim();
    if (query.length < 1) {
      this.filteredStocks.set([]);
      return;
    }
    
    this.http.get<{ stocks: Stock[] }>(`/api/stocks/search?q=${encodeURIComponent(query)}&fuzzy=true`).subscribe({
      next: (result) => {
        if (result.stocks && result.stocks.length > 0) {
          this.filteredStocks.set(result.stocks.slice(0, 15));
        } else {
          this.filteredStocks.set([]);
        }
      },
      error: () => {
        this.filteredStocks.set([]);
      }
    });
  }

  onStockSelect(event: { value: Stock }): void {
    if (event.value?.symbol) {
      this.navigateToStock(event.value.symbol);
    }
  }

  navigateToStock(symbol: string): void {
    this.searchQuery = '';
    this.filteredStocks.set([]);
    this.router.navigate(['/stock', symbol]);
  }

  formatPrice(price: number, market?: string): string {
    if (!price) return '—';
    return this.marketService.formatCurrency(price, market as Market);
  }
}
