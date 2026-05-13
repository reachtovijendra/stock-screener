# Trades Page Redesign Implementation Plan

## Summary

Redesign the `/recommendations` route, labeled as Trades in the sidebar, so it aligns with the completed Watchlists and Manual Paper Trading visual language while preserving the existing recommendation and automated simulation behavior.

## Scope

- Replace the flat Recommendations header with a slate hero containing the Trades eyebrow, page title, supporting copy, market chip, and month navigation.
- Convert summary strips into metric card grids that match the Paper page card hierarchy and positive, negative, and pending value accents.
- Restyle the tab selector as a rounded segmented control for Recommendations and Automated Paper Results.
- Present recommendation date groups as rounded daily cards with outcome chips and responsive table shells.
- Keep stock identity cells ticker-first with company, sector, Robinhood link, and stock detail link.
- Present automated paper results with an information card, premium metric cards, and a rounded ledger table with preserved planned-investment explanations.
- Preserve existing recommendation data loading, outcome logic, month navigation, stock navigation, and automated simulation calculations.

## Verification

- Run Angular lint diagnostics for the touched component and documentation files.
- Run `npm run build`.
- Run the Recommendations component tests or the available Angular test suite to preserve behavior around stale picks, pending picks, automated paper results, and planned-investment explanations.
