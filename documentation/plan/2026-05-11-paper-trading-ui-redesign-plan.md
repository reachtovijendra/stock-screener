# Paper Trading UI Redesign Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Redesign the Manual Paper Trading page with a professional, spacious, mobile-compatible interface that matches the Watchlists look and feel and uses a paper order ticket popup for order entry.

**Architecture:** Keep the existing Angular standalone component, reactive form, signals, and `PaperTradingService` behavior. Use PrimeNG Dialog for modal order entry while preserving the existing form controls, quote loading, validation, persistence, and calculations.

**Tech Stack:** Angular standalone component, Reactive Forms, PrimeNG Button/InputNumber/Toast/ProgressSpinner, SCSS, Watchlists-inspired responsive table styling.

---

### Task 1: Restructure the Paper Trading Template

**Files:**
- Modify: `src/app/features/paper-trading/paper-trading.component.html`

**Steps:**
- Replace the compact page header with a Watchlists-style hero containing the Paper title, descriptive copy, market chip, and reset action.
- Keep the loading and disabled-account states, but restyle the enable state as a spacious card with clear starting-cash context.
- Rework the enabled account view into summary cards, a trade action bar, an open-positions panel, and a trade-history panel.
- Replace the permanent order-ticket panel with prominent centered Buy and Sell buttons that open the paper order ticket.
- Keep explicit Buy and Sell segmented controls inside the popup for correction after opening.
- Add an estimated notional preview using the existing quantity and execution price controls inside the popup.
- Preserve existing order submission, live quote refresh, stock suggestions, position links, and trade history rendering.

### Task 2: Add the Order Action Helper

**Files:**
- Modify: `src/app/features/paper-trading/paper-trading.component.ts`

**Steps:**
- Add a typed `setOrderAction(action: 'BUY' | 'SELL')` method.
- Use the existing reactive form control as the single source of truth for the order action.
- Do not change persistence, validation, quote loading, or P/L calculation behavior.

### Task 3: Apply Watchlists-Style Responsive SCSS

**Files:**
- Modify: `src/app/features/paper-trading/paper-trading.component.scss`

**Steps:**
- Replace compact card styling with slate translucent surfaces, rounded shells, blue accent chips, inherited typography, and Watchlists-style buttons.
- Add a six-card account summary grid that collapses to three, two, and one column at narrower widths.
- Style the order ticket as a clear vertical workflow with segmented Buy/Sell controls, polished inputs, suggestions, notional preview, and inline block reason.
- Style positions and history tables with sticky headers, subtle row hover states, right-aligned numeric columns, and sticky stock columns on mobile.

### Task 4: Update Documentation

**Files:**
- Modify: `CHANGELOG.md`
- Modify: `documentation/PAPER_TRADING.md`
- Modify: `documentation/ARCHITECTURE.md`

**Steps:**
- Add an `[Unreleased]` changelog entry describing the Paper page redesign.
- Document the Manual Paper Trading interface structure and mobile table behavior.
- Update architecture notes to reflect the Watchlists-aligned Paper UI.

### Task 6: Trade History Search

**Files:**
- Modify: `src/app/features/paper-trading/paper-trading.component.ts`
- Modify: `src/app/features/paper-trading/paper-trading.component.html`
- Modify: `src/app/features/paper-trading/paper-trading.component.scss`
- Modify: `CHANGELOG.md`
- Modify: `documentation/PAPER_TRADING.md`

**Steps:**
- Add a `tradeHistoryQuery` signal and `filteredTrades` computed value.
- Filter trade history by ticker symbol or company name without changing persisted trade data.
- Add a search field to the Trade History header, including a clear action and no-match empty state.
- Keep the filter client-side and responsive within the existing Watchlists-style table shell.

### Task 7: Open Positions P/L Percentage

**Files:**
- Modify: `src/app/features/paper-trading/paper-trading.component.ts`
- Modify: `src/app/features/paper-trading/paper-trading.component.html`
- Modify: `src/app/features/paper-trading/paper-trading.component.scss`
- Modify: `CHANGELOG.md`
- Modify: `documentation/PAPER_TRADING.md`

**Steps:**
- Add a helper that calculates position P/L percentage from current live price and average cost.
- Add a P/L % column beside currency P/L in the Open Positions table.
- Use positive and negative styling for the percentage value.
- Tighten the stock column and use a fixed positions table layout so the additional column has balanced spacing.

### Task 8: Order Ticket Field Polish

**Files:**
- Modify: `src/app/features/paper-trading/paper-trading.component.html`
- Modify: `src/app/features/paper-trading/paper-trading.component.scss`
- Modify: `CHANGELOG.md`
- Modify: `documentation/PAPER_TRADING.md`

**Steps:**
- Add explicit field classes to the quantity and execution price inputs.
- Style those fields as rounded slate cards inside the PrimeNG dialog.
- Override appended dialog input styles globally through the dialog style class so PrimeNG inputs do not fall back to native black input styling.
- Restyle the live quote and order submit actions as a balanced footer with a clear secondary and primary action.

### Task 5: Verify

**Commands:**
- Run Angular lint or project lint command if configured.
- Run the production build command used by this project.
- Check edited files with IDE lints and fix introduced issues.
