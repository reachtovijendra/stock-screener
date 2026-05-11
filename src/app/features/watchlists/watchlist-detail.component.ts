import { Component, inject, OnInit, OnDestroy, NgZone, signal, computed, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { TableModule } from 'primeng/table';
import { ButtonModule } from 'primeng/button';
import { TooltipModule } from 'primeng/tooltip';
import { AutoCompleteModule, AutoCompleteCompleteEvent } from 'primeng/autocomplete';
import { ShareRole, WatchlistService, Watchlist, WatchlistItem, WatchlistShare } from '../../core/services/watchlist.service';
import { MarketService } from '../../core/services';
import { environment } from '../../../environments/environment';

type WatchlistStockExtras = {
  targetMeanPrice?: number | null;
  earningsTimestamp?: number | null;
  oneDayChangePercent?: number | null;
  oneMonthChangePercent?: number | null;
  threeMonthChangePercent?: number | null;
  sixMonthChangePercent?: number | null;
  oneYearChangePercent?: number | null;
};

type WatchlistSortKey =
  | 'symbol'
  | 'added'
  | 'days'
  | 'cost'
  | 'last'
  | 'pnl'
  | 'return'
  | 'oneDay'
  | 'oneMonth'
  | 'threeMonth'
  | 'sixMonth'
  | 'oneYear'
  | 'target'
  | 'earnings';

type SortDirection = 'asc' | 'desc';

const WATCHLIST_ENRICHMENT_BATCH_SIZE = 10;
const WATCHLIST_PRICE_REFRESH_INTERVAL_MS = 60_000;

@Component({
  selector: 'app-watchlist-detail',
  imports: [CommonModule, FormsModule, TableModule, ButtonModule, TooltipModule, AutoCompleteModule],
  template: `
    <div class="watchlists-page watchlist-detail-page">
      <!-- Share dialog -->
      <div class="share-overlay" *ngIf="showShareDialog()" (click)="closeShareDialog()">
        <div class="share-dialog" (click)="$event.stopPropagation()">
          <div class="share-dialog-header">
            <div>
              <h3>Share Watchlist</h3>
              <p>{{ wlService.selectedWatchlist()?.name }}</p>
            </div>
            <button class="icon-btn" type="button" (click)="closeShareDialog()" aria-label="Close share dialog">
              <i class="pi pi-times"></i>
            </button>
          </div>

          <div class="share-form">
            <input
              type="email"
              [(ngModel)]="shareEmail"
              placeholder="Collaborator email"
              (keydown.enter)="submitShare()"
              [disabled]="shareLoading()" />
            <select [(ngModel)]="shareRole" [disabled]="shareLoading()">
              <option value="viewer">Viewer</option>
              <option value="editor">Editor</option>
            </select>
            <button class="btn-primary" type="button" (click)="submitShare()" [disabled]="shareLoading() || !shareEmail.trim()">
              <i class="pi pi-share-alt"></i> Share
            </button>
          </div>

          <p class="share-message success" *ngIf="shareMessage()">{{ shareMessage() }}</p>
          <p class="share-message error" *ngIf="shareError()">{{ shareError() }}</p>

          <div class="collaborators">
            <h4>Collaborators</h4>
            <div class="collaborator-empty" *ngIf="wlService.shares().length === 0 && !shareLoading()">
              No collaborators yet.
            </div>
            <div class="collaborator-row" *ngFor="let share of wlService.shares()">
              <div class="collaborator-info">
                <span class="collaborator-email">{{ share.shared_with_email || 'Account user' }}</span>
                <span class="collaborator-role">Can {{ share.role === 'editor' ? 'edit' : 'view' }}</span>
              </div>
              <select
                [ngModel]="share.role"
                (ngModelChange)="changeShareRole(share, $event)"
                [disabled]="shareLoading()">
                <option value="viewer">Viewer</option>
                <option value="editor">Editor</option>
              </select>
              <button class="icon-btn danger" type="button" (click)="revokeShare(share)" [disabled]="shareLoading()" pTooltip="Revoke access" tooltipPosition="top">
                <i class="pi pi-trash"></i>
              </button>
            </div>
          </div>
        </div>
      </div>

      <section class="detail-hero" *ngIf="wlService.selectedWatchlist() as selected; else watchlistLoadingState">
        <button type="button" class="back-link" (click)="goBackToWatchlists()">
          <i class="pi pi-arrow-left"></i>
          Watchlists
        </button>
        <div class="hero-copy">
          <h1>{{ selected.name }}</h1>
          <p>Track live movement, target upside, and upcoming earnings without the side rail.</p>
        </div>
        <div class="hero-switcher">
          <button
            class="switcher-trigger"
            type="button"
            id="watchlist-switcher"
            [class.open]="showWatchlistSwitcher()"
            (click)="toggleWatchlistSwitcher()"
            (keydown.escape)="closeWatchlistSwitcher()"
            [attr.aria-expanded]="showWatchlistSwitcher()"
            aria-haspopup="listbox"
            aria-label="Switch watchlist">
            <span>{{ selected.name }} · {{ getAccessRoleLabel(selected) }}</span>
            <i class="pi pi-chevron-down"></i>
          </button>

          <button
            *ngIf="showWatchlistSwitcher()"
            class="switcher-scrim"
            type="button"
            aria-label="Close watchlist switcher"
            (click)="closeWatchlistSwitcher()"></button>

          <div *ngIf="showWatchlistSwitcher()" class="switcher-menu" role="listbox" aria-labelledby="watchlist-switcher">
            <button
              *ngFor="let wl of wlService.watchlists()"
              class="switcher-option"
              type="button"
              role="option"
              [class.selected]="wl.id === selected.id"
              [attr.aria-selected]="wl.id === selected.id"
              (click)="switchWatchlistFromHero(wl.id)">
              <span class="switcher-option-name">{{ wl.name }}</span>
              <span class="switcher-option-role">{{ getAccessRoleLabel(wl) }}</span>
            </button>
          </div>
        </div>
        <div class="hero-metrics">
          <span class="metric-pill">
            <strong>{{ enrichedItems().length }}</strong>
            <span>Stocks</span>
          </span>
          <span class="metric-pill">
            <strong>{{ getAccessRoleLabel(selected) }}</strong>
            <span>Access</span>
          </span>
          <span class="metric-pill date-pill">
            <strong>{{ today | date:'MMM d' }}</strong>
            <span>{{ today | date:'yyyy' }}</span>
          </span>
        </div>
      </section>

      <ng-template #watchlistLoadingState>
        <div class="detail-missing-state">
          <i class="pi pi-spin pi-spinner"></i>
          <h2>Opening watchlist</h2>
          <p>Loading the selected stock collection.</p>
        </div>
      </ng-template>

      <div class="detail-content" *ngIf="wlService.selectedWatchlist()">
        <!-- Stock table -->
        <div class="wl-main">
          <div class="table-header" *ngIf="wlService.selectedWatchlist()">
            <div class="table-header-left">
              <h2>{{ wlService.selectedWatchlist()!.name }}</h2>
              <span class="stock-count">{{ enrichedItems().length }} stocks</span>
              <span class="role-badge selected" [class.viewer]="wlService.selectedWatchlist()!.access_role === 'viewer'" [class.editor]="wlService.selectedWatchlist()!.access_role === 'editor'">
                {{ getAccessRoleLabel(wlService.selectedWatchlist()!) }}
              </span>
            </div>
            <button class="btn-share" *ngIf="canShareSelectedWatchlist()" type="button" (click)="openShareDialog()">
              <i class="pi pi-share-alt"></i> Share Watchlist
            </button>
            <div class="add-stock-search" *ngIf="canEditSelectedWatchlist(); else readonlyWatchlistNotice">
              <p-autoComplete
                [(ngModel)]="searchQuery"
                [suggestions]="searchResults()"
                (completeMethod)="searchStocks($event)"
                (onSelect)="onStockSelected($event)"
                field="symbol"
                [minLength]="1"
                [delay]="300"
                placeholder="Add stock... (search by name or symbol)"
                [showEmptyMessage]="true"
                emptyMessage="No stocks found"
                [forceSelection]="false"
                appendTo="body"
                panelStyleClass="wl-stock-search-panel"
                [scrollHeight]="'320px'"
                styleClass="wl-stock-search"
                inputStyleClass="wl-search-input">
                <ng-template let-stock pTemplate="item">
                  <div class="search-result-item">
                    <span class="sr-symbol">{{ stock.symbol }}</span>
                    <span class="sr-name">{{ stock.name }}</span>
                    <span class="sr-price">{{ getCurrency(stock.market) }}{{ stock.price | number:'1.2-2' }}</span>
                  </div>
                </ng-template>
              </p-autoComplete>
            </div>
            <ng-template #readonlyWatchlistNotice>
              <div class="readonly-notice" pTooltip="Ask the owner for Editor access to make changes." tooltipPosition="left">
                <i class="pi pi-lock"></i> View only
              </div>
            </ng-template>
          </div>

          <div class="empty-wl" *ngIf="wlService.selectedWatchlist() && enrichedItems().length === 0 && !wlService.loading()">
            <p>No stocks in this watchlist yet.</p>
            <p class="hint">{{ getEmptyHint() }}</p>
          </div>

          <div class="wl-table" *ngIf="enrichedItems().length > 0">
            <table>
              <thead>
                <tr>
                  <th class="col-ticker">
                    <button type="button" class="sort-header" [class.active]="sortKey() === 'symbol'" (click)="setSort('symbol')">
                      TICKER <span class="sort-indicator">{{ getSortIndicator('symbol') }}</span>
                    </button>
                  </th>
                  <th class="col-added">
                    <button type="button" class="sort-header" [class.active]="sortKey() === 'added'" (click)="setSort('added')">
                      ADDED <span class="sort-indicator">{{ getSortIndicator('added') }}</span>
                    </button>
                  </th>
                  <th class="col-days" title="Days since added">
                    <button type="button" class="sort-header" [class.active]="sortKey() === 'days'" (click)="setSort('days')">
                      DAYS <span class="sort-indicator">{{ getSortIndicator('days') }}</span>
                    </button>
                  </th>
                  <th class="col-cost" title="Cost basis">
                    <button type="button" class="sort-header" [class.active]="sortKey() === 'cost'" (click)="setSort('cost')">
                      COST <span class="sort-indicator">{{ getSortIndicator('cost') }}</span>
                    </button>
                  </th>
                  <th class="col-last" title="Last price">
                    <button type="button" class="sort-header" [class.active]="sortKey() === 'last'" (click)="setSort('last')">
                      LAST <span class="sort-indicator">{{ getSortIndicator('last') }}</span>
                    </button>
                  </th>
                  <th class="col-pnl" title="Change since added">
                    <button type="button" class="sort-header" [class.active]="sortKey() === 'pnl'" (click)="setSort('pnl')">
                      $ CHG <span class="sort-indicator">{{ getSortIndicator('pnl') }}</span>
                    </button>
                  </th>
                  <th class="col-return" title="Change since added percent">
                    <button type="button" class="sort-header" [class.active]="sortKey() === 'return'" (click)="setSort('return')">
                      % CHG <span class="sort-indicator">{{ getSortIndicator('return') }}</span>
                    </button>
                  </th>
                  <th class="col-period" title="Live 1 day percent change">
                    <button type="button" class="sort-header" [class.active]="sortKey() === 'oneDay'" (click)="setSort('oneDay')">
                      1D <span class="sort-indicator">{{ getSortIndicator('oneDay') }}</span>
                    </button>
                  </th>
                  <th class="col-period" title="1 month percent change">
                    <button type="button" class="sort-header" [class.active]="sortKey() === 'oneMonth'" (click)="setSort('oneMonth')">
                      1M <span class="sort-indicator">{{ getSortIndicator('oneMonth') }}</span>
                    </button>
                  </th>
                  <th class="col-period" title="3 month percent change">
                    <button type="button" class="sort-header" [class.active]="sortKey() === 'threeMonth'" (click)="setSort('threeMonth')">
                      3M <span class="sort-indicator">{{ getSortIndicator('threeMonth') }}</span>
                    </button>
                  </th>
                  <th class="col-period" title="6 month percent change">
                    <button type="button" class="sort-header" [class.active]="sortKey() === 'sixMonth'" (click)="setSort('sixMonth')">
                      6M <span class="sort-indicator">{{ getSortIndicator('sixMonth') }}</span>
                    </button>
                  </th>
                  <th class="col-period" title="1 year percent change">
                    <button type="button" class="sort-header" [class.active]="sortKey() === 'oneYear'" (click)="setSort('oneYear')">
                      1Y <span class="sort-indicator">{{ getSortIndicator('oneYear') }}</span>
                    </button>
                  </th>
                  <th class="col-target-wl" title="Analyst target">
                    <button type="button" class="sort-header" [class.active]="sortKey() === 'target'" (click)="setSort('target')">
                      TARGET <span class="sort-indicator">{{ getSortIndicator('target') }}</span>
                    </button>
                  </th>
                  <th class="col-earnings-wl">
                    <button type="button" class="sort-header" [class.active]="sortKey() === 'earnings'" (click)="setSort('earnings')">
                      EARN <span class="sort-indicator">{{ getSortIndicator('earnings') }}</span>
                    </button>
                  </th>
                  <th class="col-x"></th>
                </tr>
              </thead>
              <tbody>
                <tr *ngFor="let item of enrichedItems(); let i = index"
                    class="stock-row"
                    (click)="openStock(item.symbol)"
                    [style.animation-delay]="(i * 40) + 'ms'">
                  <td class="col-ticker">
                    <div class="ticker-cell">
                      <span
                        class="ticker"
                        [pTooltip]="getTickerTooltip(item)"
                        tooltipPosition="top">
                        {{ formatSymbol(item.symbol) }}
                      </span>
                      <span class="market-flag">{{ item.market }}</span>
                      <div class="ticker-actions">
                        <a class="ticker-icon detail"
                           [href]="'/stock/' + item.symbol"
                           (click)="$event.stopPropagation()"
                           target="_blank"
                           pTooltip="Stock details"
                           tooltipPosition="top">
                          <img src="stock-detail.svg" alt="Details" />
                        </a>
                        <a *ngIf="item.market === 'US'"
                           class="ticker-icon robinhood"
                           [href]="'https://robinhood.com/stocks/' + item.symbol + '?source=search'"
                           (click)="$event.stopPropagation()"
                           target="_blank"
                           rel="noopener noreferrer"
                           pTooltip="Trade on Robinhood"
                           tooltipPosition="top">
                          <img src="robinhood.png" alt="Robinhood" />
                        </a>
                      </div>
                    </div>
                  </td>
                  <td class="col-added">
                    <span class="date-text">{{ item.added_at | date:'MMM d, y' }}</span>
                  </td>
                  <td class="col-days">
                    <span class="days-text">{{ getDaysSince(item.added_at) }}d</span>
                  </td>
                  <td class="col-cost">
                    <span class="price-text">{{ getCurrency(item.market) }}{{ item.price_when_added | number:'1.2-2' }}</span>
                  </td>
                  <td class="col-last">
                    <span class="price-text current" *ngIf="item.currentPrice">{{ getCurrency(item.market) }}{{ item.currentPrice | number:'1.2-2' }}</span>
                    <span class="price-loading" *ngIf="!item.currentPrice"><span class="dot-pulse"></span></span>
                  </td>
                  <td class="col-pnl" [class.up]="(item.changeDollar || 0) > 0" [class.down]="(item.changeDollar || 0) < 0">
                    <span *ngIf="item.changeDollar != null" class="change-val">
                      {{ item.changeDollar >= 0 ? '+' : '' }}{{ item.changeDollar | number:'1.2-2' }}
                    </span>
                  </td>
                  <td class="col-return" [class.up]="(item.changePercent || 0) > 0" [class.down]="(item.changePercent || 0) < 0">
                    <span *ngIf="item.changePercent != null" class="return-badge" [class.up]="item.changePercent > 0" [class.down]="item.changePercent < 0">
                      {{ item.changePercent >= 0 ? '+' : '' }}{{ item.changePercent | number:'1.2-2' }}%
                    </span>
                  </td>
                  <td class="col-period">
                    <span *ngIf="getDisplayedOneDayChange(item) != null" class="period-change" [class.up]="getDisplayedOneDayChange(item)! > 0" [class.down]="getDisplayedOneDayChange(item)! < 0">
                      {{ getDisplayedOneDayChange(item)! >= 0 ? '+' : '' }}{{ getDisplayedOneDayChange(item) | number:'1.2-2' }}%
                    </span>
                    <span *ngIf="getDisplayedOneDayChange(item) == null" class="muted-text">—</span>
                  </td>
                  <td class="col-period">
                    <span *ngIf="item.oneMonthChangePercent != null" class="period-change" [class.up]="item.oneMonthChangePercent > 0" [class.down]="item.oneMonthChangePercent < 0">
                      {{ item.oneMonthChangePercent >= 0 ? '+' : '' }}{{ item.oneMonthChangePercent | number:'1.2-2' }}%
                    </span>
                    <span *ngIf="item.oneMonthChangePercent == null" class="muted-text">—</span>
                  </td>
                  <td class="col-period">
                    <span *ngIf="item.threeMonthChangePercent != null" class="period-change" [class.up]="item.threeMonthChangePercent > 0" [class.down]="item.threeMonthChangePercent < 0">
                      {{ item.threeMonthChangePercent >= 0 ? '+' : '' }}{{ item.threeMonthChangePercent | number:'1.2-2' }}%
                    </span>
                    <span *ngIf="item.threeMonthChangePercent == null" class="muted-text">—</span>
                  </td>
                  <td class="col-period">
                    <span *ngIf="item.sixMonthChangePercent != null" class="period-change" [class.up]="item.sixMonthChangePercent > 0" [class.down]="item.sixMonthChangePercent < 0">
                      {{ item.sixMonthChangePercent >= 0 ? '+' : '' }}{{ item.sixMonthChangePercent | number:'1.2-2' }}%
                    </span>
                    <span *ngIf="item.sixMonthChangePercent == null" class="muted-text">—</span>
                  </td>
                  <td class="col-period">
                    <span *ngIf="item.oneYearChangePercent != null" class="period-change" [class.up]="item.oneYearChangePercent > 0" [class.down]="item.oneYearChangePercent < 0">
                      {{ item.oneYearChangePercent >= 0 ? '+' : '' }}{{ item.oneYearChangePercent | number:'1.2-2' }}%
                    </span>
                    <span *ngIf="item.oneYearChangePercent == null" class="muted-text">—</span>
                  </td>
                  <td class="col-target-wl">
                    <span *ngIf="getAnalystTarget(item) && item.currentPrice" class="target-text">
                      <span class="target-price">{{ getCurrency(item.market) }}{{ getAnalystTarget(item) | number:'1.0-0' }}</span>
                      <span class="target-pct" [class.positive]="getAnalystTargetPercent(item)! >= 0" [class.negative]="getAnalystTargetPercent(item)! < 0">
                        {{ getAnalystTargetPercent(item)! >= 0 ? '+' : '' }}{{ getAnalystTargetPercent(item) | number:'1.0-0' }}%
                      </span>
                    </span>
                    <span *ngIf="!getAnalystTarget(item) || !item.currentPrice" class="muted-text">—</span>
                  </td>
                  <td class="col-earnings-wl">
                    <span *ngIf="getEarningsDate(item)" class="earnings-text">{{ getEarningsDate(item) }}</span>
                    <span *ngIf="!getEarningsDate(item)" class="muted-text">—</span>
                  </td>
                  <td class="col-x">
                    <button *ngIf="canEditSelectedWatchlist()" class="remove-btn" (click)="removeItem(item); $event.stopPropagation()" pTooltip="Remove" tooltipPosition="left">
                      <i class="pi pi-times"></i>
                    </button>
                    <span *ngIf="!canEditSelectedWatchlist()" class="row-lock" pTooltip="View-only access" tooltipPosition="left">
                      <i class="pi pi-lock"></i>
                    </span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

      </div>
    </div>
  `,
  styles: [`
    .watchlists-page {
      padding: 1.5rem;
      height: calc(100vh - 56px);
      display: flex;
      flex-direction: column;
    }

    .page-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 1.5rem;
    }

    .page-header h1 {
      font-size: 1.4rem;
      font-weight: 700;
      color: var(--text-color);
      display: flex;
      align-items: center;
      gap: 0.5rem;
      margin: 0;
    }

    .page-header h1 i { color: #3b82f6; }

    .btn-create, .btn-primary {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 8px 16px;
      background: linear-gradient(135deg, #3b82f6, #2563eb);
      border: none;
      border-radius: 8px;
      color: #fff;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      font-family: inherit;
    }

    .btn-create:hover, .btn-primary:hover { box-shadow: 0 2px 8px rgba(59, 130, 246, 0.3); }
    .btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }

    .btn-secondary {
      padding: 8px 16px;
      background: var(--surface-hover);
      border: 1px solid var(--surface-border);
      border-radius: 8px;
      color: var(--text-color-secondary);
      font-size: 13px;
      cursor: pointer;
      font-family: inherit;
    }

    .role-badge {
      display: inline-flex;
      align-items: center;
      width: fit-content;
      padding: 1px 6px;
      border-radius: 999px;
      background: rgba(59, 130, 246, 0.12);
      color: #60a5fa;
      font-size: 10px;
      font-weight: 800;
      letter-spacing: 0.02em;
      text-transform: uppercase;
      white-space: nowrap;
    }

    .role-badge.viewer {
      background: rgba(148, 163, 184, 0.14);
      color: #94a3b8;
    }

    .role-badge.editor {
      background: rgba(16, 185, 129, 0.12);
      color: #34d399;
    }

    .role-badge.selected {
      font-size: 11px;
      padding: 2px 8px;
    }

    .wl-rename-input {
      font-size: 13px;
      font-weight: 600;
      background: var(--surface-ground);
      border: 1px solid #3b82f6;
      border-radius: 4px;
      color: var(--text-color);
      padding: 2px 6px;
      width: 120px;
      font-family: inherit;
      outline: none;
    }

    .wl-actions { display: flex; gap: 2px; opacity: 0; transition: opacity 0.15s; }
    .wl-item:hover .wl-actions { opacity: 1; }

    .icon-btn {
      background: none;
      border: none;
      color: var(--text-color-secondary);
      cursor: pointer;
      padding: 4px;
      border-radius: 4px;
      font-size: 12px;
    }
    .icon-btn:hover { color: var(--text-color); background: var(--surface-hover); }
    .icon-btn.danger:hover { color: #ef4444; background: rgba(239, 68, 68, 0.1); }

    .wl-main {
      flex: 1;
      min-width: 0;
      background: var(--surface-card);
      border: 1px solid var(--surface-border);
      border-radius: 12px;
      padding: 16px;
      overflow: auto;
    }

    .table-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      margin-bottom: 12px;
      flex-wrap: wrap;
    }

    .table-header-left {
      display: flex;
      align-items: baseline;
      gap: 12px;
      min-width: 0;
      margin-right: auto;
    }
    .table-header h2 { font-size: 1.1rem; font-weight: 600; color: var(--text-color); margin: 0; }
    .stock-count { font-size: 12px; color: var(--text-color-secondary); }

    .btn-share {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 8px 12px;
      background: rgba(59, 130, 246, 0.12);
      border: 1px solid rgba(59, 130, 246, 0.28);
      border-radius: 8px;
      color: #93c5fd;
      font-size: 13px;
      font-weight: 700;
      cursor: pointer;
      font-family: inherit;
      white-space: nowrap;
    }

    .btn-share:hover {
      background: rgba(59, 130, 246, 0.2);
      color: #bfdbfe;
    }

    .add-stock-search {
      flex: 1 1 520px;
      min-width: min(460px, 100%);
      max-width: 720px;
    }
    .readonly-notice {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 8px 12px;
      border-radius: 8px;
      background: rgba(148, 163, 184, 0.1);
      color: var(--text-color-secondary);
      font-size: 13px;
      font-weight: 700;
      white-space: nowrap;
    }
    :host ::ng-deep .wl-stock-search { width: 100%; }
    :host ::ng-deep .wl-search-input {
      width: 100% !important;
      background: var(--surface-ground) !important;
      border: 1px solid var(--surface-border) !important;
      border-radius: 8px !important;
      color: var(--text-color) !important;
      font-size: 13px !important;
      padding: 8px 12px !important;
    }
    :host ::ng-deep .wl-search-input:focus { border-color: #3b82f6 !important; }

    :host ::ng-deep .wl-stock-search-panel {
      min-width: 360px;
      max-width: min(520px, calc(100vw - 24px));
      z-index: 1200 !important;
    }

    .search-result-item {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 4px 0;
      font-size: 13px;
    }
    .sr-symbol { font-weight: 700; color: var(--text-color); min-width: 60px; }
    .sr-name { color: var(--text-color-secondary); flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .sr-price { color: var(--text-color); font-weight: 500; }

    .col-period {
      text-align: right;
      white-space: nowrap;
    }

    .empty-wl, .empty-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 8px;
      padding: 3rem;
      text-align: center;
    }

    .empty-state h2 { color: var(--text-color); margin: 0; }
    .empty-state p, .empty-wl p { color: var(--text-color-secondary); margin: 0; font-size: 14px; }
    .hint { font-size: 12px !important; opacity: 0.7; }

    /* ── Premium Table ── */
    .wl-table {
      overflow-x: auto;
    }

    .wl-table table {
      width: 100%;
      border-collapse: separate;
      border-spacing: 0;
      table-layout: auto;
    }

    .wl-table thead th {
      padding: 0.65rem 0.8rem;
      color: #64748b;
      font-size: 0.68rem;
      font-weight: 900;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      border-bottom: 1px solid rgba(148, 163, 184, 0.12);
      white-space: nowrap;
      position: sticky;
      top: 0;
      background: rgba(2, 6, 23, 0.18);
      z-index: 1;
    }

    .sort-header {
      display: inline-flex;
      align-items: center;
      justify-content: inherit;
      gap: 3px;
      padding: 0;
      border: 0;
      background: transparent;
      color: inherit;
      cursor: pointer;
      font: inherit;
      letter-spacing: inherit;
      text-transform: inherit;
      white-space: nowrap;
    }

    .sort-header:hover,
    .sort-header.active {
      color: #93c5fd;
    }

    .sort-indicator {
      display: inline-flex;
      min-width: 7px;
      color: #60a5fa;
      font-size: 9px;
      font-weight: 900;
    }

    .col-cost .sort-header,
    .col-last .sort-header,
    .col-pnl .sort-header,
    .col-return .sort-header,
    .col-period .sort-header,
    .col-target-wl .sort-header {
      margin-left: auto;
    }

    .col-ticker {
      text-align: left;
    }

    .col-added,
    .col-days,
    .col-earnings-wl,
    .col-x {
      text-align: center;
    }

    .col-cost,
    .col-last,
    .col-pnl,
    .col-return,
    .col-period,
    .col-target-wl {
      text-align: right;
    }

    .muted-text { color: #475569; opacity: 0.3; }
    .earnings-text { font-size: 12px; color: #94a3b8; }
    .target-text {
      display: inline-flex;
      flex-direction: column;
      align-items: flex-end;
      gap: 2px;
      font-size: 11px;
      line-height: 1.15;
      color: #e2e8f0;
      white-space: nowrap;
    }
    .target-price {
      font-weight: 800;
      color: #e2e8f0;
    }
    .target-pct {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      align-self: flex-end;
      border-radius: 999px;
      padding: 2px 6px;
      font-size: 9px;
      font-weight: 800;
    }
    .target-pct.positive {
      color: #34d399;
      background: rgba(52, 211, 153, 0.12);
    }
    .target-pct.negative {
      color: #f87171;
      background: rgba(248, 113, 113, 0.12);
    }

    .stock-row {
      cursor: pointer;
      animation: rowFadeIn 0.3s ease-out both;
    }

    @keyframes rowFadeIn {
      from { opacity: 0; transform: translateY(4px); }
      to { opacity: 1; transform: translateY(0); }
    }

    .stock-row td {
      padding: 10px 8px;
      border-bottom: 1px solid rgba(148, 163, 184, 0.04);
      vertical-align: middle;
      transition: background 0.15s;
      white-space: nowrap;
    }

    .stock-row:hover td {
      background: rgba(59, 130, 246, 0.04);
    }

    .stock-row:hover .ticker {
      color: #3b82f6;
    }

    .ticker-cell {
      display: flex;
      align-items: center;
      gap: 5px;
    }

    .ticker-actions {
      display: flex;
      align-items: center;
      gap: 5px;
      margin-left: 2px;
    }

    .ticker-icon {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 18px;
      height: 18px;
      border-radius: 5px;
      overflow: hidden;
      transition: transform 0.15s, box-shadow 0.2s;
      text-decoration: none;
    }

    .ticker-icon img {
      width: 18px;
      height: 18px;
      object-fit: cover;
      display: block;
    }

    .ticker-icon.detail:hover {
      transform: scale(1.1);
      box-shadow: 0 0 8px rgba(99, 102, 241, 0.5);
    }

    .ticker-icon.robinhood:hover {
      transform: scale(1.1);
      box-shadow: 0 0 8px rgba(192, 255, 0, 0.4);
    }

    .ticker {
      font-size: 12px;
      font-weight: 800;
      color: #f1f5f9;
      letter-spacing: 0.02em;
      transition: color 0.15s;
    }

    .market-flag {
      font-size: 8px;
      font-weight: 600;
      color: #64748b;
      background: rgba(100, 116, 139, 0.1);
      padding: 1px 4px;
      border-radius: 4px;
      letter-spacing: 0.05em;
    }

    .date-text {
      font-size: 11px;
      color: #64748b;
      font-variant-numeric: tabular-nums;
    }

    .days-text {
      font-size: 11px;
      color: #94a3b8;
      font-weight: 500;
      font-variant-numeric: tabular-nums;
    }

    .price-text {
      font-size: 11.5px;
      color: #cbd5e1;
      font-weight: 500;
      font-variant-numeric: tabular-nums;
    }

    .price-text.current {
      color: #f1f5f9;
      font-weight: 600;
    }

    .price-loading {
      display: inline-block;
      width: 40px;
    }

    .dot-pulse {
      display: inline-block;
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: #475569;
      animation: pulse 1.2s ease-in-out infinite;
    }

    @keyframes pulse {
      0%, 100% { opacity: 0.3; }
      50% { opacity: 1; }
    }

    .change-val {
      font-size: 11.5px;
      font-weight: 500;
      font-variant-numeric: tabular-nums;
    }

    .col-change.up .change-val { color: #34d399; }
    .col-change.down .change-val { color: #f87171; }

    .return-badge {
      display: inline-block;
      font-size: 11px;
      font-weight: 700;
      padding: 3px 7px;
      border-radius: 6px;
      font-variant-numeric: tabular-nums;
    }

    .return-badge.up {
      color: #34d399;
      background: rgba(52, 211, 153, 0.1);
    }

    .return-badge.down {
      color: #f87171;
      background: rgba(248, 113, 113, 0.1);
    }

    .period-change {
      font-size: 11px;
      font-weight: 700;
      font-variant-numeric: tabular-nums;
    }

    .period-change.up { color: #34d399; }
    .period-change.down { color: #f87171; }

    .remove-btn {
      background: none;
      border: none;
      color: #475569;
      cursor: pointer;
      padding: 6px;
      border-radius: 6px;
      font-size: 12px;
      opacity: 0;
      transition: all 0.15s;
    }

    .stock-row:hover .remove-btn { opacity: 1; }
    .remove-btn:hover { color: #f87171; background: rgba(248, 113, 113, 0.1); }
    .row-lock { color: #64748b; font-size: 12px; }

    /* Create dialog */
    .create-overlay, .share-overlay {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.6);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 1000;
    }

    .create-dialog, .share-dialog {
      background: var(--surface-card);
      border: 1px solid var(--surface-border);
      border-radius: 16px;
      padding: 24px;
      width: 380px;
      box-shadow: 0 24px 48px rgba(0, 0, 0, 0.4);
    }

    .share-dialog {
      width: min(560px, calc(100vw - 32px));
      max-height: calc(100vh - 64px);
      overflow: auto;
    }

    .create-dialog h3 {
      margin: 0 0 16px 0;
      font-size: 16px;
      color: var(--text-color);
    }

    .share-dialog h3 {
      margin: 0;
      font-size: 16px;
      color: var(--text-color);
    }

    .share-dialog-header {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 16px;
      margin-bottom: 16px;
    }

    .share-dialog-header p {
      margin: 4px 0 0;
      color: var(--text-color-secondary);
      font-size: 13px;
    }

    .create-dialog input, .share-form input, .share-form select, .collaborator-row select {
      width: 100%;
      padding: 10px 12px;
      background: var(--surface-ground);
      border: 1px solid var(--surface-border);
      border-radius: 8px;
      color: var(--text-color);
      font-size: 14px;
      font-family: inherit;
      outline: none;
      box-sizing: border-box;
      margin-bottom: 16px;
    }

    .share-form input, .share-form select, .collaborator-row select {
      margin-bottom: 0;
    }

    .share-form {
      display: grid;
      grid-template-columns: minmax(0, 1fr) 120px auto;
      gap: 8px;
      align-items: stretch;
      margin-bottom: 12px;
    }

    .create-dialog input:focus, .share-form input:focus, .share-form select:focus, .collaborator-row select:focus { border-color: #3b82f6; }

    .share-message {
      margin: 8px 0 0;
      font-size: 13px;
    }

    .share-message.success { color: #34d399; }
    .share-message.error { color: #f87171; }

    .collaborators {
      margin-top: 20px;
      border-top: 1px solid var(--surface-border);
      padding-top: 16px;
    }

    .collaborators h4 {
      margin: 0 0 10px;
      font-size: 13px;
      color: var(--text-color);
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }

    .collaborator-empty {
      padding: 12px;
      border-radius: 8px;
      background: rgba(148, 163, 184, 0.08);
      color: var(--text-color-secondary);
      font-size: 13px;
    }

    .collaborator-row {
      display: grid;
      grid-template-columns: minmax(0, 1fr) 120px 32px;
      gap: 8px;
      align-items: center;
      padding: 10px 0;
      border-bottom: 1px solid rgba(148, 163, 184, 0.1);
    }

    .collaborator-info {
      display: flex;
      flex-direction: column;
      gap: 2px;
      min-width: 0;
    }

    .collaborator-email {
      color: var(--text-color);
      font-size: 13px;
      font-weight: 700;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .collaborator-role {
      color: var(--text-color-secondary);
      font-size: 11px;
    }

    .dialog-actions {
      display: flex;
      justify-content: flex-end;
      gap: 8px;
    }



    .watchlist-detail-page {
      gap: 1rem;
      background:
        radial-gradient(circle at 12% 0%, rgba(56, 189, 248, 0.16), transparent 32%),
        radial-gradient(circle at 88% 8%, rgba(59, 130, 246, 0.16), transparent 34%);
    }

    .detail-hero {
      position: relative;
      z-index: 20;
      display: grid;
      grid-template-columns: auto minmax(0, 1fr) minmax(16rem, 0.75fr) auto;
      align-items: center;
      gap: 1.25rem;
      padding: 1.1rem;
      border: 1px solid rgba(96, 165, 250, 0.22);
      border-radius: 20px;
      background:
        linear-gradient(135deg, rgba(15, 23, 42, 0.92), rgba(15, 23, 42, 0.72)),
        var(--surface-card);
      box-shadow: 0 24px 70px rgba(2, 6, 23, 0.32);
      overflow: visible;
    }

    .detail-hero::before {
      content: '';
      position: absolute;
      inset: 0;
      pointer-events: none;
      background: linear-gradient(90deg, rgba(96, 165, 250, 0.16), transparent 42%, rgba(34, 211, 238, 0.12));
      opacity: 0.65;
      border-radius: inherit;
    }

    .detail-hero > * { position: relative; z-index: 1; }
    .back-link {
      display: inline-flex;
      align-items: center;
      gap: 0.45rem;
      height: 40px;
      padding: 0 0.8rem;
      border: 1px solid rgba(148, 163, 184, 0.22);
      border-radius: 999px;
      background: rgba(15, 23, 42, 0.7);
      color: #cbd5e1;
      font-size: 0.8rem;
      font-weight: 800;
      cursor: pointer;
      font-family: inherit;
    }

    .back-link:hover,
    .back-link:focus-visible { color: #f8fafc; border-color: rgba(96, 165, 250, 0.55); outline: none; }
    .hero-copy {
      min-width: 0;
      display: flex;
      align-items: baseline;
      gap: 0.8rem;
      flex-wrap: wrap;
    }
    .hero-copy h1 { margin: 0; color: #f8fafc; font-size: clamp(1.5rem, 3vw, 2.25rem); letter-spacing: -0.04em; }
    .hero-copy p {
      margin: 0;
      padding-left: 0.8rem;
      border-left: 1px solid rgba(148, 163, 184, 0.18);
      color: #94a3b8;
      font-size: 0.82rem;
      line-height: 1.2;
    }
    .eyebrow { color: #38bdf8; font-size: 0.72rem; font-weight: 900; letter-spacing: 0.16em; text-transform: uppercase; }
    .hero-switcher {
      display: flex;
      flex-direction: column;
      justify-content: center;
      min-width: 0;
      position: relative;
    }
    .switcher-trigger {
      position: relative;
      z-index: 31;
      width: 100%;
      min-height: 36px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 0.75rem;
      padding: 0 0.75rem;
      border: 1px solid rgba(96, 165, 250, 0.24);
      border-radius: 12px;
      background: rgba(2, 6, 23, 0.42);
      color: #e2e8f0;
      font-size: 0.84rem;
      font-weight: 800;
      font-family: inherit;
      outline: none;
      cursor: pointer;
      box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.04);
      transition: border-color 0.18s, box-shadow 0.18s, background 0.18s;
    }
    .switcher-trigger span {
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .switcher-trigger i {
      color: #7dd3fc;
      font-size: 0.72rem;
      transition: transform 0.18s;
    }
    .switcher-trigger.open i { transform: rotate(180deg); }
    .switcher-trigger:hover,
    .switcher-trigger:focus-visible,
    .switcher-trigger.open {
      border-color: rgba(56, 189, 248, 0.68);
      box-shadow: 0 0 0 3px rgba(56, 189, 248, 0.12);
      background: rgba(2, 6, 23, 0.64);
    }
    .switcher-scrim {
      position: fixed;
      inset: 0;
      z-index: 30;
      border: 0;
      background: transparent;
      cursor: default;
    }
    .switcher-menu {
      position: absolute;
      top: calc(100% + 0.4rem);
      left: 0;
      right: 0;
      z-index: 32;
      max-height: min(22rem, calc(100vh - 12rem));
      overflow: auto;
      padding: 0.35rem;
      border: 1px solid rgba(56, 189, 248, 0.26);
      border-radius: 14px;
      background:
        linear-gradient(180deg, rgba(15, 23, 42, 0.98), rgba(2, 6, 23, 0.98)),
        var(--surface-card);
      box-shadow: 0 24px 60px rgba(2, 6, 23, 0.58), 0 0 0 1px rgba(255, 255, 255, 0.03);
      backdrop-filter: blur(16px);
      animation: switcherMenuIn 0.14s ease-out both;
    }
    .switcher-option {
      width: 100%;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 0.75rem;
      padding: 0.65rem 0.7rem;
      border: 0;
      border-radius: 10px;
      background: transparent;
      color: #cbd5e1;
      font-family: inherit;
      cursor: pointer;
      text-align: left;
      transition: background 0.16s, color 0.16s, transform 0.16s;
    }
    .switcher-option:hover,
    .switcher-option:focus-visible {
      background: rgba(56, 189, 248, 0.12);
      color: #f8fafc;
      outline: none;
    }
    .switcher-option.selected {
      background: linear-gradient(90deg, rgba(56, 189, 248, 0.22), rgba(59, 130, 246, 0.12));
      color: #f8fafc;
    }
    .switcher-option-name {
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      font-size: 0.82rem;
      font-weight: 800;
    }
    .switcher-option-role {
      flex: 0 0 auto;
      color: #7dd3fc;
      font-size: 0.64rem;
      font-weight: 900;
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }
    @keyframes switcherMenuIn {
      from { opacity: 0; transform: translateY(-4px) scale(0.98); }
      to { opacity: 1; transform: translateY(0) scale(1); }
    }
    .hero-metrics { display: flex; align-items: center; gap: 0.55rem; flex-wrap: wrap; justify-content: flex-end; }
    .metric-pill { min-width: 76px; height: 40px; display: flex; flex-direction: column; justify-content: center; gap: 0.05rem; padding: 0 0.7rem; border: 1px solid rgba(148, 163, 184, 0.16); border-radius: 14px; background: rgba(15, 23, 42, 0.58); }
    .metric-pill strong { color: #f8fafc; font-size: 0.95rem; line-height: 1; }
    .metric-pill span { color: #94a3b8; font-size: 0.58rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0.08em; }
    .detail-content { min-height: 0; flex: 1; display: flex; }
    .detail-content .wl-main { width: 100%; border-radius: 20px; background: rgba(15, 23, 42, 0.74); }
    .detail-missing-state { display: grid; place-items: center; gap: 0.6rem; min-height: 18rem; border: 1px solid rgba(148, 163, 184, 0.14); border-radius: 20px; background: rgba(15, 23, 42, 0.68); color: #cbd5e1; text-align: center; }
    .detail-missing-state h2 { margin: 0; color: #f8fafc; }
    .detail-missing-state p { margin: 0; color: #94a3b8; }

    @media (max-width: 768px) {
      .watchlists-page { padding: 0.75rem; }
      .page-header { margin-bottom: 0.75rem; }
      .page-header h1 { font-size: 1.1rem; }
      .detail-hero { grid-template-columns: 1fr; align-items: flex-start; }
      .hero-metrics { justify-content: flex-start; }
      .wl-main { padding: 12px; }
      .wl-table { overflow-x: auto; }
      .table-header { flex-direction: column; align-items: flex-start; gap: 8px; }
      .add-stock-search { min-width: 100%; }
      .share-form, .collaborator-row { grid-template-columns: 1fr; }
      .share-dialog { width: calc(100vw - 24px); padding: 18px; }
      .today-date { font-size: 11px; }
      .btn-create { font-size: 12px; padding: 6px 12px; }
    }

    @media (max-width: 480px) {
      .watchlists-page { padding: 0.5rem; }
      .ticker { font-size: 12px; }
    }
  `]
})
export class WatchlistDetailComponent implements OnInit, OnDestroy {
  wlService = inject(WatchlistService);
  private marketService = inject(MarketService);
  private http = inject(HttpClient);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private zone = inject(NgZone);

  showCreateDialog = signal(false);
  showShareDialog = signal(false);
  shareLoading = signal(false);
  shareMessage = signal<string | null>(null);
  shareError = signal<string | null>(null);
  newWatchlistName = '';
  shareEmail = '';
  shareRole: ShareRole = 'viewer';
  showWatchlistSwitcher = signal(false);
  editingId = '';
  editingName = '';
  today = new Date();

  // Drag-and-drop reorder
  dragIndex: number | null = null;
  dragOverIndex: number | null = null;

  // Stock search
  searchQuery: any = '';
  searchResults = signal<any[]>([]);
  private stockSearchRequestId = 0;
  sortKey = signal<WatchlistSortKey | null>('oneDay');
  sortDirection = signal<SortDirection>('desc');

  enrichedItems = computed(() => {
    const items = this.wlService.items();
    const prices = this.currentPrices();
    const extras = this.stockExtras();
    const enriched = items.map(item => {
      const cp = prices[item.symbol];
      const ext = extras[item.symbol] ?? {};
      const changeDollar = cp != null ? cp - item.price_when_added : null;
      const changePercent = cp != null && item.price_when_added > 0
        ? ((cp - item.price_when_added) / item.price_when_added) * 100 : null;
      return {
        ...item,
        currentPrice: cp ?? null,
        changeDollar,
        changePercent,
        oneDayChangePercent: ext.oneDayChangePercent ?? null,
        oneMonthChangePercent: ext.oneMonthChangePercent ?? null,
        threeMonthChangePercent: ext.threeMonthChangePercent ?? null,
        sixMonthChangePercent: ext.sixMonthChangePercent ?? null,
        oneYearChangePercent: ext.oneYearChangePercent ?? null,
      };
    });

    const key = this.sortKey();
    if (!key) return enriched;

    const directionMultiplier = this.sortDirection() === 'asc' ? 1 : -1;
    return [...enriched].sort((a, b) => {
      const result = this.compareSortValues(this.getSortValue(a, key), this.getSortValue(b, key));
      return result * directionMultiplier;
    });
  });

  private currentPrices = signal<Record<string, number>>({});
  private stockExtras = signal<Record<string, WatchlistStockExtras>>({});
  private refreshedOneDayChanges = signal<Record<string, number | null>>({});
  private fetchPricesRequestId = 0;
  private fetchOneDayChangesRequestId = 0;
  private priceRefreshIntervalId: ReturnType<typeof setInterval> | null = null;
  private readonly visibilityChangeHandler = () => this.refreshOneDayChangesWhenVisible();

  constructor() {
    // Re-fetch prices whenever items change (e.g. switching watchlists)
    effect(() => {
      const items = this.wlService.items();
      if (items.length > 0) {
        this.currentPrices.set({}); // clear stale prices
        this.refreshedOneDayChanges.set({});
        this.fetchPrices();
      }
    });
  }

  async ngOnInit(): Promise<void> {
    await this.wlService.loadWatchlists();
    const watchlistId = this.route.snapshot.paramMap.get('watchlistId');
    const selected = watchlistId ? await this.wlService.selectWatchlistById(watchlistId) : false;
    if (!selected) {
      await this.router.navigate(['/watchlists']);
      return;
    }
    this.startPriceRefresh();
  }

  ngOnDestroy(): void {
    this.stopPriceRefresh();
  }

  goBackToWatchlists(): void {
    this.router.navigate(['/watchlists']);
  }

  toggleWatchlistSwitcher(): void {
    this.showWatchlistSwitcher.update(open => !open);
  }

  closeWatchlistSwitcher(): void {
    this.showWatchlistSwitcher.set(false);
  }

  async switchWatchlistFromHero(watchlistId: string): Promise<void> {
    const current = this.wlService.selectedWatchlist();
    this.closeWatchlistSwitcher();
    if (!watchlistId || current?.id === watchlistId) return;

    const selected = await this.wlService.selectWatchlistById(watchlistId);
    if (selected) {
      await this.router.navigate(['/watchlists', watchlistId]);
    }
  }

  async createWatchlist() {
    const name = this.newWatchlistName.trim();
    if (!name) return;
    await this.wlService.createWatchlist(name);
    this.newWatchlistName = '';
    this.showCreateDialog.set(false);
  }

  startRename(wl: Watchlist) {
    this.editingId = wl.id;
    this.editingName = wl.name;
  }

  async saveRename(wl: Watchlist) {
    if (this.editingName.trim() && this.editingName !== wl.name) {
      await this.wlService.renameWatchlist(wl.id, this.editingName.trim());
    }
    this.editingId = '';
  }

  async confirmDelete(wl: Watchlist) {
    if (confirm(`Delete "${wl.name}" and all its stocks?`)) {
      await this.wlService.deleteWatchlist(wl.id);
    }
  }

  async openShareDialog(): Promise<void> {
    const wl = this.wlService.selectedWatchlist();
    if (!wl || !this.isOwner(wl)) return;

    this.shareEmail = '';
    this.shareRole = 'viewer';
    this.shareMessage.set(null);
    this.shareError.set(null);
    this.showShareDialog.set(true);
    this.shareLoading.set(true);

    try {
      await this.wlService.loadShares(wl.id);
    } catch (error) {
      this.shareError.set(this.getErrorMessage(error, 'Unable to load collaborators.'));
    } finally {
      this.shareLoading.set(false);
    }
  }

  closeShareDialog(): void {
    this.showShareDialog.set(false);
    this.shareMessage.set(null);
    this.shareError.set(null);
  }

  async submitShare(): Promise<void> {
    const wl = this.wlService.selectedWatchlist();
    const email = this.shareEmail.trim();
    if (!wl || !email || !this.isOwner(wl)) return;

    this.shareLoading.set(true);
    this.shareMessage.set(null);
    this.shareError.set(null);

    try {
      await this.wlService.shareWatchlist(wl.id, email, this.shareRole);
      this.shareEmail = '';
      this.shareRole = 'viewer';
      this.shareMessage.set('Collaborator access updated.');
    } catch (error) {
      this.shareError.set(this.getErrorMessage(error, 'Unable to share this watchlist.'));
    } finally {
      this.shareLoading.set(false);
    }
  }

  async changeShareRole(share: WatchlistShare, role: ShareRole): Promise<void> {
    if (share.role === role) return;

    this.shareLoading.set(true);
    this.shareMessage.set(null);
    this.shareError.set(null);

    try {
      await this.wlService.updateShareRole(share.id, role);
      this.shareMessage.set('Collaborator role updated.');
    } catch (error) {
      this.shareError.set(this.getErrorMessage(error, 'Unable to update collaborator access.'));
    } finally {
      this.shareLoading.set(false);
    }
  }

  async revokeShare(share: WatchlistShare): Promise<void> {
    if (!confirm(`Revoke access for ${share.shared_with_email || 'this collaborator'}?`)) return;

    this.shareLoading.set(true);
    this.shareMessage.set(null);
    this.shareError.set(null);

    try {
      await this.wlService.revokeShare(share.id);
      this.shareMessage.set('Collaborator access revoked.');
    } catch (error) {
      this.shareError.set(this.getErrorMessage(error, 'Unable to revoke collaborator access.'));
    } finally {
      this.shareLoading.set(false);
    }
  }

  // --- Drag-and-drop reorder ---

  onDragStart(index: number, event: DragEvent) {
    this.dragIndex = index;
    event.dataTransfer?.setData('text/plain', String(index));
    if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
  }

  onDragOver(index: number, event: DragEvent) {
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
    this.dragOverIndex = index;
  }

  onDrop(index: number, event: DragEvent) {
    event.preventDefault();
    if (this.dragIndex === null || this.dragIndex === index) return;

    const watchlists = [...this.wlService.watchlists()];
    const [moved] = watchlists.splice(this.dragIndex, 1);
    watchlists.splice(index, 0, moved);

    // Update local state immediately for snappy UI
    this.wlService.watchlists.set(watchlists);

    // Persist new order to Supabase
    this.wlService.saveOrder(watchlists.map((w, i) => ({ id: w.id, sort_order: i })));

    this.dragIndex = null;
    this.dragOverIndex = null;
  }

  onDragEnd() {
    this.dragIndex = null;
    this.dragOverIndex = null;
  }

  async removeItem(item: WatchlistItem) {
    await this.wlService.removeItem(item.id);
    this.fetchPrices();
  }

  isOwner(wl: Watchlist): boolean {
    return wl.access_role === 'owner';
  }

  canShareSelectedWatchlist(): boolean {
    const wl = this.wlService.selectedWatchlist();
    return !!wl && this.isOwner(wl);
  }

  canEditSelectedWatchlist(): boolean {
    const wl = this.wlService.selectedWatchlist();
    return !!wl && this.wlService.canEditWatchlist(wl.id);
  }

  getAccessRoleLabel(wl: Watchlist): string {
    switch (wl.access_role) {
      case 'owner':
        return 'Owner';
      case 'editor':
        return 'Editor';
      case 'viewer':
        return 'Viewer';
    }
  }

  getEmptyHint(): string {
    return this.canEditSelectedWatchlist()
      ? 'Go to any stock page and click "Add to Watchlist"'
      : 'This shared watchlist is view-only.';
  }

  openStock(symbol: string) {
    this.router.navigate(['/stock', symbol]);
  }

  formatSymbol(symbol: string): string {
    return symbol.replace('.NS', '').replace('.BO', '');
  }

  getTickerTooltip(item: WatchlistItem): string {
    return item.name?.trim() || this.formatSymbol(item.symbol);
  }

  getCurrency(market: string): string {
    return market === 'IN' ? '₹' : '$';
  }

  getDaysSince(dateStr: string): number {
    const added = new Date(dateStr);
    const now = new Date();
    return Math.floor((now.getTime() - added.getTime()) / (1000 * 60 * 60 * 24));
  }

  setSort(key: WatchlistSortKey): void {
    if (this.sortKey() === key) {
      this.sortDirection.update(direction => direction === 'asc' ? 'desc' : 'asc');
      return;
    }

    this.sortKey.set(key);
    this.sortDirection.set('asc');
  }

  getSortIndicator(key: WatchlistSortKey): string {
    if (this.sortKey() !== key) return '';
    return this.sortDirection() === 'asc' ? '^' : 'v';
  }

  async searchStocks(event: AutoCompleteCompleteEvent) {
    const query = event.query.trim();
    if (query.length < 1) {
      this.stockSearchRequestId++;
      return;
    }

    const requestId = ++this.stockSearchRequestId;

    try {
      // Search both markets so users can mix US and India stocks in any watchlist
      const [usRes, inRes] = await Promise.all([
        this.http.get<any>(`${environment.apiBaseUrl}/api/stocks?action=search&q=${encodeURIComponent(query)}&market=US`).toPromise().catch(() => null),
        this.http.get<any>(`${environment.apiBaseUrl}/api/stocks?action=search&q=${encodeURIComponent(query)}&market=IN`).toPromise().catch(() => null),
      ]);

      const combined = [
        ...(usRes?.stocks || []),
        ...(inRes?.stocks || []),
      ].slice(0, 8);

      if (requestId === this.stockSearchRequestId) {
        this.searchResults.set(combined);
      }
    } catch {
      if (requestId === this.stockSearchRequestId) {
        this.searchResults.set([]);
      }
    }
  }

  async onStockSelected(event: any) {
    const stock = event.value || event;
    const wl = this.wlService.selectedWatchlist();
    if (!wl || !stock?.symbol) return;

    const market = stock.market || this.marketService.currentMarket();
    await this.wlService.addItem(wl.id, stock.symbol, stock.name || stock.symbol, market, stock.price || 0);
    this.searchQuery = '';
    this.searchResults.set([]);
    this.fetchPrices();
  }

  getAnalystTarget(item: any): number | null {
    const extras = this.stockExtras();
    return extras[item.symbol]?.targetMeanPrice || null;
  }

  getAnalystTargetPercent(item: any): number | null {
    const target = this.getAnalystTarget(item);
    if (!target || !item.currentPrice) return null;
    return ((target - item.currentPrice) / item.currentPrice) * 100;
  }

  getEarningsDate(item: any): string | null {
    const extras = this.stockExtras();
    const ts = extras[item.symbol]?.earningsTimestamp;
    if (!ts) return null;
    const d = new Date(ts * 1000);
    const now = new Date();
    const diffDays = Math.round((d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    const dateStr = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    if (diffDays >= 0 && diffDays <= 14) return `${dateStr} (${diffDays}d)`;
    return dateStr;
  }

  getDisplayedOneDayChange(item: WatchlistItem & WatchlistStockExtras): number | null {
    const refreshed = this.refreshedOneDayChanges();
    return Object.prototype.hasOwnProperty.call(refreshed, item.symbol)
      ? refreshed[item.symbol] ?? null
      : item.oneDayChangePercent ?? null;
  }

  private getSortValue(item: any, key: WatchlistSortKey): string | number | null {
    switch (key) {
      case 'symbol':
        return item.symbol?.toUpperCase() ?? null;
      case 'added':
        return new Date(item.added_at).getTime();
      case 'days':
        return this.getDaysSince(item.added_at);
      case 'cost':
        return item.price_when_added;
      case 'last':
        return item.currentPrice;
      case 'pnl':
        return item.changeDollar;
      case 'return':
        return item.changePercent;
      case 'oneDay':
        return item.oneDayChangePercent;
      case 'oneMonth':
        return item.oneMonthChangePercent;
      case 'threeMonth':
        return item.threeMonthChangePercent;
      case 'sixMonth':
        return item.sixMonthChangePercent;
      case 'oneYear':
        return item.oneYearChangePercent;
      case 'target':
        return this.getAnalystTargetPercent(item) ?? this.getAnalystTarget(item);
      case 'earnings':
        return this.stockExtras()[item.symbol]?.earningsTimestamp ?? null;
    }
  }

  private compareSortValues(a: string | number | null, b: string | number | null): number {
    if (a == null && b == null) return 0;
    if (a == null) return 1;
    if (b == null) return -1;

    if (typeof a === 'string' || typeof b === 'string') {
      return String(a).localeCompare(String(b));
    }

    return a - b;
  }

  private getErrorMessage(error: unknown, fallback: string): string {
    return error instanceof Error ? error.message : fallback;
  }

  private async fetchPrices() {
    const requestId = ++this.fetchPricesRequestId;
    const items = this.wlService.items();
    if (items.length === 0) return;

    const byMarket: Record<string, string[]> = {};
    for (const item of items) {
      const m = item.market || 'US';
      if (!byMarket[m]) byMarket[m] = [];
      byMarket[m].push(item.symbol);
    }

    const prices: Record<string, number> = {};
    const extras: Record<string, WatchlistStockExtras> = {};

    const fetches = Object.entries(byMarket).flatMap(([market, symbols]) => {
      const chunks: string[][] = [];
      for (let i = 0; i < symbols.length; i += WATCHLIST_ENRICHMENT_BATCH_SIZE) {
        chunks.push(symbols.slice(i, i + WATCHLIST_ENRICHMENT_BATCH_SIZE));
      }

      return chunks.map(async chunk => {
        const url = `${environment.apiBaseUrl}/api/stocks?action=search&q=${encodeURIComponent(chunk.join(','))}&market=${market}&performance=true`;
        try {
          const data: any = await this.http.get(url).toPromise();
          if (data?.stocks) {
            for (const s of data.stocks) {
              prices[s.symbol] = s.price;
              extras[s.symbol] = {
                targetMeanPrice: s.targetMeanPrice || null,
                earningsTimestamp: s.earningsTimestamp || null,
                oneDayChangePercent: s.changePercent ?? null,
                oneMonthChangePercent: s.oneMonthChangePercent ?? null,
                threeMonthChangePercent: s.threeMonthChangePercent ?? null,
                sixMonthChangePercent: s.sixMonthChangePercent ?? null,
                oneYearChangePercent: s.oneYearChangePercent ?? null,
              };
            }
          }
        } catch {
          // Leave this chunk blank; other chunks can still populate normally.
        }
      });
    });

    await Promise.all(fetches);
    if (requestId !== this.fetchPricesRequestId) {
      return;
    }
    this.currentPrices.set(prices);
    this.stockExtras.set(extras);
    this.refreshedOneDayChanges.set({});
  }

  private async fetchOneDayChanges(): Promise<void> {
    const requestId = ++this.fetchOneDayChangesRequestId;
    const items = this.wlService.items();
    if (items.length === 0) return;

    const byMarket: Record<string, string[]> = {};
    for (const item of items) {
      const market = item.market || 'US';
      if (!byMarket[market]) byMarket[market] = [];
      byMarket[market].push(item.symbol);
    }

    const changes: Record<string, number | null> = {};
    const fetches = Object.entries(byMarket).flatMap(([market, symbols]) => {
      const chunks: string[][] = [];
      for (let i = 0; i < symbols.length; i += WATCHLIST_ENRICHMENT_BATCH_SIZE) {
        chunks.push(symbols.slice(i, i + WATCHLIST_ENRICHMENT_BATCH_SIZE));
      }

      return chunks.map(async chunk => {
        const url = `${environment.apiBaseUrl}/api/stocks?action=search&q=${encodeURIComponent(chunk.join(','))}&market=${market}`;
        try {
          const data: any = await this.http.get(url).toPromise();
          if (data?.stocks) {
            for (const stock of data.stocks) {
              changes[stock.symbol] = stock.changePercent ?? null;
            }
          }
        } catch {
          // Keep existing 1D values if this refresh fails.
        }
      });
    });

    await Promise.all(fetches);
    if (requestId !== this.fetchOneDayChangesRequestId) return;
    this.refreshedOneDayChanges.set(changes);
  }

  private startPriceRefresh(): void {
    this.stopPriceRefresh();
    this.zone.runOutsideAngular(() => {
      document.addEventListener('visibilitychange', this.visibilityChangeHandler);
      this.priceRefreshIntervalId = setInterval(
        () => this.zone.run(() => this.refreshOneDayChangesWhenVisible()),
        WATCHLIST_PRICE_REFRESH_INTERVAL_MS
      );
    });
  }

  private stopPriceRefresh(): void {
    if (this.priceRefreshIntervalId) {
      clearInterval(this.priceRefreshIntervalId);
      this.priceRefreshIntervalId = null;
    }
    document.removeEventListener('visibilitychange', this.visibilityChangeHandler);
  }

  private refreshOneDayChangesWhenVisible(): void {
    if (document.visibilityState === 'hidden') return;
    this.fetchOneDayChanges();
  }
}
