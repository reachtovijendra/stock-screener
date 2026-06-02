/**
 * Penny Hits scoring engine (live, two-stage funnel).
 *
 * Stage 1 (Yahoo-only, cheap): ranks the live penny universe on technical and
 * analyst signals so only a small shortlist proceeds to the rate-limited
 * Finnhub enrichment.
 *   - Direction-aware momentum + volume  (today's move x relative volume)
 *   - Trend & structure                  (above rising 50/200-day MA, near 52w high)
 *   - Analyst conviction + upside        (recommendation mean, coverage, target)
 *   - Growth                             (earnings / revenue growth)
 *
 * Stage 2 (shortlist only): blends in a sentiment-filtered catalyst factor
 * (real Finnhub news) and analyst-upgrade trend, and applies an anti-chase
 * penalty so parabolic / blow-off names are not top-ranked.
 *
 * Hard gates exclude red, distribution, and downtrend ("falling knife") names
 * up front so the list represents stocks that look buyable today.
 */

import type { StockQuote } from './yahoo-client';
import type { DetectedCatalyst } from './penny-catalyst';
import type { RecommendationTrendSummary } from './finnhub-client';

export const PENNY_WEIGHTS = {
  catalyst: 25,
  momentumVolume: 25,
  trend: 20,
  analyst: 20,
  growth: 10,
} as const;

export interface PennyGates {
  maxPrice: number;
  minPrice: number;
  minAvgVolume: number;
  /** Minimum today's change % to count as confirming (excludes red names). */
  minTodayChangePercent: number;
  /** Exclude when price is this far (or more) below the 50-day MA (downtrend). */
  maxBelowFiftyDayMA: number;
}

export const DEFAULT_GATES: PennyGates = {
  maxPrice: 20,
  minPrice: 1,
  minAvgVolume: 100_000,
  minTodayChangePercent: -10, // crash guard only; trend/momentum drive ranking
  maxBelowFiftyDayMA: -15,
};

export interface PennyEnrichment {
  catalysts: DetectedCatalyst[];
  catalystStrength: number; // 0-1
  articleCount: number;
  negativeCount: number;
  negativeDominant: boolean;
  recTrend: RecommendationTrendSummary | null;
}

export const EMPTY_ENRICHMENT: PennyEnrichment = {
  catalysts: [],
  catalystStrength: 0,
  articleCount: 0,
  negativeCount: 0,
  negativeDominant: false,
  recTrend: null,
};

export interface PennyFactorScores {
  catalyst: number;       // 0-1
  momentumVolume: number; // 0-1
  trend: number;          // 0-1
  analyst: number;        // 0-1
  growth: number;         // 0-1
}

export interface PennyHit {
  symbol: string;
  name: string;
  sector: string;
  industry: string;
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
  relativeVolume: number;
  oneMonthChangePercent: number | null;
  changePercent: number;
}

function clamp01(n: number): number {
  if (Number.isNaN(n) || !Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

function perf(quote: StockQuote, key: string): number | null {
  const v = (quote as any)[key];
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

function getMomentumPercent(quote: StockQuote): number | null {
  const oneMonth = perf(quote, 'oneMonthChangePercent');
  if (oneMonth != null) return oneMonth;
  if (typeof quote.percentFromFiftyDayMA === 'number') return quote.percentFromFiftyDayMA;
  return null;
}

function upsidePercentOf(quote: StockQuote): number | null {
  if (quote.targetMeanPrice && quote.price > 0) {
    return ((quote.targetMeanPrice - quote.price) / quote.price) * 100;
  }
  return null;
}

// --- Individual factor scores (0-1) ---------------------------------------

/**
 * Momentum + volume: blends intraday move with ~1-month momentum so an
 * established uptrend still scores on a flat/mildly-red day. Relative volume
 * counts as accumulation only when the trend or the day is up (otherwise it is
 * distribution and ignored).
 */
function momentumVolumeScore(quote: StockQuote): number {
  const today = quote.changePercent ?? 0;
  const oneMonth = getMomentumPercent(quote) ?? 0;
  const todayNorm = clamp01(today / 15);    // +15% intraday -> 1 (0 if red)
  const monthNorm = clamp01(oneMonth / 40); // +40% over ~1 month -> 1
  const momNorm = clamp01(todayNorm * 0.5 + monthNorm * 0.5);
  const upDirection = oneMonth > 0 || today > 0;
  const rvNorm = upDirection ? clamp01((quote.relativeVolume - 1) / 4) : 0;
  return clamp01(momNorm * 0.6 + rvNorm * 0.4);
}

/** Above rising 50/200-day MAs, healthy multi-period structure, near 52w high. */
function trendScore(quote: StockQuote): number {
  let maNorm = 0;
  const fromFifty = quote.percentFromFiftyDayMA;
  const fromTwoHundred = quote.percentFromTwoHundredDayMA;
  if (fromFifty != null && fromFifty > 0) maNorm += 0.5;
  if (fromTwoHundred != null && fromTwoHundred > 0) maNorm += 0.3;
  if (quote.fiftyDayMA && quote.twoHundredDayMA && quote.fiftyDayMA > quote.twoHundredDayMA) {
    maNorm += 0.2; // golden alignment
  }

  // Multi-period structure: positive and accelerating (1m >= 3m >= 6m).
  const m1 = perf(quote, 'oneMonthChangePercent');
  const m3 = perf(quote, 'threeMonthChangePercent');
  const m6 = perf(quote, 'sixMonthChangePercent');
  let structureNorm = 0;
  if (m1 != null && m1 > 0) structureNorm += 0.5;
  if (m1 != null && m3 != null && m1 >= m3) structureNorm += 0.25;
  if (m3 != null && m6 != null && m3 >= m6) structureNorm += 0.25;

  // Proximity to 52-week high (0 = at high, more negative = far below).
  const fromHigh = quote.percentFromFiftyTwoWeekHigh ?? -100;
  const highNorm = clamp01((fromHigh + 50) / 50); // within 50% of high ramps 0->1

  return clamp01(maNorm * 0.5 + structureNorm * 0.35 + highNorm * 0.15);
}

/** Analyst conviction: rating, coverage, target upside, rising trend. */
function analystScore(quote: StockQuote, recTrend: RecommendationTrendSummary | null): number {
  const mean = quote.recommendationMean ?? recTrend?.recommendationMean ?? null;
  const coverage = quote.numberOfAnalystOpinions ?? recTrend?.totalCount ?? 0;
  const recNorm = mean != null ? clamp01((5 - mean) / 4) : 0.3;
  const coverageNorm = clamp01(coverage / 15);
  const upside = upsidePercentOf(quote);
  const upsideNorm = upside != null ? clamp01(upside / 100) : 0;
  const trendBonus = recTrend?.strongBuyRising ? 0.1 : 0;
  return clamp01(recNorm * 0.5 + coverageNorm * 0.15 + upsideNorm * 0.3 + trendBonus);
}

function growthScore(quote: StockQuote): number {
  const growthRaw = quote.earningsGrowth ?? quote.revenueGrowth ?? 0;
  return clamp01(growthRaw / 100); // 100% growth -> 1
}

/** Catalyst factor: sentiment-filtered Finnhub news strength (Stage 2 only). */
function catalystScore(enrichment: PennyEnrichment): number {
  if (enrichment.negativeDominant) return 0;
  return clamp01(enrichment.catalystStrength);
}

/** Multiplier (<=1) that de-rates parabolic run-ups and single-day blow-offs. */
function antiChaseMultiplier(quote: StockQuote): number {
  let mult = 1;
  const oneMonth = getMomentumPercent(quote);
  if (oneMonth != null) {
    if (oneMonth > 150) mult = Math.min(mult, 0.6);
    else if (oneMonth > 100) mult = Math.min(mult, 0.8);
  }
  const today = quote.changePercent ?? 0;
  if (today > 50) mult = Math.min(mult, 0.6);
  else if (today > 40 && quote.relativeVolume > 15) mult = Math.min(mult, 0.5); // blow-off / pump
  return mult;
}

// --- Public API ------------------------------------------------------------

/** Liquidity / price band gate (matches the screener universe). */
export function passesPennyGates(quote: StockQuote, gates: PennyGates = DEFAULT_GATES): boolean {
  if (!quote.price || quote.price < gates.minPrice || quote.price >= gates.maxPrice) return false;
  if ((quote.avgVolume ?? 0) < gates.minAvgVolume) return false;
  return true;
}

/**
 * Live "buyable today" gates: require price confirmation (up day) and reject
 * deep downtrends / falling knives.
 */
export function passesLiveGates(quote: StockQuote, gates: PennyGates = DEFAULT_GATES): boolean {
  if ((quote.changePercent ?? 0) < gates.minTodayChangePercent) return false;
  const fromFifty = quote.percentFromFiftyDayMA;
  if (fromFifty != null && fromFifty < gates.maxBelowFiftyDayMA) return false;
  return true;
}

/**
 * Stage 1 quote-only score used to rank the universe before Finnhub enrichment.
 * Uses the four factors available without an API call.
 */
export function preScorePenny(quote: StockQuote): number {
  return (
    momentumVolumeScore(quote) * PENNY_WEIGHTS.momentumVolume +
    trendScore(quote) * PENNY_WEIGHTS.trend +
    analystScore(quote, null) * PENNY_WEIGHTS.analyst +
    growthScore(quote) * PENNY_WEIGHTS.growth
  ) * antiChaseMultiplier(quote);
}

function buildThesis(quote: StockQuote, enrichment: PennyEnrichment): string {
  const parts: string[] = [];
  if (enrichment.catalysts.length > 0) {
    parts.push(enrichment.catalysts[0].label.toLowerCase() + ' catalyst');
  }
  if ((quote.changePercent ?? 0) >= 5) parts.push(`up ${(quote.changePercent ?? 0).toFixed(1)}% today`);
  if (quote.relativeVolume >= 3) parts.push(`${quote.relativeVolume.toFixed(1)}x volume`);
  const mean = quote.recommendationMean ?? enrichment.recTrend?.recommendationMean ?? null;
  if (mean != null && mean <= 2) parts.push('analyst buy rating');
  const upside = upsidePercentOf(quote);
  if (upside != null && upside >= 15) parts.push(`${upside.toFixed(0)}% target upside`);
  if (parts.length === 0) return 'Low-priced momentum candidate.';
  const text = parts.slice(0, 3).join(', ');
  return text.charAt(0).toUpperCase() + text.slice(1) + '.';
}

function buildBadges(quote: StockQuote, enrichment: PennyEnrichment): string[] {
  const badges: string[] = [];
  // Real news catalysts first (Stage 2).
  for (const c of enrichment.catalysts.slice(0, 2)) badges.push(c.label);
  if (enrichment.recTrend?.strongBuyRising) badges.push('Rising Coverage');

  // Live technical / analyst signals.
  if (quote.relativeVolume >= 3 && !badges.includes('Volume Surge')) badges.push('Volume Surge');
  if ((quote.changePercent ?? 0) >= 10) badges.push('Intraday Surge');
  if ((quote.percentFromFiftyDayMA ?? -1) > 0 && (quote.percentFromTwoHundredDayMA ?? -1) > 0) {
    badges.push('Uptrend');
  }
  if ((quote.percentFromFiftyTwoWeekHigh ?? -100) >= -10) badges.push('Near 52W High');

  const mean = quote.recommendationMean ?? enrichment.recTrend?.recommendationMean ?? null;
  if (mean != null && mean <= 2 && !badges.some(b => b.includes('Analyst'))) badges.push('Strong Buy');

  const upside = upsidePercentOf(quote);
  if (upside != null && upside >= 25) badges.push('High Upside');

  const growthRaw = quote.earningsGrowth ?? quote.revenueGrowth;
  if (growthRaw != null && growthRaw >= 25) badges.push('Growth');

  // De-dupe and cap to keep cards tidy.
  return Array.from(new Set(badges)).slice(0, 5);
}

/**
 * Compute the full Penny Hit score. Pass enrichment for the Stage 2 blended
 * score; omit it (or pass EMPTY_ENRICHMENT) for a Yahoo-only fallback score.
 */
export function scorePennyHit(quote: StockQuote, enrichment: PennyEnrichment = EMPTY_ENRICHMENT): PennyHit {
  const factorScores: PennyFactorScores = {
    catalyst: catalystScore(enrichment),
    momentumVolume: momentumVolumeScore(quote),
    trend: trendScore(quote),
    analyst: analystScore(quote, enrichment.recTrend),
    growth: growthScore(quote),
  };

  const raw =
    factorScores.catalyst * PENNY_WEIGHTS.catalyst +
    factorScores.momentumVolume * PENNY_WEIGHTS.momentumVolume +
    factorScores.trend * PENNY_WEIGHTS.trend +
    factorScores.analyst * PENNY_WEIGHTS.analyst +
    factorScores.growth * PENNY_WEIGHTS.growth;

  const score = raw * antiChaseMultiplier(quote);

  return {
    symbol: quote.symbol,
    name: quote.name,
    sector: quote.sector,
    industry: quote.industry,
    marketCap: quote.marketCap,
    price: quote.price,
    score: Math.round(score),
    factorScores,
    catalysts: buildBadges(quote, enrichment),
    thesis: buildThesis(quote, enrichment),
    targetMeanPrice: quote.targetMeanPrice,
    upsidePercent: upsidePercentOf(quote),
    recommendationMean: quote.recommendationMean ?? enrichment.recTrend?.recommendationMean ?? null,
    numAnalysts: quote.numberOfAnalystOpinions ?? enrichment.recTrend?.totalCount ?? null,
    relativeVolume: quote.relativeVolume,
    oneMonthChangePercent: getMomentumPercent(quote),
    changePercent: quote.changePercent,
  };
}
