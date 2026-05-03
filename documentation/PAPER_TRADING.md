# Paper Trading

## Overview

The application supports two paper trading workflows:

- Automated recommendation simulation on the Recommendations page.
- Manual paper trading on the Manual Paper Trading page.

Both workflows are market-aware and keep US and India calculations separate.

## Automated Recommendation Simulation

The Recommendations page includes an `Automated Paper Results` tab. It derives simulated trades from the selected month of `daily_picks` records.

The simulator invests only when a recommendation's buy trigger is reached. It does not create additional database records because the result is deterministic from the recommendation score, buy price, evaluated outcome, and stored P/L percentage.

Investment ranges:

- US market: USD 1,000 to USD 5,000 per triggered pick.
- India market: INR 5,000 to INR 25,000 per triggered pick.

Formula:

```text
investment = min + (score / 100) * (max - min)
```

Scores are clamped between 0 and 100. No cash is deployed for recommendations that do not trigger a buy entry.

The automated results table displays the simulated share count, bought and sold timing labels, separate entry and exit price columns, detailed exit reason, and realized P/L. The planned amount includes an info control that expands the per-row formula using that pick's score. Exit prices, exit reasons, and P/L values are color-coded by result: profitable exits use a positive style, stop-loss or loss-at-close exits use a negative style, non-triggered entries use a neutral style, and pending evaluations use a pending style. Intraday target and stop-loss rows identify the event as intraday because the persisted daily pick data stores daily outcome values, not exact intraday execution timestamps.

## Manual Paper Trading

The Manual Paper Trading page is an authenticated feature at `/paper-trading`. A user enables a market-specific paper account before placing trades.

Starting balances:

- US market: USD 100,000.
- India market: INR 10,00,000.

The order ticket defaults execution price from the live quote API and allows the user to override the price before confirming. Buy orders reduce cash and increase or create positions. Sell orders require an existing position, increase cash, reduce or close positions, and record realized P/L.

## Persistence

Manual paper trading data is stored in Supabase with row-level security. The schema is defined in `supabase/paper-trading-schema.sql`.

Tables:

- `paper_accounts`: per-user, per-market starting cash and cash balance.
- `paper_positions`: current open positions by user, market, and symbol.
- `paper_trades`: immutable trade history with realized P/L for sells.

All policies restrict access to rows where `auth.uid()` matches `user_id`.
