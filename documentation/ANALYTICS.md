# Analytics

## Overview

The application includes a lightweight analytics foundation through `AnalyticsService`. The service is designed for PostHog Cloud Free and keeps usage controlled by default. Analytics remains disabled until a public PostHog project key is configured in the Angular environment.

## Provider

Recommended provider: PostHog Cloud Free.

Rationale:
- Product analytics supports page views, funnels, and named product events.
- The free tier is sufficient for early usage when instrumentation is controlled.
- Session replay and feature flags can be enabled later without replacing the integration.

## Configuration

Analytics configuration lives in:
- `src/environments/environment.ts`
- `src/environments/environment.development.ts`

Production configuration:

```typescript
analytics: {
  enabled: true,
  posthogKey: '<PostHog project token>',
  posthogHost: 'https://us.i.posthog.com',
}
```

Local development remains disabled in `src/environments/environment.development.ts` to avoid sending noisy local and test events. The PostHog project token is browser-safe and is not a secret.

## Cost Controls

The initial PostHog configuration intentionally limits event volume:

- `autocapture: false` disables broad click/input autocapture.
- `capture_pageview: false` disables automatic pageview capture so Angular route changes are captured once by the app.
- `disable_session_recording: true` keeps session replay off until there is a clear diagnostic need.
- `advanced_disable_feature_flags: true` prevents feature flag requests until flags are intentionally adopted.

These defaults keep the integration focused on route pageviews and explicitly named product events.

## Captured Data

The service currently captures:

- SPA route changes as `$pageview` events.
- Authenticated user identity by Supabase user ID.
- Email domain and auth provider as identity properties.

The service does not send full email addresses as analytics properties.

## Adding Product Events

Components should inject `AnalyticsService` and call `capture()` with one of the typed event names. Keep events decision-grade and avoid high-volume UI noise.

Example:

```typescript
this.analytics.capture('screener_run', {
  market: this.marketService.currentMarket(),
  resultCount: stocks.length,
});
```

Add new event names to `AnalyticsEventName` in `src/app/core/services/analytics.service.ts` before capturing them.
