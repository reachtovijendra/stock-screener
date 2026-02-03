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
│   └── screener/         # Main feature module
│       ├── screener.component.ts
│       ├── filter-panel/
│       └── results-table/
└── layout/
    └── header/
```

### State Management

The application uses Angular Signals for reactive state management:

- `ScreenerService`: Manages filter state, results, pagination, and sorting
- `MarketService`: Handles market selection (US/India) with localStorage persistence
- `ThemeService`: Manages dark/light theme with persistence

### Data Flow

```
User Action → Component → Service (Signal Update) → HTTP Request → 
API Response → Service (Signal Update) → Component (Re-render)
```

## Backend Architecture

### API Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/stocks/quote` | GET | Single or batch stock quotes |
| `/api/stocks/search` | GET | Symbol/name search |
| `/api/stocks/screen` | POST | Run screening with filters |
| `/api/stocks/list` | GET | Get available stock list |
| `/api/stocks/indices` | GET | Market index data |

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
- No database required (data from Yahoo Finance)
