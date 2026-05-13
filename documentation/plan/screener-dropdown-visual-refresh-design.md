# Screener Dropdown Visual Refresh Design

## Summary

The Screener dropdown content should keep the current six-filter architecture and existing filter behavior, but the opened panels should feel like custom trading workstation surfaces rather than generic form popovers.

## Selected Approach

Use PrimeNG `OverlayPanel` for positioning, focus handling, and integration with the existing Angular component, while replacing the visible panel treatment with a bespoke "floating market console" design.

## Visual Direction

- Deep glass panel surface with a subtle cyan/blue radial glow and stronger elevation.
- Thin accent spine and top highlight to make each panel feel anchored to the command rail.
- Section cards with cleaner spacing, stronger borders, and better contrast.
- Preset chips and signal chips with pill-shaped active states and controlled glow.
- Inputs styled as compact market-console fields with inner shadows, clear focus states, and monospaced numeric feel.
- Smooth open animation using transform and opacity, without changing filter behavior.

## Scope

- Modify `src/app/features/screener/filter-panel/filter-panel.component.ts`.
- Keep PrimeNG `OverlayPanel`, `MultiSelect`, `SelectButton`, and `Checkbox` components.
- Do not change Screener service or API behavior.
- Update `CHANGELOG.md` and `documentation/ARCHITECTURE.md`.

## Verification

- Run `npm run build`.
- Run focused Screener tests if related behavior changes are introduced.
- Run linter diagnostics on edited files.
