import {
  FireAsset,
  FireGoal,
  FireLiability,
  FirePlanProjection,
  FireProjectionYear,
} from '../models';

export interface RequiredContributionInput {
  currentNetWorth: number;
  targetAmount: number;
  months: number;
  annualReturnRate: number;
}

export function calculateRequiredMonthlyContribution(input: RequiredContributionInput): number {
  const months = Math.max(0, input.months);
  const currentNetWorth = Math.max(0, input.currentNetWorth);
  const targetAmount = Math.max(0, input.targetAmount);
  if (months === 0) return Math.max(0, targetAmount - currentNetWorth);

  const monthlyRate = input.annualReturnRate / 100 / 12;
  const futureValueOfCurrent = currentNetWorth * Math.pow(1 + monthlyRate, months);
  const gap = targetAmount - futureValueOfCurrent;
  if (gap <= 0) return 0;

  if (monthlyRate === 0) return gap / months;
  return gap * monthlyRate / (Math.pow(1 + monthlyRate, months) - 1);
}

export function estimateLiabilityBalance(liability: FireLiability, monthsElapsed: number): number {
  let balance = Math.max(0, liability.balance);
  const monthlyPayment = Math.max(0, liability.monthly_payment);
  const monthlyRate = liability.interest_rate / 100 / 12;
  const months = Math.max(0, Math.floor(monthsElapsed));
  const payoffMonths = getPayoffMonths(liability);

  if (payoffMonths !== null && months >= payoffMonths) return 0;

  if (payoffMonths !== null && monthlyPayment === 0) {
    return Math.max(0, balance * (1 - months / payoffMonths));
  }

  for (let month = 0; month < months && balance > 0; month += 1) {
    balance = balance * (1 + monthlyRate) - monthlyPayment;
  }

  return Math.max(0, balance);
}

function getPayoffMonths(liability: FireLiability): number | null {
  if (liability.payoff_months !== null && liability.payoff_months > 0) {
    return liability.payoff_months;
  }

  if (!liability.payoff_date) return null;
  const payoffDate = new Date(liability.payoff_date);
  if (Number.isNaN(payoffDate.getTime())) return null;

  const today = new Date();
  const months = (payoffDate.getFullYear() - today.getFullYear()) * 12 + payoffDate.getMonth() - today.getMonth();
  return months > 0 ? months : null;
}

export function calculateFireProjection(goal: FireGoal, assets: FireAsset[], liabilities: FireLiability[]): FirePlanProjection {
  const includedAssets = assets.filter(asset => !asset.exclude_from_plan);
  const totalAssets = sum(includedAssets.map(asset => asset.current_value));
  const totalLiabilities = sum(liabilities.map(liability => liability.balance));
  const netWorth = totalAssets - totalLiabilities;
  const yearsToRetirement = Math.max(0, goal.target_retirement_age - goal.current_age);
  const monthsToRetirement = yearsToRetirement * 12;
  const requiredMonthlyContribution = calculateRequiredMonthlyContribution({
    currentNetWorth: Math.max(0, netWorth),
    targetAmount: goal.fire_amount,
    months: monthsToRetirement,
    annualReturnRate: goal.expected_annual_return,
  });
  const requiredAnnualContribution = requiredMonthlyContribution * 12;
  const fireTargetAtRetirement = goal.fire_amount * Math.pow(1 + goal.inflation_rate / 100, yearsToRetirement);
  const coastFireNumber = goal.fire_amount / Math.pow(1 + goal.expected_annual_return / 100, yearsToRetirement || 1);
  const timeline = buildTimeline(goal, includedAssets, liabilities, requiredAnnualContribution, fireTargetAtRetirement);
  const projectedNetWorthAtRetirement = timeline.at(-1)?.netWorth ?? netWorth;

  return {
    summary: {
      totalAssets,
      totalLiabilities,
      netWorth,
      monthsToRetirement,
      yearsToRetirement,
      fireGap: Math.max(0, goal.fire_amount - netWorth),
      requiredMonthlyContribution,
      requiredAnnualContribution,
      coastFireNumber,
      projectedNetWorthAtRetirement,
      onTrack: projectedNetWorthAtRetirement >= fireTargetAtRetirement,
    },
    timeline,
  };
}

function buildTimeline(
  goal: FireGoal,
  assets: FireAsset[],
  liabilities: FireLiability[],
  annualContribution: number,
  fireTargetAtRetirement: number
): FireProjectionYear[] {
  const years = Math.max(0, goal.target_retirement_age - goal.current_age);
  const timeline: FireProjectionYear[] = [];
  const defaultGrowth = goal.expected_annual_return;

  for (let yearIndex = 0; yearIndex <= years; yearIndex += 1) {
    const projectedAssets = assets.reduce((total, asset) => {
      const growthRate = (asset.annual_growth_rate ?? defaultGrowth) / 100;
      return total + asset.current_value * Math.pow(1 + growthRate, yearIndex);
    }, 0);
    const contributions = yearIndex === 0
      ? 0
      : annualContribution * ((Math.pow(1 + defaultGrowth / 100, yearIndex) - 1) / (defaultGrowth / 100 || 1));
    const projectedLiabilities = sum(liabilities.map(liability => estimateLiabilityBalance(liability, yearIndex * 12)));
    const fireTarget = goal.fire_amount + ((fireTargetAtRetirement - goal.fire_amount) * (yearIndex / Math.max(1, years)));
    const netWorth = projectedAssets + contributions - projectedLiabilities;

    timeline.push({
      year: new Date().getFullYear() + yearIndex,
      age: goal.current_age + yearIndex,
      assets: projectedAssets + contributions,
      liabilities: projectedLiabilities,
      netWorth,
      annualContribution: yearIndex === 0 ? 0 : annualContribution,
      fireTarget,
      gap: Math.max(0, fireTarget - netWorth),
      debtPaidOff: Math.max(0, sum(liabilities.map(liability => liability.balance)) - projectedLiabilities),
    });
  }

  return timeline;
}

function sum(values: number[]): number {
  return values.reduce((total, value) => total + (Number.isFinite(value) ? value : 0), 0);
}
