/**
 * US Pre-Market Watchlist Cron Job
 *
 * Runs at 8 AM EST (1 PM UTC) on weekdays — before US market open at 9:30 AM.
 * US pre-market is active from 4 AM EST, so gap%, pre-market price and
 * pre-market volume data is available from Yahoo Finance.
 *
 * India has a separate cron (daily-picks-india) at 8:30 AM IST.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getQuotes, getIndexSymbols, getMarketIndices, Market, StockQuote } from '../_lib/yahoo-client';
import { computeTechnicals, calculateBuySellTargets } from '../_lib/day-trade-scorer';
import { sendEmail } from '../_lib/brevo-sender';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const RECIPIENTS = [
  'reachtovijendra@gmail.com',
  'poojitha.challagandla@gmail.com',
];
const MAX_PICKS = 15;
const MIN_SCORE = 50; // Only include Medium and High priority

// ---------------------------------------------------------------------------
// Pre-Market Scoring
// ---------------------------------------------------------------------------

interface PreMarketScore {
  symbol: string;
  name: string;
  price: number;
  previousClose: number;
  preMarketPrice: number | null;
  gapPercent: number;
  preMarketVolume: number | null;
  avgVolume: number;
  preMarketVolumePercent: number | null;
  relativeVolume: number;
  fiftyDayMA: number | null;
  twoHundredDayMA: number | null;
  score: number;
  priority: 'High' | 'Medium' | 'Low';
  signals: string[];
  market: string;
  sector: string;
  marketCap: number;
  beta: number | null;
  buyPrice: number;
  sellPrice: number;
  stopLoss: number;
  rsi: number | null;
}

function scorePreMarket(q: StockQuote): PreMarketScore {
  let score = 0;
  const signals: string[] = [];

  // Calculate gap % from pre-market price vs previous close
  const previousClose = q.price; // regularMarketPrice = previous close before market open
  const preMarketPrice = q.preMarketPrice;
  const preMarketVol = q.preMarketVolume;

  let gapPercent = 0;
  if (preMarketPrice && previousClose > 0) {
    gapPercent = ((preMarketPrice - previousClose) / previousClose) * 100;
  }

  // --- Gap Score ---
  const absGap = Math.abs(gapPercent);
  if (absGap > 5) {
    score += 20;
    signals.push(`Gap ${gapPercent > 0 ? '+' : ''}${gapPercent.toFixed(1)}% (strong)`);
  } else if (absGap >= 3) {
    score += 10;
    signals.push(`Gap ${gapPercent > 0 ? '+' : ''}${gapPercent.toFixed(1)}%`);
  } else if (absGap >= 1) {
    score += 5;
    signals.push(`Gap ${gapPercent > 0 ? '+' : ''}${gapPercent.toFixed(1)}%`);
  }

  // --- Relative Volume Score (from previous session) ---
  const rvol = q.relativeVolume;
  if (rvol > 3) {
    score += 25;
    signals.push(`RVOL ${rvol.toFixed(1)}x (spike)`);
  } else if (rvol >= 2) {
    score += 15;
    signals.push(`RVOL ${rvol.toFixed(1)}x (elevated)`);
  } else if (rvol >= 1.5) {
    score += 8;
    signals.push(`RVOL ${rvol.toFixed(1)}x`);
  }

  // --- Pre-Market Volume Score ---
  let preMarketVolumePercent: number | null = null;
  if (preMarketVol && q.avgVolume > 0) {
    preMarketVolumePercent = (preMarketVol / q.avgVolume) * 100;
    if (preMarketVolumePercent > 30) {
      score += 15;
      signals.push(`Pre-mkt vol ${preMarketVolumePercent.toFixed(0)}% of avg (heavy)`);
    } else if (preMarketVolumePercent > 15) {
      score += 8;
      signals.push(`Pre-mkt vol ${preMarketVolumePercent.toFixed(0)}% of avg`);
    } else if (preMarketVolumePercent > 5) {
      score += 3;
    }
  }

  // --- Trend Strength (DMA positioning) ---
  if (q.fiftyDayMA && q.twoHundredDayMA) {
    const effectivePrice = preMarketPrice || previousClose;
    if (q.fiftyDayMA > q.twoHundredDayMA && effectivePrice > q.fiftyDayMA) {
      score += 10;
      signals.push('Above 50 & 200 DMA (bullish trend)');
    } else if (q.fiftyDayMA > q.twoHundredDayMA) {
      score += 5;
      signals.push('Golden cross active');
    } else if (q.fiftyDayMA < q.twoHundredDayMA && effectivePrice < q.fiftyDayMA) {
      score += 5;
      signals.push('Below both DMAs (bearish, short candidate)');
    }
  }

  // --- Liquidity Score ---
  if (q.avgVolume > 5_000_000) {
    score += 10;
    signals.push(`Avg vol ${(q.avgVolume / 1_000_000).toFixed(1)}M (liquid)`);
  } else if (q.avgVolume > 2_000_000) {
    score += 5;
    signals.push(`Avg vol ${(q.avgVolume / 1_000_000).toFixed(1)}M`);
  }

  // --- 52-Week Proximity ---
  if (q.percentFromFiftyTwoWeekHigh > -3) {
    score += 5;
    signals.push('Near 52W high (breakout watch)');
  } else if (q.percentFromFiftyTwoWeekLow < 10) {
    score += 3;
    signals.push('Near 52W low (bounce watch)');
  }

  // Determine priority
  let priority: 'High' | 'Medium' | 'Low';
  if (score >= 70) {
    priority = 'High';
  } else if (score >= 50) {
    priority = 'Medium';
  } else {
    priority = 'Low';
  }

  return {
    symbol: q.symbol,
    name: q.name,
    price: previousClose,
    previousClose,
    preMarketPrice,
    gapPercent,
    preMarketVolume: preMarketVol,
    avgVolume: q.avgVolume,
    preMarketVolumePercent,
    relativeVolume: rvol,
    fiftyDayMA: q.fiftyDayMA,
    twoHundredDayMA: q.twoHundredDayMA,
    score,
    priority,
    signals,
    market: q.market,
    sector: q.sector,
    marketCap: q.marketCap,
    beta: q.beta,
    buyPrice: 0,
    sellPrice: 0,
    stopLoss: 0,
    rsi: null,
  };
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const authHeader = req.headers['authorization'];
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    console.log('[DailyPicks] Unauthorized request');
    return res.status(401).json({ error: 'Unauthorized' });
  }

  console.log('[USPicks] Starting US pre-market watchlist...');
  const startTime = Date.now();

  try {
    // --- 1. Fetch US stock quotes ---
    console.log('[USPicks] Fetching US stock quotes...');
    const usSymbols = getIndexSymbols('US');
    const usQuotes = await getQuotes(usSymbols, 'US');
    console.log(`[USPicks] Got ${usQuotes.length} US quotes`);

    // --- 2. Pre-filter on price/market cap ---
    const usFiltered = usQuotes.filter(
      (q) => q.price > 5 && q.marketCap > 1_000_000_000
    );
    console.log(`[USPicks] Pre-filtered: ${usFiltered.length} stocks`);

    // --- 3. Score ---
    const allScored = usFiltered.map(scorePreMarket);
    allScored.sort((a, b) => b.score - a.score);

    const qualified = allScored.filter(s => s.score >= MIN_SCORE);
    const picks = qualified.slice(0, MAX_PICKS);

    const highPriority = picks.filter(s => s.priority === 'High');
    const mediumPriority = picks.filter(s => s.priority === 'Medium');

    console.log(`[USPicks] ${qualified.length} qualified (${highPriority.length} high, ${mediumPriority.length} medium)`);

    // --- 4. Compute ATR-based buy/sell/stop for qualified picks ---
    console.log(`[USPicks] Computing technicals for ${picks.length} picks...`);
    for (const pick of picks) {
      try {
        const tech = await computeTechnicals(pick.symbol);
        const targets = calculateBuySellTargets(pick.preMarketPrice || pick.price, tech.atr);
        pick.buyPrice = targets.buyPrice;
        pick.sellPrice = targets.sellPrice;
        pick.stopLoss = targets.stopLoss;
        pick.rsi = tech.rsi;
      } catch (err: any) {
        // Fallback: 1% of price as ATR proxy
        const fallback = pick.price * 0.01;
        pick.buyPrice = Math.round((pick.price - 0.3 * fallback) * 100) / 100;
        pick.sellPrice = Math.round((pick.price + 1.0 * fallback) * 100) / 100;
        pick.stopLoss = Math.round((pick.buyPrice - 0.5 * fallback) * 100) / 100;
        console.error(`[USPicks] Technicals failed for ${pick.symbol}: ${err.message}`);
      }
    }

    // --- 5. Fetch market indices ---
    let spValue = '', djValue = '';
    try {
      const usIndices = await getMarketIndices('US');
      const sp = usIndices.find((i) => i.symbol === '^GSPC');
      const dj = usIndices.find((i) => i.symbol === '^DJI');
      if (sp) spValue = `S&P 500: ${sp.price.toLocaleString()} (${sp.changePercent >= 0 ? '+' : ''}${sp.changePercent.toFixed(2)}%)`;
      if (dj) djValue = `Dow Jones: ${dj.price.toLocaleString()} (${dj.changePercent >= 0 ? '+' : ''}${dj.changePercent.toFixed(2)}%)`;
    } catch (err) {
      console.log('[USPicks] Failed to fetch indices, continuing without...');
    }

    // --- 5. Generate and send email ---
    const dateStr = new Date().toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      timeZone: 'America/New_York',
    });

    const html = picks.length > 0
      ? generateEmailHTML({ dateStr, spValue, djValue, highPriority, mediumPriority })
      : generateNoPicksHTML(dateStr, spValue, djValue);

    const subject = picks.length > 0
      ? `🇺🇸 US Pre-Market Watchlist - ${dateStr} (${highPriority.length} High, ${mediumPriority.length} Medium)`
      : `🇺🇸 US Pre-Market Watchlist - ${dateStr} (No Strong Signals)`;

    const result = await sendEmail({ to: RECIPIENTS, subject, html });
    console.log('[USPicks] Email sent:', JSON.stringify(result));

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`[USPicks] Completed in ${elapsed}s`);

    return res.status(200).json({
      success: true,
      picks: picks.length,
      high: highPriority.length,
      medium: mediumPriority.length,
      elapsed: `${elapsed}s`,
    });
  } catch (error: any) {
    console.error('[DailyPicks] Fatal error:', error);
    return res.status(500).json({ error: 'Failed to generate watchlist', message: error.message });
  }
}

// ---------------------------------------------------------------------------
// Email HTML Generation
// ---------------------------------------------------------------------------

function generateEmailHTML(data: {
  dateStr: string;
  spValue: string;
  djValue: string;
  highPriority: PreMarketScore[];
  mediumPriority: PreMarketScore[];
}): string {
  const { dateStr, spValue, djValue, highPriority, mediumPriority } = data;

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>US Pre-Market Watchlist</title>
</head>
<body style="margin:0;padding:0;background-color:#0f172a;color:#e2e8f0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
  <div style="max-width:720px;margin:0 auto;padding:20px;">

    <!-- Header -->
    <div style="background:linear-gradient(135deg,#1e293b 0%,#334155 100%);border-radius:12px;padding:24px;margin-bottom:20px;border:1px solid #475569;">
      <h1 style="margin:0 0 4px 0;font-size:22px;color:#f8fafc;">🇺🇸 US Pre-Market Watchlist</h1>
      <p style="margin:0 0 16px 0;font-size:14px;color:#94a3b8;">${dateStr}</p>
      <div style="display:flex;gap:12px;flex-wrap:wrap;">
        ${spValue ? `<span style="background:#1e3a5f;color:#60a5fa;padding:6px 12px;border-radius:6px;font-size:13px;font-weight:600;">${spValue}</span>` : ''}
        ${djValue ? `<span style="background:#1e3a5f;color:#60a5fa;padding:6px 12px;border-radius:6px;font-size:13px;font-weight:600;">${djValue}</span>` : ''}
      </div>
    </div>

    <!-- Summary -->
    <div style="display:flex;gap:12px;margin-bottom:20px;">
      <div style="flex:1;background:#14532d;border-radius:8px;padding:16px;text-align:center;border:1px solid #22c55e33;">
        <div style="font-size:28px;font-weight:800;color:#4ade80;">${highPriority.length}</div>
        <div style="font-size:12px;color:#86efac;font-weight:600;">HIGH PRIORITY</div>
      </div>
      <div style="flex:1;background:#78350f;border-radius:8px;padding:16px;text-align:center;border:1px solid #f59e0b33;">
        <div style="font-size:28px;font-weight:800;color:#fbbf24;">${mediumPriority.length}</div>
        <div style="font-size:12px;color:#fcd34d;font-weight:600;">WATCH CLOSELY</div>
      </div>
    </div>

    <!-- High Priority -->
    ${highPriority.length > 0 ? `
    <div style="margin-bottom:24px;">
      <h2 style="font-size:16px;color:#4ade80;margin:0 0 12px 0;padding-bottom:8px;border-bottom:1px solid #334155;">
        🔥 High Priority Trades (Score ≥ 70)
      </h2>
      ${generatePicksTable(highPriority)}
    </div>` : ''}

    <!-- Medium Priority -->
    ${mediumPriority.length > 0 ? `
    <div style="margin-bottom:24px;">
      <h2 style="font-size:16px;color:#fbbf24;margin:0 0 12px 0;padding-bottom:8px;border-bottom:1px solid #334155;">
        👀 Watch Closely (Score 50–69)
      </h2>
      ${generatePicksTable(mediumPriority)}
    </div>` : ''}

    <!-- Scoring Legend -->
    <div style="background:#1e293b;border-radius:8px;padding:16px;margin-bottom:20px;border:1px solid #334155;">
      <p style="margin:0 0 8px 0;font-size:13px;color:#f8fafc;font-weight:600;">Scoring Factors</p>
      <table style="width:100%;font-size:12px;color:#94a3b8;">
        <tr><td style="padding:3px 0;">Gap > 5%</td><td style="text-align:right;">+20</td></tr>
        <tr><td style="padding:3px 0;">Gap 3-5%</td><td style="text-align:right;">+10</td></tr>
        <tr><td style="padding:3px 0;">RVOL > 3x</td><td style="text-align:right;">+25</td></tr>
        <tr><td style="padding:3px 0;">RVOL 2-3x</td><td style="text-align:right;">+15</td></tr>
        <tr><td style="padding:3px 0;">Pre-mkt vol > 30% avg</td><td style="text-align:right;">+15</td></tr>
        <tr><td style="padding:3px 0;">Strong trend (above DMAs)</td><td style="text-align:right;">+10</td></tr>
        <tr><td style="padding:3px 0;">Liquidity > 5M avg vol</td><td style="text-align:right;">+10</td></tr>
      </table>
    </div>

    <!-- Disclaimer -->
    <div style="background:#1e293b;border-radius:8px;padding:16px;margin-top:20px;border:1px solid #334155;">
      <p style="margin:0;font-size:11px;color:#64748b;line-height:1.5;">
        <strong>Disclaimer:</strong> This email is generated automatically by StockScreen for informational
        purposes only. It does not constitute financial advice or recommendations. Day trading carries
        significant risk. Always conduct your own research and consult a qualified financial advisor.
      </p>
    </div>

    <p style="text-align:center;font-size:11px;color:#475569;margin-top:16px;">
      Powered by StockScreen | Generated at ${new Date().toLocaleTimeString('en-US', { timeZone: 'America/New_York' })} EST
    </p>
  </div>
</body>
</html>`;
}

function generatePicksTable(picks: PreMarketScore[]): string {
  let rows = '';
  picks.forEach((pick, idx) => {
    const gapColor = pick.gapPercent >= 0 ? '#4ade80' : '#f87171';
    const scoreColor = pick.score >= 70 ? '#4ade80' : '#fbbf24';
    const currencySymbol = pick.market === 'IN' ? '₹' : '$';
    const signalSummary = pick.signals.slice(0, 4).join(' · ');
    const formattedMcap = formatMarketCap(pick.marketCap, pick.market);

    rows += `
    <tr style="border-bottom:1px solid #1e293b;">
      <td style="padding:12px 8px;text-align:center;">
        <div style="background:${scoreColor};color:#0f172a;font-weight:800;font-size:16px;width:40px;height:40px;line-height:40px;border-radius:8px;display:inline-block;">${pick.score}</div>
      </td>
      <td style="padding:12px 8px;">
        <div style="font-weight:700;color:#f8fafc;font-size:14px;">${pick.symbol}</div>
        <div style="font-size:11px;color:#94a3b8;margin-top:2px;">${pick.name.substring(0, 28)}</div>
        <div style="font-size:10px;color:#64748b;">${pick.sector} · ${formattedMcap}</div>
      </td>
      <td style="padding:12px 8px;text-align:right;">
        <div style="font-weight:600;color:#f8fafc;font-size:14px;">${currencySymbol}${pick.price.toFixed(2)}</div>
        ${pick.preMarketPrice ? `<div style="font-size:12px;color:${gapColor};font-weight:600;">Gap ${pick.gapPercent >= 0 ? '+' : ''}${pick.gapPercent.toFixed(1)}%</div>` : '<div style="font-size:11px;color:#64748b;">No pre-mkt</div>'}
        ${pick.preMarketPrice ? `<div style="font-size:11px;color:#94a3b8;">Pre: ${currencySymbol}${pick.preMarketPrice.toFixed(2)}</div>` : ''}
      </td>
      <td style="padding:12px 8px;text-align:right;">
        <div style="font-size:12px;color:#4ade80;">Buy: ${currencySymbol}${pick.buyPrice.toFixed(2)}</div>
        <div style="font-size:12px;color:#f87171;">Sell: ${currencySymbol}${pick.sellPrice.toFixed(2)}</div>
        <div style="font-size:11px;color:#fbbf24;">Stop: ${currencySymbol}${pick.stopLoss.toFixed(2)}</div>
      </td>
      <td style="padding:12px 8px;">
        <div style="font-size:11px;color:#cbd5e1;line-height:1.5;">${signalSummary}</div>
        <div style="font-size:10px;color:#64748b;margin-top:4px;">RVOL: ${pick.relativeVolume.toFixed(1)}x${pick.rsi != null ? ` · RSI: ${pick.rsi.toFixed(0)}` : ''}${pick.beta != null ? ` · Beta: ${pick.beta.toFixed(1)}` : ''}</div>
      </td>
    </tr>`;
  });

  return `
  <table style="width:100%;border-collapse:collapse;background:#0f172a;border-radius:8px;overflow:hidden;">
    <thead>
      <tr style="background:#1e293b;">
        <th style="padding:10px 8px;text-align:center;font-size:11px;color:#94a3b8;font-weight:600;text-transform:uppercase;">Score</th>
        <th style="padding:10px 8px;text-align:left;font-size:11px;color:#94a3b8;font-weight:600;text-transform:uppercase;">Stock</th>
        <th style="padding:10px 8px;text-align:right;font-size:11px;color:#94a3b8;font-weight:600;text-transform:uppercase;">Price / Gap</th>
        <th style="padding:10px 8px;text-align:right;font-size:11px;color:#94a3b8;font-weight:600;text-transform:uppercase;">Targets</th>
        <th style="padding:10px 8px;text-align:left;font-size:11px;color:#94a3b8;font-weight:600;text-transform:uppercase;">Signals</th>
      </tr>
    </thead>
    <tbody>
      ${rows}
    </tbody>
  </table>`;
}

function generateNoPicksHTML(dateStr: string, spValue: string, djValue: string): string {
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background-color:#0f172a;color:#e2e8f0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
  <div style="max-width:600px;margin:0 auto;padding:20px;">
    <div style="background:linear-gradient(135deg,#1e293b 0%,#334155 100%);border-radius:12px;padding:24px;border:1px solid #475569;">
      <h1 style="margin:0 0 8px 0;font-size:22px;color:#f8fafc;">🇺🇸 US Pre-Market Watchlist</h1>
      <p style="margin:0 0 16px 0;font-size:14px;color:#94a3b8;">${dateStr}</p>
      ${spValue ? `<p style="font-size:13px;color:#60a5fa;margin:4px 0;">${spValue}</p>` : ''}
      ${djValue ? `<p style="font-size:13px;color:#60a5fa;margin:4px 0;">${djValue}</p>` : ''}
    </div>
    <div style="background:#1e293b;border-radius:8px;padding:24px;margin-top:16px;text-align:center;border:1px solid #334155;">
      <p style="font-size:16px;color:#fbbf24;margin:0 0 8px 0;font-weight:600;">No Strong Pre-Market Signals Today</p>
      <p style="font-size:13px;color:#94a3b8;margin:0;">No stocks scored above the minimum threshold. This can happen during low-volatility or flat pre-market sessions.</p>
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
