import { Component, inject, OnInit } from '@angular/core';
import { RouterOutlet, RouterModule } from '@angular/router';
import { CommonModule } from '@angular/common';

import { HeaderComponent } from './layout/header/header.component';
import { ThemeService, VersionService } from './core/services';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, RouterOutlet, RouterModule, HeaderComponent],
  template: `
    <div class="app-container">
      <app-header></app-header>
      <div class="content-wrapper">
        <!-- Left Nav Sidebar -->
        <nav class="nav-sidebar">
          <a class="nav-item" [routerLink]="versionService.getScreenerRoute()" routerLinkActive="active" [routerLinkActiveOptions]="{exact: true}" title="Screener">
            <i class="pi pi-table"></i>
            <span class="nav-label">Screener</span>
          </a>
          <a class="nav-item" [routerLink]="versionService.getBreakoutsRoute()" routerLinkActive="active" title="Breakouts">
            <i class="pi pi-chart-line"></i>
            <span class="nav-label">Breakouts</span>
          </a>
          <a class="nav-item" [routerLink]="versionService.getNewsRoute()" routerLinkActive="active" title="News">
            <i class="pi pi-bolt"></i>
            <span class="nav-label">News</span>
          </a>
          <a class="nav-item" [routerLink]="versionService.getDmaRoute()" routerLinkActive="active" title="DMA Simulator">
            <i class="pi pi-chart-bar"></i>
            <span class="nav-label">DMA</span>
          </a>
          
          <!-- Spacer -->
          <div class="nav-spacer"></div>
          
          <!-- Version Toggle -->
          <div class="version-toggle" (click)="versionService.toggleVersion()" [title]="'Switch to ' + (versionService.isV2() ? 'V1' : 'V2')">
            <div class="version-switch" [class.v2]="versionService.isV2()">
              <span class="version-label">{{ versionService.isV2() ? 'V2' : 'V1' }}</span>
            </div>
          </div>
        </nav>

        <!-- Page Content -->
        <main class="page-content">
          <router-outlet></router-outlet>
        </main>
      </div>
    </div>
  `,
  styles: [`
    .app-container {
      min-height: 100vh;
      display: flex;
      flex-direction: column;
    }

    .content-wrapper {
      display: flex;
      flex: 1;
      min-height: 0;
    }

    .nav-sidebar {
      width: 64px;
      background: var(--surface-card);
      border-right: 1px solid var(--surface-border);
      display: flex;
      flex-direction: column;
      align-items: center;
      padding-top: 0.75rem;
      gap: 0.25rem;
      flex-shrink: 0;
      position: sticky;
      top: 56px;
      height: calc(100vh - 56px);
      z-index: 100;
    }

    .nav-item {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 0.2rem;
      width: 52px;
      height: 52px;
      border-radius: 10px;
      text-decoration: none;
      color: var(--text-color-secondary);
      font-size: 0.65rem;
      font-weight: 500;
      transition: all 0.2s ease;
      cursor: pointer;

      i {
        font-size: 1.15rem;
        transition: all 0.2s ease;
      }
    }

    .nav-item:hover {
      color: var(--text-color);
      background: var(--surface-hover);
    }

    .nav-item.active {
      color: var(--primary-color);
      background: rgba(var(--primary-color-rgb, 99, 102, 241), 0.12);
    }

    .nav-item.active i {
      transform: scale(1.1);
    }

    .nav-label {
      line-height: 1;
      letter-spacing: 0.01em;
    }

    .nav-spacer {
      flex: 1;
    }

    .version-toggle {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 52px;
      height: 36px;
      margin-bottom: 1rem;
      cursor: pointer;
      transition: all 0.2s ease;
    }

    .version-switch {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 40px;
      height: 24px;
      border-radius: 12px;
      background: linear-gradient(135deg, #64748b, #475569);
      border: 1px solid rgba(255, 255, 255, 0.1);
      transition: all 0.3s ease;
      box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
    }

    .version-switch.v2 {
      background: linear-gradient(135deg, #6366f1, #8b5cf6);
      border-color: rgba(139, 92, 246, 0.3);
      box-shadow: 0 2px 8px rgba(99, 102, 241, 0.4);
    }

    .version-label {
      font-size: 0.65rem;
      font-weight: 700;
      color: white;
      letter-spacing: 0.05em;
      text-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
    }

    .version-toggle:hover .version-switch {
      transform: scale(1.05);
    }

    .version-toggle:hover .version-switch:not(.v2) {
      background: linear-gradient(135deg, #475569, #334155);
    }

    .version-toggle:hover .version-switch.v2 {
      background: linear-gradient(135deg, #818cf8, #a78bfa);
    }

    .page-content {
      flex: 1;
      min-width: 0;
      overflow-x: hidden;
    }

    @media (max-width: 768px) {
      .nav-sidebar {
        width: 48px;
        padding-top: 0.5rem;
      }

      .nav-item {
        width: 40px;
        height: 40px;
      }

      .nav-label {
        display: none;
      }

      .version-toggle {
        width: 40px;
        height: 30px;
      }

      .version-switch {
        width: 32px;
        height: 20px;
      }

      .version-label {
        font-size: 0.55rem;
      }
    }
  `]
})
export class AppComponent implements OnInit {
  private themeService = inject(ThemeService);
  versionService = inject(VersionService);

  ngOnInit(): void {
    // Theme service initializes itself in constructor
  }
}
