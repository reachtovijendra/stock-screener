import {
  calculateFireProjection,
  calculateRequiredMonthlyContribution,
  estimateLiabilityBalance,
} from './fire-goals-calculations';
import { FireAsset, FireGoal, FireLiability } from '../models';

describe('fire goals calculations', () => {
  const goal: FireGoal = {
    name: 'Freedom Plan',
    current_age: 40,
    target_retirement_age: 50,
    fire_amount: 1_000_000,
    expected_annual_return: 6,
    inflation_rate: 0,
    annual_income: 150_000,
    tax_rate: 20,
    annual_spending: 80_000,
    preferred_currency: 'USD',
  };

  const assets: FireAsset[] = [
    { name: 'Brokerage', category: 'brokerage', current_value: 200_000, annual_growth_rate: null },
    { name: 'Cash', category: 'cash', current_value: 50_000, annual_growth_rate: 2 },
  ];

  const liabilities: FireLiability[] = [
    {
      name: 'Auto loan',
      category: 'auto',
      balance: 20_000,
      interest_rate: 5,
      monthly_payment: 600,
      payoff_months: null,
      payoff_date: null,
    },
  ];

  it('calculates a positive monthly contribution needed to hit the FIRE target', () => {
    const monthly = calculateRequiredMonthlyContribution({
      currentNetWorth: 250_000,
      targetAmount: 1_000_000,
      months: 120,
      annualReturnRate: 6,
    });

    expect(monthly).toBeGreaterThan(3_200);
    expect(monthly).toBeLessThan(3_500);
  });

  it('estimates liability balances after scheduled monthly payments', () => {
    const balance = estimateLiabilityBalance(liabilities[0], 24);

    expect(balance).toBeGreaterThan(6_000);
    expect(balance).toBeLessThan(8_000);
  });

  it('uses remaining months to model payoff timelines when no monthly payment is entered', () => {
    const balance = estimateLiabilityBalance({
      name: 'Car loan',
      category: 'auto',
      balance: 6_000,
      interest_rate: 2.5,
      monthly_payment: 0,
      payoff_months: 24,
      payoff_date: null,
    }, 12);

    expect(balance).toBe(3_000);
    expect(estimateLiabilityBalance({
      name: 'Car loan',
      category: 'auto',
      balance: 6_000,
      interest_rate: 2.5,
      monthly_payment: 0,
      payoff_months: 24,
      payoff_date: null,
    }, 24)).toBe(0);
  });

  it('builds a yearly projection with net worth, FIRE gap, and required contributions', () => {
    const projection = calculateFireProjection(goal, assets, liabilities);

    expect(projection.summary.totalAssets).toBe(250_000);
    expect(projection.summary.totalLiabilities).toBe(20_000);
    expect(projection.summary.netWorth).toBe(230_000);
    expect(projection.summary.monthsToRetirement).toBe(120);
    expect(projection.summary.requiredMonthlyContribution).toBeGreaterThan(3_400);
    expect(projection.timeline.length).toBe(11);
    expect(projection.timeline.at(-1)?.age).toBe(50);
  });
});
