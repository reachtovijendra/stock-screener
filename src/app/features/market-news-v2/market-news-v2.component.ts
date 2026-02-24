import { Component, OnInit, OnDestroy, inject, signal, computed, effect, ViewEncapsulation } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';

import { ButtonModule } from 'primeng/button';
import { ProgressSpinnerModule } from 'primeng/progressspinner';
import { TooltipModule } from 'primeng/tooltip';

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
  count: number;
}

@Component({
  selector: 'app-market-news-v2',
  standalone: true,
  encapsulation: ViewEncapsulation.None,
  imports: [
    CommonModule,
    FormsModule,
    ButtonModule,
    ProgressSpinnerModule,
    TooltipModule
  ],
  template: `
    <div class="theme-editorial news-editorial">
      <!-- Newspaper Masthead -->
      <header class="masthead">
        <div class="masthead-top">
          <div class="edition-info">
            <span class="edition-label">FINANCIAL EDITION</span>
            <span class="edition-date">{{ currentDate }}</span>
          </div>
          <div class="masthead-center">
            <h1 class="newspaper-title">THE MARKET CHRONICLE</h1>
            <div class="masthead-tagline">"All the News That Moves Markets"</div>
          </div>
          <div class="edition-meta">
            <span class="volume">VOL. CXXIV</span>
            <span class="price">{{ marketService.currentMarket() === 'US' ? '$2.50' : '₹50' }}</span>
          </div>
        </div>
        <div class="masthead-rule"></div>
        <div class="masthead-stats">
          <div class="stat-block">
            <span class="stat-number">{{ filteredNews().length }}</span>
            <span class="stat-text">Articles</span>
          </div>
          <div class="stat-divider">|</div>
          <div class="stat-block">
            <span class="stat-number">{{ uniqueStocks() }}</span>
            <span class="stat-text">Companies</span>
          </div>
          <div class="stat-divider">|</div>
          <div class="stat-block">
            <span class="stat-number">{{ uniqueSources() }}</span>
            <span class="stat-text">Sources</span>
          </div>
          <div class="stat-divider">|</div>
          <div class="refresh-block">
            <button class="refresh-link" [class.spinning]="loading()" (click)="refreshNews()">
              ↻ Refresh
            </button>
          </div>
        </div>
      </header>

      <!-- Section Navigation -->
      <nav class="section-nav" style="background: #1a1a1a !important;">
        <div class="nav-inner">
          @for (category of categories(); track category.id) {
            <button 
              class="section-link"
              [class.active]="selectedCategories().includes(category.id)"
              [style.color]="selectedCategories().includes(category.id) ? '#d4af37' : '#e8e4dc'"
              (click)="toggleCategory(category.id)">
              {{ category.label }}
              @if (category.count > 0) {
                <sup class="section-count" style="color: #d4af37;">{{ category.count }}</sup>
              }
            </button>
          }
          <div class="nav-actions" style="border-left: 1px solid rgba(255, 255, 255, 0.2);">
            @if (selectedCategories().length < categories().length) {
              <button class="nav-action" style="color: #e8e4dc; border-color: rgba(255, 255, 255, 0.3);" (click)="selectAllCategories()">All</button>
            }
            @if (selectedCategories().length > 0 && selectedCategories().length < categories().length) {
              <button class="nav-action" style="color: #e8e4dc; border-color: rgba(255, 255, 255, 0.3);" (click)="clearAllCategories()">Clear</button>
            }
          </div>
        </div>
      </nav>

      <!-- Main Content -->
      <main class="newspaper-content">
        <!-- Loading State -->
        @if (loading()) {
          <div class="loading-state">
            <div class="loading-spinner"></div>
            <p class="loading-text">Gathering the latest dispatches from {{ stocksToFetch().length }} major corporations...</p>
          </div>
        }

        <!-- Empty State -->
        @if (!loading() && filteredNews().length === 0) {
          <div class="empty-state">
            <div class="empty-ornament">❧</div>
            <h2 class="empty-title">No Articles Found</h2>
            <p class="empty-text">Select different sections above to view more stories</p>
            <button class="empty-btn" (click)="selectAllCategories()">View All Sections</button>
          </div>
        }

        <!-- News Layout -->
        @if (!loading() && filteredNews().length > 0) {
          <div class="news-layout">
            <!-- Lead Story (First Article) -->
            @if (filteredNews()[0]; as lead) {
              <article class="lead-story" (click)="openArticle(lead.link)">
                <div class="lead-category">{{ getTypeBadgeLabel(lead.type) }}</div>
                <h2 class="lead-headline">{{ decodeHtml(lead.title) }}</h2>
                <div class="lead-meta">
                  <span class="lead-source">{{ lead.source }}</span>
                  <span class="lead-sep">•</span>
                  <span class="lead-time">{{ lead.timeAgo }}</span>
                  <span class="lead-sep">•</span>
                  <button class="lead-stock" (click)="goToStock(lead.symbol, $event)">{{ lead.symbol }}</button>
                </div>
                @if (getCleanDescription(lead.description)) {
                  <p class="lead-excerpt">{{ getCleanDescription(lead.description) | slice:0:200 }}{{ getCleanDescription(lead.description).length > 200 ? '...' : '' }}</p>
                }
                <div class="lead-continue">Continue Reading →</div>
              </article>
            }

            <!-- Secondary Stories (2-4) -->
            <div class="secondary-stories">
              @for (item of filteredNews().slice(1, 4); track item.link) {
                <article class="secondary-story" (click)="openArticle(item.link)">
                  <span class="story-category">{{ getTypeBadgeLabel(item.type) }}</span>
                  <h3 class="story-headline">{{ decodeHtml(item.title) }}</h3>
                  <div class="story-meta">
                    <span class="story-source">{{ item.source }}</span>
                    <span class="story-time">{{ item.timeAgo }}</span>
                  </div>
                  <button class="story-stock" (click)="goToStock(item.symbol, $event)">{{ item.symbol }}</button>
                </article>
              }
            </div>

            <!-- Column Layout for remaining stories -->
            @if (filteredNews().length > 4) {
              <div class="column-layout">
                <!-- Left Column -->
                <div class="news-column">
                  <div class="column-header">
                    <span class="column-title">Latest Dispatches</span>
                    <div class="column-rule"></div>
                  </div>
                  @for (item of filteredNews().slice(4, 12); track item.link; let i = $index) {
                    <article class="column-story" (click)="openArticle(item.link)">
                      @if (i === 0) {
                        <span class="drop-cap">{{ decodeHtml(item.title).charAt(0) }}</span>
                      }
                      <div class="column-story-content">
                        <h4 class="column-headline">{{ i === 0 ? decodeHtml(item.title).slice(1) : decodeHtml(item.title) }}</h4>
                        <div class="column-meta">
                          <span class="column-source">{{ item.source }}</span>
                          <button class="column-stock" (click)="goToStock(item.symbol, $event)">{{ item.symbol }}</button>
                        </div>
                      </div>
                    </article>
                  }
                </div>

                <!-- Right Column -->
                <div class="news-column">
                  <div class="column-header">
                    <span class="column-title">Market Briefs</span>
                    <div class="column-rule"></div>
                  </div>
                  @for (item of filteredNews().slice(12, 20); track item.link) {
                    <article class="brief-story" (click)="openArticle(item.link)">
                      <div class="brief-category" [class]="'brief-' + item.type">{{ getTypeBadgeLabel(item.type) }}</div>
                      <h5 class="brief-headline">{{ decodeHtml(item.title) }}</h5>
                      <div class="brief-meta">
                        <span>{{ item.source }}</span>
                        <button class="brief-stock" (click)="goToStock(item.symbol, $event)">{{ item.symbol }}</button>
                      </div>
                    </article>
                  }
                </div>
              </div>
            }

            <!-- More Stories Grid -->
            @if (filteredNews().length > 20) {
              <div class="more-stories">
                <div class="more-header">
                  <span class="more-title">More Stories</span>
                  <div class="more-rule"></div>
                </div>
                <div class="more-grid">
                  @for (item of filteredNews().slice(20); track item.link) {
                    <article class="more-story" (click)="openArticle(item.link)">
                      <span class="more-category">{{ getTypeBadgeLabel(item.type) }}</span>
                      <h6 class="more-headline">{{ decodeHtml(item.title) }}</h6>
                      <div class="more-meta">
                        <span>{{ item.source }}</span>
                        <span>{{ item.timeAgo }}</span>
                        <button class="more-stock" (click)="goToStock(item.symbol, $event)">{{ item.symbol }}</button>
                      </div>
                    </article>
                  }
                </div>
              </div>
            }
          </div>
        }
      </main>

      <!-- Footer -->
      <footer class="newspaper-footer">
        <div class="footer-rule"></div>
        <div class="footer-content">
          <span class="footer-text">Data sourced from major financial news outlets</span>
          <span class="footer-ornament">❧</span>
          <span class="footer-text">{{ marketService.currentMarket() === 'US' ? 'NYSE • NASDAQ' : 'NSE • BSE' }}</span>
        </div>
      </footer>
    </div>
  `,
  styles: [`
    .news-editorial {
      min-height: 100vh;
      background: var(--ed-bg);
      font-family: var(--ed-font-body);
      color: var(--ed-ink);
    }

    /* Masthead */
    .masthead {
      padding: 1.5rem 2rem 1rem;
      background: var(--ed-bg-card);
      border-bottom: 3px double var(--ed-border-dark);
    }

    .masthead-top {
      display: flex;
      justify-content: space-between;
      align-items: center;
      max-width: 1400px;
      margin: 0 auto;
    }

    .edition-info, .edition-meta {
      width: 200px;
      font-size: 0.7rem;
      text-transform: uppercase;
      letter-spacing: 0.1em;
      color: var(--ed-ink-muted);
    }

    .edition-info {
      display: flex;
      flex-direction: column;
      gap: 0.25rem;
    }

    .edition-meta {
      text-align: right;
      display: flex;
      flex-direction: column;
      gap: 0.25rem;
    }

    .masthead-center {
      text-align: center;
    }

    .newspaper-title {
      font-family: var(--ed-font-display);
      font-size: clamp(2rem, 5vw, 3.5rem);
      font-weight: 700;
      letter-spacing: 0.02em;
      color: var(--ed-ink);
      margin: 0;
      line-height: 1;
    }

    .masthead-tagline {
      font-family: var(--ed-font-body);
      font-style: italic;
      font-size: 0.85rem;
      color: var(--ed-ink-muted);
      margin-top: 0.5rem;
    }

    .masthead-rule {
      height: 2px;
      background: linear-gradient(90deg, transparent, var(--ed-ink), transparent);
      margin: 1rem 0;
      max-width: 1400px;
      margin-left: auto;
      margin-right: auto;
    }

    .masthead-stats {
      display: flex;
      justify-content: center;
      align-items: center;
      gap: 1.5rem;
      font-size: 0.8rem;
    }

    .stat-block {
      display: flex;
      align-items: baseline;
      gap: 0.35rem;
    }

    .stat-number {
      font-family: var(--ed-font-display);
      font-size: 1.1rem;
      font-weight: 600;
      color: var(--ed-ink);
    }

    .stat-text {
      color: var(--ed-ink-muted);
      text-transform: uppercase;
      font-size: 0.65rem;
      letter-spacing: 0.05em;
    }

    .stat-divider {
      color: var(--ed-border-dark);
    }

    .refresh-link {
      background: none;
      border: none;
      color: var(--ed-red);
      font-family: var(--ed-font-body);
      font-size: 0.8rem;
      cursor: pointer;
      text-decoration: underline;
      text-underline-offset: 2px;

      &:hover {
        color: var(--ed-ink);
      }

      &.spinning {
        animation: spin 1s linear infinite;
      }
    }

    @keyframes spin {
      to { transform: rotate(360deg); }
    }

    /* Section Navigation - Fixed dark bar for newspaper aesthetic */
    .section-nav {
      background: #1a1a1a !important;
      padding: 0.75rem 2rem;
      position: sticky;
      top: 0;
      z-index: 100;
    }

    .nav-inner {
      display: flex;
      justify-content: center;
      align-items: center;
      gap: 0.25rem;
      max-width: 1400px;
      margin: 0 auto;
      flex-wrap: wrap;
    }

    .section-link {
      padding: 0.5rem 1rem;
      background: transparent !important;
      border: none;
      color: #e8e4dc !important;
      font-family: var(--ed-font-body);
      font-size: 0.75rem;
      font-weight: 500;
      text-transform: uppercase;
      letter-spacing: 0.1em;
      cursor: pointer;
      transition: all 0.2s ease;
      position: relative;

      &:hover {
        color: #d4af37 !important;
      }

      &.active {
        color: #d4af37 !important;
        
        &::after {
          content: '';
          position: absolute;
          bottom: 0;
          left: 50%;
          transform: translateX(-50%);
          width: 4px;
          height: 4px;
          background: #d4af37 !important;
          border-radius: 50%;
        }
      }
    }

    .section-count {
      font-size: 0.6rem;
      color: #d4af37 !important;
      margin-left: 0.15rem;
    }

    .nav-actions {
      display: flex;
      gap: 0.5rem;
      margin-left: 1rem;
      padding-left: 1rem;
      border-left: 1px solid rgba(255, 255, 255, 0.2);
    }

    .nav-action {
      padding: 0.35rem 0.75rem;
      background: transparent !important;
      border: 1px solid rgba(255, 255, 255, 0.3) !important;
      color: #e8e4dc !important;
      font-family: var(--ed-font-body);
      font-size: 0.65rem;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      cursor: pointer;
      transition: all 0.2s ease;

      &:hover {
        background: #e8e4dc !important;
        color: #1a1a1a !important;
      }
    }

    /* Main Content */
    .newspaper-content {
      max-width: 1400px;
      margin: 0 auto;
      padding: 2rem;
    }

    /* Loading State */
    .loading-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 4rem 2rem;
      text-align: center;
    }

    .loading-spinner {
      width: 40px;
      height: 40px;
      border: 3px solid var(--ed-border);
      border-top-color: var(--ed-ink);
      border-radius: 50%;
      animation: spin 1s linear infinite;
      margin-bottom: 1.5rem;
    }

    .loading-text {
      font-family: var(--ed-font-body);
      font-style: italic;
      font-size: 1rem;
      color: var(--ed-ink-muted);
    }

    /* Empty State */
    .empty-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 4rem 2rem;
      text-align: center;
    }

    .empty-ornament {
      font-size: 3rem;
      color: var(--ed-border-dark);
      margin-bottom: 1rem;
    }

    .empty-title {
      font-family: var(--ed-font-display);
      font-size: 1.5rem;
      font-weight: 500;
      color: var(--ed-ink);
      margin: 0 0 0.5rem 0;
    }

    .empty-text {
      font-style: italic;
      color: var(--ed-ink-muted);
      margin: 0 0 1.5rem 0;
    }

    .empty-btn {
      padding: 0.75rem 1.5rem;
      background: var(--ed-ink);
      border: none;
      color: var(--ed-bg);
      font-family: var(--ed-font-body);
      font-size: 0.85rem;
      text-transform: uppercase;
      letter-spacing: 0.1em;
      cursor: pointer;
      transition: all 0.2s ease;

      &:hover {
        background: var(--ed-red);
      }
    }

    /* News Layout */
    .news-layout {
      display: flex;
      flex-direction: column;
      gap: 2rem;
    }

    /* Lead Story */
    .lead-story {
      padding: 2rem;
      background: var(--ed-bg-card);
      border: 1px solid var(--ed-border);
      cursor: pointer;
      transition: all 0.2s ease;

      &:hover {
        box-shadow: 0 4px 20px rgba(0, 0, 0, 0.1);
      }
    }

    .lead-category {
      display: inline-block;
      padding: 0.25rem 0.75rem;
      background: var(--ed-red);
      color: white;
      font-size: 0.65rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.1em;
      margin-bottom: 1rem;
    }

    .lead-headline {
      font-family: var(--ed-font-display);
      font-size: clamp(1.5rem, 3vw, 2.5rem);
      font-weight: 700;
      line-height: 1.2;
      color: var(--ed-ink);
      margin: 0 0 1rem 0;
    }

    .lead-meta {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      font-size: 0.8rem;
      color: var(--ed-ink-muted);
      margin-bottom: 1rem;
    }

    .lead-source {
      font-weight: 500;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }

    .lead-stock {
      background: var(--ed-ink);
      border: none;
      color: var(--ed-bg);
      padding: 0.2rem 0.5rem;
      font-family: var(--ed-font-body);
      font-size: 0.7rem;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s ease;

      &:hover {
        background: var(--ed-red);
      }
    }

    .lead-excerpt {
      font-family: var(--ed-font-body);
      font-size: 1.1rem;
      line-height: 1.7;
      color: var(--ed-ink-light);
      margin: 0 0 1rem 0;
    }

    .lead-continue {
      font-style: italic;
      color: var(--ed-red);
      font-size: 0.9rem;
    }

    /* Secondary Stories */
    .secondary-stories {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 1.5rem;
      padding-bottom: 2rem;
      border-bottom: 1px solid var(--ed-border);
    }

    .secondary-story {
      padding: 1.25rem;
      background: var(--ed-bg-card);
      border: 1px solid var(--ed-border);
      cursor: pointer;
      transition: all 0.2s ease;

      &:hover {
        border-color: var(--ed-ink);
      }
    }

    .story-category {
      display: inline-block;
      font-size: 0.6rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.1em;
      color: var(--ed-red);
      margin-bottom: 0.5rem;
    }

    .story-headline {
      font-family: var(--ed-font-display);
      font-size: 1.1rem;
      font-weight: 600;
      line-height: 1.3;
      color: var(--ed-ink);
      margin: 0 0 0.75rem 0;
    }

    .story-meta {
      display: flex;
      justify-content: space-between;
      font-size: 0.7rem;
      color: var(--ed-ink-muted);
      margin-bottom: 0.5rem;
    }

    .story-stock {
      background: var(--ed-bg-accent);
      border: 1px solid var(--ed-border);
      color: var(--ed-ink);
      padding: 0.15rem 0.4rem;
      font-family: var(--ed-font-body);
      font-size: 0.65rem;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s ease;

      &:hover {
        background: var(--ed-ink);
        color: var(--ed-bg);
      }
    }

    /* Column Layout */
    .column-layout {
      display: grid;
      grid-template-columns: 1.5fr 1fr;
      gap: 2rem;
      padding-bottom: 2rem;
      border-bottom: 1px solid var(--ed-border);
    }

    .news-column {
      display: flex;
      flex-direction: column;
    }

    .column-header {
      display: flex;
      align-items: center;
      gap: 1rem;
      margin-bottom: 1.5rem;
    }

    .column-title {
      font-family: var(--ed-font-display);
      font-size: 1rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.1em;
      white-space: nowrap;
    }

    .column-rule {
      flex: 1;
      height: 2px;
      background: var(--ed-ink);
    }

    .column-story {
      display: flex;
      gap: 0.75rem;
      padding: 1rem 0;
      border-bottom: 1px solid var(--ed-border);
      cursor: pointer;
      transition: all 0.2s ease;

      &:hover {
        background: var(--ed-bg-accent);
        margin: 0 -0.5rem;
        padding-left: 0.5rem;
        padding-right: 0.5rem;
      }

      &:last-child {
        border-bottom: none;
      }
    }

    .drop-cap {
      font-family: var(--ed-font-display);
      font-size: 3.5rem;
      font-weight: 700;
      line-height: 0.8;
      color: var(--ed-red);
      float: left;
      margin-right: 0.25rem;
    }

    .column-story-content {
      flex: 1;
    }

    .column-headline {
      font-family: var(--ed-font-display);
      font-size: 1rem;
      font-weight: 500;
      line-height: 1.4;
      color: var(--ed-ink);
      margin: 0 0 0.5rem 0;
    }

    .column-meta {
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 0.7rem;
      color: var(--ed-ink-muted);
    }

    .column-stock {
      background: none;
      border: none;
      color: var(--ed-red);
      font-family: var(--ed-font-body);
      font-size: 0.7rem;
      font-weight: 600;
      cursor: pointer;
      text-decoration: underline;
      text-underline-offset: 2px;

      &:hover {
        color: var(--ed-ink);
      }
    }

    /* Brief Stories */
    .brief-story {
      padding: 0.75rem 0;
      border-bottom: 1px solid var(--ed-border);
      cursor: pointer;
      transition: all 0.2s ease;

      &:hover {
        background: var(--ed-bg-accent);
        margin: 0 -0.5rem;
        padding-left: 0.5rem;
        padding-right: 0.5rem;
      }

      &:last-child {
        border-bottom: none;
      }
    }

    .brief-category {
      display: inline-block;
      font-size: 0.55rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.1em;
      color: var(--ed-ink-muted);
      margin-bottom: 0.35rem;

      &.brief-breaking_news { color: var(--ed-red); }
      &.brief-earnings { color: var(--ed-gold); }
    }

    .brief-headline {
      font-family: var(--ed-font-body);
      font-size: 0.9rem;
      font-weight: 500;
      line-height: 1.4;
      color: var(--ed-ink);
      margin: 0 0 0.35rem 0;
    }

    .brief-meta {
      display: flex;
      justify-content: space-between;
      font-size: 0.65rem;
      color: var(--ed-ink-muted);
    }

    .brief-stock {
      background: none;
      border: none;
      color: var(--ed-red);
      font-family: var(--ed-font-body);
      font-size: 0.65rem;
      font-weight: 600;
      cursor: pointer;

      &:hover {
        text-decoration: underline;
      }
    }

    /* More Stories */
    .more-stories {
      padding-top: 1rem;
    }

    .more-header {
      display: flex;
      align-items: center;
      gap: 1rem;
      margin-bottom: 1.5rem;
    }

    .more-title {
      font-family: var(--ed-font-display);
      font-size: 1rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.1em;
      white-space: nowrap;
    }

    .more-rule {
      flex: 1;
      height: 2px;
      background: var(--ed-ink);
    }

    .more-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 1rem;
    }

    .more-story {
      padding: 1rem;
      background: var(--ed-bg-card);
      border: 1px solid var(--ed-border);
      cursor: pointer;
      transition: all 0.2s ease;

      &:hover {
        border-color: var(--ed-ink);
      }
    }

    .more-category {
      display: block;
      font-size: 0.55rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.1em;
      color: var(--ed-red);
      margin-bottom: 0.35rem;
    }

    .more-headline {
      font-family: var(--ed-font-body);
      font-size: 0.85rem;
      font-weight: 500;
      line-height: 1.4;
      color: var(--ed-ink);
      margin: 0 0 0.5rem 0;
    }

    .more-meta {
      display: flex;
      flex-wrap: wrap;
      gap: 0.5rem;
      font-size: 0.6rem;
      color: var(--ed-ink-muted);
    }

    .more-stock {
      background: none;
      border: none;
      color: var(--ed-red);
      font-family: var(--ed-font-body);
      font-size: 0.6rem;
      font-weight: 600;
      cursor: pointer;

      &:hover {
        text-decoration: underline;
      }
    }

    /* Footer */
    .newspaper-footer {
      padding: 2rem;
      background: var(--ed-bg-card);
      border-top: 3px double var(--ed-border-dark);
    }

    .footer-rule {
      height: 1px;
      background: var(--ed-border);
      margin-bottom: 1rem;
    }

    .footer-content {
      display: flex;
      justify-content: center;
      align-items: center;
      gap: 1.5rem;
      font-size: 0.75rem;
      color: var(--ed-ink-muted);
      text-transform: uppercase;
      letter-spacing: 0.1em;
    }

    .footer-ornament {
      font-size: 1rem;
      color: var(--ed-border-dark);
    }

    /* Responsive */
    @media (max-width: 1200px) {
      .secondary-stories {
        grid-template-columns: repeat(2, 1fr);
      }

      .column-layout {
        grid-template-columns: 1fr;
      }

      .more-grid {
        grid-template-columns: repeat(2, 1fr);
      }
    }

    @media (max-width: 768px) {
      .masthead-top {
        flex-direction: column;
        gap: 1rem;
      }

      .edition-info, .edition-meta {
        width: auto;
        text-align: center;
      }

      .section-nav {
        padding: 0.5rem 1rem;
      }

      .nav-inner {
        gap: 0;
      }

      .section-link {
        padding: 0.4rem 0.6rem;
        font-size: 0.65rem;
      }

      .newspaper-content {
        padding: 1rem;
      }

      .secondary-stories {
        grid-template-columns: 1fr;
      }

      .more-grid {
        grid-template-columns: 1fr;
      }

      .lead-headline {
        font-size: 1.5rem;
      }
    }
  `]
})
export class MarketNewsV2Component implements OnInit, OnDestroy {
  private http = inject(HttpClient);
  private router = inject(Router);
  marketService = inject(MarketService);
  private previousMarket: Market | null = null;

  loading = signal(false);
  news = signal<NewsItem[]>([]);
  lastUpdated = signal<Date | null>(null);
  
  // Large-cap stocks to fetch news from (display only, actual list is on server)
  stocksToFetch = computed(() => {
    const market = this.marketService.currentMarket();
    return market === 'IN' 
      ? ['RELIANCE', 'TCS', 'HDFCBANK', 'INFY', 'ICICIBANK', 'HINDUNILVR', 'SBIN', 'BHARTIARTL', 'ITC', 'KOTAKBANK', 'LT', 'AXISBANK', 'BAJFINANCE', 'ASIANPAINT', 'MARUTI']
      : ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'NVDA', 'META', 'TSLA', 'BRK-B', 'UNH', 'JNJ', 'V', 'XOM', 'JPM', 'WMT', 'MA'];
  });

  // Selected categories - match V1's default (only 'market' by default)
  selectedCategories = signal<string[]>(['market']);

  // Category counts from API
  categoryCounts = signal<Record<string, number>>({});

  private refreshInterval: any;

  currentDate = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  }).toUpperCase();

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

  // Categories matching V1's API response types
  categories = computed<NewsCategory[]>(() => {
    const counts = this.categoryCounts();
    
    return [
      { id: 'market', label: 'Market', icon: '§', count: counts['market'] || 0 },
      { id: 'price_target', label: 'Price Target', icon: '↗', count: counts['price_target'] || 0 },
      { id: 'upgrade_downgrade', label: 'Rating', icon: '★', count: counts['upgrade_downgrade'] || 0 },
      { id: 'earnings', label: 'Earnings', icon: '$', count: counts['earnings'] || 0 },
      { id: 'insider', label: 'Insider', icon: '◉', count: counts['insider'] || 0 },
      { id: 'dividend', label: 'Dividend', icon: '%', count: counts['dividend'] || 0 },
      { id: 'general', label: 'Company', icon: '▣', count: counts['general'] || 0 }
    ];
  });

  filteredNews = computed(() => {
    const allNews = this.news();
    const selected = this.selectedCategories();
    
    if (selected.length === 0) return [];
    
    return allNews.filter(item => selected.includes(item.type));
  });

  uniqueStocks = computed(() => {
    const stocks = new Set(this.filteredNews().map(n => n.symbol));
    return stocks.size;
  });

  uniqueSources = computed(() => {
    const sources = new Set(this.filteredNews().map(n => n.source));
    return sources.size;
  });

  ngOnInit(): void {
    this.loadNews();
    this.refreshInterval = setInterval(() => this.loadNews(), 5 * 60 * 1000);
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
      const response = await this.http.get<{ news: NewsItem[], categories: Record<string, number> }>(
        `/api/market?action=news&market=${market}`
      ).toPromise();
      
      if (response?.news) {
        this.news.set(response.news);
        this.lastUpdated.set(new Date());
        
        // Use API's category counts
        if (response.categories) {
          this.categoryCounts.set(response.categories);
        } else {
          // Fallback: count from returned articles
          const counts: Record<string, number> = {};
          for (const item of response.news) {
            counts[item.type] = (counts[item.type] || 0) + 1;
          }
          this.categoryCounts.set(counts);
        }
      }
    } catch (error) {
      console.error('Failed to load news:', error);
    } finally {
      this.loading.set(false);
    }
  }

  refreshNews(): void {
    this.loadNews();
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

  getTypeBadgeLabel(type: string): string {
    const labels: Record<string, string> = {
      'market': 'Market',
      'price_target': 'Price Target',
      'upgrade_downgrade': 'Rating',
      'earnings': 'Earnings',
      'insider': 'Insider',
      'dividend': 'Dividend',
      'general': 'Company'
    };
    return labels[type] || 'News';
  }

  getCleanDescription(description: string | undefined): string {
    if (!description) return '';
    const stripped = description.replace(/<[^>]*>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/&quot;/g, '"').trim();
    if (stripped.startsWith('<a') || stripped.startsWith('http') || stripped.length < 20) {
      return '';
    }
    return stripped;
  }

  decodeHtml(text: string): string {
    if (!text) return '';
    return text
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&apos;/g, "'")
      .replace(/&nbsp;/g, ' ');
  }

  openArticle(url: string): void {
    window.open(url, '_blank', 'noopener,noreferrer');
  }

  goToStock(symbol: string, event: Event): void {
    event.stopPropagation();
    this.router.navigate(['/v2/stock', symbol]);
  }

  getTimeAgo(date: Date): string {
    const seconds = Math.floor((new Date().getTime() - date.getTime()) / 1000);
    
    if (seconds < 60) return 'Just now';
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    return `${Math.floor(seconds / 86400)}d ago`;
  }
}
