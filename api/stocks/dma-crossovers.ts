/**
 * DMA Crossover API
 *
 * Fetches 5 years of daily price data for a given stock symbol,
 * computes rolling 50-day and 200-day SMAs, and detects all
 * golden cross and death cross events within the last 3 years.
 *
 * Query params:
 *   symbol - Stock ticker (e.g., TQQQ, AAPL, RELIANCE.NS)
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import https from 'https';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function httpsRequest(options: https.RequestOptions): Promise<{ statusCode: number; body: string }> {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk: Buffer) => (data += chunk.toString()));
      res.on('end', () => {
        resolve({ statusCode: res.statusCode || 500, body: data });
      });
    });
    req.on('error', reject);
    req.setTimeout(20000, () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });
    req.end();
  });
}

function rollingSMA(closes: number[], period: number): (number | null)[] {
  const sma: (number | null)[] = new Array(closes.length).fill(null);
  for (let i = period - 1; i < closes.length; i++) {
    let sum = 0;
    for (let j = i - period + 1; j <= i; j++) {
      sum += closes[j];
    }
    sma[i] = Math.round((sum / period) * 100) / 100;
  }
  return sma;
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const symbol = (req.query.symbol as string || '').trim().toUpperCase();

  if (!symbol) {
    return res.status(400).json({ error: 'symbol query parameter is required' });
  }

  try {
    console.log(`[DMA] Fetching 5y daily data for ${symbol}...`);

    const response = await httpsRequest({
      hostname: 'query1.finance.yahoo.com',
      port: 443,
      path: `/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=5y`,
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': '*/*',
      },
    });

    if (response.statusCode !== 200) {
      console.error(`[DMA] Yahoo API returned ${response.statusCode} for ${symbol}`);
      return res.status(502).json({ error: `Failed to fetch data for ${symbol}` });
    }

    const data = JSON.parse(response.body);
    const result = data.chart?.result?.[0];

    if (!result?.timestamp || !result?.indicators?.quote?.[0]?.close) {
      return res.status(404).json({ error: `No price data found for ${symbol}` });
    }

    const timestamps: number[] = result.timestamp;
    const rawCloses: (number | null)[] = result.indicators.quote[0].close;

    // Filter out null values, keeping timestamp-close pairs
    const validDays: { timestamp: number; close: number }[] = [];
    for (let i = 0; i < timestamps.length; i++) {
      if (rawCloses[i] != null) {
        validDays.push({ timestamp: timestamps[i], close: rawCloses[i] as number });
      }
    }

    if (validDays.length < 200) {
      return res.status(400).json({
        error: `Insufficient data for ${symbol}. Need at least 200 trading days, got ${validDays.length}.`,
      });
    }

    console.log(`[DMA] ${symbol}: ${validDays.length} valid trading days`);

    // Compute rolling SMAs
    const allCloses = validDays.map((d) => d.close);
    const sma50 = rollingSMA(allCloses, 50);
    const sma200 = rollingSMA(allCloses, 200);

    // 3-year cutoff
    const now = Date.now();
    const threeYearsMs = 3 * 365.25 * 24 * 60 * 60 * 1000;
    const cutoff = now - threeYearsMs;

    // Detect crossovers
    const crossovers: {
      date: string;
      type: 'golden_cross' | 'death_cross';
      sma50: number;
      sma200: number;
      close: number;
    }[] = [];

    for (let i = 1; i < validDays.length; i++) {
      if (sma50[i] == null || sma200[i] == null || sma50[i - 1] == null || sma200[i - 1] == null) {
        continue;
      }

      const dateMs = validDays[i].timestamp * 1000;
      if (dateMs < cutoff) continue;

      const prev50 = sma50[i - 1]!;
      const prev200 = sma200[i - 1]!;
      const curr50 = sma50[i]!;
      const curr200 = sma200[i]!;

      // Golden cross: 50 DMA crosses above 200 DMA
      if (prev50 <= prev200 && curr50 > curr200) {
        crossovers.push({
          date: new Date(dateMs).toISOString().slice(0, 10),
          type: 'golden_cross',
          sma50: curr50,
          sma200: curr200,
          close: validDays[i].close,
        });
      }

      // Death cross: 50 DMA crosses below 200 DMA
      if (prev50 >= prev200 && curr50 < curr200) {
        crossovers.push({
          date: new Date(dateMs).toISOString().slice(0, 10),
          type: 'death_cross',
          sma50: curr50,
          sma200: curr200,
          close: validDays[i].close,
        });
      }
    }

    // Current state
    const lastIdx = validDays.length - 1;
    const currentSMA50 = sma50[lastIdx];
    const currentSMA200 = sma200[lastIdx];
    const currentClose = validDays[lastIdx].close;
    const currentDate = new Date(validDays[lastIdx].timestamp * 1000).toISOString().slice(0, 10);
    let currentState: 'golden' | 'death' | 'unknown' = 'unknown';
    if (currentSMA50 != null && currentSMA200 != null) {
      currentState = currentSMA50 > currentSMA200 ? 'golden' : 'death';
    }

    console.log(`[DMA] ${symbol}: ${crossovers.length} crossovers found, current state: ${currentState}`);

    return res.status(200).json({
      symbol,
      crossovers,
      currentSMA50,
      currentSMA200,
      currentClose,
      currentDate,
      currentState,
      totalTradingDays: validDays.length,
    });
  } catch (error: any) {
    console.error(`[DMA] Error for ${symbol}:`, error.message);
    return res.status(500).json({ error: `Failed to analyze ${symbol}: ${error.message}` });
  }
}
