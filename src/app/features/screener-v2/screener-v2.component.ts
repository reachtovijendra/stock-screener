import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ToastModule } from 'primeng/toast';
import { MessageService } from 'primeng/api';

import { FilterPanelV2Component } from './filter-panel-v2/filter-panel-v2.component';
import { ResultsTableV2Component } from './results-table-v2/results-table-v2.component';
import { ScreenerService, MarketService, StockService } from '../../core/services';

@Component({
  selector: 'app-screener-v2',
  standalone: true,
  imports: [
    CommonModule,
    ToastModule,
    FilterPanelV2Component,
    ResultsTableV2Component
  ],
  providers: [MessageService],
  template: `
    <p-toast position="top-right"></p-toast>
    
    <div class="theme-cyber screener-cyber">
      <!-- Animated background effects -->
      <div class="cyber-bg">
        <div class="grid-lines"></div>
        <div class="scan-line"></div>
        <div class="data-rain">
          @for (col of dataRainCols; track col) {
            <div class="rain-column" [style.left.%]="col * 3" [style.animation-delay]="(col * 0.1) + 's'">
              @for (char of getRandomChars(); track $index) {
                <span [style.animation-delay]="($index * 0.05) + 's'">{{ char }}</span>
              }
            </div>
          }
        </div>
      </div>

      <!-- Glowing border frame -->
      <div class="cyber-frame">
        <div class="frame-corner top-left"></div>
        <div class="frame-corner top-right"></div>
        <div class="frame-corner bottom-left"></div>
        <div class="frame-corner bottom-right"></div>
      </div>

      <!-- Page Header -->
      <header class="cyber-header">
        <div class="header-content">
          <div class="title-block">
            <div class="system-tag">
              <span class="tag-icon">◈</span>
              <span class="tag-text">SYSTEM.ONLINE</span>
              <span class="tag-pulse"></span>
            </div>
            <h1 class="cyber-title">
              <span class="title-glitch" data-text="STOCK_SCREENER">STOCK_SCREENER</span>
            </h1>
            <div class="subtitle-row">
              <span class="bracket">[</span>
              <span class="market-label">MARKET:</span>
              <span class="market-value">{{ marketService.currentMarket() === 'US' ? 'NYSE/NASDAQ' : 'NSE/BSE' }}</span>
              <span class="bracket">]</span>
              <span class="separator">|</span>
              <span class="status">SCANNING...</span>
            </div>
          </div>
          
          <div class="stats-panel">
            <div class="stat-box" [class.active]="screenerService.totalCount() > 0">
              <div class="stat-label">TARGETS_FOUND</div>
              <div class="stat-value">
                <span class="value-num">{{ screenerService.totalCount() | number }}</span>
              </div>
              <div class="stat-bar">
                <div class="bar-fill" [style.width.%]="Math.min(100, screenerService.totalCount() / 50)"></div>
              </div>
            </div>
            <div class="stat-box" [class.active]="screenerService.executionTime() > 0">
              <div class="stat-label">RESPONSE_MS</div>
              <div class="stat-value">
                <span class="value-num">{{ screenerService.executionTime() | number:'1.0-0' }}</span>
              </div>
              <div class="stat-bar">
                <div class="bar-fill" [style.width.%]="Math.min(100, 100 - (screenerService.executionTime() / 10))"></div>
              </div>
            </div>
          </div>
        </div>
        
        <!-- Animated header line -->
        <div class="header-line">
          <div class="line-segment"></div>
          <div class="line-dot"></div>
          <div class="line-segment expand"></div>
          <div class="line-dot"></div>
          <div class="line-segment"></div>
        </div>
      </header>

      <!-- Main Content -->
      <main class="cyber-main">
        <!-- Filter Panel -->
        <app-filter-panel-v2 (screenRun)="onScreenRun()"></app-filter-panel-v2>

        <!-- Results Table -->
        <app-results-table-v2></app-results-table-v2>
      </main>
      
      <!-- Footer with system info -->
      <footer class="cyber-footer">
        <div class="footer-left">
          <span class="footer-text">◈ NEURAL_LINK_ACTIVE</span>
        </div>
        <div class="footer-center">
          <div class="footer-line"></div>
        </div>
        <div class="footer-right">
          <span class="footer-text">v2.0.CYBER</span>
        </div>
      </footer>
    </div>
  `,
  styles: [`
    .screener-cyber {
      min-height: 100vh;
      background: var(--cyber-bg);
      font-family: var(--cyber-font-mono);
      position: relative;
      overflow: hidden;
    }

    /* Animated Background */
    .cyber-bg {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      pointer-events: none;
      z-index: 0;
    }

    .grid-lines {
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background-image: 
        linear-gradient(var(--cyber-cyan-dim) 1px, transparent 1px),
        linear-gradient(90deg, var(--cyber-cyan-dim) 1px, transparent 1px);
      background-size: 60px 60px;
      opacity: 0.3;
    }

    .scan-line {
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      height: 4px;
      background: linear-gradient(
        180deg,
        transparent,
        var(--cyber-cyan-glow),
        var(--cyber-cyan),
        var(--cyber-cyan-glow),
        transparent
      );
      animation: cyber-scan 4s linear infinite;
      opacity: 0.6;
    }

    .data-rain {
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      overflow: hidden;
      opacity: 0.15;
    }

    .rain-column {
      position: absolute;
      top: -100%;
      display: flex;
      flex-direction: column;
      font-size: 14px;
      color: var(--cyber-cyan);
      animation: cyber-data-rain 8s linear infinite;
      text-shadow: 0 0 5px var(--cyber-cyan);

      span {
        opacity: 0;
        animation: v2-fadeIn 0.3s ease forwards;
      }
    }

    /* Glowing Frame */
    .cyber-frame {
      position: fixed;
      top: 10px;
      left: 10px;
      right: 10px;
      bottom: 10px;
      pointer-events: none;
      z-index: 1;
    }

    .frame-corner {
      position: absolute;
      width: 30px;
      height: 30px;
      border: 2px solid var(--cyber-cyan);
      box-shadow: 0 0 10px var(--cyber-cyan-glow), inset 0 0 5px var(--cyber-cyan-dim);

      &.top-left {
        top: 0;
        left: 0;
        border-right: none;
        border-bottom: none;
      }
      &.top-right {
        top: 0;
        right: 0;
        border-left: none;
        border-bottom: none;
      }
      &.bottom-left {
        bottom: 0;
        left: 0;
        border-right: none;
        border-top: none;
      }
      &.bottom-right {
        bottom: 0;
        right: 0;
        border-left: none;
        border-top: none;
      }
    }

    /* Header */
    .cyber-header {
      position: relative;
      z-index: 2;
      padding: 2rem 2.5rem 1.5rem;
    }

    .header-content {
      max-width: 1800px;
      margin: 0 auto;
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 2rem;
    }

    .title-block {
      flex: 1;
    }

    .system-tag {
      display: inline-flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.35rem 0.75rem;
      background: var(--cyber-cyan-dim);
      border: 1px solid var(--cyber-cyan);
      margin-bottom: 1rem;
      font-size: 0.7rem;
      letter-spacing: 0.1em;
      color: var(--cyber-cyan);
      animation: cyber-flicker 3s infinite;
    }

    .tag-icon {
      font-size: 0.8rem;
    }

    .tag-pulse {
      width: 6px;
      height: 6px;
      background: var(--cyber-cyan);
      border-radius: 50%;
      animation: cyber-glow-pulse 1.5s ease-in-out infinite;
    }

    .cyber-title {
      font-family: var(--cyber-font-display);
      font-size: clamp(2.5rem, 5vw, 4rem);
      font-weight: 700;
      margin: 0 0 0.75rem 0;
      letter-spacing: 0.05em;
      color: var(--cyber-cyan);
      text-shadow: 
        0 0 10px var(--cyber-cyan),
        0 0 20px var(--cyber-cyan),
        0 0 40px var(--cyber-cyan-glow);
    }

    .title-glitch {
      position: relative;
      display: inline-block;

      &::before,
      &::after {
        content: attr(data-text);
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        opacity: 0.8;
      }

      &::before {
        color: var(--cyber-pink);
        animation: glitch-1 2s infinite linear alternate-reverse;
        clip-path: polygon(0 0, 100% 0, 100% 35%, 0 35%);
      }

      &::after {
        color: var(--cyber-yellow);
        animation: glitch-2 3s infinite linear alternate-reverse;
        clip-path: polygon(0 65%, 100% 65%, 100% 100%, 0 100%);
      }
    }

    @keyframes glitch-1 {
      0%, 100% { transform: translate(0); }
      20% { transform: translate(-2px, 2px); }
      40% { transform: translate(-2px, -2px); }
      60% { transform: translate(2px, 2px); }
      80% { transform: translate(2px, -2px); }
    }

    @keyframes glitch-2 {
      0%, 100% { transform: translate(0); }
      20% { transform: translate(2px, -2px); }
      40% { transform: translate(2px, 2px); }
      60% { transform: translate(-2px, -2px); }
      80% { transform: translate(-2px, 2px); }
    }

    .subtitle-row {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      font-size: 0.85rem;
      color: var(--cyber-text-dim);
    }

    .bracket {
      color: var(--cyber-cyan);
      font-weight: bold;
    }

    .market-label {
      color: var(--cyber-text-dim);
    }

    .market-value {
      color: var(--cyber-cyan);
      font-weight: 600;
    }

    .separator {
      color: var(--cyber-cyan);
      opacity: 0.5;
    }

    .status {
      color: var(--cyber-positive);
      animation: radar-blink 1s infinite;
    }

    /* Stats Panel */
    .stats-panel {
      display: flex;
      gap: 1rem;
    }

    .stat-box {
      min-width: 160px;
      padding: 1rem 1.25rem;
      background: rgba(0, 255, 242, 0.03);
      border: 1px solid var(--cyber-border);
      position: relative;
      overflow: hidden;
      transition: all 0.3s ease;

      &::before {
        content: '';
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        height: 2px;
        background: var(--cyber-cyan);
        opacity: 0.3;
      }

      &.active {
        border-color: var(--cyber-cyan);
        box-shadow: 0 0 20px var(--cyber-cyan-dim), inset 0 0 20px var(--cyber-cyan-dim);

        &::before {
          opacity: 1;
          box-shadow: 0 0 10px var(--cyber-cyan);
        }
      }
    }

    .stat-label {
      font-size: 0.65rem;
      letter-spacing: 0.1em;
      color: var(--cyber-text-dim);
      margin-bottom: 0.5rem;
    }

    .stat-value {
      font-family: var(--cyber-font-display);
      font-size: 1.75rem;
      font-weight: 700;
      color: var(--cyber-cyan);
      text-shadow: 0 0 10px var(--cyber-cyan-glow);
      margin-bottom: 0.5rem;
    }

    .stat-bar {
      height: 3px;
      background: var(--cyber-cyan-dim);
      overflow: hidden;
    }

    .bar-fill {
      height: 100%;
      background: var(--cyber-cyan);
      box-shadow: 0 0 10px var(--cyber-cyan);
      transition: width 0.5s ease;
    }

    /* Header Line */
    .header-line {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      margin-top: 1.5rem;
      max-width: 1800px;
      margin-left: auto;
      margin-right: auto;
    }

    .line-segment {
      height: 1px;
      background: linear-gradient(90deg, var(--cyber-cyan), transparent);
      flex: 0 0 100px;

      &.expand {
        flex: 1;
        background: var(--cyber-cyan);
        opacity: 0.3;
      }
    }

    .line-dot {
      width: 6px;
      height: 6px;
      background: var(--cyber-cyan);
      box-shadow: 0 0 10px var(--cyber-cyan);
    }

    /* Main Content */
    .cyber-main {
      position: relative;
      z-index: 2;
      max-width: 1800px;
      margin: 0 auto;
      padding: 1.5rem 2.5rem 3rem;
    }

    /* Footer */
    .cyber-footer {
      position: fixed;
      bottom: 0;
      left: 0;
      right: 0;
      display: flex;
      align-items: center;
      padding: 0.75rem 2rem;
      background: linear-gradient(180deg, transparent, var(--cyber-bg));
      z-index: 10;
    }

    .footer-left,
    .footer-right {
      flex: 0 0 auto;
    }

    .footer-center {
      flex: 1;
      padding: 0 2rem;
    }

    .footer-line {
      height: 1px;
      background: linear-gradient(90deg, transparent, var(--cyber-cyan), transparent);
      opacity: 0.5;
    }

    .footer-text {
      font-size: 0.7rem;
      letter-spacing: 0.1em;
      color: var(--cyber-cyan);
      opacity: 0.6;
    }

    /* Responsive */
    @media (max-width: 1200px) {
      .cyber-header { padding: 1.5rem; }
      .cyber-main { padding: 1rem 1.5rem 3rem; }
      
      .header-content {
        flex-direction: column;
        gap: 1.5rem;
      }

      .stats-panel {
        width: 100%;
      }

      .stat-box {
        flex: 1;
      }
    }

    @media (max-width: 768px) {
      .cyber-title {
        font-size: 2rem;
      }

      .stats-panel {
        flex-direction: column;
      }

      .frame-corner {
        display: none;
      }
    }
  `]
})
export class ScreenerV2Component implements OnInit {
  screenerService = inject(ScreenerService);
  marketService = inject(MarketService);
  private stockService = inject(StockService);
  private messageService = inject(MessageService);

  Math = Math;
  dataRainCols = Array.from({ length: 15 }, (_, i) => i);

  ngOnInit(): void {
    this.screenerService.runScreen();
  }

  onScreenRun(): void {
    this.screenerService.runScreen();
  }

  getRandomChars(): string[] {
    const chars = '01アイウエオカキクケコサシスセソタチツテト';
    return Array.from({ length: 20 }, () => chars[Math.floor(Math.random() * chars.length)]);
  }
}
