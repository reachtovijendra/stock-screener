/**
 * Represents a stock quote with all available financial metrics
 */
export interface Stock {
  /** Stock ticker symbol (e.g., AAPL, RELIANCE.NS) */
  symbol: string;
  
  /** Company name */
  name: string;
  
  /** Current price */
  price: number;
  
  /** Price change from previous close */
  change: number;
  
  /** Percentage change from previous close */
  changePercent: number;
  
  /** Market the stock trades on */
  market: Market;
  
  /** Exchange (NYSE, NASDAQ, NSE, BSE) */
  exchange: string;
  
  /** Currency (USD, INR) */
  currency: string;
  
  /** Market capitalization in base currency */
  marketCap: number;
  
  /** Market cap category */
  marketCapCategory: MarketCapCategory;
  
  /** 52-week high price */
  fiftyTwoWeekHigh: number;
  
  /** 52-week low price */
  fiftyTwoWeekLow: number;
  
  /** Percentage below 52-week high */
  percentFromFiftyTwoWeekHigh: number;
  
  /** Percentage above 52-week low */
  percentFromFiftyTwoWeekLow: number;
  
  /** Price-to-Earnings ratio (trailing twelve months) */
  peRatio: number | null;
  
  /** Forward Price-to-Earnings ratio */
  forwardPeRatio: number | null;
  
  /** Price-to-Book ratio */
  pbRatio: number | null;
  
  /** Price-to-Sales ratio */
  psRatio: number | null;
  
  /** Earnings per share (trailing twelve months) */
  eps: number | null;
  
  /** Forward earnings per share */
  forwardEps: number | null;
  
  /** Earnings growth year-over-year percentage */
  earningsGrowth: number | null;
  
  /** Revenue growth year-over-year percentage */
  revenueGrowth: number | null;
  
  /** Dividend yield as percentage */
  dividendYield: number | null;
  
  /** Average daily volume */
  avgVolume: number;
  
  /** Current day's volume */
  volume: number;
  
  /** Volume relative to average (ratio) */
  relativeVolume: number;
  
  /** Company sector */
  sector: string;
  
  /** Company industry */
  industry: string;
  
  /** Beta (volatility relative to market) */
  beta: number | null;
  
  /** 50-day moving average */
  fiftyDayMA: number | null;
  
  /** 200-day moving average */
  twoHundredDayMA: number | null;
  
  /** Percentage above/below 50-day MA */
  percentFromFiftyDayMA: number | null;
  
  /** Percentage above/below 200-day MA */
  percentFromTwoHundredDayMA: number | null;
  
  /** RSI (Relative Strength Index) - 14 period */
  rsi: number | null;
  
  /** MACD Line (12-day EMA - 26-day EMA) */
  macdLine: number | null;
  
  /** MACD Signal Line (9-day EMA of MACD) */
  macdSignal: number | null;
  
  /** MACD Histogram (MACD Line - Signal Line) */
  macdHistogram: number | null;
  
  /** MACD Signal type for filtering */
  macdSignalType: 'bullish' | 'bearish' | 'bullish_crossover' | 'bearish_crossover' | 'strong_bullish' | 'strong_bearish' | null;
  
  /** Timestamp of last quote update */
  lastUpdated: Date;
}

/**
 * Market type - US or India
 */
export type Market = 'US' | 'IN';

/**
 * Market cap categories with approximate ranges
 * US Markets: Mega (>200B), Large (10-200B), Mid (2-10B), Small (300M-2B), Micro (<300M)
 * Indian Markets: Large Cap (Top 100), Mid Cap (101-250), Small Cap (251+)
 */
export type MarketCapCategory = 'mega' | 'large' | 'mid' | 'small' | 'micro';

/**
 * Sector classifications
 */
export const SECTORS = [
  'Technology',
  'Healthcare',
  'Financial Services',
  'Consumer Cyclical',
  'Consumer Defensive',
  'Industrials',
  'Energy',
  'Basic Materials',
  'Real Estate',
  'Utilities',
  'Communication Services'
] as const;

export type Sector = typeof SECTORS[number];

/**
 * Exchange types
 */
export const US_EXCHANGES = ['NYSE', 'NASDAQ', 'AMEX'] as const;
export const INDIAN_EXCHANGES = ['NSE', 'BSE'] as const;

export type USExchange = typeof US_EXCHANGES[number];
export type IndianExchange = typeof INDIAN_EXCHANGES[number];

/**
 * Stock summary for list display (lighter weight than full Stock)
 */
export interface StockSummary {
  symbol: string;
  name: string;
  price: number;
  change: number;
  changePercent: number;
  marketCap: number;
  peRatio: number | null;
  volume: number;
  sector: string;
}

/**
 * Search result from symbol lookup
 */
export interface StockSearchResult {
  symbol: string;
  name: string;
  exchange: string;
  type: 'equity' | 'etf' | 'index' | 'mutualfund';
  market: Market;
}

/**
 * Market index data
 */
export interface MarketIndex {
  symbol: string;
  name: string;
  value: number;
  change: number;
  changePercent: number;
  market: Market;
}

/**
 * Common market indices by market
 */
export const MARKET_INDICES: Record<Market, string[]> = {
  US: ['^GSPC', '^DJI', '^IXIC', '^RUT'],  // S&P 500, Dow Jones, NASDAQ, Russell 2000
  IN: ['^NSEI', '^BSESN', '^NSEBANK']      // Nifty 50, Sensex, Bank Nifty
};

/**
 * Market metadata
 */
export interface MarketInfo {
  code: Market;
  name: string;
  flag: string;
  currency: string;
  currencySymbol: string;
  exchanges: string[];
  tradingHours: {
    open: string;
    close: string;
    timezone: string;
  };
}

export const MARKETS: Record<Market, MarketInfo> = {
  US: {
    code: 'US',
    name: 'United States',
    flag: '🇺🇸',
    currency: 'USD',
    currencySymbol: '$',
    exchanges: ['NYSE', 'NASDAQ', 'AMEX'],
    tradingHours: {
      open: '09:30',
      close: '16:00',
      timezone: 'America/New_York'
    }
  },
  IN: {
    code: 'IN',
    name: 'India',
    flag: '🇮🇳',
    currency: 'INR',
    currencySymbol: '₹',
    exchanges: ['NSE', 'BSE'],
    tradingHours: {
      open: '09:15',
      close: '15:30',
      timezone: 'Asia/Kolkata'
    }
  }
};
