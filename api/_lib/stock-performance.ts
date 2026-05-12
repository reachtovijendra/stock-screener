import https from 'https';

export type HistoricalPricePoint = {
  timestamp: number;
  close: number;
};

export type PerformanceFields = {
  oneWeekChangePercent: number | null;
  oneMonthChangePercent: number | null;
  threeMonthChangePercent: number | null;
  sixMonthChangePercent: number | null;
  ytdChangePercent: number | null;
  oneYearChangePercent: number | null;
};

type StockLike = {
  symbol: string;
  price?: number | null;
  marketCap?: number | null;
};

export type TopMoverType = 'gainers' | 'losers';
export type TopMoverPeriod = '1d' | '1m' | '1y';

type MoverStockLike = StockLike & Partial<PerformanceFields> & {
  changePercent?: number | null;
};

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

export async function fetchHistoricalSeries(symbol: string, range = '1y'): Promise<HistoricalPricePoint[]> {
  try {
    const response = await httpsRequest({
      hostname: 'query1.finance.yahoo.com',
      port: 443,
      path: `/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=${range}`,
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': '*/*'
      }
    });

    if (response.statusCode === 200) {
      const data = JSON.parse(response.body);
      const result = data.chart?.result?.[0];
      if (result?.timestamp && result?.indicators?.quote?.[0]?.close) {
        const timestamps = result.timestamp as number[];
        const closes = result.indicators.quote[0].close as Array<number | null>;
        return closes
          .map((close, index) => close == null ? null : { timestamp: timestamps[index], close })
          .filter((point): point is HistoricalPricePoint => point != null);
      }
    }
    return [];
  } catch (error) {
    console.error(`Error fetching historical data for ${symbol}:`, error);
    return [];
  }
}

export async function fetchHistoricalPrices(symbol: string, range = '1y'): Promise<number[]> {
  const series = await fetchHistoricalSeries(symbol, range);
  return series.map(point => point.close);
}

export function calculatePeriodChangePercent(closes: number[], currentPrice: number, tradingDays: number): number | null {
  if (!closes.length || currentPrice <= 0 || closes.length <= tradingDays) return null;

  const previousClose = closes[closes.length - 1 - tradingDays];
  if (!previousClose || previousClose <= 0) return null;

  return Math.round(((currentPrice - previousClose) / previousClose) * 10000) / 100;
}

export function calculateYtdChangePercent(series: HistoricalPricePoint[], currentPrice: number): number | null {
  if (!series.length || currentPrice <= 0) return null;

  const startOfYearSeconds = Date.UTC(new Date().getUTCFullYear(), 0, 1) / 1000;
  const firstTradingClose = series.find(point => point.timestamp >= startOfYearSeconds)?.close;
  if (!firstTradingClose || firstTradingClose <= 0) return null;

  return Math.round(((currentPrice - firstTradingClose) / firstTradingClose) * 10000) / 100;
}

export function calculatePerformanceFields(series: HistoricalPricePoint[], currentPrice: number): PerformanceFields {
  const closes = series.map(point => point.close);

  return {
    oneWeekChangePercent: calculatePeriodChangePercent(closes, currentPrice, 5),
    oneMonthChangePercent: calculatePeriodChangePercent(closes, currentPrice, 21),
    threeMonthChangePercent: calculatePeriodChangePercent(closes, currentPrice, 63),
    sixMonthChangePercent: calculatePeriodChangePercent(closes, currentPrice, 126),
    ytdChangePercent: calculateYtdChangePercent(series, currentPrice),
    oneYearChangePercent: calculatePeriodChangePercent(closes, currentPrice, 252),
  };
}

export async function enrichStockWithPerformance<T extends StockLike>(stock: T): Promise<T & PerformanceFields> {
  try {
    const series = await fetchHistoricalSeries(stock.symbol, '2y');
    const currentPrice = stock.price || series[series.length - 1]?.close || 0;
    return Object.assign(stock, calculatePerformanceFields(series, currentPrice));
  } catch (error) {
    console.error(`Error enriching performance for ${stock.symbol}:`, error);
    return Object.assign(stock, emptyPerformanceFields());
  }
}

export function emptyPerformanceFields(): PerformanceFields {
  return {
    oneWeekChangePercent: null,
    oneMonthChangePercent: null,
    threeMonthChangePercent: null,
    sixMonthChangePercent: null,
    ytdChangePercent: null,
    oneYearChangePercent: null,
  };
}

export function isRaisingStock(stock: StockLike & Partial<PerformanceFields>, minMarketCap: number): boolean {
  const oneMonth = stock.oneMonthChangePercent;
  const threeMonth = stock.threeMonthChangePercent;
  const sixMonth = stock.sixMonthChangePercent;
  const oneYear = stock.oneYearChangePercent;

  return (stock.marketCap ?? 0) >= minMarketCap
    && oneMonth != null
    && threeMonth != null
    && sixMonth != null
    && oneYear != null
    && oneMonth > 0
    && oneMonth > threeMonth
    && threeMonth > sixMonth
    && sixMonth > oneYear;
}

export function getTopMoverValue(stock: MoverStockLike, period: TopMoverPeriod): number | null {
  switch (period) {
    case '1d':
      return stock.changePercent ?? null;
    case '1m':
      return stock.oneMonthChangePercent ?? null;
    case '1y':
      return stock.oneYearChangePercent ?? null;
  }
}

export function selectTopMovers<T extends MoverStockLike>(
  stocks: T[],
  type: TopMoverType,
  period: TopMoverPeriod,
  minMarketCap: number
): T[] {
  return stocks
    .filter(stock => {
      const value = getTopMoverValue(stock, period);
      return (stock.marketCap ?? 0) >= minMarketCap
        && value != null
        && Number.isFinite(value);
    })
    .sort((a, b) => {
      const aValue = getTopMoverValue(a, period) ?? 0;
      const bValue = getTopMoverValue(b, period) ?? 0;
      return type === 'gainers' ? bValue - aValue : aValue - bValue;
    });
}
