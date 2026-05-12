import type { VercelRequest, VercelResponse } from '@vercel/node';
import { fetchScreenerStocks, Market, StockQuote } from '../yahoo-client';
import {
  enrichStockWithPerformance,
  PerformanceFields,
  selectTopMovers,
  TopMoverPeriod,
  TopMoverType,
} from '../stock-performance';

type MoverStock = StockQuote & Partial<PerformanceFields>;

const MOVERS_CONCURRENCY = 8;

function getMinimumMarketCap(market: Market): number {
  return market === 'IN' ? 83_000_000_000 : 1_000_000_000;
}

function isMoverType(value: string): value is TopMoverType {
  return value === 'gainers' || value === 'losers';
}

function isMoverPeriod(value: string): value is TopMoverPeriod {
  return value === '1d' || value === '1m' || value === '1y';
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown error';
}

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let nextIndex = 0;

  async function runWorker(): Promise<void> {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex++;
      results[currentIndex] = await worker(items[currentIndex], currentIndex);
    }
  }

  const workerCount = Math.min(limit, items.length);
  await Promise.all(Array.from({ length: workerCount }, runWorker));
  return results;
}

export async function handleTopMovers(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const requestedType = ((req.query.type as string) || 'gainers').toLowerCase();
  const requestedPeriod = ((req.query.period as string) || '1d').toLowerCase();

  if (!isMoverType(requestedType)) {
    return res.status(400).json({ error: 'Invalid movers type. Use gainers or losers.' });
  }

  if (!isMoverPeriod(requestedPeriod)) {
    return res.status(400).json({ error: 'Invalid movers period. Use 1d, 1m, or 1y.' });
  }

  try {
    const market = ((req.query.market as string) || 'US').toUpperCase() as Market;
    const minMarketCap = getMinimumMarketCap(market);
    const startTime = Date.now();

    const universe = await fetchScreenerStocks(market, {
      marketCap: {
        mode: 'custom',
        categories: [],
        customRange: { min: minMarketCap },
      },
    });

    const eligibleUniverse = universe.filter(stock =>
      stock.price > 0 && (stock.marketCap ?? 0) >= minMarketCap
    );

    const stocksToRank: MoverStock[] = requestedPeriod === '1d'
      ? eligibleUniverse
      : await mapWithConcurrency(eligibleUniverse, MOVERS_CONCURRENCY, async stock => {
        try {
          return await enrichStockWithPerformance({ ...stock }) as MoverStock;
        } catch {
          return stock as MoverStock;
        }
      });

    const stocks = selectTopMovers(stocksToRank, requestedType, requestedPeriod, minMarketCap);

    return res.status(200).json({
      stocks,
      totalCount: stocks.length,
      universeCount: eligibleUniverse.length,
      executionTimeMs: Date.now() - startTime,
      quickView: requestedType === 'gainers' ? 'top-gainers' : 'top-losers',
      criteria: {
        minMarketCap,
        type: requestedType,
        period: requestedPeriod,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error: unknown) {
    console.error('Top movers API error:', error);
    return res.status(200).json({
      stocks: [],
      totalCount: 0,
      universeCount: 0,
      executionTimeMs: 0,
      error: 'Top movers scan failed - Yahoo Finance may be temporarily unavailable',
      message: getErrorMessage(error),
      quickView: requestedType === 'gainers' ? 'top-gainers' : 'top-losers',
      timestamp: new Date().toISOString(),
    });
  }
}
