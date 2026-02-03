# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
