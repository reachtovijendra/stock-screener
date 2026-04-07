import { Injectable, inject, signal } from '@angular/core';
import { AuthService } from './auth.service';
import { PortfolioTargetEntry, PortfolioActualEntry } from '../models';

@Injectable({ providedIn: 'root' })
export class PortfolioTrackerService {
  private auth = inject(AuthService);

  private get db() { return this.auth.supabaseClient; }

  readonly targets = signal<PortfolioTargetEntry[]>([]);
  readonly actuals = signal<PortfolioActualEntry[]>([]);
  readonly loading = signal(false);

  async loadData(): Promise<void> {
    this.loading.set(true);
    const [targetsResult, actualsResult] = await Promise.all([
      this.db.from('portfolio_targets').select('*').order('year').order('month'),
      this.db.from('portfolio_actuals').select('*').order('year').order('month'),
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

  async setTargets(entries: PortfolioTargetEntry[]): Promise<void> {
    const user = this.auth.user();
    if (!user) throw new Error('User not authenticated');

    // Delete existing targets
    await this.db.from('portfolio_targets').delete().eq('user_id', user.id);

    // Insert new targets in batches of 100
    const rows = entries.map(e => ({
      user_id: user.id,
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
      await this.db.from('portfolio_targets').insert(rows.slice(i, i + 100));
    }

    // Reload
    const { data } = await this.db.from('portfolio_targets').select('*').order('year').order('month');
    if (data) this.targets.set(data);
  }

  async addActual(entry: PortfolioActualEntry): Promise<void> {
    const user = this.auth.user();
    if (!user) throw new Error('User not authenticated');

    const { data } = await this.db.from('portfolio_actuals').insert({
      user_id: user.id,
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

    if (data) {
      this.actuals.update(prev => [...prev, data].sort((a, b) => a.year - b.year || a.month - b.month));
    }
  }

  async updateActual(entry: PortfolioActualEntry): Promise<void> {
    if (!entry.id) throw new Error('Entry ID is required');

    await this.db.from('portfolio_actuals').update({
      investment: entry.investment,
      added: entry.added,
      principal: entry.principal,
      total_investment: entry.total_investment,
      return_percent: entry.return_percent,
      profit: entry.profit,
      total: entry.total,
    }).eq('id', entry.id);

    this.actuals.update(prev =>
      prev.map(a => a.id === entry.id ? { ...a, ...entry } : a)
    );
  }

  async deleteActual(id: string): Promise<void> {
    await this.db.from('portfolio_actuals').delete().eq('id', id);
    this.actuals.update(prev => prev.filter(a => a.id !== id));
  }

  async clearAllData(): Promise<void> {
    const user = this.auth.user();
    if (!user) throw new Error('User not authenticated');

    await Promise.all([
      this.db.from('portfolio_targets').delete().eq('user_id', user.id),
      this.db.from('portfolio_actuals').delete().eq('user_id', user.id),
    ]);

    this.targets.set([]);
    this.actuals.set([]);
  }
}
