import { Injectable, inject, signal, computed } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';

import { AuthService } from './auth.service';
import { MarketService } from './market.service';
import { FireGoalsService } from './fire-goals.service';
import { PortfolioTrackerService } from './portfolio-tracker.service';
import { PaperTradingService } from './paper-trading.service';
import { StockService } from './stock.service';
import { calculateFireProjection } from '../utils/fire-goals-calculations';
import { environment } from '../../../environments/environment';

export interface DashboardFireSummary {
  hasGoal: boolean;
  progressPercent: number;
  netWorth: number;
  fireTarget: number;
  yearsToRetirement: number;
  monthsRemainder: number;
  onTrack: boolean;
  requiredMonthly: number;
  requiredAnnual: number;
  currency: string;
}

export interface DashboardPortfolioSummary {
  hasData: boolean;
  totalValue: number;
  totalInvested: number;
  totalProfit: number;
  returnPercent: number;
  annualizedReturn: number;
  monthsTracked: number;
  avgMonthlyAdd: number;
  bestMonthReturn: number;
  trackingSince: string;
  goalValue: number;
  goalProgress: number;
  goalTargetDate: string;
  currency: string;
}

export interface DashboardPaperSummary {
  enabled: boolean;
  positionCount: number;
  totalEquity: number;
  totalPnl: number;
  realizedPnl: number;
  unrealizedPnl: number;
  returnPercent: number;
  cashBalance: number;
  startingCash: number;
  tradeCount: number;
  winRate: number;
  tradingSince: string;
  currency: string;
}

export interface DashboardPick {
  symbol: string;
  score: number;
  buy_target: number;
  sell_target: number;
  stop_loss: number;
  signals: string[];
}

export interface DashboardNewsItem {
  title: string;
  link: string;
  source: string;
  timeAgo: string;
  type: string;
}

@Injectable({ providedIn: 'root' })
export class DashboardService {
  private http = inject(HttpClient);
  private auth = inject(AuthService);
  private marketService = inject(MarketService);
  private fireService = inject(FireGoalsService);
  private portfolioService = inject(PortfolioTrackerService);
  private paperService = inject(PaperTradingService);
  private stockService = inject(StockService);

  readonly loading = signal(false);
  readonly picks = signal<DashboardPick[]>([]);
  readonly news = signal<DashboardNewsItem[]>([]);
  private readonly paperLivePrices = signal<Record<string, number | null>>({});

  readonly fireSummary = computed<DashboardFireSummary>(() => {
    const goal = this.fireService.goal();
    const assets = this.fireService.assets();
    const liabilities = this.fireService.liabilities();
    const market = this.marketService.currentMarket();
    const currency = market === 'US' ? 'USD' : 'INR';

    if (!goal) {
      return { hasGoal: false, progressPercent: 0, netWorth: 0, fireTarget: 0, yearsToRetirement: 0, monthsRemainder: 0, onTrack: false, requiredMonthly: 0, requiredAnnual: 0, currency };
    }

    const projection = calculateFireProjection(goal, assets, liabilities);
    const progressPercent = goal.fire_amount > 0
      ? Math.min(100, (projection.summary.netWorth / goal.fire_amount) * 100)
      : 0;

    const totalMonths = projection.summary.monthsToRetirement;
    const gap = Math.max(0, goal.fire_amount - projection.summary.netWorth);
    const months = totalMonths || 1;
    const simpleMonthly = gap / months;
    const simpleAnnual = simpleMonthly * 12;

    return {
      hasGoal: true,
      progressPercent,
      netWorth: projection.summary.netWorth,
      fireTarget: goal.fire_amount,
      yearsToRetirement: Math.floor(totalMonths / 12),
      monthsRemainder: totalMonths % 12,
      onTrack: projection.summary.onTrack,
      requiredMonthly: simpleMonthly,
      requiredAnnual: simpleAnnual,
      currency,
    };
  });

  readonly portfolioSummary = computed<DashboardPortfolioSummary>(() => {
    const actuals = this.portfolioService.actuals();
    const targets = this.portfolioService.targets();
    const market = this.marketService.currentMarket();
    const currency = market === 'US' ? 'USD' : 'INR';
    const empty: DashboardPortfolioSummary = {
      hasData: false, totalValue: 0, totalInvested: 0, totalProfit: 0,
      returnPercent: 0, annualizedReturn: 0, monthsTracked: 0, avgMonthlyAdd: 0,
      bestMonthReturn: 0, trackingSince: '', goalValue: 0, goalProgress: 0, goalTargetDate: '', currency,
    };

    const dataSource = actuals.filter(a => a.total > 0).length ? actuals.filter(a => a.total > 0) : targets;
    if (!dataSource.length) return empty;

    const latest = dataSource[dataSource.length - 1];
    const totalInvested = latest.total_investment || 0;
    const totalValue = latest.total || 0;
    const totalProfit = (latest as any).profit != null ? (latest as any).profit : totalValue - totalInvested;
    const returnPercent = totalInvested > 0 ? (totalProfit / totalInvested) * 100 : 0;

    const monthsTracked = dataSource.length;
    const years = monthsTracked / 12;
    const annualizedReturn = years > 0 && totalInvested > 0
      ? ((Math.pow(totalValue / totalInvested, 1 / years)) - 1) * 100
      : returnPercent;

    const totalAdded = dataSource.reduce((sum, e) => sum + (e.added || 0), 0);
    const avgMonthlyAdd = monthsTracked > 0 ? totalAdded / monthsTracked : 0;

    const bestMonthReturn = dataSource.reduce((best, e) => Math.max(best, e.return_percent || 0), 0);

    const first = dataSource[0];
    const trackingSince = new Date(first.year, first.month - 1)
      .toLocaleDateString('en-US', { month: 'short', year: 'numeric' });

    const lastTarget = targets.length ? targets[targets.length - 1] : null;
    const goalValue = lastTarget?.total ?? 0;
    const goalProgress = goalValue > 0 ? Math.min((totalValue / goalValue) * 100, 100) : 0;
    const goalTargetDate = lastTarget
      ? new Date(lastTarget.year, lastTarget.month - 1).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
      : '';

    return {
      hasData: true, totalValue, totalInvested, totalProfit, returnPercent,
      annualizedReturn, monthsTracked, avgMonthlyAdd, bestMonthReturn, trackingSince,
      goalValue, goalProgress, goalTargetDate, currency,
    };
  });

  readonly paperSummary = computed<DashboardPaperSummary>(() => {
    const account = this.paperService.account();
    const positions = this.paperService.positions();
    const trades = this.paperService.trades();
    const market = this.marketService.currentMarket();
    const currency = market === 'US' ? 'USD' : 'INR';

    const empty: DashboardPaperSummary = {
      enabled: false, positionCount: 0, totalEquity: 0, totalPnl: 0,
      realizedPnl: 0, unrealizedPnl: 0, returnPercent: 0, cashBalance: 0,
      startingCash: 0, tradeCount: 0, winRate: 0, tradingSince: '', currency,
    };

    if (!account?.enabled) return empty;

    const summary = this.paperService.getSummary(this.paperLivePrices());

    const sellTrades = trades.filter(t => t.action === 'SELL');
    const winningTrades = sellTrades.filter(t => (t.realized_pnl ?? 0) > 0);
    const winRate = sellTrades.length > 0 ? (winningTrades.length / sellTrades.length) * 100 : 0;

    let tradingSince = '';
    if (account.created_at) {
      const created = new Date(account.created_at);
      tradingSince = created.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
    }

    return {
      enabled: true,
      positionCount: positions.length,
      totalEquity: summary.totalEquity,
      totalPnl: summary.totalPnl,
      realizedPnl: summary.realizedPnl,
      unrealizedPnl: summary.unrealizedPnl,
      returnPercent: summary.totalReturnPercent,
      cashBalance: summary.cashBalance,
      startingCash: account.starting_cash ?? 0,
      tradeCount: trades.length,
      winRate,
      tradingSince,
      currency,
    };
  });

  async loadAll(): Promise<void> {
    this.loading.set(true);
    const market = this.marketService.currentMarket();

    const loads = [
      this.fireService.loadData().catch(e => console.error('[Dashboard] FIRE load error:', e)),
      this.portfolioService.loadData().catch(e => console.error('[Dashboard] Portfolio load error:', e)),
      this.paperService.loadData().then(() => this.loadPaperLivePrices(market)).catch(e => console.error('[Dashboard] Paper load error:', e)),
      this.loadPicks(market),
      this.loadNews(market),
    ];

    await Promise.allSettled(loads);
    this.loading.set(false);
  }

  private async loadPaperLivePrices(market: string): Promise<void> {
    const positions = this.paperService.positions();
    if (positions.length === 0) return;

    const symbols = positions.map(p => p.symbol).filter(Boolean);
    if (symbols.length === 0) return;

    try {
      const stocks = await firstValueFrom(this.stockService.getQuotes(symbols, market as any));
      const prices = stocks.reduce<Record<string, number | null>>((acc, stock) => {
        acc[stock.symbol] = stock.price;
        return acc;
      }, {});
      this.paperLivePrices.set(prices);
    } catch {
      this.paperLivePrices.set({});
    }
  }

  private async loadPicks(market: string): Promise<void> {
    try {
      const today = new Date();
      const month = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
      const url = `${environment.apiBaseUrl}/api/stocks?action=daily-picks&market=${market}&month=${month}`;
      const data: any = await firstValueFrom(this.http.get(url));
      const allPicks: any[] = data?.picks ?? [];
      const todayStr = today.toISOString().slice(0, 10);
      const todayPicks = allPicks.filter((p: any) => p.pick_date === todayStr);
      this.picks.set(todayPicks.slice(0, 5).map((p: any) => ({
        symbol: p.symbol,
        score: p.score,
        buy_target: p.buy_target,
        sell_target: p.sell_target,
        stop_loss: p.stop_loss,
        signals: p.signals ?? [],
      })));
    } catch {
      this.picks.set([]);
    }
  }

  private async loadNews(market: string): Promise<void> {
    try {
      const url = `${environment.apiBaseUrl}/api/market?action=news&market=${market}`;
      const data: any = await firstValueFrom(this.http.get(url));
      const articles: any[] = data?.news ?? [];
      this.news.set(articles.slice(0, 5).map((a: any) => ({
        title: a.title,
        link: a.link,
        source: a.source,
        timeAgo: a.timeAgo ?? '',
        type: a.type ?? 'general',
      })));
    } catch {
      this.news.set([]);
    }
  }
}
