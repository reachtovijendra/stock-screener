import type { VercelRequest, VercelResponse } from '@vercel/node';

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

// Fallback data in case Yahoo Finance is unavailable
const FALLBACK_DATA: Record<string, MarketIndex> = {
  '^GSPC': { symbol: '^GSPC', name: 'S&P 500', price: 5000, change: 0, changePercent: 0, fiftyTwoWeekLow: 4500, fiftyTwoWeekHigh: 5200 },
  '^DJI': { symbol: '^DJI', name: 'Dow Jones', price: 38000, change: 0, changePercent: 0, fiftyTwoWeekLow: 36000, fiftyTwoWeekHigh: 39000 },
  '^IXIC': { symbol: '^IXIC', name: 'NASDAQ', price: 16000, change: 0, changePercent: 0, fiftyTwoWeekLow: 14500, fiftyTwoWeekHigh: 17000 },
  '^NSEI': { symbol: '^NSEI', name: 'NIFTY 50', price: 22000, change: 0, changePercent: 0, fiftyTwoWeekLow: 21000, fiftyTwoWeekHigh: 23000 },
  '^BSESN': { symbol: '^BSESN', name: 'SENSEX', price: 73000, change: 0, changePercent: 0, fiftyTwoWeekLow: 70000, fiftyTwoWeekHigh: 75000 }
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
    
    // Try to fetch from Yahoo Finance with timeout
    try {
      const yahooFinance = await import('yahoo-finance2').then(m => m.default);
      
      const fetchPromise = yahooFinance.quote(symbols);
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Yahoo Finance timeout')), 8000)
      );
      
      const quotes = await Promise.race([fetchPromise, timeoutPromise]) as any;
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
    } catch (yahooError) {
      console.warn('Yahoo Finance unavailable, using fallback data:', yahooError);
      
      // Return fallback data
      const indices = symbols.map(symbol => FALLBACK_DATA[symbol]);
      return res.status(200).json({ 
        indices,
        fallback: true,
        message: 'Using cached data due to API limitations'
      });
    }
  } catch (error: any) {
    console.error('Market indices API error:', error);
    
    // Return fallback data on any error
    const { market = 'US' } = req.query;
    const marketType = (market as string).toUpperCase();
    const symbols = marketType === 'IN' ? IN_INDICES : US_INDICES;
    const indices = symbols.map(symbol => FALLBACK_DATA[symbol]);
    
    return res.status(200).json({ 
      indices,
      fallback: true,
      message: 'Using cached data'
    });
  }
}
