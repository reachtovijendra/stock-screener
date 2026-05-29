/**
 * Penny Hits Cron Job
 *
 * Runs daily before US market open. Builds the Penny Hits list:
 *   1. Fetch the penny universe (US, price < $20, liquid) from Yahoo.
 *   2. Cheap pre-score on quote data, keep the top candidates.
 *   3. Enrich top candidates with performance (momentum) + Finnhub
 *      (news catalysts, insider buying, analyst recommendation trend).
 *   4. Compute the weighted Penny Hit score and upsert the top N to Supabase.
 *
 * The /penny-hits page and the Screener quick-view read the cached rows, so
 * page loads are instant and Finnhub rate limits are never hit at request time.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { fetchPennyUniverse, StockQuote } from '../_lib/yahoo-client';
import { enrichStockWithPerformance } from '../_lib/stock-performance';
import { getCompanyNews, getInsiderSummary, getRecommendationTrend, isFinnhubConfigured } from '../_lib/finnhub-client';
import { detectCatalysts } from '../_lib/penny-catalyst';
import {
  preScorePenny,
  scorePennyHit,
  passesPennyGates,
  PennyEnrichment,
  PennyHit,
} from '../_lib/penny-hits-scorer';
import { savePennyHits, PennyHitRow } from '../_lib/supabase-client';

const MAX_ENRICH_CANDIDATES = 50; // capped by Finnhub free-tier rate limit
const MAX_PICKS = 25;
const PERF_CONCURRENCY = 8;

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

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const authHeader = req.headers['authorization'];
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    console.log('[PennyHits] Unauthorized request');
    return res.status(401).json({ error: 'Unauthorized' });
  }

  console.log('[PennyHits] Starting Penny Hits scan...');
  const startTime = Date.now();

  try {
    // --- 1. Fetch penny universe ---
    const universe = await fetchPennyUniverse('US');
    const eligible = universe.filter(s => passesPennyGates(s));
    console.log(`[PennyHits] Universe: ${universe.length} -> ${eligible.length} eligible`);

    // --- 2. Cheap pre-score and keep top candidates ---
    const ranked = [...eligible].sort((a, b) => preScorePenny(b) - preScorePenny(a));
    const candidates = ranked.slice(0, MAX_ENRICH_CANDIDATES);
    console.log(`[PennyHits] Enriching top ${candidates.length} candidates...`);

    // --- 3a. Enrich with performance (momentum) ---
    const withPerf = await mapWithConcurrency(candidates, PERF_CONCURRENCY, async stock => {
      try {
        return await enrichStockWithPerformance({ ...stock }) as StockQuote;
      } catch {
        return stock;
      }
    });

    // --- 3b. Enrich with Finnhub (sequential; client throttles internally) ---
    const finnhubOn = isFinnhubConfigured();
    if (!finnhubOn) {
      console.warn('[PennyHits] FINNHUB_API_KEY not set - scoring with quote data only (catalyst factor = 0)');
    }

    const hits: PennyHit[] = [];
    for (const stock of withPerf) {
      let enrichment: PennyEnrichment = {
        catalysts: [],
        catalystStrength: 0,
        articleCount: 0,
        insider: { netShares: 0, buyCount: 0, sellCount: 0, netValue: 0 },
        recTrend: null,
      };

      if (finnhubOn) {
        try {
          const [news, insider, recTrend] = await Promise.all([
            getCompanyNews(stock.symbol, 14),
            getInsiderSummary(stock.symbol, 90),
            getRecommendationTrend(stock.symbol),
          ]);
          const catalystResult = detectCatalysts(news);
          enrichment = {
            catalysts: catalystResult.catalysts,
            catalystStrength: catalystResult.strength,
            articleCount: catalystResult.articleCount,
            insider,
            recTrend,
          };
        } catch (err: any) {
          console.warn(`[PennyHits] Enrichment failed for ${stock.symbol}:`, err?.message ?? err);
        }
      }

      hits.push(scorePennyHit(stock, enrichment));
    }

    // --- 4. Sort by score, keep top N ---
    const picks = hits.sort((a, b) => b.score - a.score).slice(0, MAX_PICKS);
    console.log(`[PennyHits] Scored ${hits.length}, keeping top ${picks.length}`);

    // --- 5. Save to Supabase ---
    const today = new Date().toISOString().slice(0, 10);
    const rows: PennyHitRow[] = picks.map(p => ({
      market: 'US' as const,
      pick_date: today,
      symbol: p.symbol,
      name: p.name,
      sector: p.sector || null,
      market_cap: p.marketCap || null,
      price: p.price,
      score: p.score,
      catalysts: p.catalysts,
      thesis: p.thesis,
      target_mean_price: p.targetMeanPrice,
      upside_percent: p.upsidePercent,
      recommendation_mean: p.recommendationMean,
      num_analysts: p.numAnalysts,
      insider_net_shares: p.insiderNetShares,
      insider_net_value: p.insiderNetValue,
      relative_volume: p.relativeVolume,
      one_month_change_percent: p.oneMonthChangePercent,
      change_percent: p.changePercent,
    }));

    let saved = 0;
    try {
      saved = await savePennyHits(rows);
      console.log(`[PennyHits] Saved ${saved} picks to Supabase`);
    } catch (err: any) {
      console.error('[PennyHits] Supabase save failed (non-fatal):', err.message);
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`[PennyHits] Completed in ${elapsed}s`);

    return res.status(200).json({
      success: true,
      universeCount: eligible.length,
      enriched: candidates.length,
      picks: picks.length,
      saved,
      finnhub: finnhubOn,
      elapsed: `${elapsed}s`,
    });
  } catch (error: any) {
    console.error('[PennyHits] Fatal error:', error);
    return res.status(500).json({ error: 'Failed to generate penny hits', message: error.message });
  }
}
