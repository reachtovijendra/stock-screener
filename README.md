# Stock Screener

A professional stock screening application for US and Indian markets built with Angular 19 and PrimeNG.

## Features

- **Multi-Market Support**: Switch between US (NYSE, NASDAQ) and Indian (NSE, BSE) markets
- **Comprehensive Filters**: Screen stocks by:
  - Market Capitalization (Mega, Large, Mid, Small, Micro cap)
  - Valuation Metrics (P/E, Forward P/E, P/B, P/S ratios)
  - 52-Week Range (distance from highs/lows)
  - Growth Metrics (Earnings growth, Revenue growth)
  - Dividend Yield
  - Volume (Average volume, Relative volume)
  - Moving Averages (50-day, 200-day, Golden/Death cross)
  - Sector filtering
- **Pre-built Screening Strategies**: Quick presets for value, growth, momentum, and dividend investing
- **Dark Mode**: Professional dark theme by default with light mode option
- **Real-time Data**: Stock quotes via Yahoo Finance (15-20 min delayed)
- **Export**: Download screening results to CSV

## Tech Stack

- **Frontend**: Angular 19 (standalone components)
- **UI Library**: PrimeNG 19 with Aura theme
- **Backend**: Vercel Serverless Functions
- **Data Source**: Yahoo Finance via yahoo-finance2
- **Deployment**: Vercel

## Getting Started

### Prerequisites

- Node.js 18+
- npm 9+

### Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd stock-screener
```

2. Install dependencies:
```bash
npm install
```

### Local Development

Start the development server with the API proxy:

```bash
npm run start:dev
```

This runs both:
- Angular dev server at http://localhost:4200
- Vercel API functions at http://localhost:3000

Alternatively, run them separately:

```bash
# Terminal 1: API server
npm run api:dev

# Terminal 2: Angular app
npm start
```

### Building for Production

```bash
npm run build
```

Build output will be in `dist/stock-screener/browser`.

## Artifactory Configuration

### Local Development (Private Artifactory)

1. Copy the template and configure your Artifactory URL:
```bash
cp .npmrc.local.example .npmrc.local
```

2. Edit `.npmrc.local` with your Artifactory details:
```ini
registry=https://your-artifactory.com/api/npm/npm-repo/
//your-artifactory.com/api/npm/npm-repo/:_authToken=${NPM_TOKEN}
```

3. Set your NPM token:
```bash
export NPM_TOKEN=your-token-here
```

4. Switch to local config:
```bash
npm run preinstall:local
npm install
```

### CI/CD and Vercel (Public NPM)

The default `.npmrc` uses the public npm registry. For CI/CD:

```bash
npm run preinstall:ci
npm install
```

## Deployment to Vercel

1. Install Vercel CLI:
```bash
npm i -g vercel
```

2. Deploy:
```bash
vercel
```

3. For production:
```bash
vercel --prod
```

## Project Structure

```
stock-screener/
├── src/
│   ├── app/
│   │   ├── core/
│   │   │   ├── models/          # TypeScript interfaces
│   │   │   ├── services/        # Angular services
│   │   │   └── interceptors/    # HTTP interceptors
│   │   ├── features/
│   │   │   └── screener/        # Main screener feature
│   │   ├── layout/
│   │   │   └── header/          # App header component
│   │   └── shared/              # Shared components
│   ├── environments/            # Environment configs
│   └── styles.scss              # Global styles
├── api/                         # Vercel serverless functions
│   ├── _lib/                    # Shared API utilities
│   └── stocks/                  # Stock API endpoints
├── vercel.json                  # Vercel configuration
└── package.json
```

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/stocks/quote` | GET | Get single/multiple stock quotes |
| `/api/stocks/search` | GET | Search stocks by name/symbol |
| `/api/stocks/screen` | POST | Run stock screening with filters |
| `/api/stocks/list` | GET | Get list of available stocks |
| `/api/stocks/indices` | GET | Get market indices data |

## Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `NPM_TOKEN` | Artifactory auth token | - |

### Environment Files

- `environment.ts` - Production configuration
- `environment.development.ts` - Development configuration

## Contributing

1. Create a feature branch
2. Make your changes
3. Run tests: `npm test`
4. Submit a pull request

## License

Private - All rights reserved
