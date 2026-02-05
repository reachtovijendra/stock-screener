import type { VercelRequest, VercelResponse } from '@vercel/node';
import https from 'https';
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

/**
 * Make HTTPS request
 */
function httpsRequest(options: https.RequestOptions): Promise<{ statusCode: number; body: string }> {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk: Buffer) => data += chunk.toString());
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode || 500,
          body: data
        });
      });
    });

    req.on('error', reject);
    req.setTimeout(10000, () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });

    req.end();
  });
}

/**
 * Fetch quotes from Yahoo Finance
 */
async function fetchQuotes(symbols: string[]): Promise<any[]> {
  try {
    const symbolsParam = symbols.join(',');
    const response = await httpsRequest({
      hostname: 'query1.finance.yahoo.com',
      port: 443,
      path: `/v7/finance/quote?symbols=${encodeURIComponent(symbolsParam)}`,
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json'
      }
    });

    if (response.statusCode === 200) {
      const data = JSON.parse(response.body);
      if (data.quoteResponse && data.quoteResponse.result) {
        return data.quoteResponse.result;
      }
    }
    return [];
  } catch (error) {
    console.error('Error fetching quotes:', error);
    return [];
  }
}

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
    
    const quotes = await fetchQuotes(symbolList);

    const indices: MarketIndex[] = quotes.map((q: any) => ({
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
    return res.status(200).json({
      indices: [],
      error: 'Failed to fetch indices',
      message: error.message
    });
  }
}
