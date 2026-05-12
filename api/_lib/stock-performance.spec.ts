import assert from 'node:assert/strict';
import { isRaisingStock, selectTopMovers } from './stock-performance';

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

const movers = [
  {
    symbol: 'AAA',
    marketCap: 2_000_000_000,
    changePercent: 4.5,
    oneMonthChangePercent: 12,
    oneYearChangePercent: 45,
  },
  {
    symbol: 'BBB',
    marketCap: 2_000_000_000,
    changePercent: -6.2,
    oneMonthChangePercent: -8,
    oneYearChangePercent: 5,
  },
  {
    symbol: 'CCC',
    marketCap: 2_000_000_000,
    changePercent: 1.1,
    oneMonthChangePercent: null,
    oneYearChangePercent: -20,
  },
  {
    symbol: 'SMALL',
    marketCap: 500_000_000,
    changePercent: 20,
    oneMonthChangePercent: 30,
    oneYearChangePercent: 80,
  },
];

assert.deepEqual(
  selectTopMovers(movers, 'gainers', '1d', minMarketCap).map(stock => stock.symbol),
  ['AAA', 'CCC', 'BBB']
);

assert.deepEqual(
  selectTopMovers(movers, 'losers', '1d', minMarketCap).map(stock => stock.symbol),
  ['BBB', 'CCC', 'AAA']
);

assert.deepEqual(
  selectTopMovers(movers, 'gainers', '1m', minMarketCap).map(stock => stock.symbol),
  ['AAA', 'BBB']
);

assert.deepEqual(
  selectTopMovers(movers, 'losers', '1y', minMarketCap).map(stock => stock.symbol),
  ['CCC', 'BBB', 'AAA']
);

console.log('stock-performance criteria tests passed');
