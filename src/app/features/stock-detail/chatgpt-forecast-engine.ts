/**
 * EXPERIMENTAL — "Per ChatGPT" forecast model.
 *
 * A standalone, deterministic implementation of the layered valuation that
 * ChatGPT proposed, kept entirely separate from the production `forecast-engine.ts`
 * so it can power its own dialog tab without touching the main model:
 *
 *   Layer 1  Fundamental forecast      -> Forward EPS (+ implied growth)
 *   Layer 2  Valuation                 -> Justified P/E (historical + peer + growth-adjusted)
 *   Layer 3  Scenarios                 -> Bear / Base / Bull from EPS x P/E grids
 *   Layer 4  Technical overlay         -> Confidence / probability score (NOT price)
 *
 * Intrinsic (fundamental) value blends an earnings-multiple value, a peer-relative
 * value and a small EPS-proxy DCF. Technicals never move the price target; they
 * only move the confidence score. Analyst targets are shown as a "Model vs Street"
 * comparison, never as a valuation input. The current price is used only to derive
 * upside/downside, never as a valuation anchor.
 *
 * Where the data feed lacks a true input (peer multiples, free cash flow, a
 * historical P/E series) we use transparent, clearly-labelled approximations:
 *   - "historical" P/E   -> the current trailing P/E (best available proxy)
 *   - "peer" P/E         -> a static sector reference multiple
 *   - DCF                -> forward EPS used as a free-cash-flow-per-share proxy
 */

import { Stock } from '../../core/models/stock.model';

export type ChatGptRecommendation = 'strong_sell' | 'sell' | 'hold' | 'buy' | 'strong_buy';

export interface ChatGptPeComponent {
  label: string;
  value: number;
  detail: string;
}

export interface ChatGptValueComponent {
  label: string;
  value: number;
  weight: number;
  detail: string;
}

export interface ChatGptScenario {
  key: 'bear' | 'base' | 'bull';
  label: string;
  eps: number;
  pe: number;
  value: number;
  changePercent: number;
  rewardRisk: number | null;
}

export interface ChatGptConfidenceFactor {
  label: string;
  effect: number; // signed percentage-point contribution
  note: string;
}

export interface ChatGptForecast {
  symbol: string;
  currency: string;
  price: number;

  // Layer 1 — fundamental forecast.
  trailingEps: number | null;
  forwardEps: number | null;
  impliedGrowthPct: number | null;

  // Layer 2 — valuation.
  justifiedPe: number;
  peComponents: ChatGptPeComponent[];

  // Intrinsic value blend.
  components: ChatGptValueComponent[];
  fundamentalTarget: number;
  upsidePercent: number;

  // Layer 3 — scenarios.
  scenarios: ChatGptScenario[];

  // Layer 4 — technical confidence.
  confidence: number;
  confidenceLabel: 'High' | 'Moderate' | 'Low';
  confidenceFactors: ChatGptConfidenceFactor[];

  recommendation: ChatGptRecommendation;
  recommendationLabel: string;

  // Model vs Street (validation only).
  street: { target: number | null; opinions: number | null; deltaPct: number | null };

  // Risk / trade levels (volatility-based).
  tradePlan: { stop: number; entryLow: number; entryHigh: number; volatilityPct: number; note: string };

  notes: string[];
  dataQuality: 'high' | 'medium' | 'low';
}

const REC_LABELS: Record<ChatGptRecommendation, string> = {
  strong_buy: 'Strong Buy',
  buy: 'Buy',
  hold: 'Hold',
  sell: 'Sell',
  strong_sell: 'Strong Sell',
};

/** Static sector reference forward multiples — a stand-in for true peer comps. */
const SECTOR_PE: Record<string, number> = {
  Technology: 26,
  'Communication Services': 19,
  'Consumer Cyclical': 22,
  'Consumer Defensive': 21,
  Healthcare: 18,
  'Financial Services': 14,
  Industrials: 20,
  Energy: 12,
  'Basic Materials': 15,
  'Real Estate': 18,
  Utilities: 17,
};
const DEFAULT_PEER_PE = 19;

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}
function num(v: number | null | undefined): number | null {
  return typeof v === 'number' && isFinite(v) ? v : null;
}
function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

/** Clean forward-looking growth (%) from forward vs trailing EPS, else reported. */
function impliedGrowthPct(s: Stock): number | null {
  const fwd = num(s.forwardEps);
  const trail = num(s.eps);
  if (fwd != null && fwd > 0 && trail != null && trail > 0) {
    return clamp((fwd / trail - 1) * 100, -40, 40);
  }
  const reported = [num(s.earningsGrowth), num(s.revenueGrowth)].filter(
    (v): v is number => v != null
  );
  if (reported.length === 0) return null;
  return clamp(Math.max(...reported), -40, 40);
}

function peerPe(s: Stock): number {
  return SECTOR_PE[s.sector] ?? DEFAULT_PEER_PE;
}

/** EPS-proxy DCF: forward EPS as FCF/share, fading growth to a 3% terminal. */
function dcfValue(s: Stock, eps: number, growthPct: number | null): number | null {
  if (eps <= 0) return null;
  const beta = num(s.beta) ?? 1.1;
  const discount = clamp(0.075 + (beta - 1) * 0.02, 0.07, 0.13);
  const gTerminal = 0.03;
  const g1 = clamp((growthPct ?? 6) / 100, -0.02, 0.18);
  let pv = 0;
  let cf = eps;
  let lastCf = eps;
  for (let t = 1; t <= 5; t++) {
    // Linearly fade the growth rate from g1 to the terminal rate.
    const g = g1 + ((gTerminal - g1) * (t - 1)) / 4;
    cf = cf * (1 + g);
    pv += cf / Math.pow(1 + discount, t);
    lastCf = cf;
  }
  const terminal = (lastCf * (1 + gTerminal)) / (discount - gTerminal);
  pv += terminal / Math.pow(1 + discount, 5);
  // A perpetuity on peak (cyclical) earnings runs away; keep the DCF leg within
  // a sane band so it can't dominate the blend.
  return clamp(pv, s.price * 0.5, s.price * 1.6);
}

function confidenceLabel(c: number): ChatGptForecast['confidenceLabel'] {
  return c >= 68 ? 'High' : c >= 45 ? 'Moderate' : 'Low';
}

/**
 * Hard ceiling on the justified multiple by growth tier. Memory/cyclical names
 * (and trough-earnings trailing P/Es) must not earn a rich multiple just because
 * one input is elevated; this caps how far growth can expand the multiple, which
 * — combined with the market-anchored clamp below — prevents counting growth
 * twice (once in EPS, again in the multiple).
 */
function maxJustifiedPe(growthPct: number | null): number {
  const g = growthPct ?? 0;
  if (g < 10) return 15;
  if (g < 20) return 20;
  if (g < 30) return 25;
  if (g < 40) return 30;
  return 35;
}

function recommendationFromUpside(upside: number, confidence: number): ChatGptRecommendation {
  // Fundamental upside sets the call; confidence only sharpens the extreme ends.
  if (upside >= 12) return confidence >= 55 ? 'strong_buy' : 'buy';
  if (upside >= 4) return 'buy';
  if (upside > -4) return 'hold';
  if (upside > -12) return 'sell';
  return confidence >= 55 ? 'strong_sell' : 'sell';
}

export function buildChatGptForecast(s: Stock): ChatGptForecast {
  const price = s.price;
  const notes: string[] = [];

  const trailingEps = num(s.eps);
  let forwardEps = num(s.forwardEps);
  const growth = impliedGrowthPct(s);

  // Layer 1: if forward EPS is missing, fall back to trailing so the model still runs.
  if (forwardEps == null || forwardEps <= 0) {
    if (trailingEps != null && trailingEps > 0) {
      forwardEps = trailingEps;
      notes.push('Forward EPS unavailable — using trailing EPS as the earnings base.');
    }
  }

  // --- Layer 2: justified P/E with hard growth-tier + market-anchored caps ---
  const histPe = num(s.peRatio);
  const fwdPe = num(s.forwardPeRatio);
  const peerMultiple = peerPe(s);
  const tierCap = maxJustifiedPe(growth); // growth-tier ceiling (see maxJustifiedPe)

  // Each candidate multiple is capped at the growth tier so a trough-earnings
  // trailing P/E (sky-high for cyclicals like memory) or an aggressive growth
  // multiple cannot dominate the blend.
  const peComponents: ChatGptPeComponent[] = [];
  if (fwdPe != null && fwdPe > 0) {
    peComponents.push({ label: 'Forward P/E (market)', value: round2(clamp(fwdPe, 5, tierCap)), detail: 'The multiple the market currently assigns to forward earnings — the primary anchor.' });
  } else if (histPe != null && histPe > 0) {
    peComponents.push({ label: 'Trailing P/E', value: round2(clamp(histPe, 5, tierCap)), detail: 'Trailing P/E (no forward P/E available), capped at the growth tier.' });
  }
  peComponents.push({ label: 'Sector peer P/E (reference)', value: round2(clamp(peerMultiple, 5, tierCap)), detail: `Static ${s.sector || 'market'} reference, capped at the ${tierCap}x growth-tier ceiling.` });
  peComponents.push({ label: 'Growth-adjusted P/E', value: round2(clamp(8 + Math.max(0, growth ?? 6) * 1.0, 8, tierCap)), detail: `Justified by ~${(growth ?? 6).toFixed(0)}% growth, capped at the ${tierCap}x growth-tier ceiling.` });

  let justifiedPe = peComponents.reduce((sum, c) => sum + c.value, 0) / peComponents.length;
  justifiedPe = Math.min(justifiedPe, tierCap);
  // Institutional sanity check: never pay far above the multiple the market
  // itself assigns. Cyclicals are discounted for future downcycles, so a low
  // forward P/E is information, not an opportunity to apply a 35x multiple.
  if (fwdPe != null && fwdPe > 0) {
    justifiedPe = clamp(justifiedPe, fwdPe * 0.7, fwdPe * 1.3);
  }
  justifiedPe = round2(justifiedPe);

  // --- Intrinsic value blend (earnings-multiple 70% / peer 20% / DCF 10%) ---
  const components: ChatGptValueComponent[] = [];
  let fundamentalTarget = price;

  if (forwardEps != null && forwardEps > 0) {
    const earningsValue = forwardEps * justifiedPe;
    // Peer multiple also respects the market band so a generic sector P/E can't
    // re-inflate a cyclical's value above what the justified multiple allows.
    const peerCapped =
      fwdPe != null && fwdPe > 0 ? clamp(peerMultiple, fwdPe * 0.7, fwdPe * 1.3) : Math.min(peerMultiple, tierCap);
    const peerValue = forwardEps * peerCapped;
    const dcf = dcfValue(s, forwardEps, growth);

    components.push({ label: 'Earnings × justified multiple', value: round2(earningsValue), weight: dcf != null ? 0.7 : 0.78, detail: `Forward EPS ${forwardEps.toFixed(2)} × ${justifiedPe.toFixed(1)} justified P/E.` });
    components.push({ label: 'Peer relative value', value: round2(peerValue), weight: dcf != null ? 0.2 : 0.22, detail: `Forward EPS ${forwardEps.toFixed(2)} × ${peerCapped.toFixed(1)} peer P/E (market-capped).` });
    if (dcf != null) {
      components.push({ label: 'DCF (EPS-proxy)', value: round2(dcf), weight: 0.1, detail: 'Forward EPS as FCF/share, growth fading to a 3% terminal, discounted.' });
    }

    const wsum = components.reduce((a, c) => a + c.weight, 0) || 1;
    fundamentalTarget = components.reduce((a, c) => a + c.value * c.weight, 0) / wsum;
  } else {
    notes.push('No usable EPS — falling back to analyst target / current price.');
    fundamentalTarget = num(s.targetMeanPrice) ?? price;
  }

  fundamentalTarget = round2(clamp(fundamentalTarget, price * 0.4, price * 3));
  const upsidePercent = round2(((fundamentalTarget - price) / price) * 100);

  // --- Layer 3: Bear / Base / Bull ---
  // Base is the blended fundamental target; Bear/Bull are scaled from it so the
  // ordering Bear < Base < Bull holds by construction (no cross-method mixing).
  // The displayed P/E is implied (value / EPS) so EPS × P/E always equals value.
  const scenarios: ChatGptScenario[] = [];
  if (forwardEps != null && forwardEps > 0) {
    const grid: { key: ChatGptScenario['key']; label: string; valueK: number; epsK: number }[] = [
      { key: 'bear', label: 'Bear', valueK: 0.78, epsK: 0.9 },
      { key: 'base', label: 'Base', valueK: 1.0, epsK: 1.0 },
      { key: 'bull', label: 'Bull', valueK: 1.3, epsK: 1.1 },
    ];
    for (const g of grid) {
      const value = round2(fundamentalTarget * g.valueK);
      const eps = round2(forwardEps * g.epsK);
      const pe = round2(eps > 0 ? value / eps : justifiedPe);
      const changePercent = round2(((value - price) / price) * 100);
      scenarios.push({ key: g.key, label: g.label, eps, pe, value, changePercent, rewardRisk: null });
    }
  }

  // --- Layer 4: technical overlay -> confidence (probability of reaching target) ---
  const confidenceFactors: ChatGptConfidenceFactor[] = [];
  let confidence = 50;
  const add = (label: string, effect: number, note: string) => {
    if (effect !== 0) {
      confidence += effect;
      confidenceFactors.push({ label, effect, note });
    }
  };
  const pf200 = num(s.percentFromTwoHundredDayMA);
  if (pf200 != null) add('200-day MA', pf200 >= 0 ? 10 : -10, pf200 >= 0 ? 'Trading above the 200-day average.' : 'Trading below the 200-day average.');
  const pf50 = num(s.percentFromFiftyDayMA);
  if (pf50 != null) add('50-day MA', pf50 >= 0 ? 5 : -5, pf50 >= 0 ? 'Above the 50-day average.' : 'Below the 50-day average.');
  if (s.macdSignalType) {
    const bull = s.macdSignalType.includes('bullish');
    add('MACD', bull ? 8 : -8, bull ? 'MACD momentum is positive.' : 'MACD momentum is negative.');
  }
  const rsi = num(s.rsi);
  if (rsi != null) {
    if (rsi > 70) add('RSI', -5, `RSI ${rsi.toFixed(0)} — overbought, pullback risk.`);
    else if (rsi < 30) add('RSI', -5, `RSI ${rsi.toFixed(0)} — oversold, unstable.`);
    else if (rsi >= 45 && rsi <= 65) add('RSI', 5, `RSI ${rsi.toFixed(0)} — constructive, not stretched.`);
  }
  const tm = num(s.threeMonthChangePercent);
  if (tm != null && pf50 != null && pf200 != null && tm > 10 && pf50 > 0 && pf200 > 0) {
    add('Trend strength', 10, `Strong uptrend (+${tm.toFixed(0)}% over 3 months, above both MAs).`);
  } else if (tm != null && tm < -10 && pf50 != null && pf50 < 0) {
    add('Trend strength', -10, `Downtrend (${tm.toFixed(0)}% over 3 months, below the 50-day MA).`);
  }
  // Confidence must fall as the target diverges further from the current price:
  // a large modelled upside relies on more extrapolation, so it is less certain.
  const absUpside = Math.abs(upsidePercent);
  if (absUpside > 60) add('Speculative upside', -15, `Target is ${absUpside.toFixed(0)}% from price — large divergence demands heavy extrapolation.`);
  else if (absUpside > 35) add('Wide upside', -8, `Target is ${absUpside.toFixed(0)}% from price — added uncertainty.`);
  confidence = round2(clamp(confidence, 5, 95));

  const recommendation = recommendationFromUpside(upsidePercent, confidence);

  // Model vs Street.
  const streetTarget = num(s.targetMeanPrice);
  const street = {
    target: streetTarget,
    opinions: num(s.numberOfAnalystOpinions),
    deltaPct: streetTarget != null && streetTarget > 0 ? round2(((fundamentalTarget - streetTarget) / streetTarget) * 100) : null,
  };

  // Volatility-based risk levels (ATR-proxy from beta + 52-week range).
  const beta = num(s.beta) ?? 1.1;
  const high52 = num(s.fiftyTwoWeekHigh);
  const low52 = num(s.fiftyTwoWeekLow);
  let rangeVol = 0.12;
  if (high52 != null && low52 != null && price > 0 && high52 > low52) {
    rangeVol = clamp((high52 - low52) / price / 4, 0.06, 0.3);
  }
  const volatilityPct = round2(clamp(Math.max(rangeVol, beta * 0.06), 0.05, 0.3) * 100) / 100;
  const stop = round2(price * (1 - volatilityPct));
  const entryLow = round2(price * (1 - volatilityPct / 2));
  const entryHigh = round2(price * 1.01);

  // Per-scenario reward:risk against the volatility stop.
  for (const sc of scenarios) {
    const reward = sc.value - entryHigh;
    const risk = entryHigh - stop;
    sc.rewardRisk = risk > 0 && reward > 0 ? round2(reward / risk) : null;
  }

  const tradePlan = {
    stop,
    entryLow,
    entryHigh,
    volatilityPct,
    note: `Volatility-based stop ~${(volatilityPct * 100).toFixed(0)}% below price (ATR proxy from beta + 52-week range). Reward:risk shown per scenario.`,
  };

  // Data quality.
  let dataQuality: ChatGptForecast['dataQuality'] = 'medium';
  const hasTech = num(s.rsi) != null || s.macdSignalType != null;
  if (forwardEps != null && forwardEps > 0 && hasTech && (histPe != null || fwdPe != null)) dataQuality = 'high';
  else if (forwardEps == null) dataQuality = 'low';

  notes.push('Peer multiple is a static sector reference, not a live comp set.');
  notes.push('DCF uses forward EPS as a free-cash-flow proxy — directional, not a full model.');

  return {
    symbol: s.symbol,
    currency: s.currency,
    price,
    trailingEps,
    forwardEps,
    impliedGrowthPct: growth,
    justifiedPe,
    peComponents,
    components,
    fundamentalTarget,
    upsidePercent,
    scenarios,
    confidence,
    confidenceLabel: confidenceLabel(confidence),
    confidenceFactors,
    recommendation,
    recommendationLabel: REC_LABELS[recommendation],
    street,
    tradePlan,
    notes,
    dataQuality,
  };
}
