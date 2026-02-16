/**
 * Shared Stock Symbol Lists
 *
 * Provides US and India large-cap stock lists used by the breakouts scanner,
 * DMA crossover cron, and other features that need to iterate over the market.
 *
 * The static lists cover ~250 US stocks (S&P 500 large/mid-cap) and ~200 India
 * NSE stocks (NIFTY 200 + popular mid-caps). The dynamic screener supplements
 * these with any additional symbols it discovers; results are merged and
 * deduplicated so we always scan the broadest possible universe.
 */

import https from 'https';

// ---------------------------------------------------------------------------
// US Stocks - S&P 500 large/mid-cap coverage (~250 symbols)
// ---------------------------------------------------------------------------

export const US_STOCKS: string[] = [
  // Mega-cap tech
  'AAPL', 'MSFT', 'GOOGL', 'GOOG', 'AMZN', 'NVDA', 'META', 'TSLA', 'BRK-B',
  // Healthcare & Pharma
  'UNH', 'JNJ', 'LLY', 'PFE', 'MRK', 'ABBV', 'TMO', 'ABT', 'DHR', 'BMY',
  'AMGN', 'GILD', 'ISRG', 'VRTX', 'REGN', 'MDT', 'SYK', 'BSX', 'EW', 'ZTS',
  'CI', 'HUM', 'CVS', 'MCK', 'CAH', 'DXCM', 'IDXX', 'IQV', 'A', 'BDX',
  'BIIB', 'MRNA', 'GEHC',
  // Financial services
  'V', 'JPM', 'MA', 'BAC', 'WFC', 'GS', 'MS', 'BLK', 'SCHW', 'AXP',
  'C', 'USB', 'PNC', 'TFC', 'COF', 'BK', 'AIG', 'MET', 'PRU', 'AFL',
  'ICE', 'CME', 'SPGI', 'MCO', 'MSCI', 'FIS', 'FISV', 'GPN', 'AJG', 'MMC',
  'AON', 'TRV', 'CB', 'ALL', 'PGR',
  // Consumer staples & discretionary
  'WMT', 'PG', 'HD', 'KO', 'PEP', 'COST', 'MCD', 'NKE', 'SBUX', 'TGT',
  'LOW', 'TJX', 'CL', 'KMB', 'GIS', 'K', 'HSY', 'SJM', 'MKC', 'CHD',
  'MNST', 'KDP', 'STZ', 'TAP', 'EL', 'ROST', 'DG', 'DLTR', 'ORLY', 'AZO',
  'BBY', 'TSCO', 'ULTA', 'LULU', 'DECK', 'GM', 'F', 'APTV', 'LEN', 'DHI',
  'PHM', 'NVR',
  // Energy
  'XOM', 'CVX', 'COP', 'SLB', 'EOG', 'MPC', 'PSX', 'VLO', 'OXY', 'HAL',
  'DVN', 'FANG', 'HES', 'WMB', 'KMI', 'OKE', 'TRGP', 'BKR',
  // Technology & Semiconductors
  'AVGO', 'CSCO', 'ACN', 'CRM', 'ORCL', 'NFLX', 'AMD', 'INTC', 'QCOM', 'TXN',
  'IBM', 'AMAT', 'LRCX', 'MU', 'ADI', 'KLAC', 'SNPS', 'CDNS', 'MRVL', 'ON',
  'WDC', 'STX', 'NXPI', 'MCHP', 'MPWR', 'SWKS', 'QRVO', 'TER', 'ENTG',
  'FTNT', 'ANSS', 'KEYS', 'ZBRA', 'TRMB', 'PTC', 'EPAM', 'IT', 'CTSH', 'GDDY',
  'GEN', 'HPQ', 'HPE', 'DELL', 'SMCI',
  // Industrials
  'CAT', 'DE', 'BA', 'HON', 'UPS', 'RTX', 'LMT', 'GE', 'MMM', 'UNP',
  'FDX', 'NSC', 'EMR', 'ETN', 'ITW', 'ROK', 'PH', 'CMI', 'PCAR', 'GD',
  'NOC', 'TDG', 'HWM', 'WM', 'RSG', 'VRSK', 'CTAS', 'PAYX', 'FAST', 'GWW',
  'SWK', 'IR', 'DOV', 'AME', 'OTIS', 'CARR', 'XYL', 'WAB', 'CSX', 'CP',
  // Telecom & Media
  'DIS', 'CMCSA', 'VZ', 'T', 'TMUS', 'CHTR', 'WBD', 'PARA', 'FOX', 'NWSA',
  'EA', 'TTWO', 'RBLX', 'MTCH', 'LYV', 'OMC', 'IPG',
  // Utilities & REITs
  'NEE', 'DUK', 'SO', 'AEP', 'D', 'EXC', 'SRE', 'ED', 'WEC', 'ES',
  'AWK', 'ATO', 'CMS', 'DTE', 'FE', 'PPL', 'PEG', 'XEL', 'CEG', 'VST',
  'AMT', 'PLD', 'CCI', 'EQIX', 'PSA', 'SPG', 'O', 'WELL', 'DLR', 'AVB',
  'EQR', 'VTR', 'ARE', 'MAA', 'UDR', 'ESS', 'INVH', 'SUI',
  // Growth / high-profile
  'PYPL', 'SQ', 'SHOP', 'UBER', 'ABNB', 'COIN', 'SNOW', 'PLTR', 'RIVN', 'LCID',
  'NOW', 'INTU', 'ADBE', 'PANW', 'CRWD', 'ZS', 'DDOG', 'NET', 'MDB', 'TEAM',
  'WDAY', 'VEEV', 'HUBS', 'OKTA', 'BILL', 'TTD', 'DASH', 'PINS', 'SNAP', 'ROKU',
  'SOFI', 'HOOD', 'AFRM', 'U', 'PATH', 'DKNG', 'CPNG', 'SE', 'GRAB', 'NU',
  // Popular ETFs (useful for crossover signals)
  'SPY', 'QQQ', 'IWM', 'DIA', 'TQQQ', 'SQQQ', 'ARKK', 'XLF', 'XLE', 'XLK',
  'XLV', 'XLI', 'XLP', 'XLU', 'SOXX', 'SMH', 'GLD', 'SLV', 'TLT', 'HYG',
  'VTI', 'VOO', 'VEA', 'VWO', 'EEM', 'EFA',
];

// ---------------------------------------------------------------------------
// India NSE Stocks - NIFTY 200 + popular mid-caps (~200 symbols)
// ---------------------------------------------------------------------------

export const IN_STOCKS: string[] = [
  // NIFTY 50
  'RELIANCE.NS', 'TCS.NS', 'HDFCBANK.NS', 'INFY.NS', 'ICICIBANK.NS',
  'HINDUNILVR.NS', 'SBIN.NS', 'BHARTIARTL.NS', 'ITC.NS', 'KOTAKBANK.NS',
  'LT.NS', 'AXISBANK.NS', 'BAJFINANCE.NS', 'ASIANPAINT.NS', 'MARUTI.NS',
  'HCLTECH.NS', 'TITAN.NS', 'SUNPHARMA.NS', 'WIPRO.NS', 'ULTRACEMCO.NS',
  'NTPC.NS', 'NESTLEIND.NS', 'POWERGRID.NS', 'TATAMOTORS.NS', 'M&M.NS',
  'JSWSTEEL.NS', 'TATASTEEL.NS', 'ADANIPORTS.NS', 'BAJAJFINSV.NS', 'TECHM.NS',
  'ONGC.NS', 'HDFCLIFE.NS', 'DIVISLAB.NS', 'COALINDIA.NS', 'GRASIM.NS',
  'BRITANNIA.NS', 'BPCL.NS', 'DRREDDY.NS', 'CIPLA.NS', 'APOLLOHOSP.NS',
  'EICHERMOT.NS', 'INDUSINDBK.NS', 'SBILIFE.NS', 'TATACONSUM.NS', 'HEROMOTOCO.NS',
  // NIFTY Next 50 / NIFTY 100
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
  'ZOMATO.NS', 'ZYDUSLIFE.NS',
  // NIFTY 200 / Mid-cap additions
  'ABB.NS', 'ACC.NS', 'ALKEM.NS', 'AMBUJACEM.NS', 'AUROPHARMA.NS',
  'BANDHANBNK.NS', 'BATAINDIA.NS', 'BHEL.NS', 'CANFINHOME.NS', 'CGPOWER.NS',
  'CHAMBLFERT.NS', 'CONCOR.NS', 'COROMANDEL.NS', 'CROMPTON.NS', 'CUB.NS',
  'CUMMINSIND.NS', 'DEEPAKNTR.NS', 'DELHIVERY.NS', 'DIXON.NS', 'ESCORTS.NS',
  'EXIDEIND.NS', 'FEDERALBNK.NS', 'FORTIS.NS', 'GLENMARK.NS', 'GMRINFRA.NS',
  'GNFC.NS', 'GODREJPROP.NS', 'GSPL.NS', 'HAL.NS', 'HDFCAMC.NS',
  'HONAUT.NS', 'IDFCFIRSTB.NS', 'IEX.NS', 'INDHOTEL.NS', 'INDUSTOWER.NS',
  'IRFC.NS', 'JKCEMENT.NS', 'JSWENERGY.NS', 'KAJARIACER.NS', 'KEI.NS',
  'LAURUSLABS.NS', 'LICHSGFIN.NS', 'LTIM.NS', 'LTTS.NS', 'MANAPPURAM.NS',
  'MAXHEALTH.NS', 'MFSL.NS', 'MOTHERSON.NS', 'MPHASIS.NS', 'MRF.NS',
  'NATIONALUM.NS', 'NIACL.NS', 'NMDC.NS', 'OBEROIRLTY.NS', 'OFSS.NS',
  'PAGEIND.NS', 'PERSISTENT.NS', 'PHOENIXLTD.NS', 'PIIND.NS', 'PRESTIGE.NS',
  'PVRINOX.NS', 'RAJESHEXPO.NS', 'RAMCOCEM.NS', 'RBLBANK.NS', 'SAIL.NS',
  'SOLARINDS.NS', 'SONACOMS.NS', 'STARHEALTH.NS', 'SUNDARMFIN.NS', 'SUPREMEIND.NS',
  'SYNGENE.NS', 'TATACHEM.NS', 'TATACOMM.NS', 'TATATECH.NS', 'TIINDIA.NS',
  'TORNTPOWER.NS', 'TVSMOTOR.NS', 'UBL.NS', 'UNIONBANK.NS', 'UPL.NS',
  'VBL.NS', 'VOLTAS.NS', 'WHIRLPOOL.NS', 'YESBANK.NS', 'ZEEL.NS',
  // Popular PSU & defence
  'COCHINSHIP.NS', 'GRSE.NS', 'HUDCO.NS', 'MAZAGON.NS',
  'NHPC.NS', 'PFC.NS', 'RVNL.NS', 'SJVN.NS',
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
 * Returns an empty array on failure so callers can merge with the static lists.
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

      if (symbols.length > 0) {
        console.log(
          `[StockLists] Fetched ${symbols.length} ${market} stocks dynamically`
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
 * Get the deduplicated list of stock symbols to scan for a given market.
 * Merges the static fallback list with any dynamically fetched symbols
 * so we always scan the broadest possible universe.
 */
export async function getStocksToScan(market: string): Promise<string[]> {
  const staticList = market === 'IN' ? IN_STOCKS : US_STOCKS;
  const dynamicStocks = await fetchLargeCapStocks(market);

  // Merge and deduplicate
  const seen = new Set<string>();
  const merged: string[] = [];

  for (const sym of [...staticList, ...dynamicStocks]) {
    const key = sym.toUpperCase();
    if (!seen.has(key)) {
      seen.add(key);
      merged.push(sym);
    }
  }

  console.log(
    `[StockLists] ${market} scan list: ${staticList.length} static + ${dynamicStocks.length} dynamic = ${merged.length} unique symbols`
  );

  return merged;
}
