import type { VercelRequest, VercelResponse } from '@vercel/node';
import https from 'https';

interface TechnicalIndicators {
  rsi: number | null;
  macd: number | null;
  macdSignal: number | null;
  macdHistogram: number | null;
  fiftyDayMA: number | null;
  twoHundredDayMA: number | null;
}

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
    req.setTimeout(15000, () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });

    req.end();
  });
}

/**
 * Fetch historical prices from Yahoo Finance chart API
 */
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
        // Filter out null values
        return closes.filter((c: number | null) => c != null);
      }
    }
    return [];
  } catch (error) {
    console.error(`Error fetching historical data for ${symbol}:`, error);
    return [];
  }
}

/**
 * Calculate RSI (Relative Strength Index)
 */
function calculateRSI(closes: number[], period: number = 14): number | null {
  if (closes.length < period + 1) return null;

  let gains = 0;
  let losses = 0;

  // Calculate initial average gain and loss
  for (let i = 1; i <= period; i++) {
    const change = closes[i] - closes[i - 1];
    if (change > 0) gains += change;
    else losses += Math.abs(change);
  }

  let avgGain = gains / period;
  let avgLoss = losses / period;

  // Calculate RSI for remaining periods
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

/**
 * Calculate MACD (Moving Average Convergence Divergence)
 */
function calculateMACD(closes: number[]): { macd: number | null; signal: number | null; histogram: number | null } {
  if (closes.length < 35) return { macd: null, signal: null, histogram: null };

  // Calculate EMA
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

  // Calculate MACD line
  const macdLine = ema12[ema12.length - 1] - ema26[ema26.length - 1];

  // Calculate Signal line (9-day EMA of MACD)
  const macdValues = ema12.slice(25).map((val, i) => val - ema26[i + 25]);
  const signalLine = calculateEMA(macdValues, 9);
  const signal = signalLine[signalLine.length - 1];

  // Calculate Histogram
  const histogram = macdLine - signal;

  return {
    macd: Math.round(macdLine * 1000) / 1000,
    signal: Math.round(signal * 1000) / 1000,
    histogram: Math.round(histogram * 1000) / 1000
  };
}

/**
 * Calculate Simple Moving Average
 */
function calculateSMA(closes: number[], period: number): number | null {
  if (closes.length < period) return null;
  const sum = closes.slice(-period).reduce((a, b) => a + b, 0);
  return Math.round((sum / period) * 100) / 100;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { symbols } = req.body;

    if (!symbols || !Array.isArray(symbols)) {
      return res.status(400).json({ error: 'Symbols array is required' });
    }

    // Limit to 50 symbols per request
    const limitedSymbols = symbols.slice(0, 50);
    const technicals: Record<string, TechnicalIndicators> = {};

    // Fetch historical data for all symbols in parallel batches
    const batchSize = 10;
    for (let i = 0; i < limitedSymbols.length; i += batchSize) {
      const batch = limitedSymbols.slice(i, i + batchSize);
      
      await Promise.all(
        batch.map(async (symbol: string) => {
          try {
            const closes = await fetchHistoricalPrices(symbol);

            if (!closes || closes.length < 35) {
              technicals[symbol] = {
                rsi: null,
                macd: null,
                macdSignal: null,
                macdHistogram: null,
                fiftyDayMA: null,
                twoHundredDayMA: null
              };
              return;
            }

            const rsi = calculateRSI(closes);
            const macdData = calculateMACD(closes);
            const ma50 = calculateSMA(closes, 50);
            const ma200 = calculateSMA(closes, 200);

            technicals[symbol] = {
              rsi,
              macd: macdData.macd,
              macdSignal: macdData.signal,
              macdHistogram: macdData.histogram,
              fiftyDayMA: ma50,
              twoHundredDayMA: ma200
            };
          } catch (error) {
            console.error(`Error fetching technicals for ${symbol}:`, error);
            technicals[symbol] = {
              rsi: null,
              macd: null,
              macdSignal: null,
              macdHistogram: null,
              fiftyDayMA: null,
              twoHundredDayMA: null
            };
          }
        })
      );

      // Small delay between batches
      if (i + batchSize < limitedSymbols.length) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    return res.status(200).json({ technicals });
  } catch (error: any) {
    console.error('Technicals API error:', error);
    return res.status(200).json({
      technicals: {},
      error: 'Failed to calculate technical indicators',
      message: error.message
    });
  }
}
