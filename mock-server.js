/**
 * Stock Screener API Server
 * Fetches real stock data from Yahoo Finance with crumb authentication
 */

const http = require('http');
const https = require('https');

const PORT = 3000;

// Cache for API responses
const cache = new Map();
const CACHE_TTL = 0; // Disabled - always fetch fresh data

// Yahoo Finance authentication
let yahooAuth = { crumb: null, cookies: null, timestamp: 0 };
const AUTH_TTL = 30 * 60 * 1000; // 30 minutes

// Reference data for shares outstanding and sectors
const STOCK_FUNDAMENTALS = {
  // Mega Cap Tech
  'AAPL': { shares: 15.1e9, sector: 'Technology', industry: 'Consumer Electronics' },
  'MSFT': { shares: 7.43e9, sector: 'Technology', industry: 'Software' },
  'GOOGL': { shares: 12.3e9, sector: 'Communication Services', industry: 'Internet Content' },
  'GOOG': { shares: 5.8e9, sector: 'Communication Services', industry: 'Internet Content' },
  'AMZN': { shares: 10.5e9, sector: 'Consumer Cyclical', industry: 'Internet Retail' },
  'NVDA': { shares: 24.6e9, sector: 'Technology', industry: 'Semiconductors' },
  'META': { shares: 2.6e9, sector: 'Communication Services', industry: 'Internet Content' },
  'TSLA': { shares: 3.2e9, sector: 'Consumer Cyclical', industry: 'Auto Manufacturers' },
  
  // Financial Services
  'JPM': { shares: 2.85e9, sector: 'Financial Services', industry: 'Banks' },
  'V': { shares: 2.05e9, sector: 'Financial Services', industry: 'Credit Services' },
  'MA': { shares: 925e6, sector: 'Financial Services', industry: 'Credit Services' },
  'BAC': { shares: 7.7e9, sector: 'Financial Services', industry: 'Banks' },
  'WFC': { shares: 3.5e9, sector: 'Financial Services', industry: 'Banks' },
  'GS': { shares: 315e6, sector: 'Financial Services', industry: 'Capital Markets' },
  'MS': { shares: 1.6e9, sector: 'Financial Services', industry: 'Capital Markets' },
  'BLK': { shares: 150e6, sector: 'Financial Services', industry: 'Asset Management' },
  'C': { shares: 1.9e9, sector: 'Financial Services', industry: 'Banks' },
  'SCHW': { shares: 1.8e9, sector: 'Financial Services', industry: 'Capital Markets' },
  'AXP': { shares: 720e6, sector: 'Financial Services', industry: 'Credit Services' },
  'SPGI': { shares: 310e6, sector: 'Financial Services', industry: 'Financial Data' },
  'CME': { shares: 360e6, sector: 'Financial Services', industry: 'Capital Markets' },
  'ICE': { shares: 560e6, sector: 'Financial Services', industry: 'Capital Markets' },
  'PNC': { shares: 390e6, sector: 'Financial Services', industry: 'Banks' },
  'USB': { shares: 1.5e9, sector: 'Financial Services', industry: 'Banks' },
  
  // Healthcare
  'JNJ': { shares: 2.4e9, sector: 'Healthcare', industry: 'Drug Manufacturers' },
  'UNH': { shares: 920e6, sector: 'Healthcare', industry: 'Healthcare Plans' },
  'LLY': { shares: 950e6, sector: 'Healthcare', industry: 'Drug Manufacturers' },
  'MRK': { shares: 2.53e9, sector: 'Healthcare', industry: 'Drug Manufacturers' },
  'ABBV': { shares: 1.77e9, sector: 'Healthcare', industry: 'Drug Manufacturers' },
  'TMO': { shares: 383e6, sector: 'Healthcare', industry: 'Diagnostics & Research' },
  'ABT': { shares: 1.73e9, sector: 'Healthcare', industry: 'Medical Devices' },
  'DHR': { shares: 735e6, sector: 'Healthcare', industry: 'Diagnostics & Research' },
  'PFE': { shares: 5.6e9, sector: 'Healthcare', industry: 'Drug Manufacturers' },
  'AMGN': { shares: 535e6, sector: 'Healthcare', industry: 'Drug Manufacturers' },
  'BMY': { shares: 2.0e9, sector: 'Healthcare', industry: 'Drug Manufacturers' },
  'GILD': { shares: 1.24e9, sector: 'Healthcare', industry: 'Drug Manufacturers' },
  'ISRG': { shares: 355e6, sector: 'Healthcare', industry: 'Medical Devices' },
  'VRTX': { shares: 255e6, sector: 'Healthcare', industry: 'Biotechnology' },
  'REGN': { shares: 110e6, sector: 'Healthcare', industry: 'Biotechnology' },
  'MDT': { shares: 1.33e9, sector: 'Healthcare', industry: 'Medical Devices' },
  'SYK': { shares: 380e6, sector: 'Healthcare', industry: 'Medical Devices' },
  'BSX': { shares: 1.45e9, sector: 'Healthcare', industry: 'Medical Devices' },
  'ELV': { shares: 235e6, sector: 'Healthcare', industry: 'Healthcare Plans' },
  'CI': { shares: 285e6, sector: 'Healthcare', industry: 'Healthcare Plans' },
  'HUM': { shares: 120e6, sector: 'Healthcare', industry: 'Healthcare Plans' },
  'ZTS': { shares: 455e6, sector: 'Healthcare', industry: 'Drug Manufacturers' },
  'MRNA': { shares: 385e6, sector: 'Healthcare', industry: 'Biotechnology' },
  'BIIB': { shares: 145e6, sector: 'Healthcare', industry: 'Biotechnology' },
  
  // Consumer
  'WMT': { shares: 8.0e9, sector: 'Consumer Defensive', industry: 'Discount Stores' },
  'PG': { shares: 2.35e9, sector: 'Consumer Defensive', industry: 'Household Products' },
  'HD': { shares: 1.0e9, sector: 'Consumer Cyclical', industry: 'Home Improvement' },
  'KO': { shares: 4.3e9, sector: 'Consumer Defensive', industry: 'Beverages' },
  'PEP': { shares: 1.37e9, sector: 'Consumer Defensive', industry: 'Beverages' },
  'COST': { shares: 443e6, sector: 'Consumer Defensive', industry: 'Discount Stores' },
  'MCD': { shares: 715e6, sector: 'Consumer Cyclical', industry: 'Restaurants' },
  'NKE': { shares: 1.5e9, sector: 'Consumer Cyclical', industry: 'Footwear & Accessories' },
  'LOW': { shares: 570e6, sector: 'Consumer Cyclical', industry: 'Home Improvement' },
  'SBUX': { shares: 1.13e9, sector: 'Consumer Cyclical', industry: 'Restaurants' },
  'TGT': { shares: 460e6, sector: 'Consumer Defensive', industry: 'Discount Stores' },
  'PM': { shares: 1.55e9, sector: 'Consumer Defensive', industry: 'Tobacco' },
  'MO': { shares: 1.7e9, sector: 'Consumer Defensive', industry: 'Tobacco' },
  'CL': { shares: 820e6, sector: 'Consumer Defensive', industry: 'Household Products' },
  'EL': { shares: 355e6, sector: 'Consumer Defensive', industry: 'Household Products' },
  'KMB': { shares: 335e6, sector: 'Consumer Defensive', industry: 'Household Products' },
  'GIS': { shares: 570e6, sector: 'Consumer Defensive', industry: 'Packaged Foods' },
  'K': { shares: 345e6, sector: 'Consumer Defensive', industry: 'Packaged Foods' },
  'MDLZ': { shares: 1.36e9, sector: 'Consumer Defensive', industry: 'Packaged Foods' },
  'STZ': { shares: 185e6, sector: 'Consumer Defensive', industry: 'Beverages' },
  'YUM': { shares: 280e6, sector: 'Consumer Cyclical', industry: 'Restaurants' },
  'CMG': { shares: 27e6, sector: 'Consumer Cyclical', industry: 'Restaurants' },
  'DG': { shares: 220e6, sector: 'Consumer Defensive', industry: 'Discount Stores' },
  'DLTR': { shares: 215e6, sector: 'Consumer Defensive', industry: 'Discount Stores' },
  'ROST': { shares: 335e6, sector: 'Consumer Cyclical', industry: 'Apparel Retail' },
  'TJX': { shares: 1.15e9, sector: 'Consumer Cyclical', industry: 'Apparel Retail' },
  'ORLY': { shares: 58e6, sector: 'Consumer Cyclical', industry: 'Specialty Retail' },
  'AZO': { shares: 18e6, sector: 'Consumer Cyclical', industry: 'Specialty Retail' },
  'LULU': { shares: 125e6, sector: 'Consumer Cyclical', industry: 'Apparel Retail' },
  
  // Technology
  'CRM': { shares: 970e6, sector: 'Technology', industry: 'Software' },
  'ACN': { shares: 625e6, sector: 'Technology', industry: 'IT Services' },
  'ORCL': { shares: 2.76e9, sector: 'Technology', industry: 'Software' },
  'CSCO': { shares: 4.0e9, sector: 'Technology', industry: 'Communication Equipment' },
  'AMD': { shares: 1.62e9, sector: 'Technology', industry: 'Semiconductors' },
  'INTC': { shares: 4.26e9, sector: 'Technology', industry: 'Semiconductors' },
  'ADBE': { shares: 440e6, sector: 'Technology', industry: 'Software' },
  'TXN': { shares: 905e6, sector: 'Technology', industry: 'Semiconductors' },
  'QCOM': { shares: 1.1e9, sector: 'Technology', industry: 'Semiconductors' },
  'AVGO': { shares: 4.65e9, sector: 'Technology', industry: 'Semiconductors' },
  'IBM': { shares: 920e6, sector: 'Technology', industry: 'IT Services' },
  'NOW': { shares: 205e6, sector: 'Technology', industry: 'Software' },
  'INTU': { shares: 280e6, sector: 'Technology', industry: 'Software' },
  'AMAT': { shares: 830e6, sector: 'Technology', industry: 'Semiconductor Equipment' },
  'LRCX': { shares: 130e6, sector: 'Technology', industry: 'Semiconductor Equipment' },
  'KLAC': { shares: 135e6, sector: 'Technology', industry: 'Semiconductor Equipment' },
  'MU': { shares: 1.1e9, sector: 'Technology', industry: 'Semiconductors' },
  'ADI': { shares: 495e6, sector: 'Technology', industry: 'Semiconductors' },
  'SNPS': { shares: 153e6, sector: 'Technology', industry: 'Software' },
  'CDNS': { shares: 270e6, sector: 'Technology', industry: 'Software' },
  'PANW': { shares: 325e6, sector: 'Technology', industry: 'Software' },
  'CRWD': { shares: 245e6, sector: 'Technology', industry: 'Software' },
  'FTNT': { shares: 765e6, sector: 'Technology', industry: 'Software' },
  'WDAY': { shares: 265e6, sector: 'Technology', industry: 'Software' },
  'TEAM': { shares: 260e6, sector: 'Technology', industry: 'Software' },
  'SNOW': { shares: 335e6, sector: 'Technology', industry: 'Software' },
  'DDOG': { shares: 330e6, sector: 'Technology', industry: 'Software' },
  'ZS': { shares: 150e6, sector: 'Technology', industry: 'Software' },
  'NET': { shares: 335e6, sector: 'Technology', industry: 'Software' },
  'MRVL': { shares: 865e6, sector: 'Technology', industry: 'Semiconductors' },
  'ON': { shares: 430e6, sector: 'Technology', industry: 'Semiconductors' },
  'NXPI': { shares: 255e6, sector: 'Technology', industry: 'Semiconductors' },
  'MCHP': { shares: 540e6, sector: 'Technology', industry: 'Semiconductors' },
  'HPQ': { shares: 970e6, sector: 'Technology', industry: 'Computer Hardware' },
  'HPE': { shares: 1.3e9, sector: 'Technology', industry: 'Computer Hardware' },
  'DELL': { shares: 720e6, sector: 'Technology', industry: 'Computer Hardware' },
  
  // Communication Services
  'DIS': { shares: 1.82e9, sector: 'Communication Services', industry: 'Entertainment' },
  'VZ': { shares: 4.2e9, sector: 'Communication Services', industry: 'Telecom Services' },
  'CMCSA': { shares: 3.85e9, sector: 'Communication Services', industry: 'Entertainment' },
  'NFLX': { shares: 430e6, sector: 'Communication Services', industry: 'Entertainment' },
  'T': { shares: 7.1e9, sector: 'Communication Services', industry: 'Telecom Services' },
  'TMUS': { shares: 1.17e9, sector: 'Communication Services', industry: 'Telecom Services' },
  'CHTR': { shares: 145e6, sector: 'Communication Services', industry: 'Entertainment' },
  'WBD': { shares: 2.45e9, sector: 'Communication Services', industry: 'Entertainment' },
  'SPOT': { shares: 195e6, sector: 'Communication Services', industry: 'Entertainment' },
  
  // Industrials
  'RTX': { shares: 1.33e9, sector: 'Industrials', industry: 'Aerospace & Defense' },
  'HON': { shares: 655e6, sector: 'Industrials', industry: 'Conglomerates' },
  'UPS': { shares: 850e6, sector: 'Industrials', industry: 'Integrated Freight' },
  'UNP': { shares: 610e6, sector: 'Industrials', industry: 'Railroads' },
  'BA': { shares: 615e6, sector: 'Industrials', industry: 'Aerospace & Defense' },
  'CAT': { shares: 510e6, sector: 'Industrials', industry: 'Farm & Heavy Equipment' },
  'DE': { shares: 285e6, sector: 'Industrials', industry: 'Farm & Heavy Equipment' },
  'GE': { shares: 1.1e9, sector: 'Industrials', industry: 'Aerospace & Defense' },
  'LMT': { shares: 245e6, sector: 'Industrials', industry: 'Aerospace & Defense' },
  'MMM': { shares: 550e6, sector: 'Industrials', industry: 'Conglomerates' },
  'FDX': { shares: 250e6, sector: 'Industrials', industry: 'Integrated Freight' },
  'CSX': { shares: 2.0e9, sector: 'Industrials', industry: 'Railroads' },
  'NSC': { shares: 225e6, sector: 'Industrials', industry: 'Railroads' },
  'WM': { shares: 400e6, sector: 'Industrials', industry: 'Waste Management' },
  'RSG': { shares: 315e6, sector: 'Industrials', industry: 'Waste Management' },
  'EMR': { shares: 570e6, sector: 'Industrials', industry: 'Industrial Products' },
  'ETN': { shares: 395e6, sector: 'Industrials', industry: 'Industrial Products' },
  'ITW': { shares: 305e6, sector: 'Industrials', industry: 'Industrial Products' },
  'PH': { shares: 130e6, sector: 'Industrials', industry: 'Industrial Products' },
  'ROK': { shares: 115e6, sector: 'Industrials', industry: 'Industrial Products' },
  'CTAS': { shares: 100e6, sector: 'Industrials', industry: 'Business Services' },
  'PAYX': { shares: 360e6, sector: 'Industrials', industry: 'Business Services' },
  'FAST': { shares: 570e6, sector: 'Industrials', industry: 'Industrial Distribution' },
  'GD': { shares: 270e6, sector: 'Industrials', industry: 'Aerospace & Defense' },
  'NOC': { shares: 150e6, sector: 'Industrials', industry: 'Aerospace & Defense' },
  
  // Energy
  'XOM': { shares: 4.0e9, sector: 'Energy', industry: 'Oil & Gas Integrated' },
  'CVX': { shares: 1.82e9, sector: 'Energy', industry: 'Oil & Gas Integrated' },
  'COP': { shares: 1.15e9, sector: 'Energy', industry: 'Oil & Gas E&P' },
  'SLB': { shares: 1.4e9, sector: 'Energy', industry: 'Oil & Gas Equipment' },
  'EOG': { shares: 580e6, sector: 'Energy', industry: 'Oil & Gas E&P' },
  'MPC': { shares: 400e6, sector: 'Energy', industry: 'Oil & Gas Refining' },
  'PSX': { shares: 430e6, sector: 'Energy', industry: 'Oil & Gas Refining' },
  'VLO': { shares: 345e6, sector: 'Energy', industry: 'Oil & Gas Refining' },
  'OXY': { shares: 895e6, sector: 'Energy', industry: 'Oil & Gas E&P' },
  'PXD': { shares: 235e6, sector: 'Energy', industry: 'Oil & Gas E&P' },
  'DVN': { shares: 620e6, sector: 'Energy', industry: 'Oil & Gas E&P' },
  'HAL': { shares: 880e6, sector: 'Energy', industry: 'Oil & Gas Equipment' },
  'KMI': { shares: 2.2e9, sector: 'Energy', industry: 'Oil & Gas Midstream' },
  'WMB': { shares: 1.22e9, sector: 'Energy', industry: 'Oil & Gas Midstream' },
  'OKE': { shares: 450e6, sector: 'Energy', industry: 'Oil & Gas Midstream' },
  
  // Utilities
  'NEE': { shares: 2.05e9, sector: 'Utilities', industry: 'Utilities' },
  'DUK': { shares: 770e6, sector: 'Utilities', industry: 'Utilities' },
  'SO': { shares: 1.06e9, sector: 'Utilities', industry: 'Utilities' },
  'D': { shares: 850e6, sector: 'Utilities', industry: 'Utilities' },
  'AEP': { shares: 515e6, sector: 'Utilities', industry: 'Utilities' },
  'SRE': { shares: 635e6, sector: 'Utilities', industry: 'Utilities' },
  'EXC': { shares: 1.0e9, sector: 'Utilities', industry: 'Utilities' },
  'XEL': { shares: 560e6, sector: 'Utilities', industry: 'Utilities' },
  'ED': { shares: 345e6, sector: 'Utilities', industry: 'Utilities' },
  'WEC': { shares: 315e6, sector: 'Utilities', industry: 'Utilities' },
  
  // Real Estate
  'AMT': { shares: 465e6, sector: 'Real Estate', industry: 'REIT' },
  'PLD': { shares: 925e6, sector: 'Real Estate', industry: 'REIT' },
  'CCI': { shares: 430e6, sector: 'Real Estate', industry: 'REIT' },
  'EQIX': { shares: 95e6, sector: 'Real Estate', industry: 'REIT' },
  'PSA': { shares: 175e6, sector: 'Real Estate', industry: 'REIT' },
  'SPG': { shares: 325e6, sector: 'Real Estate', industry: 'REIT' },
  'O': { shares: 675e6, sector: 'Real Estate', industry: 'REIT' },
  'WELL': { shares: 540e6, sector: 'Real Estate', industry: 'REIT' },
  'DLR': { shares: 305e6, sector: 'Real Estate', industry: 'REIT' },
  'AVB': { shares: 140e6, sector: 'Real Estate', industry: 'REIT' },
  
  // Materials
  'LIN': { shares: 485e6, sector: 'Basic Materials', industry: 'Specialty Chemicals' },
  'APD': { shares: 220e6, sector: 'Basic Materials', industry: 'Specialty Chemicals' },
  'SHW': { shares: 255e6, sector: 'Basic Materials', industry: 'Specialty Chemicals' },
  'ECL': { shares: 285e6, sector: 'Basic Materials', industry: 'Specialty Chemicals' },
  'FCX': { shares: 1.43e9, sector: 'Basic Materials', industry: 'Copper' },
  'NEM': { shares: 795e6, sector: 'Basic Materials', industry: 'Gold' },
  'DOW': { shares: 700e6, sector: 'Basic Materials', industry: 'Chemicals' },
  'DD': { shares: 415e6, sector: 'Basic Materials', industry: 'Specialty Chemicals' },
  'NUE': { shares: 245e6, sector: 'Basic Materials', industry: 'Steel' },
  'STLD': { shares: 170e6, sector: 'Basic Materials', industry: 'Steel' },
  
  // Indian Stocks
  'RELIANCE.NS': { shares: 6.77e9, sector: 'Energy', industry: 'Oil & Gas' },
  'TCS.NS': { shares: 3.66e9, sector: 'Technology', industry: 'IT Services' },
  'HDFCBANK.NS': { shares: 7.6e9, sector: 'Financial Services', industry: 'Banks' },
  'INFY.NS': { shares: 4.14e9, sector: 'Technology', industry: 'IT Services' },
  'ICICIBANK.NS': { shares: 7.03e9, sector: 'Financial Services', industry: 'Banks' },
  'HINDUNILVR.NS': { shares: 2.35e9, sector: 'Consumer Defensive', industry: 'FMCG' },
  'SBIN.NS': { shares: 8.92e9, sector: 'Financial Services', industry: 'Banks' },
  'ITC.NS': { shares: 12.5e9, sector: 'Consumer Defensive', industry: 'Tobacco' },
  'BHARTIARTL.NS': { shares: 5.9e9, sector: 'Communication Services', industry: 'Telecom' },
  'KOTAKBANK.NS': { shares: 1.99e9, sector: 'Financial Services', industry: 'Banks' },
  'LT.NS': { shares: 1.4e9, sector: 'Industrials', industry: 'Engineering' },
  'HCLTECH.NS': { shares: 2.71e9, sector: 'Technology', industry: 'IT Services' },
  'WIPRO.NS': { shares: 5.2e9, sector: 'Technology', industry: 'IT Services' },
  'MARUTI.NS': { shares: 302e6, sector: 'Consumer Cyclical', industry: 'Auto Manufacturers' },
  'BAJFINANCE.NS': { shares: 620e6, sector: 'Financial Services', industry: 'Consumer Finance' },
  'AXISBANK.NS': { shares: 3.1e9, sector: 'Financial Services', industry: 'Banks' },
  'SUNPHARMA.NS': { shares: 2.4e9, sector: 'Healthcare', industry: 'Drug Manufacturers' },
  'TITAN.NS': { shares: 887e6, sector: 'Consumer Cyclical', industry: 'Luxury Goods' },
  'ASIANPAINT.NS': { shares: 959e6, sector: 'Basic Materials', industry: 'Specialty Chemicals' },
  'ULTRACEMCO.NS': { shares: 289e6, sector: 'Basic Materials', industry: 'Cement' }
};

const US_SYMBOLS = Object.keys(STOCK_FUNDAMENTALS).filter(s => !s.includes('.'));
const IN_SYMBOLS = Object.keys(STOCK_FUNDAMENTALS).filter(s => s.includes('.NS'));

/**
 * Make HTTPS request
 */
function httpsRequest(options, postData = null) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          body: data
        });
      });
    });
    
    req.on('error', reject);
    req.setTimeout(15000, () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });
    
    if (postData) {
      req.write(postData);
    }
    req.end();
  });
}

/**
 * Get Yahoo Finance crumb for authenticated requests
 */
async function getYahooCrumb() {
  // Check if we have a valid cached crumb
  if (yahooAuth.crumb && Date.now() - yahooAuth.timestamp < AUTH_TTL) {
    return yahooAuth;
  }
  
  console.log('[Auth] Fetching new Yahoo Finance crumb...');
  
  try {
    // Step 1: Get cookies from Yahoo Finance
    const pageResponse = await httpsRequest({
      hostname: 'finance.yahoo.com',
      path: '/quote/AAPL',
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9'
      }
    });
    
    // Extract cookies
    const setCookies = pageResponse.headers['set-cookie'];
    let cookies = '';
    if (setCookies) {
      cookies = setCookies.map(c => c.split(';')[0]).join('; ');
    }
    
    // Step 2: Get crumb using cookies
    const crumbResponse = await httpsRequest({
      hostname: 'query1.finance.yahoo.com',
      path: '/v1/test/getcrumb',
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': '*/*',
        'Cookie': cookies
      }
    });
    
    if (crumbResponse.statusCode === 200 && crumbResponse.body) {
      yahooAuth = {
        crumb: crumbResponse.body.trim(),
        cookies: cookies,
        timestamp: Date.now()
      };
      console.log('[Auth] Got crumb successfully');
      return yahooAuth;
    }
    
    console.log('[Auth] Failed to get crumb:', crumbResponse.statusCode);
    return { crumb: null, cookies: null };
  } catch (error) {
    console.error('[Auth] Error getting crumb:', error.message);
    return { crumb: null, cookies: null };
  }
}

/**
 * Search Yahoo Finance for symbols by name/description (fuzzy search)
 */
async function searchYahooSymbols(query) {
  try {
    const url = `/v1/finance/search?q=${encodeURIComponent(query)}&quotesCount=30&newsCount=0&listsCount=0&enableFuzzyQuery=true&quotesQueryId=tss_match_phrase_query`;
    
    const response = await httpsRequest({
      hostname: 'query1.finance.yahoo.com',
      port: 443,
      path: url,
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json'
      }
    });
    
    if (response.statusCode === 200 && response.body) {
      const data = JSON.parse(response.body);
      // Filter to only equity/ETF types and major exchanges
      const quotes = (data.quotes || []).filter(q => 
        (q.quoteType === 'EQUITY' || q.quoteType === 'ETF') &&
        (q.exchange === 'NMS' || q.exchange === 'NYQ' || q.exchange === 'NGM' || 
         q.exchange === 'NCM' || q.exchange === 'PCX' || q.exchange === 'ASE' || 
         q.exchange === 'BTS' || q.exchange === 'OPR' || q.exchange === 'YHD' ||
         q.exchange === 'NSI' || q.exchange === 'BSE' || q.exchange === 'BOM')
      );
      console.log(`[Search] Found ${quotes.length} results for "${query}"`);
      return quotes;
    }
    return [];
  } catch (error) {
    console.error(`[Search] Error searching for "${query}":`, error.message);
    return [];
  }
}

/**
 * Fetch quote with authentication
 */
async function fetchYahooQuote(symbol) {
  const auth = await getYahooCrumb();
  
  // Build URL with crumb if available
  let url = `/v7/finance/quote?symbols=${encodeURIComponent(symbol)}`;
  if (auth.crumb) {
    url += `&crumb=${encodeURIComponent(auth.crumb)}`;
  }
  
  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'application/json'
  };
  
  if (auth.cookies) {
    headers['Cookie'] = auth.cookies;
  }
  
  try {
    const response = await httpsRequest({
      hostname: 'query1.finance.yahoo.com',
      path: url,
      method: 'GET',
      headers: headers
    });
    
    if (response.statusCode === 200) {
      const data = JSON.parse(response.body);
      if (data.quoteResponse && data.quoteResponse.result && data.quoteResponse.result.length > 0) {
        return data.quoteResponse.result[0];
      }
    }
    
    // If v7 fails, try chart API as fallback
    console.log(`[Quote] v7 API failed for ${symbol}, trying chart API...`);
    return await fetchChartQuote(symbol);
  } catch (error) {
    console.error(`[Quote] Error for ${symbol}:`, error.message);
    return await fetchChartQuote(symbol);
  }
}

/**
 * Fetch quote from chart API (fallback)
 */
async function fetchChartQuote(symbol) {
  try {
    const response = await httpsRequest({
      hostname: 'query1.finance.yahoo.com',
      path: `/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=5d`,
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': '*/*'
      }
    });
    
    if (response.statusCode === 200) {
      const data = JSON.parse(response.body);
      if (data.chart && data.chart.result && data.chart.result[0]) {
        const meta = data.chart.result[0].meta;
        return {
          symbol: meta.symbol,
          shortName: meta.shortName || meta.longName,
          regularMarketPrice: meta.regularMarketPrice,
          regularMarketChange: meta.regularMarketPrice - (meta.chartPreviousClose || meta.previousClose),
          regularMarketChangePercent: meta.chartPreviousClose ? 
            ((meta.regularMarketPrice - meta.chartPreviousClose) / meta.chartPreviousClose) * 100 : 0,
          marketCap: meta.marketCap,
          trailingPE: null,
          forwardPE: null,
          priceToBook: null,
          fiftyTwoWeekHigh: meta.fiftyTwoWeekHigh,
          fiftyTwoWeekLow: meta.fiftyTwoWeekLow,
          fiftyDayAverage: meta.fiftyDayAverage,
          twoHundredDayAverage: meta.twoHundredDayAverage,
          regularMarketVolume: meta.regularMarketVolume,
          averageDailyVolume3Month: meta.averageDailyVolume10Day,
          dividendYield: null,
          trailingAnnualDividendYield: null,
          exchange: meta.exchangeName || meta.exchange,
          currency: meta.currency,
          _source: 'chart'
        };
      }
    }
    return null;
  } catch (error) {
    console.error(`[Chart] Error for ${symbol}:`, error.message);
    return null;
  }
}

/**
 * Fetch historical prices for RSI/MACD calculation
 */
async function fetchHistoricalPrices(symbol, days = 50) {
  try {
    const response = await httpsRequest({
      hostname: 'query1.finance.yahoo.com',
      path: `/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=3mo`,
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': '*/*'
      }
    });
    
    if (response.statusCode === 200) {
      const data = JSON.parse(response.body);
      if (data.chart?.result?.[0]?.indicators?.quote?.[0]) {
        const closes = data.chart.result[0].indicators.quote[0].close;
        // Filter out null values and return last N days
        return closes.filter(c => c != null).slice(-days);
      }
    }
    return null;
  } catch (error) {
    return null;
  }
}

/**
 * Calculate RSI (Relative Strength Index)
 * Uses standard 14-period RSI
 */
function calculateRSI(prices, period = 14) {
  if (!prices || prices.length < period + 1) return null;
  
  let gains = 0;
  let losses = 0;
  
  // Calculate initial average gain/loss
  for (let i = 1; i <= period; i++) {
    const change = prices[i] - prices[i - 1];
    if (change > 0) gains += change;
    else losses -= change;
  }
  
  let avgGain = gains / period;
  let avgLoss = losses / period;
  
  // Calculate subsequent values using smoothed averages
  for (let i = period + 1; i < prices.length; i++) {
    const change = prices[i] - prices[i - 1];
    if (change > 0) {
      avgGain = (avgGain * (period - 1) + change) / period;
      avgLoss = (avgLoss * (period - 1)) / period;
    } else {
      avgGain = (avgGain * (period - 1)) / period;
      avgLoss = (avgLoss * (period - 1) - change) / period;
    }
  }
  
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - (100 / (1 + rs));
}

/**
 * Calculate EMA (Exponential Moving Average)
 */
function calculateEMA(prices, period) {
  if (!prices || prices.length < period) return null;
  
  const multiplier = 2 / (period + 1);
  let ema = prices.slice(0, period).reduce((a, b) => a + b, 0) / period;
  
  for (let i = period; i < prices.length; i++) {
    ema = (prices[i] - ema) * multiplier + ema;
  }
  
  return ema;
}

/**
 * Calculate MACD (Moving Average Convergence Divergence)
 * Standard: 12-day EMA - 26-day EMA, with 9-day signal line
 */
function calculateMACD(prices) {
  if (!prices || prices.length < 35) return null;
  
  // Calculate EMAs at each point to get recent values
  const ema12Values = [];
  const ema26Values = [];
  
  // Initial SMAs
  let ema12 = prices.slice(0, 12).reduce((a, b) => a + b, 0) / 12;
  let ema26 = prices.slice(0, 26).reduce((a, b) => a + b, 0) / 26;
  
  const mult12 = 2 / 13;
  const mult26 = 2 / 27;
  
  for (let i = 0; i < prices.length; i++) {
    if (i >= 12) {
      ema12 = (prices[i] - ema12) * mult12 + ema12;
    }
    if (i >= 26) {
      ema26 = (prices[i] - ema26) * mult26 + ema26;
      ema12Values.push(ema12);
      ema26Values.push(ema26);
    }
  }
  
  // Calculate MACD line
  const macdLine = ema12 - ema26;
  
  // Calculate MACD values for signal line
  const macdValues = ema12Values.map((e12, i) => e12 - ema26Values[i]);
  
  if (macdValues.length < 9) return null;
  
  // Calculate signal line (9-day EMA of MACD)
  let signal = macdValues.slice(0, 9).reduce((a, b) => a + b, 0) / 9;
  const multSignal = 2 / 10;
  
  for (let i = 9; i < macdValues.length; i++) {
    signal = (macdValues[i] - signal) * multSignal + signal;
  }
  
  const histogram = macdLine - signal;
  
  // Determine signal type
  let signalType = null;
  if (macdValues.length >= 2) {
    const prevMacd = macdValues[macdValues.length - 2];
    const prevSignalApprox = signal - (macdValues[macdValues.length - 1] - signal) * multSignal / (1 - multSignal);
    
    const wasBelowSignal = prevMacd < prevSignalApprox;
    const isAboveSignal = macdLine > signal;
    
    if (isAboveSignal && wasBelowSignal) {
      signalType = 'bullish_crossover';
    } else if (!isAboveSignal && !wasBelowSignal) {
      signalType = 'bearish_crossover';
    } else if (macdLine > 0 && isAboveSignal) {
      signalType = 'strong_bullish';
    } else if (macdLine < 0 && !isAboveSignal) {
      signalType = 'strong_bearish';
    } else if (isAboveSignal) {
      signalType = 'bullish';
    } else {
      signalType = 'bearish';
    }
  }
  
  return {
    macdLine: Math.round(macdLine * 1000) / 1000,
    signal: Math.round(signal * 1000) / 1000,
    histogram: Math.round(histogram * 1000) / 1000,
    signalType
  };
}

/**
 * Get RSI zone from value
 */
function getRSIZone(rsi) {
  if (rsi == null) return null;
  if (rsi < 30) return 'oversold';
  if (rsi < 40) return 'approaching_oversold';
  if (rsi < 60) return 'neutral';
  if (rsi < 70) return 'approaching_overbought';
  return 'overbought';
}

/**
 * Article type classification keywords
 */
const ARTICLE_TYPE_KEYWORDS = {
  price_target: [
    'price target', 'target price', 'pt of', 'pt to', 'raises target', 'lowers target',
    'maintains target', 'sets target', 'boosts target', 'cuts target', 'target raised',
    'target lowered', 'target cut', 'new target', 'price objective'
  ],
  upgrade_downgrade: [
    'upgrade', 'downgrade', 'rating', 'outperform', 'underperform', 'buy rating',
    'sell rating', 'hold rating', 'neutral rating', 'overweight', 'underweight',
    'equal-weight', 'market perform', 'sector perform', 'initiated', 'reiterate',
    'maintains buy', 'maintains sell', 'raises to buy', 'cuts to sell'
  ],
  insider: [
    'insider', 'bought shares', 'sold shares', 'insider buying', 'insider selling',
    'sec filing', 'form 4', 'ceo buys', 'ceo sells', 'director buys', 'director sells',
    'executive', 'stock purchase', 'stock sale'
  ],
  earnings: [
    'earnings', 'eps', 'quarterly results', 'q1', 'q2', 'q3', 'q4', 'beat estimates',
    'missed estimates', 'revenue', 'profit', 'loss', 'guidance', 'outlook',
    'fiscal year', 'annual report', 'quarterly report', 'earnings call'
  ],
  dividend: [
    'dividend', 'yield', 'payout', 'ex-dividend', 'dividend increase', 'dividend cut',
    'special dividend', 'dividend declared', 'quarterly dividend'
  ]
};

/**
 * Article type priority for sorting (lower = higher priority)
 */
const ARTICLE_TYPE_PRIORITY = {
  price_target: 1,
  upgrade_downgrade: 2,
  insider: 3,
  earnings: 4,
  dividend: 5,
  general: 6
};

/**
 * Classify article type based on title and description
 */
function classifyArticle(title, description) {
  const text = `${title} ${description}`.toLowerCase();
  
  for (const [type, keywords] of Object.entries(ARTICLE_TYPE_KEYWORDS)) {
    for (const keyword of keywords) {
      if (text.includes(keyword)) {
        return type;
      }
    }
  }
  
  return 'general';
}

/**
 * Parse RSS XML to extract news items
 */
function parseRSSXML(xmlText) {
  const items = [];
  
  // Simple regex-based XML parsing (no external dependencies)
  const itemRegex = /<item>([\s\S]*?)<\/item>/gi;
  let match;
  
  while ((match = itemRegex.exec(xmlText)) !== null) {
    const itemXml = match[1];
    
    const getTag = (tag) => {
      const regex = new RegExp(`<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\\/${tag}>|<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i');
      const m = itemXml.match(regex);
      return m ? (m[1] || m[2] || '').trim() : '';
    };
    
    const title = getTag('title');
    const link = getTag('link');
    const pubDate = getTag('pubDate');
    const description = getTag('description');
    const source = getTag('source');
    
    if (title) {
      const articleType = classifyArticle(title, description);
      
      items.push({
        title,
        link,
        pubDate,
        description: description.substring(0, 200) + (description.length > 200 ? '...' : ''),
        source: source || 'Yahoo Finance',
        type: articleType,
        priority: ARTICLE_TYPE_PRIORITY[articleType] || 6
      });
    }
  }
  
  return items;
}

/**
 * Calculate relative time string (e.g., "2 hours ago")
 */
function getRelativeTime(dateString) {
  try {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);
    
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  } catch {
    return '';
  }
}

/**
 * Generic RSS fetcher with timeout
 */
async function fetchRSSWithTimeout(options, sourceName, timeoutMs = 5000) {
  return new Promise(async (resolve) => {
    const timeout = setTimeout(() => {
      console.log(`[News] ${sourceName} RSS timed out`);
      resolve([]);
    }, timeoutMs);
    
    try {
      const response = await httpsRequest({
        ...options,
        port: 443,
        method: 'GET',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'application/rss+xml, application/xml, text/xml, */*',
          ...options.headers
        }
      });
      
      clearTimeout(timeout);
      
      if (response.statusCode !== 200) {
        console.log(`[News] ${sourceName} RSS returned status ${response.statusCode}`);
        resolve([]);
        return;
      }
      
      const items = parseRSSXML(response.body);
      items.forEach(item => {
        if (!item.source) {
          item.source = sourceName;
        }
      });
      
      console.log(`[News] ${sourceName} returned ${items.length} items`);
      resolve(items);
    } catch (error) {
      clearTimeout(timeout);
      console.log(`[News] ${sourceName} RSS error:`, error.message);
      resolve([]);
    }
  });
}

/**
 * Fetch news from Yahoo Finance RSS
 */
async function tryYahooFinanceRSS(symbol) {
  return fetchRSSWithTimeout({
    hostname: 'feeds.finance.yahoo.com',
    path: `/rss/2.0/headline?s=${encodeURIComponent(symbol)}&region=US&lang=en-US`
  }, 'Yahoo Finance');
}

/**
 * Fetch news from Google News RSS
 */
async function tryGoogleNewsRSS(symbol) {
  const searchQuery = encodeURIComponent(`${symbol} stock`);
  return fetchRSSWithTimeout({
    hostname: 'news.google.com',
    path: `/rss/search?q=${searchQuery}&hl=en-US&gl=US&ceid=US:en`
  }, 'Google News');
}

/**
 * Fetch news from Benzinga RSS
 * Benzinga provides stock-specific news feeds
 */
async function tryBenzingaRSS(symbol) {
  // Benzinga has a general news feed, search by symbol in Google News with site filter
  const searchQuery = encodeURIComponent(`${symbol} site:benzinga.com`);
  return fetchRSSWithTimeout({
    hostname: 'news.google.com',
    path: `/rss/search?q=${searchQuery}&hl=en-US&gl=US&ceid=US:en`
  }, 'Benzinga');
}

/**
 * Fetch news from Seeking Alpha RSS
 * Uses Google News with site filter for Seeking Alpha content
 */
async function trySeekingAlphaRSS(symbol) {
  const searchQuery = encodeURIComponent(`${symbol} site:seekingalpha.com`);
  return fetchRSSWithTimeout({
    hostname: 'news.google.com',
    path: `/rss/search?q=${searchQuery}&hl=en-US&gl=US&ceid=US:en`
  }, 'Seeking Alpha');
}

/**
 * Fetch news from Nasdaq RSS
 * Uses Google News with site filter for Nasdaq content
 */
async function tryNasdaqRSS(symbol) {
  const searchQuery = encodeURIComponent(`${symbol} site:nasdaq.com`);
  return fetchRSSWithTimeout({
    hostname: 'news.google.com',
    path: `/rss/search?q=${searchQuery}&hl=en-US&gl=US&ceid=US:en`
  }, 'Nasdaq');
}

/**
 * Fetch news from Investing.com RSS
 * Uses Google News with site filter for Investing.com content
 */
async function tryInvestingComRSS(symbol) {
  const searchQuery = encodeURIComponent(`${symbol} site:investing.com`);
  return fetchRSSWithTimeout({
    hostname: 'news.google.com',
    path: `/rss/search?q=${searchQuery}&hl=en-US&gl=US&ceid=US:en`
  }, 'Investing.com');
}

/**
 * Fetch news from MarketWatch RSS
 */
async function tryMarketWatchRSS(symbol) {
  const searchQuery = encodeURIComponent(`${symbol} site:marketwatch.com`);
  return fetchRSSWithTimeout({
    hostname: 'news.google.com',
    path: `/rss/search?q=${searchQuery}&hl=en-US&gl=US&ceid=US:en`
  }, 'MarketWatch');
}

/**
 * Merge news from multiple sources and deduplicate by title similarity
 */
function mergeAndDedupeNews(existingItems, newItems) {
  const merged = [...existingItems];
  const existingTitles = new Set(existingItems.map(item => 
    item.title.toLowerCase().replace(/[^a-z0-9]/g, '').substring(0, 50)
  ));
  
  for (const item of newItems) {
    const normalizedTitle = item.title.toLowerCase().replace(/[^a-z0-9]/g, '').substring(0, 50);
    
    // Check for similar titles (avoid duplicates)
    let isDuplicate = false;
    for (const existing of existingTitles) {
      // Simple similarity check - if 70% of characters match, consider duplicate
      const minLen = Math.min(existing.length, normalizedTitle.length);
      let matches = 0;
      for (let i = 0; i < minLen; i++) {
        if (existing[i] === normalizedTitle[i]) matches++;
      }
      if (minLen > 0 && matches / minLen > 0.7) {
        isDuplicate = true;
        break;
      }
    }
    
    if (!isDuplicate) {
      merged.push(item);
      existingTitles.add(normalizedTitle);
    }
  }
  
  return merged;
}

/**
 * Fetch stock news from multiple trusted sources in parallel
 * Sources: Yahoo Finance, Benzinga, Seeking Alpha, Nasdaq, Investing.com, MarketWatch, Google News
 */
async function fetchStockNews(symbol) {
  try {
    console.log(`[News] Fetching news for ${symbol} from multiple sources...`);
    
    // Fetch from all sources in parallel for speed
    const [
      yahooItems,
      benzingaItems,
      seekingAlphaItems,
      nasdaqItems,
      investingItems,
      marketWatchItems,
      googleItems
    ] = await Promise.all([
      tryYahooFinanceRSS(symbol),
      tryBenzingaRSS(symbol),
      trySeekingAlphaRSS(symbol),
      tryNasdaqRSS(symbol),
      tryInvestingComRSS(symbol),
      tryMarketWatchRSS(symbol),
      tryGoogleNewsRSS(symbol)
    ]);
    
    // Start with Yahoo as primary, then merge others
    let allItems = [...yahooItems];
    
    // Merge all other sources (deduplicating as we go)
    allItems = mergeAndDedupeNews(allItems, benzingaItems);
    allItems = mergeAndDedupeNews(allItems, seekingAlphaItems);
    allItems = mergeAndDedupeNews(allItems, nasdaqItems);
    allItems = mergeAndDedupeNews(allItems, investingItems);
    allItems = mergeAndDedupeNews(allItems, marketWatchItems);
    allItems = mergeAndDedupeNews(allItems, googleItems);
    
    console.log(`[News] Total articles from all sources: ${allItems.length}`);
    
    if (allItems.length === 0) {
      console.log(`[News] No news found from any source for ${symbol}`);
      return [];
    }
    
    // Filter out articles older than 7 days
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    allItems = allItems.filter(item => {
      try {
        return new Date(item.pubDate) >= sevenDaysAgo;
      } catch {
        return false;
      }
    });
    
    console.log(`[News] After filtering old articles: ${allItems.length} remaining`);

    // Classify articles and add metadata
    allItems.forEach(item => {
      // Re-classify if not already done
      if (!item.type || item.type === 'general') {
        item.type = classifyArticle(item.title, item.description || '');
        item.priority = ARTICLE_TYPE_PRIORITY[item.type] || 6;
      }
      // Add relative time
      item.timeAgo = getRelativeTime(item.pubDate);
    });
    
    // Sort by date first (newest first), then by priority for same-day articles
    allItems.sort((a, b) => {
      const dateA = new Date(a.pubDate);
      const dateB = new Date(b.pubDate);
      // Primary sort: newest first
      const dateDiff = dateB - dateA;
      if (Math.abs(dateDiff) > 86400000) { // More than 1 day apart - sort by date
        return dateDiff;
      }
      // Within same day - sort by priority
      return (a.priority || 6) - (b.priority || 6);
    });
    
    console.log(`[News] Final result: ${allItems.length} articles for ${symbol}`);
    
    // Return top 20 items
    return allItems.slice(0, 20);
  } catch (error) {
    console.error(`[News] Error fetching news for ${symbol}:`, error.message);
    return [];
  }
}

/**
 * Transform Yahoo response to our format
 */
function transformQuote(q, symbol) {
  if (!q) return null;
  
  const fundamentals = STOCK_FUNDAMENTALS[symbol] || {};
  const regularPrice = q.regularMarketPrice || 0;
  const currency = q.currency || 'USD';
  
  // Use the most current price available:
  // 1. Post-market price (after hours) if available
  // 2. Pre-market price (before market opens) if available
  // 3. Regular market price as fallback
  let price = regularPrice;
  let change = q.regularMarketChange || 0;
  let changePercent = q.regularMarketChangePercent || 0;
  
  // Check for extended hours pricing
  if (q.postMarketPrice && q.postMarketPrice > 0) {
    price = q.postMarketPrice;
    change = q.postMarketChange || (q.postMarketPrice - regularPrice);
    changePercent = q.postMarketChangePercent || 
      (regularPrice > 0 ? ((q.postMarketPrice - regularPrice) / regularPrice) * 100 : 0);
    // Add regular market change to get total day change from previous close
    change = (q.regularMarketChange || 0) + (q.postMarketChange || 0);
    changePercent = regularPrice > 0 && q.regularMarketPreviousClose > 0 
      ? ((price - q.regularMarketPreviousClose) / q.regularMarketPreviousClose) * 100 
      : changePercent;
  } else if (q.preMarketPrice && q.preMarketPrice > 0) {
    price = q.preMarketPrice;
    change = q.preMarketChange || (q.preMarketPrice - (q.regularMarketPreviousClose || regularPrice));
    changePercent = q.preMarketChangePercent || 
      (q.regularMarketPreviousClose > 0 ? ((q.preMarketPrice - q.regularMarketPreviousClose) / q.regularMarketPreviousClose) * 100 : 0);
  }
  
  // Calculate market cap if not provided
  let marketCap = q.marketCap;
  if (!marketCap && fundamentals.shares && price) {
    marketCap = fundamentals.shares * price;
  }
  
  const fiftyTwoWeekHigh = q.fiftyTwoWeekHigh || price;
  const fiftyTwoWeekLow = q.fiftyTwoWeekLow || price;
  const fiftyDayMA = q.fiftyDayAverage;
  const twoHundredDayMA = q.twoHundredDayAverage;
  
  // Calculate P/E from EPS if not directly provided
  const eps = q.epsTrailingTwelveMonths;
  const forwardEps = q.epsForward;
  const peRatio = q.trailingPE != null ? q.trailingPE : (eps && eps !== 0 ? price / eps : null);
  const forwardPeRatio = q.forwardPE != null ? q.forwardPE : (forwardEps && forwardEps !== 0 ? price / forwardEps : null);

  return {
    symbol: q.symbol || symbol,
    name: q.shortName || q.longName || symbol,
    price: price,
    change: change,
    changePercent: changePercent,
    marketCap: marketCap,
    marketCapCategory: categorizeMarketCap(marketCap, currency),
    peRatio: peRatio,
    forwardPeRatio: forwardPeRatio,
    pbRatio: q.priceToBook || null,
    fiftyTwoWeekHigh: fiftyTwoWeekHigh,
    fiftyTwoWeekLow: fiftyTwoWeekLow,
    percentFromFiftyTwoWeekHigh: fiftyTwoWeekHigh ? ((price - fiftyTwoWeekHigh) / fiftyTwoWeekHigh) * 100 : null,
    percentFromFiftyTwoWeekLow: fiftyTwoWeekLow ? ((price - fiftyTwoWeekLow) / fiftyTwoWeekLow) * 100 : null,
    dividendYield: q.trailingAnnualDividendYield ? q.trailingAnnualDividendYield * 100 : (q.dividendYield || null),
    volume: q.regularMarketVolume || 0,
    avgVolume: q.averageDailyVolume3Month || q.averageDailyVolume10Day || null,
    relativeVolume: q.averageDailyVolume3Month && q.regularMarketVolume 
      ? q.regularMarketVolume / q.averageDailyVolume3Month : 1,
    sector: q.sector || fundamentals.sector || 'Unknown',
    industry: q.industry || fundamentals.industry || 'Unknown',
    beta: q.beta || null,
    fiftyDayMA: fiftyDayMA,
    twoHundredDayMA: twoHundredDayMA,
    percentFromFiftyDayMA: fiftyDayMA ? ((price - fiftyDayMA) / fiftyDayMA) * 100 : null,
    percentFromTwoHundredDayMA: twoHundredDayMA ? ((price - twoHundredDayMA) / twoHundredDayMA) * 100 : null,
    exchange: q.exchange || 'UNKNOWN',
    currency: currency,
    market: currency === 'INR' || (q.symbol && (q.symbol.endsWith('.NS') || q.symbol.endsWith('.BO'))) ? 'IN' : 'US',
    // Technical indicators (calculated on demand)
    rsi: null,
    macdLine: null,
    macdSignal: null,
    macdHistogram: null,
    macdSignalType: null,
    lastUpdated: new Date()
  };
}

function categorizeMarketCap(marketCap, currency) {
  if (!marketCap) return 'unknown';
  const mcUsd = currency === 'INR' ? marketCap / 83 : marketCap;
  if (mcUsd >= 200e9) return 'mega';
  if (mcUsd >= 10e9) return 'large';
  if (mcUsd >= 2e9) return 'mid';
  if (mcUsd >= 300e6) return 'small';
  return 'micro';
}

function getCached(key, fetcher) {
  const cached = cache.get(key);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    console.log(`[Cache HIT] ${key}`);
    return Promise.resolve(cached.data);
  }
  console.log(`[Cache MISS] ${key}`);
  return fetcher().then(data => {
    cache.set(key, { data, timestamp: Date.now() });
    return data;
  });
}

/**
 * Fetch stocks using Yahoo Finance Screener API
 * Fetches from ALL market cap ranges to ensure small caps are included
 */
async function fetchScreenerStocks(market, filters = {}) {
  const auth = await getYahooCrumb();
  const region = market === 'IN' ? 'in' : 'us';
  const isIndia = market === 'IN';
  
  // Market cap ranges differ by market (USD for US, INR for India)
  // India: 1 USD ≈ 83 INR, so thresholds are ~83x higher in INR
  // US: Mega >$200B, Large $10B-$200B, Mid $2B-$10B, Small $300M-$2B, Micro $50M-$300M
  // India: Mega >₹16.6L Cr, Large ₹83K-₹16.6L Cr, Mid ₹16.6K-₹83K Cr, Small ₹2.5K-₹16.6K Cr, Micro ₹500-₹2.5K Cr
  const marketCapRanges = isIndia ? [
    { name: 'mega', min: 2000e9, max: null, limit: 100 },           // >₹2L Cr (>$24B)
    { name: 'large', min: 200e9, max: 2000e9, limit: 300 },         // ₹20K-₹2L Cr
    { name: 'mid', min: 50e9, max: 200e9, limit: 500 },             // ₹5K-₹20K Cr
    { name: 'small', min: 10e9, max: 50e9, limit: 750 },            // ₹1K-₹5K Cr
    { name: 'micro', min: 5e9, max: 10e9, limit: 500 }              // ₹500-₹1K Cr (min ₹500 Cr)
  ] : [
    { name: 'mega', min: 200e9, max: null, limit: 250 },
    { name: 'large', min: 10e9, max: 200e9, limit: 500 },
    { name: 'mid', min: 2e9, max: 10e9, limit: 750 },
    { name: 'small', min: 300e6, max: 2e9, limit: 1000 },
    { name: 'micro', min: 50e6, max: 300e6, limit: 1000 }           // Stocks like QBTS, QUBT, SOUN
  ];
  
  // If user selected specific market cap categories, only fetch those
  let rangesToFetch = marketCapRanges;
  if (filters.marketCap?.categories?.length > 0 && filters.marketCap.categories.length < 5) {
    const cats = filters.marketCap.categories;
    rangesToFetch = marketCapRanges.filter(r => cats.includes(r.name));
  }
  
  // If user specified custom range, use that instead
  if (filters.marketCap?.customRange?.min != null || filters.marketCap?.customRange?.max != null) {
    rangesToFetch = [{
      name: 'custom',
      min: filters.marketCap.customRange.min || 0,
      max: filters.marketCap.customRange.max || null,
      limit: 2000
    }];
  }
  
  console.log(`[Screener] Querying ${market} market across ${rangesToFetch.length} market cap ranges...`);
  
  const allResults = [];
  const seenSymbols = new Set();
  
  // Fetch stocks from each market cap range
  for (const range of rangesToFetch) {
    console.log(`[Screener] Fetching ${range.name} cap stocks (${range.min ? '$' + (range.min/1e9).toFixed(1) + 'B' : '$0'} - ${range.max ? '$' + (range.max/1e9).toFixed(1) + 'B' : '∞'})...`);
    
    const rangeResults = await fetchScreenerRange(auth, region, range.min, range.max, range.limit);
    
    for (const stock of rangeResults) {
      if (!seenSymbols.has(stock.symbol)) {
        seenSymbols.add(stock.symbol);
        allResults.push(stock);
      }
    }
    
    console.log(`[Screener] ${range.name}: got ${rangeResults.length} stocks (total unique: ${allResults.length})`);
  }
  
  // If screener API fails, fall back to symbol list
  if (allResults.length === 0) {
    console.log('[Screener] Falling back to symbol list...');
    return fetchMarketStocksFromList(market);
  }
  
  // Post-filter: Only keep major exchange stocks with valid data
  const usExchanges = ['NMS', 'NYQ', 'NGM', 'NCM', 'NYS', 'NASDAQ', 'NYSE'];
  const indianExchanges = ['NSI', 'BSE', 'BOM', 'NSE'];
  const validExchanges = isIndia ? indianExchanges : usExchanges;
  // Minimum market cap: $1B USD for US, ₹8300 Cr (83B INR) for India
  // But allow stocks with NO market cap (like ETFs) to pass through
  const minMarketCap = isIndia ? 83e9 : 1e9;  // ₹8300 Cr or $1B
  
  const filtered = allResults.filter(stock => {
    // Must have valid exchange for the market
    const exchange = stock.exchange?.toUpperCase() || '';
    if (!validExchanges.some(ex => exchange.includes(ex))) {
      return false;
    }
    // Market cap filter: allow stocks without market cap (ETFs), but filter out stocks with cap < $1B
    if (stock.marketCap && stock.marketCap > 0 && stock.marketCap < minMarketCap) {
      return false;
    }
    // Must have valid price
    if (!stock.price || stock.price <= 0) {
      return false;
    }
    return true;
  });
  
  console.log(`[Screener] ${market} - Total unique: ${allResults.length}, after filter: ${filtered.length}`);
  
  // Enrich with sector/industry info (screener API doesn't return these)
  const enriched = await enrichWithSectorInfo(filtered, auth);
  
  return enriched;
}

/**
 * Batch fetch sector/industry info using Quote API
 */
async function enrichWithSectorInfo(stocks, auth) {
  if (!stocks || stocks.length === 0) return stocks;
  
  const batchSize = 100;  // Yahoo API supports up to ~200 symbols per request
  const symbolToStock = new Map();
  stocks.forEach(s => symbolToStock.set(s.symbol, s));
  
  const allSymbols = stocks.map(s => s.symbol);
  console.log(`[Sector] Enriching ${allSymbols.length} stocks with sector info...`);
  
  for (let i = 0; i < allSymbols.length; i += batchSize) {
    const batch = allSymbols.slice(i, i + batchSize);
    const symbolsParam = batch.join(',');
    
    try {
      // Request specific fields including sector and industry
      const fields = 'symbol,sector,industry,sectorDisp,industryDisp,sectorKey,industryKey';
      const url = `/v7/finance/quote?symbols=${encodeURIComponent(symbolsParam)}&fields=${encodeURIComponent(fields)}&crumb=${encodeURIComponent(auth.crumb || '')}`;
      
      const response = await httpsRequest({
        hostname: 'query1.finance.yahoo.com',
        port: 443,
        path: url,
        method: 'GET',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'application/json',
          'Cookie': auth.cookies || ''
        }
      });
      
      if (response.statusCode === 200 && response.body) {
        const data = JSON.parse(response.body);
        const quotes = data?.quoteResponse?.result || [];
        
        for (const q of quotes) {
          const stock = symbolToStock.get(q.symbol);
          if (stock) {
            // Try multiple possible field names
            const sector = q.sector || q.sectorDisp || q.sectorKey;
            const industry = q.industry || q.industryDisp || q.industryKey;
            if (sector) stock.sector = sector;
            if (industry) stock.industry = industry;
          }
        }
      }
      
      if (i % 500 === 0 && i > 0) {
        console.log(`[Sector] Processed ${Math.min(i + batchSize, allSymbols.length)}/${allSymbols.length}`);
      }
    } catch (error) {
      console.error(`[Sector] Error fetching batch: ${error.message}`);
    }
  }
  
  console.log(`[Sector] Done enriching sector info`);
  return stocks;
}

/**
 * Fetch stocks from a specific market cap range
 */
async function fetchScreenerRange(auth, region, minMarketCap, maxMarketCap, maxResults) {
  const results = [];
  let offset = 0;
  const isIndia = region === 'in';
  
  while (offset < maxResults) {
    const screenerQuery = {
      size: 250,
      offset: offset,
      sortField: 'intradaymarketcap',
      sortType: 'DESC',
      quoteType: 'EQUITY',
      query: {
        operator: 'AND',
        operands: [
          { operator: 'eq', operands: ['region', region] }
        ]
      },
      userId: '',
      userIdType: 'guid'
    };
    
    // Add exchange filter based on market
    if (isIndia) {
      // Indian exchanges: NSE (NSI) and BSE (BOM)
      screenerQuery.query.operands.push({
        operator: 'or',
        operands: [
          { operator: 'eq', operands: ['exchange', 'NSI'] },   // NSE
          { operator: 'eq', operands: ['exchange', 'BSE'] },   // BSE
          { operator: 'eq', operands: ['exchange', 'BOM'] }    // BSE (Bombay)
        ]
      });
    } else {
      // US exchanges: NYSE, NASDAQ variants
      screenerQuery.query.operands.push({
        operator: 'or',
        operands: [
          { operator: 'eq', operands: ['exchange', 'NMS'] },   // NASDAQ
          { operator: 'eq', operands: ['exchange', 'NYQ'] },   // NYSE
          { operator: 'eq', operands: ['exchange', 'NGM'] },   // NASDAQ Global Market
          { operator: 'eq', operands: ['exchange', 'NCM'] },   // NASDAQ Capital Market
          { operator: 'eq', operands: ['exchange', 'NYS'] }    // NYSE
        ]
      });
    }
    
    // Add market cap range filter
    // US: minimum $1B USD, India: minimum ₹8300 Cr (83B INR ≈ $1B USD)
    const minMarketCapThreshold = isIndia ? 83e9 : 1e9;  // 83B INR or $1B USD
    const effectiveMin = minMarketCap != null ? Math.max(minMarketCap, minMarketCapThreshold) : minMarketCapThreshold;
    screenerQuery.query.operands.push({ operator: 'gte', operands: ['intradaymarketcap', effectiveMin] });
    
    if (maxMarketCap != null) {
      screenerQuery.query.operands.push({ operator: 'lt', operands: ['intradaymarketcap', maxMarketCap] });
    }
    
    try {
      const postData = JSON.stringify(screenerQuery);
      const url = '/v1/finance/screener?crumb=' + encodeURIComponent(auth.crumb || '');
      
      const options = {
        hostname: 'query1.finance.yahoo.com',
        port: 443,
        path: url,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postData),
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'application/json',
          'Cookie': auth.cookies || ''
        }
      };
      
      const response = await httpsRequest(options, postData);
      
      if (response.statusCode !== 200) {
        console.log(`[Screener] Range query returned ${response.statusCode}`);
        break;
      }
      
      const data = JSON.parse(response.body);
      const quotes = data?.finance?.result?.[0]?.quotes || [];
      
      if (quotes.length === 0) break;
      
      for (const q of quotes) {
        const transformed = transformScreenerQuote(q);
        if (transformed) results.push(transformed);
      }
      
      if (quotes.length < 250) break;
      offset += 250;
      
      await new Promise(resolve => setTimeout(resolve, 100));
      
    } catch (error) {
      console.error(`[Screener] Range error:`, error.message);
      break;
    }
  }
  
  return results;
}

/**
 * Transform Yahoo screener response to our format
 */
function transformScreenerQuote(q) {
  if (!q || !q.symbol) return null;
  
  const regularPrice = q.regularMarketPrice || 0;
  let price = regularPrice;
  let change = q.regularMarketChange || 0;
  let changePercent = q.regularMarketChangePercent || 0;
  
  // Use extended hours if available
  if (q.postMarketPrice && q.postMarketPrice > 0) {
    price = q.postMarketPrice;
    change = (q.regularMarketChange || 0) + (q.postMarketChange || 0);
    changePercent = q.regularMarketPreviousClose > 0 
      ? ((price - q.regularMarketPreviousClose) / q.regularMarketPreviousClose) * 100 
      : changePercent;
  } else if (q.preMarketPrice && q.preMarketPrice > 0) {
    price = q.preMarketPrice;
    change = q.preMarketChange || 0;
    changePercent = q.preMarketChangePercent || 0;
  }
  
  const marketCap = q.marketCap || null;
  const currency = q.currency || 'USD';
  const fiftyTwoWeekHigh = q.fiftyTwoWeekHigh || price;
  const fiftyTwoWeekLow = q.fiftyTwoWeekLow || price;
  
  // Calculate P/E from EPS if not directly provided
  const eps = q.epsTrailingTwelveMonths;
  const forwardEps = q.epsForward;
  const peRatio = q.trailingPE != null ? q.trailingPE : (eps && eps !== 0 ? price / eps : null);
  const forwardPeRatio = q.forwardPE != null ? q.forwardPE : (forwardEps && forwardEps !== 0 ? price / forwardEps : null);
  
  return {
    symbol: q.symbol,
    name: q.shortName || q.longName || q.symbol,
    price: price,
    change: change,
    changePercent: changePercent,
    marketCap: marketCap,
    marketCapCategory: categorizeMarketCap(marketCap, currency),
    peRatio: peRatio,
    forwardPeRatio: forwardPeRatio,
    pbRatio: q.priceToBook || null,
    fiftyTwoWeekHigh: fiftyTwoWeekHigh,
    fiftyTwoWeekLow: fiftyTwoWeekLow,
    percentFromFiftyTwoWeekHigh: fiftyTwoWeekHigh ? ((price - fiftyTwoWeekHigh) / fiftyTwoWeekHigh) * 100 : null,
    percentFromFiftyTwoWeekLow: fiftyTwoWeekLow ? ((price - fiftyTwoWeekLow) / fiftyTwoWeekLow) * 100 : null,
    dividendYield: q.trailingAnnualDividendYield ? q.trailingAnnualDividendYield * 100 : (q.dividendYield || null),
    volume: q.regularMarketVolume || 0,
    avgVolume: q.averageDailyVolume3Month || q.averageDailyVolume10Day || null,
    relativeVolume: q.averageDailyVolume3Month && q.regularMarketVolume 
      ? q.regularMarketVolume / q.averageDailyVolume3Month : 1,
    sector: q.sector || 'Unknown',
    industry: q.industry || 'Unknown',
    beta: q.beta || null,
    fiftyDayMA: q.fiftyDayAverage,
    twoHundredDayMA: q.twoHundredDayAverage,
    percentFromFiftyDayMA: q.fiftyDayAverage ? ((price - q.fiftyDayAverage) / q.fiftyDayAverage) * 100 : null,
    percentFromTwoHundredDayMA: q.twoHundredDayAverage ? ((price - q.twoHundredDayAverage) / q.twoHundredDayAverage) * 100 : null,
    exchange: q.exchange || 'UNKNOWN',
    currency: currency,
    market: currency === 'INR' || (q.symbol && (q.symbol.endsWith('.NS') || q.symbol.endsWith('.BO'))) ? 'IN' : 'US',
    // Technical indicators (calculated on demand)
    rsi: null,
    macdLine: null,
    macdSignal: null,
    macdHistogram: null,
    macdSignalType: null,
    lastUpdated: new Date()
  };
}

/**
 * Calculate technical indicators for a stock
 */
async function enrichWithTechnicals(stock) {
  try {
    const prices = await fetchHistoricalPrices(stock.symbol, 50);
    if (prices && prices.length >= 35) {
      stock.rsi = calculateRSI(prices);
      if (stock.rsi != null) {
        stock.rsi = Math.round(stock.rsi * 10) / 10;
      }
      
      const macd = calculateMACD(prices);
      if (macd) {
        stock.macdLine = macd.macdLine;
        stock.macdSignal = macd.signal;
        stock.macdHistogram = macd.histogram;
        stock.macdSignalType = macd.signalType;
      }
    }
  } catch (error) {
    // Silently fail - indicators stay null
  }
  return stock;
}

/**
 * Fallback: Fetch stocks from predefined symbol list
 */
async function fetchMarketStocksFromList(market) {
  const symbols = market === 'IN' ? IN_SYMBOLS : US_SYMBOLS;
  
  console.log(`[Fallback] Fetching ${symbols.length} stocks for ${market}...`);
  const results = [];
  
  const batchSize = 5;
  for (let i = 0; i < symbols.length; i += batchSize) {
    const batch = symbols.slice(i, i + batchSize);
    console.log(`[Fallback] Batch ${Math.floor(i/batchSize) + 1}/${Math.ceil(symbols.length/batchSize)}`);
    
    const batchPromises = batch.map(async (symbol) => {
      const quote = await fetchYahooQuote(symbol);
      return transformQuote(quote, symbol);
    });
    
    const batchResults = await Promise.all(batchPromises);
    batchResults.forEach(quote => {
      if (quote && quote.price > 0) results.push(quote);
    });
    
    if (i + batchSize < symbols.length) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }
  
  console.log(`[Fallback] Got ${results.length} valid stocks`);
  return results;
}

/**
 * Main function to fetch market stocks
 */
async function fetchMarketStocks(market, filters = {}) {
  // Try screener API first for full market access
  return fetchScreenerStocks(market, filters);
}

function applyFilters(stocks, filters) {
  return stocks.filter(stock => {
    if (!stock || !stock.price) return false;
    
    if (filters.marketCap?.categories?.length > 0) {
      if (!filters.marketCap.categories.includes(stock.marketCapCategory)) return false;
    }
    
    if (filters.marketCap?.customRange) {
      const { min, max } = filters.marketCap.customRange;
      if (min != null && (stock.marketCap == null || stock.marketCap < min)) return false;
      if (max != null && (stock.marketCap == null || stock.marketCap > max)) return false;
    }

    if (filters.peRatio?.min != null && (stock.peRatio == null || stock.peRatio < filters.peRatio.min)) return false;
    if (filters.peRatio?.max != null && (stock.peRatio == null || stock.peRatio > filters.peRatio.max)) return false;

    if (filters.fiftyTwoWeek?.nearHigh && (stock.percentFromFiftyTwoWeekHigh == null || stock.percentFromFiftyTwoWeekHigh < -5)) return false;
    if (filters.fiftyTwoWeek?.nearLow && (stock.percentFromFiftyTwoWeekLow == null || stock.percentFromFiftyTwoWeekLow > 10)) return false;

    if (filters.sectors?.length > 0 && !filters.sectors.includes(stock.sector)) return false;

    if (filters.movingAverages?.aboveFiftyDayMA === true && (stock.percentFromFiftyDayMA == null || stock.percentFromFiftyDayMA <= 0)) return false;
    if (filters.movingAverages?.aboveFiftyDayMA === false && (stock.percentFromFiftyDayMA == null || stock.percentFromFiftyDayMA > 0)) return false;
    if (filters.movingAverages?.aboveTwoHundredDayMA === true && (stock.percentFromTwoHundredDayMA == null || stock.percentFromTwoHundredDayMA <= 0)) return false;
    if (filters.movingAverages?.aboveTwoHundredDayMA === false && (stock.percentFromTwoHundredDayMA == null || stock.percentFromTwoHundredDayMA > 0)) return false;

    // RSI Filter
    if (filters.rsi?.zones?.length > 0 && stock.rsi != null) {
      const rsiZone = getRSIZone(stock.rsi);
      if (!filters.rsi.zones.includes(rsiZone)) return false;
    }

    // MACD Filter
    if (filters.macd?.signals?.length > 0 && stock.macdSignalType != null) {
      if (!filters.macd.signals.includes(stock.macdSignalType)) return false;
    }

    return true;
  });
}

function sortStocks(stocks, sort) {
  const field = sort?.field || 'marketCap';
  const direction = sort?.direction || 'desc';
  
  return [...stocks].sort((a, b) => {
    let aVal = a[field];
    let bVal = b[field];
    if (aVal == null) return 1;
    if (bVal == null) return -1;
    if (typeof aVal === 'string') return direction === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
    return direction === 'asc' ? aVal - bVal : bVal - aVal;
  });
}

// HTTP Server
const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Requested-With, X-Request-Time');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  res.setHeader('Content-Type', 'application/json');
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const path = url.pathname;

  console.log(`[${new Date().toISOString()}] ${req.method} ${path}`);

  try {
    if (path === '/api/stocks/screen' && req.method === 'POST') {
      let body = '';
      req.on('data', chunk => { body += chunk; });
      await new Promise(resolve => req.on('end', resolve));

      const { filters = {}, sort = {}, pagination = {} } = JSON.parse(body || '{}');
      const startTime = Date.now();
      const market = filters.market || 'US';
      
      // Check if technical filters are being used
      const needsTechnicals = (filters.rsi?.zones?.length > 0) || (filters.macd?.signals?.length > 0);
      
      // Pass filters to screener for server-side filtering where possible
      let stocks = await fetchMarketStocks(market, filters);
      
      // Apply non-technical filters first to reduce the set
      const nonTechFilters = { ...filters, rsi: { zones: [] }, macd: { signals: [] } };
      stocks = applyFilters(stocks, nonTechFilters);
      
      // Calculate technicals if filters require them
      if (needsTechnicals) {
        console.log(`[Screen] Calculating technicals for ${stocks.length} stocks...`);
        
        // Process in batches of 20 for parallel fetching
        const batchSize = 20;
        for (let i = 0; i < stocks.length; i += batchSize) {
          const batch = stocks.slice(i, i + batchSize);
          await Promise.all(batch.map(stock => enrichWithTechnicals(stock)));
          
          // Progress logging every 100 stocks
          if ((i + batchSize) % 100 === 0 || i + batchSize >= stocks.length) {
            console.log(`[Screen] Technical progress: ${Math.min(i + batchSize, stocks.length)}/${stocks.length}`);
          }
          
          // Small delay between batches to avoid rate limiting
          if (i + batchSize < stocks.length) {
            await new Promise(resolve => setTimeout(resolve, 30));
          }
        }
        
        // Now apply technical filters
        stocks = applyFilters(stocks, filters);
        console.log(`[Screen] After technical filters: ${stocks.length} stocks`);
      }
      
      stocks = sortStocks(stocks, sort);
      
      const page = pagination.page || 0;
      const pageSize = pagination.pageSize || 50;
      const paginatedStocks = stocks.slice(page * pageSize, (page + 1) * pageSize);

      res.writeHead(200);
      res.end(JSON.stringify({
        stocks: paginatedStocks,
        totalCount: stocks.length,
        executionTimeMs: Date.now() - startTime,
        timestamp: new Date().toISOString()
      }));
      return;
    }

    if (path === '/api/stocks/quote' && req.method === 'GET') {
      const symbol = url.searchParams.get('symbol');
      if (!symbol) {
        res.writeHead(400);
        res.end(JSON.stringify({ error: 'Symbol required' }));
        return;
      }
      
      const cacheKey = `quote_${symbol}`;
      const quote = await getCached(cacheKey, async () => {
        const q = await fetchYahooQuote(symbol);
        return transformQuote(q, symbol);
      });
      
      if (!quote) {
        res.writeHead(404);
        res.end(JSON.stringify({ error: 'Symbol not found' }));
        return;
      }
      
      res.writeHead(200);
      res.end(JSON.stringify(quote));
      return;
    }

    if (path === '/api/cache/clear' && req.method === 'POST') {
      cache.clear();
      yahooAuth = { crumb: null, cookies: null, timestamp: 0 };
      res.writeHead(200);
      res.end(JSON.stringify({ message: 'Cache cleared' }));
      return;
    }

    // Market indices endpoint
    if (path === '/api/market/indices' && req.method === 'GET') {
      const market = url.searchParams.get('market') || 'US';
      
      // Define indices for each market
      const indicesMap = {
        'US': ['^GSPC', '^DJI', '^IXIC'],  // S&P 500, Dow Jones, NASDAQ
        'IN': ['^NSEI', '^BSESN']           // Nifty 50, Sensex
      };
      
      const indexNames = {
        '^GSPC': 'S&P 500',
        '^DJI': 'Dow Jones',
        '^IXIC': 'NASDAQ',
        '^NSEI': 'NIFTY 50',
        '^BSESN': 'SENSEX'
      };
      
      const symbols = indicesMap[market] || indicesMap['US'];
      
      try {
        const auth = await getYahooCrumb();
        const symbolsParam = symbols.join(',');
        const quotePath = `/v7/finance/quote?symbols=${encodeURIComponent(symbolsParam)}&crumb=${encodeURIComponent(auth.crumb || '')}`;
        
        const response = await httpsRequest({
          hostname: 'query1.finance.yahoo.com',
          port: 443,
          path: quotePath,
          method: 'GET',
          headers: {
            'Cookie': auth.cookies,
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
          }
        });
        
        if (response.statusCode === 200 && response.body) {
          const data = JSON.parse(response.body);
          const quotes = data.quoteResponse?.result || [];
          
          const indices = quotes.map(q => ({
            symbol: q.symbol,
            name: indexNames[q.symbol] || q.shortName || q.symbol,
            price: q.regularMarketPrice || 0,
            change: q.regularMarketChange || 0,
            changePercent: q.regularMarketChangePercent || 0,
            fiftyTwoWeekLow: q.fiftyTwoWeekLow || 0,
            fiftyTwoWeekHigh: q.fiftyTwoWeekHigh || 0
          }));
          
          res.writeHead(200);
          res.end(JSON.stringify({ indices }));
          return;
        }
      } catch (error) {
        console.error('[Indices] Error fetching indices:', error.message);
      }
      
      res.writeHead(500);
      res.end(JSON.stringify({ error: 'Failed to fetch indices' }));
      return;
    }

    // Search for symbols directly (for autocomplete when stock not in cache)
    if (path === '/api/stocks/search' && req.method === 'GET') {
      const query = url.searchParams.get('q');
      const includeTechnicals = url.searchParams.get('technicals') === 'true';
      const fuzzy = url.searchParams.get('fuzzy') === 'true';
      
      if (!query || query.length < 1) {
        res.writeHead(400);
        res.end(JSON.stringify({ error: 'Query required' }));
        return;
      }
      
      try {
        const quotes = [];
        const seenSymbols = new Set();
        
        // Always try exact symbol match first (handles cases like "HOOD" directly)
        const exactSymbol = query.toUpperCase().trim();
        if (/^[A-Z\-\.]{1,10}$/.test(exactSymbol)) {
          const exactQuote = await fetchYahooQuote(exactSymbol);
          if (exactQuote) {
            let transformed = transformQuote(exactQuote, exactSymbol);
            if (transformed) {
              if (includeTechnicals) {
                await enrichWithTechnicals(transformed);
              }
              quotes.push(transformed);
              seenSymbols.add(exactSymbol);
            }
          }
        }
        
        // If fuzzy search, also use Yahoo's search API to find by name
        if (fuzzy) {
          const searchResults = await searchYahooSymbols(query);
          
          // Fetch full quotes for the found symbols
          for (const result of searchResults.slice(0, 10)) {
            if (seenSymbols.has(result.symbol)) continue; // Skip duplicates
            const quote = await fetchYahooQuote(result.symbol);
            if (quote) {
              let transformed = transformQuote(quote, result.symbol);
              if (transformed) {
                if (includeTechnicals) {
                  await enrichWithTechnicals(transformed);
                }
                quotes.push(transformed);
                seenSymbols.add(result.symbol);
              }
            }
          }
        } else if (query.includes(',')) {
          // Multi-symbol exact search
          const symbols = query.toUpperCase().split(',').slice(0, 10);
          
          for (const symbol of symbols) {
            const sym = symbol.trim();
            if (seenSymbols.has(sym)) continue;
            const quote = await fetchYahooQuote(sym);
            if (quote) {
              let transformed = transformQuote(quote, sym);
              if (transformed) {
                if (includeTechnicals) {
                  await enrichWithTechnicals(transformed);
                }
                quotes.push(transformed);
                seenSymbols.add(sym);
              }
            }
          }
        }
        
        res.writeHead(200);
        res.end(JSON.stringify({ stocks: quotes }));
      } catch (error) {
        res.writeHead(500);
        res.end(JSON.stringify({ error: error.message }));
      }
      return;
    }

    // Bulk technicals calculation - processes many symbols in parallel
    if (path === '/api/stocks/technicals' && req.method === 'POST') {
      let body = '';
      req.on('data', chunk => { body += chunk; });
      await new Promise(resolve => req.on('end', resolve));
      
      try {
        const { symbols } = JSON.parse(body || '{}');
        if (!symbols || !Array.isArray(symbols)) {
          res.writeHead(400);
          res.end(JSON.stringify({ error: 'Symbols array required' }));
          return;
        }
        
        console.log(`[Technicals] Calculating for ${symbols.length} symbols...`);
        const startTime = Date.now();
        
        // Process in parallel batches of 50 for speed
        const batchSize = 50;
        const results = {};
        
        for (let i = 0; i < symbols.length; i += batchSize) {
          const batch = symbols.slice(i, i + batchSize);
          
          // Fetch historical data in parallel
          const batchPromises = batch.map(async (symbol) => {
            try {
              const prices = await fetchHistoricalPrices(symbol, 50);
              if (prices && prices.length >= 35) {
                const rsi = calculateRSI(prices);
                const macd = calculateMACD(prices);
                return {
                  symbol,
                  rsi: rsi != null ? Math.round(rsi * 10) / 10 : null,
                  macdLine: macd?.macdLine || null,
                  macdSignal: macd?.signal || null,
                  macdHistogram: macd?.histogram || null,
                  macdSignalType: macd?.signalType || null
                };
              }
              return { symbol, rsi: null, macdLine: null, macdSignal: null, macdHistogram: null, macdSignalType: null };
            } catch (err) {
              return { symbol, rsi: null, macdLine: null, macdSignal: null, macdHistogram: null, macdSignalType: null };
            }
          });
          
          const batchResults = await Promise.all(batchPromises);
          for (const r of batchResults) {
            results[r.symbol] = r;
          }
          
          console.log(`[Technicals] Progress: ${Math.min(i + batchSize, symbols.length)}/${symbols.length}`);
        }
        
        console.log(`[Technicals] Completed in ${Date.now() - startTime}ms`);
        
        res.writeHead(200);
        res.end(JSON.stringify({ technicals: results }));
      } catch (error) {
        console.error('[Technicals] Error:', error);
        res.writeHead(500);
        res.end(JSON.stringify({ error: error.message }));
      }
      return;
    }

    // Stock news RSS feed endpoint
    if (path.match(/^\/api\/stocks\/([^\/]+)\/news$/) && req.method === 'GET') {
      const symbol = path.match(/^\/api\/stocks\/([^\/]+)\/news$/)[1].toUpperCase();
      
      try {
        console.log(`[News] Fetching news for ${symbol}...`);
        const news = await fetchStockNews(symbol);
        
        res.writeHead(200);
        res.end(JSON.stringify({ news, symbol }));
      } catch (error) {
        console.error(`[News] Error fetching news for ${symbol}:`, error.message);
        res.writeHead(500);
        res.end(JSON.stringify({ error: 'Failed to fetch news', news: [] }));
      }
      return;
    }

    // Market-wide news endpoint (aggregates news from large-cap stocks + general market news)
    if (path === '/api/market/news' && req.method === 'GET') {
      const LARGE_CAP_STOCKS = [
        'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'NVDA', 'META', 'TSLA', 'BRK-B',
        'UNH', 'JNJ', 'V', 'XOM', 'JPM', 'WMT', 'MA'
      ];
      
      // General market news RSS feeds
      const MARKET_NEWS_FEEDS = [
        { url: 'https://news.google.com/rss/search?q=stock+market+today&hl=en-US&gl=US&ceid=US:en', source: 'Market News', symbol: 'MARKET' },
        { url: 'https://news.google.com/rss/search?q=fed+interest+rates+economy&hl=en-US&gl=US&ceid=US:en', source: 'Economic News', symbol: 'ECONOMY' },
        { url: 'https://news.google.com/rss/search?q=S%26P+500+dow+jones+nasdaq&hl=en-US&gl=US&ceid=US:en', source: 'Market Indices', symbol: 'INDICES' }
      ];
      
      // Helper to classify if news is market-related
      function isMarketNews(title, description) {
        const text = `${title} ${description}`.toLowerCase();
        return text.includes('fed ') || text.includes('federal reserve') || text.includes('interest rate') ||
               text.includes('inflation') || text.includes('gdp') || text.includes('jobs report') ||
               text.includes('unemployment') || text.includes('recession') || text.includes('economy') ||
               text.includes('s&p 500') || text.includes('dow jones') || text.includes('nasdaq') ||
               text.includes('market today') || text.includes('markets ') || text.includes('wall street') ||
               text.includes('rally') || text.includes('selloff') || text.includes('bull market') ||
               text.includes('bear market') || text.includes('treasury') || text.includes('bond yield');
      }
      
      try {
        console.log('[Market News] Fetching news from large-cap stocks and market feeds...');
        
        // Fetch general market news
        const marketNewsPromises = MARKET_NEWS_FEEDS.map(async (feed) => {
          try {
            const items = await fetchRSSWithTimeout({
              hostname: 'news.google.com',
              path: new URL(feed.url).pathname + new URL(feed.url).search
            }, feed.source, 5000);
            return items.map(item => ({
              ...item,
              symbol: feed.symbol,
              type: 'market',
              timeAgo: getRelativeTime(item.pubDate)
            }));
          } catch (err) {
            return [];
          }
        });
        
        // Fetch news from multiple stocks in parallel
        const stockNewsPromises = LARGE_CAP_STOCKS.map(async (symbol) => {
          try {
            const items = await tryYahooFinanceRSS(symbol);
            // Add symbol to each news item and check if it's market news
            return items.map(item => {
              const itemIsMarket = isMarketNews(item.title, item.description || '');
              return {
                ...item,
                symbol,
                type: itemIsMarket ? 'market' : item.type,
                timeAgo: getRelativeTime(item.pubDate)
              };
            });
          } catch (err) {
            return [];
          }
        });
        
        const [marketResults, stockResults] = await Promise.all([
          Promise.all(marketNewsPromises),
          Promise.all(stockNewsPromises)
        ]);
        
        let allNews = [...marketResults.flat(), ...stockResults.flat()];
        
        // Filter out articles older than 7 days
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
        allNews = allNews.filter(item => {
          try {
            return new Date(item.pubDate) >= sevenDaysAgo;
          } catch {
            return false;
          }
        });
        
        // Remove duplicates by link
        const seenLinks = new Set();
        allNews = allNews.filter(item => {
          if (seenLinks.has(item.link)) return false;
          seenLinks.add(item.link);
          return true;
        });
        
        // Sort by date (newest first)
        allNews.sort((a, b) => {
          const dateA = new Date(a.pubDate || 0);
          const dateB = new Date(b.pubDate || 0);
          return dateB.getTime() - dateA.getTime();
        });
        
        // Calculate category counts
        const categories = {
          market: 0,
          price_target: 0,
          upgrade_downgrade: 0,
          earnings: 0,
          insider: 0,
          dividend: 0,
          general: 0
        };
        
        allNews.forEach(item => {
          if (categories[item.type] !== undefined) {
            categories[item.type]++;
          }
        });
        
        // Limit to 150 articles
        const limitedNews = allNews.slice(0, 150);
        
        console.log(`[Market News] Total: ${limitedNews.length} articles (${categories.market} market news)`);
        
        res.writeHead(200);
        res.end(JSON.stringify({
          news: limitedNews,
          categories,
          totalStocks: LARGE_CAP_STOCKS.length,
          timestamp: new Date().toISOString()
        }));
      } catch (error) {
        console.error('[Market News] Error:', error.message);
        res.writeHead(500);
        res.end(JSON.stringify({ error: 'Failed to fetch market news', news: [], categories: {} }));
      }
      return;
    }

    // Technical Breakouts endpoint
    if (path === '/api/market/breakouts' && req.method === 'GET') {
      const STOCKS_TO_SCAN = [
        // Mega cap tech
        'AAPL', 'MSFT', 'GOOGL', 'GOOG', 'AMZN', 'NVDA', 'META', 'TSLA', 'BRK-B', 'BRK-A',
        // Healthcare
        'UNH', 'JNJ', 'LLY', 'PFE', 'MRK', 'ABBV', 'TMO', 'ABT', 'DHR', 'BMY',
        // Financial
        'V', 'JPM', 'MA', 'BAC', 'WFC', 'GS', 'MS', 'BLK', 'SCHW', 'AXP',
        // Consumer
        'WMT', 'PG', 'HD', 'KO', 'PEP', 'COST', 'MCD', 'NKE', 'SBUX', 'TGT',
        // Energy
        'XOM', 'CVX', 'COP', 'SLB', 'EOG', 'MPC', 'PSX', 'VLO', 'OXY', 'HAL',
        // Tech & Semiconductors
        'AVGO', 'CSCO', 'ACN', 'CRM', 'ORCL', 'NFLX', 'AMD', 'INTC', 'QCOM', 'TXN',
        'IBM', 'AMAT', 'LRCX', 'MU', 'ADI', 'KLAC', 'SNPS', 'CDNS', 'MRVL', 'ON',
        // Industrial
        'CAT', 'DE', 'BA', 'HON', 'UPS', 'RTX', 'LMT', 'GE', 'MMM', 'UNP',
        // Telecom & Media
        'DIS', 'CMCSA', 'VZ', 'T', 'TMUS', 'CHTR', 'WBD', 'PARA', 'FOX', 'NWSA',
        // Utilities & REITs
        'NEE', 'DUK', 'SO', 'AEP', 'D', 'EXC', 'SRE', 'AMT', 'PLD', 'CCI',
        // Other popular
        'PYPL', 'SQ', 'SHOP', 'UBER', 'ABNB', 'COIN', 'SNOW', 'PLTR', 'RIVN', 'LCID'
      ];

      function analyzeStockForBreakouts(quote, rsi, macd) {
        const breakouts = [];
        
        const baseStock = {
          symbol: quote.symbol,
          name: quote.shortName || quote.longName || quote.symbol,
          price: quote.regularMarketPrice || 0,
          change: quote.regularMarketChange || 0,
          changePercent: quote.regularMarketChangePercent || 0,
          marketCap: quote.marketCap || 0,
          volume: quote.regularMarketVolume || 0,
          avgVolume: quote.averageDailyVolume3Month || 0,
          relativeVolume: quote.averageDailyVolume3Month ? (quote.regularMarketVolume / quote.averageDailyVolume3Month) : 1,
          fiftyDayMA: quote.fiftyDayAverage,
          twoHundredDayMA: quote.twoHundredDayAverage,
          percentFromFiftyDayMA: quote.fiftyDayAverage ? ((quote.regularMarketPrice - quote.fiftyDayAverage) / quote.fiftyDayAverage) * 100 : null,
          percentFromTwoHundredDayMA: quote.twoHundredDayAverage ? ((quote.regularMarketPrice - quote.twoHundredDayAverage) / quote.twoHundredDayAverage) * 100 : null,
          fiftyTwoWeekHigh: quote.fiftyTwoWeekHigh,
          fiftyTwoWeekLow: quote.fiftyTwoWeekLow,
          percentFromFiftyTwoWeekHigh: quote.fiftyTwoWeekHigh ? ((quote.regularMarketPrice - quote.fiftyTwoWeekHigh) / quote.fiftyTwoWeekHigh) * 100 : null,
          percentFromFiftyTwoWeekLow: quote.fiftyTwoWeekLow ? ((quote.regularMarketPrice - quote.fiftyTwoWeekLow) / quote.fiftyTwoWeekLow) * 100 : null,
          rsi: rsi ? Math.round(rsi * 10) / 10 : undefined,
          market: 'US'
        };

        const price = baseStock.price;
        const pct50MA = baseStock.percentFromFiftyDayMA;
        const pct200MA = baseStock.percentFromTwoHundredDayMA;
        const pct52High = baseStock.percentFromFiftyTwoWeekHigh;
        const pct52Low = baseStock.percentFromFiftyTwoWeekLow;
        const relVol = baseStock.relativeVolume;

        // Moving Average Crossovers - within 5% of 50 MA
        if (pct50MA != null && Math.abs(pct50MA) <= 5) {
          breakouts.push({
            ...baseStock,
            alertType: pct50MA > 0 ? 'above_50ma' : 'below_50ma',
            alertCategory: 'ma_crossover',
            alertDescription: pct50MA > 0 
              ? `Trading ${Math.abs(pct50MA).toFixed(1)}% above 50-day MA - potential support` 
              : `Trading ${Math.abs(pct50MA).toFixed(1)}% below 50-day MA - watch for breakdown`,
            severity: pct50MA > 0 ? 'bullish' : 'bearish'
          });
        }

        // Within 8% of 200 MA
        if (pct200MA != null && Math.abs(pct200MA) <= 8) {
          breakouts.push({
            ...baseStock,
            alertType: pct200MA > 0 ? 'above_200ma' : 'below_200ma',
            alertCategory: 'ma_crossover',
            alertDescription: pct200MA > 0 
              ? `Trading ${Math.abs(pct200MA).toFixed(1)}% above 200-day MA - long-term uptrend` 
              : `Trading ${Math.abs(pct200MA).toFixed(1)}% below 200-day MA - long-term downtrend`,
            severity: pct200MA > 0 ? 'bullish' : 'bearish'
          });
        }

        // Golden Cross / Death Cross detection - within 3%
        if (baseStock.fiftyDayMA && baseStock.twoHundredDayMA) {
          const maDiff = ((baseStock.fiftyDayMA - baseStock.twoHundredDayMA) / baseStock.twoHundredDayMA) * 100;
          if (Math.abs(maDiff) <= 3) {
            breakouts.push({
              ...baseStock,
              alertType: maDiff > 0 ? 'golden_cross' : 'death_cross',
              alertCategory: 'ma_crossover',
              alertDescription: maDiff > 0 
                ? `Golden Cross forming - 50 MA ${Math.abs(maDiff).toFixed(1)}% above 200 MA (bullish)` 
                : `Death Cross forming - 50 MA ${Math.abs(maDiff).toFixed(1)}% below 200 MA (bearish)`,
              severity: maDiff > 0 ? 'bullish' : 'bearish'
            });
          }
        }

        // 52-Week Highs - within 5% of high
        if (pct52High != null && pct52High >= -5) {
          breakouts.push({
            ...baseStock,
            alertType: pct52High >= 0 ? 'new_52w_high' : 'near_52w_high',
            alertCategory: '52w_highs',
            alertDescription: pct52High >= 0 
              ? 'New 52-week high - momentum breakout' 
              : `Within ${Math.abs(pct52High).toFixed(1)}% of 52-week high`,
            severity: 'bullish'
          });
        }

        // 52-Week Lows - within 10% of low
        if (pct52Low != null && pct52Low <= 10) {
          breakouts.push({
            ...baseStock,
            alertType: pct52Low <= 0 ? 'new_52w_low' : 'near_52w_low',
            alertCategory: '52w_lows',
            alertDescription: pct52Low <= 0 
              ? 'New 52-week low - potential capitulation' 
              : `Within ${pct52Low.toFixed(1)}% of 52-week low - potential bounce`,
            severity: pct52Low <= 0 ? 'bearish' : 'neutral'
          });
        }

        // RSI Signals - expanded thresholds
        if (rsi != null) {
          if (rsi <= 35) {
            breakouts.push({
              ...baseStock,
              alertType: rsi <= 30 ? 'rsi_oversold' : 'rsi_approaching_oversold',
              alertCategory: 'rsi_signals',
              alertDescription: rsi <= 30 
                ? `RSI at ${rsi.toFixed(0)} - oversold territory, potential bounce`
                : `RSI at ${rsi.toFixed(0)} - approaching oversold, watch for reversal`,
              severity: 'bullish'
            });
          } else if (rsi >= 65) {
            breakouts.push({
              ...baseStock,
              alertType: rsi >= 70 ? 'rsi_overbought' : 'rsi_approaching_overbought',
              alertCategory: 'rsi_signals',
              alertDescription: rsi >= 70 
                ? `RSI at ${rsi.toFixed(0)} - overbought territory, potential pullback`
                : `RSI at ${rsi.toFixed(0)} - approaching overbought, monitor closely`,
              severity: 'bearish'
            });
          }
        }

        // Volume Breakouts - 1.5x+ average
        if (relVol >= 1.5) {
          breakouts.push({
            ...baseStock,
            alertType: 'high_volume',
            alertCategory: 'volume_breakout',
            alertDescription: `${relVol.toFixed(1)}x average volume - ${relVol >= 2 ? 'significant' : 'elevated'} activity`,
            severity: baseStock.changePercent >= 0 ? 'bullish' : 'bearish'
          });
        }

        // MACD Signals
        if (macd && macd.signalType) {
          const signalType = macd.signalType;
          if (signalType === 'bullish_crossover') {
            breakouts.push({
              ...baseStock,
              alertType: 'macd_bullish_cross',
              alertCategory: 'macd_signals',
              alertDescription: 'MACD bullish crossover - MACD line crossed above signal line',
              severity: 'bullish'
            });
          } else if (signalType === 'bearish_crossover') {
            breakouts.push({
              ...baseStock,
              alertType: 'macd_bearish_cross',
              alertCategory: 'macd_signals',
              alertDescription: 'MACD bearish crossover - MACD line crossed below signal line',
              severity: 'bearish'
            });
          } else if (signalType === 'strong_bullish') {
            breakouts.push({
              ...baseStock,
              alertType: 'macd_strong_bullish',
              alertCategory: 'macd_signals',
              alertDescription: 'Strong bullish MACD - positive MACD above signal line',
              severity: 'bullish'
            });
          } else if (signalType === 'strong_bearish') {
            breakouts.push({
              ...baseStock,
              alertType: 'macd_strong_bearish',
              alertCategory: 'macd_signals',
              alertDescription: 'Strong bearish MACD - negative MACD below signal line',
              severity: 'bearish'
            });
          }
        }

        return breakouts;
      }

      try {
        console.log('[Breakouts] Scanning stocks for technical breakouts...');
        const startTime = Date.now();
        
        // Fetch quotes and calculate technicals
        const auth = await getYahooCrumb();
        const allBreakouts = [];
        
        // Process in batches
        const batchSize = 10;
        for (let i = 0; i < STOCKS_TO_SCAN.length; i += batchSize) {
          const batch = STOCKS_TO_SCAN.slice(i, i + batchSize);
          
          // Fetch quotes for batch
          const symbolsParam = batch.join(',');
          const quotePath = `/v7/finance/quote?symbols=${encodeURIComponent(symbolsParam)}&crumb=${encodeURIComponent(auth.crumb || '')}`;
          
          const quoteResponse = await httpsRequest({
            hostname: 'query1.finance.yahoo.com',
            port: 443,
            path: quotePath,
            method: 'GET',
            headers: {
              'Cookie': auth.cookies,
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
          });
          
          if (quoteResponse.statusCode === 200 && quoteResponse.body) {
            const data = JSON.parse(quoteResponse.body);
            const quotes = data.quoteResponse?.result || [];
            
            // Calculate RSI for each stock and analyze
            for (const quote of quotes) {
              try {
                const prices = await fetchHistoricalPrices(quote.symbol, 50);
                const rsi = prices ? calculateRSI(prices) : null;
                const macd = prices ? calculateMACD(prices) : null;
                const breakouts = analyzeStockForBreakouts(quote, rsi, macd);
                allBreakouts.push(...breakouts);
              } catch (err) {
                // Skip stocks with errors
              }
            }
          }
          
          // Small delay between batches
          if (i + batchSize < STOCKS_TO_SCAN.length) {
            await new Promise(resolve => setTimeout(resolve, 100));
          }
        }
        
        // Sort by absolute change percent
        allBreakouts.sort((a, b) => Math.abs(b.changePercent) - Math.abs(a.changePercent));
        
        console.log(`[Breakouts] Found ${allBreakouts.length} alerts in ${Date.now() - startTime}ms`);
        
        res.writeHead(200);
        res.end(JSON.stringify({
          breakouts: allBreakouts,
          scannedStocks: STOCKS_TO_SCAN.length,
          timestamp: new Date().toISOString()
        }));
      } catch (error) {
        console.error('[Breakouts] Error:', error.message);
        res.writeHead(500);
        res.end(JSON.stringify({ error: 'Failed to scan breakouts', breakouts: [] }));
      }
      return;
    }

    if (path === '/api/health') {
      res.writeHead(200);
      res.end(JSON.stringify({ status: 'ok', cacheSize: cache.size, hasAuth: !!yahooAuth.crumb }));
      return;
    }

    res.writeHead(404);
    res.end(JSON.stringify({ error: 'Not found' }));
  } catch (error) {
    console.error('[Error]', error);
    res.writeHead(500);
    res.end(JSON.stringify({ error: error.message }));
  }
});

server.listen(PORT, () => {
  console.log(`
╔═══════════════════════════════════════════════════════════════╗
║   Stock Screener API - http://localhost:${PORT}                 ║
║   Yahoo Finance with crumb authentication                     ║
╚═══════════════════════════════════════════════════════════════╝
`);
  
  // Pre-fetch crumb on startup
  getYahooCrumb().then(auth => {
    if (auth.crumb) {
      console.log('[Startup] Yahoo Finance authentication ready');
    } else {
      console.log('[Startup] Warning: Could not get Yahoo Finance crumb, using fallback');
    }
  });
});
