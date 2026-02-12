import type { VercelRequest, VercelResponse } from '@vercel/node';
import https from 'https';

interface NewsItem {
  title: string;
  link: string;
  pubDate: string;
  source: string;
  type: string;
  symbol: string;
  stockName?: string;
  timeAgo: string;
}

// US Large-cap stocks (>$100B market cap) to fetch news from
const US_LARGE_CAP_STOCKS = [
  { symbol: 'AAPL', name: 'Apple' },
  { symbol: 'MSFT', name: 'Microsoft' },
  { symbol: 'GOOGL', name: 'Alphabet' },
  { symbol: 'AMZN', name: 'Amazon' },
  { symbol: 'NVDA', name: 'NVIDIA' },
  { symbol: 'META', name: 'Meta' },
  { symbol: 'TSLA', name: 'Tesla' },
  { symbol: 'BRK-B', name: 'Berkshire' },
  { symbol: 'UNH', name: 'UnitedHealth' },
  { symbol: 'JNJ', name: 'J&J' },
  { symbol: 'V', name: 'Visa' },
  { symbol: 'XOM', name: 'Exxon' },
  { symbol: 'JPM', name: 'JPMorgan' },
  { symbol: 'WMT', name: 'Walmart' },
  { symbol: 'MA', name: 'Mastercard' },
  { symbol: 'PG', name: 'P&G' },
  { symbol: 'HD', name: 'Home Depot' },
  { symbol: 'CVX', name: 'Chevron' },
  { symbol: 'LLY', name: 'Eli Lilly' },
  { symbol: 'AVGO', name: 'Broadcom' },
  { symbol: 'COST', name: 'Costco' },
  { symbol: 'MRK', name: 'Merck' },
  { symbol: 'ABBV', name: 'AbbVie' },
  { symbol: 'PEP', name: 'PepsiCo' },
  { symbol: 'KO', name: 'Coca-Cola' },
  { symbol: 'NFLX', name: 'Netflix' },
  { symbol: 'CRM', name: 'Salesforce' },
  { symbol: 'AMD', name: 'AMD' },
  { symbol: 'ORCL', name: 'Oracle' },
  { symbol: 'INTC', name: 'Intel' }
];

// Indian Large-cap stocks to fetch news from
const IN_LARGE_CAP_STOCKS = [
  { symbol: 'RELIANCE.NS', name: 'Reliance' },
  { symbol: 'TCS.NS', name: 'TCS' },
  { symbol: 'HDFCBANK.NS', name: 'HDFC Bank' },
  { symbol: 'INFY.NS', name: 'Infosys' },
  { symbol: 'ICICIBANK.NS', name: 'ICICI Bank' },
  { symbol: 'HINDUNILVR.NS', name: 'HUL' },
  { symbol: 'SBIN.NS', name: 'SBI' },
  { symbol: 'BHARTIARTL.NS', name: 'Bharti Airtel' },
  { symbol: 'ITC.NS', name: 'ITC' },
  { symbol: 'KOTAKBANK.NS', name: 'Kotak Bank' },
  { symbol: 'LT.NS', name: 'L&T' },
  { symbol: 'AXISBANK.NS', name: 'Axis Bank' },
  { symbol: 'BAJFINANCE.NS', name: 'Bajaj Finance' },
  { symbol: 'ASIANPAINT.NS', name: 'Asian Paints' },
  { symbol: 'MARUTI.NS', name: 'Maruti' },
  { symbol: 'HCLTECH.NS', name: 'HCL Tech' },
  { symbol: 'TITAN.NS', name: 'Titan' },
  { symbol: 'SUNPHARMA.NS', name: 'Sun Pharma' },
  { symbol: 'WIPRO.NS', name: 'Wipro' },
  { symbol: 'TATAMOTORS.NS', name: 'Tata Motors' },
  { symbol: 'ADANIENT.NS', name: 'Adani Enterprises' },
  { symbol: 'TATASTEEL.NS', name: 'Tata Steel' },
  { symbol: 'NTPC.NS', name: 'NTPC' },
  { symbol: 'ONGC.NS', name: 'ONGC' },
  { symbol: 'POWERGRID.NS', name: 'Power Grid' },
  { symbol: 'COALINDIA.NS', name: 'Coal India' },
  { symbol: 'ZOMATO.NS', name: 'Zomato' },
  { symbol: 'PAYTM.NS', name: 'Paytm' },
  { symbol: 'IRCTC.NS', name: 'IRCTC' },
  { symbol: 'LICI.NS', name: 'LIC' }
];

// US General market news RSS feeds
const US_MARKET_NEWS_FEEDS = [
  { url: 'https://finance.yahoo.com/news/rssindex', source: 'Yahoo Finance', symbol: 'MARKET' },
  { url: 'https://news.google.com/rss/search?q=stock+market+today&hl=en-US&gl=US&ceid=US:en', source: 'Google News', symbol: 'MARKET' },
  { url: 'https://news.google.com/rss/search?q=fed+interest+rates+economy&hl=en-US&gl=US&ceid=US:en', source: 'Economic News', symbol: 'ECONOMY' },
  { url: 'https://news.google.com/rss/search?q=S%26P+500+dow+jones+nasdaq&hl=en-US&gl=US&ceid=US:en', source: 'Market Indices', symbol: 'INDICES' }
];

// Indian General market news RSS feeds
const IN_MARKET_NEWS_FEEDS = [
  { url: 'https://news.google.com/rss/search?q=indian+stock+market+today&hl=en-IN&gl=IN&ceid=IN:en', source: 'Google News', symbol: 'MARKET' },
  { url: 'https://news.google.com/rss/search?q=nifty+sensex+today&hl=en-IN&gl=IN&ceid=IN:en', source: 'Market Indices', symbol: 'INDICES' },
  { url: 'https://news.google.com/rss/search?q=RBI+interest+rate+india&hl=en-IN&gl=IN&ceid=IN:en', source: 'Economic News', symbol: 'ECONOMY' },
  { url: 'https://news.google.com/rss/search?q=BSE+NSE+market+news&hl=en-IN&gl=IN&ceid=IN:en', source: 'BSE/NSE News', symbol: 'MARKET' }
];

function getStocksForMarket(market: string): { symbol: string; name: string }[] {
  return market === 'IN' ? IN_LARGE_CAP_STOCKS : US_LARGE_CAP_STOCKS;
}

function getMarketNewsFeeds(market: string): { url: string; source: string; symbol: string }[] {
  return market === 'IN' ? IN_MARKET_NEWS_FEEDS : US_MARKET_NEWS_FEEDS;
}

/**
 * Classify news article type based on keywords - returns internal type ID
 */
function classifyArticleType(title: string, description: string, isMarketNews: boolean = false): string {
  const text = `${title} ${description}`.toLowerCase();
  
  // If from an explicit market feed, force market type
  if (isMarketNews) {
    return 'market';
  }
  
  // Check specific categories FIRST (before broad market keywords)
  // This prevents articles like "Apple earnings beat amid rally" from being swallowed into "market"
  
  // Price Target
  if (text.includes('price target') || text.includes('pt ') || text.includes('target price') || 
      text.includes('sets target') || text.includes('raises target') || text.includes('lowers target') ||
      text.includes('maintains target') || text.includes('boosts target') || text.includes('cuts target') ||
      text.includes('target raised') || text.includes('target lowered') || text.includes('target cut') ||
      text.includes('new target') || text.includes('price objective')) {
    return 'price_target';
  }
  
  // Rating/Upgrade/Downgrade
  if (text.includes('upgrade') || text.includes('downgrade') || text.includes('rating') || 
      text.includes('analyst') || text.includes('outperform') || text.includes('underperform') ||
      text.includes('buy rating') || text.includes('sell rating') || text.includes('hold rating') ||
      text.includes('overweight') || text.includes('underweight') || text.includes('neutral rating') ||
      text.includes('equal-weight') || text.includes('market perform') || text.includes('sector perform') ||
      text.includes('initiated') || text.includes('reiterate') ||
      text.includes('maintains buy') || text.includes('maintains sell') ||
      text.includes('raises to buy') || text.includes('cuts to sell')) {
    return 'upgrade_downgrade';
  }
  
  // Earnings
  if (text.includes('earnings') || text.includes(' eps') || text.includes('revenue') || 
      text.includes('quarterly') || text.includes('q1 ') || text.includes('q2 ') || 
      text.includes('q3 ') || text.includes('q4 ') || text.includes('beat') || 
      text.includes('miss') || text.includes('guidance') || text.includes('forecast') ||
      text.includes('profit') || text.includes('loss') || text.includes('outlook') ||
      text.includes('fiscal year') || text.includes('annual report') || text.includes('quarterly report') ||
      text.includes('earnings call')) {
    return 'earnings';
  }
  
  // Insider Trading
  if (text.includes('insider') || text.includes('ceo buy') || text.includes('cfo buy') ||
      text.includes('director buy') || text.includes('sells shares') || text.includes('buys shares') ||
      text.includes('stock purchase') || text.includes('form 4') || text.includes('sec filing') ||
      text.includes('bought shares') || text.includes('sold shares') || text.includes('insider buying') ||
      text.includes('insider selling') || text.includes('ceo buys') || text.includes('ceo sells') ||
      text.includes('director buys') || text.includes('director sells') ||
      text.includes('executive') || text.includes('stock sale')) {
    return 'insider';
  }
  
  // Dividend
  if (text.includes('dividend') || text.includes('payout') || text.includes('yield') ||
      text.includes('distribution') || text.includes('ex-div') || text.includes('ex-dividend') ||
      text.includes('dividend increase') || text.includes('dividend cut') ||
      text.includes('special dividend') || text.includes('dividend declared') ||
      text.includes('quarterly dividend')) {
    return 'dividend';
  }
  
  // Market-wide news checked LAST (Fed/RBI, economy, indices - US and India)
  // Only classify as market if no specific category matched above
  if (text.includes('fed ') || text.includes('federal reserve') || text.includes('interest rate') ||
      text.includes('inflation') || text.includes('gdp') || text.includes('jobs report') ||
      text.includes('unemployment') || text.includes('recession') || text.includes('economy') ||
      text.includes('s&p 500') || text.includes('dow jones') || text.includes('nasdaq') ||
      text.includes('market today') || text.includes('markets ') || text.includes('wall street') ||
      text.includes('rally') || text.includes('selloff') || text.includes('bull market') ||
      text.includes('bear market') || text.includes('treasury') || text.includes('bond yield') ||
      // Indian market keywords
      text.includes('nifty') || text.includes('sensex') || text.includes('bse') || text.includes('nse') ||
      text.includes('rbi') || text.includes('reserve bank') || text.includes('dalal street') ||
      text.includes('sebi') || text.includes('fii') || text.includes('dii') || text.includes('rupee')) {
    return 'market';
  }
  
  return 'general';
}

/**
 * Calculate time ago string from date
 */
function getTimeAgo(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  
  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d ago`;
  
  return date.toLocaleDateString();
}

/**
 * Fetch RSS feed via HTTPS
 */
function fetchRSS(url: string, timeout: number = 8000): Promise<string> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error('Request timeout'));
    }, timeout);

    https.get(url, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        clearTimeout(timer);
        resolve(data);
      });
    }).on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

/**
 * Parse RSS XML to JSON
 */
function parseRSS(xml: string, source: string, symbol: string, stockName: string, isMarketNews: boolean = false): NewsItem[] {
  const items: NewsItem[] = [];
  const itemRegex = /<item>(.*?)<\/item>/gs;
  const matches = xml.matchAll(itemRegex);

  for (const match of matches) {
    const itemXml = match[1];
    
    const title = itemXml.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/s)?.[1] || 
                  itemXml.match(/<title>(.*?)<\/title>/s)?.[1] || '';
    const link = itemXml.match(/<link>(.*?)<\/link>/s)?.[1] || '';
    const pubDate = itemXml.match(/<pubDate>(.*?)<\/pubDate>/s)?.[1] || '';
    const description = itemXml.match(/<description><!\[CDATA\[(.*?)\]\]><\/description>/s)?.[1] || 
                        itemXml.match(/<description>(.*?)<\/description>/s)?.[1] || '';

    if (title && link) {
      const type = classifyArticleType(title, description, isMarketNews);
      items.push({
        title: title.trim(),
        link: link.trim(),
        pubDate: pubDate.trim(),
        source,
        type,
        symbol,
        stockName,
        timeAgo: getTimeAgo(pubDate)
      });
    }
  }

  return items;
}

/**
 * Fetch news for a single stock
 */
async function fetchStockNews(stock: { symbol: string; name: string }): Promise<NewsItem[]> {
  const allNews: NewsItem[] = [];
  
  try {
    // Use Yahoo Finance RSS for now (most reliable)
    const url = `https://finance.yahoo.com/rss/headline?s=${stock.symbol}`;
    const xml = await fetchRSS(url, 5000);
    const news = parseRSS(xml, 'Yahoo Finance', stock.symbol, stock.name, false);
    allNews.push(...news);
  } catch (error) {
    // Silently fail for individual stocks
  }
  
  return allNews;
}

/**
 * Fetch general market news (non-stock specific)
 */
async function fetchMarketNews(market: string): Promise<NewsItem[]> {
  const allNews: NewsItem[] = [];
  const feeds = getMarketNewsFeeds(market);
  
  for (const feed of feeds) {
    try {
      const xml = await fetchRSS(feed.url, 5000);
      const news = parseRSS(xml, feed.source, feed.symbol, 'Market', true);
      allNews.push(...news);
    } catch (error) {
      // Silently fail for individual feeds
    }
  }
  
  return allNews;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 's-maxage=180, stale-while-revalidate=300');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Get market from query parameter (default to US)
    const market = (req.query.market as string)?.toUpperCase() === 'IN' ? 'IN' : 'US';
    
    // Fetch news from top 15 stocks in parallel (limit to reduce API load)
    const allStocks = getStocksForMarket(market);
    const stocksToFetch = allStocks.slice(0, 15);
    
    console.log(`[News] Fetching news for ${stocksToFetch.length} ${market} stocks...`);
    
    // Fetch stock-specific news and general market news in parallel
    const [stockNewsResults, marketNews] = await Promise.all([
      Promise.allSettled(stocksToFetch.map(stock => fetchStockNews(stock))),
      fetchMarketNews(market)
    ]);

    // Collect all news items
    let allNews: NewsItem[] = [...marketNews];
    stockNewsResults.forEach((result) => {
      if (result.status === 'fulfilled' && result.value) {
        allNews.push(...result.value);
      }
    });

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
    const uniqueNews = Array.from(
      new Map(allNews.map(item => [item.link, item])).values()
    );

    // Sort by date (newest first)
    uniqueNews.sort((a, b) => {
      const dateA = new Date(a.pubDate);
      const dateB = new Date(b.pubDate);
      return dateB.getTime() - dateA.getTime();
    });

    // Calculate category counts
    const categories: Record<string, number> = {
      market: 0,
      price_target: 0,
      upgrade_downgrade: 0,
      earnings: 0,
      insider: 0,
      dividend: 0,
      general: 0
    };

    uniqueNews.forEach(item => {
      if (categories[item.type] !== undefined) {
        categories[item.type]++;
      }
    });

    // Limit to 150 articles
    const limitedNews = uniqueNews.slice(0, 150);

    return res.status(200).json({ 
      news: limitedNews,
      categories,
      totalStocks: stocksToFetch.length,
      timestamp: new Date().toISOString()
    });
  } catch (error: any) {
    console.error('Market News API error:', error);
    return res.status(500).json({
      error: 'Failed to fetch market news',
      message: error.message
    });
  }
}
