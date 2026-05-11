# FIRE Goals

## Overview

The FIRE Goals feature is an authenticated retirement planning screen available at `/fire-goals`. It lets users define a target retirement age, FIRE amount, expected return assumptions, assets, and liabilities, then calculates the monthly and yearly contributions needed to reach the target.

The screen is implemented as a standalone Angular feature with a polished mission-control wizard layout. Persistence uses Supabase through the existing authenticated client; calculations run in the browser for immediate feedback while the user edits the plan.

## User Interface

The FIRE Goals screen uses a single wizard panel:

- `Overview`: Shows FIRE Goal, Net Worth, Freedom Gap, and Time Left. It also provides clickable summary rows for Assets, Loans, and Income, including annual taxation in the income detail chips.
- `Goal & Income`: Edits the FIRE target, timeline, return assumptions, income, tax rate, spending, and currency.
- `Assets`: Adds, removes, and edits modern compact investment rows with a single sticky header for identity, type, and current value fields. The Assets page header carries the total investment summary and add action to avoid duplicate section headings.
- `Loans`: Adds, removes, and edits modern loan cards with identity, balance, APR, payment, and payoff timeline fields.

Users move between panels with carousel arrow controls. The Overview panel starts the carousel and does not show a back arrow. Clicking the Assets, Loans, or Income rows in the overview jumps directly to the corresponding edit panel.

Currency display follows the app's selected market. The US market displays USD with `$`; the India market displays INR with `₹`. FIRE plans keep their saved base currency in Supabase, and the UI converts overview totals and editable money fields to the active market currency using a live USD/INR quote. Edits made in the active market currency are converted back to the saved plan currency before local draft persistence or Supabase saves.

## Persistence

The schema is defined in `supabase/fire-goals-schema.sql`.

### Tables

- `fire_goals`: Stores one or more user-owned plans with current age, target retirement age, FIRE amount, expected annual return, inflation rate, annual income, tax rate, annual spending, and preferred currency.
- `fire_assets`: Stores asset rows for a plan, including name, category, current value, and optional annual growth rate. The current UI uses the plan-level expected return for asset projections.
- `fire_liabilities`: Stores liability rows for a plan, including name, category, balance, interest rate, monthly payment, optional payoff months, and optional payoff date.

### Security

All FIRE Goals tables enable row-level security. Policies require `auth.uid()` to match `user_id`, and asset/liability policies also verify that the linked goal belongs to the authenticated user.

## Calculation Model

The calculation utilities live in `src/app/core/utils/fire-goals-calculations.ts`.

The first version calculates:

- Total assets from all asset current values.
- Total liabilities from all liability balances.
- Current net worth as assets minus liabilities.
- Annual tax estimate as `annual_income * tax_rate`.
- Months and years remaining until target retirement age.
- FIRE gap as the target amount minus current net worth.
- Required monthly contribution using future value of current net worth and annuity contribution math.
- Required yearly contribution as monthly contribution multiplied by 12.
- Yearly projection of assets, liabilities, net worth, target gap, and debt reduction through the retirement target year.
- Loan payoff timeline controls support remaining months or an optional payoff date. When no monthly payment is entered, the projection uses the timeline to reduce the balance to zero by the payoff point.

## Assumptions

- Default expected annual return is `7%`.
- Default inflation rate is `3%`.
- Default tax rate is `20%`.
- Asset rows without a growth override use the plan expected annual return.
- Display currency is derived from the active market selection instead of being manually selected inside the FIRE form. Saved numeric values remain in the plan's stored `preferred_currency`.
- Liability balances amortize monthly using APR and monthly payment.
- Calculations are estimates for planning support and are not financial advice.
- The browser keeps a user-scoped local draft while the user edits. Refreshing the page restores unsaved goal, asset, and liability changes, and `Save Plan` clears the draft after syncing to Supabase.
- The first version saves to Supabase explicitly through the `Save Plan` action instead of auto-saving every keystroke.

## Verification

Focused coverage is included for:

- Required monthly contribution math.
- Liability payoff balance estimates.
- Yearly projection summary output.
- Component behavior for saved plan loading, invalid target ages, and saving the current draft.
- Wizard behavior for overview metrics, clickable summary rows, and carousel arrow navigation.
