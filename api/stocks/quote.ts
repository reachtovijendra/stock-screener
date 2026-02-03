import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getQuote, getQuotes, Market } from '../_lib/yahoo-client';

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
    const { symbol, symbols, market = 'US' } = req.query;
    const marketType = (market as string).toUpperCase() as Market;

    if (!symbol && !symbols) {
      return res.status(400).json({ error: 'Symbol or symbols parameter is required' });
    }

    if (symbol) {
      // Single quote
      const quote = await getQuote(symbol as string, marketType);
      return res.status(200).json(quote);
    } else {
      // Multiple quotes
      const symbolList = (symbols as string).split(',').map(s => s.trim());
      const quotes = await getQuotes(symbolList, marketType);
      return res.status(200).json(quotes);
    }
  } catch (error: any) {
    console.error('Quote API error:', error);
    return res.status(500).json({ 
      error: 'Failed to fetch quote',
      message: error.message 
    });
  }
}
