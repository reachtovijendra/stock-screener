import { Component, inject, computed, signal, output } from '@angular/core';
import { CommonModule, DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';

// PrimeNG Modules
import { TableModule } from 'primeng/table';
import { ButtonModule } from 'primeng/button';
import { TagModule } from 'primeng/tag';
import { TooltipModule } from 'primeng/tooltip';
import { SkeletonModule } from 'primeng/skeleton';
import { ProgressSpinnerModule } from 'primeng/progressspinner';
import { MessageModule } from 'primeng/message';
import { AutoCompleteModule, AutoCompleteCompleteEvent, AutoCompleteSelectEvent } from 'primeng/autocomplete';
import { MultiSelectModule } from 'primeng/multiselect';
import { DropdownModule } from 'primeng/dropdown';

import { ScreenerService, MarketService } from '../../../core/services';
import { Stock, Market } from '../../../core/models/stock.model';
import { SortConfig } from '../../../core/models/filter.model';

@Component({
  selector: 'app-results-table',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    TableModule,
    ButtonModule,
    TagModule,
    TooltipModule,
    SkeletonModule,
    ProgressSpinnerModule,
    MessageModule,
    AutoCompleteModule,
    MultiSelectModule,
    DropdownModule,
    DecimalPipe
  ],
  template: `
    <div class="results-container">
      <!-- Results Header -->
      <div class="results-header">
        <div class="header-left">
          <h2>Results</h2>
          @if (!screenerService.loading() && screenerService.totalCount() > 0) {
            <span class="stock-count">{{ screenerService.totalCount() | number }} stocks</span>
          }
        </div>
        <div class="header-right">
          @if (screenerService.executionTime() > 0) {
            <span class="exec-time">{{ screenerService.executionTime() | number:'1.0-0' }}ms</span>
          }
          <button 
            pButton 
            type="button"
            icon="pi pi-download"
            class="p-button-text p-button-sm export-btn"
            pTooltip="Export to CSV"
            tooltipPosition="left"
            [disabled]="screenerService.results().length === 0"
            (click)="screenerService.exportToCsv()">
          </button>
        </div>
      </div>

      <!-- Summary Stats -->
      @if (summary(); as stats) {
        @if (screenerService.results().length > 0) {
          <div class="stats-bar">
            <div class="stat">
              <span class="stat-value">{{ marketService.formatMarketCap(stats.totalMarketCap) }}</span>
              <span class="stat-label">Total Cap</span>
            </div>
            <div class="stat-divider"></div>
            <div class="stat">
              <span class="stat-value">{{ stats.avgPE !== null ? (stats.avgPE | number:'1.1-1') : '—' }}</span>
              <span class="stat-label">Avg P/E</span>
            </div>
            <div class="stat-divider"></div>
            <div class="stat positive">
              <span class="stat-value">{{ stats.gainers }}</span>
              <span class="stat-label">Gainers</span>
            </div>
            <div class="stat-divider"></div>
            <div class="stat negative">
              <span class="stat-value">{{ stats.losers }}</span>
              <span class="stat-label">Losers</span>
            </div>
            <div class="stat-divider"></div>
            <div class="stat neutral">
              <span class="stat-value">{{ stats.unchanged }}</span>
              <span class="stat-label">Flat</span>
            </div>
            
            <!-- Technical Quick Filters -->
            <div class="stat-divider"></div>
            <div class="tech-filters">
              <span class="tech-label">RSI:</span>
              <button class="tech-chip" [class.active]="rsiFilter() === 'oversold'" 
                      (click)="toggleRsiFilter('oversold')" pTooltip="RSI < 30">Oversold</button>
              <button class="tech-chip" [class.active]="rsiFilter() === 'overbought'" 
                      (click)="toggleRsiFilter('overbought')" pTooltip="RSI > 70">Overbought</button>
            </div>
            <div class="stat-divider"></div>
            <div class="tech-filters">
              <span class="tech-label">MACD:</span>
              <button class="tech-chip" [class.active]="macdFilter() === 'bullish'" 
                      (click)="toggleMacdFilter('bullish')" pTooltip="MACD above signal">Bullish</button>
              <button class="tech-chip" [class.active]="macdFilter() === 'bearish'" 
                      (click)="toggleMacdFilter('bearish')" pTooltip="MACD below signal">Bearish</button>
            </div>
            @if (rsiFilter() || macdFilter()) {
              <button class="clear-tech-btn" (click)="clearTechFilters()" pTooltip="Clear technical filters">
                <i class="pi pi-times"></i>
              </button>
            }
            @if (calculatingTechnicals()) {
              <div class="tech-loading">
                <i class="pi pi-spin pi-spinner"></i>
                <span>Calculating {{ technicalProgress() }}...</span>
              </div>
            }
          </div>
          
          <!-- Exclusions Note -->
          <div class="exclusions-note">
            <i class="pi pi-info-circle"></i>
            <span>
              @if (marketService.currentMarket() === 'US') {
                Filters: Min $1B market cap • NYSE/NASDAQ only • ETFs without market cap included
              } @else {
                Filters: Min ₹8,300 Cr market cap • NSE/BSE only • ETFs without market cap included
              }
            </span>
          </div>
        }
      }

      <!-- Loading State -->
      @if (screenerService.loading()) {
        <div class="state-container">
          <p-progressSpinner strokeWidth="3" [style]="{ width: '40px', height: '40px' }"></p-progressSpinner>
          <span class="state-text">Scanning markets...</span>
        </div>
      }

      <!-- Error State -->
      @if (screenerService.error(); as error) {
        <div class="state-container error">
          <i class="pi pi-exclamation-circle"></i>
          <span class="state-text">{{ error }}</span>
        </div>
      }

      <!-- Empty State -->
      @if (!screenerService.loading() && !screenerService.error() && screenerService.results().length === 0) {
        <div class="state-container empty">
          <i class="pi pi-chart-bar"></i>
          <span class="state-title">Ready to Screen</span>
          <span class="state-text">Configure your filters and click Run Screen</span>
        </div>
      }

      <!-- Results Table -->
      @if (!screenerService.loading() && screenerService.results().length > 0) {
        <p-table 
          [value]="screenerService.results()"
          [totalRecords]="screenerService.totalCount()"
          [paginator]="true"
          [rows]="50"
          [rowsPerPageOptions]="[25, 50, 100]"
          [scrollable]="true"
          scrollDirection="vertical"
          [showCurrentPageReport]="true"
          currentPageReportTemplate="{first}–{last} of {totalRecords}"
          sortField="marketCap"
          [sortOrder]="-1"
          scrollHeight="calc(100vh - 260px)"
          styleClass="compact-table"
          responsiveLayout="scroll"
          [lazy]="true"
          (onLazyLoad)="onLazyLoad($event)">
          
          <ng-template pTemplate="header">
            <tr>
              <th pSortableColumn="symbol" class="col-symbol">
                Symbol <p-sortIcon field="symbol"></p-sortIcon>
              </th>
              <th pSortableColumn="price" class="col-price text-right">
                Price <p-sortIcon field="price"></p-sortIcon>
              </th>
              <th pSortableColumn="changePercent" class="col-change text-right">
                Change <p-sortIcon field="changePercent"></p-sortIcon>
              </th>
              <th pSortableColumn="marketCap" class="col-cap text-right">
                Mkt Cap <p-sortIcon field="marketCap"></p-sortIcon>
              </th>
              <th pSortableColumn="peRatio" class="col-pe text-right">
                P/E <p-sortIcon field="peRatio"></p-sortIcon>
              </th>
              <th pSortableColumn="forwardPeRatio" class="col-fpe text-right">
                Fwd P/E <p-sortIcon field="forwardPeRatio"></p-sortIcon>
              </th>
              <th pSortableColumn="fiftyTwoWeekLow" class="col-range text-center">
                52W Range <p-sortIcon field="fiftyTwoWeekLow"></p-sortIcon>
              </th>
              <th pSortableColumn="volume" class="col-vol text-right">
                Volume <p-sortIcon field="volume"></p-sortIcon>
              </th>
              <th pSortableColumn="rsi" class="col-rsi text-right">
                RSI <p-sortIcon field="rsi"></p-sortIcon>
              </th>
              <th pSortableColumn="macdHistogram" class="col-macd text-right">
                MACD <p-sortIcon field="macdHistogram"></p-sortIcon>
              </th>
              <th pSortableColumn="sector" class="col-sector">
                Sector <p-sortIcon field="sector"></p-sortIcon>
              </th>
              <th pSortableColumn="industry" class="col-industry">
                Industry <p-sortIcon field="industry"></p-sortIcon>
              </th>
            </tr>
          </ng-template>

          <ng-template pTemplate="body" let-stock>
            <tr class="clickable-row" (click)="openStockDetail(stock.symbol)">
              <!-- Symbol + Name -->
              <td class="col-symbol">
                <div class="symbol-cell">
                  <span class="ticker">{{ stock.symbol }}</span>
                  <span class="name" [pTooltip]="stock.name" tooltipPosition="top">{{ stock.name | slice:0:20 }}{{ stock.name.length > 20 ? '...' : '' }}</span>
                </div>
              </td>
              
              <!-- Price -->
              <td class="col-price text-right">
                <span class="price-value">{{ formatPrice(stock.price, stock.market) }}</span>
              </td>
              
              <!-- Change -->
              <td class="col-change text-right">
                <span class="change-value" [class.up]="stock.changePercent > 0" [class.down]="stock.changePercent < 0">
                  {{ stock.changePercent >= 0 ? '+' : '' }}{{ stock.changePercent | number:'1.2-2' }}%
                </span>
              </td>
              
              <!-- Market Cap -->
              <td class="col-cap text-right">
                <span class="cap-value">{{ marketService.formatMarketCap(stock.marketCap, stock.market) }}</span>
              </td>
              
              <!-- P/E -->
              <td class="col-pe text-right">
                <span [class.muted]="stock.peRatio === null">
                  {{ stock.peRatio !== null ? (stock.peRatio | number:'1.1-1') : '—' }}
                </span>
              </td>
              
              <!-- Forward P/E -->
              <td class="col-fpe text-right">
                <span [class.muted]="stock.forwardPeRatio === null">
                  {{ stock.forwardPeRatio !== null ? (stock.forwardPeRatio | number:'1.1-1') : '—' }}
                </span>
              </td>
              
              <!-- 52W Range -->
              <td class="col-range text-center">
                <span class="range-value">
                  {{ formatPrice(stock.fiftyTwoWeekLow, stock.market) }} - {{ formatPrice(stock.fiftyTwoWeekHigh, stock.market) }}
                </span>
              </td>
              
              <!-- Volume -->
              <td class="col-vol text-right">
                <span class="vol-value">{{ marketService.formatVolume(stock.volume) }}</span>
              </td>
              
              <!-- RSI -->
              <td class="col-rsi text-right">
                @if (stock.rsi !== null && stock.rsi !== undefined) {
                  <span class="rsi-value" 
                        [class.oversold]="stock.rsi < 30" 
                        [class.overbought]="stock.rsi > 70">
                    {{ stock.rsi | number:'1.0-0' }}
                  </span>
                } @else {
                  <span class="muted">—</span>
                }
              </td>
              
              <!-- MACD -->
              <td class="col-macd text-right">
                @if (stock.macdHistogram !== null && stock.macdHistogram !== undefined) {
                  <span class="macd-value" 
                        [class.positive]="stock.macdHistogram > 0" 
                        [class.negative]="stock.macdHistogram < 0">
                    {{ stock.macdHistogram | number:'1.2-2' }}
                  </span>
                } @else {
                  <span class="muted">—</span>
                }
              </td>
              
              <!-- Sector -->
              <td class="col-sector">
                <span class="sector-badge" [attr.data-sector]="stock.sector">
                  {{ stock.sector }}
                </span>
              </td>
              
              <!-- Industry -->
              <td class="col-industry">
                <span class="industry-text">{{ stock.industry }}</span>
              </td>
            </tr>
          </ng-template>

          <ng-template pTemplate="emptymessage">
            <tr>
              <td colspan="12" class="text-center p-4">No stocks match your criteria.</td>
            </tr>
          </ng-template>
        </p-table>
      }
    </div>
  `,
  styles: [`
    .results-container {
      background: var(--surface-card);
      border: 1px solid var(--surface-border);
      border-radius: 12px;
      overflow: hidden;
    }

    .results-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 1rem 1.25rem;
      background: var(--surface-ground);
      border-bottom: 1px solid var(--surface-border);
      gap: 1rem;
    }

    .header-left {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      flex-shrink: 0;

      h2 {
        font-size: 1rem;
        font-weight: 600;
        margin: 0;
        color: var(--text-color);
      }

      .stock-count {
        font-size: 0.8rem;
        color: var(--text-color-secondary);
      }
    }


    .header-right {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      flex-shrink: 0;

      .exec-time {
        font-size: 0.7rem;
        color: var(--text-color-secondary);
        font-family: monospace;
      }

      .export-btn {
        width: 2rem !important;
        height: 2rem !important;
      }
    }

    .stats-bar {
      display: flex;
      align-items: center;
      padding: 0.625rem 1.25rem;
      background: var(--surface-section);
      border-bottom: 1px solid var(--surface-border);
      gap: 1.5rem;
    }

    .exclusions-note {
      display: flex;
      align-items: center;
      gap: 0.4rem;
      padding: 0.35rem 1.25rem;
      background: var(--surface-ground);
      border-bottom: 1px solid var(--surface-border);
      font-size: 0.7rem;
      color: var(--text-color-secondary);
      
      i {
        font-size: 0.65rem;
        opacity: 0.7;
      }
    }

    .stat {
      display: flex;
      flex-direction: column;
      align-items: center;

      .stat-value {
        font-size: 0.95rem;
        font-weight: 600;
        color: var(--text-color);
        font-family: 'JetBrains Mono', monospace;
      }

      .stat-label {
        font-size: 0.65rem;
        text-transform: uppercase;
        letter-spacing: 0.04em;
        color: var(--text-color-secondary);
      }

      &.positive .stat-value {
        color: var(--stock-positive);
      }

      &.negative .stat-value {
        color: var(--stock-negative);
      }

      &.neutral .stat-value {
        color: var(--text-color-secondary);
      }
    }

    .stat-divider {
      width: 1px;
      height: 24px;
      background: var(--surface-border);
    }

    .state-container {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 4rem 2rem;
      gap: 0.75rem;

      i {
        font-size: 2.5rem;
        color: var(--surface-border);
      }

      .state-title {
        font-size: 1rem;
        font-weight: 500;
        color: var(--text-color);
      }

      .state-text {
        font-size: 0.85rem;
        color: var(--text-color-secondary);
      }

      &.error {
        i { color: var(--red-400); }
        .state-text { color: var(--red-400); }
      }

      &.empty i {
        color: var(--primary-color);
        opacity: 0.5;
      }
    }

    /* Compact Table Styles */
    .symbol-cell {
      display: flex;
      flex-direction: column;
      gap: 0.1rem;

      .ticker {
        font-weight: 600;
        color: var(--primary-color);
        font-size: 0.72rem;
      }

      .name {
        font-size: 0.6rem;
        color: var(--text-color-secondary);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
    }

    .clickable-row {
      cursor: pointer;
      transition: background-color 0.15s ease;

      &:hover {
        background-color: var(--surface-hover) !important;
      }
    }

    .price-value {
      font-weight: 500;
      font-family: 'JetBrains Mono', monospace;
      font-size: 0.7rem;
    }

    .change-value {
      font-family: 'JetBrains Mono', monospace;
      font-size: 0.65rem;
      font-weight: 500;

      &.up { color: var(--stock-positive); }
      &.down { color: var(--stock-negative); }
    }

    .cap-value, .vol-value {
      font-family: 'JetBrains Mono', monospace;
      font-size: 0.65rem;
    }


    .muted {
      color: var(--text-color-secondary);
    }

    .sector-badge {
      display: inline-block;
      font-size: 0.6rem;
      padding: 0.15rem 0.35rem;
      border-radius: 3px;
      background: var(--surface-hover);
      color: var(--text-color-secondary);
      text-transform: uppercase;
      letter-spacing: 0.01em;
      font-weight: 500;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      max-width: 100%;
    }

    .text-right { text-align: right; }
    .text-center { text-align: center; }

    :host ::ng-deep {
      .compact-table {
        .p-datatable-wrapper {
          overflow-x: hidden;
        }
        
        .p-datatable-table {
          width: 100%;
          table-layout: fixed;
        }
        
        .p-datatable-thead > tr > th {
          background: var(--surface-ground);
          padding: 0.5rem 0.3rem;
          font-size: 0.62rem;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.02em;
          color: var(--text-color-secondary);
          border-bottom: 1px solid var(--surface-border);
          overflow: hidden;
        }

        .p-datatable-tbody > tr {
          transition: background 0.1s ease;

          &:hover {
            background: var(--surface-hover);
          }

          > td {
            padding: 0.4rem 0.3rem;
            font-size: 0.72rem;
            border-bottom: 1px solid var(--surface-border);
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
          }
        }

        .p-paginator {
          background: var(--surface-ground);
          border: none;
          border-top: 1px solid var(--surface-border);
          padding: 0.5rem 1rem;
          font-size: 0.75rem;

          .p-paginator-current {
            font-size: 0.75rem;
            color: var(--text-color-secondary);
          }
        }

        .p-sortable-column-icon {
          font-size: 0.65rem;
          margin-left: 0.25rem;
        }
      }
    }

    /* Column widths - Optimized to fit without horizontal scroll */
    .col-symbol { width: 85px; max-width: 85px; }
    .col-price { width: 65px; max-width: 65px; }
    .col-change { width: 55px; max-width: 55px; }
    .col-cap { width: 70px; max-width: 70px; }
    .col-pe { width: 40px; max-width: 40px; }
    .col-fpe { width: 50px; max-width: 50px; }
    .col-range { width: 115px; max-width: 115px; }
    
    .range-value {
      font-size: 0.65rem;
      color: var(--text-color-secondary);
      font-family: 'JetBrains Mono', monospace;
    }
    .col-vol { width: 60px; max-width: 60px; }
    .col-rsi { width: 38px; max-width: 38px; }
    .col-macd { width: 45px; max-width: 45px; }
    .col-sector { width: 115px; max-width: 115px; }
    .col-industry { width: 135px; max-width: 135px; }

    .header-with-filter {
      display: flex;
      flex-direction: column;
      gap: 0.25rem;
      
      .header-label {
        display: flex;
        align-items: center;
        gap: 0.25rem;
        cursor: pointer;
      }
    }

    :host ::ng-deep .column-filter {
      width: 100%;
      max-width: 100%;
      
      .p-multiselect {
        width: 100%;
        max-width: 100%;
        min-width: 0;
        background: var(--surface-card);
        border: 1px solid var(--surface-border);
        border-radius: 3px;
        
        .p-multiselect-label {
          padding: 0.15rem 0.3rem;
          font-size: 0.6rem;
          color: var(--text-color-secondary);
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        
        .p-multiselect-trigger {
          width: 1.1rem;
          
          .p-multiselect-trigger-icon {
            font-size: 0.5rem;
          }
        }
      }
      
      .p-multiselect:not(.p-disabled):hover {
        border-color: var(--primary-color);
      }
      
      .p-multiselect:not(.p-disabled).p-focus {
        border-color: var(--primary-color);
        box-shadow: none;
      }
    }

    .industry-text {
      font-size: 0.65rem;
      color: var(--text-color-secondary);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      display: block;
    }

    /* Technical filter styles */
    .tech-filters {
      display: flex;
      align-items: center;
      gap: 0.375rem;
    }

    .tech-label {
      font-size: 0.7rem;
      color: var(--text-color-secondary);
      font-weight: 500;
    }

    .tech-chip {
      padding: 0.2rem 0.5rem;
      font-size: 0.65rem;
      font-weight: 500;
      border: 1px solid var(--surface-border);
      border-radius: 4px;
      background: var(--surface-ground);
      color: var(--text-color-secondary);
      cursor: pointer;
      transition: all 0.15s ease;

      &:hover {
        background: var(--surface-hover);
        border-color: var(--primary-color);
      }

      &.active {
        background: var(--primary-color);
        border-color: var(--primary-color);
        color: var(--primary-color-text);
      }
    }

    .clear-tech-btn {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 20px;
      height: 20px;
      padding: 0;
      margin-left: 0.25rem;
      border: none;
      border-radius: 50%;
      background: var(--surface-border);
      color: var(--text-color-secondary);
      cursor: pointer;
      font-size: 0.6rem;

      &:hover {
        background: var(--red-500);
        color: white;
      }
    }

    .tech-loading {
      display: flex;
      align-items: center;
      gap: 0.375rem;
      margin-left: 0.5rem;
      font-size: 0.7rem;
      color: var(--primary-color);

      i {
        font-size: 0.8rem;
      }
    }

    /* RSI/MACD cell styles */
    .rsi-value {
      font-weight: 500;

      &.oversold {
        color: var(--green-400);
      }

      &.overbought {
        color: var(--red-400);
      }
    }

    .macd-value {
      font-weight: 500;

      &.positive {
        color: var(--green-400);
      }

      &.negative {
        color: var(--red-400);
      }
    }

    @media (max-width: 1200px) {
      .stats-bar {
        flex-wrap: wrap;
        gap: 1rem;
      }

      .stat-divider {
        display: none;
      }
    }
  `]
})
export class ResultsTableComponent {
  private http = inject(HttpClient);
  private router = inject(Router);
  screenerService = inject(ScreenerService);
  marketService = inject(MarketService);

  // Output event to toggle filters panel
  // toggleFilters output removed - filters are always visible above the table

  summary = this.screenerService.getResultsSummary;

  // Column filters
  selectedSectors: string[] = [];
  selectedIndustries: string[] = [];

  // Computed options for dropdowns based on cached stocks
  sectorOptions = computed(() => {
    const stocks = this.screenerService.getCachedStocks();
    const sectors = [...new Set(stocks.map(s => s.sector).filter(s => s && s !== 'Unknown'))].sort();
    return sectors.map(s => ({ label: s, value: s }));
  });

  industryOptions = computed(() => {
    const stocks = this.screenerService.getCachedStocks();
    // If sectors are selected, only show industries from those sectors
    let filteredStocks = stocks;
    if (this.selectedSectors.length > 0) {
      filteredStocks = stocks.filter(s => this.selectedSectors.includes(s.sector));
    }
    const industries = [...new Set(filteredStocks.map(s => s.industry).filter(i => i && i !== 'Unknown'))].sort();
    return industries.map(i => ({ label: i, value: i }));
  });
  
  // Search functionality
  searchQuery: Stock | string = '';
  filteredStocks = signal<Stock[]>([]);
  selectedStock = signal<Stock | null>(null);
  searchLoading = signal<boolean>(false);
  
  // Technical filters - bound to service
  rsiFilter = this.screenerService.rsiFilter;
  macdFilter = this.screenerService.macdFilter;
  calculatingTechnicals = this.screenerService.calculatingTechnicals;
  technicalProgress = this.screenerService.technicalProgress;

  formatPrice(price: number, market: Market): string {
    return this.marketService.formatCurrency(price, market);
  }

  // Technical filter methods
  toggleRsiFilter(zone: 'oversold' | 'overbought'): void {
    this.screenerService.toggleRsiFilter(zone);
  }

  toggleMacdFilter(signal: 'bullish' | 'bearish'): void {
    this.screenerService.toggleMacdFilter(signal);
  }

  clearTechFilters(): void {
    this.screenerService.clearTechnicalFilters();
  }

  // Column filter handlers
  onSectorFilterChange(): void {
    this.screenerService.setSectorFilter(this.selectedSectors);
    // Reset industry filter when sector changes (industries depend on sectors)
    this.selectedIndustries = [];
    this.screenerService.setIndustryFilter([]);
  }

  onIndustryFilterChange(): void {
    this.screenerService.setIndustryFilter(this.selectedIndustries);
  }

  openStockDetail(symbol: string): void {
    this.router.navigate(['/stock', symbol]);
  }

  /**
   * Search stocks by symbol or name - searches cache first, then API
   * Results are sorted by market cap (largest first)
   */
  searchStocks(event: AutoCompleteCompleteEvent): void {
    const query = event.query.trim();
    const queryLower = query.toLowerCase();
    const allStocks = this.screenerService.getAllCachedStocks();
    
    // Helper to sort by market cap descending
    const sortByMarketCap = (stocks: Stock[]) => 
      [...stocks].sort((a, b) => (b.marketCap || 0) - (a.marketCap || 0));
    
    // Search in cached stocks first
    const filtered = sortByMarketCap(
      allStocks.filter(stock => 
        stock.symbol.toLowerCase().includes(queryLower) || 
        stock.name.toLowerCase().includes(queryLower)
      )
    ).slice(0, 30);
    
    this.filteredStocks.set(filtered);
    
    // If cache is empty or no matches found, search via API with fuzzy search
    const shouldSearchApi = allStocks.length === 0 || filtered.length === 0;
    
    if (shouldSearchApi && query.length >= 2) {
      this.searchLoading.set(true);
      // Use fuzzy=true to search by name/description
      this.http.get<{ stocks: Stock[] }>(`/api/stocks/search?q=${encodeURIComponent(query)}&fuzzy=true`).subscribe({
        next: (result) => {
          if (result.stocks && result.stocks.length > 0) {
            // Merge API results with cache results, avoiding duplicates
            const existingSymbols = new Set(filtered.map(s => s.symbol));
            const newStocks = result.stocks.filter(s => !existingSymbols.has(s.symbol));
            // Sort combined results by market cap
            const combined = sortByMarketCap([...newStocks, ...filtered]).slice(0, 30);
            this.filteredStocks.set(combined);
          }
          this.searchLoading.set(false);
        },
        error: () => {
          this.searchLoading.set(false);
        }
      });
    } else if (query.length >= 2 && query.length <= 6 && /^[a-z]+$/i.test(query)) {
      // If query looks like a symbol and not found in cache, try exact match
      const symbolInCache = allStocks.some(s => s.symbol.toLowerCase() === queryLower);
      
      if (!symbolInCache) {
        this.searchLoading.set(true);
        this.http.get<{ stocks: Stock[] }>(`/api/stocks/search?q=${query.toUpperCase()}`).subscribe({
          next: (result) => {
            if (result.stocks && result.stocks.length > 0) {
              const existingSymbols = new Set(filtered.map(s => s.symbol));
              const newStocks = result.stocks.filter(s => !existingSymbols.has(s.symbol));
              const combined = sortByMarketCap([...newStocks, ...filtered]).slice(0, 30);
              this.filteredStocks.set(combined);
            }
            this.searchLoading.set(false);
          },
          error: () => {
            this.searchLoading.set(false);
          }
        });
      }
    }
  }

  /**
   * Handle ngModel change - detect when a stock object is selected
   */
  onSearchChange(value: any): void {
    if (value && typeof value === 'object' && value.symbol) {
      this.handleStockSelection(value as Stock);
    }
  }

  /**
   * Handle click on autocomplete item
   */
  onItemClick(stock: Stock): void {
    this.handleStockSelection(stock);
  }

  /**
   * Handle stock selection from autocomplete
   */
  onStockSelect(event: AutoCompleteSelectEvent): void {
    const stock = event.value as Stock;
    if (!stock || !stock.symbol) {
      return;
    }
    this.handleStockSelection(stock);
  }

  /**
   * Common handler for stock selection
   */
  private handleStockSelection(stock: Stock): void {
    this.selectedStock.set(stock);
    this.screenerService.showSearchedStock(stock);
    
    // Clear search after selection
    setTimeout(() => {
      this.searchQuery = '';
    }, 200);
  }

  /**
   * Sort stocks matching service logic for accurate page calculation
   */
  private sortStocksLikeService(stocks: Stock[]): Stock[] {
    const sort = this.screenerService.sort();
    return [...stocks].sort((a, b) => {
      let aVal = (a as any)[sort.field];
      let bVal = (b as any)[sort.field];
      if (aVal == null) return 1;
      if (bVal == null) return -1;
      if (typeof aVal === 'string') {
        return sort.direction === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
      }
      return sort.direction === 'asc' ? aVal - bVal : bVal - aVal;
    });
  }

  onLazyLoad(event: any): void {
    // Only process if we have data loaded
    if (this.screenerService.totalCount() === 0) {
      return;
    }
    
    // Handle sorting if sort field changed
    if (event.sortField) {
      const newSort: SortConfig = {
        field: event.sortField,
        direction: event.sortOrder === 1 ? 'asc' : 'desc'
      };
      const currentSort = this.screenerService.sort();
      
      // Only update sort if it changed
      if (currentSort.field !== newSort.field || currentSort.direction !== newSort.direction) {
        this.screenerService.setSort(newSort);
        return; // setSort will handle pagination reset
      }
    }
    
    // Handle pagination
    const page = Math.floor(event.first / event.rows);
    this.screenerService.setPagination(page, event.rows);
  }

  onSort(event: any): void {
    const sort: SortConfig = {
      field: event.field,
      direction: event.order === 1 ? 'asc' : 'desc'
    };
    this.screenerService.setSort(sort);
  }

  getSectorSeverity(sector: string): 'success' | 'info' | 'warn' | 'danger' | 'secondary' | 'contrast' | undefined {
    const sectorColors: Record<string, 'success' | 'info' | 'warn' | 'danger' | 'secondary'> = {
      'Technology': 'info',
      'Healthcare': 'success',
      'Financial Services': 'warn',
      'Consumer Cyclical': 'secondary',
      'Consumer Defensive': 'secondary',
      'Industrials': 'secondary',
      'Energy': 'danger',
      'Basic Materials': 'warn',
      'Real Estate': 'info',
      'Utilities': 'success',
      'Communication Services': 'info'
    };
    return sectorColors[sector] || 'secondary';
  }

  getSectorShortName(sector: string): string {
    const shortNames: Record<string, string> = {
      'Technology': 'Tech',
      'Healthcare': 'Health',
      'Financial Services': 'Finance',
      'Consumer Cyclical': 'Cons Cyc',
      'Consumer Defensive': 'Cons Def',
      'Industrials': 'Industrial',
      'Energy': 'Energy',
      'Basic Materials': 'Materials',
      'Real Estate': 'Real Est',
      'Utilities': 'Utilities',
      'Communication Services': 'Comm'
    };
    return shortNames[sector] || sector.slice(0, 8);
  }
}
