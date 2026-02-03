import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule, DecimalPipe } from '@angular/common';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { FormsModule } from '@angular/forms';

import { ButtonModule } from 'primeng/button';
import { CardModule } from 'primeng/card';
import { TagModule } from 'primeng/tag';
import { ProgressSpinnerModule } from 'primeng/progressspinner';
import { TooltipModule } from 'primeng/tooltip';
import { DividerModule } from 'primeng/divider';
import { MultiSelectModule } from 'primeng/multiselect';

import { Stock } from '../../core/models/stock.model';
import { MarketService } from '../../core/services';

interface FilterOption {
  label: string;
  value: string;
}

interface TechnicalAnalysis {
  rsi: number | null;
  macdLine: number | null;
  macdSignal: number | null;
  macdHistogram: number | null;
  sma20: number | null;
  sma50: number | null;
  sma200: number | null;
  ema12: number | null;
  ema26: number | null;
}

interface NewsItem {
  title: string;
  link: string;
  pubDate: string;
  description: string;
  source: string;
  type: 'price_target' | 'upgrade_downgrade' | 'insider' | 'earnings' | 'dividend' | 'general';
  timeAgo: string;
  priority: number;
}

type SignalType = 'strong_sell' | 'sell' | 'neutral' | 'buy' | 'strong_buy';

@Component({
  selector: 'app-stock-detail',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    FormsModule,
    ButtonModule,
    CardModule,
    TagModule,
    ProgressSpinnerModule,
    TooltipModule,
    DividerModule,
    MultiSelectModule,
    DecimalPipe
  ],
  template: `
    <div class="stock-detail-container">
      @if (loading()) {
        <div class="loading-container">
          <p-progressSpinner strokeWidth="3" [style]="{ width: '50px', height: '50px' }"></p-progressSpinner>
          <span>Loading stock data...</span>
        </div>
      }

      @if (error()) {
        <div class="error-container">
          <i class="pi pi-exclamation-circle"></i>
          <span>{{ error() }}</span>
          <button pButton type="button" label="Go Back" (click)="goBack()"></button>
        </div>
      }

      @if (stock(); as s) {
        <!-- Combined Header with Key Stats -->
        <div class="stock-header-combined">
          <div class="header-top">
            <div class="stock-identity">
              <div class="symbol-row">
                <h1>{{ s.symbol }}</h1>
              </div>
              <span class="stock-name">{{ s.name }}</span>
            </div>
            <!-- 52 Week Range Bar -->
            <div class="week-range-container">
              <div class="range-label">52W Range</div>
              <div class="range-bar-wrapper">
                <span class="range-value low">{{ marketService.formatCurrency(s.fiftyTwoWeekLow, s.market) }}</span>
                <div class="range-bar">
                  <div class="range-fill" [style.width.%]="getRangePosition(s.price, s.fiftyTwoWeekLow, s.fiftyTwoWeekHigh)"></div>
                  <div class="range-marker" [style.left.%]="getRangePosition(s.price, s.fiftyTwoWeekLow, s.fiftyTwoWeekHigh)">
                    <div class="marker-tooltip">{{ getRangePosition(s.price, s.fiftyTwoWeekLow, s.fiftyTwoWeekHigh) | number:'1.0-0' }}%</div>
                  </div>
                </div>
                <span class="range-value high">{{ marketService.formatCurrency(s.fiftyTwoWeekHigh, s.market) }}</span>
              </div>
            </div>

            <div class="stock-price">
              <span class="price">{{ marketService.formatCurrency(s.price, s.market) }}</span>
              <span class="change" [class.positive]="s.changePercent >= 0" [class.negative]="s.changePercent < 0">
                {{ s.changePercent >= 0 ? '+' : '' }}{{ s.changePercent | number:'1.2-2' }}%
                ({{ s.change >= 0 ? '+' : '' }}{{ marketService.formatCurrency(s.change, s.market) }})
              </span>
            </div>
          </div>
          
          <div class="key-stats-grid">
            <div class="stat-item">
              <span class="stat-label">Market Cap</span>
              <span class="stat-value">{{ marketService.formatMarketCap(s.marketCap, s.market) }}</span>
            </div>
            <div class="stat-item">
              <span class="stat-label">P/E Ratio</span>
              <span class="stat-value">{{ s.peRatio !== null ? (s.peRatio | number:'1.2-2') : '—' }}</span>
            </div>
            <div class="stat-item">
              <span class="stat-label">Forward P/E</span>
              <span class="stat-value">{{ s.forwardPeRatio !== null ? (s.forwardPeRatio | number:'1.2-2') : '—' }}</span>
            </div>
            <div class="stat-item">
              <span class="stat-label">52W High</span>
              <span class="stat-value">{{ marketService.formatCurrency(s.fiftyTwoWeekHigh, s.market) }}</span>
            </div>
            <div class="stat-item">
              <span class="stat-label">52W Low</span>
              <span class="stat-value">{{ marketService.formatCurrency(s.fiftyTwoWeekLow, s.market) }}</span>
            </div>
            <div class="stat-item">
              <span class="stat-label">% from 52W High</span>
              <span class="stat-value" [class.negative]="(s.percentFromFiftyTwoWeekHigh || 0) < 0">
                {{ s.percentFromFiftyTwoWeekHigh | number:'1.1-1' }}%
              </span>
            </div>
            <div class="stat-item">
              <span class="stat-label">Volume</span>
              <span class="stat-value">{{ marketService.formatVolume(s.volume) }}</span>
            </div>
            <div class="stat-item">
              <span class="stat-label">Avg Volume</span>
              <span class="stat-value">{{ marketService.formatVolume(s.avgVolume) }}</span>
            </div>
            <div class="stat-item">
              <span class="stat-label">Dividend Yield</span>
              <span class="stat-value">{{ s.dividendYield ? (s.dividendYield | number:'1.2-2') + '%' : '—' }}</span>
            </div>
            <div class="stat-item">
              <span class="stat-label">Sector</span>
              <span class="stat-value small">{{ s.sector }}</span>
            </div>
            <div class="stat-item">
              <span class="stat-label">Industry</span>
              <span class="stat-value small">{{ s.industry }}</span>
            </div>
            <div class="stat-item">
              <span class="stat-label">Exchange</span>
              <span class="stat-value small">{{ s.exchange }}</span>
            </div>
          </div>
        </div>

        <!-- Two Column Layout: Technical Analysis + News -->
        <div class="content-grid">
          <!-- Left Column: Technical Analysis -->
          <div class="analysis-column">
            <div class="analysis-section">
              <h2>Technical Analysis</h2>
              <p class="data-source">Based on real-time data from Yahoo Finance</p>
              
              <div class="gauges-container vertical">
                <!-- Summary Gauge (Main) -->
                <div class="gauge-card main-gauge">
                  <h3>Overall Summary</h3>
                  <div class="gauge-wrapper large">
                    <svg viewBox="0 0 240 140" class="gauge-svg">
                      <path d="M 20 120 A 100 100 0 0 1 220 120" fill="none" stroke="#e0e0e0" stroke-width="16" stroke-linecap="round"/>
                      <path d="M 20 120 A 100 100 0 0 1 60 45" fill="none" stroke="#ef4444" stroke-width="16" stroke-linecap="round"/>
                      <path d="M 60 45 A 100 100 0 0 1 120 20" fill="none" stroke="#fca5a5" stroke-width="16"/>
                      <path d="M 120 20 A 100 100 0 0 1 180 45" fill="none" stroke="#86efac" stroke-width="16"/>
                      <path d="M 180 45 A 100 100 0 0 1 220 120" fill="none" stroke="#22c55e" stroke-width="16" stroke-linecap="round"/>
                      <text x="30" y="90" class="gauge-text small">Strong</text>
                      <text x="30" y="102" class="gauge-text small">Sell</text>
                      <text x="65" y="55" class="gauge-text small">Sell</text>
                      <text x="120" y="38" class="gauge-text small">Neutral</text>
                      <text x="175" y="55" class="gauge-text small">Buy</text>
                      <text x="200" y="90" class="gauge-text small">Strong</text>
                      <text x="200" y="102" class="gauge-text small">Buy</text>
                      <line [attr.x1]="120" [attr.y1]="120" 
                            [attr.x2]="getSummaryNeedleX(overallScore())" 
                            [attr.y2]="getSummaryNeedleY(overallScore())" 
                            stroke="#374151" stroke-width="4" stroke-linecap="round"/>
                      <circle cx="120" cy="120" r="8" fill="#374151"/>
                    </svg>
                  </div>
                  <div class="gauge-label large" [class]="getSignalClass(overallScore())">
                    {{ getSignalLabel(overallScore()) }}
                  </div>
                  <div class="score-display">
                    Score: {{ overallScore() | number:'1.0-0' }}/100
                  </div>
                </div>

                <!-- Two smaller gauges side by side -->
                <div class="small-gauges-row">
                  <!-- Technical Indicators Gauge -->
                  <div class="gauge-card">
                    <h3>Technical Indicators</h3>
                    <div class="gauge-wrapper">
                      <svg viewBox="0 0 200 120" class="gauge-svg">
                        <path d="M 20 100 A 80 80 0 0 1 180 100" fill="none" stroke="#e0e0e0" stroke-width="12" stroke-linecap="round"/>
                        <path d="M 20 100 A 80 80 0 0 1 52 40" fill="none" stroke="#ef4444" stroke-width="12" stroke-linecap="round"/>
                        <path d="M 52 40 A 80 80 0 0 1 100 20" fill="none" stroke="#f97316" stroke-width="12"/>
                        <path d="M 100 20 A 80 80 0 0 1 148 40" fill="none" stroke="#a3a3a3" stroke-width="12"/>
                        <path d="M 148 40 A 80 80 0 0 1 180 100" fill="none" stroke="#22c55e" stroke-width="12" stroke-linecap="round"/>
                        <text x="20" y="115" class="gauge-label-text sell">Sell</text>
                        <text x="180" y="115" class="gauge-label-text buy">Buy</text>
                        <line [attr.x1]="100" [attr.y1]="100" 
                              [attr.x2]="getNeedleX(technicalScore())" 
                              [attr.y2]="getNeedleY(technicalScore())" 
                              stroke="#374151" stroke-width="3" stroke-linecap="round"/>
                        <circle cx="100" cy="100" r="6" fill="#374151"/>
                      </svg>
                    </div>
                    <div class="gauge-label" [class]="getSignalClass(technicalScore())">
                      {{ getSignalLabel(technicalScore()) }}
                    </div>
                    <div class="indicator-breakdown compact">
                      <div class="breakdown-item">
                        <span class="breakdown-label">RSI (14)</span>
                        <span class="breakdown-value" [class]="getRsiClass(s.rsi)">
                          {{ s.rsi !== null ? (s.rsi | number:'1.1-1') : 'N/A' }}
                        </span>
                        <span class="breakdown-signal" [class]="getRsiSignalClass(s.rsi)">
                          {{ getRsiShortSignal(s.rsi) }}
                        </span>
                      </div>
                      <div class="breakdown-item">
                        <span class="breakdown-label">MACD</span>
                        <span class="breakdown-value" [class.positive]="(s.macdHistogram || 0) > 0" [class.negative]="(s.macdHistogram || 0) < 0">
                          {{ s.macdHistogram !== null ? (s.macdHistogram | number:'1.2-2') : 'N/A' }}
                        </span>
                        <span class="breakdown-signal" [class]="getMacdSignalClass(s.macdSignalType)">
                          {{ getMacdShortSignal(s.macdSignalType) }}
                        </span>
                      </div>
                    </div>
                  </div>

                  <!-- Moving Averages Gauge -->
                  <div class="gauge-card">
                    <h3>Moving Averages</h3>
                    <div class="gauge-wrapper">
                      <svg viewBox="0 0 200 120" class="gauge-svg">
                        <path d="M 20 100 A 80 80 0 0 1 180 100" fill="none" stroke="#e0e0e0" stroke-width="12" stroke-linecap="round"/>
                        <path d="M 20 100 A 80 80 0 0 1 52 40" fill="none" stroke="#ef4444" stroke-width="12" stroke-linecap="round"/>
                        <path d="M 52 40 A 80 80 0 0 1 100 20" fill="none" stroke="#f97316" stroke-width="12"/>
                        <path d="M 100 20 A 80 80 0 0 1 148 40" fill="none" stroke="#a3a3a3" stroke-width="12"/>
                        <path d="M 148 40 A 80 80 0 0 1 180 100" fill="none" stroke="#22c55e" stroke-width="12" stroke-linecap="round"/>
                        <text x="20" y="115" class="gauge-label-text sell">Sell</text>
                        <text x="180" y="115" class="gauge-label-text buy">Buy</text>
                        <line [attr.x1]="100" [attr.y1]="100" 
                              [attr.x2]="getNeedleX(maScore())" 
                              [attr.y2]="getNeedleY(maScore())" 
                              stroke="#374151" stroke-width="3" stroke-linecap="round"/>
                        <circle cx="100" cy="100" r="6" fill="#374151"/>
                      </svg>
                    </div>
                    <div class="gauge-label" [class]="getSignalClass(maScore())">
                      {{ getSignalLabel(maScore()) }}
                    </div>
                    <div class="indicator-breakdown compact">
                      <div class="breakdown-item">
                        <span class="breakdown-label">50 MA</span>
                        <span class="breakdown-value" [class.positive]="(s.percentFromFiftyDayMA || 0) > 0" [class.negative]="(s.percentFromFiftyDayMA || 0) < 0">
                          {{ s.percentFromFiftyDayMA !== null ? ((s.percentFromFiftyDayMA >= 0 ? '+' : '') + (s.percentFromFiftyDayMA | number:'1.1-1') + '%') : 'N/A' }}
                        </span>
                        <span class="breakdown-signal" [class.buy]="(s.percentFromFiftyDayMA || 0) > 0" [class.sell]="(s.percentFromFiftyDayMA || 0) < 0">
                          {{ (s.percentFromFiftyDayMA || 0) > 0 ? 'Buy' : ((s.percentFromFiftyDayMA || 0) < 0 ? 'Sell' : '—') }}
                        </span>
                      </div>
                      <div class="breakdown-item">
                        <span class="breakdown-label">200 MA</span>
                        <span class="breakdown-value" [class.positive]="(s.percentFromTwoHundredDayMA || 0) > 0" [class.negative]="(s.percentFromTwoHundredDayMA || 0) < 0">
                          {{ s.percentFromTwoHundredDayMA !== null ? ((s.percentFromTwoHundredDayMA >= 0 ? '+' : '') + (s.percentFromTwoHundredDayMA | number:'1.1-1') + '%') : 'N/A' }}
                        </span>
                        <span class="breakdown-signal" [class.buy]="(s.percentFromTwoHundredDayMA || 0) > 0" [class.sell]="(s.percentFromTwoHundredDayMA || 0) < 0">
                          {{ (s.percentFromTwoHundredDayMA || 0) > 0 ? 'Buy' : ((s.percentFromTwoHundredDayMA || 0) < 0 ? 'Sell' : '—') }}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- Right Column: News Feed -->
          <div class="news-column">
            <div class="news-section">
              <div class="news-header">
                <h2>News & Analysis</h2>
                <div class="news-filters">
                  <p-multiSelect 
                    [options]="feedTypeOptions" 
                    [ngModel]="selectedFeedTypes()"
                    (ngModelChange)="onFeedTypesChange($event)"
                    placeholder="All Types"
                    [showClear]="true"
                    [maxSelectedLabels]="1"
                    selectedItemsLabel="{0} types"
                    styleClass="news-filter-select">
                  </p-multiSelect>
                  <p-multiSelect 
                    [options]="sourceOptions" 
                    [ngModel]="selectedSources()"
                    (ngModelChange)="onSourcesChange($event)"
                    placeholder="All Sources"
                    [showClear]="true"
                    [maxSelectedLabels]="1"
                    selectedItemsLabel="{0} sources"
                    styleClass="news-filter-select">
                  </p-multiSelect>
                </div>
              </div>
              
              @if (newsLoading()) {
                <div class="news-loading">
                  <p-progressSpinner strokeWidth="3" [style]="{ width: '30px', height: '30px' }"></p-progressSpinner>
                  <span>Loading news...</span>
                </div>
              } @else if (filteredNews().length === 0) {
                <div class="news-empty">
                  <i class="pi pi-inbox"></i>
                  <span>{{ news().length > 0 ? 'No news matches your filters' : 'No news available for this stock' }}</span>
                </div>
              } @else {
                <div class="news-list">
                  @for (item of filteredNews(); track item.link) {
                    <a [href]="item.link" target="_blank" rel="noopener noreferrer" class="news-item">
                      <div class="news-item-header">
                        <span class="news-badge" [class]="'badge-' + item.type">
                          {{ getTypeBadgeLabel(item.type) }}
                        </span>
                        <span class="news-time">{{ item.timeAgo }}</span>
                      </div>
                      <h4 class="news-title">{{ item.title }}</h4>
                      <span class="news-source-name">{{ item.source }}</span>
                    </a>
                  }
                </div>
              }
            </div>
          </div>
        </div>

      }
    </div>
  `,
  styles: [`
    /* Main container - fills viewport without scrolling */
    .stock-detail-container {
      width: 100%;
      height: calc(100vh - 70px);
      padding: 1.25rem 2.5rem;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      box-sizing: border-box;
    }

    .loading-container, .error-container {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 1rem;
      flex: 1;
      color: var(--text-color-secondary);
    }

    .error-container i {
      font-size: 3rem;
      color: var(--red-500);
    }

    /* Stock Header Section */
    .stock-header-combined {
      background: var(--surface-card);
      border-radius: 12px;
      padding: 1.25rem 2rem;
      margin-bottom: 1rem;
      flex-shrink: 0;
    }

    .header-top {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 1.25rem;
      padding-bottom: 1rem;
      border-bottom: 1px solid var(--surface-border);
    }

    /* 52 Week Range Bar */
    .week-range-container {
      flex: 1;
      max-width: 400px;
      margin: 0 3rem;
    }

    .range-label {
      font-size: 0.7rem;
      color: var(--text-color-secondary);
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-bottom: 0.35rem;
      text-align: center;
    }

    .range-bar-wrapper {
      display: flex;
      align-items: center;
      gap: 0.75rem;
    }

    .range-value {
      font-size: 0.8rem;
      font-weight: 500;
      white-space: nowrap;
    }

    .range-value.low {
      color: var(--red-400);
    }

    .range-value.high {
      color: var(--green-400);
    }

    .range-bar {
      flex: 1;
      height: 12px;
      background: linear-gradient(90deg, 
        #ef4444 0%, 
        #f97316 25%, 
        #eab308 50%, 
        #84cc16 75%, 
        #22c55e 100%
      );
      border-radius: 6px;
      position: relative;
      box-shadow: inset 0 2px 4px rgba(0, 0, 0, 0.3), 0 1px 2px rgba(0, 0, 0, 0.2);
      border: 1px solid rgba(255, 255, 255, 0.1);
    }

    .range-fill {
      position: absolute;
      left: 0;
      top: 0;
      height: 100%;
      background: transparent;
      border-radius: 6px 0 0 6px;
    }

    .range-marker {
      position: absolute;
      top: 50%;
      transform: translate(-50%, -50%);
      width: 18px;
      height: 18px;
      background: #ffffff;
      border: 3px solid var(--primary-color);
      border-radius: 50%;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.4), 0 0 0 2px rgba(255, 255, 255, 0.2);
      cursor: pointer;
    }

    .marker-tooltip {
      position: absolute;
      bottom: 100%;
      left: 50%;
      transform: translateX(-50%);
      background: var(--surface-800);
      color: var(--text-color);
      padding: 0.25rem 0.5rem;
      border-radius: 4px;
      font-size: 0.7rem;
      font-weight: 600;
      white-space: nowrap;
      margin-bottom: 4px;
      box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
    }

    .marker-tooltip::after {
      content: '';
      position: absolute;
      top: 100%;
      left: 50%;
      transform: translateX(-50%);
      border: 4px solid transparent;
      border-top-color: var(--surface-800);
    }

    .stock-identity {
      display: flex;
      flex-direction: column;
      gap: 0.25rem;
    }

    .symbol-row {
      display: flex;
      align-items: center;
      gap: 0.75rem;
    }

    .symbol-row h1 {
      margin: 0;
      font-size: 1.75rem;
      font-weight: 700;
    }

    .stock-name {
      color: var(--text-color-secondary);
      font-size: 1rem;
    }

    .stock-price {
      text-align: right;
    }

    .stock-price .price {
      display: block;
      font-size: 1.75rem;
      font-weight: 700;
    }

    .stock-price .change {
      font-size: 1rem;
      font-weight: 500;
    }

    .stock-price .change.positive { color: var(--green-500); }
    .stock-price .change.negative { color: var(--red-500); }

    /* Key Stats - horizontal layout */
    .key-stats-grid {
      display: grid;
      grid-template-columns: repeat(12, 1fr);
      gap: 1rem;
    }

    .key-stats-grid .stat-item {
      display: flex;
      flex-direction: column;
      gap: 0.25rem;
    }

    .key-stats-grid .stat-label {
      font-size: 0.75rem;
      color: var(--text-color-secondary);
      white-space: nowrap;
    }

    .key-stats-grid .stat-value {
      font-size: 0.9rem;
      font-weight: 600;
    }

    .key-stats-grid .stat-value.small {
      font-size: 0.85rem;
    }

    .key-stats-grid .stat-value.negative {
      color: var(--red-500);
    }

    /* Two Column Layout - fills remaining space */
    .content-grid {
      display: grid;
      grid-template-columns: 40% 60%;
      gap: 1rem;
      flex: 1;
      min-height: 0;
      overflow: hidden;
    }

    .analysis-column, .news-column {
      min-width: 0;
      min-height: 0;
      overflow: hidden;
    }

    /* Technical Analysis Section */
    .analysis-section {
      background: var(--surface-card);
      border-radius: 12px;
      padding: 1rem 1.5rem;
      height: 100%;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }

    .analysis-section h2 {
      margin: 0 0 0.25rem 0;
      font-size: 1rem;
      font-weight: 600;
      text-align: center;
      flex-shrink: 0;
    }

    .data-source {
      text-align: center;
      font-size: 0.7rem;
      color: var(--text-color-secondary);
      margin-bottom: 0.5rem;
      flex-shrink: 0;
    }

    /* Gauges Layout */
    .gauges-container.vertical {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
      align-items: center;
      flex: 1;
      justify-content: space-evenly;
    }

    .gauge-card {
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 0.5rem;
    }

    .gauge-card.main-gauge {
      padding: 0.25rem;
    }

    .gauge-card h3 {
      margin: 0 0 0.25rem 0;
      font-size: 0.85rem;
      font-weight: 600;
      color: var(--text-color-secondary);
    }

    .gauge-wrapper {
      width: 140px;
      height: 85px;
    }

    .gauge-wrapper.large {
      width: 180px;
      height: 105px;
    }

    .gauge-svg {
      width: 100%;
      height: 100%;
    }

    .gauge-text {
      font-size: 9px;
      fill: var(--text-color-secondary);
      text-anchor: middle;
    }

    .gauge-text.small {
      font-size: 8px;
    }

    .gauge-label-text {
      font-size: 10px;
      font-weight: 600;
      text-anchor: middle;
    }

    .gauge-label-text.sell { fill: var(--red-400); }
    .gauge-label-text.buy { fill: var(--green-400); }

    .gauge-label {
      margin-top: 0.35rem;
      padding: 0.3rem 0.75rem;
      border-radius: 6px;
      font-weight: 600;
      font-size: 0.8rem;
    }

    .gauge-label.large {
      padding: 0.35rem 1rem;
      font-size: 0.9rem;
    }

    .gauge-label.strong_sell { background: var(--red-500); color: white; }
    .gauge-label.sell { background: var(--orange-500); color: white; }
    .gauge-label.neutral { background: var(--gray-400); color: white; }
    .gauge-label.buy { background: var(--green-400); color: white; }
    .gauge-label.strong_buy { background: var(--green-600); color: white; }

    .score-display {
      margin-top: 0.25rem;
      font-size: 0.8rem;
      color: var(--text-color-secondary);
    }

    /* Small gauges row */
    .small-gauges-row {
      display: flex;
      gap: 1.5rem;
      width: 100%;
      justify-content: center;
    }

    .small-gauges-row .gauge-card {
      flex: 1;
      max-width: 240px;
    }

    /* Indicator breakdown */
    .indicator-breakdown {
      margin-top: 0.5rem;
      padding-top: 0.5rem;
      border-top: 1px solid var(--surface-border);
      width: 100%;
    }

    .indicator-breakdown.compact {
      margin-top: 0.35rem;
      padding-top: 0.35rem;
    }

    .breakdown-item {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 0.2rem 0;
      font-size: 0.75rem;
    }

    .indicator-breakdown.compact .breakdown-item {
      padding: 0.15rem 0;
      font-size: 0.75rem;
    }

    .breakdown-label {
      color: var(--text-color-secondary);
      flex: 1;
    }

    .breakdown-value {
      font-weight: 600;
      margin: 0 0.5rem;
      min-width: 45px;
      text-align: right;
    }

    .breakdown-value.positive { color: var(--green-500); }
    .breakdown-value.negative { color: var(--red-500); }
    .breakdown-value.oversold { color: var(--green-500); }
    .breakdown-value.overbought { color: var(--red-500); }

    .breakdown-signal {
      font-size: 0.7rem;
      font-weight: 600;
      padding: 0.15rem 0.4rem;
      border-radius: 3px;
      min-width: 40px;
      text-align: center;
    }

    .breakdown-signal.buy { background: rgba(34, 197, 94, 0.2); color: var(--green-500); }
    .breakdown-signal.sell { background: rgba(239, 68, 68, 0.2); color: var(--red-500); }
    .breakdown-signal.neutral { background: rgba(163, 163, 163, 0.2); color: var(--text-color-secondary); }

    /* News Section */
    .news-section {
      background: var(--surface-card);
      border-radius: 12px;
      padding: 1rem 1.5rem;
      height: 100%;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }

    .news-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 0.75rem;
      padding-bottom: 0.5rem;
      border-bottom: 1px solid var(--surface-border);
      flex-shrink: 0;
      gap: 0.75rem;
    }

    .news-header h2 {
      margin: 0;
      font-size: 1rem;
      font-weight: 600;
      white-space: nowrap;
    }

    .news-filters {
      display: flex;
      gap: 0.5rem;
      align-items: center;
    }

    :host ::ng-deep .news-filter-select {
      min-width: 120px;
      max-width: 140px;
    }

    :host ::ng-deep .news-filter-select .p-multiselect {
      background: var(--surface-ground);
      border: 1px solid var(--surface-border);
      border-radius: 6px;
      font-size: 0.7rem;
      height: 28px;
    }

    :host ::ng-deep .news-filter-select .p-multiselect-label {
      padding: 0.35rem 0.5rem;
      font-size: 0.7rem;
    }

    :host ::ng-deep .news-filter-select .p-multiselect-trigger {
      width: 24px;
    }

    :host ::ng-deep .news-filter-select .p-multiselect-trigger-icon {
      font-size: 0.65rem;
    }

    :host ::ng-deep .news-filter-select .p-multiselect-panel {
      font-size: 0.75rem;
    }

    :host ::ng-deep .news-filter-select .p-multiselect-item {
      padding: 0.4rem 0.75rem;
      font-size: 0.75rem;
    }

    :host ::ng-deep .news-filter-select .p-checkbox {
      width: 14px;
      height: 14px;
    }

    :host ::ng-deep .news-filter-select .p-checkbox-box {
      width: 14px;
      height: 14px;
    }

    .news-source {
      font-size: 0.7rem;
      color: var(--text-color-secondary);
    }

    .news-loading, .news-empty {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 0.75rem;
      flex: 1;
      color: var(--text-color-secondary);
      font-size: 0.9rem;
    }

    .news-empty i {
      font-size: 2rem;
      opacity: 0.5;
    }

    /* News list - ONLY this scrolls */
    .news-list {
      flex: 1;
      overflow-y: auto;
      overflow-x: hidden;
      min-height: 0;
      padding-right: 0.5rem;
    }

    .news-list::-webkit-scrollbar {
      width: 6px;
    }

    .news-list::-webkit-scrollbar-track {
      background: var(--surface-ground);
      border-radius: 3px;
    }

    .news-list::-webkit-scrollbar-thumb {
      background: var(--surface-border);
      border-radius: 3px;
    }

    .news-list::-webkit-scrollbar-thumb:hover {
      background: var(--text-color-secondary);
    }

    .news-item {
      display: block;
      padding: 0.75rem 1rem;
      border-radius: 8px;
      text-decoration: none;
      color: inherit;
      transition: background 0.2s;
      margin-bottom: 0.35rem;
    }

    .news-item:hover {
      background: var(--surface-hover);
    }

    .news-item-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 0.35rem;
    }

    .news-badge {
      font-size: 0.6rem;
      font-weight: 600;
      padding: 0.2rem 0.5rem;
      border-radius: 4px;
      text-transform: uppercase;
      letter-spacing: 0.02em;
    }

    .badge-price_target { background: rgba(59, 130, 246, 0.15); color: #3b82f6; }
    .badge-upgrade_downgrade { background: rgba(34, 197, 94, 0.15); color: #22c55e; }
    .badge-insider { background: rgba(168, 85, 247, 0.15); color: #a855f7; }
    .badge-earnings { background: rgba(249, 115, 22, 0.15); color: #f97316; }
    .badge-dividend { background: rgba(20, 184, 166, 0.15); color: #14b8a6; }
    .badge-general { background: rgba(156, 163, 175, 0.15); color: #9ca3af; }

    .news-time {
      font-size: 0.7rem;
      color: var(--text-color-secondary);
    }

    .news-title {
      margin: 0 0 0.3rem 0;
      font-size: 0.85rem;
      font-weight: 500;
      line-height: 1.35;
      color: var(--text-color);
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }

    .news-source-name {
      font-size: 0.7rem;
      color: var(--text-color-secondary);
    }

    /* Responsive adjustments */
    @media (max-width: 1400px) {
      .stock-detail-container {
        padding: 1rem 1.5rem;
      }
      .key-stats-grid {
        grid-template-columns: repeat(6, 1fr);
      }
    }

    @media (max-width: 1200px) {
      .content-grid {
        grid-template-columns: 1fr;
      }
      .stock-detail-container {
        height: auto;
        overflow: auto;
      }
      .news-list {
        max-height: 400px;
      }
    }

    @media (max-width: 768px) {
      .stock-detail-container {
        padding: 0.75rem 1rem;
      }
      .header-top {
        flex-direction: column;
        gap: 0.75rem;
      }
      .stock-price {
        text-align: left;
      }
      .key-stats-grid {
        grid-template-columns: repeat(4, 1fr);
      }
      .small-gauges-row {
        flex-direction: column;
        align-items: center;
      }
    }
  `]
})
export class StockDetailComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private http = inject(HttpClient);
  marketService = inject(MarketService);

  stock = signal<Stock | null>(null);
  loading = signal(true);
  error = signal<string | null>(null);
  
  // News state
  news = signal<NewsItem[]>([]);
  newsLoading = signal(false);

  // News filter options
  feedTypeOptions: FilterOption[] = [
    { label: 'Price Target', value: 'price_target' },
    { label: 'Rating', value: 'upgrade_downgrade' },
    { label: 'Earnings', value: 'earnings' },
    { label: 'Insider', value: 'insider' },
    { label: 'Dividend', value: 'dividend' },
    { label: 'General News', value: 'general' }
  ];

  sourceOptions: FilterOption[] = [
    { label: 'Yahoo Finance', value: 'Yahoo Finance' },
    { label: 'Benzinga', value: 'Benzinga' },
    { label: 'Seeking Alpha', value: 'Seeking Alpha' },
    { label: 'Nasdaq', value: 'Nasdaq' },
    { label: 'Investing.com', value: 'Investing.com' },
    { label: 'MarketWatch', value: 'MarketWatch' },
    { label: 'Google News', value: 'Google News' }
  ];

  // Initialize with all options selected
  selectedFeedTypes = signal<string[]>([
    'price_target', 'upgrade_downgrade', 'earnings', 'insider', 'dividend', 'general'
  ]);
  selectedSources = signal<string[]>([
    'Yahoo Finance', 'Benzinga', 'Seeking Alpha', 'Nasdaq', 'Investing.com', 'MarketWatch', 'Google News'
  ]);

  // Filtered news based on selections
  filteredNews = computed(() => {
    const allNews = this.news();
    const types = this.selectedFeedTypes();
    const sources = this.selectedSources();

    return allNews.filter(item => {
      // Filter by type (if any selected)
      const typeMatch = types.length === 0 || types.includes(item.type);
      
      // Filter by source (if any selected)
      const sourceMatch = sources.length === 0 || sources.some(s => 
        item.source.toLowerCase().includes(s.toLowerCase())
      );
      
      return typeMatch && sourceMatch;
    });
  });

  // Method to update feed types filter
  onFeedTypesChange(values: string[]): void {
    this.selectedFeedTypes.set(values);
  }

  // Method to update sources filter
  onSourcesChange(values: string[]): void {
    this.selectedSources.set(values);
  }

  // Calculate position percentage within 52-week range
  getRangePosition(current: number, low: number, high: number): number {
    if (!current || !low || !high || high === low) return 50;
    const position = ((current - low) / (high - low)) * 100;
    return Math.max(0, Math.min(100, position));
  }

  // Computed scores for gauges (0-100 scale)
  technicalScore = computed(() => {
    const s = this.stock();
    if (!s) return 50;
    
    let score = 50; // Start neutral
    
    // RSI contribution (-25 to +25)
    if (s.rsi != null) {
      if (s.rsi < 30) score += 20; // Oversold = bullish
      else if (s.rsi < 40) score += 10;
      else if (s.rsi > 70) score -= 20; // Overbought = bearish
      else if (s.rsi > 60) score -= 10;
    }
    
    // MACD contribution (-25 to +25)
    if (s.macdSignalType) {
      if (s.macdSignalType === 'strong_bullish' || s.macdSignalType === 'bullish_crossover') score += 25;
      else if (s.macdSignalType === 'bullish') score += 15;
      else if (s.macdSignalType === 'strong_bearish' || s.macdSignalType === 'bearish_crossover') score -= 25;
      else if (s.macdSignalType === 'bearish') score -= 15;
    }
    
    return Math.max(0, Math.min(100, score));
  });

  maScore = computed(() => {
    const s = this.stock();
    if (!s) return 50;
    
    let score = 50;
    
    // 50-day MA contribution
    if (s.percentFromFiftyDayMA != null) {
      if (s.percentFromFiftyDayMA > 5) score += 15;
      else if (s.percentFromFiftyDayMA > 0) score += 8;
      else if (s.percentFromFiftyDayMA < -5) score -= 15;
      else if (s.percentFromFiftyDayMA < 0) score -= 8;
    }
    
    // 200-day MA contribution
    if (s.percentFromTwoHundredDayMA != null) {
      if (s.percentFromTwoHundredDayMA > 10) score += 20;
      else if (s.percentFromTwoHundredDayMA > 0) score += 10;
      else if (s.percentFromTwoHundredDayMA < -10) score -= 20;
      else if (s.percentFromTwoHundredDayMA < 0) score -= 10;
    }
    
    return Math.max(0, Math.min(100, score));
  });

  overallScore = computed(() => {
    return (this.technicalScore() + this.maScore()) / 2;
  });

  ngOnInit(): void {
    // Subscribe to route param changes to handle navigation between stock pages
    this.route.paramMap.subscribe(params => {
      const symbol = params.get('symbol');
      if (symbol) {
        this.loadStock(symbol);
      } else {
        this.error.set('No symbol provided');
        this.loading.set(false);
      }
    });
  }

  private async loadStock(symbol: string): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    this.news.set([]);

    try {
      // Fetch stock with technicals
      const result = await this.http.get<{ stocks: Stock[] }>(
        `/api/stocks/search?q=${symbol}&technicals=true`
      ).toPromise();

      if (result?.stocks && result.stocks.length > 0) {
        this.stock.set(result.stocks[0]);
        // Fetch news in parallel (don't block stock display)
        this.fetchNews(symbol);
      } else {
        this.error.set(`Stock ${symbol} not found`);
      }
    } catch (err) {
      this.error.set('Failed to load stock data');
    } finally {
      this.loading.set(false);
    }
  }

  private async fetchNews(symbol: string): Promise<void> {
    this.newsLoading.set(true);
    try {
      const result = await this.http.get<{ news: NewsItem[] }>(
        `/api/stocks/${symbol}/news`
      ).toPromise();
      
      if (result?.news) {
        this.news.set(result.news);
      }
    } catch (err) {
      console.error('Failed to fetch news:', err);
      this.news.set([]);
    } finally {
      this.newsLoading.set(false);
    }
  }

  getTypeBadgeLabel(type: string): string {
    const labels: Record<string, string> = {
      price_target: 'Price Target',
      upgrade_downgrade: 'Rating',
      insider: 'Insider',
      earnings: 'Earnings',
      dividend: 'Dividend',
      general: 'News'
    };
    return labels[type] || 'News';
  }

  goBack(): void {
    this.router.navigate(['/']);
  }

  // Gauge needle calculations
  getNeedleX(score: number): number {
    // Score 0-100 maps to angle 180-0 degrees (left to right)
    const angle = (180 - (score / 100) * 180) * (Math.PI / 180);
    return 100 + Math.cos(angle) * 60;
  }

  getNeedleY(score: number): number {
    const angle = (180 - (score / 100) * 180) * (Math.PI / 180);
    return 100 - Math.sin(angle) * 60;
  }

  getSummaryNeedleX(score: number): number {
    const angle = (180 - (score / 100) * 180) * (Math.PI / 180);
    return 120 + Math.cos(angle) * 75;
  }

  getSummaryNeedleY(score: number): number {
    const angle = (180 - (score / 100) * 180) * (Math.PI / 180);
    return 120 - Math.sin(angle) * 75;
  }

  getSignalClass(score: number): string {
    if (score < 20) return 'strong_sell';
    if (score < 40) return 'sell';
    if (score < 60) return 'neutral';
    if (score < 80) return 'buy';
    return 'strong_buy';
  }

  getSignalLabel(score: number): string {
    if (score < 20) return 'Strong Sell';
    if (score < 40) return 'Sell';
    if (score < 60) return 'Neutral';
    if (score < 80) return 'Buy';
    return 'Strong Buy';
  }

  getRsiClass(rsi: number | null): string {
    if (rsi == null) return 'neutral';
    if (rsi < 30) return 'oversold';
    if (rsi > 70) return 'overbought';
    return 'neutral';
  }

  getRsiSignal(rsi: number | null): string {
    if (rsi == null) return 'No Data';
    if (rsi < 30) return 'Oversold - Buy Signal';
    if (rsi > 70) return 'Overbought - Sell Signal';
    return 'Neutral';
  }

  getRsiSignalClass(rsi: number | null): string {
    if (rsi == null) return 'neutral';
    if (rsi < 30) return 'buy';
    if (rsi > 70) return 'sell';
    return 'neutral';
  }

  getMacdSignalLabel(signalType: string | null): string {
    if (!signalType) return 'No Data';
    const labels: Record<string, string> = {
      'strong_bullish': 'Strong Buy',
      'bullish_crossover': 'Buy Signal',
      'bullish': 'Bullish',
      'bearish': 'Bearish',
      'bearish_crossover': 'Sell Signal',
      'strong_bearish': 'Strong Sell'
    };
    return labels[signalType] || 'Neutral';
  }

  getMacdSignalClass(signalType: string | null): string {
    if (!signalType) return 'neutral';
    if (signalType.includes('bullish')) return 'buy';
    if (signalType.includes('bearish')) return 'sell';
    return 'neutral';
  }

  getRsiShortSignal(rsi: number | null): string {
    if (rsi == null) return '—';
    if (rsi < 30) return 'Buy';
    if (rsi > 70) return 'Sell';
    return 'Neutral';
  }

  getMacdShortSignal(signalType: string | null): string {
    if (!signalType) return '—';
    if (signalType.includes('bullish')) return 'Buy';
    if (signalType.includes('bearish')) return 'Sell';
    return 'Neutral';
  }
}
