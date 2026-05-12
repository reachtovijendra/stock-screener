export type FireAssetCategory = 'cash' | 'brokerage' | 'retirement' | 'real_estate' | 'business' | 'other';
export type FireLiabilityCategory = 'mortgage' | 'student_loan' | 'auto' | 'credit_card' | 'personal' | 'other';

export interface FireGoal {
  id?: string;
  user_id?: string;
  name: string;
  current_age: number;
  target_retirement_age: number;
  fire_amount: number;
  expected_annual_return: number;
  inflation_rate: number;
  annual_income: number;
  tax_rate: number;
  annual_spending: number;
  preferred_currency: string;
  created_at?: string;
  updated_at?: string;
}

export interface FireAsset {
  id?: string;
  goal_id?: string;
  user_id?: string;
  name: string;
  category: FireAssetCategory;
  current_value: number;
  annual_growth_rate: number | null;
  exclude_from_plan?: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface FireLiability {
  id?: string;
  goal_id?: string;
  user_id?: string;
  name: string;
  category: FireLiabilityCategory;
  balance: number;
  interest_rate: number;
  monthly_payment: number;
  payoff_months: number | null;
  payoff_date: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface FireProjectionYear {
  year: number;
  age: number;
  assets: number;
  liabilities: number;
  netWorth: number;
  annualContribution: number;
  fireTarget: number;
  gap: number;
  debtPaidOff: number;
}

export interface FirePlanSummary {
  totalAssets: number;
  totalLiabilities: number;
  netWorth: number;
  monthsToRetirement: number;
  yearsToRetirement: number;
  fireGap: number;
  requiredMonthlyContribution: number;
  requiredAnnualContribution: number;
  coastFireNumber: number;
  projectedNetWorthAtRetirement: number;
  onTrack: boolean;
}

export interface FirePlanProjection {
  summary: FirePlanSummary;
  timeline: FireProjectionYear[];
}
