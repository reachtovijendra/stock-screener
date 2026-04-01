import { createClient, SupabaseClient } from '@supabase/supabase-js';

let client: SupabaseClient | null = null;

/**
 * Returns a Supabase client using the service role key (for server-side inserts).
 * Returns null if env vars are not configured (graceful degradation).
 */
export function getSupabaseClient(): SupabaseClient | null {
  if (client) return client;

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    console.warn('[Supabase] Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY — DB writes disabled');
    return null;
  }

  client = createClient(url, key);
  return client;
}

export interface DailyPickRow {
  market: 'US' | 'IN';
  pick_date: string;       // YYYY-MM-DD
  symbol: string;
  name: string;
  sector: string | null;
  market_cap: number | null;
  price: number;
  previous_close: number | null;
  pre_market_price: number | null;
  gap_percent: number | null;
  change_percent: number | null;
  volume: number | null;
  avg_volume: number | null;
  relative_volume: number | null;
  pre_market_volume: number | null;
  pre_market_volume_percent: number | null;
  fifty_day_ma: number | null;
  two_hundred_day_ma: number | null;
  rsi: number | null;
  beta: number | null;
  buy_price: number;
  sell_price: number;
  stop_loss: number;
  score: number;
  priority: 'High' | 'Medium' | 'Low';
  signals: string[];
}

/**
 * Saves daily picks to Supabase. Uses upsert to handle re-runs gracefully.
 * Returns the number of rows saved, or -1 if DB is not configured.
 */
export async function saveDailyPicks(picks: DailyPickRow[]): Promise<number> {
  const supabase = getSupabaseClient();
  if (!supabase || picks.length === 0) return picks.length === 0 ? 0 : -1;

  const { data, error } = await supabase
    .from('daily_picks')
    .upsert(picks, { onConflict: 'market,pick_date,symbol' })
    .select('id');

  if (error) {
    console.error('[Supabase] Failed to save daily picks:', error.message);
    throw new Error(`Supabase insert failed: ${error.message}`);
  }

  console.log(`[Supabase] Saved ${data?.length ?? 0} picks`);
  return data?.length ?? 0;
}
