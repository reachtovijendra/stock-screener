import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getQuotes, getIndexSymbols, Market, StockQuote } from '../_lib/yahoo-client';

interface RangeFilter {
  min?: number;
  max?: number;
}

interface MarketCapFilter {
  mode: 'categories' | 'custom';
  categories: string[];
  customRange: RangeFilter;
}

interface FiftyTwoWeekFilter {
  percentFromHigh: RangeFilter;
  percentFromLow: RangeFilter;
  nearHigh: boolean;
  nearLow: boolean;
}

interface MovingAverageFilter {
  aboveFiftyDayMA: boolean | null;
  aboveTwoHundredDayMA: boolean | null;
  goldenCross: boolean;
  deathCross: boolean;
}

interface ScreenerFilters {
  market: Market;
  marketCap: MarketCapFilter;
  price: RangeFilter;
  fiftyTwoWeek: FiftyTwoWeekFilter;
  peRatio: RangeFilter;
  forwardPeRatio: RangeFilter;
  pbRatio: RangeFilter;
  psRatio: RangeFilter;
  earningsGrowth: RangeFilter;
  revenueGrowth: RangeFilter;
  dividendYield: RangeFilter;
  avgVolume: RangeFilter;
  relativeVolume: RangeFilter;
  eps: RangeFilter;
  beta: RangeFilter;
  movingAverages: MovingAverageFilter;
  sectors: string[];
  exchanges: string[];
}

interface SortConfig {
  field: string;
  direction: 'asc' | 'desc';
}

interface PaginationConfig {
  page: number;
  pageSize: number;
}

interface ScreenRequest {
  filters: ScreenerFilters;
  sort: SortConfig;
  pagination: PaginationConfig;
}

/**
 * Check if value passes range filter
 */
function passesRangeFilter(value: number | null, filter: RangeFilter): boolean {
  if (value === null || value === undefined) {
    // Allow null values to pass if no filter is set
    return filter.min === undefined && filter.max === undefined;
  }
  
  if (filter.min !== undefined && value < filter.min) {
    return false;
  }
  if (filter.max !== undefined && value > filter.max) {
    return false;
  }
  return true;
}

/**
 * Check if stock passes all filters
 */
function passesFilters(stock: StockQuote, filters: ScreenerFilters): boolean {
  // Market cap filter
  if (filters.marketCap.mode === 'categories' && filters.marketCap.categories.length > 0) {
    if (!filters.marketCap.categories.includes(stock.marketCapCategory)) {
      return false;
    }
  } else if (filters.marketCap.mode === 'custom') {
    if (!passesRangeFilter(stock.marketCap, filters.marketCap.customRange)) {
      return false;
    }
  }

  // Price filter
  if (!passesRangeFilter(stock.price, filters.price)) {
    return false;
  }

  // 52-week filters
  if (filters.fiftyTwoWeek.nearHigh) {
    if (stock.percentFromFiftyTwoWeekHigh < -5) {
      return false;
    }
  }
  
  if (filters.fiftyTwoWeek.nearLow) {
    if (stock.percentFromFiftyTwoWeekLow > 10) {
      return false;
    }
  }

  if (!passesRangeFilter(stock.percentFromFiftyTwoWeekHigh, filters.fiftyTwoWeek.percentFromHigh)) {
    return false;
  }

  // Valuation filters
  if (!passesRangeFilter(stock.peRatio, filters.peRatio)) {
    return false;
  }

  if (!passesRangeFilter(stock.forwardPeRatio, filters.forwardPeRatio)) {
    return false;
  }

  if (!passesRangeFilter(stock.pbRatio, filters.pbRatio)) {
    return false;
  }

  // Growth filters
  if (!passesRangeFilter(stock.earningsGrowth, filters.earningsGrowth)) {
    return false;
  }

  if (!passesRangeFilter(stock.revenueGrowth, filters.revenueGrowth)) {
    return false;
  }

  // Dividend filter
  if (!passesRangeFilter(stock.dividendYield, filters.dividendYield)) {
    return false;
  }

  // Volume filters
  if (!passesRangeFilter(stock.avgVolume, filters.avgVolume)) {
    return false;
  }

  if (!passesRangeFilter(stock.relativeVolume, filters.relativeVolume)) {
    return false;
  }

  // Moving average filters
  const ma = filters.movingAverages;
  
  if (ma.aboveFiftyDayMA !== null && stock.percentFromFiftyDayMA !== null) {
    const isAbove = stock.percentFromFiftyDayMA > 0;
    if (ma.aboveFiftyDayMA !== isAbove) {
      return false;
    }
  }

  if (ma.aboveTwoHundredDayMA !== null && stock.percentFromTwoHundredDayMA !== null) {
    const isAbove = stock.percentFromTwoHundredDayMA > 0;
    if (ma.aboveTwoHundredDayMA !== isAbove) {
      return false;
    }
  }

  if (ma.goldenCross) {
    // Golden cross: 50 MA > 200 MA and price above both
    if (stock.fiftyDayMA === null || stock.twoHundredDayMA === null) {
      return false;
    }
    if (stock.fiftyDayMA <= stock.twoHundredDayMA) {
      return false;
    }
    if (stock.price < stock.fiftyDayMA) {
      return false;
    }
  }

  if (ma.deathCross) {
    // Death cross: 50 MA < 200 MA
    if (stock.fiftyDayMA === null || stock.twoHundredDayMA === null) {
      return false;
    }
    if (stock.fiftyDayMA >= stock.twoHundredDayMA) {
      return false;
    }
  }

  // Sector filter
  if (filters.sectors.length > 0 && !filters.sectors.includes(stock.sector)) {
    return false;
  }

  // Exchange filter
  if (filters.exchanges.length > 0 && !filters.exchanges.includes(stock.exchange)) {
    return false;
  }

  return true;
}

/**
 * Sort stocks by field
 */
function sortStocks(stocks: StockQuote[], sort: SortConfig): StockQuote[] {
  return [...stocks].sort((a, b) => {
    const aVal = (a as any)[sort.field];
    const bVal = (b as any)[sort.field];
    
    // Handle null values
    if (aVal === null && bVal === null) return 0;
    if (aVal === null) return sort.direction === 'asc' ? 1 : -1;
    if (bVal === null) return sort.direction === 'asc' ? -1 : 1;
    
    // Compare values
    if (typeof aVal === 'string') {
      return sort.direction === 'asc' 
        ? aVal.localeCompare(bVal)
        : bVal.localeCompare(aVal);
    }
    
    return sort.direction === 'asc' ? aVal - bVal : bVal - aVal;
  });
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
    const { filters, sort, pagination } = req.body as ScreenRequest;
    
    if (!filters || !filters.market) {
      return res.status(400).json({ error: 'Filters with market are required' });
    }

    const startTime = Date.now();
    
    // Get base stock list for screening
    const symbols = getIndexSymbols(filters.market);
    
    // Fetch quotes for all symbols
    const allQuotes = await getQuotes(symbols, filters.market);
    
    // Apply filters
    const filteredStocks = allQuotes.filter(stock => passesFilters(stock, filters));
    
    // Sort
    const sortedStocks = sortStocks(filteredStocks, sort || { field: 'marketCap', direction: 'desc' });
    
    // Paginate
    const page = pagination?.page || 0;
    const pageSize = pagination?.pageSize || 50;
    const start = page * pageSize;
    const paginatedStocks = sortedStocks.slice(start, start + pageSize);
    
    const executionTime = Date.now() - startTime;

    return res.status(200).json({
      stocks: paginatedStocks,
      totalCount: filteredStocks.length,
      executionTimeMs: executionTime,
      appliedFilters: filters,
      timestamp: new Date().toISOString()
    });
  } catch (error: any) {
    console.error('Screen API error:', error);
    return res.status(500).json({ 
      error: 'Screening failed',
      message: error.message 
    });
  }
}
