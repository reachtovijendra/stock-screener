import { Component, inject, OnInit, effect, signal, output, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { ButtonModule } from 'primeng/button';
import { CheckboxModule } from 'primeng/checkbox';
import { DropdownModule } from 'primeng/dropdown';
import { InputNumberModule } from 'primeng/inputnumber';
import { MultiSelectModule } from 'primeng/multiselect';
import { SelectButtonModule } from 'primeng/selectbutton';
import { TooltipModule } from 'primeng/tooltip';
import { RippleModule } from 'primeng/ripple';

import { ScreenerService, MarketService } from '../../../core/services';
import { 
  ScreenerFilters, 
  FilterPreset,
  getDefaultFilters 
} from '../../../core/models/filter.model';
import { SECTORS, Sector, MarketCapCategory } from '../../../core/models/stock.model';

interface FilterOption<T> {
  label: string;
  value: T;
}

@Component({
  selector: 'app-filter-panel-v2',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ButtonModule,
    CheckboxModule,
    DropdownModule,
    InputNumberModule,
    MultiSelectModule,
    SelectButtonModule,
    TooltipModule,
    RippleModule
  ],
  template: `
    <div class="cyber-filter-panel">
      <!-- Panel Header with scan effect -->
      <div class="panel-header">
        <div class="header-left">
          <span class="header-icon">◈</span>
          <span class="header-title">FILTER_MATRIX</span>
        </div>
        <div class="header-status">
          <span class="status-dot" [class.active]="screenerService.activeFilterCount() > 0"></span>
          <span class="status-text">{{ screenerService.activeFilterCount() }} ACTIVE</span>
        </div>
      </div>

      <!-- Filter Categories as Terminal Buttons -->
      <div class="filter-categories">
        @for (category of filterCategories; track category.id; let i = $index) {
          <button 
            class="cyber-chip"
            [class.active]="expandedCategory() === category.id"
            [class.has-value]="category.hasValue()"
            (click)="toggleCategory(category.id)"
            [style.animation-delay]="(i * 0.05) + 's'">
            <span class="chip-bracket">[</span>
            <span class="chip-code">{{ category.code }}</span>
            <span class="chip-bracket">]</span>
            <span class="chip-label">{{ category.label }}</span>
            @if (category.hasValue()) {
              <span class="chip-active-indicator"></span>
            }
          </button>
        }
      </div>

      <!-- Expanded Filter Panel with Terminal Style -->
      @if (expandedCategory()) {
        <div class="filter-expansion">
          <div class="expansion-header">
            <span class="expansion-path">> FILTER/{{ expandedCategory()?.toUpperCase() }}</span>
            <button class="close-btn" (click)="expandedCategory.set(null)">
              <span>[ESC]</span>
            </button>
          </div>
          
          <div class="expansion-content">
            <!-- Market Cap Filter -->
            @if (expandedCategory() === 'marketCap') {
              <div class="filter-section">
                <div class="section-label">> SELECT_MARKET_CAP_RANGE:</div>
                
                <div class="mode-switch">
                  <button 
                    class="mode-btn" 
                    [class.active]="filters.marketCap.mode === 'categories'"
                    (click)="filters.marketCap.mode = 'categories'; onFilterChange()">
                    [PRESET]
                  </button>
                  <button 
                    class="mode-btn" 
                    [class.active]="filters.marketCap.mode === 'custom'"
                    (click)="filters.marketCap.mode = 'custom'; onFilterChange()">
                    [CUSTOM]
                  </button>
                </div>
                
                @if (filters.marketCap.mode === 'categories') {
                  <div class="option-grid">
                    @for (cat of marketCapCategories; track cat.value) {
                      <label class="cyber-option" [class.selected]="filters.marketCap.categories.includes(cat.value)">
                        <input 
                          type="checkbox" 
                          [checked]="filters.marketCap.categories.includes(cat.value)"
                          (change)="toggleMarketCapCategory(cat.value)">
                        <span class="option-marker">{{ filters.marketCap.categories.includes(cat.value) ? '■' : '□' }}</span>
                        <span class="option-label">{{ cat.label }}</span>
                        <span class="option-range">{{ cat.range }}</span>
                      </label>
                    }
                  </div>
                } @else {
                  <div class="input-row">
                    <div class="cyber-input-group">
                      <label>MIN_VALUE</label>
                      <div class="input-field">
                        <span class="prefix">$</span>
                        <input 
                          type="number" 
                          [(ngModel)]="filters.marketCap.customRange.min"
                          (blur)="onFilterChange()"
                          placeholder="0">
                        <span class="suffix">B</span>
                      </div>
                    </div>
                    <span class="input-divider">→</span>
                    <div class="cyber-input-group">
                      <label>MAX_VALUE</label>
                      <div class="input-field">
                        <span class="prefix">$</span>
                        <input 
                          type="number" 
                          [(ngModel)]="filters.marketCap.customRange.max"
                          (blur)="onFilterChange()"
                          placeholder="∞">
                        <span class="suffix">B</span>
                      </div>
                    </div>
                  </div>
                }
              </div>
            }

            <!-- 52-Week Filter -->
            @if (expandedCategory() === '52week') {
              <div class="filter-section">
                <div class="section-label">> PRICE_POSITION_ANALYSIS:</div>
                
                <div class="quick-select">
                  <label class="cyber-toggle" [class.active]="filters.fiftyTwoWeek.nearHigh">
                    <input 
                      type="checkbox" 
                      [(ngModel)]="filters.fiftyTwoWeek.nearHigh"
                      (change)="onNearHighLowChange('high')">
                    <span class="toggle-indicator">{{ filters.fiftyTwoWeek.nearHigh ? '◉' : '○' }}</span>
                    <span class="toggle-label">NEAR_52W_HIGH</span>
                    <span class="toggle-desc">// within 5%</span>
                  </label>
                  <label class="cyber-toggle" [class.active]="filters.fiftyTwoWeek.nearLow">
                    <input 
                      type="checkbox" 
                      [(ngModel)]="filters.fiftyTwoWeek.nearLow"
                      (change)="onNearHighLowChange('low')">
                    <span class="toggle-indicator">{{ filters.fiftyTwoWeek.nearLow ? '◉' : '○' }}</span>
                    <span class="toggle-label">NEAR_52W_LOW</span>
                    <span class="toggle-desc">// within 10%</span>
                  </label>
                </div>

                <div class="section-label mt-md">> CUSTOM_RANGE:</div>
                <div class="input-row">
                  <div class="cyber-input-group">
                    <label>%_FROM_HIGH_MIN</label>
                    <div class="input-field">
                      <input 
                        type="number" 
                        [(ngModel)]="filters.fiftyTwoWeek.percentFromHigh.min"
                        (blur)="onFilterChange()"
                        placeholder="-100">
                      <span class="suffix">%</span>
                    </div>
                  </div>
                  <span class="input-divider">→</span>
                  <div class="cyber-input-group">
                    <label>%_FROM_HIGH_MAX</label>
                    <div class="input-field">
                      <input 
                        type="number" 
                        [(ngModel)]="filters.fiftyTwoWeek.percentFromHigh.max"
                        (blur)="onFilterChange()"
                        placeholder="0">
                      <span class="suffix">%</span>
                    </div>
                  </div>
                </div>
              </div>
            }

            <!-- Valuation Filter -->
            @if (expandedCategory() === 'valuation') {
              <div class="filter-section">
                <div class="section-label">> VALUATION_METRICS:</div>
                
                <div class="metrics-list">
                  <div class="metric-row">
                    <span class="metric-name">P/E_RATIO</span>
                    <div class="metric-inputs">
                      <input type="number" [(ngModel)]="filters.peRatio.min" (blur)="onFilterChange()" placeholder="MIN">
                      <span class="sep">—</span>
                      <input type="number" [(ngModel)]="filters.peRatio.max" (blur)="onFilterChange()" placeholder="MAX">
                    </div>
                  </div>
                  <div class="metric-row">
                    <span class="metric-name">FWD_P/E</span>
                    <div class="metric-inputs">
                      <input type="number" [(ngModel)]="filters.forwardPeRatio.min" (blur)="onFilterChange()" placeholder="MIN">
                      <span class="sep">—</span>
                      <input type="number" [(ngModel)]="filters.forwardPeRatio.max" (blur)="onFilterChange()" placeholder="MAX">
                    </div>
                  </div>
                  <div class="metric-row">
                    <span class="metric-name">P/B_RATIO</span>
                    <div class="metric-inputs">
                      <input type="number" [(ngModel)]="filters.pbRatio.min" (blur)="onFilterChange()" placeholder="MIN">
                      <span class="sep">—</span>
                      <input type="number" [(ngModel)]="filters.pbRatio.max" (blur)="onFilterChange()" placeholder="MAX">
                    </div>
                  </div>
                  <div class="metric-row">
                    <span class="metric-name">DIV_YIELD</span>
                    <div class="metric-inputs">
                      <input type="number" [(ngModel)]="filters.dividendYield.min" (blur)="onFilterChange()" placeholder="MIN">
                      <span class="sep">—</span>
                      <input type="number" [(ngModel)]="filters.dividendYield.max" (blur)="onFilterChange()" placeholder="MAX">
                      <span class="unit">%</span>
                    </div>
                  </div>
                </div>
              </div>
            }

            <!-- Technical Filter -->
            @if (expandedCategory() === 'technical') {
              <div class="filter-section">
                <div class="section-label">> MOVING_AVERAGE_SIGNALS:</div>
                
                <div class="tech-grid">
                  <div class="tech-row">
                    <span class="tech-label">50_DAY_MA</span>
                    <div class="tech-buttons">
                      @for (opt of maOptions; track opt.value) {
                        <button 
                          class="tech-btn"
                          [class.active]="filters.movingAverages.aboveFiftyDayMA === opt.value"
                          (click)="filters.movingAverages.aboveFiftyDayMA = opt.value; onFilterChange()">
                          {{ opt.label }}
                        </button>
                      }
                    </div>
                  </div>
                  <div class="tech-row">
                    <span class="tech-label">200_DAY_MA</span>
                    <div class="tech-buttons">
                      @for (opt of maOptions; track opt.value) {
                        <button 
                          class="tech-btn"
                          [class.active]="filters.movingAverages.aboveTwoHundredDayMA === opt.value"
                          (click)="filters.movingAverages.aboveTwoHundredDayMA = opt.value; onFilterChange()">
                          {{ opt.label }}
                        </button>
                      }
                    </div>
                  </div>
                </div>

                <div class="section-label mt-md">> CROSSOVER_SIGNALS:</div>
                <div class="cross-grid">
                  <label class="cross-option" [class.active]="filters.movingAverages.goldenCross">
                    <input type="checkbox" [(ngModel)]="filters.movingAverages.goldenCross" (change)="onFilterChange()">
                    <span class="cross-icon positive">▲</span>
                    <span class="cross-info">
                      <span class="cross-name">GOLDEN_CROSS</span>
                      <span class="cross-desc">// 50MA > 200MA</span>
                    </span>
                  </label>
                  <label class="cross-option" [class.active]="filters.movingAverages.deathCross">
                    <input type="checkbox" [(ngModel)]="filters.movingAverages.deathCross" (change)="onFilterChange()">
                    <span class="cross-icon negative">▼</span>
                    <span class="cross-info">
                      <span class="cross-name">DEATH_CROSS</span>
                      <span class="cross-desc">// 50MA < 200MA</span>
                    </span>
                  </label>
                </div>
              </div>
            }

            <!-- Volume Filter -->
            @if (expandedCategory() === 'volume') {
              <div class="filter-section">
                <div class="section-label">> VOLUME_PARAMETERS:</div>
                
                <div class="metrics-list">
                  <div class="metric-row">
                    <span class="metric-name">AVG_VOLUME</span>
                    <div class="metric-inputs">
                      <input type="number" [(ngModel)]="filters.avgVolume.min" (blur)="onFilterChange()" placeholder="MIN">
                      <span class="sep">—</span>
                      <input type="number" [(ngModel)]="filters.avgVolume.max" (blur)="onFilterChange()" placeholder="MAX">
                    </div>
                  </div>
                  <div class="metric-row">
                    <span class="metric-name">REL_VOLUME</span>
                    <div class="metric-inputs">
                      <input type="number" [(ngModel)]="filters.relativeVolume.min" (blur)="onFilterChange()" placeholder="MIN" step="0.1">
                      <span class="sep">—</span>
                      <input type="number" [(ngModel)]="filters.relativeVolume.max" (blur)="onFilterChange()" placeholder="MAX" step="0.1">
                      <span class="unit">x</span>
                    </div>
                  </div>
                </div>
              </div>
            }

            <!-- Sectors Filter -->
            @if (expandedCategory() === 'sectors') {
              <div class="filter-section">
                <div class="section-header-row">
                  <span class="section-label">> SELECT_SECTORS:</span>
                  @if (filters.sectors.length > 0) {
                    <button class="clear-btn" (click)="filters.sectors = []; onFilterChange()">[CLEAR_ALL]</button>
                  }
                </div>
                
                <div class="sector-grid">
                  @for (sector of sectorOptions; track sector.value) {
                    <label class="sector-tag" [class.selected]="filters.sectors.includes(sector.value)">
                      <input 
                        type="checkbox" 
                        [checked]="filters.sectors.includes(sector.value)"
                        (change)="toggleSector(sector.value)">
                      <span class="tag-marker">{{ filters.sectors.includes(sector.value) ? '■' : '□' }}</span>
                      <span class="tag-text">{{ sector.label }}</span>
                    </label>
                  }
                </div>
              </div>
            }

            <!-- Industry Filter -->
            @if (expandedCategory() === 'industry') {
              <div class="filter-section">
                <div class="section-header-row">
                  <span class="section-label">> SELECT_INDUSTRIES:</span>
                  @if (selectedIndustries.length > 0) {
                    <button class="clear-btn" (click)="selectedIndustries = []; onIndustryChange()">[CLEAR_ALL]</button>
                  }
                </div>
                
                @if (industryOptions().length > 0) {
                  <div class="industry-grid">
                    @for (industry of industryOptions(); track industry.value) {
                      <label class="industry-tag" [class.selected]="selectedIndustries.includes(industry.value)">
                        <input 
                          type="checkbox" 
                          [checked]="selectedIndustries.includes(industry.value)"
                          (change)="toggleIndustry(industry.value)">
                        <span class="tag-text">{{ industry.label }}</span>
                      </label>
                    }
                  </div>
                } @else {
                  <div class="empty-message">
                    <span class="blink">_</span> RUN_SCREEN_FIRST_TO_LOAD_INDUSTRIES
                  </div>
                }
              </div>
            }
          </div>
        </div>
      }

      <!-- Action Bar -->
      <div class="action-bar">
        <div class="action-left">
          @if (screenerService.activeFilterCount() > 0) {
            <button class="reset-btn" (click)="resetFilters()">
              <span class="btn-icon">↺</span>
              <span>RESET_ALL</span>
            </button>
          }
        </div>
        
        <button 
          class="execute-btn" 
          [class.loading]="screenerService.loading()" 
          [disabled]="screenerService.loading()" 
          (click)="runScreen()">
          @if (screenerService.loading()) {
            <span class="loading-spinner"></span>
            <span>SCANNING...</span>
          } @else {
            <span class="btn-icon">▶</span>
            <span>EXECUTE_SCREEN</span>
          }
        </button>
      </div>
    </div>
  `,
  styles: [`
    .cyber-filter-panel {
      background: var(--cyber-bg-card);
      border: 1px solid var(--cyber-border);
      position: relative;
      overflow: hidden;

      &::before {
        content: '';
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        height: 2px;
        background: linear-gradient(90deg, transparent, var(--cyber-cyan), transparent);
        animation: cyber-glow-pulse 2s ease-in-out infinite;
      }
    }

    /* Panel Header */
    .panel-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 0.75rem 1rem;
      background: rgba(0, 255, 242, 0.03);
      border-bottom: 1px solid var(--cyber-border);
    }

    .header-left {
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }

    .header-icon {
      color: var(--cyber-cyan);
      font-size: 1rem;
      animation: cyber-flicker 3s infinite;
    }

    .header-title {
      font-family: var(--cyber-font-display);
      font-size: 0.85rem;
      font-weight: 600;
      letter-spacing: 0.1em;
      color: var(--cyber-cyan);
      text-shadow: 0 0 10px var(--cyber-cyan-glow);
    }

    .header-status {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      font-size: 0.7rem;
      color: var(--cyber-text-dim);
    }

    .status-dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: var(--cyber-text-dim);
      transition: all 0.3s ease;

      &.active {
        background: var(--cyber-cyan);
        box-shadow: 0 0 10px var(--cyber-cyan);
        animation: radar-blink 1s infinite;
      }
    }

    /* Filter Categories */
    .filter-categories {
      display: flex;
      flex-wrap: wrap;
      gap: 0.5rem;
      padding: 1rem;
      border-bottom: 1px solid var(--cyber-border);
    }

    .cyber-chip {
      display: inline-flex;
      align-items: center;
      gap: 0.25rem;
      padding: 0.4rem 0.75rem;
      border: 1px solid var(--cyber-border);
      background: transparent;
      color: var(--cyber-text-dim);
      font-family: var(--cyber-font-mono);
      font-size: 0.75rem;
      cursor: pointer;
      transition: all 0.2s ease;
      position: relative;
      opacity: 0;
      animation: v2-scaleIn 0.3s ease forwards;

      .chip-bracket {
        color: var(--cyber-cyan);
        opacity: 0.5;
      }

      .chip-code {
        color: var(--cyber-pink);
        font-weight: 600;
      }

      .chip-label {
        color: var(--cyber-text);
        margin-left: 0.25rem;
      }

      &:hover {
        border-color: var(--cyber-cyan);
        background: var(--cyber-cyan-dim);
        box-shadow: 0 0 15px var(--cyber-cyan-dim);
      }

      &.active {
        border-color: var(--cyber-cyan);
        background: var(--cyber-cyan-dim);
        box-shadow: 0 0 20px var(--cyber-cyan-dim), inset 0 0 10px var(--cyber-cyan-dim);

        .chip-bracket, .chip-code, .chip-label {
          color: var(--cyber-cyan);
        }
      }

      &.has-value:not(.active) {
        border-color: var(--cyber-pink);

        .chip-code {
          color: var(--cyber-pink);
        }
      }
    }

    .chip-active-indicator {
      position: absolute;
      top: -3px;
      right: -3px;
      width: 8px;
      height: 8px;
      background: var(--cyber-pink);
      box-shadow: 0 0 10px var(--cyber-pink);
    }

    /* Filter Expansion */
    .filter-expansion {
      background: var(--cyber-bg);
      border-bottom: 1px solid var(--cyber-border);
      animation: v2-slideDown 0.2s ease;
    }

    .expansion-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 0.5rem 1rem;
      background: rgba(0, 255, 242, 0.02);
      border-bottom: 1px solid var(--cyber-border);
    }

    .expansion-path {
      font-family: var(--cyber-font-mono);
      font-size: 0.75rem;
      color: var(--cyber-cyan);
    }

    .close-btn {
      padding: 0.25rem 0.5rem;
      border: 1px solid var(--cyber-border);
      background: transparent;
      color: var(--cyber-text-dim);
      font-family: var(--cyber-font-mono);
      font-size: 0.65rem;
      cursor: pointer;
      transition: all 0.2s ease;

      &:hover {
        border-color: var(--cyber-negative);
        color: var(--cyber-negative);
      }
    }

    .expansion-content {
      padding: 1rem;
      max-width: 800px;
    }

    .filter-section {
      animation: v2-fadeIn 0.3s ease;
    }

    .section-label {
      font-family: var(--cyber-font-mono);
      font-size: 0.7rem;
      color: var(--cyber-cyan);
      margin-bottom: 0.75rem;
      letter-spacing: 0.05em;
    }

    .section-header-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 0.75rem;
    }

    /* Mode Switch */
    .mode-switch {
      display: flex;
      gap: 0.5rem;
      margin-bottom: 1rem;
    }

    .mode-btn {
      padding: 0.35rem 0.75rem;
      border: 1px solid var(--cyber-border);
      background: transparent;
      color: var(--cyber-text-dim);
      font-family: var(--cyber-font-mono);
      font-size: 0.7rem;
      cursor: pointer;
      transition: all 0.2s ease;

      &:hover {
        border-color: var(--cyber-cyan);
        color: var(--cyber-cyan);
      }

      &.active {
        border-color: var(--cyber-cyan);
        background: var(--cyber-cyan-dim);
        color: var(--cyber-cyan);
        box-shadow: 0 0 10px var(--cyber-cyan-dim);
      }
    }

    /* Option Grid */
    .option-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
      gap: 0.5rem;
    }

    .cyber-option {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.6rem 0.75rem;
      border: 1px solid var(--cyber-border);
      background: var(--cyber-bg-elevated);
      cursor: pointer;
      transition: all 0.2s ease;

      input { display: none; }

      &:hover {
        border-color: var(--cyber-cyan);
        background: var(--cyber-cyan-dim);
      }

      &.selected {
        border-color: var(--cyber-cyan);
        background: var(--cyber-cyan-dim);
        box-shadow: inset 0 0 15px var(--cyber-cyan-dim);
      }
    }

    .option-marker {
      color: var(--cyber-cyan);
      font-size: 0.8rem;
    }

    .option-label {
      font-family: var(--cyber-font-mono);
      font-size: 0.8rem;
      color: var(--cyber-text);
      flex: 1;
    }

    .option-range {
      font-family: var(--cyber-font-mono);
      font-size: 0.65rem;
      color: var(--cyber-text-dim);
    }

    /* Input Row */
    .input-row {
      display: flex;
      align-items: flex-end;
      gap: 1rem;
    }

    .cyber-input-group {
      flex: 1;

      label {
        display: block;
        font-family: var(--cyber-font-mono);
        font-size: 0.65rem;
        color: var(--cyber-text-dim);
        margin-bottom: 0.35rem;
        letter-spacing: 0.05em;
      }
    }

    .input-field {
      display: flex;
      align-items: center;
      border: 1px solid var(--cyber-border);
      background: var(--cyber-bg-elevated);
      transition: all 0.2s ease;

      &:focus-within {
        border-color: var(--cyber-cyan);
        box-shadow: 0 0 10px var(--cyber-cyan-dim), inset 0 0 5px var(--cyber-cyan-dim);
      }

      input {
        flex: 1;
        padding: 0.5rem;
        border: none;
        background: transparent;
        color: var(--cyber-cyan);
        font-family: var(--cyber-font-mono);
        font-size: 0.85rem;
        outline: none;
        min-width: 0;

        &::placeholder {
          color: var(--cyber-text-dim);
        }
      }

      .prefix, .suffix {
        padding: 0 0.5rem;
        color: var(--cyber-text-dim);
        font-family: var(--cyber-font-mono);
        font-size: 0.75rem;
      }
    }

    .input-divider {
      color: var(--cyber-cyan);
      font-size: 1rem;
      padding-bottom: 0.5rem;
    }

    /* Quick Select */
    .quick-select {
      display: flex;
      gap: 0.75rem;
      margin-bottom: 1rem;
    }

    .cyber-toggle {
      flex: 1;
      display: flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.75rem;
      border: 1px solid var(--cyber-border);
      background: var(--cyber-bg-elevated);
      cursor: pointer;
      transition: all 0.2s ease;

      input { display: none; }

      &:hover {
        border-color: var(--cyber-cyan);
      }

      &.active {
        border-color: var(--cyber-cyan);
        background: var(--cyber-cyan-dim);
      }
    }

    .toggle-indicator {
      color: var(--cyber-cyan);
      font-size: 1rem;
    }

    .toggle-label {
      font-family: var(--cyber-font-mono);
      font-size: 0.75rem;
      color: var(--cyber-text);
    }

    .toggle-desc {
      font-family: var(--cyber-font-mono);
      font-size: 0.65rem;
      color: var(--cyber-text-dim);
      margin-left: auto;
    }

    /* Metrics List */
    .metrics-list {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
    }

    .metric-row {
      display: flex;
      align-items: center;
      gap: 1rem;
      padding: 0.5rem;
      border: 1px solid transparent;
      transition: all 0.2s ease;

      &:hover {
        border-color: var(--cyber-border);
        background: var(--cyber-bg-elevated);
      }
    }

    .metric-name {
      width: 100px;
      font-family: var(--cyber-font-mono);
      font-size: 0.75rem;
      color: var(--cyber-text);
    }

    .metric-inputs {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      flex: 1;

      input {
        flex: 1;
        padding: 0.4rem 0.5rem;
        border: 1px solid var(--cyber-border);
        background: var(--cyber-bg-elevated);
        color: var(--cyber-cyan);
        font-family: var(--cyber-font-mono);
        font-size: 0.8rem;
        outline: none;
        min-width: 60px;
        transition: all 0.2s ease;

        &:focus {
          border-color: var(--cyber-cyan);
          box-shadow: 0 0 10px var(--cyber-cyan-dim);
        }

        &::placeholder {
          color: var(--cyber-text-dim);
        }
      }

      .sep {
        color: var(--cyber-text-dim);
        font-size: 0.8rem;
      }

      .unit {
        color: var(--cyber-text-dim);
        font-family: var(--cyber-font-mono);
        font-size: 0.7rem;
      }
    }

    /* Tech Grid */
    .tech-grid {
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
      margin-bottom: 1rem;
    }

    .tech-row {
      display: flex;
      align-items: center;
      gap: 1rem;
    }

    .tech-label {
      width: 100px;
      font-family: var(--cyber-font-mono);
      font-size: 0.75rem;
      color: var(--cyber-text);
    }

    .tech-buttons {
      display: flex;
      gap: 0.25rem;
    }

    .tech-btn {
      padding: 0.35rem 0.75rem;
      border: 1px solid var(--cyber-border);
      background: transparent;
      color: var(--cyber-text-dim);
      font-family: var(--cyber-font-mono);
      font-size: 0.7rem;
      cursor: pointer;
      transition: all 0.2s ease;

      &:hover {
        border-color: var(--cyber-cyan);
        color: var(--cyber-cyan);
      }

      &.active {
        border-color: var(--cyber-cyan);
        background: var(--cyber-cyan);
        color: var(--cyber-bg);
      }
    }

    /* Cross Grid */
    .cross-grid {
      display: flex;
      gap: 0.75rem;
    }

    .cross-option {
      flex: 1;
      display: flex;
      align-items: center;
      gap: 0.75rem;
      padding: 0.75rem;
      border: 1px solid var(--cyber-border);
      background: var(--cyber-bg-elevated);
      cursor: pointer;
      transition: all 0.2s ease;

      input { display: none; }

      &:hover {
        border-color: var(--cyber-cyan);
      }

      &.active {
        border-color: var(--cyber-cyan);
        background: var(--cyber-cyan-dim);
      }
    }

    .cross-icon {
      font-size: 1.25rem;

      &.positive {
        color: var(--cyber-positive);
        text-shadow: 0 0 10px var(--cyber-positive);
      }

      &.negative {
        color: var(--cyber-negative);
        text-shadow: 0 0 10px var(--cyber-negative);
      }
    }

    .cross-info {
      display: flex;
      flex-direction: column;
      gap: 0.15rem;
    }

    .cross-name {
      font-family: var(--cyber-font-mono);
      font-size: 0.8rem;
      color: var(--cyber-text);
    }

    .cross-desc {
      font-family: var(--cyber-font-mono);
      font-size: 0.65rem;
      color: var(--cyber-text-dim);
    }

    /* Sector/Industry Grid */
    .sector-grid, .industry-grid {
      display: flex;
      flex-wrap: wrap;
      gap: 0.4rem;
    }

    .sector-tag, .industry-tag {
      display: inline-flex;
      align-items: center;
      gap: 0.35rem;
      padding: 0.35rem 0.6rem;
      border: 1px solid var(--cyber-border);
      background: transparent;
      cursor: pointer;
      transition: all 0.2s ease;

      input { display: none; }

      &:hover {
        border-color: var(--cyber-cyan);
        background: var(--cyber-cyan-dim);
      }

      &.selected {
        border-color: var(--cyber-cyan);
        background: var(--cyber-cyan-dim);
      }
    }

    .tag-marker {
      color: var(--cyber-cyan);
      font-size: 0.7rem;
    }

    .tag-text {
      font-family: var(--cyber-font-mono);
      font-size: 0.7rem;
      color: var(--cyber-text);
    }

    .clear-btn {
      padding: 0.25rem 0.5rem;
      border: none;
      background: transparent;
      color: var(--cyber-text-dim);
      font-family: var(--cyber-font-mono);
      font-size: 0.65rem;
      cursor: pointer;
      transition: all 0.2s ease;

      &:hover {
        color: var(--cyber-negative);
      }
    }

    .empty-message {
      padding: 1rem;
      font-family: var(--cyber-font-mono);
      font-size: 0.75rem;
      color: var(--cyber-text-dim);

      .blink {
        animation: radar-blink 1s infinite;
      }
    }

    /* Action Bar */
    .action-bar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 0.75rem 1rem;
      background: rgba(0, 255, 242, 0.02);
      border-top: 1px solid var(--cyber-border);
    }

    .reset-btn {
      display: inline-flex;
      align-items: center;
      gap: 0.35rem;
      padding: 0.4rem 0.75rem;
      border: 1px solid var(--cyber-border);
      background: transparent;
      color: var(--cyber-text-dim);
      font-family: var(--cyber-font-mono);
      font-size: 0.7rem;
      cursor: pointer;
      transition: all 0.2s ease;

      &:hover {
        border-color: var(--cyber-negative);
        color: var(--cyber-negative);
      }
    }

    .execute-btn {
      display: inline-flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.6rem 1.5rem;
      border: 2px solid var(--cyber-cyan);
      background: var(--cyber-cyan-dim);
      color: var(--cyber-cyan);
      font-family: var(--cyber-font-display);
      font-size: 0.85rem;
      font-weight: 600;
      letter-spacing: 0.1em;
      cursor: pointer;
      transition: all 0.2s ease;
      text-shadow: 0 0 10px var(--cyber-cyan-glow);
      box-shadow: 0 0 20px var(--cyber-cyan-dim), inset 0 0 20px var(--cyber-cyan-dim);

      &:hover:not(:disabled) {
        background: var(--cyber-cyan);
        color: var(--cyber-bg);
        box-shadow: 0 0 30px var(--cyber-cyan-glow);
      }

      &:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }
    }

    .loading-spinner {
      width: 14px;
      height: 14px;
      border: 2px solid transparent;
      border-top-color: currentColor;
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
    }

    @keyframes spin {
      to { transform: rotate(360deg); }
    }

    /* Utilities */
    .mt-md { margin-top: 1rem; }

    /* Responsive */
    @media (max-width: 768px) {
      .filter-categories {
        padding: 0.75rem;
      }

      .expansion-content {
        padding: 0.75rem;
      }

      .option-grid {
        grid-template-columns: 1fr;
      }

      .quick-select, .cross-grid {
        flex-direction: column;
      }

      .input-row {
        flex-direction: column;
        gap: 0.75rem;
      }

      .input-divider {
        display: none;
      }

      .metric-row {
        flex-direction: column;
        align-items: flex-start;
        gap: 0.5rem;
      }

      .metric-name {
        width: auto;
      }

      .metric-inputs {
        width: 100%;
      }

      .tech-row {
        flex-direction: column;
        align-items: flex-start;
        gap: 0.5rem;
      }

      .action-bar {
        flex-direction: column;
        gap: 0.75rem;
      }

      .execute-btn {
        width: 100%;
        justify-content: center;
      }
    }
  `]
})
export class FilterPanelV2Component implements OnInit {
  screenerService = inject(ScreenerService);
  marketService = inject(MarketService);

  screenRun = output<void>();

  filters!: ScreenerFilters;
  expandedCategory = signal<string | null>(null);
  selectedIndustries: string[] = [];

  filterCategories = [
    { id: 'marketCap', label: 'MCAP', code: '01', icon: 'pi pi-building', hasValue: () => this.hasMarketCapFilter() },
    { id: '52week', label: '52WK', code: '02', icon: 'pi pi-calendar', hasValue: () => this.has52WeekFilter() },
    { id: 'valuation', label: 'VAL', code: '03', icon: 'pi pi-dollar', hasValue: () => this.hasValuationFilter() },
    { id: 'technical', label: 'TECH', code: '04', icon: 'pi pi-chart-line', hasValue: () => this.hasTechnicalFilter() },
    { id: 'volume', label: 'VOL', code: '05', icon: 'pi pi-chart-bar', hasValue: () => this.hasVolumeFilter() },
    { id: 'sectors', label: 'SEC', code: '06', icon: 'pi pi-th-large', hasValue: () => this.filters?.sectors?.length > 0 },
    { id: 'industry', label: 'IND', code: '07', icon: 'pi pi-briefcase', hasValue: () => this.selectedIndustries.length > 0 }
  ];

  marketCapCategories = [
    { label: 'MEGA_CAP', value: 'mega' as MarketCapCategory, range: '$200B+' },
    { label: 'LARGE_CAP', value: 'large' as MarketCapCategory, range: '$10B-$200B' },
    { label: 'MID_CAP', value: 'mid' as MarketCapCategory, range: '$2B-$10B' },
    { label: 'SMALL_CAP', value: 'small' as MarketCapCategory, range: '$300M-$2B' },
    { label: 'MICRO_CAP', value: 'micro' as MarketCapCategory, range: '<$300M' }
  ];

  maOptions = [
    { label: 'ANY', value: null },
    { label: 'ABOVE', value: true },
    { label: 'BELOW', value: false }
  ];

  sectorOptions = SECTORS.map(sector => ({ label: sector.toUpperCase().replace(/ /g, '_'), value: sector }));

  industryOptions = computed(() => {
    const stocks = this.screenerService.getCachedStocks();
    let filteredStocks = stocks;
    if (this.filters && this.filters.sectors.length > 0) {
      const sectorSet = new Set<string>(this.filters.sectors);
      filteredStocks = stocks.filter(s => sectorSet.has(s.sector));
    }
    const industries = [...new Set(filteredStocks.map(s => s.industry).filter(i => i && i !== 'Unknown'))].sort();
    return industries.map(i => ({ label: i.toUpperCase().replace(/ /g, '_'), value: i }));
  });

  constructor() {
    effect(() => {
      const serviceFilters = this.screenerService.filters();
      this.filters = JSON.parse(JSON.stringify(serviceFilters));
    });

    effect(() => {
      const market = this.marketService.currentMarket();
      this.filters = getDefaultFilters(market);
      this.screenerService.setMarket(market);
    });
  }

  ngOnInit(): void {
    this.filters = JSON.parse(JSON.stringify(this.screenerService.filters()));
  }

  toggleCategory(categoryId: string): void {
    if (this.expandedCategory() === categoryId) {
      this.expandedCategory.set(null);
    } else {
      this.expandedCategory.set(categoryId);
    }
  }

  onFilterChange(): void {
    this.screenerService.updateFilters(this.filters, false);
  }

  toggleMarketCapCategory(value: MarketCapCategory): void {
    const index = this.filters.marketCap.categories.indexOf(value);
    if (index >= 0) {
      this.filters.marketCap.categories.splice(index, 1);
    } else {
      this.filters.marketCap.categories.push(value);
    }
    this.onFilterChange();
  }

  onNearHighLowChange(type: 'high' | 'low'): void {
    if (type === 'high' && this.filters.fiftyTwoWeek.nearHigh) {
      this.filters.fiftyTwoWeek.percentFromHigh = { min: -5, max: 0 };
      this.filters.fiftyTwoWeek.nearLow = false;
    } else if (type === 'low' && this.filters.fiftyTwoWeek.nearLow) {
      this.filters.fiftyTwoWeek.percentFromLow = { min: 0, max: 10 };
      this.filters.fiftyTwoWeek.nearHigh = false;
    }
    this.onFilterChange();
  }

  toggleSector(value: Sector): void {
    const index = this.filters.sectors.indexOf(value);
    if (index >= 0) {
      this.filters.sectors.splice(index, 1);
    } else {
      this.filters.sectors.push(value);
    }
    this.onFilterChange();
    this.selectedIndustries = [];
    this.screenerService.setIndustryFilter([]);
  }

  toggleIndustry(value: string): void {
    const index = this.selectedIndustries.indexOf(value);
    if (index >= 0) {
      this.selectedIndustries.splice(index, 1);
    } else {
      this.selectedIndustries.push(value);
    }
    this.onIndustryChange();
  }

  onIndustryChange(): void {
    this.screenerService.setIndustryFilter(this.selectedIndustries);
  }

  resetFilters(): void {
    this.screenerService.resetFilters();
    this.filters = getDefaultFilters(this.marketService.currentMarket());
    this.selectedIndustries = [];
    this.expandedCategory.set(null);
  }

  runScreen(): void {
    this.screenerService.updateFilters(this.filters, true);
    this.screenRun.emit();
  }

  hasMarketCapFilter(): boolean {
    if (!this.filters) return false;
    if (this.filters.marketCap.mode === 'categories' && this.filters.marketCap.categories.length > 0) return true;
    if (this.filters.marketCap.mode === 'custom' && (this.filters.marketCap.customRange.min != null || this.filters.marketCap.customRange.max != null)) return true;
    return false;
  }

  has52WeekFilter(): boolean {
    if (!this.filters) return false;
    if (this.filters.fiftyTwoWeek.nearHigh || this.filters.fiftyTwoWeek.nearLow) return true;
    if (this.filters.fiftyTwoWeek.percentFromHigh.min != null || this.filters.fiftyTwoWeek.percentFromHigh.max != null) return true;
    return false;
  }

  hasValuationFilter(): boolean {
    if (!this.filters) return false;
    if (this.filters.peRatio.min != null || this.filters.peRatio.max != null) return true;
    if (this.filters.forwardPeRatio.min != null || this.filters.forwardPeRatio.max != null) return true;
    if (this.filters.pbRatio.min != null || this.filters.pbRatio.max != null) return true;
    if (this.filters.dividendYield.min != null || this.filters.dividendYield.max != null) return true;
    return false;
  }

  hasTechnicalFilter(): boolean {
    if (!this.filters) return false;
    if (this.filters.movingAverages.aboveFiftyDayMA != null) return true;
    if (this.filters.movingAverages.aboveTwoHundredDayMA != null) return true;
    if (this.filters.movingAverages.goldenCross || this.filters.movingAverages.deathCross) return true;
    return false;
  }

  hasVolumeFilter(): boolean {
    if (!this.filters) return false;
    if (this.filters.avgVolume.min != null || this.filters.avgVolume.max != null) return true;
    if (this.filters.relativeVolume.min != null || this.filters.relativeVolume.max != null) return true;
    return false;
  }
}
