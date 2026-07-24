# DesImageEditor

A free, privacy-focused web tool that adds real-world camera imperfections and compression artifacts to images. All processing happens locally in your browser — no uploads, no server, no paywall.

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

JPEG artifacts come from the encode->decode->re-encode cycle:

1. You load a JPEG image
2. Select effects to apply (each can have its own region or cover the full frame)
3. Set effect strength (0-100%)
4. Click "Apply effects" — the pipeline runs all enabled effects in physically-correct order
5. You download the result

The JPEG artifacts are **real** — not simulated. The browser's native JPEG encoder (Chrome = libjpeg-turbo, Firefox = mozjpeg) produces genuine compression artifacts.

## Effects

10 camera imperfection effects across four categories. Each effect can be toggled independently with its own strength slider. Effects are applied in a single pass in physically-correct pipeline order.

### Lens Flaws

| Effect | Full frame | Color | Description |
|--------|-----------|-------|-------------|
| Vignetting | Yes (global) | — | Radial darkening toward image edges and corners |
| Edge softness | Yes (global) | — | Progressive blur toward frame edges simulating field curvature / astigmatism |
| Chromatic aberration | Yes (global) | #6bcb77 | Color fringing on high-contrast edges from lens dispersion |
| Lens flare | Yes (global) | — | Ghost reflections and veiling haze when shooting toward bright light |

### Focus Flaws

| Effect | Per-effect region | Color | Description |
|--------|------------------|-------|-------------|
| Soft focus | Yes | #ffd93d | Gaussian blur simulating missed smartphone autofocus |
| Motion blur | Yes | #ff6b6b | Directional blur from camera shake or slow shutter speed |

### Sensor Flaws

| Effect | Per-effect region | Color | Description |
|--------|------------------|-------|-------------|
| ISO grain | Yes | #4d96ff | High-ISO luminance noise (monochromatic for realism) |
| Dead/hot pixels | Yes | #ff922b | Stuck bright or dark pixels from sensor manufacturing defects |
| Dust spots | Yes | #cc5de8 | Small dark spots from dust on the camera sensor |

### Compression

| Effect | Per-effect region | Color | Description |
|--------|------------------|-------|-------------|
| JPEG artifacts | Yes | #20c997 | Compression blocking, ringing, and color banding from heavy JPEG re-encoding |

### Pipeline Order

The effects are applied in this physical order (light enters lens, passes through focus, hits sensor, then is compressed):

1. Vignetting
2. Edge softness
3. Chromatic aberration
4. Lens flare
5. Soft focus
6. Motion blur
7. ISO grain
8. Dead/hot pixels
9. Dust spots
10. JPEG artifacts

## Per-Effect Regions

Each effect that accepts a **per-effect region** has its own colored overlay on the input image canvas. This lets you apply an effect to only a specific area of the photo rather than the entire frame.

**Full-frame effects** (Vignetting, Edge softness, Chromatic aberration, Lens flare) naturally apply to the entire image and have no region overlay — they display a "Full frame" badge instead.

### How Regions Work

- Enable an effect — its colored overlay appears on the input canvas
- **Click** the overlay to make it active (solid border) vs inactive (dashed border)
- **Drag** the overlay to reposition the region
- **Drag the bottom-right corner** to resize
- **"Edit region"** buttons on each effect card automatically select that effect's overlay
- Numeric X, Y, Width, Height inputs reflect the active region and can be used for precise positioning
- Each overlay has a unique color to distinguish effects at a glance:

| Effect | Overlay color |
|--------|--------------|
| Motion blur | Red (#ff6b6b) |
| Soft focus | Yellow (#ffd93d) |
| Chromatic aberration | Green (#6bcb77) |
| ISO grain | Blue (#4d96ff) |
| Dead/hot pixels | Orange (#ff922b) |
| Dust spots | Purple (#cc5de8) |
| JPEG artifacts | Teal (#20c997) |

## Presets

One-click effect combinations for common camera scenarios:

| Preset | Effects Enabled | Use Case |
|--------|----------------|----------|
| **Smartphone Snapshot** | Soft focus (20%), ISO grain (25%), JPEG artifacts (40%) | Slightly imperfect everyday photo |
| **Old/Cheap Lens** | Vignetting (55%), Chromatic aberration (50%), Edge softness (45%) | Worn-out budget optics look |
| **High ISO Night Shot** | ISO grain (80%), Motion blur (30%), Dead pixels (35%) | Noisy, slightly blurry low-light capture |
| **Vintage Film** | Vignetting (40%), Dust spots (30%), ISO grain (20%), Chromatic aberration (35%) | Retro film aesthetic with dust and color fringing |

Select a preset from the dropdown and click **"Apply preset"** to load the preset settings. After processing, your current configuration is automatically saved as a **Custom** preset for quick re-use during the session.

## Browser Support

Chrome, Firefox, Safari, Edge (all modern browsers with Canvas API support).
