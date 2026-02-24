import { Component, inject, signal } from '@angular/core';
import { CommonModule, DecimalPipe } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { FormsModule } from '@angular/forms';

import { AutoCompleteModule, AutoCompleteCompleteEvent } from 'primeng/autocomplete';
import { ProgressSpinnerModule } from 'primeng/progressspinner';
import { TooltipModule } from 'primeng/tooltip';

import { MarketService } from '../../core/services';

interface Crossover {
  date: string;
  type: 'golden_cross' | 'death_cross';
  sma50: number;
  sma200: number;
  close: number;
}

interface DmaCrossoverResponse {
  symbol: string;
  crossovers: Crossover[];
  currentSMA50: number | null;
  currentSMA200: number | null;
  currentClose: number;
  currentDate: string;
  currentState: 'golden' | 'death' | 'unknown';
  totalTradingDays: number;
}

@Component({
  selector: 'app-dma-simulator-v2',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    AutoCompleteModule,
    ProgressSpinnerModule,
    TooltipModule,
    DecimalPipe,
  ],
  template: `
    <div class="theme-retro dma-retro">
      <!-- CRT Effect Overlay -->
      <div class="crt-overlay">
        <div class="scanlines"></div>
        <div class="crt-flicker"></div>
      </div>

      <!-- Console Frame -->
      <div class="console-frame">
        <div class="frame-top">
          <div class="frame-screw"></div>
          <div class="frame-label">DMA ANALYSIS TERMINAL</div>
          <div class="frame-screw"></div>
        </div>

        <!-- Console Header -->
        <header class="console-header">
          <div class="header-gauges">
            <div class="gauge">
              <div class="gauge-label">SYS</div>
              <div class="gauge-value">OK</div>
            </div>
            <div class="gauge">
              <div class="gauge-label">MEM</div>
              <div class="gauge-value">64K</div>
            </div>
          </div>
          <div class="header-title">
            <h1 class="terminal-title">50/200 DMA CROSSOVER ANALYZER</h1>
            <div class="title-subtitle">TECHNICAL SIGNAL DETECTION SYSTEM v2.0</div>
          </div>
          <div class="header-indicators">
            <div class="indicator" [class.active]="!loading()">
              <span class="indicator-light"></span>
              <span class="indicator-label">READY</span>
            </div>
            <div class="indicator" [class.active]="loading()">
              <span class="indicator-light warning"></span>
              <span class="indicator-label">PROC</span>
            </div>
          </div>
        </header>

        <!-- Search Terminal -->
        <div class="search-terminal">
          <div class="terminal-prompt">> ENTER_SYMBOL:</div>
          <div class="search-input-wrapper">
            <p-autoComplete
              [(ngModel)]="searchSelected"
              [suggestions]="searchSuggestions()"
              (completeMethod)="onSearchComplete($event)"
              (onSelect)="onStockSelect($event)"
              [minLength]="1"
              [delay]="300"
              placeholder="TYPE STOCK SYMBOL..."
              [showEmptyMessage]="true"
              emptyMessage="NO_MATCH_FOUND"
              [forceSelection]="false"
              field="symbol"
              appendTo="body"
              [scrollHeight]="'400px'"
              styleClass="retro-autocomplete"
              inputStyleClass="retro-input">
              <ng-template let-stock pTemplate="item">
                <div class="search-result">
                  <span class="result-symbol">{{ stock.symbol }}</span>
                  <span class="result-name">{{ stock.name | slice:0:25 }}</span>
                  <span class="result-price" [class.positive]="stock.changePercent >= 0" [class.negative]="stock.changePercent < 0">
                    {{ marketService.formatCurrency(stock.price, stock.market) }}
                  </span>
                </div>
              </ng-template>
            </p-autoComplete>
          </div>
          <div class="quick-buttons">
            <span class="quick-label">QUICK:</span>
            <button class="quick-btn" (click)="quickSearch('TQQQ')">TQQQ</button>
            <button class="quick-btn" (click)="quickSearch('SPY')">SPY</button>
            <button class="quick-btn" (click)="quickSearch('AAPL')">AAPL</button>
            <button class="quick-btn" (click)="quickSearch('QQQ')">QQQ</button>
          </div>
        </div>

        <!-- Main Display -->
        <main class="console-display">
          <!-- Loading State -->
          @if (loading()) {
            <div class="loading-screen">
              <div class="loading-animation">
                <div class="loading-bar">
                  <div class="bar-segment"></div>
                  <div class="bar-segment"></div>
                  <div class="bar-segment"></div>
                  <div class="bar-segment"></div>
                  <div class="bar-segment"></div>
                </div>
              </div>
              <div class="loading-text">
                <span class="blink">_</span> ANALYZING {{ selectedSymbol() }}...
              </div>
              <div class="loading-subtext">CALCULATING CROSSOVER EVENTS</div>
            </div>
          }

          <!-- Error State -->
          @if (error()) {
            <div class="error-screen">
              <div class="error-header">! ERROR !</div>
              <div class="error-message">{{ error() }}</div>
              <div class="error-code">ERR_DATA_UNAVAILABLE</div>
            </div>
          }

          <!-- Empty State -->
          @if (!loading() && !error() && !result()) {
            <div class="idle-screen">
              <div class="idle-graphic">
                <div class="idle-wave"></div>
              </div>
              <div class="idle-text">AWAITING INPUT</div>
              <div class="idle-hint">Enter a stock symbol above to begin analysis</div>
            </div>
          }

          <!-- Results Display -->
          @if (result() && !loading()) {
            <div class="results-display">
              <!-- Status Panel -->
              <div class="status-panel" [class.golden]="result()!.currentState === 'golden'" [class.death]="result()!.currentState === 'death'">
                <div class="status-header">
                  <span class="status-symbol">{{ result()!.symbol }}</span>
                  <span class="status-badge" [class.golden]="result()!.currentState === 'golden'" [class.death]="result()!.currentState === 'death'">
                    {{ result()!.currentState === 'golden' ? '▲ GOLDEN CROSS' : result()!.currentState === 'death' ? '▼ DEATH CROSS' : '◆ UNKNOWN' }}
                  </span>
                </div>
                <div class="status-meters">
                  <div class="meter">
                    <div class="meter-label">CLOSE</div>
                    <div class="meter-value">{{ result()!.currentClose | number:'1.2-2' }}</div>
                    <div class="meter-bar">
                      <div class="meter-fill" style="width: 75%"></div>
                    </div>
                  </div>
                  <div class="meter">
                    <div class="meter-label">50 DMA</div>
                    <div class="meter-value">{{ result()!.currentSMA50 | number:'1.2-2' }}</div>
                    <div class="meter-bar">
                      <div class="meter-fill sma50" [style.width.%]="getSmaPercentage(result()!.currentSMA50, result()!.currentClose)"></div>
                    </div>
                  </div>
                  <div class="meter">
                    <div class="meter-label">200 DMA</div>
                    <div class="meter-value">{{ result()!.currentSMA200 | number:'1.2-2' }}</div>
                    <div class="meter-bar">
                      <div class="meter-fill sma200" [style.width.%]="getSmaPercentage(result()!.currentSMA200, result()!.currentClose)"></div>
                    </div>
                  </div>
                </div>
                <div class="status-info">
                  <span>DATA_POINTS: {{ result()!.totalTradingDays }}</span>
                  <span>|</span>
                  <span>CROSSOVERS: {{ result()!.crossovers.length }}</span>
                </div>
              </div>

              <!-- Timeline Section -->
              <div class="timeline-section">
                <div class="timeline-header">
                  <span class="timeline-title">> CROSSOVER_HISTORY</span>
                  <span class="timeline-count">[{{ result()!.crossovers.length }} EVENTS]</span>
                </div>

                @if (result()!.crossovers.length === 0) {
                  <div class="no-events">
                    <div class="no-events-icon">◎</div>
                    <div class="no-events-text">NO CROSSOVERS DETECTED</div>
                    <div class="no-events-hint">{{ result()!.symbol }} has maintained consistent trend</div>
                  </div>
                } @else {
                  <div class="timeline-list">
                    @for (crossover of result()!.crossovers; track crossover.date; let i = $index) {
                      <div class="timeline-event" [class.golden]="crossover.type === 'golden_cross'" [class.death]="crossover.type === 'death_cross'" [style.animation-delay]="(i * 0.05) + 's'">
                        <div class="event-connector">
                          <div class="connector-node">
                            <span class="node-icon">{{ crossover.type === 'golden_cross' ? '▲' : '▼' }}</span>
                          </div>
                          @if (i < result()!.crossovers.length - 1) {
                            <div class="connector-line"></div>
                          }
                        </div>
                        <div class="event-content">
                          <div class="event-header">
                            <span class="event-type" [class.golden]="crossover.type === 'golden_cross'" [class.death]="crossover.type === 'death_cross'">
                              {{ crossover.type === 'golden_cross' ? 'GOLDEN_CROSS' : 'DEATH_CROSS' }}
                            </span>
                            @if (i > 0) {
                              <span class="event-change" [class.positive]="getPriceChangeFromPrevious(i) > 0" [class.negative]="getPriceChangeFromPrevious(i) < 0">
                                {{ getPriceChangeFromPrevious(i) > 0 ? '+' : '' }}{{ getPriceChangeFromPrevious(i) | number:'1.1-1' }}% since last
                              </span>
                            }
                          </div>
                          <div class="event-date">{{ formatDate(crossover.date) }}</div>
                          <div class="event-data">
                            <div class="data-item">
                              <span class="data-label">CLOSE</span>
                              <span class="data-value">{{ crossover.close | number:'1.2-2' }}</span>
                            </div>
                            <div class="data-item">
                              <span class="data-label">50_DMA</span>
                              <span class="data-value">{{ crossover.sma50 | number:'1.2-2' }}</span>
                            </div>
                            <div class="data-item">
                              <span class="data-label">200_DMA</span>
                              <span class="data-value">{{ crossover.sma200 | number:'1.2-2' }}</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    }
                  </div>
                }
              </div>
            </div>
          }
        </main>

        <!-- Console Footer -->
        <footer class="console-footer">
          <div class="footer-left">
            <span class="footer-text">SYSTEM OPERATIONAL</span>
          </div>
          <div class="footer-center">
            <div class="footer-line"></div>
          </div>
          <div class="footer-right">
            <span class="footer-text">DMA_ANALYZER v2.0</span>
          </div>
        </footer>
      </div>
    </div>
  `,
  styles: [`
    .dma-retro {
      min-height: 100vh;
      background: var(--retro-bg);
      font-family: var(--retro-font-mono);
      color: var(--retro-text);
      padding: 1rem;
    }

    /* CRT Effect */
    .crt-overlay {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      pointer-events: none;
      z-index: 1000;
    }

    .scanlines {
      display: none;
    }

    .crt-flicker {
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(255, 176, 0, 0.02);
      animation: retro-crt-flicker 0.1s infinite;
    }

    /* Console Frame */
    .console-frame {
      max-width: 1200px;
      margin: 0 auto;
      background: var(--retro-bg-elevated);
      border: 4px solid var(--retro-border);
      border-radius: 8px;
      box-shadow: 
        inset 0 0 50px rgba(255, 176, 0, 0.05),
        0 0 30px rgba(0, 0, 0, 0.5);
      position: relative;
      z-index: 1;
    }

    .frame-top {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 0.5rem 1rem;
      background: var(--retro-bg-card);
      border-bottom: 2px solid var(--retro-border);
    }

    .frame-screw {
      width: 12px;
      height: 12px;
      background: var(--retro-border);
      border-radius: 50%;
      position: relative;

      &::before {
        content: '+';
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        font-size: 10px;
        color: var(--retro-bg);
      }
    }

    .frame-label {
      font-family: var(--retro-font-display);
      font-size: 0.7rem;
      letter-spacing: 0.2em;
      color: var(--retro-amber);
    }

    /* Console Header */
    .console-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 1rem 1.5rem;
      background: linear-gradient(180deg, rgba(255, 176, 0, 0.05) 0%, transparent 100%);
      border-bottom: 1px solid var(--retro-border);
    }

    .header-gauges {
      display: flex;
      gap: 1rem;
    }

    .gauge {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 0.25rem;
    }

    .gauge-label {
      font-size: 0.55rem;
      color: var(--retro-text);
      letter-spacing: 0.1em;
    }

    .gauge-value {
      font-family: var(--retro-font-display);
      font-size: 0.9rem;
      color: var(--retro-green);
      text-shadow: 0 0 10px rgba(51, 255, 51, 0.5);
    }

    .header-title {
      text-align: center;
    }

    .terminal-title {
      font-family: var(--retro-font-display);
      font-size: clamp(1rem, 2.5vw, 1.5rem);
      font-weight: 400;
      color: var(--retro-amber);
      margin: 0;
      letter-spacing: 0.1em;
      text-shadow: 0 0 20px var(--retro-amber-glow);
      animation: retro-glow 2s ease-in-out infinite;
    }

    .title-subtitle {
      font-size: 0.65rem;
      color: var(--retro-text);
      letter-spacing: 0.15em;
      margin-top: 0.25rem;
    }

    .header-indicators {
      display: flex;
      gap: 1rem;
    }

    .indicator {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 0.25rem;
      opacity: 0.4;

      &.active {
        opacity: 1;
      }
    }

    .indicator-light {
      width: 10px;
      height: 10px;
      background: var(--retro-green);
      border-radius: 50%;
      box-shadow: 0 0 10px var(--retro-green);

      &.warning {
        background: var(--retro-amber);
        box-shadow: 0 0 10px var(--retro-amber);
        animation: radar-blink 0.5s infinite;
      }
    }

    .indicator-label {
      font-size: 0.55rem;
      color: var(--retro-text);
      letter-spacing: 0.1em;
    }

    /* Search Terminal */
    .search-terminal {
      padding: 1rem 1.5rem;
      background: var(--retro-bg-card);
      border-bottom: 1px solid var(--retro-border);
    }

    .terminal-prompt {
      font-size: 0.75rem;
      color: var(--retro-amber);
      margin-bottom: 0.5rem;
    }

    .search-input-wrapper {
      margin-bottom: 0.75rem;
    }

    :host ::ng-deep .retro-autocomplete {
      width: 100%;

      .p-autocomplete-input {
        width: 100%;
        padding: 0.75rem 1rem;
        background: var(--retro-bg);
        border: 2px solid var(--retro-border);
        color: var(--retro-amber);
        font-family: var(--retro-font-mono);
        font-size: 1rem;
        caret-color: var(--retro-amber);

        &::placeholder {
          color: var(--retro-text);
          opacity: 0.5;
        }

        &:focus {
          border-color: var(--retro-amber);
          box-shadow: 0 0 15px var(--retro-amber-dim), inset 0 0 10px var(--retro-amber-dim);
          outline: none;
        }
      }

      .p-autocomplete-panel {
        background: var(--retro-bg-card);
        border: 2px solid var(--retro-border);
        margin-top: 4px;
      }

      .p-autocomplete-item {
        padding: 0.5rem 0.75rem;
        border-bottom: 1px solid var(--retro-border);

        &:hover {
          background: var(--retro-amber-dim);
        }
      }
    }

    .search-result {
      display: flex;
      align-items: center;
      gap: 1rem;
    }

    .result-symbol {
      font-weight: 600;
      color: var(--retro-amber);
      min-width: 80px;
    }

    .result-name {
      flex: 1;
      font-size: 0.8rem;
      color: var(--retro-text);
    }

    .result-price {
      font-size: 0.8rem;

      &.positive { color: var(--retro-green); }
      &.negative { color: var(--retro-red); }
    }

    .quick-buttons {
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }

    .quick-label {
      font-size: 0.65rem;
      color: var(--retro-text);
      letter-spacing: 0.1em;
    }

    .quick-btn {
      padding: 0.35rem 0.75rem;
      background: transparent;
      border: 1px solid var(--retro-border);
      color: var(--retro-text);
      font-family: var(--retro-font-mono);
      font-size: 0.7rem;
      cursor: pointer;
      transition: all 0.2s ease;

      &:hover {
        border-color: var(--retro-amber);
        color: var(--retro-amber);
        background: var(--retro-amber-dim);
      }
    }

    /* Console Display */
    .console-display {
      min-height: 400px;
      padding: 1.5rem;
      background: var(--retro-bg);
      position: relative;
    }

    /* Loading Screen */
    .loading-screen {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 4rem 2rem;
    }

    .loading-animation {
      margin-bottom: 1.5rem;
    }

    .loading-bar {
      display: flex;
      gap: 4px;
    }

    .bar-segment {
      width: 20px;
      height: 40px;
      background: var(--retro-amber);
      animation: bar-pulse 1s ease-in-out infinite;

      &:nth-child(1) { animation-delay: 0s; }
      &:nth-child(2) { animation-delay: 0.1s; }
      &:nth-child(3) { animation-delay: 0.2s; }
      &:nth-child(4) { animation-delay: 0.3s; }
      &:nth-child(5) { animation-delay: 0.4s; }
    }

    @keyframes bar-pulse {
      0%, 100% { opacity: 0.3; transform: scaleY(0.5); }
      50% { opacity: 1; transform: scaleY(1); }
    }

    .loading-text {
      font-size: 1rem;
      color: var(--retro-amber);
      margin-bottom: 0.5rem;
    }

    .loading-subtext {
      font-size: 0.75rem;
      color: var(--retro-text);
    }

    .blink {
      animation: radar-blink 0.5s infinite;
    }

    /* Error Screen */
    .error-screen {
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 3rem 2rem;
      text-align: center;
    }

    .error-header {
      font-family: var(--retro-font-display);
      font-size: 1.5rem;
      color: var(--retro-red);
      margin-bottom: 1rem;
      animation: radar-blink 0.5s infinite;
    }

    .error-message {
      font-size: 0.9rem;
      color: var(--retro-text-bright);
      margin-bottom: 0.5rem;
    }

    .error-code {
      font-size: 0.7rem;
      color: var(--retro-text);
    }

    /* Idle Screen */
    .idle-screen {
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 4rem 2rem;
    }

    .idle-graphic {
      width: 200px;
      height: 60px;
      border: 1px solid var(--retro-border);
      margin-bottom: 1.5rem;
      position: relative;
      overflow: hidden;
    }

    .idle-wave {
      position: absolute;
      top: 50%;
      left: 0;
      right: 0;
      height: 2px;
      background: var(--retro-amber);
      box-shadow: 0 0 10px var(--retro-amber);
      animation: wave-idle 2s ease-in-out infinite;
    }

    @keyframes wave-idle {
      0%, 100% { transform: translateY(0) scaleY(1); }
      25% { transform: translateY(-10px) scaleY(2); }
      50% { transform: translateY(0) scaleY(1); }
      75% { transform: translateY(10px) scaleY(2); }
    }

    .idle-text {
      font-family: var(--retro-font-display);
      font-size: 1.25rem;
      color: var(--retro-amber);
      margin-bottom: 0.5rem;
    }

    .idle-hint {
      font-size: 0.75rem;
      color: var(--retro-text);
    }

    /* Results Display */
    .results-display {
      display: flex;
      flex-direction: column;
      gap: 1.5rem;
    }

    /* Status Panel */
    .status-panel {
      background: var(--retro-bg-card);
      border: 2px solid var(--retro-border);
      padding: 1rem;

      &.golden {
        border-color: var(--retro-green);
        box-shadow: 0 0 20px rgba(51, 255, 51, 0.1);
      }

      &.death {
        border-color: var(--retro-red);
        box-shadow: 0 0 20px rgba(255, 51, 51, 0.1);
      }
    }

    .status-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 1rem;
      padding-bottom: 0.75rem;
      border-bottom: 1px solid var(--retro-border);
    }

    .status-symbol {
      font-family: var(--retro-font-display);
      font-size: 1.5rem;
      color: var(--retro-amber);
      text-shadow: 0 0 10px var(--retro-amber-glow);
    }

    .status-badge {
      padding: 0.35rem 0.75rem;
      font-size: 0.75rem;
      font-weight: 600;
      letter-spacing: 0.1em;

      &.golden {
        background: rgba(51, 255, 51, 0.15);
        color: var(--retro-green);
        border: 1px solid var(--retro-green);
      }

      &.death {
        background: rgba(255, 51, 51, 0.15);
        color: var(--retro-red);
        border: 1px solid var(--retro-red);
      }
    }

    .status-meters {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 1rem;
      margin-bottom: 1rem;
    }

    .meter {
      display: flex;
      flex-direction: column;
      gap: 0.35rem;
    }

    .meter-label {
      font-size: 0.6rem;
      color: var(--retro-text);
      letter-spacing: 0.1em;
    }

    .meter-value {
      font-family: var(--retro-font-display);
      font-size: 1.1rem;
      color: var(--retro-text-bright);
    }

    .meter-bar {
      height: 6px;
      background: var(--retro-bg);
      border: 1px solid var(--retro-border);
    }

    .meter-fill {
      height: 100%;
      background: var(--retro-amber);
      box-shadow: 0 0 5px var(--retro-amber);
      transition: width 0.5s ease;

      &.sma50 { background: var(--retro-green); box-shadow: 0 0 5px var(--retro-green); }
      &.sma200 { background: var(--retro-red); box-shadow: 0 0 5px var(--retro-red); }
    }

    .status-info {
      display: flex;
      justify-content: center;
      gap: 1rem;
      font-size: 0.7rem;
      color: var(--retro-text);
    }

    /* Timeline Section */
    .timeline-section {
      background: var(--retro-bg-card);
      border: 2px solid var(--retro-border);
    }

    .timeline-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 0.75rem 1rem;
      background: rgba(255, 176, 0, 0.03);
      border-bottom: 1px solid var(--retro-border);
    }

    .timeline-title {
      font-size: 0.75rem;
      color: var(--retro-amber);
      letter-spacing: 0.1em;
    }

    .timeline-count {
      font-size: 0.65rem;
      color: var(--retro-text);
    }

    .no-events {
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 3rem 2rem;
      text-align: center;
    }

    .no-events-icon {
      font-size: 2.5rem;
      color: var(--retro-text);
      opacity: 0.3;
      margin-bottom: 1rem;
    }

    .no-events-text {
      font-size: 0.9rem;
      color: var(--retro-amber);
      margin-bottom: 0.5rem;
    }

    .no-events-hint {
      font-size: 0.75rem;
      color: var(--retro-text);
    }

    .timeline-list {
      padding: 1rem;
    }

    .timeline-event {
      display: flex;
      gap: 1rem;
      opacity: 0;
      animation: v2-fadeIn 0.3s ease forwards;
    }

    .event-connector {
      display: flex;
      flex-direction: column;
      align-items: center;
      width: 30px;
      flex-shrink: 0;
    }

    .connector-node {
      width: 30px;
      height: 30px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: var(--retro-bg);
      border: 2px solid var(--retro-border);
      font-size: 0.9rem;

      .timeline-event.golden & {
        border-color: var(--retro-green);
        color: var(--retro-green);
        box-shadow: 0 0 10px rgba(51, 255, 51, 0.3);
      }

      .timeline-event.death & {
        border-color: var(--retro-red);
        color: var(--retro-red);
        box-shadow: 0 0 10px rgba(255, 51, 51, 0.3);
      }
    }

    .connector-line {
      width: 2px;
      flex: 1;
      min-height: 20px;
      background: var(--retro-border);
    }

    .event-content {
      flex: 1;
      padding-bottom: 1rem;
      margin-bottom: 0.5rem;
      border-bottom: 1px dashed var(--retro-border);

      .timeline-event:last-child & {
        border-bottom: none;
      }
    }

    .event-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 0.5rem;
    }

    .event-type {
      font-size: 0.7rem;
      font-weight: 600;
      letter-spacing: 0.1em;

      &.golden { color: var(--retro-green); }
      &.death { color: var(--retro-red); }
    }

    .event-change {
      font-size: 0.7rem;

      &.positive { color: var(--retro-green); }
      &.negative { color: var(--retro-red); }
    }

    .event-date {
      font-size: 0.9rem;
      color: var(--retro-text-bright);
      margin-bottom: 0.75rem;
    }

    .event-data {
      display: flex;
      gap: 1.5rem;
    }

    .data-item {
      display: flex;
      flex-direction: column;
      gap: 0.15rem;
    }

    .data-label {
      font-size: 0.55rem;
      color: var(--retro-text);
      letter-spacing: 0.1em;
    }

    .data-value {
      font-size: 0.8rem;
      color: var(--retro-text-bright);
    }

    /* Console Footer */
    .console-footer {
      display: flex;
      align-items: center;
      padding: 0.75rem 1.5rem;
      background: var(--retro-bg-card);
      border-top: 2px solid var(--retro-border);
    }

    .footer-left, .footer-right {
      flex: 0 0 auto;
    }

    .footer-center {
      flex: 1;
      padding: 0 1.5rem;
    }

    .footer-line {
      height: 1px;
      background: linear-gradient(90deg, transparent, var(--retro-amber), transparent);
      opacity: 0.5;
    }

    .footer-text {
      font-size: 0.6rem;
      color: var(--retro-amber);
      letter-spacing: 0.1em;
      opacity: 0.7;
    }

    /* Responsive */
    @media (max-width: 768px) {
      .dma-retro {
        padding: 0.5rem;
      }

      .console-header {
        flex-direction: column;
        gap: 1rem;
      }

      .header-gauges, .header-indicators {
        width: 100%;
        justify-content: space-between;
      }

      .status-meters {
        grid-template-columns: 1fr;
      }

      .event-header {
        flex-direction: column;
        align-items: flex-start;
        gap: 0.25rem;
      }

      .event-data {
        flex-wrap: wrap;
      }
    }
  `]
})
export class DmaSimulatorV2Component {
  private http = inject(HttpClient);
  marketService = inject(MarketService);

  searchSelected: any = null;
  searchSuggestions = signal<any[]>([]);
  selectedSymbol = signal<string>('');
  loading = signal(false);
  error = signal<string | null>(null);
  result = signal<DmaCrossoverResponse | null>(null);

  async onSearchComplete(event: AutoCompleteCompleteEvent): Promise<void> {
    const query = event.query.trim();
    if (query.length < 1) {
      this.searchSuggestions.set([]);
      return;
    }

    try {
      const response = await this.http.get<{ stocks: any[] }>(
        `/api/stocks?action=search&q=${encodeURIComponent(query)}&fuzzy=true`
      ).toPromise();
      
      this.searchSuggestions.set(response?.stocks || []);
    } catch (err) {
      console.error('Search failed:', err);
      this.searchSuggestions.set([]);
    }
  }

  onStockSelect(event: any): void {
    const stock = event.value || event;
    if (stock?.symbol) {
      this.loadCrossoverData(stock.symbol);
    }
  }

  quickSearch(symbol: string): void {
    this.loadCrossoverData(symbol);
  }

  async loadCrossoverData(symbol: string): Promise<void> {
    this.selectedSymbol.set(symbol);
    this.loading.set(true);
    this.error.set(null);
    this.result.set(null);

    try {
      const response = await this.http.get<DmaCrossoverResponse>(
        `/api/stocks?action=dma-crossovers&symbol=${encodeURIComponent(symbol)}`
      ).toPromise();
      
      if (response) {
        this.result.set(response);
      }
    } catch (err: any) {
      console.error('Failed to load crossover data:', err);
      this.error.set(err?.error?.error || 'Failed to load data. Please try again.');
    } finally {
      this.loading.set(false);
    }
  }

  getPriceChangeFromPrevious(idx: number): number {
    const crossovers = this.result()?.crossovers;
    if (!crossovers || idx <= 0) return 0;
    
    const current = crossovers[idx];
    const previous = crossovers[idx - 1];
    
    return ((current.close - previous.close) / previous.close) * 100;
  }

  getSmaPercentage(sma: number | null, close: number): number {
    if (!sma || !close) return 0;
    return Math.min(100, (sma / close) * 100);
  }

  formatDate(dateStr: string): string {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', {
      weekday: 'short',
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    }).toUpperCase();
  }
}
