# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Authenticated FIRE Goals page at `/fire-goals` with Supabase-backed goal, asset, and liability persistence, client-side retirement projections, required monthly/yearly contribution targets, and polished mission-control styling.
- Supabase schema script for `fire_goals`, `fire_assets`, and `fire_liabilities` tables with row-level security policies for user-owned FIRE planning data.
- Documentation for the FIRE Goals calculation model, persistence tables, and assumptions in `documentation/FIRE_GOALS.md`.
- Shared watchlists with owner-managed Viewer/Editor collaborator roles, email-based sharing through authenticated Vercel APIs, and Supabase RLS support in `supabase/watchlist-sharing-schema.sql`.
- Documentation for the shared watchlist model in `documentation/WATCHLIST_SHARING.md`.
- Raising Stocks quick view on the Screener page, backed by `/api/stocks?action=raising`, to find large-cap stocks with positive accelerating returns where 1M > 3M > 6M > 1Y.
- Automated paper trading results tab on the recommendations page showing score-based simulated investment, triggered trades, monthly P/L, win rate, and a detailed trade ledger for day-trade picks.
- Manual Paper Trading page with authenticated Supabase-backed paper accounts, order entry, open positions, trade history, cash/equity summaries, and separate US/India starting balances.
- Supabase schema script for `paper_accounts`, `paper_positions`, and `paper_trades` tables with row-level security policies for user-owned manual paper trading data.
- Watchlist table now includes 1M, 3M, and 6M percentage change columns populated from Yahoo daily historical closes through the stock search API.
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
- Portfolio Tracker table columns now follow the sequence Starting Balance, Added, Total Invested, Ending Balance, Profit / Loss, Monthly Return %, and Overall Return %.
- Watchlist ticker labels now show the saved company name in a PrimeNG tooltip on hover, with a symbol fallback when no company name is stored.
- FIRE Goals page now uses a single carousel-style wizard panel with overview metrics, side arrow navigation, clickable Assets/Loans/Income summary rows, and animated transitions into detail panels.
- FIRE Goals Goal & Income panel now displays currency context as an inline note and no longer blocks saving when retirement age is not greater than current age.
- FIRE Goals overview income details now include taxation, with a saved tax-rate assumption used to calculate available-to-invest cash flow.
- FIRE Goals overview summary rows now allocate more horizontal space to detail chips so typical asset, loan, and income breakdowns stay on one line.
- FIRE Goals header now spells out FIRE as "Financial Independence, Retire Early."
- FIRE Goals now starts brand-new users with an empty plan and uses placeholders instead of seeded demo amounts, assets, and loans.
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
- Collapsed watchlists rail now shows a rotated vertical "Click to see watchlists" prompt, total watchlist count, and keeps the dock control aligned to the right side of the expanded panel.
- Collapsed watchlists panel now expands when clicking anywhere on the collapsed panel, not just the dock icon.
- Watchlists panel now auto-collapses after selecting a watchlist so the stock table has more room immediately.
- Watchlists page now includes a pin-style collapsible dock for the watchlist panel so the table can use more horizontal space.
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
