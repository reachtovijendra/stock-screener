import { Injectable, inject, signal } from '@angular/core';
import { AuthService } from './auth.service';
import { FireAsset, FireGoal, FireLiability } from '../models';

export interface FireGoalData {
  goal: FireGoal | null;
  assets: FireAsset[];
  liabilities: FireLiability[];
}

interface SupabaseWriteResult {
  error: { message: string } | null;
}

@Injectable({ providedIn: 'root' })
export class FireGoalsService {
  private auth = inject(AuthService);

  private get db() { return this.auth.supabaseClient; }

  readonly goal = signal<FireGoal | null>(null);
  readonly assets = signal<FireAsset[]>([]);
  readonly liabilities = signal<FireLiability[]>([]);
  readonly loading = signal(false);

  async loadData(): Promise<void> {
    const user = this.auth.user();
    if (!user) {
      this.clearState();
      return;
    }

    this.loading.set(true);
    const { data: goals, error } = await this.db
      .from('fire_goals')
      .select('*')
      .eq('user_id', user.id)
      .order('updated_at', { ascending: false })
      .limit(1);

    if (error) {
      this.loading.set(false);
      throw new Error(`Failed to load FIRE goal: ${error.message}`);
    }

    const goal = goals?.[0] ?? null;
    this.goal.set(goal);

    if (!goal?.id) {
      this.assets.set([]);
      this.liabilities.set([]);
      this.loading.set(false);
      return;
    }

    const [assetsResult, liabilitiesResult] = await Promise.all([
      this.db.from('fire_assets').select('*').eq('goal_id', goal.id).eq('user_id', user.id).order('created_at'),
      this.db.from('fire_liabilities').select('*').eq('goal_id', goal.id).eq('user_id', user.id).order('created_at'),
    ]);

    this.throwIfError(assetsResult, 'Failed to load FIRE assets');
    this.throwIfError(liabilitiesResult, 'Failed to load FIRE liabilities');
    this.assets.set(assetsResult.data ?? []);
    this.liabilities.set(liabilitiesResult.data ?? []);
    this.loading.set(false);
  }

  async savePlan(goalInput: FireGoal, assets: FireAsset[], liabilities: FireLiability[]): Promise<void> {
    const user = this.auth.user();
    if (!user) throw new Error('User not authenticated');

    const now = new Date().toISOString();
    const existingGoal = this.goal();
    const goalPayload = {
      user_id: user.id,
      name: goalInput.name.trim() || 'My FIRE Plan',
      current_age: goalInput.current_age,
      target_retirement_age: goalInput.target_retirement_age,
      fire_amount: goalInput.fire_amount,
      expected_annual_return: goalInput.expected_annual_return,
      inflation_rate: goalInput.inflation_rate,
      annual_income: goalInput.annual_income,
      tax_rate: goalInput.tax_rate,
      annual_spending: goalInput.annual_spending,
      preferred_currency: goalInput.preferred_currency,
      updated_at: now,
    };

    const goalResult = existingGoal?.id
      ? await this.db.from('fire_goals').update(goalPayload).eq('id', existingGoal.id).select().single()
      : await this.db.from('fire_goals').insert(goalPayload).select().single();

    this.throwIfError(goalResult, 'Failed to save FIRE goal');
    const savedGoal = goalResult.data as FireGoal;
    if (!savedGoal?.id) throw new Error('FIRE goal save did not return an id');

    const [deleteAssets, deleteLiabilities] = await Promise.all([
      this.db.from('fire_assets').delete().eq('goal_id', savedGoal.id).eq('user_id', user.id),
      this.db.from('fire_liabilities').delete().eq('goal_id', savedGoal.id).eq('user_id', user.id),
    ]);
    this.throwIfError(deleteAssets, 'Failed to replace FIRE assets');
    this.throwIfError(deleteLiabilities, 'Failed to replace FIRE liabilities');

    const assetRows = assets
      .filter(asset => asset.name.trim() && asset.current_value >= 0)
      .map(asset => ({
        goal_id: savedGoal.id,
        user_id: user.id,
        name: asset.name.trim(),
        category: asset.category,
        current_value: asset.current_value,
        annual_growth_rate: asset.annual_growth_rate,
      }));
    const liabilityRows = liabilities
      .filter(liability => liability.name.trim() && liability.balance >= 0)
      .map(liability => ({
        goal_id: savedGoal.id,
        user_id: user.id,
        name: liability.name.trim(),
        category: liability.category,
        balance: liability.balance,
        interest_rate: liability.interest_rate,
        monthly_payment: liability.monthly_payment,
        payoff_months: liability.payoff_months,
        payoff_date: liability.payoff_date,
      }));

    if (assetRows.length > 0) {
      this.throwIfError(await this.db.from('fire_assets').insert(assetRows), 'Failed to save FIRE assets');
    }
    if (liabilityRows.length > 0) {
      this.throwIfError(await this.db.from('fire_liabilities').insert(liabilityRows), 'Failed to save FIRE liabilities');
    }

    await this.loadData();
  }

  private clearState(): void {
    this.goal.set(null);
    this.assets.set([]);
    this.liabilities.set([]);
    this.loading.set(false);
  }

  private throwIfError(result: SupabaseWriteResult, action: string): void {
    if (result.error) {
      throw new Error(`${action}: ${result.error.message}`);
    }
  }
}
