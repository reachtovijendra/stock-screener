# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Market Holidays page (`/holidays`, new sidebar link) showing US (NYSE/NASDAQ) and India (NSE/BSE) exchange holidays side by side, each row with the weekday and a Past/Next/Upcoming status. The data is a single source of truth in `api/_lib/market-holidays.json` — consumed by `api/_lib/market-calendar.ts` (the cron holiday guard) and served to the page via a new `action=holidays` API endpoint (`api/_lib/handlers/market-holidays.ts`, mirrored in `mock-server.js`) so the UI and the crons never drift. US holidays are rule-complete for 2026–2027; the NSE list currently carries fixed-date holidays only (the page shows a note to add the variable/lunar dates from the NSE annual circular).
- Live A/B of the two day-trade models. Both the original **old** model (gap-up/RVOL selection + previous-day-high breakout entry, 1 ATR symmetric stop/target) and the **new** opening-momentum model now run in parallel every day and are stored as separate rows, discriminated by a new `model` column on `daily_picks` (existing rows tagged `old`; uniqueness re-keyed to `market,pick_date,symbol,model`). `api/_lib/day-trade-scorer.ts` retains both scorers (`quickScore`/`fullScore` = new, `quickScoreOld`/`fullScoreOld` = old) and `runTwoPassScoring` dispatches by `model`. Both cron jobs generate both models' picks; only the **new** model is emailed. `api/cron/evaluate-picks.ts` evaluates each row by its own rules (`evaluatePickForModel`: breakout-trigger entry for old, open-entry/ride-to-close for new). The recommendations page gains a **New / Old model toggle** that scopes every metric, table, and the paper-results simulation to the selected model (defaulting to whichever model has picks for the month, preferring New); the temporary new-structure backtest columns/row remain visible on the Old view for historical context. This lets the two models be compared on real forward data before retiring the loser.

### Changed
- The Trades page now shows a single model per view driven by the New/Old toggle, instead of overlaying both. Removed the second "New model · backtest" summary row and the duplicate `new` table columns; the one summary row, table columns, and the Automated Paper Results tab (including the score-to-investment description and the ledger's entry label — "bought at the open" for new, "breakout trigger hit" for old) all reflect the selected model via `visiblePicks`. The summary caption shows the active model.
- The Market Holidays page now lists the current calendar year only (e.g. 2026), with the year in the page heading.
- Reworked the day-trade recommendation engine from a previous-day-high **breakout** model to an **opening-momentum** model, after a reverse analysis of realised `daily_picks` outcomes showed the breakout entry was the primary cause of the persistent ~40% win rate. On the same picks, entering on the prior-day-high breakout (±1 ATR) returned ≈ −0.35%/trade at 44.8% win, while simply buying at the open and exiting at the close returned ≈ +0.6%/trade at ~58–63% win — the breakout tags the intraday high, then the tight stop is hit on the normal pullback before the stock resumes. The trade structure in `api/_lib/day-trade-scorer.ts` is now: enter at the open (reference = premarket print, else previous close), hold and exit at the close, with a 1.5 ATR hard stop (floored 2.5%, capped 4% of price; ~3.5% typical) and a far 3 ATR stretch limit target so the close stays the primary exit. The stop width was tuned against the realised picks: because the edge is riding the pick from open to close, a ~3.5% stop maximised both win rate (~57% US) and per-trade expectancy (+0.34%) while capping the worst day near −3.5% — tighter stops (e.g. 2.5%) cut winners and dragged choppy months like June negative. Measured on the same universe: US win rate ~43%→~57% and expectancy −0.44%→+0.38%; India ~40%→~46%. Applies to both US (`api/cron/daily-picks.ts`) and India (`api/cron/daily-picks-india.ts`); India has a structurally thinner edge (~45% open→close) and benefits less.
- Inverted the selection scoring in `api/_lib/day-trade-scorer.ts` to match live outcomes, which contradicted every major weight of the old "data-driven (13,649 stock-day)" model: **RSI** — strong momentum (RSI 70–82 → +20, 60–70 → +12, up to 88 still rewarded) replaces the old RSI 55–75 "sweet spot" that penalised RSI > 75 and hard-rejected > 80 (the hard reject is now only a genuine blow-off, RSI > 90); in the data RSI 65–75 won 63% vs 42% for 55–65. **Relative volume** — moderate RVOL (1.0–1.8× → +12) is rewarded and volume spikes (> 2.5× → −8) are penalised, reversing the old high-RVOL bonus and the 5× "volume spike catalyst" (RVOL < 1.2 won 65% vs 40% for RVOL ≥ 2 in the data). **Gap** — the gap-up bonus and gap-down hard-rejection were removed (gap direction had no edge; flat/down opens actually won 73%), with only a mild discount for chasing large gap-ups (> 3%). `quickScore` (Pass 1) likewise drops the gap and RVOL-floor rejections, keeping only the with-trend (above 50 DMA) filter.
- Updated `api/cron/evaluate-picks.ts` to evaluate the opening-momentum model so the displayed win rate reflects how the trade is actually taken: it enters at the actual open, applies the stop/target as percentage distances from that open (gap-robust), and exits at the close otherwise; when both stop and target trade inside a single daily bar it conservatively assumes the stop filled first. The previous-day-high entry trigger and `no-trigger` "buy never reached" path are gone — `no-trigger` now means only that no OHLC data was available. Recommendation email "how to use" copy, the scoring legends, and the paper-results labels (`src/app/core/utils/paper-trading-calculations.ts`, recommendations component) were updated to match.

### Fixed
- Stopped `api/cron/evaluate-picks.ts` from fabricating outcomes on non-trading days. Its `fetchOHLCForDate` fell back to the closest daily bar within ±2 days when no bar matched the pick date, so picks dated on a US market holiday (e.g. Juneteenth, 2026-06-19) — which the Mon–Fri `daily-picks` cron still generates — were scored against the previous trading day's bar, producing phantom results for both the live and backtest models. Tightened the proximity fallback to an 18-hour window (enough to absorb a timezone date-shift between the local session-open bar timestamp and the pick date, but strictly less than a day) so a non-trading pick date now correctly evaluates to no data. Existing phantom Juneteenth rows were reset to `no-trigger` with their fabricated prices cleared. The `daily-picks` and `daily-picks-india` crons now also short-circuit on non-trading days via a new `api/_lib/market-calendar.ts` (weekend + exchange-holiday check), so they no longer generate or email un-actionable picks on closed days. US holidays are rule-complete for 2026–2027; the NSE list covers fixed-date national holidays and should be topped up with variable/lunar dates from NSE's annual circular.
- Corrected three valuation-mechanics flaws in the experimental "Per ChatGPT" forecast engine (`src/app/features/stock-detail/chatgpt-forecast-engine.ts`) exposed by a Micron (MU) review that produced an indefensible ~$3,192 (+200%) target. (1) Justified P/E now applies a hard growth-tier ceiling (`<10%->15x, <20%->20x, <30%->25x, <40%->30x, else 35x`) to every candidate multiple, and the blended result is further clamped to 0.7x-1.3x the market's forward P/E, so a trough-earnings trailing P/E or an aggressive growth multiple can no longer push the multiple to 40x while the market pays ~10x; this also stops growth being counted twice (in EPS and again in the multiple). The peer-relative leg and the EPS-proxy DCF are capped to the same band (DCF clamp tightened to 0.5x-1.6x price). (2) The Bear/Base/Bull scenarios are now scaled from the single blended fundamental target (Bear 0.78x, Base 1.0x, Bull 1.3x) with implied per-scenario P/E, guaranteeing Bear < Base < Bull by construction and eliminating the cross-method bug where the Bear case exceeded the Base case. (3) Confidence now decreases as the modelled upside diverges from price (-8 beyond 35%, -15 beyond 60%), since large targets rely on heavier extrapolation. For MU the model now returns a Base near ~$1,420 with Bear/Bull bracketing it, consistent with the framework's intent.

### Changed
- Rebalanced the forecast engine's base-valuation weights to correct a systematic bearish bias on strong uptrends (e.g. QCOM was a Sell at -17% while trading near its highs). Shifted weight away from the lagging analyst-consensus leg toward forward earnings and the market anchor: Current price 15->20%, Forward earnings value 30->40%, Analyst consensus 40->20%, Trend fair value 15->20%, and softened the analyst-pull adjustment multiplier 0.25->0.15. Analyst targets are persistently stale on fast movers, so they no longer dominate the blend. Implemented in `src/app/features/stock-detail/forecast-engine.ts`.
- Replaced the forecast's noisy growth input with a clean, forward-looking estimate. The forward-earnings multiple, the growth adjustment, and the valuation (PEG) score now derive growth from implied forward-vs-trailing EPS (`(forwardEps/eps - 1)`), clamped to a believable band, instead of Yahoo's single-quarter year-over-year `earningsGrowth`/`revenueGrowth` prints, which are frequently null for large caps or distorted by one-off base effects (observed +173% / +431% quarters). The contraction guard now triggers on forward EPS actually falling below trailing EPS (a genuine decline) rather than a single noisy quarterly revenue print. Implemented via a new `effectiveGrowthPct` helper in `src/app/features/stock-detail/forecast-engine.ts`.
- Added a market-multiple cap to the forecast's forward-earnings leg: growth can justify paying at most 1.3x the multiple the market itself assigns (`forwardPeRatio`), and the leg's fair value is capped at 1.75x price (was 2.0x). A low market multiple usually encodes real risk (cyclicality, patent cliffs, depressed-but-recovering earnings off a low trailing base), so this reins in value-trap upside - e.g. PFE moved from an unrealistic Strong Buy (+45%) to a Buy (+23%) - without affecting names the market already pays up for (NVDA remains Strong Buy). Implemented in `src/app/features/stock-detail/forecast-engine.ts`.
- Added a key-technicals strip to the forecast dialog's tab bar (filling the previously empty space beside the tabs): P/E, Forward P/E, 50-day MA, 200-day MA, RSI, and MACD. RSI is color-coded by overbought/oversold zone and MACD shows its signal label (Bullish/Bearish/etc.) color-coded buy/sell, reusing the existing `getRsiClass`, `getMacdSignalClass`, and `getMacdSignalLabel` helpers. Each value falls back to a dash when the underlying data is unavailable. Implemented in `src/app/features/stock-detail/stock-detail.component.ts`.
- Closed the valuation-to-target loop in the forecast dialog's "Our adjustments" panel by appending a summary chain that reads "Weighted base -> total % adjustment -> 12-Mo Target" (e.g. $1,601.33 -> +6.7% -> $1,708.32). Previously the panel listed the individual factor tilts but never showed the resulting target, so the base valuation appeared to be the final answer; the chain now makes the base -> adjustments -> target relationship explicit in one place. Implemented in `src/app/features/stock-detail/stock-detail.component.ts`.
- Aligned the forecast dialog to a single 12-month horizon. The Trade plan card previously displayed a "3-6 months" tactical horizon while its target reused the 12-month target price, which was contradictory. The trade plan horizon now reads "12-month" and its notes reference the 12-month thesis, so the recommendation, target/upside, "how we got there", adjustments, bull/bear, and trade plan all share one consistent horizon (the separate 5-Year Projection tab remains explicitly multi-year). Implemented in `src/app/features/stock-detail/forecast-engine.ts`.
- Split the stock detail "How we got there" forecast dialog into two tabs: "Analysis & Trade Plan" (weighted valuation breakdown, adjustment waterfall, trade plan, and bull/bear cases) and a dedicated "5-Year Projection" tab (scenario chart and scenario cards). The footer/disclaimer remains visible under both tabs, and the dialog always opens on the Analysis tab. Tabs use lightweight conditional rendering so the projection chart only mounts when its tab is active, avoiding chart.js zero-size rendering in a hidden panel. Implemented in `src/app/features/stock-detail/stock-detail.component.ts`.
- Simplified the stock detail "The Call" band to a single trust metric. Removed the displayed Conviction score (0-100), which was redundant with the five-level Buy/Hold/Sell pill that already conveys direction and strength, and kept Confidence as the one headline metric for how reliable the call is. The engine still computes conviction internally to derive the recommendation; it is no longer shown as a competing number. The Confidence tooltip now clarifies it reflects current data quality and signal agreement, not a backtested hit-rate. Implemented in `src/app/features/stock-detail/stock-detail.component.ts`.
- Redesigned the stock detail "The Call" headline band for clearer reading and balanced spacing. The band now uses a full-width flex layout (verdict | price flow | confidence) with dividers so the price figures spread evenly instead of bunching in the center with empty gaps on the sides. Added a directional "steps" motif - an ascending green staircase arrow for buy calls, a descending red one for sell calls, and a flat amber arrow for hold - rendered as inline SVG next to the recommendation pill and animated on load. The Conviction and Confidence labels now carry inline info icons with plain-language tooltips explaining what each score means (conviction = strength of the combined bullish/bearish signal; confidence = how trustworthy/agreed the estimate is). Price, upside, target, and conviction values now render in the monospace numeric font for a terminal-grade look. Implemented in `src/app/features/stock-detail/stock-detail.component.ts`.
- Penny Hits is now a live, request-time two-stage funnel instead of a pre-market Supabase snapshot. Stage 1 scans the live Yahoo penny universe and ranks it on direction-aware momentum + volume, trend/MA structure, analyst conviction + upside, and growth (with hard gates that require an up day and reject deep downtrends, plus an anti-chase penalty for parabolic run-ups and single-day blow-offs), narrowing to a ~20-name shortlist. Stage 2 enriches only that shortlist with Finnhub (news catalysts + recommendation trend, ~2 calls/name), applies sentiment filtering, blends a catalyst factor into the score (catalyst 25 / momentum+volume 25 / trend 20 / analyst+upside 20 / growth 10), and returns the top 15. Results are cached in memory (~3-5 min, single-flight) and degrade gracefully to a Yahoo-only list when Finnhub is unavailable. Implemented in `api/_lib/handlers/stocks-penny-hits.ts` and mirrored in `mock-server.js`.
- Penny Hits scoring engine (`api/_lib/penny-hits-scorer.ts`) rewritten around the live factors above; the Finnhub `PennyEnrichment` is now optional so a Yahoo-only score is always available.
- Penny Hits catalyst classifier (`api/_lib/penny-catalyst.ts`) now detects negative-sentiment headlines (rejection, miss, halt, offering/dilution, downgrade, going concern, etc.) so bad news is never counted as a positive catalyst and names whose recent news is dominated by negatives are excluded.
- Penny Hits card chips updated to the combined live + catalyst label set (Volume Surge, Intraday Surge, Uptrend, Near 52W High, Strong Buy, High Upside, Growth, plus real news catalysts), mapped to the existing cool palette; page header copy now describes the live momentum screen.

### Removed
- Retired the pre-market Penny Hits cron (`/api/cron/penny-hits`, removed from `vercel.json`) and its Supabase snapshot dependency; the page no longer reads or writes the `penny_hits` table.

### Added
- Experimental "Per ChatGPT" tab in the stock-detail forecast dialog (may be removed later). It is powered by a standalone, deterministic engine (`src/app/features/stock-detail/chatgpt-forecast-engine.ts`) implementing the fundamentals-first model proposed in review, fully isolated from the production engine and leaving the main page and other tabs untouched: Layer 1 forward EPS + implied growth, Layer 2 a justified P/E blended from trailing (historical proxy), a static sector peer reference multiple, and a growth-adjusted P/E, an intrinsic value blend (earnings-multiple 70% / peer-relative 20% / EPS-proxy DCF 10%) with no current-price anchor and no analyst input, Layer 3 Bear/Base/Bull scenarios from EPS x P/E grids with per-scenario reward:risk, and Layer 4 a technical overlay (200-/50-day MA, MACD, RSI, trend strength) that drives a "probability of reaching target" confidence score instead of moving the price. Analyst consensus is shown only as a "Model vs Street" comparison, and the stop is volatility-based (ATR proxy from beta + 52-week range). Where the data feed lacks true inputs (peer comps, free cash flow, a historical P/E series), clearly-labelled approximations are used. Wired via a new `chatGptForecast` computed and `gptBarPct` helper in `src/app/features/stock-detail/stock-detail.component.ts`.
- Stock detail page now has a "Price Forecast & Call" panel: a collapsible, full-width section (toggled by a header CTA) that presents a transparent BUY/HOLD/SELL recommendation, a 12-month target price with upside %, a model confidence meter, a "How we got there" weighted base-valuation breakdown, an "Our adjustments" factor waterfall, a multi-year (5-year) optimistic/target/conservative projection chart with scenario cards, an actionable trade plan (entry zone, target, stop-loss, reward:risk), and bull/bear case bullets, plus a data-source footer and disclaimer. The recommendation engine (`src/app/features/stock-detail/forecast-engine.ts`) is fully deterministic and runs client-side over the data the page already loads (Yahoo fundamentals/analyst data, live RSI/MACD/moving-average technicals, multi-period performance, and news catalyst types) with no external AI/LLM and no new API calls; it degrades gracefully and lowers confidence when analyst coverage or forward estimates are missing. The projection chart reuses PrimeNG `p-chart` (chart.js).
- Penny Hits cards now surface indicators for each pillar named in the page heading: catalyst chips (catalysts), an analyst Rating derived from the recommendation mean alongside Analysts count, Upside, and Target (analyst conviction), and Relative Volume plus net Insider buying value (buying activity). Indicators render only when the underlying data is present and lay out in a responsive wrapping grid.
- Penny Hits analyst conviction now falls back to Finnhub's analyst recommendation trend when Yahoo provides no coverage (common for sub-$20 stocks). `getRecommendationTrend` computes a weighted recommendation mean (1 Strong Buy - 5 Strong Sell) from the latest Finnhub period, and the scorer uses it for the displayed Rating, the Analysts count, the analyst score factor, and the "Analyst Buy" badge/thesis. No schema change was required - the existing `recommendation_mean` and `num_analysts` columns are reused.
- Robinhood trade link and stock detail link icons to each Penny Hits card, matching the pattern used in Breakouts, Recommendations, and Watchlist Detail pages.

### Fixed
- Forecast recommendation could contradict its own headline number (e.g. a "Buy" shown alongside a 12-month target *below* the current price). The recommendation was derived purely from the blended conviction score, where upside is only 40% of the weight, so strong technicals/analyst/momentum signals could push the call into "Buy" territory even when the model's target implied downside. Added an upside-coherence gate in `src/app/features/stock-detail/forecast-engine.ts`: the conviction (and therefore the recommendation) is now bounded by what the 12-month upside itself implies - a negative target caps the call at "Sell", a roughly flat target (within +/-5%) caps it at "Hold", and only a target implying >= +5% / >= +12% upside permits "Buy" / "Strong Buy". The displayed conviction is the gated value, so the number, the label, and the upside always agree.
- Penny Hits daily scan (`savePennyHits`) now clears the existing rows for each market/date before inserting, so a scan fully replaces the day's snapshot instead of accumulating stale symbols from earlier runs (previously a re-run could leave a mix of stale and fresh picks for the same date).

### Changed
- Penny Hits now overlays live Yahoo quotes on top of the cached daily picks so the displayed price, change percentage, and analyst upside reflect the current market instead of the price captured at the last daily scan. The expensive score, catalyst, and analyst data remain served from the daily Supabase cache for instant loads; a batch quote request (`action=quote`) refreshes prices after the cached rows render, and falls back silently to cached prices if the quote request fails.
- Recolored Penny Hits catalyst chips and score badges to a cool purple/blue/pink/cyan palette, removing the yellow and green variants that clashed with the Robinhood icon color. Analyst/coverage chips are now pink, insider chips cyan, the high score badge blue, and the mid score badge violet.
- Tightened Penny Hits card header spacing so the Robinhood and stock detail icons sit just beneath the price (rather than a full row below the taller score badge).
- Removed the redundant one-line thesis note from the bottom of Penny Hits cards; it restated the catalyst chips and metrics (rating, relative volume) already shown above.
- Penny Hits cards now show the stock's industry (falling back to sector) under the company name instead of the placeholder "Unknown". The live quote overlay supplies a real sector/industry classification when the daily scan stored "Unknown", and the line is hidden entirely if neither is available.
- Penny Hits card layout: the price and change percentage sit in the top-right corner of the header (aligned with the score badge and symbol), with the Robinhood and stock detail icons right-aligned just beneath. Catalyst chips, the analyst/activity metrics grid, and the one-line thesis (below the metrics divider) follow in order.
- Penny Hits screener quick-view now uses a focused, performance-oriented column layout: it shows 1W, 1M, 3M, 6M, and 1Y price-change columns and hides the columns that are not meaningful for penny stocks (P/E, Fwd P/E, 52W Range, RSI, MACD, Earnings, Target, Inst. %, Sector, Industry). The local `mock-server.js` Penny Hits scan now enriches each pick with multi-period performance (and volume) so these columns are populated; `mapPennyHitToStock` maps the new fields, and the results table reacts to a new `showPennyHitsColumns` signal.
- Redesigned FIRE Progress panel with horizontal layout (ring + stats side-by-side) to eliminate vertical scrollbar and empty space on the dashboard.
- Restructured dashboard grid from 4-row layout to compact 3-row layout: FIRE + Portfolio (row 1), Today's Picks + Paper Trading/Email (row 2), Market News as full-width horizontal card strip (row 3).
- Reduced dashboard vertical spacing (padding, greeting margin, grid gap, panel padding) for tighter fit within viewport.
- Market News panel now displays items as horizontal scrollable cards instead of vertical list when full-width.

### Added
- Penny Hits feature: a US-only, catalyst-driven screen for low-priced stocks (under $20, no market-cap minimum) at `/penny-hits`, plus a Screener quick-view button. Each pick has a composite Penny Hit Score (Catalyst 40%, Analyst 15%, Growth 15%, Insider 15%, Activity 15%) with catalyst badges and a one-line thesis. Hard gates: price between $1 and $20 and average volume of at least 100k shares/day.
- Finnhub free-tier integration (`api/_lib/finnhub-client.ts`) providing real news catalysts, insider-buying transactions, and analyst recommendation trends, with an in-process rate limiter and graceful degradation when `FINNHUB_API_KEY` is absent.
- Catalyst classifier (`api/_lib/penny-catalyst.ts`) that detects contract wins, FDA/regulatory approvals, M&A, partnerships, guidance raises, earnings beats, analyst upgrades, and product launches from news headlines.
- Penny Hits scoring engine (`api/_lib/penny-hits-scorer.ts`), daily cron (`api/cron/penny-hits.ts`), Supabase cache table `penny_hits`, and list endpoint `GET /api/stocks?action=penny-hits`.
- Local development support for Penny Hits in `mock-server.js`: when the Supabase `penny_hits` cache is empty (no service-role key locally), the `GET /api/stocks?action=penny-hits` endpoint now computes the list live (Yahoo penny universe + scoring engine, with optional Finnhub enrichment) and caches it in memory for the day, so the page and quick-view return data without the production cron.
- `fetchPennyUniverse()` in the Yahoo client to source sub-$20 US stocks with no market-cap floor (the existing screener enforces a $1B minimum).
- Penny navigation item in the sidebar.
- Documentation for the Penny Hits design in `documentation/plan/2026-05-28-penny-hits-design.md`.
- Dashboard home page at `/` with personalized greeting, bento-grid layout, and overview panels for FIRE progress, portfolio growth, today's picks, paper trading, market news, and email preferences (placeholder). Uses V2 luxury theme with Fraunces/Plus Jakarta Sans typography, gold accents, glass morphism, and staggered entrance animations. All panels are market-aware (US/India) and link to their corresponding detail pages.
- Home navigation item in sidebar with gold gradient icon.
- DashboardService aggregating data from FireGoals, Portfolio, PaperTrading, Recommendations, and News APIs.

### Changed
- Default route (`/`) is now the authenticated Dashboard; Screener moved to `/screener`.
- Wildcard route redirects to `/screener` for unauthenticated users.

### Added
- Top Performers page at `/watchlists/top-performers` that aggregates stocks across all user watchlists (owned and shared), enriches them with live performance data, and ranks by selectable time periods (1D, 1W, 1M, 1Y, Since Added) with configurable display count (10, 25, All).
- Screener Top Losers and Top Gainers quick-view buttons with selectable 1D, 1M, and 1Y ranking periods backed by a full-market movers API.
- Portfolio Tracker Growth Lens popup with a PrimeNG dialog, Chart.js-backed growth/profit/return charts, KPI cards, and no-actual-data guidance.
- Authenticated FIRE Goals page at `/fire-goals` with Supabase-backed goal, asset, and liability persistence, client-side retirement projections, required monthly/yearly contribution targets, and polished mission-control styling.
- Supabase schema script for `fire_goals`, `fire_assets`, and `fire_liabilities` tables with row-level security policies for user-owned FIRE planning data.
- Documentation for the FIRE Goals calculation model, persistence tables, and assumptions in `documentation/FIRE_GOALS.md`.
- Shared watchlists with owner-managed Viewer/Editor collaborator roles, email-based sharing through authenticated Vercel APIs, and Supabase RLS support in `supabase/watchlist-sharing-schema.sql`.
- Documentation for the shared watchlist model in `documentation/WATCHLIST_SHARING.md`.
- Raising Stocks quick view on the Screener page, backed by `/api/stocks?action=raising`, to find large-cap stocks with positive accelerating returns where 1M > 3M > 6M > 1Y.
- Automated paper trading results tab on the recommendations page showing score-based simulated investment, triggered trades, monthly P/L, win rate, and a detailed trade ledger for day-trade picks.
- Manual Paper Trading page with authenticated Supabase-backed paper accounts, order entry, open positions, trade history, cash/equity summaries, and separate US/India starting balances.
- Supabase schema script for `paper_accounts`, `paper_positions`, and `paper_trades` tables with row-level security policies for user-owned manual paper trading data.
- Watchlist table now includes 1M, 3M, 6M, and 1Y percentage change columns populated from Yahoo daily historical closes through the stock search API.
- PostHog-ready analytics foundation with a typed Angular `AnalyticsService`, SPA route pageview tracking, authenticated user identity sync, and conservative defaults that disable autocapture, session replay, and feature flag requests until explicitly configured.
- New luxury-themed Market News V2 page accessible at `/v2/news` with editorial card grid layout, category filter chips, and animated news cards
- New luxury-themed Breakouts V2 page accessible at `/v2/breakouts` with Top Picks section, signal filtering (bullish/bearish), and refined breakout cards
- New luxury-themed DMA Simulator V2 page accessible at `/v2/dma-simulator` with elegant timeline visualization, state banners, and quick search chips
- New luxury-themed Stock Detail V2 page accessible at `/v2/stock/:symbol` with premium dashboard layout, gauge-based technical analysis, and news feed with type filters
- All V2 pages share the consistent luxury theme with gold accents, Fraunces/Plus Jakarta Sans typography, glass morphism effects, and micro-animations
- New luxury-themed Screener V2 page accessible at `/v2/screener` with "Refined Terminal" aesthetic (Bloomberg meets high-end fintech)
- V2 theme system with CSS custom properties scoped to `.theme-v2` class, featuring deep charcoal backgrounds, gold/amber accents, and refined typography
- Editorial typography pairing: Fraunces (display/headers) and Plus Jakarta Sans (body text) via Google Fonts
- Glass morphism filter panel with inline expansion, elegant category chips, and gold accent highlights
- Editorial-style results table with 52-week range visualization bars, RSI progress indicators, and sector badges
- Animated page header with staggered entrance animations and real-time stats display
- Micro-interactions including hover effects, focus rings, skeleton loading states, and smooth transitions
- Client-side pagination with elegant numbered navigation and page size selector
- Quick technical filters (RSI oversold/overbought, MACD bullish/bearish) in stats bar
- Grain texture overlay and footer accent line for refined visual polish
- Daily DMA crossover email alert sent at 8 AM EST on weekdays via new `api/cron/daily-crossovers.ts` Vercel Cron job; scans ~325 US and India large-cap stocks for golden cross (50 DMA crosses above 200 DMA) and death cross (50 DMA crosses below 200 DMA) events on the most recent trading day
- Dark-themed HTML email with separate tables for golden crosses (bullish) and death crosses (bearish), showing symbol, name, price, 50 DMA, 200 DMA, and market for each crossover
- New shared `api/_lib/stock-lists.ts` module exporting `US_STOCKS`, `IN_STOCKS`, `fetchLargeCapStocks()`, and `getStocksToScan()` for reuse across breakouts scanner and crossover cron
- Recipients: reachtovijendra@gmail.com and poojitha.challagandla@gmail.com

### Changed
- Trades page now adopts the Watchlists and Paper visual language with a slate hero, premium summary grid, full-width segmented tabs, rounded daily recommendation cards, sticky table headers, ticker-first rows, refreshed outcome chips, and mobile-friendly horizontal tables.
- Manual Paper Trading order ticket popup no longer shows the non-interactive "Editable quote" status pill, removing confusion with clickable actions.
- Manual Paper Trading order ticket popup now uses polished field cards for quantity and execution price, plus a cleaner two-action footer for live quote refresh and order placement.
- Manual Paper Trading open positions now show P/L percentage alongside currency P/L, with tighter stock-column sizing for more balanced table spacing.
- Manual Paper Trading trade history now orders columns as Stock, Date, Action, Qty, Price, and Realized P/L for faster ticker-first review.
- Manual Paper Trading trade history now includes a ticker/company-name search filter with a clear empty-match state.
- Manual Paper Trading page now adopts the Watchlists visual language with a slate hero, spacious account summary cards, prominent centered Buy and Sell buttons that open the paper order ticket, rounded positions/history table shells, and mobile-friendly sticky stock columns.
- Screener results table sortable headers now keep sort arrows on the same line as the header label, preventing wrapped arrows in narrow columns.
- Screener header now keeps the title and descriptive copy on one baseline-aligned row at desktop widths, matching the Watchlists header treatment.
- Screener header now removes the standalone status eyebrow and right-side status metric pills, leaving only the Watchlists-style title and descriptive copy.
- Screener page styling now fully adopts the Watchlists visual language by using inherited typography, Watchlists-style header copy and stat cards, calmer slate surfaces, matching button/control weights, softer dropdown panels, and restrained table chrome while preserving the existing screening workflow.
- Screener results workbench now shows the Results header bar before the first screen is run, matching the orientation cue from the previous layout.
- Screener dropdown overlays now use a premium floating market-console visual system with deeper glass surfaces, accent rails, refined section cards, polished input chrome, upgraded preset/signal chips, and restyled nested PrimeNG multiselect menus.
- Screener filters now use a balanced six-dropdown workstation model for Universe, Valuation, Growth & Income, Momentum, Liquidity, and Technical Signals, with compact overlay cards, quick preset chips, section-level clear actions, and aligned filtering for P/S, EPS, beta, percent-from-low, RSI, and MACD signals.
- Screener page now uses a compact professional trading workstation layout with a single-line status header, dense filter/action rail, redesigned Top Losers, Top Gainers, and Raising Stocks command buttons, restyled filter dropdown overlays, an emphasized results summary row, and a premium responsive results table while preserving existing screening and quick-view behavior.
- Day trade recommendations now reject very low-ATR candidates before saving picks, preventing stale or merger-pinned quotes such as HOLX from recurring as unrealistic no-trigger setups.
- Watchlist sharing schema now includes a covering index for the `shared_by_user_id` foreign key to support future collaborator-management growth.
- Watchlists now use separate `/watchlists` and `/watchlists/:watchlistId` pages, replacing the collapsible sidebar and dock with a compact summary-and-table index and full-width stock detail view.
- Watchlist rows now use the watchlist name as the stocks-page link and remove the extra row description and Open button.
- Watchlists index table now removes the extra "All watchlists" panel header so rows start immediately below the summary.
- Watchlists index rows now expose an owner-only share icon that opens the collaborator sharing dialog.
- Watchlists index now renames the stock count column to "#Stocks" and centers its values for cleaner alignment.
- Watchlists index table now uses explicit column sizing so the name column, stock counts, and action icons are better balanced.
- Watchlist drag-and-drop now preserves the combined owned/shared display order after page refresh while still syncing owned-list `sort_order` to Supabase.
- Watchlist stocks page table headers now match the compact translucent header styling used on the Watchlists index table.
- Watchlist stocks page now refreshes only the 1D percentage column every 60 seconds while visible, expands the add-stock search field, and labels the owner share action as "Share Watchlist."
- Watchlist stocks page hero now removes the "Focused watchlist" eyebrow, uses the open space for a watchlist switcher dropdown, and removes the duplicate toolbar date.
- Watchlist stocks page switcher now uses a custom dark dropdown menu instead of the browser-native select popup.
- Fixed the watchlist stocks page switcher menu being clipped by the hero card when opened.
- Fixed the watchlist stocks page table header stacking above the open watchlist switcher menu.
- Watchlist stocks page hero now places the descriptive note beside the watchlist name and uses shorter, more consistent right-side controls.
- Watchlist stocks page hero no longer shows the visible "Switch watchlist" label above the dropdown.
- Watchlist stocks page mobile layout no longer stretches the table card into unused vertical space.
- Watchlist stocks page mobile table now keeps the ticker column sticky while horizontally scrolling and tightens table panel spacing, including the add-stock search row height.
- Watchlist stocks page table headers now remain sticky while scrolling through long stock lists.
- Portfolio Tracker Target Total Invested now displays starting balance plus target additions for the month.
- Portfolio Tracker performance summary now shows average monthly profit/loss and average monthly return for completed rows.
- Portfolio Tracker Return Radar chart now uses one color per return category and dotted target lines with solid actual lines for clearer comparison.
- Portfolio Tracker table columns now follow the sequence Starting Balance, Added, Total Invested, Ending Balance, Monthly Profit / Loss, Monthly Return %, and Overall Return %.
- Portfolio Tracker Profit / Loss values now represent monthly performance as ending balance minus starting balance and additions.
- Watchlist ticker labels now show the saved company name in a PrimeNG tooltip on hover, with a symbol fallback when no company name is stored.
- FIRE Goals page now uses a single carousel-style wizard panel with overview metrics, side arrow navigation, clickable Assets/Loans/Income summary rows, and animated transitions into detail panels.
- FIRE Goals Goal & Income panel now displays currency context as an inline note and no longer blocks saving when retirement age is not greater than current age.
- FIRE Goals overview income details now include taxation, with a saved tax-rate assumption used to calculate available-to-invest cash flow.
- FIRE Goals overview summary rows now allocate more horizontal space to detail chips so typical asset, loan, and income breakdowns stay on one line.
- FIRE Goals now autosaves when edit fields lose focus or the browser tab/window is left, replacing the visible Save Plan action and restored-draft success note.
- FIRE Goals investment and loan deletion confirmations now use a styled in-page dialog instead of the browser-native confirmation popup.
- FIRE Goals header now spells out FIRE as "Financial Independence, Retire Early."
- FIRE Goals now starts brand-new users with an empty plan and uses placeholders instead of seeded demo amounts, assets, and loans.
- FIRE Goals Goal & Income now asks for monthly spending and converts it to annual spending for saved values and FIRE calculations.
- FIRE Goals overview income chips now show annual spending while the Goal & Income form still accepts monthly spending.
- FIRE Goals investment rows now include an Exclude from plan checkbox for assets that should be saved but omitted from FIRE calculations.
- FIRE Goals Loans panel now uses a borderless add-action utility row instead of redundant section copy or table-style column labels.
- FIRE Goals Loans panel now uses modern grouped loan cards with clearer identity, balance, payment, APR, and payoff sections.
- FIRE Goals Investments panel now uses matching grouped investment cards with clearer identity, type, and current value sections.
- FIRE Goals investment cards now use a compact one-line desktop ledger with a sticky header for number, name, type, value, and the add action, with neutral value-cell styling.
- FIRE Goals Assets panel now shows a compact non-duplicative empty action state instead of a blank ledger or repeated summary when no investments have been added.
- FIRE Goals Loans panel now uses the same compact non-duplicative empty action state when no loans have been added.
- FIRE Goals loan cards now keep the add action in a matching sticky card-stack header instead of the top page action cluster.
- FIRE Goals Assets panel now combines the duplicate page and panel headings into one top-level header with the investment summary and action.
- FIRE Goals Loans panel now combines the duplicate page and panel headings into one top-level header with the loan summary and action.
- FIRE Goals now converts saved USD/INR plan amounts when the selected market changes, using a live USD/INR quote and preserving the plan's saved base currency.
- FIRE Goals loan editor now keeps APR in a full-width content column instead of squeezing it into the remove-action column.
- FIRE Goals asset and loan builders now show visible field labels and loan payoff timeline controls so users can identify balance, APR, monthly payment, remaining months, and payoff date inputs.
- FIRE Goals asset rows now use the plan-level expected return only, removing the per-asset growth override field from the UI.
- FIRE Goals Assets header now displays the current total asset value for faster review while editing rows.
- Node engine configuration now allows Node 20 or newer so Vercel can use the project-level Node 24 runtime for serverless functions.
- Watchlists now load owned and shared lists with role badges, show owner-only share controls, and gate add/remove actions for Viewer versus Editor access.
- Watchlist tables now support sortable column headers, default to live 1D percent change descending, remove the separate company-name column, and include a live 1D percent change column from quote data.
- Manual paper trading order validation now allows manually entered valid symbols with an execution price and shows an inline reason when the Place Paper Order button is disabled.
- Stock detail Technical Analysis RSI and MACD tiles now include visible "Why?" controls with polished global tooltip styling and concise explanations describing the buy, sell, or neutral threshold logic behind each signal.
- Stock detail Technical Analysis panel now uses a Signal Console layout with richer gauge cards, compact signal tiles, directional accents, and subtle one-time entrance animation.
- Stock detail price container now has a color-coded background and border: green-tinted when the stock is up, red-tinted when down, with the price text matching the direction color for clear visual emphasis.
- Stock detail header metrics now use grouped responsive sections for performance, valuation, trading range, and research data to improve desktop alignment and mobile readability.
- Manual paper trading page now uses a more compact, refined visual treatment with smaller summary cards, tighter form controls, lighter panel shadows, and denser tables.
- Stock detail header now shows 1W, 1M, 3M, 6M, YTD, and 1Y percentage changes in one row using the same color-coded styling as the Watchlists page, with earnings and analyst metrics moved below.
- Watchlists now open selected stock tables from the watchlist index instead of using the former inline watchlist panel.
- Watchlists table now uses compact column labels, tighter spacing, and smaller readable typography so more columns fit at normal browser zoom.
- Automated paper trading results now include simulated shares bought, bought and sold timing labels, separate entry and exit price columns, expanded exit reasons, planned amount formula details, and color-coded outcome badges for exit prices, exit reasons, and P/L.
- Manual paper trading open positions and trade history stock names now link to each stock's detail page.
- Manual paper trading summary now shows separate Realized P/L and Unrealized P/L cards with color-coded values while preserving the existing Total P/L card.
- Updated Angular production budget warning thresholds to match the current application size while retaining error thresholds for unexpected growth.
- Enabled PostHog analytics in production with the US Cloud host while keeping local development analytics disabled to avoid noisy test data.
- Added Vercel deployment ignore rules so local helper files, backtest data, build outputs, and local configuration are excluded from CLI deployments.
- Portfolio tracker table now shows Starting Balance before monthly additions, with additions counted separately in target and actual return calculations.
- Portfolio tracker main view now locks projection-defining setup fields after generation, requiring Reconfigure to update target initial investment, monthly addition, expected monthly return, or start date.
- Portfolio tracker setup now captures a start month and year, and generates the 10-year projection from that selected month.
- Portfolio tracker persistence is now market-specific, with separate Supabase target and actual records for US and India portfolios.
- Portfolio tracker currency inputs and generated projection displays now follow the selected market, using USD formatting for US and INR formatting for India.
- Updated the portfolio tracker setup screen to remove the actual starting investment field and show a compounded annual expected return label below the monthly return input.
- Refactored `api/_lib/handlers/market-breakouts.ts` to import stock lists from the shared `stock-lists.ts` module instead of defining them inline
- Consolidated 12 Vercel serverless functions into 4 using a router pattern to stay within the Hobby plan limit and free up 8 slots for future features
- `api/stocks.ts` router now dispatches to 7 handler functions (quote, search, screen, list, indices, technicals, dma-crossovers) based on `?action=` query parameter
- `api/market.ts` router now dispatches to 3 handler functions (indices, news, breakouts) based on `?action=` query parameter
- `api/cron/daily-picks.ts` and `api/stocks/[symbol]/news.ts` remain as standalone functions
- All handler logic moved to `api/_lib/handlers/` directory (excluded from serverless function count)
- All frontend API call URLs updated to use `?action=` pattern (e.g., `/api/stocks?action=quote&symbol=X` instead of `/api/stocks/quote?symbol=X`)
- Mock server already used the `?action=` pattern; no changes required
- Simplified `vercel.json` rewrites from 12 entries to 2 (dynamic path rewrite and SPA fallback)

### Removed
- Deleted 10 standalone endpoint files: `api/stocks/quote.ts`, `api/stocks/search.ts`, `api/stocks/screen.ts`, `api/stocks/list.ts`, `api/stocks/indices.ts`, `api/stocks/technicals.ts`, `api/stocks/dma-crossovers.ts`, `api/market/indices.ts`, `api/market/news.ts`, `api/market/breakouts.ts`

### Added
- New "DMA Simulator" screen accessible from the left sidebar; allows searching for any stock and displays all 50/200 DMA golden cross and death cross events from the last 3 years in a chronological timeline with closing prices and SMA values
- New `api/stocks/dma-crossovers.ts` Vercel endpoint that fetches 5 years of daily price data from Yahoo Finance, computes rolling 50-day and 200-day SMAs, detects all golden cross and death cross events within the last 3 years, and returns the current DMA state
- Corresponding mock server handler for local development
- Daily day-trade recommendation email sent at 8 AM EST (1 PM UTC) on weekdays via Vercel Cron to reachtovijendra@gmail.com
- New `api/cron/daily-picks.ts` endpoint that fetches ~200 US and ~50 India large-cap stocks, computes RSI/MACD/ATR technical indicators, scores each for day-trade potential, and selects the top 10 picks (7 US + 3 India)
- New `api/_lib/day-trade-scorer.ts` shared module with `scoreDayTrade()`, `calculateATR()`, and `calculateBuySellTargets()` functions; scoring factors include price action, volume surge, 52W breakout, MACD momentum, RSI sweet spot, trend support (50/200 MA), multi-day uptrend streak, and beta volatility; penalties for negative days, low volume, bearish MACD, and overbought RSI
- ATR-based buy/sell/stop-loss price targets: buy at `close - 0.3*ATR`, sell at `close + 1.0*ATR`, stop loss at `buy - 0.5*ATR`
- New `api/_lib/resend.ts` email utility using the Resend REST API via native `https` (no npm dependency); requires `RESEND_API_KEY` environment variable
- Professional HTML email template with dark theme, market index summary (S&P 500, Dow Jones, NIFTY 50), per-market pick tables (rank, symbol, score, price, buy/sell/stop targets, key signals), and a financial disclaimer footer
- Vercel Cron schedule configured in `vercel.json` with `CRON_SECRET` header verification for security

### Fixed
- Fixed Screener Universe dropdown Sector and Industry multiselect fields using the old PrimeNG field styling and sitting too close to the overlay bottom edge; the panel now has more breathing room for lower controls.
- Fixed the local API dev server to route Screener Top Losers and Top Gainers quick-view requests instead of returning an invalid request error.
- Fixed FIRE Goals asset ledger header alignment so investment row values line up with their column labels.
- Fixed FIRE Goals row deletion so confirmed investment and loan removals autosave immediately instead of reappearing after refresh.
- Fixed FIRE Goals autosave refreshing the page by updating local saved state without reloading the full FIRE plan after each save.
- Fixed FIRE Goals investment and loan saves against older Supabase schemas by retrying the goal save without `tax_rate` only when PostgREST reports that specific schema-cache miss.
- Fixed FIRE Goals draft loss on browser refresh by preserving unsaved goal, asset, and liability edits in user-scoped local browser storage until `Save Plan` syncs them to Supabase.
- Fixed shared watchlist collaborator lists to refresh immediately after share, role update, or revoke actions instead of showing stale cached results.
- Fixed the local API dev server to route watchlist sharing endpoints so the Share dialog can be tested locally with Vercel-style handlers.
- Fixed Stock Detail mobile News & Analysis filters so the type and source controls fit within the card instead of being clipped on narrow screens.
- Fixed multi-symbol stock search requests so exact-symbol batches over the supported limit return a clear error instead of silently truncating results.
- Fixed watchlist enrichment for larger lists by batching quote/performance requests so rows beyond the backend multi-symbol limit receive current price, period returns, analyst target, and earnings data.
- Fixed watchlist stock autocomplete suggestions disappearing before selection by preserving active suggestions through transient blank autocomplete events and rendering the dropdown outside the scrollable table container.
- Fixed watchlist analyst target values overlapping at normal browser zoom by separating target price and upside percentage into a structured two-line layout.
- Fixed local mock quote pricing so stale pre/post-market fields do not override regular-market prices while Yahoo reports the stock is in regular trading.
- Removed obsolete Vercel function memory configuration and resolved Sass mixed-declaration deprecation warnings in the portfolio tracker table container.
- Fixed the global header stock search dropdown being clipped by the fixed header, making autocomplete suggestions easier to read and select.
- Fixed local recommendations page showing no rows by adding the missing mock API route for `/api/stocks?action=daily-picks`, mirroring the Vercel handler against Supabase `daily_picks`.
- Fixed local watchlist analyst target and earnings columns by aligning the mock search API with Yahoo analyst target and calendar event fields, including a quoteSummary fallback when quote data omits target prices.
- Fixed watchlist stock autocomplete suggestions disappearing intermittently before selection by ignoring stale async search responses after a newer query has already populated the suggestion list.
- Fixed day-trade recommendations remaining in `Pending` state when Yahoo Finance does not return OHLC data for an evaluation-ready pick date; the evaluation cron now resolves missing-data picks as `no-trigger`, and the recommendations UI displays unevaluated non-future rows as `Not Traded`.
- Fixed the portfolio tracker actual-side calculations so changing Actual Initial updates the first actual starting/principal value without generating user-entered actual added or ending values.
- Fixed transient Supabase auth lock errors during local development by skipping immediate auto-refresh ticks when another browser tab or reload already holds the auth lock.
- Fixed portfolio target and actual uniqueness constraints to include market, allowing US and India portfolios to have rows for the same user/month without insert failures.
- Fixed portfolio setup values carrying over when switching to a market that has no saved setup yet.
- Fixed portfolio tracker target overall return percentage to calculate profit over contributed principal instead of treating monthly contributions as investment gains.
- Fixed Market News page showing 0 articles for non-market categories (Price Target, Rating, etc.) by implementing category-aware article selection in both `api/market/news.ts` and `mock-server.js`: reserves up to 10 slots per non-market category before filling remaining slots with newest articles, ensuring all categories with articles are represented in the 150-article response; updated Angular component to use API-provided category counts instead of recalculating from the limited response
- Fixed stock detail page returning "Stock not found" for every stock on Vercel by rewriting `api/stocks/search.ts` to fetch full stock quotes (price, fundamentals, volume) via `getQuote()` instead of returning only basic symbol/name from the search API; added `technicals=true` parameter support with RSI and MACD calculation from historical prices; response format now returns `{ stocks: [...] }` matching the mock server contract expected by the Angular frontend
- Fixed news article count mismatch between local (mock-server) and Vercel deployments by aligning RSS feed sources: added the missing Yahoo Finance `rssindex` general market feed to the mock server's US feeds, and aligned the stock-specific RSS endpoint URL (`finance.yahoo.com/rss/headline`) to match Vercel
- Fixed low counts for non-market news categories (Price Target, Rating, Earnings, Insider, Dividend) caused by broad market keywords (e.g., `economy`, `rally`, `yield`) being checked first in the Vercel `classifyArticleType()` function, which absorbed most articles into the `market` bucket before specific categories could match
- Restructured article classification in both `api/market/news.ts` and `mock-server.js` to check specific categories (price_target, upgrade_downgrade, earnings, insider, dividend) before broad market keywords, ensuring articles like "Apple earnings beat amid market rally" are correctly classified as `earnings` instead of `market`
- Fixed mock server's stock news `isMarketNews` override to only reclassify articles with `general` type to `market`, preserving articles that already have a specific category from the initial keyword classification
- Expanded keyword lists in Vercel `classifyArticleType()` to match the mock server's comprehensive `ARTICLE_TYPE_KEYWORDS`, adding terms such as `price objective`, `equal-weight`, `sector perform`, `initiated`, `reiterate`, `profit`, `loss`, `outlook`, `fiscal year`, `earnings call`, `bought shares`, `insider buying`, `executive`, `stock sale`, `ex-dividend`, `dividend declared`, and others

### Changed
- Pick panels (Top Picks, Day Trade Picks, Momentum Picks) now scan the full market (~1,800+ stocks from the screener API) instead of only breakout-alerted stocks (~130), identifying the best setups from the entire market
- Breakout alerts table remains unchanged, still showing recent technical crossover events for awareness
- Score search popup now uses screener data as preferred data source (screener > breakout > search API) for the most accurate scoring
- Info banners in score search popup updated to reflect screener pool status instead of breakout pool
- Loading states added to all three pick panels showing "Scanning full market..." while screener data loads

### Added
- Full market screener data integration in breakouts page: `loadScreenerStocks()` fetches all stocks with default filters on page load, market change, and auto-refresh
- `inferAlertTypes()` helper method on breakouts component to derive alert signals (golden cross, death cross, MACD, volume breakout) from raw technical data for any stock
- Supplementary "Strong Technicals" alert type in breakouts API: stocks with strong technical setups (4+ of 8 criteria) are now included in the breakout pool even without a specific crossover event, ensuring technically strong stocks are visible to the pick panels
- Informational banners in score search popup explaining whether a stock is in the screener pool or outside the current market scan
- SNDK (Sandisk) added to the US stock scan list in the mock server
- Robinhood trade icon and stock detail icon on every stock card across all pick panels and alert category panels; Robinhood icon (using the official feather logo) opens the stock on Robinhood in a new tab (US market stocks only), chart-line icon opens the stock detail page in a new tab
- Removed card-level click handler and hover effects from all stock cards; navigation is now explicit through the two action icons per card
- Custom stock-detail SVG icon (indigo-to-cyan gradient with upward chart line) used for the stock detail action button, the header brand logo, and the browser favicon

### Fixed
- Unified scoring logic across all three panels (Top Picks, Day Trade Picks, Momentum Picks) and the search popup to evaluate each stock exactly once per factor, eliminating inflated scores caused by per-alert accumulation
- Stocks are now scored identically whether found in breakouts data or searched via the API, ensuring consistent and comparable scores across all views
- Eliminated score discrepancy between panel and popup by making the popup follow the exact same data path as the panel: (1) removed breakout-alert enrichment that gave the popup different alert types than the panel, (2) fixed `changePercent || 0` coercion that converted negative values to 0 (now uses `?? 0`), (3) fixed RSI merging from two data sources (now uses single source), (4) popup now runs `deduplicateStocks()` before lookup so it resolves the same Stock object the panel uses
- CSS component style budget increased from 16kB to 32kB to accommodate growing breakouts component styles

### Changed
- Expanded pick panels from top 10 to top 15 stocks for all three panels (Top Picks, Day Trade Picks, Momentum Picks), surfacing more qualifying recommendations
- Restructured application layout with persistent left navigation sidebar visible on all pages
- Navigation links (Screener, Breakouts, News) moved from header to a 64px icon-based sidebar
- Screener filter panel converted from 280px vertical sidebar to compact horizontal dropdown bar above results table
- Each filter group (Market Cap, 52-Week, Valuation, Technical, Volume, Sectors) is now a dropdown button that opens an overlay panel
- Filter bar includes inline Run Screen and Reset buttons
- Screener results table simplified: removed embedded search textbox and filter toggle button
- Header streamlined: navigation links removed, retaining logo, stock search, market indices, and controls

### Added
- Technical Breakouts page showing stocks crossing critical technical levels
- Moving Average Crossover alerts: 50-day MA, 200-day MA, Golden Cross, Death Cross
- 52-Week Level alerts: New highs, new lows, near-high, near-low conditions
- RSI Signal alerts: Overbought (>70) and oversold (<30) conditions
- MACD Signal alerts: Bullish and bearish crossovers
- Volume Breakout alerts: Unusual trading volume (2x+ average)
- Signal type filter (All/Bullish/Bearish) with real-time counts
- Collapsible category sections for organized alert viewing
- Market News page aggregating news from large-cap stocks (>$100B market cap)
- Six news category filters: Price Target, Rating, Earnings, Insider, Dividend, General News
- Interactive category filter tabs with visual feedback and counts
- Real-time article count and source statistics
- Auto-refresh every 5 minutes with manual refresh option
- News cards with category badges, stock symbols, and time indicators
- Navigation link to News page in header
- Market news API endpoint for fetching aggregated news from multiple stocks

### Fixed
- Vercel API functions now use direct HTTP requests with crumb authentication instead of yahoo-finance2 library
- Fixed Yahoo Finance blocking requests from Vercel serverless function IPs
- API endpoints return graceful fallback data when Yahoo Finance is temporarily unavailable
- Improved error handling across all API endpoints to prevent 500 errors

### Changed
- Replaced yahoo-finance2 dependency in Vercel functions with native https module
- Updated yahoo-client.ts to use browser-like headers and crumb-based authentication
- API functions now use batch requests for improved performance

### Added
- Initial project setup with Angular 19 and PrimeNG 19
- Stock screener feature with comprehensive filtering capabilities
- Support for US (NYSE, NASDAQ) and Indian (NSE, BSE) markets
- Market cap filtering with category presets (Mega, Large, Mid, Small, Micro)
- Valuation filters: P/E ratio, Forward P/E, P/B ratio, P/S ratio
- 52-week range filters with near-high/near-low quick toggles
- Growth filters: Earnings growth, Revenue growth (YoY)
- Dividend yield filtering
- Volume filters: Average volume, Relative volume
- Moving average filters: 50-day MA, 200-day MA, Golden Cross, Death Cross
- Sector and exchange filtering
- Pre-built screening strategy presets (Value, Growth, Momentum, Dividend)
- Dark mode theme enabled by default with light mode toggle
- Market toggle for switching between US and Indian markets
- Results table with sorting, pagination, and virtual scrolling
- CSV export functionality for screening results
- Real-time market status indicator
- Backend API with Vercel serverless functions
- Yahoo Finance integration via yahoo-finance2 package
- Response caching with 5-minute TTL for API efficiency
- Dual artifactory configuration for local development and CI/CD

### Technical Implementation
- Angular 19 with standalone components architecture
- PrimeNG 19 with Aura theme preset
- Signal-based state management
- HTTP interceptor for API request handling with retry logic
- Responsive layout design
- TypeScript strict mode enabled
