import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getIndexSymbols, Market, getMarketFromSymbol } from '../yahoo-client';

export async function handleList(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { market = 'US' } = req.query;
    const marketType = (market as string).toUpperCase() as Market;

    const symbols = getIndexSymbols(marketType);
    
    const list = symbols.map(symbol => ({
      symbol,
      name: symbol.replace('.NS', '').replace('.BO', ''),
      exchange: symbol.endsWith('.NS') ? 'NSE' : symbol.endsWith('.BO') ? 'BSE' : 'NYSE/NASDAQ',
      type: 'equity',
      market: getMarketFromSymbol(symbol)
    }));

    return res.status(200).json(list);
  } catch (error: any) {
    console.error('List API error:', error);
    return res.status(500).json({ 
      error: 'Failed to get stock list',
      message: error.message 
    });
  }
}
