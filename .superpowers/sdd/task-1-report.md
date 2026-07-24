# Task 1 Report: Pipeline Infrastructure

**Status:** Complete

## Files Created
- `js/effects/registry.js` — Master registry of all 10 effects in pipeline order (4 lens, 2 focus, 3 sensor, 1 compression)
- `js/effects/pipeline.js` — Runner that iterates enabled effects and produces a JPEG blob via `canvas.toBlob`

## Verification
- `node --check js/effects/pipeline.js` — PASS
- `node --check js/effects/registry.js` — PASS (imports not resolved by static check; expected failures at runtime until Tasks 2-5)

## Key Interfaces Produced
- `registry` — array of effect objects in fixed pipeline order
- `applyEffects(imageData, enabledIds, strengths, region) → Promise<Blob>` — async pipeline runner

## Notes
- Uses `clamp` from `js/utils.js` (already existed)
- Import errors on registry.js are expected — the 10 effect files (`vignette.js`, `edge-softness.js`, `chromatic-aberration.js`, `lens-flare.js`, `soft-focus.js`, `motion-blur.js`, `iso-grain.js`, `dead-pixels.js`, `dust-spots.js`, `jpeg-artifacts.js`) don't exist yet
- Each effect is skipped if `strength <= 0`, not in `enabledIds`, or throws an error
- Output JPEG quality is hardcoded at 0.92

## Commits
1. `feat: add effects pipeline infrastructure — registry + ordered runner`

## Concerns
None.
