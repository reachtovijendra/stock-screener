/**
 * Day Trade Scoring Engine — Two-Pass Architecture
 *
 * Pass 1 (quickScore): Fast filter using quote-level data only.
 *   Narrows ~300+ stocks to top ~50 candidates.
 *
 * Pass 2 (fullScore): Computes RSI, MACD, ATR, streak, consolidation
 *   for the top candidates and applies the full scoring model.
 *
 * Shared by both US and India cron jobs.
 */

import https from 'https';
import type { StockQuote } from './yahoo-client';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface StockData {
  symbol: string;
  name: string;
  price: number;
  change: number;
  changePercent: number;
  market: 'US' | 'IN';
  exchange: string;
  currency: string;
  marketCap: number;
  volume: number;
  avgVolume: number;
  relativeVolume: number;
  fiftyTwoWeekHigh: number;
  fiftyTwoWeekLow: number;
  percentFromFiftyTwoWeekHigh: number;
  fiftyDayMA: number | null;
  twoHundredDayMA: number | null;
  percentFromFiftyDayMA: number | null;
  percentFromTwoHundredDayMA: number | null;
  beta: number | null;
  sector: string;
  industry: string;
}

export interface TechnicalData {
  rsi: number | null;
  macd: number | null;
  macdSignal: number | null;
  macdHistogram: number | null;
  sma50: number | null;
  sma200: number | null;
  atr: number | null;
  atrPercent: number | null;        // ATR as % of price — volatility expansion filter
  recentCloses: number[];           // last 5 daily closes for streak detection
  recentHighs: number[];            // last 5 daily highs for consolidation detection
  recentLows: number[];             // last 5 daily lows for consolidation detection
  consolidationTightness: number | null; // ratio of recent range to ATR (lower = tighter)
}

/** Result of the two-pass scoring for a single stock pick */
export interface DayTradePick {
  symbol: string;
  name: string;
  price: number;
  previousClose: number;
  preMarketPrice: number | null;    // US only
  gapPercent: number;               // US only (premarket vs prev close)
  changePercent: number;            // previous session change %
  preMarketVolume: number | null;   // US only
  avgVolume: number;
  relativeVolume: number;           // prev session RVOL
  fiftyDayMA: number | null;
  twoHundredDayMA: number | null;
  market: string;
  sector: string;
  marketCap: number;
  beta: number | null;
  // --- Full scoring results (from Pass 2) ---
  score: number;
  priority: 'High' | 'Medium' | 'Low';
  signals: string[];
  rsi: number | null;
  macdHistogram: number | null;
  atr: number | null;
  atrPercent: number | null;
  // --- Targets ---
  entryTrigger: number;   // premarket high (US) or prev day high (India) — the "when"
  buyPrice: number;       // entry on pullback from trigger
  sellPrice: number;      // target
  stopLoss: number;       // stop
  rewardRiskRatio: number;
  // --- Relative strength ---
  relativeStrength: number | null;  // stock change% minus index change%
  // --- Entry rules (text for email) ---
  entryRule: string;
  // --- Catalyst ---
  hasCatalyst: boolean;
  catalystLabel: string | null;
  // --- Setup classification ---
  setupType: 'breakout' | 'pullback' | 'momentum';
  extensionPercent: number | null;  // how far price is from key level (DMA/prev close)
}

export interface DayTradeScore {
  symbol: string;
  name: string;
  price: number;
  change: number;
  changePercent: number;
  market: 'US' | 'IN';
  exchange: string;
  currency: string;
  marketCap: number;
  sector: string;
  score: number;
  signals: string[];
  breakdown: { label: string; value: string; points: number }[];
  buyPrice: number;
  sellPrice: number;
  stopLoss: number;
  atr: number | null;
  rsi: number | null;
  macdHistogram: number | null;
  relativeVolume: number;
  beta: number | null;
}

// ---------------------------------------------------------------------------
// Technical Indicator Calculations
// ---------------------------------------------------------------------------

function httpsRequest(options: https.RequestOptions): Promise<{ statusCode: number; body: string }> {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk: Buffer) => (data += chunk.toString()));
      res.on('end', () => {
        resolve({ statusCode: res.statusCode || 500, body: data });
      });
    });
    req.on('error', reject);
    req.setTimeout(15000, () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });
    req.end();
  });
}

export async function fetchHistoricalOHLC(
  symbol: string,
  range: string = '3mo'
): Promise<{ highs: number[]; lows: number[]; closes: number[] }> {
  try {
    const response = await httpsRequest({
      hostname: 'query1.finance.yahoo.com',
      port: 443,
      path: `/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=${range}`,
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': '*/*',
      },
    });

    if (response.statusCode === 200) {
      const data = JSON.parse(response.body);
      const result = data.chart?.result?.[0];
      if (result?.indicators?.quote?.[0]) {
        const q = result.indicators.quote[0];
        const highs: number[] = [];
        const lows: number[] = [];
        const closes: number[] = [];

        for (let i = 0; i < (q.close?.length || 0); i++) {
          if (q.high?.[i] != null && q.low?.[i] != null && q.close?.[i] != null) {
            highs.push(q.high[i]);
            lows.push(q.low[i]);
            closes.push(q.close[i]);
          }
        }
        return { highs, lows, closes };
      }
    }
  } catch (err: any) {
    console.error(`[DayTrade] Failed to fetch OHLC for ${symbol}: ${err.message}`);
  }
  return { highs: [], lows: [], closes: [] };
}

export function calculateRSI(closes: number[], period: number = 14): number | null {
  if (closes.length < period + 1) return null;

  let gains = 0;
  let losses = 0;

  for (let i = 1; i <= period; i++) {
    const change = closes[i] - closes[i - 1];
    if (change > 0) gains += change;
    else losses += Math.abs(change);
  }

  let avgGain = gains / period;
  let avgLoss = losses / period;

  for (let i = period + 1; i < closes.length; i++) {
    const change = closes[i] - closes[i - 1];
    const gain = change > 0 ? change : 0;
    const loss = change < 0 ? Math.abs(change) : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
  }

  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return Math.round((100 - 100 / (1 + rs)) * 10) / 10;
}

export function calculateMACD(closes: number[]): {
  macd: number | null;
  signal: number | null;
  histogram: number | null;
} {
  if (closes.length < 35) return { macd: null, signal: null, histogram: null };

  const ema = (data: number[], period: number): number[] => {
    const m = 2 / (period + 1);
    const out: number[] = [data[0]];
    for (let i = 1; i < data.length; i++) {
      out.push((data[i] - out[i - 1]) * m + out[i - 1]);
    }
    return out;
  };

  const ema12 = ema(closes, 12);
  const ema26 = ema(closes, 26);

  const macdLine = ema12[ema12.length - 1] - ema26[ema26.length - 1];
  const macdValues = ema12.slice(25).map((v, i) => v - ema26[i + 25]);
  const signalLine = ema(macdValues, 9);
  const signal = signalLine[signalLine.length - 1];
  const histogram = macdLine - signal;

  return {
    macd: Math.round(macdLine * 1000) / 1000,
    signal: Math.round(signal * 1000) / 1000,
    histogram: Math.round(histogram * 1000) / 1000,
  };
}

export function calculateSMA(closes: number[], period: number): number | null {
  if (closes.length < period) return null;
  const slice = closes.slice(-period);
  return Math.round((slice.reduce((a, b) => a + b, 0) / period) * 100) / 100;
}

export function calculateATR(
  highs: number[],
  lows: number[],
  closes: number[],
  period: number = 14
): number | null {
  const len = Math.min(highs.length, lows.length, closes.length);
  if (len < period + 1) return null;

  const trueRanges: number[] = [];
  for (let i = 1; i < len; i++) {
    const hl = highs[i] - lows[i];
    const hpc = Math.abs(highs[i] - closes[i - 1]);
    const lpc = Math.abs(lows[i] - closes[i - 1]);
    trueRanges.push(Math.max(hl, hpc, lpc));
  }

  if (trueRanges.length < period) return null;

  let atr = trueRanges.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < trueRanges.length; i++) {
    atr = (atr * (period - 1) + trueRanges[i]) / period;
  }

  return Math.round(atr * 100) / 100;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// ---------------------------------------------------------------------------
// Compute full technicals for a single stock (enhanced)
// ---------------------------------------------------------------------------

export async function computeTechnicals(symbol: string, price?: number): Promise<TechnicalData> {
  const { highs, lows, closes } = await fetchHistoricalOHLC(symbol, '1y');

  const rsi = calculateRSI(closes);
  const macdData = calculateMACD(closes);
  const sma50 = calculateSMA(closes, 50);
  const sma200 = calculateSMA(closes, 200);
  const atr = calculateATR(highs, lows, closes);
  const recentCloses = closes.slice(-5);
  const recentHighs = highs.slice(-5);
  const recentLows = lows.slice(-5);

  // ATR as % of price — measures if stock has enough range for day trading
  const currentPrice = price || (closes.length > 0 ? closes[closes.length - 1] : 0);
  const atrPercent = atr && currentPrice > 0 ? round2((atr / currentPrice) * 100) : null;

  // Consolidation tightness: recent 5-day range vs ATR
  // Lower ratio = tighter consolidation = better breakout potential
  let consolidationTightness: number | null = null;
  if (recentHighs.length >= 5 && recentLows.length >= 5 && atr && atr > 0) {
    const rangeHigh = Math.max(...recentHighs);
    const rangeLow = Math.min(...recentLows);
    const range = rangeHigh - rangeLow;
    consolidationTightness = round2(range / atr);
  }

  return {
    rsi,
    macd: macdData.macd,
    macdSignal: macdData.signal,
    macdHistogram: macdData.histogram,
    sma50,
    sma200,
    atr,
    atrPercent,
    recentCloses,
    recentHighs,
    recentLows,
    consolidationTightness,
  };
}

// ---------------------------------------------------------------------------
// Pass 1: Quick Score (quote data only, runs on all stocks)
// ---------------------------------------------------------------------------

export interface QuickScoreResult {
  quote: StockQuote;
  quickScore: number;
}

/**
 * Fast scoring using only quote-level data.
 * Used to narrow ~300+ stocks to top ~50 candidates for full analysis.
 */
export function quickScore(q: StockQuote): number {
  let score = 0;

  // Previous session momentum (always available)
  const absChange = Math.abs(q.changePercent);
  if (absChange > 5) score += 15;
  else if (absChange >= 3) score += 10;
  else if (absChange >= 1.5) score += 5;

  // Pre-market gap (US only, available pre-market)
  if (q.preMarketPrice && q.price > 0) {
    const gap = Math.abs(((q.preMarketPrice - q.price) / q.price) * 100);
    if (gap > 5) score += 15;
    else if (gap >= 2) score += 10;
    else if (gap >= 1) score += 5;
  }

  // Trend alignment
  if (q.fiftyDayMA && q.twoHundredDayMA) {
    if (q.fiftyDayMA > q.twoHundredDayMA && q.price > q.fiftyDayMA) score += 10;
    else if (q.fiftyDayMA > q.twoHundredDayMA) score += 5;
  }

  // Liquidity
  if (q.avgVolume > 5_000_000) score += 5;
  else if (q.avgVolume > 1_000_000) score += 3;

  // Near 52W high
  if (q.percentFromFiftyTwoWeekHigh > -3) score += 8;

  // Volume conviction (prev session RVOL — meaningful for India, stale for US pre-market)
  if (q.relativeVolume > 2) score += 8;
  else if (q.relativeVolume >= 1.5) score += 4;

  // Pre-market volume (US only)
  if (q.preMarketVolume && q.avgVolume > 0) {
    const pmvPct = (q.preMarketVolume / q.avgVolume) * 100;
    if (pmvPct > 20) score += 8;
    else if (pmvPct > 10) score += 4;
  }

  return score;
}

// ---------------------------------------------------------------------------
// Pass 2: Full Scoring (with technicals, runs on top ~50 candidates)
// ---------------------------------------------------------------------------

export interface FullScoreInput {
  quote: StockQuote;
  tech: TechnicalData;
  indexChangePercent: number; // SPY/NIFTY change % for relative strength
  marketCondition: 'bullish' | 'neutral' | 'bearish'; // overall market state
}

export interface FullScoreResult {
  score: number;
  signals: string[];
  rsi: number | null;
  macdHistogram: number | null;
  atr: number | null;
  atrPercent: number | null;
  entryTrigger: number;
  buyPrice: number;
  sellPrice: number;
  stopLoss: number;
  rewardRiskRatio: number;
  relativeStrength: number;
  entryRule: string;
  consolidationTightness: number | null;
  hasCatalyst: boolean;
  catalystLabel: string | null;
  setupType: 'breakout' | 'pullback' | 'momentum';
  extensionPercent: number;  // how extended price is from 50 DMA (higher = riskier)
}

/**
 * Full scoring with technicals. This is where success rate is determined.
 *
 * Scoring philosophy:
 *   - Technical confirmation (RSI, MACD) = highest weight — these predict continuation
 *   - Relative strength vs index = high weight — outperformers win
 *   - Trend alignment = medium weight — trade with the trend
 *   - Structure (consolidation + breakout) = medium weight — tight setups work best
 *   - Momentum (prev session, gap) = supporting evidence
 *   - Strong penalties for overbought, bearish MACD, fighting trend
 *   - R:R filter: reject if reward/risk < 2:1
 */
export function fullScore(input: FullScoreInput): FullScoreResult {
  const { quote: q, tech, indexChangePercent, marketCondition } = input;
  let score = 0;
  const signals: string[] = [];

  const price = q.preMarketPrice || q.price;
  const prevClose = q.price;

  // ═══════════════════════════════════════════════════════════════════════════
  // MARKET CONDITION FILTER — penalize if market is bearish/choppy
  // ═══════════════════════════════════════════════════════════════════════════
  if (marketCondition === 'bearish') {
    score -= 10;
    signals.push('⚠ Market bearish');
  } else if (marketCondition === 'bullish') {
    score += 5;
    signals.push('Market tailwind');
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // CATALYST DETECTION — earnings, unusual volume (+15 max)
  // ═══════════════════════════════════════════════════════════════════════════
  let hasCatalyst = false;
  let catalystLabel: string | null = null;

  // Check earnings proximity (within 1 day before or after)
  const now = Date.now() / 1000;
  const earningsTs = q.earningsTimestamp || q.earningsTimestampStart;
  if (earningsTs) {
    const daysDiff = Math.abs(earningsTs - now) / 86400;
    if (daysDiff <= 1) {
      score += 15;
      hasCatalyst = true;
      catalystLabel = 'Earnings today/yesterday';
      signals.push('🔔 EARNINGS catalyst');
    } else if (daysDiff <= 3) {
      score += 8;
      hasCatalyst = true;
      catalystLabel = 'Earnings within 3 days';
      signals.push('Earnings nearby');
    }
  }

  // Unusual volume as catalyst proxy (5x+ avg = institutional interest)
  if (!hasCatalyst && q.relativeVolume >= 5) {
    score += 10;
    hasCatalyst = true;
    catalystLabel = `Volume spike ${q.relativeVolume.toFixed(1)}x`;
    signals.push(`🔔 Volume ${q.relativeVolume.toFixed(1)}x (catalyst)`);
  } else if (!hasCatalyst && q.relativeVolume >= 3) {
    score += 5;
    catalystLabel = `Elevated vol ${q.relativeVolume.toFixed(1)}x`;
    signals.push(`Vol ${q.relativeVolume.toFixed(1)}x`);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // BULLISH SIGNALS
  // ═══════════════════════════════════════════════════════════════════════════

  // --- RSI Sweet Spot (+15 max, trend-adjusted) ---
  if (tech.rsi != null) {
    const aboveBothDMA = q.fiftyDayMA && q.twoHundredDayMA &&
      q.fiftyDayMA > q.twoHundredDayMA && price > q.fiftyDayMA;

    if (aboveBothDMA) {
      if (tech.rsi >= 55 && tech.rsi <= 75) {
        score += 15;
        signals.push(`RSI ${tech.rsi.toFixed(0)} (trend momentum)`);
      } else if (tech.rsi >= 45 && tech.rsi < 55) {
        score += 8;
        signals.push(`RSI ${tech.rsi.toFixed(0)} (pullback in uptrend)`);
      }
    } else {
      if (tech.rsi >= 40 && tech.rsi <= 65) {
        score += 12;
        signals.push(`RSI ${tech.rsi.toFixed(0)} (healthy range)`);
      }
    }
  }

  // --- MACD Confirmation (+12 max) ---
  if (tech.macdHistogram != null && tech.macd != null && tech.macdSignal != null) {
    if (tech.macdHistogram > 0 && tech.macd > tech.macdSignal) {
      score += 12;
      signals.push('MACD Bullish');
    }
  }

  // --- Relative Strength vs Index (+10 max) ---
  const relStr = q.changePercent - indexChangePercent;
  if (relStr > 3) {
    score += 10;
    signals.push(`RS +${relStr.toFixed(1)}% vs index`);
  } else if (relStr > 1.5) {
    score += 7;
    signals.push(`RS +${relStr.toFixed(1)}%`);
  } else if (relStr > 0.5) {
    score += 3;
  }

  // --- Trend Alignment (+10 max) ---
  if (q.fiftyDayMA && q.twoHundredDayMA) {
    if (q.fiftyDayMA > q.twoHundredDayMA && price > q.fiftyDayMA) {
      score += 10;
      signals.push('Above 50 & 200 DMA');
    } else if (q.fiftyDayMA > q.twoHundredDayMA) {
      score += 5;
      signals.push('Golden cross');
    }
  }

  // --- Multi-Day Streak (+8 max) ---
  if (tech.recentCloses.length >= 4) {
    let streak = 0;
    for (let i = tech.recentCloses.length - 1; i >= 1; i--) {
      if (tech.recentCloses[i] > tech.recentCloses[i - 1]) streak++;
      else break;
    }
    if (streak >= 3) {
      score += 8;
      signals.push(`${streak}-day uptrend`);
    } else if (streak >= 2) {
      score += 4;
    }
  }

  // --- Near 52W High / Breakout (+8 max) ---
  if (q.percentFromFiftyTwoWeekHigh > -1) {
    score += 8;
    signals.push('At 52W high (breakout)');
  } else if (q.percentFromFiftyTwoWeekHigh > -3) {
    score += 5;
    signals.push('Near 52W high');
  }

  // --- Tight Consolidation (+8 max) ---
  if (tech.consolidationTightness != null) {
    if (tech.consolidationTightness < 1.5) {
      score += 8;
      signals.push(`Tight base (${tech.consolidationTightness.toFixed(1)}x ATR)`);
    } else if (tech.consolidationTightness < 2.5) {
      score += 4;
      signals.push(`Consolidating`);
    }
  }

  // --- Gap Quality (US pre-market) (+10 max / -5 penalty) ---
  let gapPercent = 0;
  if (q.preMarketPrice && prevClose > 0) {
    gapPercent = ((q.preMarketPrice - prevClose) / prevClose) * 100;
    const pmVol = q.preMarketVolume || 0;
    const hasVolume = pmVol > 0 && q.avgVolume > 0 && (pmVol / q.avgVolume) * 100 > 10;

    // Gap quality: steady grind (vol-confirmed small-medium gap) = GOOD
    // One huge spike (big gap, low vol) = BAD
    if (Math.abs(gapPercent) >= 1 && Math.abs(gapPercent) <= 5 && hasVolume) {
      // Quality gap: moderate size + volume = institutional
      score += 10;
      signals.push(`Gap ${gapPercent > 0 ? '+' : ''}${gapPercent.toFixed(1)}% + vol ✓`);
    } else if (Math.abs(gapPercent) >= 1 && Math.abs(gapPercent) <= 3) {
      score += 4;
      signals.push(`Gap ${gapPercent > 0 ? '+' : ''}${gapPercent.toFixed(1)}%`);
    }

    // Penalty: huge gap (>7%) without volume = likely fade trap
    if (Math.abs(gapPercent) > 7 && !hasVolume) {
      score -= 8;
      signals.push(`Gap ${gapPercent.toFixed(1)}% NO vol (FADE RISK)`);
    }
    // Penalty: huge gap even with volume = hard to manage risk
    if (Math.abs(gapPercent) > 5 && hasVolume) {
      score += 3; // smaller bonus — still tradeable but riskier
      signals.push(`Gap ${gapPercent > 0 ? '+' : ''}${gapPercent.toFixed(1)}% (extended)`);
    }
  }

  // --- Previous Session Momentum (+6 max) ---
  if (q.changePercent > 3) score += 6;
  else if (q.changePercent >= 1.5) score += 3;

  // --- Volatility Expansion — ATR % (+5 max) ---
  if (tech.atrPercent != null) {
    if (tech.atrPercent >= 3) {
      score += 5;
      signals.push(`ATR ${tech.atrPercent.toFixed(1)}%`);
    } else if (tech.atrPercent >= 2) {
      score += 3;
    }
  }

  // --- Beta Sweet Spot (+3 max) ---
  if (q.beta && q.beta >= 1.2 && q.beta <= 2.5) {
    score += 3;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PENALTIES
  // ═══════════════════════════════════════════════════════════════════════════

  if (tech.rsi != null && tech.rsi > 75) {
    score -= 10;
    signals.push(`RSI ${tech.rsi.toFixed(0)} OVERBOUGHT`);
  }

  if (tech.macdHistogram != null && tech.macd != null && tech.macdSignal != null) {
    if (tech.macdHistogram < 0 && tech.macd < tech.macdSignal) {
      score -= 8;
      signals.push('MACD Bearish');
    }
  }

  if (q.fiftyDayMA && q.twoHundredDayMA) {
    if (q.fiftyDayMA < q.twoHundredDayMA && price < q.fiftyDayMA) {
      score -= 8;
      signals.push('Below both DMAs');
    }
  }

  if (q.beta && q.beta > 3) {
    score -= 3;
    signals.push(`Beta ${q.beta.toFixed(1)} (erratic)`);
  }

  if (tech.atrPercent != null && tech.atrPercent < 1.5) {
    score -= 5;
    signals.push(`ATR ${tech.atrPercent.toFixed(1)}% (low range)`);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ENTRY LEVELS, R:R, & MAX CHASE DISTANCE
  // ═══════════════════════════════════════════════════════════════════════════

  const atr = tech.atr || price * 0.015;

  const entryTrigger = q.preMarketPrice
    ? round2(Math.max(q.preMarketPrice, prevClose))
    : round2(tech.recentHighs.length > 0 ? tech.recentHighs[tech.recentHighs.length - 1] : price);

  const buyPrice = round2(entryTrigger);
  const stopLoss = round2(buyPrice - 0.7 * atr);
  const sellPrice = round2(buyPrice + 1.5 * atr);
  const risk = buyPrice - stopLoss;
  const reward = sellPrice - buyPrice;
  const rewardRiskRatio = risk > 0 ? round2(reward / risk) : 0;

  if (rewardRiskRatio < 2) {
    score -= 5;
    signals.push(`R:R ${rewardRiskRatio.toFixed(1)} (weak)`);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SETUP CLASSIFICATION — breakout vs pullback vs momentum
  // ═══════════════════════════════════════════════════════════════════════════

  let setupType: 'breakout' | 'pullback' | 'momentum' = 'momentum';

  // Breakout: near 52W high or breaking out of tight consolidation
  if (q.percentFromFiftyTwoWeekHigh > -3 ||
      (tech.consolidationTightness != null && tech.consolidationTightness < 2)) {
    setupType = 'breakout';
  }
  // Pullback: RSI pulled back (40-55) in an uptrend, or gap-down in uptrend
  else if (q.fiftyDayMA && q.twoHundredDayMA &&
           q.fiftyDayMA > q.twoHundredDayMA && price > q.twoHundredDayMA) {
    if ((tech.rsi != null && tech.rsi >= 40 && tech.rsi <= 55) || gapPercent < -1) {
      setupType = 'pullback';
      score += 3; // pullbacks have higher win rate
      signals.push('Pullback setup (higher win rate)');
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // EXTENSION FILTER — penalize if too far from key levels
  // ═══════════════════════════════════════════════════════════════════════════

  // Extension = how far price is above 50 DMA (as % of ATR)
  // If price is 3+ ATR above 50 DMA → extended, likely to pull back
  let extensionPercent = 0;
  if (q.fiftyDayMA && q.fiftyDayMA > 0) {
    extensionPercent = round2(((price - q.fiftyDayMA) / q.fiftyDayMA) * 100);
  }

  if (tech.atr && q.fiftyDayMA && q.fiftyDayMA > 0) {
    const atrFromDMA = (price - q.fiftyDayMA) / tech.atr;
    if (atrFromDMA > 4) {
      score -= 8;
      signals.push(`Extended ${atrFromDMA.toFixed(1)} ATR from 50 DMA`);
    } else if (atrFromDMA > 3) {
      score -= 4;
      signals.push(`Stretched ${atrFromDMA.toFixed(1)} ATR from 50 DMA`);
    }
  }

  score = Math.max(0, Math.min(100, score));

  // Entry rule with max chase distance (0.3 * ATR above trigger)
  const currency = q.market === 'IN' ? '₹' : '$';
  const maxChase = round2(entryTrigger + 0.3 * atr);
  const setupLabel = setupType === 'breakout' ? '🔺 Breakout' :
                     setupType === 'pullback' ? '🔄 Pullback' : '➡️ Momentum';
  let entryRule: string;
  if (setupType === 'pullback') {
    entryRule = `${setupLabel}: Buy dip near ${currency}${buyPrice.toFixed(2)}, hold if reclaims VWAP. Stop ${currency}${stopLoss.toFixed(2)}.`;
  } else if (q.preMarketPrice) {
    entryRule = `${setupLabel}: Break ${currency}${entryTrigger.toFixed(2)}, hold VWAP 5 min. Max ${currency}${maxChase.toFixed(2)}. Stop ${currency}${stopLoss.toFixed(2)}.`;
  } else {
    entryRule = `${setupLabel}: Break prev high ${currency}${entryTrigger.toFixed(2)} with vol. Max ${currency}${maxChase.toFixed(2)}. Stop ${currency}${stopLoss.toFixed(2)}.`;
  }

  return {
    score, signals,
    rsi: tech.rsi, macdHistogram: tech.macdHistogram,
    atr: tech.atr, atrPercent: tech.atrPercent,
    entryTrigger, buyPrice, sellPrice, stopLoss, rewardRiskRatio,
    relativeStrength: round2(relStr),
    entryRule, consolidationTightness: tech.consolidationTightness,
    hasCatalyst, catalystLabel,
    setupType, extensionPercent,
  };
}

// ---------------------------------------------------------------------------
// Two-Pass Pipeline (shared by both US and India crons)
// ---------------------------------------------------------------------------

/**
 * Assess market condition by looking at index performance.
 * Bullish = index up, trending. Bearish = index down. Neutral = flat/mixed.
 */
export function assessMarketCondition(indexChangePercent: number): 'bullish' | 'neutral' | 'bearish' {
  if (indexChangePercent > 0.3) return 'bullish';
  if (indexChangePercent < -0.3) return 'bearish';
  return 'neutral';
}

export interface TwoPassConfig {
  market: 'US' | 'IN';
  quotes: StockQuote[];
  indexChangePercent: number;
  maxCandidates: number;   // how many to compute technicals for (default 50)
  maxPicks: number;        // final picks to return (default 5 — top conviction only)
  minScore: number;        // minimum full score to qualify
  highThreshold: number;   // score >= this = High priority
  logPrefix: string;
}

export async function runTwoPassScoring(config: TwoPassConfig): Promise<DayTradePick[]> {
  const { market, quotes, indexChangePercent, maxCandidates, maxPicks, minScore, highThreshold, logPrefix } = config;

  const marketCondition = assessMarketCondition(indexChangePercent);
  console.log(`${logPrefix} Market condition: ${marketCondition} (index ${indexChangePercent >= 0 ? '+' : ''}${indexChangePercent.toFixed(2)}%)`);

  // --- Pass 1: Quick score all quotes ---
  const quickScored: QuickScoreResult[] = quotes.map(q => ({
    quote: q,
    quickScore: quickScore(q),
  }));
  quickScored.sort((a, b) => b.quickScore - a.quickScore);

  const candidates = quickScored.slice(0, maxCandidates);
  console.log(`${logPrefix} Pass 1: top ${candidates.length} candidates (scores ${candidates[0]?.quickScore ?? 0} to ${candidates[candidates.length - 1]?.quickScore ?? 0})`);

  // --- Pass 2: Compute technicals and full-score in parallel batches ---
  const batchSize = 10;
  const fullResults: DayTradePick[] = [];

  for (let i = 0; i < candidates.length; i += batchSize) {
    const batch = candidates.slice(i, i + batchSize);
    const promises = batch.map(async ({ quote }) => {
      try {
        const tech = await computeTechnicals(quote.symbol, quote.price);
        const result = fullScore({ quote, tech, indexChangePercent, marketCondition });

        if (result.score >= minScore) {
          const prevClose = quote.price;
          const preMarketPrice = quote.preMarketPrice;
          const gapPct = preMarketPrice && prevClose > 0
            ? round2(((preMarketPrice - prevClose) / prevClose) * 100) : 0;

          const pick: DayTradePick = {
            symbol: quote.symbol,
            name: quote.name,
            price: prevClose,
            previousClose: prevClose,
            preMarketPrice: preMarketPrice,
            gapPercent: gapPct,
            changePercent: quote.changePercent,
            preMarketVolume: quote.preMarketVolume,
            avgVolume: quote.avgVolume,
            relativeVolume: quote.relativeVolume,
            fiftyDayMA: quote.fiftyDayMA,
            twoHundredDayMA: quote.twoHundredDayMA,
            market: quote.market,
            sector: quote.sector,
            marketCap: quote.marketCap,
            beta: quote.beta,
            score: result.score,
            priority: result.score >= highThreshold ? 'High' : result.score >= minScore ? 'Medium' : 'Low',
            signals: result.signals,
            rsi: result.rsi,
            macdHistogram: result.macdHistogram,
            atr: result.atr,
            atrPercent: result.atrPercent,
            entryTrigger: result.entryTrigger,
            buyPrice: result.buyPrice,
            sellPrice: result.sellPrice,
            stopLoss: result.stopLoss,
            rewardRiskRatio: result.rewardRiskRatio,
            relativeStrength: result.relativeStrength,
            entryRule: result.entryRule,
            hasCatalyst: result.hasCatalyst,
            catalystLabel: result.catalystLabel,
            setupType: result.setupType,
            extensionPercent: result.extensionPercent,
          };
          return pick;
        }
      } catch (err: any) {
        console.error(`${logPrefix} Technicals failed for ${quote.symbol}: ${err.message}`);
      }
      return null;
    });

    const results = await Promise.allSettled(promises);
    for (const r of results) {
      if (r.status === 'fulfilled' && r.value) {
        fullResults.push(r.value);
      }
    }
  }

  fullResults.sort((a, b) => b.score - a.score);

  // --- Sector exposure limit: max 2 picks per sector ---
  const sectorCount: Record<string, number> = {};
  const diversifiedResults: DayTradePick[] = [];
  for (const pick of fullResults) {
    const sector = pick.sector || 'Unknown';
    const count = sectorCount[sector] || 0;
    if (count < 2) {
      diversifiedResults.push(pick);
      sectorCount[sector] = count + 1;
    } else {
      console.log(`${logPrefix} Sector limit: skipping ${pick.symbol} (${sector} already has ${count} picks)`);
    }
  }

  const picks = diversifiedResults.slice(0, maxPicks);

  const high = picks.filter(p => p.priority === 'High').length;
  const medium = picks.filter(p => p.priority === 'Medium').length;
  console.log(`${logPrefix} Pass 2: ${fullResults.length} qualified, returning ${picks.length} (${high} high, ${medium} medium)`);

  return picks;
}

// ---------------------------------------------------------------------------
// Legacy exports (kept for client-side breakouts component compatibility)
// ---------------------------------------------------------------------------

export function calculateBuySellTargets(
  currentPrice: number,
  atr: number | null
): { buyPrice: number; sellPrice: number; stopLoss: number } {
  if (!atr || atr <= 0) {
    const fallbackATR = currentPrice * 0.01;
    return {
      buyPrice: round2(currentPrice - 0.3 * fallbackATR),
      sellPrice: round2(currentPrice + 1.0 * fallbackATR),
      stopLoss: round2(currentPrice - 0.3 * fallbackATR - 0.5 * fallbackATR),
    };
  }

  const buyPrice = currentPrice - 0.3 * atr;
  const sellPrice = currentPrice + 1.0 * atr;
  const stopLoss = buyPrice - 0.5 * atr;

  return {
    buyPrice: round2(buyPrice),
    sellPrice: round2(sellPrice),
    stopLoss: round2(stopLoss),
  };
}

export function scoreDayTrade(stock: StockData, tech: TechnicalData): DayTradeScore {
  let rawScore = 0;
  const signals: string[] = [];
  const breakdown: { label: string; value: string; points: number }[] = [];

  const add = (label: string, value: string, pts: number) => {
    breakdown.push({ label, value, points: pts });
    rawScore += pts;
  };

  const { changePercent, relativeVolume, percentFromFiftyTwoWeekHigh, percentFromFiftyDayMA, percentFromTwoHundredDayMA, beta } = stock;
  const { rsi, macd, macdSignal, macdHistogram } = tech;

  if (changePercent >= 5) { add('Big Mover (5%+)', `+${changePercent.toFixed(2)}%`, 7); signals.push('Big Mover'); }
  else if (changePercent >= 3) { add('Strong Move (3-5%)', `+${changePercent.toFixed(2)}%`, 5); signals.push('Strong Move'); }
  else if (changePercent >= 1.5) { add('Good Move (1.5-3%)', `+${changePercent.toFixed(2)}%`, 3); signals.push('Good Move'); }
  else if (changePercent > 0) { add('Positive Day', `+${changePercent.toFixed(2)}%`, 1); signals.push('Positive Day'); }

  if (relativeVolume >= 2.5) { add('Massive Volume (2.5x+)', `${relativeVolume.toFixed(2)}x`, 6); signals.push('Massive Volume'); }
  else if (relativeVolume >= 1.8) { add('High Volume (1.8-2.5x)', `${relativeVolume.toFixed(2)}x`, 4); signals.push('High Volume'); }
  else if (relativeVolume >= 1.3) { add('Above Avg Volume (1.3-1.8x)', `${relativeVolume.toFixed(2)}x`, 2); signals.push('Above Avg Volume'); }

  if (percentFromFiftyTwoWeekHigh != null) {
    if (percentFromFiftyTwoWeekHigh >= 0) { add('New 52W High', 'Breakout', 5); signals.push('New 52W High'); }
    else if (percentFromFiftyTwoWeekHigh >= -3) { add('Near 52W High', `${percentFromFiftyTwoWeekHigh.toFixed(1)}%`, 3); signals.push('Near 52W High'); }
  }

  if (macd != null && macdSignal != null && macdHistogram != null) {
    if (macdHistogram > 0 && macd > macdSignal) { add('MACD Bullish', `H: ${macdHistogram.toFixed(3)}`, 3); signals.push('MACD Bullish'); }
  }

  if (rsi != null) {
    if (rsi >= 60 && rsi <= 75) { add('Strong RSI (60-75)', `${rsi.toFixed(0)}`, 3); signals.push('Strong RSI'); }
    else if (rsi >= 50 && rsi < 60) { add('RSI 50-60', `${rsi.toFixed(0)}`, 1); }
    if (rsi > 80) { add('Extreme RSI (>80)', `${rsi.toFixed(0)}`, -2); signals.push('Extreme RSI'); }
  }

  if (percentFromFiftyDayMA != null && percentFromFiftyDayMA > 0) { add('Above 50 MA', `+${percentFromFiftyDayMA.toFixed(1)}%`, 1); signals.push('Above 50 MA'); }
  if (percentFromTwoHundredDayMA != null && percentFromTwoHundredDayMA > 0) { add('Above 200 MA', `+${percentFromTwoHundredDayMA.toFixed(1)}%`, 1); signals.push('Above 200 MA'); }

  const recentCloses = tech.recentCloses;
  if (recentCloses.length >= 4) {
    let streak = 0;
    for (let i = recentCloses.length - 1; i >= 1; i--) {
      if (recentCloses[i] > recentCloses[i - 1]) streak++;
      else break;
    }
    if (streak >= 3) { add('3-Day Uptrend', `${streak}-day streak`, 3); signals.push('Multi-Day Uptrend'); }
  }

  if (beta != null && beta >= 1.2 && beta <= 2.5) { add('Ideal Beta', `${beta.toFixed(2)}`, 2); signals.push('Ideal Volatility'); }

  if (changePercent < 0) { add('Negative Day', `${changePercent.toFixed(2)}%`, -3); signals.push('Negative Day'); }
  if (relativeVolume < 0.7) { add('Low Volume (<0.7x)', `${relativeVolume.toFixed(2)}x`, -2); signals.push('Low Volume'); }
  if (macd != null && macdSignal != null && macdHistogram != null) {
    if (macdHistogram < 0 && macd < macdSignal) { add('Bearish MACD', `H: ${macdHistogram.toFixed(3)}`, -2); signals.push('Bearish MACD'); }
  }

  const MAX = 31;
  const score = Math.max(0, Math.min(100, Math.round((rawScore / MAX) * 100)));
  const targets = calculateBuySellTargets(stock.price, tech.atr);

  return {
    symbol: stock.symbol, name: stock.name, price: stock.price,
    change: stock.change, changePercent: stock.changePercent,
    market: stock.market, exchange: stock.exchange, currency: stock.currency,
    marketCap: stock.marketCap, sector: stock.sector,
    score, signals, breakdown,
    buyPrice: targets.buyPrice, sellPrice: targets.sellPrice, stopLoss: targets.stopLoss,
    atr: tech.atr, rsi: tech.rsi, macdHistogram: tech.macdHistogram,
    relativeVolume, beta: stock.beta,
  };
}
