import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';

import { AuthService } from './auth.service';
import { FireGoalsService } from './fire-goals.service';
import { FireGoal } from '../models';

interface SupabaseError {
  message: string;
}

interface SupabaseResult<T> {
  data: T | null;
  error: SupabaseError | null;
}

type Payload = Record<string, unknown>;

describe('FireGoalsService', () => {
  it('retries FIRE goal saves without tax_rate when Supabase schema cache is stale', async () => {
    const user = signal({ id: 'user-1' });
    const goalPayloads: Payload[] = [];
    const assetPayloads: unknown[] = [];
    const savedGoalWithoutTaxRate = {
      id: 'goal-1',
      user_id: 'user-1',
      name: 'My FIRE Plan',
      current_age: 40,
      target_retirement_age: 55,
      fire_amount: 2_000_000,
      expected_annual_return: 7,
      inflation_rate: 3,
      annual_income: 250_000,
      annual_spending: 120_000,
      preferred_currency: 'USD',
    };
    let fireGoalInsertCount = 0;

    const fireGoalsTable = {
      insert: (payload: Payload) => {
        goalPayloads.push(payload);
        fireGoalInsertCount += 1;
        return {
          select: () => ({
            single: async (): Promise<SupabaseResult<FireGoal>> => fireGoalInsertCount === 1
              ? {
                  data: null,
                  error: { message: "Could not find the 'tax_rate' column of 'fire_goals' in the schema cache" },
                }
              : {
                  data: savedGoalWithoutTaxRate as FireGoal,
                  error: null,
                },
          }),
        };
      },
      update: (payload: Payload) => fireGoalsTable.insert(payload),
      select: () => ({
        eq: () => ({
          order: () => ({
            limit: async (): Promise<SupabaseResult<FireGoal[]>> => ({
              data: [savedGoalWithoutTaxRate as FireGoal],
              error: null,
            }),
          }),
        }),
      }),
    };

    const relatedTable = {
      select: () => ({
        eq: () => ({
          eq: () => ({
            order: async (): Promise<SupabaseResult<unknown[]>> => ({ data: [], error: null }),
          }),
        }),
      }),
      delete: () => ({
        eq: () => ({
          eq: async (): Promise<SupabaseResult<null>> => ({ data: null, error: null }),
        }),
      }),
      insert: async (payload: unknown): Promise<SupabaseResult<null>> => {
        assetPayloads.push(payload);
        return { data: null, error: null };
      },
    };

    const supabaseClient = {
      from: (table: string) => table === 'fire_goals' ? fireGoalsTable : relatedTable,
    };

    await TestBed.configureTestingModule({
      providers: [
        FireGoalsService,
        {
          provide: AuthService,
          useValue: {
            user: user.asReadonly(),
            supabaseClient,
          },
        },
      ],
    }).compileComponents();

    const service = TestBed.inject(FireGoalsService);

    await service.savePlan({
      name: 'My FIRE Plan',
      current_age: 40,
      target_retirement_age: 55,
      fire_amount: 2_000_000,
      expected_annual_return: 7,
      inflation_rate: 3,
      annual_income: 250_000,
      tax_rate: 18,
      annual_spending: 120_000,
      preferred_currency: 'USD',
    }, [
      { name: 'Brokerage', category: 'brokerage', current_value: 50_000, annual_growth_rate: null },
    ], []);

    expect(goalPayloads.length).toBe(2);
    expect(goalPayloads[0]['tax_rate']).toBe(18);
    expect(Object.prototype.hasOwnProperty.call(goalPayloads[1], 'tax_rate')).toBeFalse();
    expect(assetPayloads.length).toBe(1);
    expect(service.goal()?.tax_rate).toBe(18);
  });
});
