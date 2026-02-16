import type { VercelRequest, VercelResponse } from '@vercel/node';
import { handleQuote } from './_lib/handlers/stocks-quote';
import { handleSearch } from './_lib/handlers/stocks-search';
import { handleScreen } from './_lib/handlers/stocks-screen';
import { handleList } from './_lib/handlers/stocks-list';
import { handleStocksIndices } from './_lib/handlers/stocks-indices';
import { handleTechnicals } from './_lib/handlers/stocks-technicals';
import { handleDmaCrossovers } from './_lib/handlers/stocks-dma-crossovers';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const action = req.query.action as string;

  switch (action) {
    case 'quote':
      return handleQuote(req, res);
    case 'search':
      return handleSearch(req, res);
    case 'screen':
      return handleScreen(req, res);
    case 'list':
      return handleList(req, res);
    case 'indices':
      return handleStocksIndices(req, res);
    case 'technicals':
      return handleTechnicals(req, res);
    case 'dma-crossovers':
      return handleDmaCrossovers(req, res);
    default:
      return res.status(400).json({ error: `Unknown action: ${action}` });
  }
}
