/**
 * Reverse Analysis: Find what actually works.
 *
 * Instead of "score → pick → evaluate", this does:
 * "evaluate ALL stocks on ALL days → find winners → analyze common signals"
 *
 * For every stock on every trading day, compute what would have happened
 * with various entry/target/stop strategies, then analyze the winners.
 */

import fs from 'fs';
import path from 'path';
import { HistoricalData, loadCachedData, getAllSymbols } from './fetch-data';
import { buildVirtualQuote, getDayOHLC } from './virtual-quote';
import { evaluateTrade } from './evaluate-trade';

interface StockDay {
  symbol: string;
  date: string;
  dayIndex: number;
  // Previous day data
  prevClose: number;
  prevChangePercent: number;
  prevVolume: number;
  avgVolume: number;
  relativeVolume: number;
  // Today's gap
  todayOpen: number;
  gapPercent: number;
  // Gap direction combo
  gapDirection: 'up' | 'down' | 'flat';
  prevDirection: 'up' | 'down' | 'flat';
  combo: string; // "up+up", "up+down", etc.
  // Technicals (from data through D-1)
  rsi: number | null;
  macdHistogram: number | null;
  atr: number | null;
  atrPercent: number | null;
  aboveFiftyDMA: boolean;
  aboveTwoHundredDMA: boolean;
  consolidationTightness: number | null;
  near52wHigh: boolean;
  // Day D actual data
  dayHigh: number;
  dayLow: number;
  dayClose: number;
  dayRange: number; // (high - low) / open
  // Outcomes for different strategies
  outcomes: {
    // Strategy 1: Buy at open, target +1.5 ATR, stop -0.7 ATR
    openEntry_tight: { outcome: string; pnl: number };
    // Strategy 2: Buy at open, target +1.5 ATR, stop -1.5 ATR
    openEntry_wide: { outcome: string; pnl: number };
    // Strategy 3: Buy on break of prev close (recovery), target +1.5 ATR, stop -0.7 ATR
    recoveryEntry_tight: { outcome: string; pnl: number };
    // Strategy 4: Buy on break of prev high, target +1.5 ATR, stop -0.7 ATR
    breakoutEntry: { outcome: string; pnl: number };
  };
}

function analyzeAllStockDays(
  allData: Map<string, HistoricalData>,
  symbols: string[],
  market: 'US' | 'IN'
): StockDay[] {
  const results: StockDay[] = [];

  for (const symbol of symbols) {
    const data = allData.get(symbol);
    if (!data || data.bars.length < 220) continue;

    for (let dayIdx = 201; dayIdx < data.bars.length; dayIdx++) {
      const virtual = buildVirtualQuote(symbol, data.bars, dayIdx, market);
      if (!virtual) continue;

      const dayOHLC = getDayOHLC(data.bars, dayIdx);
      if (!dayOHLC) continue;

      const { quote: q, tech } = virtual;
      const prevClose = q.price;
      const todayOpen = dayOHLC.open;
      const gapPercent = prevClose > 0 ? ((todayOpen - prevClose) / prevClose) * 100 : 0;
      const atr = tech.atr || prevClose * 0.015;

      const gapDirection = gapPercent > 0.3 ? 'up' : gapPercent < -0.3 ? 'down' : 'flat';
      const prevDirection = q.changePercent > 0.5 ? 'up' : q.changePercent < -0.5 ? 'down' : 'flat';
      const combo = `${prevDirection}+${gapDirection}`;

      // Strategy 1: Open entry, tight stop
      const s1 = evaluateTrade(todayOpen, todayOpen, todayOpen + 1.5 * atr, todayOpen - 0.7 * atr,
        dayOHLC.open, dayOHLC.high, dayOHLC.low, dayOHLC.close);

      // Strategy 2: Open entry, wide stop
      const s2 = evaluateTrade(todayOpen, todayOpen, todayOpen + 1.5 * atr, todayOpen - 1.5 * atr,
        dayOHLC.open, dayOHLC.high, dayOHLC.low, dayOHLC.close);

      // Strategy 3: Recovery entry (prev close), tight stop
      const recoveryEntry = Math.max(todayOpen, prevClose);
      const s3 = evaluateTrade(prevClose, prevClose, prevClose + 1.5 * atr, prevClose - 0.7 * atr,
        dayOHLC.open, dayOHLC.high, dayOHLC.low, dayOHLC.close);

      // Strategy 4: Breakout entry (prev day high)
      const prevHigh = data.bars[dayIdx - 1].high;
      const s4 = evaluateTrade(prevHigh, prevHigh, prevHigh + 1.5 * atr, prevHigh - 0.7 * atr,
        dayOHLC.open, dayOHLC.high, dayOHLC.low, dayOHLC.close);

      const dateStr = new Date(data.bars[dayIdx].timestamp * 1000).toISOString().slice(0, 10);

      results.push({
        symbol,
        date: dateStr,
        dayIndex: dayIdx,
        prevClose,
        prevChangePercent: Math.round(q.changePercent * 100) / 100,
        prevVolume: q.volume,
        avgVolume: q.avgVolume,
        relativeVolume: Math.round(q.relativeVolume * 100) / 100,
        todayOpen,
        gapPercent: Math.round(gapPercent * 100) / 100,
        gapDirection,
        prevDirection,
        combo,
        rsi: tech.rsi,
        macdHistogram: tech.macdHistogram,
        atr: tech.atr,
        atrPercent: tech.atrPercent,
        aboveFiftyDMA: !!(q.fiftyDayMA && prevClose > q.fiftyDayMA),
        aboveTwoHundredDMA: !!(q.twoHundredDayMA && prevClose > q.twoHundredDayMA),
        consolidationTightness: tech.consolidationTightness,
        near52wHigh: q.percentFromFiftyTwoWeekHigh > -5,
        dayHigh: dayOHLC.high,
        dayLow: dayOHLC.low,
        dayClose: dayOHLC.close,
        dayRange: dayOHLC.open > 0 ? ((dayOHLC.high - dayOHLC.low) / dayOHLC.open) * 100 : 0,
        outcomes: {
          openEntry_tight: { outcome: s1.outcome, pnl: s1.pnlPercent },
          openEntry_wide: { outcome: s2.outcome, pnl: s2.pnlPercent },
          recoveryEntry_tight: { outcome: s3.outcome, pnl: s3.pnlPercent },
          breakoutEntry: { outcome: s4.outcome, pnl: s4.pnlPercent },
        },
      });
    }
  }

  return results;
}

function analyzeByCondition(
  results: StockDay[],
  strategyKey: keyof StockDay['outcomes'],
  label: string
) {
  const active = results.filter(r => r.outcomes[strategyKey].outcome !== 'no-trigger');
  const wins = active.filter(r => r.outcomes[strategyKey].outcome === 'hit-target');
  const losses = active.filter(r =>
    r.outcomes[strategyKey].outcome === 'hit-sl' ||
    r.outcomes[strategyKey].outcome === 'gap-below-stop'
  );

  const total = wins.length + losses.length;
  const winRate = total > 0 ? (wins.length / total) * 100 : 0;
  const avgPnl = active.length > 0
    ? active.reduce((a, r) => a + r.outcomes[strategyKey].pnl, 0) / active.length : 0;

  return { label, active: active.length, wins: wins.length, losses: losses.length, winRate, avgPnl };
}

function printSection(title: string, rows: ReturnType<typeof analyzeByCondition>[]) {
  console.log(`\n${title}`);
  console.log('─'.repeat(85));
  console.log(
    'Condition'.padEnd(35) +
    'Active'.padStart(8) +
    'Wins'.padStart(7) +
    'Loss'.padStart(7) +
    'Win%'.padStart(8) +
    'AvgP&L'.padStart(10)
  );
  console.log('─'.repeat(85));
  for (const r of rows) {
    console.log(
      r.label.padEnd(35) +
      String(r.active).padStart(8) +
      String(r.wins).padStart(7) +
      String(r.losses).padStart(7) +
      `${r.winRate.toFixed(1)}%`.padStart(8) +
      `${r.avgPnl >= 0 ? '+' : ''}${r.avgPnl.toFixed(2)}%`.padStart(10)
    );
  }
}

async function main() {
  const args = process.argv.slice(2);
  const marketArg = (args.find(a => a === 'IN') || 'US') as 'US' | 'IN';

  const { us, india } = getAllSymbols();
  const symbols = marketArg === 'US' ? us : india;
  const indexSymbol = marketArg === 'US' ? '^GSPC' : '^NSEI';

  console.log(`\n${'═'.repeat(85)}`);
  console.log(`REVERSE ANALYSIS: ${marketArg} Market — What Actually Works?`);
  console.log(`${'═'.repeat(85)}\n`);

  // Load data
  const allSymbols = [...symbols, indexSymbol];
  const allData = new Map<string, HistoricalData>();
  let loaded = 0;
  for (const s of allSymbols) {
    const d = loadCachedData(s);
    if (d && d.bars.length > 0) { allData.set(s, d); loaded++; }
  }
  console.log(`Loaded ${loaded} symbols\n`);

  // Analyze all stock-days
  console.log('Analyzing all stock-days (this takes a moment)...');
  const results = analyzeAllStockDays(allData, symbols, marketArg);
  console.log(`Total stock-days analyzed: ${results.length}\n`);

  // ═══════════════════════════════════════════════════════════════════════
  // ANALYSIS 1: Strategy comparison (which entry method works best?)
  // ═══════════════════════════════════════════════════════════════════════

  const strategies: (keyof StockDay['outcomes'])[] = [
    'openEntry_tight', 'openEntry_wide', 'recoveryEntry_tight', 'breakoutEntry'
  ];
  const stratLabels = [
    'Open entry, tight stop (0.7 ATR)',
    'Open entry, wide stop (1.5 ATR)',
    'Recovery entry, tight stop',
    'Breakout entry (prev high)',
  ];

  printSection('STRATEGY COMPARISON (all stocks, all days)', strategies.map((s, i) =>
    analyzeByCondition(results, s, stratLabels[i])
  ));

  // ═══════════════════════════════════════════════════════════════════════
  // ANALYSIS 2: Gap direction + prev direction combos
  // ═══════════════════════════════════════════════════════════════════════

  const combos = ['up+up', 'up+down', 'up+flat', 'down+up', 'down+down', 'down+flat', 'flat+up', 'flat+down', 'flat+flat'];
  for (const strategy of ['openEntry_tight', 'breakoutEntry'] as const) {
    printSection(`GAP COMBOS — ${strategy}`, combos.map(combo => {
      const filtered = results.filter(r => r.combo === combo);
      return analyzeByCondition(filtered, strategy, `Prev ${combo.split('+')[0]} → Gap ${combo.split('+')[1]} (n=${filtered.length})`);
    }));
  }

  // ═══════════════════════════════════════════════════════════════════════
  // ANALYSIS 3: RSI ranges
  // ═══════════════════════════════════════════════════════════════════════

  const rsiRanges = [
    { label: 'RSI < 30 (oversold)', filter: (r: StockDay) => r.rsi != null && r.rsi < 30 },
    { label: 'RSI 30-40', filter: (r: StockDay) => r.rsi != null && r.rsi >= 30 && r.rsi < 40 },
    { label: 'RSI 40-50', filter: (r: StockDay) => r.rsi != null && r.rsi >= 40 && r.rsi < 50 },
    { label: 'RSI 50-60', filter: (r: StockDay) => r.rsi != null && r.rsi >= 50 && r.rsi < 60 },
    { label: 'RSI 60-70', filter: (r: StockDay) => r.rsi != null && r.rsi >= 60 && r.rsi < 70 },
    { label: 'RSI 70-80', filter: (r: StockDay) => r.rsi != null && r.rsi >= 70 && r.rsi < 80 },
    { label: 'RSI > 80 (overbought)', filter: (r: StockDay) => r.rsi != null && r.rsi > 80 },
  ];

  for (const strategy of ['openEntry_tight', 'breakoutEntry'] as const) {
    printSection(`RSI RANGES — ${strategy}`, rsiRanges.map(r => {
      const filtered = results.filter(r.filter);
      return analyzeByCondition(filtered, strategy, `${r.label} (n=${filtered.length})`);
    }));
  }

  // ═══════════════════════════════════════════════════════════════════════
  // ANALYSIS 4: MACD direction
  // ═══════════════════════════════════════════════════════════════════════

  const macdFilters = [
    { label: 'MACD bullish (hist > 0)', filter: (r: StockDay) => r.macdHistogram != null && r.macdHistogram > 0 },
    { label: 'MACD bearish (hist < 0)', filter: (r: StockDay) => r.macdHistogram != null && r.macdHistogram < 0 },
  ];

  printSection('MACD DIRECTION — breakoutEntry', macdFilters.map(m => {
    const filtered = results.filter(m.filter);
    return analyzeByCondition(filtered, 'breakoutEntry', `${m.label} (n=${filtered.length})`);
  }));

  // ═══════════════════════════════════════════════════════════════════════
  // ANALYSIS 5: Trend alignment (above/below DMAs)
  // ═══════════════════════════════════════════════════════════════════════

  const trendFilters = [
    { label: 'Above both DMAs', filter: (r: StockDay) => r.aboveFiftyDMA && r.aboveTwoHundredDMA },
    { label: 'Above 50 only', filter: (r: StockDay) => r.aboveFiftyDMA && !r.aboveTwoHundredDMA },
    { label: 'Below both DMAs', filter: (r: StockDay) => !r.aboveFiftyDMA && !r.aboveTwoHundredDMA },
  ];

  printSection('TREND ALIGNMENT — breakoutEntry', trendFilters.map(t => {
    const filtered = results.filter(t.filter);
    return analyzeByCondition(filtered, 'breakoutEntry', `${t.label} (n=${filtered.length})`);
  }));

  // ═══════════════════════════════════════════════════════════════════════
  // ANALYSIS 6: Consolidation tightness
  // ═══════════════════════════════════════════════════════════════════════

  const consolFilters = [
    { label: 'Very tight (<1.5x ATR)', filter: (r: StockDay) => r.consolidationTightness != null && r.consolidationTightness < 1.5 },
    { label: 'Tight (1.5-2.5x ATR)', filter: (r: StockDay) => r.consolidationTightness != null && r.consolidationTightness >= 1.5 && r.consolidationTightness < 2.5 },
    { label: 'Normal (2.5-4x ATR)', filter: (r: StockDay) => r.consolidationTightness != null && r.consolidationTightness >= 2.5 && r.consolidationTightness < 4 },
    { label: 'Wide (>4x ATR)', filter: (r: StockDay) => r.consolidationTightness != null && r.consolidationTightness >= 4 },
  ];

  printSection('CONSOLIDATION — breakoutEntry', consolFilters.map(c => {
    const filtered = results.filter(c.filter);
    return analyzeByCondition(filtered, 'breakoutEntry', `${c.label} (n=${filtered.length})`);
  }));

  // ═══════════════════════════════════════════════════════════════════════
  // ANALYSIS 7: ATR % (volatility)
  // ═══════════════════════════════════════════════════════════════════════

  const atrFilters = [
    { label: 'ATR% < 1.5 (low vol)', filter: (r: StockDay) => r.atrPercent != null && r.atrPercent < 1.5 },
    { label: 'ATR% 1.5-2.5', filter: (r: StockDay) => r.atrPercent != null && r.atrPercent >= 1.5 && r.atrPercent < 2.5 },
    { label: 'ATR% 2.5-4', filter: (r: StockDay) => r.atrPercent != null && r.atrPercent >= 2.5 && r.atrPercent < 4 },
    { label: 'ATR% > 4 (high vol)', filter: (r: StockDay) => r.atrPercent != null && r.atrPercent >= 4 },
  ];

  printSection('VOLATILITY (ATR%) — breakoutEntry', atrFilters.map(a => {
    const filtered = results.filter(a.filter);
    return analyzeByCondition(filtered, 'breakoutEntry', `${a.label} (n=${filtered.length})`);
  }));

  // ═══════════════════════════════════════════════════════════════════════
  // ANALYSIS 8: Near 52-week high
  // ═══════════════════════════════════════════════════════════════════════

  printSection('52-WEEK PROXIMITY — breakoutEntry', [
    analyzeByCondition(results.filter(r => r.near52wHigh), 'breakoutEntry', `Near 52W high (n=${results.filter(r => r.near52wHigh).length})`),
    analyzeByCondition(results.filter(r => !r.near52wHigh), 'breakoutEntry', `Not near 52W high (n=${results.filter(r => !r.near52wHigh).length})`),
  ]);

  // ═══════════════════════════════════════════════════════════════════════
  // ANALYSIS 9: RVOL (relative volume)
  // ═══════════════════════════════════════════════════════════════════════

  const rvolFilters = [
    { label: 'RVOL < 0.7 (low)', filter: (r: StockDay) => r.relativeVolume < 0.7 },
    { label: 'RVOL 0.7-1.3 (normal)', filter: (r: StockDay) => r.relativeVolume >= 0.7 && r.relativeVolume < 1.3 },
    { label: 'RVOL 1.3-2.0', filter: (r: StockDay) => r.relativeVolume >= 1.3 && r.relativeVolume < 2 },
    { label: 'RVOL > 2.0 (high)', filter: (r: StockDay) => r.relativeVolume >= 2 },
  ];

  printSection('RELATIVE VOLUME — breakoutEntry', rvolFilters.map(v => {
    const filtered = results.filter(v.filter);
    return analyzeByCondition(filtered, 'breakoutEntry', `${v.label} (n=${filtered.length})`);
  }));

  // ═══════════════════════════════════════════════════════════════════════
  // ANALYSIS 10: Best combo signals (multi-factor)
  // ═══════════════════════════════════════════════════════════════════════

  console.log('\n' + '═'.repeat(85));
  console.log('MULTI-FACTOR COMBOS — Finding the edge');
  console.log('═'.repeat(85));

  const multiFactorFilters = [
    {
      label: 'Gap UP + MACD bull + above both DMA',
      filter: (r: StockDay) => r.gapDirection === 'up' && r.macdHistogram != null && r.macdHistogram > 0 && r.aboveFiftyDMA && r.aboveTwoHundredDMA,
    },
    {
      label: 'Gap UP + RSI 40-65 + above 50 DMA',
      filter: (r: StockDay) => r.gapDirection === 'up' && r.rsi != null && r.rsi >= 40 && r.rsi <= 65 && r.aboveFiftyDMA,
    },
    {
      label: 'Gap UP + tight base + MACD bull',
      filter: (r: StockDay) => r.gapDirection === 'up' && r.consolidationTightness != null && r.consolidationTightness < 2.5 && r.macdHistogram != null && r.macdHistogram > 0,
    },
    {
      label: 'Gap UP + near 52W high + RVOL > 1.3',
      filter: (r: StockDay) => r.gapDirection === 'up' && r.near52wHigh && r.relativeVolume > 1.3,
    },
    {
      label: 'Prev UP + Gap UP + MACD bull',
      filter: (r: StockDay) => r.combo === 'up+up' && r.macdHistogram != null && r.macdHistogram > 0,
    },
    {
      label: 'Prev UP + Gap UP + above DMAs + RSI<70',
      filter: (r: StockDay) => r.combo === 'up+up' && r.aboveFiftyDMA && r.aboveTwoHundredDMA && r.rsi != null && r.rsi < 70,
    },
    {
      label: 'Tight base + Gap UP + above DMAs',
      filter: (r: StockDay) => r.consolidationTightness != null && r.consolidationTightness < 2 && r.gapDirection === 'up' && r.aboveFiftyDMA && r.aboveTwoHundredDMA,
    },
    {
      label: 'Gap DOWN + RSI<40 + above 200 DMA (bounce)',
      filter: (r: StockDay) => r.gapDirection === 'down' && r.rsi != null && r.rsi < 40 && r.aboveTwoHundredDMA,
    },
    {
      label: 'ATR% > 2.5 + Gap UP + MACD bull',
      filter: (r: StockDay) => r.atrPercent != null && r.atrPercent > 2.5 && r.gapDirection === 'up' && r.macdHistogram != null && r.macdHistogram > 0,
    },
  ];

  for (const strategy of ['openEntry_tight', 'openEntry_wide', 'breakoutEntry'] as const) {
    printSection(`MULTI-FACTOR — ${strategy}`, multiFactorFilters.map(f => {
      const filtered = results.filter(f.filter);
      return analyzeByCondition(filtered, strategy, `${f.label} (n=${filtered.length})`);
    }));
  }
}

main().catch(err => {
  console.error('Analysis failed:', err);
  process.exit(1);
});
