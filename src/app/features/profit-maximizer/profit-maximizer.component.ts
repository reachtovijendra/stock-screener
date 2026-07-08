import { ChangeDetectionStrategy, Component, computed, inject, OnInit, signal } from '@angular/core';
import { CommonModule, DecimalPipe, DatePipe } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { ButtonModule } from 'primeng/button';
import { ProgressSpinnerModule } from 'primeng/progressspinner';
import { TooltipModule } from 'primeng/tooltip';

import {
  parseTransactionsCsv,
  computeHoldings,
  type Holding,
} from '../../core/utils/transaction-parser';
import {
  ProfitMaximizerService,
  type ProfitMaximizerUpload,
  DEFAULT_LT_TAX_RATE,
  DEFAULT_ST_TAX_RATE,
} from '../../core/services/profit-maximizer.service';

interface HoldingView extends Holding {
  name: string | null;
  price: number | null;
  marketValue: number | null;
  totalReturn: number | null;      // unrealized gain/loss ($)
  totalReturnPct: number | null;
  longTermGain: number | null;
  totalTaxIfSold: number | null;   // tax to sell the whole position now
  longTermTax: number | null;      // tax to sell only the long-term shares now
  daysToAllLongTerm: number | null;
}

type SortKey =
  | 'symbol' | 'totalShares' | 'avgCost' | 'price' | 'totalReturn'
  | 'totalTaxIfSold' | 'longTermShares' | 'longTermTax' | 'allLongTerm';

@Component({
  selector: 'app-profit-maximizer',
  standalone: true,
  imports: [CommonModule, DecimalPipe, DatePipe, ButtonModule, ProgressSpinnerModule, TooltipModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="pm-page">
      <header class="hero">
        <div class="hero-copy">
          <span class="eyebrow">Tax & Profit</span>
          <h1>Profit Maximizer</h1>
          <p>Upload your brokerage transactions to see current holdings and how many shares qualify for lower long-term capital-gains tax (held &gt; 1 year).</p>
        </div>
        @if (state()) {
          <div class="hero-actions">
            <button pButton class="p-button-sm p-button-outlined" icon="pi pi-upload" label="Upload new file" (click)="fileInput.click()"></button>
            @if (!confirmingClear()) {
              <button pButton class="p-button-sm p-button-text p-button-danger" icon="pi pi-trash" label="Clear all" (click)="confirmingClear.set(true)"></button>
            } @else {
              <span class="confirm-clear">
                <span>Clear all transactions?</span>
                <button pButton class="p-button-sm p-button-danger" icon="pi pi-trash" label="Yes, clear" (click)="clear()"></button>
                <button pButton class="p-button-sm p-button-text" label="Cancel" (click)="confirmingClear.set(false)"></button>
              </span>
            }
          </div>
        }
      </header>

      <input #fileInput type="file" accept=".csv,text/csv" hidden (change)="onFileSelected($event)" />

      @if (!state()) {
        <div class="dropzone" [class.dragover]="dragOver()"
          (dragover)="onDragOver($event)" (dragleave)="dragOver.set(false)" (drop)="onDrop($event)"
          (click)="fileInput.click()">
          <i class="pi pi-file-import"></i>
          <strong>Drop your transactions CSV here, or click to browse</strong>
          <span>Export your account activity from Robinhood, Fidelity, or most brokers as CSV.</span>
          <span class="privacy"><i class="pi pi-lock"></i> Parsed in your browser, then saved privately to your account — available here every day and on any device.</span>
          @if (saving()) { <span class="privacy"><i class="pi pi-spin pi-spinner"></i> Saving…</span> }
          @if (error()) { <span class="err"><i class="pi pi-exclamation-triangle"></i> {{ error() }}</span> }
        </div>
      } @else {
        <div class="file-meta">
          <span><i class="pi pi-file"></i> {{ state()!.fileName }}</span>
          <span class="dot">·</span>
          <span>{{ state()!.broker }}</span>
          <span class="dot">·</span>
          <span>{{ holdings().length }} holdings from {{ state()!.transactions.length }} transactions</span>
          <span class="dot">·</span>
          <span>uploaded {{ state()!.uploadedAt | date:'MMM d, y, h:mm a' }}</span>
          <span class="dot">·</span>
          <span class="saved"><i class="pi pi-check-circle"></i> Saved to your account</span>
        </div>
        @if (error()) { <div class="err-banner"><i class="pi pi-exclamation-triangle"></i> {{ error() }}</div> }

        <section class="summary-grid">
          <div class="summary-card">
            <span>Market Value</span>
            <strong>{{ totalMarketValue() != null ? ('$' + (totalMarketValue() | number:'1.2-2')) : '—' }}</strong>
          </div>
          <div class="summary-card" [class.positive]="(totalReturns() ?? 0) > 0" [class.negative]="(totalReturns() ?? 0) < 0">
            <span>Total Returns</span>
            <strong>{{ totalReturns() != null ? (((totalReturns()! >= 0) ? '+$' : '-$') + (absVal(totalReturns()!) | number:'1.2-2')) : '—' }}</strong>
          </div>
          <div class="summary-card negative">
            <span>Tax if Sold Now</span>
            <strong>{{ totalTaxNow() != null ? ('$' + (totalTaxNow() | number:'1.2-2')) : '—' }}</strong>
          </div>
          <div class="summary-card positive">
            <span>Tax Saved by Waiting</span>
            <strong>{{ taxSavedByWaiting() != null ? ('$' + (taxSavedByWaiting() | number:'1.2-2')) : '—' }}</strong>
          </div>
        </section>

        <div class="controls">
          <div class="rate-group">
            <label>Long-term tax rate
              <span class="rate-input"><input type="number" min="0" max="60" step="0.5" [value]="ltRate()" (change)="onRateChange('lt', $event)" /> %</span>
            </label>
            <label>Short-term tax rate
              <span class="rate-input"><input type="number" min="0" max="60" step="0.5" [value]="stRate()" (change)="onRateChange('st', $event)" /> %</span>
            </label>
          </div>
          @if (loadingPrices()) {
            <span class="prices-loading"><p-progressSpinner strokeWidth="4" [style]="{width:'16px',height:'16px'}"></p-progressSpinner> Live prices…</span>
          }
        </div>

        <section class="table-panel">
          <div class="table-wrap">
            <table class="pm-table">
              <thead>
                <tr>
                  <th class="col-sym sortable" (click)="toggleSort('symbol')">Stock <i [class]="sortIcon('symbol')"></i></th>
                  <th class="num sortable" (click)="toggleSort('totalShares')">Total Shares <i [class]="sortIcon('totalShares')"></i></th>
                  <th class="num sortable" (click)="toggleSort('avgCost')">Avg Buy Price <i [class]="sortIcon('avgCost')"></i></th>
                  <th class="num sortable" (click)="toggleSort('price')">Current Price <i [class]="sortIcon('price')"></i><br><small>live</small></th>
                  <th class="num sortable" (click)="toggleSort('totalReturn')">Total Returns <i [class]="sortIcon('totalReturn')"></i><br><small>live</small></th>
                  <th class="num sortable" (click)="toggleSort('totalTaxIfSold')">Total Tax if Sold <i [class]="sortIcon('totalTaxIfSold')"></i><br><small>live</small></th>
                  <th class="num sortable" (click)="toggleSort('longTermShares')">Shares Held <i [class]="sortIcon('longTermShares')"></i><br><small>&gt; 1 year</small></th>
                  <th class="num sortable" (click)="toggleSort('longTermTax')">Tax on Those <i [class]="sortIcon('longTermTax')"></i><br><small>live</small></th>
                  <th class="sortable" (click)="toggleSort('allLongTerm')">All Sellable at Least Tax <i [class]="sortIcon('allLongTerm')"></i></th>
                </tr>
              </thead>
              <tbody>
                @for (h of sortedHoldings(); track h.symbol) {
                  <tr>
                    <td class="col-sym">
                      <div class="sym">{{ h.symbol }}</div>
                      @if (h.name) { <div class="nm">{{ h.name | slice:0:28 }}</div> }
                    </td>
                    <td class="num strong">{{ h.totalShares | number:'1.0-4' }}</td>
                    <td class="num">{{ h.avgCost != null ? ('$' + (h.avgCost | number:'1.2-2')) : '—' }}</td>
                    <td class="num">{{ h.price != null ? ('$' + (h.price | number:'1.2-2')) : '—' }}</td>
                    <td class="num" [class.pos]="(h.totalReturn ?? 0) > 0" [class.neg]="(h.totalReturn ?? 0) < 0">
                      @if (h.totalReturn != null) {
                        {{ (h.totalReturn >= 0 ? '+$' : '-$') + (absVal(h.totalReturn) | number:'1.2-2') }}
                        @if (h.totalReturnPct != null) { <small>{{ h.totalReturnPct >= 0 ? '+' : '' }}{{ h.totalReturnPct | number:'1.1-1' }}%</small> }
                      } @else { — }
                    </td>
                    <td class="num tax">{{ h.totalTaxIfSold != null ? ('$' + (h.totalTaxIfSold | number:'1.2-2')) : '—' }}</td>
                    <td class="num lt">{{ h.longTermShares | number:'1.0-4' }}</td>
                    <td class="num tax">{{ h.longTermTax != null ? ('$' + (h.longTermTax | number:'1.2-2')) : '—' }}</td>
                    <td>
                      @if (h.allLongTerm) {
                        <span class="chip lt-chip"><i class="pi pi-check-circle"></i> Now — all long-term</span>
                      } @else {
                        <span class="chip date-chip"
                          [pTooltip]="'Sell on/after this date and every share of ' + h.symbol + ' is taxed at the lower long-term rate.'"
                          tooltipPosition="top">
                          {{ h.allLongTermDate! + 'T00:00:00' | date:'MMM d, y' }}
                          @if (h.daysToAllLongTerm != null) { <small>in {{ h.daysToAllLongTerm }}d</small> }
                        </span>
                      }
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
          <p class="disclaimer">
            <i class="pi pi-info-circle"></i>
            Tax = capital gain × your rate (gains only), split by holding period; lots matched First-In-First-Out. "Total Tax if Sold" assumes selling the whole position today; "Tax on Those" is for selling only the &gt;1-year shares. "All Sellable at Least Tax" is when the newest lot turns 1 year old, after which the entire position qualifies for the long-term rate. Stock splits and non-equity activity (options, dividends, transfers) are ignored. Estimate only — not tax advice.
          </p>
        </section>
      }
    </div>
  `,
  styles: [`
    .pm-page { min-height: calc(100vh - 56px); padding: 1.25rem; display: flex; flex-direction: column; gap: 0.9rem;
      background: linear-gradient(180deg, rgba(15,23,42,0.16), transparent 34%); }
    .hero, .dropzone, .summary-card, .table-panel, .file-meta {
      border: 1px solid rgba(148,163,184,0.14); background: rgba(15,23,42,0.58); border-radius: 18px; }
    .hero { display: flex; align-items: flex-end; justify-content: space-between; gap: 1rem; padding: 1rem 1.1rem; }
    .hero h1 { margin: 0.1rem 0 0.2rem; color: #f8fafc; font-size: clamp(1.45rem,2.8vw,2.15rem); line-height: 1; letter-spacing: -0.045em; }
    .hero p { margin: 0; color: #94a3b8; font-size: 0.9rem; max-width: 60rem; }
    .hero-actions { display: flex; gap: 0.4rem; flex-shrink: 0; align-items: center; flex-wrap: wrap; }
    .confirm-clear { display: inline-flex; align-items: center; gap: 0.4rem; padding: 0.2rem 0.2rem 0.2rem 0.7rem;
      border: 1px solid rgba(248,113,113,0.35); border-radius: 999px; background: rgba(239,68,68,0.1); }
    .confirm-clear > span { color: #fecaca; font-size: 0.8rem; font-weight: 700; }
    .eyebrow { display: inline-block; color: #38bdf8; font-size: 0.7rem; font-weight: 900; letter-spacing: 0.14em; text-transform: uppercase; }

    .dropzone { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 0.5rem;
      min-height: 20rem; padding: 2rem; text-align: center; border-style: dashed; cursor: pointer; transition: all 0.15s ease; }
    .dropzone:hover, .dropzone.dragover { border-color: #38bdf8; background: rgba(56,189,248,0.06); }
    .dropzone .pi.pi-file-import { font-size: 2.4rem; color: #38bdf8; }
    .dropzone strong { color: #f8fafc; font-size: 1rem; }
    .dropzone span { color: #94a3b8; font-size: 0.85rem; }
    .dropzone .privacy { color: #6ee7b7; font-size: 0.78rem; display: inline-flex; align-items: center; gap: 0.35rem; }
    .dropzone .err { color: #f87171; font-weight: 700; display: inline-flex; align-items: center; gap: 0.35rem; }

    .file-meta { display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap; padding: 0.6rem 0.9rem; color: #94a3b8; font-size: 0.8rem; }
    .file-meta .dot { opacity: 0.5; }
    .file-meta .saved { color: #34d399; display: inline-flex; align-items: center; gap: 0.3rem; }
    .err-banner { display: flex; align-items: center; gap: 0.4rem; padding: 0.6rem 0.9rem; border-radius: 12px;
      color: #fecaca; background: rgba(239,68,68,0.12); border: 1px solid rgba(248,113,113,0.3); font-size: 0.82rem; }

    .summary-grid { display: grid; grid-template-columns: repeat(4, minmax(0,1fr)); gap: 0.65rem; }
    @media (max-width: 780px) { .summary-grid { grid-template-columns: repeat(2, minmax(0,1fr)); } }
    .summary-card { --accent: #f8fafc; padding: 0.72rem 0.85rem; border-radius: 14px; }
    .summary-card span { display: block; color: #94a3b8; font-size: 0.66rem; font-weight: 800; letter-spacing: 0.08em; text-transform: uppercase; }
    .summary-card strong { display: block; margin-top: 0.2rem; color: var(--accent); font-size: 1.18rem; font-weight: 900; letter-spacing: -0.035em; }
    .summary-card.positive { --accent: #34d399; } .summary-card.negative { --accent: #f87171; }

    .prices-loading { display: inline-flex; align-items: center; gap: 0.5rem; color: #94a3b8; font-size: 0.8rem; }

    .controls { display: flex; align-items: center; justify-content: space-between; gap: 1rem; flex-wrap: wrap; padding: 0 0.2rem; }
    .rate-group { display: flex; gap: 1.1rem; flex-wrap: wrap; }
    .rate-group label { display: inline-flex; align-items: center; gap: 0.5rem; color: #94a3b8; font-size: 0.78rem; font-weight: 700; }
    .rate-input { display: inline-flex; align-items: center; gap: 0.25rem; color: #cbd5e1; }
    .rate-input input { width: 3.8rem; background: rgba(15,23,42,0.6); border: 1px solid rgba(148,163,184,0.24);
      border-radius: 8px; color: #f8fafc; padding: 0.3rem 0.4rem; font: inherit; font-size: 0.82rem; text-align: right; }
    .rate-input input:focus { outline: none; border-color: #38bdf8; }
    .num.tax { color: #f87171; font-weight: 700; }

    .table-panel { border-radius: 18px; overflow: hidden; }
    /* Own scroll area (both axes) so the header can freeze while rows scroll. */
    .table-wrap { overflow: auto; -webkit-overflow-scrolling: touch; max-height: calc(100vh - 300px); min-height: 12rem; }
    .pm-table { width: 100%; min-width: 900px; border-collapse: separate; border-spacing: 0; font-size: 0.84rem; }
    .pm-table thead th { position: sticky; top: 0; z-index: 2; padding: 0.6rem 0.75rem; text-align: left; color: #64748b;
      font-size: 0.66rem; font-weight: 900; letter-spacing: 0.06em; text-transform: uppercase; white-space: nowrap;
      background: linear-gradient(180deg,#0b1120,#0f172a);
      box-shadow: inset 0 -1px 0 rgba(148,163,184,0.12), 0 6px 12px rgba(2,6,23,0.28); }
    .pm-table thead th small { color: #475569; font-weight: 700; }
    .pm-table thead th.sortable { cursor: pointer; user-select: none; transition: color 0.12s ease; }
    .pm-table thead th.sortable:hover { color: #cbd5e1; }
    .pm-table thead th.sortable i { font-size: 0.62rem; margin-left: 0.15rem; opacity: 0.75; vertical-align: middle; }
    .pm-table thead th.sortable i.pi-sort-alt { opacity: 0.35; }
    .pm-table td { padding: 0.6rem 0.75rem; color: #cbd5e1; border-bottom: 1px solid rgba(148,163,184,0.08); white-space: nowrap; vertical-align: middle; }
    .pm-table tbody tr:hover td { background: rgba(56,189,248,0.05); }
    .num { text-align: right; } .num.strong { color: #f8fafc; font-weight: 800; }
    .num.lt { color: #34d399; font-weight: 700; } .num.st { color: #fbbf24; font-weight: 700; }
    .num.pos { color: #34d399; font-weight: 700; } .num.neg { color: #f87171; font-weight: 700; }
    .num small { display: block; font-size: 0.7rem; opacity: 0.8; }
    .col-sym .sym { color: #f8fafc; font-weight: 800; }
    .col-sym .nm { color: #94a3b8; font-size: 0.72rem; }

    .chip { display: inline-flex; align-items: center; gap: 0.3rem; border-radius: 999px; padding: 0.2rem 0.55rem; font-size: 0.72rem; font-weight: 800; }
    .chip small { opacity: 0.75; font-weight: 700; }
    .lt-chip { color: #34d399; background: rgba(16,185,129,0.12); }
    .date-chip { color: #fbbf24; background: rgba(251,191,36,0.12); }

    .disclaimer { display: flex; gap: 0.45rem; margin: 0; padding: 0.75rem 0.9rem; color: #64748b; font-size: 0.72rem; line-height: 1.45; border-top: 1px solid rgba(148,163,184,0.08); }
    .disclaimer .pi { color: #a78bfa; margin-top: 0.1rem; }
  `]
})
export class ProfitMaximizerComponent implements OnInit {
  private http = inject(HttpClient);
  private store = inject(ProfitMaximizerService);

  state = signal<ProfitMaximizerUpload | null>(null);
  dragOver = signal(false);
  error = signal<string | null>(null);
  saving = signal(false);
  confirmingClear = signal(false);
  loadingPrices = signal(false);
  ltRate = signal(DEFAULT_LT_TAX_RATE);
  stRate = signal(DEFAULT_ST_TAX_RATE);
  sortKey = signal<SortKey>('symbol');
  sortDir = signal<'asc' | 'desc'>('asc');
  private prices = signal<Record<string, { price: number | null; name: string | null }>>({});
  private readonly today = new Date().toISOString().slice(0, 10);

  private baseHoldings = computed<Holding[]>(() => {
    const s = this.state();
    return s ? computeHoldings(s.transactions, this.today) : [];
  });

  holdings = computed<HoldingView[]>(() => {
    const px = this.prices();
    const ltR = this.ltRate() / 100;
    const stR = this.stRate() / 100;
    return this.baseHoldings().map(h => {
      const info = px[h.symbol];
      const price = info?.price ?? null;
      const marketValue = price != null ? round2(price * h.totalShares) : null;
      const totalReturn = (marketValue != null && h.costBasis != null) ? round2(marketValue - h.costBasis) : null;
      const totalReturnPct = (totalReturn != null && h.costBasis) ? round2((totalReturn / h.costBasis) * 100) : null;

      // Gains split by holding period, then taxed at the respective rate (gains only).
      const longTermGain = (price != null && h.longTermCostBasis != null)
        ? round2(price * h.longTermShares - h.longTermCostBasis) : null;
      const shortTermGain = (price != null && h.shortTermCostBasis != null)
        ? round2(price * h.shortTermShares - h.shortTermCostBasis) : null;
      const longTermTax = longTermGain != null ? round2(Math.max(0, longTermGain) * ltR) : null;
      const shortTermTax = shortTermGain != null ? round2(Math.max(0, shortTermGain) * stR) : null;
      const totalTaxIfSold = (longTermTax != null && shortTermTax != null)
        ? round2(longTermTax + shortTermTax) : null;

      return {
        ...h,
        name: info?.name ?? null,
        price, marketValue, totalReturn, totalReturnPct,
        longTermGain, longTermTax, totalTaxIfSold,
        daysToAllLongTerm: h.allLongTermDate ? this.daysUntil(h.allLongTermDate) : null,
      };
    });
  });

  private sumField(pick: (h: HoldingView) => number | null): number | null {
    const vals = this.holdings().map(pick).filter((v): v is number => v != null);
    return vals.length ? round2(vals.reduce((a, b) => a + b, 0)) : null;
  }

  totalMarketValue = computed(() => this.sumField(h => h.marketValue));
  totalReturns = computed(() => this.sumField(h => h.totalReturn));
  totalTaxNow = computed(() => this.sumField(h => h.totalTaxIfSold));

  /** Tax if every position were sold after all its shares are long-term (whole gain at the LT rate). */
  totalTaxIfAllLongTerm = computed(() => {
    const ltR = this.ltRate() / 100;
    const vals = this.holdings()
      .map(h => h.totalReturn != null ? round2(Math.max(0, h.totalReturn) * ltR) : null)
      .filter((v): v is number => v != null);
    return vals.length ? round2(vals.reduce((a, b) => a + b, 0)) : null;
  });

  /** Estimated tax saved by waiting until everything is long-term. */
  taxSavedByWaiting = computed(() => {
    const now = this.totalTaxNow();
    const later = this.totalTaxIfAllLongTerm();
    return (now != null && later != null) ? round2(Math.max(0, now - later)) : null;
  });

  /** Holdings sorted by the active column/direction (nulls always sort last). */
  sortedHoldings = computed<HoldingView[]>(() => {
    const key = this.sortKey();
    const dir = this.sortDir() === 'asc' ? 1 : -1;
    const value = (h: HoldingView): string | number | null => {
      switch (key) {
        case 'symbol': return h.symbol;
        // "All sellable at least tax": already-all-long-term sorts earliest (can sell now).
        case 'allLongTerm': return h.allLongTerm ? '0000-00-00' : (h.allLongTermDate ?? '9999-99-99');
        case 'totalShares': return h.totalShares;
        case 'avgCost': return h.avgCost;
        case 'price': return h.price;
        case 'totalReturn': return h.totalReturn;
        case 'totalTaxIfSold': return h.totalTaxIfSold;
        case 'longTermShares': return h.longTermShares;
        case 'longTermTax': return h.longTermTax;
      }
    };
    const isNull = (v: string | number | null) => v == null || (typeof v === 'number' && isNaN(v));
    return [...this.holdings()].sort((a, b) => {
      const va = value(a), vb = value(b);
      if (isNull(va) && isNull(vb)) return a.symbol.localeCompare(b.symbol);
      if (isNull(va)) return 1;   // nulls last regardless of direction
      if (isNull(vb)) return -1;
      if (typeof va === 'string' || typeof vb === 'string') {
        return String(va).localeCompare(String(vb)) * dir;
      }
      return ((va as number) - (vb as number)) * dir;
    });
  });

  toggleSort(key: SortKey): void {
    if (this.sortKey() === key) {
      this.sortDir.set(this.sortDir() === 'asc' ? 'desc' : 'asc');
    } else {
      this.sortKey.set(key);
      this.sortDir.set(key === 'symbol' ? 'asc' : 'desc'); // numbers default high-to-low
    }
  }

  sortIcon(key: SortKey): string {
    if (this.sortKey() !== key) return 'pi pi-sort-alt';
    return this.sortDir() === 'asc' ? 'pi pi-sort-amount-up-alt' : 'pi pi-sort-amount-down';
  }

  async ngOnInit(): Promise<void> {
    try {
      const saved = await this.store.load();
      if (saved?.transactions?.length) {
        this.state.set(saved);
        this.ltRate.set(saved.ltTaxRate);
        this.stRate.set(saved.stTaxRate);
        this.fetchPrices();
      }
    } catch (e: any) {
      this.error.set(e?.message ?? 'Failed to load saved holdings.');
    }
  }

  onRateChange(which: 'lt' | 'st', event: Event): void {
    const raw = Number((event.target as HTMLInputElement).value);
    const val = isFinite(raw) ? Math.min(60, Math.max(0, raw)) : 0;
    (which === 'lt' ? this.ltRate : this.stRate).set(val);
    // Persist rates on the saved row (best-effort; ignored if nothing saved yet).
    if (this.state()) {
      this.store.saveTaxRates(this.ltRate(), this.stRate()).catch(() => {});
    }
  }

  onDragOver(e: DragEvent): void { e.preventDefault(); this.dragOver.set(true); }

  onDrop(e: DragEvent): void {
    e.preventDefault();
    this.dragOver.set(false);
    const file = e.dataTransfer?.files?.[0];
    if (file) this.readFile(file);
  }

  onFileSelected(e: Event): void {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    if (file) this.readFile(file);
    input.value = ''; // allow re-selecting the same file
  }

  async clear(): Promise<void> {
    this.error.set(null);
    try {
      await this.store.clear();
      this.state.set(null);
      this.prices.set({});
      this.confirmingClear.set(false);
    } catch (e: any) {
      this.error.set(e?.message ?? 'Failed to clear holdings.');
    }
  }

  absVal(n: number): number { return Math.abs(n); }

  private readFile(file: File): void {
    this.error.set(null);
    this.confirmingClear.set(false);
    const reader = new FileReader();
    reader.onload = () => this.ingest(String(reader.result ?? ''), file.name);
    reader.onerror = () => this.error.set('Could not read that file.');
    reader.readAsText(file);
  }

  private async ingest(text: string, fileName: string): Promise<void> {
    const res = parseTransactionsCsv(text);
    if (res.error) { this.error.set(res.error); return; }
    if (res.parsedRows === 0) {
      this.error.set('No buy/sell stock transactions were found in that file.');
      return;
    }
    const upload: ProfitMaximizerUpload = {
      fileName,
      uploadedAt: new Date().toISOString(),
      broker: res.broker,
      transactions: res.transactions,
      ltTaxRate: this.ltRate(),
      stTaxRate: this.stRate(),
    };
    this.saving.set(true);
    try {
      await this.store.save(upload);
      this.state.set(upload);
      this.prices.set({});
      this.fetchPrices();
    } catch (e: any) {
      this.error.set(e?.message ?? 'Failed to save holdings.');
    } finally {
      this.saving.set(false);
    }
  }

  private fetchPrices(): void {
    const symbols = [...new Set(this.baseHoldings().map(h => h.symbol))];
    if (symbols.length === 0) return;
    this.loadingPrices.set(true);

    const chunks: string[][] = [];
    for (let i = 0; i < symbols.length; i += 10) chunks.push(symbols.slice(i, i + 10));

    let pending = chunks.length;
    for (const chunk of chunks) {
      this.http.get<{ stocks: Array<{ symbol: string; price?: number; name?: string }> }>(
        `/api/stocks?action=search&q=${chunk.join(',')}&market=US`
      ).subscribe({
        next: (res) => {
          const next = { ...this.prices() };
          for (const s of (res.stocks ?? [])) {
            next[s.symbol?.toUpperCase()] = { price: s.price ?? null, name: s.name ?? null };
          }
          this.prices.set(next);
        },
        error: () => {},
        complete: () => { if (--pending <= 0) this.loadingPrices.set(false); },
      });
    }
  }

  private daysUntil(isoDate: string): number {
    const ms = new Date(`${isoDate}T00:00:00`).getTime() - new Date(`${this.today}T00:00:00`).getTime();
    return Math.max(0, Math.round(ms / 86400000));
  }
}

function round2(n: number): number { return Math.round(n * 100) / 100; }
