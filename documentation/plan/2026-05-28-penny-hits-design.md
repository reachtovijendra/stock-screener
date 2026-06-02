# Design: Penny Hits

Date: 2026-05-28
Status: Superseded in part (see update below)

> Update (2026-06-02): The daily cron + Supabase snapshot described here has been
> replaced by a live, request-time two-stage funnel. Stage 1 ranks the live Yahoo
> penny universe on direction-aware momentum + volume, trend/MA structure, analyst
> conviction + upside, and growth (hard gates require an up day and reject deep
> downtrends; an anti-chase penalty de-rates parabolic/blow-off names) and narrows
> to a ~20-name shortlist. Stage 2 enriches only the shortlist with Finnhub (news
> catalysts + recommendation trend), applies sentiment filtering, blends a catalyst
> factor (catalyst 25 / momentum+volume 25 / trend 20 / analyst+upside 20 / growth 10),
> and returns the top 15. Results are cached in memory (~3-5 min, single-flight) and
> fall back to a Yahoo-only list when Finnhub is unavailable. The `/api/cron/penny-hits`
> job and the `penny_hits` Supabase dependency have been retired.

## Summary

Penny Hits is a US-only, catalyst-driven screen for low-priced stocks (price under $20, with no
market-capitalization minimum). Each candidate receives a composite "Penny Hit Score" (0-100) that
weights real news catalysts most heavily, followed by analyst conviction, growth/upside potential,
insider buying, and buying activity. Results are computed by a daily cron job, cached in Supabase,
and read instantly by a dedicated `/penny-hits` page and a Screener quick-view button.

## Confirmed decisions

- Market scope: US only for v1 (Finnhub free-tier data is US-centric).
- Compute strategy: daily cron precompute and Supabase cache (mirrors the existing daily-picks flow).
- Score weights: Catalyst 40, Analyst 15, Growth 15, Insider 15, Activity 15.
- Hard gates: price between $1 and $20, average volume of at least 100,000 shares/day, no market-cap minimum.
- Data provider: Finnhub free tier (`company-news`, `stock/insider-transactions`, `stock/recommendation`).
- UI: dedicated `/penny-hits` page (primary) plus a Screener quick-view button.

## Architecture and data flow

1. The daily cron `api/cron/penny-hits.ts` runs before US market open.
2. `fetchPennyUniverse('US')` (in `api/_lib/yahoo-client.ts`) queries the Yahoo screener for
   price under $20, price at least $1, average 3-month volume of at least 100k, on US exchanges,
   sorted by trading volume. Unlike `fetchScreenerStocks`, it applies no $1B market-cap floor.
3. A cheap quote-only pre-score (`preScorePenny`) ranks the universe; the top ~50 candidates are kept
   for enrichment (capped by the Finnhub 60-calls/minute free-tier limit).
4. Each candidate is enriched with:
   - Performance/momentum via `enrichStockWithPerformance`.
   - Finnhub news (classified into catalyst tags by `api/_lib/penny-catalyst.ts`), insider summary,
     and analyst recommendation trend (via `api/_lib/finnhub-client.ts`).
5. `scorePennyHit` computes the weighted composite, catalyst badges, and a one-line thesis.
6. The top 25 are upserted into the Supabase `penny_hits` table via `savePennyHits`.
7. `GET /api/stocks?action=penny-hits&market=US` returns the latest cached rows. The `/penny-hits`
   page and the Screener quick-view consume this endpoint.

## Scoring model

Each factor is normalized to 0-1 and multiplied by its weight; the sum is the 0-100 score.

- Catalyst (40%): strongest detected catalyst weight. Contract wins and FDA/approvals are the
  highest-weighted events.
- Analyst (15%): `recommendationMean` (Strong Buy bias), analyst coverage count, and a bonus when the
  Finnhub strong-buy count is rising.
- Growth/upside (15%): upside to `targetMeanPrice` plus earnings/revenue growth.
- Insider (15%): net insider purchases over the last ~90 days.
- Activity (15%): relative-volume surge plus momentum (1-month change or distance above the 50-day MA).

## Components and files

Backend / API:
- `api/_lib/finnhub-client.ts` — Finnhub client with rate limiter and graceful degradation.
- `api/_lib/penny-catalyst.ts` — news-headline catalyst classifier.
- `api/_lib/penny-hits-scorer.ts` — pre-score, gates, and weighted composite scoring.
- `api/_lib/yahoo-client.ts` — added `fetchPennyUniverse()` and shared `mapYahooScreenerQuote()`.
- `api/_lib/supabase-client.ts` — added `PennyHitRow` and `savePennyHits()`.
- `api/_lib/handlers/stocks-penny-hits.ts` — list handler reading the latest cached rows.
- `api/stocks.ts` — routes `action=penny-hits`.
- `api/cron/penny-hits.ts` — daily compute job; registered in `vercel.json` (`0 12 * * 1-5`).
- `mock-server.js` — local-dev parity route for `action=penny-hits`.

Frontend:
- `src/app/core/services/penny-hits.service.ts` — loads and exposes cached Penny Hits.
- `src/app/features/penny-hits/penny-hits.component.ts` — dedicated card-grid page.
- `src/app/app.routes.ts` — `/penny-hits` route.
- `src/app/app.component.ts` — sidebar navigation item.
- `src/app/core/services/screener.service.ts` — `runPennyHits()` quick view and row mapping.
- `src/app/features/screener/filter-panel/filter-panel.component.ts` — quick-view button.

Database:
- Supabase table `penny_hits` (unique on `market, pick_date, symbol`) with a public read policy and a
  `(market, pick_date desc, score desc)` index.

## Configuration

- `FINNHUB_API_KEY` must be set in `.env.local` (local) and the Vercel project Environment Variables
  (production). Obtain a free key at finnhub.io. When the key is absent, the scorer degrades gracefully
  to quote-only signals (the catalyst factor contributes 0) so the feature still renders.

## Notes and risks

- The Finnhub free-tier rate limit (60 calls/minute) is why enrichment is capped to ~50 candidates and
  run in a cron rather than live per request.
- Social-media buzz is approximated in v1 by relative-volume spikes and news-article counts; a true
  social data source is a later phase.
- India support is out of scope for v1.
