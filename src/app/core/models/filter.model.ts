import { Market, MarketCapCategory, Sector } from './stock.model';

/**
 * Range filter with optional min and max values
 */
export interface RangeFilter {
  min?: number;
  max?: number;
}

/**
 * Complete filter configuration for stock screening
 */
export interface ScreenerFilters {
  /** Target market */
  market: Market;
  
  /** Market cap filter */
  marketCap: MarketCapFilter;
  
  /** Price range filter */
  price: RangeFilter;
  
  /** 52-week high/low filters */
  fiftyTwoWeek: FiftyTwoWeekFilter;
  
  /** P/E ratio filter (trailing) */
  peRatio: RangeFilter;
  
  /** Forward P/E ratio filter */
  forwardPeRatio: RangeFilter;
  
  /** P/B ratio filter */
  pbRatio: RangeFilter;
  
  /** P/S ratio filter */
  psRatio: RangeFilter;
  
  /** Earnings growth filter (YoY %) */
  earningsGrowth: RangeFilter;
  
  /** Revenue growth filter (YoY %) */
  revenueGrowth: RangeFilter;
  
  /** Dividend yield filter (%) */
  dividendYield: RangeFilter;
  
  /** Average volume filter */
  avgVolume: RangeFilter;
  
  /** Relative volume filter (ratio to average) */
  relativeVolume: RangeFilter;
  
  /** EPS filter */
  eps: RangeFilter;
  
  /** Beta filter */
  beta: RangeFilter;
  
  /** Moving average filters */
  movingAverages: MovingAverageFilter;
  
  /** RSI filter */
  rsi: RSIFilter;
  
  /** MACD filter */
  macd: MACDFilter;
  
  /** Sectors to include (empty = all) */
  sectors: Sector[];
  
  /** Exchanges to include (empty = all for market) */
  exchanges: string[];
}

/**
 * Market cap filter with category presets or custom range
 */
export interface MarketCapFilter {
  /** Use category presets or custom range */
  mode: 'categories' | 'custom';
  
  /** Selected categories when mode is 'categories' */
  categories: MarketCapCategory[];
  
  /** Custom range when mode is 'custom' */
  customRange: RangeFilter;
}

/**
 * 52-week high/low filter
 */
export interface FiftyTwoWeekFilter {
  /** Percentage from 52-week high (e.g., -5 means within 5% of high) */
  percentFromHigh: RangeFilter;
  
  /** Percentage from 52-week low (e.g., 10 means at least 10% above low) */
  percentFromLow: RangeFilter;
  
  /** Filter for stocks at or near 52-week high */
  nearHigh: boolean;
  
  /** Filter for stocks at or near 52-week low */
  nearLow: boolean;
}

/**
 * Moving average filter
 */
export interface MovingAverageFilter {
  /** Price relative to 50-day MA */
  aboveFiftyDayMA: boolean | null;  // true = above, false = below, null = no filter
  
  /** Price relative to 200-day MA */
  aboveTwoHundredDayMA: boolean | null;
  
  /** Golden cross (50 MA > 200 MA) */
  goldenCross: boolean;
  
  /** Death cross (50 MA < 200 MA) */
  deathCross: boolean;
}

/**
 * RSI (Relative Strength Index) filter zones
 * RSI ranges from 0-100, helps identify overbought/oversold conditions
 */
export type RSIZone = 'oversold' | 'approaching_oversold' | 'neutral' | 'approaching_overbought' | 'overbought';

export interface RSIFilter {
  /** Selected RSI zones (empty = no filter) */
  zones: RSIZone[];
  
  /** Custom RSI range */
  customRange: RangeFilter;
}

/**
 * RSI zone definitions for display
 */
export const RSI_ZONES: { id: RSIZone; label: string; description: string; min: number; max: number }[] = [
  { id: 'oversold', label: 'Oversold', description: 'RSI < 30 - Potential bounce', min: 0, max: 30 },
  { id: 'approaching_oversold', label: 'Near Oversold', description: 'RSI 30-40', min: 30, max: 40 },
  { id: 'neutral', label: 'Neutral', description: 'RSI 40-60', min: 40, max: 60 },
  { id: 'approaching_overbought', label: 'Near Overbought', description: 'RSI 60-70', min: 60, max: 70 },
  { id: 'overbought', label: 'Overbought', description: 'RSI > 70 - Potential pullback', min: 70, max: 100 }
];

/**
 * MACD (Moving Average Convergence Divergence) signal types
 */
export type MACDSignal = 'bullish' | 'bearish' | 'bullish_crossover' | 'bearish_crossover' | 'strong_bullish' | 'strong_bearish';

export interface MACDFilter {
  /** Selected MACD signals (empty = no filter) */
  signals: MACDSignal[];
}

/**
 * MACD signal definitions for display
 */
export const MACD_SIGNALS: { id: MACDSignal; label: string; description: string; icon: string }[] = [
  { id: 'bullish', label: 'Bullish', description: 'MACD above signal line', icon: 'pi-arrow-up' },
  { id: 'bearish', label: 'Bearish', description: 'MACD below signal line', icon: 'pi-arrow-down' },
  { id: 'bullish_crossover', label: 'Buy Signal', description: 'MACD just crossed above signal', icon: 'pi-bolt' },
  { id: 'bearish_crossover', label: 'Sell Signal', description: 'MACD just crossed below signal', icon: 'pi-exclamation-triangle' },
  { id: 'strong_bullish', label: 'Strong Bullish', description: 'MACD > 0 and above signal', icon: 'pi-angle-double-up' },
  { id: 'strong_bearish', label: 'Strong Bearish', description: 'MACD < 0 and below signal', icon: 'pi-angle-double-down' }
];

/**
 * Market cap thresholds by market (in respective currencies)
 */
export const MARKET_CAP_THRESHOLDS: Record<Market, Record<MarketCapCategory, RangeFilter>> = {
  US: {
    mega: { min: 200_000_000_000 },           // > $200B
    large: { min: 10_000_000_000, max: 200_000_000_000 },  // $10B - $200B
    mid: { min: 2_000_000_000, max: 10_000_000_000 },      // $2B - $10B
    small: { min: 300_000_000, max: 2_000_000_000 },       // $300M - $2B
    micro: { max: 300_000_000 }               // < $300M
  },
  IN: {
    // Indian market uses different thresholds (in INR)
    mega: { min: 2_000_000_000_000 },         // > ₹2 Lakh Cr
    large: { min: 200_000_000_000, max: 2_000_000_000_000 }, // ₹20K Cr - ₹2L Cr
    mid: { min: 50_000_000_000, max: 200_000_000_000 },      // ₹5K Cr - ₹20K Cr
    small: { min: 5_000_000_000, max: 50_000_000_000 },      // ₹500 Cr - ₹5K Cr
    micro: { max: 5_000_000_000 }             // < ₹500 Cr
  }
};

/**
 * Preset filter configurations for common screening strategies
 */
export interface FilterPreset {
  id: string;
  name: string;
  description: string;
  category: 'value' | 'growth' | 'momentum' | 'dividend' | 'custom';
  filters: Partial<ScreenerFilters>;
}

/**
 * Built-in filter presets
 */
export const FILTER_PRESETS: FilterPreset[] = [
  {
    id: 'value-stocks',
    name: 'Value Stocks',
    description: 'Low P/E, low P/B stocks with solid fundamentals',
    category: 'value',
    filters: {
      peRatio: { min: 0, max: 15 },
      pbRatio: { min: 0, max: 2 },
      earningsGrowth: { min: 0 },
      dividendYield: { min: 1 }
    }
  },
  {
    id: 'growth-stocks',
    name: 'Growth Stocks',
    description: 'High earnings and revenue growth companies',
    category: 'growth',
    filters: {
      earningsGrowth: { min: 20 },
      revenueGrowth: { min: 15 },
      marketCap: {
        mode: 'categories',
        categories: ['large', 'mega'],
        customRange: {}
      }
    }
  },
  {
    id: 'momentum-52w-high',
    name: '52-Week High Momentum',
    description: 'Stocks near their 52-week highs with strong volume',
    category: 'momentum',
    filters: {
      fiftyTwoWeek: {
        percentFromHigh: { min: -5 },
        percentFromLow: {},
        nearHigh: true,
        nearLow: false
      },
      relativeVolume: { min: 1.2 },
      movingAverages: {
        aboveFiftyDayMA: true,
        aboveTwoHundredDayMA: true,
        goldenCross: false,
        deathCross: false
      }
    }
  },
  {
    id: 'high-dividend',
    name: 'High Dividend Yield',
    description: 'Stocks with attractive dividend yields',
    category: 'dividend',
    filters: {
      dividendYield: { min: 3 },
      peRatio: { max: 25 },
      marketCap: {
        mode: 'categories',
        categories: ['large', 'mega', 'mid'],
        customRange: {}
      }
    }
  },
  {
    id: 'oversold-bounce',
    name: 'Oversold Bounce Candidates',
    description: 'Stocks significantly below moving averages - potential reversals',
    category: 'momentum',
    filters: {
      fiftyTwoWeek: {
        percentFromHigh: { max: -20 },
        percentFromLow: { min: 5, max: 30 },
        nearHigh: false,
        nearLow: false
      },
      movingAverages: {
        aboveFiftyDayMA: false,
        aboveTwoHundredDayMA: false,
        goldenCross: false,
        deathCross: false
      },
      relativeVolume: { min: 1.5 }
    }
  },
  {
    id: 'golden-cross',
    name: 'Golden Cross',
    description: 'Stocks where 50-day MA crossed above 200-day MA',
    category: 'momentum',
    filters: {
      movingAverages: {
        aboveFiftyDayMA: true,
        aboveTwoHundredDayMA: true,
        goldenCross: true,
        deathCross: false
      }
    }
  }
];

/**
 * Default filter state
 */
export function getDefaultFilters(market: Market = 'US'): ScreenerFilters {
  return {
    market,
    marketCap: {
      mode: 'categories',
      categories: [],
      customRange: {}
    },
    price: {},
    fiftyTwoWeek: {
      percentFromHigh: {},
      percentFromLow: {},
      nearHigh: false,
      nearLow: false
    },
    peRatio: {},
    forwardPeRatio: {},
    pbRatio: {},
    psRatio: {},
    earningsGrowth: {},
    revenueGrowth: {},
    dividendYield: {},
    avgVolume: {},
    relativeVolume: {},
    eps: {},
    beta: {},
    movingAverages: {
      aboveFiftyDayMA: null,
      aboveTwoHundredDayMA: null,
      goldenCross: false,
      deathCross: false
    },
    rsi: {
      zones: [],
      customRange: {}
    },
    macd: {
      signals: []
    },
    sectors: [],
    exchanges: []
  };
}

/**
 * Sort configuration for results
 */
export interface SortConfig {
  field: keyof import('./stock.model').Stock;
  direction: 'asc' | 'desc';
}

/**
 * Pagination configuration
 */
export interface PaginationConfig {
  page: number;
  pageSize: number;
  totalRecords: number;
}

/**
 * Screen result with metadata
 */
export interface ScreenResult {
  stocks: import('./stock.model').Stock[];
  totalCount: number;
  executionTimeMs: number;
  appliedFilters: ScreenerFilters;
  timestamp: Date;
}
