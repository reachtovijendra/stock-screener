/**
 * Core backtesting simulation engine.
 * Simulates daily pick selection and trade outcomes over historical data.
 */

import { HistoricalData, loadCachedData } from './fetch-data';
import { buildVirtualQuote, getDayOHLC, VirtualQuote, VirtualTechnicals } from './virtual-quote';
import { evaluateTrade, TradeResult, TradeOutcome } from './evaluate-trade';
import { ModelDefinition, ScoredPick } from './models';

export interface SimulatedTrade {
  date: string;
  dayIndex: number;
  symbol: string;
  score: number;
  setupType: string;
  signals: string[];
  entryTrigger: number;
  buyPrice: number;
  sellPrice: number;
  stopLoss: number;
  rewardRiskRatio: number;
  // Actual day data
  dayOpen: number;
  dayHigh: number;
  dayLow: number;
  dayClose: number;
  gapPercent: number;    // open vs prev close
  prevChangePercent: number;
  // Result
  outcome: TradeOutcome;
  pnlPercent: number;
  entryPrice: number;
  exitPrice: number;
}

export interface BacktestConfig {
  market: 'US' | 'IN';
  symbols: string[];
  indexSymbol: string;       // ^GSPC or ^NSEI
  maxCandidates: number;     // quick-score top N for full scoring (50)
  maxPicks: number;          // final picks per day (5)
  minScore: number;          // minimum full score to qualify (40)
  maxPerSector: number;      // sector limit (2)
  startDayOffset?: number;   // start from this bar index (default: 201)
  verbose?: boolean;
}

/**
 * Run the backtest for a single model over the full date range.
 */
export function runBacktest(
  model: ModelDefinition,
  allData: Map<string, HistoricalData>,
  config: BacktestConfig
): SimulatedTrade[] {
  const indexData = allData.get(config.indexSymbol);
  if (!indexData || indexData.bars.length < 210) {
    console.error(`Missing or insufficient index data for ${config.indexSymbol}`);
    return [];
  }

  // Find common date range — use index as reference
  const indexBars = indexData.bars;
  const startIdx = config.startDayOffset || 201;
  const trades: SimulatedTrade[] = [];

  // Model G blacklist (2-day rolling blacklist of stopped-out symbols)
  const isModelG = model.shortName === 'G:Cmb+NRL';
  const recentStopOuts: Map<string, number> = new Map(); // symbol -> dayIndex of stop-out

  for (let dayIdx = startIdx; dayIdx < indexBars.length; dayIdx++) {
    const dayTimestamp = indexBars[dayIdx].timestamp;
    const dateStr = new Date(dayTimestamp * 1000).toISOString().slice(0, 10);

    // Index data for this day
    const idxPrevClose = indexBars[dayIdx - 1].close;
    const idxPrevPrevClose = indexBars[dayIdx - 2].close;
    const indexChangePercent = ((idxPrevClose - idxPrevPrevClose) / idxPrevPrevClose) * 100;

    // 5-day index closes for multi-day trend models
    const indexCloses5d: number[] = [];
    for (let k = Math.max(0, dayIdx - 5); k < dayIdx; k++) {
      indexCloses5d.push(indexBars[k].close);
    }

    // --- Pass 1: Quick score all symbols ---
    const quickScored: { symbol: string; qs: number; data: HistoricalData }[] = [];

    for (const symbol of config.symbols) {
      const symData = allData.get(symbol);
      if (!symData || dayIdx >= symData.bars.length) continue;

      // Build virtual quote for quick scoring
      const virtual = buildVirtualQuote(symbol, symData.bars, dayIdx, config.market);
      if (!virtual) continue;

      // Model G: skip recently stopped-out symbols
      if (isModelG) {
        const lastStopDay = recentStopOuts.get(symbol);
        if (lastStopDay != null && dayIdx - lastStopDay <= 2) continue;
      }

      const qs = model.quickScore(virtual.quote);
      quickScored.push({ symbol, qs, data: symData });
    }

    quickScored.sort((a, b) => b.qs - a.qs);
    const candidates = quickScored.slice(0, config.maxCandidates);

    // --- Pass 2: Full score top candidates ---
    const fullScored: ScoredPick[] = [];

    for (const { symbol, data } of candidates) {
      const virtual = buildVirtualQuote(symbol, data.bars, dayIdx, config.market);
      if (!virtual) continue;

      const pick = model.fullScore(virtual.quote, virtual.tech, indexChangePercent, indexCloses5d);
      if (pick && pick.score >= config.minScore) {
        fullScored.push(pick);
      }
    }

    fullScored.sort((a, b) => b.score - a.score);

    // --- Sector limit ---
    const sectorCount: Record<string, number> = {};
    const diversified: ScoredPick[] = [];
    for (const pick of fullScored) {
      const sector = pick.quote.sector || 'Unknown';
      const count = sectorCount[sector] || 0;
      if (count < config.maxPerSector) {
        diversified.push(pick);
        sectorCount[sector] = count + 1;
      }
    }

    const finalPicks = diversified.slice(0, config.maxPicks);

    // --- Evaluate each pick against actual day D OHLC ---
    for (const pick of finalPicks) {
      const symData = allData.get(pick.symbol);
      if (!symData) continue;

      const dayOHLC = getDayOHLC(symData.bars, dayIdx);
      if (!dayOHLC) continue;

      const gapPercent = pick.quote.price > 0
        ? ((dayOHLC.open - pick.quote.price) / pick.quote.price) * 100 : 0;

      const tradeResult = evaluateTrade(
        pick.entryTrigger,
        pick.buyPrice,
        pick.sellPrice,
        pick.stopLoss,
        dayOHLC.open,
        dayOHLC.high,
        dayOHLC.low,
        dayOHLC.close
      );

      const trade: SimulatedTrade = {
        date: dateStr,
        dayIndex: dayIdx,
        symbol: pick.symbol,
        score: pick.score,
        setupType: pick.setupType,
        signals: pick.signals,
        entryTrigger: pick.entryTrigger,
        buyPrice: pick.buyPrice,
        sellPrice: pick.sellPrice,
        stopLoss: pick.stopLoss,
        rewardRiskRatio: pick.rewardRiskRatio,
        dayOpen: dayOHLC.open,
        dayHigh: dayOHLC.high,
        dayLow: dayOHLC.low,
        dayClose: dayOHLC.close,
        gapPercent: Math.round(gapPercent * 100) / 100,
        prevChangePercent: Math.round(pick.quote.changePercent * 100) / 100,
        outcome: tradeResult.outcome,
        pnlPercent: tradeResult.pnlPercent,
        entryPrice: tradeResult.entryPrice,
        exitPrice: tradeResult.exitPrice,
      };

      trades.push(trade);

      // Update Model G blacklist
      if (isModelG && (tradeResult.outcome === 'hit-sl' || tradeResult.outcome === 'gap-below-stop')) {
        recentStopOuts.set(pick.symbol, dayIdx);
      }
    }

    if (config.verbose && dayIdx % 20 === 0) {
      console.log(`  [${model.shortName}] Day ${dayIdx}/${indexBars.length - 1} (${dateStr}) — ${finalPicks.length} picks, ${trades.filter(t => t.dayIndex === dayIdx).length} trades`);
    }
  }

  return trades;
}

/**
 * Load all cached data into memory.
 */
export function loadAllData(symbols: string[]): Map<string, HistoricalData> {
  const allData = new Map<string, HistoricalData>();
  let loaded = 0;
  let missing = 0;

  for (const symbol of symbols) {
    const data = loadCachedData(symbol);
    if (data && data.bars.length > 0) {
      allData.set(symbol, data);
      loaded++;
    } else {
      missing++;
    }
  }

  console.log(`Loaded ${loaded} symbols, ${missing} missing`);
  return allData;
}
