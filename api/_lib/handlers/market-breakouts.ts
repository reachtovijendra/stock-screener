import type { VercelRequest, VercelResponse } from '@vercel/node';
import https from 'https';
import { getStocksToScan } from '../stock-lists';

interface BreakoutStock {
  symbol: string;
  name: string;
  price: number;
  change: number;
  changePercent: number;
  marketCap: number;
  volume: number;
  avgVolume: number;
  relativeVolume: number;
  fiftyDayMA?: number;
  twoHundredDayMA?: number;
  percentFromFiftyDayMA?: number;
  percentFromTwoHundredDayMA?: number;
  fiftyTwoWeekHigh?: number;
  fiftyTwoWeekLow?: number;
  percentFromFiftyTwoWeekHigh?: number;
  percentFromFiftyTwoWeekLow?: number;
  rsi?: number;
  macdSignalType?: string;
  alertType: string;
  alertCategory: string;
  alertDescription: string;
  severity: 'bullish' | 'bearish' | 'neutral';
  market?: string;
}

function httpsRequest(options: https.RequestOptions, timeout = 8000, body?: string): Promise<{ statusCode: number; headers: any; body: string }> {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ statusCode: res.statusCode || 0, headers: res.headers, body: data }));
    });
    req.on('error', reject);
    req.setTimeout(timeout, () => { req.destroy(); reject(new Error('Timeout')); });
    if (body) {
      req.write(body);
    }
    req.end();
  });
}

async function fetchStockData(symbol: string): Promise<any | null> {
  try {
    const response = await httpsRequest({
      hostname: 'query1.finance.yahoo.com',
      port: 443,
      path: `/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=3mo&includePrePost=false`,
      method: 'GET',
      headers: { 
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json'
      }
    }, 6000);

    if (response.statusCode === 200) {
      const data = JSON.parse(response.body);
      const result = data?.chart?.result?.[0];
      if (result) {
        const meta = result.meta;
        const closes = result.indicators?.quote?.[0]?.close?.filter((c: number | null) => c != null) || [];
        
        return {
          symbol: meta.symbol,
          shortName: meta.shortName || meta.symbol,
          regularMarketPrice: meta.regularMarketPrice,
          regularMarketChange: meta.regularMarketPrice - meta.previousClose,
          regularMarketChangePercent: ((meta.regularMarketPrice - meta.previousClose) / meta.previousClose) * 100,
          fiftyDayAverage: meta.fiftyDayAverage,
          twoHundredDayAverage: meta.twoHundredDayAverage,
          fiftyTwoWeekHigh: meta.fiftyTwoWeekHigh,
          fiftyTwoWeekLow: meta.fiftyTwoWeekLow,
          regularMarketVolume: meta.regularMarketVolume,
          averageDailyVolume3Month: result.indicators?.quote?.[0]?.volume?.reduce((a: number, b: number) => a + (b || 0), 0) / 60 || 0,
          prices: closes
        };
      }
    }
  } catch (e) {
    console.error(`[Chart] Error for ${symbol}:`, e);
  }
  
  return null;
}

function calculateRSI(prices: number[], period = 14): number | null {
  if (!prices || prices.length < period + 1) return null;
  
  let gains = 0, losses = 0;
  for (let i = 1; i <= period; i++) {
    const change = prices[i] - prices[i - 1];
    if (change > 0) gains += change;
    else losses -= change;
  }
  
  let avgGain = gains / period;
  let avgLoss = losses / period;
  
  for (let i = period + 1; i < prices.length; i++) {
    const change = prices[i] - prices[i - 1];
    if (change > 0) {
      avgGain = (avgGain * (period - 1) + change) / period;
      avgLoss = (avgLoss * (period - 1)) / period;
    } else {
      avgGain = (avgGain * (period - 1)) / period;
      avgLoss = (avgLoss * (period - 1) - change) / period;
    }
  }
  
  if (avgLoss === 0) return 100;
  return 100 - (100 / (1 + avgGain / avgLoss));
}

interface MACDResult {
  macdLine: number;
  signalLine: number;
  histogram: number;
  signalType: string | null;
}

function calculateMACD(prices: number[]): MACDResult | null {
  if (!prices || prices.length < 35) return null;
  
  const ema12Values: number[] = [];
  const ema26Values: number[] = [];
  
  let ema12 = prices.slice(0, 12).reduce((a, b) => a + b, 0) / 12;
  let ema26 = prices.slice(0, 26).reduce((a, b) => a + b, 0) / 26;
  
  const mult12 = 2 / 13;
  const mult26 = 2 / 27;
  
  for (let i = 0; i < prices.length; i++) {
    if (i >= 12) {
      ema12 = (prices[i] - ema12) * mult12 + ema12;
    }
    if (i >= 26) {
      ema26 = (prices[i] - ema26) * mult26 + ema26;
      ema12Values.push(ema12);
      ema26Values.push(ema26);
    }
  }
  
  const macdLine = ema12 - ema26;
  const macdValues = ema12Values.map((e12, i) => e12 - ema26Values[i]);
  
  if (macdValues.length < 9) return null;
  
  let signal = macdValues.slice(0, 9).reduce((a, b) => a + b, 0) / 9;
  const multSignal = 2 / 10;
  
  for (let i = 9; i < macdValues.length; i++) {
    signal = (macdValues[i] - signal) * multSignal + signal;
  }
  
  const histogram = macdLine - signal;
  
  let signalType: string | null = null;
  if (macdValues.length >= 2) {
    const prevMacd = macdValues[macdValues.length - 2];
    const prevSignalApprox = signal - (macdValues[macdValues.length - 1] - signal) * multSignal / (1 - multSignal);
    
    const wasBelowSignal = prevMacd < prevSignalApprox;
    const isAboveSignal = macdLine > signal;
    
    if (isAboveSignal && wasBelowSignal) {
      signalType = 'bullish_crossover';
    } else if (!isAboveSignal && !wasBelowSignal) {
      signalType = 'bearish_crossover';
    } else if (macdLine > 0 && isAboveSignal) {
      signalType = 'strong_bullish';
    } else if (macdLine < 0 && !isAboveSignal) {
      signalType = 'strong_bearish';
    }
  }
  
  return { macdLine, signalLine: signal, histogram, signalType };
}

function analyzeStock(quote: any, rsi: number | null, macd: MACDResult | null, market: string = 'US'): BreakoutStock[] {
  const breakouts: BreakoutStock[] = [];
  
  const analystRatingScore = quote.averageAnalystRating 
    ? parseFloat(quote.averageAnalystRating.match(/^([\d.]+)/)?.[1] || '') || null
    : null;
  
  const baseStock = {
    symbol: quote.symbol,
    name: quote.shortName || quote.longName || quote.symbol,
    price: quote.regularMarketPrice || 0,
    change: quote.regularMarketChange || 0,
    changePercent: quote.regularMarketChangePercent || 0,
    marketCap: quote.marketCap || 0,
    volume: quote.regularMarketVolume || 0,
    avgVolume: quote.averageDailyVolume3Month || 0,
    relativeVolume: quote.averageDailyVolume3Month ? (quote.regularMarketVolume / quote.averageDailyVolume3Month) : 1,
    fiftyDayMA: quote.fiftyDayAverage,
    twoHundredDayMA: quote.twoHundredDayAverage,
    percentFromFiftyDayMA: quote.fiftyDayAverage ? ((quote.regularMarketPrice - quote.fiftyDayAverage) / quote.fiftyDayAverage) * 100 : undefined,
    percentFromTwoHundredDayMA: quote.twoHundredDayAverage ? ((quote.regularMarketPrice - quote.twoHundredDayAverage) / quote.twoHundredDayAverage) * 100 : undefined,
    fiftyTwoWeekHigh: quote.fiftyTwoWeekHigh,
    fiftyTwoWeekLow: quote.fiftyTwoWeekLow,
    percentFromFiftyTwoWeekHigh: quote.fiftyTwoWeekHigh ? ((quote.regularMarketPrice - quote.fiftyTwoWeekHigh) / quote.fiftyTwoWeekHigh) * 100 : undefined,
    percentFromFiftyTwoWeekLow: quote.fiftyTwoWeekLow ? ((quote.regularMarketPrice - quote.fiftyTwoWeekLow) / quote.fiftyTwoWeekLow) * 100 : undefined,
    rsi: rsi ? Math.round(rsi * 10) / 10 : undefined,
    market: market,
    averageAnalystRating: quote.averageAnalystRating || undefined,
    analystRatingScore: analystRatingScore
  };

  const price = baseStock.price;
  const pct50MA = baseStock.percentFromFiftyDayMA;
  const pct200MA = baseStock.percentFromTwoHundredDayMA;
  const pct52High = baseStock.percentFromFiftyTwoWeekHigh;
  const pct52Low = baseStock.percentFromFiftyTwoWeekLow;
  const relVol = baseStock.relativeVolume;

  if (pct50MA != null && Math.abs(pct50MA) <= 5) {
    breakouts.push({
      ...baseStock,
      alertType: pct50MA > 0 ? 'above_50ma' : 'below_50ma',
      alertCategory: 'ma_crossover',
      alertDescription: pct50MA > 0 
        ? `Trading ${Math.abs(pct50MA).toFixed(1)}% above 50-day MA - potential support` 
        : `Trading ${Math.abs(pct50MA).toFixed(1)}% below 50-day MA - watch for breakdown`,
      severity: pct50MA > 0 ? 'bullish' : 'bearish'
    });
  }

  if (pct200MA != null && Math.abs(pct200MA) <= 8) {
    breakouts.push({
      ...baseStock,
      alertType: pct200MA > 0 ? 'above_200ma' : 'below_200ma',
      alertCategory: 'ma_crossover',
      alertDescription: pct200MA > 0 
        ? `Trading ${Math.abs(pct200MA).toFixed(1)}% above 200-day MA - long-term uptrend` 
        : `Trading ${Math.abs(pct200MA).toFixed(1)}% below 200-day MA - long-term downtrend`,
      severity: pct200MA > 0 ? 'bullish' : 'bearish'
    });
  }

  if (baseStock.fiftyDayMA && baseStock.twoHundredDayMA) {
    const maDiff = ((baseStock.fiftyDayMA - baseStock.twoHundredDayMA) / baseStock.twoHundredDayMA) * 100;
    if (Math.abs(maDiff) <= 3) {
      breakouts.push({
        ...baseStock,
        alertType: maDiff > 0 ? 'golden_cross' : 'death_cross',
        alertCategory: 'ma_crossover',
        alertDescription: maDiff > 0 
          ? `Golden Cross forming - 50 MA ${Math.abs(maDiff).toFixed(1)}% above 200 MA (bullish)` 
          : `Death Cross forming - 50 MA ${Math.abs(maDiff).toFixed(1)}% below 200 MA (bearish)`,
        severity: maDiff > 0 ? 'bullish' : 'bearish'
      });
    }
  }

  if (pct52High != null && pct52High >= -5) {
    breakouts.push({
      ...baseStock,
      alertType: pct52High >= 0 ? 'new_52w_high' : 'near_52w_high',
      alertCategory: '52w_highs',
      alertDescription: pct52High >= 0 
        ? 'New 52-week high - momentum breakout' 
        : `Within ${Math.abs(pct52High).toFixed(1)}% of 52-week high`,
      severity: 'bullish'
    });
  }

  if (pct52Low != null && pct52Low <= 10) {
    breakouts.push({
      ...baseStock,
      alertType: pct52Low <= 0 ? 'new_52w_low' : 'near_52w_low',
      alertCategory: '52w_lows',
      alertDescription: pct52Low <= 0 
        ? 'New 52-week low - potential capitulation' 
        : `Within ${pct52Low.toFixed(1)}% of 52-week low - potential bounce`,
      severity: pct52Low <= 0 ? 'bearish' : 'neutral'
    });
  }

  if (rsi != null) {
    if (rsi <= 35) {
      breakouts.push({
        ...baseStock,
        alertType: rsi <= 30 ? 'rsi_oversold' : 'rsi_approaching_oversold',
        alertCategory: 'rsi_signals',
        alertDescription: rsi <= 30 
          ? `RSI at ${rsi.toFixed(0)} - oversold territory, potential bounce`
          : `RSI at ${rsi.toFixed(0)} - approaching oversold, watch for reversal`,
        severity: 'bullish'
      });
    } else if (rsi >= 65) {
      breakouts.push({
        ...baseStock,
        alertType: rsi >= 70 ? 'rsi_overbought' : 'rsi_approaching_overbought',
        alertCategory: 'rsi_signals',
        alertDescription: rsi >= 70 
          ? `RSI at ${rsi.toFixed(0)} - overbought territory, potential pullback`
          : `RSI at ${rsi.toFixed(0)} - approaching overbought, monitor closely`,
        severity: 'bearish'
      });
    }
  }

  if (relVol >= 1.5) {
    breakouts.push({
      ...baseStock,
      alertType: 'high_volume',
      alertCategory: 'volume_breakout',
      alertDescription: `${relVol.toFixed(1)}x average volume - ${relVol >= 2 ? 'significant' : 'elevated'} activity`,
      severity: baseStock.changePercent >= 0 ? 'bullish' : 'bearish'
    });
  }

  if (macd && macd.signalType) {
    const signalType = macd.signalType;
    if (signalType === 'bullish_crossover') {
      breakouts.push({
        ...baseStock,
        alertType: 'macd_bullish_cross',
        alertCategory: 'macd_signals',
        alertDescription: 'MACD bullish crossover - MACD line crossed above signal line',
        severity: 'bullish'
      });
    } else if (signalType === 'bearish_crossover') {
      breakouts.push({
        ...baseStock,
        alertType: 'macd_bearish_cross',
        alertCategory: 'macd_signals',
        alertDescription: 'MACD bearish crossover - MACD line crossed below signal line',
        severity: 'bearish'
      });
    } else if (signalType === 'strong_bullish') {
      breakouts.push({
        ...baseStock,
        alertType: 'macd_strong_bullish',
        alertCategory: 'macd_signals',
        alertDescription: 'Strong bullish MACD - positive MACD above signal line',
        severity: 'bullish'
      });
    } else if (signalType === 'strong_bearish') {
      breakouts.push({
        ...baseStock,
        alertType: 'macd_strong_bearish',
        alertCategory: 'macd_signals',
        alertDescription: 'Strong bearish MACD - negative MACD below signal line',
        severity: 'bearish'
      });
    }
  }

  if (breakouts.length === 0) {
    let techScore = 0;
    if (pct50MA != null && pct50MA > 5) techScore += 2;
    if (pct200MA != null && pct200MA > 0) techScore += 1;
    if (rsi != null && rsi >= 50 && rsi <= 75) techScore += 1;
    if (baseStock.changePercent >= 1.5) techScore += 1;
    if (relVol >= 1.2) techScore += 1;
    if (analystRatingScore != null && analystRatingScore <= 2.2) techScore += 1;
    if (macd && macd.signalType && (macd.signalType === 'strong_bullish' || macd.signalType === 'bullish_crossover')) techScore += 1;

    if (techScore >= 4) {
      breakouts.push({
        ...baseStock,
        alertType: 'strong_technicals',
        alertCategory: 'strong_technicals',
        alertDescription: `Strong technical setup (${techScore}/8 criteria) - momentum candidate`,
        severity: 'bullish'
      });
    }
  }

  return breakouts;
}

export async function handleBreakouts(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 's-maxage=180, stale-while-revalidate=300');

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const market = (req.query.market as string)?.toUpperCase() === 'IN' ? 'IN' : 'US';
    const stocksToScan = await getStocksToScan(market);
    
    console.log(`[Breakouts] Scanning ${stocksToScan.length} ${market} stocks...`);

    const stockPromises = stocksToScan.map(async (symbol) => {
      try {
        const data = await fetchStockData(symbol);
        if (data && data.prices) {
          const rsi = calculateRSI(data.prices);
          const macd = calculateMACD(data.prices);
          return { data, rsi, macd, success: true };
        }
        return { data: null, rsi: null, macd: null, success: false };
      } catch (e) {
        return { data: null, rsi: null, macd: null, success: false };
      }
    });

    const results = await Promise.allSettled(stockPromises);
    const allBreakouts: BreakoutStock[] = [];
    let scannedCount = 0;

    for (const result of results) {
      if (result.status === 'fulfilled' && result.value.success && result.value.data) {
        scannedCount++;
        const { data, rsi, macd } = result.value;
        const quote = {
          symbol: data.symbol,
          shortName: data.shortName,
          regularMarketPrice: data.regularMarketPrice,
          regularMarketChange: data.regularMarketChange,
          regularMarketChangePercent: data.regularMarketChangePercent,
          fiftyDayAverage: data.fiftyDayAverage,
          twoHundredDayAverage: data.twoHundredDayAverage,
          fiftyTwoWeekHigh: data.fiftyTwoWeekHigh,
          fiftyTwoWeekLow: data.fiftyTwoWeekLow,
          regularMarketVolume: data.regularMarketVolume,
          averageDailyVolume3Month: data.averageDailyVolume3Month
        };
        const breakouts = analyzeStock(quote, rsi, macd, market);
        allBreakouts.push(...breakouts);
      }
    }

    allBreakouts.sort((a, b) => Math.abs(b.changePercent) - Math.abs(a.changePercent));

    return res.status(200).json({
      breakouts: allBreakouts,
      scannedStocks: scannedCount,
      timestamp: new Date().toISOString()
    });
  } catch (error: any) {
    console.error('Breakouts API error:', error);
    return res.status(200).json({ 
      breakouts: [], 
      scannedStocks: 0, 
      timestamp: new Date().toISOString(),
      error: 'Failed to fetch data'
    });
  }
}
