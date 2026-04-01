/**
 * Lightweight local dev server for API routes.
 * Run with: npx tsx api/dev-server.ts
 * Then start Angular with: npm start (proxies /api to :3000)
 */
import http from 'http';
import { parse } from 'url';

// Load .env
import { readFileSync } from 'fs';
for (const envFile of ['.env', '.env.local']) {
  try {
    const content = readFileSync(envFile, 'utf-8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const match = trimmed.match(/^(\w+)=["']?(.+?)["']?$/);
      if (match && !process.env[match[1]]) process.env[match[1]] = match[2];
    }
  } catch {}
}

const PORT = 3000;

const server = http.createServer(async (req, res) => {
  const parsed = parse(req.url || '', true);
  const path = parsed.pathname || '';

  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-request-time, Authorization');
  if (req.method === 'OPTIONS') { res.writeHead(200); res.end(); return; }

  // Route: /api/stocks or /api/market
  if (path === '/api/stocks' || path === '/api/market') {
    try {
      // Build a mock VercelRequest/VercelResponse
      const query = parsed.query as Record<string, string>;
      let body: any = {};
      if (req.method === 'POST') {
        const chunks: Buffer[] = [];
        for await (const chunk of req) chunks.push(chunk as Buffer);
        try { body = JSON.parse(Buffer.concat(chunks).toString()); } catch {}
      }

      const mockReq: any = { method: req.method, headers: req.headers, query, body };
      const mockRes: any = {
        statusCode: 200,
        _headers: {} as Record<string, string>,
        setHeader(k: string, v: string) { this._headers[k] = v; return this; },
        status(code: number) { this.statusCode = code; return this; },
        json(data: any) {
          res.writeHead(this.statusCode, { 'Content-Type': 'application/json', ...this._headers });
          res.end(JSON.stringify(data));
          return this;
        },
        end() { res.end(); return this; },
      };

      const mod = path === '/api/market' ? await import('./market') : await import('./stocks');
      await mod.default(mockReq, mockRes);
    } catch (err: any) {
      console.error('Handler error:', err);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not found' }));
});

server.listen(PORT, () => {
  console.log(`\n  API dev server running at http://localhost:${PORT}`);
  console.log(`  SUPABASE_URL: ${process.env.SUPABASE_URL ? 'set' : 'NOT SET'}`);
  console.log(`  SUPABASE_SERVICE_ROLE_KEY: ${process.env.SUPABASE_SERVICE_ROLE_KEY ? 'set' : 'NOT SET'}\n`);
});
