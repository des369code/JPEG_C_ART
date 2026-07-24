# Camera Imperfection Effects — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the single-effect JPEG artifact tool into a multi-effect camera flaw simulator with 9 real-world lens, focus, and sensor imperfections plus the existing JPEG artifacts.

**Architecture:** Each effect is an independent module in `js/effects/` exporting `{ id, name, category, description, defaultStrength, apply(ctx,w,h,region,strength) }`. `registry.js` imports all effects and exports them as an ordered array. `pipeline.js` iterates enabled effects on a working canvas. The UI dynamically renders toggles from the registry. Barrel/pincushion distortion deferred to a future release.

**Tech Stack:** Vanilla JS (ES modules), Canvas 2D API, ImageData. Zero dependencies.

## Global Constraints

- Zero npm dependencies — native ES modules only
- Must work in Chrome, Firefox, Safari, Edge
- Effect signature: `apply(ctx, width, height, region, strength)` — mutates ctx directly
- Fixed pipeline order: vignetting → edge softness → chromatic aberration → lens flare → soft focus → motion blur → ISO grain → dead pixels → dust spots → JPEG artifacts
- Final output: JPEG at quality 0.92 via `canvas.toBlob('image/jpeg', 0.92)`
- Strength range 0–100 for all effects, clamped internally
- Full-frame effects (vignetting, edge softness, CA, lens flare) ignore region parameter
- Region-based effects crop to clamped region bounds before processing

---

### Task 1: Pipeline Infrastructure

**Files:**
- Create: `js/effects/registry.js`
- Create: `js/effects/pipeline.js`

**Interfaces:**
- Consumes: `clamp` from `../utils.js`
- Produces: `registry` (array of effect objects), `applyEffects(imageData, enabledIds, strengths, region) → Promise<Blob>`

- [ ] **Step 1: Create effects directory**

```bash
mkdir -p js/effects
```

- [ ] **Step 2: Write registry.js**

```js
/** Master registry of all camera flaw effects in pipeline order. */

// Each effect module exports `export const effect = {...}`.
// Registry imports them all and orders them correctly.

// Lens effects (light path order)
import { effect as vignetting } from './vignette.js';
import { effect as edgeSoftness } from './edge-softness.js';
import { effect as chromaticAberration } from './chromatic-aberration.js';
import { effect as lensFlare } from './lens-flare.js';

// Focus effects
import { effect as softFocus } from './soft-focus.js';
import { effect as motionBlur } from './motion-blur.js';

// Sensor effects
import { effect as isoGrain } from './iso-grain.js';
import { effect as deadPixels } from './dead-pixels.js';
import { effect as dustSpots } from './dust-spots.js';

// Compression
import { effect as jpegArtifacts } from './jpeg-artifacts.js';

/** Pipeline-ordered array of all effects. */
export const registry = [
  vignetting,
  edgeSoftness,
  chromaticAberration,
  lensFlare,
  softFocus,
  motionBlur,
  isoGrain,
  deadPixels,
  dustSpots,
  jpegArtifacts,
];
```

- [ ] **Step 3: Write pipeline.js**

```js
/** Pipeline runner: applies enabled effects in registry order. */

import { registry } from './registry.js';
import { clamp } from '../utils.js';

const OUTPUT_QUALITY = 0.92;

/**
 * Apply all enabled effects to an image and return a JPEG blob.
 * @param {ImageData} imageData
 * @param {Set<string>} enabledIds
 * @param {Object<string, number>} strengths
 * @param {{x: number, y: number, w: number, h: number}} region
 * @returns {Promise<Blob>}
 */
export async function applyEffects(imageData, enabledIds, strengths, region) {
  const { width, height } = imageData;

  const rx = clamp(region.x, 0, width);
  const ry = clamp(region.y, 0, height);
  const rw = clamp(region.w, 1, width - rx);
  const rh = clamp(region.h, 1, height - ry);

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  ctx.putImageData(imageData, 0, 0);

  for (const effect of registry) {
    if (!enabledIds.has(effect.id)) continue;
    const strength = strengths[effect.id] ?? effect.defaultStrength;
    if (strength <= 0) continue;
    try {
      effect.apply(ctx, width, height, { x: rx, y: ry, w: rw, h: rh }, strength);
    } catch (err) {
      console.error(`Effect "${effect.id}" failed:`, err);
    }
  }

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('toBlob returned null'))),
      'image/jpeg',
      OUTPUT_QUALITY
    );
  });
}
```

- [ ] **Step 4: Verify syntax (imports will fail until effect files exist — that's expected)**

```bash
node --check js/effects/pipeline.js 2>&1 && echo "pipeline.js OK"
# registry.js will fail on missing imports — expected until Task 2-5 create them
```

- [ ] **Step 5: Commit**

```bash
git add js/effects/registry.js js/effects/pipeline.js
git commit -m "feat: add effects pipeline infrastructure — registry + ordered runner"
```

---

### Task 2: Focus Effects — Motion Blur + Soft Focus

**Files:**
- Create: `js/effects/motion-blur.js`
- Create: `js/effects/soft-focus.js`

**Interfaces:**
- Each exports: `export const effect = { id, name, category, description, defaultStrength, apply }`
- Consumes: `clamp` from `../utils.js` (motion blur only)

- [ ] **Step 1: Write motion-blur.js**

```js
/** Motion blur — directional shutter drag. */

import { clamp } from '../utils.js';

export const effect = {
  id: 'motion-blur',
  name: 'Motion blur',
  category: 'focus',
  description: 'Directional blur from camera shake or slow shutter speed.',
  defaultStrength: 30,

  apply(ctx, width, height, region, strength) {
    const maxOffset = (strength / 100) * 8;
    if (maxOffset < 0.5) return;

    const { x, y, w, h } = region;
    const angle = Math.random() * Math.PI * 2;
    const dx = Math.cos(angle) * maxOffset;
    const dy = Math.sin(angle) * maxOffset;

    const regionData = ctx.getImageData(x, y, w, h);
    const passes = 10;
    ctx.globalAlpha = 1 / passes;
    for (let i = 0; i < passes; i++) {
      const t = i / (passes - 1);
      ctx.putImageData(regionData, x + Math.round(dx * t), y + Math.round(dy * t));
    }
    ctx.globalAlpha = 1;
  },
};
```

- [ ] **Step 2: Write soft-focus.js**

```js
/** Soft focus — Gaussian blur, missed autofocus. */

export const effect = {
  id: 'soft-focus',
  name: 'Soft focus',
  category: 'focus',
  description: 'Gaussian blur simulating missed smartphone autofocus.',
  defaultStrength: 25,

  apply(ctx, width, height, region, strength) {
    const radius = (strength / 100) * 8;
    if (radius < 0.5) return;

    const { x, y, w, h } = region;
    const temp = document.createElement('canvas');
    temp.width = w;
    temp.height = h;
    const tctx = temp.getContext('2d');
    tctx.putImageData(ctx.getImageData(x, y, w, h), 0, 0);
    tctx.filter = `blur(${radius}px)`;
    tctx.drawImage(temp, 0, 0);
    tctx.filter = 'none';
    ctx.putImageData(tctx.getImageData(0, 0, w, h), x, y);
  },
};
```

- [ ] **Step 3: Verify syntax**

```bash
node --check js/effects/motion-blur.js && node --check js/effects/soft-focus.js && echo "OK"
```

- [ ] **Step 4: Commit**

```bash
git add js/effects/motion-blur.js js/effects/soft-focus.js
git commit -m "feat: add focus effects — motion blur + soft focus"
```

---

### Task 3: Lens Effects — Chromatic Aberration, Vignetting, Edge Softness, Lens Flare

**Files:**
- Create: `js/effects/chromatic-aberration.js`
- Create: `js/effects/vignette.js`
- Create: `js/effects/edge-softness.js`
- Create: `js/effects/lens-flare.js`

**Interfaces:**
- Each exports: `export const effect = { id, name, category, description, defaultStrength, apply }`

- [ ] **Step 1: Write vignette.js**

```js
/** Vignetting — radial darkening toward image corners. */

export const effect = {
  id: 'vignetting',
  name: 'Vignetting',
  category: 'lens',
  description: 'Gradual darkening toward the edges and corners of the frame.',
  defaultStrength: 35,

  apply(ctx, width, height, _region, strength) {
    const opacity = strength / 100;
    if (opacity <= 0) return;

    const cx = width / 2;
    const cy = height / 2;
    const maxR = Math.sqrt(cx * cx + cy * cy);

    const gradient = ctx.createRadialGradient(cx, cy, maxR * 0.4, cx, cy, maxR);
    gradient.addColorStop(0, 'rgba(0,0,0,0)');
    gradient.addColorStop(1, `rgba(0,0,0,${opacity * 0.85})`);

    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);
  },
};
```

- [ ] **Step 2: Write edge-softness.js**

```js
/** Edge softness — increasing blur toward edges (field curvature / astigmatism). */

export const effect = {
  id: 'edge-softness',
  name: 'Edge softness',
  category: 'lens',
  description: 'Progressive blur toward frame edges from lens field curvature.',
  defaultStrength: 40,

  apply(ctx, width, height, _region, strength) {
    const maxRadius = (strength / 100) * 6;
    if (maxRadius < 0.5) return;

    // Create blurred copy
    const blurCanvas = document.createElement('canvas');
    blurCanvas.width = width;
    blurCanvas.height = height;
    const bctx = blurCanvas.getContext('2d');
    bctx.putImageData(ctx.getImageData(0, 0, width, height), 0, 0);
    bctx.filter = `blur(${maxRadius}px)`;
    bctx.drawImage(blurCanvas, 0, 0);
    bctx.filter = 'none';

    // Radial mask: center = transparent (keep sharp), edges = opaque (use blurred)
    const cx = width / 2;
    const cy = height / 2;
    const maxR = Math.sqrt(cx * cx + cy * cy);
    const maskCanvas = document.createElement('canvas');
    maskCanvas.width = width;
    maskCanvas.height = height;
    const mctx = maskCanvas.getContext('2d');
    const gradient = mctx.createRadialGradient(cx, cy, maxR * 0.3, cx, cy, maxR);
    gradient.addColorStop(0, 'rgba(0,0,0,0)');
    gradient.addColorStop(1, 'rgba(0,0,0,1)');
    mctx.fillStyle = gradient;
    mctx.fillRect(0, 0, width, height);

    // Copy blurred onto original using mask as alpha
    const maskData = mctx.getImageData(0, 0, width, height);
    const blurData = bctx.getImageData(0, 0, width, height);
    const origData = ctx.getImageData(0, 0, width, height);
    const out = origData;

    for (let i = 0; i < maskData.data.length; i += 4) {
      const alpha = maskData.data[i] / 255; // 0=sharp center, 1=blurred edge
      out.data[i]     = origData.data[i]     * (1 - alpha) + blurData.data[i]     * alpha;
      out.data[i + 1] = origData.data[i + 1] * (1 - alpha) + blurData.data[i + 1] * alpha;
      out.data[i + 2] = origData.data[i + 2] * (1 - alpha) + blurData.data[i + 2] * alpha;
    }

    ctx.putImageData(out, 0, 0);
  },
};
```

- [ ] **Step 3: Write chromatic-aberration.js**

```js
/** Chromatic aberration — R/G/B channel scaling offset (lateral CA). */

export const effect = {
  id: 'chromatic-aberration',
  name: 'Chromatic aberration',
  category: 'lens',
  description: 'Color fringing on high-contrast edges from lens dispersion.',
  defaultStrength: 40,

  apply(ctx, width, height, _region, strength) {
    const scale = 1 + (strength / 100) * 0.008; // 1.0 to 1.008
    if (scale <= 1.001) return;

    const imageData = ctx.getImageData(0, 0, width, height);
    const src = imageData.data;
    const cx = width / 2;
    const cy = height / 2;

    // Create output buffer
    const outCtx = document.createElement('canvas').getContext('2d');
    const outCanvas = outCtx.canvas;
    outCanvas.width = width;
    outCanvas.height = height;
    const outData = outCtx.createImageData(width, height);
    const dst = outData.data;

    // Fill with original first
    dst.set(src);

    // Shift red outward (scale > 1), blue inward (scale < 1)
    for (let py = 0; py < height; py++) {
      for (let px = 0; px < width; px++) {
        const dx = px - cx;
        const dy = py - cy;

        // Red channel: scale outward
        const rx = Math.round(cx + dx * scale);
        const ry = Math.round(cy + dy * scale);
        if (rx >= 0 && rx < width && ry >= 0 && ry < height) {
          const si = (py * width + px) * 4;
          const di = (ry * width + rx) * 4;
          dst[di] = src[si]; // Red
        }

        // Blue channel: scale inward
        const invScale = 2 - scale; // mirror: 1.0→1.0, 1.008→0.992
        const bx = Math.round(cx + dx * invScale);
        const by = Math.round(cy + dy * invScale);
        if (bx >= 0 && bx < width && by >= 0 && by < height) {
          const si = (py * width + px) * 4;
          const bi = (by * width + bx) * 4;
          dst[bi + 2] = src[si + 2]; // Blue
        }
      }
    }

    ctx.putImageData(outData, 0, 0);
  },
};
```

- [ ] **Step 4: Write lens-flare.js**

```js
/** Lens flare — ghost reflections and veiling haze from bright light sources. */

export const effect = {
  id: 'lens-flare',
  name: 'Lens flare',
  category: 'lens',
  description: 'Internal reflections creating ghosts and haze when shooting toward bright light.',
  defaultStrength: 30,

  apply(ctx, width, height, _region, strength) {
    const opacity = strength / 100;
    if (opacity <= 0) return;

    // Find brightest point (approximate flare source)
    const sampleStep = 20;
    let brightest = { x: width * 0.7, y: height * 0.3, value: 0 };
    const imgData = ctx.getImageData(0, 0, width, height);
    for (let y = 0; y < height; y += sampleStep) {
      for (let x = 0; x < width; x += sampleStep) {
        const i = (y * width + x) * 4;
        const v = imgData.data[i] + imgData.data[i + 1] + imgData.data[i + 2];
        if (v > brightest.value) {
          brightest = { x, y, value: v };
        }
      }
    }

    const cx = width / 2;
    const cy = height / 2;
    const sx = brightest.x;
    const sy = brightest.y;

    // Draw ghost reflections along the line through center from source
    const ghosts = [
      { dist: -0.3, r: 0.08, color: `rgba(255,200,150,${opacity * 0.15})` },
      { dist: -0.5, r: 0.04, color: `rgba(150,200,255,${opacity * 0.12})` },
      { dist: -0.65, r: 0.06, color: `rgba(255,180,100,${opacity * 0.10})` },
      { dist: 0.35, r: 0.05, color: `rgba(200,220,255,${opacity * 0.10})` },
      { dist: 0.55, r: 0.03, color: `rgba(255,220,180,${opacity * 0.08})` },
    ];

    for (const g of ghosts) {
      const gx = cx + (sx - cx) * g.dist;
      const gy = cy + (sy - cy) * g.dist;
      const gr = Math.min(width, height) * g.r;

      const grad = ctx.createRadialGradient(gx, gy, 0, gx, gy, gr);
      grad.addColorStop(0, g.color);
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = grad;
      ctx.fillRect(gx - gr, gy - gr, gr * 2, gr * 2);
    }

    // Veiling haze over entire image
    ctx.fillStyle = `rgba(255,245,230,${opacity * 0.06})`;
    ctx.fillRect(0, 0, width, height);
  },
};
```

- [ ] **Step 5: Verify syntax**

```bash
for f in vignette edge-softness chromatic-aberration lens-flare; do
  node --check js/effects/$f.js && echo "$f OK"
done
```

- [ ] **Step 6: Commit**

```bash
git add js/effects/vignette.js js/effects/edge-softness.js js/effects/chromatic-aberration.js js/effects/lens-flare.js
git commit -m "feat: add lens effects — vignetting, edge softness, chromatic aberration, lens flare"
```

---

### Task 4: Sensor Effects — ISO Grain, Dead Pixels, Dust Spots

**Files:**
- Create: `js/effects/iso-grain.js`
- Create: `js/effects/dead-pixels.js`
- Create: `js/effects/dust-spots.js`

**Interfaces:**
- Each exports: `export const effect = { id, name, category, description, defaultStrength, apply }`
- Consumes: `clamp` from `../utils.js`

- [ ] **Step 1: Write iso-grain.js**

```js
/** ISO grain — high-ISO luminance noise (monochromatic for realism). */

import { clamp } from '../utils.js';

export const effect = {
  id: 'iso-grain',
  name: 'ISO grain',
  category: 'sensor',
  description: 'High-ISO luminance noise from the camera sensor.',
  defaultStrength: 50,

  apply(ctx, width, height, region, strength) {
    const intensity = (strength / 100) * 0.35;
    if (intensity <= 0) return;

    const { x, y, w, h } = region;
    const imageData = ctx.getImageData(x, y, w, h);
    const data = imageData.data;

    for (let i = 0; i < data.length; i += 4) {
      // Monochromatic noise — same random offset for R, G, B
      const noise = (Math.random() - 0.5) * intensity * 255;
      data[i]     = clamp(data[i]     + noise, 0, 255);
      data[i + 1] = clamp(data[i + 1] + noise, 0, 255);
      data[i + 2] = clamp(data[i + 2] + noise, 0, 255);
    }

    ctx.putImageData(imageData, x, y);
  },
};
```

- [ ] **Step 2: Write dead-pixels.js**

```js
/** Dead/hot pixels — stuck sensor pixels. */

import { clamp } from '../utils.js';

export const effect = {
  id: 'dead-pixels',
  name: 'Dead/hot pixels',
  category: 'sensor',
  description: 'Stuck bright or dark pixels from sensor manufacturing defects.',
  defaultStrength: 20,

  apply(ctx, width, height, region, strength) {
    const count = Math.round((strength / 100) * 30);
    if (count <= 0) return;

    const { x, y, w, h } = region;
    const imageData = ctx.getImageData(x, y, w, h);
    const data = imageData.data;

    for (let n = 0; n < count; n++) {
      const px = Math.floor(Math.random() * w);
      const py = Math.floor(Math.random() * h);
      const i = (py * w + px) * 4;
      const isHot = Math.random() > 0.3;

      if (isHot) {
        data[i]     = 240 + Math.random() * 15;
        data[i + 1] = 220 + Math.random() * 35;
        data[i + 2] = 200 + Math.random() * 55;
      } else {
        data[i]     = Math.random() * 10;
        data[i + 1] = Math.random() * 10;
        data[i + 2] = Math.random() * 10;
      }
    }

    ctx.putImageData(imageData, x, y);
  },
};
```

- [ ] **Step 3: Write dust-spots.js**

```js
/** Dust spots — sensor dust creating dark blurred spots. */

import { clamp } from '../utils.js';

export const effect = {
  id: 'dust-spots',
  name: 'Dust spots',
  category: 'sensor',
  description: 'Small dark spots from dust on the camera sensor.',
  defaultStrength: 25,

  apply(ctx, width, height, region, strength) {
    const count = Math.round((strength / 100) * 8);
    if (count <= 0) return;

    for (let n = 0; n < count; n++) {
      const sx = Math.random() * width;
      const sy = Math.random() * height;
      const radius = 3 + Math.random() * 12;
      const opacity = 0.03 + Math.random() * 0.10 * (strength / 100);

      const grad = ctx.createRadialGradient(sx, sy, radius * 0.2, sx, sy, radius);
      grad.addColorStop(0, `rgba(20,20,20,${opacity})`);
      grad.addColorStop(0.4, `rgba(30,30,30,${opacity * 0.7})`);
      grad.addColorStop(1, 'rgba(0,0,0,0)');

      ctx.fillStyle = grad;
      ctx.fillRect(sx - radius, sy - radius, radius * 2, radius * 2);
    }
  },
};
```

- [ ] **Step 4: Verify syntax**

```bash
for f in iso-grain dead-pixels dust-spots; do
  node --check js/effects/$f.js && echo "$f OK"
done
```

- [ ] **Step 5: Commit**

```bash
git add js/effects/iso-grain.js js/effects/dead-pixels.js js/effects/dust-spots.js
git commit -m "feat: add sensor effects — ISO grain, dead/hot pixels, dust spots"
```

---

### Task 5: Migrate JPEG Artifacts into Effects System

**Files:**
- Create: `js/effects/jpeg-artifacts.js`
- Modify: `js/processor.js` (simplify to re-export from effects)

**Interfaces:**
- Consumes: `qualityFromStrength`, `clamp` from `../utils.js`
- Produces: `jpegArtifacts` effect in registry; `processor.js` exports `applyArtifacts` as backward-compat wrapper

- [ ] **Step 1: Write jpeg-artifacts.js**

```js
/** JPEG compression artifacts — encode→decode→re-encode cycle. */

import { qualityFromStrength, clamp } from '../utils.js';

export const effect = {
  id: 'jpeg-artifacts',
  name: 'JPEG artifacts',
  category: 'compression',
  description: 'Compression blocking, ringing, and color banding from heavy JPEG re-encoding.',
  defaultStrength: 50,

  async apply(ctx, width, height, region, strength) {
    const quality = qualityFromStrength(strength);
    if (quality >= 0.99) return;

    const { x, y, w, h } = region;

    // Extract region
    const regionData = ctx.getImageData(x, y, w, h);
    const regionCanvas = document.createElement('canvas');
    regionCanvas.width = w;
    regionCanvas.height = h;
    const rctx = regionCanvas.getContext('2d');
    rctx.putImageData(regionData, 0, 0);

    // Encode at low quality
    const degradedBlob = await new Promise((resolve) => {
      regionCanvas.toBlob(resolve, 'image/jpeg', quality);
    });

    // Decode back
    const degradedImg = await new Promise((resolve, reject) => {
      const url = URL.createObjectURL(degradedBlob);
      const img = new Image();
      img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('decode failed')); };
      img.src = url;
    });

    // Paste degraded region back
    ctx.drawImage(degradedImg, x, y, w, h);
  },
};
```

Note: This is the only async effect. The pipeline must await it. Update pipeline.js to check: if effect.apply returns a Promise, await it.

- [ ] **Step 2: Update pipeline.js to handle async effects**

In `js/effects/pipeline.js`, change the effect application loop to:

```js
  for (const effect of registry) {
    if (!enabledIds.has(effect.id)) continue;
    const strength = strengths[effect.id] ?? effect.defaultStrength;
    if (strength <= 0) continue;
    try {
      await effect.apply(ctx, width, height, { x: rx, y: ry, w: rw, h: rh }, strength);
    } catch (err) {
      console.error(`Effect "${effect.id}" failed:`, err);
    }
  }
```

- [ ] **Step 3: Simplify processor.js to backward-compat wrapper**

```js
/** Backward-compat wrapper — delegates to effects pipeline. */

import { applyEffects } from './effects/pipeline.js';

/**
 * Apply JPEG artifacts only. Kept for backward compat; prefer applyEffects() directly.
 */
export async function applyArtifacts(imageData, region, strength) {
  const enabledIds = new Set(['jpeg-artifacts']);
  const strengths = { 'jpeg-artifacts': strength };
  return applyEffects(imageData, enabledIds, strengths, region);
}
```

- [ ] **Step 4: Verify syntax**

```bash
node --check js/effects/jpeg-artifacts.js && node --check js/effects/pipeline.js && node --check js/processor.js && echo "OK"
```

- [ ] **Step 5: Commit**

```bash
git add js/effects/jpeg-artifacts.js js/effects/pipeline.js js/processor.js
git commit -m "feat: migrate JPEG artifacts into effects system — async pipeline support"
```

---

### Task 6: UI Overhaul — Dynamic Effect List + Update app.js

**Files:**
- Modify: `index.html` (replace single slider control group with effects list container)
- Modify: `js/app.js` (switch to pipeline, dynamic effect UI)
- Modify: `css/app.css` (effect list styles)

- [ ] **Step 1: Update index.html controls panel**

Replace the "Settings" panel content. The region inputs stay; the single strength slider and apply button get replaced:

```html
        <!-- Controls Panel -->
        <div class="panel controls-panel">
          <h2>Region</h2>

          <div class="control-group">
            <label for="region-left">Left offset</label>
            <input type="number" id="region-left" value="0" min="0">
          </div>
          <div class="control-group">
            <label for="region-top">Top offset</label>
            <input type="number" id="region-top" value="0" min="0">
          </div>
          <div class="control-group">
            <label for="region-width">Width</label>
            <input type="number" id="region-width" value="200" min="1">
          </div>
          <div class="control-group">
            <label for="region-height">Height</label>
            <input type="number" id="region-height" value="200" min="1">
          </div>

          <div class="effects-divider"></div>
          <h2>Effects</h2>
          <div id="effects-list"></div>

          <button id="apply-btn" class="btn-primary">Apply effects</button>
          <button id="reset-btn" class="btn-secondary">Reset all</button>
          <p id="status-msg" class="info-text"></p>
        </div>
```

- [ ] **Step 2: Add effect list CSS**

Append to `css/app.css`:

```css
/* ── Effects List ─────────────────────────── */

.effects-divider {
  border-top: 1px solid var(--border);
  margin: 0.25rem 0;
}

#effects-list {
  display: flex;
  flex-direction: column;
  gap: 0.625rem;
  max-height: 420px;
  overflow-y: auto;
}

.effect-row {
  display: grid;
  grid-template-columns: auto 1fr;
  grid-template-rows: auto auto;
  gap: 0.25rem 0.5rem;
  align-items: center;
}

.effect-row input[type="checkbox"] {
  grid-row: 1;
  grid-column: 1;
  accent-color: var(--text);
  width: 15px;
  height: 15px;
  cursor: pointer;
}

.effect-row .effect-label {
  grid-row: 1;
  grid-column: 2;
  font-family: var(--font);
  font-size: 0.8125rem;
  font-weight: 500;
  color: var(--text);
  cursor: pointer;
}

.effect-row .effect-desc {
  grid-row: 2;
  grid-column: 2;
  font-family: var(--font);
  font-size: 0.6875rem;
  color: var(--text-muted);
}

.effect-row input[type="range"] {
  grid-row: 3;
  grid-column: 1 / -1;
  margin-top: 0.25rem;
  width: 100%;
  -webkit-appearance: none;
  appearance: none;
  height: 4px;
  background: var(--border);
  border-radius: 2px;
  outline: none;
}

.effect-row input[type="range"]::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: var(--text);
  cursor: pointer;
}

.effect-row input[type="range"]::-moz-range-thumb {
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: var(--text);
  border: none;
  cursor: pointer;
}

.effect-strength-label {
  font-family: var(--font);
  font-size: 0.6875rem;
  color: var(--text-muted);
  text-align: right;
}

.btn-secondary {
  padding: 0.5rem 1rem;
  border: 1px solid var(--border);
  background: transparent;
  color: var(--text-muted);
  font-family: var(--font);
  font-size: 0.8125rem;
  font-weight: 400;
  cursor: pointer;
  transition: color 0.15s, border-color 0.15s;
}

.btn-secondary:hover {
  color: var(--text);
  border-color: var(--text-muted);
}
```

- [ ] **Step 3: Rewrite app.js — dynamic effects + pipeline**

Write `js/app.js`:

```js
/** Main controller — dynamic effects UI + pipeline dispatch */

import { setupUpload } from './ui/upload.js';
import { setupRegion } from './ui/region.js';
import { setupOutput } from './ui/output.js';
import { applyEffects } from './effects/pipeline.js';
import { registry } from './effects/registry.js';

// --- DOM references ---
const dropZone = document.getElementById('drop-zone');
const fileInput = document.getElementById('file-input');
const errorMsg = document.getElementById('error-msg');
const workspace = document.getElementById('workspace');
const inputCanvas = document.getElementById('input-canvas');
const inputContainer = document.getElementById('input-canvas-container');
const imageInfo = document.getElementById('image-info');
const effectsList = document.getElementById('effects-list');
const applyBtn = document.getElementById('apply-btn');
const resetBtn = document.getElementById('reset-btn');
const statusMsg = document.getElementById('status-msg');
const outputCanvas = document.getElementById('output-canvas');
const downloadBtn = document.getElementById('download-btn');
const outputSize = document.getElementById('output-size');
const zoomOverlay = document.getElementById('zoom-overlay');
const zoomImage = document.getElementById('zoom-image');

// --- State ---
let currentImageData = null;
const effectStrengths = {};
const effectEnabled = {};

// --- Output module ---
const output = setupOutput(outputCanvas, downloadBtn, outputSize, zoomOverlay, zoomImage);

// --- Region selector ---
const regionInputs = {
  left: document.getElementById('region-left'),
  top: document.getElementById('region-top'),
  width: document.getElementById('region-width'),
  height: document.getElementById('region-height'),
};
const regionSelector = setupRegion(inputContainer, regionInputs);

// --- Build effects UI from registry ---
for (const effect of registry) {
  effectStrengths[effect.id] = effect.defaultStrength;
  effectEnabled[effect.id] = false;

  const row = document.createElement('div');
  row.className = 'effect-row';

  const cb = document.createElement('input');
  cb.type = 'checkbox';
  cb.id = `eff-${effect.id}`;
  cb.checked = false;

  const label = document.createElement('label');
  label.className = 'effect-label';
  label.htmlFor = cb.id;
  label.textContent = effect.name;

  const desc = document.createElement('span');
  desc.className = 'effect-desc';
  desc.textContent = effect.description;

  const slider = document.createElement('input');
  slider.type = 'range';
  slider.min = '0';
  slider.max = '100';
  slider.value = effect.defaultStrength;
  slider.style.display = 'none';
  slider.title = effect.name + ' strength';

  cb.addEventListener('change', () => {
    effectEnabled[effect.id] = cb.checked;
    slider.style.display = cb.checked ? '' : 'none';
  });

  slider.addEventListener('input', () => {
    effectStrengths[effect.id] = parseInt(slider.value);
  });

  row.appendChild(cb);
  row.appendChild(label);
  row.appendChild(desc);
  row.appendChild(slider);
  effectsList.appendChild(row);
}

// --- Upload ---
setupUpload(dropZone, fileInput,
  (imageData, fileName, fileSize) => {
    currentImageData = imageData;
    errorMsg.classList.add('hidden');
    workspace.classList.remove('hidden');
    dropZone.style.display = 'none';

    const displayW = inputContainer.clientWidth;
    inputCanvas.width = imageData.width;
    inputCanvas.height = imageData.height;
    inputCanvas.getContext('2d').putImageData(imageData, 0, 0);
    regionSelector.updateImage(imageData.width, imageData.height, displayW, imageData.height * (displayW / imageData.width));
    imageInfo.textContent = `${fileName} — ${imageData.width}×${imageData.height}`;
    output.clear();
    statusMsg.textContent = '';
  },
  (message) => {
    errorMsg.textContent = message;
    errorMsg.classList.remove('hidden');
  }
);

// --- Apply button ---
applyBtn.addEventListener('click', async () => {
  if (!currentImageData) return;

  const region = regionSelector.getRegion();
  const enabledIds = new Set(
    registry.filter(e => effectEnabled[e.id]).map(e => e.id)
  );

  if (enabledIds.size === 0) {
    statusMsg.textContent = 'No effects enabled.';
    return;
  }

  applyBtn.disabled = true;
  statusMsg.textContent = `Processing ${enabledIds.size} effects...`;

  try {
    const blob = await applyEffects(currentImageData, enabledIds, effectStrengths, region);
    await output.showResult(blob);
    statusMsg.textContent = `${enabledIds.size} effects applied.`;
  } catch (err) {
    statusMsg.textContent = 'Processing failed. Try a smaller image.';
    console.error('Pipeline error:', err);
  } finally {
    applyBtn.disabled = false;
  }
});

// --- Reset button ---
resetBtn.addEventListener('click', () => {
  const checkboxes = effectsList.querySelectorAll('input[type="checkbox"]');
  const sliders = effectsList.querySelectorAll('input[type="range"]');
  for (const cb of checkboxes) cb.checked = false;
  for (const s of sliders) {
    s.style.display = 'none';
    const effectId = s.title.replace(' strength', '');
    const def = registry.find(e => e.id === effectId)?.defaultStrength ?? 0;
    s.value = def;
    effectStrengths[effectId] = def;
    effectEnabled[effectId] = false;
  }
  statusMsg.textContent = '';
});
```

- [ ] **Step 4: Verify syntax**

```bash
node --check js/app.js && echo "OK"
```

- [ ] **Step 5: Start server and smoke test**

```bash
python3 server.py &
# Open http://localhost:8000, check console for errors
```

Manual checks:
- [ ] Effects list renders with all 10 effects from registry
- [ ] Checkbox toggles show/hide slider
- [ ] Can enable/disable multiple effects
- [ ] Apply with no effects shows "No effects enabled"
- [ ] Apply with effects processes and shows result
- [ ] Reset clears all
- [ ] Download works

- [ ] **Step 6: Commit**

```bash
git add index.html js/app.js css/app.css
git commit -m "feat: dynamic effects UI — toggle list from registry, multi-effect pipeline dispatch"
```

---

### Task 7: Integration Verification

**Files:**
- Modify: `README.md` (update with new effects documentation)

- [ ] **Step 1: Full syntax check**

```bash
for f in js/effects/*.js js/app.js js/processor.js js/ui/*.js js/utils.js; do
  node --check "$f" && echo "$f OK"
done
```

- [ ] **Step 2: Start server and verify**

```bash
python3 server.py &
curl -s -o /dev/null -w "%{http_code}" http://localhost:8000/
# Expected: 200
```

- [ ] **Step 3: Update README.md**

Add effects section to README:

```markdown
## Effects

10 camera imperfection effects across three categories:

**Focus flaws:** Motion blur, Soft focus
**Lens flaws:** Chromatic aberration, Vignetting, Edge softness, Lens flare
**Sensor flaws:** ISO grain, Dead/hot pixels, Dust spots
**Compression:** JPEG artifacts

Each effect can be toggled on/off with independent strength control.
All enabled effects are applied in a single pass in physically-correct order.
```

- [ ] **Step 4: Commit and push**

```bash
git add README.md
git commit -m "docs: update README with camera effects feature list"
git push origin main
```

- [ ] **Step 5: Final end-to-end test**

Manual checklist:
- [ ] Load a JPEG image
- [ ] Enable 3+ effects at various strengths
- [ ] Apply — verify output looks correct
- [ ] Click output to zoom — verify full-res preview
- [ ] Download — verify valid JPEG
- [ ] Reset — all toggles clear
- [ ] Try each effect individually at 100% strength — verify visible change
- [ ] No console errors
