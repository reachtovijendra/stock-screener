/**
 * Daily DMA Crossover Alert Cron Job
 *
 * Runs at 8 AM EST (1 PM UTC) on weekdays via Vercel Cron.
 * Scans ~325 US + India stocks for golden cross (50 DMA crosses above 200 DMA)
 * and death cross (50 DMA crosses below 200 DMA) events that occurred on the
 * most recent trading day, then emails the results.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import https from 'https';
import { getStocksToScan } from '../_lib/stock-lists';
import { sendEmail } from '../_lib/brevo-sender';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const RECIPIENTS = [
  'reachtovijendra@gmail.com',
  'poojitha.challagandla@gmail.com',
];
const BATCH_SIZE = 20;
const BATCH_DELAY_MS = 100;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CrossoverHit {
  symbol: string;
  name: string;
  price: number;
  sma50: number;
  sma200: number;
  type: 'golden_cross' | 'death_cross';
  market: string;
}

// ---------------------------------------------------------------------------
// Yahoo Finance helpers
// ---------------------------------------------------------------------------

function httpsRequest(
  options: https.RequestOptions,
  timeout = 10000
): Promise<{ statusCode: number; body: string }> {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk: Buffer) => (data += chunk.toString()));
      res.on('end', () =>
        resolve({ statusCode: res.statusCode || 500, body: data })
      );
    });
    req.on('error', reject);
    req.setTimeout(timeout, () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });
    req.end();
  });
}

// ---------------------------------------------------------------------------
// SMA + crossover detection (adapted from stocks-dma-crossovers handler)
// ---------------------------------------------------------------------------

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

/**
 * Fetch 1 year of daily data and check if the most recent trading day
 * has a golden cross or death cross.
 */
async function checkCrossover(
  symbol: string,
  market: string
): Promise<CrossoverHit | null> {
  try {
    const response = await httpsRequest({
      hostname: 'query1.finance.yahoo.com',
      port: 443,
      path: `/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1y`,
      method: 'GET',
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        Accept: '*/*',
      },
    });

    if (response.statusCode !== 200) return null;

    const data = JSON.parse(response.body);
    const result = data.chart?.result?.[0];
    if (!result?.indicators?.quote?.[0]?.close) return null;

    const rawCloses: (number | null)[] = result.indicators.quote[0].close;
    const closes: number[] = [];
    for (const c of rawCloses) {
      if (c != null) closes.push(c);
    }

    // Need at least 201 days to compute 200-day SMA for the last 2 days
    if (closes.length < 201) return null;

    const sma50 = rollingSMA(closes, 50);
    const sma200 = rollingSMA(closes, 200);

    const lastIdx = closes.length - 1;
    const prevIdx = lastIdx - 1;

    const curr50 = sma50[lastIdx];
    const curr200 = sma200[lastIdx];
    const prev50 = sma50[prevIdx];
    const prev200 = sma200[prevIdx];

    if (
      curr50 == null ||
      curr200 == null ||
      prev50 == null ||
      prev200 == null
    ) {
      return null;
    }

    // Golden cross: 50 SMA was <= 200 SMA yesterday, and > 200 SMA today
    if (prev50 <= prev200 && curr50 > curr200) {
      const meta = result.meta;
      return {
        symbol: meta.symbol || symbol,
        name: meta.shortName || meta.symbol || symbol,
        price: Math.round(closes[lastIdx] * 100) / 100,
        sma50: curr50,
        sma200: curr200,
        type: 'golden_cross',
        market,
      };
    }

    // Death cross: 50 SMA was >= 200 SMA yesterday, and < 200 SMA today
    if (prev50 >= prev200 && curr50 < curr200) {
      const meta = result.meta;
      return {
        symbol: meta.symbol || symbol,
        name: meta.shortName || meta.symbol || symbol,
        price: Math.round(closes[lastIdx] * 100) / 100,
        sma50: curr50,
        sma200: curr200,
        type: 'death_cross',
        market,
      };
    }

    return null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Batch scanner
// ---------------------------------------------------------------------------

async function scanMarket(
  market: string
): Promise<{ hits: CrossoverHit[]; scanned: number }> {
  const symbols = await getStocksToScan(market);
  const hits: CrossoverHit[] = [];
  let scanned = 0;

  for (let i = 0; i < symbols.length; i += BATCH_SIZE) {
    const batch = symbols.slice(i, i + BATCH_SIZE);

    const results = await Promise.allSettled(
      batch.map((sym) => checkCrossover(sym, market))
    );

    for (const r of results) {
      scanned++;
      if (r.status === 'fulfilled' && r.value) {
        hits.push(r.value);
      }
    }

    // Small delay between batches to avoid rate limiting
    if (i + BATCH_SIZE < symbols.length) {
      await new Promise((resolve) => setTimeout(resolve, BATCH_DELAY_MS));
    }
  }

  return { hits, scanned };
}

// ---------------------------------------------------------------------------
// Email HTML generation
// ---------------------------------------------------------------------------

function generateCrossoverTable(
  hits: CrossoverHit[],
  type: 'golden_cross' | 'death_cross'
): string {
  const filtered = hits.filter((h) => h.type === type);
  if (filtered.length === 0) return '';

  const isGolden = type === 'golden_cross';
  const title = isGolden
    ? 'Golden Crosses (Bullish)'
    : 'Death Crosses (Bearish)';
  const accentColor = isGolden ? '#4ade80' : '#f87171';
  const badgeBg = isGolden ? '#14532d' : '#7f1d1d';

  let rows = '';
  filtered.forEach((hit) => {
    const currencySymbol = hit.market === 'IN' ? '₹' : '$';
    const marketLabel = hit.market === 'IN' ? 'India' : 'US';

    rows += `
    <tr style="border-bottom:1px solid #1e293b;">
      <td style="padding:12px 8px;">
        <div style="font-weight:700;color:#f8fafc;font-size:14px;">${hit.symbol}</div>
        <div style="font-size:11px;color:#94a3b8;margin-top:2px;">${hit.name.substring(0, 30)}</div>
      </td>
      <td style="padding:12px 8px;text-align:right;">
        <div style="font-weight:600;color:#f8fafc;font-size:14px;">${currencySymbol}${hit.price.toFixed(2)}</div>
      </td>
      <td style="padding:12px 8px;text-align:right;">
        <div style="font-size:13px;color:#cbd5e1;">${currencySymbol}${hit.sma50.toFixed(2)}</div>
      </td>
      <td style="padding:12px 8px;text-align:right;">
        <div style="font-size:13px;color:#cbd5e1;">${currencySymbol}${hit.sma200.toFixed(2)}</div>
      </td>
      <td style="padding:12px 8px;text-align:center;">
        <span style="background:#1e3a5f;color:#60a5fa;padding:4px 8px;border-radius:4px;font-size:11px;font-weight:600;">${marketLabel}</span>
      </td>
    </tr>`;
  });

  return `
  <div style="margin-bottom:24px;">
    <h2 style="font-size:18px;color:#f8fafc;margin:0 0 12px 0;padding-bottom:8px;border-bottom:1px solid #334155;">
      <span style="background:${badgeBg};color:${accentColor};padding:4px 10px;border-radius:6px;font-size:14px;margin-right:8px;">${filtered.length}</span>
      ${title}
    </h2>
    <table style="width:100%;border-collapse:collapse;background:#0f172a;border-radius:8px;overflow:hidden;">
      <thead>
        <tr style="background:#1e293b;">
          <th style="padding:10px 8px;text-align:left;font-size:11px;color:#94a3b8;font-weight:600;text-transform:uppercase;">Stock</th>
          <th style="padding:10px 8px;text-align:right;font-size:11px;color:#94a3b8;font-weight:600;text-transform:uppercase;">Price</th>
          <th style="padding:10px 8px;text-align:right;font-size:11px;color:#94a3b8;font-weight:600;text-transform:uppercase;">50 DMA</th>
          <th style="padding:10px 8px;text-align:right;font-size:11px;color:#94a3b8;font-weight:600;text-transform:uppercase;">200 DMA</th>
          <th style="padding:10px 8px;text-align:center;font-size:11px;color:#94a3b8;font-weight:600;text-transform:uppercase;">Market</th>
        </tr>
      </thead>
      <tbody>
        ${rows}
      </tbody>
    </table>
  </div>`;
}

function generateEmailHTML(
  dateStr: string,
  goldenCrosses: CrossoverHit[],
  deathCrosses: CrossoverHit[],
  totalScanned: number
): string {
  const goldenTable = generateCrossoverTable(
    goldenCrosses,
    'golden_cross'
  );
  const deathTable = generateCrossoverTable(deathCrosses, 'death_cross');

  const totalHits = goldenCrosses.length + deathCrosses.length;

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>DMA Crossover Alert</title>
</head>
<body style="margin:0;padding:0;background-color:#0f172a;color:#e2e8f0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
  <div style="max-width:700px;margin:0 auto;padding:20px;">

    <!-- Header -->
    <div style="background:linear-gradient(135deg,#1e293b 0%,#334155 100%);border-radius:12px;padding:24px;margin-bottom:20px;border:1px solid #475569;">
      <h1 style="margin:0 0 8px 0;font-size:22px;color:#f8fafc;">DMA Crossover Alert</h1>
      <p style="margin:0 0 12px 0;font-size:14px;color:#94a3b8;">${dateStr}</p>
      <div style="display:flex;gap:12px;flex-wrap:wrap;">
        <span style="background:#14532d;color:#4ade80;padding:6px 12px;border-radius:6px;font-size:13px;font-weight:600;">Golden: ${goldenCrosses.length}</span>
        <span style="background:#7f1d1d;color:#f87171;padding:6px 12px;border-radius:6px;font-size:13px;font-weight:600;">Death: ${deathCrosses.length}</span>
        <span style="background:#1e293b;color:#94a3b8;padding:6px 12px;border-radius:6px;font-size:13px;">Scanned: ${totalScanned} stocks</span>
      </div>
    </div>

    ${totalHits === 0 ? `
    <div style="background:#1e293b;border-radius:8px;padding:24px;margin-bottom:20px;text-align:center;border:1px solid #334155;">
      <p style="font-size:16px;color:#fbbf24;margin:0 0 8px 0;font-weight:600;">No DMA Crossovers Detected Today</p>
      <p style="font-size:13px;color:#94a3b8;margin:0;">None of the ${totalScanned} scanned stocks had a 50/200 DMA crossover on the most recent trading day.</p>
    </div>
    ` : ''}

    ${goldenTable}
    ${deathTable}

    <!-- Legend -->
    <div style="background:#1e293b;border-radius:8px;padding:16px;margin-bottom:20px;border:1px solid #334155;">
      <p style="margin:0 0 8px 0;font-size:13px;color:#f8fafc;font-weight:600;">What are DMA Crossovers?</p>
      <p style="margin:0 0 6px 0;font-size:12px;color:#94a3b8;line-height:1.5;">
        <strong style="color:#4ade80;">Golden Cross:</strong> The 50-day moving average crosses above the 200-day moving average, signaling potential bullish momentum.
      </p>
      <p style="margin:0;font-size:12px;color:#94a3b8;line-height:1.5;">
        <strong style="color:#f87171;">Death Cross:</strong> The 50-day moving average crosses below the 200-day moving average, signaling potential bearish momentum.
      </p>
    </div>

    <!-- Disclaimer -->
    <div style="background:#1e293b;border-radius:8px;padding:16px;margin-top:20px;border:1px solid #334155;">
      <p style="margin:0;font-size:11px;color:#64748b;line-height:1.5;">
        <strong>Disclaimer:</strong> This email is generated automatically by StockScreen for informational
        purposes only. It does not constitute financial advice, investment recommendations, or an offer to
        buy or sell any securities. DMA crossovers are lagging indicators and should be used alongside other
        analysis. Past performance does not guarantee future results. Always conduct your own research and
        consult a qualified financial advisor before making investment decisions.
      </p>
    </div>

    <p style="text-align:center;font-size:11px;color:#475569;margin-top:16px;">
      Powered by StockScreen | Generated at ${new Date().toLocaleTimeString('en-US', { timeZone: 'America/New_York' })} EST
    </p>
  </div>
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  // Verify cron secret
  const authHeader = req.headers['authorization'];
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    console.log('[Crossovers] Unauthorized request');
    return res.status(401).json({ error: 'Unauthorized' });
  }

  console.log('[Crossovers] Starting daily DMA crossover scan...');
  const startTime = Date.now();

  try {
    // Scan both markets in parallel
    const [usResult, inResult] = await Promise.all([
      scanMarket('US'),
      scanMarket('IN'),
    ]);

    const allHits = [...usResult.hits, ...inResult.hits];
    const goldenCrosses = allHits.filter((h) => h.type === 'golden_cross');
    const deathCrosses = allHits.filter((h) => h.type === 'death_cross');
    const totalScanned = usResult.scanned + inResult.scanned;

    console.log(
      `[Crossovers] Scanned ${totalScanned} stocks: ${goldenCrosses.length} golden, ${deathCrosses.length} death crosses`
    );

    // Generate email
    const dateStr = new Date().toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      timeZone: 'America/New_York',
    });

    const totalHits = goldenCrosses.length + deathCrosses.length;
    const subject =
      totalHits > 0
        ? `DMA Crossover Alert - ${totalHits} crossover${totalHits > 1 ? 's' : ''} detected - ${dateStr}`
        : `DMA Crossover Alert - No crossovers - ${dateStr}`;

    const html = generateEmailHTML(
      dateStr,
      goldenCrosses,
      deathCrosses,
      totalScanned
    );

    // Send email
    const emailResult = await sendEmail({
      to: RECIPIENTS,
      subject,
      html,
    });

    const elapsed = Date.now() - startTime;

    if (emailResult.success) {
      console.log(
        `[Crossovers] Email sent successfully (${elapsed}ms). MessageId: ${emailResult.messageId}`
      );
      return res.status(200).json({
        success: true,
        goldenCrosses: goldenCrosses.length,
        deathCrosses: deathCrosses.length,
        totalScanned,
        elapsedMs: elapsed,
        messageId: emailResult.messageId,
      });
    } else {
      console.error('[Crossovers] Email send failed:', emailResult.error);
      return res.status(500).json({
        success: false,
        error: emailResult.error,
        goldenCrosses: goldenCrosses.length,
        deathCrosses: deathCrosses.length,
        totalScanned,
        elapsedMs: elapsed,
      });
    }
  } catch (error: any) {
    const elapsed = Date.now() - startTime;
    console.error('[Crossovers] Fatal error:', error.message);
    return res.status(500).json({
      success: false,
      error: error.message,
      elapsedMs: elapsed,
    });
  }
}
