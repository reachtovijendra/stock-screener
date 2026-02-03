import type { VercelRequest, VercelResponse } from '@vercel/node';
import https from 'https';

interface NewsItem {
  title: string;
  link: string;
  pubDate: string;
  source: string;
  type: string;
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
    const sources = [
      { name: 'Yahoo Finance', url: `https://finance.yahoo.com/rss/headline?s=${symbol}` },
      { name: 'Google News', url: `https://news.google.com/rss/search?q=${symbol}+stock&hl=en-US&gl=US&ceid=US:en` }
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

    // Sort by priority: Price Target first, then by date
    const priorityOrder = ['Price Target', 'Earnings', 'Insider Trading', 'Dividend', 'M&A', 'General'];
    uniqueNews.sort((a, b) => {
      const priorityA = priorityOrder.indexOf(a.type);
      const priorityB = priorityOrder.indexOf(b.type);
      
      if (priorityA !== priorityB) {
        return priorityA - priorityB;
      }
      
      // Sort by date if same priority
      const dateA = new Date(a.pubDate);
      const dateB = new Date(b.pubDate);
      return dateB.getTime() - dateA.getTime();
    });

    // Limit to 50 articles
    const limitedNews = uniqueNews.slice(0, 50);

    return res.status(200).json({ news: limitedNews });
  } catch (error: any) {
    console.error('News API error:', error);
    return res.status(500).json({
      error: 'Failed to fetch news',
      message: error.message
    });
  }
}
