import { Component, inject, OnInit, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { TableModule } from 'primeng/table';
import { ButtonModule } from 'primeng/button';
import { TooltipModule } from 'primeng/tooltip';
import { AutoCompleteModule, AutoCompleteCompleteEvent } from 'primeng/autocomplete';
import { WatchlistService, Watchlist, WatchlistItem } from '../../core/services/watchlist.service';
import { MarketService } from '../../core/services';
import { environment } from '../../../environments/environment';

@Component({
  selector: 'app-watchlists',
  standalone: true,
  imports: [CommonModule, FormsModule, TableModule, ButtonModule, TooltipModule, AutoCompleteModule],
  template: `
    <div class="watchlists-page">
      <div class="page-header">
        <h1><i class="pi pi-bookmark"></i> My Watchlists</h1>
        <button class="btn-create" (click)="showCreateDialog.set(true)">
          <i class="pi pi-plus"></i> New Watchlist
        </button>
      </div>

      <!-- Create dialog -->
      <div class="create-overlay" *ngIf="showCreateDialog()" (click)="showCreateDialog.set(false)">
        <div class="create-dialog" (click)="$event.stopPropagation()">
          <h3>Create Watchlist</h3>
          <input
            type="text"
            [(ngModel)]="newWatchlistName"
            placeholder="e.g. Tech Stocks, Earnings Watch..."
            (keydown.enter)="createWatchlist()"
            autofocus />
          <div class="dialog-actions">
            <button class="btn-secondary" (click)="showCreateDialog.set(false)">Cancel</button>
            <button class="btn-primary" (click)="createWatchlist()" [disabled]="!newWatchlistName.trim()">Create</button>
          </div>
        </div>
      </div>

      <!-- Empty state -->
      <div class="empty-state" *ngIf="!wlService.loading() && wlService.watchlists().length === 0">
        <i class="pi pi-bookmark" style="font-size: 48px; color: #3b82f6; opacity: 0.5;"></i>
        <h2>No watchlists yet</h2>
        <p>Create your first watchlist to start tracking stocks</p>
        <button class="btn-primary" (click)="showCreateDialog.set(true)">
          <i class="pi pi-plus"></i> Create Watchlist
        </button>
      </div>

      <!-- Main content -->
      <div class="content" *ngIf="wlService.watchlists().length > 0">
        <!-- Watchlist sidebar -->
        <div class="wl-sidebar">
          <div
            *ngFor="let wl of wlService.watchlists()"
            class="wl-item"
            [class.active]="wlService.selectedWatchlist()?.id === wl.id"
            (click)="wlService.selectWatchlist(wl)">
            <div class="wl-info">
              <span class="wl-name" *ngIf="editingId !== wl.id">{{ wl.name }}</span>
              <input
                *ngIf="editingId === wl.id"
                class="wl-rename-input"
                [(ngModel)]="editingName"
                (keydown.enter)="saveRename(wl)"
                (keydown.escape)="editingId = ''"
                (blur)="saveRename(wl)"
                autofocus />
              <span class="wl-count">{{ wl.item_count || 0 }} stocks</span>
            </div>
            <div class="wl-actions">
              <button class="icon-btn" (click)="startRename(wl); $event.stopPropagation()" pTooltip="Rename" tooltipPosition="top">
                <i class="pi pi-pencil"></i>
              </button>
              <button class="icon-btn danger" (click)="confirmDelete(wl); $event.stopPropagation()" pTooltip="Delete" tooltipPosition="top">
                <i class="pi pi-trash"></i>
              </button>
            </div>
          </div>
        </div>

        <!-- Stock table -->
        <div class="wl-main">
          <div class="table-header" *ngIf="wlService.selectedWatchlist()">
            <div class="table-header-left">
              <h2>{{ wlService.selectedWatchlist()!.name }}</h2>
              <span class="stock-count">{{ enrichedItems().length }} stocks</span>
            </div>
            <span class="today-date">{{ today | date:'EEEE, MMM d, y' }}</span>
            <div class="add-stock-search">
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
          </div>

          <div class="empty-wl" *ngIf="wlService.selectedWatchlist() && enrichedItems().length === 0 && !wlService.loading()">
            <p>No stocks in this watchlist yet.</p>
            <p class="hint">Go to any stock page and click "Add to Watchlist"</p>
          </div>

          <div class="wl-table" *ngIf="enrichedItems().length > 0">
            <table>
              <thead>
                <tr>
                  <th class="col-ticker">TICKER</th>
                  <th class="col-company">COMPANY</th>
                  <th class="col-added">ADDED</th>
                  <th class="col-days">DAYS SINCE ADDED</th>
                  <th class="col-cost">COST BASIS</th>
                  <th class="col-last">LAST PRICE</th>
                  <th class="col-pnl">CHANGE SINCE</th>
                  <th class="col-return">CHANGE SINCE %</th>
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
                      <span class="ticker">{{ formatSymbol(item.symbol) }}</span>
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
                  <td class="col-company">
                    <span class="company-name">{{ item.name || item.symbol }}</span>
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
                  <td class="col-x">
                    <button class="remove-btn" (click)="removeItem(item); $event.stopPropagation()" pTooltip="Remove" tooltipPosition="left">
                      <i class="pi pi-times"></i>
                    </button>
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

    .content {
      display: flex;
      gap: 1rem;
      flex: 1;
      min-height: 0;
    }

    .wl-sidebar {
      width: 220px;
      flex-shrink: 0;
      background: var(--surface-card);
      border: 1px solid var(--surface-border);
      border-radius: 12px;
      padding: 8px;
      overflow-y: auto;
    }

    .wl-item {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 10px 12px;
      border-radius: 8px;
      cursor: pointer;
      transition: all 0.15s;
    }

    .wl-item:hover { background: var(--surface-hover); }
    .wl-item.active { background: rgba(59, 130, 246, 0.1); border: 1px solid rgba(59, 130, 246, 0.2); }

    .wl-info { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
    .wl-name { font-size: 13px; font-weight: 600; color: var(--text-color); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .wl-count { font-size: 11px; color: var(--text-color-secondary); }

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
    }

    .table-header-left { display: flex; align-items: baseline; gap: 12px; }
    .table-header h2 { font-size: 1.1rem; font-weight: 600; color: var(--text-color); margin: 0; }
    .stock-count { font-size: 12px; color: var(--text-color-secondary); }

    .today-date {
      font-size: 13px;
      color: #64748b;
      font-weight: 500;
      white-space: nowrap;
    }

    .add-stock-search { min-width: 280px; }
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
    }

    .wl-table thead th {
      padding: 8px 12px;
      font-size: 10px;
      font-weight: 700;
      letter-spacing: 0.08em;
      color: #475569;
      text-transform: uppercase;
      border-bottom: 1px solid rgba(148, 163, 184, 0.1);
      white-space: nowrap;
      position: sticky;
      top: 0;
      background: var(--surface-card);
      z-index: 1;
    }

    .wl-table table { table-layout: fixed; }

    .col-ticker  { width: 160px; text-align: left; padding-left: 16px !important; }
    .col-company { text-align: left; padding-left: 60px !important; padding-right: 32px !important; }
    .col-added   { width: 105px; text-align: center; padding-left: 16px !important; }
    .col-days    { width: 130px; text-align: center; }
    .col-cost    { width: 110px; text-align: right; padding-left: 16px !important; }
    .col-last    { width: 110px; text-align: right; padding-left: 16px !important; }
    .col-pnl     { width: 115px; text-align: right; padding-left: 16px !important; }
    .col-return  { width: 130px; text-align: right; padding-left: 16px !important; }
    .col-x       { width: 40px; text-align: center; }

    .stock-row {
      cursor: pointer;
      animation: rowFadeIn 0.3s ease-out both;
    }

    @keyframes rowFadeIn {
      from { opacity: 0; transform: translateY(4px); }
      to { opacity: 1; transform: translateY(0); }
    }

    .stock-row td {
      padding: 12px 12px;
      border-bottom: 1px solid rgba(148, 163, 184, 0.04);
      vertical-align: middle;
      transition: background 0.15s;
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
      gap: 6px;
    }

    .ticker-actions {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-left: 4px;
    }

    .ticker-icon {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 22px;
      height: 22px;
      border-radius: 5px;
      overflow: hidden;
      transition: transform 0.15s, box-shadow 0.2s;
      text-decoration: none;
    }

    .ticker-icon img {
      width: 22px;
      height: 22px;
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
      font-size: 14px;
      font-weight: 800;
      color: #f1f5f9;
      letter-spacing: 0.02em;
      transition: color 0.15s;
    }

    .market-flag {
      font-size: 9px;
      font-weight: 600;
      color: #64748b;
      background: rgba(100, 116, 139, 0.1);
      padding: 2px 6px;
      border-radius: 4px;
      letter-spacing: 0.05em;
    }

    .company-name {
      font-size: 13px;
      color: #94a3b8;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      display: block;
      max-width: 220px;
    }

    .date-text {
      font-size: 12px;
      color: #64748b;
      font-variant-numeric: tabular-nums;
    }

    .days-text {
      font-size: 12px;
      color: #94a3b8;
      font-weight: 500;
      font-variant-numeric: tabular-nums;
    }

    .price-text {
      font-size: 13px;
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
      font-size: 13px;
      font-weight: 500;
      font-variant-numeric: tabular-nums;
    }

    .col-change.up .change-val { color: #34d399; }
    .col-change.down .change-val { color: #f87171; }

    .return-badge {
      display: inline-block;
      font-size: 12px;
      font-weight: 700;
      padding: 3px 10px;
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

    /* Create dialog */
    .create-overlay {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.6);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 1000;
    }

    .create-dialog {
      background: var(--surface-card);
      border: 1px solid var(--surface-border);
      border-radius: 16px;
      padding: 24px;
      width: 380px;
      box-shadow: 0 24px 48px rgba(0, 0, 0, 0.4);
    }

    .create-dialog h3 {
      margin: 0 0 16px 0;
      font-size: 16px;
      color: var(--text-color);
    }

    .create-dialog input {
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

    .create-dialog input:focus { border-color: #3b82f6; }

    .dialog-actions {
      display: flex;
      justify-content: flex-end;
      gap: 8px;
    }

    @media (max-width: 768px) {
      .content { flex-direction: column; }
      .wl-sidebar { width: 100%; max-height: 200px; }
    }
  `]
})
export class WatchlistsComponent implements OnInit {
  wlService = inject(WatchlistService);
  private marketService = inject(MarketService);
  private http = inject(HttpClient);
  private router = inject(Router);

  showCreateDialog = signal(false);
  newWatchlistName = '';
  editingId = '';
  editingName = '';
  today = new Date();

  // Stock search
  searchQuery: any = '';
  searchResults = signal<any[]>([]);

  enrichedItems = computed(() => {
    const items = this.wlService.items();
    const prices = this.currentPrices();
    return items.map(item => {
      const cp = prices[item.symbol];
      const changeDollar = cp != null ? cp - item.price_when_added : null;
      const changePercent = cp != null && item.price_when_added > 0
        ? ((cp - item.price_when_added) / item.price_when_added) * 100 : null;
      return { ...item, currentPrice: cp ?? null, changeDollar, changePercent };
    });
  });

  private currentPrices = signal<Record<string, number>>({});

  ngOnInit() {
    this.wlService.loadWatchlists().then(() => {
      this.fetchPrices();
    });
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

  async removeItem(item: WatchlistItem) {
    await this.wlService.removeItem(item.id);
    this.fetchPrices();
  }

  openStock(symbol: string) {
    this.router.navigate(['/stock', symbol]);
  }

  formatSymbol(symbol: string): string {
    return symbol.replace('.NS', '').replace('.BO', '');
  }

  getCurrency(market: string): string {
    return market === 'IN' ? '₹' : '$';
  }

  getDaysSince(dateStr: string): number {
    const added = new Date(dateStr);
    const now = new Date();
    return Math.floor((now.getTime() - added.getTime()) / (1000 * 60 * 60 * 24));
  }

  async searchStocks(event: AutoCompleteCompleteEvent) {
    const query = event.query.trim();
    if (query.length < 1) return;

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

      this.searchResults.set(combined);
    } catch {
      this.searchResults.set([]);
    }
  }

  async onStockSelected(event: any) {
    const stock = event.value || event;
    const wl = this.wlService.selectedWatchlist();
    if (!wl || !stock?.symbol) return;

    const market = stock.market || this.marketService.currentMarket();
    await this.wlService.addItem(wl.id, stock.symbol, stock.name || stock.symbol, market, stock.price || 0);
    this.searchQuery = '';
    this.fetchPrices();
  }

  private async fetchPrices() {
    const items = this.wlService.items();
    if (items.length === 0) return;

    // Group by market since API needs market param
    const byMarket: Record<string, string[]> = {};
    for (const item of items) {
      const m = item.market || 'US';
      if (!byMarket[m]) byMarket[m] = [];
      byMarket[m].push(item.symbol);
    }

    const prices: Record<string, number> = {};

    try {
      const fetches = Object.entries(byMarket).map(async ([market, symbols]) => {
        const url = `${environment.apiBaseUrl}/api/stocks?action=search&q=${symbols.join(',')}&market=${market}`;
        const data: any = await this.http.get(url).toPromise();
        if (data?.stocks) {
          for (const s of data.stocks) {
            prices[s.symbol] = s.price;
          }
        }
      });
      await Promise.all(fetches);
      this.currentPrices.set(prices);
    } catch {
      // Prices will show as "..." — not critical
    }
  }
}
