# JPEG Artifact Adder — Design Spec

**Date:** 2026-07-24
**Status:** Approved
**Target:** Free, locally-run web app that replicates the JPEG artifact injection functionality of onlinejpgtools.com/add-jpg-artifacts

## Overview

A single-page web application that deliberately introduces real JPEG compression artifacts into user-supplied images. The user loads a JPEG, selects a region, chooses artifact strength (0–100%), and downloads the processed result. All processing happens client-side via WebAssembly (libjpeg-turbo) — no backend, no upload, no paywall.

## Scope (v1)

- JPEG artifact injection with configurable strength (0–100%)
- Rectangular region selection via drag on canvas + numeric input fields
- File drop/click to load JPEG images
- Download processed result as JPEG
- **Out of scope:** WebP artifacts, clipboard copy, presets/examples, JPEG2000 support, whole-image mode (achieved by selecting full region)

## Architecture

Buildless ESM + Web Worker + WASM:

```
project/
├── index.html              → App shell
├── css/
│   └── app.css             → All styles
├── js/
│   ├── app.js              → Main controller
│   ├── ui/
│   │   ├── region.js       → Canvas draggable region selector
│   │   ├── upload.js       → File drop/click → ImageData
│   │   └── output.js       → Preview display, download trigger
│   ├── worker/
│   │   └── processor.js    → Web Worker: WASM encode/decode pipeline
│   └── wasm/
│       ├── jpeg-turbo.wasm → Prebuilt libjpeg-turbo binary
│       └── jpeg-turbo.js   → Emscripten JS glue
└── server.py               → Static file server for development
```

### Component Responsibilities

| Component | Responsibility |
|-----------|---------------|
| `app.js` | Controller: wires UI events to worker calls, manages state |
| `upload.js` | File input, drag-and-drop, reads file → ArrayBuffer, validates JPEG |
| `region.js` | Canvas overlay with draggable/resizable rectangle, exposes `{x, y, w, h}`, syncs with numeric inputs |
| `output.js` | Displays processed preview, triggers download via Blob URL |
| `processor.js` | Web Worker: receives ImageData + params, runs WASM pipeline, returns Blob |
| WASM module | libjpeg-turbo compiled via Emscripten: `encode()` and `decode()` |

## Data Flow

```
User drops/selects JPEG
  → FileReader → ArrayBuffer
  → postMessage to worker
  → Worker: WASM decode → raw RGBA pixels
  → app.js: draw pixels to preview canvas + region overlay
  → User adjusts region (drag) + strength (slider)
  → User clicks "Apply Artifacts"
  → app.js collects {crop region, quality} → postMessage to worker
  → Worker: crop region → WASM encode at low quality → decode back
  → Worker: composite artifact region onto original
  → Worker: WASM encode final composite at quality 92
  → Worker: postMessage → app.js receives {processedBlob}
  → output.js: show preview, enable download
```

**Core mechanism:** JPEG artifacts emerge from the encode→decode→re-encode cycle. We re-encode the selected region at low quality (quality = 100 − strength), decode it back, paste it onto the original, and output the result. This produces authentic blocking, ringing, and mosquito noise.

## JPEG Compression Model

- **Strength 0%**: region encoded at quality 100 (lossless-like, minimal change)
- **Strength 50%**: region encoded at quality 50 (visible blocking, color banding)
- **Strength 100%**: region encoded at quality 1 (maximum degradation, heavy pixelation)
- **Output quality**: final image saved at quality 92 (good perceptual quality for non-artifact areas)

## Error Handling

| Scenario | Behavior |
|----------|----------|
| Non-JPEG file | Inline error: "Please use a JPEG image." (check via magic bytes `FF D8`) |
| Corrupt/unsupported JPEG | "This JPEG format is not supported. Try a baseline JPEG." |
| WASM not supported | "Your browser doesn't support WebAssembly." |
| Worker crash | "Processing failed. Try a smaller image." |
| Image >50MP or >50MB | Warn before processing, offer to continue |
| Region out of bounds | Clamp silently to image dimensions |

## Testing Strategy

- **Unit:** JPEG encode/decode roundtrip pixel diff, region crop math
- **Visual regression:** Known test image processed at 0/25/50/75/100% strength, compared against expected outputs
- **Smoke test:** Load image, adjust region, apply, download — verify output is valid JPEG with smaller file size in artifact region
- **Cross-browser:** Chrome, Firefox, Safari, Edge

## Key Dependencies

- **libjpeg-turbo**: C library compiled to WASM via Emscripten. Provides `tjCompress2` and `tjDecompress2` with quality control and chroma subsampling options.
- **No npm dependencies** for v1. ESM imports are native browser modules. WASM binary checked into repo.
