import { Component, OnInit, inject, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import * as XLSX from 'xlsx';

import { TableModule } from 'primeng/table';
import { ButtonModule } from 'primeng/button';
import { InputNumberModule } from 'primeng/inputnumber';
import { ToastModule } from 'primeng/toast';
import { MultiSelectModule } from 'primeng/multiselect';
import { ProgressSpinnerModule } from 'primeng/progressspinner';
import { MessageService } from 'primeng/api';

import { PortfolioTargetEntry } from '../../core/models';
import { PortfolioTrackerService } from '../../core/services';

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
    MultiSelectModule,
    ProgressSpinnerModule
  ],
  providers: [MessageService],
  templateUrl: './portfolio-tracker.component.html',
  styleUrls: ['./portfolio-tracker.component.scss']
})
export class PortfolioTrackerComponent implements OnInit {
  private portfolioService = inject(PortfolioTrackerService);
  private messageService = inject(MessageService);

  portfolioData: PortfolioRow[] = [];
  filteredData: PortfolioRow[] = [];
  showConfirmModal = false;
  showRowClearModal = false;
  rowToClear: PortfolioRow | null = null;
  yearOptions: { label: string; value: number }[] = [];
  selectedYears: number[] = [];
  isLoading = true;

  targetInitialContribution: number = 100000;
  actualInitialContribution: number | null = null;

  private dataLoaded = false;

  constructor() {
    effect(() => {
      const loading = this.portfolioService.loading();
      this.isLoading = loading;

      if (!loading) {
        const targets = this.portfolioService.targets();
        const actuals = this.portfolioService.actuals();

        if (!this.dataLoaded && targets.length === 0) {
          this.dataLoaded = true;
          this.generateTenYearProjection();
        } else if (targets.length > 0) {
          this.dataLoaded = true;
          this.loadPortfolioData(targets, actuals);
        }
      }
    });
  }

  ngOnInit(): void {
    this.loadInitialContributions();
    this.portfolioService.loadData();
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

    const startingInvestment = this.targetInitialContribution;
    const monthlyAddition = 3500;
    const monthlyReturnPercent = 1.6;

    let previousTotal = startingInvestment;
    let previousPrincipal = startingInvestment;

    const startYear = 2025;

    for (let i = 1; i <= 120; i++) {
      const year = startYear + Math.floor((i - 1) / 12);
      const monthNumber = ((i - 1) % 12) + 1;

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

    await this.portfolioService.setTargets(targets);
  }

  async onTargetInitialChange(): Promise<void> {
    localStorage.setItem('portfolio_targetInitialContribution', this.targetInitialContribution.toString());
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
      localStorage.setItem('portfolio_actualInitialContribution', this.actualInitialContribution.toString());
    } else {
      localStorage.removeItem('portfolio_actualInitialContribution');
    }

    if (this.portfolioData.length > 0) {
      const firstRow = this.portfolioData[0];
      firstRow.actualInvestment = this.actualInitialContribution;
      await this.onActualChange(firstRow, false);
    }

    this.messageService.add({
      severity: 'success',
      summary: 'Updated',
      detail: 'Actual initial contribution updated',
      life: 2000
    });
  }

  private loadInitialContributions(): void {
    const savedTarget = localStorage.getItem('portfolio_targetInitialContribution');
    const savedActual = localStorage.getItem('portfolio_actualInitialContribution');

    if (savedTarget) {
      this.targetInitialContribution = parseFloat(savedTarget);
    }
    if (savedActual) {
      this.actualInitialContribution = parseFloat(savedActual);
    }
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
      if (this.actualInitialContribution !== null) {
        firstRow.actualInvestment = this.actualInitialContribution;
      } else if (firstRow.actualInvestment !== null) {
        this.actualInitialContribution = firstRow.actualInvestment;
      }
    }

    const uniqueYears = [...new Set(this.portfolioData.map(row => row.year))].sort();
    this.yearOptions = uniqueYears.map(year => ({ label: String(year), value: year }));

    if (this.selectedYears.length === 0 && uniqueYears.includes(2025)) {
      this.selectedYears = [2025];
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
    const actualTotalInvestment = (row.actualInvestment ?? 0) + (row.actualAdded ?? 0);
    const actualProfit = row.actualTotal ? row.actualTotal - actualTotalInvestment : 0;
    const actualReturnPercent = actualTotalInvestment > 0 && row.actualTotal
      ? ((row.actualTotal - actualTotalInvestment) / actualTotalInvestment) * 100
      : 0;

    const actualEntry = {
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

    try {
      if (row.actualId) {
        await this.portfolioService.updateActual(actualEntry);
      } else {
        await this.portfolioService.addActual(actualEntry);
        // After adding, reload to get the ID
        await this.portfolioService.loadData();
      }

      if (row.actualTotal !== null) {
        await this.updateNextMonthInvestment(row);
      }

      if (showToast) {
        this.messageService.add({
          severity: 'success',
          summary: 'Saved',
          detail: `Year ${row.year}, Month ${row.month} updated`,
          life: 1500
        });
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
    return new Intl.NumberFormat('en-US', {
      style: 'decimal',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(value);
  }

  getActualInitialContribution(): string {
    if (this.actualInitialContribution !== null) {
      return '$' + this.formatCurrency(this.actualInitialContribution);
    }
    return '$' + this.formatCurrency(this.targetInitialContribution);
  }

  getMonthName(month: number): string {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
      'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return months[(month - 1) % 12] || '';
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
      if (currentRow.actualAdded === null) return null;
      cumulativePrincipal += currentRow.actualAdded;
    }

    return cumulativePrincipal;
  }

  getActualPrincipalDisplay(row: PortfolioRow): string {
    const principal = this.getCumulativeActualPrincipal(row);
    if (principal === null) return '-';
    return this.formatCurrency(principal);
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
    return row.year === 2025 && row.month === 1;
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
