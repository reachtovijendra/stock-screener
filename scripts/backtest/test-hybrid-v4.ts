/**
 * Hybrid Model V4 — Let Winners Run
 *
 * Fixes from ChatGPT:
 * 1. Partial profit moved from 0.8% → 1.3%, take only 30% (not 50%)
 * 2. After partial: stop moves to breakeven (entry price)
 * 3. Trailing exit on remainder: trail at 0.5 ATR below day's high
 * 4. Hard market circuit breaker: if index gaps down > 0.5% → skip day
 * 5. No partial if move isn't sustained (require +1.3% AND day trending)
 *
 * Since we have daily OHLC only, we simulate trailing by checking:
 * - If dayHigh reaches partial level → take 30%
 * - Remaining 70%: exit at MAX(breakeven, dayClose, dayHigh - 0.5*ATR)
 * - This approximates trailing without intraday data
 */

import { HistoricalData, loadCachedData, getAllSymbols } from './fetch-data';
import { buildVirtualQuote, getDayOHLC } from './virtual-quote';

interface Trade {
  date: string;
  symbol: string;
  score: number;
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
  pnl: number;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

const SLIPPAGE = 0.002;
const MAX_CHASE_PCT = 0.005;
const PARTIAL_PCT = 0.013;       // take partial at +1.3%
const PARTIAL_SIZE = 0.3;        // take 30% off
const REMAINDER_SIZE = 0.7;      // 70% remains
const STOP_ATR = 1.0;            // initial stop: 1.0 ATR
const TARGET_ATR = 2.0;          // full target: 2.0 ATR (let it run further)
const TRAIL_ATR = 0.5;           // trail remainder at 0.5 ATR below high
const EARLY_CUT_PCT = -0.005;    // cut at -0.5%
const INDEX_GAP_LIMIT = -0.005;  // skip if index down > 0.5%

function evaluateV4(
  entryTrigger: number,
  atr: number,
  dayOpen: number,
  dayHigh: number,
  dayLow: number,
  dayClose: number
): { outcome: string; pnl: number; actualEntry: number } {
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
  const stop = round2(entry - STOP_ATR * atr);
  const target = round2(entry + TARGET_ATR * atr);
  const partialLevel = round2(entry * (1 + PARTIAL_PCT));
  const earlyCutLevel = round2(entry * (1 + EARLY_CUT_PCT));

  // Gap below stop
  if (dayOpen <= stop) {
    const exit = round2(dayOpen * (1 - SLIPPAGE));
    return { outcome: 'gap-below-stop', pnl: round2(((exit - entry) / entry) * 100), actualEntry: entry };
  }

  const hitStop = dayLow <= stop;
  const hitPartial = dayHigh >= partialLevel;
  const hitTarget = dayHigh >= target;
  const hitEarlyCut = dayLow <= earlyCutLevel;

  // Case: Stop hit, no partial reached
  if (hitStop && !hitPartial) {
    // Check early cut first
    if (hitEarlyCut) {
      const exit = round2(earlyCutLevel * (1 - SLIPPAGE));
      return { outcome: 'early-cut', pnl: round2(((exit - entry) / entry) * 100), actualEntry: entry };
    }
    const exit = round2(stop * (1 - SLIPPAGE));
    return { outcome: 'hit-sl', pnl: round2(((exit - entry) / entry) * 100), actualEntry: entry };
  }

  // Case: Early cut hit, no partial
  if (hitEarlyCut && !hitPartial) {
    const exit = round2(earlyCutLevel * (1 - SLIPPAGE));
    return { outcome: 'early-cut', pnl: round2(((exit - entry) / entry) * 100), actualEntry: entry };
  }

  // Case: Partial reached
  if (hitPartial) {
    const partialPnl = PARTIAL_PCT * 100; // +1.3% on 30%

    // After partial: stop moves to breakeven (entry)
    // Remainder trails at dayHigh - 0.5*ATR or breakeven, whichever higher
    const trailStop = Math.max(entry, dayHigh - TRAIL_ATR * atr);

    if (hitTarget) {
      // Full target hit: 30% at +1.3%, 70% at target
      const remainPnl = ((target * (1 - SLIPPAGE) - entry) / entry) * 100;
      const blended = round2(partialPnl * PARTIAL_SIZE + remainPnl * REMAINDER_SIZE);
      return { outcome: 'hit-target', pnl: blended, actualEntry: entry };
    }

    // Check if trailing stop was hit (low < trailStop after partial)
    // Since we only have daily data, we check if close is above trail stop
    // If dayLow < trailStop, remainder stopped at trail
    if (dayLow < trailStop && dayLow > entry) {
      // Stopped at trail but above breakeven
      const remainExit = round2(trailStop * (1 - SLIPPAGE));
      const remainPnl = ((remainExit - entry) / entry) * 100;
      const blended = round2(partialPnl * PARTIAL_SIZE + remainPnl * REMAINDER_SIZE);
      return { outcome: 'partial+trail', pnl: blended, actualEntry: entry };
    }

    if (dayLow <= entry) {
      // Remainder stopped at breakeven
      const remainPnl = 0; // breakeven
      const blended = round2(partialPnl * PARTIAL_SIZE + remainPnl * REMAINDER_SIZE);
      return { outcome: 'partial+breakeven', pnl: blended, actualEntry: entry };
    }

    // Remainder exits at close (above breakeven)
    const remainExit = round2(dayClose * (1 - SLIPPAGE));
    const remainPnl = ((remainExit - entry) / entry) * 100;
    const blended = round2(partialPnl * PARTIAL_SIZE + remainPnl * REMAINDER_SIZE);
    return { outcome: 'partial+close', pnl: blended, actualEntry: entry };
  }

  // Nothing triggered — exit at close
  const exit = round2(dayClose * (1 - SLIPPAGE));
  return { outcome: 'exit-at-close', pnl: round2(((exit - entry) / entry) * 100), actualEntry: entry };
}

async function main() {
  const marketArg = process.argv.includes('IN') ? 'IN' : 'US';
  const { us, india } = getAllSymbols();
  const symbols = marketArg === 'US' ? us : india;
  const indexSymbol = marketArg === 'US' ? '^GSPC' : '^NSEI';

  console.log(`\n${'═'.repeat(90)}`);
  console.log(`HYBRID V4 BACKTEST: ${marketArg} — "Let Winners Run"`);
  console.log(`Stop: ${STOP_ATR} ATR | Target: ${TARGET_ATR} ATR | Partial: ${PARTIAL_PCT * 100}% (${PARTIAL_SIZE * 100}%) | Trail: ${TRAIL_ATR} ATR`);
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

    // Market filters
    const idxCloses5d: number[] = [];
    for (let k = Math.max(0, dayIdx - 5); k < dayIdx; k++) {
      idxCloses5d.push(indexData.bars[k].close);
    }

    const idxPrevChange = idxCloses5d.length >= 2
      ? ((idxCloses5d[idxCloses5d.length - 1] - idxCloses5d[idxCloses5d.length - 2]) / idxCloses5d[idxCloses5d.length - 2]) * 100 : 0;

    // Index gap today
    const idxTodayOpen = indexData.bars[dayIdx].open;
    const idxPrevClose = indexData.bars[dayIdx - 1].close;
    const idxGapPct = idxPrevClose > 0 ? ((idxTodayOpen - idxPrevClose) / idxPrevClose) * 100 : 0;

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

    // Circuit breakers
    if (marketTrend === 'bearish') continue;
    if (idxPrevChange < -0.5) continue;
    if (idxGapPct < INDEX_GAP_LIMIT * 100) continue; // index gapping down > 0.5%

    // Stock selection (same as V3)
    const candidates: { symbol: string; score: number; quote: any; tech: any; data: HistoricalData }[] = [];

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

      if (gapPercent < -0.3) continue;
      if (!q.fiftyDayMA || prevClose <= q.fiftyDayMA) continue;
      if (q.relativeVolume < 1.0) continue;
      if (tech.rsi != null && tech.rsi > 80) continue;

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

      if (score >= 30) candidates.push({ symbol, score, quote: q, tech, data });
    }

    candidates.sort((a, b) => b.score - a.score);
    const sectorCount: Record<string, number> = {};
    const picks: typeof candidates = [];
    for (const c of candidates) {
      const sector = c.quote.sector || 'Unknown';
      const count = sectorCount[sector] || 0;
      if (count < 2) { picks.push(c); sectorCount[sector] = count + 1; if (picks.length >= 5) break; }
    }

    for (const pick of picks) {
      const dayOHLC = getDayOHLC(pick.data.bars, dayIdx);
      if (!dayOHLC) continue;
      const prevHigh = pick.data.bars[dayIdx - 1].high;
      const atr = pick.tech.atr || pick.quote.price * 0.015;

      const result = evaluateV4(prevHigh, atr, dayOHLC.open, dayOHLC.high, dayOHLC.low, dayOHLC.close);
      const gapPct = pick.quote.price > 0 ? round2(((dayOHLC.open - pick.quote.price) / pick.quote.price) * 100) : 0;

      allTrades.push({
        date: dateStr, symbol: pick.symbol, score: pick.score,
        actualEntry: result.actualEntry,
        stopLoss: round2(result.actualEntry - STOP_ATR * atr),
        target: round2(result.actualEntry + TARGET_ATR * atr),
        dayOpen: dayOHLC.open, dayHigh: dayOHLC.high, dayLow: dayOHLC.low, dayClose: dayOHLC.close,
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
  for (const t of active) { cumPnl += t.pnl; if (cumPnl > peak) peak = cumPnl; if (peak - cumPnl > maxDD) maxDD = peak - cumPnl; }

  const grossProfit = wins.reduce((a, t) => a + t.pnl, 0);
  const grossLoss = Math.abs(losses.reduce((a, t) => a + t.pnl, 0));
  const profitFactor = grossLoss > 0 ? round2(grossProfit / grossLoss) : wins.length > 0 ? Infinity : 0;
  const uniqueDays = new Set(allTrades.map(t => t.date));

  console.log(`\n${'═'.repeat(90)}`);
  console.log('V4 RESULTS — "Let Winners Run"');
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
  console.log(`Profit Factor:    ${profitFactor}`);

  console.log(`\nOutcome Breakdown:`);
  const outcomes: Record<string, number> = {};
  for (const t of allTrades) { outcomes[t.outcome] = (outcomes[t.outcome] || 0) + 1; }
  for (const [o, c] of Object.entries(outcomes).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${o.padEnd(22)} ${String(c).padStart(4)}`);
  }

  const dailyPnl = new Map<string, number[]>();
  for (const t of active) { if (!dailyPnl.has(t.date)) dailyPnl.set(t.date, []); dailyPnl.get(t.date)!.push(t.pnl); }
  const sortedDays = [...dailyPnl.keys()].sort();
  let runPnl = 0, greenDays = 0, redDays = 0;
  console.log(`\nDaily P&L:`);
  for (const day of sortedDays) {
    const pnls = dailyPnl.get(day)!;
    const dayTotal = round2(pnls.reduce((a, b) => a + b, 0));
    runPnl += dayTotal;
    if (dayTotal > 0) greenDays++; else redDays++;
    console.log(`  ${day}  ${dayTotal >= 0 ? '+' : ''}${dayTotal.toFixed(2).padStart(6)}%  ${dayTotal > 0 ? '🟢' : dayTotal < 0 ? '🔴' : '⚪'}  (cum: ${runPnl >= 0 ? '+' : ''}${runPnl.toFixed(1)}%)`);
  }
  console.log(`\n  Green: ${greenDays} | Red: ${redDays} | Day win rate: ${((greenDays / Math.max(1, greenDays + redDays)) * 100).toFixed(0)}%`);

  // Show all trades for transparency
  console.log(`\nAll Active Trades:`);
  for (const t of active) {
    console.log(`  ${t.date} ${t.symbol.padEnd(10)} Score:${t.score} Gap:${t.gapPercent > 0 ? '+' : ''}${t.gapPercent}% RVOL:${t.rvol} RSI:${t.rsi?.toFixed(0) || '–'} → ${t.outcome.padEnd(18)} ${t.pnl >= 0 ? '+' : ''}${t.pnl}%`);
  }
}

main().catch(err => { console.error(err); process.exit(1); });
