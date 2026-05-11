import { computed, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { FireAsset, FireGoal, FireLiability, MARKETS, Market } from '../../core/models';
import { CurrencyConversionService, FireGoalsService, MarketService } from '../../core/services';
import { AuthService } from '../../core/services/auth.service';
import { FireGoalsComponent } from './fire-goals.component';

describe('FireGoalsComponent', () => {
  let component: FireGoalsComponent;
  let fixture: ComponentFixture<FireGoalsComponent>;
  let goal: ReturnType<typeof signal<FireGoal | null>>;
  let assets: ReturnType<typeof signal<FireAsset[]>>;
  let liabilities: ReturnType<typeof signal<FireLiability[]>>;
  let currentMarket: ReturnType<typeof signal<Market>>;
  let fireGoalsService: jasmine.SpyObj<FireGoalsService>;
  let currencyConversionService: jasmine.SpyObj<CurrencyConversionService>;
  const draftKey = 'fire-goals-draft:user-1';

  beforeEach(async () => {
    localStorage.clear();
    goal = signal<FireGoal | null>(null);
    assets = signal<FireAsset[]>([]);
    liabilities = signal<FireLiability[]>([]);
    currentMarket = signal<Market>('US');
    const loading = signal(false);
    fireGoalsService = jasmine.createSpyObj<FireGoalsService>('FireGoalsService', ['loadData', 'savePlan'], {
      goal,
      assets,
      liabilities,
      loading,
    });
    fireGoalsService.loadData.and.resolveTo();
    fireGoalsService.savePlan.and.resolveTo();
    currencyConversionService = jasmine.createSpyObj<CurrencyConversionService>('CurrencyConversionService', ['loadUsdInrRate', 'convert'], {
      rate: 95,
    });
    currencyConversionService.loadUsdInrRate.and.resolveTo();
    currencyConversionService.convert.and.callFake((value: number, fromCurrency: string, toCurrency: string) => {
      if (fromCurrency === toCurrency) return value;
      if (fromCurrency === 'USD' && toCurrency === 'INR') return value * 95;
      if (fromCurrency === 'INR' && toCurrency === 'USD') return value / 95;
      return value;
    });

    await TestBed.configureTestingModule({
      imports: [FireGoalsComponent],
      providers: [
        { provide: FireGoalsService, useValue: fireGoalsService },
        {
          provide: AuthService,
          useValue: {
            user: signal({ id: 'user-1' }).asReadonly(),
          },
        },
        {
          provide: MarketService,
          useValue: {
            currentMarket: currentMarket.asReadonly(),
            marketInfo: computed(() => MARKETS[currentMarket()]),
          },
        },
        { provide: CurrencyConversionService, useValue: currencyConversionService },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(FireGoalsComponent);
    component = fixture.componentInstance;
  });

  it('loads the saved FIRE plan into the form and editable builders', () => {
    goal.set({
      name: 'Early Exit',
      current_age: 41,
      target_retirement_age: 55,
      fire_amount: 2_000_000,
      expected_annual_return: 7,
      inflation_rate: 3,
      annual_income: 250_000,
      tax_rate: 20,
      annual_spending: 110_000,
      preferred_currency: 'USD',
    });
    assets.set([{ name: 'Index funds', category: 'brokerage', current_value: 500_000, annual_growth_rate: null }]);
    liabilities.set([{ name: 'Mortgage', category: 'mortgage', balance: 300_000, interest_rate: 4.25, monthly_payment: 2_500, payoff_months: null, payoff_date: null }]);

    fixture.detectChanges();

    expect(component.goalForm.controls.name.value).toBe('Early Exit');
    expect(component.assets()[0].name).toBe('Index funds');
    expect(component.liabilities()[0].name).toBe('Mortgage');
  });

  it('prevents saving when the target retirement age is not after the current age', async () => {
    fixture.detectChanges();
    component.goalForm.patchValue({ current_age: 50, target_retirement_age: 50 });

    await component.savePlan();

    expect(fireGoalsService.savePlan).not.toHaveBeenCalled();
    expect(component.saveError()).toContain('Retirement age must be greater');
  });

  it('saves the current draft with assets and liabilities', async () => {
    fixture.detectChanges();
    component.goalForm.patchValue({ current_age: 40, target_retirement_age: 55 });
    component.addAsset();
    component.updateAsset(2, { name: 'Cash reserve', current_value: 25_000, category: 'cash' });

    await component.savePlan();

    expect(fireGoalsService.savePlan).toHaveBeenCalledWith(
      jasmine.objectContaining({ current_age: 40, target_retirement_age: 55 }),
      jasmine.arrayContaining([jasmine.objectContaining({ name: 'Cash reserve', current_value: 25_000 })]),
      component.liabilities()
    );
    expect(localStorage.getItem(draftKey)).toBeNull();
  });

  it('renders the overview metrics and clickable summary rows', () => {
    fixture.detectChanges();
    const text = fixture.nativeElement.textContent;

    expect(text).toContain('FIRE Goal');
    expect(text).toContain('Net Worth');
    expect(text).toContain('Freedom Gap');
    expect(text).toContain('Time Left');
    expect(text).toContain('Assets Summary');
    expect(text).toContain('Loans');
    expect(text).toContain('Income');
    expect(text).toContain('Taxation');
    expect(text).toContain('$1,500,000');
    expect(text).toContain('$105,000');
    expect(text).toContain('$36,000');
    expect(text).toContain('$54,000');
  });

  it('jumps from overview rows to the corresponding wizard panels', () => {
    fixture.detectChanges();

    const buttons = Array.from(fixture.nativeElement.querySelectorAll('.summary-row')) as HTMLButtonElement[];
    buttons[0].click();
    fixture.detectChanges();

    expect(component.activePanel()).toBe('assets');
    expect(fixture.nativeElement.textContent).toContain('Investment name');

    component.goToPanel('overview');
    fixture.detectChanges();
    const refreshedButtons = Array.from(fixture.nativeElement.querySelectorAll('.summary-row')) as HTMLButtonElement[];
    refreshedButtons[1].click();
    fixture.detectChanges();

    expect(component.activePanel()).toBe('loans');
    expect(fixture.nativeElement.textContent).toContain('Remaining balance');
  });

  it('navigates wizard panels with arrow controls', () => {
    fixture.detectChanges();

    const carouselButtons = Array.from(fixture.nativeElement.querySelectorAll('.carousel-button')) as HTMLButtonElement[];
    expect(fixture.nativeElement.querySelector('.panel-tabs')).toBeNull();
    expect(fixture.nativeElement.querySelector('.carousel-button--previous')).toBeNull();
    expect(carouselButtons.length).toBe(1);

    carouselButtons[0].click();
    fixture.detectChanges();
    expect(component.activePanel()).toBe('goalIncome');
    expect(fixture.nativeElement.textContent).toContain('Goal & Income');

    const refreshedButtons = Array.from(fixture.nativeElement.querySelectorAll('.carousel-button')) as HTMLButtonElement[];
    expect(refreshedButtons.length).toBe(2);
    refreshedButtons[0].click();
    fixture.detectChanges();
    expect(component.activePanel()).toBe('overview');
  });

  it('renders self-explanatory labels for loan inputs', () => {
    component.goToPanel('loans');
    fixture.detectChanges();
    const text = fixture.nativeElement.textContent;

    expect(fixture.nativeElement.querySelector('.loan-card')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('.loan-detail-grid')).not.toBeNull();
    expect(text).toContain('Track balances, payoff timing');
    expect(fixture.nativeElement.querySelector('.loan-index')?.textContent.trim()).toBe('01');
    expect(text).toContain('Remaining balance');
    expect(text).toContain('APR %');
    expect(text).toContain('Monthly payment');
    expect(text).toContain('Remaining months');
    expect(text).toContain('Payoff date');
  });

  it('shows currency symbols beside editable money fields', () => {
    component.goToPanel('assets');
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.currency-prefix')?.textContent.trim()).toBe('$');

    component.goToPanel('loans');
    fixture.detectChanges();

    const prefixes = Array.from(fixture.nativeElement.querySelectorAll('.currency-prefix') as NodeListOf<Element>)
      .map((element: Element) => element.textContent?.trim());
    expect(prefixes).toContain('$');
  });

  it('converts saved USD amounts to INR in India market', () => {
    currentMarket.set('IN');
    fixture.detectChanges();

    expect(component.formatMoney(1_500_000)).toContain('₹14,25,00,000');
    expect(component.currentGoal().preferred_currency).toBe('USD');

    component.goToPanel('assets');
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.currency-prefix')?.textContent.trim()).toBe('₹');
  });

  it('converts edited INR values back to the saved plan currency', () => {
    currentMarket.set('IN');
    fixture.detectChanges();

    component.updateGoalMoneyField('fire_amount', 190_000_000);
    component.updateAssetValue(0, 47_500_000);
    component.updateLiabilityMoneyField(0, 'monthly_payment', 190_000);

    expect(component.goalForm.controls.fire_amount.value).toBe(2_000_000);
    expect(component.assets()[0].current_value).toBe(500_000);
    expect(component.liabilities()[0].monthly_payment).toBe(2_000);
  });

  it('shows total assets in the assets section header', () => {
    component.goToPanel('assets');
    fixture.detectChanges();
    const text = fixture.nativeElement.textContent;

    expect(fixture.nativeElement.querySelector('.investment-card')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('.investment-ledger-header')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('.investment-row-field')).not.toBeNull();
    expect(text).toContain('Assets');
    expect(text).toContain('across 2 investments');
    expect(fixture.nativeElement.querySelector('.investment-index')?.textContent.trim()).toBe('01');
    expect(text).toContain('Catalog each investment bucket');
    expect(text).toContain('$345,000');
  });

  it('restores an unsaved local draft after refresh', async () => {
    localStorage.setItem(draftKey, JSON.stringify({
      updatedAt: new Date().toISOString(),
      goal: {
        name: 'Draft FIRE',
        current_age: 42,
        target_retirement_age: 54,
        fire_amount: 1_750_000,
        expected_annual_return: 7,
        inflation_rate: 3,
        annual_income: 200_000,
        tax_rate: 20,
        annual_spending: 95_000,
        preferred_currency: 'USD',
      },
      assets: [{ name: 'Saved browser draft', category: 'brokerage', current_value: 333_000, annual_growth_rate: null }],
      liabilities: [],
    }));

    await component.ngOnInit();

    expect(component.goalForm.controls.name.value).toBe('Draft FIRE');
    expect(component.assets()[0].name).toBe('Saved browser draft');
    expect(component.hasLocalDraft()).toBeTrue();
    expect(component.saveMessage()).toContain('Restored an unsaved local draft');
  });
});
