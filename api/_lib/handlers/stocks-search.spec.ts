import assert from 'node:assert/strict';
import { parseExactSymbolSearchQuery, MAX_EXACT_SYMBOL_SEARCH } from './stocks-search';

const allowedSymbols = Array.from({ length: MAX_EXACT_SYMBOL_SEARCH }, (_, index) => `SYM${index + 1}`);
assert.deepEqual(parseExactSymbolSearchQuery(allowedSymbols.join(',')), allowedSymbols);

assert.throws(
  () => parseExactSymbolSearchQuery([...allowedSymbols, 'OVER'].join(',')),
  error => {
    assert.equal((error as Error).message, `Search supports up to ${MAX_EXACT_SYMBOL_SEARCH} exact symbols per request`);
    return true;
  }
);

console.log('stocks-search exact symbol limit tests passed');
