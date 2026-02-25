const fs = require('fs');

// Read the breakouts data and remove BOM if present
let rawData = fs.readFileSync('breakouts_data.json', 'utf8');
if (rawData.charCodeAt(0) === 0xFEFF) {
  rawData = rawData.slice(1);
}
const data = JSON.parse(rawData);
const breakouts = data.breakouts;

console.log(`Total breakouts: ${breakouts.length}`);
console.log('\n=== NEW SCORING: Medium-term (1-3 months), Moderate Risk ===\n');

// Group by symbol and calculate scores - NEW LOGIC
const stockScores = new Map();

// Skip duplicates
const skipSymbols = new Set(['BRK-A']); // Keep BRK-B, skip BRK-A

for (const b of breakouts) {
  if (skipSymbols.has(b.symbol)) continue;
  
  if (!stockScores.has(b.symbol)) {
    stockScores.set(b.symbol, {
      stock: b,
      score: 0,
      signals: [],
      alerts: []
    });
  }
  
  const entry = stockScores.get(b.symbol);
  entry.alerts.push(b.alertType);
  
  let points = 0;
  
  // === TREND CONFIRMATION (Most Important) ===
  
  // Above 50 MA (0-8%) - +3 points
  if (b.percentFromFiftyDayMA != null && b.percentFromFiftyDayMA > 0 && b.percentFromFiftyDayMA <= 8) {
    points += 3;
    if (!entry.signals.includes('Above 50 MA')) entry.signals.push('Above 50 MA');
  }
  
  // Above 200 MA (0-20%) - +3 points
  if (b.percentFromTwoHundredDayMA != null && b.percentFromTwoHundredDayMA > 0 && b.percentFromTwoHundredDayMA <= 20) {
    points += 3;
    if (!entry.signals.includes('Above 200 MA')) entry.signals.push('Above 200 MA');
  }
  
  // Golden Cross - +5 points
  if (b.alertType === 'golden_cross') {
    points += 5;
    if (!entry.signals.includes('Golden Cross')) entry.signals.push('Golden Cross');
  }
  
  // === MOMENTUM ===
  
  // RSI 50-65 (ideal) - +3 points
  if (b.rsi != null && b.rsi >= 50 && b.rsi <= 65) {
    points += 3;
    if (!entry.signals.includes('Strong Momentum')) entry.signals.push('Strong Momentum');
  }
  // RSI 40-50 - +1 point
  else if (b.rsi != null && b.rsi >= 40 && b.rsi < 50) {
    points += 1;
    if (!entry.signals.includes('Building Momentum')) entry.signals.push('Building Momentum');
  }
  // RSI 30-40 (oversold bounce) - +2 points
  else if (b.rsi != null && b.rsi >= 30 && b.rsi < 40) {
    points += 2;
    if (!entry.signals.includes('Oversold Bounce')) entry.signals.push('Oversold Bounce');
  }
  
  // MACD bullish - +4 points
  if (b.alertType === 'macd_bullish_cross' || b.alertType === 'macd_strong_bullish') {
    points += 4;
    if (!entry.signals.includes('MACD Bullish')) entry.signals.push('MACD Bullish');
  }
  
  // Near 52W high (within 10%) - +2 points
  if (b.percentFromFiftyTwoWeekHigh != null && b.percentFromFiftyTwoWeekHigh >= -10) {
    points += 2;
    if (!entry.signals.includes('Near 52W High')) entry.signals.push('Near 52W High');
  }
  
  // Breakout move (>2% with volume) - +2 points
  if (b.changePercent > 2 && b.relativeVolume != null && b.relativeVolume > 1.2) {
    points += 2;
    if (!entry.signals.includes('Breakout Move')) entry.signals.push('Breakout Move');
  } else if (b.changePercent > 0) {
    points += 1;
  }
  
  // Volume surge - +2 points
  if (b.alertCategory === 'volume_breakout' && b.changePercent > 0) {
    points += 2;
    if (!entry.signals.includes('Volume Surge')) entry.signals.push('Volume Surge');
  }
  
  // === PENALTIES ===
  
  // Overbought RSI (>70) - -4 points
  if (b.rsi != null && b.rsi > 70) {
    points -= 4;
    if (!entry.signals.includes('Overbought')) entry.signals.push('Overbought');
  }
  
  // Death Cross - -5 points
  if (b.alertType === 'death_cross') {
    points -= 5;
  }
  
  // Bearish MACD - -3 points
  if (b.alertType === 'macd_bearish_cross' || b.alertType === 'macd_strong_bearish') {
    points -= 3;
  }
  
  // Too extended from 50 MA (>15%) - -2 points
  if (b.percentFromFiftyDayMA != null && b.percentFromFiftyDayMA > 15) {
    points -= 2;
  }
  
  // Below 200 MA - -2 points
  if (b.percentFromTwoHundredDayMA != null && b.percentFromTwoHundredDayMA < 0) {
    points -= 2;
  }
  
  entry.score += points;
}

// Filter and sort - NEW REQUIREMENTS
const ranked = Array.from(stockScores.values())
  .filter(s => {
    const validSignals = s.signals.filter(sig => sig !== 'Overbought');
    const above200MA = s.stock.percentFromTwoHundredDayMA != null && s.stock.percentFromTwoHundredDayMA > 0;
    return s.score >= 6 && validSignals.length >= 3 && above200MA;
  })
  .sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    
    const aSignals = a.signals.filter(s => s !== 'Overbought').length;
    const bSignals = b.signals.filter(s => s !== 'Overbought').length;
    if (bSignals !== aSignals) return bSignals - aSignals;
    
    const aRsi = a.stock.rsi ?? 50;
    const bRsi = b.stock.rsi ?? 50;
    const aIdeal = (aRsi >= 50 && aRsi <= 65) ? 1 : 0;
    const bIdeal = (bRsi >= 50 && bRsi <= 65) ? 1 : 0;
    if (bIdeal !== aIdeal) return bIdeal - aIdeal;
    
    const aVol = a.stock.relativeVolume ?? 1;
    const bVol = b.stock.relativeVolume ?? 1;
    return bVol - aVol;
  });

console.log(`Qualified stocks (score >= 6, 3+ signals, above 200 MA): ${ranked.length}`);
console.log('\n=== NEW TOP 10 PICKS ===\n');

ranked.slice(0, 10).forEach((item, index) => {
  console.log(`${index + 1}. ${item.stock.symbol} (${item.stock.companyName || item.stock.name})`);
  console.log(`   Score: ${item.score}`);
  console.log(`   Signals: ${item.signals.join(', ')}`);
  console.log(`   Price: $${item.stock.price?.toFixed(2)} | Change: ${item.stock.changePercent?.toFixed(2)}%`);
  console.log(`   RSI: ${item.stock.rsi?.toFixed(1) ?? 'N/A'}`);
  console.log(`   %From50MA: ${item.stock.percentFromFiftyDayMA?.toFixed(2) ?? 'N/A'}% | %From200MA: ${item.stock.percentFromTwoHundredDayMA?.toFixed(2) ?? 'N/A'}%`);
  console.log(`   52W High: $${item.stock.fiftyTwoWeekHigh?.toFixed(2)} (${item.stock.percentFromFiftyTwoWeekHigh?.toFixed(1)}% from high)`);
  console.log(`   Volume: ${item.stock.relativeVolume?.toFixed(2) ?? 'N/A'}x avg`);
  console.log('');
});

console.log('\n=== ALL QUALIFIED STOCKS ===\n');
ranked.forEach((item, index) => {
  const validSignals = item.signals.filter(s => s !== 'Overbought');
  console.log(`${index + 1}. ${item.stock.symbol}: Score=${item.score}, RSI=${item.stock.rsi?.toFixed(0) ?? 'N/A'}, Signals=[${validSignals.join(', ')}]`);
});
