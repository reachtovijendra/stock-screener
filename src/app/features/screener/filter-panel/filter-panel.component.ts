import { ChangeDetectionStrategy, Component, inject, OnInit, OnDestroy, effect, signal, output, ViewChild, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

// PrimeNG Modules
import { AccordionModule } from 'primeng/accordion';
import { ButtonModule } from 'primeng/button';
import { CheckboxModule } from 'primeng/checkbox';
import { DividerModule } from 'primeng/divider';
import { DropdownModule } from 'primeng/dropdown';
import { InputNumberModule } from 'primeng/inputnumber';
import { MultiSelectModule } from 'primeng/multiselect';
import { PanelModule } from 'primeng/panel';
import { SelectButtonModule } from 'primeng/selectbutton';
import { SliderModule } from 'primeng/slider';
import { TooltipModule } from 'primeng/tooltip';
import { TagModule } from 'primeng/tag';
import { RippleModule } from 'primeng/ripple';
import { FloatLabelModule } from 'primeng/floatlabel';
import { OverlayPanelModule, OverlayPanel } from 'primeng/overlaypanel';

import { ScreenerService, MarketService, TopMoverPeriod, TopMoverType } from '../../../core/services';
import { 
  ScreenerFilters, 
  FilterPreset,
  getDefaultFilters 
} from '../../../core/models/filter.model';
import { SECTORS, Market, MarketCapCategory } from '../../../core/models/stock.model';

interface FilterOption<T> {
  label: string;
  value: T;
}

@Component({
  selector: 'app-filter-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    FormsModule,
    AccordionModule,
    ButtonModule,
    CheckboxModule,
    DividerModule,
    DropdownModule,
    InputNumberModule,
    MultiSelectModule,
    PanelModule,
    SelectButtonModule,
    SliderModule,
    TooltipModule,
    TagModule,
    RippleModule,
    FloatLabelModule,
    OverlayPanelModule
  ],
  template: `
    <section class="filter-command-panel" aria-label="Screener command center">
      <div class="filter-bar">
        <!-- Filter Dropdown Buttons -->
        <div class="filter-buttons">
        <!-- Universe -->
        <button class="filter-trigger" [class.has-value]="hasUniverseFilter()" (click)="opUniverse.toggle($event)">
          <i class="pi pi-building"></i>
          <span>Universe</span>
          @if (universeFilterCount() > 0) {
            <span class="filter-count">{{ universeFilterCount() }}</span>
          }
          <i class="pi pi-chevron-down arrow"></i>
        </button>
        <p-overlayPanel #opUniverse styleClass="screener-filter-overlay universe-filter-overlay" [style]="{'width': '640px', 'max-width': 'calc(100vw - 32px)'}" appendTo="body">
          <div class="overlay-content universe-overlay-content">
            <div class="filter-card-header">
              <div>
                <div class="overlay-title">Universe</div>
                <p>Define the tradable universe before applying signal filters.</p>
              </div>
              <button type="button" class="clear-section-action" (click)="clearUniverseFilters()">Clear</button>
            </div>
            <div class="preset-row">
              <button type="button" class="preset-chip" (click)="applyUniversePreset('large-liquid')">Large Liquid</button>
              <button type="button" class="preset-chip" (click)="applyUniversePreset('mid-plus')">Mid+</button>
            </div>
            <div class="section-block">
              <span class="range-filter-label">Market Cap</span>
            <div class="toggle-row">
              <p-selectButton 
                [options]="marketCapModeOptions" 
                [(ngModel)]="filters.marketCap.mode"
                (onChange)="onFilterChange()"
                [allowEmpty]="false"
                styleClass="compact-toggle">
              </p-selectButton>
            </div>
            @if (filters.marketCap.mode === 'categories') {
              <div class="checkbox-grid market-cap-grid">
                @for (cat of marketCapCategories; track cat.value) {
                  <label class="checkbox-item">
                    <p-checkbox 
                      [inputId]="'cap-' + cat.value"
                      [value]="cat.value"
                      [(ngModel)]="filters.marketCap.categories"
                      (onChange)="onFilterChange()">
                    </p-checkbox>
                    <span>{{ cat.label }}</span>
                  </label>
                }
              </div>
            } @else {
              <div class="range-inputs">
                <input type="number" class="range-input" [(ngModel)]="filters.marketCap.customRange.min" (blur)="onFilterChange()" placeholder="Min ($B)">
                <span class="range-separator">—</span>
                <input type="number" class="range-input" [(ngModel)]="filters.marketCap.customRange.max" (blur)="onFilterChange()" placeholder="Max ($B)">
              </div>
            }
            </div>
            <div class="filter-grid universe-lower-grid">
              <div class="range-filter-row">
                <span class="range-filter-label">Price</span>
                <div class="range-inputs">
                  <input type="number" class="range-input" [(ngModel)]="filters.price.min" (blur)="onFilterChange()" placeholder="Min">
                  <span class="range-separator">—</span>
                  <input type="number" class="range-input" [(ngModel)]="filters.price.max" (blur)="onFilterChange()" placeholder="Max">
                </div>
              </div>
              <div class="range-filter-row">
                <span class="range-filter-label">Exchange</span>
                <div class="checkbox-grid compact">
                  @for (exchange of exchangeOptions(); track exchange.value) {
                    <label class="checkbox-item">
                      <p-checkbox
                        [inputId]="'exchange-' + exchange.value"
                        [value]="exchange.value"
                        [(ngModel)]="filters.exchanges"
                        (onChange)="onFilterChange()">
                      </p-checkbox>
                      <span>{{ exchange.label }}</span>
                    </label>
                  }
                </div>
              </div>
            </div>
            <div class="filter-grid universe-lower-grid universe-select-grid">
              <div class="range-filter-row">
                <span class="range-filter-label">Sector</span>
                <p-multiSelect
                  [style]="filterMultiselectStyle"
                  [options]="sectorOptions"
                  [(ngModel)]="filters.sectors"
                  (onChange)="onSectorChange()"
                  placeholder="All Sectors"
                  display="chip"
                  [showClear]="true"
                  [filter]="true"
                  filterPlaceholder="Search..."
                  appendTo="body"
                  panelStyleClass="modern-multiselect-panel"
                  styleClass="w-full compact-multiselect">
                </p-multiSelect>
              </div>
              <div class="range-filter-row">
                <span class="range-filter-label">Industry</span>
                <p-multiSelect
                  [style]="filterMultiselectStyle"
                  [options]="industryOptions()"
                  [(ngModel)]="selectedIndustries"
                  (onChange)="onIndustryChange()"
                  [placeholder]="industryOptions().length > 0 ? 'All Industries' : 'Run screen first'"
                  display="chip"
                  [showClear]="true"
                  [filter]="true"
                  filterPlaceholder="Search..."
                  appendTo="body"
                  panelStyleClass="modern-multiselect-panel"
                  styleClass="w-full compact-multiselect">
                </p-multiSelect>
              </div>
            </div>
          </div>
        </p-overlayPanel>

        <!-- Valuation -->
        <button class="filter-trigger" [class.has-value]="hasValuationFilter()" (click)="opValuation.toggle($event)">
          <i class="pi pi-dollar"></i>
          <span>Valuation</span>
          @if (valuationFilterCount() > 0) {
            <span class="filter-count">{{ valuationFilterCount() }}</span>
          }
          <i class="pi pi-chevron-down arrow"></i>
        </button>
        <p-overlayPanel #opValuation styleClass="screener-filter-overlay" [style]="{'width': '400px'}" appendTo="body">
          <div class="overlay-content">
            <div class="filter-card-header">
              <div>
                <div class="overlay-title">Valuation</div>
                <p>Find stocks by price discipline and multiple quality.</p>
              </div>
              <button type="button" class="clear-section-action" (click)="clearValuationFilters()">Clear</button>
            </div>
            <div class="preset-row">
              <button type="button" class="preset-chip" (click)="applyValuationPreset('cheap')">Cheap</button>
              <button type="button" class="preset-chip" (click)="applyValuationPreset('reasonable')">Reasonable</button>
              <button type="button" class="preset-chip" (click)="applyValuationPreset('premium')">Premium</button>
            </div>
            <div class="filter-grid">
              <div class="range-filter-row">
                <span class="range-filter-label">P/E</span>
                <div class="range-inputs">
                  <input type="number" class="range-input" [(ngModel)]="filters.peRatio.min" (blur)="onFilterChange()" placeholder="Min" step="0.1">
                  <span class="range-separator">—</span>
                  <input type="number" class="range-input" [(ngModel)]="filters.peRatio.max" (blur)="onFilterChange()" placeholder="Max" step="0.1">
                </div>
              </div>
              <div class="range-filter-row">
                <span class="range-filter-label">Forward P/E</span>
                <div class="range-inputs">
                  <input type="number" class="range-input" [(ngModel)]="filters.forwardPeRatio.min" (blur)="onFilterChange()" placeholder="Min" step="0.1">
                  <span class="range-separator">—</span>
                  <input type="number" class="range-input" [(ngModel)]="filters.forwardPeRatio.max" (blur)="onFilterChange()" placeholder="Max" step="0.1">
                </div>
              </div>
              <div class="range-filter-row">
                <span class="range-filter-label">P/B</span>
                <div class="range-inputs">
                  <input type="number" class="range-input" [(ngModel)]="filters.pbRatio.min" (blur)="onFilterChange()" placeholder="Min" step="0.1">
                  <span class="range-separator">—</span>
                  <input type="number" class="range-input" [(ngModel)]="filters.pbRatio.max" (blur)="onFilterChange()" placeholder="Max" step="0.1">
                </div>
              </div>
              <div class="range-filter-row">
                <span class="range-filter-label">P/S</span>
                <div class="range-inputs">
                  <input type="number" class="range-input" [(ngModel)]="filters.psRatio.min" (blur)="onFilterChange()" placeholder="Min" step="0.1">
                  <span class="range-separator">—</span>
                  <input type="number" class="range-input" [(ngModel)]="filters.psRatio.max" (blur)="onFilterChange()" placeholder="Max" step="0.1">
                </div>
              </div>
            </div>
          </div>
        </p-overlayPanel>

        <!-- Growth & Income -->
        <button class="filter-trigger" [class.has-value]="hasGrowthIncomeFilter()" (click)="opGrowthIncome.toggle($event)">
          <i class="pi pi-chart-line"></i>
          <span>Growth & Income</span>
          @if (growthIncomeFilterCount() > 0) {
            <span class="filter-count">{{ growthIncomeFilterCount() }}</span>
          }
          <i class="pi pi-chevron-down arrow"></i>
        </button>
        <p-overlayPanel #opGrowthIncome styleClass="screener-filter-overlay" [style]="{'width': '400px'}" appendTo="body">
          <div class="overlay-content">
            <div class="filter-card-header">
              <div>
                <div class="overlay-title">Growth & Income</div>
                <p>Screen for expanding fundamentals, EPS quality, and yield.</p>
              </div>
              <button type="button" class="clear-section-action" (click)="clearGrowthIncomeFilters()">Clear</button>
            </div>
            <div class="preset-row">
              <button type="button" class="preset-chip" (click)="applyGrowthIncomePreset('growth')">Growth</button>
              <button type="button" class="preset-chip" (click)="applyGrowthIncomePreset('dividend')">Dividend</button>
              <button type="button" class="preset-chip" (click)="applyGrowthIncomePreset('profitable')">Profitable</button>
            </div>
            <div class="filter-grid">
              <div class="range-filter-row">
                <span class="range-filter-label">Earnings Growth %</span>
                <div class="range-inputs">
                  <input type="number" class="range-input" [(ngModel)]="filters.earningsGrowth.min" (blur)="onFilterChange()" placeholder="Min">
                  <span class="range-separator">—</span>
                  <input type="number" class="range-input" [(ngModel)]="filters.earningsGrowth.max" (blur)="onFilterChange()" placeholder="Max">
                </div>
              </div>
              <div class="range-filter-row">
                <span class="range-filter-label">Revenue Growth %</span>
                <div class="range-inputs">
                  <input type="number" class="range-input" [(ngModel)]="filters.revenueGrowth.min" (blur)="onFilterChange()" placeholder="Min">
                  <span class="range-separator">—</span>
                  <input type="number" class="range-input" [(ngModel)]="filters.revenueGrowth.max" (blur)="onFilterChange()" placeholder="Max">
                </div>
              </div>
              <div class="range-filter-row">
                <span class="range-filter-label">EPS</span>
                <div class="range-inputs">
                  <input type="number" class="range-input" [(ngModel)]="filters.eps.min" (blur)="onFilterChange()" placeholder="Min" step="0.1">
                  <span class="range-separator">—</span>
                  <input type="number" class="range-input" [(ngModel)]="filters.eps.max" (blur)="onFilterChange()" placeholder="Max" step="0.1">
                </div>
              </div>
              <div class="range-filter-row">
                <span class="range-filter-label">Dividend Yield %</span>
              <div class="range-inputs">
                  <input type="number" class="range-input" [(ngModel)]="filters.dividendYield.min" (blur)="onFilterChange()" placeholder="Min" step="0.01">
                <span class="range-separator">—</span>
                  <input type="number" class="range-input" [(ngModel)]="filters.dividendYield.max" (blur)="onFilterChange()" placeholder="Max" step="0.01">
              </div>
            </div>
          </div>
          </div>
        </p-overlayPanel>

        <!-- Momentum -->
        <button class="filter-trigger" [class.has-value]="hasMomentumFilter()" (click)="opMomentum.toggle($event)">
          <i class="pi pi-calendar"></i>
          <span>Momentum</span>
          @if (momentumFilterCount() > 0) {
            <span class="filter-count">{{ momentumFilterCount() }}</span>
          }
          <i class="pi pi-chevron-down arrow"></i>
        </button>
        <p-overlayPanel #opMomentum styleClass="screener-filter-overlay" [style]="{'width': '440px'}" appendTo="body">
          <div class="overlay-content">
            <div class="filter-card-header">
              <div>
                <div class="overlay-title">Momentum</div>
                <p>Track 52-week position and trend structure.</p>
              </div>
              <button type="button" class="clear-section-action" (click)="clearMomentumFilters()">Clear</button>
            </div>
            <div class="preset-row">
              <button type="button" class="preset-chip" (click)="applyMomentumPreset('near-high')">Near High</button>
              <button type="button" class="preset-chip" (click)="applyMomentumPreset('bounce')">Bounce Zone</button>
              <button type="button" class="preset-chip" (click)="applyMomentumPreset('uptrend')">Uptrend</button>
            </div>
            <div class="checkbox-col">
                <label class="checkbox-item">
                  <p-checkbox
                    inputId="nearHigh"
                    [(ngModel)]="filters.fiftyTwoWeek.nearHigh"
                    [binary]="true"
                    (onChange)="onNearHighLowChange('high')">
                  </p-checkbox>
                  <span>Near 52W High (5%)</span>
                </label>
                <label class="checkbox-item">
                  <p-checkbox
                    inputId="nearLow"
                    [(ngModel)]="filters.fiftyTwoWeek.nearLow"
                    [binary]="true"
                    (onChange)="onNearHighLowChange('low')">
                  </p-checkbox>
                  <span>Near 52W Low (10%)</span>
                </label>
            </div>
            <div class="filter-grid">
              <div class="range-filter-row">
                <span class="range-filter-label">% From High</span>
                <div class="range-inputs">
                  <input type="number" class="range-input" [(ngModel)]="filters.fiftyTwoWeek.percentFromHigh.min" (blur)="onFilterChange()" placeholder="Min %" step="0.1">
                  <span class="range-separator">—</span>
                  <input type="number" class="range-input" [(ngModel)]="filters.fiftyTwoWeek.percentFromHigh.max" (blur)="onFilterChange()" placeholder="Max %" step="0.1">
                </div>
              </div>
              <div class="range-filter-row">
                <span class="range-filter-label">% From Low</span>
                <div class="range-inputs">
                  <input type="number" class="range-input" [(ngModel)]="filters.fiftyTwoWeek.percentFromLow.min" (blur)="onFilterChange()" placeholder="Min %" step="0.1">
                  <span class="range-separator">—</span>
                  <input type="number" class="range-input" [(ngModel)]="filters.fiftyTwoWeek.percentFromLow.max" (blur)="onFilterChange()" placeholder="Max %" step="0.1">
                </div>
              </div>
              <div class="ma-filter-row">
                <span class="ma-filter-label">50-Day MA</span>
                <p-selectButton
                  [options]="maOptions"
                  [(ngModel)]="filters.movingAverages.aboveFiftyDayMA"
                  (onChange)="onFilterChange()"
                  optionLabel="label"
                  optionValue="value"
                  styleClass="ma-toggle">
                </p-selectButton>
              </div>
              <div class="ma-filter-row">
                <span class="ma-filter-label">200-Day MA</span>
                <p-selectButton
                  [options]="maOptions"
                  [(ngModel)]="filters.movingAverages.aboveTwoHundredDayMA"
                  (onChange)="onFilterChange()"
                  optionLabel="label"
                  optionValue="value"
                  styleClass="ma-toggle">
                </p-selectButton>
              </div>
            </div>
              <div class="checkbox-grid">
                <label class="checkbox-item">
                  <p-checkbox
                    inputId="goldenCross"
                    [(ngModel)]="filters.movingAverages.goldenCross"
                    [binary]="true"
                    (onChange)="onFilterChange()">
                  </p-checkbox>
                  <span pTooltip="50 MA above 200 MA" tooltipPosition="top">Golden Cross</span>
                </label>
                <label class="checkbox-item">
                  <p-checkbox
                    inputId="deathCross"
                    [(ngModel)]="filters.movingAverages.deathCross"
                    [binary]="true"
                    (onChange)="onFilterChange()">
                  </p-checkbox>
                  <span pTooltip="50 MA below 200 MA" tooltipPosition="top">Death Cross</span>
                </label>
              </div>
          </div>
        </p-overlayPanel>

        <!-- Liquidity -->
        <button class="filter-trigger" [class.has-value]="hasLiquidityFilter()" (click)="opLiquidity.toggle($event)">
          <i class="pi pi-chart-bar"></i>
          <span>Liquidity</span>
          @if (liquidityFilterCount() > 0) {
            <span class="filter-count">{{ liquidityFilterCount() }}</span>
          }
          <i class="pi pi-chevron-down arrow"></i>
        </button>
        <p-overlayPanel #opLiquidity styleClass="screener-filter-overlay" [style]="{'width': '380px'}" appendTo="body">
          <div class="overlay-content">
            <div class="filter-card-header">
              <div>
                <div class="overlay-title">Liquidity</div>
                <p>Filter for tradability, unusual volume, and volatility.</p>
              </div>
              <button type="button" class="clear-section-action" (click)="clearLiquidityFilters()">Clear</button>
            </div>
            <div class="preset-row">
              <button type="button" class="preset-chip" (click)="applyLiquidityPreset('liquid')">Liquid</button>
              <button type="button" class="preset-chip" (click)="applyLiquidityPreset('unusual')">Unusual Volume</button>
              <button type="button" class="preset-chip" (click)="applyLiquidityPreset('steady')">Steady Beta</button>
            </div>
            <div class="filter-grid">
              <div class="range-filter-row">
                <span class="range-filter-label">Avg Daily Volume</span>
                <div class="range-inputs">
                  <input type="number" class="range-input" [(ngModel)]="filters.avgVolume.min" (blur)="onFilterChange()" placeholder="Min">
                  <span class="range-separator">—</span>
                  <input type="number" class="range-input" [(ngModel)]="filters.avgVolume.max" (blur)="onFilterChange()" placeholder="Max">
                </div>
              </div>
              <div class="range-filter-row">
                <span class="range-filter-label">Relative Volume</span>
                <div class="range-inputs">
                  <input type="number" class="range-input" [(ngModel)]="filters.relativeVolume.min" (blur)="onFilterChange()" placeholder="Min" step="0.1">
                  <span class="range-separator">—</span>
                  <input type="number" class="range-input" [(ngModel)]="filters.relativeVolume.max" (blur)="onFilterChange()" placeholder="Max" step="0.1">
                </div>
              </div>
              <div class="range-filter-row">
                <span class="range-filter-label">Beta</span>
                <div class="range-inputs">
                  <input type="number" class="range-input" [(ngModel)]="filters.beta.min" (blur)="onFilterChange()" placeholder="Min" step="0.1">
                  <span class="range-separator">—</span>
                  <input type="number" class="range-input" [(ngModel)]="filters.beta.max" (blur)="onFilterChange()" placeholder="Max" step="0.1">
                </div>
              </div>
            </div>
          </div>
        </p-overlayPanel>

        <!-- Technical Signals -->
        <button class="filter-trigger" [class.has-value]="hasTechnicalSignalFilter()" (click)="opTechnicalSignals.toggle($event)">
          <i class="pi pi-bolt"></i>
          <span>Technical Signals</span>
          @if (technicalSignalFilterCount() > 0) {
            <span class="filter-count">{{ technicalSignalFilterCount() }}</span>
          }
          <i class="pi pi-chevron-down arrow"></i>
        </button>
        <p-overlayPanel #opTechnicalSignals styleClass="screener-filter-overlay" [style]="{'width': '450px'}" appendTo="body">
          <div class="overlay-content">
            <div class="filter-card-header">
              <div>
                <div class="overlay-title">Technical Signals</div>
                <p>Requires technical calculations after the result universe loads.</p>
              </div>
              <button type="button" class="clear-section-action" (click)="clearTechnicalSignalFilters()">Clear</button>
            </div>
            <div class="section-block">
              <span class="range-filter-label">RSI Zones</span>
              <div class="signal-chip-grid">
                @for (zone of rsiZones; track zone.id) {
                  <button
                    type="button"
                    class="signal-chip"
                    [class.active]="filters.rsi.zones.includes(zone.id)"
                    (click)="toggleRsiZone(zone.id)"
                    [pTooltip]="zone.description"
                    tooltipPosition="top">
                    {{ zone.label }}
                  </button>
                }
              </div>
              <div class="range-inputs">
                <input type="number" class="range-input" [(ngModel)]="filters.rsi.customRange.min" (blur)="onFilterChange()" placeholder="RSI min">
                <span class="range-separator">—</span>
                <input type="number" class="range-input" [(ngModel)]="filters.rsi.customRange.max" (blur)="onFilterChange()" placeholder="RSI max">
              </div>
            </div>
            <div class="section-block">
              <span class="range-filter-label">MACD Signals</span>
              <div class="signal-chip-grid">
                @for (signal of macdSignals; track signal.id) {
                  <button
                    type="button"
                    class="signal-chip"
                    [class.active]="filters.macd.signals.includes(signal.id)"
                    (click)="toggleMacdSignal(signal.id)"
                    [pTooltip]="signal.description"
                    tooltipPosition="top">
                    <i class="pi {{ signal.icon }}"></i>
                    {{ signal.label }}
                  </button>
                }
              </div>
            </div>
          </div>
        </p-overlayPanel>
        </div>

        <!-- Action Buttons -->
        <div class="filter-actions">
        <div class="mover-action-group loser">
          <button
            class="mover-action loser"
            [class.active]="screenerService.activeQuickView() === 'top-losers'"
            [class.loading]="screenerService.loading() && screenerService.activeQuickView() === 'top-losers'"
            [disabled]="screenerService.loading()"
            (click)="runTopMovers('losers')"
            title="Rank the full selected market by the worst price changes">
            @if (screenerService.loading() && screenerService.activeQuickView() === 'top-losers') {
              <i class="pi pi-spin pi-spinner"></i>
            } @else {
              <i class="pi pi-arrow-down"></i>
            }
            <span>Top Losers</span>
            <span class="period-badge">{{ screenerService.getMoverPeriodLabel(topLosersPeriod()) }}</span>
          </button>
          <button
            class="mover-period-trigger loser"
            [disabled]="screenerService.loading()"
            (click)="opTopLosers.toggle($event)"
            aria-label="Change Top Losers period">
            <i class="pi pi-chevron-down"></i>
          </button>
        </div>
        <p-overlayPanel #opTopLosers styleClass="screener-filter-overlay compact-period-overlay" [style]="{'width': '210px'}" appendTo="body">
          <div class="mover-period-menu">
            <div class="overlay-title">Top Losers Period</div>
            @for (period of moverPeriods; track period.value) {
              <button
                type="button"
                class="period-option loser"
                [class.active]="topLosersPeriod() === period.value"
                (click)="selectTopMoverPeriod('losers', period.value, opTopLosers)">
                <span>{{ period.label }}</span>
                <small>{{ period.description }}</small>
              </button>
            }
          </div>
        </p-overlayPanel>

        <div class="mover-action-group gainer">
          <button
            class="mover-action gainer"
            [class.active]="screenerService.activeQuickView() === 'top-gainers'"
            [class.loading]="screenerService.loading() && screenerService.activeQuickView() === 'top-gainers'"
            [disabled]="screenerService.loading()"
            (click)="runTopMovers('gainers')"
            title="Rank the full selected market by the strongest price changes">
            @if (screenerService.loading() && screenerService.activeQuickView() === 'top-gainers') {
              <i class="pi pi-spin pi-spinner"></i>
            } @else {
              <i class="pi pi-arrow-up"></i>
            }
            <span>Top Gainers</span>
            <span class="period-badge">{{ screenerService.getMoverPeriodLabel(topGainersPeriod()) }}</span>
          </button>
          <button
            class="mover-period-trigger gainer"
            [disabled]="screenerService.loading()"
            (click)="opTopGainers.toggle($event)"
            aria-label="Change Top Gainers period">
            <i class="pi pi-chevron-down"></i>
          </button>
        </div>
        <p-overlayPanel #opTopGainers styleClass="screener-filter-overlay compact-period-overlay" [style]="{'width': '210px'}" appendTo="body">
          <div class="mover-period-menu">
            <div class="overlay-title">Top Gainers Period</div>
            @for (period of moverPeriods; track period.value) {
              <button
                type="button"
                class="period-option gainer"
                [class.active]="topGainersPeriod() === period.value"
                (click)="selectTopMoverPeriod('gainers', period.value, opTopGainers)">
                <span>{{ period.label }}</span>
                <small>{{ period.description }}</small>
              </button>
            }
          </div>
        </p-overlayPanel>

        <button
          class="quick-view-action"
          [class.active]="screenerService.activeQuickView() === 'raising-stocks'"
          [class.loading]="screenerService.loading() && screenerService.activeQuickView() === 'raising-stocks'"
          [disabled]="screenerService.loading()"
          (click)="runRaisingStocks()"
          title="Find large-cap stocks with accelerating returns">
          @if (screenerService.loading() && screenerService.activeQuickView() === 'raising-stocks') {
            <i class="pi pi-spin pi-spinner"></i>
          } @else {
            <i class="pi pi-angle-double-up"></i>
          }
          <span>Raising Stocks</span>
        </button>
        @if (screenerService.activeFilterCount() > 0) {
          <button class="reset-action" (click)="resetFilters()" title="Reset all filters">
            <i class="pi pi-refresh"></i>
            <span>Reset</span>
          </button>
        }
        <button class="run-action" [class.loading]="screenerService.loading()" [disabled]="screenerService.loading()" (click)="runScreen()">
          @if (screenerService.loading()) {
            <i class="pi pi-spin pi-spinner"></i>
          } @else {
            <i class="pi pi-search"></i>
          }
          <span>Screen</span>
        </button>
        </div>
      </div>
    </section>
  `,
  styles: [`
    .filter-command-panel {
      position: relative;
      display: flex;
      flex-direction: column;
      padding: 0.42rem 0.55rem;
      border: 1px solid rgba(148, 163, 184, 0.14);
      border-radius: 14px;
      background: rgba(15, 23, 42, 0.66);
      box-shadow: 0 10px 28px rgba(2, 6, 23, 0.16);
      overflow: hidden;
    }

    .filter-command-panel::before {
      content: '';
      position: absolute;
      inset: 0;
      pointer-events: none;
      background: linear-gradient(90deg, rgba(56, 189, 248, 0.08), transparent 22%, transparent 78%, rgba(34, 197, 94, 0.06));
      opacity: 0.7;
    }

    .filter-command-panel > * {
      position: relative;
      z-index: 1;
    }

    .filter-bar {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      flex-wrap: wrap;
    }

    .filter-buttons {
      display: flex;
      align-items: center;
      gap: 0.35rem;
      flex-wrap: wrap;
      flex: 1;
    }

    .filter-trigger {
      display: inline-flex;
      align-items: center;
      gap: 0.35rem;
      padding: 0.34rem 0.55rem;
      border-radius: 999px;
      border: 1px solid rgba(148, 163, 184, 0.16);
      background: rgba(2, 6, 23, 0.28);
      color: #94a3b8;
      font-size: 0.72rem;
      font-weight: 800;
      cursor: pointer;
      transition: all 0.15s ease;
      white-space: nowrap;

      i:not(.arrow) {
        font-size: 0.8rem;
      }

      .arrow {
        font-size: 0.6rem;
        margin-left: 0.1rem;
        opacity: 0.6;
      }

      &:hover {
        transform: translateY(-1px);
        border-color: rgba(56, 189, 248, 0.45);
        color: #e0f2fe;
        background: rgba(14, 165, 233, 0.1);
      }

      &.has-value {
        border-color: rgba(56, 189, 248, 0.55);
        background: rgba(14, 165, 233, 0.14);
        color: #7dd3fc;
      }
    }

    .filter-count {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-width: 18px;
      height: 18px;
      border-radius: 9px;
      background: var(--primary-color);
      color: white;
      font-size: 0.65rem;
      font-weight: 600;
      padding: 0 4px;
    }

    .filter-actions {
      display: flex;
      align-items: center;
      gap: 0.35rem;
      margin-left: auto;
      flex-shrink: 0;
      flex-wrap: wrap;
      justify-content: flex-end;
    }

    .mover-action-group {
      display: inline-flex;
      align-items: stretch;
      border-radius: 9px;
      overflow: hidden;
      box-shadow: 0 1px 0 rgba(255, 255, 255, 0.04) inset;
      transition: transform 0.15s ease, box-shadow 0.15s ease;

      &.loser {
        border: 1px solid rgba(239, 68, 68, 0.38);
        background: linear-gradient(135deg, rgba(239, 68, 68, 0.13), rgba(2, 6, 23, 0.18));
      }

      &.gainer {
        border: 1px solid rgba(34, 197, 94, 0.38);
        background: linear-gradient(135deg, rgba(34, 197, 94, 0.13), rgba(2, 6, 23, 0.18));
      }

      &:hover {
        transform: translateY(-1px);
      }
    }

    .mover-action,
    .mover-period-trigger {
      border: none;
      cursor: pointer;
      transition: all 0.15s ease;
      white-space: nowrap;

      &:disabled {
        opacity: 0.7;
        cursor: not-allowed;
      }
    }

    .mover-action {
      display: inline-flex;
      align-items: center;
      gap: 0.32rem;
      padding: 0.34rem 0.54rem;
      background: transparent;
      font-size: 0.72rem;
      font-weight: 800;

      i {
        font-size: 0.74rem;
      }

      &.loser {
        color: #ef4444;
      }

      &.gainer {
        color: #16a34a;
      }

      &:hover:not(:disabled),
      &.active {
        background: rgba(255, 255, 255, 0.08);
      }

      &.active.loser {
        color: #f87171;
      }

      &.active.gainer {
        color: #22c55e;
      }
    }

    .period-badge {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-width: 24px;
      padding: 0.06rem 0.26rem;
      border-radius: 999px;
      background: rgba(255, 255, 255, 0.08);
      color: var(--text-color);
      font-size: 0.6rem;
      font-weight: 800;
      letter-spacing: 0.03em;
    }

    .mover-period-trigger {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 24px;
      background: rgba(0, 0, 0, 0.12);
      border-left: 1px solid rgba(255, 255, 255, 0.08);

      i {
        font-size: 0.62rem;
      }

      &.loser {
        color: #f87171;
      }

      &.gainer {
        color: #22c55e;
      }

      &:hover:not(:disabled) {
        background: rgba(255, 255, 255, 0.08);
      }
    }

    .mover-period-menu {
      display: flex;
      flex-direction: column;
      gap: 0.45rem;
    }

    .period-option {
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      gap: 0.16rem;
      width: 100%;
      padding: 0.62rem 0.7rem;
      border-radius: 12px;
      border: 1px solid rgba(148, 163, 184, 0.14);
      background: linear-gradient(135deg, rgba(15, 23, 42, 0.72), rgba(2, 6, 23, 0.42));
      color: #e2e8f0;
      cursor: pointer;
      box-shadow: 0 1px 0 rgba(255, 255, 255, 0.04) inset;
      transition: transform 0.18s ease, border-color 0.18s ease, background 0.18s ease;

      span {
        font-size: 0.8rem;
        font-weight: 900;
      }

      small {
        color: #94a3b8;
        font-size: 0.68rem;
      }

      &:hover {
        transform: translateY(-1px);
        border-color: rgba(56, 189, 248, 0.4);
        background: linear-gradient(135deg, rgba(14, 165, 233, 0.14), rgba(15, 23, 42, 0.58));
      }

      &.active.loser {
        border-color: rgba(239, 68, 68, 0.65);
        background: linear-gradient(135deg, rgba(239, 68, 68, 0.18), rgba(15, 23, 42, 0.6));
      }

      &.active.gainer {
        border-color: rgba(34, 197, 94, 0.65);
        background: linear-gradient(135deg, rgba(34, 197, 94, 0.18), rgba(15, 23, 42, 0.6));
      }
    }

    .reset-action {
      display: inline-flex;
      align-items: center;
      gap: 0.28rem;
      padding: 0.34rem 0.58rem;
      border-radius: 999px;
      border: 1px solid rgba(148, 163, 184, 0.18);
      background: rgba(2, 6, 23, 0.25);
      color: #94a3b8;
      font-size: 0.72rem;
      font-weight: 800;
      cursor: pointer;
      transition: all 0.15s ease;
      white-space: nowrap;

      i { font-size: 0.75rem; }

      &:hover {
        color: #e2e8f0;
        border-color: rgba(148, 163, 184, 0.36);
        background: rgba(148, 163, 184, 0.1);
      }
    }

    .quick-view-action {
      display: inline-flex;
      align-items: center;
      gap: 0.32rem;
      padding: 0.34rem 0.62rem;
      border-radius: 999px;
      border: 1px solid rgba(56, 189, 248, 0.36);
      background: linear-gradient(135deg, rgba(56, 189, 248, 0.12), rgba(34, 197, 94, 0.08));
      color: #7dd3fc;
      font-size: 0.72rem;
      font-weight: 800;
      cursor: pointer;
      transition: all 0.15s ease;
      white-space: nowrap;

      i { font-size: 0.78rem; }

      &:hover:not(:disabled),
      &.active {
        border-color: rgba(56, 189, 248, 0.62);
        background: linear-gradient(135deg, rgba(56, 189, 248, 0.2), rgba(34, 197, 94, 0.13));
        color: #e0f2fe;
        transform: translateY(-1px);
      }

      &:disabled {
        opacity: 0.7;
        cursor: not-allowed;
      }
    }

    .run-action {
      display: inline-flex;
      align-items: center;
      gap: 0.32rem;
      padding: 0.36rem 0.72rem;
      border-radius: 999px;
      border: none;
      background: linear-gradient(135deg, #38bdf8 0%, #2563eb 100%);
      color: #fff;
      font-size: 0.74rem;
      font-weight: 700;
      letter-spacing: 0.02em;
      cursor: pointer;
      transition: all 0.2s ease;
      white-space: nowrap;
      box-shadow: 0 10px 24px rgba(37, 99, 235, 0.24);

      i { font-size: 0.85rem; }

      &:hover:not(:disabled) {
        transform: translateY(-1px);
        box-shadow: 0 14px 30px rgba(37, 99, 235, 0.36);
        background: linear-gradient(135deg, #0ea5e9 0%, #1d4ed8 100%);
      }

      &:active:not(:disabled) {
        transform: translateY(0);
      }

      &:disabled {
        opacity: 0.7;
        cursor: not-allowed;
      }

      &.loading {
        background: linear-gradient(135deg, #38bdf8 0%, #2563eb 100%);
      }
    }

    /* Overlay Panel Content */
    .overlay-content {
      position: relative;
      display: flex;
      flex-direction: column;
      gap: 0.95rem;
      padding: 0.16rem 0.24rem 0.82rem 0.34rem;
    }

    .overlay-content::before {
      content: '';
      position: absolute;
      top: 0.2rem;
      bottom: 0.2rem;
      left: -0.18rem;
      width: 3px;
      border-radius: 999px;
      background: linear-gradient(180deg, #38bdf8 0%, #2563eb 48%, #22c55e 100%);
      box-shadow: 0 0 22px rgba(56, 189, 248, 0.55);
    }

    .filter-card-header {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 0.9rem;
      padding: 0.15rem 0.1rem 0.66rem 0;
      border-bottom: 1px solid rgba(125, 211, 252, 0.16);

      p {
        max-width: 24rem;
        margin: 0.22rem 0 0;
        color: #9fb3c8;
        font-size: 0.74rem;
        line-height: 1.35;
        letter-spacing: 0.005em;
      }
    }

    .overlay-title {
      display: flex;
      align-items: center;
      justify-content: space-between;
      color: #f8fafc;
      font-size: 0.74rem;
      font-weight: 900;
      text-transform: uppercase;
      letter-spacing: 0.16em;
      text-shadow: 0 0 20px rgba(125, 211, 252, 0.18);
    }

    .clear-section-action {
      flex: 0 0 auto;
      padding: 0.32rem 0.55rem;
      border-radius: 999px;
      border: 1px solid rgba(148, 163, 184, 0.18);
      background: linear-gradient(135deg, rgba(15, 23, 42, 0.82), rgba(2, 6, 23, 0.44));
      color: #a8b6c8;
      font-size: 0.66rem;
      font-weight: 900;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      cursor: pointer;
      box-shadow: 0 1px 0 rgba(255, 255, 255, 0.05) inset;
      transition: transform 0.18s ease, border-color 0.18s ease, background 0.18s ease, color 0.18s ease;

      &:hover {
        color: #e0f2fe;
        transform: translateY(-1px);
        border-color: rgba(56, 189, 248, 0.52);
        background: linear-gradient(135deg, rgba(14, 165, 233, 0.18), rgba(37, 99, 235, 0.14));
      }
    }

    .preset-row {
      display: flex;
      flex-wrap: wrap;
      gap: 0.42rem;
      padding: 0.05rem 0 0.05rem;
    }

    .preset-chip,
    .signal-chip {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 0.32rem;
      min-height: 2.08rem;
      padding: 0.44rem 0.68rem;
      border-radius: 999px;
      border: 1px solid rgba(96, 165, 250, 0.2);
      background:
        linear-gradient(180deg, rgba(30, 41, 59, 0.72), rgba(2, 6, 23, 0.42)),
        radial-gradient(circle at 18% 0%, rgba(56, 189, 248, 0.16), transparent 45%);
      color: #d8e6f5;
      font-size: 0.72rem;
      font-weight: 700;
      letter-spacing: 0.01em;
      cursor: pointer;
      box-shadow: 0 1px 0 rgba(255, 255, 255, 0.05) inset, 0 8px 18px rgba(2, 6, 23, 0.12);
      transition: transform 0.18s ease, border-color 0.18s ease, box-shadow 0.18s ease, background 0.18s ease, color 0.18s ease;

      &:hover,
      &.active {
        transform: translateY(-1px);
        border-color: rgba(56, 189, 248, 0.62);
        background:
          linear-gradient(135deg, rgba(14, 165, 233, 0.28), rgba(37, 99, 235, 0.18)),
          radial-gradient(circle at 20% 0%, rgba(125, 211, 252, 0.24), transparent 44%);
        color: #f0f9ff;
        box-shadow: 0 12px 26px rgba(14, 165, 233, 0.14), 0 0 0 1px rgba(125, 211, 252, 0.08) inset;
      }
    }

    .section-block {
      display: flex;
      flex-direction: column;
      gap: 0.56rem;
      padding: 0.86rem;
      border: 1px solid rgba(148, 163, 184, 0.13);
      border-radius: 15px;
      background:
        linear-gradient(145deg, rgba(15, 23, 42, 0.58), rgba(2, 6, 23, 0.26)),
        radial-gradient(circle at 100% 0%, rgba(14, 165, 233, 0.08), transparent 38%);
      box-shadow: 0 1px 0 rgba(255, 255, 255, 0.04) inset;
    }

    .filter-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 0.88rem 0.8rem;
    }

    .overlay-content > .filter-grid:last-child {
      margin-bottom: 0.28rem;
    }

    .universe-overlay-content {
      gap: 1.08rem;
      padding: 0.22rem 0.42rem 1.1rem 0.45rem;
    }

    .universe-lower-grid {
      gap: 1.15rem 1rem;
    }

    .universe-select-grid {
      align-items: end;
      padding-top: 0.12rem;
      margin-bottom: 0.55rem;
    }

    .toggle-row {
      :host ::ng-deep .p-selectbutton {
        display: flex;
        
        .p-button {
          flex: 1;
          font-size: 0.8rem;
          padding: 0.5rem 0.625rem;
          justify-content: center;
        }
      }
    }

    .checkbox-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 0.55rem;

      &.compact {
        gap: 0.38rem;
      }

      &.market-cap-grid {
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 0.72rem;
      }
    }

    .checkbox-col {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
    }

    .checkbox-item {
      display: flex;
      align-items: center;
      gap: 0.56rem;
      min-height: 2.32rem;
      padding: 0.5rem 0.62rem;
      border: 1px solid rgba(148, 163, 184, 0.13);
      border-radius: 12px;
      background:
        linear-gradient(135deg, rgba(15, 23, 42, 0.62), rgba(2, 6, 23, 0.36));
      cursor: pointer;
      box-shadow: 0 1px 0 rgba(255, 255, 255, 0.035) inset;
      transition: transform 0.16s ease, border-color 0.16s ease, background 0.16s ease, box-shadow 0.16s ease;

      &:hover {
        transform: translateY(-1px);
        border-color: rgba(56, 189, 248, 0.42);
        background: linear-gradient(135deg, rgba(14, 165, 233, 0.13), rgba(15, 23, 42, 0.56));
        box-shadow: 0 12px 22px rgba(2, 6, 23, 0.18);
      }

      span {
        color: #d4e0ef;
        font-size: 0.78rem;
        font-weight: 700;
      }
    }

    .range-filter-row {
      display: flex;
      flex-direction: column;
      gap: 0.46rem;
      min-width: 0;
    }

    .range-filter-label {
      color: #9fb3c8;
      font-size: 0.66rem;
      font-weight: 900;
      letter-spacing: 0.11em;
      text-transform: uppercase;
    }

    .range-inputs {
      display: flex;
      align-items: center;
      gap: 0.42rem;
    }

    .range-input {
      flex: 1;
      min-width: 0;
      width: 0;
      padding: 0.64rem 0.72rem;
      border-radius: 12px;
      border: 1px solid rgba(100, 116, 139, 0.26);
      background:
        linear-gradient(180deg, rgba(2, 6, 23, 0.78), rgba(15, 23, 42, 0.58));
      color: #eaf4ff;
      font-size: 0.78rem;
      font-weight: 800;
      letter-spacing: 0.01em;
      outline: none;
      box-shadow: 0 1px 0 rgba(255, 255, 255, 0.04) inset, 0 10px 22px rgba(2, 6, 23, 0.12) inset;
      transition: border-color 0.18s ease, box-shadow 0.18s ease, background 0.18s ease;
      -moz-appearance: textfield;

      &::-webkit-outer-spin-button,
      &::-webkit-inner-spin-button {
        -webkit-appearance: none;
        margin: 0;
      }

      &::placeholder {
        color: #647b93;
        opacity: 1;
        font-size: 0.72rem;
        font-weight: 700;
      }

      &:hover {
        border-color: rgba(56, 189, 248, 0.42);
        background: linear-gradient(180deg, rgba(2, 6, 23, 0.82), rgba(15, 23, 42, 0.66));
      }

      &:focus {
        border-color: rgba(125, 211, 252, 0.78);
        box-shadow: 0 0 0 3px rgba(56, 189, 248, 0.16), 0 12px 28px rgba(14, 165, 233, 0.1);
      }
    }

    .range-separator {
      color: #61758d;
      font-size: 0.75rem;
      flex-shrink: 0;
    }

    .ma-filter-row {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
    }

    .ma-filter-label {
      color: #94a3b8;
      font-size: 0.68rem;
      font-weight: 900;
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }

    .cross-filters {
      display: flex;
      gap: 1.25rem;
      padding-top: 0.25rem;
    }

    .signal-chip-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 0.42rem;
    }

    .w-full {
      width: 100%;
    }

    :host ::ng-deep {
      p-selectbutton.ma-toggle {
        .p-selectbutton {
          display: inline-flex !important;
          background: rgba(2, 6, 23, 0.56) !important;
          border-radius: 999px !important;
          padding: 4px !important;
          gap: 3px !important;
          border: 1px solid rgba(148, 163, 184, 0.18) !important;
          box-shadow: 0 1px 0 rgba(255, 255, 255, 0.04) inset !important;
        }
        
        .p-togglebutton {
          flex: 0 0 auto !important;
          font-size: 0.72rem !important;
          font-weight: 800 !important;
          padding: 0.35rem 0.7rem !important;
          justify-content: center !important;
          border-radius: 999px !important;
          border: none !important;
          background: transparent !important;
          color: #a8b6c8 !important;
          transition: background 0.18s ease, color 0.18s ease, box-shadow 0.18s ease !important;
          min-width: 46px !important;
          cursor: pointer !important;
        }

        .p-togglebutton:hover:not(.p-togglebutton-checked) {
          background: rgba(56, 189, 248, 0.1) !important;
          color: #e0f2fe !important;
        }

        .p-togglebutton-checked {
          background: linear-gradient(135deg, #38bdf8, #2563eb) !important;
          color: #ffffff !important;
          box-shadow: 0 8px 18px rgba(37, 99, 235, 0.32), 0 0 0 1px rgba(255, 255, 255, 0.1) inset !important;
        }

        .p-togglebutton:focus {
          box-shadow: none !important;
        }
      }

      p-selectbutton.compact-toggle {
        .p-selectbutton {
          display: inline-flex !important;
          width: 100% !important;
          background: rgba(2, 6, 23, 0.56) !important;
          border-radius: 999px !important;
          padding: 4px !important;
          gap: 3px !important;
          border: 1px solid rgba(148, 163, 184, 0.18) !important;
          box-shadow: 0 1px 0 rgba(255, 255, 255, 0.04) inset !important;
        }
        
        .p-togglebutton {
          flex: 1 !important;
          font-size: 0.72rem !important;
          font-weight: 800 !important;
          padding: 0.35rem 0.7rem !important;
          justify-content: center !important;
          border-radius: 999px !important;
          border: none !important;
          background: transparent !important;
          color: #a8b6c8 !important;
          transition: background 0.18s ease, color 0.18s ease, box-shadow 0.18s ease !important;
          cursor: pointer !important;
        }

        .p-togglebutton:hover:not(.p-togglebutton-checked) {
          background: rgba(56, 189, 248, 0.1) !important;
          color: #e0f2fe !important;
        }

        .p-togglebutton-checked {
          background: linear-gradient(135deg, #38bdf8, #2563eb) !important;
          color: #ffffff !important;
          box-shadow: 0 8px 18px rgba(37, 99, 235, 0.32), 0 0 0 1px rgba(255, 255, 255, 0.1) inset !important;
        }

        .p-togglebutton:focus {
          box-shadow: none !important;
        }
      }

      .p-multiselect.compact-multiselect {
        width: 100% !important;
        min-height: 2.75rem !important;
        border-radius: 12px !important;
        background: linear-gradient(180deg, rgba(2, 6, 23, 0.78), rgba(15, 23, 42, 0.58)) !important;
        border: 1px solid rgba(100, 116, 139, 0.26) !important;
        color: #dce9f7 !important;
        box-shadow: 0 1px 0 rgba(255, 255, 255, 0.04) inset, 0 10px 22px rgba(2, 6, 23, 0.12) inset !important;
        transition: border-color 0.18s ease, box-shadow 0.18s ease, background 0.18s ease !important;

        &:hover {
          border-color: rgba(56, 189, 248, 0.42) !important;
        }

        &.p-focus,
        &.p-multiselect-open {
          border-color: rgba(125, 211, 252, 0.78) !important;
          box-shadow: 0 0 0 3px rgba(56, 189, 248, 0.16), 0 12px 28px rgba(14, 165, 233, 0.1) !important;
        }

        .p-multiselect-label {
          color: #dce9f7 !important;
          font-size: 0.78rem !important;
          font-weight: 800 !important;
          line-height: 1.2 !important;
          padding: 0.62rem 0.72rem !important;
        }

        .p-multiselect-dropdown {
          width: 2.2rem !important;
          color: #9fb3c8 !important;
        }

        .p-multiselect-token {
          font-size: 0.7rem !important;
          font-weight: 700 !important;
          padding: 0.22rem 0.48rem !important;
          border-radius: 999px !important;
          background: rgba(56, 189, 248, 0.16) !important;
          color: #dff6ff !important;
          border: 1px solid rgba(125, 211, 252, 0.18) !important;
        }
      }

      p-multiselect.p-multiselect.compact-multiselect,
      p-multiselect.compact-multiselect,
      p-multiSelect.p-multiselect.compact-multiselect,
      p-multiSelect.compact-multiselect,
      .modern-multiselect-field,
      .compact-multiselect.p-multiselect,
      .compact-multiselect .p-multiselect {
        display: inline-flex !important;
        width: 100% !important;
        min-height: 2.75rem !important;
        border-radius: 13px !important;
        border: 1px solid rgba(100, 116, 139, 0.32) !important;
        background:
          radial-gradient(circle at 12% 0%, rgba(56, 189, 248, 0.12), transparent 42%),
          linear-gradient(180deg, rgba(3, 7, 18, 0.9), rgba(15, 23, 42, 0.68)) !important;
        color: #eaf4ff !important;
        box-shadow:
          0 1px 0 rgba(255, 255, 255, 0.05) inset,
          0 12px 24px rgba(2, 6, 23, 0.16) inset,
          0 10px 24px rgba(2, 6, 23, 0.12) !important;
        transition: border-color 0.18s ease, box-shadow 0.18s ease, background 0.18s ease !important;

        &:hover {
          border-color: rgba(56, 189, 248, 0.5) !important;
          background:
            radial-gradient(circle at 12% 0%, rgba(56, 189, 248, 0.18), transparent 42%),
            linear-gradient(180deg, rgba(3, 7, 18, 0.94), rgba(15, 23, 42, 0.74)) !important;
        }

        &.p-focus,
        &.p-multiselect-open,
        &[data-p-focused='true'] {
          border-color: rgba(125, 211, 252, 0.82) !important;
          box-shadow:
            0 0 0 3px rgba(56, 189, 248, 0.16),
            0 12px 28px rgba(14, 165, 233, 0.12),
            0 1px 0 rgba(255, 255, 255, 0.05) inset !important;
        }
      }

      .modern-multiselect-label-container,
      p-multiselect.compact-multiselect .p-multiselect-label-container,
      p-multiSelect.compact-multiselect .p-multiselect-label-container,
      .modern-multiselect-field .p-multiselect-label-container {
        min-width: 0 !important;
      }

      .modern-multiselect-label,
      p-multiselect.compact-multiselect .p-multiselect-label,
      p-multiSelect.compact-multiselect .p-multiselect-label,
      .modern-multiselect-field .p-multiselect-label,
      .compact-multiselect.p-multiselect .p-multiselect-label,
      .compact-multiselect .p-multiselect-label {
        color: #dce9f7 !important;
        font-size: 0.8rem !important;
        font-weight: 700 !important;
        line-height: 1.2 !important;
        padding: 0.66rem 0.72rem !important;
      }

      .modern-multiselect-dropdown,
      p-multiselect.compact-multiselect .p-multiselect-dropdown,
      p-multiSelect.compact-multiselect .p-multiselect-dropdown,
      .modern-multiselect-field .p-multiselect-dropdown,
      .compact-multiselect.p-multiselect .p-multiselect-dropdown,
      .compact-multiselect .p-multiselect-dropdown {
        width: 2.35rem !important;
        color: #a9bdd2 !important;
      }

      .compact-multiselect {
        .p-multiselect {
          width: 100%;
          min-height: 2.75rem;
          border-radius: 12px;
          background: linear-gradient(180deg, rgba(2, 6, 23, 0.78), rgba(15, 23, 42, 0.58));
          border: 1px solid rgba(100, 116, 139, 0.26);
          box-shadow: 0 1px 0 rgba(255, 255, 255, 0.04) inset, 0 10px 22px rgba(2, 6, 23, 0.12) inset;

          &:hover {
            border-color: rgba(56, 189, 248, 0.42);
          }

          &.p-focus {
            border-color: rgba(125, 211, 252, 0.78);
            box-shadow: 0 0 0 3px rgba(56, 189, 248, 0.16), 0 12px 28px rgba(14, 165, 233, 0.1);
          }
        }

        .p-multiselect-label {
          color: #dce9f7;
          font-size: 0.78rem;
          font-weight: 800;
          padding: 0.62rem 0.72rem;
        }

        .p-multiselect-token {
          font-size: 0.7rem;
          font-weight: 700;
          padding: 0.22rem 0.48rem;
          border-radius: 999px;
          background: rgba(56, 189, 248, 0.16);
          color: #dff6ff;
          border: 1px solid rgba(125, 211, 252, 0.18);
        }
      }

      .p-checkbox .p-checkbox-box {
        width: 1.05rem;
        height: 1.05rem;
        border-radius: 6px;
        border: 1px solid rgba(148, 163, 184, 0.34);
        background: rgba(2, 6, 23, 0.64);
        transition: all 0.2s ease;
        box-shadow: 0 1px 0 rgba(255, 255, 255, 0.04) inset;

        &:hover {
          border-color: rgba(56, 189, 248, 0.58);
        }

        &.p-highlight {
          background: linear-gradient(135deg, #38bdf8, #2563eb);
          border-color: rgba(125, 211, 252, 0.75);
          box-shadow: 0 0 0 2px rgba(56, 189, 248, 0.14), 0 8px 18px rgba(37, 99, 235, 0.22);
        }

        .p-checkbox-icon {
          color: #ffffff;
          font-size: 0.72rem;
        }
      }

      .screener-filter-overlay.p-overlaypanel {
        border: 1px solid rgba(125, 211, 252, 0.25) !important;
        border-radius: 20px !important;
        background:
          radial-gradient(circle at 12% -12%, rgba(56, 189, 248, 0.28), transparent 36%),
          radial-gradient(circle at 110% 20%, rgba(34, 197, 94, 0.12), transparent 34%),
          linear-gradient(145deg, rgba(15, 23, 42, 0.98), rgba(3, 7, 18, 0.98)) !important;
        box-shadow:
          0 34px 90px rgba(2, 6, 23, 0.66),
          0 0 0 1px rgba(255, 255, 255, 0.035) inset,
          0 0 42px rgba(14, 165, 233, 0.12) !important;
        overflow: hidden !important;
        backdrop-filter: blur(20px) saturate(140%) !important;
        transform-origin: top center !important;
        animation: dropdownReveal 0.18s ease-out both !important;

        &::before {
          content: '';
          position: absolute;
          inset: 0;
          pointer-events: none;
          background:
            linear-gradient(90deg, rgba(125, 211, 252, 0.16), transparent 22%, transparent 78%, rgba(34, 197, 94, 0.08)),
            repeating-linear-gradient(135deg, rgba(255, 255, 255, 0.025) 0 1px, transparent 1px 7px);
          opacity: 0.58;
        }

        &::after {
          content: '';
          position: absolute;
          top: 0;
          left: 18px;
          right: 18px;
          height: 1px;
          background: linear-gradient(90deg, transparent, rgba(125, 211, 252, 0.75), transparent);
        }

        .p-overlaypanel-content {
          position: relative;
          z-index: 1;
          padding: 0.92rem 0.96rem 0.96rem !important;
          background: transparent !important;
        }
      }

      .universe-filter-overlay.p-overlaypanel {
        width: min(640px, calc(100vw - 32px)) !important;
        max-width: calc(100vw - 32px) !important;

        .p-overlaypanel-content {
          padding: 1.15rem 1.2rem 1.3rem !important;
        }
      }

      .compact-period-overlay.p-overlaypanel {
        border-radius: 16px !important;

        .p-overlaypanel-content {
          padding: 0.72rem !important;
        }
      }

      .p-multiselect-overlay,
      .p-multiselect-panel,
      .modern-multiselect-panel {
        border: 1px solid rgba(125, 211, 252, 0.22) !important;
        border-radius: 16px !important;
        background:
          radial-gradient(circle at 14% -10%, rgba(56, 189, 248, 0.2), transparent 34%),
          linear-gradient(145deg, rgba(15, 23, 42, 0.98), rgba(3, 7, 18, 0.98)) !important;
        box-shadow: 0 28px 70px rgba(2, 6, 23, 0.58), 0 0 0 1px rgba(255, 255, 255, 0.03) inset !important;
        overflow: hidden !important;
        backdrop-filter: blur(18px) saturate(135%) !important;
      }

      .p-multiselect-header,
      .modern-multiselect-header {
        padding: 0.65rem !important;
        border-bottom: 1px solid rgba(125, 211, 252, 0.12) !important;
        background: rgba(2, 6, 23, 0.18) !important;
      }

      .p-multiselect-filter {
        border-radius: 11px !important;
        border: 1px solid rgba(100, 116, 139, 0.28) !important;
        background: rgba(2, 6, 23, 0.58) !important;
        color: #eaf4ff !important;
        font-weight: 750 !important;
      }

      .p-multiselect-list {
        padding: 0.45rem !important;
        background: transparent !important;
      }

      .p-multiselect-option {
        margin-bottom: 0.18rem !important;
        border-radius: 11px !important;
        color: #d4e0ef !important;
        transition: background 0.16s ease, color 0.16s ease !important;

        &:hover {
          background: rgba(14, 165, 233, 0.12) !important;
          color: #f0f9ff !important;
        }
      }

      .p-multiselect-option-selected {
        background: linear-gradient(135deg, rgba(14, 165, 233, 0.2), rgba(37, 99, 235, 0.15)) !important;
        color: #f0f9ff !important;
      }
    }

    @keyframes dropdownReveal {
      from {
        opacity: 0;
        transform: translateY(-6px) scale(0.985);
      }
      to {
        opacity: 1;
        transform: translateY(0) scale(1);
      }
    }

    /* Exact Watchlists-style typography and controls, applied last to neutralize older Screener console rules. */
    .filter-command-panel,
    .filter-command-panel button,
    .filter-command-panel input {
      font-family: inherit;
    }

    .filter-command-panel {
      padding: 0.72rem 0.85rem;
    }

    .filter-trigger,
    .reset-action,
    .quick-view-action,
    .mover-action,
    .mover-period-trigger,
    .run-action {
      font-size: 13px;
      font-weight: 700;
      letter-spacing: 0;
    }

    .filter-trigger,
    .reset-action {
      padding: 8px 12px;
      border-radius: 999px;
      border-color: rgba(148, 163, 184, 0.14);
      background: rgba(15, 23, 42, 0.68);
      color: #94a3b8;
    }

    .filter-trigger:hover,
    .reset-action:hover {
      color: #f8fafc;
      border-color: rgba(96, 165, 250, 0.35);
      background: rgba(15, 23, 42, 0.68);
    }

    .filter-trigger.has-value {
      border-color: rgba(59, 130, 246, 0.28);
      background: rgba(59, 130, 246, 0.12);
      color: #93c5fd;
    }

    .filter-count {
      min-width: 17px;
      height: 17px;
      font-size: 10px;
      font-weight: 800;
    }

    .mover-action-group {
      border-radius: 8px;
    }

    .mover-action {
      padding: 8px 12px;
    }

    .period-badge {
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0;
    }

    .quick-view-action {
      padding: 8px 12px;
      border-radius: 8px;
      border-color: rgba(59, 130, 246, 0.28);
      background: rgba(59, 130, 246, 0.12);
      color: #93c5fd;
    }

    .run-action {
      padding: 8px 16px;
      border-radius: 999px;
      font-weight: 800;
      box-shadow: 0 10px 24px rgba(37, 99, 235, 0.22);
    }

    .filter-card-header {
      padding-bottom: 0.85rem;
    }

    .filter-card-header p {
      color: #94a3b8;
      font-size: 0.9rem;
      line-height: 1.35;
      letter-spacing: 0;
    }

    .overlay-title {
      color: #f8fafc;
      font-size: 1.05rem;
      font-weight: 600;
      letter-spacing: 0;
      text-transform: none;
    }

    .section-block {
      gap: 0.65rem;
      padding: 0.85rem;
      border-radius: 14px;
      background: rgba(15, 23, 42, 0.48);
    }

    .range-filter-label,
    .ma-filter-label {
      color: #94a3b8;
      font-size: 0.66rem;
      font-weight: 800;
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }

    .preset-chip,
    .signal-chip,
    .checkbox-item {
      min-height: 2rem;
      border-radius: 10px;
      background: rgba(15, 23, 42, 0.68);
      color: #cbd5e1;
      font-size: 13px;
      font-weight: 700;
      letter-spacing: 0;
    }

    .checkbox-item span {
      color: #cbd5e1;
      font-size: 13px;
      font-weight: 700;
    }

    .range-input {
      padding: 0.72rem 0.8rem;
      border-radius: 12px;
      background: rgba(15, 23, 42, 0.78);
      color: #f8fafc;
      font-size: 0.88rem;
      font-weight: 600;
      letter-spacing: 0;
    }

    .range-input::placeholder {
      color: #64748b;
      font-size: 0.82rem;
      font-weight: 600;
    }

    .clear-section-action {
      padding: 8px 12px;
      border-radius: 999px;
      color: #cbd5e1;
      font-size: 13px;
      font-weight: 800;
      letter-spacing: 0;
      text-transform: none;
    }

    :host ::ng-deep {
      .screener-filter-overlay.p-overlaypanel {
        border-radius: 18px !important;
        border-color: rgba(96, 165, 250, 0.22) !important;
        background: linear-gradient(145deg, rgba(15, 23, 42, 0.98), rgba(15, 23, 42, 0.9)) !important;
        box-shadow: 0 30px 90px rgba(2, 6, 23, 0.56) !important;
        font-family: inherit !important;
      }

      .screener-filter-overlay.p-overlaypanel .p-overlaypanel-content {
        padding: 1.4rem !important;
      }

      p-selectbutton.ma-toggle .p-togglebutton,
      p-selectbutton.compact-toggle .p-togglebutton,
      .modern-multiselect-label,
      .modern-multiselect-field .p-multiselect-label,
      .compact-multiselect.p-multiselect .p-multiselect-label,
      .compact-multiselect .p-multiselect-label,
      .p-multiselect-option,
      .p-multiselect-filter {
        font-family: inherit !important;
        font-size: 13px !important;
        font-weight: 600 !important;
        letter-spacing: 0 !important;
      }

      p-selectbutton.ma-toggle .p-selectbutton,
      p-selectbutton.compact-toggle .p-selectbutton,
      .p-multiselect.compact-multiselect,
      .modern-multiselect-field,
      .compact-multiselect.p-multiselect,
      .compact-multiselect .p-multiselect {
        border-color: rgba(148, 163, 184, 0.18) !important;
        border-radius: 12px !important;
        background: rgba(15, 23, 42, 0.78) !important;
        box-shadow: none !important;
      }

      p-selectbutton.ma-toggle .p-togglebutton-checked,
      p-selectbutton.compact-toggle .p-togglebutton-checked {
        background: rgba(59, 130, 246, 0.18) !important;
        color: #bfdbfe !important;
      }

      .p-multiselect-token {
        border-radius: 999px !important;
        background: rgba(59, 130, 246, 0.12) !important;
        color: #bfdbfe !important;
        font-size: 12px !important;
        font-weight: 700 !important;
      }

      .p-multiselect-overlay,
      .p-multiselect-panel,
      .modern-multiselect-panel {
        border-radius: 18px !important;
        border-color: rgba(96, 165, 250, 0.22) !important;
        background: linear-gradient(145deg, rgba(15, 23, 42, 0.98), rgba(15, 23, 42, 0.9)) !important;
        box-shadow: 0 30px 90px rgba(2, 6, 23, 0.5) !important;
        font-family: inherit !important;
      }

      .p-multiselect-header {
        background: rgba(15, 23, 42, 0.68) !important;
        border-bottom-color: rgba(148, 163, 184, 0.12) !important;
      }
    }

    @media (max-width: 768px) {
      .filter-command-panel {
        padding: 0.5rem;
      }

      .filter-bar {
        align-items: stretch;
        flex-direction: column;
      }

      .filter-buttons,
      .filter-actions {
        width: 100%;
        margin-left: 0;
        justify-content: flex-start;
      }

      .filter-grid,
      .signal-chip-grid {
        grid-template-columns: 1fr;
      }

      .checkbox-grid.market-cap-grid {
        grid-template-columns: 1fr 1fr;
      }

      .filter-trigger span {
        display: none;
      }

      .mover-action-group,
      .quick-view-action,
      .reset-action,
      .run-action {
        flex: 1 1 auto;
      }
    }
  `]
})
export class FilterPanelComponent implements OnInit {
  screenerService = inject(ScreenerService);
  marketService = inject(MarketService);

  // Output event when screen is run
  screenRun = output<void>();

  filters!: ScreenerFilters;
  presets: FilterPreset[] = [];

  marketCapModeOptions = [
    { label: 'Categories', value: 'categories' },
    { label: 'Custom', value: 'custom' }
  ];

  marketCapCategories: FilterOption<MarketCapCategory>[] = [
    { label: 'Mega', value: 'mega' },
    { label: 'Large', value: 'large' },
    { label: 'Mid', value: 'mid' },
    { label: 'Small', value: 'small' },
    { label: 'Micro', value: 'micro' }
  ];

  maOptions = [
    { label: 'Any', value: null },
    { label: 'Above', value: true },
    { label: 'Below', value: false }
  ];

  // RSI zones for filter chips
  rsiZones = [
    { id: 'oversold' as const, label: 'Oversold', description: 'RSI < 30 - Potential bounce' },
    { id: 'approaching_oversold' as const, label: 'Near Oversold', description: 'RSI 30-40' },
    { id: 'neutral' as const, label: 'Neutral', description: 'RSI 40-60' },
    { id: 'approaching_overbought' as const, label: 'Near Overbought', description: 'RSI 60-70' },
    { id: 'overbought' as const, label: 'Overbought', description: 'RSI > 70 - Potential pullback' }
  ];

  // MACD signals for filter chips
  macdSignals = [
    { id: 'bullish' as const, label: 'Bullish', description: 'MACD above signal line', icon: 'pi-arrow-up' },
    { id: 'bearish' as const, label: 'Bearish', description: 'MACD below signal line', icon: 'pi-arrow-down' },
    { id: 'bullish_crossover' as const, label: 'Buy Signal', description: 'Recent bullish crossover', icon: 'pi-bolt' },
    { id: 'bearish_crossover' as const, label: 'Sell Signal', description: 'Recent bearish crossover', icon: 'pi-exclamation-triangle' }
  ];

  sectorOptions = SECTORS.map(sector => ({ label: sector, value: sector }));

  filterMultiselectStyle = {
    width: '100%',
    minHeight: '2.75rem',
    borderRadius: '12px',
    border: '1px solid rgba(148, 163, 184, 0.18)',
    background: 'rgba(15, 23, 42, 0.78)',
    color: '#f8fafc',
    boxShadow: 'none'
  };

  exchangeOptions(): FilterOption<string>[] {
    return this.marketService.currentMarket() === 'IN'
      ? [
        { label: 'NSE', value: 'NSI' },
        { label: 'BSE', value: 'BSE' },
        { label: 'BOM', value: 'BOM' }
      ]
      : [
        { label: 'NASDAQ', value: 'NMS' },
        { label: 'NYSE', value: 'NYQ' },
        { label: 'NYSE Arca', value: 'NYS' }
      ];
  }

  moverPeriods: Array<{ label: string; value: TopMoverPeriod; description: string }> = [
    { label: '1D', value: '1d', description: 'Previous session' },
    { label: '1M', value: '1m', description: 'Last 21 trading days' },
    { label: '1Y', value: '1y', description: 'Last 252 trading days' }
  ];

  topLosersPeriod = signal<TopMoverPeriod>('1d');
  topGainersPeriod = signal<TopMoverPeriod>('1d');

  // Industry filter (column-level, not part of screening API)
  selectedIndustries: string[] = [];

  industryOptions = computed(() => {
    const stocks = this.screenerService.getCachedStocks();
    let filteredStocks = stocks;
    if (this.filters && this.filters.sectors.length > 0) {
      const sectorSet = new Set<string>(this.filters.sectors);
      filteredStocks = stocks.filter(s => sectorSet.has(s.sector));
    }
    const industries = [...new Set(filteredStocks.map(s => s.industry).filter(i => i && i !== 'Unknown'))].sort();
    return industries.map(i => ({ label: i, value: i }));
  });

  constructor() {
    // Sync with service filters
    effect(() => {
      const serviceFilters = this.screenerService.filters();
      // Deep clone to avoid reference issues
      this.filters = JSON.parse(JSON.stringify(serviceFilters));
    });

    // React to market changes
    effect(() => {
      const market = this.marketService.currentMarket();
      this.filters = getDefaultFilters(market);
      this.screenerService.setMarket(market);
    });
  }

  ngOnInit(): void {
    this.filters = JSON.parse(JSON.stringify(this.screenerService.filters()));
    this.presets = this.screenerService.getPresets();
  }

  onFilterChange(): void {
    // Debounced update - don't run screen automatically
    this.screenerService.updateFilters(this.filters, false);
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

  applyPreset(presetId: string): void {
    this.screenerService.applyPreset(presetId);
    // Update local filters after preset is applied
    this.filters = JSON.parse(JSON.stringify(this.screenerService.filters()));
  }

  resetFilters(): void {
    this.screenerService.resetFilters();
    this.filters = getDefaultFilters(this.marketService.currentMarket());
    this.selectedIndustries = [];
  }

  onSectorChange(): void {
    this.onFilterChange();
    // Reset industry when sectors change (industries depend on sectors)
    this.selectedIndustries = [];
    this.screenerService.setIndustryFilter([]);
  }

  onIndustryChange(): void {
    this.screenerService.setIndustryFilter(this.selectedIndustries);
  }

  runScreen(): void {
    this.screenerService.updateFilters(this.filters, true);
    this.screenRun.emit();
  }

  runRaisingStocks(): void {
    this.screenerService.runRaisingStocks();
    this.screenRun.emit();
  }

  runTopMovers(type: TopMoverType): void {
    const period = type === 'gainers' ? this.topGainersPeriod() : this.topLosersPeriod();
    this.screenerService.runTopMovers(type, period);
    this.screenRun.emit();
  }

  selectTopMoverPeriod(type: TopMoverType, period: TopMoverPeriod, overlay: OverlayPanel): void {
    if (type === 'gainers') {
      this.topGainersPeriod.set(period);
    } else {
      this.topLosersPeriod.set(period);
    }
    overlay.hide();
    this.runTopMovers(type);
  }

  toggleRsiZone(zoneId: 'oversold' | 'approaching_oversold' | 'neutral' | 'approaching_overbought' | 'overbought'): void {
    const zones = this.filters.rsi.zones;
    const index = zones.indexOf(zoneId);
    if (index >= 0) {
      zones.splice(index, 1);
    } else {
      zones.push(zoneId);
    }
    this.onFilterChange();
  }

  toggleMacdSignal(signalId: 'bullish' | 'bearish' | 'bullish_crossover' | 'bearish_crossover'): void {
    const signals = this.filters.macd.signals;
    const index = signals.indexOf(signalId);
    if (index >= 0) {
      signals.splice(index, 1);
    } else {
      signals.push(signalId);
    }
    this.onFilterChange();
  }

  applyUniversePreset(preset: 'large-liquid' | 'mid-plus'): void {
    const minLargeCap = this.marketService.currentMarket() === 'IN' ? 830e9 : 10e9;
    const minMidCap = this.marketService.currentMarket() === 'IN' ? 250e9 : 2e9;

    this.filters.marketCap = {
      mode: 'custom',
      categories: [],
      customRange: { min: preset === 'large-liquid' ? minLargeCap : minMidCap }
    };
    if (preset === 'large-liquid') {
      this.filters.avgVolume.min = 1_000_000;
    }
    this.onFilterChange();
  }

  applyValuationPreset(preset: 'cheap' | 'reasonable' | 'premium'): void {
    this.clearValuationFilters(false);
    if (preset === 'cheap') {
      this.filters.peRatio.max = 15;
      this.filters.pbRatio.max = 2;
      this.filters.psRatio.max = 3;
    } else if (preset === 'reasonable') {
      this.filters.peRatio.max = 25;
      this.filters.forwardPeRatio.max = 25;
    } else {
      this.filters.forwardPeRatio.max = 60;
      this.filters.psRatio.max = 15;
    }
    this.onFilterChange();
  }

  applyGrowthIncomePreset(preset: 'growth' | 'dividend' | 'profitable'): void {
    this.clearGrowthIncomeFilters(false);
    if (preset === 'growth') {
      this.filters.earningsGrowth.min = 15;
      this.filters.revenueGrowth.min = 10;
    } else if (preset === 'dividend') {
      this.filters.dividendYield.min = 2;
      this.filters.eps.min = 0;
    } else {
      this.filters.eps.min = 0;
      this.filters.earningsGrowth.min = 0;
    }
    this.onFilterChange();
  }

  applyMomentumPreset(preset: 'near-high' | 'bounce' | 'uptrend'): void {
    this.clearMomentumFilters(false);
    if (preset === 'near-high') {
      this.filters.fiftyTwoWeek.nearHigh = true;
      this.filters.fiftyTwoWeek.percentFromHigh = { min: -5, max: 0 };
    } else if (preset === 'bounce') {
      this.filters.fiftyTwoWeek.percentFromLow = { min: 0, max: 20 };
    } else {
      this.filters.movingAverages.aboveFiftyDayMA = true;
      this.filters.movingAverages.aboveTwoHundredDayMA = true;
    }
    this.onFilterChange();
  }

  applyLiquidityPreset(preset: 'liquid' | 'unusual' | 'steady'): void {
    this.clearLiquidityFilters(false);
    if (preset === 'liquid') {
      this.filters.avgVolume.min = 1_000_000;
    } else if (preset === 'unusual') {
      this.filters.relativeVolume.min = 1.5;
    } else {
      this.filters.beta = { min: 0.5, max: 1.3 };
    }
    this.onFilterChange();
  }

  clearUniverseFilters(update = true): void {
    this.filters.marketCap = { mode: 'categories', categories: [], customRange: {} };
    this.filters.price = {};
    this.filters.exchanges = [];
    this.filters.sectors = [];
    this.selectedIndustries = [];
    this.screenerService.setIndustryFilter([]);
    if (update) this.onFilterChange();
  }

  clearValuationFilters(update = true): void {
    this.filters.peRatio = {};
    this.filters.forwardPeRatio = {};
    this.filters.pbRatio = {};
    this.filters.psRatio = {};
    if (update) this.onFilterChange();
  }

  clearGrowthIncomeFilters(update = true): void {
    this.filters.earningsGrowth = {};
    this.filters.revenueGrowth = {};
    this.filters.eps = {};
    this.filters.dividendYield = {};
    if (update) this.onFilterChange();
  }

  clearMomentumFilters(update = true): void {
    this.filters.fiftyTwoWeek = {
      nearHigh: false,
      nearLow: false,
      percentFromHigh: {},
      percentFromLow: {}
    };
    this.filters.movingAverages = {
      aboveFiftyDayMA: null,
      aboveTwoHundredDayMA: null,
      goldenCross: false,
      deathCross: false
    };
    if (update) this.onFilterChange();
  }

  clearLiquidityFilters(update = true): void {
    this.filters.avgVolume = {};
    this.filters.relativeVolume = {};
    this.filters.beta = {};
    if (update) this.onFilterChange();
  }

  clearTechnicalSignalFilters(update = true): void {
    this.filters.rsi = { zones: [], customRange: {} };
    this.filters.macd = { signals: [] };
    if (update) this.onFilterChange();
  }

  private hasRange(range: { min?: number; max?: number }): boolean {
    return range.min != null || range.max != null;
  }

  private rangeCount(...ranges: Array<{ min?: number; max?: number }>): number {
    return ranges.filter(range => this.hasRange(range)).length;
  }

  universeFilterCount(): number {
    if (!this.filters) return 0;
    return (this.hasMarketCapFilter() ? 1 : 0)
      + this.rangeCount(this.filters.price)
      + (this.filters.exchanges.length > 0 ? 1 : 0)
      + (this.filters.sectors.length > 0 ? 1 : 0)
      + (this.selectedIndustries.length > 0 ? 1 : 0);
  }

  valuationFilterCount(): number {
    if (!this.filters) return 0;
    return this.rangeCount(this.filters.peRatio, this.filters.forwardPeRatio, this.filters.pbRatio, this.filters.psRatio);
  }

  growthIncomeFilterCount(): number {
    if (!this.filters) return 0;
    return this.rangeCount(this.filters.earningsGrowth, this.filters.revenueGrowth, this.filters.eps, this.filters.dividendYield);
  }

  momentumFilterCount(): number {
    if (!this.filters) return 0;
    return (this.filters.fiftyTwoWeek.nearHigh || this.filters.fiftyTwoWeek.nearLow ? 1 : 0)
      + this.rangeCount(this.filters.fiftyTwoWeek.percentFromHigh, this.filters.fiftyTwoWeek.percentFromLow)
      + (this.filters.movingAverages.aboveFiftyDayMA != null ? 1 : 0)
      + (this.filters.movingAverages.aboveTwoHundredDayMA != null ? 1 : 0)
      + (this.filters.movingAverages.goldenCross || this.filters.movingAverages.deathCross ? 1 : 0);
  }

  liquidityFilterCount(): number {
    if (!this.filters) return 0;
    return this.rangeCount(this.filters.avgVolume, this.filters.relativeVolume, this.filters.beta);
  }

  technicalSignalFilterCount(): number {
    if (!this.filters) return 0;
    return (this.filters.rsi.zones.length > 0 ? 1 : 0)
      + this.rangeCount(this.filters.rsi.customRange)
      + (this.filters.macd.signals.length > 0 ? 1 : 0);
  }

  hasUniverseFilter(): boolean {
    return this.universeFilterCount() > 0;
  }

  hasGrowthIncomeFilter(): boolean {
    return this.growthIncomeFilterCount() > 0;
  }

  hasMomentumFilter(): boolean {
    return this.momentumFilterCount() > 0;
  }

  hasLiquidityFilter(): boolean {
    return this.liquidityFilterCount() > 0;
  }

  hasTechnicalSignalFilter(): boolean {
    return this.technicalSignalFilterCount() > 0;
  }

  // Filter active state helpers
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
    if (this.filters.fiftyTwoWeek.percentFromLow.min != null || this.filters.fiftyTwoWeek.percentFromLow.max != null) return true;
    return false;
  }

  hasValuationFilter(): boolean {
    if (!this.filters) return false;
    if (this.filters.peRatio.min != null || this.filters.peRatio.max != null) return true;
    if (this.filters.forwardPeRatio.min != null || this.filters.forwardPeRatio.max != null) return true;
    if (this.filters.pbRatio.min != null || this.filters.pbRatio.max != null) return true;
    if (this.filters.psRatio.min != null || this.filters.psRatio.max != null) return true;
    return false;
  }

  hasTechnicalFilter(): boolean {
    if (!this.filters) return false;
    if (this.filters.movingAverages.aboveFiftyDayMA != null) return true;
    if (this.filters.movingAverages.aboveTwoHundredDayMA != null) return true;
    if (this.filters.movingAverages.goldenCross || this.filters.movingAverages.deathCross) return true;
    if (this.filters.rsi.zones.length > 0 || this.hasRange(this.filters.rsi.customRange)) return true;
    if (this.filters.macd.signals.length > 0) return true;
    return false;
  }

  hasVolumeFilter(): boolean {
    if (!this.filters) return false;
    if (this.filters.avgVolume.min != null || this.filters.avgVolume.max != null) return true;
    if (this.filters.relativeVolume.min != null || this.filters.relativeVolume.max != null) return true;
    return false;
  }
}
