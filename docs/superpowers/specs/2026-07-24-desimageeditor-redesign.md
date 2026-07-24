# DesImageEditor — UX Redesign Spec

**Date:** 2026-07-24
**Status:** Approved
**Target:** Major UX overhaul: rename to DesImageEditor, per-effect region selection, collapsible effect cards, and presets system.

## Overview

Transform the single-region JPEG artifact tool into a full image degradation editor. Each camera flaw effect gets its own independent region, the effects panel uses collapsible cards that grow as effects are enabled, and a presets system provides one-click effect combinations.

## Scope (v1)

1. **Rename** to "DesImageEditor" across all UI, title, README
2. **Per-effect regions** — each effect stores its own `{x, y, w, h}`. Enabled effects show colored overlays on the input preview. Click an effect card to make its overlay the active/editable one. Region inputs show the active effect's values.
3. **Collapsible effect cards** — disabled = compact one-line row. Enabled = expands with strength slider, region inputs, and color indicator. Panel fills gradually as effects are toggled on.
4. **Presets** — 4 pre-configured effect combinations + auto-saved custom preset. One-click apply.

## Per-Effect Region System

### Overlay Colors (consistent per effect)

| Effect | Color |
|--------|-------|
| Motion blur | #ff6b6b (red) |
| Soft focus | #ffd93d (yellow) |
| Chromatic aberration | #6bcb77 (green) — full-frame |
| Vignetting | full-frame (no overlay) |
| Edge softness | full-frame (no overlay) |
| Lens flare | full-frame (no overlay) |
| ISO grain | #4d96ff (blue) |
| Dead pixels | #ff922b (orange) |
| Dust spots | #cc5de8 (purple) |
| JPEG artifacts | #20c997 (teal) |

### Interaction Model

- **Active effect overlay:** solid colored border + resize handle (editable via drag)
- **Other enabled effects:** dashed colored border (read-only, click to activate)
- **Click an effect card** → that effect becomes active, its overlay becomes editable
- **Region inputs (left, top, width, height)** always show the active effect's region
- **Full-frame effects** (vignetting, CA, edge softness, lens flare) don't show overlays — they always apply to the full image
- **Default region** for each effect = full image dimensions (not the old 25-75% center)

### Data Structure

```js
// Shared state
const effectRegions = {
  'motion-blur': { x: 0, y: 0, w: 1920, h: 1080 },
  'iso-grain':   { x: 400, y: 200, w: 800, h: 600 },
  // ... per effect
};
const activeEffectId = 'iso-grain'; // which effect's region is being edited
```

## Effects Panel — Card Design

```
┌─ Effects ────────────────────────────────┐
│                                            │
│  ● Motion blur         ──────●──── 40%    │  ← expanded (enabled)
│    Left: 120  Top: 80                     │
│    Width: 400  Height: 320                │
│                                           │
│  ○ ISO grain                              │  ← collapsed (disabled)
│                                           │
│  ○ Chromatic aberration   [Full frame]    │  ← collapsed, full-frame badge
│                                           │
│  ● JPEG artifacts      ─────●───── 70%   │  ← expanded (enabled)
│    Left: 0  Top: 0                        │
│    Width: 800  Height: 600                │
│                                           │
│  ───────────────────────────────────────  │
│  Preset: [Smartphone Snapshot ▾]  [Apply]│
│  ───────────────────────────────────────  │
│  [Apply all effects]    [Reset all]       │
└───────────────────────────────────────────┘
```

- **● = enabled, ○ = disabled** — clicking either toggles
- **Enabled cards expand** with slider + region inputs (if applicable)
- **Disabled cards collapse** to one compact line
- **Full-frame effects** show "[Full frame]" badge instead of region inputs
- **Color dot** on each card matches overlay color on input preview
- **Panel grows naturally** as more effects are enabled

## Presets

Stored in `js/effects/presets.js`:

```js
export const presets = [
  {
    id: 'smartphone',
    name: 'Smartphone Snapshot',
    description: 'Slight soft focus, mild grain, and moderate JPEG compression.',
    effects: {
      'soft-focus':   { enabled: true, strength: 20 },
      'iso-grain':    { enabled: true, strength: 25 },
      'jpeg-artifacts': { enabled: true, strength: 40 },
    },
  },
  {
    id: 'cheap-lens',
    name: 'Old/Cheap Lens',
    description: 'Heavy vignetting, chromatic aberration, and edge softness.',
    effects: {
      'vignetting':           { enabled: true, strength: 55 },
      'chromatic-aberration': { enabled: true, strength: 50 },
      'edge-softness':        { enabled: true, strength: 45 },
    },
  },
  {
    id: 'night-shot',
    name: 'High ISO Night Shot',
    description: 'Heavy grain, mild motion blur, and sensor defects.',
    effects: {
      'iso-grain':    { enabled: true, strength: 80 },
      'motion-blur':  { enabled: true, strength: 30 },
      'dead-pixels':  { enabled: true, strength: 35 },
    },
  },
  {
    id: 'vintage-film',
    name: 'Vintage Film',
    description: 'Vignette, dust spots, subtle grain, and color fringing.',
    effects: {
      'vignetting':           { enabled: true, strength: 40 },
      'dust-spots':           { enabled: true, strength: 30 },
      'iso-grain':            { enabled: true, strength: 20 },
      'chromatic-aberration': { enabled: true, strength: 35 },
    },
  },
  {
    id: 'custom',
    name: 'Custom',
    description: 'Your current settings.',
    effects: {},
  },
];
```

- **"[Apply]" button** next to the dropdown applies the selected preset
- **Custom preset** auto-saves — clicking Apply on any configuration overwrites it
- **Regions are preserved** from current settings when applying presets (presets don't override regions, only toggles + strengths)

## Architecture Changes

### Files to modify
- `index.html` — rename, remove global region inputs from controls panel
- `js/app.js` — major rewrite: per-effect regions, card UI, presets, colored overlays
- `js/ui/region.js` — support multiple per-effect overlays with colors
- `js/effects/pipeline.js` — accepts per-effect regions map
- `js/effects/presets.js` — NEW: preset definitions + apply logic
- `css/app.css` — effect card styles, overlay colors, presets dropdown
- `README.md` — rename

### Files unchanged
- All 10 effect modules in `js/effects/`
- `js/ui/upload.js`, `js/ui/output.js`
- `js/effects/registry.js`
- `js/processor.js`, `js/utils.js`
- `server.py`

### Pipeline signature change

```js
// Old:
applyEffects(imageData, enabledIds, strengths, region)
// New:
applyEffects(imageData, enabledIds, strengths, regions)
// regions = { 'iso-grain': {x,y,w,h}, 'motion-blur': {...}, ... }
```

### Region module API change

```js
// Old: single region
setupRegion(container, inputs) → { getRegion(), updateImage(...), ... }

// New: multi-region with colors
setupRegions(container, inputs) → {
  getRegion(effectId),
  setRegion(effectId, r),
  setActiveEffect(effectId),
  updateOverlays(effectStates), // [{id, enabled, color, region}]
  onRegionChanged(callback),
  updateImage(w, h, dw, dh),
}
```

## Renaming

- `<title>` → "DesImageEditor"
- `<h1>` → "DesImageEditor"
- `<meta name="description">` → appropriate description
- `README.md` → title and description
- GitHub repo description (manual)

## Error Handling

- Effect with invalid region → clamps silently (pipeline handles this)
- Active effect is toggled off → next enabled effect becomes active, or none
- No effects enabled + Apply → "No effects enabled" (existing)
- Preset with unknown effect ID → skip silently

## Testing

- Each effect gets its own region → verify different artifact patterns in different areas
- Toggle effects on/off → cards expand/collapse
- Switch active effect → overlay color changes, region inputs update
- Apply preset → all toggles and sliders update correctly
- Colored overlays on input → visible, distinguishable, clickable
