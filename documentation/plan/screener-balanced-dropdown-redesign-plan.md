# Screener Balanced Dropdown Redesign Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use executing-plans to implement this plan task-by-task.

**Goal:** Redesign the Screener filters into a balanced trading workstation with fewer, clearer dropdowns and matching service/API behavior for correct results.

**Architecture:** Keep the existing Angular standalone Screener components and signal-based `ScreenerService`. Consolidate the filter rail into six dropdown cards: Universe, Valuation, Growth & Income, Momentum, Liquidity, and Technical Signals. Extend the screen API filtering so UI controls map to real server-side filters where quote data already exists, while keeping expensive RSI/MACD enrichment as explicit technical behavior.

**Tech Stack:** Angular 19 standalone components, Angular signals, PrimeNG OverlayPanel/Checkbox/MultiSelect/SelectButton, Vercel API handlers, Yahoo quote data.

---

## Task 1: Align Filter Behavior

**Files:**
- Modify `src/app/core/services/screener.service.ts`
- Modify `api/_lib/handlers/stocks-screen.ts`

**Steps:**
1. Add client-side filtering support for `psRatio`, `eps`, `beta`, and `fiftyTwoWeek.percentFromLow`.
2. Add active filter count coverage for `psRatio`, `eps`, `beta`, RSI zones, MACD signals, and `fiftyTwoWeek.percentFromLow`.
3. Add server-side screen filtering for `psRatio`, `eps`, `beta`, and `fiftyTwoWeek.percentFromLow`.
4. Keep RSI/MACD as explicit technical signals that are calculated after a result universe is available, unless a later API enrichment pass is approved.

## Task 2: Redesign Dropdown Structure

**Files:**
- Modify `src/app/features/screener/filter-panel/filter-panel.component.ts`

**Steps:**
1. Replace the current seven triggers with six balanced triggers: Universe, Valuation, Growth & Income, Momentum, Liquidity, Technical Signals.
2. Move Sector and Industry into Universe.
3. Move 52-week and moving-average filters into Momentum.
4. Move RSI/MACD signal chips into Technical Signals.
5. Add quick preset chips inside dropdowns for common actions while keeping manual range inputs available.
6. Add per-section clear actions so users can reset one dropdown without wiping the whole screen.

## Task 3: Workstation Dropdown Styling

**Files:**
- Modify `src/app/features/screener/filter-panel/filter-panel.component.ts`

**Steps:**
1. Use compact overlay cards with header, active count, body groups, and footer actions.
2. Style preset chips, range fields, checkbox tiles, and multi-selects consistently with the slate/cyan workstation surface.
3. Keep dropdowns dense enough to preserve result-table vertical space.

## Task 4: Documentation And Verification

**Files:**
- Modify `CHANGELOG.md`
- Modify `documentation/ARCHITECTURE.md`

**Steps:**
1. Document the balanced dropdown model and API filtering alignment.
2. Run `npm run build`.
3. Run focused Screener service tests.
4. Run linter diagnostics on edited files.
