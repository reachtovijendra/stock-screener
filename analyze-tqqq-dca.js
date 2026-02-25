/**
 * TQQQ Dollar Cost Averaging Analysis
 *
 * Simulates buying 1 share of TQQQ at the closing price on each
 * trading day from 2023-04-06 to 2025-04-02 (inclusive).
 *
 * Usage: node analyze-tqqq-dca.js
 */

const https = require('https');

const SYMBOL = 'TQQQ';
const START_DATE = '2023-04-06';
const END_DATE = '2025-04-02';

function fetchHistoricalData(symbol) {
  // Use period1/period2 (Unix timestamps) for precise date range
  const start = Math.floor(new Date(START_DATE + 'T00:00:00Z').getTime() / 1000);
  const end = Math.floor(new Date(END_DATE + 'T23:59:59Z').getTime() / 1000);
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&period1=${start}&period2=${end}`;
  console.log(`Fetching data from: ${url}\n`);

  return new Promise((resolve, reject) => {
    https.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': '*/*',
      },
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (parsed.chart && parsed.chart.result && parsed.chart.result[0]) {
            resolve(parsed.chart.result[0]);
          } else {
            reject(new Error('Unexpected API response structure'));
          }
        } catch (e) {
          reject(new Error(`Failed to parse response: ${e.message}`));
        }
      });
    }).on('error', reject);
  });
}

async function main() {
  const result = await fetchHistoricalData(SYMBOL);

  const timestamps = result.timestamp;
  const closes = result.indicators.quote[0].close;

  if (!timestamps || !closes) {
    console.error('No price data returned.');
    process.exit(1);
  }

  // Build list of valid trading days with prices
  const trades = [];
  let totalCost = 0;

  for (let i = 0; i < timestamps.length; i++) {
    if (closes[i] == null) continue;
    const date = new Date(timestamps[i] * 1000).toISOString().slice(0, 10);
    const price = closes[i];
    totalCost += price;
    trades.push({ date, price });
  }

  const totalShares = trades.length;
  const avgPrice = totalCost / totalShares;
  const lastPrice = trades[trades.length - 1].price;
  const totalValue = totalShares * lastPrice;
  const profitLoss = totalValue - totalCost;
  const profitLossPct = (profitLoss / totalCost) * 100;

  // Print summary
  console.log('='.repeat(64));
  console.log('TQQQ Daily Share Purchase Simulation');
  console.log(`Period: ${START_DATE} to ${END_DATE}`);
  console.log('Strategy: Buy 1 share at closing price each trading day');
  console.log('='.repeat(64));
  console.log('');
  console.log(`Total trading days:       ${totalShares}`);
  console.log(`Total shares accumulated: ${totalShares}`);
  console.log(`Total cost (invested):    $${totalCost.toFixed(2)}`);
  console.log(`Average buying price:     $${avgPrice.toFixed(2)}`);
  console.log('');
  console.log(`First purchase:           ${trades[0].date} @ $${trades[0].price.toFixed(2)}`);
  console.log(`Last purchase:            ${trades[trades.length - 1].date} @ $${trades[trades.length - 1].price.toFixed(2)}`);
  console.log(`Lowest price paid:        $${Math.min(...trades.map(t => t.price)).toFixed(2)}`);
  console.log(`Highest price paid:       $${Math.max(...trades.map(t => t.price)).toFixed(2)}`);
  console.log('');
  console.log('--- Portfolio Value on ' + END_DATE + ' ---');
  console.log(`Closing price:            $${lastPrice.toFixed(2)}`);
  console.log(`Portfolio value:          $${totalValue.toFixed(2)}`);
  console.log(`Total invested:           $${totalCost.toFixed(2)}`);
  console.log(`Profit / Loss:            $${profitLoss.toFixed(2)} (${profitLoss >= 0 ? '+' : ''}${profitLossPct.toFixed(2)}%)`);
  console.log('');
}

main().catch((err) => {
  console.error('Error:', err.message);
  process.exit(1);
});
