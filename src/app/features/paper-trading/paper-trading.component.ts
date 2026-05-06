import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { InputNumberModule } from 'primeng/inputnumber';
import { ProgressSpinnerModule } from 'primeng/progressspinner';
import { ToastModule } from 'primeng/toast';
import { MessageService } from 'primeng/api';
import { finalize } from 'rxjs';

import { PaperOrder, StockSearchResult } from '../../core/models';
import { MarketService, PaperTradingService, StockService } from '../../core/services';
import { AuthService } from '../../core/services/auth.service';
import { getManualStartingCash } from '../../core/utils/paper-trading-calculations';

@Component({
  selector: 'app-paper-trading',
  imports: [
    CommonModule,
    ReactiveFormsModule,
    RouterLink,
    ButtonModule,
    InputNumberModule,
    ProgressSpinnerModule,
    ToastModule,
  ],
  providers: [MessageService],
  templateUrl: './paper-trading.component.html',
  styleUrls: ['./paper-trading.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PaperTradingComponent {
  private readonly fb = inject(FormBuilder);
  private readonly stockService = inject(StockService);
  private readonly messageService = inject(MessageService);
  readonly paperService = inject(PaperTradingService);
  readonly marketService = inject(MarketService);
  readonly authService = inject(AuthService);

  readonly stockSuggestions = signal<StockSearchResult[]>([]);
  readonly latestPrices = signal<Record<string, number | null>>({});
  readonly latestQuoteTimes = signal<Record<string, string | null>>({});
  readonly quoteLoading = signal(false);
  readonly positionQuotesLoading = signal(false);
  readonly orderSubmitting = signal(false);

  readonly orderForm = this.fb.nonNullable.group({
    action: this.fb.nonNullable.control<'BUY' | 'SELL'>('BUY', Validators.required),
    symbol: this.fb.nonNullable.control('', Validators.required),
    name: this.fb.control<string | null>(null),
    quantity: this.fb.nonNullable.control(1, [Validators.required, Validators.min(0.000001)]),
    execution_price: this.fb.nonNullable.control(0, [Validators.required, Validators.min(0.01)]),
  });

  readonly startingCash = computed(() => getManualStartingCash(this.marketService.currentMarket()));
  readonly summary = computed(() => this.paperService.getSummary(this.latestPrices()));
  readonly currencySymbol = computed(() => this.marketService.marketInfo().currencySymbol);
  readonly locale = computed(() => this.marketService.currentMarket() === 'IN' ? 'en-IN' : 'en-US');

  canRefreshQuote(): boolean {
    return this.orderForm.controls.symbol.value.trim().length > 0 && !this.quoteLoading();
  }

  canPlaceOrder(): boolean {
    return this.orderBlockReason() == null;
  }

  orderBlockReason(): string | null {
    const value = this.orderForm.getRawValue();
    if (this.orderSubmitting()) return 'Submitting this paper order...';
    if (this.quoteLoading()) return 'Waiting for the live quote to finish loading.';
    if (!value.symbol.trim()) return 'Enter a stock symbol.';
    if (!value.quantity || value.quantity <= 0) return 'Enter a quantity above 0.';
    if (!value.execution_price || value.execution_price <= 0) return 'Use Live Quote or enter an execution price above 0.';
    if (this.orderForm.invalid) return 'Complete the order ticket before placing the trade.';
    return null;
  }

  constructor() {
    effect(() => {
      const _market = this.marketService.currentMarket();
      const _user = this.authService.user();
      this.latestPrices.set({});
      this.latestQuoteTimes.set({});
      this.paperService.loadData().then(() => this.refreshLivePrices());
    });
  }

  async enableAccount(): Promise<void> {
    try {
      await this.paperService.enableAccount();
      this.messageService.add({ severity: 'success', summary: 'Paper trading enabled', detail: 'Your manual paper account is ready.' });
    } catch (error) {
      this.showError(error);
    }
  }

  async resetAccount(): Promise<void> {
    if (!window.confirm('Reset this market paper account? This clears positions and trade history.')) return;

    try {
      await this.paperService.resetAccount();
      this.latestPrices.set({});
      this.latestQuoteTimes.set({});
      this.messageService.add({ severity: 'success', summary: 'Paper account reset', detail: 'Cash, positions, and trades were reset.' });
    } catch (error) {
      this.showError(error);
    }
  }

  searchStocks(event: Event): void {
    const query = (event.target as HTMLInputElement).value.trim();
    const previousSymbol = this.orderForm.controls.symbol.value.trim().toUpperCase();
    this.orderForm.controls.symbol.setValue(query.toUpperCase());
    if (query.toUpperCase() !== previousSymbol) {
      this.orderForm.patchValue({ name: null, execution_price: 0 });
    }
    if (query.length < 1) {
      this.stockSuggestions.set([]);
      return;
    }

    this.stockService.searchStocks(query, this.marketService.currentMarket()).subscribe(results => {
      this.stockSuggestions.set(results.slice(0, 8));
    });
  }

  selectStock(stock: StockSearchResult): void {
    this.stockSuggestions.set([]);
    this.orderForm.patchValue({
      symbol: stock.symbol,
      name: stock.name,
    });
    this.loadQuote(stock.symbol);
  }

  refreshQuote(): void {
    const symbol = this.orderForm.controls.symbol.value.trim().toUpperCase();
    if (!symbol) return;
    const selectedName = this.orderForm.controls.name.value;
    const firstSuggestion = this.stockSuggestions()[0];
    if (!selectedName && !firstSuggestion) {
      this.stockService.searchStocks(symbol, this.marketService.currentMarket()).subscribe(results => {
        const firstResult = results[0];
        if (firstResult) {
          this.selectStock(firstResult);
        } else {
          this.orderForm.patchValue({ name: null, execution_price: 0 });
        }
      });
      return;
    }

    const symbolToQuote = selectedName ? symbol : firstSuggestion.symbol;
    this.orderForm.controls.symbol.setValue(symbolToQuote);
    this.orderForm.patchValue({ name: null, execution_price: 0 });
    this.loadQuote(symbolToQuote);
  }

  async submitOrder(): Promise<void> {
    if (this.orderForm.invalid) {
      this.orderForm.markAllAsTouched();
      return;
    }

    const value = this.orderForm.getRawValue();
    const existingPosition = this.getPositionForSymbol(value.symbol);
    const order: PaperOrder = {
      action: value.action,
      symbol: value.symbol.trim().toUpperCase(),
      name: value.name ?? existingPosition?.name ?? null,
      quantity: value.quantity,
      execution_price: value.execution_price,
    };

    this.orderSubmitting.set(true);
    try {
      await this.paperService.placeOrder(order);
      await this.refreshLivePrices();
      this.orderForm.patchValue({ quantity: 1 });
      this.messageService.add({ severity: 'success', summary: `${order.action} order filled`, detail: `${order.quantity} ${order.symbol} at ${this.formatCurrency(order.execution_price)}` });
    } catch (error) {
      this.showError(error);
    } finally {
      this.orderSubmitting.set(false);
    }
  }

  getPositionCurrentPrice(symbol: string): number | null {
    return this.latestPrices()[symbol] ?? null;
  }

  getPositionQuoteTime(symbol: string): string | null {
    const timestamp = this.latestQuoteTimes()[symbol];
    if (!timestamp) return null;

    return new Date(timestamp).toLocaleTimeString([], {
      hour: 'numeric',
      minute: '2-digit',
    });
  }

  getPositionMarketValue(symbol: string, quantity: number): number {
    const price = this.getPositionCurrentPrice(symbol);
    if (price == null) return 0;
    return price * quantity;
  }

  getPositionPnl(symbol: string, quantity: number, averageCost: number): number {
    const price = this.getPositionCurrentPrice(symbol);
    if (price == null) return 0;
    return (price - averageCost) * quantity;
  }

  private getPositionForSymbol(symbol: string) {
    const normalizedSymbol = symbol.trim().toUpperCase();
    return this.paperService.positions().find(position => position.symbol.toUpperCase() === normalizedSymbol) ?? null;
  }

  formatCurrency(value: number | null | undefined): string {
    return new Intl.NumberFormat(this.locale(), {
      style: 'currency',
      currency: this.marketService.currentMarket() === 'IN' ? 'INR' : 'USD',
      maximumFractionDigits: 2,
    }).format(value ?? 0);
  }

  formatPercent(value: number | null | undefined): string {
    const safeValue = value ?? 0;
    return `${safeValue >= 0 ? '+' : ''}${safeValue.toFixed(2)}%`;
  }

  private loadQuote(symbol: string): void {
    this.quoteLoading.set(true);
    this.stockService.getQuote(symbol, this.marketService.currentMarket())
      .pipe(finalize(() => this.quoteLoading.set(false)))
      .subscribe({
        next: stock => {
          this.orderForm.patchValue({
            symbol: stock.symbol,
            name: stock.name,
            execution_price: stock.price,
          });
          this.latestPrices.update(prices => ({ ...prices, [stock.symbol]: stock.price }));
          this.latestQuoteTimes.update(times => ({ ...times, [stock.symbol]: normalizeQuoteTimestamp(stock.lastUpdated) }));
        },
        error: error => this.showError(error),
      });
  }

  async refreshLivePrices(): Promise<void> {
    const positions = this.paperService.positions();
    if (positions.length === 0) return;

    const symbols = positions.map(position => position.symbol).filter(Boolean);
    if (symbols.length === 0) return;

    this.positionQuotesLoading.set(true);
    this.stockService.getQuotes(symbols, this.marketService.currentMarket(), { forceRefresh: true })
      .pipe(finalize(() => this.positionQuotesLoading.set(false)))
      .subscribe({
      next: stocks => {
        const prices = stocks.reduce<Record<string, number | null>>((acc, stock) => {
          acc[stock.symbol] = stock.price;
          return acc;
        }, {});
        const quoteTimes = stocks.reduce<Record<string, string | null>>((acc, stock) => {
          acc[stock.symbol] = normalizeQuoteTimestamp(stock.lastUpdated);
          return acc;
        }, {});
        this.latestPrices.set(prices);
        this.latestQuoteTimes.set(quoteTimes);
      },
      error: () => {
        this.latestPrices.set({});
        this.latestQuoteTimes.set({});
      },
    });
  }

  private showError(error: unknown): void {
    const detail = error instanceof Error ? error.message : 'Unable to complete paper trading action.';
    this.messageService.add({ severity: 'error', summary: 'Paper trading error', detail });
  }
}

function normalizeQuoteTimestamp(value: Date | string | null | undefined): string {
  if (!value) return new Date().toISOString();
  if (value instanceof Date) return value.toISOString();
  return value;
}
