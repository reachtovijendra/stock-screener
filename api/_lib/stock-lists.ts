/**
 * Shared Stock Symbol Lists
 *
 * Provides US and India large-cap stock lists used by the breakouts scanner,
 * DMA crossover cron, and other features that need to iterate over the market.
 */

import https from 'https';

// ---------------------------------------------------------------------------
// US Large-cap stocks (fallback when dynamic screener fetch fails)
// ---------------------------------------------------------------------------

export const US_STOCKS: string[] = [
  // Mega cap tech
  'AAPL', 'MSFT', 'GOOGL', 'GOOG', 'AMZN', 'NVDA', 'META', 'TSLA', 'BRK-B', 'BRK-A',
  // Healthcare
  'UNH', 'JNJ', 'LLY', 'PFE', 'MRK', 'ABBV', 'TMO', 'ABT', 'DHR', 'BMY',
  // Financial
  'V', 'JPM', 'MA', 'BAC', 'WFC', 'GS', 'MS', 'BLK', 'SCHW', 'AXP', 'C', 'USB', 'PNC',
  // Consumer
  'WMT', 'PG', 'HD', 'KO', 'PEP', 'COST', 'MCD', 'NKE', 'SBUX', 'TGT', 'LOW', 'TJX',
  // Energy
  'XOM', 'CVX', 'COP', 'SLB', 'EOG', 'MPC', 'PSX', 'VLO', 'OXY', 'HAL', 'DVN', 'FANG',
  // Tech & Semiconductors
  'AVGO', 'CSCO', 'ACN', 'CRM', 'ORCL', 'NFLX', 'AMD', 'INTC', 'QCOM', 'TXN',
  'IBM', 'AMAT', 'LRCX', 'MU', 'ADI', 'KLAC', 'SNPS', 'CDNS', 'MRVL', 'ON',
  'WDC', 'STX', 'NXPI', 'MCHP', 'MPWR', 'SWKS', 'QRVO', 'TER', 'ENTG',
  // Industrial
  'CAT', 'DE', 'BA', 'HON', 'UPS', 'RTX', 'LMT', 'GE', 'MMM', 'UNP', 'FDX', 'NSC', 'EMR',
  // Telecom & Media
  'DIS', 'CMCSA', 'VZ', 'T', 'TMUS', 'CHTR', 'WBD', 'PARA', 'FOX', 'NWSA',
  // Utilities & REITs
  'NEE', 'DUK', 'SO', 'AEP', 'D', 'EXC', 'SRE', 'AMT', 'PLD', 'CCI', 'EQIX', 'PSA', 'SPG',
  // Other popular
  'PYPL', 'SQ', 'SHOP', 'UBER', 'ABNB', 'COIN', 'SNOW', 'PLTR', 'RIVN', 'LCID',
  'NOW', 'INTU', 'ADBE', 'PANW', 'CRWD', 'ZS', 'DDOG', 'NET', 'MDB', 'TEAM'
];

// ---------------------------------------------------------------------------
// India Large-cap stocks (NIFTY 50 + popular NSE stocks)
// ---------------------------------------------------------------------------

export const IN_STOCKS: string[] = [
  // NIFTY 50 constituents
  'RELIANCE.NS', 'TCS.NS', 'HDFCBANK.NS', 'INFY.NS', 'ICICIBANK.NS',
  'HINDUNILVR.NS', 'SBIN.NS', 'BHARTIARTL.NS', 'ITC.NS', 'KOTAKBANK.NS',
  'LT.NS', 'AXISBANK.NS', 'BAJFINANCE.NS', 'ASIANPAINT.NS', 'MARUTI.NS',
  'HCLTECH.NS', 'TITAN.NS', 'SUNPHARMA.NS', 'WIPRO.NS', 'ULTRACEMCO.NS',
  'NTPC.NS', 'NESTLEIND.NS', 'POWERGRID.NS', 'TATAMOTORS.NS', 'M&M.NS',
  'JSWSTEEL.NS', 'TATASTEEL.NS', 'ADANIPORTS.NS', 'BAJAJFINSV.NS', 'TECHM.NS',
  'ONGC.NS', 'HDFCLIFE.NS', 'DIVISLAB.NS', 'COALINDIA.NS', 'GRASIM.NS',
  'BRITANNIA.NS', 'BPCL.NS', 'DRREDDY.NS', 'CIPLA.NS', 'APOLLOHOSP.NS',
  'EICHERMOT.NS', 'INDUSINDBK.NS', 'SBILIFE.NS', 'TATACONSUM.NS', 'HEROMOTOCO.NS',
  // Additional popular Indian stocks
  'ADANIENT.NS', 'ADANIGREEN.NS', 'ADANIPOWER.NS', 'ATGL.NS', 'AWL.NS',
  'BAJAJ-AUTO.NS', 'BANKBARODA.NS', 'BEL.NS', 'BERGEPAINT.NS', 'BIOCON.NS',
  'BOSCHLTD.NS', 'CANBK.NS', 'CHOLAFIN.NS', 'COLPAL.NS', 'DLF.NS',
  'DABUR.NS', 'GAIL.NS', 'GODREJCP.NS', 'HAVELLS.NS', 'HINDALCO.NS',
  'HINDPETRO.NS', 'ICICIPRULI.NS', 'IDEA.NS', 'INDIGO.NS', 'IOC.NS',
  'IRCTC.NS', 'JINDALSTEL.NS', 'JUBLFOOD.NS', 'LICI.NS', 'LUPIN.NS',
  'MARICO.NS', 'MCDOWELL-N.NS', 'MUTHOOTFIN.NS', 'NAUKRI.NS', 'PAYTM.NS',
  'PEL.NS', 'PETRONET.NS', 'PIDILITIND.NS', 'PNB.NS', 'POLYCAB.NS',
  'RECLTD.NS', 'SBICARD.NS', 'SHREECEM.NS', 'SIEMENS.NS', 'SRF.NS',
  'TATAPOWER.NS', 'TATAELXSI.NS', 'TORNTPHARM.NS', 'TRENT.NS', 'VEDL.NS',
  'ZOMATO.NS', 'ZYDUSLIFE.NS'
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function httpsRequest(
  options: https.RequestOptions,
  timeout = 15000,
  body?: string
): Promise<{ statusCode: number; headers: any; body: string }> {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () =>
        resolve({ statusCode: res.statusCode || 0, headers: res.headers, body: data })
      );
    });
    req.on('error', reject);
    req.setTimeout(timeout, () => {
      req.destroy();
      reject(new Error('Timeout'));
    });
    if (body) {
      req.write(body);
    }
    req.end();
  });
}

/**
 * Dynamically fetch large-cap stock symbols from the Yahoo Finance screener.
 * Returns an empty array on failure so callers can fall back to the static lists.
 */
export async function fetchLargeCapStocks(
  market: string,
  minMarketCap: number = 10_000_000_000
): Promise<string[]> {
  try {
    const screenerBody = JSON.stringify({
      size: 250,
      offset: 0,
      sortField: 'intradaymarketcap',
      sortType: 'DESC',
      quoteType: 'EQUITY',
      query: {
        operator: 'AND',
        operands: [
          { operator: 'GT', operands: ['intradaymarketcap', minMarketCap] },
          ...(market === 'IN'
            ? [{ operator: 'EQ', operands: ['exchange', 'NSI'] }]
            : [{ operator: 'EQ', operands: ['region', 'us'] }]),
        ],
      },
      userId: '',
      userIdType: 'guid',
    });

    const response = await httpsRequest(
      {
        hostname: 'query1.finance.yahoo.com',
        port: 443,
        path: '/v1/finance/screener?crumb=&lang=en-US&region=US&formatted=false&corsDomain=finance.yahoo.com',
        method: 'POST',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          Accept: 'application/json',
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(screenerBody),
        },
      },
      15000,
      screenerBody
    );

    if (response.statusCode === 200) {
      const data = JSON.parse(response.body);
      const quotes = data?.finance?.result?.[0]?.quotes || [];
      const symbols = quotes
        .map((q: any) => q.symbol)
        .filter((s: string) => s && !s.includes('^'));

      if (symbols.length > 50) {
        console.log(
          `[StockLists] Fetched ${symbols.length} ${market} large-cap stocks dynamically`
        );
        return symbols;
      }
    }
  } catch (e) {
    console.error('[StockLists] Dynamic fetch failed:', e);
  }

  return [];
}

/**
 * Get the list of stock symbols to scan for a given market.
 * Tries the dynamic screener first, falls back to the static list.
 */
export async function getStocksToScan(market: string): Promise<string[]> {
  const dynamicStocks = await fetchLargeCapStocks(market);

  if (dynamicStocks.length > 50) {
    return dynamicStocks;
  }

  console.log(`[StockLists] Using fallback stock list for ${market}`);
  return market === 'IN' ? IN_STOCKS : US_STOCKS;
}
