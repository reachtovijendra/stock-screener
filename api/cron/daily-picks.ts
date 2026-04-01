/**
 * US Pre-Market Watchlist Cron Job — Two-Pass Architecture
 *
 * Runs at 9 AM EDT (1 PM UTC) on weekdays — before US market open at 9:30 AM.
 *
 * Pass 1: Quick-score all ~340 stocks on quote-level data → top 50 candidates
 * Pass 2: Compute full technicals (RSI, MACD, ATR, consolidation) for top 50,
 *          apply full scoring with relative strength, R:R filter, entry rules
 *
 * Email includes exact entry triggers, stops, targets, and entry rules.
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

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const authHeader = req.headers['authorization'];
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    console.log('[USPicks] Unauthorized request');
    return res.status(401).json({ error: 'Unauthorized' });
  }

  console.log('[USPicks] Starting US pre-market watchlist (two-pass)...');
  const startTime = Date.now();

  try {
    // --- 1. Fetch US stock quotes ---
    const usSymbols = getIndexSymbols('US');
    const usQuotes = await getQuotes(usSymbols, 'US');
    console.log(`[USPicks] Got ${usQuotes.length} US quotes`);

    // Pre-filter on price/market cap
    const filtered = usQuotes.filter(q => q.price > 5 && q.marketCap > 1_000_000_000);
    console.log(`[USPicks] Pre-filtered: ${filtered.length} stocks`);

    // --- 2. Get index performance for relative strength ---
    let indexChangePercent = 0;
    try {
      const indices = await getMarketIndices('US');
      const sp = indices.find(i => i.symbol === '^GSPC');
      if (sp) indexChangePercent = sp.changePercent;
    } catch {}

    // --- 3. Run two-pass scoring ---
    const picks = await runTwoPassScoring({
      market: 'US',
      quotes: filtered,
      indexChangePercent,
      maxCandidates: 50,
      maxPicks: 5,
      minScore: 40,
      highThreshold: 55,
      logPrefix: '[USPicks]',
    });

    const highPriority = picks.filter(p => p.priority === 'High');
    const mediumPriority = picks.filter(p => p.priority === 'Medium');

    // --- 4. Save picks to Supabase ---
    const today = new Date().toISOString().slice(0, 10);
    try {
      const rows: DailyPickRow[] = picks.map(p => ({
        market: 'US' as const,
        pick_date: today,
        symbol: p.symbol,
        name: p.name,
        sector: p.sector,
        market_cap: p.marketCap,
        price: p.price,
        previous_close: p.previousClose,
        pre_market_price: p.preMarketPrice,
        gap_percent: p.gapPercent,
        change_percent: p.changePercent,
        volume: null,
        avg_volume: p.avgVolume,
        relative_volume: p.relativeVolume,
        pre_market_volume: p.preMarketVolume,
        pre_market_volume_percent: p.preMarketVolume && p.avgVolume > 0 ? (p.preMarketVolume / p.avgVolume) * 100 : null,
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
      console.log(`[USPicks] Saved ${saved} picks to Supabase`);
    } catch (err: any) {
      console.error('[USPicks] Supabase save failed (non-fatal):', err.message);
    }

    // --- 5. Fetch market indices for email header ---
    let spValue = '', djValue = '';
    try {
      const usIndices = await getMarketIndices('US');
      const sp = usIndices.find(i => i.symbol === '^GSPC');
      const dj = usIndices.find(i => i.symbol === '^DJI');
      if (sp) spValue = `S&P 500: ${sp.price.toLocaleString()} (${sp.changePercent >= 0 ? '+' : ''}${sp.changePercent.toFixed(2)}%)`;
      if (dj) djValue = `Dow Jones: ${dj.price.toLocaleString()} (${dj.changePercent >= 0 ? '+' : ''}${dj.changePercent.toFixed(2)}%)`;
    } catch {}

    // --- 6. Generate and send email ---
    const dateStr = new Date().toLocaleDateString('en-US', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
      timeZone: 'America/New_York',
    });

    const html = picks.length > 0
      ? generateEmailHTML({ dateStr, spValue, djValue, highPriority, mediumPriority })
      : generateNoPicksHTML(dateStr, spValue, djValue);

    const subject = picks.length > 0
      ? `🇺🇸 US Day Trade Setups - ${dateStr} (${highPriority.length} High, ${mediumPriority.length} Medium)`
      : `🇺🇸 US Day Trade Setups - ${dateStr} (No Strong Setups)`;

    const result = await sendEmail({ to: RECIPIENTS, subject, html });
    console.log('[USPicks] Email sent:', JSON.stringify(result));

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`[USPicks] Completed in ${elapsed}s`);

    return res.status(200).json({
      success: true, picks: picks.length,
      high: highPriority.length, medium: mediumPriority.length,
      elapsed: `${elapsed}s`,
    });
  } catch (error: any) {
    console.error('[USPicks] Fatal error:', error);
    return res.status(500).json({ error: 'Failed to generate watchlist', message: error.message });
  }
}

// ---------------------------------------------------------------------------
// Email HTML Generation
// ---------------------------------------------------------------------------

function generateEmailHTML(data: {
  dateStr: string; spValue: string; djValue: string;
  highPriority: DayTradePick[]; mediumPriority: DayTradePick[];
}): string {
  const { dateStr, spValue, djValue, highPriority, mediumPriority } = data;

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>US Day Trade Setups</title>
</head>
<body style="margin:0;padding:0;background-color:#0f172a;color:#e2e8f0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
  <div style="max-width:720px;margin:0 auto;padding:20px;">

    <!-- Header -->
    <div style="background:linear-gradient(135deg,#1e293b 0%,#334155 100%);border-radius:12px;padding:24px;margin-bottom:20px;border:1px solid #475569;">
      <h1 style="margin:0 0 4px 0;font-size:22px;color:#f8fafc;">🇺🇸 US Day Trade Setups</h1>
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
        Each pick includes an <strong style="color:#4ade80;">Entry Trigger</strong> — the price level where the trade activates.
        Wait for price to break the trigger level, confirm it holds above VWAP for 5 min, then enter.
        Do NOT chase if price has already run past the Sell target.
      </p>
    </div>

    ${highPriority.length > 0 ? `
    <div style="margin-bottom:24px;">
      <h2 style="font-size:16px;color:#4ade80;margin:0 0 12px 0;padding-bottom:8px;border-bottom:1px solid #334155;">
        🔥 High Conviction (Score ≥ 55)
      </h2>
      ${generatePicksTable(highPriority, 'US')}
    </div>` : ''}

    ${mediumPriority.length > 0 ? `
    <div style="margin-bottom:24px;">
      <h2 style="font-size:16px;color:#fbbf24;margin:0 0 12px 0;padding-bottom:8px;border-bottom:1px solid #334155;">
        👀 Watch List (Score 35–54)
      </h2>
      ${generatePicksTable(mediumPriority, 'US')}
    </div>` : ''}

    <!-- Scoring Legend -->
    <div style="background:#1e293b;border-radius:8px;padding:16px;margin-bottom:20px;border:1px solid #334155;">
      <p style="margin:0 0 8px 0;font-size:13px;color:#f8fafc;font-weight:600;">Two-Pass Scoring Model</p>
      <table style="width:100%;font-size:12px;color:#94a3b8;">
        <tr><td style="padding:3px 0;color:#4ade80;font-weight:600;" colspan="2">Bullish Signals</td></tr>
        <tr><td style="padding:2px 0;">RSI sweet spot (trend-adjusted)</td><td style="text-align:right;">+15</td></tr>
        <tr><td style="padding:2px 0;">MACD bullish confirmation</td><td style="text-align:right;">+12</td></tr>
        <tr><td style="padding:2px 0;">Relative strength vs S&P</td><td style="text-align:right;">+10</td></tr>
        <tr><td style="padding:2px 0;">Trend alignment (above DMAs)</td><td style="text-align:right;">+10</td></tr>
        <tr><td style="padding:2px 0;">Gap + volume confirmation</td><td style="text-align:right;">+10</td></tr>
        <tr><td style="padding:2px 0;">Multi-day uptrend</td><td style="text-align:right;">+8</td></tr>
        <tr><td style="padding:2px 0;">Near 52W high / breakout</td><td style="text-align:right;">+8</td></tr>
        <tr><td style="padding:2px 0;">Tight consolidation (base)</td><td style="text-align:right;">+8</td></tr>
        <tr><td style="padding:3px 0;color:#f87171;font-weight:600;" colspan="2">Penalties</td></tr>
        <tr><td style="padding:2px 0;">RSI > 75 (overbought)</td><td style="text-align:right;">−10</td></tr>
        <tr><td style="padding:2px 0;">Bearish MACD</td><td style="text-align:right;">−8</td></tr>
        <tr><td style="padding:2px 0;">Below both DMAs</td><td style="text-align:right;">−8</td></tr>
        <tr><td style="padding:2px 0;">R:R < 2:1</td><td style="text-align:right;">−5</td></tr>
      </table>
    </div>

    <!-- Disclaimer -->
    <div style="background:#1e293b;border-radius:8px;padding:16px;margin-top:20px;border:1px solid #334155;">
      <p style="margin:0;font-size:11px;color:#64748b;line-height:1.5;">
        <strong>Disclaimer:</strong> Auto-generated by StockScreen. Not financial advice.
        Day trading carries significant risk. Always do your own research.
      </p>
    </div>

    <p style="text-align:center;font-size:11px;color:#475569;margin-top:16px;">
      Powered by StockScreen | ${new Date().toLocaleTimeString('en-US', { timeZone: 'America/New_York' })} EST
    </p>
  </div>
</body>
</html>`;
}

function generatePicksTable(picks: DayTradePick[], market: string): string {
  let rows = '';
  for (const pick of picks) {
    const scoreColor = pick.priority === 'High' ? '#4ade80' : '#fbbf24';
    const curr = market === 'IN' ? '₹' : '$';
    const sigs = pick.signals.slice(0, 5).join(' · ');
    const mcap = formatMarketCap(pick.marketCap, market);
    const rrColor = pick.rewardRiskRatio >= 2 ? '#4ade80' : '#f87171';

    rows += `
    <tr style="border-bottom:1px solid #1e293b;">
      <td style="padding:12px 8px;text-align:center;vertical-align:top;">
        <div style="background:${scoreColor};color:#0f172a;font-weight:800;font-size:16px;width:40px;height:40px;line-height:40px;border-radius:8px;display:inline-block;">${pick.score}</div>
      </td>
      <td style="padding:12px 8px;vertical-align:top;">
        <div style="font-weight:700;color:#f8fafc;font-size:14px;">${pick.symbol.replace('.NS', '').replace('.BO', '')}${pick.hasCatalyst ? ' <span style="background:#7c3aed;color:#fff;font-size:9px;padding:2px 5px;border-radius:3px;vertical-align:middle;">CATALYST</span>' : ''}</div>
        <div style="font-size:11px;color:#94a3b8;margin-top:2px;">${pick.name.substring(0, 28)}</div>
        <div style="font-size:10px;color:#64748b;">${pick.sector} · ${mcap}</div>
        ${pick.catalystLabel ? `<div style="font-size:10px;color:#c4b5fd;margin-top:1px;">${pick.catalystLabel}</div>` : ''}
        ${pick.relativeStrength != null ? `<div style="font-size:10px;color:${pick.relativeStrength > 0 ? '#4ade80' : '#f87171'};">RS: ${pick.relativeStrength > 0 ? '+' : ''}${pick.relativeStrength.toFixed(1)}%</div>` : ''}
      </td>
      <td style="padding:12px 8px;text-align:right;vertical-align:top;">
        <div style="font-weight:600;color:#f8fafc;font-size:14px;">${curr}${pick.price.toFixed(2)}</div>
        ${pick.preMarketPrice ? `<div style="font-size:11px;color:${pick.gapPercent >= 0 ? '#4ade80' : '#f87171'};">Gap ${pick.gapPercent >= 0 ? '+' : ''}${pick.gapPercent.toFixed(1)}%</div>` : ''}
        <div style="font-size:10px;color:#94a3b8;">RSI: ${pick.rsi != null ? pick.rsi.toFixed(0) : '–'}${pick.beta != null ? ` · β${pick.beta.toFixed(1)}` : ''}</div>
        ${pick.atrPercent != null ? `<div style="font-size:10px;color:#94a3b8;">ATR: ${pick.atrPercent.toFixed(1)}%</div>` : ''}
      </td>
      <td style="padding:12px 8px;text-align:right;vertical-align:top;">
        <div style="font-size:12px;color:#c4b5fd;font-weight:700;">▶ ${curr}${pick.entryTrigger.toFixed(2)}</div>
        <div style="font-size:11px;color:#4ade80;">T: ${curr}${pick.sellPrice.toFixed(2)}</div>
        <div style="font-size:11px;color:#f87171;">S: ${curr}${pick.stopLoss.toFixed(2)}</div>
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

function generateNoPicksHTML(dateStr: string, spValue: string, djValue: string): string {
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background-color:#0f172a;color:#e2e8f0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <div style="max-width:600px;margin:0 auto;padding:20px;">
    <div style="background:linear-gradient(135deg,#1e293b,#334155);border-radius:12px;padding:24px;border:1px solid #475569;">
      <h1 style="margin:0 0 8px;font-size:22px;color:#f8fafc;">🇺🇸 US Day Trade Setups</h1>
      <p style="margin:0 0 16px;font-size:14px;color:#94a3b8;">${dateStr}</p>
      ${spValue ? `<p style="font-size:13px;color:#60a5fa;margin:4px 0;">${spValue}</p>` : ''}
      ${djValue ? `<p style="font-size:13px;color:#60a5fa;margin:4px 0;">${djValue}</p>` : ''}
    </div>
    <div style="background:#1e293b;border-radius:8px;padding:24px;margin-top:16px;text-align:center;border:1px solid #334155;">
      <p style="font-size:16px;color:#fbbf24;margin:0 0 8px;font-weight:600;">No High-Conviction Setups Today</p>
      <p style="font-size:13px;color:#94a3b8;margin:0;">No stocks passed the two-pass scoring model. This happens during low-volatility or choppy sessions — sitting out is a valid strategy.</p>
    </div>
  </div>
</body></html>`;
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
