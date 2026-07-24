# Camera Imperfection Effects — Design Spec

**Date:** 2026-07-24
**Status:** Approved
**Target:** Add 10 real-world camera imperfection effects to the JPEG Artifact Adder, all applying to a selectable region via Canvas API.

## Overview

Extend the single-effect JPEG artifact tool into a multi-effect camera flaw simulator. Each effect models a real optical or sensor imperfection. Users toggle effects on/off, set individual strengths, and apply all enabled effects in a single pass. Effects run in a fixed pipeline order that mirrors the physical light path: lens flaws → focus flaws → sensor flaws → compression.

## Scope (v1)

10 effects across three categories, all validated against real photography research:

**Focus flaws:**
1. **Motion blur** — Directional shutter drag. Draws region 10× at offsets along a random angle, each at 10% opacity. Strength scales offset 0→8px.
2. **Soft focus** — Gaussian blur via `ctx.filter = 'blur()'`. Strength scales radius 0→8px. Mimics missed smartphone autofocus.

**Lens flaws:**
3. **Chromatic aberration** — R, G, B channels scaled independently. R expanded +N%, B contracted −N%, G centered. Produces color fringing on high-contrast edges.
4. **Vignetting** — Radial gradient overlay from transparent (center) to black (edges). Opacity = strength%.
5. **Edge softness** — Blurred copy of image blended with original via radial mask. Center sharp, edges blurred. Models field curvature + astigmatism.
6. **Barrel/pincushion distortion** — Geometric warp. Negative strength = barrel (bulge outward), positive = pincushion (pinch inward). Uses pixel remapping.
7. **Lens flare** — Chain of semi-transparent colored circles along a line from the brightest point. Veiling haze gradient over entire image.

**Sensor flaws:**
8. **ISO grain** — Per-pixel random noise via `ImageData` manipulation. Monochromatic (same offset applied to R, G, B) for realism. Strength scales noise amplitude.
9. **Dead/hot pixels** — N stuck pixels at random positions. Hot = bright white with slight color cast. Dead = pure black. Count scales with strength.
10. **Dust spots** — 3–8 small dark blurred ellipses at random positions. Low opacity (5–15%), irregular shapes, slight rotation.

**Plus the existing:**
11. **JPEG artifacts** — Existing encode→decode→re-encode compression pipeline (moved into effects system).

**Out of scope:** Effect reordering, effect presets, batch processing, color cast/white balance (not a hardware flaw), light leak (film-era artifact).

## Architecture

```
js/
├── app.js                    → Controller: renders effect UI, calls pipeline
├── processor.js              → Thin re-export for backward compat
├── effects/
│   ├── pipeline.js           → Runner: applyEffects(imageData, enabled, strengths, region)
│   ├── registry.js           → Master list of all effect definitions
│   ├── motion-blur.js        → Each effect: { id, name, description, defaultStrength, apply }
│   ├── soft-focus.js
│   ├── chromatic-aberration.js
│   ├── vignette.js
│   ├── edge-softness.js
│   ├── barrel-distortion.js
│   ├── lens-flare.js
│   ├── iso-grain.js
│   ├── dead-pixels.js
│   ├── dust-spots.js
│   └── jpeg-artifacts.js
```

### Effect contract

Every effect module exports:
```js
export const effect = {
  id: 'kebab-case-id',
  name: 'Human Readable Name',
  category: 'focus' | 'lens' | 'sensor' | 'compression',
  description: 'One-line description shown in tooltip',
  defaultStrength: 30, // 0-100
  apply(ctx, width, height, region, strength) { ... }
};
```

`apply()` receives the full canvas 2D context, image dimensions, the selected region `{x, y, w, h}`, and a strength 0–100. It mutates the canvas directly. No return value.

### Pipeline order (fixed, mirrors physical light path)

1. Vignetting → 2. Edge softness → 3. Chromatic aberration → 4. Barrel/pincushion → 5. Lens flare → 6. Soft focus → 7. Motion blur → 8. ISO grain → 9. Dead/hot pixels → 10. Dust spots → 11. JPEG artifacts

### Pipeline runner

```js
export async function applyEffects(imageData, enabledIds, strengths, region) → Promise<Blob>
```

1. Draw `imageData` to working canvas
2. For each effect in pipeline order, if its ID is in `enabledIds`, call `effect.apply(ctx, width, height, region, strengths[effect.id])`
3. Encode working canvas to JPEG at quality 0.92
4. Return blob

## Data Flow

```
User loads JPEG → FileReader → ImageData → displayed on input canvas
                                                    │
User toggles effects, sets strengths                    │
User clicks "Apply"                                     │
        │                                               │
        ▼                                               │
app.js collects: { enabledIds[], strengths{}, region{} }│
        │                                               │
        ▼                                               │
pipeline.applyEffects(imageData, enabled, strengths, region)
        │
        ▼
For each enabled effect (in fixed order):
  effect.apply(ctx, w, h, region, strength)
        │
        ▼
Canvas → JPEG blob (quality 0.92)
        │
        ▼
Output module: preview + zoom + download
```

## UI

The controls panel replaces the single strength slider with a dynamically-rendered effect list:

```
┌─ Effects ──────────────────────────────────┐
│                                             │
│  [x] Motion blur       ────●─────── 40%    │
│  [x] Soft focus        ──●────────── 25%    │
│  [x] Chromatic ab.     ──────●────── 55%   │
│  [x] Vignetting        ────●─────── 35%    │
│  [x] Edge softness     ────●─────── 50%    │
│  [ ] Barrel distortion                      │
│  [ ] Lens flare                             │
│  [x] ISO grain         ──────────●── 80%   │
│  [ ] Dead/hot pixels                        │
│  [ ] Dust spots                             │
│  [x] JPEG artifacts    ────●─────── 60%    │
│                                             │
│  [Apply all enabled effects]                │
│         Reset all                           │
└─────────────────────────────────────────────┘
```

- Checkbox toggles effect on/off
- Slider only visible when enabled (slide-in transition)
- Region controls (left, top, width, height) remain unchanged above the effects list
- "Reset all" zeros every strength and unchecks all toggles
- Apply button shows "Processing N effects..." during run
- Status message shows count of applied effects on completion

## Error Handling

- Effect `apply()` throws → caught in pipeline, effect skipped, error logged to console
- All effects disabled + Apply clicked → status shows "No effects enabled"
- No image loaded + Apply clicked → no-op (existing guard)

## Key Decisions

- **Fixed pipeline order** rather than user-reorderable. The order is physically motivated (lens → focus → sensor → compression) and reordering would produce physically impossible results.
- **All effects operate on the full canvas**, not just the region. Some effects (vignetting, edge softness, barrel distortion) are inherently full-frame phenomena. The region constraint only applies to effects that make sense for it (motion blur, soft focus, grain). Effects that are full-frame (vignette) ignore the region parameter.
- **Monochromatic grain** rather than per-channel — research confirms this is more realistic for digital sensors.
- **No barrel distortion in v1** if the pixel remapping is too complex — fallback to keeping it in the UI but grayed out with a "coming soon" note.

## Testing Strategy

- **Unit:** Each effect's `apply()` tested with known input → visual regression
- **Integration:** Pipeline with multiple effects enabled → verify order correctness
- **Smoke test:** Load image, enable 3 effects, apply, download, verify output is valid JPEG
- **Edge cases:** Zero strength produces no change, strength 100 produces maximum effect, region clamping works
