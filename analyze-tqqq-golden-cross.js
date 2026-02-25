/**
 * TQQQ Golden Cross Analysis
 *
 * Fetches 5 years of daily TQQQ price data from Yahoo Finance,
 * computes rolling 50-day and 200-day SMAs, and identifies all
 * "golden cross" dates (50 DMA crosses above 200 DMA) within
 * the last 3 calendar years.
 *
 * Usage: node analyze-tqqq-golden-cross.js
 */

const https = require('https');

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const SYMBOL = 'TQQQ';
const RANGE = '5y';           // 5 years to ensure 200-SMA is valid 3 years ago
const INTERVAL = '1d';
const THREE_YEARS_MS = 3 * 365.25 * 24 * 60 * 60 * 1000;

// ---------------------------------------------------------------------------
// Fetch historical data from Yahoo Finance
// ---------------------------------------------------------------------------

function fetchHistoricalData(symbol) {
  return new Promise((resolve, reject) => {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=${INTERVAL}&range=${RANGE}`;
    console.log(`Fetching data from: ${url}\n`);

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

// ---------------------------------------------------------------------------
// Calculate rolling SMA for every day in the series
// ---------------------------------------------------------------------------

function rollingsSMA(closes, period) {
  const sma = new Array(closes.length).fill(null);
  for (let i = period - 1; i < closes.length; i++) {
    let sum = 0;
    for (let j = i - period + 1; j <= i; j++) {
      sum += closes[j];
    }
    sma[i] = Math.round((sum / period) * 100) / 100;
  }
  return sma;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const result = await fetchHistoricalData(SYMBOL);

  const timestamps = result.timestamp;
  const quote = result.indicators.quote[0];
  const closes = quote.close;

  if (!timestamps || !closes) {
    console.error('No price data returned.');
    process.exit(1);
  }

  // Filter out null closes (non-trading days / data gaps)
  const validDays = [];
  for (let i = 0; i < timestamps.length; i++) {
    if (closes[i] != null) {
      validDays.push({ timestamp: timestamps[i], close: closes[i] });
    }
  }

  console.log(`Total valid trading days fetched: ${validDays.length}`);

  const allCloses = validDays.map(d => d.close);
  const sma50 = rollingsSMA(allCloses, 50);
  const sma200 = rollingsSMA(allCloses, 200);

  // Determine the 3-year cutoff
  const now = Date.now();
  const threeYearsAgo = now - THREE_YEARS_MS;

  // Find golden crosses: 50 DMA crosses above 200 DMA
  const goldenCrosses = [];
  for (let i = 1; i < validDays.length; i++) {
    if (sma50[i] == null || sma200[i] == null || sma50[i - 1] == null || sma200[i - 1] == null) {
      continue;
    }

    const dateMs = validDays[i].timestamp * 1000;
    if (dateMs < threeYearsAgo) continue;

    const prevBelow = sma50[i - 1] <= sma200[i - 1];
    const nowAbove = sma50[i] > sma200[i];

    if (prevBelow && nowAbove) {
      goldenCrosses.push({
        date: new Date(dateMs),
        sma50: sma50[i],
        sma200: sma200[i],
        close: validDays[i].close,
      });
    }
  }

  // Print results
  console.log('');
  console.log('='.repeat(72));
  console.log(`TQQQ Golden Cross Dates (50 DMA crossed above 200 DMA)`);
  console.log(`Analysis period: ${new Date(threeYearsAgo).toISOString().slice(0, 10)} to ${new Date(now).toISOString().slice(0, 10)}`);
  console.log('='.repeat(72));
  console.log('');

  if (goldenCrosses.length === 0) {
    console.log('No golden cross events found in the last 3 years.');
  } else {
    console.log(
      padRight('Date', 16) +
      padRight('50 DMA', 14) +
      padRight('200 DMA', 14) +
      padRight('Close', 14)
    );
    console.log('-'.repeat(58));

    for (const gc of goldenCrosses) {
      const dateStr = gc.date.toISOString().slice(0, 10);
      console.log(
        padRight(dateStr, 16) +
        padRight(`$${gc.sma50.toFixed(2)}`, 14) +
        padRight(`$${gc.sma200.toFixed(2)}`, 14) +
        padRight(`$${gc.close.toFixed(2)}`, 14)
      );
    }

    console.log('');
    console.log(`Total golden cross events: ${goldenCrosses.length}`);
  }

  console.log('');
}

function padRight(str, len) {
  return str.length >= len ? str : str + ' '.repeat(len - str.length);
}

main().catch((err) => {
  console.error('Error:', err.message);
  process.exit(1);
});
