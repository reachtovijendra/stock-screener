import type { VercelRequest, VercelResponse } from '@vercel/node';
import { searchStocks, Market } from '../_lib/yahoo-client';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { q, market = 'US' } = req.query;
    const marketType = (market as string).toUpperCase() as Market;

    if (!q || (q as string).length < 1) {
      return res.status(400).json({ error: 'Search query is required' });
    }

    const results = await searchStocks(q as string, marketType);
    return res.status(200).json(results);
  } catch (error: any) {
    console.error('Search API error:', error);
    return res.status(500).json({ 
      error: 'Search failed',
      message: error.message 
    });
  }
}
