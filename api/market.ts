import type { VercelRequest, VercelResponse } from '@vercel/node';
import { handleMarketIndices } from './_lib/handlers/market-indices';
import { handleMarketNews } from './_lib/handlers/market-news';
import { handleBreakouts } from './_lib/handlers/market-breakouts';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const action = req.query.action as string;

  switch (action) {
    case 'indices':
      return handleMarketIndices(req, res);
    case 'news':
      return handleMarketNews(req, res);
    case 'breakouts':
      return handleBreakouts(req, res);
    default:
      return res.status(400).json({ error: `Unknown action: ${action}` });
  }
}
