const fs = require('fs');

// Read the breakouts data
let rawData = fs.readFileSync('breakouts_data.json', 'utf8');
if (rawData.charCodeAt(0) === 0xFEFF) rawData = rawData.slice(1);
const data = JSON.parse(rawData);
const breakouts = data.breakouts;

console.log(`Total breakouts: ${breakouts.length}`);
console.log('\n=== DAY TRADE PICKS - Momentum & Volume Based ===\n');

// Group by symbol and calculate momentum score
const stockScores = new Map();
const skipSymbols = new Set(['BRK-A']);

for (const b of breakouts) {
  if (skipSymbols.has(b.symbol)) continue;
  
  if (!stockScores.has(b.symbol)) {
    stockScores.set(b.symbol, { stock: b, score: 0, signals: [] });
  }
  const entry = stockScores.get(b.symbol);
  
  let points = 0;
  
  // === TODAY'S PRICE ACTION ===
  if (b.changePercent >= 5) {
    points += 7;
    if (!entry.signals.includes('Big Mover')) entry.signals.push('Big Mover');
  } else if (b.changePercent >= 3) {
    points += 5;
    if (!entry.signals.includes('Strong Move')) entry.signals.push('Strong Move');
  } else if (b.changePercent >= 1.5) {
    points += 3;
    if (!entry.signals.includes('Good Move')) entry.signals.push('Good Move');
  } else if (b.changePercent > 0) {
    points += 1;
  }
  
  // === VOLUME ===
  if (b.relativeVolume != null) {
    if (b.relativeVolume >= 2.5) {
      points += 6;
      if (!entry.signals.includes('Massive Volume')) entry.signals.push('Massive Volume');
    } else if (b.relativeVolume >= 1.8) {
      points += 4;
      if (!entry.signals.includes('High Volume')) entry.signals.push('High Volume');
    } else if (b.relativeVolume >= 1.3) {
      points += 2;
      if (!entry.signals.includes('Above Avg Volume')) entry.signals.push('Above Avg Volume');
    }
  }
  
  // === BREAKOUT SIGNALS ===
  if (b.percentFromFiftyTwoWeekHigh != null) {
    if (b.percentFromFiftyTwoWeekHigh >= 0) {
      points += 5;
      if (!entry.signals.includes('New 52W High')) entry.signals.push('New 52W High');
    } else if (b.percentFromFiftyTwoWeekHigh >= -3) {
      points += 3;
      if (!entry.signals.includes('Near 52W High')) entry.signals.push('Near 52W High');
    }
  }
  
  // MACD bullish
  if (b.alertType === 'macd_bullish_cross' || b.alertType === 'macd_strong_bullish') {
    points += 3;
    if (!entry.signals.includes('MACD Bullish')) entry.signals.push('MACD Bullish');
  }
  
  // === RSI ===
  if (b.rsi != null) {
    if (b.rsi >= 60 && b.rsi <= 75) {
      points += 3;
      if (!entry.signals.includes('Strong RSI')) entry.signals.push('Strong RSI');
    } else if (b.rsi >= 50 && b.rsi < 60) {
      points += 1;
    }
    if (b.rsi > 80) {
      points -= 2;
      if (!entry.signals.includes('Extreme RSI')) entry.signals.push('Extreme RSI');
    }
  }
  
  // === TREND SUPPORT ===
  if (b.percentFromFiftyDayMA != null && b.percentFromFiftyDayMA > 0) points += 1;
  if (b.percentFromTwoHundredDayMA != null && b.percentFromTwoHundredDayMA > 0) points += 1;
  
  // === PENALTIES ===
  if (b.changePercent < 0) points -= 3;
  if (b.relativeVolume != null && b.relativeVolume < 0.7) points -= 2;
  if (b.alertType === 'macd_bearish_cross' || b.alertType === 'macd_strong_bearish') points -= 2;
  
  entry.score += points;
}

// Filter and sort
const ranked = Array.from(stockScores.values())
  .filter(s => {
    const validSignals = s.signals.filter(sig => sig !== 'Extreme RSI');
    return s.score >= 8 && s.stock.changePercent > 0 && validSignals.length >= 2;
  })
  .sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (b.stock.changePercent !== a.stock.changePercent) return b.stock.changePercent - a.stock.changePercent;
    return (b.stock.relativeVolume ?? 1) - (a.stock.relativeVolume ?? 1);
  });

console.log(`Qualified stocks (score >= 8, positive day, 2+ signals): ${ranked.length}`);
console.log('\n=== TOP 10 DAY TRADE PICKS ===\n');

ranked.slice(0, 10).forEach((item, index) => {
  console.log(`${index + 1}. ${item.stock.symbol} (${item.stock.name})`);
  console.log(`   Score: ${item.score}`);
  console.log(`   Signals: ${item.signals.join(', ')}`);
  console.log(`   Price: $${item.stock.price?.toFixed(2)} | Change: +${item.stock.changePercent?.toFixed(2)}%`);
  console.log(`   Volume: ${item.stock.relativeVolume?.toFixed(2) ?? 'N/A'}x avg`);
  console.log(`   RSI: ${item.stock.rsi?.toFixed(1) ?? 'N/A'}`);
  console.log(`   From 52W High: ${item.stock.percentFromFiftyTwoWeekHigh?.toFixed(1) ?? 'N/A'}%`);
  console.log('');
});

// Also show MU, WDC, STX scores
console.log('\n=== STORAGE STOCKS SCORES ===\n');
['MU', 'WDC', 'STX'].forEach(sym => {
  const item = stockScores.get(sym);
  if (item) {
    console.log(`${sym}: Score=${item.score}, Change=+${item.stock.changePercent?.toFixed(2)}%, Volume=${item.stock.relativeVolume?.toFixed(2)}x`);
    console.log(`   Signals: ${item.signals.join(', ') || 'None'}`);
    console.log(`   Qualifies: ${item.score >= 8 && item.stock.changePercent > 0 && item.signals.filter(s => s !== 'Extreme RSI').length >= 2 ? 'YES' : 'NO'}`);
    console.log('');
  } else {
    console.log(`${sym}: NOT IN DATA\n`);
  }
});
