import { Market } from '../models';

export type RecommendationOutcome = 'hit-target' | 'hit-sl' | 'exit-at-close' | 'no-trigger' | null;
export type PaperTradeAction = 'BUY' | 'SELL';
export type RecommendationSimulationTone = 'positive' | 'negative' | 'neutral' | 'pending';

export interface RecommendationSimulationPick {
  symbol: string;
  name: string;
  market: Market | string;
  pick_date: string;
  score: number;
  buy_price: number;
  sell_price: number;
  stop_loss: number;
  outcome: RecommendationOutcome;
  pnl_percent: number | null;
  actual_close: number | null;
}

export interface RecommendationSimulatedTrade {
  symbol: string;
  name: string;
  pickDate: string;
  score: number;
  plannedInvestment: number;
  deployedInvestment: number;
  sharesBought: number;
  entryPrice: number;
  exitPrice: number | null;
  exitReason: 'Target' | 'Stop Loss' | 'Close' | 'Not Traded' | 'Pending';
  detailedExitReason: string;
  boughtAtLabel: string;
  soldAtLabel: string;
  pnlPercent: number;
  pnlAmount: number;
  resultTone: RecommendationSimulationTone;
  outcome: RecommendationOutcome | 'pending';
}

export interface RecommendationSimulationSummary {
  totalPicks: number;
  triggeredTrades: number;
  winningTrades: number;
  losingTrades: number;
  notTradedCount: number;
  pendingCount: number;
  totalPlannedInvestment: number;
  totalDeployedInvestment: number;
  totalPnl: number;
  returnPercent: number;
  winRate: number;
  averagePnlPercent: number;
}

export interface RecommendationSimulationResult {
  trades: RecommendationSimulatedTrade[];
  summary: RecommendationSimulationSummary;
}

export interface PaperAccountState {
  id?: string;
  user_id?: string;
  market: Market;
  starting_cash: number;
  cash_balance: number;
  enabled: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface PaperPositionState {
  id?: string;
  user_id?: string;
  market: Market;
  symbol: string;
  name: string | null;
  quantity: number;
  average_cost: number;
  updated_at?: string;
}

export interface PaperOrderState {
  action: PaperTradeAction;
  symbol: string;
  name: string | null;
  quantity: number;
  execution_price: number;
}

export interface PaperTradeState extends PaperOrderState {
  realized_pnl: number | null;
  realized_pnl_percent: number | null;
  executed_at: string;
}

export interface PaperOrderApplication {
  account: PaperAccountState;
  position: PaperPositionState | null;
  trade: PaperTradeState;
}

const SCORE_MIN = 0;
const SCORE_MAX = 100;

const INVESTMENT_RANGES: Record<Market, { min: number; max: number }> = {
  US: { min: 1000, max: 5000 },
  IN: { min: 5000, max: 25000 },
};

const MANUAL_STARTING_CASH: Record<Market, number> = {
  US: 100000,
  IN: 1000000,
};

export function getManualStartingCash(market: Market): number {
  return MANUAL_STARTING_CASH[market];
}

export function getRecommendationInvestmentRange(market: Market): { min: number; max: number } {
  return INVESTMENT_RANGES[market];
}

export function calculateScoreInvestment(score: number, market: Market): number {
  const range = getRecommendationInvestmentRange(market);
  const clampedScore = Math.max(SCORE_MIN, Math.min(SCORE_MAX, score));
  const ratio = (clampedScore - SCORE_MIN) / (SCORE_MAX - SCORE_MIN);
  return roundMoney(range.min + ratio * (range.max - range.min));
}

export function getScoreInvestmentFormulaLabel(market: Market): string {
  const range = getRecommendationInvestmentRange(market);
  const currency = market === 'IN' ? 'INR' : 'USD';
  return `${currency} ${formatPlainNumber(range.min)} + (score / 100) x ${currency} ${formatPlainNumber(range.max - range.min)}`;
}

export function buildRecommendationSimulation(
  picks: RecommendationSimulationPick[],
  market: Market
): RecommendationSimulationResult {
  const trades = picks.map(pick => buildRecommendationTrade(pick, market));
  const triggeredTrades = trades.filter(trade => trade.deployedInvestment > 0);
  const totalDeployedInvestment = sum(triggeredTrades.map(trade => trade.deployedInvestment));
  const totalPnl = sum(triggeredTrades.map(trade => trade.pnlAmount));
  const winningTrades = triggeredTrades.filter(trade => trade.pnlAmount > 0).length;
  const losingTrades = triggeredTrades.filter(trade => trade.pnlAmount < 0).length;

  return {
    trades,
    summary: {
      totalPicks: trades.length,
      triggeredTrades: triggeredTrades.length,
      winningTrades,
      losingTrades,
      notTradedCount: trades.filter(trade => trade.exitReason === 'Not Traded').length,
      pendingCount: trades.filter(trade => trade.exitReason === 'Pending').length,
      totalPlannedInvestment: sum(trades.map(trade => trade.plannedInvestment)),
      totalDeployedInvestment,
      totalPnl: roundMoney(totalPnl),
      returnPercent: totalDeployedInvestment > 0 ? roundPercent((totalPnl / totalDeployedInvestment) * 100) : 0,
      winRate: triggeredTrades.length > 0 ? roundPercent((winningTrades / triggeredTrades.length) * 100) : 0,
      averagePnlPercent: triggeredTrades.length > 0
        ? roundPercent(sum(triggeredTrades.map(trade => trade.pnlPercent)) / triggeredTrades.length)
        : 0,
    },
  };
}

export function applyPaperOrder(params: {
  account: PaperAccountState;
  position: PaperPositionState | null;
  order: PaperOrderState;
  executedAt?: string;
}): PaperOrderApplication {
  const order = normalizeOrder(params.order);

  if (order.action === 'BUY') {
    return applyBuyOrder(params.account, params.position, order, params.executedAt);
  }

  return applySellOrder(params.account, params.position, order, params.executedAt);
}

function buildRecommendationTrade(
  pick: RecommendationSimulationPick,
  market: Market
): RecommendationSimulatedTrade {
  const plannedInvestment = calculateScoreInvestment(pick.score, market);
  const outcome = getEffectiveOutcome(pick);
  const pnlPercent = getRecommendationPnlPercent(pick, outcome);
  const isTriggered = outcome === 'hit-target' || outcome === 'hit-sl' || outcome === 'exit-at-close';
  const deployedInvestment = isTriggered ? plannedInvestment : 0;
  const pnlAmount = roundMoney(deployedInvestment * (pnlPercent / 100));

  return {
    symbol: pick.symbol,
    name: pick.name,
    pickDate: pick.pick_date,
    score: pick.score,
    plannedInvestment,
    deployedInvestment,
    sharesBought: getSharesBought(deployedInvestment, pick.buy_price),
    entryPrice: pick.buy_price,
    exitPrice: getExitPrice(pick, outcome, pnlPercent),
    exitReason: getExitReason(outcome),
    detailedExitReason: getDetailedExitReason(outcome, pnlPercent),
    boughtAtLabel: getBoughtAtLabel(pick.pick_date, outcome),
    soldAtLabel: getSoldAtLabel(pick.pick_date, market, outcome),
    pnlPercent,
    pnlAmount,
    resultTone: getResultTone(outcome, pnlAmount),
    outcome,
  };
}

function getEffectiveOutcome(pick: RecommendationSimulationPick): RecommendationOutcome | 'pending' {
  if (pick.outcome) return pick.outcome;

  const today = new Date().toISOString().slice(0, 10);
  return pick.pick_date > today ? 'pending' : 'no-trigger';
}

function getRecommendationPnlPercent(
  pick: RecommendationSimulationPick,
  outcome: RecommendationOutcome | 'pending'
): number {
  if (pick.pnl_percent != null) return roundPercent(pick.pnl_percent);
  if (outcome === 'hit-target') return roundPercent(((pick.sell_price - pick.buy_price) / pick.buy_price) * 100);
  if (outcome === 'hit-sl') return roundPercent(((pick.stop_loss - pick.buy_price) / pick.buy_price) * 100);
  if (outcome === 'exit-at-close' && pick.actual_close != null) {
    return roundPercent(((pick.actual_close - pick.buy_price) / pick.buy_price) * 100);
  }
  return 0;
}

function getExitPrice(
  pick: RecommendationSimulationPick,
  outcome: RecommendationOutcome | 'pending',
  pnlPercent: number
): number | null {
  if (outcome === 'hit-target') return pick.sell_price;
  if (outcome === 'hit-sl') return pick.stop_loss;
  if (outcome === 'exit-at-close') return pick.actual_close ?? roundMoney(pick.buy_price * (1 + pnlPercent / 100));
  return null;
}

function getExitReason(outcome: RecommendationOutcome | 'pending'): RecommendationSimulatedTrade['exitReason'] {
  if (outcome === 'hit-target') return 'Target';
  if (outcome === 'hit-sl') return 'Stop Loss';
  if (outcome === 'exit-at-close') return 'Close';
  if (outcome === 'pending') return 'Pending';
  return 'Not Traded';
}

function getDetailedExitReason(
  outcome: RecommendationOutcome | 'pending',
  pnlPercent: number
): string {
  if (outcome === 'hit-target') return 'Sell target hit';
  if (outcome === 'hit-sl') return 'Stop loss hit';
  if (outcome === 'exit-at-close') {
    if (pnlPercent > 0) return 'Closed profitably';
    if (pnlPercent < 0) return 'Closed at a loss';
    return 'Closed flat';
  }
  if (outcome === 'pending') return 'Pending evaluation';
  return "Buy price didn't hit";
}

function getResultTone(
  outcome: RecommendationOutcome | 'pending',
  pnlAmount: number
): RecommendationSimulationTone {
  if (outcome === 'pending') return 'pending';
  if (outcome === 'no-trigger' || outcome == null) return 'neutral';
  if (pnlAmount > 0) return 'positive';
  if (pnlAmount < 0) return 'negative';
  return 'neutral';
}

function getSharesBought(deployedInvestment: number, entryPrice: number): number {
  if (deployedInvestment <= 0 || entryPrice <= 0) return 0;
  return roundQuantity(deployedInvestment / entryPrice);
}

function getBoughtAtLabel(
  pickDate: string,
  outcome: RecommendationOutcome | 'pending'
): string {
  if (outcome === 'pending') return 'Pending';
  if (outcome === 'no-trigger' || outcome == null) return 'Not bought';
  return `${formatTradeDate(pickDate)}, buy trigger hit intraday`;
}

function getSoldAtLabel(
  pickDate: string,
  market: Market,
  outcome: RecommendationOutcome | 'pending'
): string {
  if (outcome === 'pending') return 'Pending';
  if (outcome === 'no-trigger' || outcome == null) return 'Not sold';

  const date = formatTradeDate(pickDate);
  if (outcome === 'hit-target') return `${date}, sell target hit intraday`;
  if (outcome === 'hit-sl') return `${date}, stop loss hit intraday`;

  const closeTime = market === 'IN' ? '3:30 PM IST' : '4:00 PM ET';
  return `${date}, ${closeTime} market close`;
}

function applyBuyOrder(
  account: PaperAccountState,
  position: PaperPositionState | null,
  order: PaperOrderState,
  executedAt?: string
): PaperOrderApplication {
  const cost = roundMoney(order.quantity * order.execution_price);
  if (cost > account.cash_balance) {
    throw new Error('Insufficient cash balance for this paper trade');
  }

  const existingQuantity = position?.quantity ?? 0;
  const existingCost = existingQuantity * (position?.average_cost ?? 0);
  const newQuantity = existingQuantity + order.quantity;
  const newAverageCost = roundMoney((existingCost + cost) / newQuantity);

  return {
    account: {
      ...account,
      cash_balance: roundMoney(account.cash_balance - cost),
    },
    position: {
      ...position,
      market: account.market,
      symbol: order.symbol,
      name: order.name,
      quantity: newQuantity,
      average_cost: newAverageCost,
    },
    trade: buildManualTrade(order, null, null, executedAt),
  };
}

function applySellOrder(
  account: PaperAccountState,
  position: PaperPositionState | null,
  order: PaperOrderState,
  executedAt?: string
): PaperOrderApplication {
  if (!position || position.quantity < order.quantity) {
    throw new Error('Not enough shares available to sell');
  }

  const proceeds = roundMoney(order.quantity * order.execution_price);
  const realizedPnl = roundMoney((order.execution_price - position.average_cost) * order.quantity);
  const realizedPnlPercent = position.average_cost > 0
    ? roundPercent(((order.execution_price - position.average_cost) / position.average_cost) * 100)
    : 0;
  const remainingQuantity = roundQuantity(position.quantity - order.quantity);

  return {
    account: {
      ...account,
      cash_balance: roundMoney(account.cash_balance + proceeds),
    },
    position: remainingQuantity > 0
      ? { ...position, quantity: remainingQuantity }
      : null,
    trade: buildManualTrade(order, realizedPnl, realizedPnlPercent, executedAt),
  };
}

function normalizeOrder(order: PaperOrderState): PaperOrderState {
  const symbol = order.symbol.trim().toUpperCase();
  const quantity = roundQuantity(order.quantity);
  const executionPrice = roundMoney(order.execution_price);

  if (!symbol) throw new Error('Symbol is required');
  if (quantity <= 0) throw new Error('Quantity must be greater than zero');
  if (executionPrice <= 0) throw new Error('Execution price must be greater than zero');

  return {
    ...order,
    symbol,
    quantity,
    execution_price: executionPrice,
  };
}

function buildManualTrade(
  order: PaperOrderState,
  realizedPnl: number | null,
  realizedPnlPercent: number | null,
  executedAt?: string
): PaperTradeState {
  return {
    ...order,
    realized_pnl: realizedPnl,
    realized_pnl_percent: realizedPnlPercent,
    executed_at: executedAt ?? new Date().toISOString(),
  };
}

function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function roundPercent(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function roundQuantity(value: number): number {
  return Math.round((value + Number.EPSILON) * 1000000) / 1000000;
}

function formatTradeDate(value: string): string {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${value}T00:00:00Z`));
}

function formatPlainNumber(value: number): string {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(value);
}
