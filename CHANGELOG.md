# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed
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
