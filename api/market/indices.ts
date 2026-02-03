import type { VercelRequest, VercelResponse } from '@vercel/node';
import yahooFinance from 'yahoo-finance2';

interface MarketIndex {
  symbol: string;
  name: string;
  price: number;
  change: number;
  changePercent: number;
  fiftyTwoWeekLow: number;
  fiftyTwoWeekHigh: number;
}

const US_INDICES = ['^GSPC', '^DJI', '^IXIC'];
const IN_INDICES = ['^NSEI', '^BSESN'];

const INDEX_NAMES: Record<string, string> = {
  '^GSPC': 'S&P 500',
  '^DJI': 'Dow Jones',
  '^IXIC': 'NASDAQ',
  '^NSEI': 'NIFTY 50',
  '^BSESN': 'SENSEX'
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=300');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { market = 'US' } = req.query;
    const marketType = (market as string).toUpperCase();
    
    const symbols = marketType === 'IN' ? IN_INDICES : US_INDICES;
    
    const quotes = await yahooFinance.quote(symbols);
    const quoteArray = Array.isArray(quotes) ? quotes : [quotes];

    const indices: MarketIndex[] = quoteArray.map((q: any) => ({
      symbol: q.symbol,
      name: INDEX_NAMES[q.symbol] || q.shortName || q.symbol,
      price: q.regularMarketPrice || 0,
      change: q.regularMarketChange || 0,
      changePercent: q.regularMarketChangePercent || 0,
      fiftyTwoWeekLow: q.fiftyTwoWeekLow || 0,
      fiftyTwoWeekHigh: q.fiftyTwoWeekHigh || 0
    }));

    return res.status(200).json({ indices });
  } catch (error: any) {
    console.error('Market indices API error:', error);
    return res.status(500).json({ 
      error: 'Failed to fetch market indices',
      message: error.message 
    });
  }
}
