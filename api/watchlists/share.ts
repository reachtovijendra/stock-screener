import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getSupabaseClient } from '../_lib/supabase-client';
import {
  createWatchlistShare,
  getAuthenticatedUserId,
  listWatchlistShares,
  readQueryParam,
  sendShareError,
  setShareCorsHeaders,
} from '../_lib/handlers/watchlist-sharing';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setShareCorsHeaders(res);

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const supabase = getSupabaseClient();
  if (!supabase) {
    return res.status(503).json({ error: 'Sharing is not configured.', message: 'Sharing is not configured.' });
  }

  try {
    const userId = await getAuthenticatedUserId(supabase, req);

    if (req.method === 'GET') {
      const watchlistId = readQueryParam(req.query.watchlistId);
      if (!watchlistId) return res.status(400).json({ error: 'watchlistId is required.', message: 'watchlistId is required.' });

      const shares = await listWatchlistShares(supabase, userId, watchlistId);
      return res.status(200).json({ shares });
    }

    if (req.method === 'POST') {
      const share = await createWatchlistShare(supabase, userId, req.body ?? {});
      return res.status(200).json({ share });
    }

    return res.status(405).json({ error: 'Method not allowed.', message: 'Method not allowed.' });
  } catch (error) {
    return sendShareError(res, error);
  }
}
