import { ChangeDetectionStrategy, Component, computed, effect, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { ProgressSpinnerModule } from 'primeng/progressspinner';

import { FireAsset, FireAssetCategory, FireGoal, FireLiability, FireLiabilityCategory } from '../../core/models';
import { CurrencyConversionService, FireGoalsService, MarketService } from '../../core/services';
import { AuthService } from '../../core/services/auth.service';
import { calculateFireProjection } from '../../core/utils/fire-goals-calculations';

type FireWizardPanel = 'overview' | 'goalIncome' | 'assets' | 'loans';

interface CategorySummary {
  label: string;
  value: number;
  count: number;
}

const DEFAULT_GOAL: FireGoal = {
  name: '',
  current_age: 0,
  target_retirement_age: 0,
  fire_amount: 0,
  expected_annual_return: 0,
  inflation_rate: 0,
  annual_income: 0,
  tax_rate: 0,
  annual_spending: 0,
  preferred_currency: 'USD',
};
const DRAFT_KEY_PREFIX = 'fire-goals-draft';
const FIRE_WIZARD_PANELS: FireWizardPanel[] = ['overview', 'goalIncome', 'assets', 'loans'];

interface FireGoalsDraft {
  updatedAt: string;
  goal: FireGoal;
  assets: FireAsset[];
  liabilities: FireLiability[];
}

@Component({
  selector: 'app-fire-goals',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule, ButtonModule, ProgressSpinnerModule],
  templateUrl: './fire-goals.component.html',
  styleUrls: ['./fire-goals.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FireGoalsComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);
  private readonly marketService = inject(MarketService);
  private readonly currencyConversion = inject(CurrencyConversionService);
  readonly fireService = inject(FireGoalsService);

  readonly assets = signal<FireAsset[]>([]);
  readonly liabilities = signal<FireLiability[]>([]);
  readonly saving = signal(false);
  readonly saveMessage = signal<string | null>(null);
  readonly saveError = signal<string | null>(null);
  readonly hasLocalDraft = signal(false);
  readonly activePanel = signal<FireWizardPanel>('overview');
  readonly panelDirection = signal<'forward' | 'backward'>('forward');
  private readonly formVersion = signal(0);

  readonly goalForm = this.fb.nonNullable.group({
    name: this.fb.nonNullable.control(DEFAULT_GOAL.name),
    current_age: this.fb.nonNullable.control(DEFAULT_GOAL.current_age, [Validators.required, Validators.min(0), Validators.max(120)]),
    target_retirement_age: this.fb.nonNullable.control(DEFAULT_GOAL.target_retirement_age, [Validators.required, Validators.min(1), Validators.max(120)]),
    fire_amount: this.fb.nonNullable.control(DEFAULT_GOAL.fire_amount, [Validators.required, Validators.min(0)]),
    expected_annual_return: this.fb.nonNullable.control(DEFAULT_GOAL.expected_annual_return, [Validators.required, Validators.min(-20), Validators.max(40)]),
    inflation_rate: this.fb.nonNullable.control(DEFAULT_GOAL.inflation_rate, [Validators.required, Validators.min(0), Validators.max(20)]),
    annual_income: this.fb.nonNullable.control(DEFAULT_GOAL.annual_income, [Validators.required, Validators.min(0)]),
    tax_rate: this.fb.nonNullable.control(DEFAULT_GOAL.tax_rate, [Validators.required, Validators.min(0), Validators.max(100)]),
    annual_spending: this.fb.nonNullable.control(DEFAULT_GOAL.annual_spending, [Validators.required, Validators.min(0)]),
    preferred_currency: this.fb.nonNullable.control(DEFAULT_GOAL.preferred_currency, Validators.required),
  });

  readonly marketInfo = computed(() => this.marketService.marketInfo());
  readonly currencySymbol = computed(() => this.marketInfo().currencySymbol);
  readonly displayCurrency = computed(() => this.marketInfo().currency);
  readonly baseCurrency = computed(() => {
    this.formVersion();
    return this.goalForm.controls.preferred_currency.value || DEFAULT_GOAL.preferred_currency;
  });
  readonly exchangeRateLabel = computed(() => {
    const rate = this.currencyConversion.rate;
    if (this.baseCurrency() === this.displayCurrency()) {
      return `Saved and displayed in ${this.displayCurrency()}`;
    }
    return this.baseCurrency() === 'USD'
      ? `1 USD = ${rate.toFixed(2)} INR`
      : `1 INR = ${(1 / rate).toFixed(4)} USD`;
  });
  readonly projection = computed(() => calculateFireProjection(this.currentGoal(), this.assets(), this.liabilities()));
  readonly activePanelIndex = computed(() => FIRE_WIZARD_PANELS.indexOf(this.activePanel()));
  readonly activePanelLabel = computed(() => this.getPanelLabel(this.activePanel()));
  readonly progressPercent = computed(() => {
    const target = Math.max(1, this.currentGoal().fire_amount);
    return Math.min(100, Math.max(0, (this.projection().summary.netWorth / target) * 100));
  });
  readonly freedomDate = computed(() => new Date().getFullYear() + this.projection().summary.yearsToRetirement);
  readonly timeLeftLabel = computed(() => this.formatTimeLeft(this.projection().summary.monthsToRetirement));
  readonly topMilestones = computed(() => this.projection().timeline.filter((_, index) => index % Math.max(1, Math.ceil(this.projection().timeline.length / 5)) === 0).slice(0, 5));
  readonly assetSummaries = computed(() => this.summarizeAssets());
  readonly liabilitySummaries = computed(() => this.summarizeLiabilities());
  readonly incomeSummary = computed(() => {
    const goal = this.currentGoal();
    const taxes = this.annualTaxAmount(goal);
    return [
      { label: 'Annual Income', value: goal.annual_income },
      { label: 'Taxation', value: taxes },
      { label: 'Annual Spending', value: goal.annual_spending },
      { label: 'Available To Invest', value: Math.max(0, goal.annual_income - taxes - goal.annual_spending) },
    ];
  });

  readonly assetCategories: { label: string; value: FireAssetCategory }[] = [
    { label: 'Cash', value: 'cash' },
    { label: 'Brokerage', value: 'brokerage' },
    { label: 'Retirement', value: 'retirement' },
    { label: 'Real Estate', value: 'real_estate' },
    { label: 'Business', value: 'business' },
    { label: 'Other', value: 'other' },
  ];
  readonly liabilityCategories: { label: string; value: FireLiabilityCategory }[] = [
    { label: 'Mortgage', value: 'mortgage' },
    { label: 'Student Loan', value: 'student_loan' },
    { label: 'Auto', value: 'auto' },
    { label: 'Credit Card', value: 'credit_card' },
    { label: 'Personal', value: 'personal' },
    { label: 'Other', value: 'other' },
  ];

  readonly wizardPanels: { id: FireWizardPanel; label: string }[] = FIRE_WIZARD_PANELS.map(id => ({
    id,
    label: this.getPanelLabel(id),
  }));

  constructor() {
    this.goalForm.valueChanges.subscribe(() => {
      this.formVersion.update(version => version + 1);
      this.persistDraft();
    });

    effect(() => {
      const loadedGoal = this.fireService.goal();
      if (!loadedGoal) return;
      this.goalForm.patchValue(loadedGoal, { emitEvent: false });
      this.formVersion.update(version => version + 1);
      this.assets.set(this.fireService.assets());
      this.liabilities.set(this.fireService.liabilities());
    });
  }

  async ngOnInit(): Promise<void> {
    try {
      void this.currencyConversion.loadUsdInrRate();
      await this.fireService.loadData();
      this.restoreDraftIfNewer();
    } catch (error) {
      this.saveError.set(this.getErrorMessage(error, 'Unable to load FIRE plan.'));
    }
  }

  currentGoal(): FireGoal {
    this.formVersion();
    return this.goalForm.getRawValue();
  }

  addAsset(): void {
    this.assets.update(assets => [
      ...assets,
      { name: '', category: 'brokerage', current_value: 0, annual_growth_rate: null },
    ]);
    this.persistDraft();
  }

  removeAsset(index: number): void {
    this.assets.update(assets => assets.filter((_, itemIndex) => itemIndex !== index));
    this.persistDraft();
  }

  updateAsset(index: number, patch: Partial<FireAsset>): void {
    this.assets.update(assets => assets.map((asset, itemIndex) => itemIndex === index ? { ...asset, ...patch } : asset));
    this.persistDraft();
  }

  updateAssetValue(index: number, displayValue: string | number | null): void {
    this.updateAsset(index, { current_value: this.toBaseAmount(displayValue) });
  }

  addLiability(): void {
    this.liabilities.update(liabilities => [
      ...liabilities,
      { name: '', category: 'personal', balance: 0, interest_rate: 0, monthly_payment: 0, payoff_months: null, payoff_date: null },
    ]);
    this.persistDraft();
  }

  removeLiability(index: number): void {
    this.liabilities.update(liabilities => liabilities.filter((_, itemIndex) => itemIndex !== index));
    this.persistDraft();
  }

  updateLiability(index: number, patch: Partial<FireLiability>): void {
    this.liabilities.update(liabilities => liabilities.map((liability, itemIndex) => itemIndex === index ? { ...liability, ...patch } : liability));
    this.persistDraft();
  }

  updateLiabilityMoneyField(index: number, field: 'balance' | 'monthly_payment', displayValue: string | number | null): void {
    this.updateLiability(index, { [field]: this.toBaseAmount(displayValue) } as Pick<FireLiability, typeof field>);
  }

  updateGoalMoneyField(field: 'fire_amount' | 'annual_income' | 'annual_spending', displayValue: string | number | null): void {
    this.goalForm.controls[field].setValue(this.toBaseAmount(displayValue));
  }

  async savePlan(): Promise<void> {
    this.saveMessage.set(null);
    this.saveError.set(null);
    if (this.goalForm.invalid) {
      this.saveError.set('Check the plan inputs before saving.');
      return;
    }

    this.saving.set(true);
    try {
      await this.fireService.savePlan(this.currentGoal(), this.assets(), this.liabilities());
      this.clearDraft();
      this.saveMessage.set('FIRE plan saved.');
    } catch (error) {
      this.saveError.set(this.getErrorMessage(error, 'Unable to save FIRE plan.'));
    } finally {
      this.saving.set(false);
    }
  }

  formatMoney(value: number): string {
    const market = this.marketService.currentMarket();
    return new Intl.NumberFormat(market === 'US' ? 'en-US' : 'en-IN', {
      style: 'currency',
      currency: this.displayCurrency(),
      maximumFractionDigits: 0,
    }).format(this.displayAmount(value));
  }

  displayAmount(value: number | null | undefined): number {
    return this.roundMoney(this.currencyConversion.convert(Number(value) || 0, this.baseCurrency(), this.displayCurrency()));
  }

  formatPercent(value: number): string {
    return `${value.toFixed(1)}%`;
  }

  trackByIndex(index: number): number {
    return index;
  }

  goToPanel(panel: FireWizardPanel): void {
    const nextIndex = FIRE_WIZARD_PANELS.indexOf(panel);
    const currentIndex = this.activePanelIndex();
    this.panelDirection.set(nextIndex >= currentIndex ? 'forward' : 'backward');
    this.activePanel.set(panel);
  }

  goToNextPanel(): void {
    const nextIndex = (this.activePanelIndex() + 1) % FIRE_WIZARD_PANELS.length;
    this.panelDirection.set('forward');
    this.activePanel.set(FIRE_WIZARD_PANELS[nextIndex]);
  }

  goToPreviousPanel(): void {
    if (this.activePanel() === 'overview') return;
    const previousIndex = (this.activePanelIndex() - 1 + FIRE_WIZARD_PANELS.length) % FIRE_WIZARD_PANELS.length;
    this.panelDirection.set('backward');
    this.activePanel.set(FIRE_WIZARD_PANELS[previousIndex]);
  }

  private getErrorMessage(error: unknown, fallback: string): string {
    return error instanceof Error ? error.message : fallback;
  }

  private summarizeAssets(): CategorySummary[] {
    const labels: Record<FireAssetCategory, string> = {
      cash: 'Cash',
      brokerage: 'Stocks & Brokerage',
      retirement: 'Retirement',
      real_estate: 'Real Estate',
      business: 'Business',
      other: 'Other Assets',
    };

    return this.summarizeByCategory(this.assets(), asset => asset.category, asset => asset.current_value, labels);
  }

  private summarizeLiabilities(): CategorySummary[] {
    const labels: Record<FireLiabilityCategory, string> = {
      mortgage: 'Real Estate Loans',
      student_loan: 'Student Loans',
      auto: 'Auto Loans',
      credit_card: 'Credit Cards',
      personal: 'Personal Loans',
      other: 'Other Loans',
    };

    return this.summarizeByCategory(this.liabilities(), liability => liability.category, liability => liability.balance, labels);
  }

  private summarizeByCategory<T, C extends string>(
    rows: T[],
    getCategory: (row: T) => C,
    getValue: (row: T) => number,
    labels: Record<C, string>
  ): CategorySummary[] {
    const grouped = new Map<C, CategorySummary>();

    for (const row of rows) {
      const category = getCategory(row);
      const existing = grouped.get(category) ?? { label: labels[category], value: 0, count: 0 };
      existing.value += getValue(row);
      existing.count += 1;
      grouped.set(category, existing);
    }

    return Array.from(grouped.values()).sort((a, b) => b.value - a.value);
  }

  private annualTaxAmount(goal: FireGoal): number {
    return goal.annual_income * Math.max(0, goal.tax_rate) / 100;
  }

  private toBaseAmount(value: string | number | null): number {
    return this.roundMoney(this.currencyConversion.convert(this.parseNumber(value), this.displayCurrency(), this.baseCurrency()));
  }

  private parseNumber(value: string | number | null): number {
    const parsed = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  private roundMoney(value: number): number {
    return Math.round(value * 100) / 100;
  }

  private formatTimeLeft(months: number): string {
    if (months <= 0) return 'Now';
    const years = Math.floor(months / 12);
    const remainingMonths = months % 12;
    if (years === 0) return `${remainingMonths} mo`;
    if (remainingMonths === 0) return `${years} yr`;
    return `${years} yr ${remainingMonths} mo`;
  }

  private getPanelLabel(panel: FireWizardPanel): string {
    switch (panel) {
      case 'overview':
        return 'Overview';
      case 'goalIncome':
        return 'Goal & Income';
      case 'assets':
        return 'Assets';
      case 'loans':
        return 'Loans';
    }
  }

  private persistDraft(): void {
    const draft: FireGoalsDraft = {
      updatedAt: new Date().toISOString(),
      goal: this.currentGoal(),
      assets: this.assets(),
      liabilities: this.liabilities(),
    };
    localStorage.setItem(this.draftKey(), JSON.stringify(draft));
    this.hasLocalDraft.set(true);
  }

  private restoreDraftIfNewer(): void {
    const draft = this.readDraft();
    if (!draft) return;

    const savedGoal = this.fireService.goal();
    const savedUpdatedAt = savedGoal?.updated_at ? Date.parse(savedGoal.updated_at) : 0;
    const draftUpdatedAt = Date.parse(draft.updatedAt);
    if (savedGoal && draftUpdatedAt <= savedUpdatedAt) {
      this.clearDraft();
      return;
    }

    this.goalForm.patchValue(draft.goal, { emitEvent: false });
    this.formVersion.update(version => version + 1);
    this.assets.set(draft.assets);
    this.liabilities.set(draft.liabilities);
    this.hasLocalDraft.set(true);
    this.saveMessage.set('Restored an unsaved local draft. Click Save Plan to sync it to Supabase.');
  }

  private readDraft(): FireGoalsDraft | null {
    const rawDraft = localStorage.getItem(this.draftKey());
    if (!rawDraft) return null;

    try {
      return JSON.parse(rawDraft) as FireGoalsDraft;
    } catch {
      this.clearDraft();
      return null;
    }
  }

  private clearDraft(): void {
    localStorage.removeItem(this.draftKey());
    this.hasLocalDraft.set(false);
  }

  private draftKey(): string {
    return `${DRAFT_KEY_PREFIX}:${this.auth.user()?.id ?? 'anonymous'}`;
  }
}
