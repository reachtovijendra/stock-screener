import { Component, inject, OnInit, signal } from '@angular/core';
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
    
    <div class="screener-layout" [class.sidebar-collapsed]="sidebarCollapsed()">
      <!-- Expand Button (shown when collapsed) -->
      @if (sidebarCollapsed()) {
        <button class="expand-btn" (click)="toggleSidebar()" pTooltip="Show Filters" tooltipPosition="right">
          <i class="pi pi-filter"></i>
        </button>
      }
      
      <!-- Filter Sidebar -->
      <aside class="screener-sidebar" [class.collapsed]="sidebarCollapsed()">
        <app-filter-panel (screenRun)="onScreenRun()"></app-filter-panel>
      </aside>

      <!-- Main Content -->
      <main class="screener-main">
        <app-results-table (toggleFilters)="toggleSidebar()"></app-results-table>
      </main>
    </div>
  `,
  styles: [`
    .screener-layout {
      display: grid;
      grid-template-columns: 280px 1fr;
      gap: 1rem;
      padding: 1rem;
      max-width: 1900px;
      margin: 0 auto;
      min-height: calc(100vh - 64px);
      position: relative;
      transition: grid-template-columns 0.3s ease;
    }

    .screener-layout.sidebar-collapsed {
      grid-template-columns: 0 1fr;
      gap: 0;
    }

    .expand-btn {
      position: fixed;
      left: 0;
      top: 50%;
      transform: translateY(-50%);
      z-index: 100;
      background: var(--primary-color);
      color: white;
      border: none;
      border-radius: 0 8px 8px 0;
      padding: 1rem 0.5rem;
      cursor: pointer;
      transition: all 0.2s ease;
      display: flex;
      align-items: center;
      justify-content: center;
      
      &:hover {
        padding-left: 0.75rem;
        background: var(--primary-600);
      }
      
      i {
        font-size: 1.25rem;
      }
    }

    .screener-sidebar {
      min-width: 0;
      position: sticky;
      top: 1rem;
      height: fit-content;
      max-height: calc(100vh - 2rem);
      transition: all 0.3s ease;
      overflow: hidden;
    }

    .screener-sidebar.collapsed {
      width: 0;
      opacity: 0;
      pointer-events: none;
    }

    .screener-main {
      min-width: 0;
    }

    @media (max-width: 1200px) {
      .screener-layout {
        grid-template-columns: 1fr;
      }

      .screener-layout.sidebar-collapsed {
        grid-template-columns: 1fr;
      }

      .screener-sidebar {
        position: static;
        max-height: none;
        order: 1;
      }

      .screener-sidebar.collapsed {
        height: 0;
        margin: 0;
      }

      .screener-main {
        order: 2;
      }

      .expand-btn {
        top: 80px;
        transform: none;
      }
    }

    @media (max-width: 768px) {
      .screener-layout {
        padding: 0.75rem;
        gap: 0.75rem;
      }
    }
  `]
})
export class ScreenerComponent implements OnInit {
  screenerService = inject(ScreenerService);
  marketService = inject(MarketService);
  stockService = inject(StockService);
  messageService = inject(MessageService);

  sidebarCollapsed = signal(false);

  ngOnInit(): void {
    // Optionally load initial data or show welcome message
  }

  toggleSidebar(): void {
    this.sidebarCollapsed.update(v => !v);
  }

  onScreenRun(): void {
    // Collapse sidebar when screen is run
    this.sidebarCollapsed.set(true);
  }
}
