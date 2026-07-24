# Task 1 Report: Single Overlay Mode + Card Click Fix

**Status:** Complete

## Changes Made

### `js/ui/region.js`
- Added `showAllOverlays` flag (default `false`) for single-overlay mode
- Updated `renderAll()` to only show the active effect's colored overlay when `showAllOverlays` is `false` (hides all others). In "show all" mode, overlays render as dashed and non-interactive (`pointerEvents: none`)
- Added `toggleShowAll()` method to the public API (flips the flag, re-renders, returns new boolean state)

### `js/app.js`
- Removed the "Edit region" button and its `regionRow` from effect card bodies
- Updated `toggleEffect()` to always call `regions.setActiveEffect()` on enable (removed the `!wasEnabled` guard), so switching effects activates the new effect's region
- Added `header.addEventListener('click')`: when an already-enabled card header is clicked, it activates that effect's region without toggling it off; when a disabled card is clicked, it enables the effect and activates the region

## Key Behavior
- Enable an effect -> only that effect's colored overlay shows on the input canvas
- Switch to another effect -> old overlay disappears, new one appears
- "Show all regions" -> all enabled overlays display as dashed, read-only overlays
- No "Edit region" button anywhere -> clicking the card header activates the region

## Verification
- `node --check js/ui/region.js` passed
- `node --check js/app.js` passed

## Files Modified
- `/Users/d.desmaanzephyll/Desktop/JPEG_C_ART/js/ui/region.js`
- `/Users/d.desmaanzephyll/Desktop/JPEG_C_ART/js/app.js`
- `/Users/d.desmaanzephyll/Desktop/JPEG_C_ART/.superpowers/sdd/task-1-report.md`
