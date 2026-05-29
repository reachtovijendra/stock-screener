import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getSupabaseClient } from '../supabase-client';

/**
 * Returns the most recent cached Penny Hits (computed daily by the cron).
 * GET /api/stocks?action=penny-hits&market=US
 */
export async function handlePennyHits(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const supabase = getSupabaseClient();
  if (!supabase) {
    return res.status(503).json({ error: 'Database not configured' });
  }

  const market = ((req.query.market as string) || 'US').toUpperCase();

  try {
    // Find the latest pick_date for this market.
    const { data: latest, error: latestError } = await supabase
      .from('penny_hits')
      .select('pick_date')
      .eq('market', market)
      .order('pick_date', { ascending: false })
      .limit(1);

    if (latestError) {
      console.error('[PennyHits] Supabase error:', latestError.message);
      return res.status(500).json({ error: 'Failed to fetch penny hits', message: latestError.message });
    }

    const latestDate = latest?.[0]?.pick_date as string | undefined;
    if (!latestDate) {
      return res.status(200).json({ market, date: null, count: 0, picks: [] });
    }

    const { data, error } = await supabase
      .from('penny_hits')
      .select('*')
      .eq('market', market)
      .eq('pick_date', latestDate)
      .order('score', { ascending: false });

    if (error) {
      console.error('[PennyHits] Supabase error:', error.message);
      return res.status(500).json({ error: 'Failed to fetch penny hits', message: error.message });
    }

    return res.status(200).json({
      market,
      date: latestDate,
      count: data?.length ?? 0,
      picks: data ?? [],
    });
  } catch (err: any) {
    console.error('[PennyHits] Error:', err.message);
    return res.status(500).json({ error: 'Internal error', message: err.message });
  }
}
