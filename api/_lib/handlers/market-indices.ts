import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getMarketIndices, Market, MarketIndex } from '../yahoo-client';

const FALLBACK_DATA: Record<string, MarketIndex> = {
  '^GSPC': { symbol: '^GSPC', name: 'S&P 500', price: 5000, change: 0, changePercent: 0, fiftyTwoWeekLow: 4500, fiftyTwoWeekHigh: 5200 },
  '^DJI': { symbol: '^DJI', name: 'Dow Jones', price: 38000, change: 0, changePercent: 0, fiftyTwoWeekLow: 36000, fiftyTwoWeekHigh: 39000 },
  '^IXIC': { symbol: '^IXIC', name: 'NASDAQ', price: 16000, change: 0, changePercent: 0, fiftyTwoWeekLow: 14500, fiftyTwoWeekHigh: 17000 },
  '^NSEI': { symbol: '^NSEI', name: 'NIFTY 50', price: 22000, change: 0, changePercent: 0, fiftyTwoWeekLow: 21000, fiftyTwoWeekHigh: 23000 },
  '^BSESN': { symbol: '^BSESN', name: 'SENSEX', price: 73000, change: 0, changePercent: 0, fiftyTwoWeekLow: 70000, fiftyTwoWeekHigh: 75000 }
};

const US_INDICES = ['^GSPC', '^DJI', '^IXIC'];
const IN_INDICES = ['^NSEI', '^BSESN'];

export async function handleMarketIndices(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=300');

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { market = 'US' } = req.query;
    const marketType = (market as string).toUpperCase() as Market;

    try {
      const indices = await getMarketIndices(marketType);
      
      if (indices && indices.length > 0) {
        return res.status(200).json({ indices });
      }
      
      throw new Error('No index data returned');
    } catch (yahooError: any) {
      console.warn('Yahoo Finance unavailable, using fallback data:', yahooError.message);

      const symbols = marketType === 'IN' ? IN_INDICES : US_INDICES;
      const indices = symbols.map(symbol => FALLBACK_DATA[symbol]);
      return res.status(200).json({
        indices,
        fallback: true,
        message: 'Using cached data due to API limitations'
      });
    }
  } catch (error: any) {
    console.error('Market indices API error:', error);

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
