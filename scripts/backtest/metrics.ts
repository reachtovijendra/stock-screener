/**
 * Backtest metrics calculator.
 * Aggregates trade-level results into model-level statistics.
 */

import { SimulatedTrade } from './engine';
import { TradeOutcome } from './evaluate-trade';

export interface ModelMetrics {
  modelName: string;
  totalTrades: number;
  wins: number;
  losses: number;
  noTrigger: number;
  closedFlat: number;
  gapBelowStop: number;
  winRate: number;         // wins / (wins + losses) as percentage
  avgPnl: number;          // average P&L per trade (%)
  totalPnl: number;        // cumulative P&L (%)
  maxDrawdown: number;     // worst peak-to-trough (%)
  profitFactor: number;    // gross profit / gross loss
  avgWin: number;          // average winning P&L (%)
  avgLoss: number;         // average losing P&L (%)
  tradingDays: number;
  avgPicksPerDay: number;
  // Breakdowns
  byOutcome: Record<TradeOutcome, number>;
  bySetup: Record<string, { trades: number; winRate: number; avgPnl: number }>;
}

export function computeMetrics(modelName: string, trades: SimulatedTrade[]): ModelMetrics {
  const activeTrades = trades.filter(t => t.outcome !== 'no-trigger');
  const wins = activeTrades.filter(t => t.outcome === 'hit-target');
  const losses = activeTrades.filter(t => t.outcome === 'hit-sl' || t.outcome === 'gap-below-stop');
  const flat = activeTrades.filter(t => t.outcome === 'closed-flat');
  const noTrigger = trades.filter(t => t.outcome === 'no-trigger');

  const winCount = wins.length;
  const lossCount = losses.length;
  const decisionTrades = winCount + lossCount; // trades with clear outcome

  const winRate = decisionTrades > 0 ? (winCount / decisionTrades) * 100 : 0;

  // P&L calculations
  const allPnls = activeTrades.map(t => t.pnlPercent);
  const avgPnl = allPnls.length > 0 ? allPnls.reduce((a, b) => a + b, 0) / allPnls.length : 0;
  const totalPnl = allPnls.reduce((a, b) => a + b, 0);

  const avgWin = wins.length > 0 ? wins.reduce((a, t) => a + t.pnlPercent, 0) / wins.length : 0;
  const avgLoss = losses.length > 0 ? losses.reduce((a, t) => a + t.pnlPercent, 0) / losses.length : 0;

  // Profit factor
  const grossProfit = wins.reduce((a, t) => a + t.pnlPercent, 0);
  const grossLoss = Math.abs(losses.reduce((a, t) => a + t.pnlPercent, 0));
  const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? Infinity : 0;

  // Max drawdown (cumulative P&L curve)
  let peak = 0;
  let cumPnl = 0;
  let maxDrawdown = 0;
  for (const t of activeTrades) {
    cumPnl += t.pnlPercent;
    if (cumPnl > peak) peak = cumPnl;
    const dd = peak - cumPnl;
    if (dd > maxDrawdown) maxDrawdown = dd;
  }

  // Trading days
  const uniqueDays = new Set(trades.map(t => t.date));
  const tradingDays = uniqueDays.size;
  const avgPicksPerDay = tradingDays > 0 ? trades.length / tradingDays : 0;

  // Outcome breakdown
  const byOutcome: Record<string, number> = {};
  for (const t of trades) {
    byOutcome[t.outcome] = (byOutcome[t.outcome] || 0) + 1;
  }

  // Setup type breakdown
  const setupGroups: Record<string, SimulatedTrade[]> = {};
  for (const t of activeTrades) {
    const key = t.setupType || 'unknown';
    if (!setupGroups[key]) setupGroups[key] = [];
    setupGroups[key].push(t);
  }
  const bySetup: Record<string, { trades: number; winRate: number; avgPnl: number }> = {};
  for (const [setup, strades] of Object.entries(setupGroups)) {
    const sw = strades.filter(t => t.outcome === 'hit-target').length;
    const sl = strades.filter(t => t.outcome === 'hit-sl' || t.outcome === 'gap-below-stop').length;
    const sPnl = strades.reduce((a, t) => a + t.pnlPercent, 0) / strades.length;
    bySetup[setup] = {
      trades: strades.length,
      winRate: sw + sl > 0 ? (sw / (sw + sl)) * 100 : 0,
      avgPnl: Math.round(sPnl * 100) / 100,
    };
  }

  return {
    modelName,
    totalTrades: trades.length,
    wins: winCount,
    losses: lossCount,
    noTrigger: noTrigger.length,
    closedFlat: flat.length,
    gapBelowStop: trades.filter(t => t.outcome === 'gap-below-stop').length,
    winRate: Math.round(winRate * 10) / 10,
    avgPnl: Math.round(avgPnl * 100) / 100,
    totalPnl: Math.round(totalPnl * 100) / 100,
    maxDrawdown: Math.round(maxDrawdown * 100) / 100,
    profitFactor: Math.round(profitFactor * 100) / 100,
    avgWin: Math.round(avgWin * 100) / 100,
    avgLoss: Math.round(avgLoss * 100) / 100,
    tradingDays,
    avgPicksPerDay: Math.round(avgPicksPerDay * 10) / 10,
    byOutcome: byOutcome as any,
    bySetup,
  };
}

/**
 * Print a comparison table of multiple model results.
 */
export function printComparisonTable(results: ModelMetrics[]): void {
  console.log('\n' + '═'.repeat(120));
  console.log('BACKTEST RESULTS');
  console.log('═'.repeat(120));

  // Header
  const header = [
    'Model'.padEnd(22),
    'Trades'.padStart(7),
    'Wins'.padStart(6),
    'Losses'.padStart(7),
    'NoTrig'.padStart(7),
    'Win%'.padStart(7),
    'AvgP&L'.padStart(8),
    'TotalP&L'.padStart(9),
    'MaxDD'.padStart(8),
    'PF'.padStart(6),
    'AvgWin'.padStart(8),
    'AvgLoss'.padStart(8),
  ].join(' │ ');
  console.log(header);
  console.log('─'.repeat(120));

  for (const m of results) {
    const row = [
      m.modelName.substring(0, 22).padEnd(22),
      String(m.totalTrades).padStart(7),
      String(m.wins).padStart(6),
      String(m.losses).padStart(7),
      String(m.noTrigger).padStart(7),
      `${m.winRate.toFixed(1)}%`.padStart(7),
      `${m.avgPnl >= 0 ? '+' : ''}${m.avgPnl.toFixed(2)}%`.padStart(8),
      `${m.totalPnl >= 0 ? '+' : ''}${m.totalPnl.toFixed(1)}%`.padStart(9),
      `-${m.maxDrawdown.toFixed(1)}%`.padStart(8),
      m.profitFactor.toFixed(2).padStart(6),
      `+${m.avgWin.toFixed(2)}%`.padStart(8),
      `${m.avgLoss.toFixed(2)}%`.padStart(8),
    ].join(' │ ');
    console.log(row);
  }

  console.log('═'.repeat(120));

  // Print setup breakdowns for best model
  const best = results.reduce((a, b) => a.winRate > b.winRate ? a : b);
  console.log(`\nBest model: ${best.modelName} (${best.winRate.toFixed(1)}% win rate)`);
  if (Object.keys(best.bySetup).length > 0) {
    console.log('\nSetup Type Breakdown:');
    for (const [setup, stats] of Object.entries(best.bySetup)) {
      console.log(`  ${setup.padEnd(15)} — ${stats.trades} trades, ${stats.winRate.toFixed(1)}% win, avg P&L ${stats.avgPnl >= 0 ? '+' : ''}${stats.avgPnl.toFixed(2)}%`);
    }
  }
}
