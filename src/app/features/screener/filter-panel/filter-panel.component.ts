import { Component, inject, OnInit, OnDestroy, effect, signal, output } from '@angular/core';
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
    FloatLabelModule
  ],
  template: `
    <div class="filter-panel">
      <!-- Header -->
      <div class="filter-header">
        <div class="header-title">
          <i class="pi pi-sliders-h"></i>
          <span>Filters</span>
        </div>
        <button 
          pButton 
          pRipple
          type="button" 
          icon="pi pi-refresh"
          class="p-button-text p-button-rounded p-button-sm reset-btn"
          pTooltip="Reset all filters"
          tooltipPosition="left"
          (click)="resetFilters()"
          [disabled]="screenerService.activeFilterCount() === 0">
        </button>
      </div>

      <!-- Filter Sections -->
      <div class="filter-sections">
        <!-- Market Cap -->
        <div class="filter-section" [class.collapsed]="collapsedMarketCap">
          <button class="section-header" (click)="collapsedMarketCap = !collapsedMarketCap">
            <span class="section-title">Market Cap</span>
            <i class="pi" [class.pi-chevron-down]="collapsedMarketCap" [class.pi-chevron-up]="!collapsedMarketCap"></i>
          </button>
          @if (!collapsedMarketCap) {
            <div class="section-content">
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
                <div class="range-inputs custom-range">
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
          }
        </div>

        <!-- 52-Week Range -->
        <div class="filter-section" [class.collapsed]="collapsedWeek52">
          <button class="section-header" (click)="collapsedWeek52 = !collapsedWeek52">
            <span class="section-title">52-Week Range</span>
            <i class="pi" [class.pi-chevron-down]="collapsedWeek52" [class.pi-chevron-up]="!collapsedWeek52"></i>
          </button>
          @if (!collapsedWeek52) {
            <div class="section-content">
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
          }
        </div>

        <!-- Valuation -->
        <div class="filter-section" [class.collapsed]="collapsedValuation">
          <button class="section-header" (click)="collapsedValuation = !collapsedValuation">
            <span class="section-title">Valuation</span>
            <i class="pi" [class.pi-chevron-down]="collapsedValuation" [class.pi-chevron-up]="!collapsedValuation"></i>
          </button>
          @if (!collapsedValuation) {
            <div class="section-content">
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
          }
        </div>

        <!-- Technical -->
        <div class="filter-section" [class.collapsed]="collapsedTechnical">
          <button class="section-header" (click)="collapsedTechnical = !collapsedTechnical">
            <span class="section-title">Technical</span>
            <i class="pi" [class.pi-chevron-down]="collapsedTechnical" [class.pi-chevron-up]="!collapsedTechnical"></i>
          </button>
          @if (!collapsedTechnical) {
            <div class="section-content">
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
          }
        </div>

        <!-- Volume -->
        <div class="filter-section" [class.collapsed]="collapsedVolume">
          <button class="section-header" (click)="collapsedVolume = !collapsedVolume">
            <span class="section-title">Volume</span>
            <i class="pi" [class.pi-chevron-down]="collapsedVolume" [class.pi-chevron-up]="!collapsedVolume"></i>
          </button>
          @if (!collapsedVolume) {
            <div class="section-content">
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
          }
        </div>

        <!-- Sectors -->
        <div class="filter-section" [class.collapsed]="collapsedSectors">
          <button class="section-header" (click)="collapsedSectors = !collapsedSectors">
            <span class="section-title">Sectors</span>
            <i class="pi" [class.pi-chevron-down]="collapsedSectors" [class.pi-chevron-up]="!collapsedSectors"></i>
          </button>
          @if (!collapsedSectors) {
            <div class="section-content">
              <p-multiSelect 
                [options]="sectorOptions"
                [(ngModel)]="filters.sectors"
                (onChange)="onFilterChange()"
                placeholder="All Sectors"
                display="chip"
                [showClear]="true"
                [filter]="true"
                filterPlaceholder="Search..."
                appendTo="body"
                styleClass="w-full compact-multiselect">
              </p-multiSelect>
            </div>
          }
        </div>
      </div>

      <!-- Run Button -->
      <div class="run-section">
        <button 
          pButton 
          pRipple
          type="button"
          label="Run Screen"
          icon="pi pi-play"
          class="run-button"
          [loading]="screenerService.loading()"
          (click)="runScreen()">
        </button>
      </div>
    </div>
  `,
  styles: [`
    .filter-panel {
      background: var(--surface-card);
      border: 1px solid var(--surface-border);
      border-radius: 12px;
      overflow: hidden;
      width: 280px;
      display: flex;
      flex-direction: column;
      max-height: calc(100vh - 100px);
    }

    .filter-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 1rem 1.25rem 0.875rem;
      border-bottom: 1px solid var(--surface-border);
      background: var(--surface-ground);
    }

    .header-title {
      display: flex;
      align-items: center;
      gap: 0.625rem;
      font-weight: 600;
      font-size: 1rem;
      color: var(--text-color);

      i {
        color: var(--primary-color);
        font-size: 1.125rem;
      }
    }

    .reset-btn {
      width: 2.25rem !important;
      height: 2.25rem !important;
    }

    .filter-sections {
      flex: 1;
      overflow-y: auto;
      overflow-x: hidden;
      
      /* Custom scrollbar */
      &::-webkit-scrollbar {
        width: 6px;
      }
      &::-webkit-scrollbar-track {
        background: transparent;
      }
      &::-webkit-scrollbar-thumb {
        background: var(--surface-border);
        border-radius: 3px;
      }
      &::-webkit-scrollbar-thumb:hover {
        background: var(--text-color-secondary);
      }
    }

    .filter-section {
      &:last-child .section-header {
        border-bottom: 1px solid var(--surface-border);
      }

      &.collapsed .section-header {
        border-bottom: none;
      }
    }

    .section-header {
      width: 100%;
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0.875rem 1.25rem;
      background: var(--surface-card);
      border: none;
      cursor: pointer;
      color: var(--text-color);
      transition: background 0.15s ease;
      position: sticky;
      top: 0;
      z-index: 10;
      border-bottom: 1px solid var(--surface-border);

      &:hover {
        background: var(--surface-hover);
      }

      i {
        font-size: 0.75rem;
        color: var(--text-color-secondary);
      }
    }

    .section-title {
      font-size: 0.85rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }

    .section-content {
      padding: 0.25rem 1.25rem 1.25rem;
      display: flex;
      flex-direction: column;
      gap: 1rem;
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

    .checkbox-row {
      display: flex;
      gap: 1.25rem;
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

    .chip-group {
      display: flex;
      flex-wrap: wrap;
      gap: 0.5rem;
    }

    .filter-chip {
      display: inline-flex;
      align-items: center;
      padding: 0.375rem 0.625rem;
      font-size: 0.75rem;
      font-weight: 500;
      border: 1px solid var(--surface-border);
      border-radius: 6px;
      background: var(--surface-ground);
      color: var(--text-color-secondary);
      cursor: pointer;
      transition: all 0.15s ease;

      &:hover {
        background: var(--surface-hover);
        border-color: var(--primary-color);
        color: var(--text-color);
      }

      &.active {
        background: var(--primary-color);
        border-color: var(--primary-color);
        color: var(--primary-color-text);
      }

      i {
        margin-right: 0.375rem;
      }
    }

    /* Range filter styles - Professional look */
    .range-filter-row {
      display: flex;
      flex-direction: column;
      gap: 0.625rem;
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

    .range-inputs.custom-range {
      margin-top: 0.25rem;
    }

    .range-separator {
      color: var(--text-color-secondary);
      font-size: 0.9rem;
      font-weight: 600;
      flex-shrink: 0;
      width: 20px;
      text-align: center;
    }

    /* MA Filter styles */
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

    :host ::ng-deep {
      /* Range input styling */
      .range-input {
        width: 100%;

        input.p-inputnumber-input {
          width: 100%;
          font-size: 0.85rem;
          padding: 0.75rem 0.875rem;
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

          &::placeholder {
            color: var(--text-color-secondary);
            opacity: 0.7;
          }
        }
      }

      /* Float label styling */
      .p-float-label {
        label {
          font-size: 0.8rem;
          color: var(--text-color-secondary);
          left: 0.875rem;
          transition: all 0.2s ease;
        }

        input:focus ~ label,
        input.p-filled ~ label,
        .p-inputwrapper-focus ~ label,
        .p-inputwrapper-filled ~ label {
          top: -0.5rem;
          font-size: 0.7rem;
          background: var(--surface-card);
          padding: 0 0.25rem;
          color: var(--primary-color);
        }
      }

      /* MA toggle styling - Pill-shaped segmented control */
      p-selectbutton.ma-toggle {
        .p-selectbutton {
          display: inline-flex !important;
          background: #1e1e2e !important;
          border-radius: 20px !important;
          padding: 4px !important;
          gap: 3px !important;
          border: 1px solid #3f3f5a !important;
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
          color: #a0a0b0 !important;
          transition: all 0.2s ease !important;
          min-width: 46px !important;
          cursor: pointer !important;
        }

        .p-togglebutton:hover:not(.p-togglebutton-checked) {
          background: rgba(99, 102, 241, 0.2) !important;
          color: #e0e0e0 !important;
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

      /* Compact toggle - Pill-shaped segmented control */
      p-selectbutton.compact-toggle {
        .p-selectbutton {
          display: inline-flex !important;
          background: #1e1e2e !important;
          border-radius: 20px !important;
          padding: 4px !important;
          gap: 3px !important;
          border: 1px solid #3f3f5a !important;
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
          color: #a0a0b0 !important;
          transition: all 0.2s ease !important;
          cursor: pointer !important;
        }

        .p-togglebutton:hover:not(.p-togglebutton-checked) {
          background: rgba(99, 102, 241, 0.2) !important;
          color: #e0e0e0 !important;
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
          padding: 0.75rem 0.875rem;
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
    }

    .run-section {
      padding: 1.25rem;
      background: var(--surface-ground);
      border-top: 1px solid var(--surface-border);
    }

    .run-button {
      width: 100%;
      font-weight: 600;
      font-size: 0.95rem;
      padding: 0.875rem 1.25rem;
      border-radius: 8px;
      background: linear-gradient(135deg, var(--primary-color) 0%, var(--primary-600, #4f46e5) 100%);
      border: none;
      transition: all 0.2s ease;

      &:hover:not(:disabled) {
        transform: translateY(-1px);
        box-shadow: 0 4px 12px rgba(var(--primary-color-rgb, 99, 102, 241), 0.35);
      }

      &:active:not(:disabled) {
        transform: translateY(0);
      }
    }

    .w-full {
      width: 100%;
    }

    /* Scrollbar styling */
    .filter-sections::-webkit-scrollbar {
      width: 6px;
    }

    .filter-sections::-webkit-scrollbar-track {
      background: transparent;
    }

    .filter-sections::-webkit-scrollbar-thumb {
      background: var(--surface-border);
      border-radius: 3px;
    }

    .filter-sections::-webkit-scrollbar-thumb:hover {
      background: var(--text-color-secondary);
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

  // Collapsed state for sections - all collapsed by default
  collapsedMarketCap = true;
  collapsedWeek52 = true;
  collapsedValuation = true;
  collapsedTechnical = true;
  collapsedVolume = true;
  collapsedSectors = true;

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
}
