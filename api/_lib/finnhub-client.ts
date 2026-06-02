/**
 * Finnhub API client (free tier).
 *
 * Powers the real catalyst / insider / analyst-trend signals for Penny Hits.
 * Free tier allows ~60 calls/min, so a lightweight in-process rate limiter
 * keeps us safely under the cap. All functions degrade gracefully (return
 * empty/null) when FINNHUB_API_KEY is not configured or a request fails, so
 * callers never throw on missing data.
 *
 * Endpoints used (all available on the free tier):
 *   - GET /company-news
 *   - GET /stock/insider-transactions
 *   - GET /stock/recommendation
 */

const FINNHUB_BASE = 'https://finnhub.io/api/v1';

// Stay safely under the 60 calls/min free-tier limit.
const MAX_CALLS_PER_MINUTE = 55;
const RATE_WINDOW_MS = 60_000;

let callTimestamps: number[] = [];

export interface FinnhubNewsItem {
  category: string;
  datetime: number; // unix seconds
  headline: string;
  id: number;
  related: string;
  source: string;
  summary: string;
  url: string;
}

export interface FinnhubInsiderTransaction {
  name: string;
  share: number;
  change: number; // positive = acquisition, negative = disposal
  filingDate: string;
  transactionDate: string;
  transactionCode: string; // 'P' = purchase, 'S' = sale, etc.
  transactionPrice: number;
}

export interface FinnhubRecommendation {
  buy: number;
  hold: number;
  sell: number;
  strongBuy: number;
  strongSell: number;
  period: string; // YYYY-MM-DD
  symbol: string;
}

export interface InsiderSummary {
  /** Net shares acquired minus disposed over the lookback window. */
  netShares: number;
  /** Count of distinct purchase (code 'P') transactions. */
  buyCount: number;
  /** Count of distinct sale (code 'S') transactions. */
  sellCount: number;
  /** Approximate net USD value of buys minus sells. */
  netValue: number;
}

export interface RecommendationTrendSummary {
  /** Latest period's strong-buy + buy count. */
  bullishCount: number;
  /** Latest period's total analyst count. */
  totalCount: number;
  /** True when strong-buy count rose vs the prior period. */
  strongBuyRising: boolean;
  /** Weighted mean on Yahoo's 1 (Strong Buy) - 5 (Strong Sell) scale, or null when no analysts. */
  recommendationMean: number | null;
}

export function isFinnhubConfigured(): boolean {
  return !!process.env.FINNHUB_API_KEY;
}

/**
 * Simple sliding-window rate limiter. Waits until a call slot is available.
 */
async function throttle(): Promise<void> {
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const now = Date.now();
    callTimestamps = callTimestamps.filter(t => now - t < RATE_WINDOW_MS);
    if (callTimestamps.length < MAX_CALLS_PER_MINUTE) {
      callTimestamps.push(now);
      return;
    }
    const oldest = callTimestamps[0];
    const waitMs = RATE_WINDOW_MS - (now - oldest) + 50;
    await new Promise(resolve => setTimeout(resolve, Math.max(waitMs, 50)));
  }
}

async function finnhubGet<T>(path: string, params: Record<string, string>): Promise<T | null> {
  const token = process.env.FINNHUB_API_KEY;
  if (!token) return null;

  await throttle();

  const query = new URLSearchParams({ ...params, token }).toString();
  const url = `${FINNHUB_BASE}${path}?${query}`;

  try {
    const response = await fetch(url, {
      headers: { 'Accept': 'application/json' },
    });
    if (!response.ok) {
      console.warn(`[Finnhub] ${path} returned ${response.status}`);
      return null;
    }
    return (await response.json()) as T;
  } catch (err: any) {
    console.warn(`[Finnhub] ${path} request failed:`, err?.message ?? err);
    return null;
  }
}

function formatDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Fetch recent company news headlines for a symbol within the last `days` days.
 */
export async function getCompanyNews(symbol: string, days = 14): Promise<FinnhubNewsItem[]> {
  const to = new Date();
  const from = new Date(to.getTime() - days * 24 * 60 * 60 * 1000);
  const data = await finnhubGet<FinnhubNewsItem[]>('/company-news', {
    symbol,
    from: formatDate(from),
    to: formatDate(to),
  });
  return Array.isArray(data) ? data : [];
}

/**
 * Fetch and summarise insider transactions over the last `days` days.
 */
export async function getInsiderSummary(symbol: string, days = 90): Promise<InsiderSummary> {
  const empty: InsiderSummary = { netShares: 0, buyCount: 0, sellCount: 0, netValue: 0 };
  const data = await finnhubGet<{ data?: FinnhubInsiderTransaction[] }>('/stock/insider-transactions', { symbol });
  const txns = data?.data;
  if (!Array.isArray(txns) || txns.length === 0) return empty;

  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  let netShares = 0;
  let buyCount = 0;
  let sellCount = 0;
  let netValue = 0;

  for (const t of txns) {
    const dateStr = t.transactionDate || t.filingDate;
    const ts = dateStr ? Date.parse(dateStr) : NaN;
    if (!Number.isNaN(ts) && ts < cutoff) continue;

    const change = t.change || 0;
    const price = t.transactionPrice || 0;
    netShares += change;
    netValue += change * price;

    const code = (t.transactionCode || '').toUpperCase();
    if (code === 'P' || change > 0) buyCount++;
    else if (code === 'S' || change < 0) sellCount++;
  }

  return { netShares, buyCount, sellCount, netValue };
}

/**
 * Fetch analyst recommendation trends and summarise the latest period.
 */
export async function getRecommendationTrend(symbol: string): Promise<RecommendationTrendSummary | null> {
  const data = await finnhubGet<FinnhubRecommendation[]>('/stock/recommendation', { symbol });
  if (!Array.isArray(data) || data.length === 0) return null;

  // API returns most-recent period first.
  const sorted = [...data].sort((a, b) => (b.period > a.period ? 1 : -1));
  const latest = sorted[0];
  const prior = sorted[1];

  const bullishCount = (latest.strongBuy || 0) + (latest.buy || 0);
  const totalCount =
    (latest.strongBuy || 0) + (latest.buy || 0) + (latest.hold || 0) + (latest.sell || 0) + (latest.strongSell || 0);
  const strongBuyRising = prior ? (latest.strongBuy || 0) > (prior.strongBuy || 0) : false;

  // Weighted mean on the 1 (Strong Buy) - 5 (Strong Sell) scale, matching Yahoo's recommendationMean.
  const recommendationMean =
    totalCount > 0
      ? ((latest.strongBuy || 0) * 1 +
          (latest.buy || 0) * 2 +
          (latest.hold || 0) * 3 +
          (latest.sell || 0) * 4 +
          (latest.strongSell || 0) * 5) /
        totalCount
      : null;

  return { bullishCount, totalCount, strongBuyRising, recommendationMean };
}
