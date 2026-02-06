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

// Large-cap stocks (>$100B market cap) to fetch news from
const LARGE_CAP_STOCKS = [
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

// General market news RSS feeds (non-stock specific)
const MARKET_NEWS_FEEDS = [
  { url: 'https://finance.yahoo.com/news/rssindex', source: 'Yahoo Finance', symbol: 'MARKET' },
  { url: 'https://news.google.com/rss/search?q=stock+market+today&hl=en-US&gl=US&ceid=US:en', source: 'Google News', symbol: 'MARKET' },
  { url: 'https://news.google.com/rss/search?q=fed+interest+rates+economy&hl=en-US&gl=US&ceid=US:en', source: 'Economic News', symbol: 'ECONOMY' },
  { url: 'https://news.google.com/rss/search?q=S%26P+500+dow+jones+nasdaq&hl=en-US&gl=US&ceid=US:en', source: 'Market Indices', symbol: 'INDICES' }
];

/**
 * Classify news article type based on keywords - returns internal type ID
 */
function classifyArticleType(title: string, description: string, isMarketNews: boolean = false): string {
  const text = `${title} ${description}`.toLowerCase();
  
  // Market-wide news (Fed, economy, indices)
  if (isMarketNews || text.includes('fed ') || text.includes('federal reserve') || text.includes('interest rate') ||
      text.includes('inflation') || text.includes('gdp') || text.includes('jobs report') ||
      text.includes('unemployment') || text.includes('recession') || text.includes('economy') ||
      text.includes('s&p 500') || text.includes('dow jones') || text.includes('nasdaq') ||
      text.includes('market today') || text.includes('markets ') || text.includes('wall street') ||
      text.includes('rally') || text.includes('selloff') || text.includes('bull market') ||
      text.includes('bear market') || text.includes('treasury') || text.includes('bond yield')) {
    return 'market';
  }
  
  // Price Target
  if (text.includes('price target') || text.includes('pt ') || text.includes('target price') || 
      text.includes('sets target') || text.includes('raises target') || text.includes('lowers target')) {
    return 'price_target';
  }
  
  // Rating/Upgrade/Downgrade
  if (text.includes('upgrade') || text.includes('downgrade') || text.includes('rating') || 
      text.includes('analyst') || text.includes('outperform') || text.includes('underperform') ||
      text.includes('buy rating') || text.includes('sell rating') || text.includes('hold rating') ||
      text.includes('overweight') || text.includes('underweight') || text.includes('neutral rating')) {
    return 'upgrade_downgrade';
  }
  
  // Earnings
  if (text.includes('earnings') || text.includes(' eps') || text.includes('revenue') || 
      text.includes('quarterly') || text.includes('q1 ') || text.includes('q2 ') || 
      text.includes('q3 ') || text.includes('q4 ') || text.includes('beat') || 
      text.includes('miss') || text.includes('guidance') || text.includes('forecast')) {
    return 'earnings';
  }
  
  // Insider Trading
  if (text.includes('insider') || text.includes('ceo buy') || text.includes('cfo buy') ||
      text.includes('director buy') || text.includes('sells shares') || text.includes('buys shares') ||
      text.includes('stock purchase') || text.includes('form 4') || text.includes('sec filing')) {
    return 'insider';
  }
  
  // Dividend
  if (text.includes('dividend') || text.includes('payout') || text.includes('yield') ||
      text.includes('distribution') || text.includes('ex-div')) {
    return 'dividend';
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
async function fetchMarketNews(): Promise<NewsItem[]> {
  const allNews: NewsItem[] = [];
  
  for (const feed of MARKET_NEWS_FEEDS) {
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
    // Fetch news from top 15 stocks in parallel (limit to reduce API load)
    const stocksToFetch = LARGE_CAP_STOCKS.slice(0, 15);
    
    // Fetch stock-specific news and general market news in parallel
    const [stockNewsResults, marketNews] = await Promise.all([
      Promise.allSettled(stocksToFetch.map(stock => fetchStockNews(stock))),
      fetchMarketNews()
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
