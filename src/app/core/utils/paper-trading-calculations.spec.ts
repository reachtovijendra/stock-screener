import {
  applyPaperOrder,
  buildRecommendationSimulation,
  calculateScoreInvestment,
  getManualStartingCash,
} from './paper-trading-calculations';

describe('paper trading calculations', () => {
  it('maps recommendation scores to market-specific investment ranges', () => {
    expect(calculateScoreInvestment(0, 'US')).toBe(1000);
    expect(calculateScoreInvestment(50, 'US')).toBe(3000);
    expect(calculateScoreInvestment(100, 'US')).toBe(5000);
    expect(calculateScoreInvestment(50, 'IN')).toBe(15000);
    expect(calculateScoreInvestment(150, 'IN')).toBe(25000);
  });

  it('summarizes triggered recommendation trades without deploying cash to no-trigger picks', () => {
    const result = buildRecommendationSimulation([
      {
        symbol: 'AAPL',
        name: 'Apple',
        market: 'US',
        pick_date: '2026-04-01',
        score: 75,
        buy_price: 100,
        sell_price: 103,
        stop_loss: 98,
        outcome: 'hit-target',
        pnl_percent: 3,
        actual_close: 102,
      },
      {
        symbol: 'MSFT',
        name: 'Microsoft',
        market: 'US',
        pick_date: '2026-04-02',
        score: 25,
        buy_price: 50,
        sell_price: 52,
        stop_loss: 49,
        outcome: 'no-trigger',
        pnl_percent: 0,
        actual_close: 51,
      },
    ], 'US');

    expect(result.trades[0].plannedInvestment).toBe(4000);
    expect(result.trades[0].deployedInvestment).toBe(4000);
    expect(result.trades[0].pnlAmount).toBe(120);
    expect(result.trades[1].deployedInvestment).toBe(0);
    expect(result.summary.triggeredTrades).toBe(1);
    expect(result.summary.notTradedCount).toBe(1);
    expect(result.summary.totalPnl).toBe(120);
    expect(result.summary.returnPercent).toBe(3);
  });

  it('adds share count, trade timing labels, detailed exit reasons, and result tones to recommendation simulations', () => {
    const result = buildRecommendationSimulation([
      {
        symbol: 'AAPL',
        name: 'Apple',
        market: 'US',
        pick_date: '2026-04-01',
        score: 75,
        buy_price: 100,
        sell_price: 103,
        stop_loss: 98,
        outcome: 'hit-target',
        pnl_percent: 3,
        actual_close: 102,
      },
      {
        symbol: 'MSFT',
        name: 'Microsoft',
        market: 'US',
        pick_date: '2026-04-02',
        score: 25,
        buy_price: 50,
        sell_price: 52,
        stop_loss: 49,
        outcome: 'no-trigger',
        pnl_percent: 0,
        actual_close: 51,
      },
      {
        symbol: 'TSLA',
        name: 'Tesla',
        market: 'US',
        pick_date: '2026-04-03',
        score: 50,
        buy_price: 200,
        sell_price: 206,
        stop_loss: 196,
        outcome: 'exit-at-close',
        pnl_percent: -1,
        actual_close: 198,
      },
    ], 'US');

    expect(result.trades[0].sharesBought).toBe(40);
    expect(result.trades[0].boughtAtLabel).toBe('Apr 1, 2026, buy trigger hit intraday');
    expect(result.trades[0].soldAtLabel).toBe('Apr 1, 2026, sell target hit intraday');
    expect(result.trades[0].detailedExitReason).toBe('Sell target hit');
    expect(result.trades[0].resultTone).toBe('positive');

    expect(result.trades[1].sharesBought).toBe(0);
    expect(result.trades[1].boughtAtLabel).toBe('Not bought');
    expect(result.trades[1].soldAtLabel).toBe('Not sold');
    expect(result.trades[1].detailedExitReason).toBe("Buy price didn't hit");
    expect(result.trades[1].resultTone).toBe('neutral');

    expect(result.trades[2].sharesBought).toBe(15);
    expect(result.trades[2].soldAtLabel).toBe('Apr 3, 2026, 4:00 PM ET market close');
    expect(result.trades[2].detailedExitReason).toBe('Closed at a loss');
    expect(result.trades[2].resultTone).toBe('negative');
  });

  it('applies manual buy and partial sell orders to cash, positions, and realized profit', () => {
    expect(getManualStartingCash('US')).toBe(100000);
    expect(getManualStartingCash('IN')).toBe(1000000);

    const buy = applyPaperOrder({
      account: { market: 'US', starting_cash: 100000, cash_balance: 100000, enabled: true },
      position: null,
      order: { action: 'BUY', symbol: 'AAPL', name: 'Apple', quantity: 10, execution_price: 100 },
    });

    expect(buy.account.cash_balance).toBe(99000);
    expect(buy.position?.quantity).toBe(10);
    expect(buy.position?.average_cost).toBe(100);
    expect(buy.trade.realized_pnl).toBeNull();

    const sell = applyPaperOrder({
      account: buy.account,
      position: buy.position,
      order: { action: 'SELL', symbol: 'AAPL', name: 'Apple', quantity: 4, execution_price: 110 },
    });

    expect(sell.account.cash_balance).toBe(99440);
    expect(sell.position?.quantity).toBe(6);
    expect(sell.position?.average_cost).toBe(100);
    expect(sell.trade.realized_pnl).toBe(40);
    expect(sell.trade.realized_pnl_percent).toBe(10);
  });
});
