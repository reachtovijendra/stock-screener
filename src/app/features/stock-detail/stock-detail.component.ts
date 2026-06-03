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
import { ChartModule } from 'primeng/chart';
import { DialogModule } from 'primeng/dialog';
import { ChartData, ChartOptions } from 'chart.js';

import { Stock } from '../../core/models/stock.model';
import { AuthService } from '../../core/services/auth.service';
import { WatchlistService, Watchlist } from '../../core/services/watchlist.service';
import { MarketService } from '../../core/services';
import { buildForecast, ForecastResult, NewsType } from './forecast-engine';
import { buildChatGptForecast, ChatGptForecast } from './chatgpt-forecast-engine';

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
    ChartModule,
    DialogModule,
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

          <!-- The Call: always-visible forecast headline -->
          @if (forecast(); as f) {
            <div class="call-band" [class]="'call-' + recTone(f.recommendation)">
              <!-- Verdict with directional steps motif -->
              <div class="call-verdict">
                <div class="call-steps" [class]="recTone(f.recommendation)" aria-hidden="true">
                  @switch (recTone(f.recommendation)) {
                    @case ('bull') {
                      <svg viewBox="0 0 64 44">
                        <polyline points="4,40 17,40 17,30 30,30 30,20 43,20 43,11 56,11" fill="none" stroke-width="3.5" stroke-linejoin="round" stroke-linecap="round"/>
                        <polygon points="56,2 47,14 63,14"/>
                      </svg>
                    }
                    @case ('bear') {
                      <svg viewBox="0 0 64 44">
                        <polyline points="4,4 17,4 17,14 30,14 30,24 43,24 43,33 56,33" fill="none" stroke-width="3.5" stroke-linejoin="round" stroke-linecap="round"/>
                        <polygon points="56,42 47,30 63,30"/>
                      </svg>
                    }
                    @default {
                      <svg viewBox="0 0 64 44">
                        <line x1="4" y1="22" x2="52" y2="22" stroke-width="3.5" stroke-linecap="round" stroke-dasharray="3 7"/>
                        <polygon points="62,22 50,15 50,29"/>
                      </svg>
                    }
                  }
                </div>
                <div class="call-verdict-text">
                  <span class="call-eyebrow">The Call &middot; 12-Month Outlook</span>
                  <span class="call-rec-pill" [class]="'rec-' + f.recommendation">{{ f.recommendationLabel }}</span>
                </div>
              </div>

              <!-- Price flow: current -> upside -> target -->
              <div class="call-numbers">
                <div class="call-num-col">
                  <span class="call-num-label">Current</span>
                  <span class="call-num-now">{{ marketService.formatCurrency(f.price, s.market) }}</span>
                </div>
                <i class="pi pi-angle-right call-flow"></i>
                <div class="call-upside" [class.positive]="f.upsidePercent >= 0" [class.negative]="f.upsidePercent < 0">
                  <span class="call-num-label">Upside</span>
                  <span class="call-upside-value">{{ f.upsidePercent >= 0 ? '+' : '' }}{{ f.upsidePercent | number:'1.2-2' }}%</span>
                </div>
                <i class="pi pi-angle-right call-flow"></i>
                <div class="call-num-col call-num-target-col">
                  <span class="call-num-label">12-Mo Target</span>
                  <span class="call-num-target">{{ marketService.formatCurrency(f.targetPrice, s.market) }}</span>
                  <span class="call-num-range">
                    <span class="bear">Bear {{ marketService.formatCurrency(f.targetLow, s.market) }}</span>
                    <span class="bull">Bull {{ marketService.formatCurrency(f.targetHigh, s.market) }}</span>
                  </span>
                </div>
              </div>

              <!-- Confidence + drill-in -->
              <div class="call-side">
                <div class="call-confidence">
                  <div class="call-confidence-head">
                    <span class="call-metric-name">Confidence
                      <button type="button" class="call-info" aria-label="What is confidence?" [pTooltip]="confidenceHelp" tooltipPosition="bottom" tooltipStyleClass="signal-explain-tooltip"><i class="pi pi-info-circle"></i></button>
                    </span>
                    <span class="call-confidence-tag" [class]="'conf-' + f.confidenceLabel.toLowerCase()">{{ f.confidenceLabel }} &middot; {{ f.confidence | number:'1.0-0' }}%</span>
                  </div>
                  <div class="call-confidence-bar"><div class="call-confidence-fill" [class]="'conf-' + f.confidenceLabel.toLowerCase()" [style.width.%]="f.confidence"></div></div>
                </div>
                <button type="button" class="call-explain-btn" (click)="openForecast()">
                  <i class="pi pi-compass"></i> How we got there
                </button>
              </div>
            </div>
          }

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

        <!-- Forecast & Recommendation Dialog -->
        <p-dialog
          [visible]="showForecastDialog()"
          (visibleChange)="showForecastDialog.set($event)"
          [modal]="true"
          [draggable]="false"
          [dismissableMask]="true"
          [style]="{ width: 'min(1100px, 95vw)' }"
          [contentStyle]="{ padding: '0' }"
          styleClass="forecast-dialog">
          @if (forecast(); as f) {
            <ng-template pTemplate="header">
              <div class="fc-dialog-header" [class]="'fc-' + recTone(f.recommendation)">
                <div class="fc-dialog-head-left">
                  <span class="fc-eyebrow">How we got there · {{ s.symbol }}</span>
                  <p class="fc-summary">{{ f.summary }}</p>
                </div>
                <div class="fc-dialog-head-call">
                  <span class="fc-rec-pill" [class]="'rec-' + f.recommendation">{{ f.recommendationLabel }}</span>
                  <span class="fc-dialog-target">{{ marketService.formatCurrency(f.targetPrice, s.market) }}
                    <span [class.positive]="f.upsidePercent >= 0" [class.negative]="f.upsidePercent < 0">({{ f.upsidePercent >= 0 ? '+' : '' }}{{ f.upsidePercent | number:'1.1-1' }}%)</span>
                  </span>
                </div>
              </div>
            </ng-template>

            <div class="forecast-dialog-body">

            <div class="fc-tabbar">
              <div class="fc-tabs" role="tablist" aria-label="Forecast detail tabs">
                <button type="button" class="fc-tab" [class.active]="forecastTab() === 'analysis'" (click)="forecastTab.set('analysis')" role="tab" [attr.aria-selected]="forecastTab() === 'analysis'">
                  <i class="pi pi-sliders-h"></i> Analysis &amp; Trade Plan
                </button>
                <button type="button" class="fc-tab" [class.active]="forecastTab() === 'projection'" (click)="forecastTab.set('projection')" role="tab" [attr.aria-selected]="forecastTab() === 'projection'">
                  <i class="pi pi-chart-line"></i> {{ f.horizonYears }}-Year Projection
                </button>
                <button type="button" class="fc-tab fc-tab-experimental" [class.active]="forecastTab() === 'chatgpt'" (click)="forecastTab.set('chatgpt')" role="tab" [attr.aria-selected]="forecastTab() === 'chatgpt'">
                  <i class="pi pi-sparkles"></i> Per ChatGPT <span class="fc-exp-badge">beta</span>
                </button>
              </div>
              <div class="fc-tech-strip" aria-label="Key technicals">
                <div class="fc-tech">
                  <span class="fc-tech-cap">P/E</span>
                  <span class="fc-tech-val">{{ s.peRatio != null ? (s.peRatio | number:'1.1-1') : '—' }}</span>
                </div>
                <div class="fc-tech">
                  <span class="fc-tech-cap">Fwd P/E</span>
                  <span class="fc-tech-val">{{ s.forwardPeRatio != null ? (s.forwardPeRatio | number:'1.1-1') : '—' }}</span>
                </div>
                <div class="fc-tech">
                  <span class="fc-tech-cap">50D MA</span>
                  <span class="fc-tech-val">{{ s.fiftyDayMA != null ? marketService.formatCurrency(s.fiftyDayMA, s.market) : '—' }}</span>
                </div>
                <div class="fc-tech">
                  <span class="fc-tech-cap">200D MA</span>
                  <span class="fc-tech-val">{{ s.twoHundredDayMA != null ? marketService.formatCurrency(s.twoHundredDayMA, s.market) : '—' }}</span>
                </div>
                <div class="fc-tech">
                  <span class="fc-tech-cap">RSI</span>
                  <span class="fc-tech-val" [class]="getRsiClass(s.rsi)">{{ s.rsi != null ? (s.rsi | number:'1.0-1') : '—' }}</span>
                </div>
                <div class="fc-tech">
                  <span class="fc-tech-cap">MACD</span>
                  <span class="fc-tech-val" [class]="getMacdSignalClass(s.macdSignalType)">{{ getMacdSignalLabel(s.macdSignalType) }}</span>
                </div>
              </div>
            </div>

            @if (forecastTab() === 'analysis') {
            <div class="fc-tab-panel">
            <div class="fc-grid">
              <!-- Trade plan -->
              <section class="fc-card">
                <h3 class="fc-card-title">Trade plan <span class="fc-horizon">{{ f.tradePlan.horizon }}</span></h3>
                <div class="fc-levels">
                  <div class="fc-level entry">
                    <span class="fc-level-label">Entry zone</span>
                    <span class="fc-level-value">{{ marketService.formatCurrency(f.tradePlan.entryLow, s.market) }} – {{ marketService.formatCurrency(f.tradePlan.entryHigh, s.market) }}</span>
                  </div>
                  <div class="fc-level target">
                    <span class="fc-level-label">Target</span>
                    <span class="fc-level-value">{{ marketService.formatCurrency(f.tradePlan.target, s.market) }}</span>
                  </div>
                  <div class="fc-level stop">
                    <span class="fc-level-label">Stop-loss</span>
                    <span class="fc-level-value">{{ marketService.formatCurrency(f.tradePlan.stop, s.market) }}</span>
                  </div>
                  <div class="fc-level rr">
                    <span class="fc-level-label">Reward : Risk</span>
                    <span class="fc-level-value">{{ f.tradePlan.riskReward != null ? (f.tradePlan.riskReward | number:'1.1-1') + ' : 1' : '—' }}</span>
                  </div>
                </div>
                <p class="fc-trade-note">{{ f.tradePlan.note }}</p>
              </section>

              <!-- Bull / Bear cases -->
              <section class="fc-card fc-cases">
                <div class="fc-case fc-case-bull">
                  <h4 class="fc-case-title bull"><i class="pi pi-arrow-up-right"></i> Bull case</h4>
                  <ul>
                    @for (b of f.bullCase; track b.label) {
                      <li><strong>{{ b.label }}.</strong> {{ b.detail }}</li>
                    }
                  </ul>
                </div>
                <div class="fc-case fc-case-bear">
                  <h4 class="fc-case-title bear"><i class="pi pi-arrow-down-right"></i> Bear case</h4>
                  <ul>
                    @for (b of f.bearCase; track b.label) {
                      <li><strong>{{ b.label }}.</strong> {{ b.detail }}</li>
                    }
                  </ul>
                </div>
              </section>
            </div>

            <div class="fc-grid">
              <!-- How we got there -->
              <section class="fc-card">
                <h3 class="fc-card-title">How we got there</h3>
                <p class="fc-card-sub">Independent fair-value estimates, weighted into a base valuation.</p>
                <div class="fc-bars">
                  @for (e of f.estimates; track e.label) {
                    <div class="fc-bar-row">
                      <div class="fc-bar-head">
                        <span class="fc-bar-label" [pTooltip]="e.detail" tooltipPosition="top" tooltipStyleClass="signal-explain-tooltip">{{ e.label }}</span>
                        <span class="fc-bar-weight">{{ e.weight * 100 | number:'1.0-0' }}% weight</span>
                      </div>
                      <div class="fc-bar-track">
                        <div class="fc-bar-fill" [style.width.%]="barPct(e.value, f)"></div>
                        <span class="fc-bar-value">{{ marketService.formatCurrency(e.value, s.market) }}</span>
                      </div>
                    </div>
                  }
                  <div class="fc-bar-row fc-bar-base">
                    <div class="fc-bar-head">
                      <span class="fc-bar-label">Weighted base valuation</span>
                    </div>
                    <div class="fc-bar-track">
                      <div class="fc-bar-fill base" [style.width.%]="barPct(f.baseValuation, f)"></div>
                      <span class="fc-bar-value">{{ marketService.formatCurrency(f.baseValuation, s.market) }}</span>
                    </div>
                  </div>
                </div>
              </section>

              <!-- Adjustments waterfall -->
              <section class="fc-card">
                <h3 class="fc-card-title">Our adjustments</h3>
                <p class="fc-card-sub">Factor tilts applied to the base to reach the target.</p>
                @if (f.adjustments.length > 0) {
                  <div class="fc-adjustments">
                    @for (a of f.adjustments; track a.label) {
                      <div class="fc-adj-row" [class]="'adj-' + a.direction">
                        <div class="fc-adj-info">
                          <span class="fc-adj-label">{{ a.label }}</span>
                          <span class="fc-adj-reason">{{ a.reason }}</span>
                        </div>
                        <span class="fc-adj-pct" [class]="'adj-' + a.direction">
                          {{ a.pct >= 0 ? '+' : '' }}{{ a.pct * 100 | number:'1.1-1' }}%
                        </span>
                      </div>
                    }
                  </div>
                } @else {
                  <p class="fc-empty">No material factor tilts — the base valuation carries the call.</p>
                }

                @let adjTotal = f.baseValuation > 0 ? (f.targetPrice - f.baseValuation) / f.baseValuation * 100 : 0;
                <div class="fc-adj-chain">
                  <div class="fc-chain-node">
                    <span class="fc-chain-cap">Weighted base</span>
                    <span class="fc-chain-num">{{ marketService.formatCurrency(f.baseValuation, s.market) }}</span>
                  </div>
                  <div class="fc-chain-op" [class.positive]="adjTotal >= 0" [class.negative]="adjTotal < 0">
                    <span class="fc-chain-pct">{{ adjTotal >= 0 ? '+' : '' }}{{ adjTotal | number:'1.1-1' }}%</span>
                    <i class="pi pi-arrow-right"></i>
                  </div>
                  <div class="fc-chain-node target">
                    <span class="fc-chain-cap">12-Mo Target</span>
                    <span class="fc-chain-num">{{ marketService.formatCurrency(f.targetPrice, s.market) }}</span>
                  </div>
                </div>
              </section>
            </div>
            </div>
            } @else if (forecastTab() === 'projection') {
            <div class="fc-tab-panel">
              <!-- Multi-year projection -->
              <section class="fc-card fc-projection">
                <div class="fc-card-head-row">
                  <div>
                    <h3 class="fc-card-title">{{ f.horizonYears }}-year price projection</h3>
                    <p class="fc-card-sub">Scenario paths from today's price, compounding the 12-month call.</p>
                  </div>
                </div>
                <div class="fc-chart-frame">
                  @if (scenarioChartData(); as data) {
                    <p-chart type="line" [data]="data" [options]="scenarioChartOptions()" height="340px" ariaLabel="Multi-year price projection scenarios"></p-chart>
                  }
                </div>
                <div class="fc-scenario-cards">
                  @for (sc of f.scenarios; track sc.key) {
                    <div class="fc-scenario" [class]="'sc-' + sc.key">
                      <span class="fc-scenario-label">{{ sc.label }}</span>
                      <span class="fc-scenario-value">{{ marketService.formatCurrency(sc.endValue, s.market) }}</span>
                      <span class="fc-scenario-change" [class.positive]="sc.changePercent >= 0" [class.negative]="sc.changePercent < 0">
                        {{ sc.changePercent >= 0 ? '+' : '' }}{{ sc.changePercent | number:'1.0-0' }}% · {{ sc.cagr >= 0 ? '+' : '' }}{{ sc.cagr | number:'1.1-1' }}% CAGR
                      </span>
                    </div>
                  }
                </div>
              </section>
            </div>
            } @else if (forecastTab() === 'chatgpt') {
            @if (chatGptForecast(); as g) {
            <div class="fc-tab-panel">
              <div class="gpt-banner">
                <i class="pi pi-sparkles"></i>
                <span><strong>Experimental model.</strong> A separate, fundamentals-first valuation per ChatGPT's design: pure intrinsic value (no price anchor, no analyst input), with technicals driving a confidence score instead of the price. Does not affect the main call.</span>
              </div>

              <!-- Headline: fundamental target + confidence -->
              <div class="gpt-headline">
                <div class="gpt-head-call">
                  <span class="fc-rec-pill" [class]="'rec-' + g.recommendation">{{ g.recommendationLabel }}</span>
                  <div class="gpt-head-target">
                    <span class="gpt-head-num">{{ marketService.formatCurrency(g.fundamentalTarget, s.market) }}</span>
                    <span class="gpt-head-up" [class.positive]="g.upsidePercent >= 0" [class.negative]="g.upsidePercent < 0">{{ g.upsidePercent >= 0 ? '+' : '' }}{{ g.upsidePercent | number:'1.1-1' }}%</span>
                  </div>
                  <span class="gpt-head-cap">Fundamental fair value (12-mo)</span>
                </div>
                <div class="gpt-head-conf">
                  <div class="gpt-conf-ring" [style.--conf.%]="g.confidence">
                    <span class="gpt-conf-num">{{ g.confidence | number:'1.0-0' }}%</span>
                  </div>
                  <span class="gpt-head-cap">Probability of reaching target · {{ g.confidenceLabel }}</span>
                </div>
              </div>

              <div class="fc-grid">
                <!-- Layer 1 + 2: fundamentals & justified multiple -->
                <section class="fc-card">
                  <h3 class="fc-card-title">Fundamentals &amp; justified multiple</h3>
                  <p class="fc-card-sub">Forward EPS at a multiple justified by history, peers and growth.</p>
                  <div class="gpt-stat-row">
                    <div class="gpt-stat"><span class="gpt-stat-cap">Trailing EPS</span><span class="gpt-stat-val">{{ g.trailingEps != null ? (g.trailingEps | number:'1.2-2') : '—' }}</span></div>
                    <div class="gpt-stat"><span class="gpt-stat-cap">Forward EPS</span><span class="gpt-stat-val">{{ g.forwardEps != null ? (g.forwardEps | number:'1.2-2') : '—' }}</span></div>
                    <div class="gpt-stat"><span class="gpt-stat-cap">Implied growth</span><span class="gpt-stat-val">{{ g.impliedGrowthPct != null ? ((g.impliedGrowthPct >= 0 ? '+' : '') + (g.impliedGrowthPct | number:'1.0-0') + '%') : '—' }}</span></div>
                    <div class="gpt-stat gpt-stat-accent"><span class="gpt-stat-cap">Justified P/E</span><span class="gpt-stat-val">{{ g.justifiedPe | number:'1.1-1' }}x</span></div>
                  </div>
                  <div class="gpt-pe-list">
                    @for (p of g.peComponents; track p.label) {
                      <div class="gpt-pe-row" [pTooltip]="p.detail" tooltipPosition="top" tooltipStyleClass="signal-explain-tooltip">
                        <span class="gpt-pe-label">{{ p.label }}</span>
                        <span class="gpt-pe-val">{{ p.value | number:'1.1-1' }}x</span>
                      </div>
                    }
                  </div>
                </section>

                <!-- Intrinsic value blend -->
                <section class="fc-card">
                  <h3 class="fc-card-title">Intrinsic value blend</h3>
                  <p class="fc-card-sub">Earnings-multiple, peer-relative and DCF values, weighted.</p>
                  <div class="fc-bars">
                    @for (c of g.components; track c.label) {
                      <div class="fc-bar-row">
                        <div class="fc-bar-head">
                          <span class="fc-bar-label" [pTooltip]="c.detail" tooltipPosition="top" tooltipStyleClass="signal-explain-tooltip">{{ c.label }}</span>
                          <span class="fc-bar-weight">{{ c.weight * 100 | number:'1.0-0' }}% weight</span>
                        </div>
                        <div class="fc-bar-track">
                          <div class="fc-bar-fill" [style.width.%]="gptBarPct(c.value, g)"></div>
                          <span class="fc-bar-value">{{ marketService.formatCurrency(c.value, s.market) }}</span>
                        </div>
                      </div>
                    }
                    <div class="fc-bar-row fc-bar-base">
                      <div class="fc-bar-head"><span class="fc-bar-label">Fundamental fair value</span></div>
                      <div class="fc-bar-track">
                        <div class="fc-bar-fill base" [style.width.%]="gptBarPct(g.fundamentalTarget, g)"></div>
                        <span class="fc-bar-value">{{ marketService.formatCurrency(g.fundamentalTarget, s.market) }}</span>
                      </div>
                    </div>
                  </div>
                </section>
              </div>

              <!-- Layer 3: Bull / Base / Bear scenarios -->
              <section class="fc-card">
                <h3 class="fc-card-title">Scenarios <span class="fc-horizon">EPS × P/E</span></h3>
                <p class="fc-card-sub">Bear / Base / Bull from earnings and multiple ranges, with reward:risk vs the volatility stop.</p>
                <div class="gpt-scn-grid">
                  @for (sc of g.scenarios; track sc.key) {
                    <div class="gpt-scn" [class]="'scn-' + sc.key">
                      <span class="gpt-scn-label">{{ sc.label }}</span>
                      <span class="gpt-scn-value">{{ marketService.formatCurrency(sc.value, s.market) }}</span>
                      <span class="gpt-scn-change" [class.positive]="sc.changePercent >= 0" [class.negative]="sc.changePercent < 0">{{ sc.changePercent >= 0 ? '+' : '' }}{{ sc.changePercent | number:'1.0-0' }}%</span>
                      <span class="gpt-scn-meta">{{ sc.eps | number:'1.2-2' }} EPS · {{ sc.pe | number:'1.1-1' }}x</span>
                      <span class="gpt-scn-rr">R:R {{ sc.rewardRisk != null ? (sc.rewardRisk | number:'1.1-1') + ' : 1' : '—' }}</span>
                    </div>
                  }
                </div>
              </section>

              <div class="fc-grid">
                <!-- Layer 4: technical confidence -->
                <section class="fc-card">
                  <h3 class="fc-card-title">Technical confidence overlay</h3>
                  <p class="fc-card-sub">Technicals adjust probability, never the price target.</p>
                  @if (g.confidenceFactors.length > 0) {
                    <div class="fc-adjustments">
                      @for (cf of g.confidenceFactors; track cf.label) {
                        <div class="fc-adj-row" [class]="'adj-' + (cf.effect >= 0 ? 'positive' : 'negative')">
                          <div class="fc-adj-info">
                            <span class="fc-adj-label">{{ cf.label }}</span>
                            <span class="fc-adj-reason">{{ cf.note }}</span>
                          </div>
                          <span class="fc-adj-pct" [class]="'adj-' + (cf.effect >= 0 ? 'positive' : 'negative')">{{ cf.effect >= 0 ? '+' : '' }}{{ cf.effect }} pts</span>
                        </div>
                      }
                    </div>
                  } @else {
                    <p class="fc-empty">No technical signals available — confidence stays at the 50% baseline.</p>
                  }
                </section>

                <!-- Model vs Street + risk -->
                <section class="fc-card">
                  <h3 class="fc-card-title">Model vs Street</h3>
                  <p class="fc-card-sub">Analyst consensus shown for validation only — not a model input.</p>
                  <div class="gpt-vs">
                    <div class="gpt-vs-side">
                      <span class="gpt-vs-cap">Model</span>
                      <span class="gpt-vs-num">{{ marketService.formatCurrency(g.fundamentalTarget, s.market) }}</span>
                    </div>
                    <div class="gpt-vs-delta" [class.positive]="(g.street.deltaPct ?? 0) >= 0" [class.negative]="(g.street.deltaPct ?? 0) < 0">
                      {{ g.street.deltaPct != null ? ((g.street.deltaPct >= 0 ? '+' : '') + (g.street.deltaPct | number:'1.1-1') + '%') : '—' }}
                    </div>
                    <div class="gpt-vs-side">
                      <span class="gpt-vs-cap">Street{{ g.street.opinions != null ? ' (' + g.street.opinions + ')' : '' }}</span>
                      <span class="gpt-vs-num">{{ g.street.target != null ? marketService.formatCurrency(g.street.target, s.market) : '—' }}</span>
                    </div>
                  </div>
                  <div class="gpt-risk">
                    <div class="gpt-stat"><span class="gpt-stat-cap">Entry zone</span><span class="gpt-stat-val">{{ marketService.formatCurrency(g.tradePlan.entryLow, s.market) }} – {{ marketService.formatCurrency(g.tradePlan.entryHigh, s.market) }}</span></div>
                    <div class="gpt-stat"><span class="gpt-stat-cap">Vol. stop</span><span class="gpt-stat-val">{{ marketService.formatCurrency(g.tradePlan.stop, s.market) }} (−{{ g.tradePlan.volatilityPct * 100 | number:'1.0-0' }}%)</span></div>
                  </div>
                  <p class="fc-trade-note">{{ g.tradePlan.note }}</p>
                </section>
              </div>

              <ul class="gpt-notes">
                @for (n of g.notes; track n) { <li><i class="pi pi-info-circle"></i> {{ n }}</li> }
              </ul>
            </div>
            }
            }

            <!-- Footer / disclaimer -->
            <div class="fc-footer">
              <span class="fc-footer-sources"><i class="pi pi-database"></i> {{ f.sources.join(' · ') }}</span>
              <span class="fc-footer-disclaimer">Model-based estimate generated from live data — not financial advice. Do your own research.</span>
            </div>
            </div>
          }
        </p-dialog>

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

    /* ===================== The Call band (always visible) ===================== */
    .call-band {
      display: flex;
      align-items: stretch;
      margin-bottom: 1rem;
      border-radius: 16px;
      border: 1px solid rgba(148, 163, 184, 0.16);
      border-left: 4px solid #475569;
      background:
        radial-gradient(circle at 0% 0%, rgba(59, 130, 246, 0.1), transparent 40%),
        linear-gradient(145deg, rgba(15, 23, 42, 0.94), rgba(17, 24, 39, 0.97));
      box-shadow: 0 12px 34px rgba(0, 0, 0, 0.26);
      overflow: hidden;
      animation: callBandIn 340ms cubic-bezier(0.22, 1, 0.36, 1) both;
    }
    .call-band.call-bull { border-left-color: #22c55e; background: radial-gradient(circle at 0% 0%, rgba(34, 197, 94, 0.12), transparent 42%), linear-gradient(145deg, rgba(15, 23, 42, 0.94), rgba(17, 24, 39, 0.97)); }
    .call-band.call-bear { border-left-color: #ef4444; background: radial-gradient(circle at 0% 0%, rgba(239, 68, 68, 0.1), transparent 42%), linear-gradient(145deg, rgba(15, 23, 42, 0.94), rgba(17, 24, 39, 0.97)); }
    .call-band.call-neutral { border-left-color: #f59e0b; }

    @keyframes callBandIn {
      from { opacity: 0; transform: translateY(-6px); }
      to { opacity: 1; transform: translateY(0); }
    }

    /* Verdict segment */
    .call-verdict {
      flex: 0 0 auto;
      display: flex; align-items: center; gap: 1.1rem;
      padding: 0.95rem 1.6rem;
      border-right: 1px solid rgba(148, 163, 184, 0.12);
    }
    .call-steps { width: 64px; height: 44px; flex-shrink: 0; }
    .call-steps svg { width: 100%; height: 100%; overflow: visible; }
    .call-steps polyline, .call-steps line { stroke: currentColor; }
    .call-steps polygon { fill: currentColor; }
    .call-steps.bull { color: #34d399; filter: drop-shadow(0 0 9px rgba(52, 211, 153, 0.5)); animation: stepsRise 600ms cubic-bezier(0.22, 1, 0.36, 1) both; }
    .call-steps.bear { color: #f87171; filter: drop-shadow(0 0 9px rgba(248, 113, 113, 0.5)); animation: stepsFall 600ms cubic-bezier(0.22, 1, 0.36, 1) both; }
    .call-steps.neutral { color: #fbbf24; filter: drop-shadow(0 0 8px rgba(251, 191, 36, 0.4)); }
    @keyframes stepsRise { from { opacity: 0; transform: translate(-6px, 6px); } to { opacity: 1; transform: translate(0, 0); } }
    @keyframes stepsFall { from { opacity: 0; transform: translate(-6px, -6px); } to { opacity: 1; transform: translate(0, 0); } }

    .call-verdict-text { display: flex; flex-direction: column; align-items: flex-start; gap: 0.4rem; }
    .call-eyebrow {
      color: #93c5fd; font-size: 0.56rem; font-weight: 800;
      letter-spacing: 0.14em; text-transform: uppercase;
    }
    .call-metric-name {
      font-size: 0.56rem; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.1em;
      display: inline-flex; align-items: center; gap: 0.3rem;
    }
    .call-info { background: none; border: none; padding: 0; margin: 0; color: #64748b; cursor: help; display: inline-flex; align-items: center; transition: color 0.15s; }
    .call-info:hover, .call-info:focus-visible { color: #93c5fd; outline: none; }
    .call-info .pi { font-size: 0.7rem; }

    /* Shared recommendation pill (band + dialog header) */
    .call-rec-pill, .fc-rec-pill { font-weight: 800; letter-spacing: 0.02em; text-transform: uppercase; border-radius: 11px; line-height: 1; white-space: nowrap; }
    .call-rec-pill { font-size: 1.35rem; padding: 0.5rem 1.35rem; }
    .fc-rec-pill { font-size: 1.05rem; padding: 0.35rem 0.9rem; }
    .call-rec-pill.rec-strong_buy, .fc-rec-pill.rec-strong_buy { background: rgba(22, 163, 74, 0.28); color: #bbf7d0; box-shadow: inset 0 0 0 1px rgba(34, 197, 94, 0.5); }
    .call-rec-pill.rec-buy, .fc-rec-pill.rec-buy { background: rgba(34, 197, 94, 0.2); color: #bbf7d0; box-shadow: inset 0 0 0 1px rgba(34, 197, 94, 0.4); }
    .call-rec-pill.rec-hold, .fc-rec-pill.rec-hold { background: rgba(251, 191, 36, 0.18); color: #fde68a; box-shadow: inset 0 0 0 1px rgba(251, 191, 36, 0.4); }
    .call-rec-pill.rec-sell, .fc-rec-pill.rec-sell { background: rgba(249, 115, 22, 0.2); color: #fed7aa; box-shadow: inset 0 0 0 1px rgba(249, 115, 22, 0.4); }
    .call-rec-pill.rec-strong_sell, .fc-rec-pill.rec-strong_sell { background: rgba(239, 68, 68, 0.24); color: #fecaca; box-shadow: inset 0 0 0 1px rgba(239, 68, 68, 0.5); }

    /* Numbers segment grows to fill the band and spreads its content evenly */
    .call-numbers {
      flex: 1 1 auto;
      display: flex; align-items: center; justify-content: space-evenly; gap: 1rem;
      padding: 0.95rem 1.5rem;
      border-right: 1px solid rgba(148, 163, 184, 0.12);
    }
    .call-num-col { display: flex; flex-direction: column; align-items: center; gap: 0.25rem; }
    .call-num-label { font-size: 0.56rem; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.1em; }
    .call-num-now { font-family: var(--font-mono); font-size: 1.35rem; font-weight: 700; color: #cbd5e1; }
    .call-num-target { font-family: var(--font-mono); font-size: 1.7rem; font-weight: 800; color: #f8fafc; line-height: 1; }
    .call-num-range { display: flex; gap: 0.65rem; font-size: 0.6rem; font-weight: 700; }
    .call-num-range .bear { color: #f87171; }
    .call-num-range .bull { color: #34d399; }
    .call-flow { color: #475569; font-size: 1.05rem; }
    .call-upside { display: flex; flex-direction: column; align-items: center; gap: 0.2rem; }
    .call-upside-value { font-family: var(--font-mono); font-size: 1.95rem; font-weight: 800; line-height: 1; }
    .call-upside.positive .call-upside-value { color: #4ade80; }
    .call-upside.negative .call-upside-value { color: #f87171; }

    /* Confidence + CTA segment */
    .call-side { flex: 0 0 auto; width: 240px; display: flex; flex-direction: column; justify-content: center; gap: 0.65rem; padding: 0.95rem 1.5rem; }
    .call-confidence-head { display: flex; justify-content: space-between; align-items: center; font-size: 0.62rem; color: #94a3b8; margin-bottom: 0.35rem; gap: 0.5rem; }
    .call-confidence-tag { font-weight: 700; padding: 0.12rem 0.45rem; border-radius: 999px; white-space: nowrap; }
    .call-confidence-tag.conf-high { background: rgba(34, 197, 94, 0.18); color: #bbf7d0; }
    .call-confidence-tag.conf-moderate { background: rgba(251, 191, 36, 0.16); color: #fde68a; }
    .call-confidence-tag.conf-low { background: rgba(148, 163, 184, 0.16); color: #cbd5e1; }
    .call-confidence-bar { height: 7px; border-radius: 999px; background: rgba(148, 163, 184, 0.16); overflow: hidden; }
    .call-confidence-fill { height: 100%; border-radius: 999px; transition: width 0.6s ease; }
    .call-confidence-fill.conf-high { background: linear-gradient(90deg, #22c55e, #4ade80); }
    .call-confidence-fill.conf-moderate { background: linear-gradient(90deg, #f59e0b, #fbbf24); }
    .call-confidence-fill.conf-low { background: linear-gradient(90deg, #64748b, #94a3b8); }
    .call-explain-btn {
      display: inline-flex; align-items: center; justify-content: center; gap: 0.5rem; width: 100%;
      padding: 0.55rem 1rem; border-radius: 10px; cursor: pointer; font-family: inherit;
      font-size: 0.8rem; font-weight: 700; color: #e8edff;
      border: 1px solid rgba(96, 165, 250, 0.45);
      background: linear-gradient(135deg, rgba(59, 130, 246, 0.22), rgba(139, 92, 246, 0.22));
      transition: transform 0.15s, box-shadow 0.2s, border-color 0.2s;
    }
    .call-explain-btn:hover { transform: translateY(-1px); border-color: rgba(96, 165, 250, 0.7); box-shadow: 0 8px 20px rgba(37, 99, 235, 0.25); }
    .call-explain-btn .pi { color: #93c5fd; }

    @media (max-width: 1080px) {
      .call-band { flex-wrap: wrap; }
      .call-verdict, .call-numbers, .call-side {
        flex: 1 1 100%; width: auto;
        border-right: none; border-bottom: 1px solid rgba(148, 163, 184, 0.12);
      }
      .call-verdict { justify-content: center; }
      .call-side { border-bottom: none; }
    }

    /* ===================== Forecast Dialog ===================== */
    .fc-eyebrow {
      color: #93c5fd; font-size: 0.6rem; font-weight: 700;
      letter-spacing: 0.16em; text-transform: uppercase;
    }
    .fc-summary { margin: 0.15rem 0 0; font-size: 0.82rem; line-height: 1.5; color: #cbd5e1; }

    .fc-dialog-header { display: flex; align-items: center; justify-content: space-between; gap: 1rem; width: 100%; }
    .fc-dialog-head-left { display: flex; flex-direction: column; gap: 0.3rem; min-width: 0; }
    .fc-dialog-head-call { display: flex; flex-direction: column; align-items: flex-end; gap: 0.4rem; flex-shrink: 0; }
    .fc-dialog-target { font-size: 1rem; font-weight: 800; color: #f1f5f9; white-space: nowrap; }
    .fc-dialog-target .positive { color: #4ade80; font-size: 0.85rem; }
    .fc-dialog-target .negative { color: #f87171; font-size: 0.85rem; }
    .forecast-dialog-body { display: flex; flex-direction: column; gap: 0.85rem; padding: 1.25rem; }

    /* Tabs */
    .fc-tabbar { display: flex; align-items: center; justify-content: space-between; gap: 1rem; flex-wrap: wrap; }
    .fc-tech-strip { display: flex; align-items: stretch; gap: 0.4rem; flex-wrap: wrap; }
    .fc-tech {
      display: flex; flex-direction: column; justify-content: center; gap: 0.12rem;
      padding: 0.32rem 0.65rem; border-radius: 9px;
      background: rgba(15, 23, 42, 0.6); border: 1px solid rgba(148, 163, 184, 0.14);
    }
    .fc-tech-cap { font-size: 0.52rem; text-transform: uppercase; letter-spacing: 0.08em; color: #94a3b8; font-weight: 700; }
    .fc-tech-val { font-family: var(--font-mono); font-size: 0.82rem; font-weight: 800; color: #e2e8f0; white-space: nowrap; line-height: 1.1; }
    .fc-tech-val.buy, .fc-tech-val.oversold { color: #4ade80; }
    .fc-tech-val.sell, .fc-tech-val.overbought { color: #f87171; }
    .fc-tech-val.neutral { color: #e2e8f0; }

    .fc-tabs {
      display: inline-flex; gap: 0.3rem; align-self: flex-start;
      padding: 0.3rem; border-radius: 12px;
      background: rgba(15, 23, 42, 0.6);
      border: 1px solid rgba(148, 163, 184, 0.14);
    }
    .fc-tab {
      display: inline-flex; align-items: center; gap: 0.45rem;
      padding: 0.5rem 1.1rem; border-radius: 9px; cursor: pointer;
      font-family: inherit; font-size: 0.82rem; font-weight: 700; letter-spacing: 0.01em;
      color: #94a3b8; background: transparent; border: none;
      transition: color 0.15s, background 0.2s, box-shadow 0.2s;
    }
    .fc-tab:hover { color: #cbd5e1; }
    .fc-tab .pi { font-size: 0.8rem; }
    .fc-tab.active {
      color: #e8edff;
      background: linear-gradient(135deg, rgba(59, 130, 246, 0.28), rgba(139, 92, 246, 0.26));
      box-shadow: inset 0 0 0 1px rgba(96, 165, 250, 0.45), 0 4px 14px rgba(37, 99, 235, 0.22);
    }
    .fc-tab.active .pi { color: #93c5fd; }
    .fc-tab-panel { display: flex; flex-direction: column; gap: 0.85rem; animation: fcTabIn 240ms ease both; }
    @keyframes fcTabIn { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: translateY(0); } }

    /* Experimental "Per ChatGPT" tab */
    .fc-tab-experimental .fc-exp-badge {
      font-size: 0.6rem; font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase;
      padding: 0.05rem 0.35rem; border-radius: 999px; margin-left: 0.1rem;
      background: rgba(168, 85, 247, 0.25); color: #d8b4fe; border: 1px solid rgba(168, 85, 247, 0.4);
    }
    .gpt-banner {
      display: flex; align-items: flex-start; gap: 0.6rem; padding: 0.7rem 0.9rem; border-radius: 12px;
      background: linear-gradient(135deg, rgba(139, 92, 246, 0.14), rgba(59, 130, 246, 0.1));
      border: 1px solid rgba(168, 85, 247, 0.28); color: #c7d2fe; font-size: 0.82rem; line-height: 1.4;
    }
    .gpt-banner .pi { color: #c084fc; margin-top: 0.1rem; }
    .gpt-banner strong { color: #e9d5ff; }

    .gpt-headline {
      display: flex; flex-wrap: wrap; gap: 1rem; align-items: center; justify-content: space-between;
      padding: 1rem 1.1rem; border-radius: 14px;
      background: linear-gradient(160deg, rgba(17, 24, 39, 0.7), rgba(15, 23, 42, 0.7));
      border: 1px solid rgba(148, 163, 184, 0.16);
    }
    .gpt-head-call { display: flex; flex-direction: column; gap: 0.4rem; }
    .gpt-head-target { display: flex; align-items: baseline; gap: 0.5rem; }
    .gpt-head-num { font-family: var(--font-mono, monospace); font-size: 1.7rem; font-weight: 700; color: #f1f5f9; }
    .gpt-head-up { font-family: var(--font-mono, monospace); font-size: 1rem; font-weight: 600; }
    .gpt-head-up.positive { color: #34d399; }
    .gpt-head-up.negative { color: #f87171; }
    .gpt-head-cap { font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.05em; color: #94a3b8; }
    .gpt-head-conf { display: flex; flex-direction: column; align-items: center; gap: 0.4rem; }
    .gpt-conf-ring {
      --conf: 50; width: 84px; height: 84px; border-radius: 50%; position: relative;
      background: conic-gradient(#a855f7 calc(var(--conf) * 1%), rgba(148, 163, 184, 0.18) 0);
      display: grid; place-items: center;
    }
    .gpt-conf-ring::after { content: ''; position: absolute; width: 64px; height: 64px; border-radius: 50%; background: #0f172a; }
    .gpt-conf-num { position: relative; z-index: 1; font-family: var(--font-mono, monospace); font-weight: 700; color: #e9d5ff; font-size: 1.05rem; }

    .gpt-stat-row { display: flex; flex-wrap: wrap; gap: 0.5rem; margin-bottom: 0.7rem; }
    .gpt-stat {
      flex: 1 1 90px; display: flex; flex-direction: column; gap: 0.2rem; padding: 0.5rem 0.6rem;
      border-radius: 10px; background: rgba(15, 23, 42, 0.55); border: 1px solid rgba(148, 163, 184, 0.12);
    }
    .gpt-stat-cap { font-size: 0.68rem; text-transform: uppercase; letter-spacing: 0.04em; color: #94a3b8; }
    .gpt-stat-val { font-family: var(--font-mono, monospace); font-weight: 600; color: #e2e8f0; font-size: 0.92rem; }
    .gpt-stat-accent { background: rgba(168, 85, 247, 0.12); border-color: rgba(168, 85, 247, 0.3); }
    .gpt-stat-accent .gpt-stat-val { color: #d8b4fe; }

    .gpt-pe-list { display: flex; flex-direction: column; gap: 0.35rem; }
    .gpt-pe-row { display: flex; align-items: center; justify-content: space-between; padding: 0.35rem 0.1rem; border-bottom: 1px dashed rgba(148, 163, 184, 0.12); }
    .gpt-pe-row:last-child { border-bottom: none; }
    .gpt-pe-label { font-size: 0.82rem; color: #cbd5e1; }
    .gpt-pe-val { font-family: var(--font-mono, monospace); font-weight: 600; color: #e2e8f0; }

    .gpt-scn-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 0.6rem; }
    .gpt-scn { display: flex; flex-direction: column; gap: 0.25rem; padding: 0.7rem 0.8rem; border-radius: 12px; background: rgba(15, 23, 42, 0.55); border: 1px solid rgba(148, 163, 184, 0.14); }
    .gpt-scn.scn-bear { border-color: rgba(248, 113, 113, 0.35); }
    .gpt-scn.scn-base { border-color: rgba(96, 165, 250, 0.4); }
    .gpt-scn.scn-bull { border-color: rgba(52, 211, 153, 0.4); }
    .gpt-scn-label { font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.05em; color: #94a3b8; }
    .gpt-scn-value { font-family: var(--font-mono, monospace); font-size: 1.15rem; font-weight: 700; color: #f1f5f9; }
    .gpt-scn-change { font-family: var(--font-mono, monospace); font-weight: 600; font-size: 0.85rem; }
    .gpt-scn-change.positive { color: #34d399; }
    .gpt-scn-change.negative { color: #f87171; }
    .gpt-scn-meta { font-size: 0.72rem; color: #94a3b8; }
    .gpt-scn-rr { font-size: 0.74rem; color: #cbd5e1; }

    .gpt-vs { display: flex; align-items: center; justify-content: space-between; gap: 0.6rem; padding: 0.5rem 0; }
    .gpt-vs-side { display: flex; flex-direction: column; gap: 0.2rem; }
    .gpt-vs-cap { font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.04em; color: #94a3b8; }
    .gpt-vs-num { font-family: var(--font-mono, monospace); font-weight: 700; color: #e2e8f0; font-size: 1.05rem; }
    .gpt-vs-delta { font-family: var(--font-mono, monospace); font-weight: 700; font-size: 0.95rem; padding: 0.25rem 0.5rem; border-radius: 8px; background: rgba(148, 163, 184, 0.1); }
    .gpt-vs-delta.positive { color: #34d399; }
    .gpt-vs-delta.negative { color: #f87171; }
    .gpt-risk { display: flex; gap: 0.5rem; margin-top: 0.5rem; }

    .gpt-notes { list-style: none; padding: 0; margin: 0.2rem 0 0; display: flex; flex-direction: column; gap: 0.3rem; }
    .gpt-notes li { font-size: 0.74rem; color: #94a3b8; display: flex; align-items: flex-start; gap: 0.4rem; }
    .gpt-notes .pi { color: #c084fc; margin-top: 0.1rem; font-size: 0.7rem; }

    @media (max-width: 640px) { .gpt-scn-grid { grid-template-columns: 1fr; } }

    :host ::ng-deep .forecast-dialog .p-dialog { border: 1px solid rgba(148, 163, 184, 0.18); border-radius: 18px; box-shadow: 0 30px 80px rgba(0, 0, 0, 0.5); overflow: hidden; }
    :host ::ng-deep .forecast-dialog .p-dialog-header { background: linear-gradient(145deg, rgba(15, 23, 42, 0.98), rgba(17, 24, 39, 0.98)); border-bottom: 1px solid rgba(148, 163, 184, 0.14); padding: 1rem 1.25rem; }
    :host ::ng-deep .forecast-dialog .p-dialog-content { background: linear-gradient(160deg, rgba(13, 18, 30, 0.98), rgba(15, 23, 42, 0.98)); color: #e2e8f0; }
    :host ::ng-deep .forecast-dialog .p-dialog-header-icon { color: #cbd5e1; }

    /* Cards */
    .fc-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0.85rem; }
    .fc-card {
      padding: 1rem 1.15rem; border-radius: 16px;
      border: 1px solid rgba(148, 163, 184, 0.14);
      background: linear-gradient(145deg, rgba(17, 24, 39, 0.7), rgba(15, 23, 42, 0.78));
      box-shadow: 0 10px 30px rgba(0, 0, 0, 0.18);
    }
    .fc-card-title { margin: 0; font-size: 0.95rem; font-weight: 700; color: #f1f5f9; display: flex; align-items: center; gap: 0.5rem; }
    .fc-horizon { font-size: 0.62rem; font-weight: 700; color: #93c5fd; background: rgba(147, 197, 253, 0.12); padding: 0.12rem 0.45rem; border-radius: 999px; }
    .fc-card-sub { margin: 0.25rem 0 0.85rem; font-size: 0.7rem; color: #94a3b8; line-height: 1.4; }
    .fc-empty { font-size: 0.78rem; color: #94a3b8; }
    .fc-card-head-row { display: flex; justify-content: space-between; align-items: flex-start; }

    /* Valuation bars */
    .fc-bars { display: flex; flex-direction: column; gap: 0.7rem; }
    .fc-bar-row { display: flex; flex-direction: column; gap: 0.3rem; }
    .fc-bar-head { display: flex; justify-content: space-between; align-items: center; }
    .fc-bar-label { font-size: 0.74rem; font-weight: 600; color: #cbd5e1; }
    .fc-bar-weight { font-size: 0.62rem; color: #64748b; font-weight: 600; }
    .fc-bar-track { position: relative; height: 26px; border-radius: 7px; background: rgba(148, 163, 184, 0.08); display: flex; align-items: center; }
    .fc-bar-fill { position: absolute; left: 0; top: 0; height: 100%; border-radius: 7px; background: linear-gradient(90deg, rgba(96, 165, 250, 0.35), rgba(96, 165, 250, 0.6)); transition: width 0.5s ease; }
    .fc-bar-fill.base { background: linear-gradient(90deg, rgba(52, 211, 153, 0.4), rgba(52, 211, 153, 0.7)); }
    .fc-bar-value { position: relative; z-index: 1; margin-left: auto; padding-right: 0.6rem; font-size: 0.76rem; font-weight: 800; color: #f1f5f9; font-variant-numeric: tabular-nums; }
    .fc-bar-base .fc-bar-label { color: #6ee7b7; font-weight: 700; }

    /* Adjustments */
    .fc-adjustments { display: flex; flex-direction: column; gap: 0.5rem; }
    .fc-adj-row {
      display: flex; align-items: center; justify-content: space-between; gap: 0.75rem;
      padding: 0.5rem 0.65rem; border-radius: 10px;
      background: rgba(15, 23, 42, 0.5);
      border-left: 3px solid #64748b;
    }
    .fc-adj-row.adj-positive { border-left-color: #22c55e; }
    .fc-adj-row.adj-negative { border-left-color: #ef4444; }
    .fc-adj-info { display: flex; flex-direction: column; gap: 0.15rem; min-width: 0; }
    .fc-adj-label { font-size: 0.74rem; font-weight: 700; color: #e2e8f0; }
    .fc-adj-reason { font-size: 0.66rem; color: #94a3b8; line-height: 1.35; }
    .fc-adj-pct { font-size: 0.82rem; font-weight: 800; font-variant-numeric: tabular-nums; white-space: nowrap; }
    .fc-adj-pct.adj-positive { color: #4ade80; }
    .fc-adj-pct.adj-negative { color: #f87171; }
    .fc-adj-pct.adj-neutral { color: #94a3b8; }

    /* Adjustments -> target chain */
    .fc-adj-chain {
      display: flex; align-items: stretch; gap: 0.6rem; margin-top: 0.9rem;
      padding-top: 0.9rem; border-top: 1px dashed rgba(148, 163, 184, 0.18);
    }
    .fc-chain-node {
      flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 0.2rem;
      padding: 0.55rem 0.8rem; border-radius: 12px;
      background: rgba(15, 23, 42, 0.55); border: 1px solid rgba(148, 163, 184, 0.12);
    }
    .fc-chain-node.target { border-color: rgba(96, 165, 250, 0.4); background: linear-gradient(135deg, rgba(59, 130, 246, 0.16), rgba(15, 23, 42, 0.55)); }
    .fc-chain-cap { font-size: 0.56rem; text-transform: uppercase; letter-spacing: 0.08em; color: #94a3b8; font-weight: 700; }
    .fc-chain-node.target .fc-chain-cap { color: #93c5fd; }
    .fc-chain-num { font-family: var(--font-mono); font-size: 1.05rem; font-weight: 800; color: #f1f5f9; }
    .fc-chain-op {
      display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 0.1rem;
      min-width: 60px; font-weight: 800; font-size: 0.8rem;
    }
    .fc-chain-op .pi { font-size: 0.95rem; opacity: 0.55; }
    .fc-chain-op.positive { color: #4ade80; }
    .fc-chain-op.negative { color: #f87171; }

    /* Projection */
    .fc-projection { display: flex; flex-direction: column; }
    .fc-chart-frame { position: relative; width: 100%; height: 300px; margin-top: 0.5rem; }
    .fc-scenario-cards { display: grid; grid-template-columns: repeat(3, 1fr); gap: 0.65rem; margin-top: 0.85rem; }
    .fc-scenario {
      display: flex; flex-direction: column; gap: 0.2rem; padding: 0.7rem 0.85rem;
      border-radius: 12px; background: rgba(15, 23, 42, 0.55); border: 1px solid rgba(148, 163, 184, 0.12);
    }
    .fc-scenario.sc-optimistic { border-top: 2px solid #34d399; }
    .fc-scenario.sc-target { border-top: 2px solid #60a5fa; }
    .fc-scenario.sc-conservative { border-top: 2px solid #f87171; }
    .fc-scenario-label { font-size: 0.62rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: #94a3b8; }
    .fc-scenario-value { font-size: 1.15rem; font-weight: 800; color: #f1f5f9; }
    .fc-scenario-change { font-size: 0.66rem; font-weight: 700; }
    .fc-scenario-change.positive { color: #4ade80; }
    .fc-scenario-change.negative { color: #f87171; }

    /* Trade plan */
    .fc-levels { display: grid; grid-template-columns: 1fr 1fr; gap: 0.6rem; }
    .fc-level {
      display: flex; flex-direction: column; gap: 0.25rem; padding: 0.6rem 0.7rem;
      border-radius: 10px; background: rgba(15, 23, 42, 0.5); border: 1px solid rgba(148, 163, 184, 0.12);
    }
    .fc-level-label { font-size: 0.62rem; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.08em; }
    .fc-level-value { font-size: 0.92rem; font-weight: 800; color: #f1f5f9; font-variant-numeric: tabular-nums; }
    .fc-level.entry { border-left: 3px solid #60a5fa; }
    .fc-level.target { border-left: 3px solid #34d399; }
    .fc-level.stop { border-left: 3px solid #f87171; }
    .fc-level.rr { border-left: 3px solid #a78bfa; }
    .fc-trade-note { margin: 0.7rem 0 0; font-size: 0.7rem; color: #94a3b8; line-height: 1.45; }

    /* Bull / bear */
    .fc-cases { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; }
    .fc-case-title { margin: 0 0 0.5rem; font-size: 0.8rem; font-weight: 800; display: flex; align-items: center; gap: 0.4rem; }
    .fc-case-title.bull { color: #4ade80; }
    .fc-case-title.bear { color: #f87171; }
    .fc-case ul { margin: 0; padding-left: 1.05rem; display: flex; flex-direction: column; gap: 0.4rem; }
    .fc-case li { font-size: 0.74rem; color: #cbd5e1; line-height: 1.4; }
    .fc-case li strong { color: #f1f5f9; }
    .fc-case-bull li::marker { color: #22c55e; }
    .fc-case-bear li::marker { color: #ef4444; }

    /* Footer */
    .fc-footer {
      display: flex; justify-content: space-between; align-items: center; gap: 1rem; flex-wrap: wrap;
      padding: 0.7rem 1rem; border-radius: 12px;
      background: rgba(15, 23, 42, 0.5); border: 1px dashed rgba(148, 163, 184, 0.2);
    }
    .fc-footer-sources { font-size: 0.66rem; color: #94a3b8; display: inline-flex; align-items: center; gap: 0.4rem; }
    .fc-footer-sources .pi { color: #64748b; font-size: 0.7rem; }
    .fc-footer-disclaimer { font-size: 0.64rem; color: #64748b; font-style: italic; }

    @media (max-width: 1100px) {
      .fc-grid { grid-template-columns: 1fr; }
      .fc-cases { grid-template-columns: 1fr; }
    }

    @media (max-width: 640px) {
      .fc-scenario-cards { grid-template-columns: 1fr; }
      .fc-levels { grid-template-columns: 1fr; }
      .forecast-cta-sub { display: none; }
      .fc-footer { flex-direction: column; align-items: flex-start; }
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
      .news-section {
        padding: 0.85rem;
      }
      .news-header {
        align-items: stretch;
        flex-direction: column;
        gap: 0.6rem;
      }
      .news-header h2 {
        white-space: normal;
      }
      .news-filters {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 0.45rem;
        width: 100%;
      }
      :host ::ng-deep .news-filter-select {
        max-width: none;
        min-width: 0;
        width: 100%;
      }
      :host ::ng-deep .news-filter-select .p-multiselect {
        width: 100%;
      }
      :host ::ng-deep .news-filter-select .p-multiselect-label {
        min-width: 0;
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

  // Forecast dialog state
  showForecastDialog = signal(false);
  forecastTab = signal<'analysis' | 'projection' | 'chatgpt'>('analysis');

  openForecast(): void {
    this.forecastTab.set('analysis');
    this.showForecastDialog.set(true);
  }

  // Plain-language explanation for the single headline trust metric.
  // (Direction and strength are conveyed by the Buy/Hold/Sell pill and the upside %.)
  readonly confidenceHelp =
    'Confidence is how trustworthy this call is - not how bullish it is (a Strong Sell can be high-confidence). ' +
    'It rises when many analysts cover the stock, the independent valuations agree with each other, ' +
    'and the signals all point the same way; lower means more uncertainty. ' +
    'It reflects data quality and agreement today, not a backtested hit-rate.';

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

  // --- Forecast engine ---

  /** Deterministic forecast derived from the loaded stock + news catalysts. */
  forecast = computed<ForecastResult | null>(() => {
    const s = this.stock();
    if (!s) return null;
    const newsTypes = this.news().map(n => n.type as NewsType);
    return buildForecast(s, newsTypes);
  });

  /**
   * EXPERIMENTAL — parallel "Per ChatGPT" model powering its own dialog tab.
   * Independent of the production forecast above; see chatgpt-forecast-engine.ts.
   */
  chatGptForecast = computed<ChatGptForecast | null>(() => {
    const s = this.stock();
    if (!s) return null;
    return buildChatGptForecast(s);
  });

  private currencySymbol(): string {
    const c = this.stock()?.currency;
    if (c === 'INR') return '₹';
    if (c === 'USD') return '$';
    return c ? c + ' ' : '$';
  }

  scenarioChartData = computed<ChartData<'line'> | null>(() => {
    const f = this.forecast();
    if (!f) return null;
    const find = (key: string) => f.scenarios.find(s => s.key === key)?.path ?? [];
    return {
      labels: f.scenarioLabels,
      datasets: [
        {
          label: 'Optimistic',
          data: find('optimistic'),
          borderColor: '#34d399',
          backgroundColor: 'rgba(52, 211, 153, 0.06)',
          borderWidth: 2,
          borderDash: [6, 4],
          pointRadius: 0,
          pointHoverRadius: 4,
          tension: 0.35,
          fill: false,
        },
        {
          label: 'Target',
          data: find('target'),
          borderColor: '#60a5fa',
          backgroundColor: 'rgba(96, 165, 250, 0.14)',
          borderWidth: 3,
          pointRadius: 0,
          pointHoverRadius: 5,
          tension: 0.35,
          fill: true,
        },
        {
          label: 'Conservative',
          data: find('conservative'),
          borderColor: '#f87171',
          backgroundColor: 'rgba(248, 113, 113, 0.05)',
          borderWidth: 2,
          borderDash: [6, 4],
          pointRadius: 0,
          pointHoverRadius: 4,
          tension: 0.35,
          fill: false,
        },
      ],
    };
  });

  scenarioChartOptions = computed<ChartOptions<'line'>>(() => {
    const sym = this.currencySymbol();
    return {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: {
          position: 'bottom',
          labels: { color: '#94a3b8', usePointStyle: true, boxWidth: 8, font: { size: 11 } },
        },
        tooltip: {
          backgroundColor: 'rgba(15, 23, 42, 0.96)',
          borderColor: 'rgba(96, 165, 250, 0.35)',
          borderWidth: 1,
          titleColor: '#f8fafc',
          bodyColor: '#cbd5e1',
          padding: 10,
          callbacks: {
            label: (ctx) => `${ctx.dataset.label}: ${sym}${Number(ctx.parsed.y).toLocaleString(undefined, { maximumFractionDigits: 2 })}`,
          },
        },
      },
      scales: {
        x: {
          grid: { color: 'rgba(148, 163, 184, 0.08)' },
          ticks: { color: '#94a3b8', font: { size: 11 } },
        },
        y: {
          grid: { color: 'rgba(148, 163, 184, 0.08)' },
          ticks: {
            color: '#94a3b8',
            font: { size: 11 },
            callback: (value) => sym + Number(value).toLocaleString(),
          },
        },
      },
    };
  });

  /** Tone class for the hero background: bull / neutral / bear. */
  recTone(rec: ForecastResult['recommendation']): 'bull' | 'neutral' | 'bear' {
    if (rec === 'buy' || rec === 'strong_buy') return 'bull';
    if (rec === 'hold') return 'neutral';
    return 'bear';
  }

  /** Relative bar width (%) for a valuation estimate, scaled for visual contrast. */
  barPct(value: number, f: ForecastResult): number {
    const vals = f.estimates.map(e => e.value).concat([f.baseValuation]);
    const max = Math.max(...vals);
    const lo = Math.min(...vals) * 0.92;
    if (max <= lo) return 100;
    return Math.max(8, Math.min(100, ((value - lo) / (max - lo)) * 100));
  }

  /** Relative bar width (%) for the experimental "Per ChatGPT" value blend. */
  gptBarPct(value: number, g: ChatGptForecast): number {
    const vals = g.components.map(c => c.value).concat([g.fundamentalTarget]);
    const max = Math.max(...vals);
    const lo = Math.min(...vals) * 0.92;
    if (max <= lo) return 100;
    return Math.max(8, Math.min(100, ((value - lo) / (max - lo)) * 100));
  }

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
