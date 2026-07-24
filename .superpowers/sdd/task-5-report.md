# Task 5: Rewrite app.js + index.html — Card UI, Per-Effect Regions, Presets

**Status:** Complete

## Changes

### `js/app.js` — Full rewrite

- Import changed from `setupRegion` to `setupRegions` (matching the renamed `region.js` module).
- Added import for `presets` and `saveCustomPreset` from `./effects/presets.js`.
- Added `FULL_FRAME` set for effects with no region overlay (vignetting, chromatic-aberration, edge-softness, lens-flare).
- New state: `effectRegions` object, one per effect.
- Card-based UI replaces the old checkbox + slider rows:
  - Each effect gets a card with toggle dot (circle/●), colored dot, name, and optional "Full frame" badge.
  - Card body with strength slider, hidden until effect is enabled.
  - Non-full-frame effects get a "Edit region" button and region display.
  - Clicking toggle or name enables/disables the effect and shows/hides the body.
- Presets dropdown populated from `presets` array; `presetApply` resets all effects then applies the selected preset.
- Region change handler: `regions.onRegionChanged` syncs `effectRegions`.
- Apply function passes `effectStrengths` and `effectRegions` (both objects keyed by effect ID) to `applyEffects`.
- After applying, calls `saveCustomPreset` with current state.
- Reset function iterates cards, resets toggles, bodies, sliders, and overlays.

### `index.html` — Presets dropdown added

- Added preset `<select>` and "Apply preset" button after the effects list, wrapped in a `presets-row` div.

## Verification

- `node --check js/app.js` — syntax OK
- `curl http://localhost:8000/` — HTTP 200
- Commit: `e5c5dac` — "feat: card-based effect UI with per-effect regions, presets, and rename"
