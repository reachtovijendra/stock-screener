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

interface SupabaseGoalResult extends SupabaseWriteResult {
  data: FireGoal | null;
}

interface FireGoalWritePayload {
  user_id: string;
  name: string;
  current_age: number;
  target_retirement_age: number;
  fire_amount: number;
  expected_annual_return: number;
  inflation_rate: number;
  annual_income: number;
  tax_rate?: number;
  annual_spending: number;
  preferred_currency: string;
  updated_at: string;
}

const DEFAULT_TAX_RATE = 20;

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

    const goal = this.normalizeGoal(goals?.[0] ?? null);
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
    const goalPayload = this.buildGoalPayload(user.id, goalInput, now, true);
    let goalResult = await this.saveGoalPayload(existingGoal?.id, goalPayload);
    const usedLegacySchemaFallback = this.isMissingSchemaColumnError(goalResult.error, 'tax_rate');

    if (usedLegacySchemaFallback) {
      goalResult = await this.saveGoalPayload(existingGoal?.id, this.buildGoalPayload(user.id, goalInput, now, false));
    }

    this.throwIfError(goalResult, 'Failed to save FIRE goal');
    const savedGoal = this.normalizeGoal(goalResult.data, goalInput.tax_rate);
    if (!savedGoal?.id) throw new Error('FIRE goal save did not return an id');

    const [deleteAssets, deleteLiabilities] = await Promise.all([
      this.db.from('fire_assets').delete().eq('goal_id', savedGoal.id).eq('user_id', user.id),
      this.db.from('fire_liabilities').delete().eq('goal_id', savedGoal.id).eq('user_id', user.id),
    ]);
    this.throwIfError(deleteAssets, 'Failed to replace FIRE assets');
    this.throwIfError(deleteLiabilities, 'Failed to replace FIRE liabilities');

    const savedAssets: FireAsset[] = assets
      .filter(asset => asset.name.trim() && asset.current_value >= 0)
      .map(asset => ({
        goal_id: savedGoal.id,
        user_id: user.id,
        name: asset.name.trim(),
        category: asset.category,
        current_value: asset.current_value,
        annual_growth_rate: asset.annual_growth_rate,
      }));
    const savedLiabilities: FireLiability[] = liabilities
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

    if (savedAssets.length > 0) {
      this.throwIfError(await this.db.from('fire_assets').insert(savedAssets), 'Failed to save FIRE assets');
    }
    if (savedLiabilities.length > 0) {
      this.throwIfError(await this.db.from('fire_liabilities').insert(savedLiabilities), 'Failed to save FIRE liabilities');
    }

    this.goal.set(usedLegacySchemaFallback ? { ...savedGoal, tax_rate: goalInput.tax_rate } : savedGoal);
    this.assets.set(savedAssets);
    this.liabilities.set(savedLiabilities);
  }

  private buildGoalPayload(userId: string, goalInput: FireGoal, updatedAt: string, includeTaxRate: boolean): FireGoalWritePayload {
    const payload: FireGoalWritePayload = {
      user_id: userId,
      name: goalInput.name.trim() || 'My FIRE Plan',
      current_age: goalInput.current_age,
      target_retirement_age: goalInput.target_retirement_age,
      fire_amount: goalInput.fire_amount,
      expected_annual_return: goalInput.expected_annual_return,
      inflation_rate: goalInput.inflation_rate,
      annual_income: goalInput.annual_income,
      annual_spending: goalInput.annual_spending,
      preferred_currency: goalInput.preferred_currency,
      updated_at: updatedAt,
    };

    if (includeTaxRate) {
      payload.tax_rate = goalInput.tax_rate;
    }

    return payload;
  }

  private async saveGoalPayload(goalId: string | undefined, goalPayload: FireGoalWritePayload): Promise<SupabaseGoalResult> {
    return goalId
      ? await this.db.from('fire_goals').update(goalPayload).eq('id', goalId).select().single()
      : await this.db.from('fire_goals').insert(goalPayload).select().single();
  }

  private normalizeGoal(goal: FireGoal | null, taxRateFallback = DEFAULT_TAX_RATE): FireGoal | null {
    if (!goal) return null;
    return {
      ...goal,
      tax_rate: typeof goal.tax_rate === 'number' ? goal.tax_rate : taxRateFallback,
    };
  }

  private isMissingSchemaColumnError(error: { message: string } | null, column: string): boolean {
    const message = error?.message.toLowerCase() ?? '';
    return message.includes(column.toLowerCase()) && message.includes('schema cache');
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
