import { Injectable, computed, inject, signal } from '@angular/core';

import { PaperAccount, PaperOrder, PaperPosition, PaperTrade, PaperTradingSummary } from '../models';
import { applyPaperOrder, getManualStartingCash } from '../utils/paper-trading-calculations';
import { AuthService } from './auth.service';
import { MarketService } from './market.service';

interface SupabaseWriteResult {
  error: { message: string } | null;
}

@Injectable({ providedIn: 'root' })
export class PaperTradingService {
  private readonly auth = inject(AuthService);
  private readonly marketService = inject(MarketService);

  private get db() { return this.auth.supabaseClient; }

  readonly account = signal<PaperAccount | null>(null);
  readonly positions = signal<PaperPosition[]>([]);
  readonly trades = signal<PaperTrade[]>([]);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);

  readonly enabled = computed(() => this.account()?.enabled === true);

  async loadData(): Promise<void> {
    const user = this.auth.user();
    if (!user) {
      this.clearState();
      return;
    }

    const market = this.marketService.currentMarket();
    this.loading.set(true);
    this.error.set(null);

    const [accountResult, positionsResult, tradesResult] = await Promise.all([
      this.db
        .from('paper_accounts')
        .select('*')
        .eq('user_id', user.id)
        .eq('market', market)
        .maybeSingle(),
      this.db
        .from('paper_positions')
        .select('*')
        .eq('user_id', user.id)
        .eq('market', market)
        .order('symbol'),
      this.db
        .from('paper_trades')
        .select('*')
        .eq('user_id', user.id)
        .eq('market', market)
        .order('executed_at', { ascending: false }),
    ]);

    if (accountResult.error) this.error.set(accountResult.error.message);
    this.account.set(accountResult.data ?? null);
    this.positions.set(positionsResult.error ? [] : positionsResult.data ?? []);
    this.trades.set(tradesResult.error ? [] : tradesResult.data ?? []);
    this.loading.set(false);
  }

  async enableAccount(): Promise<void> {
    const user = this.auth.user();
    if (!user) throw new Error('User not authenticated');

    const market = this.marketService.currentMarket();
    const startingCash = getManualStartingCash(market);
    const { data, error } = await this.db
      .from('paper_accounts')
      .upsert({
        user_id: user.id,
        market,
        starting_cash: startingCash,
        cash_balance: startingCash,
        enabled: true,
      }, { onConflict: 'user_id,market' })
      .select()
      .single();

    this.throwIfError({ error }, 'Failed to enable paper trading account');
    this.account.set(data);
    this.positions.set([]);
    this.trades.set([]);
  }

  async placeOrder(order: PaperOrder): Promise<void> {
    const user = this.auth.user();
    const account = this.account();
    if (!user) throw new Error('User not authenticated');
    if (!account) throw new Error('Paper trading account is not enabled');

    const existingPosition = this.positions().find(position => position.symbol === order.symbol.toUpperCase()) ?? null;
    const applied = applyPaperOrder({ account, position: existingPosition, order });

    const accountResult = await this.db
      .from('paper_accounts')
      .update({ cash_balance: applied.account.cash_balance, updated_at: new Date().toISOString() })
      .eq('id', account.id)
      .select()
      .single();
    this.throwIfError(accountResult, 'Failed to update paper trading account');

    const savedPosition = await this.savePosition(user.id, applied.position, existingPosition);
    const tradeResult = await this.db
      .from('paper_trades')
      .insert({
        user_id: user.id,
        market: account.market,
        symbol: applied.trade.symbol,
        name: applied.trade.name,
        action: applied.trade.action,
        quantity: applied.trade.quantity,
        execution_price: applied.trade.execution_price,
        realized_pnl: applied.trade.realized_pnl,
        realized_pnl_percent: applied.trade.realized_pnl_percent,
        executed_at: applied.trade.executed_at,
      })
      .select()
      .single();
    this.throwIfError(tradeResult, 'Failed to save paper trade');

    this.account.set(accountResult.data);
    this.positions.update(current => {
      const withoutExisting = current.filter(position => position.symbol !== order.symbol.toUpperCase());
      return savedPosition ? [...withoutExisting, savedPosition].sort((a, b) => a.symbol.localeCompare(b.symbol)) : withoutExisting;
    });
    this.trades.update(current => [tradeResult.data, ...current]);
  }

  async resetAccount(): Promise<void> {
    const user = this.auth.user();
    const account = this.account();
    if (!user || !account) return;

    const market = this.marketService.currentMarket();
    const startingCash = getManualStartingCash(market);
    const [deleteTrades, deletePositions, updateAccount] = await Promise.all([
      this.db.from('paper_trades').delete().eq('user_id', user.id).eq('market', market),
      this.db.from('paper_positions').delete().eq('user_id', user.id).eq('market', market),
      this.db
        .from('paper_accounts')
        .update({ starting_cash: startingCash, cash_balance: startingCash, enabled: true, updated_at: new Date().toISOString() })
        .eq('id', account.id)
        .select()
        .single(),
    ]);

    this.throwIfError(deleteTrades, 'Failed to clear paper trades');
    this.throwIfError(deletePositions, 'Failed to clear paper positions');
    this.throwIfError(updateAccount, 'Failed to reset paper account');

    this.account.set(updateAccount.data);
    this.positions.set([]);
    this.trades.set([]);
  }

  getSummary(currentPrices: Record<string, number | null>): PaperTradingSummary {
    const account = this.account();
    const positions = this.positions();
    const trades = this.trades();
    const cashBalance = account?.cash_balance ?? 0;
    const startingCash = account?.starting_cash ?? 0;
    const marketValue = roundMoney(positions.reduce((total, position) => {
      const currentPrice = currentPrices[position.symbol] ?? position.currentPrice ?? position.average_cost;
      return total + position.quantity * currentPrice;
    }, 0));
    const realizedPnl = roundMoney(trades.reduce((total, trade) => total + (trade.realized_pnl ?? 0), 0));
    const unrealizedPnl = roundMoney(positions.reduce((total, position) => {
      const currentPrice = currentPrices[position.symbol] ?? position.currentPrice ?? position.average_cost;
      return total + (currentPrice - position.average_cost) * position.quantity;
    }, 0));
    const totalEquity = roundMoney(cashBalance + marketValue);

    return {
      cashBalance,
      marketValue,
      totalEquity,
      realizedPnl,
      unrealizedPnl,
      totalPnl: roundMoney(totalEquity - startingCash),
      totalReturnPercent: startingCash > 0 ? roundMoney(((totalEquity - startingCash) / startingCash) * 100) : 0,
    };
  }

  private async savePosition(
    userId: string,
    position: PaperPosition | null,
    existingPosition: PaperPosition | null
  ): Promise<PaperPosition | null> {
    if (!position && existingPosition?.id) {
      const deleteResult = await this.db.from('paper_positions').delete().eq('id', existingPosition.id);
      this.throwIfError(deleteResult, 'Failed to remove closed paper position');
      return null;
    }

    if (!position) return null;

    if (existingPosition?.id) {
      const updateResult = await this.db
        .from('paper_positions')
        .update({
          name: position.name,
          quantity: position.quantity,
          average_cost: position.average_cost,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existingPosition.id)
        .select()
        .single();
      this.throwIfError(updateResult, 'Failed to update paper position');
      return updateResult.data;
    }

    const insertResult = await this.db
      .from('paper_positions')
      .insert({
        user_id: userId,
        market: position.market,
        symbol: position.symbol,
        name: position.name,
        quantity: position.quantity,
        average_cost: position.average_cost,
      })
      .select()
      .single();
    this.throwIfError(insertResult, 'Failed to save paper position');
    return insertResult.data;
  }

  private throwIfError(result: SupabaseWriteResult, action: string): void {
    if (result.error) {
      throw new Error(`${action}: ${result.error.message}`);
    }
  }

  private clearState(): void {
    this.account.set(null);
    this.positions.set([]);
    this.trades.set([]);
    this.loading.set(false);
    this.error.set(null);
  }
}

function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
