import { Component, OnInit, OnDestroy, inject, signal, computed, effect } from '@angular/core';
import { CommonModule, DecimalPipe } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';

import { ButtonModule } from 'primeng/button';
import { ProgressSpinnerModule } from 'primeng/progressspinner';
import { TooltipModule } from 'primeng/tooltip';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { AutoCompleteModule, AutoCompleteCompleteEvent } from 'primeng/autocomplete';

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
    DecimalPipe,
    DialogModule,
    InputTextModule,
    AutoCompleteModule
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

      <!-- Top Picks Panel - Always visible at top -->
      @if (!loading()) {
        <div class="top-picks-section" [class.collapsed]="topPicksCollapsed()">
          <div class="top-picks-header" (click)="toggleTopPicks()">
            <div class="top-picks-title">
              <i class="pi pi-star-fill" style="color: #fbbf24;"></i>
              <h2>Top Picks - Buy Today</h2>
              <span class="top-picks-count">{{ topPicks().length }}</span>
              <button 
                class="info-btn" 
                (click)="showScoringInfo($event)"
                pTooltip="View scoring criteria"
                tooltipPosition="top">
                <i class="pi pi-info-circle"></i>
              </button>
              <button 
                class="search-btn" 
                (click)="openScoreSearch($event, 'topPicks')"
                pTooltip="Search stock score"
                tooltipPosition="top">
                <i class="pi pi-search"></i>
              </button>
            </div>
            <div class="top-picks-desc">
              Stocks with strongest bullish signals across multiple technical indicators
            </div>
          </div>
          
          @if (!topPicksCollapsed()) {
          <div class="top-picks-content">
            @if (topPicks().length === 0) {
              <div class="empty-top-picks">
                <i class="pi pi-search"></i>
                <span>No stocks currently meet all criteria. Check back later.</span>
              </div>
            } @else {
              <div class="top-picks-grid">
                @for (pick of topPicks(); track pick.stock.symbol; let i = $index) {
                  <div class="top-pick-card" (click)="goToStock(pick.stock.symbol)">
                    <div class="pick-rank">#{{ i + 1 }}</div>
                    <div class="pick-header">
                      <div class="pick-info">
                        <span class="pick-symbol">{{ pick.stock.symbol }}</span>
                        <span class="pick-name">{{ pick.stock.name }}</span>
                      </div>
                      <div class="pick-score">
                        <span class="score-value">{{ pick.score }}</span>
                        <span class="score-label">Score</span>
                      </div>
                    </div>
                    
                    <div class="pick-price-row">
                      <span class="pick-price">{{ marketService.formatCurrency(pick.stock.price, pick.stock.market || 'US') }}</span>
                      <span class="pick-change" [class.positive]="pick.stock.changePercent >= 0" [class.negative]="pick.stock.changePercent < 0">
                        {{ pick.stock.changePercent >= 0 ? '+' : '' }}{{ pick.stock.changePercent | number:'1.2-2' }}%
                      </span>
                    </div>
                    
                    <div class="pick-signals">
                      @for (signal of pick.signals; track signal) {
                        <span class="signal-tag">{{ signal }}</span>
                      }
                    </div>
                    
                    <div class="pick-metrics">
                      <div class="pick-metric">
                        <span class="pm-label">RSI</span>
                        <span class="pm-value" 
                              [class.positive]="pick.stock.rsi != null && pick.stock.rsi >= 50"
                              [class.negative]="pick.stock.rsi != null && pick.stock.rsi < 50">
                          {{ pick.stock.rsi != null ? (pick.stock.rsi | number:'1.0-0') : '-' }}
                        </span>
                      </div>
                      <div class="pick-metric">
                        <span class="pm-label">50 MA</span>
                        <span class="pm-value"
                              [class.positive]="pick.stock.fiftyDayMA != null && pick.stock.price > pick.stock.fiftyDayMA"
                              [class.negative]="pick.stock.fiftyDayMA != null && pick.stock.price <= pick.stock.fiftyDayMA">
                          {{ pick.stock.fiftyDayMA != null ? (pick.stock.fiftyDayMA | number:'1.2-2') : '-' }}
                        </span>
                      </div>
                      <div class="pick-metric">
                        <span class="pm-label">200 MA</span>
                        <span class="pm-value"
                              [class.positive]="pick.stock.twoHundredDayMA != null && pick.stock.price > pick.stock.twoHundredDayMA"
                              [class.negative]="pick.stock.twoHundredDayMA != null && pick.stock.price <= pick.stock.twoHundredDayMA">
                          {{ pick.stock.twoHundredDayMA != null ? (pick.stock.twoHundredDayMA | number:'1.2-2') : '-' }}
                        </span>
                      </div>
                    </div>
                    
                    <div class="pick-metrics secondary">
                      <div class="pick-metric">
                        <span class="pm-label">52W High</span>
                        <span class="pm-value">{{ pick.stock.fiftyTwoWeekHigh != null ? (pick.stock.fiftyTwoWeekHigh | number:'1.2-2') : '-' }}</span>
                      </div>
                      <div class="pick-metric">
                        <span class="pm-label">52W Low</span>
                        <span class="pm-value">{{ pick.stock.fiftyTwoWeekLow != null ? (pick.stock.fiftyTwoWeekLow | number:'1.2-2') : '-' }}</span>
                      </div>
                      <div class="pick-metric">
                        <span class="pm-label">from High</span>
                        <span class="pm-value" 
                              [class.positive]="pick.stock.percentFromFiftyTwoWeekHigh != null && pick.stock.percentFromFiftyTwoWeekHigh >= -5"
                              [class.negative]="pick.stock.percentFromFiftyTwoWeekHigh != null && pick.stock.percentFromFiftyTwoWeekHigh < -20">
                          {{ pick.stock.percentFromFiftyTwoWeekHigh != null ? ((pick.stock.percentFromFiftyTwoWeekHigh | number:'1.1-1') + '%') : '-' }}
                        </span>
                      </div>
                      <div class="pick-metric">
                        <span class="pm-label">Analyst</span>
                        <span class="pm-value analyst-rating"
                              [class.strong-buy]="$any(pick.stock).analystRatingScore != null && $any(pick.stock).analystRatingScore <= 1.5"
                              [class.buy]="$any(pick.stock).analystRatingScore != null && $any(pick.stock).analystRatingScore > 1.5 && $any(pick.stock).analystRatingScore <= 2.2"
                              [class.hold]="$any(pick.stock).analystRatingScore != null && $any(pick.stock).analystRatingScore > 2.2 && $any(pick.stock).analystRatingScore < 3.5"
                              [class.sell]="$any(pick.stock).analystRatingScore != null && $any(pick.stock).analystRatingScore >= 3.5">
                          {{ getAnalystLabel($any(pick.stock).analystRatingScore) }}
                        </span>
                      </div>
                    </div>
                  </div>
                }
              </div>
            }
          </div>
          }
        </div>
      }

      <!-- Day Trade Picks Panel -->
      @if (!loading()) {
        <div class="day-trade-section" [class.collapsed]="dayTradeCollapsed()">
          <div class="day-trade-header" (click)="toggleDayTrade()">
            <div class="day-trade-title">
              <i class="pi pi-bolt" style="color: #f97316;"></i>
              <h2>Day Trade Picks</h2>
              <span class="day-trade-count">{{ dayTradePicks().length }}</span>
              <button 
                class="info-btn" 
                (click)="showDayTradeInfo($event)"
                pTooltip="View scoring criteria"
                tooltipPosition="top">
                <i class="pi pi-info-circle"></i>
              </button>
              <button 
                class="search-btn" 
                (click)="openScoreSearch($event, 'dayTrade')"
                pTooltip="Search stock score"
                tooltipPosition="top">
                <i class="pi pi-search"></i>
              </button>
            </div>
            <div class="day-trade-desc">
              High momentum stocks for intraday trading - big movers with volume
            </div>
          </div>
          
          @if (!dayTradeCollapsed()) {
          <div class="day-trade-content">
            @if (dayTradePicks().length === 0) {
              <div class="empty-day-trade">
                <i class="pi pi-search"></i>
                <span>No high-momentum stocks found. Market may be quiet today.</span>
              </div>
            } @else {
              <div class="day-trade-grid">
                @for (pick of dayTradePicks(); track pick.stock.symbol; let i = $index) {
                  <div class="day-trade-card" (click)="goToStock(pick.stock.symbol)">
                    <div class="dt-rank">#{{ i + 1 }}</div>
                    <div class="dt-header">
                      <div class="dt-info">
                        <span class="dt-symbol">{{ pick.stock.symbol }}</span>
                        <span class="dt-name">{{ pick.stock.name }}</span>
                      </div>
                      <div class="dt-score">
                        <span class="score-value">{{ pick.score }}</span>
                        <span class="score-label">Score</span>
                      </div>
                    </div>
                    
                    <div class="dt-price-row">
                      <span class="dt-price">{{ marketService.formatCurrency(pick.stock.price, pick.stock.market || 'US') }}</span>
                      <span class="dt-change positive">
                        +{{ pick.stock.changePercent | number:'1.2-2' }}%
                      </span>
                    </div>
                    
                    <div class="dt-signals">
                      @for (signal of pick.signals; track signal) {
                        <span class="dt-signal-tag">{{ signal }}</span>
                      }
                    </div>
                    
                    <div class="dt-metrics">
                      <div class="dt-metric">
                        <span class="dtm-label">Volume</span>
                        <span class="dtm-value" 
                              [class.positive]="pick.stock.relativeVolume != null && pick.stock.relativeVolume >= 1.5"
                              [class.neutral]="pick.stock.relativeVolume != null && pick.stock.relativeVolume >= 1 && pick.stock.relativeVolume < 1.5">
                          {{ pick.stock.relativeVolume != null ? (pick.stock.relativeVolume | number:'1.1-1') + 'x' : '-' }}
                        </span>
                      </div>
                      <div class="dt-metric">
                        <span class="dtm-label">RSI</span>
                        <span class="dtm-value" 
                              [class.positive]="pick.stock.rsi != null && pick.stock.rsi >= 50 && pick.stock.rsi <= 75"
                              [class.negative]="pick.stock.rsi != null && pick.stock.rsi > 80">
                          {{ pick.stock.rsi != null ? (pick.stock.rsi | number:'1.0-0') : '-' }}
                        </span>
                      </div>
                      <div class="dt-metric">
                        <span class="dtm-label">from 52W High</span>
                        <span class="dtm-value" 
                              [class.positive]="pick.stock.percentFromFiftyTwoWeekHigh != null && pick.stock.percentFromFiftyTwoWeekHigh >= -3">
                          {{ pick.stock.percentFromFiftyTwoWeekHigh != null ? ((pick.stock.percentFromFiftyTwoWeekHigh | number:'1.1-1') + '%') : '-' }}
                        </span>
                      </div>
                    </div>
                  </div>
                }
              </div>
            }
          </div>
          }
        </div>
      }

      <!-- Momentum Picks Panel -->
      @if (!loading()) {
        <div class="momentum-section" [class.collapsed]="momentumCollapsed()">
          <div class="momentum-header" (click)="toggleMomentum()">
            <div class="momentum-title">
              <i class="pi pi-arrow-up-right" style="color: #8b5cf6;"></i>
              <h2>Momentum Picks</h2>
              <span class="momentum-count">{{ momentumPicks().length }}</span>
              <button 
                class="info-btn" 
                (click)="showMomentumInfo($event)"
                pTooltip="View scoring criteria"
                tooltipPosition="top">
                <i class="pi pi-info-circle"></i>
              </button>
              <button 
                class="search-btn" 
                (click)="openScoreSearch($event, 'momentum')"
                pTooltip="Search stock score"
                tooltipPosition="top">
                <i class="pi pi-search"></i>
              </button>
            </div>
            <div class="momentum-desc">
              High-flying stocks with strong momentum - extended runners near 52W highs
            </div>
          </div>
          
          @if (!momentumCollapsed()) {
          <div class="momentum-content">
            @if (momentumPicks().length === 0) {
              <div class="empty-momentum">
                <i class="pi pi-search"></i>
                <span>No momentum stocks found meeting criteria.</span>
              </div>
            } @else {
              <div class="momentum-grid">
                @for (pick of momentumPicks(); track pick.stock.symbol; let i = $index) {
                  <div class="momentum-card" (click)="goToStock(pick.stock.symbol)">
                    <div class="mom-rank">#{{ i + 1 }}</div>
                    <div class="mom-header">
                      <div class="mom-info">
                        <span class="mom-symbol">{{ pick.stock.symbol }}</span>
                        <span class="mom-name">{{ pick.stock.name }}</span>
                      </div>
                      <div class="mom-score">
                        <span class="score-value">{{ pick.score }}</span>
                        <span class="score-label">Score</span>
                      </div>
                    </div>
                    
                    <div class="mom-price-row">
                      <span class="mom-price">{{ marketService.formatCurrency(pick.stock.price, pick.stock.market || 'US') }}</span>
                      <span class="mom-change" [class.positive]="pick.stock.changePercent >= 0" [class.negative]="pick.stock.changePercent < 0">
                        {{ pick.stock.changePercent >= 0 ? '+' : '' }}{{ pick.stock.changePercent | number:'1.2-2' }}%
                      </span>
                    </div>
                    
                    <div class="mom-signals">
                      @for (signal of pick.signals; track signal) {
                        <span class="mom-signal-tag">{{ signal }}</span>
                      }
                    </div>
                    
                    <div class="mom-metrics">
                      <div class="mom-metric">
                        <span class="mm-label">from 50 MA</span>
                        <span class="mm-value positive">
                          +{{ pick.stock.percentFromFiftyDayMA != null ? (pick.stock.percentFromFiftyDayMA | number:'1.1-1') : '0' }}%
                        </span>
                      </div>
                      <div class="mom-metric">
                        <span class="mm-label">from 200 MA</span>
                        <span class="mm-value positive">
                          +{{ pick.stock.percentFromTwoHundredDayMA != null ? (pick.stock.percentFromTwoHundredDayMA | number:'1.1-1') : '0' }}%
                        </span>
                      </div>
                      <div class="mom-metric">
                        <span class="mm-label">from 52W High</span>
                        <span class="mm-value" 
                              [class.positive]="pick.stock.percentFromFiftyTwoWeekHigh != null && pick.stock.percentFromFiftyTwoWeekHigh >= -5">
                          {{ pick.stock.percentFromFiftyTwoWeekHigh != null ? ((pick.stock.percentFromFiftyTwoWeekHigh | number:'1.1-1') + '%') : '-' }}
                        </span>
                      </div>
                      <div class="mom-metric">
                        <span class="mm-label">Analyst</span>
                        <span class="mm-value analyst-rating"
                              [class.strong-buy]="$any(pick.stock).analystRatingScore != null && $any(pick.stock).analystRatingScore <= 1.5"
                              [class.buy]="$any(pick.stock).analystRatingScore != null && $any(pick.stock).analystRatingScore > 1.5 && $any(pick.stock).analystRatingScore <= 2.2"
                              [class.hold]="$any(pick.stock).analystRatingScore != null && $any(pick.stock).analystRatingScore > 2.2 && $any(pick.stock).analystRatingScore < 3.5"
                              [class.sell]="$any(pick.stock).analystRatingScore != null && $any(pick.stock).analystRatingScore >= 3.5">
                          {{ getAnalystLabel($any(pick.stock).analystRatingScore) }}
                        </span>
                      </div>
                    </div>
                  </div>
                }
              </div>
            }
          </div>
          }
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
                          
                          <!-- Technical Indicators Row -->
                          <div class="metrics-row">
                            <div class="metric">
                              <span class="metric-label">RSI</span>
                              <span class="metric-value" 
                                    [class.positive]="stock.rsi != null && stock.rsi >= 50" 
                                    [class.negative]="stock.rsi != null && stock.rsi < 50">
                                {{ stock.rsi != null ? (stock.rsi | number:'1.0-0') : '-' }}
                              </span>
                            </div>
                            <div class="metric">
                              <span class="metric-label">50 MA</span>
                              <span class="metric-value"
                                    [class.positive]="stock.fiftyDayMA != null && stock.price > stock.fiftyDayMA"
                                    [class.negative]="stock.fiftyDayMA != null && stock.price <= stock.fiftyDayMA">
                                {{ stock.fiftyDayMA != null ? (stock.fiftyDayMA | number:'1.2-2') : '-' }}
                              </span>
                            </div>
                            <div class="metric">
                              <span class="metric-label">200 MA</span>
                              <span class="metric-value"
                                    [class.positive]="stock.twoHundredDayMA != null && stock.price > stock.twoHundredDayMA"
                                    [class.negative]="stock.twoHundredDayMA != null && stock.price <= stock.twoHundredDayMA">
                                {{ stock.twoHundredDayMA != null ? (stock.twoHundredDayMA | number:'1.2-2') : '-' }}
                              </span>
                            </div>
                          </div>
                          <!-- 52-Week Range Row -->
                          <div class="metrics-row secondary">
                            <div class="metric">
                              <span class="metric-label">52W High</span>
                              <span class="metric-value">
                                {{ stock.fiftyTwoWeekHigh != null ? (stock.fiftyTwoWeekHigh | number:'1.2-2') : '-' }}
                              </span>
                            </div>
                            <div class="metric">
                              <span class="metric-label">52W Low</span>
                              <span class="metric-value">
                                {{ stock.fiftyTwoWeekLow != null ? (stock.fiftyTwoWeekLow | number:'1.2-2') : '-' }}
                              </span>
                            </div>
                            <div class="metric">
                              <span class="metric-label">from High</span>
                              <span class="metric-value" [class.positive]="stock.percentFromFiftyTwoWeekHigh != null && stock.percentFromFiftyTwoWeekHigh >= -2" [class.negative]="stock.percentFromFiftyTwoWeekHigh != null && stock.percentFromFiftyTwoWeekHigh < -20">
                                {{ stock.percentFromFiftyTwoWeekHigh != null ? ((stock.percentFromFiftyTwoWeekHigh | number:'1.1-1') + '%') : '-' }}
                              </span>
                            </div>
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

      <!-- Scoring Criteria Dialog -->
      <p-dialog 
        header="Top Picks Scoring Criteria" 
        [(visible)]="showScoringDialog" 
        [modal]="true" 
        [style]="{ width: '600px' }"
        [draggable]="false"
        [resizable]="false">
        <div class="scoring-dialog-content">
          <p class="scoring-intro">
            <strong>Strategy:</strong> Medium-term investing (1-3 months) with moderate risk.<br>
            Focuses on stocks in confirmed uptrends with momentum and room to grow.
          </p>
          
          <h4><i class="pi pi-chart-line" style="color: #3b82f6;"></i> Trend Confirmation (Most Important)</h4>
          <ul class="scoring-list bullish">
            <li><span class="points">+3</span> Above 50 MA (0-8% range, short-term uptrend)</li>
            <li><span class="points">+3</span> Above 200 MA (0-20% range, long-term uptrend)</li>
            <li><span class="points">+5</span> Golden Cross (50 MA crossing above 200 MA)</li>
          </ul>
          
          <h4><i class="pi pi-arrow-up" style="color: #22c55e;"></i> Momentum Signals</h4>
          <ul class="scoring-list bullish">
            <li><span class="points">+4</span> MACD bullish crossover (trend confirmation)</li>
            <li><span class="points">+3</span> RSI 50-65 (strong momentum, room to grow)</li>
            <li><span class="points">+2</span> RSI 30-40 (oversold bounce potential)</li>
            <li><span class="points">+1</span> RSI 40-50 (building momentum)</li>
            <li><span class="points">+2</span> Near 52-week high (within 10%)</li>
            <li><span class="points">+2</span> Breakout move (>2% gain with volume)</li>
            <li><span class="points">+2</span> Volume surge with positive price</li>
            <li><span class="points">+1</span> Positive daily change</li>
          </ul>
          
          <h4><i class="pi pi-users" style="color: #8b5cf6;"></i> Analyst Ratings</h4>
          <ul class="scoring-list bullish">
            <li><span class="points">+3</span> Strong Buy consensus (rating ≤1.5)</li>
            <li><span class="points">+2</span> Buy consensus (rating 1.5-2.2)</li>
          </ul>
          <ul class="scoring-list bearish">
            <li><span class="points">-2</span> Underperform/Sell (rating ≥3.5)</li>
          </ul>
          <p style="font-size: 0.85rem; color: #666; margin: 0.5rem 0;">
            <em>Scale: 1.0 = Strong Buy, 2.0 = Buy, 3.0 = Hold, 4.0 = Underperform, 5.0 = Sell</em>
          </p>
          
          <h4><i class="pi pi-arrow-down" style="color: #ef4444;"></i> Penalties (Risk Factors)</h4>
          <ul class="scoring-list bearish">
            <li><span class="points">-4</span> Overbought RSI (>70, pullback risk)</li>
            <li><span class="points">-5</span> Death Cross (major bearish signal)</li>
            <li><span class="points">-3</span> Bearish MACD crossover</li>
            <li><span class="points">-2</span> Too extended from 50 MA (>15%)</li>
            <li><span class="points">-2</span> Below 200 MA (not in long-term uptrend)</li>
          </ul>
          
          <div class="scoring-note">
            <i class="pi pi-filter"></i>
            <span><strong>Requirements:</strong> Score 6+, at least 3 bullish signals, must be above 200 MA</span>
          </div>
          
          <h4><i class="pi pi-sort-amount-down" style="color: #3b82f6;"></i> Tie-Breakers</h4>
          <ol class="tiebreaker-list">
            <li>More bullish signals (stronger confirmation)</li>
            <li>RSI in ideal zone (50-65)</li>
            <li>Better analyst rating (lower = more bullish)</li>
            <li>Higher relative volume (institutional interest)</li>
          </ol>
        </div>
      </p-dialog>

      <!-- Day Trade Scoring Criteria Dialog -->
      <p-dialog 
        header="Day Trade Picks Scoring Criteria" 
        [(visible)]="showDayTradeDialog" 
        [modal]="true" 
        [style]="{ width: '600px' }"
        [draggable]="false"
        [resizable]="false">
        <div class="scoring-dialog-content">
          <p class="scoring-intro">
            <strong>Strategy:</strong> Intraday momentum trading.<br>
            Focuses on stocks with strong price action and volume TODAY for same-day trades.
          </p>
          
          <h4><i class="pi pi-bolt" style="color: #f97316;"></i> Price Action (Most Important)</h4>
          <ul class="scoring-list bullish">
            <li><span class="points">+7</span> Big mover (5%+ gain today)</li>
            <li><span class="points">+5</span> Strong move (3-5% gain today)</li>
            <li><span class="points">+3</span> Good move (1.5-3% gain today)</li>
            <li><span class="points">+1</span> Positive day (any gain)</li>
          </ul>
          
          <h4><i class="pi pi-chart-bar" style="color: #3b82f6;"></i> Volume (Critical for Liquidity)</h4>
          <ul class="scoring-list bullish">
            <li><span class="points">+6</span> Massive volume (2.5x+ average)</li>
            <li><span class="points">+4</span> High volume (1.8-2.5x average)</li>
            <li><span class="points">+2</span> Above average (1.3-1.8x)</li>
          </ul>
          
          <h4><i class="pi pi-arrow-up" style="color: #22c55e;"></i> Breakout Signals</h4>
          <ul class="scoring-list bullish">
            <li><span class="points">+5</span> New 52-week high (breakout)</li>
            <li><span class="points">+3</span> Near 52W high (within 3%)</li>
            <li><span class="points">+3</span> MACD bullish crossover</li>
            <li><span class="points">+3</span> RSI 60-75 (strong momentum)</li>
            <li><span class="points">+1</span> Above 50 MA / 200 MA</li>
          </ul>
          
          <h4><i class="pi pi-arrow-down" style="color: #ef4444;"></i> Penalties</h4>
          <ul class="scoring-list bearish">
            <li><span class="points">-3</span> Negative day (down today)</li>
            <li><span class="points">-2</span> Low volume (&lt;0.7x average)</li>
            <li><span class="points">-2</span> Bearish MACD</li>
            <li><span class="points">-2</span> Extreme RSI (&gt;80)</li>
          </ul>
          
          <div class="scoring-note">
            <i class="pi pi-filter"></i>
            <span><strong>Requirements:</strong> Score 8+, positive day, at least 2 momentum signals</span>
          </div>
          
          <h4><i class="pi pi-sort-amount-down" style="color: #3b82f6;"></i> Tie-Breakers</h4>
          <ol class="tiebreaker-list">
            <li>Today's % change (bigger move = stronger)</li>
            <li>Higher relative volume</li>
          </ol>
        </div>
      </p-dialog>

      <!-- Momentum Picks Scoring Criteria Dialog -->
      <p-dialog 
        header="Momentum Picks Scoring Criteria" 
        [(visible)]="showMomentumDialog" 
        [modal]="true" 
        [style]="{ width: '600px' }"
        [draggable]="false"
        [resizable]="false">
        <div class="scoring-dialog-content">
          <p class="scoring-intro">
            <strong>Strategy:</strong> Ride the momentum wave.<br>
            High-flying stocks that are extended from moving averages but showing strong trend continuation.
            Higher risk, higher reward - for traders who want to catch runners.
          </p>
          
          <h4><i class="pi pi-arrow-up-right" style="color: #8b5cf6;"></i> Momentum Strength (Primary)</h4>
          <ul class="scoring-list bullish">
            <li><span class="points">+5</span> Strong momentum (30%+ above 50 MA)</li>
            <li><span class="points">+3</span> Good momentum (15-30% above 50 MA)</li>
            <li><span class="points">+4</span> Major uptrend (50%+ above 200 MA)</li>
            <li><span class="points">+2</span> Uptrend (20-50% above 200 MA)</li>
          </ul>
          
          <h4><i class="pi pi-chart-line" style="color: #22c55e;"></i> Breakout Signals</h4>
          <ul class="scoring-list bullish">
            <li><span class="points">+4</span> Near 52-week high (within 5%)</li>
            <li><span class="points">+3</span> MACD bullish</li>
            <li><span class="points">+4</span> Big move today (5%+)</li>
            <li><span class="points">+2</span> Moving today (2-5%)</li>
            <li><span class="points">+2</span> High volume (1.5x+ average)</li>
            <li><span class="points">+2</span> RSI momentum zone (55-75)</li>
            <li><span class="points">+2</span> Analyst Buy rating</li>
          </ul>
          
          <h4><i class="pi pi-arrow-down" style="color: #ef4444;"></i> Penalties</h4>
          <ul class="scoring-list bearish">
            <li><span class="points">-3</span> Down today (momentum stalling)</li>
            <li><span class="points">-2</span> Overbought RSI (&gt;80)</li>
            <li><span class="points">-3</span> Below 50 MA (not in momentum mode)</li>
          </ul>
          
          <div class="scoring-note">
            <i class="pi pi-filter"></i>
            <span><strong>Requirements:</strong> Score 10+, above 50 MA, at least 3 momentum signals</span>
          </div>
          
          <h4><i class="pi pi-sort-amount-down" style="color: #3b82f6;"></i> Tie-Breakers</h4>
          <ol class="tiebreaker-list">
            <li>Closer to 52-week high (stronger breakout)</li>
            <li>Today's % change</li>
          </ol>
        </div>
      </p-dialog>

      <!-- Stock Score Search Dialog -->
      <p-dialog 
        [header]="'Search Stock Score - ' + getScoreSearchTitle()"
        [(visible)]="showScoreSearchDialog" 
        [modal]="true" 
        [style]="{ width: '650px' }"
        [draggable]="false"
        [resizable]="false">
        <div class="score-search-content">
          <div class="search-input-row">
            <p-autoComplete 
              [(ngModel)]="scoreSearchSelected"
              [suggestions]="scoreSearchSuggestions()"
              (completeMethod)="onScoreSearchComplete($event)"
              (onSelect)="onScoreSearchSelect($event)"
              [minLength]="1"
              [delay]="300"
              placeholder="Search any stock (e.g., AAPL, MU, WDC)"
              [showEmptyMessage]="true"
              emptyMessage="No stocks found"
              [forceSelection]="false"
              field="symbol"
              appendTo="body"
              [scrollHeight]="'400px'"
              styleClass="score-search-autocomplete"
              inputStyleClass="score-search-input">
              <ng-template let-stock pTemplate="item">
                <div class="score-search-item">
                  <span class="ssi-symbol">{{ stock.symbol }}</span>
                  <span class="ssi-name">{{ stock.name }}</span>
                  <span class="ssi-price" [class.positive]="stock.changePercent >= 0" [class.negative]="stock.changePercent < 0">
                    {{ marketService.formatCurrency(stock.price, stock.market) }}
                    ({{ stock.changePercent >= 0 ? '+' : '' }}{{ stock.changePercent | number:'1.2-2' }}%)
                  </span>
                </div>
              </ng-template>
            </p-autoComplete>
          </div>
          
          @if (scoreSearchResult) {
            <div class="score-result">
              <div class="score-result-header">
                <div class="score-stock-info">
                  <span class="score-symbol">{{ scoreSearchResult.symbol }}</span>
                  <span class="score-name">{{ scoreSearchResult.name }}</span>
                </div>
                <div class="score-total" [class]="getScoreClass(scoreSearchResult.score)">
                  <span class="score-number">{{ scoreSearchResult.score }}</span>
                  <span class="score-label">Total Score</span>
                </div>
              </div>
              
              <div class="score-status" [class]="scoreSearchResult.qualifies ? 'qualifies' : 'not-qualifies'">
                <i [class]="scoreSearchResult.qualifies ? 'pi pi-check-circle' : 'pi pi-times-circle'"></i>
                <span>{{ scoreSearchResult.qualifies ? 'Qualifies for ' + getScoreSearchTitle() : 'Does not qualify' }}</span>
                @if (!scoreSearchResult.qualifies && scoreSearchResult.reason) {
                  <span class="reason">- {{ scoreSearchResult.reason }}</span>
                }
              </div>
              @if (scoreSearchResult.qualifies && !scoreSearchResult.inBreakouts) {
                <div class="score-info-banner">
                  <i class="pi pi-info-circle"></i>
                  <span>Qualifies based on technicals, but not in today's breakout alerts. Stock will appear on panel once a new technical breakout is triggered.</span>
                </div>
              }
              @if (scoreSearchResult.qualifies && scoreSearchResult.inBreakouts) {
                <div class="score-info-banner in-pool">
                  <i class="pi pi-check"></i>
                  <span>Active in today's breakout alerts. Ranked by score on panel (top 15 shown).</span>
                </div>
              }
              
              <div class="score-breakdown">
                <h4>Score Breakdown</h4>
                <div class="breakdown-list">
                  @for (item of scoreSearchResult.breakdown; track item.label) {
                    <div class="breakdown-item" [class]="item.points >= 0 ? 'positive' : 'negative'">
                      <span class="breakdown-label">{{ item.label }}</span>
                      <span class="breakdown-value">{{ item.value }}</span>
                      <span class="breakdown-points">{{ item.points >= 0 ? '+' : '' }}{{ item.points }}</span>
                    </div>
                  }
                </div>
              </div>
              
              <div class="score-signals">
                <h4>Signals Detected</h4>
                <div class="signals-list">
                  @for (signal of scoreSearchResult.signals; track signal) {
                    <span class="signal-chip">{{ signal }}</span>
                  }
                  @if (scoreSearchResult.signals.length === 0) {
                    <span class="no-signals">No qualifying signals</span>
                  }
                </div>
              </div>
              
              <div class="score-metrics">
                <h4>Stock Metrics</h4>
                <div class="metrics-grid">
                  <div class="metric-item">
                    <span class="metric-label">Price</span>
                    <span class="metric-value">{{ marketService.formatCurrency(scoreSearchResult.metrics.price, $any(scoreSearchResult.metrics.market) || 'US') }}</span>
                  </div>
                  <div class="metric-item">
                    <span class="metric-label">Change</span>
                    <span class="metric-value" [class.positive]="scoreSearchResult.metrics.changePercent >= 0" [class.negative]="scoreSearchResult.metrics.changePercent < 0">
                      {{ scoreSearchResult.metrics.changePercent >= 0 ? '+' : '' }}{{ scoreSearchResult.metrics.changePercent | number:'1.2-2' }}%
                    </span>
                  </div>
                  <div class="metric-item">
                    <span class="metric-label">RSI</span>
                    <span class="metric-value">{{ scoreSearchResult.metrics.rsi ?? '-' }}</span>
                  </div>
                  <div class="metric-item">
                    <span class="metric-label">from 50 MA</span>
                    <span class="metric-value" [class.positive]="scoreSearchResult.metrics.pct50MA != null && scoreSearchResult.metrics.pct50MA > 0" [class.negative]="scoreSearchResult.metrics.pct50MA != null && scoreSearchResult.metrics.pct50MA < 0">
                      {{ scoreSearchResult.metrics.pct50MA != null ? ((scoreSearchResult.metrics.pct50MA >= 0 ? '+' : '') + (scoreSearchResult.metrics.pct50MA | number:'1.1-1') + '%') : '-' }}
                    </span>
                  </div>
                  <div class="metric-item">
                    <span class="metric-label">from 200 MA</span>
                    <span class="metric-value" [class.positive]="scoreSearchResult.metrics.pct200MA != null && scoreSearchResult.metrics.pct200MA > 0" [class.negative]="scoreSearchResult.metrics.pct200MA != null && scoreSearchResult.metrics.pct200MA < 0">
                      {{ scoreSearchResult.metrics.pct200MA != null ? ((scoreSearchResult.metrics.pct200MA >= 0 ? '+' : '') + (scoreSearchResult.metrics.pct200MA | number:'1.1-1') + '%') : '-' }}
                    </span>
                  </div>
                  <div class="metric-item">
                    <span class="metric-label">from 52W High</span>
                    <span class="metric-value">
                      {{ scoreSearchResult.metrics.pct52High != null ? ((scoreSearchResult.metrics.pct52High | number:'1.1-1') + '%') : '-' }}
                    </span>
                  </div>
                  <div class="metric-item">
                    <span class="metric-label">Rel. Volume</span>
                    <span class="metric-value">{{ scoreSearchResult.metrics.relVolume != null ? (scoreSearchResult.metrics.relVolume | number:'1.2-2') + 'x' : '-' }}</span>
                  </div>
                  <div class="metric-item">
                    <span class="metric-label">Analyst</span>
                    <span class="metric-value">{{ scoreSearchResult.metrics.analystRating || '-' }}</span>
                  </div>
                </div>
              </div>
            </div>
          }
          
          @if (scoreSearchError) {
            <div class="score-error">
              <i class="pi pi-exclamation-triangle"></i>
              <span>{{ scoreSearchError }}</span>
            </div>
          }
        </div>
      </p-dialog>
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

    /* Top Picks Section */
    .top-picks-section {
      background: linear-gradient(135deg, rgba(251, 191, 36, 0.08) 0%, rgba(34, 197, 94, 0.08) 100%);
      border: 2px solid rgba(251, 191, 36, 0.3);
      border-radius: 12px;
      margin-bottom: 1.5rem;
      overflow: hidden;
    }

    .top-picks-section.collapsed .top-picks-header {
      border-bottom: none;
    }

    .top-picks-header {
      padding: 1rem 1.5rem;
      background: rgba(251, 191, 36, 0.1);
      border-bottom: 1px solid rgba(251, 191, 36, 0.2);
      cursor: pointer;
      position: relative;
      transition: background 0.2s ease;
    }

    .top-picks-header:hover {
      background: rgba(251, 191, 36, 0.15);
    }

    .top-picks-header .collapse-icon {
      position: absolute;
      right: 1.5rem;
      top: 50%;
      transform: translateY(-50%);
      color: var(--text-color-secondary);
    }

    .top-picks-title {
      display: flex;
      align-items: center;
      gap: 0.75rem;
    }

    .top-picks-title h2 {
      margin: 0;
      font-size: 1.25rem;
      font-weight: 700;
      color: #fbbf24;
    }

    .top-picks-count {
      background: #fbbf24;
      color: #000;
      padding: 0.15rem 0.5rem;
      border-radius: 10px;
      font-size: 0.75rem;
      font-weight: 700;
    }

    .info-btn {
      background: transparent;
      border: none;
      color: var(--text-color-secondary);
      cursor: pointer;
      padding: 0.25rem;
      margin-left: 0.5rem;
      border-radius: 50%;
      transition: all 0.2s ease;
      display: inline-flex;
      align-items: center;
      justify-content: center;
    }

    .info-btn:hover {
      background: rgba(251, 191, 36, 0.2);
      color: #fbbf24;
    }

    .info-btn i {
      font-size: 1rem;
    }

    .top-picks-desc {
      font-size: 0.85rem;
      color: var(--text-color-secondary);
      margin-top: 0.25rem;
      margin-left: 2rem;
    }

    .top-picks-content {
      padding: 1rem 1.5rem;
    }

    .empty-top-picks {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 0.75rem;
      padding: 2rem;
      color: var(--text-color-secondary);
    }

    .top-picks-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
      gap: 1rem;
    }

    .top-pick-card {
      background: var(--surface-card);
      border: 1px solid var(--surface-border);
      border-radius: 10px;
      padding: 1rem;
      cursor: pointer;
      transition: all 0.2s ease;
      position: relative;
    }

    .top-pick-card:hover {
      border-color: #fbbf24;
      box-shadow: 0 4px 20px rgba(251, 191, 36, 0.2);
      transform: translateY(-2px);
    }

    .pick-rank {
      position: absolute;
      top: -8px;
      left: -8px;
      background: linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%);
      color: #000;
      width: 28px;
      height: 28px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 0.75rem;
      font-weight: 800;
      box-shadow: 0 2px 8px rgba(251, 191, 36, 0.4);
    }

    .pick-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 0.5rem;
      margin-left: 1rem;
    }

    .pick-info {
      display: flex;
      flex-direction: column;
      gap: 0.1rem;
    }

    .pick-symbol {
      font-size: 1rem;
      font-weight: 700;
      color: var(--text-color);
    }

    .pick-name {
      font-size: 0.75rem;
      color: var(--text-color-secondary);
      max-width: 150px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .pick-score {
      display: flex;
      flex-direction: column;
      align-items: center;
      background: rgba(34, 197, 94, 0.15);
      padding: 0.25rem 0.5rem;
      border-radius: 6px;
    }

    .score-value {
      font-size: 1.1rem;
      font-weight: 800;
      color: #22c55e;
    }

    .score-label {
      font-size: 0.6rem;
      color: var(--text-color-secondary);
      text-transform: uppercase;
    }

    .pick-price-row {
      display: flex;
      align-items: baseline;
      gap: 0.5rem;
      margin-bottom: 0.75rem;
      margin-left: 1rem;
    }

    .pick-price {
      font-size: 1.1rem;
      font-weight: 600;
      color: var(--text-color);
    }

    .pick-change {
      font-size: 0.85rem;
      font-weight: 500;
    }

    .pick-change.positive { color: #22c55e; }
    .pick-change.negative { color: #ef4444; }

    .pick-signals {
      display: flex;
      flex-wrap: wrap;
      gap: 0.35rem;
      margin-bottom: 0.75rem;
    }

    .signal-tag {
      background: rgba(34, 197, 94, 0.15);
      color: #22c55e;
      padding: 0.2rem 0.5rem;
      border-radius: 4px;
      font-size: 0.65rem;
      font-weight: 600;
      text-transform: uppercase;
    }

    .pick-metrics {
      display: flex;
      gap: 0.75rem;
      padding-top: 0.5rem;
      border-top: 1px solid var(--surface-border);
      flex-wrap: wrap;
    }

    .pick-metrics.secondary {
      border-top: none;
      padding-top: 0.35rem;
    }

    .pick-metric {
      display: flex;
      flex-direction: column;
      gap: 0.1rem;
    }

    .pm-label {
      font-size: 0.6rem;
      color: var(--text-color-secondary);
      text-transform: uppercase;
    }

    .pm-value {
      font-size: 0.8rem;
      font-weight: 600;
    }

    .pm-value.positive { color: #22c55e; }
    .pm-value.negative { color: #ef4444; }
    
    /* Analyst Rating Styles */
    .pm-value.analyst-rating {
      font-size: 0.7rem;
      padding: 2px 4px;
      border-radius: 4px;
    }
    .pm-value.analyst-rating.strong-buy { 
      color: #fff; 
      background: #16a34a; 
    }
    .pm-value.analyst-rating.buy { 
      color: #fff; 
      background: #22c55e; 
    }
    .pm-value.analyst-rating.hold { 
      color: #fff; 
      background: #f97316; 
    }
    .pm-value.analyst-rating.sell { 
      color: #fff; 
      background: #ef4444; 
    }

    /* Day Trade Section */
    .day-trade-section {
      background: linear-gradient(135deg, rgba(249, 115, 22, 0.08) 0%, rgba(239, 68, 68, 0.08) 100%);
      border: 2px solid rgba(249, 115, 22, 0.3);
      border-radius: 12px;
      margin-bottom: 1.5rem;
      overflow: hidden;
    }

    .day-trade-section.collapsed .day-trade-header {
      border-bottom: none;
    }

    .day-trade-header {
      padding: 1rem 1.5rem;
      cursor: pointer;
      display: flex;
      flex-direction: column;
      gap: 0.25rem;
      position: relative;
      border-bottom: 1px solid rgba(249, 115, 22, 0.2);
    }

    .day-trade-header:hover {
      background: rgba(249, 115, 22, 0.05);
    }

    .day-trade-title {
      display: flex;
      align-items: center;
      gap: 0.75rem;
    }

    .day-trade-title h2 {
      margin: 0;
      font-size: 1.25rem;
      font-weight: 600;
      color: var(--text-color);
    }

    .day-trade-count {
      background: linear-gradient(135deg, #f97316 0%, #ef4444 100%);
      color: white;
      padding: 0.2rem 0.6rem;
      border-radius: 12px;
      font-size: 0.85rem;
      font-weight: 600;
    }

    .day-trade-desc {
      font-size: 0.85rem;
      color: var(--text-color-secondary);
      padding-left: 2rem;
    }

    .day-trade-content {
      padding: 1rem 1.5rem;
    }

    .empty-day-trade {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 0.75rem;
      padding: 2rem;
      color: var(--text-color-secondary);
      font-size: 0.95rem;
    }

    .empty-day-trade i {
      font-size: 1.5rem;
      color: #f97316;
    }

    .day-trade-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
      gap: 1rem;
    }

    .day-trade-card {
      background: var(--surface-card);
      border: 1px solid var(--surface-border);
      border-radius: 10px;
      padding: 1rem;
      cursor: pointer;
      transition: all 0.2s ease;
      position: relative;
    }

    .day-trade-card:hover {
      transform: translateY(-2px);
      box-shadow: 0 4px 12px rgba(249, 115, 22, 0.15);
      border-color: rgba(249, 115, 22, 0.4);
    }

    .dt-rank {
      position: absolute;
      top: 0.5rem;
      right: 0.5rem;
      background: linear-gradient(135deg, #f97316 0%, #ef4444 100%);
      color: white;
      padding: 0.15rem 0.5rem;
      border-radius: 8px;
      font-size: 0.75rem;
      font-weight: 700;
    }

    .dt-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 0.5rem;
      padding-right: 2.5rem;
    }

    .dt-info {
      display: flex;
      flex-direction: column;
      gap: 0.15rem;
    }

    .dt-symbol {
      font-size: 1.1rem;
      font-weight: 700;
      color: var(--text-color);
    }

    .dt-name {
      font-size: 0.75rem;
      color: var(--text-color-secondary);
      max-width: 150px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .dt-score {
      display: flex;
      flex-direction: column;
      align-items: center;
      background: linear-gradient(135deg, rgba(249, 115, 22, 0.15) 0%, rgba(239, 68, 68, 0.15) 100%);
      padding: 0.35rem 0.6rem;
      border-radius: 8px;
    }

    .dt-score .score-value {
      font-size: 1.1rem;
      font-weight: 700;
      color: #f97316;
    }

    .dt-score .score-label {
      font-size: 0.6rem;
      color: var(--text-color-secondary);
      text-transform: uppercase;
    }

    .dt-price-row {
      display: flex;
      align-items: baseline;
      gap: 0.75rem;
      margin-bottom: 0.5rem;
    }

    .dt-price {
      font-size: 1.15rem;
      font-weight: 600;
      color: var(--text-color);
    }

    .dt-change {
      font-size: 0.95rem;
      font-weight: 600;
    }

    .dt-change.positive {
      color: #22c55e;
    }

    .dt-signals {
      display: flex;
      flex-wrap: wrap;
      gap: 0.35rem;
      margin-bottom: 0.75rem;
    }

    .dt-signal-tag {
      background: linear-gradient(135deg, rgba(249, 115, 22, 0.15) 0%, rgba(239, 68, 68, 0.1) 100%);
      color: #f97316;
      padding: 0.2rem 0.5rem;
      border-radius: 4px;
      font-size: 0.7rem;
      font-weight: 600;
    }

    .dt-metrics {
      display: flex;
      gap: 0.75rem;
      padding-top: 0.5rem;
      border-top: 1px solid var(--surface-border);
      flex-wrap: wrap;
    }

    .dt-metric {
      display: flex;
      flex-direction: column;
      gap: 0.1rem;
    }

    .dtm-label {
      font-size: 0.65rem;
      color: var(--text-color-secondary);
      text-transform: uppercase;
    }

    .dtm-value {
      font-size: 0.8rem;
      font-weight: 600;
    }

    .dtm-value.positive { color: #22c55e; }
    .dtm-value.negative { color: #ef4444; }
    .dtm-value.neutral { color: #f59e0b; }

    /* Momentum Section */
    .momentum-section {
      background: linear-gradient(135deg, rgba(139, 92, 246, 0.08) 0%, rgba(168, 85, 247, 0.08) 100%);
      border: 2px solid rgba(139, 92, 246, 0.3);
      border-radius: 12px;
      margin-bottom: 1.5rem;
      overflow: hidden;
    }

    .momentum-section.collapsed .momentum-header {
      border-bottom: none;
    }

    .momentum-header {
      padding: 1rem 1.5rem;
      cursor: pointer;
      display: flex;
      flex-direction: column;
      gap: 0.25rem;
      position: relative;
      border-bottom: 1px solid rgba(139, 92, 246, 0.2);
    }

    .momentum-header:hover {
      background: rgba(139, 92, 246, 0.05);
    }

    .momentum-title {
      display: flex;
      align-items: center;
      gap: 0.75rem;
    }

    .momentum-title h2 {
      margin: 0;
      font-size: 1.25rem;
      font-weight: 600;
      color: var(--text-color);
    }

    .momentum-count {
      background: linear-gradient(135deg, #8b5cf6 0%, #a855f7 100%);
      color: white;
      padding: 0.2rem 0.6rem;
      border-radius: 12px;
      font-size: 0.85rem;
      font-weight: 600;
    }

    .momentum-desc {
      font-size: 0.85rem;
      color: var(--text-color-secondary);
      padding-left: 2rem;
    }

    .momentum-content {
      padding: 1rem 1.5rem;
    }

    .empty-momentum {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 0.75rem;
      padding: 2rem;
      color: var(--text-color-secondary);
      font-size: 0.95rem;
    }

    .empty-momentum i {
      font-size: 1.5rem;
      color: #8b5cf6;
    }

    .momentum-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
      gap: 1rem;
    }

    .momentum-card {
      background: var(--surface-card);
      border: 1px solid var(--surface-border);
      border-radius: 10px;
      padding: 1rem;
      cursor: pointer;
      transition: all 0.2s ease;
      position: relative;
    }

    .momentum-card:hover {
      transform: translateY(-2px);
      box-shadow: 0 4px 12px rgba(139, 92, 246, 0.15);
      border-color: rgba(139, 92, 246, 0.4);
    }

    .mom-rank {
      position: absolute;
      top: 0.5rem;
      right: 0.5rem;
      background: linear-gradient(135deg, #8b5cf6 0%, #a855f7 100%);
      color: white;
      padding: 0.15rem 0.5rem;
      border-radius: 8px;
      font-size: 0.75rem;
      font-weight: 700;
    }

    .mom-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 0.5rem;
      padding-right: 2.5rem;
    }

    .mom-info {
      display: flex;
      flex-direction: column;
      gap: 0.15rem;
    }

    .mom-symbol {
      font-size: 1.1rem;
      font-weight: 700;
      color: var(--text-color);
    }

    .mom-name {
      font-size: 0.75rem;
      color: var(--text-color-secondary);
      max-width: 150px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .mom-score {
      display: flex;
      flex-direction: column;
      align-items: center;
      background: linear-gradient(135deg, rgba(139, 92, 246, 0.15) 0%, rgba(168, 85, 247, 0.15) 100%);
      padding: 0.35rem 0.6rem;
      border-radius: 8px;
    }

    .mom-score .score-value {
      font-size: 1.1rem;
      font-weight: 700;
      color: #8b5cf6;
    }

    .mom-score .score-label {
      font-size: 0.6rem;
      color: var(--text-color-secondary);
      text-transform: uppercase;
    }

    .mom-price-row {
      display: flex;
      align-items: baseline;
      gap: 0.75rem;
      margin-bottom: 0.5rem;
    }

    .mom-price {
      font-size: 1.15rem;
      font-weight: 600;
      color: var(--text-color);
    }

    .mom-change {
      font-size: 0.95rem;
      font-weight: 600;
    }

    .mom-change.positive { color: #22c55e; }
    .mom-change.negative { color: #ef4444; }

    .mom-signals {
      display: flex;
      flex-wrap: wrap;
      gap: 0.35rem;
      margin-bottom: 0.75rem;
    }

    .mom-signal-tag {
      background: linear-gradient(135deg, rgba(139, 92, 246, 0.15) 0%, rgba(168, 85, 247, 0.1) 100%);
      color: #8b5cf6;
      padding: 0.2rem 0.5rem;
      border-radius: 4px;
      font-size: 0.7rem;
      font-weight: 600;
    }

    .mom-metrics {
      display: flex;
      gap: 0.75rem;
      padding-top: 0.5rem;
      border-top: 1px solid var(--surface-border);
      flex-wrap: wrap;
    }

    .mom-metric {
      display: flex;
      flex-direction: column;
      gap: 0.1rem;
    }

    .mm-label {
      font-size: 0.65rem;
      color: var(--text-color-secondary);
      text-transform: uppercase;
    }

    .mm-value {
      font-size: 0.8rem;
      font-weight: 600;
    }

    .mm-value.positive { color: #22c55e; }
    .mm-value.negative { color: #ef4444; }
    
    /* Analyst Rating in Momentum Cards */
    .mm-value.analyst-rating {
      font-size: 0.7rem;
      padding: 2px 4px;
      border-radius: 4px;
    }
    .mm-value.analyst-rating.strong-buy { color: #fff; background: #16a34a; }
    .mm-value.analyst-rating.buy { color: #fff; background: #22c55e; }
    .mm-value.analyst-rating.hold { color: #fff; background: #f97316; }
    .mm-value.analyst-rating.sell { color: #fff; background: #ef4444; }

    /* Scoring Dialog */
    .scoring-dialog-content {
      padding: 0.5rem 0;
    }

    .scoring-intro {
      color: var(--text-color-secondary);
      margin-bottom: 1.5rem;
      line-height: 1.5;
    }

    .scoring-dialog-content h4 {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      margin: 1.25rem 0 0.75rem 0;
      font-size: 1rem;
      font-weight: 600;
    }

    .scoring-list {
      margin: 0;
      padding-left: 1.25rem;
      list-style: none;
    }

    .scoring-list li {
      padding: 0.35rem 0;
      display: flex;
      align-items: center;
      gap: 0.75rem;
      font-size: 0.9rem;
      color: var(--text-color-secondary);
    }

    .scoring-list .points {
      font-weight: 700;
      min-width: 30px;
      text-align: right;
    }

    .scoring-list.bullish .points {
      color: #22c55e;
    }

    .scoring-list.bearish .points {
      color: #ef4444;
    }

    .scoring-note {
      display: flex;
      align-items: flex-start;
      gap: 0.75rem;
      margin-top: 1.5rem;
      padding: 1rem;
      background: rgba(59, 130, 246, 0.1);
      border-radius: 8px;
      border-left: 3px solid #3b82f6;
    }

    .scoring-note i {
      color: #3b82f6;
      margin-top: 0.1rem;
    }

    .scoring-note span {
      font-size: 0.9rem;
      color: var(--text-color-secondary);
      line-height: 1.5;
    }

    .tiebreaker-list {
      margin: 0.5rem 0 0 0;
      padding-left: 1.5rem;
    }

    .tiebreaker-list li {
      padding: 0.3rem 0;
      font-size: 0.9rem;
      color: var(--text-color-secondary);
    }

    /* Search Button */
    .search-btn {
      background: transparent;
      border: none;
      color: var(--text-color-secondary);
      cursor: pointer;
      padding: 0.25rem;
      border-radius: 4px;
      transition: all 0.2s ease;
      margin-left: 0.25rem;
    }

    .search-btn:hover {
      color: var(--primary-color);
      background: var(--surface-hover);
    }

    /* Score Search Dialog */
    .score-search-content {
      padding: 0.5rem 0;
    }

    .search-input-row {
      display: flex;
      gap: 0.75rem;
      margin-bottom: 1.5rem;
    }

    :host ::ng-deep .score-search-autocomplete {
      width: 100%;
    }

    :host ::ng-deep .score-search-autocomplete .p-autocomplete-input {
      width: 100%;
      padding: 0.75rem 1rem;
      font-size: 1rem;
    }

    :host ::ng-deep .p-autocomplete-panel {
      z-index: 10000 !important;
      max-width: 600px;
    }

    :host ::ng-deep .p-autocomplete-items {
      padding: 0.5rem 0;
    }

    :host ::ng-deep .p-autocomplete-item {
      padding: 0.5rem 1rem;
    }

    :host ::ng-deep .p-autocomplete-item:hover {
      background: var(--surface-hover);
    }

    .score-search-item {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      padding: 0.5rem 0;
      cursor: pointer;
    }

    .ssi-symbol {
      font-weight: 600;
      color: var(--primary-color);
      min-width: 60px;
    }

    .ssi-name {
      flex: 1;
      color: var(--text-color-secondary);
      font-size: 0.9rem;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .ssi-price {
      font-size: 0.85rem;
      font-weight: 500;
    }

    .ssi-price.positive {
      color: #22c55e;
    }

    .ssi-price.negative {
      color: #ef4444;
    }

    .score-search-input {
      flex: 1;
      padding: 0.75rem 1rem;
      font-size: 1rem;
    }

    .score-result {
      background: var(--surface-ground);
      border-radius: 10px;
      padding: 1.25rem;
    }

    .score-result-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 1rem;
      padding-bottom: 1rem;
      border-bottom: 1px solid var(--surface-border);
    }

    .score-stock-info {
      display: flex;
      flex-direction: column;
      gap: 0.25rem;
    }

    .score-symbol {
      font-size: 1.5rem;
      font-weight: 700;
      color: var(--text-color);
    }

    .score-name {
      font-size: 0.9rem;
      color: var(--text-color-secondary);
    }

    .score-total {
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 0.75rem 1.25rem;
      border-radius: 10px;
      min-width: 80px;
    }

    .score-total.excellent { background: linear-gradient(135deg, #16a34a 0%, #22c55e 100%); }
    .score-total.good { background: linear-gradient(135deg, #22c55e 0%, #84cc16 100%); }
    .score-total.fair { background: linear-gradient(135deg, #f59e0b 0%, #fbbf24 100%); }
    .score-total.poor { background: linear-gradient(135deg, #ef4444 0%, #f97316 100%); }

    .score-number {
      font-size: 1.75rem;
      font-weight: 700;
      color: white;
    }

    .score-total .score-label {
      font-size: 0.7rem;
      color: rgba(255, 255, 255, 0.85);
      text-transform: uppercase;
    }

    .score-status {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.75rem 1rem;
      border-radius: 8px;
      margin-bottom: 1.25rem;
      font-weight: 500;
    }

    .score-status.qualifies {
      background: rgba(34, 197, 94, 0.15);
      color: #22c55e;
    }

    .score-status.not-qualifies {
      background: rgba(239, 68, 68, 0.15);
      color: #ef4444;
    }

    .score-status .reason {
      font-weight: 400;
      opacity: 0.85;
    }

    .score-info-banner {
      display: flex;
      align-items: flex-start;
      gap: 0.5rem;
      padding: 0.625rem 1rem;
      border-radius: 6px;
      margin-bottom: 1.25rem;
      font-size: 0.82rem;
      line-height: 1.4;
      background: rgba(234, 179, 8, 0.12);
      color: #eab308;
      border: 1px solid rgba(234, 179, 8, 0.25);
    }

    .score-info-banner i {
      margin-top: 2px;
      flex-shrink: 0;
    }

    .score-info-banner.in-pool {
      background: rgba(34, 197, 94, 0.08);
      color: #4ade80;
      border-color: rgba(34, 197, 94, 0.2);
    }

    .score-breakdown h4,
    .score-signals h4,
    .score-metrics h4 {
      margin: 0 0 0.75rem 0;
      font-size: 0.95rem;
      font-weight: 600;
      color: var(--text-color);
    }

    .breakdown-list {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
      margin-bottom: 1.25rem;
    }

    .breakdown-item {
      display: flex;
      align-items: center;
      padding: 0.5rem 0.75rem;
      background: var(--surface-card);
      border-radius: 6px;
      font-size: 0.9rem;
    }

    .breakdown-label {
      flex: 1;
      color: var(--text-color);
    }

    .breakdown-value {
      color: var(--text-color-secondary);
      margin-right: 1rem;
      font-size: 0.85rem;
    }

    .breakdown-points {
      font-weight: 700;
      min-width: 40px;
      text-align: right;
    }

    .breakdown-item.positive .breakdown-points { color: #22c55e; }
    .breakdown-item.negative .breakdown-points { color: #ef4444; }

    .signals-list {
      display: flex;
      flex-wrap: wrap;
      gap: 0.5rem;
      margin-bottom: 1.25rem;
    }

    .signal-chip {
      background: var(--primary-color);
      color: white;
      padding: 0.35rem 0.75rem;
      border-radius: 15px;
      font-size: 0.8rem;
      font-weight: 500;
    }

    .no-signals {
      color: var(--text-color-secondary);
      font-style: italic;
    }

    .metrics-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 0.75rem;
    }

    .metric-item {
      display: flex;
      flex-direction: column;
      gap: 0.2rem;
      padding: 0.5rem;
      background: var(--surface-card);
      border-radius: 6px;
    }

    .metric-label {
      font-size: 0.7rem;
      color: var(--text-color-secondary);
      text-transform: uppercase;
    }

    .metric-value {
      font-size: 0.9rem;
      font-weight: 600;
      color: var(--text-color);
    }

    .metric-value.positive { color: #22c55e; }
    .metric-value.negative { color: #ef4444; }

    .score-error {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      padding: 1rem;
      background: rgba(239, 68, 68, 0.1);
      border: 1px solid rgba(239, 68, 68, 0.3);
      border-radius: 8px;
      color: #ef4444;
    }

    .score-error i {
      font-size: 1.25rem;
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
      id: '52w_highs', 
      label: '52-Week Highs', 
      icon: 'pi pi-arrow-up-right',
      description: 'Stocks at or near their 52-week high',
      color: '#22c55e',
      bgColor: 'rgba(34, 197, 94, 0.12)'
    },
    { 
      id: '52w_lows', 
      label: '52-Week Lows', 
      icon: 'pi pi-arrow-down-right',
      description: 'Stocks at or near their 52-week low',
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
  collapsedCategories = signal<string[]>(['ma_crossover', '52w_highs', '52w_lows', 'rsi_signals', 'macd_signals', 'volume_breakout']);
  topPicksCollapsed = signal(true);
  showScoringDialog = false;
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

  // Top Picks - Best stocks to buy for medium-term (1-3 months) with moderate risk
  // Optimized for: Strong uptrend, momentum with room to grow, trend confirmation
  topPicks = computed(() => {
    const breakouts = this.allBreakouts();
    
    // Group breakouts by symbol - collect all alert types per stock
    const stockAlerts = new Map<string, { stock: BreakoutStock; alertTypes: Set<string>; alertCategories: Set<string> }>();
    const skipSymbols = new Set(['BRK-A']);
    
    for (const b of breakouts) {
      if (skipSymbols.has(b.symbol)) continue;
      if (!stockAlerts.has(b.symbol)) {
        stockAlerts.set(b.symbol, { stock: b, alertTypes: new Set(), alertCategories: new Set() });
      }
      const entry = stockAlerts.get(b.symbol)!;
      if (b.alertType) entry.alertTypes.add(b.alertType);
      if (b.alertCategory) entry.alertCategories.add(b.alertCategory);
    }
    
    // Score each stock ONCE using its technical data + collected alert types
    const stockScores = Array.from(stockAlerts.values()).map(({ stock: b, alertTypes, alertCategories }) => {
      let score = 0;
      const signals: string[] = [];
      
      // === TREND CONFIRMATION (Most Important for Medium-Term) ===
      if (b.percentFromFiftyDayMA != null && b.percentFromFiftyDayMA > 0 && b.percentFromFiftyDayMA <= 8) {
        score += 3; signals.push('Above 50 MA');
      }
      if (b.percentFromTwoHundredDayMA != null && b.percentFromTwoHundredDayMA > 0 && b.percentFromTwoHundredDayMA <= 20) {
        score += 3; signals.push('Above 200 MA');
      }
      if (alertTypes.has('golden_cross')) {
        score += 5; signals.push('Golden Cross');
      }
      
      // === MOMENTUM INDICATORS ===
      if (b.rsi != null && b.rsi >= 50 && b.rsi <= 65) {
        score += 3; signals.push('Strong Momentum');
      } else if (b.rsi != null && b.rsi >= 40 && b.rsi < 50) {
        score += 1; signals.push('Building Momentum');
      } else if (b.rsi != null && b.rsi >= 30 && b.rsi < 40) {
        score += 2; signals.push('Oversold Bounce');
      }
      
      if (alertTypes.has('macd_bullish_cross') || alertTypes.has('macd_strong_bullish')) {
        score += 4; signals.push('MACD Bullish');
      }
      
      // === PRICE ACTION ===
      if (b.percentFromFiftyTwoWeekHigh != null && b.percentFromFiftyTwoWeekHigh >= -10) {
        score += 2; signals.push('Near 52W High');
      }
      if (b.changePercent > 2 && b.relativeVolume != null && b.relativeVolume > 1.2) {
        score += 2; signals.push('Breakout Move');
      } else if (b.changePercent > 0) {
        score += 1; signals.push('Positive Day');
      }
      if (alertCategories.has('volume_breakout') && b.changePercent > 0) {
        score += 2; signals.push('Volume Surge');
      }
      
      // === ANALYST RATINGS ===
      const analystScore = (b as any).analystRatingScore;
      if (analystScore != null) {
        if (analystScore <= 1.5) { score += 3; signals.push('Strong Buy Rating'); }
        else if (analystScore <= 2.2) { score += 2; signals.push('Buy Rating'); }
        else if (analystScore >= 3.5) { score -= 2; signals.push('Weak Rating'); }
      }
      
      // === PENALTIES ===
      if (b.rsi != null && b.rsi > 70) { score -= 4; signals.push('Overbought'); }
      if (alertTypes.has('death_cross')) { score -= 5; signals.push('Death Cross'); }
      if (alertTypes.has('macd_bearish_cross') || alertTypes.has('macd_strong_bearish')) { score -= 3; signals.push('Bearish MACD'); }
      if (b.percentFromFiftyDayMA != null && b.percentFromFiftyDayMA > 15) { score -= 2; signals.push('Too Extended'); }
      if (b.percentFromTwoHundredDayMA != null && b.percentFromTwoHundredDayMA < 0) { score -= 2; signals.push('Below 200 MA'); }
      
      return { stock: b, score, signals };
    });
    
    // Filter and sort
    // Require: score >= 6, at least 3 bullish signals, must be above 200 MA
    const ranked = stockScores
      .filter(s => {
        const validSignals = s.signals.filter(sig => !['Overbought', 'Death Cross', 'Bearish MACD', 'Too Extended', 'Below 200 MA', 'Weak Rating'].includes(sig));
        const above200MA = s.stock.percentFromTwoHundredDayMA != null && s.stock.percentFromTwoHundredDayMA > 0;
        return s.score >= 6 && validSignals.length >= 3 && above200MA;
      })
      .sort((a, b) => {
        // Primary: Score
        if (b.score !== a.score) return b.score - a.score;
        
        // Tie-breaker 1: More bullish signals
        const aSignals = a.signals.filter(s => s !== 'Overbought').length;
        const bSignals = b.signals.filter(s => s !== 'Overbought').length;
        if (bSignals !== aSignals) return bSignals - aSignals;
        
        // Tie-breaker 2: RSI in ideal zone (50-65)
        const aRsi = a.stock.rsi ?? 50;
        const bRsi = b.stock.rsi ?? 50;
        const aIdeal = (aRsi >= 50 && aRsi <= 65) ? 1 : 0;
        const bIdeal = (bRsi >= 50 && bRsi <= 65) ? 1 : 0;
        if (bIdeal !== aIdeal) return bIdeal - aIdeal;
        
        // Tie-breaker 3: Better analyst rating (lower score = more bullish)
        const aAnalyst = (a.stock as any).analystRatingScore ?? 3;
        const bAnalyst = (b.stock as any).analystRatingScore ?? 3;
        if (aAnalyst !== bAnalyst) return aAnalyst - bAnalyst;
        
        // Tie-breaker 4: Higher relative volume (more interest)
        const aVol = a.stock.relativeVolume ?? 1;
        const bVol = b.stock.relativeVolume ?? 1;
        return bVol - aVol;
      })
      .slice(0, 15);
    
    return ranked;
  });

  // Day Trade Picks - Best stocks for intraday trading (momentum-based)
  // Optimized for: High momentum, volume surge, breakouts, strong price action TODAY
  dayTradePicks = computed(() => {
    const breakouts = this.allBreakouts();
    
    // Group by symbol - collect alert types
    const stockAlerts = new Map<string, { stock: BreakoutStock; alertTypes: Set<string> }>();
    const skipSymbols = new Set(['BRK-A']);
    
    for (const b of breakouts) {
      if (skipSymbols.has(b.symbol)) continue;
      if (!stockAlerts.has(b.symbol)) {
        stockAlerts.set(b.symbol, { stock: b, alertTypes: new Set() });
      }
      if (b.alertType) stockAlerts.get(b.symbol)!.alertTypes.add(b.alertType);
    }
    
    // Score each stock ONCE
    const stockScores = Array.from(stockAlerts.values()).map(({ stock: b, alertTypes }) => {
      let score = 0;
      const signals: string[] = [];
      
      // === TODAY'S PRICE ACTION ===
      if (b.changePercent >= 5) { score += 7; signals.push('Big Mover'); }
      else if (b.changePercent >= 3) { score += 5; signals.push('Strong Move'); }
      else if (b.changePercent >= 1.5) { score += 3; signals.push('Good Move'); }
      else if (b.changePercent > 0) { score += 1; signals.push('Positive Day'); }
      
      // === VOLUME ===
      if (b.relativeVolume != null) {
        if (b.relativeVolume >= 2.5) { score += 6; signals.push('Massive Volume'); }
        else if (b.relativeVolume >= 1.8) { score += 4; signals.push('High Volume'); }
        else if (b.relativeVolume >= 1.3) { score += 2; signals.push('Above Avg Volume'); }
      }
      
      // === BREAKOUT SIGNALS ===
      if (b.percentFromFiftyTwoWeekHigh != null) {
        if (b.percentFromFiftyTwoWeekHigh >= 0) { score += 5; signals.push('New 52W High'); }
        else if (b.percentFromFiftyTwoWeekHigh >= -3) { score += 3; signals.push('Near 52W High'); }
      }
      
      if (alertTypes.has('macd_bullish_cross') || alertTypes.has('macd_strong_bullish')) {
        score += 3; signals.push('MACD Bullish');
      }
      
      // === RSI ===
      if (b.rsi != null) {
        if (b.rsi >= 60 && b.rsi <= 75) { score += 3; signals.push('Strong RSI'); }
        else if (b.rsi >= 50 && b.rsi < 60) { score += 1; }
        if (b.rsi > 80) { score -= 2; signals.push('Extreme RSI'); }
      }
      
      // === TREND SUPPORT ===
      if (b.percentFromFiftyDayMA != null && b.percentFromFiftyDayMA > 0) { score += 1; signals.push('Above 50 MA'); }
      if (b.percentFromTwoHundredDayMA != null && b.percentFromTwoHundredDayMA > 0) { score += 1; signals.push('Above 200 MA'); }
      
      // === PENALTIES ===
      if (b.changePercent < 0) { score -= 3; signals.push('Negative Day'); }
      if (b.relativeVolume != null && b.relativeVolume < 0.7) { score -= 2; signals.push('Low Volume'); }
      if (alertTypes.has('macd_bearish_cross') || alertTypes.has('macd_strong_bearish')) { score -= 2; signals.push('Bearish MACD'); }
      
      return { stock: b, score, signals };
    });
    
    // Filter and sort for day trading
    const ranked = stockScores
      .filter(s => {
        const validSignals = s.signals.filter(sig => !['Extreme RSI', 'Negative Day', 'Low Volume', 'Bearish MACD'].includes(sig));
        return s.score >= 8 && s.stock.changePercent > 0 && validSignals.length >= 2;
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

  dayTradeCollapsed = signal(true);
  showDayTradeDialog = false;

  toggleDayTrade(): void {
    this.dayTradeCollapsed.update(v => !v);
  }

  showDayTradeInfo(event: Event): void {
    event.stopPropagation();
    this.showDayTradeDialog = true;
  }

  // Momentum Picks - High-flying stocks with strong momentum regardless of extension
  // For traders who want to ride momentum trends even if stocks are extended from MAs
  momentumPicks = computed(() => {
    const breakouts = this.allBreakouts();
    
    // Group by symbol - collect alert types
    const stockAlertMap = new Map<string, { stock: BreakoutStock; alertTypes: Set<string> }>();
    const skipSymbols = new Set(['BRK-A']);
    
    for (const b of breakouts) {
      if (skipSymbols.has(b.symbol)) continue;
      if (!stockAlertMap.has(b.symbol)) {
        stockAlertMap.set(b.symbol, { stock: b, alertTypes: new Set() });
      }
      if (b.alertType) stockAlertMap.get(b.symbol)!.alertTypes.add(b.alertType);
    }
    
    // Score each stock ONCE
    const stockScores = Array.from(stockAlertMap.values()).map(({ stock: b, alertTypes }) => {
      let score = 0;
      const signals: string[] = [];
      
      // === MOMENTUM STRENGTH ===
      if (b.percentFromFiftyDayMA != null) {
        if (b.percentFromFiftyDayMA >= 30) { score += 5; signals.push('Strong Momentum'); }
        else if (b.percentFromFiftyDayMA >= 15) { score += 3; signals.push('Good Momentum'); }
        else if (b.percentFromFiftyDayMA >= 5) { score += 1; signals.push('Mild Momentum'); }
      }
      
      if (b.percentFromTwoHundredDayMA != null) {
        if (b.percentFromTwoHundredDayMA >= 50) { score += 4; signals.push('Major Uptrend'); }
        else if (b.percentFromTwoHundredDayMA >= 20) { score += 2; signals.push('Uptrend'); }
      }
      
      // === BREAKOUT SIGNALS ===
      if (b.percentFromFiftyTwoWeekHigh != null && b.percentFromFiftyTwoWeekHigh >= -5) { score += 4; signals.push('52W High Zone'); }
      if (alertTypes.has('macd_bullish_cross') || alertTypes.has('macd_strong_bullish')) { score += 3; signals.push('MACD Bullish'); }
      
      // === TODAY'S ACTION ===
      if (b.changePercent >= 5) { score += 4; signals.push('Big Move Today'); }
      else if (b.changePercent >= 2) { score += 2; signals.push('Moving Today'); }
      
      if (b.relativeVolume != null && b.relativeVolume >= 1.5) { score += 2; signals.push('High Volume'); }
      
      // === RSI ===
      if (b.rsi != null && b.rsi >= 55 && b.rsi <= 75) { score += 2; signals.push('RSI Momentum'); }
      
      // === ANALYST SUPPORT ===
      const analystRating = (b as any).analystRatingScore;
      if (analystRating != null && analystRating <= 2.0) { score += 2; signals.push('Analyst Buy'); }
      
      // === PENALTIES ===
      if (b.changePercent < 0) { score -= 3; signals.push('Down Today'); }
      if (b.rsi != null && b.rsi > 80) { score -= 2; signals.push('Overbought'); }
      if (b.percentFromFiftyDayMA != null && b.percentFromFiftyDayMA < 0) { score -= 3; signals.push('Below 50 MA'); }
      
      return { stock: b, score, signals };
    });
    
    // Filter and sort
    const ranked = stockScores
      .filter(s => {
        const validSignals = s.signals.filter(sig => !['Down Today', 'Overbought', 'Below 50 MA'].includes(sig));
        const above50MA = s.stock.percentFromFiftyDayMA != null && s.stock.percentFromFiftyDayMA > 0;
        return s.score >= 10 && above50MA && validSignals.length >= 3;
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

  momentumCollapsed = signal(true);
  showMomentumDialog = false;

  toggleMomentum(): void {
    this.momentumCollapsed.update(v => !v);
  }

  showMomentumInfo(event: Event): void {
    event.stopPropagation();
    this.showMomentumDialog = true;
  }

  // Score Search Dialog
  showScoreSearchDialog = false;
  scoreSearchType: 'topPicks' | 'dayTrade' | 'momentum' = 'topPicks';
  scoreSearchSelected: any = null;
  scoreSearchSuggestions = signal<any[]>([]);
  scoreSearchLoading = false;
  scoreSearchError = '';
  scoreSearchResult: {
    symbol: string;
    name: string;
    score: number;
    qualifies: boolean;
    inBreakouts: boolean;
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
      analystRating: string | null;
      market: string;
    };
  } | null = null;

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
      case 'topPicks': return 'Top Picks';
      case 'dayTrade': return 'Day Trade';
      case 'momentum': return 'Momentum';
      default: return '';
    }
  }

  getScoreClass(score: number): string {
    if (score >= 15) return 'excellent';
    if (score >= 10) return 'good';
    if (score >= 5) return 'fair';
    return 'poor';
  }

  onScoreSearchComplete(event: AutoCompleteCompleteEvent): void {
    const query = event.query.toLowerCase().trim();
    if (query.length < 1) {
      this.scoreSearchSuggestions.set([]);
      return;
    }
    
    // Use the same API as header search but with technicals and fuzzy search
    this.http.get<{ stocks: any[] }>(`/api/stocks/search?q=${encodeURIComponent(query)}&technicals=true&fuzzy=true`).subscribe({
      next: (result) => {
        if (result.stocks && result.stocks.length > 0) {
          this.scoreSearchSuggestions.set(result.stocks.slice(0, 15));
        } else {
          this.scoreSearchSuggestions.set([]);
        }
      },
      error: () => {
        this.scoreSearchSuggestions.set([]);
      }
    });
  }

  onScoreSearchSelect(event: { value: any }): void {
    if (event.value) {
      this.calculateStockScore(event.value);
    }
  }

  calculateStockScore(stock: any): void {
    // Unified scoring: same logic for ALL stocks, whether in breakouts or not.
    // For breakouts stocks, we also know their alert types (golden_cross, macd, etc.)
    // For non-breakouts stocks, we infer what we can from technical data.
    
    const breakouts = this.allBreakouts();
    const stockAlerts = breakouts.filter(b => b.symbol === stock.symbol);
    const useBreakoutsData = stockAlerts.length > 0;
    
    // Get base stock data (prefer breakouts data for accuracy)
    const baseStock = useBreakoutsData ? stockAlerts[0] : stock;
    const price = baseStock.price || 0;
    const changePercent = baseStock.changePercent || 0;
    const rsi = baseStock.rsi ?? stock.rsi ?? null;
    
    // Calculate derived metrics
    let pct50MA: number | null;
    let pct200MA: number | null;
    let pct52High: number | null;
    let relVolume: number | null;
    
    if (useBreakoutsData) {
      pct50MA = baseStock.percentFromFiftyDayMA ?? null;
      pct200MA = baseStock.percentFromTwoHundredDayMA ?? null;
      pct52High = baseStock.percentFromFiftyTwoWeekHigh ?? null;
      relVolume = baseStock.relativeVolume ?? null;
    } else {
      const fiftyDayMA = stock.fiftyDayMA ?? stock.percentFromFiftyDayMA != null ? null : stock.fiftyDayMA;
      const twoHundredDayMA = stock.twoHundredDayMA ?? null;
      const fiftyTwoWeekHigh = stock.fiftyTwoWeekHigh ?? null;
      const volume = stock.volume ?? null;
      const avgVolume = stock.avgVolume ?? null;
      
      pct50MA = stock.percentFromFiftyDayMA ?? (stock.fiftyDayMA && price ? ((price - stock.fiftyDayMA) / stock.fiftyDayMA) * 100 : null);
      pct200MA = stock.percentFromTwoHundredDayMA ?? (twoHundredDayMA && price ? ((price - twoHundredDayMA) / twoHundredDayMA) * 100 : null);
      pct52High = stock.percentFromFiftyTwoWeekHigh ?? (fiftyTwoWeekHigh && price ? ((price - fiftyTwoWeekHigh) / fiftyTwoWeekHigh) * 100 : null);
      relVolume = stock.relativeVolume ?? (avgVolume && volume ? volume / avgVolume : null);
    }
    
    // Get analyst rating
    const averageAnalystRating = (baseStock as any).averageAnalystRating || stock.averageAnalystRating || null;
    let analystScore: number | null = (baseStock as any).analystRatingScore ?? null;
    if (analystScore == null && averageAnalystRating) {
      const match = averageAnalystRating.match(/^([\d.]+)/);
      analystScore = match ? parseFloat(match[1]) : null;
    }
    
    // Collect alert types from breakouts data
    const alertTypes = new Set<string>();
    const alertCategories = new Set<string>();
    if (useBreakoutsData) {
      for (const b of stockAlerts) {
        if (b.alertType) alertTypes.add(b.alertType);
        if (b.alertCategory) alertCategories.add(b.alertCategory);
      }
    } else {
      // Infer alert types from technical data for non-breakout stocks
      const fiftyDayMA = stock.fiftyDayMA ?? null;
      const twoHundredDayMA = stock.twoHundredDayMA ?? null;
      if (fiftyDayMA && twoHundredDayMA && fiftyDayMA > twoHundredDayMA) {
        const maDiff = ((fiftyDayMA - twoHundredDayMA) / twoHundredDayMA) * 100;
        if (maDiff <= 3 && maDiff > 0) alertTypes.add('golden_cross');
      }
      if (fiftyDayMA && twoHundredDayMA && fiftyDayMA < twoHundredDayMA) {
        const maDiff = ((twoHundredDayMA - fiftyDayMA) / twoHundredDayMA) * 100;
        if (maDiff <= 3 && maDiff > 0) alertTypes.add('death_cross');
      }
      // MACD signal type from search API
      if (stock.macdSignalType === 'bullish_crossover' || stock.macdSignalType === 'strong_bullish') {
        alertTypes.add('macd_bullish_cross');
      } else if (stock.macdSignalType === 'bearish_crossover' || stock.macdSignalType === 'strong_bearish') {
        alertTypes.add('macd_bearish_cross');
      }
    }

    const breakdown: { label: string; value: string; points: number }[] = [];
    const signals: string[] = [];
    let totalScore = 0;

    // Helper to add a scoring item
    const addScore = (label: string, value: string, points: number) => {
      breakdown.push({ label, value, points });
      totalScore += points;
    };

    // Calculate score based on type - SINGLE PASS, same factors for all stocks
    if (this.scoreSearchType === 'topPicks') {
      // Top Picks scoring (medium-term) - EXACT same logic as topPicks computed signal
      if (pct50MA != null && pct50MA > 0 && pct50MA <= 8) { addScore('Above 50 MA (0-8%)', `+${pct50MA.toFixed(1)}%`, 3); signals.push('Above 50 MA'); }
      if (pct200MA != null && pct200MA > 0 && pct200MA <= 20) { addScore('Above 200 MA (0-20%)', `+${pct200MA.toFixed(1)}%`, 3); signals.push('Above 200 MA'); }
      if (alertTypes.has('golden_cross')) { addScore('Golden Cross', '50 MA > 200 MA', 5); signals.push('Golden Cross'); }
      
      if (rsi != null && rsi >= 50 && rsi <= 65) { addScore('RSI 50-65 (Strong Momentum)', `${rsi.toFixed(0)}`, 3); signals.push('Strong Momentum'); }
      else if (rsi != null && rsi >= 40 && rsi < 50) { addScore('RSI 40-50 (Building)', `${rsi.toFixed(0)}`, 1); signals.push('Building Momentum'); }
      else if (rsi != null && rsi >= 30 && rsi < 40) { addScore('RSI 30-40 (Oversold Bounce)', `${rsi.toFixed(0)}`, 2); signals.push('Oversold Bounce'); }
      
      if (alertTypes.has('macd_bullish_cross') || alertTypes.has('macd_strong_bullish')) { addScore('MACD Bullish', 'Crossover', 4); signals.push('MACD Bullish'); }
      if (pct52High != null && pct52High >= -10) { addScore('Near 52W High (within 10%)', `${pct52High.toFixed(1)}%`, 2); signals.push('Near 52W High'); }
      
      if (changePercent > 2 && relVolume != null && relVolume > 1.2) { addScore('Breakout Move (>2% + volume)', `+${changePercent.toFixed(1)}%`, 2); signals.push('Breakout Move'); }
      else if (changePercent > 0) { addScore('Positive Day', `+${changePercent.toFixed(2)}%`, 1); signals.push('Positive Day'); }
      
      if (alertCategories.has('volume_breakout') && changePercent > 0) { addScore('Volume Surge', `${relVolume?.toFixed(1)}x`, 2); signals.push('Volume Surge'); }
      
      // Analyst
      if (analystScore != null) {
        if (analystScore <= 1.5) { addScore('Strong Buy Rating', `${analystScore.toFixed(1)}`, 3); signals.push('Strong Buy Rating'); }
        else if (analystScore <= 2.2) { addScore('Buy Rating', `${analystScore.toFixed(1)}`, 2); signals.push('Buy Rating'); }
        else if (analystScore >= 3.5) { addScore('Weak Rating', `${analystScore.toFixed(1)}`, -2); signals.push('Weak Rating'); }
      }
      
      // Penalties
      if (rsi != null && rsi > 70) { addScore('Overbought RSI (>70)', `${rsi.toFixed(0)}`, -4); signals.push('Overbought'); }
      if (alertTypes.has('death_cross')) { addScore('Death Cross', '50 MA < 200 MA', -5); signals.push('Death Cross'); }
      if (alertTypes.has('macd_bearish_cross') || alertTypes.has('macd_strong_bearish')) { addScore('Bearish MACD', 'Crossover', -3); signals.push('Bearish MACD'); }
      if (pct50MA != null && pct50MA > 15) { addScore('Too Extended from 50 MA (>15%)', `+${pct50MA.toFixed(1)}%`, -2); signals.push('Too Extended'); }
      if (pct200MA != null && pct200MA < 0) { addScore('Below 200 MA', `${pct200MA.toFixed(1)}%`, -2); signals.push('Below 200 MA'); }
      
      const validSignals = signals.filter(s => !['Overbought', 'Death Cross', 'Bearish MACD', 'Too Extended', 'Below 200 MA', 'Weak Rating'].includes(s));
      const above200MA = pct200MA != null && pct200MA > 0;
      const qualifies = totalScore >= 6 && validSignals.length >= 3 && above200MA;
      let reason = '';
      if (!qualifies) {
        if (totalScore < 6) reason = `Score ${totalScore} < 6 required`;
        else if (validSignals.length < 3) reason = `Only ${validSignals.length} bullish signals (3 required)`;
        else if (!above200MA) reason = 'Not above 200 MA';
      }
      
      this.scoreSearchResult = {
        symbol: stock.symbol, name: baseStock.name || stock.name, score: totalScore, qualifies, inBreakouts: useBreakoutsData, reason, signals,
        breakdown: breakdown.sort((a, b) => b.points - a.points),
        metrics: { price, changePercent, rsi, pct50MA, pct200MA, pct52High, relVolume, analystRating: averageAnalystRating, market: baseStock.market || stock.market || 'US' }
      };
      
    } else if (this.scoreSearchType === 'dayTrade') {
      // Day Trade scoring - EXACT same logic as dayTradePicks computed signal
      if (changePercent >= 5) { addScore('Big Mover (5%+)', `+${changePercent.toFixed(2)}%`, 7); signals.push('Big Mover'); }
      else if (changePercent >= 3) { addScore('Strong Move (3-5%)', `+${changePercent.toFixed(2)}%`, 5); signals.push('Strong Move'); }
      else if (changePercent >= 1.5) { addScore('Good Move (1.5-3%)', `+${changePercent.toFixed(2)}%`, 3); signals.push('Good Move'); }
      else if (changePercent > 0) { addScore('Positive Day', `+${changePercent.toFixed(2)}%`, 1); signals.push('Positive Day'); }
      
      if (relVolume != null) {
        if (relVolume >= 2.5) { addScore('Massive Volume (2.5x+)', `${relVolume.toFixed(2)}x`, 6); signals.push('Massive Volume'); }
        else if (relVolume >= 1.8) { addScore('High Volume (1.8-2.5x)', `${relVolume.toFixed(2)}x`, 4); signals.push('High Volume'); }
        else if (relVolume >= 1.3) { addScore('Above Avg Volume (1.3-1.8x)', `${relVolume.toFixed(2)}x`, 2); signals.push('Above Avg Volume'); }
      }
      
      if (pct52High != null) {
        if (pct52High >= 0) { addScore('New 52W High', 'Breakout', 5); signals.push('New 52W High'); }
        else if (pct52High >= -3) { addScore('Near 52W High', `${pct52High.toFixed(1)}%`, 3); signals.push('Near 52W High'); }
      }
      
      if (alertTypes.has('macd_bullish_cross') || alertTypes.has('macd_strong_bullish')) { addScore('MACD Bullish', 'Crossover', 3); signals.push('MACD Bullish'); }
      
      if (rsi != null) {
        if (rsi >= 60 && rsi <= 75) { addScore('Strong RSI (60-75)', `${rsi.toFixed(0)}`, 3); signals.push('Strong RSI'); }
        if (rsi > 80) { addScore('Extreme RSI (>80)', `${rsi.toFixed(0)}`, -2); signals.push('Extreme RSI'); }
      }
      
      if (pct50MA != null && pct50MA > 0) { addScore('Above 50 MA', `+${pct50MA.toFixed(1)}%`, 1); signals.push('Above 50 MA'); }
      if (pct200MA != null && pct200MA > 0) { addScore('Above 200 MA', `+${pct200MA.toFixed(1)}%`, 1); signals.push('Above 200 MA'); }
      
      if (changePercent < 0) { addScore('Negative Day', `${changePercent.toFixed(2)}%`, -3); signals.push('Negative Day'); }
      if (relVolume != null && relVolume < 0.7) { addScore('Low Volume (<0.7x)', `${relVolume.toFixed(2)}x`, -2); signals.push('Low Volume'); }
      if (alertTypes.has('macd_bearish_cross') || alertTypes.has('macd_strong_bearish')) { addScore('Bearish MACD', 'Crossover', -2); signals.push('Bearish MACD'); }
      
      const validSignals = signals.filter(s => !['Negative Day', 'Low Volume', 'Bearish MACD', 'Extreme RSI'].includes(s));
      const qualifies = totalScore >= 8 && changePercent > 0 && validSignals.length >= 2;
      let reason = '';
      if (!qualifies) {
        if (totalScore < 8) reason = `Score ${totalScore} < 8 required`;
        else if (changePercent <= 0) reason = 'Not a positive day';
        else if (validSignals.length < 2) reason = `Only ${validSignals.length} momentum signals (2 required)`;
      }
      
      this.scoreSearchResult = {
        symbol: stock.symbol, name: baseStock.name || stock.name, score: totalScore, qualifies, inBreakouts: useBreakoutsData, reason, signals,
        breakdown: breakdown.sort((a, b) => b.points - a.points),
        metrics: { price, changePercent, rsi, pct50MA, pct200MA, pct52High, relVolume, analystRating: averageAnalystRating, market: baseStock.market || stock.market || 'US' }
      };
      
    } else if (this.scoreSearchType === 'momentum') {
      // Momentum scoring - EXACT same logic as momentumPicks computed signal
      if (pct50MA != null) {
        if (pct50MA >= 30) { addScore('Strong Momentum (30%+ from 50 MA)', `+${pct50MA.toFixed(1)}%`, 5); signals.push('Strong Momentum'); }
        else if (pct50MA >= 15) { addScore('Good Momentum (15-30% from 50 MA)', `+${pct50MA.toFixed(1)}%`, 3); signals.push('Good Momentum'); }
        else if (pct50MA >= 5) { addScore('Above 50 MA (5-15%)', `+${pct50MA.toFixed(1)}%`, 1); signals.push('Mild Momentum'); }
      }
      if (pct200MA != null) {
        if (pct200MA >= 50) { addScore('Major Uptrend (50%+ from 200 MA)', `+${pct200MA.toFixed(1)}%`, 4); signals.push('Major Uptrend'); }
        else if (pct200MA >= 20) { addScore('Uptrend (20-50% from 200 MA)', `+${pct200MA.toFixed(1)}%`, 2); signals.push('Uptrend'); }
      }
      
      if (pct52High != null && pct52High >= -5) { addScore('Near 52W High (within 5%)', `${pct52High.toFixed(1)}%`, 4); signals.push('52W High Zone'); }
      if (alertTypes.has('macd_bullish_cross') || alertTypes.has('macd_strong_bullish')) { addScore('MACD Bullish', 'Crossover', 3); signals.push('MACD Bullish'); }
      
      if (changePercent >= 5) { addScore('Big Move Today (5%+)', `+${changePercent.toFixed(2)}%`, 4); signals.push('Big Move Today'); }
      else if (changePercent >= 2) { addScore('Moving Today (2-5%)', `+${changePercent.toFixed(2)}%`, 2); signals.push('Moving Today'); }
      
      if (relVolume != null && relVolume >= 1.5) { addScore('High Volume (1.5x+)', `${relVolume.toFixed(2)}x`, 2); signals.push('High Volume'); }
      if (rsi != null && rsi >= 55 && rsi <= 75) { addScore('RSI Momentum Zone (55-75)', `${rsi.toFixed(0)}`, 2); signals.push('RSI Momentum'); }
      if (analystScore != null && analystScore <= 2.0) { addScore('Analyst Buy Rating', `${analystScore.toFixed(1)}`, 2); signals.push('Analyst Buy'); }
      
      // Penalties
      if (changePercent < 0) { addScore('Down Today', `${changePercent.toFixed(2)}%`, -3); signals.push('Down Today'); }
      if (rsi != null && rsi > 80) { addScore('Overbought RSI (>80)', `${rsi.toFixed(0)}`, -2); signals.push('Overbought'); }
      if (pct50MA != null && pct50MA < 0) { addScore('Below 50 MA', `${pct50MA.toFixed(1)}%`, -3); signals.push('Below 50 MA'); }
      
      const validSignals = signals.filter(s => !['Down Today', 'Overbought', 'Below 50 MA'].includes(s));
      const above50MA = pct50MA != null && pct50MA > 0;
      const qualifies = totalScore >= 10 && above50MA && validSignals.length >= 3;
      let reason = '';
      if (!qualifies) {
        if (totalScore < 10) reason = `Score ${totalScore} < 10 required`;
        else if (!above50MA) reason = 'Not above 50 MA';
        else if (validSignals.length < 3) reason = `Only ${validSignals.length} momentum signals (3 required)`;
      }
      
      this.scoreSearchResult = {
        symbol: stock.symbol, name: baseStock.name || stock.name, score: totalScore, qualifies, inBreakouts: useBreakoutsData, reason, signals,
        breakdown: breakdown.sort((a, b) => b.points - a.points),
        metrics: { price, changePercent, rsi, pct50MA, pct200MA, pct52High, relVolume, analystRating: averageAnalystRating, market: baseStock.market || stock.market || 'US' }
      };
    }

    this.scoreSearchLoading = false;
  }

  private refreshInterval: ReturnType<typeof setInterval> | null = null;
  private previousMarket: Market | null = null;

  constructor() {
    // React to market changes
    effect(() => {
      const market = this.marketService.currentMarket();
      if (this.previousMarket !== null && this.previousMarket !== market) {
        this.loadBreakouts();
      }
      this.previousMarket = market;
    });
  }

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
      const market = this.marketService.currentMarket();
      const result = await this.http.get<{ breakouts: BreakoutStock[] }>(
        `/api/market/breakouts?market=${market}`
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

  toggleTopPicks(): void {
    this.topPicksCollapsed.set(!this.topPicksCollapsed());
  }

  showScoringInfo(event: Event): void {
    event.stopPropagation(); // Prevent toggling the panel
    this.showScoringDialog = true;
  }

  getCategoryCount(categoryId: string): number {
    return this.filteredBreakouts().filter(b => b.alertCategory === categoryId).length;
  }

  getStocksByCategory(categoryId: string): BreakoutStock[] {
    return this.filteredBreakouts().filter(b => b.alertCategory === categoryId);
  }

  goToStock(symbol: string): void {
    // Open stock details in a new tab
    window.open(`/stock/${symbol}`, '_blank');
  }

  getAnalystLabel(score: number | null | undefined): string {
    if (score == null) return '-';
    if (score <= 1.5) return 'Strong Buy';
    if (score <= 2.2) return 'Buy';
    if (score < 3.5) return 'Hold';
    if (score < 4.5) return 'Underperform';
    return 'Sell';
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
