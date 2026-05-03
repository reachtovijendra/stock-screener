import assert from 'node:assert/strict';
import { isRaisingStock } from './stock-performance';

const minMarketCap = 1_000_000_000;

assert.equal(isRaisingStock({
  symbol: 'GOOD',
  marketCap: 2_000_000_000,
  oneMonthChangePercent: 20,
  threeMonthChangePercent: 10,
  sixMonthChangePercent: 5,
  oneYearChangePercent: -2,
}, minMarketCap), true);

assert.equal(isRaisingStock({
  symbol: 'NEG',
  marketCap: 2_000_000_000,
  oneMonthChangePercent: -1,
  threeMonthChangePercent: -2,
  sixMonthChangePercent: -3,
  oneYearChangePercent: -4,
}, minMarketCap), false);

assert.equal(isRaisingStock({
  symbol: 'EQUAL',
  marketCap: 2_000_000_000,
  oneMonthChangePercent: 10,
  threeMonthChangePercent: 10,
  sixMonthChangePercent: 5,
  oneYearChangePercent: 0,
}, minMarketCap), false);

assert.equal(isRaisingStock({
  symbol: 'MISSING',
  marketCap: 2_000_000_000,
  oneMonthChangePercent: 10,
  threeMonthChangePercent: 5,
  sixMonthChangePercent: null,
  oneYearChangePercent: 0,
}, minMarketCap), false);

assert.equal(isRaisingStock({
  symbol: 'SMALL',
  marketCap: 500_000_000,
  oneMonthChangePercent: 20,
  threeMonthChangePercent: 10,
  sixMonthChangePercent: 5,
  oneYearChangePercent: 0,
}, minMarketCap), false);

console.log('stock-performance criteria tests passed');
