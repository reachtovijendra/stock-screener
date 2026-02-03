import type { VercelRequest, VercelResponse } from '@vercel/node';
import yahooFinance from 'yahoo-finance2';
import { Market } from '../_lib/yahoo-client';

interface MarketIndex {
  symbol: string;
  name: string;
  value: number;
  change: number;
  changePercent: number;
  market: Market;
}

const INDEX_NAMES: Record<string, string> = {
  '^GSPC': 'S&P 500',
  '^DJI': 'Dow Jones',
  '^IXIC': 'NASDAQ',
  '^RUT': 'Russell 2000',
  '^NSEI': 'NIFTY 50',
  '^BSESN': 'SENSEX',
  '^NSEBANK': 'Bank NIFTY'
};

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
    const { symbols, market = 'US' } = req.query;
    const marketType = (market as string).toUpperCase() as Market;

    if (!symbols) {
      return res.status(400).json({ error: 'Symbols parameter is required' });
    }

    const symbolList = (symbols as string).split(',').map(s => s.trim());
    
    const quotes = await yahooFinance.quote(symbolList);
    const quoteArray = Array.isArray(quotes) ? quotes : [quotes];

    const indices: MarketIndex[] = quoteArray.map((q: any) => ({
      symbol: q.symbol,
      name: INDEX_NAMES[q.symbol] || q.shortName || q.symbol,
      value: q.regularMarketPrice || 0,
      change: q.regularMarketChange || 0,
      changePercent: q.regularMarketChangePercent || 0,
      market: marketType
    }));

    return res.status(200).json(indices);
  } catch (error: any) {
    console.error('Indices API error:', error);
    return res.status(500).json({ 
      error: 'Failed to fetch indices',
      message: error.message 
    });
  }
}
