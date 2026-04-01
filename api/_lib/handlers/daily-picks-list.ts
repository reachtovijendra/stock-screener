import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getSupabaseClient } from '../supabase-client';

export async function handleDailyPicksList(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const supabase = getSupabaseClient();
  if (!supabase) {
    return res.status(503).json({ error: 'Database not configured' });
  }

  const market = ((req.query.market as string) || 'US').toUpperCase();
  const month = req.query.month as string; // YYYY-MM format

  // Default to current month
  const targetMonth = month || new Date().toISOString().slice(0, 7);
  const startDate = `${targetMonth}-01`;
  // End date: first day of next month
  const [y, m] = targetMonth.split('-').map(Number);
  const endDate = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`;

  try {
    const { data, error } = await supabase
      .from('daily_picks')
      .select('*')
      .eq('market', market)
      .gte('pick_date', startDate)
      .lt('pick_date', endDate)
      .order('pick_date', { ascending: false })
      .order('score', { ascending: false });

    if (error) {
      console.error('[DailyPicksList] Supabase error:', error.message);
      return res.status(500).json({ error: 'Failed to fetch picks', message: error.message });
    }

    return res.status(200).json({
      market,
      month: targetMonth,
      count: data?.length ?? 0,
      picks: data ?? [],
    });
  } catch (err: any) {
    console.error('[DailyPicksList] Error:', err.message);
    return res.status(500).json({ error: 'Internal error', message: err.message });
  }
}
