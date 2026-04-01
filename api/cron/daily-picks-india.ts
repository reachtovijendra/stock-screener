/**
 * India Pre-Market Watchlist Cron Job
 *
 * Runs at 8:30 AM IST (3:00 AM UTC) on weekdays — before India market
 * open at 9:15 AM IST. No pre-market session exists for NSE/BSE, so
 * scoring is based on previous session's momentum:
 *   - Previous day change % (momentum carry)
 *   - Previous day RVOL (volume conviction)
 *   - Trend strength (50/200 DMA positioning)
 *   - Liquidity (average volume)
 *   - 52-week proximity (breakout/bounce potential)
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getQuotes, getIndexSymbols, getMarketIndices, StockQuote } from '../_lib/yahoo-client';
import { computeTechnicals, calculateBuySellTargets } from '../_lib/day-trade-scorer';
import { sendEmail } from '../_lib/brevo-sender';

const RECIPIENTS = [
  'reachtovijendra@gmail.com',
  'poojitha.challagandla@gmail.com',
];
const MAX_PICKS = 15;
const MIN_SCORE = 50;

// ---------------------------------------------------------------------------
// Previous-Session Scoring (no pre-market data for India)
// ---------------------------------------------------------------------------

interface IndiaScore {
  symbol: string;
  name: string;
  price: number;
  changePercent: number;
  volume: number;
  avgVolume: number;
  relativeVolume: number;
  fiftyDayMA: number | null;
  twoHundredDayMA: number | null;
  percentFromFiftyTwoWeekHigh: number;
  percentFromFiftyTwoWeekLow: number;
  score: number;
  priority: 'High' | 'Medium' | 'Low';
  signals: string[];
  sector: string;
  marketCap: number;
  beta: number | null;
  buyPrice: number;
  sellPrice: number;
  stopLoss: number;
  rsi: number | null;
}

function scorePreviousSession(q: StockQuote): IndiaScore {
  let score = 0;
  const signals: string[] = [];

  // --- Previous Day Change (momentum carry) ---
  const absChange = Math.abs(q.changePercent);
  if (absChange > 5) {
    score += 20;
    signals.push(`Prev ${q.changePercent > 0 ? '+' : ''}${q.changePercent.toFixed(1)}% (strong move)`);
  } else if (absChange >= 3) {
    score += 10;
    signals.push(`Prev ${q.changePercent > 0 ? '+' : ''}${q.changePercent.toFixed(1)}%`);
  } else if (absChange >= 1.5) {
    score += 5;
    signals.push(`Prev ${q.changePercent > 0 ? '+' : ''}${q.changePercent.toFixed(1)}%`);
  }

  // --- Relative Volume (previous session conviction) ---
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

  // --- Trend Strength (DMA positioning) ---
  if (q.fiftyDayMA && q.twoHundredDayMA) {
    if (q.fiftyDayMA > q.twoHundredDayMA && q.price > q.fiftyDayMA) {
      score += 10;
      signals.push('Above 50 & 200 DMA (bullish)');
    } else if (q.fiftyDayMA > q.twoHundredDayMA) {
      score += 5;
      signals.push('Golden cross active');
    } else if (q.fiftyDayMA < q.twoHundredDayMA && q.price < q.fiftyDayMA) {
      score += 5;
      signals.push('Below both DMAs (bearish, short candidate)');
    }
  }

  // --- Liquidity ---
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

  // --- Momentum + Volume combo bonus ---
  if (q.changePercent > 2 && rvol > 1.5) {
    score += 10;
    signals.push('Strong momentum + volume confirmation');
  }

  const priority: 'High' | 'Medium' | 'Low' =
    score >= 70 ? 'High' : score >= 50 ? 'Medium' : 'Low';

  return {
    symbol: q.symbol,
    name: q.name,
    price: q.price,
    changePercent: q.changePercent,
    volume: q.volume,
    avgVolume: q.avgVolume,
    relativeVolume: rvol,
    fiftyDayMA: q.fiftyDayMA,
    twoHundredDayMA: q.twoHundredDayMA,
    percentFromFiftyTwoWeekHigh: q.percentFromFiftyTwoWeekHigh,
    percentFromFiftyTwoWeekLow: q.percentFromFiftyTwoWeekLow,
    score,
    priority,
    signals,
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

export default async function handler(req: any, res: any) {
  const authHeader = req.headers['authorization'];
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  console.log('[IndiaPicks] Starting India pre-market watchlist...');
  const startTime = Date.now();

  try {
    const inSymbols = getIndexSymbols('IN');
    const inQuotes = await getQuotes(inSymbols, 'IN');
    console.log(`[IndiaPicks] Got ${inQuotes.length} India quotes`);

    const filtered = inQuotes.filter((q) => q.price > 50);
    console.log(`[IndiaPicks] Pre-filtered: ${filtered.length} stocks`);

    const allScored = filtered.map(scorePreviousSession);
    allScored.sort((a, b) => b.score - a.score);

    const qualified = allScored.filter((s) => s.score >= MIN_SCORE);
    const picks = qualified.slice(0, MAX_PICKS);

    const highPriority = picks.filter((s) => s.priority === 'High');
    const mediumPriority = picks.filter((s) => s.priority === 'Medium');

    console.log(`[IndiaPicks] ${qualified.length} qualified (${highPriority.length} high, ${mediumPriority.length} medium)`);

    // Compute ATR-based buy/sell/stop for picks
    console.log(`[IndiaPicks] Computing technicals for ${picks.length} picks...`);
    for (const pick of picks) {
      try {
        const tech = await computeTechnicals(pick.symbol);
        const targets = calculateBuySellTargets(pick.price, tech.atr);
        pick.buyPrice = targets.buyPrice;
        pick.sellPrice = targets.sellPrice;
        pick.stopLoss = targets.stopLoss;
        pick.rsi = tech.rsi;
      } catch (err: any) {
        const fallback = pick.price * 0.01;
        pick.buyPrice = Math.round((pick.price - 0.3 * fallback) * 100) / 100;
        pick.sellPrice = Math.round((pick.price + 1.0 * fallback) * 100) / 100;
        pick.stopLoss = Math.round((pick.buyPrice - 0.5 * fallback) * 100) / 100;
        console.error(`[IndiaPicks] Technicals failed for ${pick.symbol}: ${err.message}`);
      }
    }

    // Fetch NIFTY for header
    let niftyValue = '', sensexValue = '';
    try {
      const indices = await getMarketIndices('IN');
      const nf = indices.find((i) => i.symbol === '^NSEI');
      const sx = indices.find((i) => i.symbol === '^BSESN');
      if (nf) niftyValue = `NIFTY 50: ${nf.price.toLocaleString()} (${nf.changePercent >= 0 ? '+' : ''}${nf.changePercent.toFixed(2)}%)`;
      if (sx) sensexValue = `SENSEX: ${sx.price.toLocaleString()} (${sx.changePercent >= 0 ? '+' : ''}${sx.changePercent.toFixed(2)}%)`;
    } catch {}

    const dateStr = new Date().toLocaleDateString('en-IN', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      timeZone: 'Asia/Kolkata',
    });

    const html = picks.length > 0
      ? generateIndiaEmailHTML({ dateStr, niftyValue, sensexValue, highPriority, mediumPriority })
      : generateNoPicksHTML(dateStr, niftyValue, sensexValue);

    const subject = picks.length > 0
      ? `India Watchlist - ${dateStr} (${highPriority.length} High, ${mediumPriority.length} Medium)`
      : `India Watchlist - ${dateStr} (No Strong Signals)`;

    const result = await sendEmail({ to: RECIPIENTS, subject, html });
    console.log('[IndiaPicks] Email sent:', JSON.stringify(result));

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    return res.status(200).json({
      success: true,
      picks: picks.length,
      high: highPriority.length,
      medium: mediumPriority.length,
      elapsed: `${elapsed}s`,
    });
  } catch (error: any) {
    console.error('[IndiaPicks] Fatal error:', error);
    return res.status(500).json({ error: 'Failed to generate India watchlist', message: error.message });
  }
}

// ---------------------------------------------------------------------------
// Email HTML
// ---------------------------------------------------------------------------

function generateIndiaEmailHTML(data: {
  dateStr: string;
  niftyValue: string;
  sensexValue: string;
  highPriority: IndiaScore[];
  mediumPriority: IndiaScore[];
}): string {
  const { dateStr, niftyValue, sensexValue, highPriority, mediumPriority } = data;

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#0f172a;color:#e2e8f0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <div style="max-width:720px;margin:0 auto;padding:20px;">

    <div style="background:linear-gradient(135deg,#1e293b 0%,#334155 100%);border-radius:12px;padding:24px;margin-bottom:20px;border:1px solid #475569;">
      <h1 style="margin:0 0 4px 0;font-size:22px;color:#f8fafc;">🇮🇳 India Pre-Market Watchlist</h1>
      <p style="margin:0 0 16px 0;font-size:14px;color:#94a3b8;">${dateStr}</p>
      <div style="display:flex;gap:12px;flex-wrap:wrap;">
        ${niftyValue ? `<span style="background:#1e3a2f;color:#4ade80;padding:6px 12px;border-radius:6px;font-size:13px;font-weight:600;">${niftyValue}</span>` : ''}
        ${sensexValue ? `<span style="background:#1e3a2f;color:#4ade80;padding:6px 12px;border-radius:6px;font-size:13px;font-weight:600;">${sensexValue}</span>` : ''}
      </div>
    </div>

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

    ${highPriority.length > 0 ? `
    <div style="margin-bottom:24px;">
      <h2 style="font-size:16px;color:#4ade80;margin:0 0 12px 0;padding-bottom:8px;border-bottom:1px solid #334155;">🔥 High Priority (Score ≥ 70)</h2>
      ${generateTable(highPriority)}
    </div>` : ''}

    ${mediumPriority.length > 0 ? `
    <div style="margin-bottom:24px;">
      <h2 style="font-size:16px;color:#fbbf24;margin:0 0 12px 0;padding-bottom:8px;border-bottom:1px solid #334155;">👀 Watch Closely (Score 50–69)</h2>
      ${generateTable(mediumPriority)}
    </div>` : ''}

    <div style="background:#1e293b;border-radius:8px;padding:16px;margin-bottom:20px;border:1px solid #334155;">
      <p style="margin:0 0 8px 0;font-size:13px;color:#f8fafc;font-weight:600;">Scoring (Previous Session Data)</p>
      <table style="width:100%;font-size:12px;color:#94a3b8;">
        <tr><td style="padding:3px 0;">Prev day move > 5%</td><td style="text-align:right;">+20</td></tr>
        <tr><td style="padding:3px 0;">Prev day move 3-5%</td><td style="text-align:right;">+10</td></tr>
        <tr><td style="padding:3px 0;">RVOL > 3x</td><td style="text-align:right;">+25</td></tr>
        <tr><td style="padding:3px 0;">RVOL 2-3x</td><td style="text-align:right;">+15</td></tr>
        <tr><td style="padding:3px 0;">Bullish trend (above DMAs)</td><td style="text-align:right;">+10</td></tr>
        <tr><td style="padding:3px 0;">Momentum + volume combo</td><td style="text-align:right;">+10</td></tr>
        <tr><td style="padding:3px 0;">Liquidity > 5M avg vol</td><td style="text-align:right;">+10</td></tr>
      </table>
    </div>

    <div style="background:#1e293b;border-radius:8px;padding:16px;border:1px solid #334155;">
      <p style="margin:0;font-size:11px;color:#64748b;line-height:1.5;">
        <strong>Disclaimer:</strong> Auto-generated by StockScreen. Not financial advice.
        Day trading carries significant risk. Always do your own research.
      </p>
    </div>

    <p style="text-align:center;font-size:11px;color:#475569;margin-top:16px;">
      Powered by StockScreen | ${new Date().toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata' })} IST
    </p>
  </div>
</body>
</html>`;
}

function generateTable(picks: IndiaScore[]): string {
  let rows = '';
  for (const pick of picks) {
    const changeColor = pick.changePercent >= 0 ? '#4ade80' : '#f87171';
    const scoreColor = pick.score >= 70 ? '#4ade80' : '#fbbf24';
    const mcap = formatMarketCap(pick.marketCap);
    const sigs = pick.signals.slice(0, 4).join(' · ');

    rows += `
    <tr style="border-bottom:1px solid #1e293b;">
      <td style="padding:12px 8px;text-align:center;">
        <div style="background:${scoreColor};color:#0f172a;font-weight:800;font-size:16px;width:40px;height:40px;line-height:40px;border-radius:8px;display:inline-block;">${pick.score}</div>
      </td>
      <td style="padding:12px 8px;">
        <div style="font-weight:700;color:#f8fafc;font-size:14px;">${pick.symbol.replace('.NS', '').replace('.BO', '')}</div>
        <div style="font-size:11px;color:#94a3b8;">${pick.name.substring(0, 28)}</div>
        <div style="font-size:10px;color:#64748b;">${pick.sector} · ${mcap}</div>
      </td>
      <td style="padding:12px 8px;text-align:right;">
        <div style="font-weight:600;color:#f8fafc;font-size:14px;">₹${pick.price.toFixed(2)}</div>
        <div style="font-size:12px;color:${changeColor};font-weight:600;">${pick.changePercent >= 0 ? '+' : ''}${pick.changePercent.toFixed(1)}%</div>
      </td>
      <td style="padding:12px 8px;text-align:right;">
        <div style="font-size:12px;color:#4ade80;">Buy: ₹${pick.buyPrice.toFixed(2)}</div>
        <div style="font-size:12px;color:#f87171;">Sell: ₹${pick.sellPrice.toFixed(2)}</div>
        <div style="font-size:11px;color:#fbbf24;">Stop: ₹${pick.stopLoss.toFixed(2)}</div>
      </td>
      <td style="padding:12px 8px;">
        <div style="font-size:11px;color:#cbd5e1;line-height:1.5;">${sigs}</div>
        <div style="font-size:10px;color:#64748b;margin-top:4px;">RVOL: ${pick.relativeVolume.toFixed(1)}x${pick.rsi != null ? ` · RSI: ${pick.rsi.toFixed(0)}` : ''}${pick.beta != null ? ` · Beta: ${pick.beta.toFixed(1)}` : ''}</div>
      </td>
    </tr>`;
  }

  return `
  <table style="width:100%;border-collapse:collapse;background:#0f172a;border-radius:8px;overflow:hidden;">
    <thead>
      <tr style="background:#1e293b;">
        <th style="padding:10px 8px;text-align:center;font-size:11px;color:#94a3b8;font-weight:600;">SCORE</th>
        <th style="padding:10px 8px;text-align:left;font-size:11px;color:#94a3b8;font-weight:600;">STOCK</th>
        <th style="padding:10px 8px;text-align:right;font-size:11px;color:#94a3b8;font-weight:600;">PRICE</th>
        <th style="padding:10px 8px;text-align:right;font-size:11px;color:#94a3b8;font-weight:600;">TARGETS</th>
        <th style="padding:10px 8px;text-align:left;font-size:11px;color:#94a3b8;font-weight:600;">SIGNALS</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>`;
}

function generateNoPicksHTML(dateStr: string, niftyValue: string, sensexValue: string): string {
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background-color:#0f172a;color:#e2e8f0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <div style="max-width:600px;margin:0 auto;padding:20px;">
    <div style="background:linear-gradient(135deg,#1e293b,#334155);border-radius:12px;padding:24px;border:1px solid #475569;">
      <h1 style="margin:0 0 8px;font-size:22px;color:#f8fafc;">🇮🇳 India Pre-Market Watchlist</h1>
      <p style="margin:0 0 16px;font-size:14px;color:#94a3b8;">${dateStr}</p>
      ${niftyValue ? `<p style="font-size:13px;color:#4ade80;margin:4px 0;">${niftyValue}</p>` : ''}
      ${sensexValue ? `<p style="font-size:13px;color:#4ade80;margin:4px 0;">${sensexValue}</p>` : ''}
    </div>
    <div style="background:#1e293b;border-radius:8px;padding:24px;margin-top:16px;text-align:center;border:1px solid #334155;">
      <p style="font-size:16px;color:#fbbf24;margin:0 0 8px;font-weight:600;">No Strong Signals Today</p>
      <p style="font-size:13px;color:#94a3b8;margin:0;">Previous session didn't produce stocks meeting the minimum scoring threshold.</p>
    </div>
  </div>
</body></html>`;
}

function formatMarketCap(cap: number): string {
  const crores = cap / 10_000_000;
  if (crores >= 100_000) return `${(crores / 100_000).toFixed(1)}L Cr`;
  if (crores >= 1_000) return `${(crores / 1_000).toFixed(1)}K Cr`;
  return `${crores.toFixed(0)} Cr`;
}
