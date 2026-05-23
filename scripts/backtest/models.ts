/**
 * Scoring model variants for backtesting.
 * Each model wraps/modifies the existing quickScore and fullScore functions.
 */

import { VirtualQuote, VirtualTechnicals } from './virtual-quote';
import {
  quickScore as originalQuickScore,
  fullScore as originalFullScore,
  assessMarketCondition,
  calculateSMA,
} from '../../api/_lib/day-trade-scorer';

export interface ScoredPick {
  symbol: string;
  quote: VirtualQuote;
  tech: VirtualTechnicals;
  score: number;
  signals: string[];
  entryTrigger: number;
  buyPrice: number;
  sellPrice: number;
  stopLoss: number;
  rewardRiskRatio: number;
  setupType: string;
}

export interface ModelDefinition {
  name: string;
  shortName: string;
  quickScore: (q: VirtualQuote) => number;
  fullScore: (q: VirtualQuote, tech: VirtualTechnicals, indexChangePercent: number, indexCloses5d: number[]) => ScoredPick | null;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Default full scoring — wraps the production fullScore function.
 */
function defaultFullScore(
  q: VirtualQuote,
  tech: VirtualTechnicals,
  indexChangePercent: number,
  _indexCloses5d: number[]
): ScoredPick | null {
  const marketCondition = assessMarketCondition(indexChangePercent);

  // Cast to match the expected types (VirtualQuote satisfies StockQuote shape)
  const result = originalFullScore({
    quote: q as any,
    tech: tech as any,
    indexChangePercent,
    marketCondition,
  });

  if (result.score < 1) return null;

  return {
    symbol: q.symbol,
    quote: q,
    tech,
    score: result.score,
    signals: result.signals,
    entryTrigger: result.entryTrigger,
    buyPrice: result.buyPrice,
    sellPrice: result.sellPrice,
    stopLoss: result.stopLoss,
    rewardRiskRatio: result.rewardRiskRatio,
    setupType: result.setupType,
  };
}

// =========================================================================
// MODEL A: Current production model (baseline)
// =========================================================================

const modelA: ModelDefinition = {
  name: 'Current Model (Baseline)',
  shortName: 'A:Baseline',
  quickScore: (q) => originalQuickScore(q as any),
  fullScore: defaultFullScore,
};

// =========================================================================
// MODEL B: Gap Direction Filter
// prev up + gap down = -15 penalty
// =========================================================================

const modelB: ModelDefinition = {
  name: 'Gap Direction Filter',
  shortName: 'B:GapDir',
  quickScore: (q) => {
    let score = originalQuickScore(q as any);
    // Penalize: previous session up but gapping down today
    if (q.changePercent > 0 && q.preMarketPrice && q.preMarketPrice < q.price) {
      const gapDown = ((q.preMarketPrice - q.price) / q.price) * 100;
      if (gapDown < -0.5) {
        score -= 15;
      }
    }
    return score;
  },
  fullScore: (q, tech, indexChangePercent, indexCloses5d) => {
    const pick = defaultFullScore(q, tech, indexChangePercent, indexCloses5d);
    if (!pick) return null;

    // Strong penalty: prev up + gap down
    if (q.changePercent > 0 && q.preMarketPrice && q.preMarketPrice < q.price) {
      const gapDown = ((q.preMarketPrice - q.price) / q.price) * 100;
      if (gapDown < -0.5) {
        pick.score -= 15;
        pick.signals.push(`Gap reversal ${gapDown.toFixed(1)}% (PENALTY)`);
      }
    }

    // Bonus: prev up + gap up = real continuation
    if (q.changePercent > 1 && q.preMarketPrice && q.preMarketPrice > q.price) {
      const gapUp = ((q.preMarketPrice - q.price) / q.price) * 100;
      if (gapUp > 0.5) {
        pick.score += 8;
        pick.signals.push(`Gap continuation +${gapUp.toFixed(1)}%`);
      }
    }

    pick.score = Math.max(0, Math.min(100, pick.score));
    return pick;
  },
};

// =========================================================================
// MODEL C: Recovery Entry Trigger
// Entry only if price reclaims previous close (gap fill)
// =========================================================================

const modelC: ModelDefinition = {
  name: 'Recovery Entry Trigger',
  shortName: 'C:Recovery',
  quickScore: (q) => originalQuickScore(q as any),
  fullScore: (q, tech, indexChangePercent, indexCloses5d) => {
    const pick = defaultFullScore(q, tech, indexChangePercent, indexCloses5d);
    if (!pick) return null;

    // Override entry trigger: must be at or above previous close
    // This means on a gap-down day, price must RECOVER to prev close
    const prevClose = q.price;
    if (pick.entryTrigger < prevClose) {
      pick.entryTrigger = round2(prevClose);
      pick.buyPrice = round2(prevClose);
    }

    // Recalculate targets from new entry
    const atr = tech.atr || pick.buyPrice * 0.015;
    pick.stopLoss = round2(pick.buyPrice - 0.7 * atr);
    pick.sellPrice = round2(pick.buyPrice + 1.5 * atr);
    const risk = pick.buyPrice - pick.stopLoss;
    const reward = pick.sellPrice - pick.buyPrice;
    pick.rewardRiskRatio = risk > 0 ? round2(reward / risk) : 0;

    return pick;
  },
};

// =========================================================================
// MODEL D: Multi-Day Market Trend
// Use 5-day SMA slope instead of single-day index change
// =========================================================================

const modelD: ModelDefinition = {
  name: 'Multi-Day Market Trend',
  shortName: 'D:MktTrend',
  quickScore: (q) => originalQuickScore(q as any),
  fullScore: (q, tech, indexChangePercent, indexCloses5d) => {
    // Override market condition with 5-day trend
    let effectiveMarketCondition: 'bullish' | 'neutral' | 'bearish' = 'neutral';
    if (indexCloses5d.length >= 5) {
      const sma5 = indexCloses5d.reduce((a, b) => a + b, 0) / indexCloses5d.length;
      const latest = indexCloses5d[indexCloses5d.length - 1];
      const pctAboveSMA = ((latest - sma5) / sma5) * 100;
      // Also check if trending up (each close > prev)
      let upDays = 0;
      for (let i = 1; i < indexCloses5d.length; i++) {
        if (indexCloses5d[i] > indexCloses5d[i - 1]) upDays++;
      }
      if (pctAboveSMA > 0.2 && upDays >= 3) effectiveMarketCondition = 'bullish';
      else if (pctAboveSMA < -0.2 || upDays <= 1) effectiveMarketCondition = 'bearish';
    }

    const result = originalFullScore({
      quote: q as any,
      tech: tech as any,
      indexChangePercent,
      marketCondition: effectiveMarketCondition,
    });

    if (result.score < 1) return null;

    return {
      symbol: q.symbol, quote: q, tech,
      score: result.score, signals: result.signals,
      entryTrigger: result.entryTrigger, buyPrice: result.buyPrice,
      sellPrice: result.sellPrice, stopLoss: result.stopLoss,
      rewardRiskRatio: result.rewardRiskRatio, setupType: result.setupType,
    };
  },
};

// =========================================================================
// MODEL E: Wider Stops on Gap-Down
// If gap down, stop = buy - 1.5*ATR instead of 0.7*ATR
// =========================================================================

const modelE: ModelDefinition = {
  name: 'Wider Gap-Down Stops',
  shortName: 'E:WideStop',
  quickScore: (q) => originalQuickScore(q as any),
  fullScore: (q, tech, indexChangePercent, indexCloses5d) => {
    const pick = defaultFullScore(q, tech, indexChangePercent, indexCloses5d);
    if (!pick) return null;

    const gapDown = q.preMarketPrice && q.price > 0
      ? ((q.preMarketPrice - q.price) / q.price) * 100 : 0;

    if (gapDown < -0.5) {
      const atr = tech.atr || pick.buyPrice * 0.015;
      pick.stopLoss = round2(pick.buyPrice - 1.5 * atr);
      const risk = pick.buyPrice - pick.stopLoss;
      const reward = pick.sellPrice - pick.buyPrice;
      pick.rewardRiskRatio = risk > 0 ? round2(reward / risk) : 0;
    }

    return pick;
  },
};

// =========================================================================
// MODEL F: All Fixes Combined
// Gap direction + recovery entry + multi-day market + wider stops
// =========================================================================

const modelF: ModelDefinition = {
  name: 'All Fixes Combined',
  shortName: 'F:Combined',
  quickScore: (q) => {
    let score = originalQuickScore(q as any);
    // Gap direction penalty in quick score too
    if (q.changePercent > 0 && q.preMarketPrice && q.preMarketPrice < q.price) {
      const gapDown = ((q.preMarketPrice - q.price) / q.price) * 100;
      if (gapDown < -0.5) score -= 15;
    }
    return score;
  },
  fullScore: (q, tech, indexChangePercent, indexCloses5d) => {
    // 1. Multi-day market trend
    let effectiveMarketCondition: 'bullish' | 'neutral' | 'bearish' = 'neutral';
    if (indexCloses5d.length >= 5) {
      const sma5 = indexCloses5d.reduce((a, b) => a + b, 0) / indexCloses5d.length;
      const latest = indexCloses5d[indexCloses5d.length - 1];
      const pctAboveSMA = ((latest - sma5) / sma5) * 100;
      let upDays = 0;
      for (let i = 1; i < indexCloses5d.length; i++) {
        if (indexCloses5d[i] > indexCloses5d[i - 1]) upDays++;
      }
      if (pctAboveSMA > 0.2 && upDays >= 3) effectiveMarketCondition = 'bullish';
      else if (pctAboveSMA < -0.2 || upDays <= 1) effectiveMarketCondition = 'bearish';
    }

    const result = originalFullScore({
      quote: q as any,
      tech: tech as any,
      indexChangePercent,
      marketCondition: effectiveMarketCondition,
    });

    if (result.score < 1) return null;

    const pick: ScoredPick = {
      symbol: q.symbol, quote: q, tech,
      score: result.score, signals: [...result.signals],
      entryTrigger: result.entryTrigger, buyPrice: result.buyPrice,
      sellPrice: result.sellPrice, stopLoss: result.stopLoss,
      rewardRiskRatio: result.rewardRiskRatio, setupType: result.setupType,
    };

    const gapPercent = q.preMarketPrice && q.price > 0
      ? ((q.preMarketPrice - q.price) / q.price) * 100 : 0;

    // 2. Gap direction filter
    if (q.changePercent > 0 && gapPercent < -0.5) {
      pick.score -= 15;
      pick.signals.push(`Gap reversal ${gapPercent.toFixed(1)}%`);
    }
    if (q.changePercent > 1 && gapPercent > 0.5) {
      pick.score += 8;
      pick.signals.push(`Gap continuation +${gapPercent.toFixed(1)}%`);
    }

    // 3. Recovery entry trigger
    const prevClose = q.price;
    if (pick.entryTrigger < prevClose) {
      pick.entryTrigger = round2(prevClose);
      pick.buyPrice = round2(prevClose);
    }

    // 4. Wider stops on gap-down
    const atr = tech.atr || pick.buyPrice * 0.015;
    if (gapPercent < -0.5) {
      pick.stopLoss = round2(pick.buyPrice - 1.5 * atr);
    } else {
      pick.stopLoss = round2(pick.buyPrice - 0.7 * atr);
    }
    pick.sellPrice = round2(pick.buyPrice + 1.5 * atr);
    const risk = pick.buyPrice - pick.stopLoss;
    const reward = pick.sellPrice - pick.buyPrice;
    pick.rewardRiskRatio = risk > 0 ? round2(reward / risk) : 0;

    pick.score = Math.max(0, Math.min(100, pick.score));
    return pick;
  },
};

// =========================================================================
// MODEL G: Combined + No Repeat Losers
// Same as F but maintains a blacklist of recently stopped-out symbols
// (blacklist managed externally by engine.ts)
// =========================================================================

const modelG: ModelDefinition = {
  ...modelF,
  name: 'Combined + No Repeat Losers',
  shortName: 'G:Cmb+NRL',
};

// =========================================================================
// Export all models
// =========================================================================

export const ALL_MODELS: Record<string, ModelDefinition> = {
  A: modelA,
  B: modelB,
  C: modelC,
  D: modelD,
  E: modelE,
  F: modelF,
  G: modelG,
};
