/**
 * Penny Hits scoring engine.
 *
 * Produces a 0-100 composite "Penny Hit Score" from five weighted factors:
 *   - Catalyst strength   40%  (real news catalysts via Finnhub)
 *   - Analyst conviction  15%  (recommendation mean, coverage, rising trend)
 *   - Growth / upside      15%  (analyst target upside + earnings/revenue growth)
 *   - Insider buying       15%  (net insider purchases via Finnhub)
 *   - Buying activity      15%  (relative volume surge + momentum)
 *
 * A cheap pre-score (analyst + growth + activity, no API needed) ranks the raw
 * universe so only the strongest candidates are enriched through the
 * rate-limited Finnhub endpoints.
 */

import type { StockQuote } from './yahoo-client';
import type { DetectedCatalyst } from './penny-catalyst';
import type { InsiderSummary, RecommendationTrendSummary } from './finnhub-client';

export const PENNY_WEIGHTS = {
  catalyst: 40,
  analyst: 15,
  growth: 15,
  insider: 15,
  activity: 15,
} as const;

export interface PennyGates {
  maxPrice: number;
  minPrice: number;
  minAvgVolume: number;
}

export const DEFAULT_GATES: PennyGates = {
  maxPrice: 20,
  minPrice: 1,
  minAvgVolume: 100_000,
};

export interface PennyEnrichment {
  catalysts: DetectedCatalyst[];
  catalystStrength: number; // 0-1
  articleCount: number;
  insider: InsiderSummary;
  recTrend: RecommendationTrendSummary | null;
}

export interface PennyFactorScores {
  catalyst: number; // 0-1
  analyst: number;  // 0-1
  growth: number;   // 0-1
  insider: number;  // 0-1
  activity: number; // 0-1
}

export interface PennyHit {
  symbol: string;
  name: string;
  sector: string;
  marketCap: number;
  price: number;
  score: number; // 0-100
  factorScores: PennyFactorScores;
  catalysts: string[];
  thesis: string;
  targetMeanPrice: number | null;
  upsidePercent: number | null;
  recommendationMean: number | null;
  numAnalysts: number | null;
  insiderNetShares: number;
  insiderNetValue: number;
  relativeVolume: number;
  oneMonthChangePercent: number | null;
  changePercent: number;
}

function clamp01(n: number): number {
  if (Number.isNaN(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

function getMomentumPercent(quote: StockQuote): number | null {
  const oneMonth = (quote as any).oneMonthChangePercent;
  if (typeof oneMonth === 'number') return oneMonth;
  if (typeof quote.percentFromFiftyDayMA === 'number') return quote.percentFromFiftyDayMA;
  return null;
}

// --- Individual factor scores (0-1) ---------------------------------------

function analystScore(quote: StockQuote, recTrend: RecommendationTrendSummary | null): number {
  const mean = quote.recommendationMean;
  // recommendationMean: 1 = Strong Buy ... 5 = Strong Sell. Lower is better.
  const recNorm = mean != null ? clamp01((5 - mean) / 4) : 0.3;
  const coverageNorm = clamp01((quote.numberOfAnalystOpinions ?? 0) / 15);
  const trendBonus = recTrend?.strongBuyRising ? 0.1 : 0;
  return clamp01(recNorm * 0.75 + coverageNorm * 0.15 + trendBonus);
}

function growthScore(quote: StockQuote): number {
  let upsideNorm = 0;
  if (quote.targetMeanPrice && quote.price > 0) {
    const upside = ((quote.targetMeanPrice - quote.price) / quote.price) * 100;
    upsideNorm = clamp01(upside / 100); // 100% upside -> 1
  }
  const growthRaw = quote.earningsGrowth ?? quote.revenueGrowth ?? 0;
  const growthNorm = clamp01(growthRaw / 100); // 100% growth -> 1
  return clamp01(upsideNorm * 0.6 + growthNorm * 0.4);
}

function insiderScore(insider: InsiderSummary): number {
  if (!insider) return 0;
  const netBuys = insider.buyCount - insider.sellCount;
  let score = clamp01(netBuys / 4); // 4+ net buy filings -> 1
  if (insider.netValue > 0) score = clamp01(score + 0.2);
  if (insider.netShares > 0 && score === 0) score = 0.1;
  return clamp01(score);
}

function activityScore(quote: StockQuote): number {
  const rvNorm = clamp01((quote.relativeVolume - 1) / 4); // 5x rel-vol -> 1
  const mom = getMomentumPercent(quote);
  const momNorm = mom != null ? clamp01(mom / 30) : 0; // +30% -> 1
  return clamp01(rvNorm * 0.6 + momNorm * 0.4);
}

// --- Public API ------------------------------------------------------------

export function passesPennyGates(quote: StockQuote, gates: PennyGates = DEFAULT_GATES): boolean {
  if (!quote.price || quote.price < gates.minPrice || quote.price >= gates.maxPrice) return false;
  if ((quote.avgVolume ?? 0) < gates.minAvgVolume) return false;
  return true;
}

/**
 * Cheap quote-only pre-score used to rank candidates before Finnhub enrichment.
 * Uses analyst + growth + activity (the factors available without an API call).
 */
export function preScorePenny(quote: StockQuote): number {
  const analyst = analystScore(quote, null);
  const growth = growthScore(quote);
  const activity = activityScore(quote);
  return (
    analyst * PENNY_WEIGHTS.analyst +
    growth * PENNY_WEIGHTS.growth +
    activity * PENNY_WEIGHTS.activity
  );
}

function buildThesis(quote: StockQuote, factors: PennyFactorScores, enrichment: PennyEnrichment): string {
  const parts: string[] = [];

  if (enrichment.catalysts.length > 0) {
    parts.push(enrichment.catalysts[0].label.toLowerCase() + ' catalyst');
  }
  if (quote.recommendationMean != null && quote.recommendationMean <= 2) {
    parts.push('strong analyst buy rating');
  }
  if (quote.targetMeanPrice && quote.price > 0) {
    const upside = ((quote.targetMeanPrice - quote.price) / quote.price) * 100;
    if (upside >= 15) parts.push(`${upside.toFixed(0)}% target upside`);
  }
  if (enrichment.insider.buyCount > enrichment.insider.sellCount && enrichment.insider.netValue > 0) {
    parts.push('insider buying');
  }
  if (quote.relativeVolume >= 3) {
    parts.push(`${quote.relativeVolume.toFixed(1)}x volume surge`);
  }
  const growthRaw = quote.earningsGrowth ?? quote.revenueGrowth;
  if (growthRaw != null && growthRaw >= 25) {
    parts.push(`${growthRaw.toFixed(0)}% growth`);
  }

  if (parts.length === 0) return 'Low-priced momentum candidate.';
  const capped = parts.slice(0, 3);
  const text = capped.join(', ');
  return text.charAt(0).toUpperCase() + text.slice(1) + '.';
}

function buildBadges(quote: StockQuote, enrichment: PennyEnrichment): string[] {
  const badges: string[] = [];
  for (const c of enrichment.catalysts.slice(0, 2)) badges.push(c.label);
  if (enrichment.insider.buyCount > enrichment.insider.sellCount && enrichment.insider.netValue > 0) {
    badges.push('Insider Buying');
  }
  if (quote.relativeVolume >= 3 && !badges.includes('Volume Surge')) {
    badges.push('Volume Surge');
  }
  if (quote.recommendationMean != null && quote.recommendationMean <= 2 && !badges.some(b => b.includes('Analyst'))) {
    badges.push('Analyst Buy');
  }
  if (enrichment.recTrend?.strongBuyRising) {
    badges.push('Rising Coverage');
  }
  return badges;
}

/**
 * Compute the full Penny Hit score for a single candidate.
 */
export function scorePennyHit(quote: StockQuote, enrichment: PennyEnrichment): PennyHit {
  const factorScores: PennyFactorScores = {
    catalyst: clamp01(enrichment.catalystStrength),
    analyst: analystScore(quote, enrichment.recTrend),
    growth: growthScore(quote),
    insider: insiderScore(enrichment.insider),
    activity: activityScore(quote),
  };

  const score =
    factorScores.catalyst * PENNY_WEIGHTS.catalyst +
    factorScores.analyst * PENNY_WEIGHTS.analyst +
    factorScores.growth * PENNY_WEIGHTS.growth +
    factorScores.insider * PENNY_WEIGHTS.insider +
    factorScores.activity * PENNY_WEIGHTS.activity;

  const upsidePercent =
    quote.targetMeanPrice && quote.price > 0
      ? ((quote.targetMeanPrice - quote.price) / quote.price) * 100
      : null;

  return {
    symbol: quote.symbol,
    name: quote.name,
    sector: quote.sector,
    marketCap: quote.marketCap,
    price: quote.price,
    score: Math.round(score),
    factorScores,
    catalysts: buildBadges(quote, enrichment),
    thesis: buildThesis(quote, factorScores, enrichment),
    targetMeanPrice: quote.targetMeanPrice,
    upsidePercent,
    recommendationMean: quote.recommendationMean,
    numAnalysts: quote.numberOfAnalystOpinions,
    insiderNetShares: enrichment.insider.netShares,
    insiderNetValue: enrichment.insider.netValue,
    relativeVolume: quote.relativeVolume,
    oneMonthChangePercent: getMomentumPercent(quote),
    changePercent: quote.changePercent,
  };
}
