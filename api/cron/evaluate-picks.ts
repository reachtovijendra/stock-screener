/**
 * Evaluate Picks Cron — Checks actual outcomes for past day trade picks
 *
 * Schedule: 2:30 AM UTC daily (Tue-Sat)
 *
 * Trade model = OPENING-MOMENTUM (see day-trade-scorer.ts): the trade is
 * entered at the OPEN, held through the session, and exited at the close unless
 * a protective stop or stretch target is touched first.
 *
 * For each unevaluated pick:
 * 1. Fetch daily OHLC for the SPECIFIC pick date (not just latest day)
 * 2. Enter at the actual open
 * 3. Apply the intended stop% and target% (derived from the stored buy/stop/
 *    sell levels) to the actual open — gap-robust
 * 4. Outcome: stop hit (low <= stop), target hit (high >= target), else exit at
 *    close (real P&L). If both stop and target trade in the same daily bar, the
 *    stop is assumed first (conservative — daily bars hide intraday sequence)
 * 5. Update Supabase with outcome and actual prices
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getSupabaseClient } from '../_lib/supabase-client';
import https from 'https';

interface PendingPick {
  id: number;
  symbol: string;
  market: string;
  model: string;   // 'old' (breakout entry) or 'new' (opening-momentum)
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

    // If exact date not found, try matching by proximity — but ONLY to absorb a
    // timezone date-shift (a daily bar is stamped at the local session open, so
    // its UTC date can differ from pick_date by a few hours). The tolerance must
    // stay BELOW one day so a non-trading pick_date (market holiday / weekend)
    // can never be matched to an adjacent trading day's bar — doing so would
    // fabricate an outcome from another day's price action. If pick_date was not
    // a trading day, no bar is within tolerance and we correctly return null.
    const MAX_TZ_SHIFT_SECONDS = 60 * 60 * 18; // 18h: covers US/IN session offsets, < 1 day
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

    if (closest >= 0 && closestDiff < MAX_TZ_SHIFT_SECONDS) {
      return { open: q.open[closest], high: q.high[closest], low: q.low[closest], close: q.close[closest] };
    }

    return null;
  } catch (err: any) {
    console.error(`[Evaluate] Failed to fetch OHLC for ${symbol} on ${pickDate}: ${err.message}`);
    return null;
  }
}

export type Outcome = 'hit-target' | 'hit-sl' | 'exit-at-close' | 'no-trigger';

interface EvaluationResult {
  outcome: Outcome;
  pnlPercent: number;
  entryPrice: number;
  exitPrice: number;
}

const MARKET_CLOSE_BUFFER_UTC_HOUR: Record<string, number> = {
  IN: 11, // NSE closes at 10:00 UTC; wait until 11:00 UTC for data availability.
  US: 22, // US closes at 20:00/21:00 UTC depending on DST; wait until 22:00 UTC.
};

export function isPickReadyForEvaluation(pick: PendingPick, now = new Date()): boolean {
  const today = now.toISOString().slice(0, 10);
  if (pick.pick_date < today) return true;
  if (pick.pick_date > today) return false;

  const closeBufferHour = MARKET_CLOSE_BUFFER_UTC_HOUR[pick.market] ?? MARKET_CLOSE_BUFFER_UTC_HOUR.US;
  return now.getUTCHours() >= closeBufferHour;
}

/**
 * Evaluate a single pick against actual OHLC for the pick date.
 *
 * Opening-momentum model: enter at the actual open, then exit at the stop, the
 * stretch target, or the close (whichever comes first). The stored buy/sell/
 * stop levels were computed pre-market from an estimated open, so we re-express
 * them as percentage distances and apply those to the ACTUAL open — that keeps
 * the stop/target faithful even when the stock gaps at the open.
 */
export function evaluatePick(
  pick: PendingPick,
  ohlc: { open: number; high: number; low: number; close: number }
): EvaluationResult {
  const buyPrice = Number(pick.buy_price);
  const sellPrice = Number(pick.sell_price);
  const stopLoss = Number(pick.stop_loss);

  const entryPrice = ohlc.open;
  if (!(entryPrice > 0)) {
    // No usable open — cannot enter; treat as not traded.
    return { outcome: 'no-trigger', pnlPercent: 0, entryPrice: 0, exitPrice: 0 };
  }

  // Intended distances from the reference entry, applied to the actual open.
  const targetPct = buyPrice > 0 ? (sellPrice - buyPrice) / buyPrice : 0;
  const stopPct = buyPrice > 0 ? (buyPrice - stopLoss) / buyPrice : 0;
  const targetPrice = entryPrice * (1 + targetPct);
  const stopPrice = entryPrice * (1 - stopPct);

  const hitTarget = targetPct > 0 && ohlc.high >= targetPrice;
  const hitStop = stopPct > 0 && ohlc.low <= stopPrice;

  // Both touched in one daily bar — assume the stop filled first (conservative).
  if (hitStop) {
    const pnl = ((stopPrice - entryPrice) / entryPrice) * 100;
    return { outcome: 'hit-sl', pnlPercent: round2(pnl), entryPrice, exitPrice: round2(stopPrice) };
  }

  if (hitTarget) {
    const pnl = ((targetPrice - entryPrice) / entryPrice) * 100;
    return { outcome: 'hit-target', pnlPercent: round2(pnl), entryPrice, exitPrice: round2(targetPrice) };
  }

  // Neither stop nor target — exit at the close (the primary planned exit).
  const pnl = ((ohlc.close - entryPrice) / entryPrice) * 100;
  return { outcome: 'exit-at-close', pnlPercent: round2(pnl), entryPrice, exitPrice: ohlc.close };
}

/**
 * Evaluate an OLD-model pick (breakout entry). The trade only triggers if the
 * day's high reaches the buy price (previous-day-high breakout); entry is at the
 * buy price (or the open if it gapped above), then target/stop/close. Used for
 * the live A/B comparison so old-model rows are scored by their own rules.
 */
export function evaluatePickOld(
  pick: PendingPick,
  ohlc: { open: number; high: number; low: number; close: number }
): EvaluationResult {
  const buyPrice = Number(pick.buy_price);
  const sellPrice = Number(pick.sell_price);
  const stopLoss = Number(pick.stop_loss);

  // Entry only triggers on a breakout above the buy price.
  if (ohlc.high < buyPrice) {
    return { outcome: 'no-trigger', pnlPercent: 0, entryPrice: 0, exitPrice: 0 };
  }

  const entryPrice = Math.max(buyPrice, Math.min(ohlc.open, buyPrice * 1.005));
  const hitTarget = ohlc.high >= sellPrice;
  const hitStop = ohlc.low <= stopLoss;

  // Both touched in one daily bar — assume the stop filled first (conservative).
  if (hitStop) {
    const pnl = ((stopLoss - entryPrice) / entryPrice) * 100;
    return { outcome: 'hit-sl', pnlPercent: round2(pnl), entryPrice, exitPrice: stopLoss };
  }
  if (hitTarget) {
    const pnl = ((sellPrice - entryPrice) / entryPrice) * 100;
    return { outcome: 'hit-target', pnlPercent: round2(pnl), entryPrice, exitPrice: sellPrice };
  }
  const pnl = ((ohlc.close - entryPrice) / entryPrice) * 100;
  return { outcome: 'exit-at-close', pnlPercent: round2(pnl), entryPrice, exitPrice: ohlc.close };
}

/** Dispatch to the model-appropriate evaluator. */
export function evaluatePickForModel(
  pick: PendingPick,
  ohlc: { open: number; high: number; low: number; close: number }
): EvaluationResult {
  return pick.model === 'old' ? evaluatePickOld(pick, ohlc) : evaluatePick(pick, ohlc);
}

export function createNoDataEvaluation(): EvaluationResult {
  return { outcome: 'no-trigger', pnlPercent: 0, entryPrice: 0, exitPrice: 0 };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

async function updatePickEvaluation(
  supabase: ReturnType<typeof getSupabaseClient>,
  pick: PendingPick,
  result: EvaluationResult,
  ohlc: { open: number; high: number; low: number; close: number } | null
): Promise<string | null> {
  if (!supabase) return 'Supabase not configured';

  const { error } = await supabase
    .from('daily_picks')
    .update({
      outcome: result.outcome,
      actual_high: ohlc?.high ?? null,
      actual_low: ohlc?.low ?? null,
      actual_close: ohlc?.close ?? null,
      actual_open: ohlc?.open ?? null,
      pnl_percent: result.pnlPercent,
      evaluated_at: new Date().toISOString(),
    })
    .eq('id', pick.id);

  return error?.message ?? null;
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

  // Get all unevaluated picks that are old enough to evaluate.
  const today = new Date().toISOString().slice(0, 10);
  const { data: unevaluatedPicks, error: fetchError } = await supabase
    .from('daily_picks')
    .select('id, symbol, market, model, pick_date, buy_price, sell_price, stop_loss')
    .lte('pick_date', today)
    .is('outcome', null)
    .order('pick_date', { ascending: false })
    .limit(50);

  if (fetchError) {
    console.error('[Evaluate] Failed to fetch pending picks:', fetchError.message);
    return res.status(500).json({ error: fetchError.message });
  }

  const pendingPicks = (unevaluatedPicks || []).filter((pick: PendingPick) => isPickReadyForEvaluation(pick));

  if (pendingPicks.length === 0) {
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

        const result = ohlc ? evaluatePickForModel(pick, ohlc) : createNoDataEvaluation();
        if (!ohlc) {
          console.log(`[Evaluate] No OHLC data for ${pick.symbol} on ${pick.pick_date}; marking no-trigger`);
        }

        // Update Supabase
        const updateError = await updatePickEvaluation(supabase, pick, result, ohlc);

        if (updateError) {
          console.error(`[Evaluate] Failed to update ${pick.symbol}: ${updateError}`);
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
