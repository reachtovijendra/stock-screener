/**
 * Backtest CLI entry point.
 *
 * Usage:
 *   npx ts-node scripts/backtest/run.ts --market US --models A,B,F,G --fetch
 *   npx ts-node scripts/backtest/run.ts --market IN --models A,F
 *   npx ts-node scripts/backtest/run.ts --market US --models A,F,G --verbose
 */

import { fetchAndCacheAll, getAllSymbols } from './fetch-data';
import { loadAllData, runBacktest, BacktestConfig } from './engine';
import { computeMetrics, printComparisonTable, ModelMetrics } from './metrics';
import { ALL_MODELS } from './models';

async function main() {
  const args = process.argv.slice(2);
  const getArg = (flag: string): string | null => {
    const idx = args.indexOf(flag);
    return idx >= 0 && idx + 1 < args.length ? args[idx + 1] : null;
  };
  const hasFlag = (flag: string) => args.includes(flag);

  const marketArg = (getArg('--market') || 'US').toUpperCase() as 'US' | 'IN';
  const modelsArg = getArg('--models') || 'A,F,G';
  const doFetch = hasFlag('--fetch');
  const verbose = hasFlag('--verbose');

  const modelKeys = modelsArg.split(',').map(k => k.trim().toUpperCase());
  const { us, india, indices } = getAllSymbols();
  const symbols = marketArg === 'US' ? us : india;
  const indexSymbol = marketArg === 'US' ? '^GSPC' : '^NSEI';

  console.log(`\n${'═'.repeat(60)}`);
  console.log(`BACKTEST: ${marketArg} Market`);
  console.log(`Models: ${modelKeys.join(', ')}`);
  console.log(`Stock universe: ${symbols.length} symbols`);
  console.log(`${'═'.repeat(60)}\n`);

  // --- Phase 1: Fetch data ---
  if (doFetch) {
    console.log('Phase 1: Fetching historical data...');
    const allSymbols = [...symbols, indexSymbol];
    const result = await fetchAndCacheAll(allSymbols);
    console.log(`  Done: ${result.success} cached, ${result.failed.length} failed`);
    if (result.failed.length > 0) {
      console.log(`  Failed symbols: ${result.failed.join(', ')}`);
    }
    console.log('');
  }

  // --- Phase 2: Load cached data ---
  console.log('Phase 2: Loading cached data...');
  const allSymbolsList = [...symbols, indexSymbol];
  const allData = loadAllData(allSymbolsList);
  console.log('');

  // --- Phase 3: Run backtests ---
  const config: BacktestConfig = {
    market: marketArg,
    symbols,
    indexSymbol,
    maxCandidates: 50,
    maxPicks: 5,
    minScore: 40,
    maxPerSector: 2,
    verbose,
  };

  const allMetrics: ModelMetrics[] = [];

  for (const key of modelKeys) {
    const model = ALL_MODELS[key];
    if (!model) {
      console.log(`Unknown model: ${key}. Available: ${Object.keys(ALL_MODELS).join(', ')}`);
      continue;
    }

    console.log(`Phase 3: Running model ${key} (${model.name})...`);
    const startMs = Date.now();

    const trades = runBacktest(model, allData, config);
    const metrics = computeMetrics(model.name, trades);
    allMetrics.push(metrics);

    const elapsed = ((Date.now() - startMs) / 1000).toFixed(1);
    console.log(`  ${metrics.totalTrades} trades in ${metrics.tradingDays} days (${elapsed}s)`);
    console.log(`  Win rate: ${metrics.winRate}%, Avg P&L: ${metrics.avgPnl}%, Total P&L: ${metrics.totalPnl}%\n`);
  }

  // --- Phase 4: Print comparison ---
  printComparisonTable(allMetrics);

  // --- Print worst trades for baseline ---
  const baselineTrades = allMetrics[0];
  if (baselineTrades && modelKeys[0] === 'A') {
    const model = ALL_MODELS['A'];
    const trades = runBacktest(model, allData, config);
    const worstTrades = trades
      .filter(t => t.outcome !== 'no-trigger')
      .sort((a, b) => a.pnlPercent - b.pnlPercent)
      .slice(0, 10);

    console.log('\n10 Worst Trades (Model A):');
    console.log('─'.repeat(90));
    for (const t of worstTrades) {
      console.log(
        `  ${t.date} ${t.symbol.padEnd(10)} Score:${t.score} ` +
        `Prev:${t.prevChangePercent > 0 ? '+' : ''}${t.prevChangePercent}% ` +
        `Gap:${t.gapPercent > 0 ? '+' : ''}${t.gapPercent}% ` +
        `→ ${t.outcome} (${t.pnlPercent > 0 ? '+' : ''}${t.pnlPercent}%)`
      );
    }
  }
}

main().catch(err => {
  console.error('Backtest failed:', err);
  process.exit(1);
});
