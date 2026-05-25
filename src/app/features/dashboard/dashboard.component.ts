import { Component, inject, OnInit, computed, signal, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';

import { AuthService } from '../../core/services/auth.service';
import { MarketService } from '../../core/services/market.service';
import { DashboardService } from '../../core/services/dashboard.service';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, RouterModule],
  template: `
    <div class="dashboard theme-v2">
      <div class="dashboard-bg"></div>
      <div class="dashboard-grain"></div>

      <div class="dashboard-content">
        <!-- Hero: Greeting + Market Status -->
        <header class="hero-row v2-animate-slide-up">
          <div class="greeting-block">
            <h1 class="greeting-text">{{ greeting() }}</h1>
          </div>
        </header>

        <!-- Bento Grid -->
        <div class="bento-grid">
          <!-- FIRE Goals Panel -->
          <a routerLink="/fire-goals" class="panel panel-fire v2-animate-slide-up" style="animation-delay: 0.05s">
            <div class="panel-header">
              <div class="panel-icon fire-icon"><i class="pi pi-sparkles"></i></div>
              <span class="panel-title">FIRE Progress</span>
              <i class="pi pi-arrow-up-right panel-link-icon"></i>
            </div>
            <div class="panel-body">
              @if (fire().hasGoal) {
                <div class="fire-hero">
                  <div class="fire-ring-container">
                    <svg class="fire-ring" viewBox="0 0 120 120">
                      <defs>
                        <linearGradient id="fireProgressGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                          <stop offset="0%" stop-color="#10b981" />
                          <stop offset="100%" stop-color="#34d399" />
                        </linearGradient>
                      </defs>
                      <circle class="fire-ring-bg" cx="60" cy="60" r="52" />
                      <circle class="fire-ring-progress" cx="60" cy="60" r="52"
                        [style.stroke-dashoffset]="fireRingOffset()" />
                    </svg>
                    <div class="fire-ring-label">
                      <span class="fire-percent">{{ fire().progressPercent | number:'1.0-0' }}%</span>
                    </div>
                  </div>
                  <div class="fire-hero-stats">
                    <div class="fire-stat">
                      <span class="stat-label">Net Worth</span>
                      <span class="stat-value">{{ formatFull(fire().netWorth, fire().currency) }}</span>
                    </div>
                    <div class="fire-stat">
                      <span class="stat-label">Target</span>
                      <span class="stat-value">{{ formatFull(fire().fireTarget, fire().currency) }}</span>
                    </div>
                    <div class="fire-stat">
                      <span class="stat-label">Time Left</span>
                      <span class="stat-value">{{ fireTimeLeft() }}</span>
                    </div>
                  </div>
                </div>
                <div class="fire-contrib">
                  <div class="fire-contrib-item">
                    <span class="contrib-label">Monthly target</span>
                    <span class="contrib-value">{{ formatFull(fire().requiredMonthly, fire().currency) }}</span>
                  </div>
                  <div class="fire-contrib-divider"></div>
                  <div class="fire-contrib-item">
                    <span class="contrib-label">Yearly target</span>
                    <span class="contrib-value">{{ formatFull(fire().requiredAnnual, fire().currency) }}</span>
                  </div>
                </div>
                <div class="fire-track-badge" [class.on-track]="fire().onTrack" [class.off-track]="!fire().onTrack">
                  {{ fire().onTrack ? 'On Track' : fireEncouragement() }}
                </div>
              } @else {
                <div class="panel-empty">
                  <i class="pi pi-sparkles"></i>
                  <span>Set up your FIRE goals</span>
                </div>
              }
            </div>
          </a>

          <!-- Portfolio Panel -->
          <div class="panel panel-portfolio v2-animate-slide-up" style="animation-delay: 0.1s">
            <div class="panel-header">
              <div class="panel-icon portfolio-icon"><i class="pi pi-wallet"></i></div>
              <span class="panel-title">Portfolio Growth</span>
              @if (portfolio().hasData) {
                <span class="portfolio-age-badge">{{ portfolio().monthsTracked }} months since {{ portfolio().trackingSince }}</span>
              }
              <a routerLink="/portfolio" [queryParams]="{lens: 'open'}" class="header-icon-btn" title="Growth Lens">
                <i class="pi pi-chart-line"></i>
              </a>
              <a routerLink="/watchlists/top-performers" class="header-icon-btn" title="Watchlist Winners">
                <i class="pi pi-trophy"></i>
              </a>
              <a routerLink="/screener" class="header-icon-btn" title="Screener">
                <i class="pi pi-table"></i>
              </a>
              <a routerLink="/portfolio" class="panel-link-icon-btn">
                <i class="pi pi-arrow-up-right"></i>
              </a>
            </div>
            <div class="panel-body">
              @if (portfolio().hasData) {
                <div class="pf-top-row">
                  <span class="big-number">{{ formatCurrency(portfolio().totalValue, portfolio().currency) }}</span>
                  <div class="pf-return-pills">
                    <span class="pf-pill" [class.positive]="portfolio().returnPercent >= 0" [class.negative]="portfolio().returnPercent < 0">
                      {{ portfolio().returnPercent >= 0 ? '+' : '' }}{{ portfolio().returnPercent | number:'1.1-1' }}% total
                    </span>
                    <span class="pf-pill" [class.positive]="portfolio().annualizedReturn >= 0" [class.negative]="portfolio().annualizedReturn < 0">
                      {{ portfolio().annualizedReturn >= 0 ? '+' : '' }}{{ portfolio().annualizedReturn | number:'1.1-1' }}% / yr
                    </span>
                  </div>
                </div>
                @if (portfolio().goalValue > 0) {
                  <div class="pf-goal-track">
                    <div class="pf-goal-labels">
                      <span class="pf-goal-current">{{ formatCompact(portfolio().totalValue, portfolio().currency) }}</span>
                      <span class="pf-goal-target">
                        <i class="pi pi-flag"></i>
                        {{ formatCompact(portfolio().goalValue, portfolio().currency) }} by {{ portfolio().goalTargetDate }}
                      </span>
                    </div>
                    <div class="pf-goal-bar">
                      <div class="pf-goal-fill" [style.width.%]="portfolio().goalProgress"></div>
                    </div>
                    <span class="pf-goal-pct">{{ portfolio().goalProgress | number:'1.0-0' }}% of planned portfolio</span>
                  </div>
                }
                <div class="pf-stats-strip">
                  <div class="pf-stat">
                    <span class="pf-stat-val">{{ formatCompact(portfolio().totalInvested, portfolio().currency) }}</span>
                    <span class="pf-stat-lbl">invested</span>
                  </div>
                  <div class="pf-stat-divider"></div>
                  <div class="pf-stat">
                    <span class="pf-stat-val">{{ formatCompact(portfolio().avgMonthlyAdd, portfolio().currency) }}</span>
                    <span class="pf-stat-lbl">avg inv/mo</span>
                  </div>
                  <div class="pf-stat-divider"></div>
                  <div class="pf-stat">
                    <span class="pf-stat-val" [class.positive]="portfolio().totalProfit >= 0" [class.negative]="portfolio().totalProfit < 0">{{ formatCompact(portfolio().totalProfit, portfolio().currency) }}</span>
                    <span class="pf-stat-lbl">profit</span>
                  </div>
                  <div class="pf-stat-divider"></div>
                  <div class="pf-stat">
                    <span class="pf-stat-val positive">+{{ portfolio().bestMonthReturn | number:'1.1-1' }}%</span>
                    <span class="pf-stat-lbl">best mo</span>
                  </div>
                </div>
              } @else {
                <div class="panel-empty">
                  <i class="pi pi-wallet"></i>
                  <span>Start tracking your portfolio</span>
                </div>
              }
            </div>
          </div>

          <!-- Recommendations Panel -->
          <div class="panel panel-recs v2-animate-slide-up" style="animation-delay: 0.15s">
            <div class="panel-header">
              <div class="panel-icon recs-icon"><i class="pi pi-star"></i></div>
              <span class="panel-title">Today's Picks</span>
              <a routerLink="/breakouts" class="header-icon-btn" title="Breakouts">
                <i class="pi pi-bolt"></i>
              </a>
              <a routerLink="/recommendations" class="panel-link-icon-btn">
                <i class="pi pi-arrow-up-right"></i>
              </a>
            </div>
            <div class="panel-body">
              @if (dashService.picks().length) {
                <div class="picks-list">
                  @for (pick of dashService.picks(); track pick.symbol) {
                    <div class="pick-row">
                      <span class="pick-symbol">{{ pick.symbol }}</span>
                      <span class="pick-score">{{ pick.score }}/100</span>
                      <span class="pick-targets">
                        <span class="target-buy">{{ pick.buy_target | number:'1.2-2' }}</span>
                        <i class="pi pi-arrow-right"></i>
                        <span class="target-sell">{{ pick.sell_target | number:'1.2-2' }}</span>
                      </span>
                    </div>
                  }
                </div>
              } @else {
                <div class="panel-empty">
                  <i class="pi pi-star"></i>
                  <span>No picks today yet</span>
                </div>
              }
            </div>
          </div>

          <!-- Paper Trading + Email Settings (stacked in one cell) -->
          <div class="panel-paper-wrapper">
            <a routerLink="/paper-trading" class="panel panel-paper v2-animate-slide-up" style="animation-delay: 0.2s">
              <div class="panel-header">
                <div class="panel-icon paper-icon"><i class="pi pi-briefcase"></i></div>
                <span class="panel-title">Paper Trading</span>
                @if (paper().tradingSince) {
                  <span class="pt-since-badge">since {{ paper().tradingSince }}</span>
                }
                <i class="pi pi-arrow-up-right panel-link-icon"></i>
              </div>
              <div class="panel-body">
                @if (paper().enabled) {
                  <div class="pt-top-row">
                    <span class="big-number">{{ formatCurrency(paper().totalEquity, paper().currency) }}</span>
                    <div class="pf-return-pills">
                      <span class="pf-pill" [class.positive]="paper().returnPercent >= 0" [class.negative]="paper().returnPercent < 0">
                        {{ paper().returnPercent >= 0 ? '+' : '' }}{{ paper().returnPercent | number:'1.1-1' }}%
                      </span>
                    </div>
                  </div>
                  <div class="pt-pnl-row">
                    <div class="pt-pnl-item">
                      <span class="pt-pnl-label">Realized</span>
                      <span class="pt-pnl-val" [class.positive]="paper().realizedPnl >= 0" [class.negative]="paper().realizedPnl < 0">
                        {{ paper().realizedPnl >= 0 ? '+' : '' }}{{ formatCompact(paper().realizedPnl, paper().currency) }}
                      </span>
                    </div>
                    <div class="pt-pnl-item">
                      <span class="pt-pnl-label">Unrealized</span>
                      <span class="pt-pnl-val" [class.positive]="paper().unrealizedPnl >= 0" [class.negative]="paper().unrealizedPnl < 0">
                        {{ paper().unrealizedPnl >= 0 ? '+' : '' }}{{ formatCompact(paper().unrealizedPnl, paper().currency) }}
                      </span>
                    </div>
                    <div class="pt-pnl-item">
                      <span class="pt-pnl-label">Total P&L</span>
                      <span class="pt-pnl-val" [class.positive]="paper().totalPnl >= 0" [class.negative]="paper().totalPnl < 0">
                        {{ paper().totalPnl >= 0 ? '+' : '' }}{{ formatCompact(paper().totalPnl, paper().currency) }}
                      </span>
                    </div>
                  </div>
                  <div class="pf-stats-strip">
                    <div class="pf-stat">
                      <span class="pf-stat-val">{{ paper().positionCount }}</span>
                      <span class="pf-stat-lbl">positions</span>
                    </div>
                    <div class="pf-stat-divider"></div>
                    <div class="pf-stat">
                      <span class="pf-stat-val">{{ paper().tradeCount }}</span>
                      <span class="pf-stat-lbl">trades</span>
                    </div>
                    <div class="pf-stat-divider"></div>
                    <div class="pf-stat">
                      <span class="pf-stat-val">{{ paper().winRate | number:'1.0-0' }}%</span>
                      <span class="pf-stat-lbl">win rate</span>
                    </div>
                    <div class="pf-stat-divider"></div>
                    <div class="pf-stat">
                      <span class="pf-stat-val">{{ formatCompact(paper().cashBalance, paper().currency) }}</span>
                      <span class="pf-stat-lbl">cash</span>
                    </div>
                  </div>
                } @else {
                  <div class="panel-empty">
                    <i class="pi pi-briefcase"></i>
                    <span>Enable paper trading</span>
                  </div>
                }
              </div>
            </a>

            <div class="panel panel-settings v2-animate-slide-up" style="animation-delay: 0.3s">
              <div class="panel-header">
                <div class="panel-icon settings-icon"><i class="pi pi-envelope"></i></div>
                <span class="panel-title">Email Notifications</span>
                <span class="settings-note-badge">soon</span>
              </div>
              <div class="panel-body">
                <div class="settings-list">
                  <div class="setting-row">
                    <div class="setting-info">
                      <span class="setting-label">Daily Picks</span>
                      <span class="setting-desc">Top recommendations</span>
                    </div>
                    <span class="setting-toggle active"></span>
                  </div>
                  <div class="setting-row">
                    <div class="setting-info">
                      <span class="setting-label">Crossover Alerts</span>
                      <span class="setting-desc">DMA signal triggers</span>
                    </div>
                    <span class="setting-toggle active"></span>
                  </div>
                  <div class="setting-row">
                    <div class="setting-info">
                      <span class="setting-label">Weekly Summary</span>
                      <span class="setting-desc">Portfolio digest</span>
                    </div>
                    <span class="setting-toggle"></span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- News Panel -->
          <div class="panel panel-news v2-animate-slide-up" style="animation-delay: 0.25s">
            <div class="panel-header">
              <div class="panel-icon news-icon"><i class="pi pi-bolt"></i></div>
              <span class="panel-title">Market News</span>
              <a routerLink="/news" class="panel-link-icon-btn">
                <i class="pi pi-arrow-up-right"></i>
              </a>
            </div>
            <div class="panel-body">
              @if (dashService.news().length) {
                <div class="news-list">
                  @for (item of dashService.news(); track item.link) {
                    <a class="news-row" [href]="item.link" target="_blank" rel="noopener noreferrer">
                      <span class="news-title">{{ item.title }}</span>
                      <span class="news-meta">{{ item.source }} &middot; {{ item.timeAgo }}</span>
                    </a>
                  }
                </div>
              } @else {
                <div class="panel-empty">
                  <i class="pi pi-bolt"></i>
                  <span>Loading news...</span>
                </div>
              }
            </div>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    @import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,300;9..144,500;9..144,700&family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap');

    :host { display: block; }

    .dashboard {
      position: relative;
      height: calc(100vh - 56px);
      padding: 1.5rem 2rem 1.5rem;
      overflow: hidden;
      font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, sans-serif;
    }

    .dashboard-bg {
      position: absolute;
      inset: 0;
      background:
        radial-gradient(ellipse at 20% 0%, rgba(212, 168, 83, 0.06) 0%, transparent 50%),
        radial-gradient(ellipse at 80% 100%, rgba(74, 124, 255, 0.04) 0%, transparent 50%),
        linear-gradient(180deg, #0d0d0f 0%, #111113 100%);
      z-index: 0;
    }

    .dashboard-grain {
      position: absolute;
      inset: 0;
      background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E");
      opacity: 0.025;
      pointer-events: none;
      z-index: 1;
    }

    .dashboard-content {
      position: relative;
      z-index: 2;
      max-width: 1400px;
      margin: 0 auto;
    }

    /* Hero Row */
    .hero-row {
      display: flex;
      align-items: flex-end;
      justify-content: space-between;
      margin-bottom: 1.1rem;
      gap: 1.5rem;
      flex-wrap: wrap;
    }

    .greeting-text {
      font-family: 'Fraunces', Georgia, serif;
      font-size: 1.75rem;
      font-weight: 300;
      color: #f5f5f7;
      letter-spacing: -0.02em;
      margin-bottom: 0;
      margin: 0;
    }

    .greeting-sub {
      color: #a1a1a6;
      font-size: 0.9rem;
      margin-top: 0.35rem;
    }

    .shortcuts-block {
      display: flex;
      gap: 0.5rem;
      flex-wrap: wrap;
    }

    .shortcut-pill {
      display: inline-flex;
      align-items: center;
      gap: 0.4rem;
      padding: 0.45rem 0.85rem;
      border-radius: 20px;
      background: rgba(255, 255, 255, 0.04);
      border: 1px solid rgba(255, 255, 255, 0.08);
      color: #a1a1a6;
      font-size: 0.78rem;
      font-weight: 500;
      text-decoration: none;
      transition: all 0.2s ease;
      backdrop-filter: blur(8px);
    }

    .shortcut-pill:hover {
      background: rgba(212, 168, 83, 0.1);
      border-color: rgba(212, 168, 83, 0.3);
      color: #d4a853;
    }

    .shortcut-pill i {
      font-size: 0.85rem;
    }

    /* Bento Grid */
    .bento-grid {
      display: grid;
      grid-template-columns: 1fr 1.5fr;
      grid-template-rows: auto auto auto;
      gap: 1.1rem;
    }

    .panel-fire { grid-row: 1; grid-column: 1; }
    .panel-portfolio { grid-row: 1; grid-column: 2; }
    .panel-recs { grid-row: 2; grid-column: 1; }
    .panel-paper-wrapper { grid-row: 2; grid-column: 2; display: flex; flex-direction: row; gap: 1rem; }
    .panel-news { grid-row: 3; grid-column: 1 / -1; }

    /* Panel Base */
    .panel {
      background: rgba(26, 26, 29, 0.7);
      border: 1px solid rgba(255, 255, 255, 0.06);
      border-radius: 16px;
      padding: 1.2rem 1.3rem;
      backdrop-filter: blur(12px);
      transition: all 0.25s ease;
      text-decoration: none;
      color: inherit;
      display: flex;
      flex-direction: column;
      opacity: 0;
      animation: v2-slideUp 0.4s ease-out forwards;
    }

    .panel:hover {
      border-color: rgba(212, 168, 83, 0.3);
      background: rgba(33, 33, 37, 0.8);
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3), 0 0 0 1px rgba(212, 168, 83, 0.1);
    }

    .panel-header {
      display: flex;
      align-items: center;
      gap: 0.6rem;
      margin-bottom: 1.1rem;
    }

    .panel-icon {
      width: 32px;
      height: 32px;
      border-radius: 9px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 0.9rem;
    }

    .fire-icon {
      background: linear-gradient(135deg, rgba(245, 158, 11, 0.2), rgba(249, 115, 22, 0.2));
      color: #f59e0b;
    }
    .portfolio-icon {
      background: rgba(74, 124, 255, 0.15);
      color: #4a7cff;
    }
    .recs-icon {
      background: rgba(52, 211, 153, 0.12);
      color: #34d399;
    }
    .paper-icon {
      background: rgba(167, 139, 250, 0.12);
      color: #a78bfa;
    }
    .news-icon {
      background: rgba(251, 146, 60, 0.12);
      color: #fb923c;
    }
    .settings-icon {
      background: rgba(148, 163, 184, 0.12);
      color: #94a3b8;
    }

    .panel-title {
      font-size: 0.82rem;
      font-weight: 600;
      color: #a1a1a6;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      flex: 1;
    }

    .panel-link-icon {
      font-size: 0.75rem;
      color: #6e6e73;
      transition: all 0.2s ease;
    }

    .panel:hover .panel-link-icon {
      color: #d4a853;
      transform: translate(2px, -2px);
    }

    .panel-body { flex: 1; }

    .panel-fire .panel-body {
      display: flex;
      flex-direction: column;
      justify-content: center;
    }

    /* FIRE Ring */
    .fire-hero {
      display: flex;
      align-items: center;
      gap: 1rem;
      margin-bottom: 0.75rem;
    }

    .fire-ring-container {
      position: relative;
      width: 90px;
      height: 90px;
      flex-shrink: 0;
    }

    .fire-ring {
      width: 100%;
      height: 100%;
      transform: rotate(-90deg);
    }

    .fire-ring-bg {
      fill: none;
      stroke: rgba(255, 255, 255, 0.06);
      stroke-width: 8;
    }

    .fire-ring-progress {
      fill: none;
      stroke: url(#fireProgressGradient);
      stroke-width: 8;
      stroke-linecap: round;
      stroke-dasharray: 326.73;
      transition: stroke-dashoffset 1.2s cubic-bezier(0.4, 0, 0.2, 1);
    }

    .fire-ring-label {
      position: absolute;
      inset: 0;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .fire-percent {
      font-family: 'Fraunces', serif;
      font-size: 1.3rem;
      font-weight: 500;
      color: #f5f5f7;
    }

    .fire-hero-stats {
      display: flex;
      flex-direction: column;
      gap: 0.4rem;
      flex: 1;
    }

    .fire-stat {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
    }

    .stat-label {
      font-size: 0.65rem;
      color: #6e6e73;
      text-transform: uppercase;
      letter-spacing: 0.03em;
    }

    .stat-value {
      font-family: 'Fraunces', serif;
      font-size: 1.05rem;
      font-weight: 500;
      color: #34d399;
    }

    .fire-contrib {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 0.75rem;
      padding: 0.5rem 0.8rem;
      background: rgba(16, 185, 129, 0.06);
      border: 1px solid rgba(16, 185, 129, 0.12);
      border-radius: 8px;
    }

    .fire-contrib-item {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 0.1rem;
    }

    .contrib-label {
      font-size: 0.6rem;
      color: #6e6e73;
      text-transform: uppercase;
      letter-spacing: 0.03em;
    }

    .contrib-value {
      font-family: 'Fraunces', serif;
      font-size: 0.9rem;
      font-weight: 500;
      color: #34d399;
    }

    .fire-contrib-divider {
      width: 1px;
      height: 24px;
      background: rgba(255, 255, 255, 0.08);
    }

    .fire-track-badge {
      margin-top: 0.5rem;
      text-align: center;
      font-size: 0.68rem;
      font-weight: 600;
      padding: 0.25rem 0.6rem;
      border-radius: 10px;
      display: inline-block;
      width: 100%;
    }

    .fire-track-badge.on-track {
      background: rgba(52, 211, 153, 0.12);
      color: #34d399;
    }

    .fire-track-badge.off-track {
      background: rgba(212, 168, 83, 0.1);
      color: #d4a853;
    }

    /* Portfolio */
    .portfolio-age-badge {
      margin-left: auto;
      margin-right: 0.4rem;
      font-size: 0.6rem;
      font-weight: 600;
      padding: 0.15rem 0.45rem;
      border-radius: 4px;
      background: rgba(255,255,255,0.06);
      color: rgba(255,255,255,0.5);
      letter-spacing: 0.03em;
    }

    .big-number {
      font-family: 'Fraunces', serif;
      font-size: 1.5rem;
      font-weight: 500;
      color: #f5f5f7;
      letter-spacing: -0.02em;
    }

    .pf-top-row {
      display: flex;
      align-items: baseline;
      gap: 0.75rem;
      flex-wrap: wrap;
      margin-bottom: 0.85rem;
    }

    .pf-return-pills {
      display: flex;
      gap: 0.4rem;
      align-items: center;
    }

    .pf-pill {
      font-size: 0.72rem;
      font-weight: 600;
      padding: 0.2rem 0.5rem;
      border-radius: 6px;
      white-space: nowrap;
    }

    .pf-pill.positive {
      background: rgba(52, 211, 153, 0.1);
      color: #34d399;
    }

    .pf-pill.negative {
      background: rgba(248, 113, 113, 0.1);
      color: #f87171;
    }

    .pf-goal-track {
      margin-bottom: 0.75rem;
    }

    .pf-goal-labels {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 0.35rem;
    }

    .pf-goal-current {
      font-family: 'Fraunces', serif;
      font-size: 0.78rem;
      font-weight: 600;
      color: #34d399;
    }

    .pf-goal-target {
      font-size: 0.68rem;
      color: rgba(255,255,255,0.5);
      display: flex;
      align-items: center;
      gap: 0.3rem;
    }

    .pf-goal-target i {
      font-size: 0.6rem;
      color: #d4a853;
    }

    .pf-goal-bar {
      height: 4px;
      border-radius: 2px;
      background: rgba(255,255,255,0.06);
      overflow: hidden;
      margin-bottom: 0.25rem;
    }

    .pf-goal-fill {
      height: 100%;
      border-radius: 2px;
      background: linear-gradient(90deg, #34d399, #4a7cff);
      transition: width 0.6s ease;
    }

    .pf-goal-pct {
      font-size: 0.6rem;
      color: rgba(255,255,255,0.35);
      letter-spacing: 0.03em;
    }


    .panel-header-link {
      text-decoration: none;
      color: inherit;
    }

    .header-icon-btn {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 26px;
      height: 26px;
      border-radius: 6px;
      background: rgba(255,255,255,0.04);
      border: 1px solid rgba(255,255,255,0.08);
      text-decoration: none;
      color: #a1a1a6;
      font-size: 0.75rem;
      transition: all 0.2s ease;
    }

    .header-icon-btn:hover {
      background: rgba(212, 168, 83, 0.12);
      border-color: rgba(212, 168, 83, 0.3);
      color: #d4a853;
    }

    .panel-link-icon-btn {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 26px;
      height: 26px;
      text-decoration: none;
      color: #6e6e73;
      font-size: 0.75rem;
      transition: color 0.2s ease;
    }

    .panel-link-icon-btn:hover {
      color: #f5f5f7;
    }

    .pf-stats-strip {
      display: flex;
      align-items: center;
      gap: 0;
      padding: 0.55rem 0.65rem;
      background: rgba(255,255,255,0.025);
      border: 1px solid rgba(255,255,255,0.06);
      border-radius: 10px;
    }

    .pf-stat {
      flex: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 0.1rem;
    }

    .pf-stat-val {
      font-family: 'Fraunces', serif;
      font-size: 0.9rem;
      font-weight: 500;
      color: #f5f5f7;
    }

    .pf-stat-lbl {
      font-size: 0.58rem;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: rgba(255,255,255,0.38);
    }

    .pf-stat-divider {
      width: 1px;
      height: 1.6rem;
      background: rgba(255,255,255,0.08);
      flex-shrink: 0;
    }

    .positive { color: #34d399 !important; }
    .negative { color: #f87171 !important; }

    /* Picks */
    .picks-list {
      display: flex;
      flex-direction: column;
      gap: 0.6rem;
    }

    .pick-row {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      padding: 0.5rem 0.7rem;
      border-radius: 10px;
      background: rgba(255, 255, 255, 0.02);
      border: 1px solid rgba(255, 255, 255, 0.04);
    }

    .pick-symbol {
      font-weight: 700;
      font-size: 0.82rem;
      color: #f5f5f7;
      min-width: 70px;
    }

    .pick-score {
      font-size: 0.72rem;
      font-weight: 600;
      color: #d4a853;
      background: rgba(212, 168, 83, 0.1);
      padding: 0.15rem 0.45rem;
      border-radius: 6px;
    }

    .pick-targets {
      margin-left: auto;
      display: flex;
      align-items: center;
      gap: 0.4rem;
      font-size: 0.75rem;
      color: #a1a1a6;
    }

    .target-buy { color: #34d399; }
    .target-sell { color: #4a7cff; }

    .pick-targets i {
      font-size: 0.6rem;
      color: #6e6e73;
    }

    /* Paper Trading */
    .pt-since-badge {
      margin-left: auto;
      margin-right: 0.4rem;
      font-size: 0.6rem;
      font-weight: 600;
      padding: 0.15rem 0.45rem;
      border-radius: 4px;
      background: rgba(255,255,255,0.06);
      color: rgba(255,255,255,0.5);
      letter-spacing: 0.03em;
    }

    .pt-top-row {
      display: flex;
      align-items: baseline;
      gap: 0.75rem;
      flex-wrap: wrap;
      margin-bottom: 0.7rem;
    }

    .pt-pnl-row {
      display: flex;
      gap: 0.4rem;
      margin-bottom: 0.7rem;
    }

    .pt-pnl-item {
      flex: 1;
      display: flex;
      flex-direction: column;
      padding: 0.3rem 0.5rem;
      border-radius: 6px;
      background: rgba(255,255,255,0.03);
      border: 1px solid rgba(255,255,255,0.06);
    }

    .pt-pnl-label {
      font-size: 0.58rem;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: rgba(255,255,255,0.4);
      margin-bottom: 0.05rem;
    }

    .pt-pnl-val {
      font-family: 'Fraunces', serif;
      font-size: 0.82rem;
      font-weight: 500;
      color: #f5f5f7;
    }

    /* News */
    .news-list {
      display: flex;
      flex-direction: row;
      gap: 0.75rem;
      overflow-x: auto;
      overflow-y: hidden;
      scrollbar-width: none;
    }

    .news-list::-webkit-scrollbar { display: none; }

    .news-row {
      flex: 0 0 calc(33.33% - 0.5rem);
      min-width: 200px;
      padding: 0.6rem 0.75rem;
      background: rgba(255, 255, 255, 0.02);
      border-radius: 8px;
      border: 1px solid rgba(255, 255, 255, 0.04);
      text-decoration: none;
      color: inherit;
      display: block;
      transition: background 0.2s ease, border-color 0.2s ease;
    }

    .news-row:hover {
      background: rgba(255, 255, 255, 0.05);
      border-color: rgba(255, 255, 255, 0.1);
    }

    .news-title {
      display: block;
      font-size: 0.78rem;
      font-weight: 500;
      color: #e8e9eb;
      line-height: 1.35;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }

    .news-meta {
      display: block;
      font-size: 0.65rem;
      color: #6e6e73;
      margin-top: 0.2rem;
    }

    /* Settings */
    .panel-paper-wrapper .panel-paper {
      flex: 1.6;
      min-width: 0;
    }

    .panel-settings {
      cursor: default;
      flex: 1;
      min-width: 0;
    }

    .settings-note-badge {
      margin-left: auto;
      font-size: 0.5rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      padding: 0.15rem 0.4rem;
      border-radius: 4px;
      background: rgba(212, 168, 83, 0.12);
      color: #d4a853;
    }

    .settings-list {
      display: flex;
      flex-direction: column;
      gap: 0;
    }

    .setting-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0.5rem 0;
      border-bottom: 1px solid rgba(255,255,255,0.04);
    }

    .setting-row:last-child {
      border-bottom: none;
      padding-bottom: 0;
    }

    .setting-row:first-child {
      padding-top: 0;
    }

    .setting-info {
      display: flex;
      flex-direction: column;
      gap: 0.1rem;
    }

    .setting-label {
      font-size: 0.75rem;
      font-weight: 500;
      color: #e5e5e7;
    }

    .setting-desc {
      font-size: 0.6rem;
      color: rgba(255,255,255,0.3);
      letter-spacing: 0.02em;
    }

    .setting-toggle {
      width: 30px;
      height: 16px;
      border-radius: 8px;
      background: rgba(255, 255, 255, 0.08);
      position: relative;
      transition: all 0.25s ease;
      flex-shrink: 0;
    }

    .setting-toggle::after {
      content: '';
      position: absolute;
      top: 3px;
      left: 3px;
      width: 10px;
      height: 10px;
      border-radius: 50%;
      background: #6e6e73;
      transition: all 0.25s ease;
    }

    .setting-toggle.active {
      background: rgba(52, 211, 153, 0.35);
      box-shadow: 0 0 6px rgba(52, 211, 153, 0.15);
    }

    .setting-toggle.active::after {
      left: 17px;
      background: #34d399;
    }

    /* Empty States */
    .panel-empty {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 0.6rem;
      padding: 2rem 1rem;
      color: #6e6e73;
      text-align: center;
    }

    .panel-empty i {
      font-size: 1.5rem;
      opacity: 0.5;
    }

    .panel-empty span {
      font-size: 0.8rem;
    }

    /* Responsive */
    @media (max-width: 1024px) {
      .dashboard {
        height: auto;
        min-height: calc(100vh - 56px);
        overflow-y: auto;
      }
      .bento-grid {
        grid-template-columns: 1fr 1fr;
      }
      .panel-fire { grid-row: auto; grid-column: 1; }
      .panel-portfolio { grid-row: auto; grid-column: 2; }
      .panel-recs { grid-row: auto; grid-column: 1; }
      .panel-paper-wrapper { grid-row: auto; grid-column: 2; }
      .panel-news { grid-row: auto; grid-column: 1 / -1; }
    }

    @media (max-width: 768px) {
      .dashboard {
        height: auto;
        min-height: calc(100vh - 56px);
        overflow-y: auto;
        padding: 1.25rem 0.75rem 2rem;
      }
      .panel { padding: 1rem; }
      .greeting-text { font-size: 1.4rem; }
      .hero-row { flex-direction: column; align-items: flex-start; margin-bottom: 0.75rem; }
      .bento-grid {
        grid-template-columns: 1fr;
        gap: 0.85rem;
      }
      .panel-fire,
      .panel-portfolio,
      .panel-recs,
      .panel-paper-wrapper,
      .panel-news {
        grid-row: auto;
        grid-column: 1;
      }

      /* FIRE panel mobile */
      .panel-fire .panel-body { justify-content: flex-start; }
      .fire-hero { flex-direction: row; gap: 0.6rem; }
      .fire-ring-container { width: 72px; height: 72px; }
      .fire-percent { font-size: 1rem; }
      .fire-hero-stats { gap: 0.25rem; min-width: 0; }
      .fire-stat { gap: 0.3rem; }
      .stat-label { font-size: 0.6rem; white-space: nowrap; }
      .stat-value { font-size: 0.8rem; white-space: nowrap; text-align: right; }
      .fire-contrib { padding: 0.4rem 0.6rem; gap: 0.5rem; }
      .contrib-value { font-size: 0.82rem; }
      .fire-track-badge { margin-top: 0.4rem; font-size: 0.65rem; }

      /* Portfolio panel mobile */
      .panel-header { flex-wrap: wrap; gap: 0.4rem; margin-bottom: 0.8rem; }
      .portfolio-age-badge { display: none; }
      .header-icon-btn { width: 24px; height: 24px; font-size: 0.7rem; }
      .big-number { font-size: 1.3rem; }
      .pf-return-pills { flex-wrap: wrap; }
      .pf-goal-labels { flex-wrap: wrap; gap: 0.2rem; }
      .pf-goal-target { font-size: 0.62rem; }
      .pf-stats-strip { flex-wrap: wrap; gap: 0.4rem; }
      .pf-stat-divider { display: none; }

      /* Paper + Email */
      .panel-paper-wrapper { flex-direction: column; }

      /* News */
      .news-list {
        flex-direction: column;
        overflow-x: visible;
      }
      .news-row {
        flex: none;
        min-width: unset;
      }
    }

    @keyframes v2-slideUp {
      from { opacity: 0; transform: translateY(12px); }
      to { opacity: 1; transform: translateY(0); }
    }
  `]
})
export class DashboardComponent implements OnInit {
  private auth = inject(AuthService);
  private marketService = inject(MarketService);
  protected dashService = inject(DashboardService);

  readonly fire = this.dashService.fireSummary;
  readonly portfolio = this.dashService.portfolioSummary;
  readonly paper = this.dashService.paperSummary;

  readonly greeting = computed(() => {
    const name = this.auth.userName();
    const hour = new Date().getHours();
    let timeGreeting = 'Good evening';
    if (hour < 12) timeGreeting = 'Good morning';
    else if (hour < 17) timeGreeting = 'Good afternoon';
    return name ? `${timeGreeting}, ${name}` : timeGreeting;
  });

  readonly marketStatusMessage = computed(() => {
    const info = this.marketService.marketInfo();
    const isOpen = this.marketService.isMarketOpen();
    const status = isOpen ? 'Market Open' : 'Market Closed';
    return `${info.flag} ${info.name} \u2022 ${status}`;
  });

  readonly fireRingOffset = computed(() => {
    const circumference = 326.73;
    const progress = this.fire().progressPercent / 100;
    return circumference * (1 - progress);
  });

  readonly fireTimeLeft = computed(() => {
    const years = this.fire().yearsToRetirement;
    const months = this.fire().monthsRemainder;
    if (years === 0 && months === 0) return 'Now';
    const yPart = years > 0 ? `${years} ${years === 1 ? 'Year' : 'Years'}` : '';
    const mPart = months > 0 ? `${months} ${months === 1 ? 'Month' : 'Months'}` : '';
    return [yPart, mPart].filter(Boolean).join(', ');
  });

  readonly fireEncouragement = computed(() => {
    const pct = this.fire().progressPercent;
    if (pct >= 75) return 'Almost there — stay the course';
    if (pct >= 50) return 'Past halfway — momentum is building';
    if (pct >= 25) return 'Great start — keep going';
    return 'Every step counts — you\'ve begun';
  });

  private marketEffect = effect(() => {
    this.marketService.currentMarket();
    this.dashService.loadAll();
  });

  ngOnInit(): void {}

  formatCurrency(value: number, currency: string): string {
    const locale = currency === 'INR' ? 'en-IN' : 'en-US';
    if (value >= 1e7 && currency === 'INR') {
      return `\u20B9${(value / 1e7).toFixed(1)} Cr`;
    }
    if (value >= 1e6) {
      const symbol = currency === 'INR' ? '\u20B9' : '$';
      return `${symbol}${(value / 1e6).toFixed(1)}M`;
    }
    return new Intl.NumberFormat(locale, {
      style: 'currency', currency, minimumFractionDigits: 0, maximumFractionDigits: 0,
    }).format(value);
  }

  formatFull(value: number, currency: string): string {
    const locale = currency === 'INR' ? 'en-IN' : 'en-US';
    return new Intl.NumberFormat(locale, {
      style: 'currency', currency, minimumFractionDigits: 0, maximumFractionDigits: 0,
    }).format(value);
  }

  formatCompact(value: number, currency: string): string {
    const symbol = currency === 'INR' ? '\u20B9' : '$';
    const abs = Math.abs(value);
    const sign = value < 0 ? '-' : '';
    if (abs >= 1e7 && currency === 'INR') return `${sign}${symbol}${(abs / 1e7).toFixed(1)}Cr`;
    if (abs >= 1e5 && currency === 'INR') return `${sign}${symbol}${(abs / 1e5).toFixed(1)}L`;
    if (abs >= 1e6) return `${sign}${symbol}${(abs / 1e6).toFixed(1)}M`;
    if (abs >= 1e3) return `${sign}${symbol}${(abs / 1e3).toFixed(1)}K`;
    return `${sign}${symbol}${abs.toFixed(0)}`;
  }
}
