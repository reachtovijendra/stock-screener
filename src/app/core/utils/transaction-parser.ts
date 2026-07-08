/**
 * Brokerage transaction CSV parser + holdings/lot calculator for the Profit
 * Maximizer page. Runs entirely client-side (transaction data never leaves the
 * browser). Handles common exports (Robinhood, Fidelity, and generic CSVs) via
 * header-alias detection, then reconstructs current holdings with FIFO lots so
 * short-term vs long-term (held > 1 year) share counts can be derived.
 */

export type TxnAction = 'buy' | 'sell';

export interface BrokerTransaction {
  symbol: string;
  date: string;        // YYYY-MM-DD
  action: TxnAction;
  quantity: number;    // positive share count
  price: number | null;
}

export interface HoldingLot {
  date: string;        // YYYY-MM-DD (purchase date)
  quantity: number;
  price: number | null;
}

export interface Holding {
  symbol: string;
  totalShares: number;
  longTermShares: number;   // shares held > 1 year as of `asOf`
  shortTermShares: number;  // shares held <= 1 year
  /** Date the newest remaining lot crosses 1 year — after this the whole position is long-term. */
  allLongTermDate: string | null;
  allLongTerm: boolean;     // true if every remaining share is already long-term
  costBasis: number | null; // sum(qty * price) of remaining lots (null if any price missing)
  longTermCostBasis: number | null;  // cost basis of the long-term lots
  shortTermCostBasis: number | null; // cost basis of the short-term lots
  avgCost: number | null;
  lots: HoldingLot[];
}

export interface ParseResult {
  transactions: BrokerTransaction[];
  broker: string;           // best-guess source ('Robinhood' | 'Fidelity' | 'Generic CSV')
  parsedRows: number;       // buy/sell rows understood
  skippedRows: number;      // rows ignored (dividends, transfers, options, headers, blanks)
  symbols: number;          // distinct symbols
  error?: string;
}

// ---------------------------------------------------------------------------
// CSV tokeniser (handles quoted fields containing commas / newlines)
// ---------------------------------------------------------------------------

export function parseCsvRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  const pushField = () => { row.push(field); field = ''; };
  const pushRow = () => { rows.push(row); row = []; };

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      pushField();
    } else if (c === '\n') {
      pushField(); pushRow();
    } else if (c === '\r') {
      // ignore; handled by \n
    } else {
      field += c;
    }
  }
  if (field.length > 0 || row.length > 0) { pushField(); pushRow(); }
  return rows.filter(r => r.some(cell => cell.trim() !== ''));
}

// ---------------------------------------------------------------------------
// Header mapping
// ---------------------------------------------------------------------------

const ALIASES = {
  symbol: ['symbol', 'instrument', 'ticker', 'symbol/cusip'],
  date: ['activity date', 'run date', 'trade date', 'date', 'process date', 'settle date'],
  action: ['trans code', 'action', 'transaction type', 'type', 'activity'],
  description: ['description'],
  quantity: ['quantity', 'shares', 'qty', 'quantity (shares)'],
  price: ['price', 'price ($)', 'price usd', 'average price'],
};

interface ColumnMap {
  symbol: number;
  date: number;
  action: number;
  description: number;
  quantity: number;
  price: number;
}

function findHeaderRow(rows: string[][]): number {
  for (let i = 0; i < Math.min(rows.length, 25); i++) {
    const cells = rows[i].map(c => c.trim().toLowerCase());
    const hasQty = cells.some(c => ALIASES.quantity.includes(c));
    const hasSym = cells.some(c => ALIASES.symbol.includes(c));
    if (hasQty && hasSym) return i;
  }
  return -1;
}

function mapColumns(header: string[]): ColumnMap {
  const cells = header.map(c => c.trim().toLowerCase());
  const idx = (aliases: string[]) => cells.findIndex(c => aliases.includes(c));
  return {
    symbol: idx(ALIASES.symbol),
    date: idx(ALIASES.date),
    action: idx(ALIASES.action),
    description: idx(ALIASES.description),
    quantity: idx(ALIASES.quantity),
    price: idx(ALIASES.price),
  };
}

function guessBroker(header: string[]): string {
  const h = header.map(c => c.trim().toLowerCase());
  if (h.includes('trans code') && h.includes('instrument')) return 'Robinhood';
  if (h.includes('run date') || h.includes('price ($)')) return 'Fidelity';
  return 'Generic CSV';
}

// ---------------------------------------------------------------------------
// Value parsing
// ---------------------------------------------------------------------------

function parseNumber(raw: string | undefined): number | null {
  if (raw == null) return null;
  let s = raw.trim();
  if (!s) return null;
  const neg = /^\(.*\)$/.test(s);
  s = s.replace(/[()$,\s]/g, '');
  if (s === '' || s === '-') return null;
  const n = Number(s);
  if (!isFinite(n)) return null;
  return neg ? -n : n;
}

/** Normalise a variety of date strings to YYYY-MM-DD; null if unparseable. */
export function parseDate(raw: string | undefined): string | null {
  if (!raw) return null;
  const s = raw.trim();
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const mdy = s.match(/^(\d{1,2})[/\-](\d{1,2})[/\-](\d{2,4})/);
  if (mdy) {
    let [, m, d, y] = mdy;
    if (y.length === 2) y = (Number(y) >= 70 ? '19' : '20') + y;
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  const t = Date.parse(s);
  if (!isNaN(t)) return new Date(t).toISOString().slice(0, 10);
  return null;
}

const OPTION_CODES = /\b(bto|sto|btc|stc|otc|oexp|option)\b/;

function classify(actionText: string, qty: number): TxnAction | null {
  const t = actionText.toLowerCase();
  if (OPTION_CODES.test(t)) return null; // skip options activity
  if (/\b(sell|sold|sale)\b/.test(t)) return 'sell';
  if (/\b(buy|bought|purchase|reinvest(ment)?)\b/.test(t)) return 'buy';
  // Fallback on signed quantity when the action text is unhelpful.
  if (qty < 0) return 'sell';
  if (qty > 0) return 'buy';
  return null;
}

function validSymbol(raw: string | undefined): string | null {
  if (!raw) return null;
  const s = raw.trim().toUpperCase();
  if (!/^[A-Z][A-Z0-9.\-]{0,9}$/.test(s)) return null; // reject blanks, options, descriptions
  return s;
}

// ---------------------------------------------------------------------------
// Parse
// ---------------------------------------------------------------------------

export function parseTransactionsCsv(text: string): ParseResult {
  const rows = parseCsvRows(text);
  if (rows.length === 0) {
    return { transactions: [], broker: 'Generic CSV', parsedRows: 0, skippedRows: 0, symbols: 0, error: 'The file is empty.' };
  }

  const headerIdx = findHeaderRow(rows);
  if (headerIdx < 0) {
    return { transactions: [], broker: 'Generic CSV', parsedRows: 0, skippedRows: rows.length, symbols: 0,
      error: 'Could not find a transactions header (needs Symbol/Instrument and Quantity columns).' };
  }

  const header = rows[headerIdx];
  const col = mapColumns(header);
  const broker = guessBroker(header);
  const transactions: BrokerTransaction[] = [];
  let skipped = 0;

  for (let i = headerIdx + 1; i < rows.length; i++) {
    const r = rows[i];
    const symbol = validSymbol(r[col.symbol]);
    const date = parseDate(r[col.date]);
    const qtyRaw = parseNumber(r[col.quantity]);
    const actionText = [r[col.action], r[col.description]].filter(Boolean).join(' ');

    if (!symbol || !date || qtyRaw == null || qtyRaw === 0) { skipped++; continue; }

    const action = classify(actionText, qtyRaw);
    if (!action) { skipped++; continue; }

    transactions.push({
      symbol,
      date,
      action,
      quantity: Math.abs(qtyRaw),
      price: col.price >= 0 ? parseNumber(r[col.price]) : null,
    });
  }

  const symbols = new Set(transactions.map(t => t.symbol)).size;
  return { transactions, broker, parsedRows: transactions.length, skippedRows: skipped, symbols };
}

// ---------------------------------------------------------------------------
// Holdings (FIFO lots)
// ---------------------------------------------------------------------------

function round(n: number, dp = 6): number {
  const f = Math.pow(10, dp);
  return Math.round(n * f) / f;
}

/** Returns YYYY-MM-DD shifted by `years` (calendar year add). */
export function shiftYear(isoDate: string, years: number): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  return `${y + years}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

export function computeHoldings(transactions: BrokerTransaction[], asOf: string): Holding[] {
  const bySymbol = new Map<string, BrokerTransaction[]>();
  for (const t of transactions) {
    if (!bySymbol.has(t.symbol)) bySymbol.set(t.symbol, []);
    bySymbol.get(t.symbol)!.push(t);
  }

  const oneYearAgo = shiftYear(asOf, -1); // lots on/before this date are long-term
  const holdings: Holding[] = [];

  for (const [symbol, txns] of bySymbol) {
    // Sort by date ascending; on the SAME date process buys before sells so
    // shares bought that day are available to sell that day. Brokerage exports
    // are often newest-first and may list a same-day sell above its buy, which
    // would otherwise drop the un-fillable portion and leave phantom shares.
    const rank = (t: BrokerTransaction) => (t.action === 'buy' ? 0 : 1);
    const ordered = [...txns].sort((a, b) => a.date.localeCompare(b.date) || rank(a) - rank(b));
    const lots: HoldingLot[] = [];

    for (const t of ordered) {
      if (t.action === 'buy') {
        lots.push({ date: t.date, quantity: t.quantity, price: t.price });
      } else {
        // FIFO: consume oldest lots first.
        let remaining = t.quantity;
        while (remaining > 1e-9 && lots.length > 0) {
          const lot = lots[0];
          if (lot.quantity <= remaining + 1e-9) {
            remaining -= lot.quantity;
            lots.shift();
          } else {
            lot.quantity = round(lot.quantity - remaining);
            remaining = 0;
          }
        }
      }
    }

    const remainingLots = lots.filter(l => l.quantity > 1e-9);
    const totalShares = round(remainingLots.reduce((s, l) => s + l.quantity, 0));
    // Drop fully-sold positions and sub-0.0001-share "dust" left by fractional
    // buys/sells that don't net to exactly zero (broker per-trade rounding).
    if (totalShares < 1e-4) continue;

    const longTermShares = round(
      remainingLots.filter(l => l.date <= oneYearAgo).reduce((s, l) => s + l.quantity, 0)
    );
    const shortTermShares = round(totalShares - longTermShares);

    const newestLotDate = remainingLots.reduce((max, l) => (l.date > max ? l.date : max), remainingLots[0].date);
    const allLongTermDate = shiftYear(newestLotDate, 1);
    const allLongTerm = shortTermShares <= 1e-9;

    const costOf = (ls: HoldingLot[]): number | null =>
      ls.every(l => l.price != null)
        ? round(ls.reduce((s, l) => s + l.quantity * (l.price as number), 0), 2)
        : null;

    const ltLots = remainingLots.filter(l => l.date <= oneYearAgo);
    const stLots = remainingLots.filter(l => l.date > oneYearAgo);
    const costBasis = costOf(remainingLots);
    const longTermCostBasis = costOf(ltLots);
    const shortTermCostBasis = costOf(stLots);
    const avgCost = costBasis != null && totalShares > 0 ? round(costBasis / totalShares, 4) : null;

    holdings.push({
      symbol, totalShares, longTermShares, shortTermShares,
      allLongTermDate: allLongTerm ? null : allLongTermDate,
      allLongTerm, costBasis, longTermCostBasis, shortTermCostBasis, avgCost,
      lots: remainingLots,
    });
  }

  return holdings.sort((a, b) => a.symbol.localeCompare(b.symbol));
}
