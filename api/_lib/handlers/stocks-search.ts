import type { VercelRequest, VercelResponse } from '@vercel/node';
import { searchStocks, getQuote, getMarketFromSymbol, Market } from '../yahoo-client';
import https from 'https';

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
    req.setTimeout(15000, () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });

    req.end();
  });
}

async function fetchHistoricalPrices(symbol: string): Promise<number[]> {
  try {
    const response = await httpsRequest({
      hostname: 'query1.finance.yahoo.com',
      port: 443,
      path: `/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1y`,
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': '*/*'
      }
    });

    if (response.statusCode === 200) {
      const data = JSON.parse(response.body);
      if (data.chart?.result?.[0]?.indicators?.quote?.[0]?.close) {
        const closes = data.chart.result[0].indicators.quote[0].close;
        return closes.filter((c: number | null) => c != null);
      }
    }
    return [];
  } catch (error) {
    console.error(`Error fetching historical data for ${symbol}:`, error);
    return [];
  }
}

function calculateRSI(closes: number[], period: number = 14): number | null {
  if (closes.length < period + 1) return null;

  let gains = 0;
  let losses = 0;

  for (let i = 1; i <= period; i++) {
    const change = closes[i] - closes[i - 1];
    if (change > 0) gains += change;
    else losses += Math.abs(change);
  }

  let avgGain = gains / period;
  let avgLoss = losses / period;

  for (let i = period + 1; i < closes.length; i++) {
    const change = closes[i] - closes[i - 1];
    const gain = change > 0 ? change : 0;
    const loss = change < 0 ? Math.abs(change) : 0;

    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
  }

  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return Math.round((100 - (100 / (1 + rs))) * 10) / 10;
}

function calculateMACD(closes: number[]): { macd: number | null; signal: number | null; histogram: number | null } {
  if (closes.length < 35) return { macd: null, signal: null, histogram: null };

  const calculateEMA = (data: number[], period: number): number[] => {
    const multiplier = 2 / (period + 1);
    const ema: number[] = [data[0]];

    for (let i = 1; i < data.length; i++) {
      ema.push((data[i] - ema[i - 1]) * multiplier + ema[i - 1]);
    }

    return ema;
  };

  const ema12 = calculateEMA(closes, 12);
  const ema26 = calculateEMA(closes, 26);

  const macdLine = ema12[ema12.length - 1] - ema26[ema26.length - 1];

  const macdValues = ema12.slice(25).map((val, i) => val - ema26[i + 25]);
  const signalLine = calculateEMA(macdValues, 9);
  const signal = signalLine[signalLine.length - 1];

  const histogram = macdLine - signal;

  return {
    macd: Math.round(macdLine * 1000) / 1000,
    signal: Math.round(signal * 1000) / 1000,
    histogram: Math.round(histogram * 1000) / 1000
  };
}

function getMacdSignalType(macd: number | null, signal: number | null, histogram: number | null): string | null {
  if (macd === null || signal === null || histogram === null) return null;

  if (macd > 0 && histogram > 0 && macd > signal) return 'strong_bullish';
  if (macd < 0 && histogram < 0 && macd < signal) return 'strong_bearish';
  if (histogram > 0 && macd > signal) return 'bullish';
  if (histogram < 0 && macd < signal) return 'bearish';
  if (Math.abs(histogram) < Math.abs(macd) * 0.1) {
    return histogram > 0 ? 'bullish_crossover' : 'bearish_crossover';
  }
  return histogram > 0 ? 'bullish' : 'bearish';
}

async function enrichWithTechnicals(stock: any): Promise<void> {
  try {
    const closes = await fetchHistoricalPrices(stock.symbol);
    if (closes.length >= 35) {
      stock.rsi = calculateRSI(closes);
      const macdData = calculateMACD(closes);
      stock.macdLine = macdData.macd;
      stock.macdSignal = macdData.signal;
      stock.macdHistogram = macdData.histogram;
      stock.macdSignalType = getMacdSignalType(macdData.macd, macdData.signal, macdData.histogram);
    } else {
      stock.rsi = null;
      stock.macdLine = null;
      stock.macdSignal = null;
      stock.macdHistogram = null;
      stock.macdSignalType = null;
    }
  } catch (error) {
    console.error(`Error enriching technicals for ${stock.symbol}:`, error);
    stock.rsi = null;
    stock.macdLine = null;
    stock.macdSignal = null;
    stock.macdHistogram = null;
    stock.macdSignalType = null;
  }
}

export async function handleSearch(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { q, market = 'US', technicals, fuzzy } = req.query;
    const marketType = (market as string).toUpperCase() as Market;
    const includeTechnicals = technicals === 'true';
    const isFuzzy = fuzzy === 'true';

    if (!q || (q as string).length < 1) {
      return res.status(400).json({ error: 'Search query is required' });
    }

    const query = (q as string).trim();
    const stocks: any[] = [];
    const seenSymbols = new Set<string>();

    const exactSymbol = query.toUpperCase();
    if (/^[A-Z0-9\-\.&]{1,20}$/.test(exactSymbol)) {
      console.log(`[Search] Trying exact match for: ${exactSymbol}`);
      try {
        const detectedMarket = getMarketFromSymbol(exactSymbol);
        const quote = await getQuote(exactSymbol, detectedMarket || marketType);
        if (quote && quote.price > 0) {
          const stock: any = { ...quote };
          if (includeTechnicals) {
            await enrichWithTechnicals(stock);
          }
          stocks.push(stock);
          seenSymbols.add(exactSymbol);
          console.log(`[Search] Found exact match: ${exactSymbol} @ ${quote.price}`);
        }
      } catch (err: any) {
        console.log(`[Search] Exact match failed for ${exactSymbol}: ${err.message}`);
      }
    }

    if (isFuzzy) {
      const searchResults = await searchStocks(query, marketType);
      for (const result of searchResults.slice(0, 10)) {
        if (seenSymbols.has(result.symbol)) continue;
        try {
          const quote = await getQuote(result.symbol, marketType);
          if (quote && quote.price > 0) {
            const stock: any = { ...quote };
            if (includeTechnicals) {
              await enrichWithTechnicals(stock);
            }
            stocks.push(stock);
            seenSymbols.add(result.symbol);
          }
        } catch (err) {
          // Skip failed quotes
        }
      }
    } else if (query.includes(',')) {
      const symbols = query.toUpperCase().split(',').slice(0, 10);
      for (const sym of symbols) {
        const trimmed = sym.trim();
        if (seenSymbols.has(trimmed)) continue;
        try {
          const detectedMarket = getMarketFromSymbol(trimmed);
          const quote = await getQuote(trimmed, detectedMarket || marketType);
          if (quote && quote.price > 0) {
            const stock: any = { ...quote };
            if (includeTechnicals) {
              await enrichWithTechnicals(stock);
            }
            stocks.push(stock);
            seenSymbols.add(trimmed);
          }
        } catch (err) {
          // Skip failed quotes
        }
      }
    } else if (stocks.length === 0) {
      const searchResults = await searchStocks(query, marketType);
      for (const result of searchResults.slice(0, 5)) {
        if (seenSymbols.has(result.symbol)) continue;
        try {
          const quote = await getQuote(result.symbol, marketType);
          if (quote && quote.price > 0) {
            const stock: any = { ...quote };
            if (includeTechnicals) {
              await enrichWithTechnicals(stock);
            }
            stocks.push(stock);
            seenSymbols.add(result.symbol);
          }
        } catch (err) {
          // Skip failed quotes
        }
      }
    }

    return res.status(200).json({ stocks });
  } catch (error: any) {
    console.error('Search API error:', error);
    return res.status(500).json({ 
      error: 'Search failed',
      message: error.message 
    });
  }
}
