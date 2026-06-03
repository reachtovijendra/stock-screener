# Design: Stock Forecast & Recommendation Panel

Date: 2026-06-02
Status: Implemented

## Goal

Add a trust-building feature to the stock detail page (`/stock/:symbol`) that answers
three questions with full transparency:

1. Should I buy, hold, or sell?
2. What is the 12-month target price?
3. Why? (the analysis behind the call)

## Key decisions

- Recommendation engine is a transparent, deterministic model (no external AI/LLM).
  Every number is traceable to its inputs and is reproducible: the same inputs always
  produce the same forecast.
- Computation runs client-side over data the page already loads, so there is no new
  serverless endpoint, no API key, and no incremental cost or latency.
- Scope (first version): 12-month recommendation, a 5-year scenario projection chart,
  and actionable trade levels.

## Inputs

All from the already-loaded `Stock` object (`?action=search&technicals=true&performance=true`)
plus the per-symbol news feed:

- Price, 52-week high/low and distances.
- 50- and 200-day moving averages and distances.
- RSI, MACD signal type.
- Trailing/forward P/E, forward EPS, earnings growth, revenue growth, beta, dividend yield.
- Analyst `targetMeanPrice` / `targetHighPrice` / `targetLowPrice`, `numberOfAnalystOpinions`,
  `recommendationMean`.
- Multi-period performance (1W/1M/3M/6M/YTD/1Y).
- News catalyst `type` values (price_target, upgrade_downgrade, earnings, etc.).

## Model pipeline

1. Weighted base valuation — blends independent fair-value estimates into a single base:
   current price (20%, the market anchor), forward earnings value at a growth-justified
   multiple (40%), analyst consensus weighted by coverage (20%), and a moving-average trend
   value (20%). Forward earnings is the dominant leg and analyst consensus is intentionally
   minor, because analyst targets lag badly on fast movers (they anchored QCOM to a Sell at
   -17% while it traded near its highs).
   - Growth for the multiple comes from implied forward-vs-trailing EPS (`forwardEps/eps - 1`),
     clamped to a believable band, not Yahoo's single-quarter YoY `earningsGrowth`/`revenueGrowth`
     (often null for large caps, or distorted by one-off base effects — observed +173% / +431%
     quarters). The contraction guard triggers on forward EPS below trailing EPS, not a noisy
     quarterly revenue print.
   - A market-multiple cap limits the forward leg to at most 1.3x the multiple the market
     assigns (`forwardPeRatio`), with fair value capped at 1.75x price. A low market multiple
     usually encodes real risk (cyclicality, patent cliffs, depressed-but-recovering earnings),
     so this prevents value-trap names with temporarily depressed trailing EPS from showing
     unrealistic upside while leaving genuine market-validated growth (high-multiple names)
     intact.
2. Adjustment waterfall — applies small, labeled +/- tilts (growth, trend & momentum,
   technical signal, analyst pull, volatility/beta, 52-week positioning) to the base to
   reach the 12-month target. The target is clamped to the analyst high/low band when
   available, then to a global sanity band.
3. Conviction score (0-100) — weighted blend of upside-to-target (40%), technical (20%),
   momentum (15%), analyst rating (15%), and valuation/PEG (10%); weights renormalize when
   inputs are missing. Buckets map to Strong Sell .. Strong Buy.
4. Confidence (0-100) — from analyst coverage breadth, agreement (low dispersion) among the
   valuation estimates, and directional alignment of the factors with the call.
5. Multi-year scenarios — optimistic / target / conservative paths compounding the 12-month
   call over five years; the conservative floor is capped below price so a high MA in a
   downtrend cannot prop the bear case above the current price. Ordering
   conservative < target < optimistic is enforced.
6. Trade plan — entry zone (pullback band snapping to the 50-day MA support), tactical target
   (nearest resistance below the 12-month target, never a fabricated upside), volatility/MA
   based stop-loss, and reward:risk (null when there is no positive reward).
7. Bull / bear cases — deterministic, templated bullets keyed to the factor states that drove
   the score, enriched with catalyst types from the news feed.

## UI

- Header CTA button ("Price Forecast") that also previews the call + upside when collapsed.
- Full-width collapsible panel inserted above the existing two-column content grid; the page
  switches to a scrollable layout while the panel is open so nothing is clipped by the
  height-locked dashboard layout.
- Sections: The Call hero (recommendation pill, conviction, confidence meter, current vs
  target, bear/bull band), How we got there, Our adjustments, 5-year projection chart +
  scenario cards, Trade plan, Bull/Bear cases, and a sources + disclaimer footer.
- Styled with the page's dark "terminal" tokens and gradient/card system. The projection chart
  uses PrimeNG `p-chart` (chart.js, already a dependency).

## Files

- New: `src/app/features/stock-detail/forecast-engine.ts` — types and pure functions.
- Edited: `src/app/features/stock-detail/stock-detail.component.ts` — `ChartModule` import,
  `showForecast` signal, `forecast`/chart computed signals, header CTA, panel template, styles.

## Disclaimer

The panel explicitly labels the output as a model-based estimate generated from live data,
not financial advice.
