import { ChangeDetectionStrategy, Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ToastModule } from 'primeng/toast';
import { ButtonModule } from 'primeng/button';
import { TooltipModule } from 'primeng/tooltip';
import { MessageService } from 'primeng/api';

import { FilterPanelComponent } from './filter-panel/filter-panel.component';
import { ResultsTableComponent } from './results-table/results-table.component';

@Component({
  selector: 'app-screener',
  changeDetection: ChangeDetectionStrategy.OnPush,
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

    <div class="screener-workstation">
      <section class="screener-topline" aria-label="Screener header">
        <div class="topline-title">
          <h1>Screener</h1>
          <p>Build a custom screen and review matching stocks in one focused table.</p>
        </div>
      </section>

      <div class="workbench">
        <app-filter-panel (screenRun)="onScreenRun()"></app-filter-panel>
        <app-results-table></app-results-table>
      </div>
    </div>
  `,
  styles: [`
    .screener-workstation {
      position: relative;
      display: flex;
      flex-direction: column;
      gap: 0.9rem;
      padding: 1.25rem;
      max-width: 1900px;
      margin: 0 auto;
      min-height: calc(100vh - 56px);
      background: linear-gradient(180deg, rgba(15, 23, 42, 0.16), transparent 34%);
    }

    .screener-topline {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 1rem;
      padding: 1rem 1.1rem;
      border: 1px solid rgba(148, 163, 184, 0.14);
      border-radius: 18px;
      background: rgba(15, 23, 42, 0.58);
    }

    .topline-title {
      display: flex;
      align-items: baseline;
      gap: 0.75rem;
      flex-wrap: wrap;
      min-width: 0;
    }

    .topline-title h1 {
      margin: 0;
      color: #f8fafc;
      font-size: clamp(1.45rem, 2.8vw, 2.15rem);
      font-weight: 900;
      line-height: 1;
      letter-spacing: -0.045em;
    }

    .topline-title p {
      margin: 0;
      color: #94a3b8;
      font-size: 0.9rem;
    }

    .workbench {
      display: flex;
      min-height: 0;
      flex: 1;
      flex-direction: column;
      gap: 0.65rem;
    }

    @media (max-width: 768px) {
      .screener-workstation {
        padding: 0.75rem;
      }

      .screener-topline {
        align-items: flex-start;
        flex-direction: column;
        gap: 0.4rem;
      }
    }
  `]
})
export class ScreenerComponent implements OnInit {
  ngOnInit(): void {
    // No auto-run; user triggers screen manually
  }

  onScreenRun(): void {
    // No-op: filters are always visible
  }
}
