import { Component, OnInit, inject, signal, computed, effect, OnDestroy } from '@angular/core';
import { CommonModule, DecimalPipe } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';

import { ButtonModule } from 'primeng/button';
import { ProgressSpinnerModule } from 'primeng/progressspinner';
import { TooltipModule } from 'primeng/tooltip';
import { DialogModule } from 'primeng/dialog';
import { AutoCompleteModule, AutoCompleteCompleteEvent } from 'primeng/autocomplete';

import { MarketService } from '../../core/services';
import { Market, Stock, ScreenResult, getDefaultFilters } from '../../core/models';
import { Subscription } from 'rxjs';

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
  fiftyDayMA?: number;
  twoHundredDayMA?: number;
  percentFromFiftyDayMA?: number;
  percentFromTwoHundredDayMA?: number;
  percentFromFiftyTwoWeekHigh?: number;
  rsi?: number;
  macdSignalType?: string;
  alertType: string;
  alertCategory: string;
  alertDescription: string;
  severity: 'bullish' | 'bearish' | 'neutral';
  market?: Market;
}

interface TopPick {
  stock: BreakoutStock;
  score: number;
  signals: string[];
}

interface AlertCategory {
  id: string;
  label: string;
  icon: string;
  description: string;
}

@Component({
  selector: 'app-breakouts-v2',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ButtonModule,
    ProgressSpinnerModule,
    TooltipModule,
    DialogModule,
    AutoCompleteModule,
    DecimalPipe
  ],
  template: `
    <div class="theme-radar breakouts-radar">
      <!-- Radar Background -->
      <div class="radar-bg">
        <div class="grid-overlay"></div>
        <div class="radar-sweep"></div>
        <div class="scan-lines"></div>
      </div>

      <!-- Command Header -->
      <header class="command-header">
        <div class="header-left">
          <div class="system-id">
            <span class="id-label">SYSTEM</span>
            <span class="id-value">BREAKOUT-RADAR</span>
          </div>
          <div class="status-indicator">
            <span class="status-dot" [class.active]="!loading()"></span>
            <span class="status-text">{{ loading() ? 'SCANNING' : 'ONLINE' }}</span>
          </div>
        </div>
        <div class="header-center">
          <h1 class="command-title">TACTICAL BREAKOUT SCANNER</h1>
          <div class="command-subtitle">
            <span class="bracket">[</span>
            <span>MARKET: {{ marketService.currentMarket() }}</span>
            <span class="sep">|</span>
            <span>TARGETS: {{ allBreakouts().length }}</span>
            <span class="bracket">]</span>
          </div>
        </div>
        <div class="header-right">
          <div class="timestamp">
            @if (lastUpdated()) {
              <span class="ts-label">LAST_SCAN</span>
              <span class="ts-value">{{ getTimeAgo(lastUpdated()!) }}</span>
            }
          </div>
          <button class="refresh-btn" [class.scanning]="loading()" (click)="refreshData()">
            <span class="btn-icon">↻</span>
            <span>RESCAN</span>
          </button>
        </div>
      </header>

      <!-- Threat Level Bar -->
      <div class="threat-bar">
        <div class="threat-section">
          <span class="threat-label">SIGNAL_FILTER:</span>
          <div class="threat-buttons">
            <button 
              class="threat-btn" 
              [class.active]="selectedSignal() === 'all'"
              (click)="setSignalFilter('all')">
              ALL [{{ allBreakouts().length }}]
            </button>
            <button 
              class="threat-btn bullish" 
              [class.active]="selectedSignal() === 'bullish'"
              (click)="setSignalFilter('bullish')">
              ▲ BULLISH [{{ bullishCount() }}]
            </button>
            <button 
              class="threat-btn bearish" 
              [class.active]="selectedSignal() === 'bearish'"
              (click)="setSignalFilter('bearish')">
              ▼ BEARISH [{{ bearishCount() }}]
            </button>
          </div>
        </div>
        <div class="threat-stats">
          <div class="stat-block">
            <span class="stat-value bullish">{{ bullishCount() }}</span>
            <span class="stat-label">BULLISH</span>
          </div>
          <div class="stat-block">
            <span class="stat-value bearish">{{ bearishCount() }}</span>
            <span class="stat-label">BEARISH</span>
          </div>
          <div class="stat-block">
            <span class="stat-value">{{ filteredBreakouts().length }}</span>
            <span class="stat-label">SHOWING</span>
          </div>
        </div>
      </div>

      <!-- Main Content -->
      <main class="command-main">
        <!-- Top Picks Panel -->
        <section class="priority-panel">
          <div class="panel-header" (click)="toggleTopPicks()">
            <div class="panel-title">
              <span class="priority-icon">★</span>
              <span>PRIORITY_TARGETS</span>
              <span class="target-count">[{{ topPicks().length }}]</span>
              <button class="panel-btn info" (click)="showScoringInfo($event, 'topPicks')" title="View scoring criteria">ⓘ</button>
              <button class="panel-btn search" (click)="openScoreSearch($event, 'topPicks')" title="Search stock score">🔍</button>
            </div>
            <div class="panel-desc">Best stocks to buy for medium-term (1-3 months)</div>
            <span class="panel-toggle">{{ topPicksCollapsed() ? '▶' : '▼' }}</span>
          </div>
          
          @if (!topPicksCollapsed()) {
            <div class="priority-content">
              @if (screenerLoading()) {
                <div class="scanning-state">
                  <div class="scan-indicator"></div>
                  <span>SCANNING_FOR_TARGETS...</span>
                </div>
              } @else if (topPicks().length === 0) {
                <div class="no-targets">
                  <span class="no-icon">◎</span>
                  <span>NO_PRIORITY_TARGETS_DETECTED</span>
                </div>
              } @else {
                <div class="priority-grid">
                  @for (pick of topPicks(); track pick.stock.symbol; let i = $index) {
                    <div class="priority-card" (click)="goToStock(pick.stock.symbol)" [style.animation-delay]="(i * 0.05) + 's'">
                      <div class="card-rank">{{ String(i + 1).padStart(2, '0') }}</div>
                      <div class="card-main">
                        <div class="card-header">
                          <span class="card-symbol">{{ pick.stock.symbol }}</span>
                          <span class="card-score">SCORE: {{ pick.score }}</span>
                        </div>
                        <div class="card-name">{{ pick.stock.name | slice:0:30 }}</div>
                        <div class="card-signals">
                          @for (signal of pick.signals.slice(0, 3); track signal) {
                            <span class="signal-tag">{{ signal }}</span>
                          }
                        </div>
                      </div>
                      <div class="card-data">
                        <div class="data-row">
                          <span class="data-label">PRICE</span>
                          <span class="data-value">{{ marketService.formatCurrency(pick.stock.price) }}</span>
                        </div>
                        <div class="data-row">
                          <span class="data-label">CHG</span>
                          <span class="data-value" [class.positive]="pick.stock.changePercent > 0" [class.negative]="pick.stock.changePercent < 0">
                            {{ pick.stock.changePercent > 0 ? '+' : '' }}{{ pick.stock.changePercent | number:'1.2-2' }}%
                          </span>
                        </div>
                      </div>
                    </div>
                  }
                </div>
              }
            </div>
          }
        </section>

        <!-- Day Trade Picks Panel -->
        <section class="priority-panel day-trade">
          <div class="panel-header" (click)="toggleDayTrade()">
            <div class="panel-title">
              <span class="priority-icon day-trade">⚡</span>
              <span>DAY_TRADE_TARGETS</span>
              <span class="target-count">[{{ dayTradePicks().length }}]</span>
              <button class="panel-btn info day-trade" (click)="showScoringInfo($event, 'dayTrade')" title="View scoring criteria">ⓘ</button>
              <button class="panel-btn search day-trade" (click)="openScoreSearch($event, 'dayTrade')" title="Search stock score">🔍</button>
            </div>
            <div class="panel-desc">High momentum stocks for intraday trading</div>
            <span class="panel-toggle">{{ dayTradeCollapsed() ? '▶' : '▼' }}</span>
          </div>
          
          @if (!dayTradeCollapsed()) {
            <div class="priority-content">
              @if (screenerLoading()) {
                <div class="scanning-state">
                  <div class="scan-indicator"></div>
                  <span>SCANNING_INTRADAY_SIGNALS...</span>
                </div>
              } @else if (dayTradePicks().length === 0) {
                <div class="no-targets">
                  <span class="no-icon">◎</span>
                  <span>NO_INTRADAY_TARGETS_DETECTED</span>
                </div>
              } @else {
                <div class="priority-grid">
                  @for (pick of dayTradePicks(); track pick.stock.symbol; let i = $index) {
                    <div class="priority-card day-trade" (click)="goToStock(pick.stock.symbol)" [style.animation-delay]="(i * 0.05) + 's'">
                      <div class="card-rank">{{ String(i + 1).padStart(2, '0') }}</div>
                      <div class="card-main">
                        <div class="card-header">
                          <span class="card-symbol">{{ pick.stock.symbol }}</span>
                          <span class="card-score day-trade">SCORE: {{ pick.score }}</span>
                        </div>
                        <div class="card-name">{{ pick.stock.name | slice:0:30 }}</div>
                        <div class="card-signals">
                          @for (signal of pick.signals.slice(0, 3); track signal) {
                            <span class="signal-tag day-trade">{{ signal }}</span>
                          }
                        </div>
                      </div>
                      <div class="card-data">
                        <div class="data-row">
                          <span class="data-label">PRICE</span>
                          <span class="data-value">{{ marketService.formatCurrency(pick.stock.price) }}</span>
                        </div>
                        <div class="data-row">
                          <span class="data-label">CHG</span>
                          <span class="data-value" [class.positive]="pick.stock.changePercent > 0" [class.negative]="pick.stock.changePercent < 0">
                            {{ pick.stock.changePercent > 0 ? '+' : '' }}{{ pick.stock.changePercent | number:'1.2-2' }}%
                          </span>
                        </div>
                        @if (pick.stock.relativeVolume) {
                          <div class="data-row">
                            <span class="data-label">VOL</span>
                            <span class="data-value highlight">{{ pick.stock.relativeVolume | number:'1.1-1' }}x</span>
                          </div>
                        }
                      </div>
                    </div>
                  }
                </div>
              }
            </div>
          }
        </section>

        <!-- Momentum Picks Panel -->
        <section class="priority-panel momentum">
          <div class="panel-header" (click)="toggleMomentum()">
            <div class="panel-title">
              <span class="priority-icon momentum">🚀</span>
              <span>MOMENTUM_TARGETS</span>
              <span class="target-count">[{{ momentumPicks().length }}]</span>
              <button class="panel-btn info momentum" (click)="showScoringInfo($event, 'momentum')" title="View scoring criteria">ⓘ</button>
              <button class="panel-btn search momentum" (click)="openScoreSearch($event, 'momentum')" title="Search stock score">🔍</button>
            </div>
            <div class="panel-desc">High-flying stocks with strong momentum near 52W highs</div>
            <span class="panel-toggle">{{ momentumCollapsed() ? '▶' : '▼' }}</span>
          </div>
          
          @if (!momentumCollapsed()) {
            <div class="priority-content">
              @if (screenerLoading()) {
                <div class="scanning-state">
                  <div class="scan-indicator"></div>
                  <span>SCANNING_MOMENTUM_SIGNALS...</span>
                </div>
              } @else if (momentumPicks().length === 0) {
                <div class="no-targets">
                  <span class="no-icon">◎</span>
                  <span>NO_MOMENTUM_TARGETS_DETECTED</span>
                </div>
              } @else {
                <div class="priority-grid">
                  @for (pick of momentumPicks(); track pick.stock.symbol; let i = $index) {
                    <div class="priority-card momentum" (click)="goToStock(pick.stock.symbol)" [style.animation-delay]="(i * 0.05) + 's'">
                      <div class="card-rank">{{ String(i + 1).padStart(2, '0') }}</div>
                      <div class="card-main">
                        <div class="card-header">
                          <span class="card-symbol">{{ pick.stock.symbol }}</span>
                          <span class="card-score momentum">SCORE: {{ pick.score }}</span>
                        </div>
                        <div class="card-name">{{ pick.stock.name | slice:0:30 }}</div>
                        <div class="card-signals">
                          @for (signal of pick.signals.slice(0, 3); track signal) {
                            <span class="signal-tag momentum">{{ signal }}</span>
                          }
                        </div>
                      </div>
                      <div class="card-data">
                        <div class="data-row">
                          <span class="data-label">PRICE</span>
                          <span class="data-value">{{ marketService.formatCurrency(pick.stock.price) }}</span>
                        </div>
                        <div class="data-row">
                          <span class="data-label">CHG</span>
                          <span class="data-value" [class.positive]="pick.stock.changePercent > 0" [class.negative]="pick.stock.changePercent < 0">
                            {{ pick.stock.changePercent > 0 ? '+' : '' }}{{ pick.stock.changePercent | number:'1.2-2' }}%
                          </span>
                        </div>
                        @if (pick.stock.percentFromFiftyTwoWeekHigh != null) {
                          <div class="data-row">
                            <span class="data-label">52W</span>
                            <span class="data-value highlight">{{ pick.stock.percentFromFiftyTwoWeekHigh | number:'1.1-1' }}%</span>
                          </div>
                        }
                      </div>
                    </div>
                  }
                </div>
              }
            </div>
          }
        </section>

        <!-- Loading State -->
        @if (loading()) {
          <div class="loading-state">
            <div class="radar-loader">
              <div class="loader-ring"></div>
              <div class="loader-sweep"></div>
              <div class="loader-center">◎</div>
            </div>
            <span class="loading-text">SCANNING_MARKET_SIGNALS...</span>
            <div class="loading-bar">
              <div class="bar-fill"></div>
            </div>
          </div>
        }

        <!-- Empty State -->
        @if (!loading() && filteredBreakouts().length === 0) {
          <div class="empty-state">
            <span class="empty-icon">◎</span>
            <span class="empty-title">NO_TARGETS_DETECTED</span>
            <span class="empty-text">Adjust signal filters or rescan</span>
          </div>
        }

        <!-- Categorized Breakouts Sections -->
        @if (!loading()) {
          <div class="categories-container">
            @for (category of alertCategories; track category.id) {
              <section class="category-panel" [class]="category.id">
                <div class="category-header" (click)="toggleCategory(category.id)">
                  <div class="category-title">
                    <span class="category-icon">{{ category.icon }}</span>
                    <span class="category-name">{{ category.label }}</span>
                    <span class="category-count">[{{ getCategoryCount(category.id) }}]</span>
                  </div>
                  <div class="category-desc">{{ category.description }}</div>
                  <span class="category-toggle">{{ collapsedCategories().includes(category.id) ? '▶' : '▼' }}</span>
                </div>
                
                @if (!collapsedCategories().includes(category.id)) {
                  <div class="category-content">
                    @if (getStocksByCategory(category.id).length === 0) {
                      <div class="no-targets">
                        <span class="no-icon">◎</span>
                        <span>NO_SIGNALS_IN_SECTOR</span>
                      </div>
                    } @else {
                      <div class="targets-grid">
                        @for (breakout of getStocksByCategory(category.id); track breakout.symbol + breakout.alertType; let i = $index) {
                          <div 
                            class="target-card" 
                            [class.bullish]="breakout.severity === 'bullish'"
                            [class.bearish]="breakout.severity === 'bearish'"
                            (click)="goToStock(breakout.symbol)"
                            [style.animation-delay]="(i * 0.02) + 's'">
                            
                            <!-- Threat Indicator -->
                            <div class="threat-indicator" [class]="breakout.severity">
                              <span class="threat-icon">{{ breakout.severity === 'bullish' ? '▲' : breakout.severity === 'bearish' ? '▼' : '◆' }}</span>
                            </div>
                            
                            <!-- Target Info -->
                            <div class="target-info">
                              <div class="target-header">
                                <span class="target-symbol">{{ breakout.symbol }}</span>
                                <span class="target-change" [class.positive]="breakout.changePercent > 0" [class.negative]="breakout.changePercent < 0">
                                  {{ breakout.changePercent > 0 ? '+' : '' }}{{ breakout.changePercent | number:'1.2-2' }}%
                                </span>
                              </div>
                              <div class="target-name">{{ breakout.name | slice:0:25 }}{{ breakout.name.length > 25 ? '...' : '' }}</div>
                              <div class="target-price">{{ marketService.formatCurrency(breakout.price) }}</div>
                            </div>
                            
                            <!-- Alert Info -->
                            <div class="alert-block">
                              <span class="alert-type">{{ breakout.alertType }}</span>
                              <span class="alert-desc">{{ breakout.alertDescription | slice:0:60 }}{{ breakout.alertDescription.length > 60 ? '...' : '' }}</span>
                            </div>
                            
                            <!-- Metrics -->
                            <div class="target-metrics">
                              <div class="metric">
                                <span class="metric-label">VOL</span>
                                <span class="metric-value">{{ breakout.relativeVolume | number:'1.1-1' }}x</span>
                              </div>
                              @if (breakout.rsi) {
                                <div class="metric">
                                  <span class="metric-label">RSI</span>
                                  <span class="metric-value" [class.oversold]="breakout.rsi < 30" [class.overbought]="breakout.rsi > 70">{{ breakout.rsi | number:'1.0-0' }}</span>
                                </div>
                              }
                              <div class="metric">
                                <span class="metric-label">MCAP</span>
                                <span class="metric-value">{{ marketService.formatMarketCap(breakout.marketCap) }}</span>
                              </div>
                            </div>
                            
                            <!-- Ping Effect -->
                            <div class="ping-effect"></div>
                          </div>
                        }
                      </div>
                    }
                  </div>
                }
              </section>
            }
          </div>
        }
      </main>

      <!-- Footer Status Bar -->
      <footer class="status-bar">
        <div class="status-left">
          <span class="status-item">◈ RADAR_ACTIVE</span>
        </div>
        <div class="status-center">
          <div class="status-line"></div>
        </div>
        <div class="status-right">
          <span class="status-item">v2.0.TACTICAL</span>
        </div>
      </footer>

      <!-- Scoring Criteria Dialog -->
      <p-dialog 
        [header]="getScoringDialogTitle()"
        [(visible)]="showScoringDialog" 
        [modal]="true" 
        [style]="{ width: '600px' }"
        [draggable]="false"
        [resizable]="false"
        styleClass="radar-dialog">
        <div class="scoring-content">
          @if (scoringDialogType === 'topPicks') {
            <p class="scoring-intro">
              <strong>Strategy:</strong> Medium-term investing (1-3 months) with moderate risk.<br>
              Focuses on stocks in confirmed uptrends with momentum and room to grow.
            </p>
            <div class="scoring-section">
              <h4>▲ Trend Confirmation</h4>
              <ul class="scoring-list positive">
                <li><span class="pts">+3</span> Above 50 MA (0-8% range)</li>
                <li><span class="pts">+3</span> Above 200 MA (0-20% range)</li>
                <li><span class="pts">+5</span> Golden Cross</li>
              </ul>
            </div>
            <div class="scoring-section">
              <h4>▲ Momentum Signals</h4>
              <ul class="scoring-list positive">
                <li><span class="pts">+4</span> MACD bullish crossover</li>
                <li><span class="pts">+3</span> RSI 50-65 (strong momentum)</li>
                <li><span class="pts">+2</span> Near 52-week high (within 10%)</li>
                <li><span class="pts">+2</span> Breakout move with volume</li>
              </ul>
            </div>
            <div class="scoring-section">
              <h4>▼ Penalties</h4>
              <ul class="scoring-list negative">
                <li><span class="pts">-4</span> Overbought RSI (>70)</li>
                <li><span class="pts">-5</span> Death Cross</li>
                <li><span class="pts">-3</span> Bearish MACD crossover</li>
                <li><span class="pts">-2</span> Too extended from 50 MA</li>
              </ul>
            </div>
            <div class="scoring-note">
              <strong>Requirements:</strong> Score 25+, 3+ bullish signals, above 200 MA
            </div>
          }
          @if (scoringDialogType === 'dayTrade') {
            <p class="scoring-intro">
              <strong>Strategy:</strong> Intraday momentum trading.<br>
              Focuses on stocks with strong price action and volume TODAY.
            </p>
            <div class="scoring-section">
              <h4>▲ Price Action</h4>
              <ul class="scoring-list positive">
                <li><span class="pts">+7</span> Big mover (5%+ gain today)</li>
                <li><span class="pts">+5</span> Strong move (3-5% gain)</li>
                <li><span class="pts">+3</span> Good move (1.5-3% gain)</li>
              </ul>
            </div>
            <div class="scoring-section">
              <h4>▲ Volume</h4>
              <ul class="scoring-list positive">
                <li><span class="pts">+6</span> Massive volume (2.5x+ avg)</li>
                <li><span class="pts">+4</span> High volume (1.8-2.5x avg)</li>
                <li><span class="pts">+2</span> Above average (1.3-1.8x)</li>
              </ul>
            </div>
            <div class="scoring-section">
              <h4>▲ Breakout Signals</h4>
              <ul class="scoring-list positive">
                <li><span class="pts">+5</span> New 52-week high</li>
                <li><span class="pts">+3</span> MACD bullish crossover</li>
                <li><span class="pts">+3</span> RSI 60-75</li>
              </ul>
            </div>
            <div class="scoring-section">
              <h4>▼ Penalties</h4>
              <ul class="scoring-list negative">
                <li><span class="pts">-3</span> Negative day</li>
                <li><span class="pts">-2</span> Low volume (&lt;0.7x)</li>
                <li><span class="pts">-2</span> Extreme RSI (>80)</li>
              </ul>
            </div>
            <div class="scoring-note">
              <strong>Requirements:</strong> Score 31+, positive day, 2+ momentum signals
            </div>
          }
          @if (scoringDialogType === 'momentum') {
            <p class="scoring-intro">
              <strong>Strategy:</strong> Ride the momentum wave.<br>
              High-flying stocks extended from MAs but showing strong trend continuation.
            </p>
            <div class="scoring-section">
              <h4>▲ Momentum Strength</h4>
              <ul class="scoring-list positive">
                <li><span class="pts">+5</span> Strong momentum (30%+ above 50 MA)</li>
                <li><span class="pts">+3</span> Good momentum (15-30% above 50 MA)</li>
                <li><span class="pts">+4</span> Major uptrend (50%+ above 200 MA)</li>
              </ul>
            </div>
            <div class="scoring-section">
              <h4>▲ Breakout Signals</h4>
              <ul class="scoring-list positive">
                <li><span class="pts">+4</span> Near 52-week high (within 5%)</li>
                <li><span class="pts">+4</span> Big move today (5%+)</li>
                <li><span class="pts">+3</span> MACD bullish</li>
                <li><span class="pts">+2</span> High volume (1.5x+)</li>
              </ul>
            </div>
            <div class="scoring-section">
              <h4>▼ Penalties</h4>
              <ul class="scoring-list negative">
                <li><span class="pts">-3</span> Down today</li>
                <li><span class="pts">-2</span> Overbought RSI (>80)</li>
                <li><span class="pts">-3</span> Below 50 MA</li>
              </ul>
            </div>
            <div class="scoring-note">
              <strong>Requirements:</strong> Score 42+, above 50 MA, 3+ momentum signals
            </div>
          }
        </div>
      </p-dialog>

      <!-- Stock Score Search Dialog -->
      <p-dialog 
        [header]="'SEARCH_SCORE: ' + getScoreSearchTitle()"
        [(visible)]="showScoreSearchDialog" 
        [modal]="true" 
        [style]="{ width: '650px' }"
        [draggable]="false"
        [resizable]="false"
        styleClass="radar-dialog">
        <div class="search-content">
          <div class="search-input-row">
            <p-autoComplete 
              [(ngModel)]="scoreSearchSelected"
              [suggestions]="scoreSearchSuggestions()"
              (completeMethod)="onScoreSearchComplete($event)"
              (onSelect)="onScoreSearchSelect($event)"
              [minLength]="1"
              [delay]="300"
              placeholder="Search stock (e.g., AAPL, MSFT)"
              field="symbol"
              appendTo="body"
              styleClass="radar-autocomplete">
              <ng-template let-stock pTemplate="item">
                <div class="search-item">
                  <span class="si-symbol">{{ stock.symbol }}</span>
                  <span class="si-name">{{ stock.name }}</span>
                  <span class="si-price" [class.positive]="stock.changePercent >= 0" [class.negative]="stock.changePercent < 0">
                    {{ marketService.formatCurrency(stock.price, stock.market) }}
                  </span>
                </div>
              </ng-template>
            </p-autoComplete>
          </div>
          
          @if (scoreSearchResult) {
            <div class="search-result">
              <div class="result-header">
                <div class="result-stock">
                  <span class="result-symbol">{{ scoreSearchResult.symbol }}</span>
                  <span class="result-name">{{ scoreSearchResult.name }}</span>
                </div>
                <div class="result-score" [class]="getScoreClass(scoreSearchResult.score)">
                  <span class="score-num">{{ scoreSearchResult.score }}</span>
                  <span class="score-max">/100</span>
                </div>
              </div>
              
              <div class="result-status" [class.qualifies]="scoreSearchResult.qualifies" [class.not-qualifies]="!scoreSearchResult.qualifies">
                <span class="status-icon">{{ scoreSearchResult.qualifies ? '✓' : '✗' }}</span>
                <span>{{ scoreSearchResult.qualifies ? 'QUALIFIES for ' + getScoreSearchTitle() : 'DOES_NOT_QUALIFY' }}</span>
                @if (!scoreSearchResult.qualifies && scoreSearchResult.reason) {
                  <span class="reason">- {{ scoreSearchResult.reason }}</span>
                }
              </div>
              
              <div class="result-breakdown">
                <h4>> SCORE_BREAKDOWN</h4>
                <div class="breakdown-list">
                  @for (item of scoreSearchResult.breakdown; track item.label) {
                    <div class="breakdown-item" [class.positive]="item.points >= 0" [class.negative]="item.points < 0">
                      <span class="bd-label">{{ item.label }}</span>
                      <span class="bd-value">{{ item.value }}</span>
                      <span class="bd-pts">{{ item.points >= 0 ? '+' : '' }}{{ item.points }}</span>
                    </div>
                  }
                </div>
              </div>
              
              <div class="result-signals">
                <h4>> SIGNALS_DETECTED</h4>
                <div class="signals-list">
                  @for (signal of scoreSearchResult.signals; track signal) {
                    <span class="signal-chip">{{ signal }}</span>
                  }
                  @if (scoreSearchResult.signals.length === 0) {
                    <span class="no-signals">NO_QUALIFYING_SIGNALS</span>
                  }
                </div>
              </div>
              
              <div class="result-metrics">
                <h4>> STOCK_METRICS</h4>
                <div class="metrics-grid">
                  <div class="metric-item">
                    <span class="m-label">PRICE</span>
                    <span class="m-value">{{ marketService.formatCurrency(scoreSearchResult.metrics.price, $any(scoreSearchResult.metrics.market) || 'US') }}</span>
                  </div>
                  <div class="metric-item">
                    <span class="m-label">CHANGE</span>
                    <span class="m-value" [class.positive]="scoreSearchResult.metrics.changePercent >= 0" [class.negative]="scoreSearchResult.metrics.changePercent < 0">
                      {{ scoreSearchResult.metrics.changePercent >= 0 ? '+' : '' }}{{ scoreSearchResult.metrics.changePercent | number:'1.2-2' }}%
                    </span>
                  </div>
                  <div class="metric-item">
                    <span class="m-label">RSI</span>
                    <span class="m-value">{{ scoreSearchResult.metrics.rsi ?? '-' }}</span>
                  </div>
                  <div class="metric-item">
                    <span class="m-label">50MA</span>
                    <span class="m-value" [class.positive]="scoreSearchResult.metrics.pct50MA != null && scoreSearchResult.metrics.pct50MA > 0" [class.negative]="scoreSearchResult.metrics.pct50MA != null && scoreSearchResult.metrics.pct50MA < 0">
                      {{ scoreSearchResult.metrics.pct50MA != null ? ((scoreSearchResult.metrics.pct50MA >= 0 ? '+' : '') + (scoreSearchResult.metrics.pct50MA | number:'1.1-1') + '%') : '-' }}
                    </span>
                  </div>
                  <div class="metric-item">
                    <span class="m-label">200MA</span>
                    <span class="m-value" [class.positive]="scoreSearchResult.metrics.pct200MA != null && scoreSearchResult.metrics.pct200MA > 0" [class.negative]="scoreSearchResult.metrics.pct200MA != null && scoreSearchResult.metrics.pct200MA < 0">
                      {{ scoreSearchResult.metrics.pct200MA != null ? ((scoreSearchResult.metrics.pct200MA >= 0 ? '+' : '') + (scoreSearchResult.metrics.pct200MA | number:'1.1-1') + '%') : '-' }}
                    </span>
                  </div>
                  <div class="metric-item">
                    <span class="m-label">52W_HIGH</span>
                    <span class="m-value">{{ scoreSearchResult.metrics.pct52High != null ? ((scoreSearchResult.metrics.pct52High | number:'1.1-1') + '%') : '-' }}</span>
                  </div>
                  <div class="metric-item">
                    <span class="m-label">REL_VOL</span>
                    <span class="m-value">{{ scoreSearchResult.metrics.relVolume != null ? (scoreSearchResult.metrics.relVolume | number:'1.2-2') + 'x' : '-' }}</span>
                  </div>
                </div>
              </div>
            </div>
          }
          
          @if (scoreSearchError) {
            <div class="search-error">
              <span class="error-icon">⚠</span>
              <span>{{ scoreSearchError }}</span>
            </div>
          }
        </div>
      </p-dialog>
    </div>
  `,
  styles: [`
    .breakouts-radar {
      min-height: 100vh;
      background: var(--radar-bg);
      font-family: var(--radar-font-mono);
      color: var(--radar-text);
      position: relative;
      overflow: hidden;
    }

    /* Radar Background */
    .radar-bg {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      pointer-events: none;
      z-index: 0;
    }

    .grid-overlay {
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background-image: 
        linear-gradient(var(--radar-grid) 1px, transparent 1px),
        linear-gradient(90deg, var(--radar-grid) 1px, transparent 1px);
      background-size: 40px 40px;
    }

    .radar-sweep {
      position: absolute;
      top: 50%;
      left: 50%;
      width: 200%;
      height: 200%;
      transform: translate(-50%, -50%);
      background: conic-gradient(
        from 0deg,
        transparent 0deg,
        rgba(57, 255, 20, 0.1) 30deg,
        transparent 60deg
      );
      animation: radar-sweep 8s linear infinite;
      opacity: 0.3;
    }

    .scan-lines {
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: repeating-linear-gradient(
        0deg,
        transparent,
        transparent 2px,
        rgba(0, 0, 0, 0.1) 2px,
        rgba(0, 0, 0, 0.1) 4px
      );
      pointer-events: none;
    }

    /* Command Header */
    .command-header {
      position: relative;
      z-index: 2;
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 1rem 2rem;
      background: linear-gradient(180deg, rgba(57, 255, 20, 0.05) 0%, transparent 100%);
      border-bottom: 1px solid var(--radar-border);
    }

    .header-left, .header-right {
      display: flex;
      align-items: center;
      gap: 1.5rem;
    }

    .system-id {
      display: flex;
      flex-direction: column;
      gap: 0.15rem;
    }

    .id-label {
      font-size: 0.55rem;
      color: var(--radar-text);
      letter-spacing: 0.1em;
    }

    .id-value {
      font-family: var(--radar-font-display);
      font-size: 0.9rem;
      font-weight: 600;
      color: var(--radar-green);
      text-shadow: 0 0 10px var(--radar-green-glow);
    }

    .status-indicator {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.35rem 0.75rem;
      border: 1px solid var(--radar-border);
      background: rgba(57, 255, 20, 0.05);
    }

    .status-dot {
      width: 8px;
      height: 8px;
      background: var(--radar-amber);
      animation: radar-blink 1s infinite;

      &.active {
        background: var(--radar-green);
        box-shadow: 0 0 10px var(--radar-green);
        animation: none;
      }
    }

    .status-text {
      font-size: 0.65rem;
      letter-spacing: 0.1em;
      color: var(--radar-green);
    }

    .header-center {
      text-align: center;
    }

    .command-title {
      font-family: var(--radar-font-display);
      font-size: clamp(1.25rem, 3vw, 1.75rem);
      font-weight: 700;
      color: var(--radar-green);
      margin: 0;
      letter-spacing: 0.15em;
      text-shadow: 0 0 20px var(--radar-green-glow);
    }

    .command-subtitle {
      display: flex;
      justify-content: center;
      align-items: center;
      gap: 0.5rem;
      font-size: 0.7rem;
      color: var(--radar-text);
      margin-top: 0.35rem;
    }

    .bracket {
      color: var(--radar-green);
    }

    .sep {
      color: var(--radar-green);
      opacity: 0.5;
    }

    .timestamp {
      display: flex;
      flex-direction: column;
      align-items: flex-end;
      gap: 0.15rem;
    }

    .ts-label {
      font-size: 0.55rem;
      color: var(--radar-text);
      letter-spacing: 0.1em;
    }

    .ts-value {
      font-size: 0.75rem;
      color: var(--radar-green);
    }

    .refresh-btn {
      display: inline-flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.5rem 1rem;
      border: 1px solid var(--radar-green);
      background: var(--radar-green-dim);
      color: var(--radar-green);
      font-family: var(--radar-font-mono);
      font-size: 0.7rem;
      letter-spacing: 0.1em;
      cursor: pointer;
      transition: all 0.2s ease;

      &:hover {
        background: var(--radar-green);
        color: var(--radar-bg);
      }

      &.scanning {
        animation: radar-blink 0.5s infinite;
      }
    }

    /* Threat Bar */
    .threat-bar {
      position: relative;
      z-index: 2;
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 0.75rem 2rem;
      background: var(--radar-bg-elevated);
      border-bottom: 1px solid var(--radar-border);
    }

    .threat-section {
      display: flex;
      align-items: center;
      gap: 1rem;
    }

    .threat-label {
      font-size: 0.65rem;
      color: var(--radar-text);
      letter-spacing: 0.1em;
    }

    .threat-buttons {
      display: flex;
      gap: 0.5rem;
    }

    .threat-btn {
      padding: 0.4rem 0.75rem;
      border: 1px solid var(--radar-border);
      background: transparent;
      color: var(--radar-text);
      font-family: var(--radar-font-mono);
      font-size: 0.65rem;
      letter-spacing: 0.05em;
      cursor: pointer;
      transition: all 0.2s ease;

      &:hover {
        border-color: var(--radar-green);
        color: var(--radar-green);
      }

      &.active {
        border-color: var(--radar-green);
        background: var(--radar-green-dim);
        color: var(--radar-green);
        box-shadow: 0 0 10px var(--radar-green-dim);
      }

      &.bullish.active {
        border-color: var(--radar-green);
        background: var(--radar-green-dim);
        color: var(--radar-green);
      }

      &.bearish.active {
        border-color: var(--radar-red);
        background: var(--radar-red-dim);
        color: var(--radar-red);
      }
    }

    .threat-stats {
      display: flex;
      gap: 1.5rem;
    }

    .stat-block {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 0.15rem;
    }

    .stat-value {
      font-family: var(--radar-font-display);
      font-size: 1.1rem;
      font-weight: 600;
      color: var(--radar-green);

      &.bullish { color: var(--radar-green); text-shadow: 0 0 10px var(--radar-green-glow); }
      &.bearish { color: var(--radar-red); text-shadow: 0 0 10px rgba(255, 51, 51, 0.5); }
    }

    .stat-label {
      font-size: 0.55rem;
      color: var(--radar-text);
      letter-spacing: 0.1em;
    }

    /* Main Content */
    .command-main {
      position: relative;
      z-index: 2;
      max-width: 1800px;
      margin: 0 auto;
      padding: 1.5rem 2rem 4rem;
    }

    /* Priority Panel */
    .priority-panel {
      background: rgba(251, 191, 36, 0.08);
      border: 2px solid rgba(251, 191, 36, 0.4);
      border-radius: 8px;
      margin-bottom: 1.5rem;

      &.day-trade {
        background: rgba(249, 115, 22, 0.08);
        border: 2px solid rgba(249, 115, 22, 0.4);
      }

      &.momentum {
        background: rgba(139, 92, 246, 0.08);
        border: 2px solid rgba(139, 92, 246, 0.4);
      }
    }

    .panel-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 0.75rem 1rem;
      background: rgba(0, 0, 0, 0.2);
      border-bottom: 1px solid rgba(255, 255, 255, 0.1);
      cursor: pointer;

      &:hover {
        background: rgba(0, 0, 0, 0.3);
      }
    }

    .panel-title {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      font-size: 0.75rem;
      letter-spacing: 0.1em;
      color: #fbbf24;
    }

    .day-trade .panel-title {
      color: #f97316;
    }

    .momentum .panel-title {
      color: #a855f7;
    }

    .priority-icon {
      color: #fbbf24;
      text-shadow: 0 0 10px rgba(251, 191, 36, 0.5);

      &.day-trade {
        color: #f97316;
        text-shadow: 0 0 10px rgba(249, 115, 22, 0.5);
      }

      &.momentum {
        color: #a855f7;
        text-shadow: 0 0 10px rgba(168, 85, 247, 0.5);
      }
    }

    .target-count {
      color: var(--radar-text);
    }

    .panel-desc {
      flex: 1;
      font-size: 0.65rem;
      color: var(--radar-text);
      margin-left: 1rem;
      opacity: 0.7;
    }

    .panel-toggle {
      color: var(--radar-green);
      font-size: 0.8rem;
    }

    .priority-content {
      padding: 1rem;
    }

    .scanning-state, .no-targets {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 0.75rem;
      padding: 2rem;
      font-size: 0.75rem;
      color: var(--radar-text);
    }

    .scan-indicator {
      width: 16px;
      height: 16px;
      border: 2px solid var(--radar-green);
      border-top-color: transparent;
      border-radius: 50%;
      animation: spin 1s linear infinite;
    }

    .no-icon {
      font-size: 1.5rem;
      color: var(--radar-text);
      opacity: 0.5;
    }

    .priority-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
      gap: 0.75rem;
    }

    .priority-card {
      display: flex;
      gap: 0.75rem;
      padding: 0.75rem;
      border: 1px solid rgba(251, 191, 36, 0.3);
      background: rgba(20, 25, 20, 0.85);
      border-radius: 6px;
      cursor: pointer;
      transition: all 0.2s ease;
      opacity: 0;
      animation: v2-fadeIn 0.3s ease forwards;

      &:hover {
        border-color: #fbbf24;
        box-shadow: 0 0 15px rgba(251, 191, 36, 0.3);
        background: rgba(30, 35, 30, 0.9);
      }

      &.day-trade {
        border: 1px solid rgba(249, 115, 22, 0.3);
        background: rgba(25, 20, 18, 0.85);

        &:hover {
          border-color: #f97316;
          box-shadow: 0 0 15px rgba(249, 115, 22, 0.3);
          background: rgba(35, 28, 25, 0.9);
        }
      }

      &.momentum {
        border: 1px solid rgba(139, 92, 246, 0.3);
        background: rgba(22, 18, 28, 0.85);

        &:hover {
          border-color: #a855f7;
          box-shadow: 0 0 15px rgba(139, 92, 246, 0.3);
          background: rgba(30, 25, 38, 0.9);
        }
      }
    }

    .card-rank {
      font-family: var(--radar-font-display);
      font-size: 1.5rem;
      font-weight: 700;
      color: #fbbf24;
      text-shadow: 0 0 10px rgba(251, 191, 36, 0.5);
      line-height: 1;
    }

    .day-trade .card-rank {
      color: #f97316;
      text-shadow: 0 0 10px rgba(249, 115, 22, 0.5);
    }

    .momentum .card-rank {
      color: #a855f7;
      text-shadow: 0 0 10px rgba(168, 85, 247, 0.5);
    }

    .card-main {
      flex: 1;
      min-width: 0;
    }

    .card-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 0.25rem;
    }

    .card-symbol {
      font-family: var(--radar-font-display);
      font-size: 0.9rem;
      font-weight: 600;
      color: #22c55e;
    }

    .day-trade .card-symbol {
      color: #f97316;
    }

    .momentum .card-symbol {
      color: #a855f7;
    }

    .card-score {
      font-size: 0.6rem;
      color: #fbbf24;
      letter-spacing: 0.05em;
      background: rgba(251, 191, 36, 0.2);
      padding: 0.15rem 0.4rem;
      border-radius: 4px;
    }

    .day-trade .card-score {
      color: #f97316;
      background: rgba(249, 115, 22, 0.2);
    }

    .momentum .card-score {
      color: #a855f7;
      background: rgba(168, 85, 247, 0.2);
    }

    .card-name {
      font-size: 0.65rem;
      color: var(--radar-text);
      margin-bottom: 0.5rem;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .card-signals {
      display: flex;
      flex-wrap: wrap;
      gap: 0.25rem;
    }

    .signal-tag {
      padding: 0.15rem 0.35rem;
      background: rgba(251, 191, 36, 0.15);
      border: 1px solid rgba(251, 191, 36, 0.3);
      border-radius: 3px;
      font-size: 0.55rem;
      color: #fbbf24;
    }

    .day-trade .signal-tag {
      background: rgba(249, 115, 22, 0.15);
      border: 1px solid rgba(249, 115, 22, 0.3);
      color: #f97316;
    }

    .momentum .signal-tag {
      background: rgba(139, 92, 246, 0.15);
      border: 1px solid rgba(139, 92, 246, 0.3);
      color: #a855f7;
    }

    .card-data {
      display: flex;
      flex-direction: column;
      gap: 0.25rem;
      padding-left: 0.75rem;
      border-left: 1px solid var(--radar-border);
    }

    .data-row {
      display: flex;
      flex-direction: column;
      gap: 0.1rem;
    }

    .data-label {
      font-size: 0.5rem;
      color: var(--radar-text);
      letter-spacing: 0.1em;
    }

    .data-value {
      font-size: 0.75rem;
      color: var(--radar-text-bright);

      &.positive { color: var(--radar-green); }
      &.negative { color: var(--radar-red); }
      &.highlight { color: var(--radar-amber); }
    }

    /* Loading State */
    .loading-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 4rem 2rem;
    }

    .radar-loader {
      position: relative;
      width: 80px;
      height: 80px;
      margin-bottom: 1.5rem;
    }

    .loader-ring {
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      border: 2px solid var(--radar-border);
      border-radius: 50%;
    }

    .loader-sweep {
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: conic-gradient(
        from 0deg,
        transparent 0deg,
        var(--radar-green) 30deg,
        transparent 60deg
      );
      border-radius: 50%;
      animation: radar-sweep 2s linear infinite;
    }

    .loader-center {
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      font-size: 1.5rem;
      color: var(--radar-green);
      animation: radar-blink 1s infinite;
    }

    .loading-text {
      font-size: 0.8rem;
      color: var(--radar-green);
      letter-spacing: 0.1em;
      margin-bottom: 1rem;
    }

    .loading-bar {
      width: 200px;
      height: 3px;
      background: var(--radar-border);
      overflow: hidden;
    }

    .bar-fill {
      height: 100%;
      width: 30%;
      background: var(--radar-green);
      box-shadow: 0 0 10px var(--radar-green);
      animation: progress-slide 1.5s ease-in-out infinite;
    }

    @keyframes progress-slide {
      0% { transform: translateX(-100%); }
      100% { transform: translateX(400%); }
    }

    /* Empty State */
    .empty-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 4rem 2rem;
      text-align: center;
    }

    .empty-icon {
      font-size: 3rem;
      color: var(--radar-text);
      opacity: 0.3;
      margin-bottom: 1rem;
    }

    .empty-title {
      font-family: var(--radar-font-display);
      font-size: 1rem;
      color: var(--radar-green);
      letter-spacing: 0.1em;
      margin-bottom: 0.5rem;
    }

    .empty-text {
      font-size: 0.75rem;
      color: var(--radar-text);
    }

    /* Categories Container */
    .categories-container {
      display: flex;
      flex-direction: column;
      gap: 1rem;
      margin-top: 1.5rem;
    }

    /* Category Panel */
    .category-panel {
      background: var(--radar-bg-card);
      border: 1px solid var(--radar-border);

      &.ma_crossover { border-left: 3px solid #3b82f6; }
      &.\\35 2w_highs { border-left: 3px solid var(--radar-green); }
      &.\\35 2w_lows { border-left: 3px solid #f97316; }
      &.rsi_signals { border-left: 3px solid #a855f7; }
      &.macd_signals { border-left: 3px solid #14b8a6; }
      &.volume_breakout { border-left: 3px solid #ec4899; }
    }

    .category-header {
      display: flex;
      align-items: center;
      padding: 0.75rem 1rem;
      background: rgba(57, 255, 20, 0.02);
      border-bottom: 1px solid var(--radar-border);
      cursor: pointer;
      gap: 1rem;

      &:hover {
        background: rgba(57, 255, 20, 0.05);
      }
    }

    .category-title {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      min-width: 200px;
    }

    .category-icon {
      font-size: 1rem;
      width: 24px;
      text-align: center;
    }

    .ma_crossover .category-icon { color: #3b82f6; }
    .\\35 2w_highs .category-icon { color: var(--radar-green); }
    .\\35 2w_lows .category-icon { color: #f97316; }
    .rsi_signals .category-icon { color: #a855f7; }
    .macd_signals .category-icon { color: #14b8a6; }
    .volume_breakout .category-icon { color: #ec4899; }

    .category-name {
      font-family: var(--radar-font-display);
      font-size: 0.8rem;
      font-weight: 600;
      letter-spacing: 0.1em;
    }

    .ma_crossover .category-name { color: #3b82f6; }
    .\\35 2w_highs .category-name { color: var(--radar-green); }
    .\\35 2w_lows .category-name { color: #f97316; }
    .rsi_signals .category-name { color: #a855f7; }
    .macd_signals .category-name { color: #14b8a6; }
    .volume_breakout .category-name { color: #ec4899; }

    .category-count {
      font-size: 0.65rem;
      color: var(--radar-text);
    }

    .category-desc {
      flex: 1;
      font-size: 0.65rem;
      color: var(--radar-text);
      opacity: 0.7;
    }

    .category-toggle {
      color: var(--radar-green);
      font-size: 0.8rem;
    }

    .category-content {
      padding: 1rem;
    }

    .targets-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
      gap: 1rem;
    }

    .target-card {
      position: relative;
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
      padding: 1rem;
      background: var(--radar-bg-card);
      border: 1px solid var(--radar-border);
      cursor: pointer;
      transition: all 0.2s ease;
      overflow: hidden;
      opacity: 0;
      animation: v2-fadeIn 0.3s ease forwards;

      &:hover {
        border-color: var(--radar-green);
        box-shadow: 0 0 20px var(--radar-green-dim);

        .ping-effect {
          animation: radar-ping 1s ease-out;
        }
      }

      &.bullish {
        border-left: 3px solid var(--radar-green);
      }

      &.bearish {
        border-left: 3px solid var(--radar-red);
      }
    }

    .threat-indicator {
      position: absolute;
      top: 0.75rem;
      right: 0.75rem;
      width: 24px;
      height: 24px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 0.9rem;

      &.bullish { color: var(--radar-green); text-shadow: 0 0 10px var(--radar-green); }
      &.bearish { color: var(--radar-red); text-shadow: 0 0 10px var(--radar-red); }
      &.neutral { color: var(--radar-amber); }
    }

    .target-info {
      padding-right: 2rem;
    }

    .target-header {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      margin-bottom: 0.25rem;
    }

    .target-symbol {
      font-family: var(--radar-font-display);
      font-size: 1.1rem;
      font-weight: 600;
      color: var(--radar-text-bright);
    }

    .target-change {
      font-size: 0.8rem;
      font-weight: 600;

      &.positive { color: var(--radar-green); }
      &.negative { color: var(--radar-red); }
    }

    .target-name {
      font-size: 0.7rem;
      color: var(--radar-text);
      margin-bottom: 0.25rem;
    }

    .target-price {
      font-family: var(--radar-font-mono);
      font-size: 0.9rem;
      color: var(--radar-text-bright);
    }

    .alert-block {
      padding: 0.5rem;
      background: rgba(57, 255, 20, 0.03);
      border: 1px solid var(--radar-border);
    }

    .alert-type {
      display: block;
      font-size: 0.6rem;
      font-weight: 600;
      color: var(--radar-amber);
      letter-spacing: 0.1em;
      margin-bottom: 0.25rem;
    }

    .alert-desc {
      font-size: 0.7rem;
      color: var(--radar-text);
      line-height: 1.4;
    }

    .target-metrics {
      display: flex;
      gap: 1rem;
      padding-top: 0.5rem;
      border-top: 1px solid var(--radar-border);
    }

    .metric {
      display: flex;
      flex-direction: column;
      gap: 0.1rem;
    }

    .metric-label {
      font-size: 0.5rem;
      color: var(--radar-text);
      letter-spacing: 0.1em;
    }

    .metric-value {
      font-size: 0.75rem;
      color: var(--radar-text-bright);

      &.oversold { color: var(--radar-green); }
      &.overbought { color: var(--radar-red); }
    }

    .ping-effect {
      position: absolute;
      top: 50%;
      left: 50%;
      width: 10px;
      height: 10px;
      background: var(--radar-green);
      border-radius: 50%;
      transform: translate(-50%, -50%);
      opacity: 0;
    }

    /* Status Bar */
    .status-bar {
      position: fixed;
      bottom: 0;
      left: 0;
      right: 0;
      display: flex;
      align-items: center;
      padding: 0.5rem 2rem;
      background: var(--radar-bg);
      border-top: 1px solid var(--radar-border);
      z-index: 100;
    }

    .status-left, .status-right {
      flex: 0 0 auto;
    }

    .status-center {
      flex: 1;
      padding: 0 2rem;
    }

    .status-line {
      height: 1px;
      background: linear-gradient(90deg, transparent, var(--radar-green), transparent);
      opacity: 0.5;
    }

    .status-item {
      font-size: 0.6rem;
      color: var(--radar-green);
      letter-spacing: 0.1em;
      opacity: 0.7;
    }

    @keyframes spin {
      to { transform: rotate(360deg); }
    }

    /* Panel Buttons */
    .panel-btn {
      padding: 0.25rem 0.5rem;
      border: 1px solid rgba(251, 191, 36, 0.4);
      background: rgba(251, 191, 36, 0.1);
      color: #fbbf24;
      font-size: 0.75rem;
      cursor: pointer;
      border-radius: 4px;
      transition: all 0.2s ease;
      margin-left: 0.25rem;

      &:hover {
        background: rgba(251, 191, 36, 0.3);
        box-shadow: 0 0 10px rgba(251, 191, 36, 0.3);
      }

      &.day-trade {
        border-color: rgba(249, 115, 22, 0.4);
        background: rgba(249, 115, 22, 0.1);
        color: #f97316;

        &:hover {
          background: rgba(249, 115, 22, 0.3);
          box-shadow: 0 0 10px rgba(249, 115, 22, 0.3);
        }
      }

      &.momentum {
        border-color: rgba(168, 85, 247, 0.4);
        background: rgba(168, 85, 247, 0.1);
        color: #a855f7;

        &:hover {
          background: rgba(168, 85, 247, 0.3);
          box-shadow: 0 0 10px rgba(168, 85, 247, 0.3);
        }
      }
    }

    /* Dialog Styles */
    :host ::ng-deep .radar-dialog {
      .p-dialog {
        background: #0a1628;
        border: 1px solid rgba(57, 255, 20, 0.3);
        box-shadow: 0 0 30px rgba(57, 255, 20, 0.2);
      }

      .p-dialog-header {
        background: rgba(57, 255, 20, 0.05);
        border-bottom: 1px solid rgba(57, 255, 20, 0.2);
        color: #39ff14;
        font-family: 'Rajdhani', sans-serif;
        letter-spacing: 0.1em;
      }

      .p-dialog-content {
        background: #0a1628;
        color: #b8c5d0;
      }
    }

    .scoring-content, .search-content {
      font-family: 'Share Tech Mono', monospace;
    }

    .scoring-intro {
      background: rgba(57, 255, 20, 0.05);
      border: 1px solid rgba(57, 255, 20, 0.2);
      padding: 0.75rem;
      margin-bottom: 1rem;
      font-size: 0.8rem;
      line-height: 1.5;
    }

    .scoring-section {
      margin-bottom: 1rem;

      h4 {
        color: #39ff14;
        font-size: 0.85rem;
        margin: 0 0 0.5rem 0;
        letter-spacing: 0.05em;
      }
    }

    .scoring-list {
      list-style: none;
      padding: 0;
      margin: 0;

      li {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        padding: 0.25rem 0;
        font-size: 0.75rem;
      }

      .pts {
        min-width: 35px;
        padding: 0.15rem 0.35rem;
        border-radius: 3px;
        font-weight: 600;
        text-align: center;
      }

      &.positive .pts {
        background: rgba(34, 197, 94, 0.2);
        color: #22c55e;
      }

      &.negative .pts {
        background: rgba(239, 68, 68, 0.2);
        color: #ef4444;
      }
    }

    .scoring-note {
      background: rgba(251, 191, 36, 0.1);
      border: 1px solid rgba(251, 191, 36, 0.3);
      padding: 0.5rem 0.75rem;
      font-size: 0.75rem;
      color: #fbbf24;
      margin-top: 1rem;
    }

    /* Search Dialog */
    .search-input-row {
      margin-bottom: 1rem;
    }

    :host ::ng-deep .radar-autocomplete {
      width: 100%;

      .p-autocomplete-input {
        width: 100%;
        background: rgba(57, 255, 20, 0.05);
        border: 1px solid rgba(57, 255, 20, 0.3);
        color: #b8c5d0;
        font-family: 'Share Tech Mono', monospace;
        padding: 0.75rem;

        &:focus {
          border-color: #39ff14;
          box-shadow: 0 0 10px rgba(57, 255, 20, 0.3);
        }
      }

      .p-autocomplete-panel {
        background: #0a1628;
        border: 1px solid rgba(57, 255, 20, 0.3);
      }

      .p-autocomplete-item {
        color: #b8c5d0;

        &:hover {
          background: rgba(57, 255, 20, 0.1);
        }
      }
    }

    .search-item {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      padding: 0.25rem 0;

      .si-symbol {
        font-weight: 600;
        color: #39ff14;
        min-width: 60px;
      }

      .si-name {
        flex: 1;
        font-size: 0.8rem;
        color: #b8c5d0;
      }

      .si-price {
        font-size: 0.8rem;

        &.positive { color: #22c55e; }
        &.negative { color: #ef4444; }
      }
    }

    .search-result {
      background: rgba(0, 0, 0, 0.3);
      border: 1px solid rgba(57, 255, 20, 0.2);
      padding: 1rem;
    }

    .result-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 1rem;
      padding-bottom: 0.75rem;
      border-bottom: 1px solid rgba(57, 255, 20, 0.2);
    }

    .result-stock {
      display: flex;
      flex-direction: column;
      gap: 0.25rem;
    }

    .result-symbol {
      font-size: 1.25rem;
      font-weight: 600;
      color: #39ff14;
    }

    .result-name {
      font-size: 0.75rem;
      color: #b8c5d0;
    }

    .result-score {
      display: flex;
      align-items: baseline;
      gap: 0.15rem;
      padding: 0.5rem 1rem;
      border-radius: 4px;

      &.excellent { background: linear-gradient(135deg, #16a34a, #22c55e); }
      &.good { background: linear-gradient(135deg, #22c55e, #84cc16); }
      &.fair { background: linear-gradient(135deg, #f59e0b, #fbbf24); }
      &.poor { background: linear-gradient(135deg, #ef4444, #f97316); }

      .score-num {
        font-size: 1.5rem;
        font-weight: 700;
        color: white;
      }

      .score-max {
        font-size: 0.8rem;
        color: rgba(255, 255, 255, 0.7);
      }
    }

    .result-status {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.5rem 0.75rem;
      margin-bottom: 1rem;
      font-size: 0.8rem;

      &.qualifies {
        background: rgba(34, 197, 94, 0.15);
        border: 1px solid rgba(34, 197, 94, 0.3);
        color: #22c55e;
      }

      &.not-qualifies {
        background: rgba(239, 68, 68, 0.15);
        border: 1px solid rgba(239, 68, 68, 0.3);
        color: #ef4444;
      }

      .reason {
        color: #b8c5d0;
        font-size: 0.75rem;
      }
    }

    .result-breakdown, .result-signals, .result-metrics {
      margin-bottom: 1rem;

      h4 {
        color: #39ff14;
        font-size: 0.75rem;
        margin: 0 0 0.5rem 0;
        letter-spacing: 0.1em;
      }
    }

    .breakdown-list {
      display: flex;
      flex-direction: column;
      gap: 0.25rem;
    }

    .breakdown-item {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.35rem 0.5rem;
      background: rgba(0, 0, 0, 0.2);
      font-size: 0.75rem;

      &.positive { border-left: 2px solid #22c55e; }
      &.negative { border-left: 2px solid #ef4444; }

      .bd-label { flex: 1; color: #b8c5d0; }
      .bd-value { color: #8b9aab; min-width: 60px; }
      .bd-pts {
        min-width: 40px;
        text-align: right;
        font-weight: 600;
      }

      &.positive .bd-pts { color: #22c55e; }
      &.negative .bd-pts { color: #ef4444; }
    }

    .signals-list {
      display: flex;
      flex-wrap: wrap;
      gap: 0.35rem;
    }

    .signal-chip {
      padding: 0.2rem 0.5rem;
      background: rgba(57, 255, 20, 0.1);
      border: 1px solid rgba(57, 255, 20, 0.3);
      color: #39ff14;
      font-size: 0.7rem;
      border-radius: 3px;
    }

    .no-signals {
      color: #8b9aab;
      font-size: 0.75rem;
    }

    .metrics-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 0.5rem;
    }

    .metric-item {
      display: flex;
      flex-direction: column;
      gap: 0.15rem;
      padding: 0.35rem 0.5rem;
      background: rgba(0, 0, 0, 0.2);

      .m-label {
        font-size: 0.6rem;
        color: #8b9aab;
        letter-spacing: 0.05em;
      }

      .m-value {
        font-size: 0.8rem;
        color: #b8c5d0;

        &.positive { color: #22c55e; }
        &.negative { color: #ef4444; }
      }
    }

    .search-error {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.75rem;
      background: rgba(239, 68, 68, 0.15);
      border: 1px solid rgba(239, 68, 68, 0.3);
      color: #ef4444;
      font-size: 0.8rem;
    }

    /* Responsive */
    @media (max-width: 1200px) {
      .command-header {
        flex-direction: column;
        gap: 1rem;
        padding: 1rem;
      }

      .header-left, .header-right {
        width: 100%;
        justify-content: space-between;
      }
    }

    @media (max-width: 768px) {
      .threat-bar {
        flex-direction: column;
        gap: 1rem;
        padding: 0.75rem 1rem;
      }

      .command-main {
        padding: 1rem;
      }

      .priority-grid, .targets-grid {
        grid-template-columns: 1fr;
      }

      .panel-desc {
        display: none;
      }
    }

    /* ========== LIGHT MODE OVERRIDES ========== */
    :host-context(html:not(.dark-mode)) {
      .breakouts-radar {
        background: var(--radar-bg);
      }

      .radar-bg {
        background: linear-gradient(180deg, #e8f5e9 0%, #f0fdf4 50%, #ffffff 100%);
      }

      .grid-overlay {
        background-image: 
          linear-gradient(rgba(22, 163, 74, 0.08) 1px, transparent 1px),
          linear-gradient(90deg, rgba(22, 163, 74, 0.08) 1px, transparent 1px);
      }

      .scan-lines {
        background: repeating-linear-gradient(
          0deg,
          rgba(0, 0, 0, 0.02),
          rgba(0, 0, 0, 0.02) 1px,
          transparent 1px,
          transparent 2px
        );
      }

      .command-header {
        background: rgba(255, 255, 255, 0.95);
        border-bottom: 2px solid rgba(22, 163, 74, 0.3);
        box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
      }

      .id-label {
        color: #64748b;
      }

      .id-value {
        color: #166534;
      }

      .status-text {
        color: #166534;
      }

      .command-title {
        color: #14532d;
        text-shadow: none;
      }

      .command-subtitle {
        color: #166534;
      }

      .timestamp {
        color: #64748b;
      }

      .rescan-btn {
        background: rgba(22, 163, 74, 0.1);
        color: #166534;
        border: 1px solid rgba(22, 163, 74, 0.3);

        &:hover {
          background: rgba(22, 163, 74, 0.2);
        }
      }

      .threat-bar {
        background: rgba(255, 255, 255, 0.95);
        border-bottom: 1px solid rgba(22, 163, 74, 0.2);
      }

      .filter-btn {
        background: rgba(22, 163, 74, 0.08);
        border: 1px solid rgba(22, 163, 74, 0.2);
        color: #166534;

        &:hover {
          background: rgba(22, 163, 74, 0.15);
        }

        &.active {
          background: #16a34a;
          color: white;
          border-color: #16a34a;
        }
      }

      .threat-stats {
        color: #374151;
      }

      .stat-value {
        color: #166534;
      }

      /* Priority Panels - Light Mode */
      .priority-panel {
        background: linear-gradient(135deg, rgba(251, 191, 36, 0.15) 0%, rgba(34, 197, 94, 0.15) 100%);
        border: 2px solid rgba(180, 83, 9, 0.4);
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);

        &.day-trade {
          background: linear-gradient(135deg, rgba(249, 115, 22, 0.15) 0%, rgba(239, 68, 68, 0.15) 100%);
          border: 2px solid rgba(194, 65, 12, 0.4);
        }

        &.momentum {
          background: linear-gradient(135deg, rgba(139, 92, 246, 0.15) 0%, rgba(168, 85, 247, 0.15) 100%);
          border: 2px solid rgba(124, 58, 237, 0.4);
        }
      }

      .panel-header {
        background: rgba(255, 255, 255, 0.7);
        border-bottom: 1px solid rgba(0, 0, 0, 0.1);

        &:hover {
          background: rgba(255, 255, 255, 0.9);
        }
      }

      .panel-title {
        color: #92400e;
      }

      .day-trade .panel-title {
        color: #c2410c;
      }

      .momentum .panel-title {
        color: #7c3aed;
      }

      .priority-icon {
        color: #b45309;
        text-shadow: none;

        &.day-trade {
          color: #c2410c;
          text-shadow: none;
        }

        &.momentum {
          color: #7c3aed;
          text-shadow: none;
        }
      }

      .target-count {
        color: #374151;
      }

      .panel-desc {
        color: #4b5563;
      }

      .panel-toggle {
        color: #16a34a;
      }

      .scanning-state, .no-targets {
        color: #4b5563;
      }

      .scan-indicator {
        border-color: #16a34a;
        border-top-color: transparent;
      }

      .priority-card {
        border: 1px solid rgba(180, 83, 9, 0.3);
        background: rgba(255, 255, 255, 0.8);

        &:hover {
          border-color: #b45309;
          box-shadow: 0 4px 12px rgba(180, 83, 9, 0.2);
          background: rgba(255, 255, 255, 0.95);
        }

        &.day-trade {
          border: 1px solid rgba(194, 65, 12, 0.3);
          background: rgba(255, 255, 255, 0.8);

          &:hover {
            border-color: #c2410c;
            box-shadow: 0 4px 12px rgba(194, 65, 12, 0.2);
          }
        }

        &.momentum {
          border: 1px solid rgba(124, 58, 237, 0.3);
          background: rgba(255, 255, 255, 0.8);

          &:hover {
            border-color: #7c3aed;
            box-shadow: 0 4px 12px rgba(124, 58, 237, 0.2);
          }
        }
      }

      .pick-rank {
        background: linear-gradient(135deg, #b45309, #d97706);
        color: white;
      }

      .day-trade .pick-rank {
        background: linear-gradient(135deg, #c2410c, #ea580c);
      }

      .momentum .pick-rank {
        background: linear-gradient(135deg, #7c3aed, #8b5cf6);
      }

      .pick-symbol {
        color: #1f2937;
      }

      .pick-name {
        color: #4b5563;
      }

      .pick-change {
        &.positive { color: #16a34a; }
        &.negative { color: #dc2626; }
      }

      .pick-score {
        background: rgba(22, 163, 74, 0.1);
        color: #166534;
      }

      .pick-signals {
        color: #6b7280;
      }

      /* Category Sections - Light Mode */
      .category-section {
        background: rgba(255, 255, 255, 0.9);
        border: 1px solid rgba(22, 163, 74, 0.2);
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
      }

      .category-header {
        background: rgba(22, 163, 74, 0.05);
        border-bottom: 1px solid rgba(22, 163, 74, 0.15);

        &:hover {
          background: rgba(22, 163, 74, 0.1);
        }
      }

      .category-icon {
        color: #16a34a;
      }

      .category-label {
        color: #166534;
      }

      .category-count {
        color: #374151;
      }

      .category-desc {
        color: #4b5563;
      }

      .category-toggle {
        color: #16a34a;
      }

      /* Target Cards - Light Mode */
      .target-card {
        background: rgba(255, 255, 255, 0.95);
        border: 1px solid rgba(22, 163, 74, 0.15);

        &:hover {
          border-color: rgba(22, 163, 74, 0.4);
          box-shadow: 0 4px 12px rgba(22, 163, 74, 0.15);
        }

        &.bullish {
          border-left: 3px solid #16a34a;
        }

        &.bearish {
          border-left: 3px solid #dc2626;
        }
      }

      .threat-indicator {
        &.bullish { color: #16a34a; text-shadow: none; }
        &.bearish { color: #dc2626; text-shadow: none; }
        &.neutral { color: #d97706; }
      }

      .target-symbol {
        color: #1f2937;
      }

      .target-change {
        &.positive { color: #16a34a; }
        &.negative { color: #dc2626; }
      }

      .target-name {
        color: #4b5563;
      }

      .target-price {
        color: #1f2937;
      }

      .alert-block {
        background: rgba(22, 163, 74, 0.05);
        border: 1px solid rgba(22, 163, 74, 0.15);
      }

      .alert-type {
        color: #b45309;
      }

      .alert-desc {
        color: #4b5563;
      }

      .target-metrics {
        border-top: 1px solid rgba(22, 163, 74, 0.15);
      }

      .metric-label {
        color: #6b7280;
      }

      .metric-value {
        color: #374151;
      }

      /* Panel Buttons - Light Mode */
      .panel-btn {
        &.info {
          background: rgba(22, 163, 74, 0.1);
          color: #166534;

          &:hover {
            background: rgba(22, 163, 74, 0.2);
          }
        }

        &.search {
          background: rgba(180, 83, 9, 0.1);
          color: #92400e;

          &:hover {
            background: rgba(180, 83, 9, 0.2);
          }
        }
      }

      .day-trade .panel-btn.search {
        background: rgba(194, 65, 12, 0.1);
        color: #9a3412;

        &:hover {
          background: rgba(194, 65, 12, 0.2);
        }
      }

      .momentum .panel-btn.search {
        background: rgba(124, 58, 237, 0.1);
        color: #6d28d9;

        &:hover {
          background: rgba(124, 58, 237, 0.2);
        }
      }

      /* Dialog - Light Mode */
      :host ::ng-deep .radar-dialog {
        .p-dialog {
          background: #ffffff;
          border: 1px solid rgba(22, 163, 74, 0.3);
          box-shadow: 0 10px 40px rgba(0, 0, 0, 0.15);
        }

        .p-dialog-header {
          background: rgba(22, 163, 74, 0.08);
          border-bottom: 1px solid rgba(22, 163, 74, 0.2);
          color: #166534;
        }

        .p-dialog-content {
          background: #ffffff;
          color: #374151;
        }
      }

      .scoring-intro {
        background: rgba(22, 163, 74, 0.08);
        border: 1px solid rgba(22, 163, 74, 0.2);
        color: #374151;
      }

      .scoring-section h4 {
        color: #166534;
      }

      .scoring-note {
        background: rgba(180, 83, 9, 0.1);
        border: 1px solid rgba(180, 83, 9, 0.3);
        color: #92400e;
      }

      .breakdown-item {
        background: rgba(0, 0, 0, 0.03);

        .bd-label { color: #374151; }
        .bd-value { color: #6b7280; }
      }

      .signal-chip {
        background: rgba(22, 163, 74, 0.1);
        border: 1px solid rgba(22, 163, 74, 0.3);
        color: #166534;
      }

      .metric-item {
        background: rgba(0, 0, 0, 0.03);

        .m-label { color: #6b7280; }
        .m-value { color: #374151; }
      }

      .result-header .stock-name {
        color: #4b5563;
      }

      .no-signals {
        color: #6b7280;
      }

      .reason {
        color: #4b5563;
      }
    }
  `]
})
export class BreakoutsV2Component implements OnInit {
  private http = inject(HttpClient);
  private router = inject(Router);
  marketService = inject(MarketService);

  String = String;

  alertCategories: AlertCategory[] = [
    { 
      id: 'ma_crossover', 
      label: 'MA_CROSSOVERS', 
      icon: '⇄',
      description: 'Stocks crossing above or below key moving averages (50 & 200 day)'
    },
    { 
      id: '52w_highs', 
      label: '52W_HIGHS', 
      icon: '▲',
      description: 'Stocks at or near their 52-week high'
    },
    { 
      id: '52w_lows', 
      label: '52W_LOWS', 
      icon: '▼',
      description: 'Stocks at or near their 52-week low'
    },
    { 
      id: 'rsi_signals', 
      label: 'RSI_SIGNALS', 
      icon: '◐',
      description: 'Overbought (RSI > 70) or oversold (RSI < 30) conditions'
    },
    { 
      id: 'macd_signals', 
      label: 'MACD_CROSSOVERS', 
      icon: '⚡',
      description: 'Bullish or bearish MACD line crossovers'
    },
    { 
      id: 'volume_breakout', 
      label: 'VOLUME_BREAKOUTS', 
      icon: '📊',
      description: 'Unusual trading volume (2x+ average)'
    }
  ];

  loading = signal(false);
  screenerLoading = signal(false);
  lastUpdated = signal<Date | null>(null);
  
  allBreakouts = signal<BreakoutStock[]>([]);
  allScreenerStocks = signal<Stock[]>([]);
  
  selectedSignal = signal<'all' | 'bullish' | 'bearish'>('all');
  topPicksCollapsed = signal(false);
  dayTradeCollapsed = signal(true);
  momentumCollapsed = signal(true);
  collapsedCategories = signal<string[]>(['ma_crossover', '52w_highs', '52w_lows', 'rsi_signals', 'macd_signals', 'volume_breakout']);

  // Dialog state
  showScoringDialog = false;
  scoringDialogType: 'topPicks' | 'dayTrade' | 'momentum' = 'topPicks';
  
  showScoreSearchDialog = false;
  scoreSearchType: 'topPicks' | 'dayTrade' | 'momentum' = 'topPicks';
  scoreSearchSelected: any = null;
  scoreSearchSuggestions = signal<any[]>([]);
  scoreSearchError = '';
  scoreSearchResult: {
    symbol: string;
    name: string;
    score: number;
    qualifies: boolean;
    reason?: string;
    signals: string[];
    breakdown: { label: string; value: string; points: number }[];
    metrics: {
      price: number;
      changePercent: number;
      rsi: number | null;
      pct50MA: number | null;
      pct200MA: number | null;
      pct52High: number | null;
      relVolume: number | null;
      market: string;
    };
  } | null = null;

  bullishCount = computed(() => this.allBreakouts().filter(s => s.severity === 'bullish').length);
  bearishCount = computed(() => this.allBreakouts().filter(s => s.severity === 'bearish').length);

  filteredBreakouts = computed(() => {
    const signal = this.selectedSignal();
    const breakouts = this.allBreakouts();
    if (signal === 'all') return breakouts;
    return breakouts.filter(s => s.severity === signal);
  });

  private deduplicateStocks(stocks: Stock[]): Stock[] {
    const baseMap = new Map<string, Stock>();
    for (const s of stocks) {
      const baseSymbol = s.symbol.replace(/\.(NS|BO)$/, '');
      const existing = baseMap.get(baseSymbol);
      if (!existing || (s.volume ?? 0) > (existing.volume ?? 0)) {
        baseMap.set(baseSymbol, s);
      }
    }
    return Array.from(baseMap.values());
  }

  private inferAlertTypes(s: Stock): { alertTypes: Set<string>; alertCategories: Set<string> } {
    const alertTypes = new Set<string>();
    const alertCategories = new Set<string>();
    
    if (s.macdSignalType === 'bullish_crossover') {
      alertTypes.add('macd_bullish_cross');
      alertCategories.add('macd');
    } else if (s.macdSignalType === 'bearish_crossover') {
      alertTypes.add('macd_bearish_cross');
      alertCategories.add('macd');
    }
    
    if (s.rsi !== null && s.rsi !== undefined) {
      if (s.rsi < 30) {
        alertTypes.add('rsi_oversold');
        alertCategories.add('rsi');
      } else if (s.rsi > 70) {
        alertTypes.add('rsi_overbought');
        alertCategories.add('rsi');
      }
    }
    
    return { alertTypes, alertCategories };
  }

  private scoreTopPicks(data: {
    pct50MA: number | null | undefined; pct200MA: number | null | undefined; pct52High: number | null | undefined;
    rsi: number | null | undefined; changePercent: number; relVolume: number | null | undefined;
    alertTypes: Set<string>; alertCategories: Set<string>;
  }): { score: number; signals: string[] } {
    const { pct50MA, pct200MA, pct52High, rsi, changePercent, relVolume, alertTypes } = data;
    let rawScore = 0;
    const signals: string[] = [];

    if (pct200MA != null && pct200MA > 0 && pct200MA <= 20) { rawScore += 4; signals.push('Above 200 MA'); }
    if (pct50MA != null && pct50MA > 0 && pct50MA <= 10) { rawScore += 3; signals.push('Above 50 MA'); }
    if (pct52High != null && pct52High >= -15 && pct52High <= -5) { rawScore += 3; signals.push('Near 52W High'); }
    
    if (rsi != null && rsi >= 50 && rsi <= 65) { rawScore += 3; signals.push('Strong Momentum'); }
    else if (rsi != null && rsi >= 40 && rsi < 50) { rawScore += 1; signals.push('Building Momentum'); }
    
    if (changePercent >= 1 && changePercent <= 5) { rawScore += 2; signals.push('Positive Day'); }
    if (relVolume != null && relVolume >= 1.2 && relVolume <= 2.5) { rawScore += 2; signals.push('Good Volume'); }
    
    if (alertTypes.has('macd_bullish_cross')) { rawScore += 3; signals.push('MACD Bullish'); }

    if (rsi != null && rsi > 75) { rawScore -= 2; signals.push('Overbought'); }
    if (pct50MA != null && pct50MA > 30) { rawScore -= 2; signals.push('Too Extended'); }
    if (alertTypes.has('macd_bearish_cross')) { rawScore -= 2; signals.push('Bearish MACD'); }

    const MAX = 20;
    const score = Math.max(0, Math.min(100, Math.round((rawScore / MAX) * 100)));
    return { score, signals };
  }

  private scoreDayTrade(data: {
    pct50MA: number | null | undefined; pct200MA: number | null | undefined; pct52High: number | null | undefined;
    rsi: number | null | undefined; changePercent: number; relVolume: number | null | undefined;
    alertTypes: Set<string>;
  }): { score: number; signals: string[] } {
    const { pct50MA, pct200MA, pct52High, rsi, changePercent, relVolume, alertTypes } = data;
    let rawScore = 0;
    const signals: string[] = [];

    if (changePercent >= 5) { rawScore += 7; signals.push('Big Mover'); }
    else if (changePercent >= 3) { rawScore += 5; signals.push('Strong Move'); }
    else if (changePercent >= 1.5) { rawScore += 3; signals.push('Good Move'); }
    else if (changePercent > 0) { rawScore += 1; signals.push('Positive Day'); }

    if (relVolume != null) {
      if (relVolume >= 2.5) { rawScore += 6; signals.push('Massive Volume'); }
      else if (relVolume >= 1.8) { rawScore += 4; signals.push('High Volume'); }
      else if (relVolume >= 1.3) { rawScore += 2; signals.push('Above Avg Volume'); }
    }

    if (pct52High != null) {
      if (pct52High >= 0) { rawScore += 5; signals.push('New 52W High'); }
      else if (pct52High >= -3) { rawScore += 3; signals.push('Near 52W High'); }
    }
    if (alertTypes.has('macd_bullish_cross')) { rawScore += 3; signals.push('MACD Bullish'); }

    if (rsi != null) {
      if (rsi >= 60 && rsi <= 75) { rawScore += 3; signals.push('Strong RSI'); }
      else if (rsi >= 50 && rsi < 60) { rawScore += 1; }
      if (rsi > 80) { rawScore -= 2; signals.push('Extreme RSI'); }
    }

    if (pct50MA != null && pct50MA > 0) { rawScore += 1; signals.push('Above 50 MA'); }
    if (pct200MA != null && pct200MA > 0) { rawScore += 1; signals.push('Above 200 MA'); }

    if (changePercent < 0) { rawScore -= 3; signals.push('Negative Day'); }
    if (relVolume != null && relVolume < 0.7) { rawScore -= 2; signals.push('Low Volume'); }
    if (alertTypes.has('macd_bearish_cross')) { rawScore -= 2; signals.push('Bearish MACD'); }

    const MAX = 26;
    const score = Math.max(0, Math.min(100, Math.round((rawScore / MAX) * 100)));
    return { score, signals };
  }

  private scoreMomentum(data: {
    pct50MA: number | null | undefined; pct200MA: number | null | undefined; pct52High: number | null | undefined;
    rsi: number | null | undefined; changePercent: number; relVolume: number | null | undefined;
    alertTypes: Set<string>;
  }): { score: number; signals: string[] } {
    const { pct50MA, pct200MA, pct52High, rsi, changePercent, relVolume, alertTypes } = data;
    let rawScore = 0;
    const signals: string[] = [];

    if (pct50MA != null) {
      if (pct50MA >= 30) { rawScore += 5; signals.push('Strong Momentum'); }
      else if (pct50MA >= 15) { rawScore += 3; signals.push('Good Momentum'); }
      else if (pct50MA >= 5) { rawScore += 1; signals.push('Mild Momentum'); }
    }
    if (pct200MA != null) {
      if (pct200MA >= 50) { rawScore += 4; signals.push('Major Uptrend'); }
      else if (pct200MA >= 20) { rawScore += 2; signals.push('Uptrend'); }
    }

    if (pct52High != null && pct52High >= -5) { rawScore += 4; signals.push('52W High Zone'); }
    if (alertTypes.has('macd_bullish_cross')) { rawScore += 3; signals.push('MACD Bullish'); }

    if (changePercent >= 5) { rawScore += 4; signals.push('Big Move Today'); }
    else if (changePercent >= 2) { rawScore += 2; signals.push('Moving Today'); }

    if (relVolume != null && relVolume >= 1.5) { rawScore += 2; signals.push('High Volume'); }

    if (rsi != null && rsi >= 55 && rsi <= 75) { rawScore += 2; signals.push('RSI Momentum'); }

    if (changePercent < 0) { rawScore -= 3; signals.push('Down Today'); }
    if (rsi != null && rsi > 80) { rawScore -= 2; signals.push('Overbought'); }
    if (pct50MA != null && pct50MA < 0) { rawScore -= 3; signals.push('Below 50 MA'); }

    const MAX = 24;
    const score = Math.max(0, Math.min(100, Math.round((rawScore / MAX) * 100)));
    return { score, signals };
  }

  topPicks = computed(() => {
    const stocks = this.deduplicateStocks(this.allScreenerStocks());
    if (stocks.length === 0) return [];
    
    const market = this.marketService.currentMarket();
    const MIN_MARKET_CAP = market === 'IN' ? 20_000_000_000 : 100_000_000_000;
    
    const stockScores = stocks
      .filter(s => s.marketCap >= MIN_MARKET_CAP && !s.symbol.includes('-'))
      .map(s => {
        const { alertTypes, alertCategories } = this.inferAlertTypes(s);
        const result = this.scoreTopPicks({
          pct50MA: s.percentFromFiftyDayMA, pct200MA: s.percentFromTwoHundredDayMA,
          pct52High: s.percentFromFiftyTwoWeekHigh, rsi: s.rsi,
          changePercent: s.changePercent, relVolume: s.relativeVolume,
          alertTypes, alertCategories
        });
        return { stock: s as any, score: result.score, signals: result.signals };
      });
    
    const ranked = stockScores
      .filter(s => {
        const validSignals = s.signals.filter(sig => !['Overbought', 'Death Cross', 'Bearish MACD', 'Too Extended', 'Below 200 MA', 'Weak Rating'].includes(sig));
        const above200MA = s.stock.percentFromTwoHundredDayMA != null && s.stock.percentFromTwoHundredDayMA > 0;
        return s.score >= 25 && validSignals.length >= 3 && above200MA;
      })
      .sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        return b.stock.changePercent - a.stock.changePercent;
      })
      .slice(0, 15);
    
    return ranked;
  });

  dayTradePicks = computed(() => {
    const stocks = this.deduplicateStocks(this.allScreenerStocks());
    if (stocks.length === 0) return [];
    
    const market = this.marketService.currentMarket();
    const MIN_MARKET_CAP = market === 'IN' ? 20_000_000_000 : 100_000_000_000;
    
    const stockScores = stocks
      .filter(s => s.marketCap >= MIN_MARKET_CAP && !s.symbol.includes('-'))
      .map(s => {
        const { alertTypes } = this.inferAlertTypes(s);
        const result = this.scoreDayTrade({
          pct50MA: s.percentFromFiftyDayMA, pct200MA: s.percentFromTwoHundredDayMA,
          pct52High: s.percentFromFiftyTwoWeekHigh, rsi: s.rsi,
          changePercent: s.changePercent, relVolume: s.relativeVolume,
          alertTypes
        });
        return { stock: s as any, score: result.score, signals: result.signals };
      });
    
    const ranked = stockScores
      .filter(s => {
        const validSignals = s.signals.filter(sig => !['Extreme RSI', 'Negative Day', 'Low Volume', 'Bearish MACD'].includes(sig));
        return s.score >= 31 && s.stock.changePercent > 0 && validSignals.length >= 2;
      })
      .sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        if (b.stock.changePercent !== a.stock.changePercent) return b.stock.changePercent - a.stock.changePercent;
        const aVol = a.stock.relativeVolume ?? 1;
        const bVol = b.stock.relativeVolume ?? 1;
        return bVol - aVol;
      })
      .slice(0, 15);
    
    return ranked;
  });

  momentumPicks = computed(() => {
    const stocks = this.deduplicateStocks(this.allScreenerStocks());
    if (stocks.length === 0) return [];
    
    const market = this.marketService.currentMarket();
    const MIN_MARKET_CAP = market === 'IN' ? 20_000_000_000 : 100_000_000_000;
    
    const stockScores = stocks
      .filter(s => s.marketCap >= MIN_MARKET_CAP && !s.symbol.includes('-'))
      .map(s => {
        const { alertTypes } = this.inferAlertTypes(s);
        const result = this.scoreMomentum({
          pct50MA: s.percentFromFiftyDayMA, pct200MA: s.percentFromTwoHundredDayMA,
          pct52High: s.percentFromFiftyTwoWeekHigh, rsi: s.rsi,
          changePercent: s.changePercent, relVolume: s.relativeVolume,
          alertTypes
        });
        return { stock: s as any, score: result.score, signals: result.signals };
      });
    
    const ranked = stockScores
      .filter(s => {
        const validSignals = s.signals.filter(sig => !['Down Today', 'Overbought', 'Below 50 MA'].includes(sig));
        const above50MA = s.stock.percentFromFiftyDayMA != null && s.stock.percentFromFiftyDayMA > 0;
        return s.score >= 42 && above50MA && validSignals.length >= 3;
      })
      .sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        const aFromHigh = a.stock.percentFromFiftyTwoWeekHigh ?? -100;
        const bFromHigh = b.stock.percentFromFiftyTwoWeekHigh ?? -100;
        if (bFromHigh !== aFromHigh) return bFromHigh - aFromHigh;
        return b.stock.changePercent - a.stock.changePercent;
      })
      .slice(0, 15);
    
    return ranked;
  });

  private previousMarket: Market | null = null;

  constructor() {
    // React to market changes
    effect(() => {
      const market = this.marketService.currentMarket();
      if (this.previousMarket !== null && this.previousMarket !== market) {
        this.loadBreakouts();
        this.loadScreenerStocks();
      }
      this.previousMarket = market;
    });
  }

  ngOnInit(): void {
    this.loadBreakouts();
    this.loadScreenerStocks();
  }

  async loadBreakouts(): Promise<void> {
    this.loading.set(true);
    
    try {
      const market = this.marketService.currentMarket();
      const result = await this.http.get<{ breakouts: BreakoutStock[] }>(
        `/api/market?action=breakouts&market=${market}`
      ).toPromise();
      
      if (result?.breakouts) {
        this.allBreakouts.set(result.breakouts);
        this.lastUpdated.set(new Date());
      }
    } catch (err) {
      console.error('Failed to load breakouts:', err);
    } finally {
      this.loading.set(false);
    }
  }

  async loadScreenerStocks(): Promise<void> {
    this.screenerLoading.set(true);
    
    try {
      const market = this.marketService.currentMarket();
      const filters = getDefaultFilters(market);
      const requestBody = {
        filters,
        sort: { field: 'marketCap', direction: 'desc' },
        pagination: { page: 0, pageSize: 10000 }
      };
      const result = await this.http.post<ScreenResult>('/api/stocks?action=screen', requestBody).toPromise();
      
      if (result?.stocks) {
        this.allScreenerStocks.set(result.stocks);
      }
    } catch (err) {
      console.error('Failed to load screener stocks:', err);
    } finally {
      this.screenerLoading.set(false);
    }
  }

  loadData(): void {
    this.loadBreakouts();
    this.loadScreenerStocks();
  }

  refreshData(): void {
    if (!this.loading()) {
      this.loadBreakouts();
      this.loadScreenerStocks();
    }
  }

  setSignalFilter(signal: 'all' | 'bullish' | 'bearish'): void {
    this.selectedSignal.set(signal);
  }

  toggleTopPicks(): void {
    this.topPicksCollapsed.set(!this.topPicksCollapsed());
  }

  toggleDayTrade(): void {
    this.dayTradeCollapsed.set(!this.dayTradeCollapsed());
  }

  toggleMomentum(): void {
    this.momentumCollapsed.set(!this.momentumCollapsed());
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
    window.open(`/v2/stock/${symbol}`, '_blank');
  }

  getTimeAgo(date: Date): string {
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    
    if (diffMins < 1) return 'JUST_NOW';
    if (diffMins < 60) return `${diffMins}M_AGO`;
    
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}H_AGO`;
    
    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays}D_AGO`;
  }

  // Scoring Info Dialog
  showScoringInfo(event: Event, type: 'topPicks' | 'dayTrade' | 'momentum'): void {
    event.stopPropagation();
    this.scoringDialogType = type;
    this.showScoringDialog = true;
  }

  getScoringDialogTitle(): string {
    switch (this.scoringDialogType) {
      case 'topPicks': return 'PRIORITY_TARGETS_SCORING';
      case 'dayTrade': return 'DAY_TRADE_SCORING';
      case 'momentum': return 'MOMENTUM_SCORING';
    }
  }

  // Score Search Dialog
  openScoreSearch(event: Event, type: 'topPicks' | 'dayTrade' | 'momentum'): void {
    event.stopPropagation();
    this.scoreSearchType = type;
    this.scoreSearchSelected = null;
    this.scoreSearchResult = null;
    this.scoreSearchError = '';
    this.scoreSearchSuggestions.set([]);
    this.showScoreSearchDialog = true;
  }

  getScoreSearchTitle(): string {
    switch (this.scoreSearchType) {
      case 'topPicks': return 'PRIORITY_TARGETS';
      case 'dayTrade': return 'DAY_TRADE';
      case 'momentum': return 'MOMENTUM';
    }
  }

  async onScoreSearchComplete(event: AutoCompleteCompleteEvent): Promise<void> {
    const query = event.query.trim();
    if (query.length < 1) {
      this.scoreSearchSuggestions.set([]);
      return;
    }

    try {
      const result = await this.http.get<{ stocks: Stock[] }>(
        `/api/stocks?action=search&q=${encodeURIComponent(query)}&technicals=true&fuzzy=true`
      ).toPromise();
      
      if (result?.stocks) {
        this.scoreSearchSuggestions.set(result.stocks.slice(0, 10));
      }
    } catch (err) {
      console.error('Search failed:', err);
      this.scoreSearchSuggestions.set([]);
    }
  }

  onScoreSearchSelect(event: any): void {
    const stock = event.value || event;
    if (!stock) return;

    this.scoreSearchError = '';
    
    const { alertTypes, alertCategories } = this.inferAlertTypes(stock);
    const scoringData = {
      pct50MA: stock.percentFromFiftyDayMA,
      pct200MA: stock.percentFromTwoHundredDayMA,
      pct52High: stock.percentFromFiftyTwoWeekHigh,
      rsi: stock.rsi,
      changePercent: stock.changePercent,
      relVolume: stock.relativeVolume,
      alertTypes,
      alertCategories
    };

    let result: { score: number; signals: string[]; breakdown?: { label: string; value: string; points: number }[] };
    let qualifies = false;
    let reason = '';

    if (this.scoreSearchType === 'topPicks') {
      result = this.scoreTopPicksWithBreakdown(scoringData);
      const validSignals = result.signals.filter(sig => !['Overbought', 'Death Cross', 'Bearish MACD', 'Too Extended', 'Below 200 MA'].includes(sig));
      const above200MA = stock.percentFromTwoHundredDayMA != null && stock.percentFromTwoHundredDayMA > 0;
      qualifies = result.score >= 25 && validSignals.length >= 3 && above200MA;
      if (!qualifies) {
        if (result.score < 25) reason = `Score ${result.score} < 25 required`;
        else if (!above200MA) reason = 'Not above 200 MA';
        else if (validSignals.length < 3) reason = `Only ${validSignals.length} signals (3 required)`;
      }
    } else if (this.scoreSearchType === 'dayTrade') {
      result = this.scoreDayTradeWithBreakdown(scoringData);
      const validSignals = result.signals.filter(sig => !['Extreme RSI', 'Negative Day', 'Low Volume', 'Bearish MACD'].includes(sig));
      qualifies = result.score >= 31 && stock.changePercent > 0 && validSignals.length >= 2;
      if (!qualifies) {
        if (result.score < 31) reason = `Score ${result.score} < 31 required`;
        else if (stock.changePercent <= 0) reason = 'Not positive today';
        else if (validSignals.length < 2) reason = `Only ${validSignals.length} signals (2 required)`;
      }
    } else {
      result = this.scoreMomentumWithBreakdown(scoringData);
      const validSignals = result.signals.filter(sig => !['Down Today', 'Overbought', 'Below 50 MA'].includes(sig));
      const above50MA = stock.percentFromFiftyDayMA != null && stock.percentFromFiftyDayMA > 0;
      qualifies = result.score >= 42 && above50MA && validSignals.length >= 3;
      if (!qualifies) {
        if (result.score < 42) reason = `Score ${result.score} < 42 required`;
        else if (!above50MA) reason = 'Not above 50 MA';
        else if (validSignals.length < 3) reason = `Only ${validSignals.length} signals (3 required)`;
      }
    }

    this.scoreSearchResult = {
      symbol: stock.symbol,
      name: stock.name,
      score: result.score,
      qualifies,
      reason,
      signals: result.signals,
      breakdown: result.breakdown || [],
      metrics: {
        price: stock.price,
        changePercent: stock.changePercent,
        rsi: stock.rsi,
        pct50MA: stock.percentFromFiftyDayMA,
        pct200MA: stock.percentFromTwoHundredDayMA,
        pct52High: stock.percentFromFiftyTwoWeekHigh,
        relVolume: stock.relativeVolume,
        market: stock.market || 'US'
      }
    };
  }

  getScoreClass(score: number): string {
    if (score >= 70) return 'excellent';
    if (score >= 50) return 'good';
    if (score >= 30) return 'fair';
    return 'poor';
  }

  private scoreTopPicksWithBreakdown(data: any): { score: number; signals: string[]; breakdown: { label: string; value: string; points: number }[] } {
    const { pct50MA, pct200MA, pct52High, rsi, changePercent, relVolume, alertTypes } = data;
    let rawScore = 0;
    const signals: string[] = [];
    const breakdown: { label: string; value: string; points: number }[] = [];
    const add = (label: string, value: string, pts: number) => { breakdown.push({ label, value, points: pts }); rawScore += pts; };

    if (pct200MA != null && pct200MA > 0 && pct200MA <= 20) { add('Above 200 MA', `+${pct200MA.toFixed(1)}%`, 4); signals.push('Above 200 MA'); }
    if (pct50MA != null && pct50MA > 0 && pct50MA <= 10) { add('Above 50 MA', `+${pct50MA.toFixed(1)}%`, 3); signals.push('Above 50 MA'); }
    if (pct52High != null && pct52High >= -15 && pct52High <= -5) { add('Near 52W High', `${pct52High.toFixed(1)}%`, 3); signals.push('Near 52W High'); }
    
    if (rsi != null && rsi >= 50 && rsi <= 65) { add('RSI 50-65', `${rsi.toFixed(0)}`, 3); signals.push('Strong Momentum'); }
    else if (rsi != null && rsi >= 40 && rsi < 50) { add('RSI 40-50', `${rsi.toFixed(0)}`, 1); signals.push('Building Momentum'); }
    
    if (changePercent >= 1 && changePercent <= 5) { add('Positive Day', `+${changePercent.toFixed(2)}%`, 2); signals.push('Positive Day'); }
    if (relVolume != null && relVolume >= 1.2 && relVolume <= 2.5) { add('Good Volume', `${relVolume.toFixed(2)}x`, 2); signals.push('Good Volume'); }
    
    if (alertTypes.has('macd_bullish_cross')) { add('MACD Bullish', 'Crossover', 3); signals.push('MACD Bullish'); }

    if (rsi != null && rsi > 75) { add('Overbought RSI', `${rsi.toFixed(0)}`, -2); signals.push('Overbought'); }
    if (pct50MA != null && pct50MA > 30) { add('Too Extended', `+${pct50MA.toFixed(1)}%`, -2); signals.push('Too Extended'); }
    if (alertTypes.has('macd_bearish_cross')) { add('Bearish MACD', 'Crossover', -2); signals.push('Bearish MACD'); }

    const MAX = 20;
    const score = Math.max(0, Math.min(100, Math.round((rawScore / MAX) * 100)));
    return { score, signals, breakdown };
  }

  private scoreDayTradeWithBreakdown(data: any): { score: number; signals: string[]; breakdown: { label: string; value: string; points: number }[] } {
    const { pct50MA, pct200MA, pct52High, rsi, changePercent, relVolume, alertTypes } = data;
    let rawScore = 0;
    const signals: string[] = [];
    const breakdown: { label: string; value: string; points: number }[] = [];
    const add = (label: string, value: string, pts: number) => { breakdown.push({ label, value, points: pts }); rawScore += pts; };

    if (changePercent >= 5) { add('Big Mover (5%+)', `+${changePercent.toFixed(2)}%`, 7); signals.push('Big Mover'); }
    else if (changePercent >= 3) { add('Strong Move (3-5%)', `+${changePercent.toFixed(2)}%`, 5); signals.push('Strong Move'); }
    else if (changePercent >= 1.5) { add('Good Move (1.5-3%)', `+${changePercent.toFixed(2)}%`, 3); signals.push('Good Move'); }
    else if (changePercent > 0) { add('Positive Day', `+${changePercent.toFixed(2)}%`, 1); signals.push('Positive Day'); }

    if (relVolume != null) {
      if (relVolume >= 2.5) { add('Massive Volume', `${relVolume.toFixed(2)}x`, 6); signals.push('Massive Volume'); }
      else if (relVolume >= 1.8) { add('High Volume', `${relVolume.toFixed(2)}x`, 4); signals.push('High Volume'); }
      else if (relVolume >= 1.3) { add('Above Avg Volume', `${relVolume.toFixed(2)}x`, 2); signals.push('Above Avg Volume'); }
    }

    if (pct52High != null) {
      if (pct52High >= 0) { add('New 52W High', 'Breakout', 5); signals.push('New 52W High'); }
      else if (pct52High >= -3) { add('Near 52W High', `${pct52High.toFixed(1)}%`, 3); signals.push('Near 52W High'); }
    }
    if (alertTypes.has('macd_bullish_cross')) { add('MACD Bullish', 'Crossover', 3); signals.push('MACD Bullish'); }

    if (rsi != null) {
      if (rsi >= 60 && rsi <= 75) { add('Strong RSI', `${rsi.toFixed(0)}`, 3); signals.push('Strong RSI'); }
      if (rsi > 80) { add('Extreme RSI', `${rsi.toFixed(0)}`, -2); signals.push('Extreme RSI'); }
    }

    if (pct50MA != null && pct50MA > 0) { add('Above 50 MA', `+${pct50MA.toFixed(1)}%`, 1); signals.push('Above 50 MA'); }
    if (pct200MA != null && pct200MA > 0) { add('Above 200 MA', `+${pct200MA.toFixed(1)}%`, 1); signals.push('Above 200 MA'); }

    if (changePercent < 0) { add('Negative Day', `${changePercent.toFixed(2)}%`, -3); signals.push('Negative Day'); }
    if (relVolume != null && relVolume < 0.7) { add('Low Volume', `${relVolume.toFixed(2)}x`, -2); signals.push('Low Volume'); }
    if (alertTypes.has('macd_bearish_cross')) { add('Bearish MACD', 'Crossover', -2); signals.push('Bearish MACD'); }

    const MAX = 26;
    const score = Math.max(0, Math.min(100, Math.round((rawScore / MAX) * 100)));
    return { score, signals, breakdown };
  }

  private scoreMomentumWithBreakdown(data: any): { score: number; signals: string[]; breakdown: { label: string; value: string; points: number }[] } {
    const { pct50MA, pct200MA, pct52High, rsi, changePercent, relVolume, alertTypes } = data;
    let rawScore = 0;
    const signals: string[] = [];
    const breakdown: { label: string; value: string; points: number }[] = [];
    const add = (label: string, value: string, pts: number) => { breakdown.push({ label, value, points: pts }); rawScore += pts; };

    if (pct50MA != null) {
      if (pct50MA >= 30) { add('Strong Momentum', `+${pct50MA.toFixed(1)}%`, 5); signals.push('Strong Momentum'); }
      else if (pct50MA >= 15) { add('Good Momentum', `+${pct50MA.toFixed(1)}%`, 3); signals.push('Good Momentum'); }
      else if (pct50MA >= 5) { add('Mild Momentum', `+${pct50MA.toFixed(1)}%`, 1); signals.push('Mild Momentum'); }
    }
    if (pct200MA != null) {
      if (pct200MA >= 50) { add('Major Uptrend', `+${pct200MA.toFixed(1)}%`, 4); signals.push('Major Uptrend'); }
      else if (pct200MA >= 20) { add('Uptrend', `+${pct200MA.toFixed(1)}%`, 2); signals.push('Uptrend'); }
    }

    if (pct52High != null && pct52High >= -5) { add('52W High Zone', `${pct52High.toFixed(1)}%`, 4); signals.push('52W High Zone'); }
    if (alertTypes.has('macd_bullish_cross')) { add('MACD Bullish', 'Crossover', 3); signals.push('MACD Bullish'); }

    if (changePercent >= 5) { add('Big Move Today', `+${changePercent.toFixed(2)}%`, 4); signals.push('Big Move Today'); }
    else if (changePercent >= 2) { add('Moving Today', `+${changePercent.toFixed(2)}%`, 2); signals.push('Moving Today'); }

    if (relVolume != null && relVolume >= 1.5) { add('High Volume', `${relVolume.toFixed(2)}x`, 2); signals.push('High Volume'); }

    if (rsi != null && rsi >= 55 && rsi <= 75) { add('RSI Momentum Zone', `${rsi.toFixed(0)}`, 2); signals.push('RSI Momentum'); }

    if (changePercent < 0) { add('Down Today', `${changePercent.toFixed(2)}%`, -3); signals.push('Down Today'); }
    if (rsi != null && rsi > 80) { add('Overbought', `${rsi.toFixed(0)}`, -2); signals.push('Overbought'); }
    if (pct50MA != null && pct50MA < 0) { add('Below 50 MA', `${pct50MA.toFixed(1)}%`, -3); signals.push('Below 50 MA'); }

    const MAX = 24;
    const score = Math.max(0, Math.min(100, Math.round((rawScore / MAX) * 100)));
    return { score, signals, breakdown };
  }
}
