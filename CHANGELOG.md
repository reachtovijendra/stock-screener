# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
