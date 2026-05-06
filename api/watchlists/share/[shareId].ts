import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getSupabaseClient } from '../../_lib/supabase-client';
import {
  deleteWatchlistShare,
  getAuthenticatedUserId,
  readQueryParam,
  sendShareError,
  setShareCorsHeaders,
  updateWatchlistShareRole,
} from '../../_lib/handlers/watchlist-sharing';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setShareCorsHeaders(res);

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const shareId = readQueryParam(req.query.shareId);
  if (!shareId) {
    return res.status(400).json({ error: 'shareId is required.', message: 'shareId is required.' });
  }

  const supabase = getSupabaseClient();
  if (!supabase) {
    return res.status(503).json({ error: 'Sharing is not configured.', message: 'Sharing is not configured.' });
  }

  try {
    const userId = await getAuthenticatedUserId(supabase, req);

    if (req.method === 'PATCH') {
      const share = await updateWatchlistShareRole(supabase, userId, shareId, req.body?.role);
      return res.status(200).json({ share });
    }

    if (req.method === 'DELETE') {
      await deleteWatchlistShare(supabase, userId, shareId);
      return res.status(204).end();
    }

    return res.status(405).json({ error: 'Method not allowed.', message: 'Method not allowed.' });
  } catch (error) {
    return sendShareError(res, error);
  }
}
