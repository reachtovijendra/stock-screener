/**
 * Historical data downloader for backtesting.
 * Downloads 1 year of daily OHLCV for all stocks + indices.
 * Saves to scripts/backtest/data/{SYMBOL}.json
 */

import https from 'https';
import fs from 'fs';
import path from 'path';

const DATA_DIR = path.join(__dirname, 'data');

export interface HistoricalBar {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface HistoricalData {
  symbol: string;
  bars: HistoricalBar[];
  fetchedAt: string;
}

function httpsGet(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': '*/*',
      },
    }, (res) => {
      let data = '';
      res.on('data', (chunk: Buffer) => (data += chunk.toString()));
      res.on('end', () => resolve(data));
    });
    req.on('error', reject);
    req.setTimeout(20000, () => { req.destroy(); reject(new Error('timeout')); });
  });
}

async function fetchOHLCV(symbol: string): Promise<HistoricalBar[]> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1y`;
  const body = await httpsGet(url);
  const data = JSON.parse(body);
  const result = data.chart?.result?.[0];
  if (!result?.indicators?.quote?.[0] || !result?.timestamp) return [];

  const q = result.indicators.quote[0];
  const bars: HistoricalBar[] = [];

  for (let i = 0; i < result.timestamp.length; i++) {
    if (q.open?.[i] != null && q.high?.[i] != null && q.low?.[i] != null && q.close?.[i] != null && q.volume?.[i] != null) {
      bars.push({
        timestamp: result.timestamp[i],
        open: q.open[i],
        high: q.high[i],
        low: q.low[i],
        close: q.close[i],
        volume: q.volume[i],
      });
    }
  }
  return bars;
}

function getCachePath(symbol: string): string {
  const safe = symbol.replace(/[^a-zA-Z0-9.-]/g, '_');
  return path.join(DATA_DIR, `${safe}.json`);
}

function isCacheFresh(filePath: string, maxAgeHours: number = 24): boolean {
  try {
    const stat = fs.statSync(filePath);
    const ageMs = Date.now() - stat.mtimeMs;
    return ageMs < maxAgeHours * 3600 * 1000;
  } catch {
    return false;
  }
}

export function loadCachedData(symbol: string): HistoricalData | null {
  const filePath = getCachePath(symbol);
  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export async function fetchAndCacheAll(symbols: string[], forceRefresh = false): Promise<{ success: number; failed: string[] }> {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  let success = 0;
  const failed: string[] = [];

  for (let i = 0; i < symbols.length; i++) {
    const symbol = symbols[i];
    const filePath = getCachePath(symbol);

    if (!forceRefresh && isCacheFresh(filePath)) {
      success++;
      continue;
    }

    try {
      const bars = await fetchOHLCV(symbol);
      if (bars.length > 0) {
        const data: HistoricalData = { symbol, bars, fetchedAt: new Date().toISOString() };
        fs.writeFileSync(filePath, JSON.stringify(data));
        success++;
        if ((i + 1) % 50 === 0 || i === symbols.length - 1) {
          console.log(`  [fetch] ${i + 1}/${symbols.length} done (${symbol}: ${bars.length} bars)`);
        }
      } else {
        failed.push(symbol);
        console.log(`  [fetch] ${symbol}: no data`);
      }
    } catch (err: any) {
      failed.push(symbol);
      console.log(`  [fetch] ${symbol}: ${err.message}`);
    }

    // Rate limit: 500ms between requests
    if (i < symbols.length - 1) {
      await new Promise(r => setTimeout(r, 500));
    }
  }

  return { success, failed };
}

// US + India stock lists (copied from getIndexSymbols to avoid import issues)
export function getAllSymbols(): { us: string[]; india: string[]; indices: string[] } {
  // Import at runtime to avoid path issues
  const usSymbols = [
    'AAPL', 'MSFT', 'GOOGL', 'GOOG', 'AMZN', 'NVDA', 'META', 'TSLA', 'AVGO', 'ORCL',
    'ADBE', 'CRM', 'AMD', 'INTC', 'NFLX', 'QCOM', 'TXN', 'CSCO', 'ACN', 'IBM',
    'NOW', 'INTU', 'AMAT', 'ADI', 'LRCX', 'MU', 'KLAC', 'SNPS', 'CDNS', 'MRVL',
    'PANW', 'CRWD', 'FTNT', 'WDAY', 'TEAM', 'DDOG', 'ZS', 'SNOW', 'NET', 'PLTR',
    'UBER', 'ABNB', 'SQ', 'SHOP', 'MELI', 'SE', 'COIN', 'HOOD', 'RBLX', 'U',
    'DELL', 'HPQ', 'HPE', 'ANET', 'MSI', 'KEYS', 'ZBRA', 'CTSH', 'EPAM', 'IT',
    'UNH', 'JNJ', 'LLY', 'PFE', 'MRK', 'ABBV', 'TMO', 'ABT', 'DHR', 'BMY',
    'AMGN', 'GILD', 'ISRG', 'VRTX', 'REGN', 'MDT', 'SYK', 'BDX', 'ZTS', 'BSX',
    'EW', 'CI', 'HCA', 'CVS', 'MCK', 'HUM', 'CNC', 'MOH', 'A', 'IQV',
    'DXCM', 'IDXX', 'BIIB', 'MRNA', 'ALGN', 'HOLX', 'BAX', 'RMD', 'WST', 'PODD',
    'BRK-B', 'JPM', 'V', 'MA', 'BAC', 'WFC', 'GS', 'MS', 'SCHW', 'AXP',
    'BLK', 'C', 'SPGI', 'ICE', 'CME', 'AON', 'MMC', 'PGR', 'CB', 'MET',
    'AIG', 'TRV', 'ALL', 'AJG', 'AFL', 'PRU', 'FIS', 'FISV', 'GPN', 'COF',
    'USB', 'PNC', 'TFC', 'BK', 'STT', 'NTRS', 'DFS', 'SYF', 'CFG', 'FITB',
    'HD', 'LOW', 'NKE', 'SBUX', 'MCD', 'TJX', 'ROST', 'ORLY', 'AZO', 'BKNG',
    'MAR', 'HLT', 'RCL', 'CCL', 'GM', 'F', 'TM', 'RACE', 'CMG', 'YUM',
    'DPZ', 'DHI', 'LEN', 'PHM', 'NVR', 'GRMN', 'POOL', 'BBY', 'TSCO', 'DG',
    'DLTR', 'EBAY', 'ETSY', 'W', 'LULU', 'GPS', 'TPR', 'RL', 'DECK', 'BIRK',
    'WMT', 'PG', 'KO', 'PEP', 'COST', 'PM', 'MO', 'CL', 'MDLZ', 'GIS',
    'KHC', 'SYY', 'HSY', 'K', 'KMB', 'CAG', 'CPB', 'SJM', 'HRL', 'TSN',
    'ADM', 'BG', 'STZ', 'TAP', 'SAM', 'KDP', 'MNST', 'EL', 'CHD', 'CLX',
    'CAT', 'DE', 'HON', 'UPS', 'BA', 'GE', 'RTX', 'LMT', 'GD', 'NOC',
    'MMM', 'EMR', 'ROK', 'ETN', 'ITW', 'PH', 'IR', 'CMI', 'PCAR', 'OTIS',
    'CARR', 'JCI', 'SWK', 'FDX', 'CSX', 'UNP', 'NSC', 'DAL', 'UAL', 'LUV',
    'WM', 'RSG', 'VRSK', 'PAYX', 'ADP', 'CTAS', 'FAST', 'GWW', 'URI', 'PWR',
    'XOM', 'CVX', 'COP', 'SLB', 'EOG', 'MPC', 'VLO', 'PSX', 'PXD', 'OXY',
    'WMB', 'KMI', 'HAL', 'DVN', 'FANG', 'HES', 'BKR', 'TRGP', 'OKE', 'CTRA',
    'DIS', 'CMCSA', 'T', 'TMUS', 'VZ', 'CHTR', 'EA', 'TTWO', 'MTCH', 'LYV',
  ];

  const indiaSymbols = [
    'RELIANCE.NS', 'TCS.NS', 'HDFCBANK.NS', 'INFY.NS', 'ICICIBANK.NS',
    'HINDUNILVR.NS', 'ITC.NS', 'SBIN.NS', 'BHARTIARTL.NS', 'KOTAKBANK.NS',
    'LT.NS', 'AXISBANK.NS', 'ASIANPAINT.NS', 'MARUTI.NS', 'TITAN.NS',
    'SUNPHARMA.NS', 'BAJFINANCE.NS', 'NESTLEIND.NS', 'WIPRO.NS', 'HCLTECH.NS',
    'ULTRACEMCO.NS', 'NTPC.NS', 'POWERGRID.NS', 'ONGC.NS', 'TATAMOTORS.NS',
    'TATASTEEL.NS', 'JSWSTEEL.NS', 'ADANIENT.NS', 'ADANIPORTS.NS', 'M&M.NS',
    'BAJAJFINSV.NS', 'TECHM.NS', 'INDUSINDBK.NS', 'CIPLA.NS', 'DRREDDY.NS',
    'COALINDIA.NS', 'BPCL.NS', 'GRASIM.NS', 'DIVISLAB.NS', 'BRITANNIA.NS',
    'APOLLOHOSP.NS', 'EICHERMOT.NS', 'HEROMOTOCO.NS', 'HINDALCO.NS', 'TATACONSUM.NS',
    'BAJAJ-AUTO.NS', 'SBILIFE.NS', 'HDFCLIFE.NS', 'SHRIRAMFIN.NS', 'BEL.NS',
  ];

  return {
    us: usSymbols,
    india: indiaSymbols,
    indices: ['^GSPC', '^NSEI'],
  };
}
