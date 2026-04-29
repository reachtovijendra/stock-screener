import { Injectable, inject, signal } from '@angular/core';
import { AuthService } from './auth.service';
import { MarketService } from './market.service';
import { PortfolioTargetEntry, PortfolioActualEntry } from '../models';

interface SupabaseWriteResult {
  error: { message: string } | null;
}

@Injectable({ providedIn: 'root' })
export class PortfolioTrackerService {
  private auth = inject(AuthService);
  private marketService = inject(MarketService);

  private get db() { return this.auth.supabaseClient; }

  readonly targets = signal<PortfolioTargetEntry[]>([]);
  readonly actuals = signal<PortfolioActualEntry[]>([]);
  readonly loading = signal(false);

  async loadData(): Promise<void> {
    const user = this.auth.user();
    if (!user) {
      this.targets.set([]);
      this.actuals.set([]);
      return;
    }

    const market = this.marketService.currentMarket();
    this.loading.set(true);
    this.targets.set([]);
    this.actuals.set([]);
    const [targetsResult, actualsResult] = await Promise.all([
      this.db.from('portfolio_targets').select('*').eq('user_id', user.id).eq('market', market).order('year').order('month'),
      this.db.from('portfolio_actuals').select('*').eq('user_id', user.id).eq('market', market).order('year').order('month'),
    ]);

    if (!targetsResult.error && targetsResult.data) {
      this.targets.set(targetsResult.data);
    }
    if (!actualsResult.error && actualsResult.data) {
      this.actuals.set(actualsResult.data);
    }
    this.loading.set(false);
  }

  getTargets(): PortfolioTargetEntry[] {
    return this.targets();
  }

  getActuals(): PortfolioActualEntry[] {
    return this.actuals();
  }

  private throwIfError(result: SupabaseWriteResult, action: string): void {
    if (result.error) {
      throw new Error(`${action}: ${result.error.message}`);
    }
  }

  async setTargets(entries: PortfolioTargetEntry[]): Promise<void> {
    const user = this.auth.user();
    if (!user) throw new Error('User not authenticated');
    const market = this.marketService.currentMarket();

    // Delete existing targets for the selected market only.
    const deleteResult = await this.db.from('portfolio_targets').delete().eq('user_id', user.id).eq('market', market);
    this.throwIfError(deleteResult, 'Failed to clear portfolio targets');

    // Insert new targets in batches of 100
    const rows = entries.map(e => ({
      user_id: user.id,
      market,
      year: e.year,
      month: e.month,
      investment: e.investment,
      added: e.added,
      principal: e.principal,
      total_investment: e.total_investment,
      return_percent: e.return_percent,
      profit: e.profit,
      total: e.total,
    }));

    for (let i = 0; i < rows.length; i += 100) {
      const insertResult = await this.db.from('portfolio_targets').insert(rows.slice(i, i + 100));
      this.throwIfError(insertResult, 'Failed to save portfolio targets');
    }

    // Reload
    const { data } = await this.db.from('portfolio_targets').select('*').eq('user_id', user.id).eq('market', market).order('year').order('month');
    if (data) this.targets.set(data);
  }

  async addActual(entry: PortfolioActualEntry): Promise<void> {
    const user = this.auth.user();
    if (!user) throw new Error('User not authenticated');
    const market = this.marketService.currentMarket();

    const { data, error } = await this.db.from('portfolio_actuals').insert({
      user_id: user.id,
      market,
      year: entry.year,
      month: entry.month,
      investment: entry.investment,
      added: entry.added,
      principal: entry.principal,
      total_investment: entry.total_investment,
      return_percent: entry.return_percent,
      profit: entry.profit,
      total: entry.total,
    }).select().single();
    this.throwIfError({ error }, 'Failed to save portfolio actual');

    if (data) {
      this.actuals.update(prev => [...prev, data].sort((a, b) => a.year - b.year || a.month - b.month));
    }
  }

  async updateActual(entry: PortfolioActualEntry): Promise<void> {
    if (!entry.id) throw new Error('Entry ID is required');

    const updateResult = await this.db.from('portfolio_actuals').update({
      investment: entry.investment,
      added: entry.added,
      principal: entry.principal,
      total_investment: entry.total_investment,
      return_percent: entry.return_percent,
      profit: entry.profit,
      total: entry.total,
    }).eq('id', entry.id);
    this.throwIfError(updateResult, 'Failed to update portfolio actual');

    this.actuals.update(prev =>
      prev.map(a => a.id === entry.id ? { ...a, ...entry } : a)
    );
  }

  async deleteActual(id: string): Promise<void> {
    const deleteResult = await this.db.from('portfolio_actuals').delete().eq('id', id);
    this.throwIfError(deleteResult, 'Failed to delete portfolio actual');
    this.actuals.update(prev => prev.filter(a => a.id !== id));
  }

  async clearAllData(): Promise<void> {
    const user = this.auth.user();
    if (!user) throw new Error('User not authenticated');
    const market = this.marketService.currentMarket();

    const [targetsResult, actualsResult] = await Promise.all([
      this.db.from('portfolio_targets').delete().eq('user_id', user.id).eq('market', market),
      this.db.from('portfolio_actuals').delete().eq('user_id', user.id).eq('market', market),
    ]);
    this.throwIfError(targetsResult, 'Failed to clear portfolio targets');
    this.throwIfError(actualsResult, 'Failed to clear portfolio actuals');

    this.targets.set([]);
    this.actuals.set([]);
  }
}
