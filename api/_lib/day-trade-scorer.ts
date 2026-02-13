/**
 * Day Trade Scoring Engine
 *
 * Server-side port of the client-side scoreDayTrade logic from
 * breakouts.component.ts, enhanced with ATR-based buy/sell targets
 * and additional technical factors for day-trade recommendations.
 */

import https from 'https';

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
  recentCloses: number[];  // last 5 daily closes for streak detection
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

/**
 * Fetch historical OHLC data from Yahoo Finance chart API.
 * Returns { highs, lows, closes } arrays for the requested range.
 */
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

/**
 * Calculate RSI (Relative Strength Index) - 14 period
 */
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

/**
 * Calculate MACD (12/26/9)
 */
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

/**
 * Calculate SMA
 */
export function calculateSMA(closes: number[], period: number): number | null {
  if (closes.length < period) return null;
  const slice = closes.slice(-period);
  return Math.round((slice.reduce((a, b) => a + b, 0) / period) * 100) / 100;
}

/**
 * Calculate Average True Range (ATR) over the given period.
 * ATR measures volatility and is used for buy/sell price targets.
 */
export function calculateATR(
  highs: number[],
  lows: number[],
  closes: number[],
  period: number = 14
): number | null {
  const len = Math.min(highs.length, lows.length, closes.length);
  if (len < period + 1) return null;

  // True Range = max(H-L, |H-prevC|, |L-prevC|)
  const trueRanges: number[] = [];
  for (let i = 1; i < len; i++) {
    const hl = highs[i] - lows[i];
    const hpc = Math.abs(highs[i] - closes[i - 1]);
    const lpc = Math.abs(lows[i] - closes[i - 1]);
    trueRanges.push(Math.max(hl, hpc, lpc));
  }

  if (trueRanges.length < period) return null;

  // Use Wilder's smoothing: first ATR = average of first N true ranges
  let atr = trueRanges.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < trueRanges.length; i++) {
    atr = (atr * (period - 1) + trueRanges[i]) / period;
  }

  return Math.round(atr * 100) / 100;
}

/**
 * Calculate buy/sell/stop-loss targets based on ATR.
 *
 * Strategy:
 *   Buy Price  = previousClose - 0.3 * ATR  (target a small dip entry)
 *   Sell Price = previousClose + 1.0 * ATR  (target 1 ATR of profit)
 *   Stop Loss  = buyPrice - 0.5 * ATR       (tight stop for day trade)
 */
export function calculateBuySellTargets(
  currentPrice: number,
  atr: number | null
): { buyPrice: number; sellPrice: number; stopLoss: number } {
  if (!atr || atr <= 0) {
    // Fallback: use 1% of price as proxy for ATR
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

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// ---------------------------------------------------------------------------
// Compute full technicals for a single stock
// ---------------------------------------------------------------------------

export async function computeTechnicals(symbol: string): Promise<TechnicalData> {
  const { highs, lows, closes } = await fetchHistoricalOHLC(symbol, '1y');

  const rsi = calculateRSI(closes);
  const macdData = calculateMACD(closes);
  const sma50 = calculateSMA(closes, 50);
  const sma200 = calculateSMA(closes, 200);
  const atr = calculateATR(highs, lows, closes);
  const recentCloses = closes.slice(-5);

  return {
    rsi,
    macd: macdData.macd,
    macdSignal: macdData.signal,
    macdHistogram: macdData.histogram,
    sma50,
    sma200,
    atr,
    recentCloses,
  };
}

// ---------------------------------------------------------------------------
// Day Trade Scoring
// ---------------------------------------------------------------------------

/**
 * Score a stock for day-trade potential.
 * Returns a 0-100 score with signal descriptions and a point breakdown.
 *
 * Ported from the client-side `scoreDayTrade` in breakouts.component.ts
 * with additional server-side factors (multi-day streak, beta sweet spot).
 */
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
  const relVol = relativeVolume;
  const pct52High = percentFromFiftyTwoWeekHigh;
  const pct50MA = percentFromFiftyDayMA;
  const pct200MA = percentFromTwoHundredDayMA;

  // ---- TODAY'S PRICE ACTION (max +7) ----
  if (changePercent >= 5) { add('Big Mover (5%+)', `+${changePercent.toFixed(2)}%`, 7); signals.push('Big Mover'); }
  else if (changePercent >= 3) { add('Strong Move (3-5%)', `+${changePercent.toFixed(2)}%`, 5); signals.push('Strong Move'); }
  else if (changePercent >= 1.5) { add('Good Move (1.5-3%)', `+${changePercent.toFixed(2)}%`, 3); signals.push('Good Move'); }
  else if (changePercent > 0) { add('Positive Day', `+${changePercent.toFixed(2)}%`, 1); signals.push('Positive Day'); }

  // ---- VOLUME (max +6) ----
  if (relVol >= 2.5) { add('Massive Volume (2.5x+)', `${relVol.toFixed(2)}x`, 6); signals.push('Massive Volume'); }
  else if (relVol >= 1.8) { add('High Volume (1.8-2.5x)', `${relVol.toFixed(2)}x`, 4); signals.push('High Volume'); }
  else if (relVol >= 1.3) { add('Above Avg Volume (1.3-1.8x)', `${relVol.toFixed(2)}x`, 2); signals.push('Above Avg Volume'); }

  // ---- BREAKOUT SIGNALS (max +5 for 52W, +3 for MACD) ----
  if (pct52High != null) {
    if (pct52High >= 0) { add('New 52W High', 'Breakout', 5); signals.push('New 52W High'); }
    else if (pct52High >= -3) { add('Near 52W High', `${pct52High.toFixed(1)}%`, 3); signals.push('Near 52W High'); }
  }

  // MACD bullish
  if (macd != null && macdSignal != null && macdHistogram != null) {
    if (macdHistogram > 0 && macd > macdSignal) {
      add('MACD Bullish', `H: ${macdHistogram.toFixed(3)}`, 3);
      signals.push('MACD Bullish');
    }
  }

  // ---- RSI (max +3) ----
  if (rsi != null) {
    if (rsi >= 60 && rsi <= 75) { add('Strong RSI (60-75)', `${rsi.toFixed(0)}`, 3); signals.push('Strong RSI'); }
    else if (rsi >= 50 && rsi < 60) { add('RSI 50-60', `${rsi.toFixed(0)}`, 1); }
    if (rsi > 80) { add('Extreme RSI (>80)', `${rsi.toFixed(0)}`, -2); signals.push('Extreme RSI'); }
  }

  // ---- TREND SUPPORT (max +2) ----
  if (pct50MA != null && pct50MA > 0) { add('Above 50 MA', `+${pct50MA.toFixed(1)}%`, 1); signals.push('Above 50 MA'); }
  if (pct200MA != null && pct200MA > 0) { add('Above 200 MA', `+${pct200MA.toFixed(1)}%`, 1); signals.push('Above 200 MA'); }

  // ---- ADDITIONAL SERVER-SIDE FACTORS ----

  // Multi-day uptrend streak (+3 for 3+ consecutive positive closes)
  const recentCloses = tech.recentCloses;
  if (recentCloses.length >= 4) {
    let streak = 0;
    for (let i = recentCloses.length - 1; i >= 1; i--) {
      if (recentCloses[i] > recentCloses[i - 1]) streak++;
      else break;
    }
    if (streak >= 3) {
      add('3-Day Uptrend', `${streak}-day streak`, 3);
      signals.push('Multi-Day Uptrend');
    }
  }

  // Beta sweet spot for day trading: 1.2-2.5 (+2)
  if (beta != null) {
    if (beta >= 1.2 && beta <= 2.5) {
      add('Ideal Beta', `${beta.toFixed(2)}`, 2);
      signals.push('Ideal Volatility');
    }
  }

  // ---- PENALTIES ----
  if (changePercent < 0) { add('Negative Day', `${changePercent.toFixed(2)}%`, -3); signals.push('Negative Day'); }
  if (relVol < 0.7) { add('Low Volume (<0.7x)', `${relVol.toFixed(2)}x`, -2); signals.push('Low Volume'); }
  if (macd != null && macdSignal != null && macdHistogram != null) {
    if (macdHistogram < 0 && macd < macdSignal) {
      add('Bearish MACD', `H: ${macdHistogram.toFixed(3)}`, -2);
      signals.push('Bearish MACD');
    }
  }

  // ---- FINAL SCORE ----
  // Max possible: 7 + 6 + 5 + 3 + 3 + 2 + 3 + 2 = 31
  const MAX = 31;
  const score = Math.max(0, Math.min(100, Math.round((rawScore / MAX) * 100)));

  // ---- BUY / SELL TARGETS ----
  const targets = calculateBuySellTargets(stock.price, tech.atr);

  return {
    symbol: stock.symbol,
    name: stock.name,
    price: stock.price,
    change: stock.change,
    changePercent: stock.changePercent,
    market: stock.market,
    exchange: stock.exchange,
    currency: stock.currency,
    marketCap: stock.marketCap,
    sector: stock.sector,
    score,
    signals,
    breakdown,
    buyPrice: targets.buyPrice,
    sellPrice: targets.sellPrice,
    stopLoss: targets.stopLoss,
    atr: tech.atr,
    rsi: tech.rsi,
    macdHistogram: tech.macdHistogram,
    relativeVolume: relativeVolume,
    beta: stock.beta,
  };
}
