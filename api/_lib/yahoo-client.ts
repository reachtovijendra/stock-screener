/**
 * Yahoo Finance Client with Crumb Authentication
 * Works on both Vercel serverless and local environments
 */

import https from 'https';
import { getStaticSectorInfo } from './stock-sectors';

/**
 * Market type
 */
export type Market = 'US' | 'IN';

/**
 * Stock quote interface
 */
export interface StockQuote {
  symbol: string;
  name: string;
  price: number;
  change: number;
  changePercent: number;
  market: Market;
  exchange: string;
  currency: string;
  marketCap: number;
  marketCapCategory: string;
  fiftyTwoWeekHigh: number;
  fiftyTwoWeekLow: number;
  percentFromFiftyTwoWeekHigh: number;
  percentFromFiftyTwoWeekLow: number;
  peRatio: number | null;
  forwardPeRatio: number | null;
  pbRatio: number | null;
  psRatio: number | null;
  eps: number | null;
  forwardEps: number | null;
  earningsGrowth: number | null;
  revenueGrowth: number | null;
  dividendYield: number | null;
  avgVolume: number;
  volume: number;
  relativeVolume: number;
  sector: string;
  industry: string;
  beta: number | null;
  fiftyDayMA: number | null;
  twoHundredDayMA: number | null;
  percentFromFiftyDayMA: number | null;
  percentFromTwoHundredDayMA: number | null;
  lastUpdated: Date;
}

/**
 * Market index interface
 */
export interface MarketIndex {
  symbol: string;
  name: string;
  price: number;
  change: number;
  changePercent: number;
  fiftyTwoWeekLow: number;
  fiftyTwoWeekHigh: number;
}

// Yahoo Finance authentication cache
let yahooAuth: { crumb: string | null; cookies: string | null; timestamp: number } = {
  crumb: null,
  cookies: null,
  timestamp: 0
};
const AUTH_TTL = 25 * 60 * 1000; // 25 minutes

// Quote cache
const quoteCache = new Map<string, { data: StockQuote; timestamp: number }>();
const CACHE_TTL = 3 * 60 * 1000; // 3 minutes

/**
 * Make HTTPS request with promise
 */
function httpsRequest(options: https.RequestOptions, postData: string | null = null): Promise<{ statusCode: number; headers: any; body: string }> {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk: Buffer) => data += chunk.toString());
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode || 500,
          headers: res.headers,
          body: data
        });
      });
    });

    req.on('error', reject);
    req.setTimeout(15000, () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });

    if (postData) {
      req.write(postData);
    }
    req.end();
  });
}

/**
 * Get Yahoo Finance crumb for authenticated requests
 */
async function getYahooCrumb(): Promise<{ crumb: string | null; cookies: string | null }> {
  // Check if we have a valid cached crumb
  if (yahooAuth.crumb && Date.now() - yahooAuth.timestamp < AUTH_TTL) {
    return yahooAuth;
  }

  console.log('[Yahoo] Fetching new crumb...');

  try {
    // Step 1: Get cookies from Yahoo Finance
    const pageResponse = await httpsRequest({
      hostname: 'finance.yahoo.com',
      port: 443,
      path: '/quote/AAPL',
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9'
      }
    });

    // Extract cookies
    const setCookies = pageResponse.headers['set-cookie'] as string[] | undefined;
    let cookies = '';
    if (setCookies) {
      cookies = setCookies.map((c: string) => c.split(';')[0]).join('; ');
    }

    // Step 2: Get crumb using cookies
    const crumbResponse = await httpsRequest({
      hostname: 'query1.finance.yahoo.com',
      port: 443,
      path: '/v1/test/getcrumb',
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': '*/*',
        'Cookie': cookies
      }
    });

    if (crumbResponse.statusCode === 200 && crumbResponse.body) {
      yahooAuth = {
        crumb: crumbResponse.body.trim(),
        cookies: cookies,
        timestamp: Date.now()
      };
      console.log('[Yahoo] Got crumb successfully');
      return yahooAuth;
    }

    console.log('[Yahoo] Failed to get crumb:', crumbResponse.statusCode);
    return { crumb: null, cookies: null };
  } catch (error: any) {
    console.error('[Yahoo] Error getting crumb:', error.message);
    return { crumb: null, cookies: null };
  }
}

/**
 * Fetch quote from Yahoo Finance v7 API
 */
async function fetchYahooQuote(symbol: string): Promise<any | null> {
  const auth = await getYahooCrumb();

  // Build URL with crumb if available
  let url = `/v7/finance/quote?symbols=${encodeURIComponent(symbol)}`;
  if (auth.crumb) {
    url += `&crumb=${encodeURIComponent(auth.crumb)}`;
  }

  const headers: Record<string, string> = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'application/json'
  };

  if (auth.cookies) {
    headers['Cookie'] = auth.cookies;
  }

  try {
    const response = await httpsRequest({
      hostname: 'query1.finance.yahoo.com',
      port: 443,
      path: url,
      method: 'GET',
      headers: headers
    });

    if (response.statusCode === 200) {
      const data = JSON.parse(response.body);
      if (data.quoteResponse && data.quoteResponse.result && data.quoteResponse.result.length > 0) {
        return data.quoteResponse.result[0];
      }
    }

    // If v7 fails, try chart API as fallback
    console.log(`[Yahoo] v7 API failed for ${symbol}, trying chart API...`);
    return await fetchChartQuote(symbol);
  } catch (error: any) {
    console.error(`[Yahoo] Error for ${symbol}:`, error.message);
    return await fetchChartQuote(symbol);
  }
}

/**
 * Fetch quote from chart API (fallback)
 */
async function fetchChartQuote(symbol: string): Promise<any | null> {
  try {
    const response = await httpsRequest({
      hostname: 'query1.finance.yahoo.com',
      port: 443,
      path: `/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=5d`,
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': '*/*'
      }
    });

    if (response.statusCode === 200) {
      const data = JSON.parse(response.body);
      if (data.chart && data.chart.result && data.chart.result[0]) {
        const meta = data.chart.result[0].meta;
        return {
          symbol: meta.symbol,
          shortName: meta.shortName || meta.longName,
          regularMarketPrice: meta.regularMarketPrice,
          regularMarketChange: meta.regularMarketPrice - (meta.chartPreviousClose || meta.previousClose),
          regularMarketChangePercent: meta.chartPreviousClose
            ? ((meta.regularMarketPrice - meta.chartPreviousClose) / meta.chartPreviousClose) * 100
            : 0,
          marketCap: meta.marketCap,
          trailingPE: null,
          forwardPE: null,
          priceToBook: null,
          fiftyTwoWeekHigh: meta.fiftyTwoWeekHigh,
          fiftyTwoWeekLow: meta.fiftyTwoWeekLow,
          fiftyDayAverage: meta.fiftyDayAverage,
          twoHundredDayAverage: meta.twoHundredDayAverage,
          regularMarketVolume: meta.regularMarketVolume,
          averageDailyVolume3Month: meta.averageDailyVolume10Day,
          exchange: meta.exchangeName || meta.exchange,
          currency: meta.currency,
          _source: 'chart'
        };
      }
    }
    return null;
  } catch (error: any) {
    console.error(`[Yahoo Chart] Error for ${symbol}:`, error.message);
    return null;
  }
}

/**
 * Fetch multiple quotes in batch
 */
async function fetchYahooQuotes(symbols: string[]): Promise<any[]> {
  const auth = await getYahooCrumb();

  // Build URL with all symbols
  const symbolsParam = symbols.join(',');
  const fields = 'symbol,shortName,longName,regularMarketPrice,regularMarketChange,regularMarketChangePercent,regularMarketVolume,marketCap,fiftyTwoWeekHigh,fiftyTwoWeekLow,fiftyDayAverage,twoHundredDayAverage,trailingPE,forwardPE,priceToBook,priceToSalesTrailing12Months,epsTrailingTwelveMonths,epsForward,trailingAnnualDividendYield,earningsQuarterlyGrowth,revenueGrowth,averageDailyVolume3Month,averageVolume,beta,exchange,fullExchangeName,currency,sector,industry,sectorDisp,industryDisp';
  let url = `/v7/finance/quote?symbols=${encodeURIComponent(symbolsParam)}&fields=${encodeURIComponent(fields)}`;
  if (auth.crumb) {
    url += `&crumb=${encodeURIComponent(auth.crumb)}`;
  }

  const headers: Record<string, string> = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'application/json'
  };

  if (auth.cookies) {
    headers['Cookie'] = auth.cookies;
  }

  try {
    const response = await httpsRequest({
      hostname: 'query1.finance.yahoo.com',
      port: 443,
      path: url,
      method: 'GET',
      headers: headers
    });

    if (response.statusCode === 200) {
      const data = JSON.parse(response.body);
      if (data.quoteResponse && data.quoteResponse.result) {
        return data.quoteResponse.result;
      }
    }

    console.log(`[Yahoo] Batch quote failed, status: ${response.statusCode}`);
    return [];
  } catch (error: any) {
    console.error('[Yahoo] Batch quote error:', error.message);
    return [];
  }
}

/**
 * Search Yahoo Finance for symbols
 */
async function searchYahooSymbols(query: string): Promise<any[]> {
  try {
    const url = `/v1/finance/search?q=${encodeURIComponent(query)}&quotesCount=30&newsCount=0&listsCount=0&enableFuzzyQuery=true`;

    const response = await httpsRequest({
      hostname: 'query1.finance.yahoo.com',
      port: 443,
      path: url,
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json'
      }
    });

    if (response.statusCode === 200 && response.body) {
      const data = JSON.parse(response.body);
      return data.quotes || [];
    }
    return [];
  } catch (error: any) {
    console.error(`[Yahoo Search] Error:`, error.message);
    return [];
  }
}

/**
 * Determine market from symbol
 */
export function getMarketFromSymbol(symbol: string): Market {
  if (symbol.endsWith('.NS') || symbol.endsWith('.BO')) {
    return 'IN';
  }
  return 'US';
}

/**
 * Format symbol for Yahoo Finance
 */
export function formatSymbol(symbol: string, market: Market): string {
  if (symbol.includes('.')) {
    return symbol;
  }
  if (market === 'IN') {
    return `${symbol}.NS`;
  }
  return symbol;
}

/**
 * Categorize market cap
 */
function categorizeMarketCap(marketCap: number, market: Market): string {
  if (market === 'US') {
    if (marketCap >= 200_000_000_000) return 'mega';
    if (marketCap >= 10_000_000_000) return 'large';
    if (marketCap >= 2_000_000_000) return 'mid';
    if (marketCap >= 300_000_000) return 'small';
    return 'micro';
  } else {
    // Indian market (INR)
    if (marketCap >= 2_000_000_000_000) return 'mega';
    if (marketCap >= 200_000_000_000) return 'large';
    if (marketCap >= 50_000_000_000) return 'mid';
    if (marketCap >= 5_000_000_000) return 'small';
    return 'micro';
  }
}

/**
 * Transform Yahoo Finance data to our format
 */
function transformQuote(data: any, market: Market): StockQuote {
  const price = data.regularMarketPrice || 0;
  const high52 = data.fiftyTwoWeekHigh || price;
  const low52 = data.fiftyTwoWeekLow || price;
  const fiftyDayMA = data.fiftyDayAverage || null;
  const twoHundredDayMA = data.twoHundredDayAverage || null;
  const avgVolume = data.averageDailyVolume3Month || data.averageVolume || 1;
  const volume = data.regularMarketVolume || 0;
  const marketCap = data.marketCap || 0;

  return {
    symbol: data.symbol,
    name: data.shortName || data.longName || data.symbol,
    price,
    change: data.regularMarketChange || 0,
    changePercent: data.regularMarketChangePercent || 0,
    market,
    exchange: data.exchange || data.fullExchangeName || 'Unknown',
    currency: data.currency || (market === 'US' ? 'USD' : 'INR'),
    marketCap,
    marketCapCategory: categorizeMarketCap(marketCap, market),
    fiftyTwoWeekHigh: high52,
    fiftyTwoWeekLow: low52,
    percentFromFiftyTwoWeekHigh: high52 > 0 ? ((price - high52) / high52) * 100 : 0,
    percentFromFiftyTwoWeekLow: low52 > 0 ? ((price - low52) / low52) * 100 : 0,
    peRatio: data.trailingPE || null,
    forwardPeRatio: data.forwardPE || null,
    pbRatio: data.priceToBook || null,
    psRatio: data.priceToSalesTrailing12Months || null,
    eps: data.trailingEps || data.epsTrailingTwelveMonths || null,
    forwardEps: data.forwardEps || data.epsForward || null,
    earningsGrowth: data.earningsQuarterlyGrowth ? data.earningsQuarterlyGrowth * 100 : null,
    revenueGrowth: data.revenueGrowth ? data.revenueGrowth * 100 : null,
    dividendYield: data.dividendYield ? data.dividendYield * 100 : (data.trailingAnnualDividendYield ? data.trailingAnnualDividendYield * 100 : null),
    avgVolume,
    volume,
    relativeVolume: avgVolume > 0 ? volume / avgVolume : 1,
    sector: data.sector || data.sectorDisp || getStaticSectorInfo(data.symbol)?.sector || 'Unknown',
    industry: data.industry || data.industryDisp || getStaticSectorInfo(data.symbol)?.industry || 'Unknown',
    beta: data.beta || null,
    fiftyDayMA,
    twoHundredDayMA,
    percentFromFiftyDayMA: fiftyDayMA && fiftyDayMA > 0 ? ((price - fiftyDayMA) / fiftyDayMA) * 100 : null,
    percentFromTwoHundredDayMA: twoHundredDayMA && twoHundredDayMA > 0 ? ((price - twoHundredDayMA) / twoHundredDayMA) * 100 : null,
    lastUpdated: new Date()
  };
}

/**
 * Get cached quote if valid
 */
function getCachedQuote(symbol: string): StockQuote | null {
  const cached = quoteCache.get(symbol);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data;
  }
  return null;
}

/**
 * Cache a quote
 */
function cacheQuote(symbol: string, quote: StockQuote): void {
  quoteCache.set(symbol, { data: quote, timestamp: Date.now() });

  // Limit cache size
  if (quoteCache.size > 500) {
    const firstKey = quoteCache.keys().next().value;
    if (firstKey) quoteCache.delete(firstKey);
  }
}

/**
 * Get a single stock quote
 */
export async function getQuote(symbol: string, market: Market): Promise<StockQuote> {
  const formattedSymbol = formatSymbol(symbol, market);

  // Check cache
  const cached = getCachedQuote(formattedSymbol);
  if (cached) {
    return cached;
  }

  const data = await fetchYahooQuote(formattedSymbol);
  if (!data) {
    throw new Error(`Failed to fetch quote for ${symbol}`);
  }

  const quote = transformQuote(data, market);
  cacheQuote(formattedSymbol, quote);
  return quote;
}

/**
 * Get multiple stock quotes
 */
export async function getQuotes(symbols: string[], market: Market): Promise<StockQuote[]> {
  const results: StockQuote[] = [];
  const uncachedSymbols: string[] = [];

  // Check cache first
  for (const symbol of symbols) {
    const formattedSymbol = formatSymbol(symbol, market);
    const cached = getCachedQuote(formattedSymbol);
    if (cached) {
      results.push(cached);
    } else {
      uncachedSymbols.push(formattedSymbol);
    }
  }

  if (uncachedSymbols.length === 0) {
    return results;
  }

  // Try batch quote API first (faster but may be blocked on Vercel)
  const batchSize = 50;
  const failedSymbols: string[] = [];

  for (let i = 0; i < uncachedSymbols.length; i += batchSize) {
    const batch = uncachedSymbols.slice(i, i + batchSize);
    const quotes = await fetchYahooQuotes(batch);

    // Track which symbols we got results for
    const fetchedSymbols = new Set<string>();
    for (const item of quotes) {
      if (item && item.regularMarketPrice) {
        const quote = transformQuote(item, market);
        cacheQuote(quote.symbol, quote);
        results.push(quote);
        fetchedSymbols.add(item.symbol);
      }
    }

    // Collect symbols that failed
    for (const sym of batch) {
      if (!fetchedSymbols.has(sym)) {
        failedSymbols.push(sym);
      }
    }

    // Small delay between batches
    if (i + batchSize < uncachedSymbols.length) {
      await new Promise(resolve => setTimeout(resolve, 50));
    }
  }

  // Fallback: use chart API for failed symbols (works on Vercel)
  if (failedSymbols.length > 0) {
    console.log(`[getQuotes] Batch API missed ${failedSymbols.length} symbols, falling back to chart API...`);
    const chartBatchSize = 10;
    for (let i = 0; i < failedSymbols.length; i += chartBatchSize) {
      const batch = failedSymbols.slice(i, i + chartBatchSize);
      const chartPromises = batch.map(async (sym) => {
        try {
          const chartData = await fetchChartQuote(sym);
          if (chartData) {
            const quote = transformQuote(chartData, market);
            cacheQuote(quote.symbol, quote);
            return quote;
          }
        } catch (e) {
          // Skip failed symbols
        }
        return null;
      });

      const chartResults = await Promise.allSettled(chartPromises);
      for (const result of chartResults) {
        if (result.status === 'fulfilled' && result.value) {
          results.push(result.value);
        }
      }

      // Small delay between chart batches
      if (i + chartBatchSize < failedSymbols.length) {
        await new Promise(resolve => setTimeout(resolve, 50));
      }
    }
  }

  return results;
}

/**
 * Get market indices
 */
export async function getMarketIndices(market: Market): Promise<MarketIndex[]> {
  const US_INDICES = ['^GSPC', '^DJI', '^IXIC'];
  const IN_INDICES = ['^NSEI', '^BSESN'];
  
  const INDEX_NAMES: Record<string, string> = {
    '^GSPC': 'S&P 500',
    '^DJI': 'Dow Jones',
    '^IXIC': 'NASDAQ',
    '^NSEI': 'NIFTY 50',
    '^BSESN': 'SENSEX'
  };

  const symbols = market === 'IN' ? IN_INDICES : US_INDICES;
  const quotes = await fetchYahooQuotes(symbols);

  return quotes.map((q: any) => ({
    symbol: q.symbol,
    name: INDEX_NAMES[q.symbol] || q.shortName || q.symbol,
    price: q.regularMarketPrice || 0,
    change: q.regularMarketChange || 0,
    changePercent: q.regularMarketChangePercent || 0,
    fiftyTwoWeekLow: q.fiftyTwoWeekLow || 0,
    fiftyTwoWeekHigh: q.fiftyTwoWeekHigh || 0
  }));
}

/**
 * Search for stocks
 */
export async function searchStocks(query: string, market: Market): Promise<any[]> {
  const results = await searchYahooSymbols(query);

  const filtered = results
    .filter((q: any) => {
      // Filter by quote type (equity or ETF)
      if (q.quoteType !== 'EQUITY' && q.quoteType !== 'ETF') {
        return false;
      }
      // Filter by market
      if (market === 'IN') {
        return q.exchange === 'NSI' || q.exchange === 'BSE' ||
          q.symbol?.endsWith('.NS') || q.symbol?.endsWith('.BO');
      } else {
        return !q.symbol?.includes('.') ||
          ['NYSE', 'NASDAQ', 'AMEX', 'NYQ', 'NMS', 'NGM', 'NCM', 'PCX', 'OPR', 'BTS'].includes(q.exchange);
      }
    })
    .slice(0, 20)
    .map((q: any) => ({
      symbol: q.symbol,
      name: q.shortname || q.longname || q.symbol,
      exchange: q.exchange,
      type: q.quoteType?.toLowerCase() || 'equity',
      market: getMarketFromSymbol(q.symbol)
    }));

  // Fallback: if Yahoo search returned nothing and query looks like a ticker, try chart API direct lookup
  if (filtered.length === 0 && /^[A-Z\-\.]{1,10}$/i.test(query.trim())) {
    const exactSymbol = query.trim().toUpperCase();
    const symbol = market === 'IN' && !exactSymbol.includes('.') ? `${exactSymbol}.NS` : exactSymbol;
    try {
      const chartData = await fetchChartQuote(symbol);
      if (chartData && chartData.meta) {
        const meta = chartData.meta;
        filtered.push({
          symbol: meta.symbol || symbol,
          name: meta.shortName || meta.longName || meta.symbol || symbol,
          exchange: meta.exchangeName || meta.exchange || 'Unknown',
          type: 'equity',
          market: getMarketFromSymbol(meta.symbol || symbol)
        });
      }
    } catch (e) {
      // Ignore fallback errors
    }
  }

  return filtered;
}

/**
 * Get popular/index stocks for a market
 */
export function getIndexSymbols(market: Market): string[] {
  if (market === 'US') {
    // S&P 500 constituents + popular additional stocks
    return [
      // Mega & Large Cap Tech
      'AAPL', 'MSFT', 'GOOGL', 'GOOG', 'AMZN', 'NVDA', 'META', 'TSLA', 'AVGO', 'ORCL',
      'ADBE', 'CRM', 'AMD', 'INTC', 'NFLX', 'QCOM', 'TXN', 'CSCO', 'ACN', 'IBM',
      'NOW', 'INTU', 'AMAT', 'ADI', 'LRCX', 'MU', 'KLAC', 'SNPS', 'CDNS', 'MRVL',
      'PANW', 'CRWD', 'FTNT', 'WDAY', 'TEAM', 'DDOG', 'ZS', 'SNOW', 'NET', 'PLTR',
      'UBER', 'ABNB', 'SQ', 'SHOP', 'MELI', 'SE', 'COIN', 'HOOD', 'RBLX', 'U',
      'DELL', 'HPQ', 'HPE', 'ANET', 'MSI', 'KEYS', 'ZBRA', 'CTSH', 'EPAM', 'IT',
      // Healthcare
      'UNH', 'JNJ', 'LLY', 'PFE', 'MRK', 'ABBV', 'TMO', 'ABT', 'DHR', 'BMY',
      'AMGN', 'GILD', 'ISRG', 'VRTX', 'REGN', 'MDT', 'SYK', 'BDX', 'ZTS', 'BSX',
      'EW', 'CI', 'HCA', 'CVS', 'MCK', 'HUM', 'CNC', 'MOH', 'A', 'IQV',
      'DXCM', 'IDXX', 'BIIB', 'MRNA', 'ALGN', 'HOLX', 'BAX', 'RMD', 'WST', 'PODD',
      // Financial Services
      'BRK-B', 'JPM', 'V', 'MA', 'BAC', 'WFC', 'GS', 'MS', 'SCHW', 'AXP',
      'BLK', 'C', 'SPGI', 'ICE', 'CME', 'AON', 'MMC', 'PGR', 'CB', 'MET',
      'AIG', 'TRV', 'ALL', 'AJG', 'AFL', 'PRU', 'FIS', 'FISV', 'GPN', 'COF',
      'USB', 'PNC', 'TFC', 'BK', 'STT', 'NTRS', 'DFS', 'SYF', 'CFG', 'FITB',
      // Consumer Cyclical
      'HD', 'LOW', 'NKE', 'SBUX', 'MCD', 'TJX', 'ROST', 'ORLY', 'AZO', 'BKNG',
      'MAR', 'HLT', 'RCL', 'CCL', 'GM', 'F', 'TM', 'RACE', 'CMG', 'YUM',
      'DPZ', 'DHI', 'LEN', 'PHM', 'NVR', 'GRMN', 'POOL', 'BBY', 'TSCO', 'DG',
      'DLTR', 'EBAY', 'ETSY', 'W', 'LULU', 'GPS', 'TPR', 'RL', 'DECK', 'BIRK',
      // Consumer Defensive
      'WMT', 'PG', 'KO', 'PEP', 'COST', 'PM', 'MO', 'CL', 'MDLZ', 'GIS',
      'KHC', 'SYY', 'HSY', 'K', 'KMB', 'CAG', 'CPB', 'SJM', 'HRL', 'TSN',
      'ADM', 'BG', 'STZ', 'TAP', 'SAM', 'KDP', 'MNST', 'EL', 'CHD', 'CLX',
      // Industrials
      'CAT', 'DE', 'HON', 'UPS', 'BA', 'GE', 'RTX', 'LMT', 'GD', 'NOC',
      'MMM', 'EMR', 'ROK', 'ETN', 'ITW', 'PH', 'IR', 'CMI', 'PCAR', 'OTIS',
      'CARR', 'JCI', 'SWK', 'FDX', 'CSX', 'UNP', 'NSC', 'DAL', 'UAL', 'LUV',
      'WM', 'RSG', 'VRSK', 'PAYX', 'ADP', 'CTAS', 'FAST', 'GWW', 'URI', 'PWR',
      // Energy
      'XOM', 'CVX', 'COP', 'SLB', 'EOG', 'MPC', 'VLO', 'PSX', 'PXD', 'OXY',
      'WMB', 'KMI', 'HAL', 'DVN', 'FANG', 'HES', 'BKR', 'TRGP', 'OKE', 'CTRA',
      // Communication Services
      'DIS', 'CMCSA', 'T', 'TMUS', 'VZ', 'CHTR', 'EA', 'TTWO', 'MTCH', 'LYV',
      'NWSA', 'OMC', 'IPG', 'FOXA', 'PARA', 'WBD', 'ROKU', 'SPOT', 'PINS', 'SNAP',
      // Utilities
      'NEE', 'DUK', 'SO', 'D', 'AEP', 'SRE', 'EXC', 'XEL', 'ED', 'WEC',
      'ES', 'AEE', 'DTE', 'PEG', 'CMS', 'FE', 'AWK', 'EVRG', 'ATO', 'NI',
      // Real Estate
      'PLD', 'AMT', 'CCI', 'EQIX', 'PSA', 'SPG', 'O', 'WELL', 'DLR', 'AVB',
      'EQR', 'VTR', 'ARE', 'MAA', 'UDR', 'ESS', 'PEAK', 'HST', 'KIM', 'REG',
      // Basic Materials
      'LIN', 'APD', 'SHW', 'ECL', 'NEM', 'FCX', 'NUE', 'DOW', 'DD', 'PPG',
      'VMC', 'MLM', 'ALB', 'FMC', 'CE', 'CF', 'MOS', 'CTVA', 'IFF', 'EMN'
    ];
  } else {
    // NIFTY 50 stocks
    return [
      'RELIANCE.NS', 'TCS.NS', 'HDFCBANK.NS', 'INFY.NS', 'ICICIBANK.NS',
      'HINDUNILVR.NS', 'SBIN.NS', 'BHARTIARTL.NS', 'ITC.NS', 'KOTAKBANK.NS',
      'LT.NS', 'AXISBANK.NS', 'BAJFINANCE.NS', 'ASIANPAINT.NS', 'MARUTI.NS',
      'HCLTECH.NS', 'TITAN.NS', 'SUNPHARMA.NS', 'WIPRO.NS', 'ULTRACEMCO.NS',
      'NTPC.NS', 'NESTLEIND.NS', 'POWERGRID.NS', 'TATAMOTORS.NS', 'M&M.NS',
      'JSWSTEEL.NS', 'TATASTEEL.NS', 'ADANIPORTS.NS', 'BAJAJFINSV.NS', 'TECHM.NS',
      'ONGC.NS', 'HDFCLIFE.NS', 'DIVISLAB.NS', 'COALINDIA.NS', 'GRASIM.NS',
      'BRITANNIA.NS', 'BPCL.NS', 'DRREDDY.NS', 'CIPLA.NS', 'APOLLOHOSP.NS',
      'EICHERMOT.NS', 'INDUSINDBK.NS', 'SBILIFE.NS', 'TATACONSUM.NS', 'HEROMOTOCO.NS'
    ];
  }
}

/**
 * Fetch stocks from Yahoo Finance Screener API (same approach as mock server).
 * Falls back to static symbol list + getQuotes if the screener API is blocked.
 */
export async function fetchScreenerStocks(market: Market, filters?: any): Promise<StockQuote[]> {
  const auth = await getYahooCrumb();
  const region = market === 'IN' ? 'in' : 'us';
  const isIndia = market === 'IN';

  // Market cap ranges to query
  const marketCapRanges = isIndia ? [
    { name: 'mega', min: 2000e9, max: null, limit: 100 },
    { name: 'large', min: 200e9, max: 2000e9, limit: 300 },
    { name: 'mid', min: 50e9, max: 200e9, limit: 500 },
    { name: 'small', min: 10e9, max: 50e9, limit: 500 },
  ] : [
    { name: 'mega', min: 200e9, max: null, limit: 250 },
    { name: 'large', min: 10e9, max: 200e9, limit: 500 },
    { name: 'mid', min: 2e9, max: 10e9, limit: 750 },
    { name: 'small', min: 1e9, max: 2e9, limit: 500 },
  ];

  // Filter ranges based on user's marketCap filter
  let rangesToFetch = marketCapRanges;
  if (filters?.marketCap?.categories?.length > 0 && filters.marketCap.categories.length < marketCapRanges.length) {
    const cats = filters.marketCap.categories;
    rangesToFetch = marketCapRanges.filter(r => cats.includes(r.name));
  }

  console.log(`[Screener] Querying ${market} market across ${rangesToFetch.length} ranges...`);

  const allResults: StockQuote[] = [];
  const seenSymbols = new Set<string>();

  for (const range of rangesToFetch) {
    try {
      const rangeStocks = await fetchScreenerRange(auth, region, range.min, range.max, range.limit, isIndia);
      for (const stock of rangeStocks) {
        if (!seenSymbols.has(stock.symbol)) {
          seenSymbols.add(stock.symbol);
          allResults.push(stock);
        }
      }
      console.log(`[Screener] ${range.name}: got ${rangeStocks.length} (total: ${allResults.length})`);
    } catch (err: any) {
      console.error(`[Screener] Range ${range.name} failed:`, err.message);
    }
  }

  // If screener API returned results, use them
  if (allResults.length > 50) {
    // Post-filter: only major exchange stocks with valid data
    const usExchanges = ['NMS', 'NYQ', 'NGM', 'NCM', 'NYS', 'NASDAQ', 'NYSE'];
    const indianExchanges = ['NSI', 'BSE', 'BOM', 'NSE'];
    const validExchanges = isIndia ? indianExchanges : usExchanges;
    const minMarketCap = isIndia ? 83e9 : 1e9;

    const filtered = allResults.filter(stock => {
      const exchange = (stock.exchange || '').toUpperCase();
      if (!validExchanges.some(ex => exchange.includes(ex))) return false;
      if (stock.marketCap && stock.marketCap > 0 && stock.marketCap < minMarketCap) return false;
      if (!stock.price || stock.price <= 0) return false;
      return true;
    });

    console.log(`[Screener] ${market}: ${allResults.length} raw -> ${filtered.length} after filter`);
    return filtered;
  }

  // Fallback: use static symbol list
  console.log(`[Screener] Screener API returned only ${allResults.length} results, falling back to static list...`);
  const symbols = getIndexSymbols(market);
  return getQuotes(symbols, market);
}

/**
 * Fetch a single market cap range from Yahoo Screener API
 */
async function fetchScreenerRange(
  auth: { crumb: string | null; cookies: string | null },
  region: string,
  minMarketCap: number | null,
  maxMarketCap: number | null,
  maxResults: number,
  isIndia: boolean
): Promise<StockQuote[]> {
  const results: StockQuote[] = [];
  let offset = 0;

  while (offset < maxResults) {
    const screenerQuery: any = {
      size: 250,
      offset: offset,
      sortField: 'intradaymarketcap',
      sortType: 'DESC',
      quoteType: 'EQUITY',
      query: {
        operator: 'AND',
        operands: [
          { operator: 'eq', operands: ['region', region] }
        ]
      },
      userId: '',
      userIdType: 'guid'
    };

    // Exchange filter
    if (isIndia) {
      screenerQuery.query.operands.push({
        operator: 'or',
        operands: [
          { operator: 'eq', operands: ['exchange', 'NSI'] },
          { operator: 'eq', operands: ['exchange', 'BSE'] },
          { operator: 'eq', operands: ['exchange', 'BOM'] }
        ]
      });
    } else {
      screenerQuery.query.operands.push({
        operator: 'or',
        operands: [
          { operator: 'eq', operands: ['exchange', 'NMS'] },
          { operator: 'eq', operands: ['exchange', 'NYQ'] },
          { operator: 'eq', operands: ['exchange', 'NGM'] },
          { operator: 'eq', operands: ['exchange', 'NCM'] },
          { operator: 'eq', operands: ['exchange', 'NYS'] }
        ]
      });
    }

    // Market cap range
    const minThreshold = isIndia ? 83e9 : 1e9;
    const effectiveMin = minMarketCap != null ? Math.max(minMarketCap, minThreshold) : minThreshold;
    screenerQuery.query.operands.push({ operator: 'gte', operands: ['intradaymarketcap', effectiveMin] });

    if (maxMarketCap != null) {
      screenerQuery.query.operands.push({ operator: 'lt', operands: ['intradaymarketcap', maxMarketCap] });
    }

    const postData = JSON.stringify(screenerQuery);
    const url = '/v1/finance/screener?crumb=' + encodeURIComponent(auth.crumb || '');

    const response = await httpsRequest({
      hostname: 'query1.finance.yahoo.com',
      port: 443,
      path: url,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData).toString(),
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json',
        'Cookie': auth.cookies || ''
      }
    }, postData);

    if (response.statusCode !== 200) {
      console.log(`[Screener] Range query returned ${response.statusCode}`);
      break;
    }

    const data = JSON.parse(response.body);
    const quotes = data?.finance?.result?.[0]?.quotes || [];

    if (quotes.length === 0) break;

    const market: Market = isIndia ? 'IN' : 'US';
    for (const q of quotes) {
      if (!q || !q.symbol) continue;
      const price = q.regularMarketPrice || 0;
      const high52 = q.fiftyTwoWeekHigh || price;
      const low52 = q.fiftyTwoWeekLow || price;
      const fiftyDayMA = q.fiftyDayAverage || null;
      const twoHundredDayMA = q.twoHundredDayAverage || null;
      const avgVol = q.averageDailyVolume3Month || q.averageDailyVolume10Day || 1;
      const vol = q.regularMarketVolume || 0;
      const mktCap = q.marketCap || 0;
      const eps = q.epsTrailingTwelveMonths || null;
      const fwdEps = q.epsForward || null;

      results.push({
        symbol: q.symbol,
        name: q.shortName || q.longName || q.symbol,
        price,
        change: q.regularMarketChange || 0,
        changePercent: q.regularMarketChangePercent || 0,
        market,
        exchange: q.exchange || 'Unknown',
        currency: q.currency || (isIndia ? 'INR' : 'USD'),
        marketCap: mktCap,
        marketCapCategory: categorizeMarketCap(mktCap, market),
        fiftyTwoWeekHigh: high52,
        fiftyTwoWeekLow: low52,
        percentFromFiftyTwoWeekHigh: high52 > 0 ? ((price - high52) / high52) * 100 : 0,
        percentFromFiftyTwoWeekLow: low52 > 0 ? ((price - low52) / low52) * 100 : 0,
        peRatio: q.trailingPE ?? (eps && eps !== 0 ? price / eps : null),
        forwardPeRatio: q.forwardPE ?? (fwdEps && fwdEps !== 0 ? price / fwdEps : null),
        pbRatio: q.priceToBook || null,
        psRatio: q.priceToSalesTrailing12Months || null,
        eps,
        forwardEps: fwdEps,
        earningsGrowth: q.earningsQuarterlyGrowth ? q.earningsQuarterlyGrowth * 100 : null,
        revenueGrowth: q.revenueGrowth ? q.revenueGrowth * 100 : null,
        dividendYield: q.trailingAnnualDividendYield ? q.trailingAnnualDividendYield * 100 : (q.dividendYield || null),
        avgVolume: avgVol,
        volume: vol,
        relativeVolume: avgVol > 0 ? vol / avgVol : 1,
        sector: q.sector || getStaticSectorInfo(q.symbol)?.sector || 'Unknown',
        industry: q.industry || getStaticSectorInfo(q.symbol)?.industry || 'Unknown',
        beta: q.beta || null,
        fiftyDayMA,
        twoHundredDayMA,
        percentFromFiftyDayMA: fiftyDayMA && fiftyDayMA > 0 ? ((price - fiftyDayMA) / fiftyDayMA) * 100 : null,
        percentFromTwoHundredDayMA: twoHundredDayMA && twoHundredDayMA > 0 ? ((price - twoHundredDayMA) / twoHundredDayMA) * 100 : null,
        lastUpdated: new Date()
      });
    }

    if (quotes.length < 250) break;
    offset += 250;

    // Small delay between pages
    await new Promise(resolve => setTimeout(resolve, 50));
  }

  return results;
}
