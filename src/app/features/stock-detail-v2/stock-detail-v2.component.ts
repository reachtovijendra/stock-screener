import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule, DecimalPipe } from '@angular/common';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { FormsModule } from '@angular/forms';

import { ButtonModule } from 'primeng/button';
import { ProgressSpinnerModule } from 'primeng/progressspinner';
import { TooltipModule } from 'primeng/tooltip';

import { Stock } from '../../core/models/stock.model';
import { MarketService } from '../../core/services';

interface NewsItem {
  title: string;
  link: string;
  pubDate: string;
  description: string;
  source: string;
  type: string;
  timeAgo: string;
  priority: number;
}

type SignalType = 'strong_sell' | 'sell' | 'neutral' | 'buy' | 'strong_buy';

@Component({
  selector: 'app-stock-detail-v2',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    FormsModule,
    ButtonModule,
    ProgressSpinnerModule,
    TooltipModule,
    DecimalPipe
  ],
  template: `
    <div class="theme-deco stock-deco">
      <!-- Art Deco Pattern Background -->
      <div class="deco-bg">
        <div class="sunburst"></div>
        <div class="geometric-pattern"></div>
      </div>

      @if (loading()) {
        <div class="loading-state">
          <div class="deco-loader">
            <div class="loader-diamond"></div>
            <div class="loader-rays"></div>
          </div>
          <span class="loading-text">Loading Stock Data</span>
        </div>
      }

      @if (error()) {
        <div class="error-state">
          <div class="error-frame">
            <div class="error-ornament">◆</div>
            <h2 class="error-title">{{ error() }}</h2>
            <button class="deco-btn" (click)="goBack()">Return to Screener</button>
          </div>
        </div>
      }

      @if (stock(); as s) {
        <!-- Hero Section -->
        <header class="deco-header">
          <div class="header-frame">
            <div class="frame-corner top-left"></div>
            <div class="frame-corner top-right"></div>
            <div class="frame-corner bottom-left"></div>
            <div class="frame-corner bottom-right"></div>
            
            <div class="header-content">
              <div class="stock-identity">
                <div class="symbol-badge">
                  <span class="badge-ornament">◆</span>
                  <span class="symbol-text">{{ s.symbol }}</span>
                  <span class="badge-ornament">◆</span>
                </div>
                <h1 class="company-name">{{ s.name }}</h1>
                <div class="company-meta">
                  <span class="exchange">{{ s.exchange }}</span>
                  <span class="divider">•</span>
                  <span class="sector">{{ s.sector }}</span>
                </div>
              </div>
              
              <div class="price-display">
                <div class="price-main">
                  <span class="price-value">{{ marketService.formatCurrency(s.price, s.market) }}</span>
                </div>
                <div class="price-change" [class.positive]="s.changePercent >= 0" [class.negative]="s.changePercent < 0">
                  <span class="change-arrow">{{ s.changePercent >= 0 ? '▲' : '▼' }}</span>
                  <span class="change-percent">{{ s.changePercent >= 0 ? '+' : '' }}{{ s.changePercent | number:'1.2-2' }}%</span>
                  <span class="change-value">({{ marketService.formatCurrency(Math.abs(s.change), s.market) }})</span>
                </div>
              </div>
            </div>

            <!-- 52 Week Range -->
            <div class="range-display">
              <div class="range-header">
                <span class="range-label">52 WEEK RANGE</span>
                <span class="range-position">{{ getRangePosition(s.price, s.fiftyTwoWeekLow, s.fiftyTwoWeekHigh) | number:'1.0-0' }}%</span>
              </div>
              <div class="range-bar-container">
                <span class="range-value">{{ marketService.formatCurrency(s.fiftyTwoWeekLow, s.market) }}</span>
                <div class="range-bar">
                  <div class="range-fill" [style.width.%]="getRangePosition(s.price, s.fiftyTwoWeekLow, s.fiftyTwoWeekHigh)"></div>
                  <div class="range-marker" [style.left.%]="getRangePosition(s.price, s.fiftyTwoWeekLow, s.fiftyTwoWeekHigh)">
                    <span class="marker-diamond">◆</span>
                  </div>
                </div>
                <span class="range-value">{{ marketService.formatCurrency(s.fiftyTwoWeekHigh, s.market) }}</span>
              </div>
            </div>
          </div>
        </header>

        <!-- Main Content -->
        <main class="deco-main">
          <!-- Key Statistics Panel -->
          <section class="stats-panel">
            <div class="panel-header">
              <div class="header-line"></div>
              <h2 class="panel-title">Key Statistics</h2>
              <div class="header-line"></div>
            </div>
            <div class="stats-grid">
              <div class="stat-card">
                <div class="stat-ornament">◇</div>
                <span class="stat-label">Market Cap</span>
                <span class="stat-value">{{ marketService.formatMarketCap(s.marketCap, s.market) }}</span>
              </div>
              <div class="stat-card">
                <div class="stat-ornament">◇</div>
                <span class="stat-label">P/E Ratio</span>
                <span class="stat-value">{{ s.peRatio !== null ? (s.peRatio | number:'1.2-2') : '—' }}</span>
              </div>
              <div class="stat-card">
                <div class="stat-ornament">◇</div>
                <span class="stat-label">Forward P/E</span>
                <span class="stat-value">{{ s.forwardPeRatio !== null ? (s.forwardPeRatio | number:'1.2-2') : '—' }}</span>
              </div>
              <div class="stat-card">
                <div class="stat-ornament">◇</div>
                <span class="stat-label">Volume</span>
                <span class="stat-value">{{ marketService.formatVolume(s.volume) }}</span>
              </div>
              <div class="stat-card">
                <div class="stat-ornament">◇</div>
                <span class="stat-label">Avg Volume</span>
                <span class="stat-value">{{ marketService.formatVolume(s.avgVolume) }}</span>
              </div>
              <div class="stat-card">
                <div class="stat-ornament">◇</div>
                <span class="stat-label">Dividend</span>
                <span class="stat-value">{{ s.dividendYield ? (s.dividendYield | number:'1.2-2') + '%' : '—' }}</span>
              </div>
            </div>
          </section>

          <!-- Two Column Layout -->
          <div class="content-columns">
            <!-- Technical Analysis -->
            <section class="analysis-panel">
              <div class="panel-header">
                <div class="header-line"></div>
                <h2 class="panel-title">Technical Analysis</h2>
                <div class="header-line"></div>
              </div>

              <!-- Signal Gauges -->
              <div class="gauges-container">
                <div class="gauge-card">
                  <div class="gauge-ring" [class]="getSignalClass(overallScore())">
                    <svg viewBox="0 0 100 100">
                      <circle class="gauge-bg" cx="50" cy="50" r="40"/>
                      <circle class="gauge-fill" cx="50" cy="50" r="40" [attr.stroke-dasharray]="getGaugeDashArray(overallScore())"/>
                    </svg>
                    <div class="gauge-center">
                      <span class="gauge-value">{{ overallScore() }}</span>
                    </div>
                  </div>
                  <span class="gauge-label">Overall</span>
                  <span class="gauge-signal" [class]="getSignalClass(overallScore())">{{ getSignalLabel(overallScore()) }}</span>
                </div>
                <div class="gauge-card">
                  <div class="gauge-ring" [class]="getSignalClass(technicalScore())">
                    <svg viewBox="0 0 100 100">
                      <circle class="gauge-bg" cx="50" cy="50" r="40"/>
                      <circle class="gauge-fill" cx="50" cy="50" r="40" [attr.stroke-dasharray]="getGaugeDashArray(technicalScore())"/>
                    </svg>
                    <div class="gauge-center">
                      <span class="gauge-value">{{ technicalScore() }}</span>
                    </div>
                  </div>
                  <span class="gauge-label">Technical</span>
                  <span class="gauge-signal" [class]="getSignalClass(technicalScore())">{{ getSignalLabel(technicalScore()) }}</span>
                </div>
                <div class="gauge-card">
                  <div class="gauge-ring" [class]="getSignalClass(maScore())">
                    <svg viewBox="0 0 100 100">
                      <circle class="gauge-bg" cx="50" cy="50" r="40"/>
                      <circle class="gauge-fill" cx="50" cy="50" r="40" [attr.stroke-dasharray]="getGaugeDashArray(maScore())"/>
                    </svg>
                    <div class="gauge-center">
                      <span class="gauge-value">{{ maScore() }}</span>
                    </div>
                  </div>
                  <span class="gauge-label">Moving Avg</span>
                  <span class="gauge-signal" [class]="getSignalClass(maScore())">{{ getSignalLabel(maScore()) }}</span>
                </div>
              </div>

              <!-- Indicators -->
              <div class="indicators-grid">
                <div class="indicator-card">
                  <div class="indicator-header">
                    <span class="indicator-name">RSI (14)</span>
                    <span class="indicator-signal" [class]="getRsiSignalClass(s.rsi)">{{ getRsiShortSignal(s.rsi) }}</span>
                  </div>
                  <div class="indicator-value" [class]="getRsiClass(s.rsi)">
                    {{ s.rsi !== null ? (s.rsi | number:'1.1-1') : '—' }}
                  </div>
                  <div class="indicator-bar">
                    <div class="bar-zones">
                      <div class="zone oversold"></div>
                      <div class="zone neutral"></div>
                      <div class="zone overbought"></div>
                    </div>
                    @if (s.rsi !== null) {
                      <div class="bar-marker" [style.left.%]="s.rsi">◆</div>
                    }
                  </div>
                </div>
                <div class="indicator-card">
                  <div class="indicator-header">
                    <span class="indicator-name">MACD</span>
                    <span class="indicator-signal" [class]="getMacdSignalClass(s.macdSignalType ?? undefined)">{{ getMacdShortSignal(s.macdSignalType ?? undefined) }}</span>
                  </div>
                  <div class="indicator-value" [class]="getMacdSignalClass(s.macdSignalType ?? undefined)">
                    {{ s.macdHistogram !== null ? (s.macdHistogram | number:'1.2-2') : '—' }}
                  </div>
                  <div class="indicator-desc">
                    {{ formatMacdSignalType(s.macdSignalType) }}
                  </div>
                </div>
                <div class="indicator-card">
                  <div class="indicator-header">
                    <span class="indicator-name">50 Day MA</span>
                    <span class="indicator-signal" [class]="(s.percentFromFiftyDayMA || 0) > 0 ? 'buy' : 'sell'">
                      {{ (s.percentFromFiftyDayMA || 0) > 0 ? 'Above' : 'Below' }}
                    </span>
                  </div>
                  <div class="indicator-value">
                    {{ s.fiftyDayMA !== null ? marketService.formatCurrency(s.fiftyDayMA, s.market) : '—' }}
                  </div>
                  <div class="indicator-change" [class.positive]="(s.percentFromFiftyDayMA || 0) > 0" [class.negative]="(s.percentFromFiftyDayMA || 0) < 0">
                    {{ (s.percentFromFiftyDayMA || 0) > 0 ? '+' : '' }}{{ s.percentFromFiftyDayMA | number:'1.2-2' }}%
                  </div>
                </div>
                <div class="indicator-card">
                  <div class="indicator-header">
                    <span class="indicator-name">200 Day MA</span>
                    <span class="indicator-signal" [class]="(s.percentFromTwoHundredDayMA || 0) > 0 ? 'buy' : 'sell'">
                      {{ (s.percentFromTwoHundredDayMA || 0) > 0 ? 'Above' : 'Below' }}
                    </span>
                  </div>
                  <div class="indicator-value">
                    {{ s.twoHundredDayMA !== null ? marketService.formatCurrency(s.twoHundredDayMA, s.market) : '—' }}
                  </div>
                  <div class="indicator-change" [class.positive]="(s.percentFromTwoHundredDayMA || 0) > 0" [class.negative]="(s.percentFromTwoHundredDayMA || 0) < 0">
                    {{ (s.percentFromTwoHundredDayMA || 0) > 0 ? '+' : '' }}{{ s.percentFromTwoHundredDayMA | number:'1.2-2' }}%
                  </div>
                </div>
              </div>
            </section>

            <!-- News Section -->
            <section class="news-panel">
              <div class="panel-header">
                <div class="header-line"></div>
                <h2 class="panel-title">Latest News</h2>
                <div class="header-line"></div>
              </div>

              @if (newsLoading()) {
                <div class="news-loading">
                  <span class="loading-diamond">◆</span>
                  <span>Loading news...</span>
                </div>
              } @else if (filteredNews().length === 0) {
                <div class="news-empty">
                  <span class="empty-ornament">◇</span>
                  <span>No recent news available</span>
                </div>
              } @else {
                <div class="news-list">
                  @for (item of filteredNews().slice(0, 8); track item.link; let i = $index) {
                    <a [href]="item.link" target="_blank" rel="noopener noreferrer" class="news-card" [style.animation-delay]="(i * 0.05) + 's'">
                      <div class="news-meta">
                        <span class="news-type">{{ getTypeBadgeLabel(item.type) }}</span>
                        <span class="news-time">{{ item.timeAgo }}</span>
                      </div>
                      <h3 class="news-title">{{ item.title }}</h3>
                      <span class="news-source">{{ item.source }}</span>
                    </a>
                  }
                </div>
              }
            </section>
          </div>
        </main>

        <!-- Footer -->
        <footer class="deco-footer">
          <div class="footer-ornament">◆ ◇ ◆</div>
          <button class="back-btn" (click)="goBack()">← Return to Screener</button>
        </footer>
      }
    </div>
  `,
  styles: [`
    .stock-deco {
      min-height: 100vh;
      background: var(--deco-bg);
      font-family: var(--deco-font-body);
      color: var(--deco-text);
      position: relative;
      overflow-x: hidden;
    }

    /* Art Deco Background */
    .deco-bg {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      pointer-events: none;
      z-index: 0;
    }

    .sunburst {
      position: absolute;
      top: -50%;
      left: 50%;
      width: 200%;
      height: 200%;
      transform: translateX(-50%);
      background: repeating-conic-gradient(
        from 0deg,
        transparent 0deg 5deg,
        rgba(212, 175, 55, 0.02) 5deg 10deg
      );
      animation: deco-sunburst 120s linear infinite;
    }

    .geometric-pattern {
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background-image: 
        linear-gradient(30deg, transparent 48%, rgba(212, 175, 55, 0.03) 50%, transparent 52%),
        linear-gradient(-30deg, transparent 48%, rgba(212, 175, 55, 0.03) 50%, transparent 52%);
      background-size: 60px 60px;
    }

    /* Loading State */
    .loading-state {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      background: var(--deco-bg);
      z-index: 100;
    }

    .deco-loader {
      position: relative;
      width: 80px;
      height: 80px;
      margin-bottom: 2rem;
    }

    .loader-diamond {
      position: absolute;
      top: 50%;
      left: 50%;
      width: 30px;
      height: 30px;
      background: var(--deco-gold);
      transform: translate(-50%, -50%) rotate(45deg);
      animation: pulse-diamond 1s ease-in-out infinite;
    }

    .loader-rays {
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      border: 2px solid var(--deco-gold);
      transform: rotate(45deg);
      animation: spin-rays 2s linear infinite;
    }

    @keyframes pulse-diamond {
      0%, 100% { transform: translate(-50%, -50%) rotate(45deg) scale(1); }
      50% { transform: translate(-50%, -50%) rotate(45deg) scale(1.2); }
    }

    @keyframes spin-rays {
      to { transform: rotate(405deg); }
    }

    .loading-text {
      font-family: var(--deco-font-display);
      font-size: 1.25rem;
      color: var(--deco-gold);
      letter-spacing: 0.2em;
    }

    /* Error State */
    .error-state {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      background: var(--deco-bg);
      z-index: 100;
    }

    .error-frame {
      text-align: center;
      padding: 3rem;
      border: 2px solid var(--deco-border);
      background: var(--deco-bg-card);
    }

    .error-ornament {
      font-size: 2rem;
      color: var(--deco-gold);
      margin-bottom: 1rem;
    }

    .error-title {
      font-family: var(--deco-font-display);
      font-size: 1.25rem;
      color: var(--deco-text);
      margin: 0 0 1.5rem 0;
    }

    .deco-btn {
      padding: 0.75rem 2rem;
      background: var(--deco-gold);
      border: none;
      color: var(--deco-bg);
      font-family: var(--deco-font-body);
      font-size: 0.85rem;
      font-weight: 600;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      cursor: pointer;
      transition: all 0.3s ease;

      &:hover {
        background: var(--deco-gold-bright);
        box-shadow: 0 0 20px rgba(212, 175, 55, 0.5);
      }
    }

    /* Header */
    .deco-header {
      position: relative;
      z-index: 1;
      padding: 2rem;
    }

    .header-frame {
      position: relative;
      max-width: 1200px;
      margin: 0 auto;
      padding: 2rem;
      background: var(--deco-bg-card);
      border: 2px solid var(--deco-border);
    }

    .frame-corner {
      position: absolute;
      width: 20px;
      height: 20px;
      border: 2px solid var(--deco-gold);

      &.top-left { top: -2px; left: -2px; border-right: none; border-bottom: none; }
      &.top-right { top: -2px; right: -2px; border-left: none; border-bottom: none; }
      &.bottom-left { bottom: -2px; left: -2px; border-right: none; border-top: none; }
      &.bottom-right { bottom: -2px; right: -2px; border-left: none; border-top: none; }
    }

    .header-content {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 2rem;
    }

    .stock-identity {
      text-align: center;
      flex: 1;
    }

    .symbol-badge {
      display: inline-flex;
      align-items: center;
      gap: 0.75rem;
      margin-bottom: 0.75rem;
    }

    .badge-ornament {
      color: var(--deco-gold);
      font-size: 0.8rem;
    }

    .symbol-text {
      font-family: var(--deco-font-display);
      font-size: 2.5rem;
      color: var(--deco-gold);
      letter-spacing: 0.1em;
    }

    .company-name {
      font-family: var(--deco-font-display);
      font-size: 1.25rem;
      font-weight: 300;
      color: var(--deco-text);
      margin: 0 0 0.5rem 0;
      letter-spacing: 0.05em;
    }

    .company-meta {
      display: flex;
      justify-content: center;
      gap: 0.75rem;
      font-size: 0.8rem;
      color: var(--deco-text-dim);
      text-transform: uppercase;
      letter-spacing: 0.1em;
    }

    .price-display {
      position: absolute;
      right: 2rem;
      top: 2rem;
      text-align: right;
    }

    .price-main {
      margin-bottom: 0.5rem;
    }

    .price-value {
      font-family: var(--deco-font-display);
      font-size: 2rem;
      color: var(--deco-ivory);
    }

    .price-change {
      display: flex;
      align-items: center;
      justify-content: flex-end;
      gap: 0.5rem;
      font-size: 0.9rem;

      &.positive { color: var(--deco-positive); }
      &.negative { color: var(--deco-negative); }
    }

    .change-value {
      color: var(--deco-text-dim);
    }

    /* Range Display */
    .range-display {
      padding-top: 1.5rem;
      border-top: 1px solid var(--deco-border);
    }

    .range-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 0.75rem;
    }

    .range-label {
      font-size: 0.7rem;
      letter-spacing: 0.15em;
      color: var(--deco-text-dim);
    }

    .range-position {
      font-family: var(--deco-font-display);
      font-size: 0.9rem;
      color: var(--deco-gold);
    }

    .range-bar-container {
      display: flex;
      align-items: center;
      gap: 1rem;
    }

    .range-value {
      font-size: 0.8rem;
      color: var(--deco-text-dim);
      min-width: 80px;

      &:last-child { text-align: right; }
    }

    .range-bar {
      flex: 1;
      height: 8px;
      background: var(--deco-bg);
      border: 1px solid var(--deco-border);
      position: relative;
    }

    .range-fill {
      height: 100%;
      background: linear-gradient(90deg, var(--deco-negative), var(--deco-gold), var(--deco-positive));
      opacity: 0.3;
    }

    .range-marker {
      position: absolute;
      top: 50%;
      transform: translate(-50%, -50%);
      color: var(--deco-gold);
      font-size: 0.8rem;
      text-shadow: 0 0 10px var(--deco-gold);
    }

    /* Main Content */
    .deco-main {
      position: relative;
      z-index: 1;
      max-width: 1200px;
      margin: 0 auto;
      padding: 0 2rem 2rem;
    }

    /* Panel Header */
    .panel-header {
      display: flex;
      align-items: center;
      gap: 1rem;
      margin-bottom: 1.5rem;
    }

    .header-line {
      flex: 1;
      height: 1px;
      background: linear-gradient(90deg, transparent, var(--deco-gold), transparent);
    }

    .panel-title {
      font-family: var(--deco-font-display);
      font-size: 1rem;
      font-weight: 400;
      color: var(--deco-gold);
      letter-spacing: 0.15em;
      text-transform: uppercase;
      margin: 0;
      white-space: nowrap;
    }

    /* Stats Panel */
    .stats-panel {
      margin-bottom: 2rem;
    }

    .stats-grid {
      display: grid;
      grid-template-columns: repeat(6, 1fr);
      gap: 1rem;
    }

    .stat-card {
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 1.25rem 1rem;
      background: var(--deco-bg-card);
      border: 1px solid var(--deco-border);
      text-align: center;
      transition: all 0.3s ease;

      &:hover {
        border-color: var(--deco-gold);
        box-shadow: 0 0 20px var(--deco-gold-dim);
      }
    }

    .stat-ornament {
      color: var(--deco-gold);
      font-size: 0.8rem;
      margin-bottom: 0.5rem;
      opacity: 0.5;
    }

    .stat-label {
      font-size: 0.65rem;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      color: var(--deco-text-dim);
      margin-bottom: 0.5rem;
    }

    .stat-value {
      font-family: var(--deco-font-display);
      font-size: 1.1rem;
      color: var(--deco-ivory);
    }

    /* Content Columns */
    .content-columns {
      display: grid;
      grid-template-columns: 1.2fr 0.8fr;
      gap: 2rem;
    }

    /* Analysis Panel */
    .analysis-panel {
      background: var(--deco-bg-card);
      border: 1px solid var(--deco-border);
      padding: 1.5rem;
    }

    .gauges-container {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 1.5rem;
      margin-bottom: 2rem;
    }

    .gauge-card {
      display: flex;
      flex-direction: column;
      align-items: center;
      text-align: center;
    }

    .gauge-ring {
      position: relative;
      width: 100px;
      height: 100px;
      margin-bottom: 0.75rem;

      svg {
        width: 100%;
        height: 100%;
        transform: rotate(-90deg);
      }

      .gauge-bg {
        fill: none;
        stroke: var(--deco-border);
        stroke-width: 8;
      }

      .gauge-fill {
        fill: none;
        stroke: var(--deco-gold);
        stroke-width: 8;
        stroke-linecap: round;
        transition: stroke-dasharray 0.5s ease;
      }

      &.strong-buy .gauge-fill, &.buy .gauge-fill { stroke: var(--deco-positive); }
      &.sell .gauge-fill, &.strong-sell .gauge-fill { stroke: var(--deco-negative); }
    }

    .gauge-center {
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
    }

    .gauge-value {
      font-family: var(--deco-font-display);
      font-size: 1.5rem;
      color: var(--deco-ivory);
    }

    .gauge-label {
      font-size: 0.7rem;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      color: var(--deco-text-dim);
      margin-bottom: 0.25rem;
    }

    .gauge-signal {
      font-size: 0.75rem;
      font-weight: 600;
      letter-spacing: 0.05em;
      color: var(--deco-gold);

      &.strong-buy, &.buy { color: var(--deco-positive); }
      &.sell, &.strong-sell { color: var(--deco-negative); }
    }

    /* Indicators Grid */
    .indicators-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 1rem;
    }

    .indicator-card {
      padding: 1rem;
      background: var(--deco-bg-elevated);
      border: 1px solid var(--deco-border);
    }

    .indicator-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 0.5rem;
    }

    .indicator-name {
      font-size: 0.7rem;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      color: var(--deco-text-dim);
    }

    .indicator-signal {
      font-size: 0.65rem;
      font-weight: 600;
      padding: 0.15rem 0.5rem;
      background: var(--deco-gold-dim);
      color: var(--deco-gold);

      &.buy { background: rgba(80, 200, 120, 0.15); color: var(--deco-positive); }
      &.sell { background: rgba(220, 20, 60, 0.15); color: var(--deco-negative); }
    }

    .indicator-value {
      font-family: var(--deco-font-display);
      font-size: 1.25rem;
      color: var(--deco-ivory);
      margin-bottom: 0.25rem;

      &.oversold { color: var(--deco-positive); }
      &.overbought { color: var(--deco-negative); }
      &.buy { color: var(--deco-positive); }
      &.sell { color: var(--deco-negative); }
    }

    .indicator-bar {
      position: relative;
      height: 6px;
      margin-top: 0.5rem;
    }

    .bar-zones {
      display: flex;
      height: 100%;
    }

    .zone {
      flex: 1;
      
      &.oversold { background: var(--deco-positive); opacity: 0.3; }
      &.neutral { background: var(--deco-gold); opacity: 0.3; }
      &.overbought { background: var(--deco-negative); opacity: 0.3; }
    }

    .bar-marker {
      position: absolute;
      top: 50%;
      transform: translate(-50%, -50%);
      color: var(--deco-gold);
      font-size: 0.6rem;
      text-shadow: 0 0 5px var(--deco-gold);
    }

    .indicator-desc {
      font-size: 0.7rem;
      color: var(--deco-text-dim);
      text-transform: capitalize;
    }

    .indicator-change {
      font-size: 0.8rem;

      &.positive { color: var(--deco-positive); }
      &.negative { color: var(--deco-negative); }
    }

    /* News Panel */
    .news-panel {
      background: var(--deco-bg-card);
      border: 1px solid var(--deco-border);
      padding: 1.5rem;
      max-height: 600px;
      overflow-y: auto;
    }

    .news-loading, .news-empty {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 0.75rem;
      padding: 2rem;
      text-align: center;
      color: var(--deco-text-dim);
    }

    .loading-diamond, .empty-ornament {
      color: var(--deco-gold);
      font-size: 1.5rem;
      animation: pulse-diamond 1s ease-in-out infinite;
    }

    .news-list {
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
    }

    .news-card {
      display: block;
      padding: 1rem;
      background: var(--deco-bg-elevated);
      border: 1px solid var(--deco-border);
      text-decoration: none;
      transition: all 0.3s ease;
      opacity: 0;
      animation: v2-fadeIn 0.3s ease forwards;

      &:hover {
        border-color: var(--deco-gold);
        background: var(--deco-bg-card);
      }
    }

    .news-meta {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 0.5rem;
    }

    .news-type {
      font-size: 0.6rem;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      color: var(--deco-gold);
    }

    .news-time {
      font-size: 0.65rem;
      color: var(--deco-text-dim);
    }

    .news-title {
      font-family: var(--deco-font-body);
      font-size: 0.85rem;
      font-weight: 500;
      color: var(--deco-text);
      margin: 0 0 0.5rem 0;
      line-height: 1.4;
    }

    .news-source {
      font-size: 0.65rem;
      color: var(--deco-text-dim);
    }

    /* Footer */
    .deco-footer {
      position: relative;
      z-index: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 1rem;
      padding: 2rem;
    }

    .footer-ornament {
      color: var(--deco-gold);
      font-size: 1rem;
      letter-spacing: 0.5em;
      opacity: 0.5;
    }

    .back-btn {
      padding: 0.75rem 2rem;
      background: transparent;
      border: 1px solid var(--deco-border);
      color: var(--deco-text);
      font-family: var(--deco-font-body);
      font-size: 0.8rem;
      letter-spacing: 0.1em;
      cursor: pointer;
      transition: all 0.3s ease;

      &:hover {
        border-color: var(--deco-gold);
        color: var(--deco-gold);
      }
    }

    /* Responsive */
    @media (max-width: 1200px) {
      .stats-grid {
        grid-template-columns: repeat(3, 1fr);
      }

      .content-columns {
        grid-template-columns: 1fr;
      }
    }

    @media (max-width: 768px) {
      .deco-header, .deco-main {
        padding: 1rem;
      }

      .header-content {
        flex-direction: column;
        text-align: center;
      }

      .price-display {
        position: static;
        text-align: center;
        margin-top: 1rem;
      }

      .stats-grid {
        grid-template-columns: repeat(2, 1fr);
      }

      .gauges-container {
        grid-template-columns: 1fr;
      }

      .indicators-grid {
        grid-template-columns: 1fr;
      }
    }
  `]
})
export class StockDetailV2Component implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private http = inject(HttpClient);
  marketService = inject(MarketService);

  Math = Math;

  loading = signal(true);
  error = signal<string | null>(null);
  stock = signal<Stock | null>(null);
  news = signal<NewsItem[]>([]);
  newsLoading = signal(false);
  selectedNewsTypes = signal<string[]>([]);

  newsTypes = [
    { label: 'All', value: 'all' },
    { label: 'Market', value: 'market' },
    { label: 'Price Target', value: 'price_target' },
    { label: 'Rating', value: 'upgrade_downgrade' },
    { label: 'Earnings', value: 'earnings' },
    { label: 'Insider', value: 'insider' },
    { label: 'Dividend', value: 'dividend' }
  ];

  filteredNews = computed(() => {
    const allNews = this.news();
    const selected = this.selectedNewsTypes();
    
    if (selected.length === 0 || selected.includes('all')) {
      return allNews;
    }
    
    return allNews.filter(item => selected.includes(item.type));
  });

  overallScore = computed(() => {
    const s = this.stock();
    if (!s) return 50;
    
    let score = 50;
    
    if (s.rsi !== null) {
      if (s.rsi >= 30 && s.rsi <= 70) score += 10;
      else if (s.rsi < 30) score += 15;
      else if (s.rsi > 70) score -= 10;
    }
    
    if (s.macdSignalType === 'bullish_crossover') score += 15;
    else if (s.macdSignalType === 'bearish_crossover') score -= 15;
    else if ((s.macdHistogram || 0) > 0) score += 5;
    else if ((s.macdHistogram || 0) < 0) score -= 5;
    
    if ((s.percentFromFiftyDayMA || 0) > 0) score += 10;
    else score -= 5;
    
    if ((s.percentFromTwoHundredDayMA || 0) > 0) score += 10;
    else score -= 5;
    
    return Math.max(0, Math.min(100, score));
  });

  technicalScore = computed(() => {
    const s = this.stock();
    if (!s) return 50;
    
    let score = 50;
    
    if (s.rsi !== null) {
      if (s.rsi < 30) score += 20;
      else if (s.rsi < 50) score += 10;
      else if (s.rsi > 70) score -= 15;
      else score += 5;
    }
    
    if (s.macdSignalType === 'bullish_crossover') score += 20;
    else if (s.macdSignalType === 'bearish_crossover') score -= 20;
    else if ((s.macdHistogram || 0) > 0) score += 10;
    else score -= 10;
    
    return Math.max(0, Math.min(100, score));
  });

  maScore = computed(() => {
    const s = this.stock();
    if (!s) return 50;
    
    let score = 50;
    
    if ((s.percentFromFiftyDayMA || 0) > 5) score += 20;
    else if ((s.percentFromFiftyDayMA || 0) > 0) score += 10;
    else if ((s.percentFromFiftyDayMA || 0) < -5) score -= 20;
    else score -= 10;
    
    if ((s.percentFromTwoHundredDayMA || 0) > 10) score += 20;
    else if ((s.percentFromTwoHundredDayMA || 0) > 0) score += 10;
    else if ((s.percentFromTwoHundredDayMA || 0) < -10) score -= 20;
    else score -= 10;
    
    return Math.max(0, Math.min(100, score));
  });

  ngOnInit(): void {
    this.route.params.subscribe(params => {
      const symbol = params['symbol'];
      if (symbol) {
        this.loadStock(symbol);
        this.loadNews(symbol);
      }
    });
  }

  async loadStock(symbol: string): Promise<void> {
    this.loading.set(true);
    this.error.set(null);

    try {
      const response = await this.http.get<{ stocks: Stock[] }>(
        `/api/stocks?action=search&q=${encodeURIComponent(symbol)}&technicals=true`
      ).toPromise();
      
      if (response?.stocks && response.stocks.length > 0) {
        this.stock.set(response.stocks[0]);
      } else {
        this.error.set(`Stock ${symbol} not found`);
      }
    } catch (err: any) {
      console.error('Failed to load stock:', err);
      this.error.set(err?.error?.error || 'Failed to load stock data');
    } finally {
      this.loading.set(false);
    }
  }

  async loadNews(symbol: string): Promise<void> {
    this.newsLoading.set(true);

    try {
      const response = await this.http.get<{ news: NewsItem[] }>(`/api/stocks/${encodeURIComponent(symbol)}/news`).toPromise();
      if (response?.news) {
        this.news.set(response.news);
      }
    } catch (err) {
      console.error('Failed to load news:', err);
    } finally {
      this.newsLoading.set(false);
    }
  }

  goBack(): void {
    this.router.navigate(['/v2/screener']);
  }

  getRangePosition(price: number, low: number, high: number): number {
    if (high === low) return 50;
    return Math.max(0, Math.min(100, ((price - low) / (high - low)) * 100));
  }

  getGaugeDashArray(score: number): string {
    const maxLength = 251;
    const filled = (score / 100) * maxLength;
    return `${filled} ${maxLength - filled}`;
  }

  getSignalLabel(score: number): string {
    if (score >= 80) return 'Strong Buy';
    if (score >= 60) return 'Buy';
    if (score >= 40) return 'Neutral';
    if (score >= 20) return 'Sell';
    return 'Strong Sell';
  }

  getSignalClass(score: number): string {
    if (score >= 80) return 'strong-buy';
    if (score >= 60) return 'buy';
    if (score >= 40) return 'neutral';
    if (score >= 20) return 'sell';
    return 'strong-sell';
  }

  getRsiClass(rsi: number | null): string {
    if (rsi === null) return '';
    if (rsi > 70) return 'overbought';
    if (rsi < 30) return 'oversold';
    return '';
  }

  getRsiSignalClass(rsi: number | null): string {
    if (rsi === null) return 'neutral';
    if (rsi < 30) return 'buy';
    if (rsi > 70) return 'sell';
    return 'neutral';
  }

  getRsiShortSignal(rsi: number | null): string {
    if (rsi === null) return '—';
    if (rsi < 30) return 'Buy';
    if (rsi > 70) return 'Sell';
    return 'Hold';
  }

  getMacdSignalClass(signalType: string | undefined): string {
    if (!signalType) return 'neutral';
    if (signalType.includes('bullish')) return 'buy';
    if (signalType.includes('bearish')) return 'sell';
    return 'neutral';
  }

  getMacdShortSignal(signalType: string | undefined): string {
    if (!signalType) return '—';
    if (signalType.includes('bullish')) return 'Buy';
    if (signalType.includes('bearish')) return 'Sell';
    return 'Hold';
  }

  getTypeBadgeLabel(type: string): string {
    const labels: Record<string, string> = {
      market: 'Market',
      price_target: 'Price Target',
      upgrade_downgrade: 'Rating',
      insider: 'Insider',
      earnings: 'Earnings',
      dividend: 'Dividend',
      general: 'Company'
    };
    return labels[type] || 'Company';
  }

  formatMacdSignalType(signalType: string | null | undefined): string {
    if (!signalType) return 'No signal';
    return signalType.replace(/_/g, ' ');
  }
}
