/**
 * Single trade outcome evaluator.
 * Given a pick's entry/target/stop + actual day OHLC,
 * determines the trade outcome.
 */

export type TradeOutcome = 'hit-target' | 'hit-sl' | 'no-trigger' | 'gap-below-stop' | 'closed-flat';

export interface TradeResult {
  outcome: TradeOutcome;
  pnlPercent: number;
  entryPrice: number;   // actual entry price used
  exitPrice: number;    // actual exit price
}

/**
 * Evaluate a single trade against actual day OHLC.
 *
 * Logic:
 * 1. If day's high never reaches entryTrigger → no-trigger (no trade)
 * 2. If day opens below stopLoss → gap-below-stop (worst case)
 * 3. If target hit but not stop → hit-target
 * 4. If stop hit but not target → hit-sl
 * 5. If both hit → conservative: assume stop hit first (hit-sl)
 * 6. If neither → closed-flat, P&L based on close vs entry
 */
export function evaluateTrade(
  entryTrigger: number,
  buyPrice: number,
  sellPrice: number,
  stopLoss: number,
  dayOpen: number,
  dayHigh: number,
  dayLow: number,
  dayClose: number
): TradeResult {
  const round = (n: number) => Math.round(n * 100) / 100;

  // Case 1: Entry trigger never reached — trade doesn't activate
  if (dayHigh < entryTrigger) {
    return {
      outcome: 'no-trigger',
      pnlPercent: 0,
      entryPrice: 0,
      exitPrice: 0,
    };
  }

  // The trade activates. Entry at buyPrice (or dayOpen if it gaps above trigger)
  const actualEntry = Math.max(buyPrice, Math.min(dayOpen, entryTrigger));

  // Case 2: Opens below stop loss — immediate loss
  if (dayOpen <= stopLoss) {
    const pnl = ((dayOpen - actualEntry) / actualEntry) * 100;
    return {
      outcome: 'gap-below-stop',
      pnlPercent: round(pnl),
      entryPrice: actualEntry,
      exitPrice: dayOpen,
    };
  }

  const hitTarget = dayHigh >= sellPrice;
  const hitStop = dayLow <= stopLoss;

  // Case 3: Target hit, stop not hit — winner
  if (hitTarget && !hitStop) {
    const pnl = ((sellPrice - actualEntry) / actualEntry) * 100;
    return {
      outcome: 'hit-target',
      pnlPercent: round(pnl),
      entryPrice: actualEntry,
      exitPrice: sellPrice,
    };
  }

  // Case 4: Stop hit, target not hit — loser
  if (hitStop && !hitTarget) {
    const pnl = ((stopLoss - actualEntry) / actualEntry) * 100;
    return {
      outcome: 'hit-sl',
      pnlPercent: round(pnl),
      entryPrice: actualEntry,
      exitPrice: stopLoss,
    };
  }

  // Case 5: Both hit same day — conservative: assume stop hit first
  if (hitTarget && hitStop) {
    const pnl = ((stopLoss - actualEntry) / actualEntry) * 100;
    return {
      outcome: 'hit-sl',
      pnlPercent: round(pnl),
      entryPrice: actualEntry,
      exitPrice: stopLoss,
    };
  }

  // Case 6: Neither hit — flat trade, P&L based on close
  const pnl = ((dayClose - actualEntry) / actualEntry) * 100;
  return {
    outcome: 'closed-flat',
    pnlPercent: round(pnl),
    entryPrice: actualEntry,
    exitPrice: dayClose,
  };
}
