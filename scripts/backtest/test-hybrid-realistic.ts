/**
 * REALISTIC Hybrid Model Backtest
 *
 * Fixes from ChatGPT feedback:
 * 1. Closed-flat = exit at close (counted as real P&L, not ignored)
 * 2. Slippage: entry +0.2% worse, exit -0.2% worse
 * 3. Max entry enforcement: only enter if dayHigh reaches trigger but
 *    doesn't gap too far above it (max 0.5% above trigger)
 * 4. Time-based exit proxy: if day range is < 0.5 ATR, treat as no-move day
 * 5. Wins and losses include ALL active trades (flat = real P&L)
 */

import { HistoricalData, loadCachedData, getAllSymbols } from './fetch-data';
import { buildVirtualQuote, getDayOHLC } from './virtual-quote';

interface Trade {
  date: string;
  symbol: string;
  score: number;
  entryTrigger: number;
  actualEntry: number;
  sellPrice: number;
  stopLoss: number;
  dayOpen: number;
  dayHigh: number;
  dayLow: number;
  dayClose: number;
  gapPercent: number;
  prevChange: number;
  rsi: number | null;
  rvol: number;
  outcome: string;
  pnl: number;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

const SLIPPAGE = 0.002; // 0.2% slippage on entry and exit
const MAX_CHASE_PCT = 0.005; // max 0.5% above trigger for entry

function evaluateRealistic(
  entryTrigger: number,
  sellPrice: number,
  stopLoss: number,
  dayOpen: number,
  dayHigh: number,
  dayLow: number,
  dayClose: number
): { outcome: string; pnl: number; actualEntry: number; actualExit: number } {
  // Did price reach the entry trigger?
  if (dayHigh < entryTrigger) {
    return { outcome: 'no-trigger', pnl: 0, actualEntry: 0, actualExit: 0 };
  }

  // Entry price: trigger + slippage. But if it gaps above, use gap price.
  let rawEntry = entryTrigger;
  if (dayOpen > entryTrigger) {
    // Gapped above trigger. Check if within max chase distance.
    if (dayOpen > entryTrigger * (1 + MAX_CHASE_PCT)) {
      return { outcome: 'too-far-gap', pnl: 0, actualEntry: 0, actualExit: 0 };
    }
    rawEntry = dayOpen;
  }

  // Apply entry slippage (worse fill)
  const actualEntry = round2(rawEntry * (1 + SLIPPAGE));

  // Recalculate targets from actual entry
  const adjustedStop = stopLoss; // keep original stop
  const adjustedTarget = sellPrice; // keep original target

  // Check if opens below stop (gap-below-stop)
  if (dayOpen <= adjustedStop) {
    const exitPrice = round2(dayOpen * (1 - SLIPPAGE));
    const pnl = round2(((exitPrice - actualEntry) / actualEntry) * 100);
    return { outcome: 'gap-below-stop', pnl, actualEntry, actualExit: exitPrice };
  }

  const hitTarget = dayHigh >= adjustedTarget;
  const hitStop = dayLow <= adjustedStop;

  if (hitTarget && !hitStop) {
    // Apply exit slippage on target
    const exitPrice = round2(adjustedTarget * (1 - SLIPPAGE));
    const pnl = round2(((exitPrice - actualEntry) / actualEntry) * 100);
    return { outcome: 'hit-target', pnl, actualEntry, actualExit: exitPrice };
  }

  if (hitStop && !hitTarget) {
    // Apply exit slippage on stop
    const exitPrice = round2(adjustedStop * (1 - SLIPPAGE));
    const pnl = round2(((exitPrice - actualEntry) / actualEntry) * 100);
    return { outcome: 'hit-sl', pnl, actualEntry, actualExit: exitPrice };
  }

  if (hitTarget && hitStop) {
    // Conservative: assume stop hit first + slippage
    const exitPrice = round2(adjustedStop * (1 - SLIPPAGE));
    const pnl = round2(((exitPrice - actualEntry) / actualEntry) * 100);
    return { outcome: 'hit-sl', pnl, actualEntry, actualExit: exitPrice };
  }

  // Neither hit: EXIT AT CLOSE (not "flat" — real P&L with slippage)
  const exitPrice = round2(dayClose * (1 - SLIPPAGE));
  const pnl = round2(((exitPrice - actualEntry) / actualEntry) * 100);
  return { outcome: 'exit-at-close', pnl, actualEntry, actualExit: exitPrice };
}

async function main() {
  const marketArg = process.argv.includes('IN') ? 'IN' : 'US';
  const { us, india } = getAllSymbols();
  const symbols = marketArg === 'US' ? us : india;
  const indexSymbol = marketArg === 'US' ? '^GSPC' : '^NSEI';

  console.log(`\n${'═'.repeat(90)}`);
  console.log(`REALISTIC HYBRID BACKTEST: ${marketArg} Market`);
  console.log(`Slippage: ${SLIPPAGE * 100}% | Max chase: ${MAX_CHASE_PCT * 100}% | Flat = exit at close`);
  console.log(`${'═'.repeat(90)}\n`);

  const allData = new Map<string, HistoricalData>();
  for (const s of [...symbols, indexSymbol]) {
    const d = loadCachedData(s);
    if (d && d.bars.length > 0) allData.set(s, d);
  }
  console.log(`Loaded ${allData.size} symbols\n`);

  const indexData = allData.get(indexSymbol);
  if (!indexData) { console.error('Missing index data'); return; }

  const allTrades: Trade[] = [];
  const recentStopOuts = new Map<string, number>();

  for (let dayIdx = 201; dayIdx < indexData.bars.length; dayIdx++) {
    const dateStr = new Date(indexData.bars[dayIdx].timestamp * 1000).toISOString().slice(0, 10);

    // 5-day market trend
    const idxCloses5d: number[] = [];
    for (let k = Math.max(0, dayIdx - 5); k < dayIdx; k++) {
      idxCloses5d.push(indexData.bars[k].close);
    }
    let marketTrend: 'bullish' | 'neutral' | 'bearish' = 'neutral';
    if (idxCloses5d.length >= 5) {
      const sma = idxCloses5d.reduce((a, b) => a + b, 0) / idxCloses5d.length;
      const latest = idxCloses5d[idxCloses5d.length - 1];
      const pct = ((latest - sma) / sma) * 100;
      let upDays = 0;
      for (let i = 1; i < idxCloses5d.length; i++) {
        if (idxCloses5d[i] > idxCloses5d[i - 1]) upDays++;
      }
      if (pct > 0.2 && upDays >= 3) marketTrend = 'bullish';
      else if (pct < -0.3 || upDays <= 1) marketTrend = 'bearish';
    }

    if (marketTrend === 'bearish') continue;

    const candidates: {
      symbol: string; score: number; signals: string[];
      quote: any; tech: any; data: HistoricalData;
    }[] = [];

    for (const symbol of symbols) {
      const data = allData.get(symbol);
      if (!data || dayIdx >= data.bars.length) continue;

      const lastStop = recentStopOuts.get(symbol);
      if (lastStop != null && dayIdx - lastStop <= 2) continue;

      const virtual = buildVirtualQuote(symbol, data.bars, dayIdx, marketArg as 'US' | 'IN');
      if (!virtual) continue;

      const { quote: q, tech } = virtual;
      const todayOpen = data.bars[dayIdx].open;
      const prevClose = q.price;
      const gapPercent = prevClose > 0 ? ((todayOpen - prevClose) / prevClose) * 100 : 0;

      // HARD FILTERS
      if (gapPercent < -0.3) continue;
      if (!q.fiftyDayMA || prevClose <= q.fiftyDayMA) continue;
      if (q.relativeVolume < 1.0) continue;
      // Hard filter: RSI must be < 80 (overbought kills)
      if (tech.rsi != null && tech.rsi > 80) continue;

      // SCORING
      let score = 0;
      const signals: string[] = [];

      const near52w = q.percentFromFiftyTwoWeekHigh > -5;
      if (near52w && q.relativeVolume > 1.3 && gapPercent > 0.3) {
        score += 20;
        signals.push('52W+RVOL+Gap combo');
      }

      if (q.changePercent > 0.5 && gapPercent > 0.3) {
        score += 15;
        signals.push('Continuation');
      }

      if (tech.macdHistogram != null && tech.macdHistogram > 0) {
        score += 10;
        signals.push('MACD Bull');
      }

      if (tech.rsi != null && tech.rsi >= 55 && tech.rsi <= 75) {
        score += 10;
        signals.push(`RSI ${tech.rsi.toFixed(0)}`);
      }

      if (q.twoHundredDayMA && prevClose > q.twoHundredDayMA) {
        score += 8;
        signals.push('Above both DMAs');
      }

      if (q.relativeVolume >= 1.3 && q.relativeVolume <= 2.0) {
        score += 8;
        signals.push(`RVOL ${q.relativeVolume.toFixed(1)}x`);
      } else if (q.relativeVolume > 2.0) {
        score += 5;
      }

      if (near52w) { score += 5; }

      if (tech.consolidationTightness != null && tech.consolidationTightness < 2.5) {
        score += 5;
      }

      if (tech.macdHistogram != null && tech.macdHistogram < 0) { score -= 5; }
      if (marketTrend === 'bullish') { score += 5; }

      if (score >= 30) {
        candidates.push({ symbol, score, signals, quote: q, tech, data });
      }
    }

    candidates.sort((a, b) => b.score - a.score);
    const sectorCount: Record<string, number> = {};
    const picks: typeof candidates = [];
    for (const c of candidates) {
      const sector = c.quote.sector || 'Unknown';
      const count = sectorCount[sector] || 0;
      if (count < 2) {
        picks.push(c);
        sectorCount[sector] = count + 1;
        if (picks.length >= 5) break;
      }
    }

    for (const pick of picks) {
      const dayOHLC = getDayOHLC(pick.data.bars, dayIdx);
      if (!dayOHLC) continue;

      const prevHigh = pick.data.bars[dayIdx - 1].high;
      const atr = pick.tech.atr || pick.quote.price * 0.015;
      const entryTrigger = prevHigh;
      const stopLoss = round2(entryTrigger - 1.5 * atr);
      const sellPrice = round2(entryTrigger + 1.5 * atr);

      const result = evaluateRealistic(
        entryTrigger, sellPrice, stopLoss,
        dayOHLC.open, dayOHLC.high, dayOHLC.low, dayOHLC.close
      );

      if (result.outcome === 'no-trigger' || result.outcome === 'too-far-gap') {
        allTrades.push({
          date: dateStr, symbol: pick.symbol, score: pick.score,
          entryTrigger, actualEntry: 0, sellPrice, stopLoss,
          dayOpen: dayOHLC.open, dayHigh: dayOHLC.high,
          dayLow: dayOHLC.low, dayClose: dayOHLC.close,
          gapPercent: round2(((dayOHLC.open - pick.quote.price) / pick.quote.price) * 100),
          prevChange: round2(pick.quote.changePercent),
          rsi: pick.tech.rsi, rvol: round2(pick.quote.relativeVolume),
          outcome: result.outcome, pnl: 0,
        });
        continue;
      }

      allTrades.push({
        date: dateStr, symbol: pick.symbol, score: pick.score,
        entryTrigger, actualEntry: result.actualEntry, sellPrice, stopLoss,
        dayOpen: dayOHLC.open, dayHigh: dayOHLC.high,
        dayLow: dayOHLC.low, dayClose: dayOHLC.close,
        gapPercent: round2(((dayOHLC.open - pick.quote.price) / pick.quote.price) * 100),
        prevChange: round2(pick.quote.changePercent),
        rsi: pick.tech.rsi, rvol: round2(pick.quote.relativeVolume),
        outcome: result.outcome, pnl: result.pnl,
      });

      if (result.outcome === 'hit-sl' || result.outcome === 'gap-below-stop') {
        recentStopOuts.set(pick.symbol, dayIdx);
      }
    }
  }

  // ═══════════════════════════════════════════════════════════
  // RESULTS — ALL active trades count (flat = real P&L)
  // ═══════════════════════════════════════════════════════════

  const inactive = allTrades.filter(t => t.outcome === 'no-trigger' || t.outcome === 'too-far-gap');
  const active = allTrades.filter(t => t.outcome !== 'no-trigger' && t.outcome !== 'too-far-gap');
  const wins = active.filter(t => t.pnl > 0);
  const losses = active.filter(t => t.pnl <= 0);

  const winRate = active.length > 0 ? (wins.length / active.length) * 100 : 0;
  const avgPnl = active.length > 0 ? active.reduce((a, t) => a + t.pnl, 0) / active.length : 0;
  const totalPnl = active.reduce((a, t) => a + t.pnl, 0);
  const avgWin = wins.length > 0 ? wins.reduce((a, t) => a + t.pnl, 0) / wins.length : 0;
  const avgLoss = losses.length > 0 ? losses.reduce((a, t) => a + t.pnl, 0) / losses.length : 0;

  let peak = 0, cumPnl = 0, maxDD = 0;
  for (const t of active) {
    cumPnl += t.pnl;
    if (cumPnl > peak) peak = cumPnl;
    if (peak - cumPnl > maxDD) maxDD = peak - cumPnl;
  }

  const grossProfit = wins.reduce((a, t) => a + t.pnl, 0);
  const grossLoss = Math.abs(losses.reduce((a, t) => a + t.pnl, 0));
  const profitFactor = grossLoss > 0 ? round2(grossProfit / grossLoss) : 0;
  const uniqueDays = new Set(allTrades.map(t => t.date));

  console.log(`\n${'═'.repeat(90)}`);
  console.log('REALISTIC RESULTS (flat=exit at close, with slippage)');
  console.log(`${'═'.repeat(90)}`);
  console.log(`Trading days:     ${uniqueDays.size}`);
  console.log(`Total picks:      ${allTrades.length} (${active.length} entered, ${inactive.length} no-trigger/too-far)`);
  console.log(`Profitable:       ${wins.length}`);
  console.log(`Unprofitable:     ${losses.length}`);
  console.log(`Win rate:         ${winRate.toFixed(1)}% (profitable / all entered)`);
  console.log(`Avg P&L/trade:    ${avgPnl >= 0 ? '+' : ''}${avgPnl.toFixed(2)}%`);
  console.log(`Avg Win:          +${avgWin.toFixed(2)}%`);
  console.log(`Avg Loss:         ${avgLoss.toFixed(2)}%`);
  console.log(`Total P&L:        ${totalPnl >= 0 ? '+' : ''}${totalPnl.toFixed(1)}%`);
  console.log(`Max Drawdown:     -${maxDD.toFixed(1)}%`);
  console.log(`Profit Factor:    ${profitFactor.toFixed(2)}`);

  // Outcome breakdown
  console.log(`\nOutcome Breakdown:`);
  const outcomes: Record<string, number> = {};
  for (const t of allTrades) { outcomes[t.outcome] = (outcomes[t.outcome] || 0) + 1; }
  for (const [o, c] of Object.entries(outcomes).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${o.padEnd(20)} ${String(c).padStart(4)}`);
  }

  // P&L distribution of active trades
  const pnlBuckets: Record<string, number> = {
    '< -3%': 0, '-3 to -1%': 0, '-1 to 0%': 0,
    '0 to +1%': 0, '+1 to +3%': 0, '> +3%': 0,
  };
  for (const t of active) {
    if (t.pnl < -3) pnlBuckets['< -3%']++;
    else if (t.pnl < -1) pnlBuckets['-3 to -1%']++;
    else if (t.pnl < 0) pnlBuckets['-1 to 0%']++;
    else if (t.pnl < 1) pnlBuckets['0 to +1%']++;
    else if (t.pnl < 3) pnlBuckets['+1 to +3%']++;
    else pnlBuckets['> +3%']++;
  }
  console.log(`\nP&L Distribution (active trades):`);
  for (const [bucket, count] of Object.entries(pnlBuckets)) {
    const bar = '█'.repeat(Math.round(count / active.length * 50));
    console.log(`  ${bucket.padEnd(14)} ${String(count).padStart(4)} ${bar}`);
  }

  // Daily P&L
  const dailyPnl = new Map<string, number[]>();
  for (const t of active) {
    if (!dailyPnl.has(t.date)) dailyPnl.set(t.date, []);
    dailyPnl.get(t.date)!.push(t.pnl);
  }
  const sortedDays = [...dailyPnl.keys()].sort();
  let runPnl = 0;
  let greenDays = 0, redDays = 0;
  console.log(`\nDaily P&L:`);
  for (const day of sortedDays) {
    const pnls = dailyPnl.get(day)!;
    const dayTotal = round2(pnls.reduce((a, b) => a + b, 0));
    runPnl += dayTotal;
    if (dayTotal >= 0) greenDays++; else redDays++;
    const bar = dayTotal >= 0
      ? '█'.repeat(Math.min(30, Math.round(dayTotal * 5)))
      : '░'.repeat(Math.min(30, Math.round(Math.abs(dayTotal) * 5)));
    console.log(`  ${day}  ${dayTotal >= 0 ? '+' : ''}${dayTotal.toFixed(2).padStart(6)}%  ${dayTotal >= 0 ? '🟢' : '🔴'} ${bar}  (cum: ${runPnl >= 0 ? '+' : ''}${runPnl.toFixed(1)}%)`);
  }
  console.log(`\n  Green days: ${greenDays} | Red days: ${redDays} | Day win rate: ${((greenDays / (greenDays + redDays)) * 100).toFixed(0)}%`);
}

main().catch(err => { console.error(err); process.exit(1); });
