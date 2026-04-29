import { Component, OnInit, inject, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import * as XLSX from 'xlsx';

import { TableModule } from 'primeng/table';
import { ButtonModule } from 'primeng/button';
import { InputNumberModule } from 'primeng/inputnumber';
import { ToastModule } from 'primeng/toast';
import { ProgressSpinnerModule } from 'primeng/progressspinner';
import { MessageService } from 'primeng/api';

import { Market, PortfolioActualEntry, PortfolioTargetEntry } from '../../core/models';
import { MarketService, PortfolioTrackerService } from '../../core/services';
import { AuthService } from '../../core/services/auth.service';

interface PortfolioRow extends PortfolioTargetEntry {
  actualId: string | null;
  actualInvestment: number | null;
  actualAdded: number | null;
  actualTotal: number | null;
}

@Component({
  selector: 'app-portfolio-tracker',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    TableModule,
    ButtonModule,
    InputNumberModule,
    ToastModule,
    ProgressSpinnerModule
  ],
  providers: [MessageService],
  templateUrl: './portfolio-tracker.component.html',
  styleUrls: ['./portfolio-tracker.component.scss']
})
export class PortfolioTrackerComponent implements OnInit {
  private portfolioService = inject(PortfolioTrackerService);
  private marketService = inject(MarketService);
  private messageService = inject(MessageService);
  private authService = inject(AuthService);

  portfolioData: PortfolioRow[] = [];
  filteredData: PortfolioRow[] = [];
  showConfirmModal = false;
  showRowClearModal = false;
  rowToClear: PortfolioRow | null = null;
  yearOptions: { label: string; value: number }[] = [];
  selectedYears: number[] = [];
  isLoading = true;

  targetInitialContribution: number | null = null;
  actualInitialContribution: number | null = null;
  monthlyAddition: number | null = null;
  expectedMonthlyReturn: number | null = null;
  startYear: number = new Date().getFullYear();
  startMonth: number = new Date().getMonth() + 1;
  startYearOptions: number[] = [];
  startMonthOptions: { label: string; value: number }[] = [
    { label: 'Jan', value: 1 },
    { label: 'Feb', value: 2 },
    { label: 'Mar', value: 3 },
    { label: 'Apr', value: 4 },
    { label: 'May', value: 5 },
    { label: 'Jun', value: 6 },
    { label: 'Jul', value: 7 },
    { label: 'Aug', value: 8 },
    { label: 'Sep', value: 9 },
    { label: 'Oct', value: 10 },
    { label: 'Nov', value: 11 },
    { label: 'Dec', value: 12 },
  ];
  showSetup = false;

  private dataLoaded = false;
  private initialLoadDone = false;
  private currentUserId: string | null = null;
  private currentPortfolioMarket: Market | null = null;

  private storageKey(key: string): string {
    return `portfolio_${this.currentUserId}_${this.marketService.currentMarket()}_${key}`;
  }

  constructor() {
    effect(() => {
      // Track user changes
      const user = this.authService.user();
      const userId = user?.id ?? null;
      const market = this.marketService.currentMarket();

      if (userId !== this.currentUserId || market !== this.currentPortfolioMarket) {
        this.currentUserId = userId;
        this.currentPortfolioMarket = market;
        this.dataLoaded = false;
        this.initialLoadDone = false;
        this.portfolioData = [];
        this.filteredData = [];
        this.selectedYears = [];
        this.showSetup = false;
        this.loadInitialContributions();
        if (userId) {
          this.portfolioService.loadData();
        }
      }

      const loading = this.portfolioService.loading();
      this.isLoading = loading;

      if (!loading) {
        const targets = this.portfolioService.targets();
        const actuals = this.portfolioService.actuals();

        if (!this.dataLoaded && targets.length === 0) {
          this.dataLoaded = true;
          if (!this.getStoredSetupValue('setupComplete')) {
            this.showSetup = true;
          } else {
            this.generateTenYearProjection();
          }
        } else if (targets.length > 0) {
          this.dataLoaded = true;
          if (!this.initialLoadDone) {
            this.initialLoadDone = true;
            this.loadPortfolioData(targets, actuals);
          }
        }
      }
    });
  }

  ngOnInit(): void {
    this.buildStartYearOptions();
    const user = this.authService.user();
    this.currentUserId = user?.id ?? null;
    this.currentPortfolioMarket = this.marketService.currentMarket();
    this.loadInitialContributions();
    this.portfolioService.loadData();
  }

  get setupValid(): boolean {
    return this.targetInitialContribution !== null && this.targetInitialContribution > 0
      && this.monthlyAddition !== null && this.monthlyAddition > 0
      && this.expectedMonthlyReturn !== null && this.expectedMonthlyReturn > 0;
  }

  get annualExpectedReturn(): string {
    if (this.expectedMonthlyReturn === null) return '-';
    const annualReturn = (Math.pow(1 + this.expectedMonthlyReturn / 100, 12) - 1) * 100;
    return annualReturn.toFixed(2);
  }

  get portfolioCurrency(): string {
    return this.marketService.marketInfo().currency;
  }

  get portfolioLocale(): string {
    return this.marketService.currentMarket() === 'IN' ? 'en-IN' : 'en-US';
  }

  get startingInvestmentPlaceholder(): string {
    return this.marketService.currentMarket() === 'IN' ? 'e.g. 1,00,000' : 'e.g. 100,000';
  }

  get monthlyContributionPlaceholder(): string {
    return this.marketService.currentMarket() === 'IN' ? 'e.g. 3,500' : 'e.g. 3,500';
  }

  async completeSetup(): Promise<void> {
    localStorage.setItem(this.storageKey('setupComplete'), 'true');
    localStorage.setItem(this.storageKey('targetInitialContribution'), this.targetInitialContribution!.toString());
    localStorage.setItem(this.storageKey('monthlyAddition'), this.monthlyAddition!.toString());
    localStorage.setItem(this.storageKey('expectedMonthlyReturn'), this.expectedMonthlyReturn!.toString());
    localStorage.setItem(this.storageKey('startYear'), this.startYear.toString());
    localStorage.setItem(this.storageKey('startMonth'), this.startMonth.toString());
    if (this.actualInitialContribution !== null) {
      localStorage.setItem(this.storageKey('actualInitialContribution'), this.actualInitialContribution.toString());
    }
    this.showSetup = false;
    await this.generateTenYearProjection();
    this.messageService.add({
      severity: 'success',
      summary: 'Portfolio Created',
      detail: `10-year projection generated from ${this.startYear}`,
      life: 3000
    });
  }

  showReconfigureModal = false;

  openReconfigureConfirm(): void {
    this.showReconfigureModal = true;
  }

  cancelReconfigure(): void {
    this.showReconfigureModal = false;
  }

  async confirmReconfigure(): Promise<void> {
    this.showReconfigureModal = false;
    await this.portfolioService.clearAllData();
    this.portfolioData = [];
    this.filteredData = [];
    this.selectedYears = [];
    this.targetInitialContribution = null;
    this.actualInitialContribution = null;
    this.monthlyAddition = null;
    this.expectedMonthlyReturn = null;
    this.startYear = new Date().getFullYear();
    this.startMonth = new Date().getMonth() + 1;
    this.dataLoaded = true;
    this.initialLoadDone = false;
    const prefix = `portfolio_${this.currentUserId}_${this.marketService.currentMarket()}_`;
    Object.keys(localStorage).filter(k => k.startsWith(prefix)).forEach(k => localStorage.removeItem(k));
    if (this.marketService.currentMarket() === 'US') {
      const legacyPrefix = `portfolio_${this.currentUserId}_`;
      Object.keys(localStorage)
        .filter(k => k.startsWith(legacyPrefix) && !k.startsWith(prefix))
        .forEach(k => localStorage.removeItem(k));
    }
    this.showSetup = true;
  }

  openClearConfirm(): void {
    this.showConfirmModal = true;
  }

  cancelClear(): void {
    this.showConfirmModal = false;
  }

  async confirmClear(): Promise<void> {
    this.portfolioData = [];
    this.filteredData = [];
    this.selectedYears = [];
    await this.portfolioService.clearAllData();
    await this.generateTenYearProjection();
    this.showConfirmModal = false;
    this.messageService.add({
      severity: 'success',
      summary: 'Data Cleared',
      detail: 'All data has been cleared and regenerated',
      life: 3000
    });
  }

  private async generateTenYearProjection(): Promise<void> {
    const targets: PortfolioTargetEntry[] = [];

    const startingInvestment = this.targetInitialContribution ?? 100000;
    const monthlyAddition = this.monthlyAddition ?? 3500;
    const monthlyReturnPercent = this.expectedMonthlyReturn ?? 1.6;

    let previousTotal = startingInvestment;
    let previousPrincipal = startingInvestment;

    const startYear = Number(this.startYear);
    const startMonth = Number(this.startMonth);

    for (let i = 1; i <= 120; i++) {
      const monthOffset = startMonth - 1 + (i - 1);
      const year = startYear + Math.floor(monthOffset / 12);
      const monthNumber = (monthOffset % 12) + 1;

      const investment = previousTotal;
      const added = monthlyAddition;
      const principal = previousPrincipal + added;
      const totalInvestment = previousTotal + added;
      const returnPercent = monthlyReturnPercent;
      const profit = Math.round(totalInvestment * (returnPercent / 100));
      const total = totalInvestment + profit;

      targets.push({
        year,
        month: monthNumber,
        investment: Math.round(investment),
        added,
        principal: Math.round(principal),
        total_investment: Math.round(totalInvestment),
        return_percent: returnPercent,
        profit,
        total: Math.round(total)
      });

      previousTotal = total;
      previousPrincipal = principal;
    }

    this.initialLoadDone = false;
    await this.portfolioService.setTargets(targets);
  }

  async onTargetInitialChange(): Promise<void> {
    if (this.targetInitialContribution === null) return;
    localStorage.setItem(this.storageKey('targetInitialContribution'), this.targetInitialContribution.toString());
    await this.generateTenYearProjection();
    this.messageService.add({
      severity: 'success',
      summary: 'Updated',
      detail: 'Target projections recalculated',
      life: 2000
    });
  }

  async onActualInitialChange(): Promise<void> {
    if (this.actualInitialContribution !== null) {
      localStorage.setItem(this.storageKey('actualInitialContribution'), this.actualInitialContribution.toString());
    } else {
      localStorage.removeItem(this.storageKey('actualInitialContribution'));
    }

    if (this.portfolioData.length > 0) {
      try {
        const firstRow = this.portfolioData[0];
        firstRow.actualInvestment = this.actualInitialContribution;

        if (firstRow.actualId || firstRow.actualAdded !== null || firstRow.actualTotal !== null) {
          await this.saveActualRow(firstRow);
        }
        this.applyYearFilter();
      } catch (error) {
        console.error('Error updating actual initial:', error);
        this.messageService.add({
          severity: 'error',
          summary: 'Error',
          detail: 'Failed to update actual initial. Please try again.',
          life: 3000
        });
        return;
      }
    }

    this.messageService.add({
      severity: 'success',
      summary: 'Updated',
      detail: 'Actual initial contribution updated',
      life: 2000
    });
  }

  async onMonthlyAdditionChange(): Promise<void> {
    if (this.monthlyAddition === null) return;
    localStorage.setItem(this.storageKey('monthlyAddition'), this.monthlyAddition.toString());
    await this.generateTenYearProjection();
    this.messageService.add({
      severity: 'success',
      summary: 'Updated',
      detail: 'Monthly addition updated and projections recalculated',
      life: 2000
    });
  }

  async onExpectedReturnChange(): Promise<void> {
    if (this.expectedMonthlyReturn === null) return;
    localStorage.setItem(this.storageKey('expectedMonthlyReturn'), this.expectedMonthlyReturn.toString());
    await this.generateTenYearProjection();
    this.messageService.add({
      severity: 'success',
      summary: 'Updated',
      detail: 'Expected return updated and projections recalculated',
      life: 2000
    });
  }

  async onStartDateChange(): Promise<void> {
    this.startYear = Number(this.startYear);
    this.startMonth = Number(this.startMonth);
    localStorage.setItem(this.storageKey('startYear'), this.startYear.toString());
    localStorage.setItem(this.storageKey('startMonth'), this.startMonth.toString());
    await this.portfolioService.clearAllData();
    await this.generateTenYearProjection();
    this.messageService.add({
      severity: 'success',
      summary: 'Updated',
      detail: `Projection recalculated for ${this.getProjectionRangeLabel()}`,
      life: 2000
    });
  }

  private buildStartYearOptions(): void {
    const currentYear = new Date().getFullYear();
    this.startYearOptions = [];
    for (let y = currentYear - 5; y <= currentYear + 5; y++) {
      this.startYearOptions.push(y);
    }
  }

  private loadInitialContributions(): void {
    this.resetSetupFields();

    const savedTarget = this.getStoredSetupValue('targetInitialContribution');
    const savedActual = this.getStoredSetupValue('actualInitialContribution');
    const savedMonthly = this.getStoredSetupValue('monthlyAddition');
    const savedReturn = this.getStoredSetupValue('expectedMonthlyReturn');
    const savedStartYear = this.getStoredSetupValue('startYear');
    const savedStartMonth = this.getStoredSetupValue('startMonth');

    if (savedTarget) {
      this.targetInitialContribution = parseFloat(savedTarget);
    }
    if (savedActual) {
      this.actualInitialContribution = parseFloat(savedActual);
    }
    if (savedMonthly) {
      this.monthlyAddition = parseFloat(savedMonthly);
    }
    if (savedReturn) {
      this.expectedMonthlyReturn = parseFloat(savedReturn);
    }
    if (savedStartYear) {
      this.startYear = parseInt(savedStartYear, 10);
    }
    if (savedStartMonth) {
      this.startMonth = parseInt(savedStartMonth, 10);
    } else if (this.hasLegacySetupComplete()) {
      this.startMonth = 1;
    }
  }

  private resetSetupFields(): void {
    this.targetInitialContribution = null;
    this.actualInitialContribution = null;
    this.monthlyAddition = null;
    this.expectedMonthlyReturn = null;
    this.startYear = new Date().getFullYear();
    this.startMonth = new Date().getMonth() + 1;
  }

  private getStoredSetupValue(key: string): string | null {
    const marketScopedValue = localStorage.getItem(this.storageKey(key));
    if (marketScopedValue !== null) return marketScopedValue;

    // Legacy setup keys were user-scoped only when the tracker supported USD only.
    if (this.hasLegacySetupComplete()) {
      return localStorage.getItem(`portfolio_${this.currentUserId}_${key}`);
    }

    return null;
  }

  private hasLegacySetupComplete(): boolean {
    return this.marketService.currentMarket() === 'US'
      && localStorage.getItem(`portfolio_${this.currentUserId}_setupComplete`) === 'true';
  }

  private loadPortfolioData(targets: PortfolioTargetEntry[], actuals: any[]): void {
    const actualsMap = new Map<string, { id: string, investment: number, added: number, total: number }>();
    actuals.forEach(a => {
      actualsMap.set(`${a.year}-${a.month}`, {
        id: a.id,
        investment: a.investment,
        added: a.added,
        total: a.total
      });
    });

    this.portfolioData = targets
      .map(target => {
        const key = `${target.year}-${target.month}`;
        const actual = actualsMap.get(key);

        const actualInvestment = actual?.investment;
        const actualAdded = actual?.added;
        const actualTotal = actual?.total;

        return {
          ...target,
          actualId: actual?.id ?? null,
          actualInvestment: (actualInvestment === 0 || actualInvestment === undefined) ? null : actualInvestment,
          actualAdded: (actualAdded === 0 || actualAdded === undefined) ? null : actualAdded,
          actualTotal: (actualTotal === 0 || actualTotal === undefined) ? null : actualTotal
        };
      })
      .sort((a, b) => {
        if (a.year !== b.year) return a.year - b.year;
        return a.month - b.month;
      });

    if (this.portfolioData.length > 0) {
      const firstRow = this.portfolioData[0];
      this.targetInitialContribution ??= firstRow.investment;
      this.monthlyAddition ??= firstRow.added;
      this.expectedMonthlyReturn ??= firstRow.return_percent;
      this.startYear = firstRow.year;
      this.startMonth = firstRow.month;

      if (this.actualInitialContribution !== null) {
        firstRow.actualInvestment = this.actualInitialContribution;
      } else if (firstRow.actualInvestment !== null) {
        this.actualInitialContribution = firstRow.actualInvestment;
      }
    }

    const uniqueYears = [...new Set(this.portfolioData.map(row => row.year))].sort();
    this.yearOptions = uniqueYears.map(year => ({ label: String(year), value: year }));

    if (this.selectedYears.length === 0 && uniqueYears.includes(this.startYear)) {
      this.selectedYears = [this.startYear];
    }

    this.applyYearFilter();
  }

  toggleYear(year: number): void {
    const idx = this.selectedYears.indexOf(year);
    if (idx >= 0) {
      this.selectedYears = this.selectedYears.filter(y => y !== year);
    } else {
      this.selectedYears = [...this.selectedYears, year];
    }
    this.applyYearFilter();
  }

  onYearFilterChange(): void {
    this.applyYearFilter();
  }

  private applyYearFilter(): void {
    if (this.selectedYears.length === 0) {
      this.filteredData = [...this.portfolioData];
    } else {
      this.filteredData = this.portfolioData.filter(row => this.selectedYears.includes(row.year));
    }
  }

  async onActualChange(row: PortfolioRow, showToast: boolean = true): Promise<void> {
    try {
      await this.saveActualRow(row);

      if (row.actualTotal !== null) {
        await this.updateNextMonthInvestment(row);
      }

    } catch (error) {
      console.error('Error saving actual:', error);
      this.messageService.add({
        severity: 'error',
        summary: 'Error',
        detail: 'Failed to save data. Please try again.',
        life: 3000
      });
    }
  }

  private async saveActualRow(row: PortfolioRow): Promise<void> {
    const actualTotalInvestment = (row.actualInvestment ?? 0) + (row.actualAdded ?? 0);
    const actualProfit = row.actualTotal ? row.actualTotal - actualTotalInvestment : 0;
    const actualReturnPercent = actualTotalInvestment > 0 && row.actualTotal
      ? ((row.actualTotal - actualTotalInvestment) / actualTotalInvestment) * 100
      : 0;

    const actualEntry: PortfolioActualEntry = {
      id: row.actualId ?? undefined,
      year: row.year,
      month: row.month,
      investment: row.actualInvestment ?? 0,
      added: row.actualAdded ?? 0,
      principal: actualTotalInvestment,
      total_investment: actualTotalInvestment,
      return_percent: Number(actualReturnPercent.toFixed(2)),
      profit: actualProfit,
      total: row.actualTotal ?? 0
    };

    if (row.actualId) {
      await this.portfolioService.updateActual(actualEntry);
    } else {
      await this.portfolioService.addActual(actualEntry);
      // Get the ID from the service's actuals signal without full reload
      const actuals = this.portfolioService.getActuals();
      const saved = actuals.find(a => a.year === row.year && a.month === row.month);
      if (saved?.id) {
        row.actualId = saved.id;
      }
    }
  }

  private async updateNextMonthInvestment(currentRow: PortfolioRow): Promise<void> {
    const currentIndex = this.portfolioData.findIndex(
      r => r.year === currentRow.year && r.month === currentRow.month
    );

    if (currentIndex >= 0 && currentIndex < this.portfolioData.length - 1) {
      const nextRow = this.portfolioData[currentIndex + 1];
      nextRow.actualInvestment = currentRow.actualTotal;
      await this.onActualChange(nextRow, false);
    }
  }

  formatCurrency(value: number | null): string {
    if (value === null) return '-';
    return new Intl.NumberFormat(this.portfolioLocale, {
      style: 'currency',
      currency: this.portfolioCurrency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(value);
  }

  getActualInitialContribution(): string {
    if (this.actualInitialContribution !== null) {
      return this.formatCurrency(this.actualInitialContribution);
    }
    return this.formatCurrency(this.targetInitialContribution);
  }

  getMonthName(month: number): string {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
      'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return months[(month - 1) % 12] || '';
  }

  getProjectionRangeLabel(): string {
    const startYear = Number(this.startYear);
    const startMonth = Number(this.startMonth);
    const endMonthOffset = startMonth - 1 + 119;
    const endYear = startYear + Math.floor(endMonthOffset / 12);
    const endMonth = (endMonthOffset % 12) + 1;
    return `${this.getMonthName(startMonth)} ${startYear} - ${this.getMonthName(endMonth)} ${endYear}`;
  }

  getVariance(actual: number | null, target: number): number {
    if (actual === null) return 0;
    return actual - target;
  }

  getVarianceClass(actual: number | null, target: number): string {
    if (actual === null) return '';
    const variance = actual - target;
    if (variance > 0) return 'positive';
    if (variance < 0) return 'negative';
    return '';
  }

  getOverallProfit(row: PortfolioRow): number {
    if (row.actualTotal === null) return 0;
    const cumulativePrincipal = this.getCumulativeActualPrincipal(row);
    if (cumulativePrincipal === null) return 0;
    return row.actualTotal - cumulativePrincipal;
  }

  getOverallProfitClass(row: PortfolioRow): string {
    if (row.actualTotal === null) return '';
    const cumulativePrincipal = this.getCumulativeActualPrincipal(row);
    if (cumulativePrincipal === null) return '';
    const profit = this.getOverallProfit(row);
    if (profit > 0) return 'positive';
    if (profit < 0) return 'negative';
    return '';
  }

  getCumulativeActualPrincipal(row: PortfolioRow): number | null {
    const rowIndex = this.portfolioData.findIndex(r => r.year === row.year && r.month === row.month);
    if (rowIndex === -1) return null;

    const firstRow = this.portfolioData[0];
    if (firstRow.actualInvestment === null) return null;

    let cumulativePrincipal = firstRow.actualInvestment;

    for (let i = 0; i <= rowIndex; i++) {
      const currentRow = this.portfolioData[i];
      if (currentRow.actualAdded === null) {
        if (i === 0 && rowIndex === 0) continue;
        return null;
      }
      cumulativePrincipal += currentRow.actualAdded;
    }

    return cumulativePrincipal;
  }

  getActualPrincipalDisplay(row: PortfolioRow): string {
    const principal = this.getCumulativeActualPrincipal(row);
    if (principal === null) return '-';
    return this.formatCurrency(principal);
  }

  getTargetStartingBalance(row: PortfolioRow): number {
    return row.investment;
  }

  getActualTotalInvestment(actualInvestment: number | null, actualAdded: number | null): string {
    if (actualInvestment === null || actualAdded === null) return '-';
    return this.formatCurrency(actualInvestment + actualAdded);
  }

  getActualClass(actualInvestment: number | null, actualAdded: number | null): string {
    if (actualInvestment === null || actualAdded === null) return 'no-data';
    return 'has-data';
  }

  getActualPrincipalClass(row: PortfolioRow): string {
    const principal = this.getCumulativeActualPrincipal(row);
    if (principal === null) return 'no-data';
    return 'has-data';
  }

  getActualProfit(row: PortfolioRow): string {
    if (row.actualTotal === null) return '-';
    const cumulativePrincipal = this.getCumulativeActualPrincipal(row);
    if (cumulativePrincipal === null) return '-';
    const profit = row.actualTotal - cumulativePrincipal;
    return this.formatCurrency(profit);
  }

  /**
   * Starting balance before the current month's contribution.
   * First month starts from Actual Initial; later months start from the previous actual ending value.
   */
  getStartOfMonth(row: PortfolioRow): number | null {
    const rowIndex = this.portfolioData.findIndex(r => r.year === row.year && r.month === row.month);
    if (rowIndex === -1) return null;

    if (rowIndex === 0) {
      if (this.portfolioData[0].actualInvestment === null) return null;
      return this.portfolioData[0].actualInvestment;
    } else {
      const prevRow = this.portfolioData[rowIndex - 1];
      if (prevRow.actualTotal === null) return null;
      return prevRow.actualTotal;
    }
  }

  getStartOfMonthDisplay(row: PortfolioRow): string {
    const som = this.getStartOfMonth(row);
    if (som === null) return '-';
    return this.formatCurrency(som);
  }

  getStartOfMonthClass(row: PortfolioRow): string {
    const som = this.getStartOfMonth(row);
    return som === null ? 'no-data' : 'has-data';
  }

  getTargetOverallReturn(row: PortfolioRow): string {
    if (row.principal === 0) return '-';
    const returnPct = ((row.total - row.principal) / row.principal) * 100;
    return returnPct.toFixed(1) + '%';
  }

  getActualMonthlyReturn(row: PortfolioRow): string {
    if (row.actualTotal === null) return '-';
    const startOfMonth = this.getStartOfMonth(row);
    if (startOfMonth === null || row.actualAdded === null) return '-';
    const investedThisMonth = startOfMonth + row.actualAdded;
    if (investedThisMonth === 0) return '-';
    const monthlyReturn = ((row.actualTotal - investedThisMonth) / investedThisMonth) * 100;
    return (monthlyReturn >= 0 ? '+' : '') + monthlyReturn.toFixed(1) + '%';
  }

  getMonthlyReturnClass(row: PortfolioRow): string {
    if (row.actualTotal === null) return 'no-data';
    const startOfMonth = this.getStartOfMonth(row);
    if (startOfMonth === null || row.actualAdded === null) return 'no-data';
    const investedThisMonth = startOfMonth + row.actualAdded;
    if (investedThisMonth === 0) return 'no-data';
    const monthlyReturn = ((row.actualTotal - investedThisMonth) / investedThisMonth) * 100;
    if (monthlyReturn > 0) return 'profit-positive';
    if (monthlyReturn < 0) return 'profit-negative';
    return 'has-data';
  }

  getActualReturnPercent(row: PortfolioRow): string {
    if (row.actualTotal === null) return '-';
    const cumulativePrincipal = this.getCumulativeActualPrincipal(row);
    if (cumulativePrincipal === null || cumulativePrincipal === 0) return '-';
    const returnPercent = ((row.actualTotal - cumulativePrincipal) / cumulativePrincipal) * 100;
    return returnPercent.toFixed(1) + '%';
  }

  getProfitClass(row: PortfolioRow): string {
    if (row.actualTotal === null) return 'no-data';
    const cumulativePrincipal = this.getCumulativeActualPrincipal(row);
    if (cumulativePrincipal === null) return 'no-data';
    const profit = row.actualTotal - cumulativePrincipal;
    if (profit > 0) return 'profit-positive';
    if (profit < 0) return 'profit-negative';
    return 'has-data';
  }

  getFilledRowsCount(): number {
    return this.filteredData.filter(row =>
      row.actualTotal !== null && row.actualInvestment !== null
    ).length;
  }

  getActualTotalInvested(): number {
    const filledRows = this.portfolioData.filter(row => row.actualTotal !== null);
    if (filledRows.length === 0) return 0;
    const latestRow = filledRows[filledRows.length - 1];
    const cumulativePrincipal = this.getCumulativeActualPrincipal(latestRow);
    return cumulativePrincipal ?? 0;
  }

  getLatestActualTotal(): number {
    const filledRows = this.filteredData.filter(row => row.actualTotal !== null);
    if (filledRows.length === 0) return 0;
    return filledRows[filledRows.length - 1].actualTotal ?? 0;
  }

  getTotalActualProfit(): number {
    return this.getLatestActualTotal() - this.getActualTotalInvested();
  }

  getOverallReturnPercent(): string {
    const totalInvested = this.getActualTotalInvested();
    if (totalInvested === 0) return '0.00';
    const profit = this.getTotalActualProfit();
    return ((profit / totalInvested) * 100).toFixed(2);
  }

  getTotalProfitClass(): string {
    const profit = this.getTotalActualProfit();
    if (profit > 0) return 'positive';
    if (profit < 0) return 'negative';
    return '';
  }

  getOverallVariance(): number {
    const filledRows = this.filteredData.filter(row => row.actualTotal !== null);
    if (filledRows.length === 0) return 0;
    const latestRow = filledRows[filledRows.length - 1];
    return (latestRow.actualTotal ?? 0) - latestRow.total;
  }

  getOverallVarianceClass(): string {
    const variance = this.getOverallVariance();
    if (variance > 0) return 'positive';
    if (variance < 0) return 'negative';
    return '';
  }

  getAverageYearlyReturn(): string {
    const monthsWithData = this.getFilledRowsCount();
    if (monthsWithData === 0) return '0.00';
    const overallReturn = parseFloat(this.getOverallReturnPercent());
    const avgYearlyReturn = (overallReturn / monthsWithData) * 12;
    return avgYearlyReturn.toFixed(2);
  }

  isFirstMonth(row: PortfolioRow): boolean {
    return row.year === this.startYear && row.month === this.startMonth;
  }

  clearRowData(row: PortfolioRow): void {
    this.rowToClear = row;
    this.showRowClearModal = true;
  }

  cancelRowClear(): void {
    this.showRowClearModal = false;
    this.rowToClear = null;
  }

  async confirmRowClear(): Promise<void> {
    if (!this.rowToClear) return;

    const row = this.rowToClear;

    row.actualInvestment = null;
    row.actualAdded = null;
    row.actualTotal = null;

    if (row.actualId) {
      await this.portfolioService.deleteActual(row.actualId);
      row.actualId = null;
    }

    this.showRowClearModal = false;

    this.messageService.add({
      severity: 'info',
      summary: 'Row Cleared',
      detail: `${this.getMonthName(row.month)} ${row.year} data cleared`,
      life: 2000
    });

    this.rowToClear = null;
  }

  onFileSelect(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (!input.files || input.files.length === 0) return;

    const file = input.files[0];
    const reader = new FileReader();

    reader.onload = async (e: ProgressEvent<FileReader>) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });

        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];

        const jsonData = XLSX.utils.sheet_to_json(worksheet) as any[];

        if (jsonData.length === 0) {
          this.messageService.add({
            severity: 'warn',
            summary: 'Empty File',
            detail: 'The Excel file contains no data',
            life: 3000
          });
          return;
        }

        const monthMap: { [key: string]: number } = {
          'Jan': 1, 'Feb': 2, 'Mar': 3, 'Apr': 4, 'May': 5, 'Jun': 6,
          'Jul': 7, 'Aug': 8, 'Sep': 9, 'Oct': 10, 'Nov': 11, 'Dec': 12
        };

        let importedCount = 0;
        for (const row of jsonData) {
          const year = row['Year'];
          const monthStr = row['Month'];
          const month = typeof monthStr === 'string' ? monthMap[monthStr] : monthStr;

          if (!year || !month) continue;

          const existingRow = this.portfolioData.find(
            p => p.year === year && p.month === month
          );

          if (existingRow) {
            if (row['Actual Investment'] !== null && row['Actual Investment'] !== undefined && row['Actual Investment'] !== '') {
              existingRow.actualInvestment = Number(row['Actual Investment']);
            }
            if (row['Actual Added'] !== null && row['Actual Added'] !== undefined && row['Actual Added'] !== '') {
              existingRow.actualAdded = Number(row['Actual Added']);
            }
            if (row['Actual Total'] !== null && row['Actual Total'] !== undefined && row['Actual Total'] !== '') {
              existingRow.actualTotal = Number(row['Actual Total']);
            }

            await this.onActualChange(existingRow, false);
            importedCount++;
          }
        }

        input.value = '';

        this.messageService.add({
          severity: 'success',
          summary: 'Import Complete',
          detail: `${importedCount} rows imported successfully`,
          life: 3000
        });

      } catch (error) {
        console.error('Import error:', error);
        this.messageService.add({
          severity: 'error',
          summary: 'Import Failed',
          detail: 'Could not read the Excel file. Please check the format.',
          life: 4000
        });
        input.value = '';
      }
    };

    reader.readAsArrayBuffer(file);
  }

  exportToExcel(): void {
    const exportData = this.portfolioData.map(row => {
      const actualTotalInvestment = (row.actualInvestment ?? 0) + (row.actualAdded ?? 0);
      const actualProfit = row.actualTotal ? row.actualTotal - actualTotalInvestment : null;
      const actualReturnPercent = actualTotalInvestment > 0 && row.actualTotal
        ? ((row.actualTotal - actualTotalInvestment) / actualTotalInvestment) * 100
        : null;
      const variance = row.actualTotal !== null ? row.actualTotal - row.total : null;

      return {
        'Year': row.year,
        'Month': this.getMonthName(row.month),
        'Target Investment': row.investment,
        'Actual Investment': row.actualInvestment,
        'Target Added': row.added,
        'Actual Added': row.actualAdded,
        'Target Principal': row.principal,
        'Actual Principal': row.actualInvestment !== null && row.actualAdded !== null ? actualTotalInvestment : null,
        'Target Total Invested': row.total_investment,
        'Actual Total Invested': row.actualInvestment !== null && row.actualAdded !== null ? actualTotalInvestment : null,
        'Target Return %': row.return_percent,
        'Actual Return %': actualReturnPercent !== null ? Number(actualReturnPercent.toFixed(2)) : null,
        'Target Profit': row.profit,
        'Actual Profit': actualProfit,
        'Target Total': row.total,
        'Actual Total': row.actualTotal,
        'Variance': variance
      };
    });

    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Portfolio Data');

    const colWidths = [
      { wch: 6 }, { wch: 8 }, { wch: 18 }, { wch: 18 },
      { wch: 14 }, { wch: 14 }, { wch: 16 }, { wch: 16 },
      { wch: 20 }, { wch: 20 }, { wch: 14 }, { wch: 14 },
      { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 14 },
      { wch: 12 }
    ];
    worksheet['!cols'] = colWidths;

    const today = new Date();
    const dateStr = today.toISOString().split('T')[0];
    const filename = `Portfolio_Data_${dateStr}.xlsx`;

    XLSX.writeFile(workbook, filename);

    this.messageService.add({
      severity: 'success',
      summary: 'Export Complete',
      detail: `Data exported to ${filename}`,
      life: 3000
    });
  }
}
