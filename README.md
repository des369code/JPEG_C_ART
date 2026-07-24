# JPEG Artifact Adder

A free, privacy-focused web tool that adds real JPEG compression artifacts to images. All processing happens locally in your browser — no uploads, no server, no paywall.

Replicates the JPEG artifact functionality of onlinejpgtools.com/add-jpg-artifacts.

## Quick Start

```bash
python3 server.py
# Open http://localhost:8000
```

Or use any static file server:

```bash
npx serve .
python3 -m http.server 8000
```

## How It Works

JPEG artifacts come from the encode→decode→re-encode cycle:

1. You load a JPEG image
2. Select a region (drag the rectangle or enter coordinates)
3. Set artifact strength (0–100%)
4. The selected region is re-encoded at low JPEG quality, decoded, and composited back
5. You download the result

The artifacts are **real** — not simulated. The browser's native JPEG encoder (Chrome = libjpeg-turbo, Firefox = mozjpeg) produces genuine compression artifacts.

## Features

- Region selection via drag or numeric input
- Artifact strength 0–100%
- Real JPEG compression artifacts (blocking, ringing, color banding)
- Instant preview and download
- 100% client-side — works offline
- Zero dependencies — just HTML, CSS, and vanilla JavaScript

## Browser Support

Chrome, Firefox, Safari, Edge (all modern browsers with Canvas API support).
