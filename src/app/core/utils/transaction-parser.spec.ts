import { parseTransactionsCsv, computeHoldings, parseDate, shiftYear } from './transaction-parser';

describe('transaction-parser', () => {
  it('parses a Robinhood-style export and skips non-trades', () => {
    const csv = [
      'Activity Date,Process Date,Settle Date,Instrument,Description,Trans Code,Quantity,Price,Amount',
      '1/10/2024,1/10/2024,1/12/2024,AAPL,Apple,Buy,10,$100.00,-$1000.00',
      '6/1/2025,6/1/2025,6/3/2025,AAPL,Apple,Buy,5,$120.00,-$600.00',
      '6/15/2025,6/15/2025,6/17/2025,AAPL,Apple,Sell,3,$130.00,$390.00',
      '6/20/2025,6/20/2025,6/20/2025,AAPL,Apple Cash Dividend,CDIV,0,,$5.00',
    ].join('\n');

    const res = parseTransactionsCsv(csv);
    expect(res.broker).toBe('Robinhood');
    expect(res.parsedRows).toBe(3);
    expect(res.skippedRows).toBe(1); // dividend
    expect(res.symbols).toBe(1);

    const holdings = computeHoldings(res.transactions, '2026-01-01');
    expect(holdings.length).toBe(1);
    const h = holdings[0];
    expect(h.symbol).toBe('AAPL');
    // FIFO: sell 3 consumes the oldest lot (10 -> 7); remaining 7 @2024 + 5 @2025 = 12
    expect(h.totalShares).toBe(12);
    expect(h.longTermShares).toBe(7);   // 2024-01-10 lot (> 1 yr before 2026-01-01)
    expect(h.shortTermShares).toBe(5);  // 2025-06-01 lot
    expect(h.allLongTerm).toBeFalse();
    expect(h.allLongTermDate).toBe('2026-06-01'); // newest lot + 1 year
    expect(h.costBasis).toBe(7 * 100 + 5 * 120);
  });

  it('parses a Fidelity-style export with signed quantities', () => {
    const csv = [
      'Run Date,Action,Symbol,Description,Type,Quantity,Price ($),Amount ($),Settlement Date',
      '03/15/2025,YOU BOUGHT,MSFT,MICROSOFT CORP,Cash,4,300,-1200,03/17/2025',
      '04/01/2025,YOU SOLD,MSFT,MICROSOFT CORP,Cash,-1,320,320,04/03/2025',
    ].join('\n');

    const res = parseTransactionsCsv(csv);
    expect(res.broker).toBe('Fidelity');
    expect(res.parsedRows).toBe(2);

    const holdings = computeHoldings(res.transactions, '2026-01-01');
    expect(holdings.length).toBe(1);
    const h = holdings[0];
    expect(h.totalShares).toBe(3);
    expect(h.longTermShares).toBe(0);
    expect(h.shortTermShares).toBe(3);
    expect(h.allLongTermDate).toBe('2026-03-15');
  });

  it('drops a fully-sold position from current holdings', () => {
    const csv = [
      'Date,Symbol,Trans Code,Quantity,Price',
      '1/2/2025,TSLA,Buy,5,200',
      '2/2/2025,TSLA,Sell,5,220',
    ].join('\n');
    const holdings = computeHoldings(parseTransactionsCsv(csv).transactions, '2026-01-01');
    expect(holdings.length).toBe(0);
  });

  it('marks a position all-long-term once the newest lot passes a year', () => {
    const csv = [
      'Date,Symbol,Trans Code,Quantity,Price',
      '1/2/2023,NVDA,Buy,3,100',
      '1/2/2024,NVDA,Buy,2,400',
    ].join('\n');
    const holdings = computeHoldings(parseTransactionsCsv(csv).transactions, '2026-01-01');
    expect(holdings[0].allLongTerm).toBeTrue();
    expect(holdings[0].allLongTermDate).toBeNull();
    expect(holdings[0].longTermShares).toBe(5);
  });

  it('handles a newest-first file where a same-day sell is listed before its buy (nets to zero)', () => {
    // Mirrors a real Robinhood BBAI export (newest row first).
    const csv = [
      'Activity Date,Instrument,Trans Code,Quantity,Price',
      '6/27/2025,BBAI,Sell,35,5.70',
      '6/26/2025,BBAI,Sell,40,5.60',
      '6/13/2025,BBAI,Buy,25,3.75',
      '6/5/2025,BBAI,Buy,50,3.78',
      '12/27/2024,BBAI,Sell,200,4.10',
      '12/27/2024,BBAI,Buy,100,4.38',
      '12/9/2024,BBAI,Buy,100,3.78',
    ].join('\n');
    const holdings = computeHoldings(parseTransactionsCsv(csv).transactions, '2026-07-07');
    expect(holdings.length).toBe(0); // 275 bought, 275 sold => no position
  });

  it('normalises dates and shifts years', () => {
    expect(parseDate('6/1/2025')).toBe('2025-06-01');
    expect(parseDate('2025-06-01')).toBe('2025-06-01');
    expect(parseDate('06/01/2025')).toBe('2025-06-01');
    expect(shiftYear('2025-06-01', 1)).toBe('2026-06-01');
    expect(shiftYear('2025-06-01', -1)).toBe('2024-06-01');
  });
});
