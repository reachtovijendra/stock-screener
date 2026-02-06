import type { VercelRequest, VercelResponse } from '@vercel/node';
import https from 'https';

interface NewsItem {
  title: string;
  link: string;
  pubDate: string;
  source: string;
  type: string;
  timeAgo?: string;
}

/**
 * Classify news article type based on keywords
 */
function classifyArticleType(title: string, description: string): string {
  const text = `${title} ${description}`.toLowerCase();
  
  if (text.includes('price target') || text.includes('pt ') || text.includes('target price') || text.includes('analyst') || text.includes('rating') || text.includes('upgrade') || text.includes('downgrade')) {
    return 'Price Target';
  }
  if (text.includes('earnings') || text.includes('eps') || text.includes('revenue') || text.includes('quarterly') || text.includes('q1') || text.includes('q2') || text.includes('q3') || text.includes('q4')) {
    return 'Earnings';
  }
  if (text.includes('insider') || text.includes('ceo') || text.includes('cfo') || text.includes('buys') || text.includes('sells') || text.includes('acquires') || text.includes('stake')) {
    return 'Insider Trading';
  }
  if (text.includes('dividend') || text.includes('payout')) {
    return 'Dividend';
  }
  if (text.includes('merger') || text.includes('acquisition') || text.includes('m&a')) {
    return 'M&A';
  }
  
  return 'General';
}

/**
 * Fetch RSS feed via HTTPS
 */
function fetchRSS(url: string, timeout: number = 10000): Promise<string> {
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
 * Calculate relative time string
 */
function getRelativeTime(dateString: string): string {
  try {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
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
 * Parse RSS XML to JSON
 */
function parseRSS(xml: string, source: string): NewsItem[] {
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
      const type = classifyArticleType(title, description);
      items.push({
        title: title.trim(),
        link: link.trim(),
        pubDate: pubDate.trim(),
        source,
        type
      });
    }
  }

  return items;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { symbol } = req.query;

    if (!symbol || typeof symbol !== 'string') {
      return res.status(400).json({ error: 'Symbol is required' });
    }

    const allNews: NewsItem[] = [];
    const encodedSymbol = encodeURIComponent(symbol as string);
    const sources = [
      { name: 'Yahoo Finance', url: `https://feeds.finance.yahoo.com/rss/2.0/headline?s=${encodedSymbol}&region=US&lang=en-US` },
      { name: 'Google News', url: `https://news.google.com/rss/search?q=${encodedSymbol}+stock&hl=en-US&gl=US&ceid=US:en` },
      { name: 'Benzinga', url: `https://news.google.com/rss/search?q=${encodedSymbol}+site:benzinga.com&hl=en-US&gl=US&ceid=US:en` },
      { name: 'Seeking Alpha', url: `https://news.google.com/rss/search?q=${encodedSymbol}+site:seekingalpha.com&hl=en-US&gl=US&ceid=US:en` },
      { name: 'Investing.com', url: `https://news.google.com/rss/search?q=${encodedSymbol}+site:investing.com&hl=en-US&gl=US&ceid=US:en` },
      { name: 'MarketWatch', url: `https://news.google.com/rss/search?q=${encodedSymbol}+site:marketwatch.com&hl=en-US&gl=US&ceid=US:en` }
    ];

    // Fetch from all sources in parallel with timeout
    const results = await Promise.allSettled(
      sources.map(async (source) => {
        try {
          const xml = await fetchRSS(source.url, 5000);
          return parseRSS(xml, source.name);
        } catch (error) {
          console.error(`Error fetching from ${source.name}:`, error);
          return [];
        }
      })
    );

    // Collect successful results
    results.forEach((result) => {
      if (result.status === 'fulfilled' && result.value) {
        allNews.push(...result.value);
      }
    });

    // Remove duplicates by URL
    const uniqueNews = Array.from(
      new Map(allNews.map(item => [item.link, item])).values()
    );

    // Filter out articles older than 7 days
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const recentNews = uniqueNews.filter(item => {
      try {
        return new Date(item.pubDate) >= sevenDaysAgo;
      } catch {
        return false;
      }
    });

    // Sort by date first (newest first), then by priority for same-day articles
    const priorityOrder = ['Price Target', 'Earnings', 'Insider Trading', 'Dividend', 'M&A', 'General'];
    recentNews.sort((a, b) => {
      const dateA = new Date(a.pubDate).getTime();
      const dateB = new Date(b.pubDate).getTime();
      // Primary sort: newest first
      if (Math.abs(dateB - dateA) > 86400000) { // More than 1 day apart
        return dateB - dateA;
      }
      // Within same day - sort by priority
      const priorityA = priorityOrder.indexOf(a.type);
      const priorityB = priorityOrder.indexOf(b.type);
      if (priorityA !== priorityB) {
        return priorityA - priorityB;
      }
      return dateB - dateA;
    });

    // Add timeAgo to each article
    recentNews.forEach(item => {
      item.timeAgo = getRelativeTime(item.pubDate);
    });

    // Limit to 30 articles
    const limitedNews = recentNews.slice(0, 30);

    return res.status(200).json({ news: limitedNews });
  } catch (error: any) {
    console.error('News API error:', error);
    return res.status(500).json({
      error: 'Failed to fetch news',
      message: error.message
    });
  }
}
