import { Component, inject, computed, signal } from '@angular/core';
import { CommonModule, DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';

import { TableModule } from 'primeng/table';
import { ButtonModule } from 'primeng/button';
import { TooltipModule } from 'primeng/tooltip';
import { ProgressSpinnerModule } from 'primeng/progressspinner';

import { ScreenerService, MarketService } from '../../../core/services';
import { Stock } from '../../../core/models/stock.model';

@Component({
  selector: 'app-results-table-v2',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    TableModule,
    ButtonModule,
    TooltipModule,
    ProgressSpinnerModule,
    DecimalPipe
  ],
  template: `
    <div class="cyber-results">
      <!-- Summary Stats Panel -->
      @if (screenerService.results().length > 0) {
        <div class="stats-panel">
          <div class="stats-header">
            <span class="stats-icon">◈</span>
            <span class="stats-title">MARKET_ANALYSIS</span>
          </div>
          <div class="stats-grid">
            <div class="stat-cell">
              <span class="stat-label">TOTAL_MCAP</span>
              <span class="stat-value">{{ marketService.formatMarketCap(summary().totalMarketCap) }}</span>
            </div>
            <div class="stat-cell">
              <span class="stat-label">AVG_P/E</span>
              <span class="stat-value">{{ summary().avgPE !== null ? (summary().avgPE | number:'1.1-1') : '—' }}</span>
            </div>
            <div class="stat-cell positive">
              <span class="stat-label">GAINERS</span>
              <span class="stat-value">▲ {{ summary().gainers }}</span>
            </div>
            <div class="stat-cell negative">
              <span class="stat-label">LOSERS</span>
              <span class="stat-value">▼ {{ summary().losers }}</span>
            </div>
          </div>

          <!-- Quick Filters -->
          <div class="quick-filters">
            <span class="filter-label">> SIGNAL_FILTERS:</span>
            <div class="filter-buttons">
              <button 
                class="signal-btn" 
                [class.active]="rsiFilter() === 'oversold'"
                (click)="toggleRsiFilter('oversold')">
                <span class="signal-dot oversold"></span>
                RSI_LOW
              </button>
              <button 
                class="signal-btn" 
                [class.active]="rsiFilter() === 'overbought'"
                (click)="toggleRsiFilter('overbought')">
                <span class="signal-dot overbought"></span>
                RSI_HIGH
              </button>
              <button 
                class="signal-btn" 
                [class.active]="macdFilter() === 'bullish'"
                (click)="toggleMacdFilter('bullish')">
                <span class="signal-dot bullish"></span>
                MACD_BULL
              </button>
              <button 
                class="signal-btn" 
                [class.active]="macdFilter() === 'bearish'"
                (click)="toggleMacdFilter('bearish')">
                <span class="signal-dot bearish"></span>
                MACD_BEAR
              </button>
              @if (rsiFilter() || macdFilter()) {
                <button class="clear-btn" (click)="clearTechFilters()">[CLEAR]</button>
              }
            </div>
          </div>
        </div>
      }

      <!-- Loading State -->
      @if (screenerService.loading()) {
        <div class="state-container">
          <div class="cyber-loader">
            <div class="loader-ring"></div>
            <div class="loader-core"></div>
          </div>
          <span class="state-title">SCANNING_MARKETS...</span>
          <span class="state-text">Analyzing data streams across exchanges</span>
          <div class="progress-bar">
            <div class="progress-fill"></div>
          </div>
        </div>
      }

      <!-- Error State -->
      @if (screenerService.error(); as error) {
        <div class="state-container error">
          <span class="error-icon">⚠</span>
          <span class="state-title">ERROR_DETECTED</span>
          <span class="state-text">{{ error }}</span>
        </div>
      }

      <!-- Empty State -->
      @if (!screenerService.loading() && !screenerService.error() && screenerService.results().length === 0) {
        <div class="state-container empty">
          <div class="empty-icon">
            <span class="icon-bracket">[</span>
            <span class="icon-text">READY</span>
            <span class="icon-bracket">]</span>
          </div>
          <span class="state-title">AWAITING_PARAMETERS</span>
          <span class="state-text">Configure filters and execute screen to begin analysis</span>
        </div>
      }

      <!-- Results Table -->
      @if (!screenerService.loading() && screenerService.results().length > 0) {
        <div class="table-wrapper">
          <div class="table-header-bar">
            <span class="table-title">> DATA_STREAM [{{ screenerService.totalCount() | number }} RECORDS]</span>
            <span class="table-status">LIVE</span>
          </div>
          
          <div class="table-container">
            <table class="cyber-table">
              <thead>
                <tr>
                  <th class="col-symbol" (click)="sortBy('symbol')">
                    <span class="th-content">
                      <span>SYMBOL</span>
                      @if (currentSort().field === 'symbol') {
                        <span class="sort-indicator">{{ currentSort().direction === 'asc' ? '↑' : '↓' }}</span>
                      }
                    </span>
                  </th>
                  <th class="col-price" (click)="sortBy('price')">
                    <span class="th-content">
                      <span>PRICE</span>
                      @if (currentSort().field === 'price') {
                        <span class="sort-indicator">{{ currentSort().direction === 'asc' ? '↑' : '↓' }}</span>
                      }
                    </span>
                  </th>
                  <th class="col-change" (click)="sortBy('changePercent')">
                    <span class="th-content">
                      <span>CHANGE</span>
                      @if (currentSort().field === 'changePercent') {
                        <span class="sort-indicator">{{ currentSort().direction === 'asc' ? '↑' : '↓' }}</span>
                      }
                    </span>
                  </th>
                  <th class="col-cap" (click)="sortBy('marketCap')">
                    <span class="th-content">
                      <span>MCAP</span>
                      @if (currentSort().field === 'marketCap') {
                        <span class="sort-indicator">{{ currentSort().direction === 'asc' ? '↑' : '↓' }}</span>
                      }
                    </span>
                  </th>
                  <th class="col-pe" (click)="sortBy('peRatio')">
                    <span class="th-content">
                      <span>P/E</span>
                      @if (currentSort().field === 'peRatio') {
                        <span class="sort-indicator">{{ currentSort().direction === 'asc' ? '↑' : '↓' }}</span>
                      }
                    </span>
                  </th>
                  <th class="col-52w">
                    <span class="th-content">52W_RANGE</span>
                  </th>
                  <th class="col-rsi" (click)="sortBy('rsi')">
                    <span class="th-content">
                      <span>RSI</span>
                      @if (currentSort().field === 'rsi') {
                        <span class="sort-indicator">{{ currentSort().direction === 'asc' ? '↑' : '↓' }}</span>
                      }
                    </span>
                  </th>
                  <th class="col-macd">
                    <span class="th-content">MACD</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                @for (stock of paginatedResults(); track stock.symbol; let i = $index) {
                  <tr class="data-row" (click)="goToStock(stock.symbol)" [style.animation-delay]="(i * 0.02) + 's'">
                    <td class="col-symbol">
                      <div class="symbol-cell">
                        <span class="ticker">{{ stock.symbol }}</span>
                        <span class="name">{{ stock.name | slice:0:24 }}{{ stock.name.length > 24 ? '...' : '' }}</span>
                      </div>
                    </td>
                    <td class="col-price">
                      <span class="price-value">{{ marketService.formatCurrency(stock.price) }}</span>
                    </td>
                    <td class="col-change">
                      <span class="change-value" [class.positive]="stock.changePercent > 0" [class.negative]="stock.changePercent < 0">
                        {{ stock.changePercent > 0 ? '+' : '' }}{{ stock.changePercent | number:'1.2-2' }}%
                      </span>
                    </td>
                    <td class="col-cap">
                      <span class="cap-value">{{ marketService.formatMarketCap(stock.marketCap) }}</span>
                    </td>
                    <td class="col-pe">
                      <span class="pe-value" [class.na]="!stock.peRatio">
                        {{ stock.peRatio ? (stock.peRatio | number:'1.1-1') : '—' }}
                      </span>
                    </td>
                    <td class="col-52w">
                      <div class="range-cell">
                        <div class="range-bar">
                          <div class="range-track">
                            <div class="range-fill" [style.width.%]="getRangePosition(stock.price, stock.fiftyTwoWeekLow, stock.fiftyTwoWeekHigh)"></div>
                            <div class="range-marker" [style.left.%]="getRangePosition(stock.price, stock.fiftyTwoWeekLow, stock.fiftyTwoWeekHigh)"></div>
                          </div>
                        </div>
                        <div class="range-values">
                          <span>{{ marketService.formatCurrency(stock.fiftyTwoWeekLow) }}</span>
                          <span>{{ marketService.formatCurrency(stock.fiftyTwoWeekHigh) }}</span>
                        </div>
                      </div>
                    </td>
                    <td class="col-rsi">
                      @if (stock.rsi != null) {
                        <div class="rsi-cell">
                          <span class="rsi-value" [class.oversold]="stock.rsi < 30" [class.overbought]="stock.rsi > 70">
                            {{ stock.rsi | number:'1.0-0' }}
                          </span>
                          <div class="rsi-bar">
                            <div class="rsi-fill" [style.width.%]="stock.rsi" [class.oversold]="stock.rsi < 30" [class.overbought]="stock.rsi > 70"></div>
                          </div>
                        </div>
                      } @else {
                        <span class="na">—</span>
                      }
                    </td>
                    <td class="col-macd">
                      @if (stock.macdHistogram != null) {
                        <span class="macd-value" [class.positive]="stock.macdHistogram > 0" [class.negative]="stock.macdHistogram < 0">
                          {{ stock.macdHistogram > 0 ? '+' : '' }}{{ stock.macdHistogram | number:'1.2-2' }}
                        </span>
                      } @else {
                        <span class="na">—</span>
                      }
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>

          <!-- Pagination -->
          <div class="pagination-bar">
            <div class="page-info">
              <span class="info-label">DISPLAYING:</span>
              <span class="info-value">{{ (currentPage() - 1) * pageSize() + 1 }}-{{ Math.min(currentPage() * pageSize(), screenerService.totalCount()) }}</span>
              <span class="info-sep">/</span>
              <span class="info-total">{{ screenerService.totalCount() | number }}</span>
            </div>
            <div class="page-controls">
              <select class="page-size" [ngModel]="pageSize()" (ngModelChange)="setPageSize($event)">
                <option [value]="25">25</option>
                <option [value]="50">50</option>
                <option [value]="100">100</option>
              </select>
              <div class="page-nav">
                <button class="nav-btn" [disabled]="currentPage() === 1" (click)="goToPage(1)">««</button>
                <button class="nav-btn" [disabled]="currentPage() === 1" (click)="goToPage(currentPage() - 1)">«</button>
                @for (page of visiblePages(); track page) {
                  <button 
                    class="nav-btn page-num" 
                    [class.active]="page === currentPage()"
                    (click)="goToPage(page)">
                    {{ page }}
                  </button>
                }
                <button class="nav-btn" [disabled]="currentPage() === totalPages()" (click)="goToPage(currentPage() + 1)">»</button>
                <button class="nav-btn" [disabled]="currentPage() === totalPages()" (click)="goToPage(totalPages())">»»</button>
              </div>
            </div>
          </div>
        </div>
      }
    </div>
  `,
  styles: [`
    .cyber-results {
      margin-top: 1.5rem;
    }

    /* Stats Panel */
    .stats-panel {
      background: var(--cyber-bg-card);
      border: 1px solid var(--cyber-border);
      margin-bottom: 1rem;
      position: relative;
      overflow: hidden;

      &::before {
        content: '';
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        height: 1px;
        background: linear-gradient(90deg, transparent, var(--cyber-cyan), transparent);
      }
    }

    .stats-header {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.5rem 1rem;
      background: rgba(0, 255, 242, 0.03);
      border-bottom: 1px solid var(--cyber-border);
    }

    .stats-icon {
      color: var(--cyber-cyan);
      animation: cyber-flicker 3s infinite;
    }

    .stats-title {
      font-family: var(--cyber-font-display);
      font-size: 0.75rem;
      font-weight: 600;
      letter-spacing: 0.1em;
      color: var(--cyber-cyan);
    }

    .stats-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 1px;
      background: var(--cyber-border);
      padding: 1px;
    }

    .stat-cell {
      display: flex;
      flex-direction: column;
      gap: 0.25rem;
      padding: 0.75rem 1rem;
      background: var(--cyber-bg-card);
    }

    .stat-label {
      font-family: var(--cyber-font-mono);
      font-size: 0.6rem;
      color: var(--cyber-text-dim);
      letter-spacing: 0.05em;
    }

    .stat-value {
      font-family: var(--cyber-font-display);
      font-size: 1.1rem;
      font-weight: 600;
      color: var(--cyber-cyan);
      text-shadow: 0 0 10px var(--cyber-cyan-glow);
    }

    .stat-cell.positive .stat-value {
      color: var(--cyber-positive);
      text-shadow: 0 0 10px rgba(0, 255, 136, 0.5);
    }

    .stat-cell.negative .stat-value {
      color: var(--cyber-negative);
      text-shadow: 0 0 10px rgba(255, 51, 102, 0.5);
    }

    /* Quick Filters */
    .quick-filters {
      display: flex;
      align-items: center;
      gap: 1rem;
      padding: 0.75rem 1rem;
      border-top: 1px solid var(--cyber-border);
    }

    .filter-label {
      font-family: var(--cyber-font-mono);
      font-size: 0.7rem;
      color: var(--cyber-cyan);
    }

    .filter-buttons {
      display: flex;
      flex-wrap: wrap;
      gap: 0.5rem;
    }

    .signal-btn {
      display: inline-flex;
      align-items: center;
      gap: 0.35rem;
      padding: 0.35rem 0.6rem;
      border: 1px solid var(--cyber-border);
      background: transparent;
      color: var(--cyber-text-dim);
      font-family: var(--cyber-font-mono);
      font-size: 0.65rem;
      cursor: pointer;
      transition: all 0.2s ease;

      &:hover {
        border-color: var(--cyber-cyan);
        color: var(--cyber-cyan);
      }

      &.active {
        border-color: var(--cyber-cyan);
        background: var(--cyber-cyan-dim);
        color: var(--cyber-cyan);
        box-shadow: 0 0 10px var(--cyber-cyan-dim);
      }
    }

    .signal-dot {
      width: 6px;
      height: 6px;

      &.oversold { background: var(--cyber-positive); box-shadow: 0 0 5px var(--cyber-positive); }
      &.overbought { background: var(--cyber-negative); box-shadow: 0 0 5px var(--cyber-negative); }
      &.bullish { background: var(--cyber-positive); box-shadow: 0 0 5px var(--cyber-positive); }
      &.bearish { background: var(--cyber-negative); box-shadow: 0 0 5px var(--cyber-negative); }
    }

    .clear-btn {
      padding: 0.35rem 0.5rem;
      border: none;
      background: transparent;
      color: var(--cyber-text-dim);
      font-family: var(--cyber-font-mono);
      font-size: 0.6rem;
      cursor: pointer;

      &:hover {
        color: var(--cyber-negative);
      }
    }

    /* State Containers */
    .state-container {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 4rem 2rem;
      background: var(--cyber-bg-card);
      border: 1px solid var(--cyber-border);
      text-align: center;
    }

    .cyber-loader {
      position: relative;
      width: 60px;
      height: 60px;
      margin-bottom: 1.5rem;
    }

    .loader-ring {
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      border: 2px solid transparent;
      border-top-color: var(--cyber-cyan);
      border-radius: 50%;
      animation: spin 1s linear infinite;
    }

    .loader-core {
      position: absolute;
      top: 50%;
      left: 50%;
      width: 20px;
      height: 20px;
      background: var(--cyber-cyan);
      transform: translate(-50%, -50%);
      animation: cyber-glow-pulse 1s ease-in-out infinite;
    }

    .state-title {
      font-family: var(--cyber-font-display);
      font-size: 1.25rem;
      font-weight: 600;
      color: var(--cyber-cyan);
      margin-bottom: 0.5rem;
      letter-spacing: 0.1em;
      text-shadow: 0 0 10px var(--cyber-cyan-glow);
    }

    .state-text {
      font-family: var(--cyber-font-mono);
      font-size: 0.8rem;
      color: var(--cyber-text-dim);
    }

    .progress-bar {
      width: 200px;
      height: 3px;
      background: var(--cyber-border);
      margin-top: 1rem;
      overflow: hidden;
    }

    .progress-fill {
      height: 100%;
      width: 30%;
      background: var(--cyber-cyan);
      box-shadow: 0 0 10px var(--cyber-cyan);
      animation: progress-slide 1.5s ease-in-out infinite;
    }

    @keyframes progress-slide {
      0% { transform: translateX(-100%); }
      100% { transform: translateX(400%); }
    }

    .state-container.error {
      .state-title { color: var(--cyber-negative); text-shadow: 0 0 10px rgba(255, 51, 102, 0.5); }
    }

    .error-icon {
      font-size: 2.5rem;
      color: var(--cyber-negative);
      margin-bottom: 1rem;
      animation: radar-blink 1s infinite;
    }

    .state-container.empty {
      .empty-icon {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        margin-bottom: 1.5rem;
        font-family: var(--cyber-font-display);
        font-size: 1.5rem;
        color: var(--cyber-cyan);
        animation: cyber-glow-pulse 2s ease-in-out infinite;
      }
    }

    /* Table Wrapper */
    .table-wrapper {
      background: var(--cyber-bg-card);
      border: 1px solid var(--cyber-border);
      overflow: hidden;
    }

    .table-header-bar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 0.5rem 1rem;
      background: rgba(0, 255, 242, 0.03);
      border-bottom: 1px solid var(--cyber-border);
    }

    .table-title {
      font-family: var(--cyber-font-mono);
      font-size: 0.75rem;
      color: var(--cyber-cyan);
    }

    .table-status {
      font-family: var(--cyber-font-mono);
      font-size: 0.65rem;
      color: var(--cyber-positive);
      animation: radar-blink 1s infinite;
    }

    .table-container {
      overflow-x: auto;
    }

    /* Cyber Table */
    .cyber-table {
      width: 100%;
      border-collapse: collapse;
      font-family: var(--cyber-font-mono);
    }

    .cyber-table thead {
      background: var(--cyber-bg-elevated);
    }

    .cyber-table th {
      padding: 0.75rem 1rem;
      text-align: left;
      font-size: 0.65rem;
      font-weight: 600;
      color: var(--cyber-cyan);
      letter-spacing: 0.1em;
      border-bottom: 1px solid var(--cyber-border);
      cursor: pointer;
      transition: all 0.2s ease;
      white-space: nowrap;

      &:hover {
        background: var(--cyber-cyan-dim);
      }
    }

    .th-content {
      display: inline-flex;
      align-items: center;
      gap: 0.5rem;
    }

    .sort-indicator {
      color: var(--cyber-pink);
    }

    .cyber-table tbody tr {
      border-bottom: 1px solid var(--cyber-border);
      cursor: pointer;
      transition: all 0.15s ease;
      opacity: 0;
      animation: v2-fadeIn 0.3s ease forwards;

      &:hover {
        background: var(--cyber-cyan-dim);
        box-shadow: inset 3px 0 0 var(--cyber-cyan);
      }
    }

    .cyber-table td {
      padding: 0.6rem 1rem;
      font-size: 0.8rem;
      color: var(--cyber-text);
      vertical-align: middle;
    }

    /* Column Styles */
    .col-symbol {
      min-width: 160px;
    }

    .symbol-cell {
      display: flex;
      flex-direction: column;
      gap: 0.15rem;
    }

    .ticker {
      font-weight: 700;
      color: var(--cyber-cyan);
      font-size: 0.9rem;
    }

    .name {
      font-size: 0.65rem;
      color: var(--cyber-text-dim);
    }

    .col-price, .col-change, .col-cap, .col-pe, .col-rsi, .col-macd {
      text-align: right;
    }

    .price-value {
      font-weight: 600;
      color: var(--cyber-text);
    }

    .change-value {
      font-weight: 600;
      padding: 0.2rem 0.4rem;

      &.positive {
        color: var(--cyber-positive);
        background: rgba(0, 255, 136, 0.1);
      }

      &.negative {
        color: var(--cyber-negative);
        background: rgba(255, 51, 102, 0.1);
      }
    }

    .cap-value {
      color: var(--cyber-text);
    }

    .pe-value {
      color: var(--cyber-text);

      &.na {
        color: var(--cyber-text-dim);
      }
    }

    /* 52W Range */
    .col-52w {
      min-width: 140px;
    }

    .range-cell {
      display: flex;
      flex-direction: column;
      gap: 0.25rem;
    }

    .range-bar {
      height: 4px;
      background: var(--cyber-border);
      position: relative;
    }

    .range-track {
      height: 100%;
      position: relative;
    }

    .range-fill {
      height: 100%;
      background: linear-gradient(90deg, var(--cyber-negative), var(--cyber-cyan), var(--cyber-positive));
      opacity: 0.3;
    }

    .range-marker {
      position: absolute;
      top: 50%;
      width: 8px;
      height: 8px;
      background: var(--cyber-cyan);
      transform: translate(-50%, -50%);
      box-shadow: 0 0 8px var(--cyber-cyan);
    }

    .range-values {
      display: flex;
      justify-content: space-between;
      font-size: 0.55rem;
      color: var(--cyber-text-dim);
    }

    /* RSI */
    .rsi-cell {
      display: flex;
      flex-direction: column;
      align-items: flex-end;
      gap: 0.2rem;
    }

    .rsi-value {
      font-weight: 600;
      font-size: 0.85rem;

      &.oversold { color: var(--cyber-positive); }
      &.overbought { color: var(--cyber-negative); }
    }

    .rsi-bar {
      width: 40px;
      height: 3px;
      background: var(--cyber-border);
    }

    .rsi-fill {
      height: 100%;
      background: var(--cyber-cyan);

      &.oversold { background: var(--cyber-positive); }
      &.overbought { background: var(--cyber-negative); }
    }

    /* MACD */
    .macd-value {
      font-weight: 600;

      &.positive { color: var(--cyber-positive); }
      &.negative { color: var(--cyber-negative); }
    }

    .na {
      color: var(--cyber-text-dim);
    }

    /* Pagination */
    .pagination-bar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 0.75rem 1rem;
      background: var(--cyber-bg-elevated);
      border-top: 1px solid var(--cyber-border);
    }

    .page-info {
      display: flex;
      align-items: center;
      gap: 0.35rem;
      font-family: var(--cyber-font-mono);
      font-size: 0.7rem;
    }

    .info-label {
      color: var(--cyber-text-dim);
    }

    .info-value, .info-total {
      color: var(--cyber-cyan);
    }

    .info-sep {
      color: var(--cyber-text-dim);
    }

    .page-controls {
      display: flex;
      align-items: center;
      gap: 1rem;
    }

    .page-size {
      padding: 0.35rem 0.5rem;
      border: 1px solid var(--cyber-border);
      background: var(--cyber-bg-card);
      color: var(--cyber-cyan);
      font-family: var(--cyber-font-mono);
      font-size: 0.7rem;
      cursor: pointer;
      outline: none;

      &:focus {
        border-color: var(--cyber-cyan);
      }
    }

    .page-nav {
      display: flex;
      gap: 2px;
    }

    .nav-btn {
      min-width: 28px;
      height: 28px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      border: 1px solid var(--cyber-border);
      background: transparent;
      color: var(--cyber-text-dim);
      font-family: var(--cyber-font-mono);
      font-size: 0.7rem;
      cursor: pointer;
      transition: all 0.15s ease;

      &:hover:not(:disabled) {
        border-color: var(--cyber-cyan);
        color: var(--cyber-cyan);
      }

      &:disabled {
        opacity: 0.3;
        cursor: not-allowed;
      }

      &.active {
        background: var(--cyber-cyan);
        border-color: var(--cyber-cyan);
        color: var(--cyber-bg);
      }
    }

    @keyframes spin {
      to { transform: rotate(360deg); }
    }

    /* Responsive */
    @media (max-width: 1200px) {
      .stats-grid {
        grid-template-columns: repeat(2, 1fr);
      }

      .col-52w {
        display: none;
      }
    }

    @media (max-width: 768px) {
      .quick-filters {
        flex-direction: column;
        align-items: flex-start;
      }

      .pagination-bar {
        flex-direction: column;
        gap: 0.75rem;
      }

      .col-pe, .col-rsi, .col-macd {
        display: none;
      }
    }
  `]
})
export class ResultsTableV2Component {
  screenerService = inject(ScreenerService);
  marketService = inject(MarketService);
  private router = inject(Router);

  Math = Math;

  currentPage = signal(1);
  pageSize = signal(50);
  currentSort = signal<{ field: keyof Stock; direction: 'asc' | 'desc' }>({ field: 'marketCap', direction: 'desc' });

  rsiFilter = signal<'oversold' | 'overbought' | null>(null);
  macdFilter = signal<'bullish' | 'bearish' | null>(null);
  calculatingTechnicals = signal(false);
  technicalProgress = signal('');

  summary = computed(() => {
    const stocks = this.screenerService.results();
    if (stocks.length === 0) {
      return { totalMarketCap: 0, avgPE: null, gainers: 0, losers: 0, unchanged: 0 };
    }

    const totalMarketCap = stocks.reduce((sum, s) => sum + (s.marketCap || 0), 0);
    const peValues = stocks.filter(s => s.peRatio && s.peRatio > 0).map(s => s.peRatio!);
    const avgPE = peValues.length > 0 ? peValues.reduce((a, b) => a + b, 0) / peValues.length : null;
    const gainers = stocks.filter(s => s.changePercent > 0).length;
    const losers = stocks.filter(s => s.changePercent < 0).length;
    const unchanged = stocks.filter(s => s.changePercent === 0).length;

    return { totalMarketCap, avgPE, gainers, losers, unchanged };
  });

  totalPages = computed(() => {
    return Math.ceil(this.screenerService.totalCount() / this.pageSize());
  });

  visiblePages = computed(() => {
    const total = this.totalPages();
    const current = this.currentPage();
    const pages: number[] = [];
    
    let start = Math.max(1, current - 2);
    let end = Math.min(total, current + 2);
    
    if (end - start < 4) {
      if (start === 1) {
        end = Math.min(total, 5);
      } else {
        start = Math.max(1, total - 4);
      }
    }
    
    for (let i = start; i <= end; i++) {
      pages.push(i);
    }
    
    return pages;
  });

  paginatedResults = computed(() => {
    const allResults = this.screenerService.results();
    const start = (this.currentPage() - 1) * this.pageSize();
    const end = start + this.pageSize();
    return allResults.slice(start, end);
  });

  toggleRsiFilter(filter: 'oversold' | 'overbought'): void {
    if (this.rsiFilter() === filter) {
      this.rsiFilter.set(null);
    } else {
      this.rsiFilter.set(filter);
    }
    this.screenerService.toggleRsiFilter(filter);
  }

  toggleMacdFilter(filter: 'bullish' | 'bearish'): void {
    if (this.macdFilter() === filter) {
      this.macdFilter.set(null);
    } else {
      this.macdFilter.set(filter);
    }
    this.screenerService.toggleMacdFilter(filter);
  }

  clearTechFilters(): void {
    const currentRsi = this.rsiFilter();
    const currentMacd = this.macdFilter();
    this.rsiFilter.set(null);
    this.macdFilter.set(null);
    if (currentRsi) {
      this.screenerService.toggleRsiFilter(currentRsi);
    }
    if (currentMacd) {
      this.screenerService.toggleMacdFilter(currentMacd);
    }
  }

  sortBy(field: keyof Stock): void {
    const current = this.currentSort();
    if (current.field === field) {
      this.currentSort.set({ field, direction: current.direction === 'asc' ? 'desc' : 'asc' });
    } else {
      this.currentSort.set({ field, direction: 'desc' });
    }
    this.screenerService.setSort({ field, direction: this.currentSort().direction });
  }

  goToPage(page: number): void {
    if (page >= 1 && page <= this.totalPages()) {
      this.currentPage.set(page);
      this.screenerService.setPagination(page - 1);
    }
  }

  setPageSize(size: number): void {
    this.pageSize.set(size);
    this.currentPage.set(1);
    this.screenerService.setPagination(0, size);
  }

  goToStock(symbol: string): void {
    this.router.navigate(['/v2/stock', symbol]);
  }

  getRangePosition(current: number, low: number, high: number): number {
    if (!current || !low || !high || high === low) return 50;
    const position = ((current - low) / (high - low)) * 100;
    return Math.max(0, Math.min(100, position));
  }
}
