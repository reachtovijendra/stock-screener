# FIRE Goals

## Overview

The FIRE Goals feature is an authenticated retirement planning screen available at `/fire-goals`. It lets users define a target retirement age, FIRE amount, expected return assumptions, assets, and liabilities, then calculates the monthly and yearly contributions needed to reach the target.

The screen is implemented as a standalone Angular feature with a polished mission-control wizard layout. Persistence uses Supabase through the existing authenticated client; calculations run in the browser for immediate feedback while the user edits the plan.

## User Interface

The FIRE Goals screen uses a single wizard panel:

- `Overview`: Shows FIRE Goal, Net Worth, Freedom Gap, and Time Left. It also provides clickable summary rows for Assets, Loans, and Income, including annual taxation in the income detail chips.
- `Goal & Income`: Edits the FIRE target, timeline, return assumptions, income, tax rate, monthly spending, and currency. Monthly spending is converted to annual spending for saved values and FIRE calculations. Currency context appears as an inline note rather than a form control.
- `Assets`: Adds, removes, and edits modern compact investment rows with a single sticky header for identity, type, current value, Exclude from plan, and the add action. The header and rows share the same grid columns so labels stay aligned with editable values. Excluded investments stay saved in the ledger but are omitted from FIRE calculations, asset summaries, net worth, and projections. Investment deletion opens a styled in-page confirmation dialog before removal. When no investments exist, the panel shows a compact empty action state instead of an empty ledger or repeated summary.
- `Loans`: Adds, removes, and edits modern loan cards with identity, balance, APR, payment, and payoff timeline fields. Because loans use a card layout instead of tabular rows, the borderless sticky utility row keeps only the add action instead of repeating section copy or column labels. Loan deletion opens the same styled in-page confirmation dialog before removal. When no loans exist, the panel shows the same compact empty action state used for investments.

Users move between panels with carousel arrow controls. The Overview panel starts the carousel and does not show a back arrow. Clicking the Assets, Loans, or Income rows in the overview jumps directly to the corresponding edit panel.

Currency display follows the app's selected market. The US market displays USD with `$`; the India market displays INR with `₹`. FIRE plans keep their saved base currency in Supabase, and the UI converts overview totals and editable money fields to the active market currency using a live USD/INR quote. Edits made in the active market currency are converted back to the saved plan currency before local draft persistence or autosaves.

## Persistence

The schema is defined in `supabase/fire-goals-schema.sql`.

Existing Supabase projects that created FIRE tables before later fields were added must rerun the schema script, or at minimum run the `alter table` statements for `fire_goals.tax_rate` and `fire_assets.exclude_from_plan` from that file. The client retries saves without `tax_rate` when PostgREST reports that specific schema-cache miss so investments and loans can still be saved, but tax-rate and asset exclusion persistence require their columns to exist.

### Tables

- `fire_goals`: Stores one or more user-owned plans with current age, target retirement age, FIRE amount, expected annual return, inflation rate, annual income, tax rate, annual spending, and preferred currency. The UI collects monthly spending and saves the annualized value in `annual_spending`.
- `fire_assets`: Stores asset rows for a plan, including name, category, current value, optional annual growth rate, and whether the asset is excluded from plan calculations. The current UI uses the plan-level expected return for included asset projections.
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
- Annual spending from the monthly spending input multiplied by 12.
- Months and years remaining until target retirement age.
- FIRE gap as the target amount minus current net worth.
- Required monthly contribution using future value of current net worth and annuity contribution math.
- Required yearly contribution as monthly contribution multiplied by 12.
- Yearly projection of assets, liabilities, net worth, target gap, and debt reduction through the retirement target year.
- Loan payoff timeline controls support remaining months or an optional payoff date. When no monthly payment is entered, the projection uses the timeline to reduce the balance to zero by the payoff point.

## Assumptions

- New users start with an empty FIRE plan. Example values are shown only as input placeholders and are not used in calculations or saved unless the user enters them.
- Default expected annual return, inflation, income, spending, tax, asset, and loan values are `0` until the user enters plan data.
- Monthly spending is the editable user input. The stored `annual_spending` value is recalculated from monthly spending and used for overview income chips, annual cash-flow references, and projections.
- Retirement age can match or be less than current age; calculations clamp the timeline to zero remaining months instead of blocking the save.
- Asset rows without a growth override use the plan expected annual return.
- Asset rows marked Exclude from plan remain saved in the investment ledger but are omitted from total assets, category summaries, net worth, required contribution calculations, and yearly projections.
- Display currency is derived from the active market selection instead of being manually selected inside the FIRE form. Saved numeric values remain in the plan's stored `preferred_currency`.
- Liability balances amortize monthly using APR and monthly payment.
- Calculations are estimates for planning support and are not financial advice.
- The browser keeps a user-scoped local draft while the user edits. Autosave runs when editable fields lose focus, when the browser window loses focus, when the page is hidden, and when the page is being left. Confirmed investment and loan deletions autosave immediately after the in-page confirmation dialog so removed rows do not return after refresh. Successful autosaves clear the local draft after syncing to Supabase without reloading the full FIRE plan view.
- Autosave success is intentionally quiet. Save errors remain visible so users can correct invalid inputs or retry after transient Supabase failures.

## Verification

Focused coverage is included for:

- Required monthly contribution math.
- Liability payoff balance estimates.
- Yearly projection summary output.
- Component behavior for saved plan loading, invalid target ages, autosaving on focus changes, styled deletion confirmation, and preserving local drafts until Supabase sync succeeds.
- Wizard behavior for overview metrics, clickable summary rows, and carousel arrow navigation.
