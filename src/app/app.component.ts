import { Component, inject, OnInit } from '@angular/core';
import { RouterOutlet, RouterModule } from '@angular/router';
import { CommonModule } from '@angular/common';

import { HeaderComponent } from './layout/header/header.component';
import { ThemeService } from './core/services';

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
          <a class="nav-item premium" routerLink="/portfolio" routerLinkActive="active" title="Portfolio Tracker">
            <i class="pi pi-wallet"></i>
            <span class="nav-label">Portfolio</span>
          </a>
          <a class="nav-item premium" routerLink="/watchlists" routerLinkActive="active" title="Watchlists">
            <i class="pi pi-bookmark"></i>
            <span class="nav-label">Watchlists</span>
          </a>
          <a class="nav-item premium" routerLink="/recommendations" routerLinkActive="active" title="Day Trades">
            <i class="pi pi-star"></i>
            <span class="nav-label">Trades</span>
          </a>

          <div class="nav-divider"></div>

          <a class="nav-item" routerLink="/" routerLinkActive="active" [routerLinkActiveOptions]="{exact: true}" title="Screener">
            <i class="pi pi-table"></i>
            <span class="nav-label">Screener</span>
          </a>
          <a class="nav-item" routerLink="/breakouts" routerLinkActive="active" title="Breakouts">
            <i class="pi pi-chart-line"></i>
            <span class="nav-label">Breakouts</span>
          </a>
          <a class="nav-item" routerLink="/dma-simulator" routerLinkActive="active" title="DMA Crossovers">
            <i class="pi pi-chart-bar"></i>
            <span class="nav-label">Crossovers</span>
          </a>
          <a class="nav-item" routerLink="/news" routerLinkActive="active" title="News">
            <i class="pi pi-bolt"></i>
            <span class="nav-label">News</span>
          </a>
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
      padding-top: 56px;
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

    .nav-divider {
      width: 32px;
      height: 1px;
      background: linear-gradient(90deg, transparent, var(--surface-border), transparent);
      margin: 0.35rem 0;
    }

    .nav-item.premium {
      position: relative;

      i {
        background: linear-gradient(135deg, #a78bfa, #60a5fa);
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
        background-clip: text;
      }
    }

    .nav-item.premium:hover {
      background: rgba(167, 139, 250, 0.08);
      color: #c4b5fd;
    }

    .nav-item.premium.active {
      background: rgba(167, 139, 250, 0.12);
      color: #a78bfa;

      i {
        background: linear-gradient(135deg, #c4b5fd, #93c5fd);
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
        background-clip: text;
      }
    }

    .nav-label {
      line-height: 1;
      letter-spacing: 0.01em;
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
    }
  `]
})
export class AppComponent implements OnInit {
  private themeService = inject(ThemeService);

  ngOnInit(): void {
    // Theme service initializes itself in constructor
  }
}
