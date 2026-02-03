import yahooFinance from 'yahoo-finance2';

// Configure yahoo-finance2
yahooFinance.setGlobalConfig({
  queue: {
    concurrency: 2,
    timeout: 60000
  }
});

/**
 * Market type
 */
export type Market = 'US' | 'IN';

/**
 * Stock quote from Yahoo Finance
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
 * In-memory cache for quotes
 */
const quoteCache = new Map<string, { data: StockQuote; timestamp: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

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
  if (quoteCache.size > 1000) {
    const firstKey = quoteCache.keys().next().value;
    if (firstKey) quoteCache.delete(firstKey);
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
  // If symbol already has suffix, return as is
  if (symbol.includes('.')) {
    return symbol;
  }
  
  // For Indian market, default to NSE
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

  return {
    symbol: data.symbol,
    name: data.shortName || data.longName || data.symbol,
    price,
    change: data.regularMarketChange || 0,
    changePercent: data.regularMarketChangePercent || 0,
    market,
    exchange: data.exchange || data.fullExchangeName || 'Unknown',
    currency: data.currency || (market === 'US' ? 'USD' : 'INR'),
    marketCap: data.marketCap || 0,
    marketCapCategory: categorizeMarketCap(data.marketCap || 0, market),
    fiftyTwoWeekHigh: high52,
    fiftyTwoWeekLow: low52,
    percentFromFiftyTwoWeekHigh: high52 > 0 ? ((price - high52) / high52) * 100 : 0,
    percentFromFiftyTwoWeekLow: low52 > 0 ? ((price - low52) / low52) * 100 : 0,
    peRatio: data.trailingPE || null,
    forwardPeRatio: data.forwardPE || null,
    pbRatio: data.priceToBook || null,
    psRatio: data.priceToSalesTrailing12Months || null,
    eps: data.trailingEps || null,
    forwardEps: data.forwardEps || null,
    earningsGrowth: data.earningsQuarterlyGrowth ? data.earningsQuarterlyGrowth * 100 : null,
    revenueGrowth: data.revenueGrowth ? data.revenueGrowth * 100 : null,
    dividendYield: data.dividendYield ? data.dividendYield * 100 : null,
    avgVolume,
    volume,
    relativeVolume: avgVolume > 0 ? volume / avgVolume : 1,
    sector: data.sector || 'Unknown',
    industry: data.industry || 'Unknown',
    beta: data.beta || null,
    fiftyDayMA,
    twoHundredDayMA,
    percentFromFiftyDayMA: fiftyDayMA && fiftyDayMA > 0 ? ((price - fiftyDayMA) / fiftyDayMA) * 100 : null,
    percentFromTwoHundredDayMA: twoHundredDayMA && twoHundredDayMA > 0 ? ((price - twoHundredDayMA) / twoHundredDayMA) * 100 : null,
    lastUpdated: new Date()
  };
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

  try {
    const data = await yahooFinance.quoteSummary(formattedSymbol, {
      modules: ['price', 'summaryDetail', 'defaultKeyStatistics', 'financialData', 'assetProfile']
    });

    const quote = transformQuote({
      symbol: formattedSymbol,
      ...data.price,
      ...data.summaryDetail,
      ...data.defaultKeyStatistics,
      ...data.financialData,
      sector: data.assetProfile?.sector,
      industry: data.assetProfile?.industry
    }, market);

    cacheQuote(formattedSymbol, quote);
    return quote;
  } catch (error) {
    console.error(`Error fetching quote for ${formattedSymbol}:`, error);
    throw new Error(`Failed to fetch quote for ${symbol}`);
  }
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

  try {
    // Use quote for batch requests (faster than quoteSummary for multiple)
    const data = await yahooFinance.quote(uncachedSymbols);
    const quotes = Array.isArray(data) ? data : [data];

    for (const item of quotes) {
      if (item) {
        const quote = transformQuote(item, market);
        cacheQuote(quote.symbol, quote);
        results.push(quote);
      }
    }
  } catch (error) {
    console.error('Error fetching batch quotes:', error);
    // Return what we have from cache
  }

  return results;
}

/**
 * Search for stocks
 */
export async function searchStocks(query: string, market: Market): Promise<any[]> {
  try {
    const results = await yahooFinance.search(query, {
      newsCount: 0,
      quotesCount: 20
    });

    return (results.quotes || [])
      .filter((q: any) => {
        // Filter by market
        if (market === 'IN') {
          return q.exchange === 'NSI' || q.exchange === 'BSE' || 
                 q.symbol?.endsWith('.NS') || q.symbol?.endsWith('.BO');
        } else {
          return !q.symbol?.includes('.') || 
                 ['NYSE', 'NASDAQ', 'AMEX', 'NYQ', 'NMS', 'NGM'].includes(q.exchange);
        }
      })
      .map((q: any) => ({
        symbol: q.symbol,
        name: q.shortname || q.longname || q.symbol,
        exchange: q.exchange,
        type: q.quoteType?.toLowerCase() || 'equity',
        market: getMarketFromSymbol(q.symbol)
      }));
  } catch (error) {
    console.error('Search error:', error);
    return [];
  }
}

/**
 * Get popular/index stocks for a market
 */
export function getIndexSymbols(market: Market): string[] {
  if (market === 'US') {
    // S&P 500 sample + popular tech stocks
    return [
      'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'NVDA', 'META', 'TSLA', 'BRK-B', 'UNH', 'JNJ',
      'V', 'XOM', 'JPM', 'WMT', 'MA', 'PG', 'HD', 'CVX', 'MRK', 'ABBV',
      'LLY', 'PFE', 'KO', 'PEP', 'COST', 'AVGO', 'TMO', 'MCD', 'CSCO', 'ACN',
      'ABT', 'DHR', 'NEE', 'VZ', 'ADBE', 'NKE', 'TXN', 'CRM', 'PM', 'ORCL',
      'AMD', 'INTC', 'NFLX', 'QCOM', 'HON', 'UPS', 'LOW', 'BA', 'SBUX', 'CAT'
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
