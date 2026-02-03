/**
 * Local development server for Stock Screener API
 * This runs the same API endpoints as Vercel serverless functions
 */

const express = require('express');
const cors = require('cors');
const yahooFinance = require('yahoo-finance2').default;

const app = express();
const PORT = 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Configure yahoo-finance2
yahooFinance.setGlobalConfig({
  queue: {
    concurrency: 2,
    timeout: 60000
  }
});

// Cache
const quoteCache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// Helper functions
function getCachedQuote(symbol) {
  const cached = quoteCache.get(symbol);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data;
  }
  return null;
}

function cacheQuote(symbol, quote) {
  quoteCache.set(symbol, { data: quote, timestamp: Date.now() });
  if (quoteCache.size > 1000) {
    const firstKey = quoteCache.keys().next().value;
    if (firstKey) quoteCache.delete(firstKey);
  }
}

function getMarketFromSymbol(symbol) {
  if (symbol.endsWith('.NS') || symbol.endsWith('.BO')) {
    return 'IN';
  }
  return 'US';
}

function formatSymbol(symbol, market) {
  if (symbol.includes('.')) return symbol;
  if (market === 'IN') return `${symbol}.NS`;
  return symbol;
}

function categorizeMarketCap(marketCap, market) {
  if (market === 'US') {
    if (marketCap >= 200_000_000_000) return 'mega';
    if (marketCap >= 10_000_000_000) return 'large';
    if (marketCap >= 2_000_000_000) return 'mid';
    if (marketCap >= 300_000_000) return 'small';
    return 'micro';
  } else {
    if (marketCap >= 2_000_000_000_000) return 'mega';
    if (marketCap >= 200_000_000_000) return 'large';
    if (marketCap >= 50_000_000_000) return 'mid';
    if (marketCap >= 5_000_000_000) return 'small';
    return 'micro';
  }
}

function transformQuote(data, market) {
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

function getIndexSymbols(market) {
  if (market === 'US') {
    return [
      'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'NVDA', 'META', 'TSLA', 'BRK-B', 'UNH', 'JNJ',
      'V', 'XOM', 'JPM', 'WMT', 'MA', 'PG', 'HD', 'CVX', 'MRK', 'ABBV',
      'LLY', 'PFE', 'KO', 'PEP', 'COST', 'AVGO', 'TMO', 'MCD', 'CSCO', 'ACN',
      'ABT', 'DHR', 'NEE', 'VZ', 'ADBE', 'NKE', 'TXN', 'CRM', 'PM', 'ORCL'
    ];
  } else {
    return [
      'RELIANCE.NS', 'TCS.NS', 'HDFCBANK.NS', 'INFY.NS', 'ICICIBANK.NS',
      'HINDUNILVR.NS', 'SBIN.NS', 'BHARTIARTL.NS', 'ITC.NS', 'KOTAKBANK.NS',
      'LT.NS', 'AXISBANK.NS', 'BAJFINANCE.NS', 'ASIANPAINT.NS', 'MARUTI.NS',
      'HCLTECH.NS', 'TITAN.NS', 'SUNPHARMA.NS', 'WIPRO.NS', 'ULTRACEMCO.NS'
    ];
  }
}

// Routes

// GET /api/stocks/quote
app.get('/api/stocks/quote', async (req, res) => {
  try {
    const { symbol, symbols, market = 'US' } = req.query;
    const marketType = market.toUpperCase();

    if (!symbol && !symbols) {
      return res.status(400).json({ error: 'Symbol or symbols parameter is required' });
    }

    if (symbol) {
      const formattedSymbol = formatSymbol(symbol, marketType);
      const cached = getCachedQuote(formattedSymbol);
      if (cached) {
        return res.json(cached);
      }

      const data = await yahooFinance.quote(formattedSymbol);
      const quote = transformQuote(data, marketType);
      cacheQuote(formattedSymbol, quote);
      return res.json(quote);
    } else {
      const symbolList = symbols.split(',').map(s => s.trim());
      const results = [];

      for (const sym of symbolList) {
        const formattedSymbol = formatSymbol(sym, marketType);
        const cached = getCachedQuote(formattedSymbol);
        if (cached) {
          results.push(cached);
        } else {
          try {
            const data = await yahooFinance.quote(formattedSymbol);
            const quote = transformQuote(data, marketType);
            cacheQuote(formattedSymbol, quote);
            results.push(quote);
          } catch (e) {
            console.error(`Error fetching ${formattedSymbol}:`, e.message);
          }
        }
      }

      return res.json(results);
    }
  } catch (error) {
    console.error('Quote API error:', error);
    return res.status(500).json({ error: 'Failed to fetch quote', message: error.message });
  }
});

// GET /api/stocks/quotes (alias)
app.get('/api/stocks/quotes', async (req, res) => {
  req.query.symbols = req.query.symbols;
  return app._router.handle(req, res, () => {});
});

// GET /api/stocks/search
app.get('/api/stocks/search', async (req, res) => {
  try {
    const { q, market = 'US' } = req.query;
    const marketType = market.toUpperCase();

    if (!q || q.length < 1) {
      return res.status(400).json({ error: 'Search query is required' });
    }

    const results = await yahooFinance.search(q, {
      newsCount: 0,
      quotesCount: 20
    });

    const filtered = (results.quotes || [])
      .filter(quote => {
        if (marketType === 'IN') {
          return quote.exchange === 'NSI' || quote.exchange === 'BSE' ||
                 quote.symbol?.endsWith('.NS') || quote.symbol?.endsWith('.BO');
        } else {
          return !quote.symbol?.includes('.') ||
                 ['NYSE', 'NASDAQ', 'AMEX', 'NYQ', 'NMS', 'NGM'].includes(quote.exchange);
        }
      })
      .map(q => ({
        symbol: q.symbol,
        name: q.shortname || q.longname || q.symbol,
        exchange: q.exchange,
        type: q.quoteType?.toLowerCase() || 'equity',
        market: getMarketFromSymbol(q.symbol)
      }));

    return res.json(filtered);
  } catch (error) {
    console.error('Search API error:', error);
    return res.status(500).json({ error: 'Search failed', message: error.message });
  }
});

// POST /api/stocks/screen
app.post('/api/stocks/screen', async (req, res) => {
  try {
    const { filters, sort, pagination } = req.body;

    if (!filters || !filters.market) {
      return res.status(400).json({ error: 'Filters with market are required' });
    }

    const startTime = Date.now();
    const symbols = getIndexSymbols(filters.market);

    console.log(`Screening ${symbols.length} stocks for market: ${filters.market}`);

    // Fetch quotes
    const allQuotes = [];
    const batchSize = 10;
    
    for (let i = 0; i < symbols.length; i += batchSize) {
      const batch = symbols.slice(i, i + batchSize);
      const batchPromises = batch.map(async (symbol) => {
        const cached = getCachedQuote(symbol);
        if (cached) return cached;

        try {
          const data = await yahooFinance.quote(symbol);
          const quote = transformQuote(data, filters.market);
          cacheQuote(symbol, quote);
          return quote;
        } catch (e) {
          console.error(`Error fetching ${symbol}:`, e.message);
          return null;
        }
      });

      const batchResults = await Promise.all(batchPromises);
      allQuotes.push(...batchResults.filter(q => q !== null));
    }

    // Apply filters
    let filteredStocks = allQuotes.filter(stock => {
      // Market cap filter
      if (filters.marketCap?.mode === 'categories' && filters.marketCap.categories?.length > 0) {
        if (!filters.marketCap.categories.includes(stock.marketCapCategory)) {
          return false;
        }
      }

      // P/E filter
      if (filters.peRatio?.min !== undefined && (stock.peRatio === null || stock.peRatio < filters.peRatio.min)) {
        return false;
      }
      if (filters.peRatio?.max !== undefined && (stock.peRatio === null || stock.peRatio > filters.peRatio.max)) {
        return false;
      }

      // Forward P/E filter
      if (filters.forwardPeRatio?.min !== undefined && (stock.forwardPeRatio === null || stock.forwardPeRatio < filters.forwardPeRatio.min)) {
        return false;
      }
      if (filters.forwardPeRatio?.max !== undefined && (stock.forwardPeRatio === null || stock.forwardPeRatio > filters.forwardPeRatio.max)) {
        return false;
      }

      // 52-week filters
      if (filters.fiftyTwoWeek?.nearHigh && stock.percentFromFiftyTwoWeekHigh < -5) {
        return false;
      }
      if (filters.fiftyTwoWeek?.nearLow && stock.percentFromFiftyTwoWeekLow > 10) {
        return false;
      }

      // Earnings growth filter
      if (filters.earningsGrowth?.min !== undefined && (stock.earningsGrowth === null || stock.earningsGrowth < filters.earningsGrowth.min)) {
        return false;
      }

      // Dividend yield filter
      if (filters.dividendYield?.min !== undefined && (stock.dividendYield === null || stock.dividendYield < filters.dividendYield.min)) {
        return false;
      }

      // Sector filter
      if (filters.sectors?.length > 0 && !filters.sectors.includes(stock.sector)) {
        return false;
      }

      // Moving average filters
      if (filters.movingAverages?.aboveFiftyDayMA === true && stock.percentFromFiftyDayMA !== null && stock.percentFromFiftyDayMA <= 0) {
        return false;
      }
      if (filters.movingAverages?.aboveFiftyDayMA === false && stock.percentFromFiftyDayMA !== null && stock.percentFromFiftyDayMA > 0) {
        return false;
      }

      return true;
    });

    // Sort
    const sortField = sort?.field || 'marketCap';
    const sortDir = sort?.direction || 'desc';
    
    filteredStocks.sort((a, b) => {
      const aVal = a[sortField];
      const bVal = b[sortField];
      
      if (aVal === null && bVal === null) return 0;
      if (aVal === null) return sortDir === 'asc' ? 1 : -1;
      if (bVal === null) return sortDir === 'asc' ? -1 : 1;
      
      if (typeof aVal === 'string') {
        return sortDir === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
      }
      
      return sortDir === 'asc' ? aVal - bVal : bVal - aVal;
    });

    // Paginate
    const page = pagination?.page || 0;
    const pageSize = pagination?.pageSize || 50;
    const start = page * pageSize;
    const paginatedStocks = filteredStocks.slice(start, start + pageSize);

    const executionTime = Date.now() - startTime;
    console.log(`Screening complete: ${filteredStocks.length} results in ${executionTime}ms`);

    return res.json({
      stocks: paginatedStocks,
      totalCount: filteredStocks.length,
      executionTimeMs: executionTime,
      appliedFilters: filters,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Screen API error:', error);
    return res.status(500).json({ error: 'Screening failed', message: error.message });
  }
});

// GET /api/stocks/list
app.get('/api/stocks/list', (req, res) => {
  const { market = 'US' } = req.query;
  const marketType = market.toUpperCase();
  const symbols = getIndexSymbols(marketType);

  const list = symbols.map(symbol => ({
    symbol,
    name: symbol.replace('.NS', '').replace('.BO', ''),
    exchange: symbol.endsWith('.NS') ? 'NSE' : symbol.endsWith('.BO') ? 'BSE' : 'NYSE/NASDAQ',
    type: 'equity',
    market: getMarketFromSymbol(symbol)
  }));

  return res.json(list);
});

// Start server
app.listen(PORT, () => {
  console.log(`\n🚀 Stock Screener API running at http://localhost:${PORT}`);
  console.log(`\nAvailable endpoints:`);
  console.log(`  GET  /api/stocks/quote?symbol=AAPL&market=US`);
  console.log(`  GET  /api/stocks/search?q=apple&market=US`);
  console.log(`  POST /api/stocks/screen`);
  console.log(`  GET  /api/stocks/list?market=US`);
  console.log(`\nPress Ctrl+C to stop\n`);
});
