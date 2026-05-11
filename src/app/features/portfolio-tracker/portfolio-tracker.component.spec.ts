import { computed, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { MARKETS } from '../../core/models';
import { AuthService } from '../../core/services/auth.service';
import { MarketService, PortfolioTrackerService } from '../../core/services';
import { PortfolioTrackerComponent } from './portfolio-tracker.component';

describe('PortfolioTrackerComponent', () => {
  let fixture: ComponentFixture<PortfolioTrackerComponent>;
  let component: PortfolioTrackerComponent;
  let currentMarket: ReturnType<typeof signal<'US' | 'IN'>>;

  beforeEach(async () => {
    const user = signal(null);
    currentMarket = signal<'US' | 'IN'>('IN');
    const targets = signal([]);
    const actuals = signal([]);
    const loading = signal(false);
    localStorage.clear();

    await TestBed.configureTestingModule({
      imports: [PortfolioTrackerComponent],
      providers: [
        {
          provide: AuthService,
          useValue: {
            user: user.asReadonly(),
            initialized: Promise.resolve(),
          },
        },
        {
          provide: MarketService,
          useValue: {
            currentMarket: currentMarket.asReadonly(),
            marketInfo: computed(() => MARKETS[currentMarket()]),
          },
        },
        {
          provide: PortfolioTrackerService,
          useValue: {
            targets: targets.asReadonly(),
            actuals: actuals.asReadonly(),
            loading: loading.asReadonly(),
            loadData: jasmine.createSpy('loadData'),
            setTargets: jasmine.createSpy('setTargets').and.resolveTo(),
            addActual: jasmine.createSpy('addActual').and.resolveTo(),
            updateActual: jasmine.createSpy('updateActual').and.resolveTo(),
            getActuals: jasmine.createSpy('getActuals').and.returnValue([]),
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(PortfolioTrackerComponent);
    component = fixture.componentInstance;
  });

  it('calculates target overall return from profit over contributed principal', () => {
    const firstMonthRow = {
      investment: 100000,
      added: 10000,
      principal: 110000,
      total_investment: 110000,
      return_percent: 0.6,
      profit: 660,
      total: 110660,
    };

    expect(component.getTargetOverallReturn(firstMonthRow as any)).toBe('0.6%');
  });

  it('uses starting balance before monthly additions for target and actual rows', () => {
    (component as any).loadPortfolioData([
      {
        year: 2026,
        month: 1,
        investment: 100000,
        added: 3500,
        principal: 103500,
        total_investment: 103500,
        return_percent: 1.6,
        profit: 1656,
        total: 105156,
      },
      {
        year: 2026,
        month: 2,
        investment: 105156,
        added: 3500,
        principal: 107000,
        total_investment: 108656,
        return_percent: 1.6,
        profit: 1738,
        total: 110394,
      },
    ], []);

    component.portfolioData[0].actualInvestment = 107000;
    component.portfolioData[0].actualAdded = 3500;
    component.portfolioData[0].actualTotal = 112268;
    component.portfolioData[1].actualAdded = 3500;

    expect(component.getTargetStartingBalance(component.portfolioData[0])).toBe(100000);
    expect(component.getStartOfMonth(component.portfolioData[0])).toBe(107000);
    expect(component.getStartOfMonth(component.portfolioData[1])).toBe(112268);
    expect(component.getActualMonthlyReturn(component.portfolioData[0])).toBe('+1.6%');
  });

  it('shows the requested Portfolio Tracker table column order', () => {
    fixture.detectChanges();
    component.showSetup = false;
    (component as any).loadPortfolioData([
      {
        year: 2026,
        month: 1,
        investment: 100000,
        added: 3500,
        principal: 103500,
        total_investment: 103500,
        return_percent: 1.6,
        profit: 1656,
        total: 105156,
      },
    ], []);
    fixture.detectChanges();

    const groupHeaders = Array.from(
      fixture.nativeElement.querySelectorAll('.group-header-row .group-th') as NodeListOf<HTMLElement>
    ).map(header => header.textContent?.trim());

    expect(groupHeaders).toEqual([
      'Starting Balance',
      'Added',
      'Total Invested',
      'Ending Balance',
      'Profit / Loss',
      'Monthly Return %',
      'Overall Return %',
    ]);
  });

  it('clears setup fields when switching to a market with no saved portfolio setup', () => {
    component.targetInitialContribution = 100000;
    component.monthlyAddition = 10000;
    component.expectedMonthlyReturn = 0.6;
    component.actualInitialContribution = 90000;

    currentMarket.set('US');
    (component as any).loadInitialContributions();

    expect(component.targetInitialContribution).toBeNull();
    expect(component.monthlyAddition).toBeNull();
    expect(component.expectedMonthlyReturn).toBeNull();
    expect(component.actualInitialContribution).toBeNull();
  });

  it('generates a 120-month projection from the selected start month', async () => {
    component.targetInitialContribution = 100000;
    component.monthlyAddition = 10000;
    component.expectedMonthlyReturn = 0.6;
    component.startYear = 2026;
    (component as any).startMonth = 4;

    await (component as any).generateTenYearProjection();

    const portfolioService = TestBed.inject(PortfolioTrackerService) as any;
    const generatedRows = portfolioService.setTargets.calls.mostRecent().args[0];

    expect(generatedRows.length).toBe(120);
    expect(generatedRows[0].year).toBe(2026);
    expect(generatedRows[0].month).toBe(4);
    expect(generatedRows[11].year).toBe(2027);
    expect(generatedRows[11].month).toBe(3);
    expect(generatedRows[119].year).toBe(2036);
    expect(generatedRows[119].month).toBe(3);
  });

  it('updates actual initial without generating user-entered actual values', async () => {
    component.monthlyAddition = 3500;
    component.expectedMonthlyReturn = 1.6;
    (component as any).loadPortfolioData([
      {
        year: 2026,
        month: 1,
        investment: 100000,
        added: 3500,
        principal: 103500,
        total_investment: 103500,
        return_percent: 1.6,
        profit: 1656,
        total: 105156,
      },
      {
        year: 2026,
        month: 2,
        investment: 105156,
        added: 3500,
        principal: 107000,
        total_investment: 108656,
        return_percent: 1.6,
        profit: 1738,
        total: 110394,
      },
    ], []);

    component.actualInitialContribution = 107000;

    await component.onActualInitialChange();

    expect(component.portfolioData[0].actualInvestment).toBe(107000);
    expect(component.portfolioData[0].actualAdded).toBeNull();
    expect(component.portfolioData[0].actualTotal).toBeNull();
    expect(component.portfolioData[1].actualInvestment).toBeNull();
    expect(component.getStartOfMonth(component.portfolioData[0])).toBe(107000);
    expect(component.getCumulativeActualPrincipal(component.portfolioData[0])).toBe(107000);
  });

  it('locks projection-defining fields in the main configuration view', () => {
    component.showSetup = false;
    (component as any).dataLoaded = true;
    fixture.detectChanges();

    const configInputs = fixture.nativeElement.querySelectorAll('.config-bar input') as NodeListOf<HTMLInputElement>;
    const startSelects = fixture.nativeElement.querySelectorAll('.config-bar .start-date-selects select') as NodeListOf<HTMLSelectElement>;

    expect(configInputs.length).toBeGreaterThanOrEqual(4);
    expect(startSelects.length).toBe(2);
    expect(configInputs[0].disabled).toBeTrue();
    expect(configInputs[1].disabled).toBeFalse();
    expect(configInputs[2].disabled).toBeTrue();
    expect(configInputs[3].disabled).toBeTrue();
    expect(startSelects[0].disabled).toBeTrue();
    expect(startSelects[1].disabled).toBeTrue();
  });
});
