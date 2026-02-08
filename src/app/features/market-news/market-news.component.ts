import { Component, OnInit, OnDestroy, inject, signal, computed, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';

import { ButtonModule } from 'primeng/button';
import { ChipModule } from 'primeng/chip';
import { ProgressSpinnerModule } from 'primeng/progressspinner';
import { TooltipModule } from 'primeng/tooltip';
import { BadgeModule } from 'primeng/badge';
import { ToggleButtonModule } from 'primeng/togglebutton';

import { MarketService } from '../../core/services';
import { Market } from '../../core/models';

interface NewsItem {
  title: string;
  link: string;
  pubDate: string;
  description: string;
  source: string;
  type: string;
  timeAgo: string;
  symbol: string;
  stockName?: string;
}

interface NewsCategory {
  id: string;
  label: string;
  icon: string;
  color: string;
  bgColor: string;
  count: number;
}

@Component({
  selector: 'app-market-news',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ButtonModule,
    ChipModule,
    ProgressSpinnerModule,
    TooltipModule,
    BadgeModule,
    ToggleButtonModule
  ],
  template: `
    <div class="market-news-container">
      <!-- Header Section -->
      <div class="news-page-header">
        <div class="header-left">
          <h1>
            <i class="pi pi-bolt"></i>
            Market News
          </h1>
          <span class="subtitle">Real-time news from $100B+ market cap stocks</span>
        </div>
        <div class="header-right">
          <div class="last-updated" *ngIf="lastUpdated()">
            <i class="pi pi-clock"></i>
            Updated {{ getTimeAgo(lastUpdated()!) }}
          </div>
          <button 
            pButton 
            type="button" 
            icon="pi pi-refresh" 
            class="p-button-rounded p-button-text refresh-btn"
            [class.spinning]="loading()"
            (click)="refreshNews()"
            pTooltip="Refresh News"
            tooltipPosition="bottom">
          </button>
        </div>
      </div>

      <!-- Category Filter Tabs -->
      <div class="category-filters">
        <div class="filter-tabs">
          @for (category of categories(); track category.id) {
            <button 
              class="category-tab"
              [class.active]="selectedCategories().includes(category.id)"
              [style.--tab-color]="category.color"
              [style.--tab-bg]="category.bgColor"
              (click)="toggleCategory(category.id)">
              <span class="tab-icon">
                <i [class]="category.icon"></i>
              </span>
              <span class="tab-label">{{ category.label }}</span>
              <span class="tab-count" *ngIf="category.count > 0">{{ category.count }}</span>
              <span class="tab-check" *ngIf="selectedCategories().includes(category.id)">
                <i class="pi pi-check"></i>
              </span>
            </button>
          }
        </div>
        <div class="filter-actions">
          <button 
            pButton 
            type="button" 
            label="Select All" 
            class="p-button-text p-button-sm"
            (click)="selectAllCategories()"
            *ngIf="selectedCategories().length < categories().length">
          </button>
          <button 
            pButton 
            type="button" 
            label="Clear All" 
            class="p-button-text p-button-sm"
            (click)="clearAllCategories()"
            *ngIf="selectedCategories().length > 0">
          </button>
        </div>
      </div>

      <!-- Stats Bar -->
      <div class="stats-bar">
        <div class="stat-item">
          <span class="stat-value">{{ filteredNews().length }}</span>
          <span class="stat-label">Articles</span>
        </div>
        <div class="stat-item">
          <span class="stat-value">{{ uniqueStocks() }}</span>
          <span class="stat-label">Stocks</span>
        </div>
        <div class="stat-item">
          <span class="stat-value">{{ uniqueSources() }}</span>
          <span class="stat-label">Sources</span>
        </div>
      </div>

      <!-- Loading State -->
      @if (loading()) {
        <div class="loading-container">
          <p-progressSpinner strokeWidth="3" [style]="{ width: '50px', height: '50px' }"></p-progressSpinner>
          <span>Fetching latest market news...</span>
          <span class="loading-sub">Scanning {{ stocksToFetch().length }} large-cap stocks</span>
        </div>
      }

      <!-- Empty State -->
      @if (!loading() && filteredNews().length === 0) {
        <div class="empty-container">
          <i class="pi pi-inbox"></i>
          <span>No news matches your filters</span>
          <button pButton type="button" label="Show All News" (click)="selectAllCategories()"></button>
        </div>
      }

      <!-- News Grid -->
      @if (!loading() && filteredNews().length > 0) {
        <div class="news-grid">
          @for (item of filteredNews(); track item.link) {
            <a [href]="item.link" target="_blank" rel="noopener noreferrer" class="news-card" [class]="'card-' + item.type">
              <div class="card-header">
                <div class="card-badges">
                  <span class="type-badge" [class]="'badge-' + item.type">
                    {{ getTypeBadgeLabel(item.type) }}
                  </span>
                  <span class="stock-badge" (click)="goToStock(item.symbol, $event)">
                    {{ item.symbol }}
                  </span>
                </div>
                <span class="card-time">{{ item.timeAgo }}</span>
              </div>
              <h3 class="card-title">{{ item.title }}</h3>
              <div class="card-footer">
                <span class="card-source">
                  <i class="pi pi-globe"></i>
                  {{ item.source }}
                </span>
              </div>
              <div class="card-accent"></div>
            </a>
          }
        </div>
      }
    </div>
  `,
  styles: [`
    .market-news-container {
      width: 100%;
      min-height: calc(100vh - 70px);
      padding: 1.5rem 2.5rem;
      background: var(--surface-ground);
    }

    /* Header */
    .news-page-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 1.5rem;
    }

    .header-left h1 {
      margin: 0;
      font-size: 1.75rem;
      font-weight: 700;
      display: flex;
      align-items: center;
      gap: 0.75rem;
      color: var(--text-color);
    }

    .header-left h1 i {
      color: var(--primary-color);
    }

    .subtitle {
      display: block;
      margin-top: 0.35rem;
      font-size: 0.9rem;
      color: var(--text-color-secondary);
    }

    .header-right {
      display: flex;
      align-items: center;
      gap: 1rem;
    }

    .last-updated {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      font-size: 0.8rem;
      color: var(--text-color-secondary);
    }

    .refresh-btn {
      transition: transform 0.3s ease;
    }

    .refresh-btn.spinning {
      animation: spin 1s linear infinite;
    }

    @keyframes spin {
      from { transform: rotate(0deg); }
      to { transform: rotate(360deg); }
    }

    /* Category Filters */
    .category-filters {
      background: var(--surface-card);
      border-radius: 16px;
      padding: 1.25rem;
      margin-bottom: 1.25rem;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
    }

    .filter-tabs {
      display: flex;
      gap: 0.75rem;
      flex-wrap: wrap;
      margin-bottom: 1rem;
    }

    .category-tab {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.6rem 1rem;
      background: var(--surface-ground);
      border: 2px solid var(--surface-border);
      border-radius: 12px;
      cursor: pointer;
      transition: all 0.25s ease;
      position: relative;
      overflow: hidden;
    }

    .category-tab:hover {
      border-color: var(--tab-color, var(--primary-color));
      transform: translateY(-2px);
    }

    .category-tab.active {
      background: var(--tab-bg, rgba(59, 130, 246, 0.1));
      border-color: var(--tab-color, var(--primary-color));
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
    }

    .tab-icon {
      width: 28px;
      height: 28px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: var(--tab-bg, rgba(59, 130, 246, 0.15));
      border-radius: 8px;
      color: var(--tab-color, var(--primary-color));
      font-size: 0.85rem;
    }

    .category-tab.active .tab-icon {
      background: var(--tab-color, var(--primary-color));
      color: white;
    }

    .tab-label {
      font-size: 0.85rem;
      font-weight: 600;
      color: var(--text-color);
    }

    .tab-count {
      background: var(--surface-border);
      padding: 0.15rem 0.5rem;
      border-radius: 10px;
      font-size: 0.7rem;
      font-weight: 600;
      color: var(--text-color-secondary);
    }

    .category-tab.active .tab-count {
      background: var(--tab-color, var(--primary-color));
      color: white;
    }

    .tab-check {
      position: absolute;
      top: -2px;
      right: -2px;
      width: 18px;
      height: 18px;
      background: var(--tab-color, var(--primary-color));
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      color: white;
      font-size: 0.6rem;
    }

    .filter-actions {
      display: flex;
      gap: 0.5rem;
      justify-content: flex-end;
    }

    /* Stats Bar */
    .stats-bar {
      display: flex;
      gap: 2rem;
      margin-bottom: 1.5rem;
      padding: 0 0.5rem;
    }

    .stat-item {
      display: flex;
      align-items: baseline;
      gap: 0.5rem;
    }

    .stat-value {
      font-size: 1.5rem;
      font-weight: 700;
      color: var(--primary-color);
    }

    .stat-label {
      font-size: 0.85rem;
      color: var(--text-color-secondary);
    }

    /* Loading & Empty States */
    .loading-container, .empty-container {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 1rem;
      padding: 4rem;
      color: var(--text-color-secondary);
    }

    .loading-sub {
      font-size: 0.85rem;
      opacity: 0.7;
    }

    .empty-container i {
      font-size: 3rem;
      opacity: 0.3;
    }

    /* News Grid */
    .news-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
      gap: 1.25rem;
    }

    .news-card {
      display: flex;
      flex-direction: column;
      background: var(--surface-card);
      border-radius: 12px;
      padding: 1.25rem;
      text-decoration: none;
      color: inherit;
      transition: all 0.25s ease;
      position: relative;
      overflow: hidden;
      border: 1px solid var(--surface-border);
    }

    .news-card:hover {
      transform: translateY(-4px);
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
      border-color: transparent;
    }

    .card-accent {
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      height: 3px;
      background: var(--surface-border);
      transition: background 0.25s ease;
    }

    .news-card.card-market .card-accent { background: #ec4899; }
    .news-card.card-price_target .card-accent { background: #3b82f6; }
    .news-card.card-upgrade_downgrade .card-accent { background: #22c55e; }
    .news-card.card-insider .card-accent { background: #a855f7; }
    .news-card.card-earnings .card-accent { background: #f97316; }
    .news-card.card-dividend .card-accent { background: #14b8a6; }
    .news-card.card-general .card-accent { background: #6b7280; }

    .news-card:hover .card-accent {
      height: 4px;
    }

    .card-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 0.75rem;
      gap: 0.5rem;
    }

    .card-badges {
      display: flex;
      gap: 0.5rem;
      flex-wrap: wrap;
    }

    .type-badge {
      font-size: 0.65rem;
      font-weight: 700;
      padding: 0.25rem 0.6rem;
      border-radius: 6px;
      text-transform: uppercase;
      letter-spacing: 0.03em;
    }

    .badge-market { background: rgba(236, 72, 153, 0.15); color: #ec4899; }
    .badge-price_target { background: rgba(59, 130, 246, 0.15); color: #3b82f6; }
    .badge-upgrade_downgrade { background: rgba(34, 197, 94, 0.15); color: #22c55e; }
    .badge-insider { background: rgba(168, 85, 247, 0.15); color: #a855f7; }
    .badge-earnings { background: rgba(249, 115, 22, 0.15); color: #f97316; }
    .badge-dividend { background: rgba(20, 184, 166, 0.15); color: #14b8a6; }
    .badge-general { background: rgba(107, 114, 128, 0.15); color: #6b7280; }

    .stock-badge {
      font-size: 0.7rem;
      font-weight: 700;
      padding: 0.25rem 0.6rem;
      border-radius: 6px;
      background: var(--surface-ground);
      color: var(--primary-color);
      cursor: pointer;
      transition: all 0.2s ease;
    }

    .stock-badge:hover {
      background: var(--primary-color);
      color: white;
    }

    .card-time {
      font-size: 0.7rem;
      color: var(--text-color-secondary);
      white-space: nowrap;
    }

    .card-title {
      margin: 0 0 auto 0;
      font-size: 0.95rem;
      font-weight: 600;
      line-height: 1.4;
      color: var(--text-color);
      display: -webkit-box;
      -webkit-line-clamp: 3;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }

    .card-footer {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-top: 1rem;
      padding-top: 0.75rem;
      border-top: 1px solid var(--surface-border);
    }

    .card-source {
      display: flex;
      align-items: center;
      gap: 0.4rem;
      font-size: 0.75rem;
      color: var(--text-color-secondary);
    }

    .card-source i {
      font-size: 0.7rem;
    }

    /* Responsive */
    @media (max-width: 1024px) {
      .market-news-container {
        padding: 1rem 1.5rem;
      }
      
      .news-grid {
        grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
      }
    }

    @media (max-width: 768px) {
      .market-news-container {
        padding: 1rem;
      }

      .news-page-header {
        flex-direction: column;
        gap: 1rem;
      }

      .filter-tabs {
        justify-content: center;
      }

      .category-tab {
        padding: 0.5rem 0.75rem;
      }

      .tab-label {
        font-size: 0.75rem;
      }

      .stats-bar {
        justify-content: center;
      }

      .news-grid {
        grid-template-columns: 1fr;
      }
    }
  `]
})
export class MarketNewsComponent implements OnInit, OnDestroy {
  private http = inject(HttpClient);
  private router = inject(Router);
  private marketService = inject(MarketService);
  private previousMarket: Market | null = null;

  // Large-cap stocks to fetch news from (display only, actual list is on server)
  stocksToFetch = computed(() => {
    const market = this.marketService.currentMarket();
    return market === 'IN' 
      ? ['RELIANCE', 'TCS', 'HDFCBANK', 'INFY', 'ICICIBANK', 'HINDUNILVR', 'SBIN', 'BHARTIARTL', 'ITC', 'KOTAKBANK', 'LT', 'AXISBANK', 'BAJFINANCE', 'ASIANPAINT', 'MARUTI']
      : ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'NVDA', 'META', 'TSLA', 'BRK-B', 'UNH', 'JNJ', 'V', 'XOM', 'JPM', 'WMT', 'MA'];
  });

  constructor() {
    // React to market changes
    effect(() => {
      const market = this.marketService.currentMarket();
      if (this.previousMarket !== null && this.previousMarket !== market) {
        this.loadNews();
      }
      this.previousMarket = market;
    });
  }

  // State
  allNews = signal<NewsItem[]>([]);
  loading = signal(false);
  lastUpdated = signal<Date | null>(null);

  // Category definitions with colors
  categories = signal<NewsCategory[]>([
    { id: 'market', label: 'Market', icon: 'pi pi-chart-bar', color: '#ec4899', bgColor: 'rgba(236, 72, 153, 0.12)', count: 0 },
    { id: 'price_target', label: 'Price Target', icon: 'pi pi-chart-line', color: '#3b82f6', bgColor: 'rgba(59, 130, 246, 0.12)', count: 0 },
    { id: 'upgrade_downgrade', label: 'Rating', icon: 'pi pi-star', color: '#22c55e', bgColor: 'rgba(34, 197, 94, 0.12)', count: 0 },
    { id: 'earnings', label: 'Earnings', icon: 'pi pi-dollar', color: '#f97316', bgColor: 'rgba(249, 115, 22, 0.12)', count: 0 },
    { id: 'insider', label: 'Insider', icon: 'pi pi-user', color: '#a855f7', bgColor: 'rgba(168, 85, 247, 0.12)', count: 0 },
    { id: 'dividend', label: 'Dividend', icon: 'pi pi-percentage', color: '#14b8a6', bgColor: 'rgba(20, 184, 166, 0.12)', count: 0 },
    { id: 'general', label: 'Company News', icon: 'pi pi-building', color: '#6b7280', bgColor: 'rgba(107, 114, 128, 0.12)', count: 0 }
  ]);

  // Selected categories (only Market by default)
  selectedCategories = signal<string[]>(['market']);

  // Filtered news based on selected categories
  filteredNews = computed(() => {
    const news = this.allNews();
    const selected = this.selectedCategories();
    
    if (selected.length === 0) return [];
    
    return news.filter(item => selected.includes(item.type));
  });

  // Stats
  uniqueStocks = computed(() => {
    const stocks = new Set(this.filteredNews().map(n => n.symbol));
    return stocks.size;
  });

  uniqueSources = computed(() => {
    const sources = new Set(this.filteredNews().map(n => n.source));
    return sources.size;
  });

  private refreshInterval: ReturnType<typeof setInterval> | null = null;

  ngOnInit(): void {
    this.loadNews();
    
    // Auto-refresh every 5 minutes
    this.refreshInterval = setInterval(() => {
      this.loadNews();
    }, 5 * 60 * 1000);
  }

  ngOnDestroy(): void {
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
    }
  }

  async loadNews(): Promise<void> {
    this.loading.set(true);
    
    try {
      const market = this.marketService.currentMarket();
      const result = await this.http.get<{ news: NewsItem[], categories: Record<string, number> }>(
        `/api/market/news?market=${market}`
      ).toPromise();
      
      if (result?.news) {
        this.allNews.set(result.news);
        this.lastUpdated.set(new Date());
        
        // Compute category counts from actual news items (not API totals, which may differ due to deduplication/limits)
        const countsByCategory: Record<string, number> = {};
        for (const item of result.news) {
          countsByCategory[item.type] = (countsByCategory[item.type] || 0) + 1;
        }
        const updatedCategories = this.categories().map(cat => ({
          ...cat,
          count: countsByCategory[cat.id] || 0
        }));
        this.categories.set(updatedCategories);
      }
    } catch (err) {
      console.error('Failed to fetch market news:', err);
    } finally {
      this.loading.set(false);
    }
  }

  refreshNews(): void {
    if (!this.loading()) {
      this.loadNews();
    }
  }

  toggleCategory(categoryId: string): void {
    const current = this.selectedCategories();
    if (current.includes(categoryId)) {
      this.selectedCategories.set(current.filter(c => c !== categoryId));
    } else {
      this.selectedCategories.set([...current, categoryId]);
    }
  }

  selectAllCategories(): void {
    this.selectedCategories.set(this.categories().map(c => c.id));
  }

  clearAllCategories(): void {
    this.selectedCategories.set([]);
  }

  goToStock(symbol: string, event: Event): void {
    event.preventDefault();
    event.stopPropagation();
    this.router.navigate(['/stock', symbol]);
  }

  getTypeBadgeLabel(type: string): string {
    const labels: Record<string, string> = {
      market: 'Market',
      price_target: 'Price Target',
      upgrade_downgrade: 'Rating',
      insider: 'Insider',
      earnings: 'Earnings',
      dividend: 'Dividend',
      general: 'Company'
    };
    return labels[type] || 'Company';
  }

  getTimeAgo(date: Date): string {
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    
    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    
    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays}d ago`;
  }
}
