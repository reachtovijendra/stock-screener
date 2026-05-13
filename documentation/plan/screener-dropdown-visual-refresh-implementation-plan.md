# Screener Dropdown Visual Refresh Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use executing-plans to implement this plan task-by-task.

**Goal:** Make the opened Screener dropdown panels look modern, premium, and purpose-built while preserving the current filter content and behavior.

**Architecture:** Keep PrimeNG as the overlay and form-control layer. Update the filter-panel template only where a small markup hook improves visual hierarchy, and concentrate the implementation in scoped component styles and PrimeNG pass-through overrides.

**Tech Stack:** Angular 19 standalone component, PrimeNG OverlayPanel/MultiSelect/SelectButton/Checkbox, SCSS-style component CSS.

---

### Task 1: Add Panel Shell Hooks

**Files:**
- Modify `src/app/features/screener/filter-panel/filter-panel.component.ts`

**Steps:**
1. Add a shared panel class to Screener dropdown `p-overlayPanel` instances.
2. Add small decorative hooks where needed for header accent and panel body layout.
3. Keep existing Angular bindings and filter methods unchanged.

### Task 2: Replace Dropdown Visual System

**Files:**
- Modify `src/app/features/screener/filter-panel/filter-panel.component.ts`

**Steps:**
1. Restyle overlay panels with a premium glass console surface, accent spine, top highlight, and stronger shadow.
2. Restyle card headers, helper text, section blocks, preset chips, signal chips, checkbox tiles, inputs, multi-selects, and select buttons.
3. Add subtle open animation and hover/focus transitions.
4. Ensure responsive layout remains compact.

### Task 3: Documentation And Verification

**Files:**
- Modify `CHANGELOG.md`
- Modify `documentation/ARCHITECTURE.md`

**Steps:**
1. Document the visual refresh.
2. Run `npm run build`.
3. Run linter diagnostics on edited files.
