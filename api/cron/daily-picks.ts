/**
 * Daily Day-Trade Picks Cron Job
 *
 * Runs at 8 AM EST (1 PM UTC) on weekdays via Vercel Cron.
 * Fetches ~250 US + ~50 India stocks, scores them for day-trade potential,
 * and emails the top 10 picks with buy/sell prices to the configured recipient.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getQuotes, getIndexSymbols, getMarketIndices, Market } from '../_lib/yahoo-client';
import {
  StockData,
  DayTradeScore,
  computeTechnicals,
  scoreDayTrade,
} from '../_lib/day-trade-scorer';
import { sendEmail } from '../_lib/brevo-sender';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const RECIPIENTS = [
  'reachtovijendra@gmail.com',
  'vijendra.tadavarthy@acacceptance.com',
];
const US_TOP_PICKS = 7;   // 7 US + 3 India = 10 total
const IN_TOP_PICKS = 3;
const TECHNICALS_BATCH_SIZE = 5;
const TECHNICALS_BATCH_DELAY_MS = 200;
const MIN_SCORE = 20;      // Minimum score to be considered

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Verify this is a legitimate cron invocation from Vercel
  // In production, Vercel sends the CRON_SECRET header automatically
  const authHeader = req.headers['authorization'];
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    console.log('[DailyPicks] Unauthorized request - missing or invalid CRON_SECRET');
    return res.status(401).json({ error: 'Unauthorized' });
  }

  console.log('[DailyPicks] Starting daily day-trade picks generation...');
  const startTime = Date.now();

  try {
    // --- 1. Fetch stock quotes for both markets ---
    console.log('[DailyPicks] Fetching US stock quotes...');
    const usSymbols = getIndexSymbols('US');
    const usQuotes = await getQuotes(usSymbols, 'US');
    console.log(`[DailyPicks] Got ${usQuotes.length} US quotes`);

    console.log('[DailyPicks] Fetching IN stock quotes...');
    const inSymbols = getIndexSymbols('IN');
    const inQuotes = await getQuotes(inSymbols, 'IN');
    console.log(`[DailyPicks] Got ${inQuotes.length} IN quotes`);

    // --- 2. Pre-filter: only consider stocks with positive change and decent volume ---
    const usFiltered = usQuotes.filter(
      (q) => q.changePercent > 0 && q.relativeVolume >= 0.8 && q.price > 5 && q.marketCap > 1_000_000_000
    );
    const inFiltered = inQuotes.filter(
      (q) => q.changePercent > 0 && q.relativeVolume >= 0.8 && q.price > 50
    );

    console.log(`[DailyPicks] Pre-filtered: ${usFiltered.length} US, ${inFiltered.length} IN`);

    // Sort by changePercent * relativeVolume to prioritize the most active movers
    usFiltered.sort((a, b) => (b.changePercent * b.relativeVolume) - (a.changePercent * a.relativeVolume));
    inFiltered.sort((a, b) => (b.changePercent * b.relativeVolume) - (a.changePercent * a.relativeVolume));

    // Take top 40 US and top 20 IN for technicals (limit API calls)
    const usCandidates = usFiltered.slice(0, 40);
    const inCandidates = inFiltered.slice(0, 20);

    // --- 3. Compute technicals in batches ---
    console.log(`[DailyPicks] Computing technicals for ${usCandidates.length + inCandidates.length} stocks...`);

    const allCandidates = [...usCandidates, ...inCandidates];
    const scored: DayTradeScore[] = [];

    for (let i = 0; i < allCandidates.length; i += TECHNICALS_BATCH_SIZE) {
      const batch = allCandidates.slice(i, i + TECHNICALS_BATCH_SIZE);
      const results = await Promise.all(
        batch.map(async (quote) => {
          try {
            const tech = await computeTechnicals(quote.symbol);
            const stockData: StockData = {
              symbol: quote.symbol,
              name: quote.name,
              price: quote.price,
              change: quote.change,
              changePercent: quote.changePercent,
              market: quote.market as 'US' | 'IN',
              exchange: quote.exchange,
              currency: quote.currency,
              marketCap: quote.marketCap,
              volume: quote.volume,
              avgVolume: quote.avgVolume,
              relativeVolume: quote.relativeVolume,
              fiftyTwoWeekHigh: quote.fiftyTwoWeekHigh,
              fiftyTwoWeekLow: quote.fiftyTwoWeekLow,
              percentFromFiftyTwoWeekHigh: quote.percentFromFiftyTwoWeekHigh,
              fiftyDayMA: quote.fiftyDayMA,
              twoHundredDayMA: quote.twoHundredDayMA,
              percentFromFiftyDayMA: quote.percentFromFiftyDayMA,
              percentFromTwoHundredDayMA: quote.percentFromTwoHundredDayMA,
              beta: quote.beta,
              sector: quote.sector,
              industry: quote.industry,
            };
            return scoreDayTrade(stockData, tech);
          } catch (err: any) {
            console.error(`[DailyPicks] Error scoring ${quote.symbol}: ${err.message}`);
            return null;
          }
        })
      );

      for (const r of results) {
        if (r && r.score >= MIN_SCORE) {
          scored.push(r);
        }
      }

      // Delay between batches to respect rate limits
      if (i + TECHNICALS_BATCH_SIZE < allCandidates.length) {
        await new Promise((resolve) => setTimeout(resolve, TECHNICALS_BATCH_DELAY_MS));
      }
    }

    console.log(`[DailyPicks] Scored ${scored.length} stocks above minimum threshold`);

    // --- 4. Select top picks per market ---
    const usScored = scored.filter((s) => s.market === 'US').sort((a, b) => b.score - a.score);
    const inScored = scored.filter((s) => s.market === 'IN').sort((a, b) => b.score - a.score);

    const usPicks = usScored.slice(0, US_TOP_PICKS);
    const inPicks = inScored.slice(0, IN_TOP_PICKS);
    const allPicks = [...usPicks, ...inPicks];

    console.log(`[DailyPicks] Selected ${usPicks.length} US + ${inPicks.length} IN = ${allPicks.length} total picks`);

    // --- 5. Fetch market indices for the email header ---
    let spValue = '', djValue = '', niftyValue = '';
    try {
      const [usIndices, inIndices] = await Promise.all([
        getMarketIndices('US'),
        getMarketIndices('IN'),
      ]);
      const sp = usIndices.find((i) => i.symbol === '^GSPC');
      const dj = usIndices.find((i) => i.symbol === '^DJI');
      const nf = inIndices.find((i) => i.symbol === '^NSEI');
      if (sp) spValue = `S&P 500: ${sp.price.toLocaleString()} (${sp.changePercent >= 0 ? '+' : ''}${sp.changePercent.toFixed(2)}%)`;
      if (dj) djValue = `Dow Jones: ${dj.price.toLocaleString()} (${dj.changePercent >= 0 ? '+' : ''}${dj.changePercent.toFixed(2)}%)`;
      if (nf) niftyValue = `NIFTY 50: ${nf.price.toLocaleString()} (${nf.changePercent >= 0 ? '+' : ''}${nf.changePercent.toFixed(2)}%)`;
    } catch (err) {
      console.log('[DailyPicks] Failed to fetch indices, continuing without...');
    }

    // --- 6. Generate HTML email ---
    const dateStr = new Date().toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      timeZone: 'America/New_York',
    });

    const html = generateEmailHTML({
      dateStr,
      spValue,
      djValue,
      niftyValue,
      usPicks,
      inPicks,
    });

    // --- 7. Send email ---
    if (allPicks.length === 0) {
      console.log('[DailyPicks] No qualifying picks today. Sending notification email.');
      const noPicksHtml = generateNoPicksHTML(dateStr, spValue, djValue, niftyValue);
      const result = await sendEmail({
        to: RECIPIENTS,
        subject: `StockScreen Daily Picks - ${dateStr} (No Strong Signals)`,
        html: noPicksHtml,
      });
      console.log('[DailyPicks] No-picks email sent:', JSON.stringify(result));
    } else {
      const result = await sendEmail({
        to: RECIPIENTS,
        subject: `StockScreen Day-Trade Picks - ${dateStr} (${allPicks.length} Picks)`,
        html,
      });
      console.log('[DailyPicks] Email sent:', JSON.stringify(result));
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`[DailyPicks] Completed in ${elapsed}s`);

    return res.status(200).json({
      success: true,
      picks: allPicks.length,
      us: usPicks.length,
      india: inPicks.length,
      elapsed: `${elapsed}s`,
    });
  } catch (error: any) {
    console.error('[DailyPicks] Fatal error:', error);
    return res.status(500).json({
      error: 'Failed to generate daily picks',
      message: error.message,
    });
  }
}

// ---------------------------------------------------------------------------
// Email HTML Generation
// ---------------------------------------------------------------------------

function generateEmailHTML(data: {
  dateStr: string;
  spValue: string;
  djValue: string;
  niftyValue: string;
  usPicks: DayTradeScore[];
  inPicks: DayTradeScore[];
}): string {
  const { dateStr, spValue, djValue, niftyValue, usPicks, inPicks } = data;

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>StockScreen Daily Day-Trade Picks</title>
</head>
<body style="margin:0;padding:0;background-color:#0f172a;color:#e2e8f0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
  <div style="max-width:700px;margin:0 auto;padding:20px;">

    <!-- Header -->
    <div style="background:linear-gradient(135deg,#1e293b 0%,#334155 100%);border-radius:12px;padding:24px;margin-bottom:20px;border:1px solid #475569;">
      <h1 style="margin:0 0 8px 0;font-size:22px;color:#f8fafc;">StockScreen Day-Trade Picks</h1>
      <p style="margin:0 0 16px 0;font-size:14px;color:#94a3b8;">${dateStr}</p>
      <div style="display:flex;gap:12px;flex-wrap:wrap;">
        ${spValue ? `<span style="background:#1e3a5f;color:#60a5fa;padding:6px 12px;border-radius:6px;font-size:13px;font-weight:600;">${spValue}</span>` : ''}
        ${djValue ? `<span style="background:#1e3a5f;color:#60a5fa;padding:6px 12px;border-radius:6px;font-size:13px;font-weight:600;">${djValue}</span>` : ''}
        ${niftyValue ? `<span style="background:#1e3a2f;color:#4ade80;padding:6px 12px;border-radius:6px;font-size:13px;font-weight:600;">${niftyValue}</span>` : ''}
      </div>
    </div>

    <!-- US Market Picks -->
    ${usPicks.length > 0 ? `
    <div style="margin-bottom:24px;">
      <h2 style="font-size:18px;color:#f8fafc;margin:0 0 12px 0;padding-bottom:8px;border-bottom:1px solid #334155;">
        US Market Picks (${usPicks.length})
      </h2>
      ${generatePicksTable(usPicks, '$')}
    </div>
    ` : ''}

    <!-- India Market Picks -->
    ${inPicks.length > 0 ? `
    <div style="margin-bottom:24px;">
      <h2 style="font-size:18px;color:#f8fafc;margin:0 0 12px 0;padding-bottom:8px;border-bottom:1px solid #334155;">
        India Market Picks (${inPicks.length})
      </h2>
      ${generatePicksTable(inPicks, '₹')}
    </div>
    ` : ''}

    <!-- Disclaimer -->
    <div style="background:#1e293b;border-radius:8px;padding:16px;margin-top:20px;border:1px solid #334155;">
      <p style="margin:0;font-size:11px;color:#64748b;line-height:1.5;">
        <strong>Disclaimer:</strong> This email is generated automatically by StockScreen for informational
        purposes only. It does not constitute financial advice, investment recommendations, or an offer to
        buy or sell any securities. Day trading carries significant risk and may not be suitable for all
        investors. Past performance does not guarantee future results. Always conduct your own research and
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

function generatePicksTable(picks: DayTradeScore[], currencySymbol: string): string {
  let rows = '';
  picks.forEach((pick, idx) => {
    const changeColor = pick.changePercent >= 0 ? '#4ade80' : '#f87171';
    const scoreColor = pick.score >= 60 ? '#4ade80' : pick.score >= 40 ? '#fbbf24' : '#f87171';
    const signalSummary = pick.signals.slice(0, 4).join(', ');
    const formattedMcap = formatMarketCap(pick.marketCap, pick.market);

    rows += `
    <tr style="border-bottom:1px solid #1e293b;">
      <td style="padding:12px 8px;text-align:center;font-weight:700;color:#94a3b8;font-size:14px;">${idx + 1}</td>
      <td style="padding:12px 8px;">
        <div style="font-weight:700;color:#f8fafc;font-size:14px;">${pick.symbol}</div>
        <div style="font-size:11px;color:#94a3b8;margin-top:2px;">${pick.name.substring(0, 25)}</div>
        <div style="font-size:10px;color:#64748b;">${pick.sector} | ${formattedMcap}</div>
      </td>
      <td style="padding:12px 8px;text-align:center;">
        <div style="background:${scoreColor};color:#0f172a;font-weight:800;font-size:16px;width:40px;height:40px;line-height:40px;border-radius:8px;display:inline-block;">${pick.score}</div>
      </td>
      <td style="padding:12px 8px;text-align:right;">
        <div style="font-weight:600;color:#f8fafc;font-size:14px;">${currencySymbol}${pick.price.toFixed(2)}</div>
        <div style="font-size:12px;color:${changeColor};font-weight:600;">${pick.changePercent >= 0 ? '+' : ''}${pick.changePercent.toFixed(2)}%</div>
      </td>
      <td style="padding:12px 8px;text-align:right;">
        <div style="font-size:12px;color:#4ade80;">Buy: ${currencySymbol}${pick.buyPrice.toFixed(2)}</div>
        <div style="font-size:12px;color:#f87171;">Sell: ${currencySymbol}${pick.sellPrice.toFixed(2)}</div>
        <div style="font-size:11px;color:#fbbf24;">Stop: ${currencySymbol}${pick.stopLoss.toFixed(2)}</div>
      </td>
      <td style="padding:12px 8px;">
        <div style="font-size:11px;color:#cbd5e1;line-height:1.4;">${signalSummary}</div>
        ${pick.rsi != null ? `<div style="font-size:10px;color:#64748b;">RSI ${pick.rsi.toFixed(0)} | Vol ${pick.relativeVolume.toFixed(1)}x${pick.beta != null ? ` | Beta ${pick.beta.toFixed(1)}` : ''}</div>` : ''}
      </td>
    </tr>`;
  });

  return `
  <table style="width:100%;border-collapse:collapse;background:#0f172a;border-radius:8px;overflow:hidden;">
    <thead>
      <tr style="background:#1e293b;">
        <th style="padding:10px 8px;text-align:center;font-size:11px;color:#94a3b8;font-weight:600;text-transform:uppercase;">#</th>
        <th style="padding:10px 8px;text-align:left;font-size:11px;color:#94a3b8;font-weight:600;text-transform:uppercase;">Stock</th>
        <th style="padding:10px 8px;text-align:center;font-size:11px;color:#94a3b8;font-weight:600;text-transform:uppercase;">Score</th>
        <th style="padding:10px 8px;text-align:right;font-size:11px;color:#94a3b8;font-weight:600;text-transform:uppercase;">Price</th>
        <th style="padding:10px 8px;text-align:right;font-size:11px;color:#94a3b8;font-weight:600;text-transform:uppercase;">Targets</th>
        <th style="padding:10px 8px;text-align:left;font-size:11px;color:#94a3b8;font-weight:600;text-transform:uppercase;">Signals</th>
      </tr>
    </thead>
    <tbody>
      ${rows}
    </tbody>
  </table>`;
}

function generateNoPicksHTML(dateStr: string, spValue: string, djValue: string, niftyValue: string): string {
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background-color:#0f172a;color:#e2e8f0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
  <div style="max-width:600px;margin:0 auto;padding:20px;">
    <div style="background:linear-gradient(135deg,#1e293b 0%,#334155 100%);border-radius:12px;padding:24px;border:1px solid #475569;">
      <h1 style="margin:0 0 8px 0;font-size:22px;color:#f8fafc;">StockScreen Daily Picks</h1>
      <p style="margin:0 0 16px 0;font-size:14px;color:#94a3b8;">${dateStr}</p>
      ${spValue ? `<p style="font-size:13px;color:#60a5fa;margin:4px 0;">${spValue}</p>` : ''}
      ${djValue ? `<p style="font-size:13px;color:#60a5fa;margin:4px 0;">${djValue}</p>` : ''}
      ${niftyValue ? `<p style="font-size:13px;color:#4ade80;margin:4px 0;">${niftyValue}</p>` : ''}
    </div>
    <div style="background:#1e293b;border-radius:8px;padding:24px;margin-top:16px;text-align:center;border:1px solid #334155;">
      <p style="font-size:16px;color:#fbbf24;margin:0 0 8px 0;font-weight:600;">No Strong Day-Trade Signals Today</p>
      <p style="font-size:13px;color:#94a3b8;margin:0;">Market conditions did not produce any stocks meeting the minimum scoring threshold. This can happen during low-volatility or bearish sessions.</p>
    </div>
  </div>
</body>
</html>`;
}

function formatMarketCap(cap: number, market: string): string {
  if (market === 'IN') {
    const crores = cap / 10_000_000;
    if (crores >= 100_000) return `${(crores / 100_000).toFixed(1)}L Cr`;
    if (crores >= 1_000) return `${(crores / 1_000).toFixed(1)}K Cr`;
    return `${crores.toFixed(0)} Cr`;
  }
  if (cap >= 1_000_000_000_000) return `$${(cap / 1_000_000_000_000).toFixed(2)}T`;
  if (cap >= 1_000_000_000) return `$${(cap / 1_000_000_000).toFixed(1)}B`;
  if (cap >= 1_000_000) return `$${(cap / 1_000_000).toFixed(0)}M`;
  return `$${cap.toLocaleString()}`;
}
