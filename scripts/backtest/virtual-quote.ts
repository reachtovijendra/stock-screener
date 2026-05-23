/**
 * Build StockQuote and TechnicalData from cached historical bars.
 * Uses only data through day-1 (no look-ahead bias).
 * Day D's open is used as preMarketPrice (gap proxy).
 */

import { HistoricalBar } from './fetch-data';

// Import pure calculator functions from the scoring engine
import {
  calculateRSI,
  calculateMACD,
  calculateATR,
  calculateSMA,
} from '../../api/_lib/day-trade-scorer';

// Minimal StockQuote shape needed by quickScore and fullScore
export interface VirtualQuote {
  symbol: string;
  name: string;
  price: number;            // previous close (D-1)
  change: number;
  changePercent: number;    // D-1 vs D-2
  market: 'US' | 'IN';
  exchange: string;
  currency: string;
  marketCap: number;
  marketCapCategory: string;
  fiftyTwoWeekHigh: number;
  fiftyTwoWeekLow: number;
  percentFromFiftyTwoWeekHigh: number;
  percentFromFiftyTwoWeekLow: number;
  peRatio: number | null;
  forwardPeRatio: number | null;
  pbRatio: number | null;
  psRatio: number | null;
  eps: number | null;
  forwardEps: number | null;
  earningsGrowth: number | null;
  revenueGrowth: number | null;
  dividendYield: number | null;
  avgVolume: number;
  volume: number;
  relativeVolume: number;
  sector: string;
  industry: string;
  beta: number | null;
  fiftyDayMA: number | null;
  twoHundredDayMA: number | null;
  percentFromFiftyDayMA: number | null;
  percentFromTwoHundredDayMA: number | null;
  preMarketPrice: number | null;  // = open[D] (gap proxy)
  preMarketChange: number | null;
  preMarketChangePercent: number | null;
  preMarketVolume: number | null;
  earningsTimestamp: number | null;
  earningsTimestampStart: number | null;
  earningsTimestampEnd: number | null;
  lastUpdated: Date;
}

export interface VirtualTechnicals {
  rsi: number | null;
  macd: number | null;
  macdSignal: number | null;
  macdHistogram: number | null;
  sma50: number | null;
  sma200: number | null;
  atr: number | null;
  atrPercent: number | null;
  recentCloses: number[];
  recentHighs: number[];
  recentLows: number[];
  consolidationTightness: number | null;
}

/**
 * Build a virtual quote for trading day D, using only data through D-1.
 * dayIndex = the index in bars[] of the day we're simulating trading on.
 * We need at least 201 bars before dayIndex for indicators.
 */
export function buildVirtualQuote(
  symbol: string,
  bars: HistoricalBar[],
  dayIndex: number,
  market: 'US' | 'IN'
): { quote: VirtualQuote; tech: VirtualTechnicals } | null {
  if (dayIndex < 201 || dayIndex >= bars.length) return null;

  // Slice history through D-1 (no look-ahead)
  const histBars = bars.slice(0, dayIndex);
  const closes = histBars.map(b => b.close);
  const highs = histBars.map(b => b.high);
  const lows = histBars.map(b => b.low);
  const volumes = histBars.map(b => b.volume);

  const prevClose = closes[closes.length - 1];       // D-1 close
  const prevPrevClose = closes[closes.length - 2];    // D-2 close
  const todayOpen = bars[dayIndex].open;              // D open (gap proxy)

  if (prevClose <= 0 || prevPrevClose <= 0) return null;

  const change = prevClose - prevPrevClose;
  const changePercent = (change / prevPrevClose) * 100;

  // 20-day average volume
  const volSlice = volumes.slice(-20);
  const avgVolume = volSlice.reduce((a, b) => a + b, 0) / volSlice.length;
  const volume = volumes[volumes.length - 1];
  const relativeVolume = avgVolume > 0 ? volume / avgVolume : 1;

  // 52-week high/low (last 252 trading days)
  const yearHighs = highs.slice(-252);
  const yearLows = lows.slice(-252);
  const fiftyTwoWeekHigh = Math.max(...yearHighs);
  const fiftyTwoWeekLow = Math.min(...yearLows);
  const percentFromFiftyTwoWeekHigh = fiftyTwoWeekHigh > 0
    ? ((prevClose - fiftyTwoWeekHigh) / fiftyTwoWeekHigh) * 100 : 0;
  const percentFromFiftyTwoWeekLow = fiftyTwoWeekLow > 0
    ? ((prevClose - fiftyTwoWeekLow) / fiftyTwoWeekLow) * 100 : 0;

  // Moving averages
  const fiftyDayMA = calculateSMA(closes, 50);
  const twoHundredDayMA = calculateSMA(closes, 200);
  const percentFromFiftyDayMA = fiftyDayMA && fiftyDayMA > 0
    ? ((prevClose - fiftyDayMA) / fiftyDayMA) * 100 : null;
  const percentFromTwoHundredDayMA = twoHundredDayMA && twoHundredDayMA > 0
    ? ((prevClose - twoHundredDayMA) / twoHundredDayMA) * 100 : null;

  // Technicals
  const rsi = calculateRSI(closes);
  const macdData = calculateMACD(closes);
  const atr = calculateATR(highs, lows, closes);
  const atrPercent = atr && prevClose > 0 ? Math.round((atr / prevClose) * 100 * 100) / 100 : null;
  const recentCloses = closes.slice(-5);
  const recentHighs = highs.slice(-5);
  const recentLows = lows.slice(-5);

  // Consolidation tightness
  let consolidationTightness: number | null = null;
  if (recentHighs.length >= 5 && atr && atr > 0) {
    const rangeHigh = Math.max(...recentHighs);
    const rangeLow = Math.min(...recentLows);
    consolidationTightness = Math.round(((rangeHigh - rangeLow) / atr) * 100) / 100;
  }

  // Gap proxy: today's open vs yesterday's close
  const gapPercent = ((todayOpen - prevClose) / prevClose) * 100;

  const quote: VirtualQuote = {
    symbol,
    name: symbol,
    price: prevClose,
    change,
    changePercent,
    market,
    exchange: market === 'US' ? 'NASDAQ' : 'NSE',
    currency: market === 'US' ? 'USD' : 'INR',
    marketCap: 10_000_000_000, // placeholder — not used in scoring
    marketCapCategory: 'Large Cap',
    fiftyTwoWeekHigh,
    fiftyTwoWeekLow,
    percentFromFiftyTwoWeekHigh,
    percentFromFiftyTwoWeekLow,
    peRatio: null,
    forwardPeRatio: null,
    pbRatio: null,
    psRatio: null,
    eps: null,
    forwardEps: null,
    earningsGrowth: null,
    revenueGrowth: null,
    dividendYield: null,
    avgVolume,
    volume,
    relativeVolume,
    sector: 'Unknown', // not available from OHLCV
    industry: 'Unknown',
    beta: null, // not available from OHLCV
    fiftyDayMA,
    twoHundredDayMA,
    percentFromFiftyDayMA,
    percentFromTwoHundredDayMA,
    preMarketPrice: todayOpen, // gap proxy
    preMarketChange: todayOpen - prevClose,
    preMarketChangePercent: gapPercent,
    preMarketVolume: null,
    earningsTimestamp: null,
    earningsTimestampStart: null,
    earningsTimestampEnd: null,
    lastUpdated: new Date(),
  };

  const tech: VirtualTechnicals = {
    rsi,
    macd: macdData.macd,
    macdSignal: macdData.signal,
    macdHistogram: macdData.histogram,
    sma50: fiftyDayMA,
    sma200: twoHundredDayMA,
    atr,
    atrPercent,
    recentCloses,
    recentHighs,
    recentLows,
    consolidationTightness,
  };

  return { quote, tech };
}

/**
 * Get the actual OHLC for day D (for trade evaluation).
 */
export function getDayOHLC(bars: HistoricalBar[], dayIndex: number): {
  open: number; high: number; low: number; close: number; volume: number;
} | null {
  if (dayIndex < 0 || dayIndex >= bars.length) return null;
  const b = bars[dayIndex];
  return { open: b.open, high: b.high, low: b.low, close: b.close, volume: b.volume };
}
