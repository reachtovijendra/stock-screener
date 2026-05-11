# Stock Screener Architecture

## Overview

The Stock Screener is a full-stack application built with Angular and Vercel serverless functions, providing real-time stock screening capabilities for US and Indian markets.

## System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         User Browser                             │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │                 Angular SPA (PrimeNG)                    │    │
│  │  ┌─────────────┐  ┌──────────────┐  ┌───────────────┐   │    │
│  │  │   Header    │  │ Filter Panel │  │ Results Table │   │    │
│  │  │ (Market/    │  │  (Screening  │  │  (Data Grid)  │   │    │
│  │  │  Theme)     │  │   Criteria)  │  │               │   │    │
│  │  └─────────────┘  └──────────────┘  └───────────────┘   │    │
│  │                          │                               │    │
│  │  ┌───────────────────────┴────────────────────────────┐ │    │
│  │  │               Angular Services                      │ │    │
│  │  │  ┌──────────┐  ┌──────────┐  ┌────────────┐        │ │    │
│  │  │  │  Stock   │  │ Screener │  │   Market   │        │ │    │
│  │  │  │ Service  │  │ Service  │  │  Service   │        │ │    │
│  │  │  └────┬─────┘  └────┬─────┘  └────────────┘        │ │    │
│  │  └───────┴─────────────┴──────────────────────────────┘ │    │
│  └─────────────────────────┬───────────────────────────────┘    │
└─────────────────────────────┼────────────────────────────────────┘
                              │ HTTP/HTTPS
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Vercel Edge Network                           │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │              Serverless Functions (/api)                 │    │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐   │    │
│  │  │ /api/stocks/ │  │ /api/stocks/ │  │ /api/stocks/ │   │    │
│  │  │    quote     │  │    search    │  │    screen    │   │    │
│  │  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘   │    │
│  │         │                 │                 │           │    │
│  │  ┌──────┴─────────────────┴─────────────────┴───────┐   │    │
│  │  │              Yahoo Client (Shared)                │   │    │
│  │  │         ┌─────────────────────┐                   │   │    │
│  │  │         │   In-Memory Cache   │                   │   │    │
│  │  │         │    (5 min TTL)      │                   │   │    │
│  │  │         └─────────────────────┘                   │   │    │
│  │  └──────────────────────┬───────────────────────────┘   │    │
│  └─────────────────────────┼───────────────────────────────┘    │
└─────────────────────────────┼────────────────────────────────────┘
                              │ HTTPS
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                     Yahoo Finance API                            │
│             (Unofficial, via yahoo-finance2)                     │
└─────────────────────────────────────────────────────────────────┘
```

## Frontend Architecture

### Technology Stack
- Angular 19 with standalone components
- PrimeNG 19 UI component library
- Signal-based state management
- SCSS for styling

### Application Layout

The application uses a shell layout with three major zones:

1. **Header** (top, sticky): Logo, stock search autocomplete, market indices, market toggle, theme toggle
2. **Left Navigation Sidebar** (64px, sticky, all pages): Icon-based links to Screener, Breakouts, and News
3. **Page Content** (flexible): Route-specific content fills the remaining space

The sidebar is defined in `app.component.ts` and is always visible regardless of which page is active.

### Component Structure

```
src/app/
├── core/
│   ├── models/           # TypeScript interfaces
│   │   ├── stock.model.ts
│   │   └── filter.model.ts
│   ├── services/         # Business logic
│   │   ├── stock.service.ts
│   │   ├── screener.service.ts
│   │   ├── market.service.ts
│   │   └── theme.service.ts
│   └── interceptors/     # HTTP interceptors
│       └── api.interceptor.ts
├── features/
│   ├── screener/         # Screener feature
│   │   ├── screener.component.ts
│   │   ├── filter-panel/   # Horizontal dropdown filter bar
│   │   └── results-table/
│   ├── breakouts/        # Technical breakouts feature
│   ├── market-news/      # Market news feature
│   └── stock-detail/     # Individual stock detail page
└── layout/
    └── header/
```

### Screener Filter Layout

The screener filter panel is a horizontal bar above the results table. Each filter group (Market Cap, 52-Week, Valuation, Technical, Volume, Sectors) is a dropdown trigger button. Clicking a button opens a PrimeNG OverlayPanel with that section's filter controls. The bar also includes Run Screen, Reset, and a Raising Stocks quick-view action that loads large-cap stocks with positive accelerating returns where 1M > 3M > 6M > 1Y.

### State Management

The application uses Angular Signals for reactive state management:

- `ScreenerService`: Manages filter state, results, pagination, and sorting
- `MarketService`: Handles market selection (US/India) with localStorage persistence
- `PortfolioTrackerService`: Persists market-specific portfolio targets and actuals in Supabase
- `PaperTradingService`: Persists market-specific manual paper trading accounts, positions, and trade history in Supabase
- `FireGoalsService`: Persists authenticated FIRE goals, assets, and liabilities in Supabase while client-side utilities calculate net worth, target gaps, required contributions, and yearly projections
- `WatchlistService`: Loads owned and shared watchlists from Supabase, annotates access roles, and routes owner-only sharing actions through Vercel APIs
- `AnalyticsService`: Owns PostHog initialization, SPA route pageviews, typed event capture, and authenticated identity sync
- `ThemeService`: Manages dark/light theme with persistence

### Data Flow

```
User Action → Component → Service (Signal Update) → HTTP Request → 
API Response → Service (Signal Update) → Component (Re-render)
```

### Analytics

The Angular app initializes analytics through `AnalyticsService` from the root `AppComponent`. The service is PostHog-compatible and remains disabled until a public PostHog project key is configured in the Angular environment. It captures Angular route changes as `$pageview` events and identifies authenticated users by Supabase user ID while limiting identity properties to email domain and auth provider. Autocapture, session replay, and feature flag requests are disabled by default to control free-tier usage.

See `documentation/ANALYTICS.md` for provider recommendation, configuration, and event guidelines.

## Backend Architecture

### API Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/stocks?action=quote` | GET | Single or batch stock quotes |
| `/api/stocks?action=search` | GET | Symbol/name search |
| `/api/stocks?action=screen` | POST | Run screening with filters |
| `/api/stocks?action=raising` | GET | Run the Raising Stocks quick view for the selected market |
| `/api/stocks?action=list` | GET | Get available stock list |
| `/api/stocks?action=indices` | GET | Market index data |
| `/api/watchlists/share` | GET/POST | List collaborators for an owned watchlist or share by email |
| `/api/watchlists/share/{shareId}` | PATCH/DELETE | Update collaborator role or revoke access |

### Caching Strategy

- In-memory cache with 5-minute TTL
- Cache key: `{symbol}-{market}`
- Maximum cache size: 1000 entries
- Automatic eviction of oldest entries

### Rate Limiting

Yahoo Finance has unofficial rate limits. Mitigations:
- Server-side caching reduces redundant calls
- Batch requests where possible
- Request queuing in yahoo-finance2

## Data Models

### Portfolio Tracker

Portfolio tracker data is user-specific and market-specific. The `portfolio_targets` and `portfolio_actuals` tables include a `market` field (`US` or `IN`) so users can maintain separate US and India portfolios without overwriting projections or actual values. Projections contain 120 monthly rows and start from the user-selected start month and year. The tracker displays starting balance before monthly additions, then counts monthly additions separately when calculating target and actual returns.

### Day Trade Recommendations

Daily picks are generated by the `api/cron/daily-picks.ts` Vercel Cron job and evaluated after the trading day by `api/cron/evaluate-picks.ts`. Evaluation fetches Yahoo Finance OHLC bars for the pick date and writes a final `outcome` to `daily_picks`. Same-day picks become eligible after the relevant market close buffer. If Yahoo Finance does not return an OHLC bar for an evaluation-ready pick date, the evaluator resolves the pick as `no-trigger` with zero P&L instead of leaving the row pending indefinitely. The Angular recommendations view also treats unevaluated non-future rows as `Not Traded` so the UI does not display old recommendations as pending.

The recommendations view includes an automated paper trading results tab. It computes score-based simulated position sizes from the selected month of `daily_picks` rows and reports monthly P/L without writing a second simulation table.

### Manual Paper Trading

Manual paper trading is an authenticated feature at `/paper-trading`. It uses Supabase tables defined in `supabase/paper-trading-schema.sql`:

- `paper_accounts`: user-specific and market-specific starting cash and cash balance.
- `paper_positions`: current open positions by user, market, and symbol.
- `paper_trades`: filled order history with realized P/L on sell orders.

The page starts users with USD 100,000 in the US market and INR 10,00,000 in the India market. Order prices default from the quote API and remain editable before confirmation.

### FIRE Goals

FIRE Goals is an authenticated feature at `/fire-goals`. It uses `FireGoalsService` with the authenticated Supabase client to load and save a user's primary retirement plan, assets, and liabilities. The first version keeps projection calculations in the Angular client so edits remain responsive and no additional serverless API endpoint is required.

The persistence schema is defined in `supabase/fire-goals-schema.sql`:

- `fire_goals`: stores the retirement timeline, target FIRE amount, expected annual return, inflation assumption, income, spending, and preferred currency.
- `fire_assets`: stores user-owned asset rows linked to a goal, with category, current value, and optional growth override.
- `fire_liabilities`: stores user-owned liability rows linked to a goal, with balance, APR, monthly payment, and optional payoff metadata.

All three tables enable row-level security and restrict reads and writes to rows owned by `auth.uid()`. See `documentation/FIRE_GOALS.md` for calculation assumptions and user workflow details.

### Watchlists

Watchlists are authenticated Supabase-backed records. Owned lists are stored in `watchlists`, stock rows are stored in `watchlist_items`, and collaborator access is stored in `watchlist_shares`.

The sharing model supports three UI roles:

- `owner`: can rename, delete, reorder owned lists, add or remove stocks, and manage collaborators.
- `editor`: can read the shared list and add or remove stocks.
- `viewer`: can read, sort, and navigate the shared list but cannot modify it.

The browser never queries Supabase Auth email addresses directly. Sharing by email is handled by Vercel serverless endpoints that validate the caller's Supabase access token, verify watchlist ownership, resolve the recipient with service-role access, and write `watchlist_shares`.

See `documentation/WATCHLIST_SHARING.md` for endpoint details, RLS expectations, and required environment variables.

### Stock Quote

```typescript
interface Stock {
  symbol: string;
  name: string;
  price: number;
  change: number;
  changePercent: number;
  market: 'US' | 'IN';
  marketCap: number;
  peRatio: number | null;
  forwardPeRatio: number | null;
  fiftyTwoWeekHigh: number;
  fiftyTwoWeekLow: number;
  earningsGrowth: number | null;
  dividendYield: number | null;
  volume: number;
  sector: string;
  // ... additional fields
}
```

### Screening Filters

```typescript
interface ScreenerFilters {
  market: 'US' | 'IN';
  marketCap: MarketCapFilter;
  peRatio: RangeFilter;
  fiftyTwoWeek: FiftyTwoWeekFilter;
  movingAverages: MovingAverageFilter;
  sectors: string[];
  // ... additional filters
}
```

## Security Considerations

- No sensitive data stored on client
- API calls proxied through Vercel (no direct Yahoo Finance exposure)
- Supabase service-role access is restricted to serverless functions; watchlist sharing APIs validate caller ownership before resolving user emails or mutating shares
- CORS headers configured for same-origin requests
- Content Security Policy headers set

## Performance Optimizations

- Lazy loading of routes
- Virtual scrolling for large result sets
- Debounced filter updates
- Response caching at API level
- Efficient change detection with Signals

## Deployment

- Frontend: Vercel static hosting
- Backend: Vercel serverless functions
- CDN: Vercel Edge Network
- Supabase stores authenticated user data such as watchlists and market-specific portfolio tracker records
