/**
 * Local development server that runs the Vercel API handlers directly.
 * Usage: npx ts-node --project api/tsconfig.json server-local.ts
 */

import express from 'express';
import cors from 'cors';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import type { IncomingMessage, ServerResponse } from 'http';
import stocksHandler from './api/stocks';
import marketHandler from './api/market';

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());

/**
 * Adapt Express req/res to look enough like VercelRequest/VercelResponse
 * so the existing handlers work unchanged.
 */
function adaptToVercel(req: express.Request, res: express.Response): [VercelRequest, VercelResponse] {
  // VercelRequest extends IncomingMessage and adds query/body
  const vReq = req as unknown as VercelRequest;
  // VercelResponse extends ServerResponse and adds status/json/send/setHeader
  const vRes = res as unknown as VercelResponse;
  return [vReq, vRes];
}

// Route /api/stocks (GET and POST) to the stocks handler
app.all('/api/stocks', async (req, res) => {
  const [vReq, vRes] = adaptToVercel(req, res);
  try {
    await stocksHandler(vReq, vRes);
  } catch (error: any) {
    console.error('Stocks handler error:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: error.message });
    }
  }
});

// Route /api/market to the market handler
app.all('/api/market', async (req, res) => {
  const [vReq, vRes] = adaptToVercel(req, res);
  try {
    await marketHandler(vReq, vRes);
  } catch (error: any) {
    console.error('Market handler error:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: error.message });
    }
  }
});

app.listen(PORT, () => {
  console.log(`\n🚀 Stock Screener API running at http://localhost:${PORT}`);
  console.log(`\nRoutes:`);
  console.log(`  /api/stocks?action=quote&symbol=AAPL`);
  console.log(`  /api/stocks?action=search&q=apple`);
  console.log(`  /api/stocks?action=screen (POST)`);
  console.log(`  /api/stocks?action=list&market=US`);
  console.log(`  /api/stocks?action=indices&market=US`);
  console.log(`  /api/stocks?action=technicals (POST)`);
  console.log(`  /api/stocks?action=dma-crossovers&symbol=SPY`);
  console.log(`  /api/market?action=indices&market=US`);
  console.log(`  /api/market?action=news&market=US`);
  console.log(`  /api/market?action=breakouts&market=US`);
  console.log(`\nPress Ctrl+C to stop\n`);
});
