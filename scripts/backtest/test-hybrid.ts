/**
 * Test the data-driven hybrid model against the backtest data.
 * Uses the actual winning signals from reverse analysis.
 */

import { HistoricalData, loadCachedData, getAllSymbols } from './fetch-data';
import { buildVirtualQuote, getDayOHLC } from './virtual-quote';
import { evaluateTrade, TradeOutcome } from './evaluate-trade';

interface Trade {
  date: string;
  symbol: string;
  score: number;
  signals: string[];
  entryTrigger: number;
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
  outcome: TradeOutcome;
  pnl: number;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

async function main() {
  const { us, india } = getAllSymbols();
  const marketArg = process.argv.includes('IN') ? 'IN' : 'US';
  const symbols = marketArg === 'US' ? us : india;
  const indexSymbol = marketArg === 'US' ? '^GSPC' : '^NSEI';

  console.log(`\n${'═'.repeat(90)}`);
  console.log(`HYBRID MODEL BACKTEST: ${marketArg} Market`);
  console.log(`${'═'.repeat(90)}\n`);

  // Load data
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

    // Index trend: 5-day closes
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

    // Skip bearish market days entirely
    if (marketTrend === 'bearish') continue;

    // Score all stocks
    const candidates: {
      symbol: string;
      score: number;
      signals: string[];
      quote: any;
      tech: any;
      data: HistoricalData;
    }[] = [];

    for (const symbol of symbols) {
      const data = allData.get(symbol);
      if (!data || dayIdx >= data.bars.length) continue;

      // Skip recent stop-outs (2-day cooldown)
      const lastStop = recentStopOuts.get(symbol);
      if (lastStop != null && dayIdx - lastStop <= 2) continue;

      const virtual = buildVirtualQuote(symbol, data.bars, dayIdx, marketArg as 'US' | 'IN');
      if (!virtual) continue;

      const { quote: q, tech } = virtual;
      const todayOpen = data.bars[dayIdx].open;
      const prevClose = q.price;
      const gapPercent = prevClose > 0 ? ((todayOpen - prevClose) / prevClose) * 100 : 0;

      // ═══════════════════════════════════════════════════════════
      // HARD FILTERS — must pass ALL (from reverse analysis data)
      // ═══════════════════════════════════════════════════════════

      // Filter 1: Gap must be UP or flat (NEVER gap down)
      if (gapPercent < -0.3) continue;

      // Filter 2: Must be above at least 50 DMA
      if (!q.fiftyDayMA || prevClose <= q.fiftyDayMA) continue;

      // Filter 3: RVOL must be >= 1.0
      if (q.relativeVolume < 1.0) continue;

      // ═══════════════════════════════════════════════════════════
      // SCORING — data-driven weights
      // ═══════════════════════════════════════════════════════════

      let score = 0;
      const signals: string[] = [];

      // Near 52W high + RVOL > 1.3 + Gap UP → best combo (44.6% win rate)
      const near52w = q.percentFromFiftyTwoWeekHigh > -5;
      if (near52w && q.relativeVolume > 1.3 && gapPercent > 0.3) {
        score += 20;
        signals.push('52W+RVOL+GapUP combo');
      }

      // Prev UP + Gap UP (28% win rate)
      if (q.changePercent > 0.5 && gapPercent > 0.3) {
        score += 15;
        signals.push(`Continuation (prev +${q.changePercent.toFixed(1)}%, gap +${gapPercent.toFixed(1)}%)`);
      }

      // MACD bullish (10.7% vs 7.8% bearish)
      if (tech.macdHistogram != null && tech.macdHistogram > 0) {
        score += 10;
        signals.push('MACD Bullish');
      }

      // RSI 55-75 (best range from data: 60-70 = 14.8%)
      if (tech.rsi != null && tech.rsi >= 55 && tech.rsi <= 75) {
        score += 10;
        signals.push(`RSI ${tech.rsi.toFixed(0)}`);
      }

      // Above both DMAs (10.9% vs 7.3%)
      if (q.twoHundredDayMA && prevClose > q.twoHundredDayMA) {
        score += 8;
        signals.push('Above both DMAs');
      }

      // RVOL 1.3-2.0 (21.6% win rate — the sweet spot)
      if (q.relativeVolume >= 1.3 && q.relativeVolume <= 2.0) {
        score += 8;
        signals.push(`RVOL ${q.relativeVolume.toFixed(1)}x`);
      } else if (q.relativeVolume > 2.0) {
        score += 5;
        signals.push(`RVOL ${q.relativeVolume.toFixed(1)}x (high)`);
      }

      // Near 52W high (11.9% vs 8.0%)
      if (near52w) {
        score += 5;
        signals.push('Near 52W high');
      }

      // Tight consolidation
      if (tech.consolidationTightness != null && tech.consolidationTightness < 2.5) {
        score += 5;
        signals.push('Tight base');
      }

      // PENALTIES
      if (tech.rsi != null && tech.rsi > 80) {
        score -= 10;
        signals.push('RSI OVERBOUGHT');
      }
      if (tech.macdHistogram != null && tech.macdHistogram < 0) {
        score -= 5;
        signals.push('MACD bearish');
      }

      // Market tailwind bonus
      if (marketTrend === 'bullish') {
        score += 5;
      }

      if (score >= 30) {
        candidates.push({ symbol, score, signals, quote: q, tech, data });
      }
    }

    // Sort by score, sector limit (max 2), top 5
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

    // Evaluate each pick
    for (const pick of picks) {
      const dayOHLC = getDayOHLC(pick.data.bars, dayIdx);
      if (!dayOHLC) continue;

      const prevHigh = pick.data.bars[dayIdx - 1].high;
      const atr = pick.tech.atr || pick.quote.price * 0.015;

      // ENTRY: Breakout of previous day high
      const entryTrigger = prevHigh;
      const buyPrice = entryTrigger;

      // WIDE STOP: 1.5 ATR
      const stopLoss = round2(buyPrice - 1.5 * atr);
      const sellPrice = round2(buyPrice + 1.5 * atr);

      const result = evaluateTrade(
        entryTrigger, buyPrice, sellPrice, stopLoss,
        dayOHLC.open, dayOHLC.high, dayOHLC.low, dayOHLC.close
      );

      const gapPercent = pick.quote.price > 0
        ? round2(((dayOHLC.open - pick.quote.price) / pick.quote.price) * 100) : 0;

      allTrades.push({
        date: dateStr,
        symbol: pick.symbol,
        score: pick.score,
        signals: pick.signals,
        entryTrigger,
        sellPrice,
        stopLoss,
        dayOpen: dayOHLC.open,
        dayHigh: dayOHLC.high,
        dayLow: dayOHLC.low,
        dayClose: dayOHLC.close,
        gapPercent,
        prevChange: round2(pick.quote.changePercent),
        rsi: pick.tech.rsi,
        rvol: round2(pick.quote.relativeVolume),
        outcome: result.outcome,
        pnl: result.pnlPercent,
      });

      if (result.outcome === 'hit-sl' || result.outcome === 'gap-below-stop') {
        recentStopOuts.set(pick.symbol, dayIdx);
      }
    }
  }

  // ═══════════════════════════════════════════════════════════
  // RESULTS
  // ═══════════════════════════════════════════════════════════

  const active = allTrades.filter(t => t.outcome !== 'no-trigger');
  const wins = active.filter(t => t.outcome === 'hit-target');
  const losses = active.filter(t => t.outcome === 'hit-sl' || t.outcome === 'gap-below-stop');
  const flat = active.filter(t => t.outcome === 'closed-flat');
  const noTrigger = allTrades.filter(t => t.outcome === 'no-trigger');

  const decisionTrades = wins.length + losses.length;
  const winRate = decisionTrades > 0 ? (wins.length / decisionTrades) * 100 : 0;
  const avgPnl = active.length > 0 ? active.reduce((a, t) => a + t.pnl, 0) / active.length : 0;
  const totalPnl = active.reduce((a, t) => a + t.pnl, 0);
  const avgWin = wins.length > 0 ? wins.reduce((a, t) => a + t.pnl, 0) / wins.length : 0;
  const avgLoss = losses.length > 0 ? losses.reduce((a, t) => a + t.pnl, 0) / losses.length : 0;

  // Max drawdown
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
  console.log('HYBRID MODEL RESULTS');
  console.log(`${'═'.repeat(90)}`);
  console.log(`Trading days:    ${uniqueDays.size}`);
  console.log(`Total trades:    ${allTrades.length} (${active.length} active, ${noTrigger.length} no-trigger)`);
  console.log(`Wins:            ${wins.length}`);
  console.log(`Losses:          ${losses.length}`);
  console.log(`Closed flat:     ${flat.length}`);
  console.log(`Win rate:        ${winRate.toFixed(1)}%`);
  console.log(`Avg P&L:         ${avgPnl >= 0 ? '+' : ''}${avgPnl.toFixed(2)}%`);
  console.log(`Avg Win:         +${avgWin.toFixed(2)}%`);
  console.log(`Avg Loss:        ${avgLoss.toFixed(2)}%`);
  console.log(`Total P&L:       ${totalPnl >= 0 ? '+' : ''}${totalPnl.toFixed(1)}%`);
  console.log(`Max Drawdown:    -${maxDD.toFixed(1)}%`);
  console.log(`Profit Factor:   ${profitFactor.toFixed(2)}`);
  console.log(`Avg picks/day:   ${(allTrades.length / uniqueDays.size).toFixed(1)}`);

  // Outcome breakdown
  console.log(`\nOutcome Breakdown:`);
  const outcomes: Record<string, number> = {};
  for (const t of allTrades) { outcomes[t.outcome] = (outcomes[t.outcome] || 0) + 1; }
  for (const [o, c] of Object.entries(outcomes)) {
    console.log(`  ${o.padEnd(20)} ${c}`);
  }

  // Best trades
  console.log(`\nTop 10 Winning Trades:`);
  const topWins = [...wins].sort((a, b) => b.pnl - a.pnl).slice(0, 10);
  for (const t of topWins) {
    console.log(`  ${t.date} ${t.symbol.padEnd(10)} Score:${t.score} Gap:+${t.gapPercent}% RVOL:${t.rvol}x RSI:${t.rsi?.toFixed(0) || '–'} → +${t.pnl}%`);
  }

  // Worst trades
  console.log(`\nTop 10 Losing Trades:`);
  const topLosses = [...losses].sort((a, b) => a.pnl - b.pnl).slice(0, 10);
  for (const t of topLosses) {
    console.log(`  ${t.date} ${t.symbol.padEnd(10)} Score:${t.score} Gap:${t.gapPercent > 0 ? '+' : ''}${t.gapPercent}% RVOL:${t.rvol}x RSI:${t.rsi?.toFixed(0) || '–'} → ${t.pnl}%`);
  }

  // Daily P&L curve (last 20 trading days)
  const dailyPnl = new Map<string, number[]>();
  for (const t of active) {
    if (!dailyPnl.has(t.date)) dailyPnl.set(t.date, []);
    dailyPnl.get(t.date)!.push(t.pnl);
  }
  const sortedDays = [...dailyPnl.keys()].sort().slice(-20);
  console.log(`\nDaily P&L (last 20 days):`);
  let runningPnl = 0;
  for (const day of sortedDays) {
    const pnls = dailyPnl.get(day)!;
    const dayTotal = pnls.reduce((a, b) => a + b, 0);
    runningPnl += dayTotal;
    const bar = dayTotal >= 0
      ? '█'.repeat(Math.min(30, Math.round(dayTotal * 5)))
      : '░'.repeat(Math.min(30, Math.round(Math.abs(dayTotal) * 5)));
    console.log(`  ${day}  ${dayTotal >= 0 ? '+' : ''}${dayTotal.toFixed(2)}%  ${dayTotal >= 0 ? '🟢' : '🔴'} ${bar}  (cum: ${runningPnl >= 0 ? '+' : ''}${runningPnl.toFixed(1)}%)`);
  }
}

main().catch(err => { console.error(err); process.exit(1); });
