/**
 * Evaluate Picks Cron — Checks actual outcomes for past day trade picks
 *
 * Schedule: 2:30 AM UTC daily (Tue-Sat)
 *
 * For each unevaluated pick:
 * 1. Fetch daily OHLC for the SPECIFIC pick date (not just latest day)
 * 2. Check if entry trigger was reached (high >= buy_price)
 * 3. If triggered: check target (high >= sell_price) and stop (low <= stop_loss)
 * 4. If neither target nor stop: exit at close (real P&L)
 * 5. Update Supabase with outcome and actual prices
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getSupabaseClient } from '../_lib/supabase-client';
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

function httpsGet(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': '*/*',
      },
    }, (res) => {
      let data = '';
      res.on('data', (chunk: Buffer) => (data += chunk.toString()));
      res.on('end', () => resolve(data));
    });
    req.on('error', reject);
    req.setTimeout(20000, () => { req.destroy(); reject(new Error('timeout')); });
  });
}

/**
 * Fetch OHLC for a specific date by getting recent history and finding the right bar.
 */
async function fetchOHLCForDate(symbol: string, pickDate: string): Promise<{
  open: number; high: number; low: number; close: number;
} | null> {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=10d`;
    const body = await httpsGet(url);
    const data = JSON.parse(body);
    const result = data.chart?.result?.[0];
    if (!result?.indicators?.quote?.[0] || !result?.timestamp) return null;

    const q = result.indicators.quote[0];
    const timestamps = result.timestamp;

    // Find the bar matching the pick date
    for (let i = 0; i < timestamps.length; i++) {
      const barDate = new Date(timestamps[i] * 1000).toISOString().slice(0, 10);
      if (barDate === pickDate && q.open?.[i] != null && q.high?.[i] != null && q.low?.[i] != null && q.close?.[i] != null) {
        return { open: q.open[i], high: q.high[i], low: q.low[i], close: q.close[i] };
      }
    }

    // If exact date not found, try matching by proximity (timezone offset can shift dates)
    const pickTs = new Date(pickDate + 'T12:00:00Z').getTime() / 1000;
    let closest = -1;
    let closestDiff = Infinity;
    for (let i = 0; i < timestamps.length; i++) {
      const diff = Math.abs(timestamps[i] - pickTs);
      if (diff < closestDiff && q.close?.[i] != null) {
        closestDiff = diff;
        closest = i;
      }
    }

    if (closest >= 0 && closestDiff < 86400 * 2) {
      return { open: q.open[closest], high: q.high[closest], low: q.low[closest], close: q.close[closest] };
    }

    return null;
  } catch (err: any) {
    console.error(`[Evaluate] Failed to fetch OHLC for ${symbol} on ${pickDate}: ${err.message}`);
    return null;
  }
}

type Outcome = 'hit-target' | 'hit-sl' | 'exit-at-close' | 'no-trigger';

/**
 * Evaluate a single pick against actual OHLC for the pick date.
 */
function evaluatePick(
  pick: PendingPick,
  ohlc: { open: number; high: number; low: number; close: number }
): { outcome: Outcome; pnlPercent: number; entryPrice: number; exitPrice: number } {
  const buyPrice = Number(pick.buy_price);
  const sellPrice = Number(pick.sell_price);
  const stopLoss = Number(pick.stop_loss);

  // Step 1: Did the stock reach the entry trigger (buy_price)?
  if (ohlc.high < buyPrice) {
    // Entry never triggered — no trade
    return { outcome: 'no-trigger', pnlPercent: 0, entryPrice: 0, exitPrice: 0 };
  }

  // Trade was triggered. Entry at buy_price (or open if it gapped above)
  const entryPrice = Math.max(buyPrice, Math.min(ohlc.open, buyPrice * 1.005));

  // Step 2: Check if target was hit
  const hitTarget = ohlc.high >= sellPrice;
  // Step 3: Check if stop was hit
  const hitStop = ohlc.low <= stopLoss;

  if (hitTarget && !hitStop) {
    const pnl = ((sellPrice - entryPrice) / entryPrice) * 100;
    return { outcome: 'hit-target', pnlPercent: round2(pnl), entryPrice, exitPrice: sellPrice };
  }

  if (hitStop && !hitTarget) {
    const pnl = ((stopLoss - entryPrice) / entryPrice) * 100;
    return { outcome: 'hit-sl', pnlPercent: round2(pnl), entryPrice, exitPrice: stopLoss };
  }

  if (hitTarget && hitStop) {
    // Both hit — conservative: assume stop hit first
    const pnl = ((stopLoss - entryPrice) / entryPrice) * 100;
    return { outcome: 'hit-sl', pnlPercent: round2(pnl), entryPrice, exitPrice: stopLoss };
  }

  // Neither target nor stop hit — exit at close
  const pnl = ((ohlc.close - entryPrice) / entryPrice) * 100;
  return { outcome: 'exit-at-close', pnlPercent: round2(pnl), entryPrice, exitPrice: ohlc.close };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
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
  let exitAtClose = 0;
  let noTrigger = 0;

  const batchSize = 5;
  for (let i = 0; i < pendingPicks.length; i += batchSize) {
    const batch = pendingPicks.slice(i, i + batchSize);
    const promises = batch.map(async (pick: PendingPick) => {
      try {
        // Fetch OHLC specifically for the pick date
        const ohlc = await fetchOHLCForDate(pick.symbol, pick.pick_date);

        if (!ohlc) {
          console.log(`[Evaluate] No data for ${pick.symbol} on ${pick.pick_date}, skipping`);
          return;
        }

        const result = evaluatePick(pick, ohlc);

        // Update Supabase
        const { error: updateError } = await supabase
          .from('daily_picks')
          .update({
            outcome: result.outcome,
            actual_high: ohlc.high,
            actual_low: ohlc.low,
            actual_close: ohlc.close,
            actual_open: ohlc.open,
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
        else if (result.outcome === 'exit-at-close') exitAtClose++;
        else noTrigger++;

        console.log(`[Evaluate] ${pick.symbol} (${pick.pick_date}): ${result.outcome} (${result.pnlPercent > 0 ? '+' : ''}${result.pnlPercent}%) [entry: ${result.entryPrice.toFixed(2)}, exit: ${result.exitPrice.toFixed(2)}]`);
      } catch (err: any) {
        console.error(`[Evaluate] Error evaluating ${pick.symbol}: ${err.message}`);
      }
    });

    await Promise.allSettled(promises);
  }

  const totalDecided = hitTarget + hitStop + exitAtClose;
  const wins = hitTarget + exitAtClose; // exit-at-close counted by actual P&L
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

  console.log(`[Evaluate] Done in ${elapsed}s: ${evaluated} evaluated, ${hitTarget} target, ${hitStop} stopped, ${exitAtClose} exit-at-close, ${noTrigger} no-trigger`);

  return res.status(200).json({
    success: true,
    evaluated,
    hitTarget,
    hitStop,
    exitAtClose,
    noTrigger,
    elapsed: `${elapsed}s`,
  });
}
