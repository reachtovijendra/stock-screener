/**
 * Hybrid Model V3 — Fixed Trade Management
 *
 * Changes from V2:
 * 1. Partial profit: take 50% at +0.8%, trail rest with breakeven stop
 * 2. Tighter stop: 1.0 ATR (not 1.5)
 * 3. Early cut: exit if trade goes to -0.5% (not wait for full stop)
 * 4. Stricter market filter: skip if index prev day was down > 0.5%
 * 5. Time stop proxy: if (high - open) < 0.3 ATR, stock isn't moving → exit at close
 *
 * Since we only have daily OHLC (no intraday), we simulate partial profits
 * using the daily range: if dayHigh reaches +0.8% from entry, assume
 * partial profit was taken. Then check if remainder hit full target or stopped.
 */

import { HistoricalData, loadCachedData, getAllSymbols } from './fetch-data';
import { buildVirtualQuote, getDayOHLC } from './virtual-quote';

interface Trade {
  date: string;
  symbol: string;
  score: number;
  entryTrigger: number;
  actualEntry: number;
  stopLoss: number;
  target: number;
  dayOpen: number;
  dayHigh: number;
  dayLow: number;
  dayClose: number;
  gapPercent: number;
  prevChange: number;
  rsi: number | null;
  rvol: number;
  outcome: string;
  pnl: number;        // blended P&L (partial profit + remainder)
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

const SLIPPAGE = 0.002;
const MAX_CHASE_PCT = 0.005;
const PARTIAL_PROFIT_PCT = 0.008;  // take 50% at +0.8%
const EARLY_CUT_PCT = -0.005;     // cut if -0.5%
const STOP_ATR_MULT = 1.0;        // tighter stop: 1.0 ATR
const TARGET_ATR_MULT = 1.5;      // target: 1.5 ATR

function evaluateV3(
  entryTrigger: number,
  atr: number,
  dayOpen: number,
  dayHigh: number,
  dayLow: number,
  dayClose: number
): { outcome: string; pnl: number; actualEntry: number } {
  // Entry check
  if (dayHigh < entryTrigger) {
    return { outcome: 'no-trigger', pnl: 0, actualEntry: 0 };
  }

  let rawEntry = entryTrigger;
  if (dayOpen > entryTrigger) {
    if (dayOpen > entryTrigger * (1 + MAX_CHASE_PCT)) {
      return { outcome: 'too-far-gap', pnl: 0, actualEntry: 0 };
    }
    rawEntry = dayOpen;
  }

  const entry = round2(rawEntry * (1 + SLIPPAGE));
  const stop = round2(entry - STOP_ATR_MULT * atr);
  const target = round2(entry + TARGET_ATR_MULT * atr);
  const partialLevel = round2(entry * (1 + PARTIAL_PROFIT_PCT));
  const earlyCutLevel = round2(entry * (1 + EARLY_CUT_PCT));

  // Check immediate gap-below-stop
  if (dayOpen <= stop) {
    const exit = round2(dayOpen * (1 - SLIPPAGE));
    return { outcome: 'gap-below-stop', pnl: round2(((exit - entry) / entry) * 100), actualEntry: entry };
  }

  // Early cut: if low goes to -0.5% from entry, cut early
  if (dayLow <= earlyCutLevel) {
    // Check if partial profit was hit first (high reached +0.8% before low reached -0.5%)
    // Conservative: if both possible, assume early cut happens
    // But if dayHigh > partialLevel AND dayLow > earlyCutLevel at some point...
    // We can't know sequence from daily data, so:
    // If high reached partial AND low reached early cut → take the partial on 50%, cut on 50%
    if (dayHigh >= partialLevel) {
      // Assume partial profit happened first (optimistic for the first half)
      const partialPnl = PARTIAL_PROFIT_PCT * 100; // +0.8% on 50%
      const remainderPnl = ((earlyCutLevel - entry) / entry) * 100; // -0.5% on 50%
      const blended = round2((partialPnl * 0.5) + (remainderPnl * 0.5));
      return { outcome: 'partial+cut', pnl: blended, actualEntry: entry };
    }
    // Just early cut on full position
    const exit = round2(earlyCutLevel * (1 - SLIPPAGE));
    return { outcome: 'early-cut', pnl: round2(((exit - entry) / entry) * 100), actualEntry: entry };
  }

  // Full stop hit (but not early cut — implies low between earlyCut and stop)
  if (dayLow <= stop) {
    if (dayHigh >= partialLevel) {
      const partialPnl = PARTIAL_PROFIT_PCT * 100;
      const remainderPnl = ((stop - entry) / entry) * 100;
      const blended = round2((partialPnl * 0.5) + (remainderPnl * 0.5));
      return { outcome: 'partial+stop', pnl: blended, actualEntry: entry };
    }
    const exit = round2(stop * (1 - SLIPPAGE));
    return { outcome: 'hit-sl', pnl: round2(((exit - entry) / entry) * 100), actualEntry: entry };
  }

  // Target hit (no stop or early cut)
  if (dayHigh >= target) {
    // Partial at +0.8%, remainder at target
    const partialPnl = PARTIAL_PROFIT_PCT * 100;
    const remainderPnl = ((target - entry) / entry) * 100;
    const blended = round2((partialPnl * 0.5) + (remainderPnl * 0.5));
    return { outcome: 'hit-target', pnl: blended, actualEntry: entry };
  }

  // Partial profit reached but target/stop not hit
  if (dayHigh >= partialLevel) {
    // Took 50% at +0.8%, remainder exits at close (breakeven stop triggered or close)
    const partialPnl = PARTIAL_PROFIT_PCT * 100;
    const remainderExit = round2(Math.max(entry, dayClose) * (1 - SLIPPAGE)); // breakeven stop or close
    const remainderPnl = ((remainderExit - entry) / entry) * 100;
    const blended = round2((partialPnl * 0.5) + (remainderPnl * 0.5));
    return { outcome: 'partial+close', pnl: blended, actualEntry: entry };
  }

  // Time stop proxy: stock barely moved — exit at close
  const moveFromEntry = ((dayClose - entry) / entry) * 100;
  const exit = round2(dayClose * (1 - SLIPPAGE));
  return { outcome: 'exit-at-close', pnl: round2(((exit - entry) / entry) * 100), actualEntry: entry };
}

async function main() {
  const marketArg = process.argv.includes('IN') ? 'IN' : 'US';
  const { us, india } = getAllSymbols();
  const symbols = marketArg === 'US' ? us : india;
  const indexSymbol = marketArg === 'US' ? '^GSPC' : '^NSEI';

  console.log(`\n${'═'.repeat(90)}`);
  console.log(`HYBRID V3 BACKTEST: ${marketArg} Market`);
  console.log(`Stop: ${STOP_ATR_MULT} ATR | Target: ${TARGET_ATR_MULT} ATR | Partial: ${PARTIAL_PROFIT_PCT * 100}% | Early cut: ${EARLY_CUT_PCT * 100}% | Slippage: ${SLIPPAGE * 100}%`);
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

    // Stricter market filter: 5-day trend + prev day not down > 0.5%
    const idxCloses5d: number[] = [];
    for (let k = Math.max(0, dayIdx - 5); k < dayIdx; k++) {
      idxCloses5d.push(indexData.bars[k].close);
    }

    const idxPrevChange = idxCloses5d.length >= 2
      ? ((idxCloses5d[idxCloses5d.length - 1] - idxCloses5d[idxCloses5d.length - 2]) / idxCloses5d[idxCloses5d.length - 2]) * 100
      : 0;

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

    // Skip bearish market OR index was down > 0.5% yesterday
    if (marketTrend === 'bearish') continue;
    if (idxPrevChange < -0.5) continue;

    // Score stocks (same selection logic as V2)
    const candidates: {
      symbol: string; score: number; quote: any; tech: any; data: HistoricalData;
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

      // Hard filters
      if (gapPercent < -0.3) continue;
      if (!q.fiftyDayMA || prevClose <= q.fiftyDayMA) continue;
      if (q.relativeVolume < 1.0) continue;
      if (tech.rsi != null && tech.rsi > 80) continue;

      // Scoring
      let score = 0;
      const near52w = q.percentFromFiftyTwoWeekHigh > -5;

      if (near52w && q.relativeVolume > 1.3 && gapPercent > 0.3) score += 20;
      if (q.changePercent > 0.5 && gapPercent > 0.3) score += 15;
      if (tech.macdHistogram != null && tech.macdHistogram > 0) score += 10;
      if (tech.rsi != null && tech.rsi >= 55 && tech.rsi <= 75) score += 10;
      if (q.twoHundredDayMA && prevClose > q.twoHundredDayMA) score += 8;
      if (q.relativeVolume >= 1.3 && q.relativeVolume <= 2.0) score += 8;
      else if (q.relativeVolume > 2.0) score += 5;
      if (near52w) score += 5;
      if (tech.consolidationTightness != null && tech.consolidationTightness < 2.5) score += 5;
      if (tech.macdHistogram != null && tech.macdHistogram < 0) score -= 5;
      if (marketTrend === 'bullish') score += 5;

      if (score >= 30) {
        candidates.push({ symbol, score, quote: q, tech, data });
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

      const result = evaluateV3(
        prevHigh, atr,
        dayOHLC.open, dayOHLC.high, dayOHLC.low, dayOHLC.close
      );

      const gapPct = pick.quote.price > 0
        ? round2(((dayOHLC.open - pick.quote.price) / pick.quote.price) * 100) : 0;

      allTrades.push({
        date: dateStr, symbol: pick.symbol, score: pick.score,
        entryTrigger: prevHigh, actualEntry: result.actualEntry,
        stopLoss: round2(result.actualEntry - STOP_ATR_MULT * atr),
        target: round2(result.actualEntry + TARGET_ATR_MULT * atr),
        dayOpen: dayOHLC.open, dayHigh: dayOHLC.high,
        dayLow: dayOHLC.low, dayClose: dayOHLC.close,
        gapPercent: gapPct, prevChange: round2(pick.quote.changePercent),
        rsi: pick.tech.rsi, rvol: round2(pick.quote.relativeVolume),
        outcome: result.outcome, pnl: result.pnl,
      });

      if (['hit-sl', 'gap-below-stop', 'early-cut'].includes(result.outcome)) {
        recentStopOuts.set(pick.symbol, dayIdx);
      }
    }
  }

  // Results
  const inactive = allTrades.filter(t => ['no-trigger', 'too-far-gap'].includes(t.outcome));
  const active = allTrades.filter(t => !['no-trigger', 'too-far-gap'].includes(t.outcome));
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
  console.log('V3 RESULTS (partial profit + tight stop + early cut + market filter)');
  console.log(`${'═'.repeat(90)}`);
  console.log(`Trading days:     ${uniqueDays.size}`);
  console.log(`Total picks:      ${allTrades.length} (${active.length} entered, ${inactive.length} filtered)`);
  console.log(`Profitable:       ${wins.length}`);
  console.log(`Unprofitable:     ${losses.length}`);
  console.log(`Win rate:         ${winRate.toFixed(1)}%`);
  console.log(`Avg P&L/trade:    ${avgPnl >= 0 ? '+' : ''}${avgPnl.toFixed(2)}%`);
  console.log(`Avg Win:          +${avgWin.toFixed(2)}%`);
  console.log(`Avg Loss:         ${avgLoss.toFixed(2)}%`);
  console.log(`Total P&L:        ${totalPnl >= 0 ? '+' : ''}${totalPnl.toFixed(1)}%`);
  console.log(`Max Drawdown:     -${maxDD.toFixed(1)}%`);
  console.log(`Profit Factor:    ${profitFactor.toFixed(2)}`);

  console.log(`\nOutcome Breakdown:`);
  const outcomes: Record<string, number> = {};
  for (const t of allTrades) { outcomes[t.outcome] = (outcomes[t.outcome] || 0) + 1; }
  for (const [o, c] of Object.entries(outcomes).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${o.padEnd(20)} ${String(c).padStart(4)}`);
  }

  // P&L distribution
  const buckets: Record<string, number> = {
    '< -2%': 0, '-2 to -1%': 0, '-1 to -0.5%': 0, '-0.5 to 0%': 0,
    '0 to +0.5%': 0, '+0.5 to +1%': 0, '+1 to +2%': 0, '> +2%': 0,
  };
  for (const t of active) {
    if (t.pnl < -2) buckets['< -2%']++;
    else if (t.pnl < -1) buckets['-2 to -1%']++;
    else if (t.pnl < -0.5) buckets['-1 to -0.5%']++;
    else if (t.pnl < 0) buckets['-0.5 to 0%']++;
    else if (t.pnl < 0.5) buckets['0 to +0.5%']++;
    else if (t.pnl < 1) buckets['+0.5 to +1%']++;
    else if (t.pnl < 2) buckets['+1 to +2%']++;
    else buckets['> +2%']++;
  }
  console.log(`\nP&L Distribution:`);
  for (const [b, c] of Object.entries(buckets)) {
    const bar = '█'.repeat(Math.round((c / Math.max(1, active.length)) * 40));
    console.log(`  ${b.padEnd(16)} ${String(c).padStart(3)} ${bar}`);
  }

  // Daily P&L
  const dailyPnl = new Map<string, number[]>();
  for (const t of active) {
    if (!dailyPnl.has(t.date)) dailyPnl.set(t.date, []);
    dailyPnl.get(t.date)!.push(t.pnl);
  }
  const sortedDays = [...dailyPnl.keys()].sort();
  let runPnl = 0, greenDays = 0, redDays = 0;
  console.log(`\nDaily P&L:`);
  for (const day of sortedDays) {
    const pnls = dailyPnl.get(day)!;
    const dayTotal = round2(pnls.reduce((a, b) => a + b, 0));
    runPnl += dayTotal;
    if (dayTotal > 0) greenDays++; else redDays++;
    console.log(`  ${day}  ${dayTotal >= 0 ? '+' : ''}${dayTotal.toFixed(2).padStart(6)}%  ${dayTotal > 0 ? '🟢' : dayTotal < 0 ? '🔴' : '⚪'} (cum: ${runPnl >= 0 ? '+' : ''}${runPnl.toFixed(1)}%)`);
  }
  console.log(`\n  Green: ${greenDays} | Red: ${redDays} | Day win rate: ${((greenDays / Math.max(1, greenDays + redDays)) * 100).toFixed(0)}%`);
}

main().catch(err => { console.error(err); process.exit(1); });
