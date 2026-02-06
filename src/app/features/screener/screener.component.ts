import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ToastModule } from 'primeng/toast';
import { ButtonModule } from 'primeng/button';
import { TooltipModule } from 'primeng/tooltip';
import { MessageService } from 'primeng/api';

import { FilterPanelComponent } from './filter-panel/filter-panel.component';
import { ResultsTableComponent } from './results-table/results-table.component';
import { ScreenerService, MarketService, StockService } from '../../core/services';

@Component({
  selector: 'app-screener',
  standalone: true,
  imports: [
    CommonModule,
    ToastModule,
    ButtonModule,
    TooltipModule,
    FilterPanelComponent,
    ResultsTableComponent
  ],
  providers: [MessageService],
  template: `
    <p-toast position="top-right"></p-toast>
    
    <div class="screener-layout">
      <!-- Filter Bar (horizontal, above results) -->
      <app-filter-panel (screenRun)="onScreenRun()"></app-filter-panel>

      <!-- Results Table -->
      <app-results-table></app-results-table>
    </div>
  `,
  styles: [`
    .screener-layout {
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
      padding: 1rem;
      max-width: 1900px;
      margin: 0 auto;
      min-height: calc(100vh - 64px);
    }

    @media (max-width: 768px) {
      .screener-layout {
        padding: 0.75rem;
        gap: 0.5rem;
      }
    }
  `]
})
export class ScreenerComponent implements OnInit {
  screenerService = inject(ScreenerService);
  marketService = inject(MarketService);
  stockService = inject(StockService);
  messageService = inject(MessageService);

  ngOnInit(): void {
    // No auto-run; user triggers screen manually
  }

  onScreenRun(): void {
    // No-op: filters are always visible
  }
}
