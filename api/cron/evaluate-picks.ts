/**
 * Evaluate Picks Cron — Runs next morning to check actual outcomes
 *
 * Schedule: 2:30 AM UTC daily (Tue-Sat) = 10:30 PM EDT / 8:00 AM IST
 * This runs BEFORE the picks emails, so the UI shows updated win rates.
 *
 * For each unevaluated pick from previous trading days:
 * 1. Fetch the actual intraday OHLC for that day from Yahoo Finance
 * 2. Check if sell target was hit (high >= sell_price)
 * 3. Check if stop loss was hit (low <= stop_loss)
 * 4. If both hit, use 5-min candles to determine which happened first
 * 5. Update Supabase with outcome, actual prices, and P&L %
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getSupabaseClient } from '../_lib/supabase-client';
import { fetchHistoricalOHLC } from '../_lib/day-trade-scorer';
import https from 'https';

interface PendingPick {
  id: number;
  symbol: string;
  market: string;
  pick_date: string;
  buy_price: number;
  sell_price: number;
  stop_loss: number;
}

/**
 * Fetch intraday 5-min candles for a specific date to determine
 * which target was hit first (when both high >= target AND low <= stop).
 */
async function fetchIntradayCandles(
  symbol: string,
  date: string
): Promise<{ timestamps: number[]; highs: number[]; lows: number[]; closes: number[] } | null> {
  try {
    // Convert date to Unix timestamps for period1/period2
    const startOfDay = Math.floor(new Date(`${date}T00:00:00Z`).getTime() / 1000);
    const endOfDay = startOfDay + 86400;

    const response = await new Promise<{ statusCode: number; body: string }>((resolve, reject) => {
      const req = https.request({
        hostname: 'query1.finance.yahoo.com',
        port: 443,
        path: `/v8/finance/chart/${encodeURIComponent(symbol)}?interval=5m&period1=${startOfDay}&period2=${endOfDay}`,
        method: 'GET',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': '*/*',
        },
      }, (res) => {
        let data = '';
        res.on('data', (chunk: Buffer) => (data += chunk.toString()));
        res.on('end', () => resolve({ statusCode: res.statusCode || 500, body: data }));
      });
      req.on('error', reject);
      req.setTimeout(15000, () => { req.destroy(); reject(new Error('timeout')); });
      req.end();
    });

    if (response.statusCode === 200) {
      const data = JSON.parse(response.body);
      const result = data.chart?.result?.[0];
      if (result?.indicators?.quote?.[0] && result?.timestamp) {
        const q = result.indicators.quote[0];
        const timestamps: number[] = [];
        const highs: number[] = [];
        const lows: number[] = [];
        const closes: number[] = [];

        for (let i = 0; i < result.timestamp.length; i++) {
          if (q.high?.[i] != null && q.low?.[i] != null && q.close?.[i] != null) {
            timestamps.push(result.timestamp[i]);
            highs.push(q.high[i]);
            lows.push(q.low[i]);
            closes.push(q.close[i]);
          }
        }
        return { timestamps, highs, lows, closes };
      }
    }
  } catch (err: any) {
    console.error(`[Evaluate] Failed to fetch intraday for ${symbol}: ${err.message}`);
  }
  return null;
}

/**
 * Evaluate a single pick against actual price data.
 */
function evaluatePick(
  pick: PendingPick,
  dailyHigh: number,
  dailyLow: number,
  dailyClose: number,
  dailyOpen: number,
  intraday: { timestamps: number[]; highs: number[]; lows: number[]; closes: number[] } | null
): { outcome: 'hit-target' | 'hit-sl' | 'no-trigger'; pnlPercent: number } {
  const hitTarget = dailyHigh >= pick.sell_price;
  const hitStop = dailyLow <= pick.stop_loss;

  // Case 1: Target hit, stop not hit → clear winner
  if (hitTarget && !hitStop) {
    const pnl = ((pick.sell_price - pick.buy_price) / pick.buy_price) * 100;
    return { outcome: 'hit-target', pnlPercent: Math.round(pnl * 100) / 100 };
  }

  // Case 2: Stop hit, target not hit → clear loser
  if (hitStop && !hitTarget) {
    const pnl = ((pick.stop_loss - pick.buy_price) / pick.buy_price) * 100;
    return { outcome: 'hit-sl', pnlPercent: Math.round(pnl * 100) / 100 };
  }

  // Case 3: Both hit → use intraday data to determine which was first
  if (hitTarget && hitStop) {
    if (intraday && intraday.highs.length > 0) {
      // Walk through 5-min candles and find which level was breached first
      for (let i = 0; i < intraday.highs.length; i++) {
        if (intraday.lows[i] <= pick.stop_loss) {
          // Stop hit first
          const pnl = ((pick.stop_loss - pick.buy_price) / pick.buy_price) * 100;
          return { outcome: 'hit-sl', pnlPercent: Math.round(pnl * 100) / 100 };
        }
        if (intraday.highs[i] >= pick.sell_price) {
          // Target hit first
          const pnl = ((pick.sell_price - pick.buy_price) / pick.buy_price) * 100;
          return { outcome: 'hit-target', pnlPercent: Math.round(pnl * 100) / 100 };
        }
      }
    }
    // Fallback if no intraday data: conservative assumption — stop hit first
    const pnl = ((pick.stop_loss - pick.buy_price) / pick.buy_price) * 100;
    return { outcome: 'hit-sl', pnlPercent: Math.round(pnl * 100) / 100 };
  }

  // Case 4: Neither hit → stock didn't reach entry trigger or closed flat
  // Use closing price for P&L
  const pnl = ((dailyClose - pick.buy_price) / pick.buy_price) * 100;
  return { outcome: 'no-trigger', pnlPercent: Math.round(pnl * 100) / 100 };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const authHeader = req.headers['authorization'];
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  console.log('[Evaluate] Starting pick evaluation...');
  const startTime = Date.now();

  const supabase = getSupabaseClient();
  if (!supabase) {
    return res.status(500).json({ error: 'Supabase not configured' });
  }

  // Get all unevaluated picks from past dates
  const today = new Date().toISOString().slice(0, 10);
  const { data: pendingPicks, error: fetchError } = await supabase
    .from('daily_picks')
    .select('id, symbol, market, pick_date, buy_price, sell_price, stop_loss')
    .lt('pick_date', today)
    .is('outcome', null)
    .order('pick_date', { ascending: false })
    .limit(50);

  if (fetchError) {
    console.error('[Evaluate] Failed to fetch pending picks:', fetchError.message);
    return res.status(500).json({ error: fetchError.message });
  }

  if (!pendingPicks || pendingPicks.length === 0) {
    console.log('[Evaluate] No pending picks to evaluate');
    return res.status(200).json({ success: true, evaluated: 0 });
  }

  console.log(`[Evaluate] Found ${pendingPicks.length} pending picks to evaluate`);

  let evaluated = 0;
  let hitTarget = 0;
  let hitStop = 0;
  let noTrigger = 0;

  // Process in batches of 5 to avoid rate limiting
  const batchSize = 5;
  for (let i = 0; i < pendingPicks.length; i += batchSize) {
    const batch = pendingPicks.slice(i, i + batchSize);
    const promises = batch.map(async (pick: PendingPick) => {
      try {
        // Fetch daily OHLC for the pick date
        const { highs, lows, closes } = await fetchHistoricalOHLC(pick.symbol, '5d');

        if (closes.length === 0) {
          console.log(`[Evaluate] No data for ${pick.symbol}, skipping`);
          return;
        }

        // Use the last available candle (most recent day)
        const dailyHigh = highs[highs.length - 1];
        const dailyLow = lows[lows.length - 1];
        const dailyClose = closes[closes.length - 1];
        const dailyOpen = closes.length >= 2 ? closes[closes.length - 2] : dailyClose; // prev close as proxy for open

        // Fetch intraday for tie-breaking (only if needed for accuracy)
        let intraday = null;
        if (dailyHigh >= pick.sell_price && dailyLow <= pick.stop_loss) {
          intraday = await fetchIntradayCandles(pick.symbol, pick.pick_date);
        }

        const result = evaluatePick(pick, dailyHigh, dailyLow, dailyClose, dailyOpen, intraday);

        // Update Supabase
        const { error: updateError } = await supabase
          .from('daily_picks')
          .update({
            outcome: result.outcome,
            actual_high: dailyHigh,
            actual_low: dailyLow,
            actual_close: dailyClose,
            actual_open: dailyOpen,
            pnl_percent: result.pnlPercent,
            evaluated_at: new Date().toISOString(),
          })
          .eq('id', pick.id);

        if (updateError) {
          console.error(`[Evaluate] Failed to update ${pick.symbol}: ${updateError.message}`);
          return;
        }

        evaluated++;
        if (result.outcome === 'hit-target') hitTarget++;
        else if (result.outcome === 'hit-sl') hitStop++;
        else noTrigger++;

        console.log(`[Evaluate] ${pick.symbol} (${pick.pick_date}): ${result.outcome} (${result.pnlPercent > 0 ? '+' : ''}${result.pnlPercent}%)`);
      } catch (err: any) {
        console.error(`[Evaluate] Error evaluating ${pick.symbol}: ${err.message}`);
      }
    });

    await Promise.allSettled(promises);
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  const winRate = hitTarget + hitStop > 0
    ? Math.round((hitTarget / (hitTarget + hitStop)) * 100)
    : null;

  console.log(`[Evaluate] Done in ${elapsed}s: ${evaluated} evaluated, ${hitTarget} wins, ${hitStop} losses, ${noTrigger} no-trigger. Win rate: ${winRate ?? 'N/A'}%`);

  return res.status(200).json({
    success: true,
    evaluated,
    hitTarget,
    hitStop,
    noTrigger,
    winRate: winRate != null ? `${winRate}%` : 'N/A',
    elapsed: `${elapsed}s`,
  });
}
