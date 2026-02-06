import { Component, inject, OnInit, OnDestroy, effect, signal, output, ViewChild, computed } from '@angular/core';
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

import { ScreenerService, MarketService } from '../../../core/services';
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
  standalone: true,
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
    <div class="filter-bar">
      <!-- Filter Dropdown Buttons -->
      <div class="filter-buttons">
        <!-- Market Cap -->
        <button class="filter-trigger" [class.has-value]="hasMarketCapFilter()" (click)="opMarketCap.toggle($event)">
          <i class="pi pi-building"></i>
          <span>Market Cap</span>
          <i class="pi pi-chevron-down arrow"></i>
        </button>
        <p-overlayPanel #opMarketCap [style]="{'width': '320px'}" appendTo="body">
          <div class="overlay-content">
            <div class="overlay-title">Market Cap</div>
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
              <div class="checkbox-grid">
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
                <span class="p-float-label">
                  <p-inputNumber 
                    inputId="mcap-min"
                    [(ngModel)]="filters.marketCap.customRange.min"
                    (onBlur)="onFilterChange()"
                    [showButtons]="false"
                    mode="decimal"
                    styleClass="range-input">
                  </p-inputNumber>
                  <label for="mcap-min">Min ($B)</label>
                </span>
                <span class="range-separator">-</span>
                <span class="p-float-label">
                  <p-inputNumber 
                    inputId="mcap-max"
                    [(ngModel)]="filters.marketCap.customRange.max"
                    (onBlur)="onFilterChange()"
                    [showButtons]="false"
                    mode="decimal"
                    styleClass="range-input">
                  </p-inputNumber>
                  <label for="mcap-max">Max ($B)</label>
                </span>
              </div>
            }
          </div>
        </p-overlayPanel>

        <!-- 52-Week Range -->
        <button class="filter-trigger" [class.has-value]="has52WeekFilter()" (click)="op52Week.toggle($event)">
          <i class="pi pi-calendar"></i>
          <span>52-Week</span>
          <i class="pi pi-chevron-down arrow"></i>
        </button>
        <p-overlayPanel #op52Week [style]="{'width': '360px'}" appendTo="body">
          <div class="overlay-content">
            <div class="overlay-title">52-Week Range</div>
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
            <div class="range-filter-row">
              <span class="range-filter-label">% From High</span>
              <div class="range-inputs">
                <span class="p-float-label">
                  <p-inputNumber 
                    inputId="week52-min"
                    [(ngModel)]="filters.fiftyTwoWeek.percentFromHigh.min"
                    (onBlur)="onFilterChange()"
                    [showButtons]="false"
                    mode="decimal"
                    suffix="%"
                    [maxFractionDigits]="1"
                    styleClass="range-input">
                  </p-inputNumber>
                  <label for="week52-min">Min</label>
                </span>
                <span class="range-separator">-</span>
                <span class="p-float-label">
                  <p-inputNumber 
                    inputId="week52-max"
                    [(ngModel)]="filters.fiftyTwoWeek.percentFromHigh.max"
                    (onBlur)="onFilterChange()"
                    [showButtons]="false"
                    mode="decimal"
                    suffix="%"
                    [maxFractionDigits]="1"
                    styleClass="range-input">
                  </p-inputNumber>
                  <label for="week52-max">Max</label>
                </span>
              </div>
            </div>
          </div>
        </p-overlayPanel>

        <!-- Valuation -->
        <button class="filter-trigger" [class.has-value]="hasValuationFilter()" (click)="opValuation.toggle($event)">
          <i class="pi pi-dollar"></i>
          <span>Valuation</span>
          <i class="pi pi-chevron-down arrow"></i>
        </button>
        <p-overlayPanel #opValuation [style]="{'width': '360px'}" appendTo="body">
          <div class="overlay-content">
            <div class="overlay-title">Valuation</div>
            <div class="range-filter-row">
              <span class="range-filter-label">P/E Ratio</span>
              <div class="range-inputs">
                <span class="p-float-label">
                  <p-inputNumber 
                    inputId="pe-min"
                    [(ngModel)]="filters.peRatio.min"
                    (onBlur)="onFilterChange()"
                    [showButtons]="false"
                    mode="decimal"
                    [maxFractionDigits]="1"
                    styleClass="range-input">
                  </p-inputNumber>
                  <label for="pe-min">Min</label>
                </span>
                <span class="range-separator">-</span>
                <span class="p-float-label">
                  <p-inputNumber 
                    inputId="pe-max"
                    [(ngModel)]="filters.peRatio.max"
                    (onBlur)="onFilterChange()"
                    [showButtons]="false"
                    mode="decimal"
                    [maxFractionDigits]="1"
                    styleClass="range-input">
                  </p-inputNumber>
                  <label for="pe-max">Max</label>
                </span>
              </div>
            </div>
            <div class="range-filter-row">
              <span class="range-filter-label">Forward P/E</span>
              <div class="range-inputs">
                <span class="p-float-label">
                  <p-inputNumber 
                    inputId="fpe-min"
                    [(ngModel)]="filters.forwardPeRatio.min"
                    (onBlur)="onFilterChange()"
                    [showButtons]="false"
                    mode="decimal"
                    [maxFractionDigits]="1"
                    styleClass="range-input">
                  </p-inputNumber>
                  <label for="fpe-min">Min</label>
                </span>
                <span class="range-separator">-</span>
                <span class="p-float-label">
                  <p-inputNumber 
                    inputId="fpe-max"
                    [(ngModel)]="filters.forwardPeRatio.max"
                    (onBlur)="onFilterChange()"
                    [showButtons]="false"
                    mode="decimal"
                    [maxFractionDigits]="1"
                    styleClass="range-input">
                  </p-inputNumber>
                  <label for="fpe-max">Max</label>
                </span>
              </div>
            </div>
            <div class="range-filter-row">
              <span class="range-filter-label">P/B Ratio</span>
              <div class="range-inputs">
                <span class="p-float-label">
                  <p-inputNumber 
                    inputId="pb-min"
                    [(ngModel)]="filters.pbRatio.min"
                    (onBlur)="onFilterChange()"
                    [showButtons]="false"
                    mode="decimal"
                    [maxFractionDigits]="1"
                    styleClass="range-input">
                  </p-inputNumber>
                  <label for="pb-min">Min</label>
                </span>
                <span class="range-separator">-</span>
                <span class="p-float-label">
                  <p-inputNumber 
                    inputId="pb-max"
                    [(ngModel)]="filters.pbRatio.max"
                    (onBlur)="onFilterChange()"
                    [showButtons]="false"
                    mode="decimal"
                    [maxFractionDigits]="1"
                    styleClass="range-input">
                  </p-inputNumber>
                  <label for="pb-max">Max</label>
                </span>
              </div>
            </div>
            <div class="range-filter-row">
              <span class="range-filter-label">Dividend Yield</span>
              <div class="range-inputs">
                <span class="p-float-label">
                  <p-inputNumber 
                    inputId="div-min"
                    [(ngModel)]="filters.dividendYield.min"
                    (onBlur)="onFilterChange()"
                    [showButtons]="false"
                    mode="decimal"
                    suffix="%"
                    [maxFractionDigits]="2"
                    styleClass="range-input">
                  </p-inputNumber>
                  <label for="div-min">Min</label>
                </span>
                <span class="range-separator">-</span>
                <span class="p-float-label">
                  <p-inputNumber 
                    inputId="div-max"
                    [(ngModel)]="filters.dividendYield.max"
                    (onBlur)="onFilterChange()"
                    [showButtons]="false"
                    mode="decimal"
                    suffix="%"
                    [maxFractionDigits]="2"
                    styleClass="range-input">
                  </p-inputNumber>
                  <label for="div-max">Max</label>
                </span>
              </div>
            </div>
          </div>
        </p-overlayPanel>

        <!-- Technical -->
        <button class="filter-trigger" [class.has-value]="hasTechnicalFilter()" (click)="opTechnical.toggle($event)">
          <i class="pi pi-chart-line"></i>
          <span>Technical</span>
          <i class="pi pi-chevron-down arrow"></i>
        </button>
        <p-overlayPanel #opTechnical [style]="{'width': '320px'}" appendTo="body">
          <div class="overlay-content">
            <div class="overlay-title">Technical</div>
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
            <div class="cross-filters">
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

        <!-- Volume -->
        <button class="filter-trigger" [class.has-value]="hasVolumeFilter()" (click)="opVolume.toggle($event)">
          <i class="pi pi-chart-bar"></i>
          <span>Volume</span>
          <i class="pi pi-chevron-down arrow"></i>
        </button>
        <p-overlayPanel #opVolume [style]="{'width': '360px'}" appendTo="body">
          <div class="overlay-content">
            <div class="overlay-title">Volume</div>
            <div class="range-filter-row">
              <span class="range-filter-label">Avg Daily Volume</span>
              <div class="range-inputs">
                <span class="p-float-label">
                  <p-inputNumber 
                    inputId="vol-min"
                    [(ngModel)]="filters.avgVolume.min"
                    (onBlur)="onFilterChange()"
                    [showButtons]="false"
                    mode="decimal"
                    styleClass="range-input">
                  </p-inputNumber>
                  <label for="vol-min">Min</label>
                </span>
                <span class="range-separator">-</span>
                <span class="p-float-label">
                  <p-inputNumber 
                    inputId="vol-max"
                    [(ngModel)]="filters.avgVolume.max"
                    (onBlur)="onFilterChange()"
                    [showButtons]="false"
                    mode="decimal"
                    styleClass="range-input">
                  </p-inputNumber>
                  <label for="vol-max">Max</label>
                </span>
              </div>
            </div>
            <div class="range-filter-row">
              <span class="range-filter-label">Relative Volume</span>
              <div class="range-inputs">
                <span class="p-float-label">
                  <p-inputNumber 
                    inputId="rvol-min"
                    [(ngModel)]="filters.relativeVolume.min"
                    (onBlur)="onFilterChange()"
                    [showButtons]="false"
                    mode="decimal"
                    [minFractionDigits]="1"
                    [maxFractionDigits]="2"
                    styleClass="range-input">
                  </p-inputNumber>
                  <label for="rvol-min">Min</label>
                </span>
                <span class="range-separator">-</span>
                <span class="p-float-label">
                  <p-inputNumber 
                    inputId="rvol-max"
                    [(ngModel)]="filters.relativeVolume.max"
                    (onBlur)="onFilterChange()"
                    [showButtons]="false"
                    mode="decimal"
                    [minFractionDigits]="1"
                    [maxFractionDigits]="2"
                    styleClass="range-input">
                  </p-inputNumber>
                  <label for="rvol-max">Max</label>
                </span>
              </div>
            </div>
          </div>
        </p-overlayPanel>

        <!-- Sectors -->
        <button class="filter-trigger" [class.has-value]="filters.sectors.length > 0" (click)="opSectors.toggle($event)">
          <i class="pi pi-th-large"></i>
          <span>Sectors</span>
          @if (filters.sectors.length > 0) {
            <span class="filter-count">{{ filters.sectors.length }}</span>
          }
          <i class="pi pi-chevron-down arrow"></i>
        </button>
        <p-overlayPanel #opSectors [style]="{'width': '320px'}" appendTo="body">
          <div class="overlay-content">
            <div class="overlay-title">Sectors</div>
            <p-multiSelect 
              [options]="sectorOptions"
              [(ngModel)]="filters.sectors"
              (onChange)="onSectorChange()"
              placeholder="All Sectors"
              display="chip"
              [showClear]="true"
              [filter]="true"
              filterPlaceholder="Search..."
              appendTo="body"
              styleClass="w-full compact-multiselect">
            </p-multiSelect>
          </div>
        </p-overlayPanel>

        <!-- Industry -->
        <button class="filter-trigger" [class.has-value]="selectedIndustries.length > 0" (click)="opIndustry.toggle($event)">
          <i class="pi pi-briefcase"></i>
          <span>Industry</span>
          @if (selectedIndustries.length > 0) {
            <span class="filter-count">{{ selectedIndustries.length }}</span>
          }
          <i class="pi pi-chevron-down arrow"></i>
        </button>
        <p-overlayPanel #opIndustry [style]="{'width': '320px'}" appendTo="body">
          <div class="overlay-content">
            <div class="overlay-title">Industry</div>
            <p-multiSelect 
              [options]="industryOptions()"
              [(ngModel)]="selectedIndustries"
              (onChange)="onIndustryChange()"
              [placeholder]="industryOptions().length > 0 ? 'All Industries' : 'Loading...'"
              display="chip"
              [showClear]="true"
              [filter]="true"
              filterPlaceholder="Search..."
              appendTo="body"
              styleClass="w-full compact-multiselect">
            </p-multiSelect>
          </div>
        </p-overlayPanel>
      </div>

      <!-- Action Buttons -->
      <div class="filter-actions">
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
  `,
  styles: [`
    .filter-bar {
      background: var(--surface-card);
      border: 1px solid var(--surface-border);
      border-radius: 10px;
      padding: 0.5rem 0.75rem;
      display: flex;
      align-items: center;
      gap: 0.5rem;
      flex-wrap: wrap;
    }

    .filter-buttons {
      display: flex;
      align-items: center;
      gap: 0.375rem;
      flex-wrap: wrap;
      flex: 1;
    }

    .filter-trigger {
      display: inline-flex;
      align-items: center;
      gap: 0.35rem;
      padding: 0.4rem 0.65rem;
      border-radius: 8px;
      border: 1px solid var(--surface-border);
      background: var(--surface-ground);
      color: var(--text-color-secondary);
      font-size: 0.78rem;
      font-weight: 500;
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
        border-color: var(--primary-color);
        color: var(--text-color);
        background: var(--surface-hover);
      }

      &.has-value {
        border-color: var(--primary-color);
        background: rgba(var(--primary-color-rgb, 99, 102, 241), 0.08);
        color: var(--primary-color);
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
      gap: 0.5rem;
      margin-left: auto;
      flex-shrink: 0;
    }

    .reset-action {
      display: inline-flex;
      align-items: center;
      gap: 0.3rem;
      padding: 0.45rem 0.7rem;
      border-radius: 8px;
      border: 1px solid var(--surface-border);
      background: transparent;
      color: var(--text-color-secondary);
      font-size: 0.78rem;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.15s ease;
      white-space: nowrap;

      i { font-size: 0.75rem; }

      &:hover {
        color: var(--text-color);
        border-color: var(--text-color-secondary);
        background: var(--surface-hover);
      }
    }

    .run-action {
      display: inline-flex;
      align-items: center;
      gap: 0.4rem;
      padding: 0.5rem 1.1rem;
      border-radius: 8px;
      border: none;
      background: linear-gradient(135deg, #22c55e 0%, #16a34a 100%);
      color: #fff;
      font-size: 0.82rem;
      font-weight: 700;
      letter-spacing: 0.02em;
      cursor: pointer;
      transition: all 0.2s ease;
      white-space: nowrap;
      box-shadow: 0 2px 8px rgba(34, 197, 94, 0.3);

      i { font-size: 0.85rem; }

      &:hover:not(:disabled) {
        transform: translateY(-1px);
        box-shadow: 0 4px 14px rgba(34, 197, 94, 0.45);
        background: linear-gradient(135deg, #16a34a 0%, #15803d 100%);
      }

      &:active:not(:disabled) {
        transform: translateY(0);
      }

      &:disabled {
        opacity: 0.7;
        cursor: not-allowed;
      }

      &.loading {
        background: linear-gradient(135deg, #22c55e 0%, #16a34a 100%);
      }
    }

    /* Overlay Panel Content */
    .overlay-content {
      display: flex;
      flex-direction: column;
      gap: 0.875rem;
      padding: 0.25rem;
    }

    .overlay-title {
      font-size: 0.85rem;
      font-weight: 600;
      color: var(--text-color);
      text-transform: uppercase;
      letter-spacing: 0.04em;
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
      gap: 0.75rem 1.25rem;
    }

    .checkbox-col {
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
    }

    .checkbox-item {
      display: flex;
      align-items: center;
      gap: 0.625rem;
      cursor: pointer;

      span {
        font-size: 0.85rem;
        color: var(--text-color);
      }
    }

    .range-filter-row {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
    }

    .range-filter-label {
      font-size: 0.8rem;
      color: var(--text-color-secondary);
      font-weight: 500;
    }

    .range-inputs {
      display: flex;
      align-items: center;
      gap: 0.625rem;

      .p-float-label {
        flex: 1;
        min-width: 0;
      }
    }

    .range-separator {
      color: var(--text-color-secondary);
      font-size: 0.9rem;
      font-weight: 600;
      flex-shrink: 0;
      width: 20px;
      text-align: center;
    }

    .ma-filter-row {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
    }

    .ma-filter-label {
      font-size: 0.8rem;
      color: var(--text-color-secondary);
      font-weight: 500;
    }

    .cross-filters {
      display: flex;
      gap: 1.25rem;
      padding-top: 0.25rem;
    }

    .w-full {
      width: 100%;
    }

    :host ::ng-deep {
      .range-input {
        width: 100%;

        input.p-inputnumber-input {
          width: 100%;
          font-size: 0.85rem;
          padding: 0.65rem 0.75rem;
          border-radius: 8px;
          background: var(--surface-ground);
          border: 1px solid var(--surface-border);
          color: var(--text-color);
          transition: border-color 0.2s ease, box-shadow 0.2s ease;

          &:hover {
            border-color: var(--primary-color);
          }

          &:focus {
            border-color: var(--primary-color);
            box-shadow: 0 0 0 2px rgba(var(--primary-color-rgb, 99, 102, 241), 0.15);
            outline: none;
          }
        }
      }

      .p-float-label {
        label {
          font-size: 0.8rem;
          color: var(--text-color-secondary);
          left: 0.75rem;
          transition: all 0.2s ease;
        }

        input:focus ~ label,
        input.p-filled ~ label,
        .p-inputwrapper-focus ~ label,
        .p-inputwrapper-filled ~ label {
          top: -0.5rem;
          font-size: 0.7rem;
          background: var(--surface-overlay);
          padding: 0 0.25rem;
          color: var(--primary-color);
        }
      }

      p-selectbutton.ma-toggle {
        .p-selectbutton {
          display: inline-flex !important;
          background: var(--surface-ground) !important;
          border-radius: 20px !important;
          padding: 4px !important;
          gap: 3px !important;
          border: 1px solid var(--surface-border) !important;
        }
        
        .p-togglebutton {
          flex: 0 0 auto !important;
          font-size: 0.72rem !important;
          font-weight: 600 !important;
          padding: 0.35rem 0.7rem !important;
          justify-content: center !important;
          border-radius: 14px !important;
          border: none !important;
          background: transparent !important;
          color: var(--text-color-secondary) !important;
          transition: all 0.2s ease !important;
          min-width: 46px !important;
          cursor: pointer !important;
        }

        .p-togglebutton:hover:not(.p-togglebutton-checked) {
          background: rgba(99, 102, 241, 0.2) !important;
          color: var(--text-color) !important;
        }

        .p-togglebutton-checked {
          background: linear-gradient(135deg, #6366f1, #4f46e5) !important;
          color: #ffffff !important;
          box-shadow: 0 2px 6px rgba(99, 102, 241, 0.4) !important;
        }

        .p-togglebutton:focus {
          box-shadow: none !important;
        }
      }

      p-selectbutton.compact-toggle {
        .p-selectbutton {
          display: inline-flex !important;
          background: var(--surface-ground) !important;
          border-radius: 20px !important;
          padding: 4px !important;
          gap: 3px !important;
          border: 1px solid var(--surface-border) !important;
        }
        
        .p-togglebutton {
          flex: 1 !important;
          font-size: 0.72rem !important;
          font-weight: 600 !important;
          padding: 0.35rem 0.7rem !important;
          justify-content: center !important;
          border-radius: 14px !important;
          border: none !important;
          background: transparent !important;
          color: var(--text-color-secondary) !important;
          transition: all 0.2s ease !important;
          cursor: pointer !important;
        }

        .p-togglebutton:hover:not(.p-togglebutton-checked) {
          background: rgba(99, 102, 241, 0.2) !important;
          color: var(--text-color) !important;
        }

        .p-togglebutton-checked {
          background: linear-gradient(135deg, #6366f1, #4f46e5) !important;
          color: #ffffff !important;
          box-shadow: 0 2px 6px rgba(99, 102, 241, 0.4) !important;
        }

        .p-togglebutton:focus {
          box-shadow: none !important;
        }
      }

      .compact-multiselect {
        .p-multiselect {
          border-radius: 8px;
          background: var(--surface-ground);
          border: 1px solid var(--surface-border);

          &:hover {
            border-color: var(--primary-color);
          }

          &.p-focus {
            border-color: var(--primary-color);
            box-shadow: 0 0 0 2px rgba(var(--primary-color-rgb, 99, 102, 241), 0.15);
          }
        }

        .p-multiselect-label {
          font-size: 0.85rem;
          padding: 0.65rem 0.75rem;
        }

        .p-multiselect-token {
          font-size: 0.75rem;
          padding: 0.25rem 0.5rem;
          border-radius: 4px;
        }
      }

      .p-checkbox .p-checkbox-box {
        width: 1.25rem;
        height: 1.25rem;
        border-radius: 4px;
        border: 1px solid var(--surface-border);
        transition: all 0.2s ease;

        &:hover {
          border-color: var(--primary-color);
        }

        &.p-highlight {
          background: var(--primary-color);
          border-color: var(--primary-color);
        }
      }

      .p-overlaypanel {
        .p-overlaypanel-content {
          padding: 1rem;
        }
      }
    }

    @media (max-width: 768px) {
      .filter-bar {
        padding: 0.375rem 0.5rem;
      }

      .filter-trigger span {
        display: none;
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
