import { ChangeDetectionStrategy, Component, computed, effect, inject, OnInit, signal } from '@angular/core';
import { CommonModule, DecimalPipe } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';

import { ButtonModule } from 'primeng/button';
import { ProgressSpinnerModule } from 'primeng/progressspinner';
import { TooltipModule } from 'primeng/tooltip';
import { TagModule } from 'primeng/tag';

import { MarketService } from '../../core/services';
import {
  buildRecommendationSimulation,
  getRecommendationInvestmentRange,
  getScoreInvestmentFormulaLabel,
} from '../../core/utils/paper-trading-calculations';
import type { RecommendationSimulatedTrade } from '../../core/utils/paper-trading-calculations';

interface DailyPick {
  id: number;
  market: string;
  pick_date: string;
  symbol: string;
  name: string;
  sector: string | null;
  market_cap: number | null;
  price: number;
  previous_close: number | null;
  pre_market_price: number | null;
  gap_percent: number | null;
  change_percent: number | null;
  volume: number | null;
  avg_volume: number | null;
  relative_volume: number | null;
  buy_price: number;
  sell_price: number;
  stop_loss: number;
  score: number;
  priority: string;
  signals: string[];
  rsi: number | null;
  beta: number | null;
  outcome: 'hit-target' | 'hit-sl' | 'exit-at-close' | 'no-trigger' | null;
  actual_high: number | null;
  actual_low: number | null;
  actual_close: number | null;
  pnl_percent: number | null;
}

interface DateGroup {
  date: string;
  displayDate: string;
  picks: DailyPick[];
  highCount: number;
  mediumCount: number;
  hitTargetCount: number;
  hitStopLossCount: number;
  pendingCount: number;
}

interface MonthOption {
  label: string;
  value: string;
}

type DisplayOutcome = 'hit-target' | 'hit-sl' | 'no-trigger' | 'pending';
type RecommendationsTab = 'recommendations' | 'paper-results';

@Component({
  selector: 'app-recommendations',
  imports: [
    CommonModule,
    DecimalPipe,
    ButtonModule,
    ProgressSpinnerModule,
    TooltipModule,
    TagModule,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="trades-page">
      <header class="trades-hero">
        <div class="hero-copy">
          <span class="eyebrow">Trades</span>
          <div class="hero-title-row">
            <h1>Day Trade Recommendations</h1>
            <p>Review daily setups, outcomes, and automated paper results.</p>
          </div>
        </div>
        <div class="hero-actions">
          <span class="market-chip">{{ marketService.marketInfo().name }}</span>
          <div class="month-nav">
            <button pButton icon="pi pi-chevron-left" class="p-button-text p-button-sm"
              (click)="prevMonth()" [pTooltip]="'Previous month'"></button>
            <span class="month-label">{{ selectedMonthLabel() }}</span>
            <button pButton icon="pi pi-chevron-right" class="p-button-text p-button-sm"
              (click)="nextMonth()" [disabled]="isCurrentMonth()"
              [pTooltip]="'Next month'"></button>
          </div>
        </div>
      </header>

      <div class="reco-tabs" role="tablist" aria-label="Recommendation views">
        <button
          type="button"
          class="reco-tab"
          [class.active]="activeTab() === 'recommendations'"
          (click)="activeTab.set('recommendations')">
          Recommendations
        </button>
        <button
          type="button"
          class="reco-tab"
          [class.active]="activeTab() === 'paper-results'"
          (click)="activeTab.set('paper-results')">
          Automated Paper Results
        </button>
      </div>

      @if (activeTab() === 'recommendations') {
        @if (!loading() && dateGroups().length > 0) {
          <section class="summary-grid" aria-label="Recommendation summary">
            <div class="summary-card">
              <span>Total Picks</span>
              <strong>{{ totalPicks() }}</strong>
            </div>
            <div class="summary-card positive">
              <span>Target Hit</span>
              <strong>{{ totalTargetHit() }}</strong>
            </div>
            <div class="summary-card positive">
              <span>Closed Profit</span>
              <strong>{{ totalClosedProfitable() }}</strong>
            </div>
            <div class="summary-card negative">
              <span>Closed Loss</span>
              <strong>{{ totalClosedAtLoss() }}</strong>
            </div>
            <div class="summary-card negative">
              <span>Stopped Out</span>
              <strong>{{ totalStoppedOut() }}</strong>
            </div>
            <div class="summary-card pending">
              <span>Not Traded</span>
              <strong>{{ totalNotTraded() }}</strong>
            </div>
            <div class="summary-card pending">
              <span>Pending</span>
              <strong>{{ totalPending() }}</strong>
            </div>
            <div class="summary-card" [class.positive]="winRate() >= 50" [class.negative]="winRate() < 50 && winRate() >= 0">
              <span>Win Rate</span>
              <strong>{{ winRate() >= 0 ? (winRate() | number:'1.0-0') + '%' : '--' }}</strong>
            </div>
          </section>
        }

        @if (loading()) {
          <div class="loading-card">
            <p-progressSpinner strokeWidth="3" animationDuration="1s"></p-progressSpinner>
            <span>Loading recommendations...</span>
          </div>
        } @else if (dateGroups().length === 0) {
          <div class="empty-state">
            <i class="pi pi-inbox"></i>
            <strong>No recommendations found</strong>
            <span>No day trade picks for {{ marketService.marketInfo().name }} in {{ selectedMonthLabel() }}.</span>
          </div>
        } @else {
          <section class="date-groups">
            @for (group of dateGroups(); track group.date) {
              <article class="trades-panel">
                <div class="panel-heading">
                  <div>
                    <span class="eyebrow">Daily Setups</span>
                    <h2>{{ group.displayDate }}</h2>
                  </div>
                  <div class="date-stats">
                    @if (group.picks.length > 0) {
                      <span class="stat-badge neutral">{{ group.picks.length }} pick{{ group.picks.length > 1 ? 's' : '' }}</span>
                    } @else {
                      <span class="stat-badge neutral muted">No recommendations</span>
                    }
                    @if (group.hitTargetCount > 0) {
                      <span class="stat-badge positive"><i class="pi pi-check-circle"></i>{{ group.hitTargetCount }} profitable</span>
                    }
                    @if (group.hitStopLossCount > 0) {
                      <span class="stat-badge negative"><i class="pi pi-times-circle"></i>{{ group.hitStopLossCount }} stopped out</span>
                    }
                    @if (group.pendingCount > 0) {
                      <span class="stat-badge pending"><i class="pi pi-clock"></i>{{ group.pendingCount }} pending</span>
                    }
                  </div>
                </div>

                @if (group.picks.length > 0) {
                  <div class="table-wrap">
                    <table class="picks-table">
                      <thead>
                        <tr>
                          <th class="col-score">Score</th>
                          <th class="col-stock">Stock</th>
                          <th class="col-price numeric">Rec. Price</th>
                          <th class="col-targets">Buy / Sell / Stop</th>
                          <th class="col-outcome">Outcome</th>
                          <th class="col-signals">Signals</th>
                        </tr>
                      </thead>
                      <tbody>
                        @for (pick of group.picks; track pick.id) {
                          <tr class="pick-row" [class.row-hit-target]="getOutcome(pick) === 'hit-target'" [class.row-hit-sl]="getOutcome(pick) === 'hit-sl'">
                            <td class="col-score">
                              <span class="score-badge" [class.high]="pick.priority === 'High'" [class.medium]="pick.priority === 'Medium'">
                                {{ pick.score }}
                              </span>
                            </td>
                            <td class="col-stock">
                              <div class="stock-identity">
                                <div class="stock-symbol-row">
                                  <button type="button" class="stock-symbol" (click)="navigateToStock(pick.symbol)">{{ formatSymbol(pick.symbol) }}</button>
                                  @if (pick.market === 'US') {
                                    <a class="rh-icon"
                                      [href]="'https://robinhood.com/stocks/' + formatSymbol(pick.symbol) + '?source=search'"
                                      target="_blank" rel="noopener noreferrer"
                                      (click)="$event.stopPropagation()"
                                      pTooltip="Trade on Robinhood" tooltipPosition="top">
                                      <img src="robinhood.png" alt="RH" />
                                    </a>
                                  }
                                  <a class="detail-icon-link"
                                    [href]="'/stock/' + pick.symbol"
                                    target="_blank"
                                    (click)="$event.stopPropagation()"
                                    pTooltip="Stock details" tooltipPosition="top">
                                    <img src="stock-detail.svg" alt="Details" />
                                  </a>
                                </div>
                                <button type="button" class="stock-name" (click)="navigateToStock(pick.symbol)">{{ pick.name | slice:0:30 }}</button>
                                <span class="stock-meta">{{ pick.sector }}</span>
                              </div>
                            </td>
                            <td class="col-price numeric">
                              <span class="price-stack">
                                {{ currencySymbol() }}{{ pick.price | number:'1.2-2' }}
                                @if (pick.gap_percent != null) {
                                  <small>Gap {{ pick.gap_percent >= 0 ? '+' : '' }}{{ pick.gap_percent | number:'1.1-1' }}%</small>
                                } @else if (pick.change_percent != null) {
                                  <small>{{ pick.change_percent >= 0 ? '+' : '' }}{{ pick.change_percent | number:'1.1-1' }}%</small>
                                }
                              </span>
                            </td>
                            <td class="col-targets">
                              <div class="target-grid">
                                <span class="target buy">Buy {{ currencySymbol() }}{{ pick.buy_price | number:'1.2-2' }}</span>
                                <span class="target sell">Sell {{ currencySymbol() }}{{ pick.sell_price | number:'1.2-2' }} <small>+{{ getTargetPct(pick) | number:'1.1-1' }}%</small></span>
                                <span class="target stop">Stop {{ currencySymbol() }}{{ pick.stop_loss | number:'1.2-2' }} <small>-{{ getStopPct(pick) | number:'1.1-1' }}%</small></span>
                              </div>
                            </td>
                            <td class="col-outcome">
                              <span class="outcome-badge" [ngClass]="getOutcome(pick)">
                                <i [class]="getOutcomeIcon(pick)"></i>
                                {{ getOutcomeLabel(pick) }}
                              </span>
                              @if (shouldShowPnl(pick)) {
                                <div class="outcome-pnl">
                                  {{ getOutcome(pick) === 'hit-target' ? '+' : '' }}{{ getPnlPercent(pick) | number:'1.1-1' }}%
                                </div>
                              }
                              @if (pick.actual_high) {
                                <div class="outcome-high">High {{ currencySymbol() }}{{ pick.actual_high | number:'1.2-2' }}</div>
                              }
                            </td>
                            <td class="col-signals">
                              <div class="signal-list">
                                @for (s of pick.signals | slice:0:3; track s) {
                                  <span class="signal-chip">{{ s }}</span>
                                }
                                @if (getPickTarget(pick)) {
                                  <span class="signal-chip analyst-chip" [ngClass]="getPickTargetClass(pick)">{{ getPickTarget(pick) }}</span>
                                }
                                @if (getPickEarnings(pick)) {
                                  <span class="signal-chip earnings-chip">{{ getPickEarnings(pick) }}</span>
                                }
                              </div>
                              <div class="tech-meta">
                                @if (pick.relative_volume) {
                                  <span>RVOL {{ pick.relative_volume | number:'1.1-1' }}x</span>
                                }
                                @if (pick.rsi) {
                                  <span>RSI {{ pick.rsi | number:'1.0-0' }}</span>
                                }
                              </div>
                            </td>
                          </tr>
                        }
                      </tbody>
                    </table>
                  </div>
                } @else {
                  <div class="empty-state compact">
                    <strong>No recommendations</strong>
                    <span>No qualifying setups were generated for this trading day.</span>
                  </div>
                }
              </article>
            }
          </section>
        }
      } @else {
        @if (loading()) {
          <div class="loading-card">
            <p-progressSpinner strokeWidth="3" animationDuration="1s"></p-progressSpinner>
            <span>Loading paper results...</span>
          </div>
        } @else if (picks().length === 0) {
          <div class="empty-state">
            <i class="pi pi-chart-line"></i>
            <strong>No paper results found</strong>
            <span>No evaluated recommendations are available for {{ selectedMonthLabel() }}.</span>
          </div>
        } @else {
          <section class="paper-results">
            <div class="formula-card">
              <div>
                <span class="eyebrow">Score-to-Investment Formula</span>
                <h2>{{ currencySymbol() }}{{ investmentRange().min | number:'1.0-0' }} to {{ currencySymbol() }}{{ investmentRange().max | number:'1.0-0' }} per triggered pick</h2>
                <p>{{ scoreFormula() }}. Scores are clamped from 0 to 100, and no cash is deployed when the buy trigger is not reached.</p>
              </div>
            </div>

            <section class="summary-grid paper-summary" aria-label="Automated paper result summary">
              <div class="summary-card">
                <span>Triggered Trades</span>
                <strong>{{ paperSimulation().summary.triggeredTrades }}</strong>
              </div>
              <div class="summary-card">
                <span>Capital Deployed</span>
                <strong>{{ currencySymbol() }}{{ paperSimulation().summary.totalDeployedInvestment | number:'1.2-2' }}</strong>
              </div>
              <div class="summary-card" [class.positive]="paperSimulation().summary.totalPnl > 0" [class.negative]="paperSimulation().summary.totalPnl < 0">
                <span>Realized P/L</span>
                <strong>{{ paperSimulation().summary.totalPnl >= 0 ? '+' : '' }}{{ currencySymbol() }}{{ paperSimulation().summary.totalPnl | number:'1.2-2' }}</strong>
              </div>
              <div class="summary-card" [class.positive]="paperSimulation().summary.returnPercent > 0" [class.negative]="paperSimulation().summary.returnPercent < 0">
                <span>Monthly Return</span>
                <strong>{{ paperSimulation().summary.returnPercent >= 0 ? '+' : '' }}{{ paperSimulation().summary.returnPercent | number:'1.1-1' }}%</strong>
              </div>
              <div class="summary-card">
                <span>Win Rate</span>
                <strong>{{ paperSimulation().summary.winRate | number:'1.0-0' }}%</strong>
              </div>
              <div class="summary-card pending">
                <span>No Trigger</span>
                <strong>{{ paperSimulation().summary.notTradedCount }}</strong>
              </div>
            </section>

            <section class="trades-panel paper-table-shell">
              <div class="panel-heading">
                <div>
                  <span class="eyebrow">Automated Paper Ledger</span>
                  <h2>{{ paperSimulation().trades.length }} simulated trade{{ paperSimulation().trades.length === 1 ? '' : 's' }}</h2>
                </div>
              </div>
              <div class="table-wrap">
                <table class="picks-table paper-table">
                  <thead>
                    <tr>
                      <th class="col-stock">Stock</th>
                      <th>Score</th>
                      <th class="numeric">Shares</th>
                      <th class="numeric">Planned</th>
                      <th class="numeric">Deployed</th>
                      <th>Bought</th>
                      <th>Sold</th>
                      <th class="numeric">Entry</th>
                      <th>Exit</th>
                      <th>Exit Reason</th>
                      <th>P/L</th>
                    </tr>
                  </thead>
                  <tbody>
                    @for (trade of paperSimulation().trades; track getTradeKey(trade)) {
                      <tr [ngClass]="'paper-row-' + trade.resultTone">
                        <td class="col-stock">
                          <div class="stock-identity">
                            <button type="button" class="stock-symbol" (click)="navigateToStock(trade.symbol)">{{ formatSymbol(trade.symbol) }}</button>
                            <span class="stock-name">{{ trade.name | slice:0:28 }}</span>
                          </div>
                        </td>
                        <td><span class="score-badge">{{ trade.score }}</span></td>
                        <td class="numeric">{{ trade.sharesBought | number:'1.0-6' }}</td>
                        <td class="planned-cell numeric">
                          <span>{{ currencySymbol() }}{{ trade.plannedInvestment | number:'1.2-2' }}</span>
                          <button
                            type="button"
                            class="planned-info-button"
                            [attr.aria-label]="'Show planned investment calculation for ' + formatSymbol(trade.symbol)"
                            [attr.aria-expanded]="activePlanExplanation() === getTradeKey(trade)"
                            (click)="togglePlanExplanation(trade)">
                            <i class="pi pi-info-circle"></i>
                          </button>
                          @if (activePlanExplanation() === getTradeKey(trade)) {
                            <div class="planned-explanation">
                              {{ getPlannedInvestmentExplanation(trade) }}
                            </div>
                          }
                        </td>
                        <td class="numeric">{{ currencySymbol() }}{{ trade.deployedInvestment | number:'1.2-2' }}</td>
                        <td class="date-time-cell">{{ trade.boughtAtLabel }}</td>
                        <td class="date-time-cell">{{ trade.soldAtLabel }}</td>
                        <td class="numeric">{{ currencySymbol() }}{{ trade.entryPrice | number:'1.2-2' }}</td>
                        <td class="exit-price-cell">
                          <span class="outcome-badge compact detailed exit-price-badge" [ngClass]="trade.resultTone">
                            @if (trade.exitPrice != null) {
                              {{ currencySymbol() }}{{ trade.exitPrice | number:'1.2-2' }}
                            } @else {
                              No exit
                            }
                          </span>
                        </td>
                        <td class="exit-reason-cell">
                          <span class="outcome-badge compact detailed" [ngClass]="trade.resultTone">{{ trade.detailedExitReason }}</span>
                        </td>
                        <td class="paper-pnl">
                          <span class="outcome-badge compact detailed pnl-badge" [ngClass]="trade.resultTone">
                            <span>{{ trade.pnlAmount >= 0 ? '+' : '' }}{{ currencySymbol() }}{{ trade.pnlAmount | number:'1.2-2' }}</span>
                            <small>{{ trade.pnlPercent >= 0 ? '+' : '' }}{{ trade.pnlPercent | number:'1.1-1' }}%</small>
                          </span>
                        </td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
            </section>
          </section>
        }
      }
    </div>
  `,
  styles: [`
    .reco-container {
      padding: 1.25rem 1.5rem;
      max-width: 1400px;
    }

    .page-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 1.25rem;
      flex-wrap: wrap;
      gap: 1rem;
    }

    .header-left h1 {
      font-size: 1.35rem;
      font-weight: 700;
      margin: 0;
      color: var(--text-color);
      display: flex;
      align-items: center;
      gap: 0.5rem;

      i { color: var(--primary-color); }
    }

    .subtitle {
      font-size: 0.8rem;
      color: var(--text-color-secondary);
    }

    .reco-tabs {
      display: inline-flex;
      gap: 0.25rem;
      margin-bottom: 1rem;
      padding: 0.25rem;
      background: var(--surface-card);
      border: 1px solid var(--surface-border);
      border-radius: 999px;
    }

    .reco-tab {
      border: 0;
      background: transparent;
      color: var(--text-color-secondary);
      border-radius: 999px;
      padding: 0.55rem 1rem;
      font-weight: 700;
      font-size: 0.82rem;
      cursor: pointer;
      transition: all 0.15s ease;

      &.active {
        background: var(--primary-color);
        color: var(--primary-color-text);
        box-shadow: 0 6px 18px rgba(59, 130, 246, 0.25);
      }

      &:hover:not(.active) {
        color: var(--text-color);
        background: var(--surface-hover);
      }
    }

    .month-nav {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      background: var(--surface-card);
      border: 1px solid var(--surface-border);
      border-radius: 8px;
      padding: 0.25rem 0.5rem;
    }

    .month-label {
      font-weight: 600;
      font-size: 0.9rem;
      min-width: 130px;
      text-align: center;
      color: var(--text-color);
    }

    /* Summary Strip */
    .summary-strip {
      display: flex;
      gap: 0.75rem;
      margin-bottom: 1.5rem;
      flex-wrap: wrap;
    }

    .summary-card {
      flex: 1;
      min-width: 100px;
      background: var(--surface-card);
      border: 1px solid var(--surface-border);
      border-radius: 10px;
      padding: 0.85rem 1rem;
      text-align: center;
    }

    .summary-value {
      font-size: 1.5rem;
      font-weight: 800;
      font-family: 'JetBrains Mono', monospace;
      color: var(--text-color);
    }

    .summary-label {
      font-size: 0.7rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.03em;
      color: var(--text-color-secondary);
      margin-top: 0.15rem;
    }

    .summary-card.high .summary-value { color: var(--orange-400, #fb923c); }
    .summary-card.hit-target .summary-value { color: var(--green-400, #4ade80); }
    .summary-card.hit-sl .summary-value { color: var(--red-400, #f87171); }
    .summary-card.pending .summary-value { color: var(--blue-400, #60a5fa); }
    .summary-card.positive .summary-value { color: var(--green-400, #4ade80); }
    .summary-card.negative .summary-value { color: var(--red-400, #f87171); }

    .paper-results {
      display: flex;
      flex-direction: column;
      gap: 1rem;
    }

    .formula-card {
      background: linear-gradient(135deg, rgba(59, 130, 246, 0.12), rgba(16, 185, 129, 0.08));
      border: 1px solid rgba(59, 130, 246, 0.25);
      border-radius: 14px;
      padding: 1rem 1.1rem;

      h2 {
        margin: 0.25rem 0;
        font-size: 1.05rem;
        color: var(--text-color);
      }

      p {
        margin: 0;
        color: var(--text-color-secondary);
        font-size: 0.86rem;
        line-height: 1.45;
      }
    }

    .eyebrow {
      color: var(--primary-color);
      font-size: 0.72rem;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.08em;
    }

    .paper-summary {
      margin-bottom: 0;
    }

    .paper-table {
      th,
      td {
        white-space: nowrap;
      }
    }

    .outcome-badge.compact {
      padding: 0.25rem 0.5rem;
      color: var(--text-color-secondary);
      background: var(--surface-hover);
    }

    .outcome-badge.compact.detailed {
      font-weight: 800;
      letter-spacing: 0.01em;
    }

    .outcome-badge.compact.detailed.positive {
      color: var(--green-400, #4ade80);
      background: rgba(34, 197, 94, 0.14);
    }

    .outcome-badge.compact.detailed.negative {
      color: var(--red-400, #f87171);
      background: rgba(239, 68, 68, 0.14);
    }

    .outcome-badge.compact.detailed.neutral {
      color: var(--blue-300, #93c5fd);
      background: rgba(59, 130, 246, 0.12);
    }

    .outcome-badge.compact.detailed.pending {
      color: var(--yellow-300, #fde047);
      background: rgba(234, 179, 8, 0.14);
    }

    .date-time-cell,
    .exit-price-cell,
    .exit-reason-cell {
      min-width: 150px;
      max-width: 190px;
      white-space: normal !important;
      line-height: 1.35;
      color: var(--text-color-secondary);
    }

    .planned-cell {
      position: relative;
      min-width: 145px;
    }

    .planned-info-button {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      margin-left: 0.35rem;
      width: 1.15rem;
      height: 1.15rem;
      border: 1px solid rgba(96, 165, 250, 0.35);
      border-radius: 999px;
      background: rgba(59, 130, 246, 0.12);
      color: var(--blue-300, #93c5fd);
      cursor: pointer;
      vertical-align: middle;

      i {
        font-size: 0.75rem;
      }

      &:hover,
      &:focus-visible {
        background: rgba(59, 130, 246, 0.2);
        color: var(--blue-200, #bfdbfe);
        outline: none;
      }
    }

    .planned-explanation {
      margin-top: 0.45rem;
      max-width: 260px;
      white-space: normal;
      color: var(--text-color-secondary);
      background: rgba(15, 23, 42, 0.68);
      border: 1px solid var(--surface-border);
      border-radius: 8px;
      padding: 0.5rem 0.6rem;
      font-size: 0.74rem;
      line-height: 1.35;
    }

    .paper-pnl {
      font-weight: 700;
    }

    .pnl-badge {
      display: inline-flex;
      flex-direction: column;
      align-items: flex-start;
      gap: 0.12rem;

      small {
        color: inherit;
        opacity: 0.82;
        font-size: 0.72rem;
      }
    }

    /* Loading */
    .loading-container {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 1rem;
      padding: 4rem 0;
      color: var(--text-color-secondary);
    }

    /* Empty state */
    .empty-state {
      text-align: center;
      padding: 4rem 1rem;
      color: var(--text-color-secondary);

      i { font-size: 3rem; margin-bottom: 1rem; opacity: 0.4; }
      h3 { margin: 0.5rem 0; color: var(--text-color); }
      p { margin: 0; font-size: 0.85rem; }
    }

    /* Date Groups */
    .date-group {
      margin-bottom: 1.5rem;
    }

    .date-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 0.6rem 0;
      border-bottom: 2px solid var(--surface-border);
      margin-bottom: 0;
      flex-wrap: wrap;
      gap: 0.5rem;
    }

    .date-title {
      display: flex;
      align-items: baseline;
      gap: 0.75rem;
    }

    .date-text {
      font-size: 1rem;
      font-weight: 700;
      color: var(--text-color);
    }

    .pick-count {
      font-size: 0.75rem;
      color: var(--text-color-secondary);
    }

    .pick-count.no-picks {
      color: #64748b;
      font-style: italic;
    }

    .date-stats {
      display: flex;
      gap: 0.75rem;
    }

    .stat-badge {
      font-size: 0.72rem;
      font-weight: 600;
      display: flex;
      align-items: center;
      gap: 0.25rem;
    }

    .stat-badge.hit-target { color: var(--green-400, #4ade80); }
    .stat-badge.hit-sl { color: var(--red-400, #f87171); }
    .stat-badge.pending { color: var(--blue-400, #60a5fa); }

    /* Picks Table */
    .picks-table-wrap {
      overflow-x: auto;
    }

    .picks-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 0.82rem;
      table-layout: fixed;
    }

    .col-score    { width: 65px; padding-right: 16px !important; }
    .col-stock    { width: 200px; padding-right: 20px !important; }
    .col-price    { width: 120px; padding-right: 20px !important; }
    .col-targets  { width: 190px; padding-right: 24px !important; }
    .col-outcome  { width: 150px; text-align: center; padding-right: 20px !important; }
    .col-signals  { }

    .picks-table thead th {
      padding: 0.6rem 0.75rem;
      text-align: left;
      font-size: 0.7rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      color: var(--text-color-secondary);
      background: var(--surface-hover, var(--surface-100));
      white-space: nowrap;
    }

    .picks-table tbody tr {
      border-bottom: 1px solid var(--surface-border);
      transition: background 0.15s;
    }

    .picks-table tbody tr:hover {
      background: var(--surface-hover, var(--surface-50));
    }

    .picks-table td {
      padding: 0.65rem 0.75rem;
      vertical-align: top;
    }

    .row-hit-target {
      background: rgba(74, 222, 128, 0.04);
    }

    .row-hit-sl {
      background: rgba(248, 113, 113, 0.04);
    }

    /* Score badge */
    .score-badge {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 36px;
      height: 36px;
      border-radius: 8px;
      font-weight: 800;
      font-size: 0.85rem;
      font-family: 'JetBrains Mono', monospace;
    }

    .score-badge.high {
      background: var(--green-400, #4ade80);
      color: #0f172a;
    }

    .score-badge.medium {
      background: var(--orange-400, #fbbf24);
      color: #0f172a;
    }

    /* Stock cell */
    .col-stock { cursor: pointer; }

    .stock-symbol-row {
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .stock-symbol {
      font-weight: 700;
      color: var(--text-color);
      font-size: 0.85rem;
      cursor: pointer;
    }

    .stock-symbol:hover { color: #3b82f6; }

    .rh-icon, .detail-icon-link {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 20px;
      height: 20px;
      border-radius: 4px;
      overflow: hidden;
      transition: transform 0.15s, box-shadow 0.2s;
    }

    .rh-icon img, .detail-icon-link img {
      width: 20px;
      height: 20px;
      object-fit: cover;
      display: block;
    }

    .rh-icon:hover { transform: scale(1.1); box-shadow: 0 0 6px rgba(192, 255, 0, 0.4); }
    .detail-icon-link:hover { transform: scale(1.1); box-shadow: 0 0 6px rgba(99, 102, 241, 0.5); }

    .stock-name {
      font-size: 0.72rem;
      color: var(--text-color-secondary);
      margin-top: 1px;
    }

    .stock-meta {
      font-size: 0.65rem;
      color: var(--text-color-secondary);
      opacity: 0.7;
    }

    /* Price */
    .price-value {
      font-weight: 600;
      font-family: 'JetBrains Mono', monospace;
      color: var(--text-color);
    }

    .price-sub {
      font-size: 0.72rem;
      color: var(--text-color-secondary);
    }

    /* Targets */
    .target {
      font-family: 'JetBrains Mono', monospace;
      font-size: 0.78rem;
      line-height: 1.5;
    }

    .target.buy { color: var(--green-400, #4ade80); }
    .target.sell { color: var(--red-400, #f87171); }
    .target.stop { color: var(--orange-400, #fbbf24); }
    .outcome-high {
      font-size: 0.7rem;
      color: var(--text-color-secondary);
      margin-top: 2px;
      opacity: 0.7;
    }

    .target-pct { font-size: 0.7rem; opacity: 0.7; }
    .target-pct.positive { color: var(--green-400, #4ade80); }
    .target-pct.negative { color: var(--red-400, #f87171); }

    /* Outcome */
    .outcome-badge {
      display: inline-flex;
      align-items: center;
      gap: 0.3rem;
      padding: 0.25rem 0.6rem;
      border-radius: 6px;
      font-size: 0.72rem;
      font-weight: 600;
    }

    .outcome-badge.hit-target {
      background: rgba(74, 222, 128, 0.15);
      color: var(--green-400, #4ade80);
    }

    .outcome-badge.hit-sl {
      background: rgba(248, 113, 113, 0.15);
      color: var(--red-400, #f87171);
    }

    .outcome-badge.pending {
      background: rgba(96, 165, 250, 0.12);
      color: var(--blue-400, #60a5fa);
    }

    .outcome-badge.no-trigger {
      background: rgba(148, 163, 184, 0.14);
      color: var(--text-color-secondary);
    }

    .outcome-pnl {
      font-size: 0.75rem;
      font-weight: 700;
      font-family: 'JetBrains Mono', monospace;
      margin-top: 0.2rem;
    }

    /* Signals */
    .signal-list {
      display: flex;
      flex-wrap: wrap;
      gap: 0.3rem;
    }

    .signal-chip {
      display: inline-block;
      padding: 0.15rem 0.4rem;
      border-radius: 4px;
      font-size: 0.65rem;
      background: var(--surface-hover, var(--surface-100));
      color: var(--text-color-secondary);
      white-space: nowrap;
    }

    .signal-chip.analyst-chip {
      background: rgba(59, 130, 246, 0.1);
      color: #93c5fd;
      &.positive { color: #34d399; background: rgba(52, 211, 153, 0.1); }
      &.negative { color: #f87171; background: rgba(248, 113, 113, 0.1); }
    }

    .signal-chip.earnings-chip {
      background: rgba(251, 191, 36, 0.1);
      color: #fbbf24;
    }

    .tech-meta {
      font-size: 0.65rem;
      color: var(--text-color-secondary);
      opacity: 0.7;
      margin-top: 0.3rem;
    }

    /* Responsive */
    @media (max-width: 900px) {
      .reco-container { padding: 1rem; }
      .col-signals { display: none; }
      .summary-strip { gap: 0.4rem; flex-wrap: wrap; }
      .summary-card { min-width: 70px; padding: 0.6rem; }
      .summary-value { font-size: 1.15rem; }
    }

    @media (max-width: 768px) {
      .reco-container { padding: 0.75rem; }
      .picks-table-wrap { overflow-x: auto; -webkit-overflow-scrolling: touch; }
      .picks-table { min-width: 700px; table-layout: auto; }
      .summary-strip { gap: 0.35rem; }
      .summary-card { min-width: 55px; padding: 0.5rem; }
      .summary-value { font-size: 1rem; }
      .summary-label { font-size: 0.55rem; }
      .col-price { display: none; }
      .date-header { flex-direction: column; gap: 0.4rem; }
      .page-header h1 { font-size: 1.1rem; }
      .month-nav .month-label { font-size: 0.85rem; }
    }

    @media (max-width: 480px) {
      .reco-container { padding: 0.5rem; }
      .picks-table { font-size: 0.7rem; min-width: 550px; }
      .col-outcome .outcome-badge { padding: 0.15rem 0.35rem; font-size: 0.6rem; }
      .score-badge { width: 30px; height: 30px; font-size: 0.75rem; }
      .summary-card { min-width: 45px; }
      .summary-value { font-size: 0.9rem; }
    }

    /* Watchlists/Paper-style Trades redesign */
    .trades-page {
      min-height: calc(100vh - 56px);
      padding: 1.25rem;
      display: flex;
      flex-direction: column;
      gap: 0.9rem;
      background: linear-gradient(180deg, rgba(15, 23, 42, 0.16), transparent 34%);
    }

    .trades-hero,
    .reco-tabs,
    .summary-card,
    .trades-panel,
    .formula-card,
    .loading-card,
    .empty-state {
      border: 1px solid rgba(148, 163, 184, 0.14);
      background: rgba(15, 23, 42, 0.58);
    }

    .trades-hero {
      display: flex;
      align-items: flex-end;
      justify-content: space-between;
      gap: 1rem;
      padding: 1rem 1.1rem;
      border-radius: 18px;
    }

    .hero-copy {
      min-width: 0;
    }

    .hero-title-row {
      display: flex;
      align-items: baseline;
      gap: 0.7rem;
      flex-wrap: wrap;
    }

    .hero-title-row h1 {
      margin: 0.1rem 0 0.2rem;
      color: #f8fafc;
      font-size: clamp(1.45rem, 2.8vw, 2.15rem);
      line-height: 1;
      letter-spacing: -0.045em;
    }

    .hero-title-row p {
      margin: 0;
      color: #94a3b8;
      font-size: 0.9rem;
    }

    .hero-actions {
      display: flex;
      align-items: center;
      justify-content: flex-end;
      gap: 0.55rem;
      flex-wrap: wrap;
    }

    .eyebrow {
      display: inline-block;
      color: #38bdf8;
      font-size: 0.7rem;
      font-weight: 900;
      letter-spacing: 0.14em;
      text-transform: uppercase;
    }

    .market-chip {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: fit-content;
      border: 1px solid rgba(125, 211, 252, 0.18);
      border-radius: 999px;
      background: rgba(14, 116, 144, 0.16);
      color: #bae6fd;
      font-size: 0.7rem;
      font-weight: 800;
      letter-spacing: 0.04em;
      padding: 0.32rem 0.7rem;
      white-space: nowrap;
    }

    .month-nav {
      display: inline-flex;
      align-items: center;
      gap: 0.4rem;
      border: 1px solid rgba(148, 163, 184, 0.16);
      border-radius: 999px;
      background: rgba(15, 23, 42, 0.58);
      padding: 0.25rem 0.45rem;
    }

    .month-label {
      min-width: 8.4rem;
      color: #f8fafc;
      font-size: 0.82rem;
      font-weight: 800;
      text-align: center;
      white-space: nowrap;
    }

    :host ::ng-deep .month-nav .p-button {
      width: 1.85rem;
      height: 1.85rem;
      padding: 0;
      border-radius: 999px;
      color: #94a3b8;
    }

    .reco-tabs {
      width: fit-content;
      display: inline-flex;
      gap: 0.3rem;
      padding: 0.3rem;
      border-radius: 999px;
      background: rgba(15, 23, 42, 0.56);
    }

    .reco-tab {
      border: 0;
      border-radius: 999px;
      background: transparent;
      color: #94a3b8;
      padding: 0.62rem 1rem;
      font: inherit;
      font-size: 0.82rem;
      font-weight: 900;
      cursor: pointer;
      transition: background 0.14s ease, color 0.14s ease, transform 0.14s ease;
    }

    .reco-tab.active {
      color: #fff;
      background: linear-gradient(135deg, #38bdf8, #2563eb);
      box-shadow: 0 10px 24px rgba(37, 99, 235, 0.22);
    }

    .reco-tab:hover:not(.active) {
      color: #f8fafc;
      background: rgba(56, 189, 248, 0.08);
    }

    .summary-grid {
      display: grid;
      grid-template-columns: repeat(8, minmax(0, 1fr));
      gap: 0.65rem;
    }

    .summary-card {
      --summary-accent: #f8fafc;
      min-width: 0;
      padding: 0.72rem 0.85rem;
      border-radius: 14px;
      background: rgba(15, 23, 42, 0.48);
      text-align: left;
    }

    .summary-card span,
    .summary-label {
      display: block;
      color: #94a3b8;
      font-size: 0.66rem;
      font-weight: 800;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      white-space: nowrap;
    }

    .summary-card strong,
    .summary-value {
      display: block;
      margin-top: 0.2rem;
      color: var(--summary-accent);
      font-family: inherit;
      font-size: 1.18rem;
      font-weight: 900;
      line-height: 1.08;
      letter-spacing: -0.035em;
    }

    .summary-card.positive,
    .summary-card.hit-target {
      --summary-accent: #34d399;
    }

    .summary-card.negative,
    .summary-card.hit-sl {
      --summary-accent: #f87171;
    }

    .summary-card.pending {
      --summary-accent: #7dd3fc;
    }

    .date-groups,
    .paper-results {
      display: flex;
      flex-direction: column;
      gap: 0.9rem;
    }

    .trades-panel {
      border-radius: 18px;
      background: rgba(15, 23, 42, 0.56);
      overflow: hidden;
    }

    .panel-heading {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 0.75rem;
      padding: 0.95rem 1rem 0;
      margin-bottom: 0.85rem;
    }

    .panel-heading h2 {
      margin: 0.18rem 0 0;
      color: #f8fafc;
      font-size: 1rem;
      line-height: 1.2;
      letter-spacing: -0.025em;
    }

    .date-stats {
      display: flex;
      align-items: center;
      justify-content: flex-end;
      gap: 0.45rem;
      flex-wrap: wrap;
    }

    .stat-badge,
    .outcome-badge,
    .signal-chip {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 0.3rem;
      width: fit-content;
      border-radius: 999px;
      padding: 0.24rem 0.58rem;
      font-size: 0.66rem;
      font-weight: 900;
      letter-spacing: 0.04em;
      line-height: 1.1;
      white-space: nowrap;
    }

    .stat-badge.neutral,
    .signal-chip {
      color: #94a3b8;
      background: rgba(148, 163, 184, 0.12);
    }

    .stat-badge.positive,
    .outcome-badge.hit-target,
    .outcome-badge.positive,
    .signal-chip.analyst-chip.positive {
      color: #34d399;
      background: rgba(16, 185, 129, 0.12);
    }

    .stat-badge.negative,
    .outcome-badge.hit-sl,
    .outcome-badge.negative,
    .signal-chip.analyst-chip.negative {
      color: #f87171;
      background: rgba(248, 113, 113, 0.12);
    }

    .stat-badge.pending,
    .outcome-badge.pending,
    .outcome-badge.neutral {
      color: #7dd3fc;
      background: rgba(56, 189, 248, 0.12);
    }

    .outcome-badge.no-trigger {
      color: #94a3b8;
      background: rgba(148, 163, 184, 0.14);
    }

    .signal-chip.earnings-chip,
    .outcome-badge.pending {
      color: #fbbf24;
      background: rgba(251, 191, 36, 0.12);
    }

    .table-wrap,
    .picks-table-wrap {
      overflow: auto;
      -webkit-overflow-scrolling: touch;
    }

    .picks-table {
      width: 100%;
      min-width: 980px;
      border-collapse: separate;
      border-spacing: 0;
      table-layout: fixed;
      font-size: 0.84rem;
    }

    .paper-table {
      min-width: 1320px;
    }

    .picks-table thead th {
      position: sticky;
      top: 0;
      z-index: 4;
      padding: 0.72rem 0.8rem;
      color: #64748b;
      font-size: 0.68rem;
      font-weight: 900;
      letter-spacing: 0.08em;
      text-align: left;
      text-transform: uppercase;
      white-space: nowrap;
      background: linear-gradient(180deg, #0b1120 0%, #0f172a 100%);
      border-bottom: 1px solid rgba(148, 163, 184, 0.12);
      box-shadow: 0 1px 0 rgba(148, 163, 184, 0.16), 0 10px 18px rgba(2, 6, 23, 0.22);
    }

    .picks-table td {
      padding: 0.74rem 0.8rem;
      color: #cbd5e1;
      border-bottom: 1px solid rgba(148, 163, 184, 0.08);
      vertical-align: middle;
      transition: background 0.14s ease;
    }

    .picks-table tbody tr:hover td {
      background: rgba(56, 189, 248, 0.055);
    }

    .row-hit-target td {
      background: rgba(16, 185, 129, 0.025);
    }

    .row-hit-sl td {
      background: rgba(248, 113, 113, 0.025);
    }

    .col-score {
      width: 5.5rem;
      text-align: center;
    }

    .col-stock {
      width: 15rem;
    }

    .col-price {
      width: 8.5rem;
    }

    .col-targets {
      width: 15rem;
    }

    .col-outcome {
      width: 11rem;
      text-align: center;
    }

    .col-signals {
      min-width: 16rem;
    }

    .numeric {
      text-align: right;
      white-space: nowrap;
    }

    .score-badge {
      width: 2.25rem;
      height: 2.25rem;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      border: 1px solid rgba(148, 163, 184, 0.14);
      border-radius: 12px;
      background: rgba(148, 163, 184, 0.12);
      color: #e2e8f0;
      font-family: inherit;
      font-size: 0.86rem;
      font-weight: 900;
    }

    .score-badge.high {
      color: #022c22;
      background: linear-gradient(135deg, #34d399, #059669);
    }

    .score-badge.medium {
      color: #0f172a;
      background: linear-gradient(135deg, #fbbf24, #f97316);
    }

    .stock-identity {
      display: inline-flex;
      max-width: 100%;
      min-width: 0;
      flex-direction: column;
      gap: 0.14rem;
    }

    .stock-symbol-row {
      display: flex;
      align-items: center;
      gap: 0.38rem;
    }

    .stock-symbol,
    .stock-name {
      border: 0;
      background: transparent;
      color: inherit;
      padding: 0;
      text-align: left;
      font: inherit;
      cursor: pointer;
    }

    .stock-symbol {
      color: #f8fafc;
      font-size: 0.94rem;
      font-weight: 900;
      line-height: 1.1;
    }

    .stock-name {
      max-width: 100%;
      color: #94a3b8;
      font-size: 0.78rem;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .stock-symbol:hover,
    .stock-name:hover {
      color: #7dd3fc;
    }

    .stock-meta,
    .tech-meta,
    .price-stack small,
    .outcome-high,
    .date-time-cell,
    .exit-reason-cell {
      color: #64748b;
      font-size: 0.72rem;
      font-weight: 700;
    }

    .rh-icon,
    .detail-icon-link {
      width: 1.25rem;
      height: 1.25rem;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      border: 1px solid rgba(148, 163, 184, 0.14);
      border-radius: 8px;
      background: rgba(15, 23, 42, 0.68);
      overflow: hidden;
    }

    .rh-icon img,
    .detail-icon-link img {
      width: 1rem;
      height: 1rem;
      object-fit: cover;
    }

    .price-stack {
      display: inline-flex;
      flex-direction: column;
      align-items: flex-end;
      gap: 0.12rem;
      color: #f8fafc;
      font-weight: 800;
    }

    .target-grid {
      display: grid;
      gap: 0.24rem;
    }

    .target {
      font-family: inherit;
      font-size: 0.8rem;
      font-weight: 800;
      line-height: 1.25;
    }

    .target small {
      font-size: 0.7rem;
      opacity: 0.82;
    }

    .target.buy {
      color: #34d399;
    }

    .target.sell {
      color: #7dd3fc;
    }

    .target.stop {
      color: #f87171;
    }

    .outcome-pnl {
      margin-top: 0.25rem;
      color: #e2e8f0;
      font-family: inherit;
      font-size: 0.78rem;
      font-weight: 900;
    }

    .signal-list {
      display: flex;
      flex-wrap: wrap;
      gap: 0.32rem;
    }

    .tech-meta {
      display: flex;
      gap: 0.45rem;
      margin-top: 0.35rem;
    }

    .formula-card {
      display: flex;
      justify-content: space-between;
      gap: 1rem;
      padding: 1rem 1.1rem;
      border-radius: 18px;
      background:
        radial-gradient(circle at 20% 0%, rgba(56, 189, 248, 0.14), transparent 34%),
        rgba(15, 23, 42, 0.58);
    }

    .formula-card h2 {
      margin: 0.22rem 0;
      color: #f8fafc;
      font-size: 1rem;
      letter-spacing: -0.025em;
    }

    .formula-card p {
      max-width: 58rem;
      margin: 0;
      color: #94a3b8;
      font-size: 0.86rem;
      line-height: 1.5;
    }

    .planned-cell {
      position: relative;
    }

    .planned-info-button {
      width: 1.35rem;
      height: 1.35rem;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      margin-left: 0.35rem;
      border: 1px solid rgba(56, 189, 248, 0.32);
      border-radius: 999px;
      background: rgba(56, 189, 248, 0.12);
      color: #7dd3fc;
      cursor: pointer;
      vertical-align: middle;
    }

    .planned-explanation {
      position: absolute;
      right: 0;
      top: calc(100% + 0.35rem);
      z-index: 12;
      width: min(17rem, 70vw);
      padding: 0.58rem 0.65rem;
      border: 1px solid rgba(148, 163, 184, 0.16);
      border-radius: 12px;
      background: #0f172a;
      color: #cbd5e1;
      box-shadow: 0 18px 34px rgba(2, 6, 23, 0.32);
      white-space: normal;
      text-align: left;
      font-size: 0.74rem;
      line-height: 1.35;
    }

    .outcome-badge.compact.detailed,
    .pnl-badge {
      border-radius: 999px;
      padding: 0.28rem 0.62rem;
      font-weight: 900;
    }

    .pnl-badge {
      display: inline-flex;
      flex-direction: column;
      align-items: flex-start;
      gap: 0.1rem;
    }

    .pnl-badge small {
      color: inherit;
      font-size: 0.7rem;
      opacity: 0.82;
    }

    .loading-card,
    .empty-state {
      min-height: 18rem;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 0.5rem;
      padding: 2rem;
      border-radius: 18px;
      color: #94a3b8;
      text-align: center;
    }

    .empty-state.compact {
      min-height: 8rem;
      margin: 0 1rem 1rem;
      border-style: dashed;
    }

    .empty-state .pi {
      color: #38bdf8;
      font-size: 1.4rem;
    }

    .empty-state strong {
      color: #f8fafc;
      font-size: 0.95rem;
    }

    @media (max-width: 1180px) {
      .summary-grid {
        grid-template-columns: repeat(4, minmax(0, 1fr));
      }

      .col-signals {
        display: none;
      }
    }

    @media (max-width: 768px) {
      .trades-page {
        padding: 0.75rem;
      }

      .trades-hero,
      .panel-heading,
      .formula-card {
        flex-direction: column;
        align-items: flex-start;
      }

      .hero-actions,
      .month-nav,
      .reco-tabs {
        width: 100%;
      }

      .reco-tabs {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }

      .reco-tab {
        text-align: center;
      }

      .summary-grid {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }

      .date-stats {
        justify-content: flex-start;
      }

      .picks-table {
        min-width: 900px;
      }

      .paper-table {
        min-width: 1280px;
      }

      .picks-table thead th.col-stock,
      .picks-table tbody td.col-stock {
        position: sticky;
        left: 0;
        width: 132px;
        min-width: 132px;
        max-width: 132px;
        background: #0f172a;
        z-index: 3;
        box-shadow: 1px 0 0 rgba(148, 163, 184, 0.1), 14px 0 18px rgba(2, 6, 23, 0.22);
      }

      .picks-table thead th.col-stock {
        z-index: 7;
        background: #0b1120;
      }
    }

    @media (max-width: 520px) {
      .trades-page {
        padding: 0.5rem;
        gap: 0.7rem;
      }

      .hero-title-row {
        flex-direction: column;
        align-items: flex-start;
        gap: 0.2rem;
      }

      .summary-grid {
        grid-template-columns: 1fr;
      }

      .month-label {
        flex: 1;
        min-width: 0;
      }
    }
  `]
})
export class RecommendationsComponent implements OnInit {
  private http = inject(HttpClient);
  private router = inject(Router);
  public marketService = inject(MarketService);

  loading = signal(false);
  picks = signal<DailyPick[]>([]);
  selectedMonth = signal(this.getCurrentMonth());
  activeTab = signal<RecommendationsTab>('recommendations');
  activePlanExplanation = signal<string | null>(null);
  stockExtras = signal<Record<string, { targetMeanPrice?: number; earningsTimestamp?: number; heldPercentInstitutions?: number }>>({});

  selectedMonthLabel = computed(() => {
    const [y, m] = this.selectedMonth().split('-').map(Number);
    return new Date(y, m - 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  });

  dateGroups = computed<DateGroup[]>(() => {
    const all = this.picks();
    const grouped = new Map<string, DailyPick[]>();

    for (const pick of all) {
      const d = pick.pick_date;
      if (!grouped.has(d)) grouped.set(d, []);
      grouped.get(d)!.push(pick);
    }

    // Fill in all weekdays in the month up to today
    const [year, month] = this.selectedMonth().split('-').map(Number);
    const today = new Date().toISOString().slice(0, 10);
    const daysInMonth = new Date(year, month, 0).getDate();

    for (let day = 1; day <= daysInMonth; day++) {
      const d = new Date(year, month - 1, day);
      const dateStr = d.toISOString().slice(0, 10);
      if (dateStr > today) break; // don't show future dates
      const dow = d.getDay();
      if (dow === 0 || dow === 6) continue; // skip weekends
      if (!grouped.has(dateStr)) grouped.set(dateStr, []);
    }

    // Sort descending by date
    const sortedEntries = Array.from(grouped.entries()).sort((a, b) => b[0].localeCompare(a[0]));

    return sortedEntries.map(([date, picks]) => {
      const wins = picks.filter(p => p.outcome === 'hit-target' || (p.outcome === 'exit-at-close' && p.pnl_percent != null && p.pnl_percent > 0)).length;
      const losses = picks.filter(p => p.outcome === 'hit-sl' || (p.outcome === 'exit-at-close' && (p.pnl_percent == null || p.pnl_percent <= 0))).length;
      return {
        date,
        displayDate: new Date(date + 'T00:00:00').toLocaleDateString('en-US', {
          weekday: 'long', month: 'short', day: 'numeric',
        }),
        picks,
        highCount: picks.filter(p => p.priority === 'High').length,
        mediumCount: picks.filter(p => p.priority === 'Medium').length,
        hitTargetCount: wins,
        hitStopLossCount: losses,
        pendingCount: picks.filter(p => this.isPickPending(p)).length,
      };
    });
  });

  totalPicks = computed(() => this.picks().length);
  totalTargetHit = computed(() => this.picks().filter(p => p.outcome === 'hit-target').length);
  totalClosedProfitable = computed(() => this.picks().filter(p => p.outcome === 'exit-at-close' && p.pnl_percent != null && p.pnl_percent > 0).length);
  totalClosedAtLoss = computed(() => this.picks().filter(p => p.outcome === 'exit-at-close' && (p.pnl_percent == null || p.pnl_percent <= 0)).length);
  totalStoppedOut = computed(() => this.picks().filter(p => p.outcome === 'hit-sl').length);
  totalNotTraded = computed(() => {
    return this.picks().filter(p => p.outcome === 'no-trigger' || (p.outcome == null && !this.isPickPending(p))).length;
  });
  totalPending = computed(() => {
    return this.picks().filter(p => this.isPickPending(p)).length;
  });
  winRate = computed(() => {
    const wins = this.totalTargetHit() + this.totalClosedProfitable();
    const losses = this.totalStoppedOut() + this.totalClosedAtLoss();
    const resolved = wins + losses;
    return resolved > 0 ? (wins / resolved) * 100 : -1;
  });

  currencySymbol = computed(() => this.marketService.marketInfo().currencySymbol);
  investmentRange = computed(() => getRecommendationInvestmentRange(this.marketService.currentMarket()));
  scoreFormula = computed(() => getScoreInvestmentFormulaLabel(this.marketService.currentMarket()));
  paperSimulation = computed(() => buildRecommendationSimulation(this.picks(), this.marketService.currentMarket()));

  constructor() {
    // Reload when market changes
    effect(() => {
      const _m = this.marketService.currentMarket();
      const _month = this.selectedMonth();
      this.fetchPicks();
    });
  }

  ngOnInit(): void {}

  getTradeKey(trade: RecommendationSimulatedTrade): string {
    return `${trade.pickDate}-${trade.symbol}`;
  }

  togglePlanExplanation(trade: RecommendationSimulatedTrade): void {
    const key = this.getTradeKey(trade);
    this.activePlanExplanation.update(activeKey => activeKey === key ? null : key);
  }

  getPlannedInvestmentExplanation(trade: RecommendationSimulatedTrade): string {
    const range = this.investmentRange();
    const variableAmount = range.max - range.min;
    return `Planned = ${this.formatSimulationCurrency(range.min)} + (${trade.score} / 100 x ${this.formatSimulationCurrency(variableAmount)}) = ${this.formatSimulationCurrency(trade.plannedInvestment)}`;
  }

  private formatSimulationCurrency(value: number): string {
    return new Intl.NumberFormat(this.marketService.currentMarket() === 'IN' ? 'en-IN' : 'en-US', {
      style: 'currency',
      currency: this.marketService.currentMarket() === 'IN' ? 'INR' : 'USD',
      maximumFractionDigits: 2,
    }).format(value);
  }

  private getCurrentMonth(): string {
    return new Date().toISOString().slice(0, 7);
  }

  prevMonth(): void {
    const [y, m] = this.selectedMonth().split('-').map(Number);
    const prev = m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
    this.selectedMonth.set(prev);
  }

  nextMonth(): void {
    const [y, m] = this.selectedMonth().split('-').map(Number);
    const next = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
    if (next <= this.getCurrentMonth()) {
      this.selectedMonth.set(next);
    }
  }

  isCurrentMonth(): boolean {
    return this.selectedMonth() === this.getCurrentMonth();
  }

  private fetchPicks(): void {
    this.loading.set(true);
    const market = this.marketService.currentMarket();
    const month = this.selectedMonth();

    this.http.get<{ picks: DailyPick[] }>(`/api/stocks?action=daily-picks&market=${market}&month=${month}`)
      .subscribe({
        next: (res) => {
          this.picks.set(res.picks || []);
          this.loading.set(false);
          this.enrichWithExtras(res.picks || [], market);
        },
        error: (err) => {
          console.error('Failed to fetch picks:', err);
          this.picks.set([]);
          this.loading.set(false);
        },
      });
  }

  private enrichWithExtras(picks: DailyPick[], market: string): void {
    const symbols = [...new Set(picks.map(p => p.symbol))];
    if (symbols.length === 0) return;

    this.http.get<any>(`/api/stocks?action=search&q=${symbols.join(',')}&market=${market}`)
      .subscribe({
        next: (res) => {
          const extras: Record<string, any> = {};
          for (const s of (res.stocks || [])) {
            extras[s.symbol] = {
              targetMeanPrice: s.targetMeanPrice || null,
              earningsTimestamp: s.earningsTimestamp || null,
              heldPercentInstitutions: s.heldPercentInstitutions || null,
            };
          }
          this.stockExtras.set(extras);
        },
        error: () => {},
      });
  }

  getPickTarget(pick: DailyPick): string | null {
    const ext = this.stockExtras()[pick.symbol];
    if (!ext?.targetMeanPrice || !pick.price) return null;
    const pct = ((ext.targetMeanPrice - pick.price) / pick.price) * 100;
    const sign = pct >= 0 ? '+' : '';
    return `Target: $${ext.targetMeanPrice.toFixed(0)} (${sign}${pct.toFixed(0)}%)`;
  }

  getPickTargetClass(pick: DailyPick): string {
    const ext = this.stockExtras()[pick.symbol];
    if (!ext?.targetMeanPrice || !pick.price) return '';
    return ext.targetMeanPrice > pick.price ? 'positive' : 'negative';
  }

  getPickEarnings(pick: DailyPick): string | null {
    const ext = this.stockExtras()[pick.symbol];
    if (!ext?.earningsTimestamp) return null;
    const d = new Date(ext.earningsTimestamp * 1000);
    const now = new Date();
    const diffDays = Math.round((d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    if (diffDays >= 0 && diffDays <= 7) return `Earnings in ${diffDays}d`;
    return null; // Only show if within 7 days (catalyst)
  }

  /**
   * Determine outcome from stored evaluation data.
   * The evaluate-picks cron runs each morning and updates outcomes
   * based on actual intraday price data from Yahoo Finance.
   */
  getOutcome(pick: DailyPick): DisplayOutcome {
    if (this.isPickPending(pick)) return 'pending';

    // Use stored outcome from the evaluate-picks cron
    if (pick.outcome === 'hit-target') return 'hit-target';
    if (pick.outcome === 'hit-sl') return 'hit-sl';
    // exit-at-close: determine by actual P&L
    if (pick.outcome === 'exit-at-close') {
      return (pick.pnl_percent != null && pick.pnl_percent > 0) ? 'hit-target' : 'hit-sl';
    }
    if (pick.outcome === 'no-trigger') return 'no-trigger';

    // Past picks with missing evaluations are treated as not traded so stale rows do not remain pending.
    return 'no-trigger';
  }

  private isPickPending(pick: DailyPick): boolean {
    if (pick.outcome != null) return false;

    const today = new Date().toISOString().slice(0, 10);
    return pick.pick_date > today;
  }

  getOutcomeLabel(pick: DailyPick): string {
    const outcome = this.getOutcome(pick);
    if (outcome === 'hit-target' && pick.outcome === 'exit-at-close') {
      return (pick.pnl_percent != null && pick.pnl_percent > 0) ? 'Closed Profitable' : 'Closed at Loss';
    }
    if (outcome === 'hit-target') return 'Target Hit';
    if (outcome === 'hit-sl' && pick.outcome === 'exit-at-close') return 'Closed at Loss';
    if (outcome === 'hit-sl') return 'Stopped Out';
    if (outcome === 'no-trigger') return 'Not Traded';
    return 'Pending';
  }

  getOutcomeIcon(pick: DailyPick): string {
    const o = this.getOutcome(pick);
    if (o === 'hit-target') return 'pi pi-check-circle';
    if (o === 'hit-sl') return 'pi pi-times-circle';
    if (o === 'no-trigger') return 'pi pi-ban';
    return 'pi pi-clock';
  }

  shouldShowPnl(pick: DailyPick): boolean {
    const outcome = this.getOutcome(pick);
    return outcome === 'hit-target' || outcome === 'hit-sl';
  }

  getPnlPercent(pick: DailyPick): number {
    // Use actual P&L from evaluation cron if available
    if (pick.pnl_percent != null) return pick.pnl_percent;

    // Fallback to estimated P&L based on targets
    const o = this.getOutcome(pick);
    if (o === 'hit-target') {
      return ((pick.sell_price - pick.buy_price) / pick.buy_price) * 100;
    }
    if (o === 'no-trigger') return 0;
    return ((pick.stop_loss - pick.buy_price) / pick.buy_price) * 100;
  }

  getTargetPct(pick: DailyPick): number {
    return pick.buy_price > 0 ? ((pick.sell_price - pick.buy_price) / pick.buy_price) * 100 : 0;
  }

  getStopPct(pick: DailyPick): number {
    return pick.buy_price > 0 ? ((pick.buy_price - pick.stop_loss) / pick.buy_price) * 100 : 0;
  }

  formatSymbol(symbol: string): string {
    return symbol.replace('.NS', '').replace('.BO', '');
  }

  navigateToStock(symbol: string): void {
    this.router.navigate(['/stock', symbol]);
  }
}
