/**
 * India Pre-Market Watchlist Cron Job — Two-Pass Architecture
 *
 * Runs at 8:30 AM IST (3:00 AM UTC) on weekdays — before India market
 * open at 9:15 AM IST. No pre-market session exists for NSE/BSE, so
 * scoring uses previous session data + full technicals.
 *
 * Pass 1: Quick-score all stocks on quote-level data → top 50 candidates
 * Pass 2: Compute full technicals (RSI, MACD, ATR, consolidation) for top 50,
 *          apply full scoring with relative strength, R:R filter, entry rules
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getQuotes, getIndexSymbols, getMarketIndices } from '../_lib/yahoo-client';
import { runTwoPassScoring, DayTradePick } from '../_lib/day-trade-scorer';
import { sendEmail } from '../_lib/brevo-sender';
import { saveDailyPicks, DailyPickRow } from '../_lib/supabase-client';

const RECIPIENTS = [
  'reachtovijendra@gmail.com',
  'poojitha.challagandla@gmail.com',
];

export default async function handler(req: any, res: any) {
  const authHeader = req.headers['authorization'];
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  console.log('[IndiaPicks] Starting India pre-market watchlist (two-pass)...');
  const startTime = Date.now();

  try {
    const inSymbols = getIndexSymbols('IN');
    const inQuotes = await getQuotes(inSymbols, 'IN');
    console.log(`[IndiaPicks] Got ${inQuotes.length} India quotes`);

    const filtered = inQuotes.filter(q => q.price > 50);
    console.log(`[IndiaPicks] Pre-filtered: ${filtered.length} stocks`);

    // Get NIFTY performance for relative strength
    let indexChangePercent = 0;
    try {
      const indices = await getMarketIndices('IN');
      const nifty = indices.find(i => i.symbol === '^NSEI');
      if (nifty) indexChangePercent = nifty.changePercent;
    } catch {}

    // Run two-pass scoring
    const picks = await runTwoPassScoring({
      market: 'IN',
      quotes: filtered,
      indexChangePercent,
      maxCandidates: 50,
      maxPicks: 5,
      minScore: 40,
      highThreshold: 55,
      logPrefix: '[IndiaPicks]',
    });

    const highPriority = picks.filter(p => p.priority === 'High');
    const mediumPriority = picks.filter(p => p.priority === 'Medium');

    // Save picks to Supabase
    const today = new Date().toISOString().slice(0, 10);
    try {
      const rows: DailyPickRow[] = picks.map(p => ({
        market: 'IN' as const,
        pick_date: today,
        symbol: p.symbol,
        name: p.name,
        sector: p.sector,
        market_cap: p.marketCap,
        price: p.price,
        previous_close: p.previousClose,
        pre_market_price: null,
        gap_percent: null,
        change_percent: p.changePercent,
        volume: null,
        avg_volume: p.avgVolume,
        relative_volume: p.relativeVolume,
        pre_market_volume: null,
        pre_market_volume_percent: null,
        fifty_day_ma: p.fiftyDayMA,
        two_hundred_day_ma: p.twoHundredDayMA,
        rsi: p.rsi,
        beta: p.beta,
        buy_price: p.buyPrice,
        sell_price: p.sellPrice,
        stop_loss: p.stopLoss,
        score: p.score,
        priority: p.priority,
        signals: p.signals,
      }));
      const saved = await saveDailyPicks(rows);
      console.log(`[IndiaPicks] Saved ${saved} picks to Supabase`);
    } catch (err: any) {
      console.error('[IndiaPicks] Supabase save failed (non-fatal):', err.message);
    }

    // Fetch indices for email header
    let niftyValue = '', sensexValue = '';
    try {
      const indices = await getMarketIndices('IN');
      const nf = indices.find(i => i.symbol === '^NSEI');
      const sx = indices.find(i => i.symbol === '^BSESN');
      if (nf) niftyValue = `NIFTY 50: ${nf.price.toLocaleString()} (${nf.changePercent >= 0 ? '+' : ''}${nf.changePercent.toFixed(2)}%)`;
      if (sx) sensexValue = `SENSEX: ${sx.price.toLocaleString()} (${sx.changePercent >= 0 ? '+' : ''}${sx.changePercent.toFixed(2)}%)`;
    } catch {}

    const dateStr = new Date().toLocaleDateString('en-IN', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
      timeZone: 'Asia/Kolkata',
    });

    const html = picks.length > 0
      ? generateIndiaEmailHTML({ dateStr, niftyValue, sensexValue, highPriority, mediumPriority })
      : generateNoPicksHTML(dateStr, niftyValue, sensexValue);

    const subject = picks.length > 0
      ? `🇮🇳 India Day Trade Setups - ${dateStr} (${highPriority.length} High, ${mediumPriority.length} Medium)`
      : `🇮🇳 India Day Trade Setups - ${dateStr} (No Strong Setups)`;

    const result = await sendEmail({ to: RECIPIENTS, subject, html });
    console.log('[IndiaPicks] Email sent:', JSON.stringify(result));

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    return res.status(200).json({
      success: true, picks: picks.length,
      high: highPriority.length, medium: mediumPriority.length,
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
  dateStr: string; niftyValue: string; sensexValue: string;
  highPriority: DayTradePick[]; mediumPriority: DayTradePick[];
}): string {
  const { dateStr, niftyValue, sensexValue, highPriority, mediumPriority } = data;

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#0f172a;color:#e2e8f0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <div style="max-width:720px;margin:0 auto;padding:20px;">

    <div style="background:linear-gradient(135deg,#1e293b 0%,#334155 100%);border-radius:12px;padding:24px;margin-bottom:20px;border:1px solid #475569;">
      <h1 style="margin:0 0 4px 0;font-size:22px;color:#f8fafc;">🇮🇳 India Day Trade Setups</h1>
      <p style="margin:0 0 16px 0;font-size:14px;color:#94a3b8;">${dateStr}</p>
      <div style="display:flex;gap:12px;flex-wrap:wrap;">
        ${niftyValue ? `<span style="background:#1e3a2f;color:#4ade80;padding:6px 12px;border-radius:6px;font-size:13px;font-weight:600;">${niftyValue}</span>` : ''}
        ${sensexValue ? `<span style="background:#1e3a2f;color:#4ade80;padding:6px 12px;border-radius:6px;font-size:13px;font-weight:600;">${sensexValue}</span>` : ''}
      </div>
    </div>

    <div style="display:flex;gap:12px;margin-bottom:20px;">
      <div style="flex:1;background:#14532d;border-radius:8px;padding:16px;text-align:center;border:1px solid #22c55e33;">
        <div style="font-size:28px;font-weight:800;color:#4ade80;">${highPriority.length}</div>
        <div style="font-size:12px;color:#86efac;font-weight:600;">HIGH CONVICTION</div>
      </div>
      <div style="flex:1;background:#78350f;border-radius:8px;padding:16px;text-align:center;border:1px solid #f59e0b33;">
        <div style="font-size:28px;font-weight:800;color:#fbbf24;">${mediumPriority.length}</div>
        <div style="font-size:12px;color:#fcd34d;font-weight:600;">WATCH LIST</div>
      </div>
    </div>

    <!-- How to use -->
    <div style="background:#1a1a2e;border-radius:8px;padding:14px 16px;margin-bottom:20px;border:1px solid #4a4a6a;">
      <p style="margin:0;font-size:12px;color:#c4b5fd;font-weight:600;">📋 How to use these setups</p>
      <p style="margin:6px 0 0 0;font-size:11px;color:#94a3b8;line-height:1.6;">
        Each pick has an <strong style="color:#4ade80;">Entry Trigger</strong> — the previous day's high.
        Wait for price to break above this level with volume confirmation in the first 15 min.
        Do NOT buy at open — wait for the setup to trigger.
      </p>
    </div>

    ${highPriority.length > 0 ? `
    <div style="margin-bottom:24px;">
      <h2 style="font-size:16px;color:#4ade80;margin:0 0 12px 0;padding-bottom:8px;border-bottom:1px solid #334155;">🔥 High Conviction (Score ≥ 55)</h2>
      ${generateTable(highPriority)}
    </div>` : ''}

    ${mediumPriority.length > 0 ? `
    <div style="margin-bottom:24px;">
      <h2 style="font-size:16px;color:#fbbf24;margin:0 0 12px 0;padding-bottom:8px;border-bottom:1px solid #334155;">👀 Watch List (Score 35–54)</h2>
      ${generateTable(mediumPriority)}
    </div>` : ''}

    <div style="background:#1e293b;border-radius:8px;padding:16px;margin-bottom:20px;border:1px solid #334155;">
      <p style="margin:0 0 8px 0;font-size:13px;color:#f8fafc;font-weight:600;">Two-Pass Scoring Model</p>
      <table style="width:100%;font-size:12px;color:#94a3b8;">
        <tr><td style="padding:3px 0;color:#4ade80;font-weight:600;" colspan="2">Bullish Signals</td></tr>
        <tr><td style="padding:2px 0;">RSI sweet spot (trend-adjusted)</td><td style="text-align:right;">+15</td></tr>
        <tr><td style="padding:2px 0;">MACD bullish confirmation</td><td style="text-align:right;">+12</td></tr>
        <tr><td style="padding:2px 0;">Relative strength vs NIFTY</td><td style="text-align:right;">+10</td></tr>
        <tr><td style="padding:2px 0;">Trend alignment (above DMAs)</td><td style="text-align:right;">+10</td></tr>
        <tr><td style="padding:2px 0;">Multi-day uptrend</td><td style="text-align:right;">+8</td></tr>
        <tr><td style="padding:2px 0;">Tight consolidation (base)</td><td style="text-align:right;">+8</td></tr>
        <tr><td style="padding:2px 0;">Near 52W high / breakout</td><td style="text-align:right;">+8</td></tr>
        <tr><td style="padding:3px 0;color:#f87171;font-weight:600;" colspan="2">Penalties</td></tr>
        <tr><td style="padding:2px 0;">RSI > 75 (overbought)</td><td style="text-align:right;">−10</td></tr>
        <tr><td style="padding:2px 0;">Bearish MACD</td><td style="text-align:right;">−8</td></tr>
        <tr><td style="padding:2px 0;">Below both DMAs</td><td style="text-align:right;">−8</td></tr>
        <tr><td style="padding:2px 0;">R:R < 2:1</td><td style="text-align:right;">−5</td></tr>
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

function generateTable(picks: DayTradePick[]): string {
  let rows = '';
  for (const pick of picks) {
    const scoreColor = pick.priority === 'High' ? '#4ade80' : '#fbbf24';
    const setupBg = pick.setupType === 'breakout' ? '#1e3a5f' : pick.setupType === 'pullback' ? '#3b1f2b' : '#1e293b';
    const setupColor = pick.setupType === 'breakout' ? '#60a5fa' : pick.setupType === 'pullback' ? '#f472b6' : '#94a3b8';
    const setupIcon = pick.setupType === 'breakout' ? '🔺' : pick.setupType === 'pullback' ? '🔄' : '➡️';
    const setupLabel = pick.setupType.charAt(0).toUpperCase() + pick.setupType.slice(1);
    const mcap = formatMarketCap(pick.marketCap);
    const sigs = pick.signals.slice(0, 5).join(' · ');
    const rrColor = pick.rewardRiskRatio >= 2 ? '#4ade80' : '#f87171';

    rows += `
    <tr style="border-bottom:1px solid #1e293b;">
      <td style="padding:12px 8px;text-align:center;vertical-align:top;">
        <div style="background:${scoreColor};color:#0f172a;font-weight:800;font-size:16px;width:40px;height:40px;line-height:40px;border-radius:8px;display:inline-block;">${pick.score}</div>
        <div style="background:${setupBg};color:${setupColor};font-size:9px;padding:2px 6px;border-radius:4px;margin-top:4px;display:inline-block;">${setupIcon} ${setupLabel}</div>
      </td>
      <td style="padding:12px 8px;vertical-align:top;">
        <div style="font-weight:700;color:#f8fafc;font-size:14px;">${pick.symbol.replace('.NS', '').replace('.BO', '')}${pick.hasCatalyst ? ' <span style="background:#7c3aed;color:#fff;font-size:9px;padding:2px 5px;border-radius:3px;vertical-align:middle;">CATALYST</span>' : ''}</div>
        <div style="font-size:11px;color:#94a3b8;">${pick.name.substring(0, 28)}</div>
        <div style="font-size:10px;color:#64748b;">${pick.sector} · ${mcap}</div>
        ${pick.catalystLabel ? `<div style="font-size:10px;color:#c4b5fd;margin-top:1px;">${pick.catalystLabel}</div>` : ''}
        ${pick.relativeStrength != null ? `<div style="font-size:10px;color:${pick.relativeStrength > 0 ? '#4ade80' : '#f87171'};">RS: ${pick.relativeStrength > 0 ? '+' : ''}${pick.relativeStrength.toFixed(1)}% vs NIFTY</div>` : ''}
      </td>
      <td style="padding:12px 8px;text-align:right;vertical-align:top;">
        <div style="font-weight:600;color:#f8fafc;font-size:14px;">₹${pick.price.toFixed(2)}</div>
        <div style="font-size:11px;color:${pick.changePercent >= 0 ? '#4ade80' : '#f87171'};">${pick.changePercent >= 0 ? '+' : ''}${pick.changePercent.toFixed(1)}%</div>
        <div style="font-size:10px;color:#94a3b8;">RSI: ${pick.rsi != null ? pick.rsi.toFixed(0) : '–'}${pick.beta != null ? ` · β${pick.beta.toFixed(1)}` : ''}</div>
        ${pick.atrPercent != null ? `<div style="font-size:10px;color:#94a3b8;">ATR: ${pick.atrPercent.toFixed(1)}%</div>` : ''}
      </td>
      <td style="padding:12px 8px;text-align:right;vertical-align:top;">
        <div style="font-size:12px;color:#c4b5fd;font-weight:700;">▶ ₹${pick.entryTrigger.toFixed(2)}</div>
        <div style="font-size:11px;color:#4ade80;">T: ₹${pick.sellPrice.toFixed(2)}</div>
        <div style="font-size:11px;color:#f87171;">S: ₹${pick.stopLoss.toFixed(2)}</div>
        <div style="font-size:10px;color:${rrColor};font-weight:600;">R:R ${pick.rewardRiskRatio.toFixed(1)}</div>
      </td>
    </tr>
    <tr style="border-bottom:1px solid #334155;">
      <td colspan="4" style="padding:4px 8px 10px 8px;">
        <div style="font-size:11px;color:#cbd5e1;line-height:1.4;">${sigs}</div>
        <div style="font-size:10px;color:#a78bfa;margin-top:4px;font-style:italic;">${pick.entryRule}</div>
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
        <th style="padding:10px 8px;text-align:right;font-size:11px;color:#94a3b8;font-weight:600;">ENTRY / TARGET / STOP</th>
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
      <h1 style="margin:0 0 8px;font-size:22px;color:#f8fafc;">🇮🇳 India Day Trade Setups</h1>
      <p style="margin:0 0 16px;font-size:14px;color:#94a3b8;">${dateStr}</p>
      ${niftyValue ? `<p style="font-size:13px;color:#4ade80;margin:4px 0;">${niftyValue}</p>` : ''}
      ${sensexValue ? `<p style="font-size:13px;color:#4ade80;margin:4px 0;">${sensexValue}</p>` : ''}
    </div>
    <div style="background:#1e293b;border-radius:8px;padding:24px;margin-top:16px;text-align:center;border:1px solid #334155;">
      <p style="font-size:16px;color:#fbbf24;margin:0 0 8px;font-weight:600;">No High-Conviction Setups Today</p>
      <p style="font-size:13px;color:#94a3b8;margin:0;">No stocks passed the two-pass scoring model. Sitting out choppy sessions is a winning strategy.</p>
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
