/**
 * Deterministic stock forecast engine.
 *
 * Produces a transparent, fully auditable buy/sell recommendation, a 12-month
 * target price (with a base-valuation + adjustment waterfall), a multi-year
 * scenario projection, actionable trade levels, and bull/bear narratives.
 *
 * Every output is derived purely from the `Stock` object the detail page already
 * loads plus the catalyst types from its news feed. No external AI/LLM, no network
 * calls, no randomness: the same inputs always yield the same forecast.
 */

import { Stock } from '../../core/models/stock.model';

export type Recommendation = 'strong_sell' | 'sell' | 'hold' | 'buy' | 'strong_buy';

export interface ValuationEstimate {
  /** Human-readable label, e.g. "Analyst consensus". */
  label: string;
  /** Estimated fair value in the stock's currency. */
  value: number;
  /** Normalized contribution weight (0-1) toward the weighted base. */
  weight: number;
  /** Short explanation of how this estimate was derived. */
  detail: string;
}

export interface Adjustment {
  label: string;
  /** Signed multiplier applied to the base (e.g. 0.03 = +3%). */
  pct: number;
  reason: string;
  direction: 'positive' | 'negative' | 'neutral';
}

export interface Scenario {
  key: 'optimistic' | 'target' | 'conservative';
  label: string;
  /** Value at the end of the projection horizon. */
  endValue: number;
  /** Total % change from current price to end of horizon. */
  changePercent: number;
  /** Compound annual growth rate (%). */
  cagr: number;
  /** Projected value per year, index 0 = today. */
  path: number[];
}

export interface Factor {
  label: string;
  detail: string;
  polarity: 'bull' | 'bear';
  /** Relative importance used to rank the factor. */
  weight: number;
}

export interface TradePlan {
  entryLow: number;
  entryHigh: number;
  target: number;
  stop: number;
  /** Reward-to-risk ratio (target distance / stop distance). */
  riskReward: number | null;
  horizon: string;
  note: string;
}

export interface ForecastResult {
  symbol: string;
  currency: string;
  asOf: Date;
  price: number;

  recommendation: Recommendation;
  recommendationLabel: string;
  /** Composite conviction, 0-100. */
  conviction: number;
  /** Confidence in the call, 0-100 (driven by data agreement + coverage). */
  confidence: number;
  confidenceLabel: 'High' | 'Moderate' | 'Low';

  targetPrice: number;
  upsidePercent: number;
  /** 12-month bear / bull bookends around the target. */
  targetLow: number;
  targetHigh: number;

  baseValuation: number;
  estimates: ValuationEstimate[];
  adjustments: Adjustment[];

  scenarios: Scenario[];
  horizonYears: number;
  scenarioLabels: string[];

  tradePlan: TradePlan;

  bullCase: Factor[];
  bearCase: Factor[];

  summary: string;
  dataQuality: 'high' | 'medium' | 'low';
  hasAnalystCoverage: boolean;
  sources: string[];
}

export type NewsType =
  | 'price_target'
  | 'upgrade_downgrade'
  | 'insider'
  | 'earnings'
  | 'dividend'
  | 'general';

const HORIZON_YEARS = 5;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/** Returns a finite number or null. */
function num(value: number | null | undefined): number | null {
  return typeof value === 'number' && isFinite(value) ? value : null;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * A clean, forward-looking growth estimate (in %) for valuation.
 *
 * Prefers implied growth from forward vs trailing EPS -- a stable, analyst-
 * derived figure -- over Yahoo's reported earnings/revenue growth, which is a
 * single-quarter year-over-year print and can be wildly distorted by one-off
 * base effects (e.g. +173% / +431% quarters that say nothing about the run
 * rate). Reported growth is used only as a sanitized fallback, and the result
 * is clamped to a believable band so no single noisy input can dominate.
 */
function effectiveGrowthPct(s: Stock): number | null {
  const fwd = num(s.forwardEps);
  const trail = num(s.eps);
  if (fwd != null && fwd > 0 && trail != null && trail > 0) {
    return clamp((fwd / trail - 1) * 100, -60, 60);
  }
  const reported = [num(s.earningsGrowth), num(s.revenueGrowth)].filter(
    (v): v is number => v != null
  );
  if (reported.length === 0) return null;
  return clamp(Math.max(...reported), -60, 60);
}

// ---------------------------------------------------------------------------
// Base valuation
// ---------------------------------------------------------------------------

interface BaseResult {
  base: number;
  estimates: ValuationEstimate[];
  hasAnalystCoverage: boolean;
  coverageFactor: number;
  dispersion: number;
}

function computeBaseValuation(s: Stock): BaseResult {
  const price = s.price;
  const raw: { label: string; value: number; weight: number; detail: string }[] = [];

  // 1. Current price baseline -- anchors the model to reality.
  raw.push({
    label: 'Current price',
    value: price,
    weight: 0.2,
    detail: 'Live market price as the realistic anchor for fair value.',
  });

  // 2. Forward earnings value: forward EPS at a growth-justified multiple,
  //    blended with the stock's own forward multiple and compressed when
  //    earnings/revenue are contracting (so declining names are not overvalued).
  const forwardEps = num(s.forwardEps);
  const trailingEps = num(s.eps);
  const fpe = num(s.forwardPeRatio);
  if (forwardEps != null && forwardEps > 0) {
    const growthPct = effectiveGrowthPct(s);
    const growthJustified = clamp(10 + Math.max(0, growthPct ?? 0) * 0.8, 8, 32);
    const marketMultiple = fpe != null && fpe > 0 ? clamp(fpe, 6, 40) : growthJustified;
    let multiple = 0.5 * growthJustified + 0.5 * marketMultiple;
    // Don't let growth justify paying far above the multiple the market itself
    // assigns. A low market multiple usually encodes real risk (cyclicality,
    // patent cliffs, depressed-but-recovering earnings off a low trailing base);
    // this caps value-trap upside without touching names the market already
    // pays up for (e.g. genuine high-growth compounders).
    if (fpe != null && fpe > 0) {
      multiple = Math.min(multiple, clamp(fpe, 6, 40) * 1.3);
    }
    // Contraction guard keys off forward EPS actually falling below trailing
    // (a genuine earnings decline) rather than a single noisy quarterly print.
    const contracting =
      trailingEps != null && trailingEps > 0
        ? forwardEps < trailingEps
        : growthPct != null && growthPct < 0;
    if (contracting) multiple = Math.min(multiple, 14);
    const fairValue = clamp(forwardEps * multiple, price * 0.5, price * 1.75);
    raw.push({
      label: 'Forward earnings value',
      value: fairValue,
      weight: 0.4,
      detail: `Forward EPS ${forwardEps.toFixed(2)} x ${multiple.toFixed(1)} ${contracting ? 'compressed ' : 'growth-justified '}multiple.`,
    });
  }

  // 3. Analyst consensus, weighted by coverage breadth.
  const target = num(s.targetMeanPrice);
  const opinions = num(s.numberOfAnalystOpinions) ?? 0;
  const coverageFactor = opinions > 0 ? clamp(opinions / 12, 0.3, 1) : 0;
  const hasAnalystCoverage = target != null && target > 0 && opinions > 0;
  if (hasAnalystCoverage && target != null) {
    raw.push({
      label: 'Analyst consensus',
      value: target,
      weight: 0.2 * coverageFactor,
      detail: `Mean 12-month target across ${opinions} analyst${opinions === 1 ? '' : 's'}.`,
    });
  }

  // 4. Technical fair value: blend of price and moving averages (mean reversion).
  const ma50 = num(s.fiftyDayMA);
  const ma200 = num(s.twoHundredDayMA);
  if (ma50 != null || ma200 != null) {
    let acc = 0;
    let w = 0;
    acc += price * 0.4;
    w += 0.4;
    if (ma50 != null) {
      acc += ma50 * 0.35;
      w += 0.35;
    }
    if (ma200 != null) {
      acc += ma200 * 0.25;
      w += 0.25;
    }
    const trendValue = acc / w;
    raw.push({
      label: 'Trend fair value',
      value: trendValue,
      weight: 0.2,
      detail: 'Blend of price with the 50- and 200-day moving averages.',
    });
  }

  const totalWeight = raw.reduce((sum, e) => sum + e.weight, 0) || 1;
  const base = raw.reduce((sum, e) => sum + e.value * e.weight, 0) / totalWeight;

  // Dispersion (coefficient of variation) across estimates -> confidence input.
  const mean = raw.reduce((sum, e) => sum + e.value, 0) / raw.length;
  const variance = raw.reduce((sum, e) => sum + Math.pow(e.value - mean, 2), 0) / raw.length;
  const dispersion = mean > 0 ? Math.sqrt(variance) / mean : 0;

  const estimates: ValuationEstimate[] = raw.map((e) => ({
    label: e.label,
    value: round2(e.value),
    weight: round2(e.weight / totalWeight),
    detail: e.detail,
  }));

  return {
    base: clamp(base, price * 0.5, price * 3),
    estimates,
    hasAnalystCoverage,
    coverageFactor,
    dispersion,
  };
}

// ---------------------------------------------------------------------------
// Adjustment waterfall
// ---------------------------------------------------------------------------

function toAdjustment(label: string, pct: number, reason: string): Adjustment {
  return {
    label,
    pct: Math.round(pct * 1000) / 1000,
    reason,
    direction: pct > 0.0005 ? 'positive' : pct < -0.0005 ? 'negative' : 'neutral',
  };
}

function computeAdjustments(s: Stock, base: number, coverageFactor: number): Adjustment[] {
  const adjustments: Adjustment[] = [];

  // Growth (clean, sanitized estimate -- see effectiveGrowthPct).
  const g = effectiveGrowthPct(s);
  if (g != null) {
    const pct = clamp((g / 100) * 0.25, -0.06, 0.06);
    adjustments.push(
      toAdjustment(
        'Growth',
        pct,
        g >= 0
          ? `Earnings growing about ${g.toFixed(0)}% supports a higher multiple.`
          : `Earnings contracting about ${Math.abs(g).toFixed(0)}% caps fair value.`
      )
    );
  }

  // Momentum / trend structure.
  const pf50 = num(s.percentFromFiftyDayMA);
  const pf200 = num(s.percentFromTwoHundredDayMA);
  const tm = num(s.threeMonthChangePercent);
  if (pf50 != null || pf200 != null || tm != null) {
    let t = 0;
    if (pf50 != null) t += (clamp(pf50, -20, 20) / 20) * 0.025;
    if (pf200 != null) t += (clamp(pf200, -30, 30) / 30) * 0.02;
    if (tm != null) t += (clamp(tm, -30, 30) / 30) * 0.015;
    const pct = clamp(t, -0.05, 0.05);
    adjustments.push(
      toAdjustment(
        'Trend & momentum',
        pct,
        pct >= 0
          ? 'Price holding above key moving averages with constructive momentum.'
          : 'Price trading below key moving averages; momentum is soft.'
      )
    );
  }

  // Technical signal (RSI + MACD).
  const rsi = num(s.rsi);
  let techPct = 0;
  const techReasons: string[] = [];
  if (s.macdSignalType) {
    if (s.macdSignalType === 'strong_bullish' || s.macdSignalType === 'bullish_crossover') {
      techPct += 0.025;
      techReasons.push('MACD bullish');
    } else if (s.macdSignalType === 'bullish') {
      techPct += 0.015;
      techReasons.push('MACD positive');
    } else if (s.macdSignalType === 'strong_bearish' || s.macdSignalType === 'bearish_crossover') {
      techPct -= 0.025;
      techReasons.push('MACD bearish');
    } else if (s.macdSignalType === 'bearish') {
      techPct -= 0.015;
      techReasons.push('MACD negative');
    }
  }
  if (rsi != null) {
    if (rsi > 75) {
      techPct -= 0.02;
      techReasons.push('RSI overbought');
    } else if (rsi > 68) {
      techPct -= 0.01;
      techReasons.push('RSI stretched');
    } else if (rsi < 25) {
      techPct += 0.015;
      techReasons.push('RSI oversold');
    }
  }
  if (techReasons.length > 0) {
    adjustments.push(
      toAdjustment('Technical signal', clamp(techPct, -0.035, 0.035), techReasons.join(', ') + '.')
    );
  }

  // Analyst pull toward consensus.
  const target = num(s.targetMeanPrice);
  if (target != null && target > 0 && coverageFactor > 0 && base > 0) {
    const gap = (target - base) / base;
    const pct = clamp(gap * 0.15 * coverageFactor, -0.04, 0.04);
    if (Math.abs(pct) > 0.0005) {
      adjustments.push(
        toAdjustment(
          'Analyst pull',
          pct,
          gap >= 0
            ? 'Street targets sit above the model base, nudging the call higher.'
            : 'Street targets sit below the model base, tempering the call.'
        )
      );
    }
  }

  // Volatility / beta dampener.
  const beta = num(s.beta);
  if (beta != null) {
    const excess = beta - 1;
    const pct = clamp(-excess * 0.03, -0.03, 0.012);
    adjustments.push(
      toAdjustment(
        'Volatility',
        pct,
        beta > 1.1
          ? `Beta ${beta.toFixed(2)} means above-market swings; central target trimmed for risk.`
          : `Beta ${beta.toFixed(2)} is at or below market, a steadier profile.`
      )
    );
  }

  // 52-week positioning / mean reversion.
  const pfHigh = num(s.percentFromFiftyTwoWeekHigh);
  if (pfHigh != null) {
    let pct = 0;
    let reason = '';
    if (pfHigh > -3 && rsi != null && rsi > 70) {
      pct = -0.02;
      reason = 'Pressed against 52-week highs while overbought; pullback risk.';
    } else if (pfHigh > -3) {
      pct = -0.005;
      reason = 'Trading near 52-week highs; limited headroom near term.';
    } else if (pfHigh < -50) {
      pct = -0.015;
      reason = 'More than 50% below its 52-week high; structurally damaged.';
    } else if (pfHigh < -20 && tm != null && tm > 0) {
      pct = 0.01;
      reason = 'Recovering off depressed levels with room back toward prior highs.';
    }
    if (Math.abs(pct) > 0.0005) {
      adjustments.push(toAdjustment('52-week position', pct, reason));
    }
  }

  return adjustments;
}

// ---------------------------------------------------------------------------
// Conviction scoring
// ---------------------------------------------------------------------------

function technicalScore0to100(s: Stock): number {
  let score = 50;
  const rsi = num(s.rsi);
  if (rsi != null) {
    if (rsi < 30) score += 20;
    else if (rsi < 40) score += 10;
    else if (rsi > 70) score -= 20;
    else if (rsi > 60) score -= 10;
  }
  if (s.macdSignalType) {
    if (s.macdSignalType === 'strong_bullish' || s.macdSignalType === 'bullish_crossover') score += 25;
    else if (s.macdSignalType === 'bullish') score += 15;
    else if (s.macdSignalType === 'strong_bearish' || s.macdSignalType === 'bearish_crossover') score -= 25;
    else if (s.macdSignalType === 'bearish') score -= 15;
  }
  return clamp(score, 0, 100);
}

function momentumScore0to100(s: Stock): number {
  let score = 50;
  const add = (v: number | null | undefined, factor: number, cap: number) => {
    const n = num(v ?? null);
    if (n != null) score += clamp(n * factor, -cap, cap);
  };
  add(s.oneMonthChangePercent, 0.5, 10);
  add(s.threeMonthChangePercent, 0.25, 12);
  add(s.sixMonthChangePercent, 0.16, 10);
  add(s.oneYearChangePercent, 0.08, 8);
  add(s.percentFromFiftyDayMA, 0.5, 5);
  add(s.percentFromTwoHundredDayMA, 0.25, 5);
  return clamp(score, 0, 100);
}

function valuationScore0to100(s: Stock): number | null {
  const fpe = num(s.forwardPeRatio);
  if (fpe == null) return null;
  if (fpe <= 0) return 35; // negative forward earnings
  const gp = effectiveGrowthPct(s);
  const g = gp != null && gp > 0 ? gp : null;
  if (g != null) {
    const peg = fpe / g;
    if (peg < 1) return 82;
    if (peg < 1.5) return 70;
    if (peg < 2) return 58;
    if (peg < 3) return 46;
    return 34;
  }
  if (fpe < 12) return 68;
  if (fpe < 20) return 56;
  if (fpe < 30) return 48;
  if (fpe < 45) return 40;
  return 32;
}

function analystScore0to100(s: Stock): number | null {
  const mean = num(s.recommendationMean);
  if (mean == null) return null;
  return clamp(((5 - mean) / 4) * 100, 0, 100);
}

function upsideScore0to100(upsidePercent: number): number {
  return clamp(50 + upsidePercent * 1.5, 0, 100);
}

// ---------------------------------------------------------------------------
// Scenarios
// ---------------------------------------------------------------------------

function buildScenario(
  key: Scenario['key'],
  label: string,
  price: number,
  year1: number,
  annualGrowth: number,
  floor: number | null
): Scenario {
  const path: number[] = [round2(price), round2(year1)];
  let prev = year1;
  for (let y = 2; y <= HORIZON_YEARS; y++) {
    let next = prev * (1 + annualGrowth);
    if (floor != null) next = Math.max(next, floor);
    path.push(round2(next));
    prev = next;
  }
  const endValue = path[path.length - 1];
  const changePercent = ((endValue - price) / price) * 100;
  const cagr = (Math.pow(endValue / price, 1 / HORIZON_YEARS) - 1) * 100;
  return {
    key,
    label,
    endValue,
    changePercent: round2(changePercent),
    cagr: round2(cagr),
    path,
  };
}

// ---------------------------------------------------------------------------
// Trade plan
// ---------------------------------------------------------------------------

function computeTradePlan(s: Stock, finalTarget: number, recommendation: Recommendation): TradePlan {
  const price = s.price;
  const ma50 = num(s.fiftyDayMA);
  const ma200 = num(s.twoHundredDayMA);
  const high52 = num(s.fiftyTwoWeekHigh);
  const beta = num(s.beta) ?? 1;

  // Entry zone: a small pullback band, snapping to the 50-day MA when it sits
  // just below price (a common support).
  let entryLow = price * 0.97;
  if (ma50 != null && ma50 < price && ma50 > price * 0.9) {
    entryLow = Math.min(entryLow, ma50);
  }
  const entryHigh = price * 1.01;

  // Tactical target: the 12-month target, snapping to a nearer resistance when
  // one sits between price and the target. When the model sees no upside the
  // target stays below price -- we never fabricate a bullish objective.
  let target = finalTarget;
  if (high52 != null && high52 > price && high52 < finalTarget) {
    target = high52;
  }

  // Stop: the tighter sensible level between a support break and a volatility stop.
  const volPct = clamp(beta * 0.06, 0.05, 0.18);
  const volStop = price * (1 - volPct);
  let support: number | null = null;
  if (ma50 != null && ma50 < price) support = ma50 * 0.98;
  if (ma200 != null && ma200 < price) support = support == null ? ma200 * 0.98 : Math.max(support, ma200 * 0.98);
  let stop = support != null ? Math.max(support, volStop) : volStop;
  stop = clamp(stop, price * 0.8, price * 0.97);

  const reward = target - entryHigh;
  const risk = entryHigh - stop;
  const riskReward = risk > 0 && reward > 0 ? round2(reward / risk) : null;

  const bullish = recommendation === 'buy' || recommendation === 'strong_buy';
  const note = bullish
    ? 'Accumulate within the entry band toward the 12-month target; the stop invalidates the bullish thesis.'
    : recommendation === 'hold'
    ? 'Entry/stop levels if you take a position; the model favors patience over the next 12 months.'
    : 'Model favors avoiding or trimming over the next 12 months; levels shown only if already holding.';

  return {
    entryLow: round2(entryLow),
    entryHigh: round2(entryHigh),
    target: round2(target),
    stop: round2(stop),
    riskReward,
    horizon: '12-month',
    note,
  };
}

// ---------------------------------------------------------------------------
// Bull / bear narrative
// ---------------------------------------------------------------------------

function buildCases(
  s: Stock,
  newsTypes: NewsType[],
  upsidePercent: number
): { bull: Factor[]; bear: Factor[] } {
  const bull: Factor[] = [];
  const bear: Factor[] = [];

  const target = num(s.targetMeanPrice);
  const opinions = num(s.numberOfAnalystOpinions) ?? 0;
  if (target != null && opinions > 0) {
    const upside = ((target - s.price) / s.price) * 100;
    if (upside >= 3) {
      bull.push({
        label: 'Analyst upside',
        detail: `Street mean target implies ${upside.toFixed(0)}% upside across ${opinions} analysts.`,
        polarity: 'bull',
        weight: 9,
      });
    } else if (upside <= -3) {
      bear.push({
        label: 'Limited analyst upside',
        detail: `Street mean target sits ${Math.abs(upside).toFixed(0)}% below the current price.`,
        polarity: 'bear',
        weight: 9,
      });
    }
  }

  const eg = num(s.earningsGrowth);
  const rg = num(s.revenueGrowth);
  if (eg != null && eg >= 10) {
    bull.push({ label: 'Earnings growth', detail: `Earnings up about ${eg.toFixed(0)}% year over year.`, polarity: 'bull', weight: 7 });
  } else if (eg != null && eg < 0) {
    bear.push({ label: 'Earnings decline', detail: `Earnings down about ${Math.abs(eg).toFixed(0)}% year over year.`, polarity: 'bear', weight: 7 });
  }
  if (rg != null && rg >= 10) {
    bull.push({ label: 'Revenue growth', detail: `Revenue expanding about ${rg.toFixed(0)}% year over year.`, polarity: 'bull', weight: 6 });
  } else if (rg != null && rg < 0) {
    bear.push({ label: 'Revenue contraction', detail: `Revenue shrinking about ${Math.abs(rg).toFixed(0)}% year over year.`, polarity: 'bear', weight: 6 });
  }

  const pf50 = num(s.percentFromFiftyDayMA);
  const pf200 = num(s.percentFromTwoHundredDayMA);
  if (pf50 != null && pf200 != null) {
    if (pf50 > 0 && pf200 > 0) {
      bull.push({ label: 'Uptrend intact', detail: 'Trades above both the 50- and 200-day moving averages.', polarity: 'bull', weight: 8 });
    } else if (pf50 < 0 && pf200 < 0) {
      bear.push({ label: 'Downtrend', detail: 'Trades below both the 50- and 200-day moving averages.', polarity: 'bear', weight: 8 });
    }
  }

  const tm = num(s.threeMonthChangePercent);
  if (tm != null) {
    if (tm >= 12) bull.push({ label: 'Positive momentum', detail: `Up ${tm.toFixed(0)}% over the last three months.`, polarity: 'bull', weight: 5 });
    else if (tm <= -12) bear.push({ label: 'Negative momentum', detail: `Down ${Math.abs(tm).toFixed(0)}% over the last three months.`, polarity: 'bear', weight: 5 });
  }

  const rsi = num(s.rsi);
  if (rsi != null) {
    if (rsi > 72) bear.push({ label: 'Overbought', detail: `RSI ${rsi.toFixed(0)} flags stretched, overbought momentum.`, polarity: 'bear', weight: 4 });
    else if (rsi < 30) bull.push({ label: 'Oversold rebound', detail: `RSI ${rsi.toFixed(0)} marks an oversold, mean-reversion setup.`, polarity: 'bull', weight: 4 });
  }
  if (s.macdSignalType) {
    if (s.macdSignalType.includes('bullish')) bull.push({ label: 'MACD bullish', detail: 'MACD momentum is turning or holding positive.', polarity: 'bull', weight: 4 });
    else if (s.macdSignalType.includes('bearish')) bear.push({ label: 'MACD bearish', detail: 'MACD momentum is turning or holding negative.', polarity: 'bear', weight: 4 });
  }

  const valScore = valuationScore0to100(s);
  const fpe = num(s.forwardPeRatio);
  if (valScore != null && fpe != null) {
    if (valScore >= 65) bull.push({ label: 'Attractive valuation', detail: `Forward P/E ${fpe.toFixed(1)} looks reasonable relative to growth.`, polarity: 'bull', weight: 6 });
    else if (valScore <= 38) bear.push({ label: 'Rich valuation', detail: `Forward P/E ${fpe.toFixed(1)} is demanding versus growth.`, polarity: 'bear', weight: 6 });
  }

  const beta = num(s.beta);
  if (beta != null && beta > 1.3) {
    bear.push({ label: 'High volatility', detail: `Beta ${beta.toFixed(2)} means amplified drawdowns in down markets.`, polarity: 'bear', weight: 3 });
  }

  const pfHigh = num(s.percentFromFiftyTwoWeekHigh);
  if (pfHigh != null) {
    if (pfHigh > -5) bull.push({ label: 'Near 52-week highs', detail: 'Price is pressing fresh highs, a sign of demand.', polarity: 'bull', weight: 3 });
    else if (pfHigh < -45) bear.push({ label: 'Deep drawdown', detail: `Sits ${Math.abs(pfHigh).toFixed(0)}% below its 52-week high.`, polarity: 'bear', weight: 3 });
  }

  if (newsTypes.includes('upgrade_downgrade') || newsTypes.includes('price_target')) {
    bull.push({ label: 'Analyst activity', detail: 'Recent rating or price-target headlines in the news flow.', polarity: 'bull', weight: 3 });
  }
  if (newsTypes.includes('earnings')) {
    bull.push({ label: 'Earnings catalyst', detail: 'Recent earnings coverage may move the stock.', polarity: 'bull', weight: 2 });
  }
  if (num(s.dividendYield) != null && (s.dividendYield as number) > 0) {
    bull.push({ label: 'Pays a dividend', detail: `Yields about ${(s.dividendYield as number).toFixed(1)}%, adding total return.`, polarity: 'bull', weight: 2 });
  }

  // Guarantee at least a couple of points per side so the panel never looks empty.
  if (bull.length === 0) {
    bull.push({ label: 'Balanced setup', detail: 'No standout bullish edge; upside depends on execution.', polarity: 'bull', weight: 1 });
  }
  if (bear.length === 0) {
    bear.push({ label: 'Watch the levels', detail: 'No glaring red flags; respect the stop in case sentiment shifts.', polarity: 'bear', weight: 1 });
  }

  bull.sort((a, b) => b.weight - a.weight);
  bear.sort((a, b) => b.weight - a.weight);
  return { bull: bull.slice(0, 5), bear: bear.slice(0, 5) };
}

// ---------------------------------------------------------------------------
// Recommendation labels
// ---------------------------------------------------------------------------

function recommendationFromConviction(conviction: number): Recommendation {
  if (conviction >= 78) return 'strong_buy';
  if (conviction >= 62) return 'buy';
  if (conviction >= 45) return 'hold';
  if (conviction >= 30) return 'sell';
  return 'strong_sell';
}

/**
 * Coherence gate between the headline call and the headline number.
 *
 * The 12-month upside is the most prominent figure on the panel, so the
 * recommendation must agree with it: you cannot show "Buy" when the model's
 * own target is below the current price, nor "Sell" when it is well above.
 * These ranks bound how bullish/bearish the call may be, given the upside.
 *
 * Rank scale: 0 = strong_sell, 1 = sell, 2 = hold, 3 = buy, 4 = strong_buy.
 */
function upsideCeilingRank(upsidePercent: number): number {
  if (upsidePercent >= 12) return 4; // big upside -> strong buy allowed
  if (upsidePercent >= 5) return 3; //  clear upside -> up to buy
  if (upsidePercent >= -5) return 2; // roughly flat -> at most hold
  return 1; //                          negative target -> at most sell
}

function upsideFloorRank(upsidePercent: number): number {
  if (upsidePercent >= 12) return 2; // clearly bullish target -> at least hold
  if (upsidePercent >= 5) return 1; //  positive target -> never strong_sell
  return 0;
}

// Conviction band edges, inset slightly from the recommendationFromConviction
// thresholds so a clamped score always renders inside its label's band (no
// "60 conviction shown as Buy" rounding mismatches).
const CONVICTION_LOWER = [0, 31, 46, 63, 79];
const CONVICTION_UPPER = [28, 43, 60, 76, 100];

const RECOMMENDATION_LABELS: Record<Recommendation, string> = {
  strong_buy: 'Strong Buy',
  buy: 'Buy',
  hold: 'Hold',
  sell: 'Sell',
  strong_sell: 'Strong Sell',
};

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

export function buildForecast(s: Stock, newsTypes: NewsType[] = []): ForecastResult {
  const price = s.price;

  const { base, estimates, hasAnalystCoverage, coverageFactor, dispersion } = computeBaseValuation(s);
  const adjustments = computeAdjustments(s, base, coverageFactor);

  // Apply the adjustment waterfall.
  let finalTarget = base;
  for (const adj of adjustments) finalTarget *= 1 + adj.pct;

  // Clamp within the analyst band when available, then a global sanity band.
  const targetLowPrice = num(s.targetLowPrice);
  const targetHighPrice = num(s.targetHighPrice);
  if (hasAnalystCoverage && targetLowPrice != null && targetHighPrice != null && targetLowPrice < targetHighPrice) {
    finalTarget = clamp(finalTarget, targetLowPrice * 0.97, targetHighPrice * 1.03);
  }
  finalTarget = clamp(finalTarget, price * 0.5, price * 3);
  finalTarget = round2(finalTarget);

  const upsidePercent = round2(((finalTarget - price) / price) * 100);

  // Conviction blend.
  const components: { score: number; weight: number }[] = [];
  components.push({ score: upsideScore0to100(upsidePercent), weight: 0.4 });
  components.push({ score: technicalScore0to100(s), weight: 0.2 });
  components.push({ score: momentumScore0to100(s), weight: 0.15 });
  const analyst = analystScore0to100(s);
  if (analyst != null) components.push({ score: analyst, weight: 0.15 });
  const valuation = valuationScore0to100(s);
  if (valuation != null) components.push({ score: valuation, weight: 0.1 });

  const weightSum = components.reduce((sum, c) => sum + c.weight, 0) || 1;
  const rawConviction = clamp(components.reduce((sum, c) => sum + c.score * c.weight, 0) / weightSum, 0, 100);

  // Gate conviction (and therefore the recommendation) so the call can never
  // contradict its own 12-month target. The displayed conviction is the gated
  // value, keeping the number, the label, and the upside all consistent.
  const ceilingRank = upsideCeilingRank(upsidePercent);
  const floorRank = upsideFloorRank(upsidePercent);
  const conviction = round2(
    clamp(rawConviction, CONVICTION_LOWER[floorRank], CONVICTION_UPPER[ceilingRank])
  );

  const recommendation = recommendationFromConviction(conviction);

  // Confidence: coverage + estimate agreement + directional alignment.
  const coverageComp = hasAnalystCoverage ? coverageFactor : 0.25;
  const dispersionComp = clamp(1 - dispersion / 0.4, 0, 1);
  const callBullish = conviction >= 50;
  const directional = [
    technicalScore0to100(s) >= 50,
    momentumScore0to100(s) >= 50,
    analyst != null ? analyst >= 50 : null,
    valuation != null ? valuation >= 50 : null,
    upsidePercent >= 0,
  ].filter((v): v is boolean => v != null);
  const aligned = directional.filter((v) => v === callBullish).length / (directional.length || 1);
  const confidence = round2(clamp((0.35 * coverageComp + 0.35 * dispersionComp + 0.3 * aligned) * 100, 5, 97));
  const confidenceLabel: ForecastResult['confidenceLabel'] =
    confidence >= 68 ? 'High' : confidence >= 45 ? 'Moderate' : 'Low';

  // 12-month bear / bull bookends, then snap them around the target so the
  // ordering conservative < target < optimistic always holds.
  const beta = num(s.beta) ?? 1;
  let rawLow: number;
  let rawHigh: number;
  if (hasAnalystCoverage && targetLowPrice != null && targetHighPrice != null && targetLowPrice < targetHighPrice) {
    rawLow = targetLowPrice;
    rawHigh = targetHighPrice;
  } else {
    const spread = clamp(0.14 + Math.max(0, beta - 1) * 0.12, 0.14, 0.45);
    rawHigh = finalTarget * (1 + spread);
    rawLow = finalTarget * (1 - spread);
  }
  const targetHigh = round2(Math.max(rawHigh, finalTarget * 1.03));
  const targetLow = round2(Math.min(rawLow, finalTarget * 0.97));

  // Multi-year scenarios. Terminal growth is the long-run engine of the path;
  // the conservative floor is capped below price so a high MA in a downtrend
  // cannot prop the bear case above the current price.
  const longTermGrowthSource = num(s.revenueGrowth) ?? num(s.earningsGrowth);
  const gTerminal = clamp((longTermGrowthSource ?? 8) / 100, -0.03, 0.15);
  const low52 = num(s.fiftyTwoWeekLow);
  const supportFloor = Math.min(price * 0.9, Math.max(price * 0.45, (low52 ?? price * 0.5) * 0.9));
  const conservativeFloor = Math.min(supportFloor, targetLow);

  const scenarios: Scenario[] = [
    buildScenario('optimistic', 'Optimistic', price, targetHigh, clamp(gTerminal + 0.05, 0.02, 0.22), null),
    buildScenario('target', 'Target', price, finalTarget, gTerminal, null),
    buildScenario('conservative', 'Conservative', price, targetLow, clamp(gTerminal - 0.07, -0.04, 0.1), conservativeFloor),
  ];

  const baseYear = new Date().getFullYear();
  const scenarioLabels = Array.from({ length: HORIZON_YEARS + 1 }, (_, i) => String(baseYear + i));

  const tradePlan = computeTradePlan(s, finalTarget, recommendation);
  const { bull, bear } = buildCases(s, newsTypes, upsidePercent);

  // Data quality assessment.
  let dataQuality: ForecastResult['dataQuality'] = 'medium';
  const hasTechnicals = num(s.rsi) != null || s.macdSignalType != null;
  if (hasAnalystCoverage && hasTechnicals && (num(s.forwardEps) != null || num(s.peRatio) != null)) dataQuality = 'high';
  else if (!hasAnalystCoverage && !hasTechnicals) dataQuality = 'low';

  const sources = ['Yahoo Finance fundamentals & analyst data', 'Live technicals (RSI, MACD, moving averages)', 'Recent news catalysts'];

  const summary = buildSummary(s, recommendation, finalTarget, upsidePercent, hasAnalystCoverage);

  return {
    symbol: s.symbol,
    currency: s.currency,
    asOf: s.lastUpdated instanceof Date ? s.lastUpdated : new Date(),
    price,
    recommendation,
    recommendationLabel: RECOMMENDATION_LABELS[recommendation],
    conviction,
    confidence,
    confidenceLabel,
    targetPrice: finalTarget,
    upsidePercent,
    targetLow,
    targetHigh,
    baseValuation: round2(base),
    estimates,
    adjustments,
    scenarios,
    horizonYears: HORIZON_YEARS,
    scenarioLabels,
    tradePlan,
    bullCase: bull,
    bearCase: bear,
    summary,
    dataQuality,
    hasAnalystCoverage,
    sources,
  };
}

function buildSummary(
  s: Stock,
  recommendation: Recommendation,
  target: number,
  upsidePercent: number,
  hasAnalystCoverage: boolean
): string {
  const direction = upsidePercent >= 0 ? 'upside' : 'downside';
  const verb =
    recommendation === 'strong_buy' || recommendation === 'buy'
      ? 'favors accumulating'
      : recommendation === 'hold'
      ? 'suggests holding'
      : 'favors reducing exposure to';
  const coverage = hasAnalystCoverage ? 'analyst targets, ' : '';
  return (
    `The model ${verb} ${s.symbol}, with a 12-month target around ${target.toFixed(2)} ` +
    `(${upsidePercent >= 0 ? '+' : ''}${upsidePercent.toFixed(1)}% ${direction}). ` +
    `It blends ${coverage}forward earnings, trend structure and momentum into a single transparent call.`
  );
}
