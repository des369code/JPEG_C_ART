# Task 1 Report — Fixed 4 Bugs

## Changes Made

### Bug 1: Full-frame effects show region overlays
**File:** `js/ui/region.js`
**Fix:** Removed `'chromatic-aberration'` from `OVERLAY_COLORS`. This effect is full-frame (alongside vignetting, edge-softness, lens-flare) and should never create a colored overlay.

### Bug 2: Sliders have no percentage label
**Files:** `js/app.js`, `css/app.css`
**Fix:** After each slider element in the effect card body, a `.effect-pct` span is created showing the live percentage value. An `input` event listener updates the span text on every slider change. Added `.effect-pct` CSS class with font-family, size 0.75rem, weight 500, right-aligned.

### Bug 3: Region box is laggy
**File:** `js/ui/region.js`
**Fix:** `setActiveEffect(effectId)` is now called **before** the drag/resize branch so it always executes (previously only ran for drag, not resize). `dragRegion` now uses `regions[effectId]` as the primary fallback instead of `regions[activeId]` — since `setActiveEffect(effectId)` just ran, both resolve to the same effect, but the fix ensures the region snapshot is taken from the clicked effect's actual region data.

### Bug 4: Presets button overflows
**File:** `css/app.css`
**Fix:** Added `flex-wrap: wrap` to `.presets-row` so items wrap when too wide. Added `min-width: 0` to `#preset-select` to allow it to shrink below its content width. Added `flex-shrink: 0` to `#preset-apply` so the button doesn't get crushed. Reduced font sizes from 0.75rem to 0.6875rem on both the select and button.

## Verification
- `node --check js/ui/region.js` passed
- `node --check js/app.js` passed
- Git commit and push completed

## Files Modified
- `/Users/d.desmaanzephyll/Desktop/JPEG_C_ART/js/ui/region.js`
- `/Users/d.desmaanzephyll/Desktop/JPEG_C_ART/js/app.js`
- `/Users/d.desmaanzephyll/Desktop/JPEG_C_ART/css/app.css`
- `/Users/d.desmaanzephyll/Desktop/JPEG_C_ART/.superpowers/sdd/task-1-report.md`
