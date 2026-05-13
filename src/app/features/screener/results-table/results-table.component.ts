import { ChangeDetectionStrategy, Component, inject, computed, signal } from '@angular/core';
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
  changeDetection: ChangeDetectionStrategy.OnPush,
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
      <!-- Summary Stats -->
      @if (screenerService.results().length === 0) {
        <div class="stats-bar results-placeholder-bar">
          <div class="results-line-title">
            <h2>Results</h2>
            <span>Awaiting screen</span>
          </div>
          <div class="stats-spacer"></div>
          <div class="result-tools">
            <button
              pButton
              type="button"
              icon="pi pi-download"
              class="p-button-text p-button-sm export-btn"
              pTooltip="Export to CSV"
              tooltipPosition="left"
              disabled>
            </button>
          </div>
        </div>
      } @else {
        @if (summary(); as stats) {
          <div class="stats-bar">
            <div class="results-line-title">
              <h2>{{ quickViewTitle() }}</h2>
              <span>{{ screenerService.totalCount() | number }} stocks</span>
            </div>
            <div class="stat-divider"></div>
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
            <div class="stats-spacer"></div>
            <div class="result-tools">
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
          scrollDirection="both"
          [showCurrentPageReport]="true"
          currentPageReportTemplate="{first}–{last} of {totalRecords}"
          [sortField]="screenerService.sort().field"
          [sortOrder]="screenerService.sort().direction === 'asc' ? 1 : -1"
          scrollHeight="calc(100vh - 180px)"
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
              @if (screenerService.showPerformanceColumns()) {
                <th pSortableColumn="oneMonthChangePercent" class="col-period text-right">
                  1M <p-sortIcon field="oneMonthChangePercent"></p-sortIcon>
                </th>
                <th pSortableColumn="threeMonthChangePercent" class="col-period text-right">
                  3M <p-sortIcon field="threeMonthChangePercent"></p-sortIcon>
                </th>
                <th pSortableColumn="sixMonthChangePercent" class="col-period text-right">
                  6M <p-sortIcon field="sixMonthChangePercent"></p-sortIcon>
                </th>
                <th pSortableColumn="oneYearChangePercent" class="col-period text-right">
                  1Y <p-sortIcon field="oneYearChangePercent"></p-sortIcon>
                </th>
              }
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
              <th class="col-earnings text-center">
                Earnings
              </th>
              <th pSortableColumn="targetMeanPrice" class="col-target text-right">
                Target <p-sortIcon field="targetMeanPrice"></p-sortIcon>
              </th>
              <th pSortableColumn="heldPercentInstitutions" class="col-inst text-right">
                Inst. % <p-sortIcon field="heldPercentInstitutions"></p-sortIcon>
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

              @if (screenerService.showPerformanceColumns()) {
                <td class="col-period text-right">
                  <span class="period-value"
                        [class.positive]="stock.oneMonthChangePercent != null && stock.oneMonthChangePercent >= 0"
                        [class.negative]="stock.oneMonthChangePercent != null && stock.oneMonthChangePercent < 0"
                        [class.muted]="stock.oneMonthChangePercent == null">
                    {{ formatPeriodChange(stock.oneMonthChangePercent) }}
                  </span>
                </td>
                <td class="col-period text-right">
                  <span class="period-value"
                        [class.positive]="stock.threeMonthChangePercent != null && stock.threeMonthChangePercent >= 0"
                        [class.negative]="stock.threeMonthChangePercent != null && stock.threeMonthChangePercent < 0"
                        [class.muted]="stock.threeMonthChangePercent == null">
                    {{ formatPeriodChange(stock.threeMonthChangePercent) }}
                  </span>
                </td>
                <td class="col-period text-right">
                  <span class="period-value"
                        [class.positive]="stock.sixMonthChangePercent != null && stock.sixMonthChangePercent >= 0"
                        [class.negative]="stock.sixMonthChangePercent != null && stock.sixMonthChangePercent < 0"
                        [class.muted]="stock.sixMonthChangePercent == null">
                    {{ formatPeriodChange(stock.sixMonthChangePercent) }}
                  </span>
                </td>
                <td class="col-period text-right">
                  <span class="period-value"
                        [class.positive]="stock.oneYearChangePercent != null && stock.oneYearChangePercent >= 0"
                        [class.negative]="stock.oneYearChangePercent != null && stock.oneYearChangePercent < 0"
                        [class.muted]="stock.oneYearChangePercent == null">
                    {{ formatPeriodChange(stock.oneYearChangePercent) }}
                  </span>
                </td>
              }
              
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
              
              <!-- Earnings -->
              <td class="col-earnings text-center">
                @if (stock.earningsTimestamp) {
                  <span class="earnings-text">{{ formatEarnings(stock.earningsTimestamp) }}</span>
                } @else {
                  <span class="muted">—</span>
                }
              </td>

              <!-- Analyst Target -->
              <td class="col-target text-right">
                @if (stock.targetMeanPrice) {
                  <span class="target-text">
                    {{ marketService.formatCurrency(stock.targetMeanPrice, stock.market) }}
                    <span class="target-pct" [class.positive]="stock.targetMeanPrice > stock.price" [class.negative]="stock.targetMeanPrice < stock.price">
                      {{ stock.targetMeanPrice > stock.price ? '+' : '' }}{{ ((stock.targetMeanPrice - stock.price) / stock.price * 100) | number:'1.0-0' }}%
                    </span>
                  </span>
                } @else {
                  <span class="muted">—</span>
                }
              </td>

              <!-- Institutional % -->
              <td class="col-inst text-right">
                @if (stock.heldPercentInstitutions != null) {
                  <span>{{ (stock.heldPercentInstitutions * 100) | number:'1.0-0' }}%</span>
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
              <td [attr.colspan]="screenerService.showPerformanceColumns() ? 19 : 15" class="text-center p-4">No stocks match your criteria.</td>
            </tr>
          </ng-template>
        </p-table>
      }
    </div>
  `,
  styles: [`
    .results-container {
      position: relative;
      background:
        linear-gradient(180deg, rgba(15, 23, 42, 0.9), rgba(15, 23, 42, 0.72)),
        var(--surface-card);
      border: 1px solid rgba(148, 163, 184, 0.14);
      border-radius: 20px;
      overflow: hidden;
      box-shadow: 0 24px 70px rgba(2, 6, 23, 0.24);
    }

    .stats-bar {
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      padding: 0.52rem 0.78rem;
      background:
        linear-gradient(90deg, rgba(56, 189, 248, 0.1), rgba(15, 23, 42, 0.46) 34%, rgba(15, 23, 42, 0.32)),
        rgba(2, 6, 23, 0.34);
      border-top: 1px solid rgba(56, 189, 248, 0.16);
      border-bottom: 1px solid rgba(56, 189, 248, 0.18);
      gap: 0.52rem;
      box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.035), 0 10px 24px rgba(2, 6, 23, 0.18);
    }

    .results-placeholder-bar {
      min-height: 2.75rem;

      .results-line-title span {
        color: #94a3b8;
      }

      .export-btn {
        opacity: 0.45;
      }
    }

    .results-line-title {
      display: inline-flex;
      align-items: baseline;
      gap: 0.42rem;
      min-width: 0;
    }

    .results-line-title h2 {
      margin: 0;
      color: #f8fafc;
      font-size: 0.86rem;
      font-weight: 900;
      letter-spacing: -0.01em;
      white-space: nowrap;
    }

    .results-line-title span {
      color: #7dd3fc;
      font-size: 0.68rem;
      font-weight: 800;
      white-space: nowrap;
    }

    .stats-spacer {
      flex: 1 1 auto;
      min-width: 0.5rem;
    }

    .result-tools {
      display: inline-flex;
      align-items: center;
      gap: 0.35rem;
      margin-left: auto;
    }

    .result-tools .exec-time {
      padding: 0.18rem 0.42rem;
      border-radius: 999px;
      background: rgba(15, 23, 42, 0.68);
      color: #94a3b8;
      font-family: inherit;
      font-size: 0.62rem;
      font-weight: 700;
    }

    .result-tools .export-btn {
      width: 1.6rem !important;
      height: 1.6rem !important;
      border: 1px solid rgba(148, 163, 184, 0.18) !important;
      border-radius: 999px !important;
      color: #7dd3fc !important;
    }

    .stat {
      display: flex;
      flex-direction: column;
      align-items: center;
      min-width: 3.2rem;

      .stat-value {
        font-size: 0.8rem;
        font-weight: 900;
        color: #e2e8f0;
        font-family: inherit;
      }

      .stat-label {
        font-size: 0.58rem;
        text-transform: uppercase;
        letter-spacing: 0.04em;
        color: #64748b;
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
      height: 22px;
      background: rgba(125, 211, 252, 0.18);
    }

    .state-container {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      min-height: 20rem;
      padding: 4rem 2rem;
      gap: 0.75rem;
      background:
        radial-gradient(circle at 50% 16%, rgba(56, 189, 248, 0.08), transparent 34%),
        rgba(2, 6, 23, 0.12);

      i {
        font-size: 2.5rem;
        color: rgba(125, 211, 252, 0.55);
      }

      .state-title {
        font-size: 1rem;
        font-weight: 900;
        color: #e2e8f0;
      }

      .state-text {
        font-size: 0.85rem;
        color: #94a3b8;
      }

      &.error {
        i { color: var(--red-400); }
        .state-text { color: var(--red-400); }
      }

      &.empty i {
        color: #38bdf8;
        opacity: 0.7;
      }
    }

    /* Compact Table Styles */
    .symbol-cell {
      display: flex;
      flex-direction: column;
      gap: 0.1rem;

      .ticker {
        font-weight: 900;
        color: #7dd3fc;
        font-size: 0.74rem;
        letter-spacing: 0.02em;
      }

      .name {
        font-size: 0.6rem;
        color: #94a3b8;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
    }

    .clickable-row {
      cursor: pointer;
      transition: background-color 0.15s ease, box-shadow 0.15s ease;

      &:hover {
        background-color: rgba(14, 165, 233, 0.08) !important;
        box-shadow: inset 3px 0 0 rgba(56, 189, 248, 0.55);
      }
    }

    .price-value {
      font-weight: 800;
      font-family: inherit;
      font-size: 0.72rem;
      color: #e2e8f0;
    }

    .change-value {
      font-family: inherit;
      font-size: 0.65rem;
      font-weight: 900;

      &.up { color: var(--stock-positive); }
      &.down { color: var(--stock-negative); }
    }

    .period-value {
      font-family: inherit;
      font-size: 0.65rem;
      font-weight: 900;

      &.positive { color: var(--stock-positive); }
      &.negative { color: var(--stock-negative); }
    }

    .cap-value, .vol-value {
      font-family: inherit;
      font-size: 0.65rem;
      color: #cbd5e1;
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
      color: #cbd5e1;
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
          overflow-x: auto;
          background: rgba(2, 6, 23, 0.18);
        }
        
        .p-datatable-table {
          width: 100%;
          min-width: 1240px;
          table-layout: fixed;
        }
        
        .p-datatable-thead > tr > th {
          position: sticky;
          top: 0;
          z-index: 2;
          background: #0f172a;
          padding: 0.46rem 0.34rem;
          font-size: 0.62rem;
          font-weight: 900;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          color: #94a3b8;
          border-bottom: 1px solid rgba(56, 189, 248, 0.18);
          overflow: hidden;
        }

        .p-sortable-column:not(.p-highlight):hover {
          background: #162033;
          color: #e0f2fe;
        }

        .p-datatable-tbody > tr {
          background: rgba(15, 23, 42, 0.24);
          transition: background 0.1s ease;

          &:hover {
            background: rgba(14, 165, 233, 0.08);
          }

          > td {
            padding: 0.4rem 0.34rem;
            font-size: 0.72rem;
            border-bottom: 1px solid rgba(148, 163, 184, 0.08);
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
            color: #cbd5e1;
          }
        }

        .p-paginator {
          background: rgba(2, 6, 23, 0.42);
          border: none;
          border-top: 1px solid rgba(148, 163, 184, 0.12);
          padding: 0.38rem 0.75rem;
          font-size: 0.75rem;

          .p-paginator-current {
            font-size: 0.75rem;
            color: #94a3b8;
          }
        }

        .p-sortable-column-icon {
          font-size: 0.65rem;
          margin-left: 0.25rem;
        }

        .col-symbol {
          position: sticky;
          left: 0;
          z-index: 1;
          background: #0f172a;
          box-shadow: 1px 0 0 rgba(148, 163, 184, 0.12);
        }

        .p-datatable-tbody .col-symbol {
          background: #111c2d;
        }
      }
    }

    /* Column widths - Optimized to fit without horizontal scroll */
    .col-symbol { width: 85px; max-width: 85px; }
    .col-price { width: 65px; max-width: 65px; }
    .col-change { width: 55px; max-width: 55px; }
    .col-period { width: 48px; max-width: 48px; }
    .col-cap { width: 70px; max-width: 70px; }
    .col-pe { width: 40px; max-width: 40px; }
    .col-fpe { width: 50px; max-width: 50px; }
    .col-range { width: 115px; max-width: 115px; }
    
    .range-value {
      font-size: 0.65rem;
      color: #94a3b8;
      font-family: inherit;
    }
    .col-vol { width: 60px; max-width: 60px; }
    .col-rsi { width: 38px; max-width: 38px; }
    .col-macd { width: 45px; max-width: 45px; }
    .col-earnings { width: 80px; max-width: 80px; }
    .col-target { width: 110px; max-width: 110px; }
    .col-inst { width: 65px; max-width: 65px; }
    .col-sector { width: 115px; max-width: 115px; }
    .col-industry { width: 135px; max-width: 135px; }

    .earnings-text { font-size: 0.75rem; color: #94a3b8; }
    .target-text { font-size: 0.78rem; }
    .target-pct { font-size: 0.7rem; margin-left: 2px; }
    .target-pct.positive { color: var(--green-500, #10b981); }
    .target-pct.negative { color: var(--red-500, #ef4444); }
    .muted { color: #64748b; opacity: 0.68; }

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
      color: #94a3b8;
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
      color: #94a3b8;
      font-weight: 800;
    }

    .tech-chip {
      padding: 0.2rem 0.5rem;
      font-size: 0.65rem;
      font-weight: 800;
      border: 1px solid rgba(148, 163, 184, 0.16);
      border-radius: 999px;
      background: rgba(2, 6, 23, 0.28);
      color: #94a3b8;
      cursor: pointer;
      transition: all 0.15s ease;

      &:hover {
        background: rgba(14, 165, 233, 0.1);
        border-color: rgba(56, 189, 248, 0.42);
      }

      &.active {
        background: rgba(14, 165, 233, 0.18);
        border-color: rgba(56, 189, 248, 0.58);
        color: #7dd3fc;
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

    /* Watchlists-aligned results table treatment. */
    .results-container {
      border-radius: 18px;
      border-color: rgba(148, 163, 184, 0.14);
      background: rgba(15, 23, 42, 0.56);
      box-shadow: none;
    }

    .stats-bar {
      padding: 0.65rem 0.8rem;
      background: rgba(2, 6, 23, 0.18);
      border-top: 0;
      border-bottom-color: rgba(148, 163, 184, 0.12);
      gap: 0.55rem;
      box-shadow: none;
    }

    .results-line-title h2 {
      font-size: 1.1rem;
      font-weight: 600;
      letter-spacing: 0;
    }

    .results-line-title span {
      color: #94a3b8;
      font-size: 0.75rem;
      font-weight: 700;
    }

    .result-tools .exec-time {
      background: rgba(15, 23, 42, 0.68);
      color: #94a3b8;
      font-family: inherit;
      font-variant-numeric: tabular-nums;
      font-size: 0.72rem;
    }

    .result-tools .export-btn {
      color: #93c5fd !important;
    }

    .stat .stat-value,
    .price-value,
    .change-value,
    .period-value,
    .cap-value,
    .vol-value,
    .range-value {
      font-family: inherit;
      font-variant-numeric: tabular-nums;
    }

    .stat .stat-value {
      font-size: 0.8rem;
      font-weight: 800;
      color: #f8fafc;
    }

    .stat .stat-label {
      font-size: 0.62rem;
      font-weight: 800;
      letter-spacing: 0.08em;
    }

    .stat-divider {
      background: rgba(148, 163, 184, 0.12);
    }

    .state-container {
      background: rgba(2, 6, 23, 0.12);
    }

    .state-container i {
      color: #38bdf8;
      opacity: 0.7;
    }

    .state-container .state-title {
      color: #f8fafc;
      font-weight: 700;
    }

    .symbol-cell .ticker {
      color: #f1f5f9;
      font-size: 0.76rem;
      font-weight: 800;
    }

    .symbol-cell .name {
      color: #94a3b8;
      font-size: 0.65rem;
    }

    .clickable-row:hover {
      background-color: rgba(59, 130, 246, 0.04) !important;
      box-shadow: none;
    }

    .sector-badge {
      border-radius: 999px;
      background: rgba(148, 163, 184, 0.14);
      color: #94a3b8;
      font-size: 0.62rem;
      font-weight: 800;
      letter-spacing: 0.05em;
    }

    :host ::ng-deep {
      .compact-table {
        .p-datatable-wrapper {
          background: transparent;
        }

        .p-datatable-thead > tr > th {
          padding: 0.65rem 0.8rem;
          color: #64748b;
          font-size: 0.68rem;
          font-weight: 900;
          letter-spacing: 0.08em;
          background: rgba(2, 6, 23, 0.18);
          border-bottom-color: rgba(148, 163, 184, 0.12);
          box-shadow: none;
        }

        .p-sortable-column:not(.p-highlight):hover {
          background: rgba(59, 130, 246, 0.08);
          color: #93c5fd;
        }

        .p-datatable-tbody > tr {
          background: transparent;

          &:hover {
            background: rgba(59, 130, 246, 0.04);
          }

          > td {
            padding: 0.62rem 0.8rem;
            font-size: 0.78rem;
            border-bottom-color: rgba(148, 163, 184, 0.08);
            color: #cbd5e1;
          }
        }

        .p-paginator {
          background: rgba(2, 6, 23, 0.18);
          border-top-color: rgba(148, 163, 184, 0.12);
        }

        .col-symbol {
          background: #0f172a;
          box-shadow: 1px 0 0 rgba(148, 163, 184, 0.12);
        }

        .p-datatable-tbody .col-symbol {
          background: #111827;
        }
      }
    }

    /* Exact Watchlists-style typography, applied last to replace remaining Screener terminal rules. */
    .results-container,
    .results-container button,
    .results-container input {
      font-family: inherit;
    }

    .results-container {
      border-radius: 18px;
      border-color: rgba(148, 163, 184, 0.14);
      background: rgba(15, 23, 42, 0.56);
      box-shadow: none;
    }

    .stats-bar {
      padding: 0.65rem 0.8rem;
      background: rgba(2, 6, 23, 0.18);
      border-top: 0;
      border-bottom-color: rgba(148, 163, 184, 0.12);
      box-shadow: none;
    }

    .results-line-title h2 {
      color: var(--text-color);
      font-size: 1.1rem;
      font-weight: 600;
      letter-spacing: 0;
    }

    .results-line-title span,
    .stock-count,
    .state-container .state-text {
      color: var(--text-color-secondary);
      font-size: 12px;
      font-weight: 400;
      letter-spacing: 0;
    }

    .result-tools .exec-time,
    .stat .stat-value,
    .price-value,
    .change-value,
    .period-value,
    .cap-value,
    .vol-value,
    .range-value {
      font-family: inherit;
      font-variant-numeric: tabular-nums;
    }

    .result-tools .exec-time {
      font-size: 12px;
      font-weight: 500;
    }

    .stat .stat-value {
      color: #f8fafc;
      font-size: 0.92rem;
      font-weight: 800;
    }

    .stat .stat-label {
      color: #94a3b8;
      font-size: 0.66rem;
      font-weight: 800;
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }

    .state-container {
      background: rgba(2, 6, 23, 0.12);
    }

    .state-container .state-title {
      color: var(--text-color);
      font-size: 1rem;
      font-weight: 700;
    }

    .symbol-cell .ticker {
      color: #f1f5f9;
      font-size: 12px;
      font-weight: 800;
      letter-spacing: 0.02em;
    }

    .symbol-cell .name {
      color: #94a3b8;
      font-size: 11px;
    }

    .price-value,
    .change-value,
    .period-value,
    .cap-value,
    .vol-value {
      font-size: 11.5px;
      font-weight: 500;
    }

    .sector-badge {
      border-radius: 999px;
      background: rgba(148, 163, 184, 0.14);
      color: #94a3b8;
      font-size: 10px;
      font-weight: 800;
      letter-spacing: 0.02em;
      text-transform: uppercase;
    }

    .industry-text {
      font-size: 11px;
    }

    :host ::ng-deep {
      .compact-table .p-datatable-thead > tr > th {
        padding: 0.65rem 0.8rem;
        color: #64748b;
        font-size: 0.68rem;
        font-weight: 900;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        white-space: nowrap;
        background: rgba(2, 6, 23, 0.18);
        border-bottom-color: rgba(148, 163, 184, 0.12);
        box-shadow: none;
      }

      .compact-table .p-sortable-column,
      .compact-table .p-sortable-column p-sorticon {
        white-space: nowrap;
      }

      .compact-table .p-sortable-column p-sorticon,
      .compact-table .p-sortable-column .p-sortable-column-icon {
        display: inline-flex;
        align-items: center;
        flex: 0 0 auto;
        margin-left: 0.25rem;
        vertical-align: middle;
      }

      .compact-table .p-datatable-tbody > tr {
        background: transparent;
      }

      .compact-table .p-datatable-tbody > tr:hover {
        background: rgba(56, 189, 248, 0.055);
      }

      .compact-table .p-datatable-tbody > tr > td {
        padding: 0.72rem 0.8rem;
        color: #cbd5e1;
        font-size: 0.86rem;
        border-bottom-color: rgba(148, 163, 184, 0.08);
      }

      .compact-table .p-paginator {
        background: rgba(2, 6, 23, 0.18);
        border-top-color: rgba(148, 163, 184, 0.12);
        font-size: 0.75rem;
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

    @media (max-width: 768px) {
      .stats-bar {
        align-items: stretch;
      }

      .stat {
        align-items: flex-start;
      }

      :host ::ng-deep .p-datatable-wrapper {
        overflow-x: auto !important;
        -webkit-overflow-scrolling: touch;
      }
      :host ::ng-deep .p-datatable table {
        min-width: 1120px;
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

  formatPeriodChange(value: number | null | undefined): string {
    if (value == null) {
      return '—';
    }
    return `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;
  }

  quickViewTitle(): string {
    switch (this.screenerService.activeQuickView()) {
      case 'raising-stocks':
        return 'Raising Stocks';
      case 'top-gainers':
        return `Top Gainers (${this.screenerService.getMoverPeriodLabel(this.screenerService.activeMoverPeriod())})`;
      case 'top-losers':
        return `Top Losers (${this.screenerService.getMoverPeriodLabel(this.screenerService.activeMoverPeriod())})`;
      default:
        return 'Results';
    }
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

  formatEarnings(timestamp: number): string {
    const d = new Date(timestamp * 1000);
    const now = new Date();
    const diffDays = Math.round((d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    if (diffDays >= 0 && diffDays <= 14) return `in ${diffDays}d`;
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
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
      this.http.get<{ stocks: Stock[] }>(`/api/stocks?action=search&q=${encodeURIComponent(query)}&fuzzy=true`).subscribe({
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
        this.http.get<{ stocks: Stock[] }>(`/api/stocks?action=search&q=${query.toUpperCase()}`).subscribe({
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
