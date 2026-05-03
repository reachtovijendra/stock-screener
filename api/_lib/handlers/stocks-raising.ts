import type { VercelRequest, VercelResponse } from '@vercel/node';
import { fetchScreenerStocks, Market, StockQuote } from '../yahoo-client';
import { enrichStockWithPerformance, isRaisingStock, PerformanceFields } from '../stock-performance';

type RaisingStock = StockQuote & PerformanceFields;

const RAISING_CONCURRENCY = 8;

function getMinimumMarketCap(market: Market): number {
  return market === 'IN' ? 83_000_000_000 : 1_000_000_000;
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

export async function handleRaisingStocks(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
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

    const enriched = await mapWithConcurrency(eligibleUniverse, RAISING_CONCURRENCY, async stock => {
      try {
        return await enrichStockWithPerformance({ ...stock }) as RaisingStock;
      } catch {
        return stock as RaisingStock;
      }
    });

    const stocks = enriched
      .filter(stock => isRaisingStock(stock, minMarketCap))
      .sort((a, b) => (b.oneMonthChangePercent ?? -Infinity) - (a.oneMonthChangePercent ?? -Infinity));

    return res.status(200).json({
      stocks,
      totalCount: stocks.length,
      universeCount: eligibleUniverse.length,
      executionTimeMs: Date.now() - startTime,
      quickView: 'raising-stocks',
      criteria: {
        minMarketCap,
        oneMonthPositive: true,
        sequence: ['1M', '3M', '6M', '1Y'],
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('Raising stocks API error:', error);
    return res.status(200).json({
      stocks: [],
      totalCount: 0,
      universeCount: 0,
      executionTimeMs: 0,
      error: 'Raising stocks scan failed - Yahoo Finance may be temporarily unavailable',
      message: error.message,
      quickView: 'raising-stocks',
      timestamp: new Date().toISOString(),
    });
  }
}
