import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getQuote, getQuotes, Market } from '../yahoo-client';

export async function handleQuote(req: VercelRequest, res: VercelResponse) {
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
      const quote = await getQuote(symbol as string, marketType);
      return res.status(200).json(quote);
    } else {
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
