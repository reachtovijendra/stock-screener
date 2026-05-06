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
import { AuthService } from '../../core/services/auth.service';
import { WatchlistService, Watchlist } from '../../core/services/watchlist.service';
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
                <a *ngIf="s.market === 'US'"
                   class="robinhood-link"
                   [href]="'https://robinhood.com/stocks/' + s.symbol + '?source=search'"
                   target="_blank"
                   rel="noopener noreferrer"
                   pTooltip="Trade on Robinhood"
                   tooltipPosition="right">
                  <img src="robinhood.png" alt="Robinhood" class="robinhood-icon" />
                </a>
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

            <div class="stock-price" [class.price-up]="s.changePercent >= 0" [class.price-down]="s.changePercent < 0">
              <span class="price">{{ marketService.formatCurrency(s.price, s.market) }}</span>
              <span class="change" [class.positive]="s.changePercent >= 0" [class.negative]="s.changePercent < 0">
                {{ s.changePercent >= 0 ? '+' : '' }}{{ s.changePercent | number:'1.2-2' }}%
                ({{ s.change >= 0 ? '+' : '' }}{{ marketService.formatCurrency(s.change, s.market) }})
              </span>
            </div>

            <!-- Add to Watchlist -->
            <div class="watchlist-add" *ngIf="authService.isAuthenticated()">
              <button class="wl-btn" (click)="showWlDropdown = !showWlDropdown">
                <i class="pi pi-bookmark"></i> + Watchlist
              </button>
              <div class="wl-dropdown" *ngIf="showWlDropdown">
                <div
                  *ngFor="let wl of watchlistService.watchlists()"
                  class="wl-option"
                  (click)="addToWatchlist(wl, s); showWlDropdown = false">
                  <i [class]="isInWatchlist(wl.id) ? 'pi pi-check-circle' : 'pi pi-circle'" [style.color]="isInWatchlist(wl.id) ? '#10b981' : '#64748b'"></i>
                  {{ wl.name }}
                </div>
                <div class="wl-option new" (click)="createAndAdd(s)">
                  <i class="pi pi-plus" style="color: #3b82f6;"></i> New watchlist...
                </div>
              </div>
            </div>
            <button *ngIf="!authService.isAuthenticated()" class="wl-btn signin" (click)="router.navigate(['/login'])">
              <i class="pi pi-sign-in"></i> Sign in to save
            </button>
          </div>
          
          <div class="header-metrics">
            <section class="metric-section performance-section">
              <div class="metric-section-title">Performance</div>
              <div class="period-stats-row">
                <div class="stat-item period-stat">
                  <span class="stat-label">1W</span>
                  <span class="stat-value period-change" [class.up]="(s.oneWeekChangePercent ?? 0) > 0" [class.down]="(s.oneWeekChangePercent ?? 0) < 0">
                    {{ s.oneWeekChangePercent != null ? ((s.oneWeekChangePercent >= 0 ? '+' : '') + (s.oneWeekChangePercent | number:'1.2-2') + '%') : '—' }}
                  </span>
                </div>
                <div class="stat-item period-stat">
                  <span class="stat-label">1M</span>
                  <span class="stat-value period-change" [class.up]="(s.oneMonthChangePercent ?? 0) > 0" [class.down]="(s.oneMonthChangePercent ?? 0) < 0">
                    {{ s.oneMonthChangePercent != null ? ((s.oneMonthChangePercent >= 0 ? '+' : '') + (s.oneMonthChangePercent | number:'1.2-2') + '%') : '—' }}
                  </span>
                </div>
                <div class="stat-item period-stat">
                  <span class="stat-label">3M</span>
                  <span class="stat-value period-change" [class.up]="(s.threeMonthChangePercent ?? 0) > 0" [class.down]="(s.threeMonthChangePercent ?? 0) < 0">
                    {{ s.threeMonthChangePercent != null ? ((s.threeMonthChangePercent >= 0 ? '+' : '') + (s.threeMonthChangePercent | number:'1.2-2') + '%') : '—' }}
                  </span>
                </div>
                <div class="stat-item period-stat">
                  <span class="stat-label">6M</span>
                  <span class="stat-value period-change" [class.up]="(s.sixMonthChangePercent ?? 0) > 0" [class.down]="(s.sixMonthChangePercent ?? 0) < 0">
                    {{ s.sixMonthChangePercent != null ? ((s.sixMonthChangePercent >= 0 ? '+' : '') + (s.sixMonthChangePercent | number:'1.2-2') + '%') : '—' }}
                  </span>
                </div>
                <div class="stat-item period-stat">
                  <span class="stat-label">YTD</span>
                  <span class="stat-value period-change" [class.up]="(s.ytdChangePercent ?? 0) > 0" [class.down]="(s.ytdChangePercent ?? 0) < 0">
                    {{ s.ytdChangePercent != null ? ((s.ytdChangePercent >= 0 ? '+' : '') + (s.ytdChangePercent | number:'1.2-2') + '%') : '—' }}
                  </span>
                </div>
                <div class="stat-item period-stat">
                  <span class="stat-label">1Y</span>
                  <span class="stat-value period-change" [class.up]="(s.oneYearChangePercent ?? 0) > 0" [class.down]="(s.oneYearChangePercent ?? 0) < 0">
                    {{ s.oneYearChangePercent != null ? ((s.oneYearChangePercent >= 0 ? '+' : '') + (s.oneYearChangePercent | number:'1.2-2') + '%') : '—' }}
                  </span>
                </div>
              </div>
            </section>

            <div class="metric-sections-grid">
              <section class="metric-section">
                <div class="metric-section-title">Valuation</div>
                <div class="metric-grid">
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
                    <span class="stat-label">Dividend Yield</span>
                    <span class="stat-value">{{ s.dividendYield ? (s.dividendYield | number:'1.2-2') + '%' : '—' }}</span>
                  </div>
                </div>
              </section>

              <section class="metric-section">
                <div class="metric-section-title">Trading Range</div>
                <div class="metric-grid">
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
                </div>
              </section>

              <section class="metric-section">
                <div class="metric-section-title">Research & Company</div>
                <div class="metric-grid">
                  <div class="stat-item" *ngIf="s.earningsTimestamp">
                    <span class="stat-label">Earnings Date</span>
                    <span class="stat-value small">{{ formatEarningsDate(s.earningsTimestamp) }}</span>
                  </div>
                  <div class="stat-item" *ngIf="s.targetMeanPrice">
                    <span class="stat-label">Analyst Target</span>
                    <span class="stat-value">
                      {{ marketService.formatCurrency(s.targetMeanPrice, s.market) }}
                      <span class="target-upside" [class.positive]="s.targetMeanPrice > s.price" [class.negative]="s.targetMeanPrice < s.price">
                        ({{ s.targetMeanPrice > s.price ? '+' : '' }}{{ ((s.targetMeanPrice - s.price) / s.price * 100) | number:'1.1-1' }}%)
                      </span>
                    </span>
                  </div>
                  <div class="stat-item" *ngIf="s.numberOfAnalystOpinions">
                    <span class="stat-label">Analyst Rating</span>
                    <span class="stat-value small">{{ getRecommendationLabel(s.recommendationMean) }} ({{ s.numberOfAnalystOpinions }} analysts)</span>
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
                  <div class="stat-item" *ngIf="s.heldPercentInstitutions != null">
                    <span class="stat-label">Institutional %</span>
                    <span class="stat-value">{{ (s.heldPercentInstitutions * 100) | number:'1.1-1' }}%</span>
                  </div>
                  <div class="stat-item" *ngIf="s.heldPercentInsiders != null">
                    <span class="stat-label">Insider %</span>
                    <span class="stat-value">{{ (s.heldPercentInsiders * 100) | number:'1.1-1' }}%</span>
                  </div>
                </div>
              </section>
            </div>
          </div>
        </div>

        <!-- Two Column Layout: Technical Analysis + News -->
        <div class="content-grid">
          <!-- Left Column: Technical Analysis -->
          <div class="analysis-column">
            <div class="analysis-section">
              <div class="analysis-header">
                <div>
                  <span class="analysis-eyebrow">Signal Console</span>
                  <h2>Technical Analysis</h2>
                </div>
                <span class="data-source">Yahoo Finance live data</span>
              </div>

              <!-- All 3 gauges in a single row -->
              <div class="gauges-row">
                <!-- Overall Summary Gauge -->
                <div
                  class="gauge-card signal-card"
                  [class.signal-bearish]="overallScore() < 40"
                  [class.signal-neutral]="overallScore() >= 40 && overallScore() < 60"
                  [class.signal-bullish]="overallScore() >= 60">
                  <div class="signal-card-header">
                    <h3>Overall</h3>
                    <span class="signal-score">{{ overallScore() | number:'1.0-0' }}</span>
                  </div>
                  <div class="gauge-wrapper">
                    <svg viewBox="0 0 200 120" class="gauge-svg">
                      <path d="M 20 100 A 80 80 0 0 1 180 100" fill="none" stroke="rgba(148, 163, 184, 0.18)" stroke-width="12" stroke-linecap="round"/>
                      <path d="M 20 100 A 80 80 0 0 1 52 40" fill="none" stroke="#ef4444" stroke-width="12" stroke-linecap="round"/>
                      <path d="M 52 40 A 80 80 0 0 1 100 20" fill="none" stroke="#fca5a5" stroke-width="12"/>
                      <path d="M 100 20 A 80 80 0 0 1 148 40" fill="none" stroke="#86efac" stroke-width="12"/>
                      <path d="M 148 40 A 80 80 0 0 1 180 100" fill="none" stroke="#22c55e" stroke-width="12" stroke-linecap="round"/>
                      <text x="20" y="115" class="gauge-label-text sell">Sell</text>
                      <text x="180" y="115" class="gauge-label-text buy">Buy</text>
                      <line [attr.x1]="100" [attr.y1]="100" 
                            [attr.x2]="getNeedleX(overallScore())" 
                            [attr.y2]="getNeedleY(overallScore())" 
                            class="gauge-needle"/>
                      <circle cx="100" cy="100" r="6" class="gauge-pivot"/>
                    </svg>
                  </div>
                  <div class="gauge-label" [class]="getSignalClass(overallScore())">
                    {{ getSignalLabel(overallScore()) }}
                  </div>
                  <div class="score-display">Composite signal / 100</div>
                </div>

                <!-- Technical Indicators Gauge -->
                <div
                  class="gauge-card signal-card"
                  [class.signal-bearish]="technicalScore() < 40"
                  [class.signal-neutral]="technicalScore() >= 40 && technicalScore() < 60"
                  [class.signal-bullish]="technicalScore() >= 60">
                  <div class="signal-card-header">
                    <h3>Indicators</h3>
                    <span class="signal-score">{{ technicalScore() | number:'1.0-0' }}</span>
                  </div>
                  <div class="gauge-wrapper">
                    <svg viewBox="0 0 200 120" class="gauge-svg">
                      <path d="M 20 100 A 80 80 0 0 1 180 100" fill="none" stroke="rgba(148, 163, 184, 0.18)" stroke-width="12" stroke-linecap="round"/>
                      <path d="M 20 100 A 80 80 0 0 1 52 40" fill="none" stroke="#ef4444" stroke-width="12" stroke-linecap="round"/>
                      <path d="M 52 40 A 80 80 0 0 1 100 20" fill="none" stroke="#f97316" stroke-width="12"/>
                      <path d="M 100 20 A 80 80 0 0 1 148 40" fill="none" stroke="#a3a3a3" stroke-width="12"/>
                      <path d="M 148 40 A 80 80 0 0 1 180 100" fill="none" stroke="#22c55e" stroke-width="12" stroke-linecap="round"/>
                      <text x="20" y="115" class="gauge-label-text sell">Sell</text>
                      <text x="180" y="115" class="gauge-label-text buy">Buy</text>
                      <line [attr.x1]="100" [attr.y1]="100" 
                            [attr.x2]="getNeedleX(technicalScore())" 
                            [attr.y2]="getNeedleY(technicalScore())" 
                            class="gauge-needle"/>
                      <circle cx="100" cy="100" r="6" class="gauge-pivot"/>
                    </svg>
                  </div>
                  <div class="gauge-label" [class]="getSignalClass(technicalScore())">
                    {{ getSignalLabel(technicalScore()) }}
                  </div>
                  <div class="score-display">RSI + MACD pressure</div>
                </div>

                <!-- Moving Averages Gauge -->
                <div
                  class="gauge-card signal-card"
                  [class.signal-bearish]="maScore() < 40"
                  [class.signal-neutral]="maScore() >= 40 && maScore() < 60"
                  [class.signal-bullish]="maScore() >= 60">
                  <div class="signal-card-header">
                    <h3>Moving Avg</h3>
                    <span class="signal-score">{{ maScore() | number:'1.0-0' }}</span>
                  </div>
                  <div class="gauge-wrapper">
                    <svg viewBox="0 0 200 120" class="gauge-svg">
                      <path d="M 20 100 A 80 80 0 0 1 180 100" fill="none" stroke="rgba(148, 163, 184, 0.18)" stroke-width="12" stroke-linecap="round"/>
                      <path d="M 20 100 A 80 80 0 0 1 52 40" fill="none" stroke="#ef4444" stroke-width="12" stroke-linecap="round"/>
                      <path d="M 52 40 A 80 80 0 0 1 100 20" fill="none" stroke="#f97316" stroke-width="12"/>
                      <path d="M 100 20 A 80 80 0 0 1 148 40" fill="none" stroke="#a3a3a3" stroke-width="12"/>
                      <path d="M 148 40 A 80 80 0 0 1 180 100" fill="none" stroke="#22c55e" stroke-width="12" stroke-linecap="round"/>
                      <text x="20" y="115" class="gauge-label-text sell">Sell</text>
                      <text x="180" y="115" class="gauge-label-text buy">Buy</text>
                      <line [attr.x1]="100" [attr.y1]="100" 
                            [attr.x2]="getNeedleX(maScore())" 
                            [attr.y2]="getNeedleY(maScore())" 
                            class="gauge-needle"/>
                      <circle cx="100" cy="100" r="6" class="gauge-pivot"/>
                    </svg>
                  </div>
                  <div class="gauge-label" [class]="getSignalClass(maScore())">
                    {{ getSignalLabel(maScore()) }}
                  </div>
                  <div class="score-display">Trend position</div>
                </div>
              </div>

              <!-- Compact breakdown grid below gauges -->
              <div class="breakdown-grid">
                <div
                  class="breakdown-item signal-tile"
                  [class.tile-buy]="getRsiSignalClass(s.rsi) === 'buy'"
                  [class.tile-sell]="getRsiSignalClass(s.rsi) === 'sell'"
                  [class.tile-neutral]="getRsiSignalClass(s.rsi) === 'neutral'">
                  <div class="signal-tile-copy">
                    <span class="breakdown-label">RSI (14)</span>
                    <span class="signal-tile-meta">Momentum oscillator</span>
                    <button
                      type="button"
                      class="signal-help-btn"
                      aria-label="Why is RSI marked this way?"
                      [pTooltip]="getRsiSignalExplanation(s.rsi)"
                      tooltipPosition="right"
                      tooltipStyleClass="signal-explain-tooltip">
                      <i class="pi pi-info-circle" aria-hidden="true"></i>
                      Why?
                    </button>
                  </div>
                  <div class="signal-tile-reading">
                    <span class="breakdown-value" [class]="getRsiClass(s.rsi)">
                      {{ s.rsi !== null ? (s.rsi | number:'1.1-1') : 'N/A' }}
                    </span>
                    <span class="breakdown-signal" [class]="getRsiSignalClass(s.rsi)">
                      {{ getRsiShortSignal(s.rsi) }}
                    </span>
                  </div>
                </div>
                <div
                  class="breakdown-item signal-tile"
                  [class.tile-buy]="getMacdSignalClass(s.macdSignalType) === 'buy'"
                  [class.tile-sell]="getMacdSignalClass(s.macdSignalType) === 'sell'"
                  [class.tile-neutral]="getMacdSignalClass(s.macdSignalType) === 'neutral'">
                  <div class="signal-tile-copy">
                    <span class="breakdown-label">MACD</span>
                    <span class="signal-tile-meta">Momentum shift</span>
                    <button
                      type="button"
                      class="signal-help-btn"
                      aria-label="Why is MACD marked this way?"
                      [pTooltip]="getMacdSignalExplanation(s.macdSignalType, s.macdHistogram)"
                      tooltipPosition="right"
                      tooltipStyleClass="signal-explain-tooltip">
                      <i class="pi pi-info-circle" aria-hidden="true"></i>
                      Why?
                    </button>
                  </div>
                  <div class="signal-tile-reading">
                    <span class="breakdown-value" [class.positive]="(s.macdHistogram || 0) > 0" [class.negative]="(s.macdHistogram || 0) < 0">
                      {{ s.macdHistogram !== null ? (s.macdHistogram | number:'1.2-2') : 'N/A' }}
                    </span>
                    <span class="breakdown-signal" [class]="getMacdSignalClass(s.macdSignalType)">
                      {{ getMacdShortSignal(s.macdSignalType) }}
                    </span>
                  </div>
                </div>
                <div
                  class="breakdown-item signal-tile"
                  [class.tile-buy]="(s.percentFromFiftyDayMA || 0) > 0"
                  [class.tile-sell]="(s.percentFromFiftyDayMA || 0) < 0"
                  [class.tile-neutral]="(s.percentFromFiftyDayMA || 0) === 0">
                  <div class="signal-tile-copy">
                    <span class="breakdown-label">50 MA</span>
                    <span class="signal-tile-meta">Short trend</span>
                  </div>
                  <div class="signal-tile-reading">
                    <span class="breakdown-value" [class.positive]="(s.percentFromFiftyDayMA || 0) > 0" [class.negative]="(s.percentFromFiftyDayMA || 0) < 0">
                      {{ s.percentFromFiftyDayMA !== null ? ((s.percentFromFiftyDayMA >= 0 ? '+' : '') + (s.percentFromFiftyDayMA | number:'1.1-1') + '%') : 'N/A' }}
                    </span>
                    <span class="breakdown-signal" [class.buy]="(s.percentFromFiftyDayMA || 0) > 0" [class.sell]="(s.percentFromFiftyDayMA || 0) < 0">
                      {{ (s.percentFromFiftyDayMA || 0) > 0 ? 'Buy' : ((s.percentFromFiftyDayMA || 0) < 0 ? 'Sell' : '—') }}
                    </span>
                  </div>
                </div>
                <div
                  class="breakdown-item signal-tile"
                  [class.tile-buy]="(s.percentFromTwoHundredDayMA || 0) > 0"
                  [class.tile-sell]="(s.percentFromTwoHundredDayMA || 0) < 0"
                  [class.tile-neutral]="(s.percentFromTwoHundredDayMA || 0) === 0">
                  <div class="signal-tile-copy">
                    <span class="breakdown-label">200 MA</span>
                    <span class="signal-tile-meta">Long trend</span>
                  </div>
                  <div class="signal-tile-reading">
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

    .robinhood-link {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 32px;
      height: 32px;
      border-radius: 8px;
      overflow: hidden;
      transition: transform 0.15s, box-shadow 0.2s;
    }
    .robinhood-link:hover {
      transform: scale(1.1);
      box-shadow: 0 0 10px rgba(192, 255, 0, 0.4);
    }
    .robinhood-icon {
      width: 32px;
      height: 32px;
      object-fit: cover;
      display: block;
    }

    .stock-name {
      color: var(--text-color-secondary);
      font-size: 1rem;
    }

    .stock-price {
      text-align: right;
      padding: 10px 16px;
      border-radius: 12px;
      border: 1px solid transparent;
      transition: background 0.2s, border-color 0.2s;
    }

    .stock-price.price-up {
      background: rgba(76, 175, 80, 0.10);
      border-color: rgba(76, 175, 80, 0.25);
    }

    .stock-price.price-down {
      background: rgba(244, 67, 54, 0.10);
      border-color: rgba(244, 67, 54, 0.25);
    }

    .stock-price .price {
      display: block;
      font-size: 1.75rem;
      font-weight: 700;
    }

    .stock-price.price-up .price { color: var(--green-400); }
    .stock-price.price-down .price { color: var(--red-400); }

    .stock-price .change {
      font-size: 1rem;
      font-weight: 500;
    }

    .stock-price .change.positive { color: var(--green-500); }
    .stock-price .change.negative { color: var(--red-500); }

    .watchlist-add { position: relative; margin-top: 8px; text-align: right; }
    .wl-btn {
      display: inline-flex; align-items: center; gap: 6px;
      padding: 6px 14px; border-radius: 8px; font-size: 12px; font-weight: 600;
      cursor: pointer; font-family: inherit; border: 1px solid var(--surface-border);
      background: var(--surface-card); color: var(--text-color);
      transition: all 0.15s;
    }
    .wl-btn:hover { border-color: #3b82f6; color: #3b82f6; }
    .wl-btn.signin { color: #3b82f6; }
    .wl-dropdown {
      position: absolute; right: 0; top: 100%; margin-top: 4px; z-index: 100;
      background: var(--surface-card); border: 1px solid var(--surface-border);
      border-radius: 10px; padding: 6px; min-width: 200px;
      box-shadow: 0 8px 24px rgba(0,0,0,0.3);
    }
    .wl-option {
      display: flex; align-items: center; gap: 8px;
      padding: 8px 10px; border-radius: 6px; cursor: pointer;
      font-size: 13px; color: var(--text-color);
    }
    .wl-option:hover { background: var(--surface-hover); }
    .wl-option.new { color: #3b82f6; border-top: 1px solid var(--surface-border); margin-top: 4px; padding-top: 10px; }

    .target-upside { font-size: 0.75rem; font-weight: 500; }
    .target-upside.positive { color: var(--green-500); }
    .target-upside.negative { color: var(--red-500); }

    .header-metrics {
      display: flex;
      flex-direction: column;
      gap: 0.9rem;
    }

    .metric-section {
      min-width: 0;
      padding: 0.75rem;
      border: 1px solid color-mix(in srgb, var(--surface-border) 80%, transparent);
      border-radius: 10px;
      background: color-mix(in srgb, var(--surface-ground) 42%, transparent);
    }

    .performance-section {
      padding: 0.7rem 0.85rem;
      background: linear-gradient(135deg, rgba(34, 197, 94, 0.08), rgba(59, 130, 246, 0.06));
    }

    .metric-section-title {
      margin-bottom: 0.55rem;
      font-size: 0.62rem;
      font-weight: 800;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      color: var(--text-color-secondary);
    }

    .metric-sections-grid {
      display: grid;
      grid-template-columns: minmax(220px, 0.9fr) minmax(260px, 1.15fr) minmax(300px, 1.45fr);
      gap: 0.75rem;
      align-items: stretch;
    }

    .metric-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(92px, 1fr));
      gap: 0.65rem 0.75rem;
    }

    .stat-item {
      display: flex;
      flex-direction: column;
      gap: 0.22rem;
      min-width: 0;
    }

    .stat-label {
      font-size: 0.68rem;
      color: var(--text-color-secondary);
      white-space: nowrap;
    }

    .stat-value {
      font-size: 0.82rem;
      font-weight: 700;
      line-height: 1.25;
      overflow-wrap: anywhere;
    }

    .stat-value.small {
      font-size: 0.76rem;
    }

    .stat-value.negative {
      color: var(--red-500);
    }

    .period-stats-row {
      display: grid;
      grid-template-columns: repeat(6, minmax(0, 1fr));
      gap: 0.45rem;
    }

    .period-stat {
      align-items: center;
      padding: 0.45rem 0.35rem;
      border-radius: 8px;
      background: rgba(255, 255, 255, 0.025);
      text-align: center;
    }

    .period-stat .stat-label {
      color: #64748b;
      font-weight: 700;
      letter-spacing: 0.08em;
    }

    .period-change {
      font-weight: 800;
      font-variant-numeric: tabular-nums;
      white-space: nowrap;
    }

    .period-change.up { color: #34d399; }
    .period-change.down { color: #f87171; }

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

    .analysis-section::-webkit-scrollbar {
      width: 6px;
    }

    .analysis-section::-webkit-scrollbar-track {
      background: var(--surface-ground);
      border-radius: 3px;
    }

    .analysis-section::-webkit-scrollbar-thumb {
      background: var(--surface-border);
      border-radius: 3px;
    }

    .analysis-section::-webkit-scrollbar-thumb:hover {
      background: var(--text-color-secondary);
    }

    /* Technical Analysis Section */
    .analysis-section {
      position: relative;
      isolation: isolate;
      background:
        radial-gradient(circle at 18% 0%, rgba(34, 197, 94, 0.16), transparent 34%),
        radial-gradient(circle at 82% 12%, rgba(59, 130, 246, 0.12), transparent 30%),
        linear-gradient(145deg, rgba(15, 23, 42, 0.96), rgba(17, 24, 39, 0.98));
      border: 1px solid rgba(148, 163, 184, 0.12);
      border-radius: 18px;
      padding: 1rem;
      height: 100%;
      display: flex;
      flex-direction: column;
      overflow-y: auto;
      overflow-x: hidden;
      box-shadow: 0 18px 46px rgba(0, 0, 0, 0.24);
    }

    .analysis-section::before {
      content: '';
      position: absolute;
      inset: 1px;
      z-index: -1;
      border-radius: 17px;
      background:
        linear-gradient(90deg, rgba(148, 163, 184, 0.06) 1px, transparent 1px),
        linear-gradient(180deg, rgba(148, 163, 184, 0.04) 1px, transparent 1px);
      background-size: 28px 28px;
      mask-image: linear-gradient(to bottom, rgba(0, 0, 0, 0.65), transparent 78%);
    }

    .analysis-header {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 1rem;
      margin-bottom: 0.75rem;
      flex-shrink: 0;
    }

    .analysis-section h2 {
      margin: 0.1rem 0 0;
      font-size: 1.05rem;
      font-weight: 700;
      letter-spacing: -0.02em;
    }

    .analysis-eyebrow {
      color: #93c5fd;
      display: block;
      font-size: 0.58rem;
      font-weight: 700;
      letter-spacing: 0.16em;
      text-transform: uppercase;
    }

    .data-source {
      align-items: center;
      background: rgba(15, 23, 42, 0.72);
      border: 1px solid rgba(148, 163, 184, 0.16);
      border-radius: 999px;
      color: #94a3b8;
      display: inline-flex;
      flex-shrink: 0;
      font-size: 0.62rem;
      font-weight: 600;
      gap: 0.35rem;
      line-height: 1;
      padding: 0.4rem 0.55rem;
    }

    .data-source::before {
      content: '';
      width: 0.38rem;
      height: 0.38rem;
      border-radius: 999px;
      background: #22c55e;
      box-shadow: 0 0 12px rgba(34, 197, 94, 0.8);
    }

    /* Gauges Row - all 3 side by side */
    .gauges-row {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 0.65rem;
      justify-content: center;
      align-items: flex-start;
      flex-shrink: 0;
    }

    .gauge-card {
      display: flex;
      flex-direction: column;
      align-items: center;
      min-width: 0;
    }

    .signal-card {
      position: relative;
      overflow: hidden;
      padding: 0.7rem 0.55rem 0.65rem;
      border: 1px solid rgba(148, 163, 184, 0.14);
      border-radius: 14px;
      background: rgba(15, 23, 42, 0.72);
      box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.04);
      animation: signalCardIn 360ms ease-out both;
    }

    .signal-card:nth-child(2) { animation-delay: 60ms; }
    .signal-card:nth-child(3) { animation-delay: 120ms; }

    .signal-card::before {
      content: '';
      position: absolute;
      inset: 0;
      opacity: 0.75;
      pointer-events: none;
    }

    .signal-card.signal-bullish::before {
      background: linear-gradient(180deg, rgba(34, 197, 94, 0.18), transparent 64%);
    }

    .signal-card.signal-bearish::before {
      background: linear-gradient(180deg, rgba(239, 68, 68, 0.16), transparent 64%);
    }

    .signal-card.signal-neutral::before {
      background: linear-gradient(180deg, rgba(148, 163, 184, 0.12), transparent 64%);
    }

    .signal-card-header {
      position: relative;
      z-index: 1;
      display: flex;
      align-items: center;
      justify-content: space-between;
      width: 100%;
      gap: 0.5rem;
      margin-bottom: 0.2rem;
    }

    .gauge-card h3 {
      margin: 0;
      font-size: 0.68rem;
      font-weight: 700;
      color: #cbd5e1;
      white-space: nowrap;
    }

    .signal-score {
      color: #e2e8f0;
      font-size: 0.68rem;
      font-weight: 800;
      line-height: 1;
      padding: 0.25rem 0.4rem;
      border-radius: 999px;
      background: rgba(255, 255, 255, 0.06);
      border: 1px solid rgba(255, 255, 255, 0.08);
    }

    .gauge-wrapper {
      position: relative;
      z-index: 1;
      width: 118px;
      height: 72px;
    }

    .gauge-svg {
      width: 100%;
      height: 100%;
      overflow: visible;
    }

    .gauge-label-text {
      font-size: 9px;
      font-weight: 600;
      text-anchor: middle;
    }

    .gauge-label-text.sell { fill: var(--red-400); }
    .gauge-label-text.buy { fill: var(--green-400); }

    .gauge-needle {
      stroke: #e2e8f0;
      stroke-linecap: round;
      stroke-width: 3;
      filter: drop-shadow(0 0 8px rgba(226, 232, 240, 0.35));
      animation: needleSettle 520ms cubic-bezier(0.22, 1, 0.36, 1) both;
    }

    .gauge-pivot {
      fill: #0f172a;
      stroke: #94a3b8;
      stroke-width: 2;
    }

    .gauge-label {
      position: relative;
      z-index: 1;
      margin-top: 0.1rem;
      padding: 0.2rem 0.55rem;
      border-radius: 999px;
      font-weight: 700;
      font-size: 0.64rem;
      line-height: 1.1;
    }

    .gauge-label.strong_sell { background: rgba(239, 68, 68, 0.22); color: #fecaca; }
    .gauge-label.sell { background: rgba(249, 115, 22, 0.22); color: #fed7aa; }
    .gauge-label.neutral { background: rgba(148, 163, 184, 0.18); color: #cbd5e1; }
    .gauge-label.buy { background: rgba(34, 197, 94, 0.2); color: #bbf7d0; }
    .gauge-label.strong_buy { background: rgba(22, 163, 74, 0.26); color: #dcfce7; }

    .score-display {
      position: relative;
      z-index: 1;
      margin-top: 0.25rem;
      font-size: 0.58rem;
      color: #94a3b8;
      text-align: center;
    }

    /* Breakdown grid below gauges */
    .breakdown-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 0.55rem;
      margin-top: 0.75rem;
      padding-top: 0.75rem;
      border-top: 1px solid rgba(148, 163, 184, 0.12);
      flex-shrink: 0;
    }

    .breakdown-item {
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 0.7rem;
    }

    .signal-tile {
      position: relative;
      overflow: hidden;
      gap: 0.75rem;
      padding: 0.65rem;
      border: 1px solid rgba(148, 163, 184, 0.12);
      border-radius: 12px;
      background: rgba(15, 23, 42, 0.62);
      transition: border-color 0.18s, box-shadow 0.18s, transform 0.18s;
    }

    .signal-tile:hover {
      border-color: rgba(147, 197, 253, 0.38);
      box-shadow: 0 0 0 1px rgba(147, 197, 253, 0.12), 0 10px 24px rgba(0, 0, 0, 0.18);
      transform: translateY(-1px);
    }

    .signal-tile::before {
      content: '';
      position: absolute;
      inset: 0 auto 0 0;
      width: 3px;
      background: #94a3b8;
    }

    .signal-tile.tile-buy::before { background: #22c55e; }
    .signal-tile.tile-sell::before { background: #ef4444; }
    .signal-tile.tile-neutral::before { background: #94a3b8; }

    .signal-tile-copy,
    .signal-tile-reading {
      position: relative;
      z-index: 1;
      display: flex;
      flex-direction: column;
    }

    .signal-tile-copy {
      min-width: 0;
      gap: 0.15rem;
    }

    .signal-tile-reading {
      align-items: flex-end;
      gap: 0.3rem;
    }

    .breakdown-label {
      display: inline-flex;
      align-items: center;
      gap: 0.3rem;
      color: #cbd5e1;
      font-weight: 700;
      line-height: 1;
    }

    .signal-tile-meta {
      color: #64748b;
      font-size: 0.58rem;
      font-weight: 600;
      white-space: nowrap;
    }

    .signal-help-btn {
      align-items: center;
      align-self: flex-start;
      background: rgba(147, 197, 253, 0.1);
      border: 1px solid rgba(147, 197, 253, 0.22);
      border-radius: 999px;
      color: #bfdbfe;
      cursor: help;
      display: inline-flex;
      font-family: inherit;
      font-size: 0.58rem;
      font-weight: 800;
      gap: 0.25rem;
      line-height: 1;
      margin-top: 0.12rem;
      padding: 0.22rem 0.42rem;
      transition: background 0.18s, border-color 0.18s, box-shadow 0.18s, color 0.18s;
    }

    .signal-help-btn .pi {
      font-size: 0.58rem;
    }

    .signal-help-btn:hover,
    .signal-help-btn:focus-visible {
      background: rgba(147, 197, 253, 0.18);
      border-color: rgba(147, 197, 253, 0.44);
      box-shadow: 0 0 0 3px rgba(147, 197, 253, 0.1);
      color: #eff6ff;
      outline: none;
    }

    .breakdown-value {
      font-size: 0.86rem;
      font-weight: 800;
      text-align: right;
      line-height: 1;
    }

    .breakdown-value.positive { color: #34d399; }
    .breakdown-value.negative { color: #f87171; }
    .breakdown-value.oversold { color: #34d399; }
    .breakdown-value.overbought { color: #f87171; }

    .breakdown-signal {
      font-size: 0.62rem;
      font-weight: 800;
      padding: 0.18rem 0.45rem;
      border-radius: 999px;
      min-width: 42px;
      text-align: center;
      line-height: 1.1;
    }

    .breakdown-signal.buy { background: rgba(34, 197, 94, 0.18); color: #bbf7d0; }
    .breakdown-signal.sell { background: rgba(239, 68, 68, 0.18); color: #fecaca; }
    .breakdown-signal.neutral { background: rgba(148, 163, 184, 0.16); color: #cbd5e1; }

    @keyframes signalCardIn {
      from {
        opacity: 0;
        transform: translateY(8px) scale(0.98);
      }
      to {
        opacity: 1;
        transform: translateY(0) scale(1);
      }
    }

    @keyframes needleSettle {
      from {
        opacity: 0;
        transform: translateY(5px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }

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
        padding: 0.75rem;
      }
      .header-top {
        flex-direction: column;
        gap: 0.75rem;
      }
      .stock-price {
        text-align: left;
      }
      .stock-header-combined {
        padding: 1rem;
      }
      .metric-sections-grid {
        grid-template-columns: 1fr;
        gap: 0.65rem;
      }
      .metric-grid {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }
      .period-stats-row {
        grid-template-columns: repeat(3, minmax(0, 1fr));
      }
      .analysis-header {
        flex-direction: column;
        gap: 0.5rem;
      }
      .gauges-row {
        grid-template-columns: 1fr;
      }
      .breakdown-grid {
        grid-template-columns: 1fr;
      }
      .week-range-container { display: none; }
      .wl-dropdown { right: auto; left: 0; }
      .symbol-row h1 { font-size: 1.3rem; }
    }

    @media (max-width: 480px) {
      .stock-detail-container { padding: 0.5rem; }
      .stock-header-combined { padding: 0.8rem; }
      .metric-section { padding: 0.65rem; }
      .metric-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      .period-stats-row { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      .stat-item { padding: 0.4rem; }
      .stat-label { font-size: 0.6rem; }
      .stat-value { font-size: 0.75rem; }
      .symbol-row h1 { font-size: 1.1rem; }
      .stock-price .price { font-size: 1.3rem; }
      .analysis-section { padding: 0.75rem; }
      .signal-card { padding: 0.65rem 0.5rem; }
      .gauge-wrapper { width: 110px; height: 68px; }
      .stock-price .change { font-size: 0.8rem; }
    }
  `]
})
export class StockDetailComponent implements OnInit {
  private route = inject(ActivatedRoute);
  router = inject(Router);
  private http = inject(HttpClient);
  marketService = inject(MarketService);
  authService = inject(AuthService);
  watchlistService = inject(WatchlistService);

  stock = signal<Stock | null>(null);
  loading = signal(true);
  error = signal<string | null>(null);

  // Watchlist state
  showWlDropdown = false;
  private symbolWatchlistIds = signal<Set<string>>(new Set());
  
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
        this.loadStock(symbol).then(() => this.loadWatchlistState());
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
        `/api/stocks?action=search&q=${encodeURIComponent(symbol)}&technicals=true&performance=true`
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

  getRsiSignalExplanation(rsi: number | null): string {
    if (rsi == null) {
      return 'RSI signal is not available because Yahoo Finance did not return a current RSI value.';
    }

    const value = rsi.toFixed(1);
    if (rsi < 30) {
      return `RSI ${value} is below 30. Oversold readings can signal a rebound setup, so this tile marks Buy.`;
    }

    if (rsi > 70) {
      return `RSI ${value} is above 70. Overbought readings can signal stretched momentum, so this tile marks Sell.`;
    }

    return `RSI ${value} is in the 30 to 70 neutral range, so it does not trigger Buy or Sell.`;
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

  getMacdSignalExplanation(signalType: string | null, histogram: number | null): string {
    if (!signalType) {
      return 'MACD signal is not available because Yahoo Finance did not return enough MACD data.';
    }

    const histogramText = histogram == null ? 'histogram data is unavailable' : `histogram is ${histogram.toFixed(2)}`;
    if (signalType.includes('bullish')) {
      return `MACD is bullish: the line is above the signal line or crossed above it; ${histogramText}. This supports Buy.`;
    }

    if (signalType.includes('bearish')) {
      return `MACD is bearish: the line is below the signal line or crossed below it; ${histogramText}. This supports Sell.`;
    }

    return `MACD is neutral: no bullish or bearish crossover is active; ${histogramText}.`;
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

  formatEarningsDate(timestamp: number): string {
    const d = new Date(timestamp * 1000);
    const now = new Date();
    const diffDays = Math.round((d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    const dateStr = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    if (diffDays > 0 && diffDays <= 30) return `${dateStr} (in ${diffDays}d)`;
    if (diffDays === 0) return `${dateStr} (Today)`;
    return dateStr;
  }

  getRecommendationLabel(mean: number | null): string {
    if (mean == null) return '—';
    if (mean <= 1.5) return 'Strong Buy';
    if (mean <= 2.5) return 'Buy';
    if (mean <= 3.5) return 'Hold';
    if (mean <= 4.5) return 'Sell';
    return 'Strong Sell';
  }

  // --- Watchlist methods ---

  async loadWatchlistState() {
    if (!this.authService.isAuthenticated()) return;
    await this.watchlistService.loadWatchlists();
    const s = this.stock();
    if (s) {
      const inLists = await this.watchlistService.getWatchlistsForSymbol(s.symbol);
      this.symbolWatchlistIds.set(new Set(inLists.map(l => l.watchlistId)));
    }
  }

  isInWatchlist(watchlistId: string): boolean {
    return this.symbolWatchlistIds().has(watchlistId);
  }

  async addToWatchlist(wl: Watchlist, s: Stock) {
    if (this.isInWatchlist(wl.id)) return;
    await this.watchlistService.addItem(wl.id, s.symbol, s.name, s.market, s.price);
    this.symbolWatchlistIds.update(set => new Set([...set, wl.id]));
  }

  async createAndAdd(s: Stock) {
    const name = prompt('Watchlist name:');
    if (!name?.trim()) return;
    const wl = await this.watchlistService.createWatchlist(name.trim());
    if (wl) {
      await this.watchlistService.addItem(wl.id, s.symbol, s.name, s.market, s.price);
      this.symbolWatchlistIds.update(set => new Set([...set, wl.id]));
    }
    this.showWlDropdown = false;
  }
}
