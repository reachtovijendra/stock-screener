import type { VercelRequest, VercelResponse } from '@vercel/node';
import { fetchScreenerStocks, Market, StockQuote } from '../yahoo-client';

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

function passesRangeFilter(value: number | null, filter: RangeFilter): boolean {
  if (value === null || value === undefined) {
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

function passesFilters(stock: StockQuote, filters: ScreenerFilters): boolean {
  if (filters.marketCap.mode === 'categories' && filters.marketCap.categories.length > 0) {
    if (!filters.marketCap.categories.includes(stock.marketCapCategory)) {
      return false;
    }
  } else if (filters.marketCap.mode === 'custom') {
    if (!passesRangeFilter(stock.marketCap, filters.marketCap.customRange)) {
      return false;
    }
  }

  if (!passesRangeFilter(stock.price, filters.price)) {
    return false;
  }

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

  if (!passesRangeFilter(stock.peRatio, filters.peRatio)) {
    return false;
  }

  if (!passesRangeFilter(stock.forwardPeRatio, filters.forwardPeRatio)) {
    return false;
  }

  if (!passesRangeFilter(stock.pbRatio, filters.pbRatio)) {
    return false;
  }

  if (!passesRangeFilter(stock.earningsGrowth, filters.earningsGrowth)) {
    return false;
  }

  if (!passesRangeFilter(stock.revenueGrowth, filters.revenueGrowth)) {
    return false;
  }

  if (!passesRangeFilter(stock.dividendYield, filters.dividendYield)) {
    return false;
  }

  if (!passesRangeFilter(stock.avgVolume, filters.avgVolume)) {
    return false;
  }

  if (!passesRangeFilter(stock.relativeVolume, filters.relativeVolume)) {
    return false;
  }

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
    if (stock.fiftyDayMA === null || stock.twoHundredDayMA === null) {
      return false;
    }
    if (stock.fiftyDayMA >= stock.twoHundredDayMA) {
      return false;
    }
  }

  if (filters.sectors.length > 0 && !filters.sectors.includes(stock.sector)) {
    return false;
  }

  if (filters.exchanges.length > 0 && !filters.exchanges.includes(stock.exchange)) {
    return false;
  }

  return true;
}

function sortStocks(stocks: StockQuote[], sort: SortConfig): StockQuote[] {
  return [...stocks].sort((a, b) => {
    const aVal = (a as any)[sort.field];
    const bVal = (b as any)[sort.field];
    
    if (aVal === null && bVal === null) return 0;
    if (aVal === null) return sort.direction === 'asc' ? 1 : -1;
    if (bVal === null) return sort.direction === 'asc' ? -1 : 1;
    
    if (typeof aVal === 'string') {
      return sort.direction === 'asc' 
        ? aVal.localeCompare(bVal)
        : bVal.localeCompare(aVal);
    }
    
    return sort.direction === 'asc' ? aVal - bVal : bVal - aVal;
  });
}

export async function handleScreen(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { filters, sort, pagination } = req.body as ScreenRequest;
    
    if (!filters || !filters.market) {
      return res.status(400).json({ error: 'Filters with market are required' });
    }

    const startTime = Date.now();
    
    const allQuotes = await fetchScreenerStocks(filters.market, filters);
    
    const filteredStocks = allQuotes.filter(stock => passesFilters(stock, filters));
    
    const sortedStocks = sortStocks(filteredStocks, sort || { field: 'marketCap', direction: 'desc' });
    
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
    
    return res.status(200).json({
      stocks: [],
      totalCount: 0,
      executionTimeMs: 0,
      error: 'Screening failed - Yahoo Finance may be temporarily unavailable',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
}
