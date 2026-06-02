import type { VercelRequest, VercelResponse } from '@vercel/node';
import { fetchPennyUniverse, StockQuote } from '../yahoo-client';
import { enrichStockWithPerformance } from '../stock-performance';
import { getCompanyNews, getRecommendationTrend, isFinnhubConfigured } from '../finnhub-client';
import { detectCatalysts } from '../penny-catalyst';
import {
  preScorePenny,
  scorePennyHit,
  passesPennyGates,
  passesLiveGates,
  PennyEnrichment,
  EMPTY_ENRICHMENT,
  PennyHit,
} from '../penny-hits-scorer';

/**
 * Live Penny Hits (two-stage funnel).
 *   Stage 1 (Yahoo, broad): universe -> gates -> live score -> perf-enrich -> shortlist.
 *   Stage 2 (Finnhub, narrow): news catalysts + recommendation trend on the
 *     shortlist only -> sentiment filter -> blended score -> top picks.
 * Results are cached in memory for a few minutes (single-flight) so the Finnhub
 * cost is paid once per window, and Stage 2 degrades gracefully to a Yahoo-only
 * list when Finnhub is unconfigured or errors.
 *
 * GET /api/stocks?action=penny-hits&market=US
 */

const PERF_POOL = 40;          // candidates enriched with historical performance
const SHORTLIST = 20;          // names sent to Finnhub
const FINAL_PICKS = 15;        // names returned
const PERF_CONCURRENCY = 8;
const FINNHUB_CONCURRENCY = 5;
const CACHE_TTL_MS = 4 * 60 * 1000;

interface CacheEntry {
  date: string;
  ts: number;
  payload: any;
  promise: Promise<any> | null;
}
const cache = new Map<string, CacheEntry>();

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  async function run(): Promise<void> {
    while (next < items.length) {
      const i = next++;
      results[i] = await worker(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, run));
  return results;
}

function toRow(p: PennyHit, pickDate: string, index: number) {
  return {
    id: index + 1,
    market: 'US',
    pick_date: pickDate,
    symbol: p.symbol,
    name: p.name,
    sector: p.sector || null,
    industry: p.industry || null,
    market_cap: p.marketCap || null,
    price: p.price,
    score: p.score,
    catalysts: p.catalysts,
    thesis: p.thesis,
    target_mean_price: p.targetMeanPrice,
    upside_percent: p.upsidePercent,
    recommendation_mean: p.recommendationMean,
    num_analysts: p.numAnalysts,
    insider_net_shares: null,
    insider_net_value: null,
    relative_volume: p.relativeVolume,
    one_month_change_percent: p.oneMonthChangePercent,
    change_percent: p.changePercent,
  };
}

async function runLiveScan(market: string): Promise<any> {
  const today = new Date().toISOString().slice(0, 10);

  // --- Stage 1: broad Yahoo scan -> shortlist ---
  const universe = await fetchPennyUniverse(market as any);
  const eligible = universe.filter(s => passesPennyGates(s) && passesLiveGates(s));

  const ranked = [...eligible].sort((a, b) => preScorePenny(b) - preScorePenny(a));
  const pool = ranked.slice(0, PERF_POOL);

  const withPerf = await mapWithConcurrency(pool, PERF_CONCURRENCY, async stock => {
    try {
      return (await enrichStockWithPerformance({ ...stock })) as StockQuote;
    } catch {
      return stock;
    }
  });

  // Re-rank with performance-aware trend/anti-chase, then take the shortlist.
  const shortlist = [...withPerf].sort((a, b) => preScorePenny(b) - preScorePenny(a)).slice(0, SHORTLIST);

  // --- Stage 2: Finnhub enrichment on the shortlist only ---
  const finnhubOn = isFinnhubConfigured();
  let hits: PennyHit[];

  if (finnhubOn) {
    try {
      const enriched = await mapWithConcurrency(shortlist, FINNHUB_CONCURRENCY, async stock => {
        let enrichment: PennyEnrichment = { ...EMPTY_ENRICHMENT };
        try {
          const [news, recTrend] = await Promise.all([
            getCompanyNews(stock.symbol, 14),
            getRecommendationTrend(stock.symbol),
          ]);
          const cat = detectCatalysts(news);
          enrichment = {
            catalysts: cat.catalysts,
            catalystStrength: cat.strength,
            articleCount: cat.articleCount,
            negativeCount: cat.negativeCount,
            negativeDominant: cat.negativeDominant,
            recTrend,
          };
        } catch (err: any) {
          console.warn(`[PennyHits] Stage 2 enrichment failed for ${stock.symbol}:`, err?.message ?? err);
        }
        return { stock, enrichment };
      });

      hits = enriched
        // Drop names whose recent news is dominated by bad news.
        .filter(e => !e.enrichment.negativeDominant)
        .map(e => scorePennyHit(e.stock, e.enrichment));
    } catch (err: any) {
      console.warn('[PennyHits] Stage 2 failed; falling back to Yahoo-only list:', err?.message ?? err);
      hits = shortlist.map(s => scorePennyHit(s));
    }
  } else {
    hits = shortlist.map(s => scorePennyHit(s));
  }

  const picks = hits.sort((a, b) => b.score - a.score).slice(0, FINAL_PICKS);

  return {
    market,
    date: today,
    count: picks.length,
    picks: picks.map((p, i) => toRow(p, today, i)),
    source: finnhubOn ? 'live' : 'live-yahoo-only',
  };
}

export async function handlePennyHits(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const market = ((req.query.market as string) || 'US').toUpperCase();

  try {
    const now = Date.now();
    const today = new Date().toISOString().slice(0, 10);
    const cached = cache.get(market);

    if (cached && cached.date === today && cached.payload && now - cached.ts < CACHE_TTL_MS) {
      return res.status(200).json(cached.payload);
    }
    if (cached && cached.promise && cached.date === today) {
      const payload = await cached.promise;
      return res.status(200).json(payload);
    }

    const promise = runLiveScan(market);
    cache.set(market, { date: today, ts: now, payload: null, promise });

    const payload = await promise;
    cache.set(market, { date: today, ts: Date.now(), payload, promise: null });

    return res.status(200).json(payload);
  } catch (err: any) {
    console.error('[PennyHits] Live scan error:', err?.message ?? err);
    cache.delete(market);
    return res.status(500).json({ error: 'Failed to fetch penny hits', message: err?.message ?? String(err) });
  }
}
