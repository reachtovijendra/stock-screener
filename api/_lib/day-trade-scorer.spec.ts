import assert from 'node:assert/strict';
import { fullScore, type TechnicalData } from './day-trade-scorer';
import type { StockQuote } from './yahoo-client';

function createQuote(overrides: Partial<StockQuote> = {}): StockQuote {
  return {
    symbol: 'TEST',
    name: 'Test Corp',
    price: 100,
    change: 1,
    changePercent: 1,
    market: 'US',
    exchange: 'NYSE',
    currency: 'USD',
    marketCap: 10_000_000_000,
    marketCapCategory: 'Large Cap',
    fiftyTwoWeekHigh: 102,
    fiftyTwoWeekLow: 60,
    percentFromFiftyTwoWeekHigh: -1.96,
    percentFromFiftyTwoWeekLow: 66.67,
    peRatio: null,
    forwardPeRatio: null,
    pbRatio: null,
    psRatio: null,
    eps: null,
    forwardEps: null,
    earningsGrowth: null,
    revenueGrowth: null,
    dividendYield: null,
    avgVolume: 5_000_000,
    volume: 10_000_000,
    relativeVolume: 2,
    sector: 'Healthcare',
    industry: 'Medical Devices',
    beta: 1,
    fiftyDayMA: 95,
    twoHundredDayMA: 90,
    percentFromFiftyDayMA: 5.26,
    percentFromTwoHundredDayMA: 11.11,
    preMarketPrice: null,
    preMarketChange: null,
    preMarketChangePercent: null,
    preMarketVolume: null,
    earningsTimestamp: null,
    earningsTimestampStart: null,
    earningsTimestampEnd: null,
    targetMeanPrice: null,
    targetHighPrice: null,
    targetLowPrice: null,
    numberOfAnalystOpinions: null,
    recommendationMean: null,
    heldPercentInstitutions: null,
    heldPercentInsiders: null,
    lastUpdated: new Date('2026-05-11T13:00:00Z'),
    ...overrides,
  };
}

function createTechnicals(overrides: Partial<TechnicalData> = {}): TechnicalData {
  return {
    rsi: 65,
    macd: 1.2,
    macdSignal: 0.8,
    macdHistogram: 0.4,
    sma50: 95,
    sma200: 90,
    atr: 1.2,
    atrPercent: 1.2,
    recentCloses: [98, 99, 99.5, 100, 100.5],
    recentHighs: [99, 100, 100.4, 100.8, 101],
    recentLows: [97, 98, 98.8, 99.2, 99.8],
    consolidationTightness: 1.8,
    ...overrides,
  };
}

const lowVolatilityScore = fullScore({
  quote: createQuote({ symbol: 'HOLX', relativeVolume: 22.6, volume: 101_970_000 }),
  tech: createTechnicals({ atr: 0.21, atrPercent: 0.28 }),
  indexChangePercent: 0.4,
  marketCondition: 'bullish',
});

assert.equal(lowVolatilityScore.score, 0);
assert.deepEqual(lowVolatilityScore.signals, ['ATR 0.28% REJECTED']);

const tradableScore = fullScore({
  quote: createQuote(),
  tech: createTechnicals(),
  indexChangePercent: 0.4,
  marketCondition: 'bullish',
});

assert.ok(tradableScore.score >= 40);
assert.ok(tradableScore.buyPrice > 0);

// --- Opening-momentum model: entry is the opening print, not a breakout ---
// With a premarket print, entry = premarket (the expected open), NOT the
// previous day's high.
const openEntryScore = fullScore({
  quote: createQuote({ price: 100, preMarketPrice: 101 }),
  tech: createTechnicals(),
  indexChangePercent: 0.4,
  marketCondition: 'bullish',
});
assert.equal(openEntryScore.buyPrice, 101);
assert.equal(openEntryScore.entryTrigger, 101);
assert.ok(openEntryScore.sellPrice > openEntryScore.buyPrice, 'target above entry');
assert.ok(openEntryScore.stopLoss < openEntryScore.buyPrice, 'stop below entry');
// Stop distance must respect the 2.5%–4% guardrails (allow cent-rounding slack).
const stopPct = (openEntryScore.buyPrice - openEntryScore.stopLoss) / openEntryScore.buyPrice;
assert.ok(stopPct >= 0.024 && stopPct <= 0.041, 'stop within ~2.5%-4%');

// --- Strong momentum (high RSI) is rewarded, NOT rejected ---
// Old model hard-rejected RSI > 80; the new model only rejects blow-offs (>90)
// and gives strong-momentum names the biggest bonus.
const strongMomentum = fullScore({
  quote: createQuote(),
  tech: createTechnicals({ rsi: 78 }),
  indexChangePercent: 0.4,
  marketCondition: 'bullish',
});
assert.ok(strongMomentum.score > 0, 'RSI 78 must not be rejected');
assert.ok(strongMomentum.score >= tradableScore.score, 'RSI 78 should score >= RSI 65');

// --- Volume spikes are penalised, not rewarded ---
const moderateVol = fullScore({
  quote: createQuote({ relativeVolume: 1.4 }),
  tech: createTechnicals(),
  indexChangePercent: 0.4,
  marketCondition: 'bullish',
});
const spikeVol = fullScore({
  quote: createQuote({ relativeVolume: 3.5 }),
  tech: createTechnicals(),
  indexChangePercent: 0.4,
  marketCondition: 'bullish',
});
assert.ok(moderateVol.score > spikeVol.score, 'moderate RVOL beats a volume spike');

console.log('day-trade scorer opening-momentum tests passed');
