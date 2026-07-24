# DesImageEditor — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform the single-region JPEG artifact tool into DesImageEditor — per-effect region selection with colored overlays, collapsible effect cards that grow as effects are enabled, a 4-preset system, and full rename.

**Architecture:** Pipeline accepts per-effect regions map. Region module manages multiple colored overlays with one active/editable. App controller builds collapsible card UI from registry and dispatches presets. Effect modules unchanged.

**Tech Stack:** Vanilla JS (ES modules), Canvas 2D API, ImageData. Zero dependencies.

## Global Constraints

- Zero npm dependencies — native ES modules only
- Must work in Chrome, Firefox, Safari, Edge
- Effect signature: `apply(ctx, width, height, region, strength)` — unchanged
- Pipeline now accepts `regions` map: `{ 'effect-id': {x,y,w,h}, ... }`
- Full-frame effects (vignetting, CA, edge-softness, lens-flare) ignore region, always full-frame
- Overlay colors per spec: motion-blur=#ff6b6b, soft-focus=#ffd93d, ca=#6bcb77, iso-grain=#4d96ff, dead-pixels=#ff922b, dust-spots=#cc5de8, jpeg-artifacts=#20c997
- Default region for each effect: full image dimensions
- Rename target: "DesImageEditor" in title, h1, README
- Presets don't override regions, only toggles + strengths

---

### Task 1: Rename to DesImageEditor

**Files:**
- Modify: `index.html` (title + h1 + subtitle)
- Modify: `README.md` (title + description)

- [ ] **Step 1: Update index.html**

Change:
```html
<title>DesImageEditor</title>
```
```html
<h1>DesImageEditor</h1>
```
```html
<p class="subtitle">Add real-world camera imperfections and compression artifacts to your images. Everything runs locally — no upload, no server, no paywall.</p>
```

- [ ] **Step 2: Update README.md**

Change title to `# DesImageEditor`. Update description.

- [ ] **Step 3: Commit**

```bash
git add index.html README.md
git commit -m "feat: rename to DesImageEditor"
```

---

### Task 2: Update Pipeline for Per-Effect Regions

**Files:**
- Modify: `js/effects/pipeline.js`

**Interfaces:**
- Consumes: `clamp` from `../utils.js`, `registry` from `./registry.js`
- Produces: `applyEffects(imageData, enabledIds, strengths, regions) → Promise<Blob>` where `regions = { 'effect-id': {x,y,w,h}, ... }`

- [ ] **Step 1: Update pipeline.js signature and region lookup**

Replace the single `region` parameter with `regions` map. Each effect gets its own region (or full-frame fallback):

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
 * @param {Object<string, {x:number,y:number,w:number,h:number}>} regions — per-effect regions
 * @returns {Promise<Blob>}
 */
export async function applyEffects(imageData, enabledIds, strengths, regions = {}) {
  const { width, height } = imageData;

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  ctx.putImageData(imageData, 0, 0);

  for (const effect of registry) {
    if (!enabledIds.has(effect.id)) continue;
    const strength = strengths[effect.id] ?? effect.defaultStrength;
    if (strength <= 0) continue;

    // Per-effect region with full-frame fallback
    const r = regions[effect.id] || { x: 0, y: 0, w: width, h: height };
    const rx = clamp(r.x, 0, width);
    const ry = clamp(r.y, 0, height);
    const rw = clamp(r.w, 1, width - rx);
    const rh = clamp(r.h, 1, height - ry);

    try {
      await effect.apply(ctx, width, height, { x: rx, y: ry, w: rw, h: rh }, strength);
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

- [ ] **Step 2: Verify syntax**

```bash
node --check js/effects/pipeline.js && echo "OK"
```

- [ ] **Step 3: Commit**

```bash
git add js/effects/pipeline.js
git commit -m "feat: pipeline accepts per-effect regions map"
```

---

### Task 3: Rewrite Region Module for Multi-Overlay with Colors

**Files:**
- Modify: `js/ui/region.js`

**Interfaces:**
- Consumes: `clamp` from `../utils.js`
- Produces: `setupRegions(container, inputs)` returning `{ getRegion(id), setRegion(id, r), setActiveEffect(id), updateOverlays(states), onRegionChanged(fn), updateImage(w, h, dw, dh) }`

- [ ] **Step 1: Write the new multi-overlay region module**

```js
/** Multi-overlay region selector — one colored handle per effect. */

import { clamp } from '../utils.js';

/** Colors assigned to each effect for overlay rendering. */
const OVERLAY_COLORS = {
  'motion-blur':          '#ff6b6b',
  'soft-focus':           '#ffd93d',
  'chromatic-aberration': '#6bcb77',
  'iso-grain':            '#4d96ff',
  'dead-pixels':          '#ff922b',
  'dust-spots':           '#cc5de8',
  'jpeg-artifacts':       '#20c997',
};

/**
 * Set up per-effect region overlays on a canvas container.
 * @param {HTMLElement} container
 * @param {Object} inputs — {left, top, width, height} HTMLInputElements
 */
export function setupRegions(container, inputs) {
  const regions = {};       // { effectId: {x,y,w,h} }
  let activeId = null;      // currently editable effect
  let overlays = {};        // { effectId: { handle, resizeHandle } }
  let enabledEffects = {};  // { effectId: boolean }
  let imageW = 1, imageH = 1, displayW = 1, displayH = 1;
  let listeners = [];

  const overlayContainer = document.createElement('div');
  overlayContainer.className = 'region-overlay';
  container.style.position = 'relative';
  container.appendChild(overlayContainer);

  // Dragging state
  let dragging = false, resizing = false;
  let dragStart = { x: 0, y: 0 };
  let dragRegion = { x: 0, y: 0, w: 0, h: 0 };

  function toDisplay(r) {
    const sx = displayW / imageW;
    const sy = displayH / imageH;
    return { x: r.x * sx, y: r.y * sy, w: r.w * sx, h: r.h * sy };
  }

  function createHandle(effectId, color) {
    const handle = document.createElement('div');
    handle.className = 'effect-overlay-handle';
    handle.style.cssText = `position:absolute;border:2px solid ${color};cursor:move;pointer-events:auto;`;
    handle.dataset.effectId = effectId;

    const resize = document.createElement('div');
    resize.className = 'effect-overlay-resize';
    resize.style.cssText = `position:absolute;bottom:-5px;right:-5px;width:10px;height:10px;background:${color};cursor:nwse-resize;pointer-events:auto;`;

    handle.appendChild(resize);

    handle.addEventListener('mousedown', (e) => {
      if (e.target === resize) {
        resizing = true;
      } else {
        dragging = true;
        setActiveEffect(effectId);
      }
      dragStart = { x: e.clientX, y: e.clientY };
      dragRegion = { ...(regions[activeId] || { x: 0, y: 0, w: 200, h: 200 }) };
      e.preventDefault();
      e.stopPropagation();
    });

    return { handle, resize };
  }

  // Global mouse events
  window.addEventListener('mousemove', (e) => {
    if (!dragging && !resizing) return;
    if (!activeId) return;
    const dx = e.clientX - dragStart.x;
    const dy = e.clientY - dragStart.y;
    const sx = imageW / displayW;
    const sy = imageH / displayH;
    const r = { ...(regions[activeId] || { x: 0, y: 0, w: 200, h: 200 }) };

    if (dragging) {
      r.x = Math.round(clamp(dragRegion.x + dx * sx, 0, imageW - r.w));
      r.y = Math.round(clamp(dragRegion.y + dy * sy, 0, imageH - r.h));
    } else if (resizing) {
      r.w = Math.round(clamp(dragRegion.w + dx * sx, 10, imageW - r.x));
      r.h = Math.round(clamp(dragRegion.h + dy * sy, 10, imageH - r.y));
    }

    regions[activeId] = r;
    renderAll();
    notify();
  });

  window.addEventListener('mouseup', () => { dragging = false; resizing = false; });

  // Numeric input sync — controls the active effect
  for (const key of ['left', 'top', 'width', 'height']) {
    const input = inputs[key];
    input.addEventListener('input', () => {
      if (!activeId) return;
      const mapKey = key === 'left' ? 'x' : key === 'top' ? 'y' : key === 'width' ? 'w' : 'h';
      const r = regions[activeId] || { x: 0, y: 0, w: 200, h: 200 };
      r[mapKey] = clamp(parseInt(input.value) || 0, 0, mapKey === 'w' ? imageW : mapKey === 'h' ? imageH : 99999);
      regions[activeId] = r;
      renderAll();
      notify();
    });
  }

  function renderAll() {
    for (const [id, els] of Object.entries(overlays)) {
      if (!enabledEffects[id]) {
        els.handle.style.display = 'none';
        continue;
      }
      const r = regions[id];
      if (!r) continue;
      const d = toDisplay(r);
      els.handle.style.display = '';
      els.handle.style.left = `${d.x}px`;
      els.handle.style.top = `${d.y}px`;
      els.handle.style.width = `${d.w}px`;
      els.handle.style.height = `${d.h}px`;
      els.handle.style.borderStyle = id === activeId ? 'solid' : 'dashed';
    }

    // Sync inputs to active effect
    if (activeId && regions[activeId]) {
      const ar = regions[activeId];
      inputs.left.value = ar.x;
      inputs.top.value = ar.y;
      inputs.width.value = ar.w;
      inputs.height.value = ar.h;
    }
  }

  function notify() {
    for (const fn of listeners) fn(activeId, { ...regions });
  }

  return {
    getRegion(id) { return { ...(regions[id] || { x: 0, y: 0, w: imageW, h: imageH }) }; },

    setRegion(id, r) {
      regions[id] = { x: r.x ?? 0, y: r.y ?? 0, w: r.w ?? imageW, h: r.h ?? imageH };
    },

    setActiveEffect(id) {
      activeId = id;
      renderAll();
      notify();
    },

    getActiveEffect() { return activeId; },

    /**
     * Update which effects are enabled, their colors, and their regions.
     * @param {Array<{id:string, enabled:boolean, region:{x,y,w,h}}>} states
     */
    updateOverlays(states) {
      for (const s of states) {
        enabledEffects[s.id] = s.enabled;
        if (!regions[s.id]) regions[s.id] = s.region;
        if (!overlays[s.id] && OVERLAY_COLORS[s.id]) {
          overlays[s.id] = createHandle(s.id, OVERLAY_COLORS[s.id]);
          overlayContainer.appendChild(overlays[s.id].handle);
        }
      }
      if (activeId && !enabledEffects[activeId]) {
        // Active effect was disabled — switch to first enabled
        const next = states.find(s => s.enabled);
        activeId = next ? next.id : null;
      }
      renderAll();
    },

    onRegionChanged(fn) { listeners.push(fn); },

    updateImage(naturalW, naturalH, displayW_, displayH_) {
      imageW = naturalW;
      imageH = naturalH;
      displayW = displayW_;
      displayH = displayH_;
      // Default all regions to full image
      for (const id of Object.keys(OVERLAY_COLORS)) {
        regions[id] = { x: 0, y: 0, w: imageW, h: imageH };
      }
      renderAll();
    },
  };
}
```

- [ ] **Step 2: Verify syntax**

```bash
node --check js/ui/region.js && echo "OK"
```

- [ ] **Step 3: Commit**

```bash
git add js/ui/region.js
git commit -m "feat: multi-overlay region selector with per-effect colored handles"
```

---

### Task 4: Create Presets Module

**Files:**
- Create: `js/effects/presets.js`

- [ ] **Step 1: Write presets.js**

```js
/** Preset effect combinations — one-click camera flaw recipes. */

export const presets = [
  {
    id: 'smartphone',
    name: 'Smartphone Snapshot',
    description: 'Slight soft focus, mild grain, and moderate JPEG compression.',
    effects: {
      'soft-focus':      { enabled: true, strength: 20 },
      'iso-grain':       { enabled: true, strength: 25 },
      'jpeg-artifacts':  { enabled: true, strength: 40 },
    },
  },
  {
    id: 'cheap-lens',
    name: 'Old/Cheap Lens',
    description: 'Heavy vignetting, chromatic aberration, and edge softness.',
    effects: {
      'vignetting':            { enabled: true, strength: 55 },
      'chromatic-aberration':  { enabled: true, strength: 50 },
      'edge-softness':         { enabled: true, strength: 45 },
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
      'vignetting':            { enabled: true, strength: 40 },
      'dust-spots':            { enabled: true, strength: 30 },
      'iso-grain':             { enabled: true, strength: 20 },
      'chromatic-aberration':  { enabled: true, strength: 35 },
    },
  },
];

/**
 * Save current settings as the Custom preset (session-local).
 * @param {Object} config — { enabledIds: Set, strengths: Object, regions: Object }
 */
export function saveCustomPreset(config) {
  const custom = presets.find(p => p.id === 'custom');
  if (!custom) {
    presets.push({ id: 'custom', name: 'Custom', description: 'Your current settings.', effects: {} });
  }
  const target = presets.find(p => p.id === 'custom');
  target.effects = {};
  for (const id of config.enabledIds) {
    target.effects[id] = {
      enabled: true,
      strength: config.strengths[id] ?? 30,
    };
  }
}
```

- [ ] **Step 2: Verify syntax**

```bash
node --check js/effects/presets.js && echo "OK"
```

- [ ] **Step 3: Commit**

```bash
git add js/effects/presets.js
git commit -m "feat: add presets system — 4 pre-configured camera flaw recipes + custom"
```

---

### Task 5: Rewrite app.js + index.html — Card UI, Per-Effect Regions, Presets

**Files:**
- Modify: `js/app.js`
- Modify: `index.html`

**Interfaces:**
- Consumes: `setupRegions` from `./ui/region.js`, `applyEffects` from `./effects/pipeline.js`, `registry` from `./effects/registry.js`, `presets` + `saveCustomPreset` from `./effects/presets.js`
- Produces: full app controller with card UI, per-effect regions, colored overlays, presets dropdown

- [ ] **Step 1: Write the new app.js**

Write `js/app.js`:
```js
/** DesImageEditor — multi-effect camera flaw simulator with per-effect regions. */

import { setupUpload } from './ui/upload.js';
import { setupRegions } from './ui/region.js';
import { setupOutput } from './ui/output.js';
import { applyEffects } from './effects/pipeline.js';
import { registry } from './effects/registry.js';
import { presets, saveCustomPreset } from './effects/presets.js';

// Full-frame effects — no region overlay or inputs
const FULL_FRAME = new Set(['vignetting', 'chromatic-aberration', 'edge-softness', 'lens-flare']);

// --- DOM ---
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
const presetSelect = document.getElementById('preset-select');
const presetApply = document.getElementById('preset-apply');
const outputCanvas = document.getElementById('output-canvas');
const downloadBtn = document.getElementById('download-btn');
const outputSize = document.getElementById('output-size');
const zoomOverlay = document.getElementById('zoom-overlay');
const zoomImage = document.getElementById('zoom-image');

// --- State ---
let currentImageData = null;
const effectStrengths = {};
const effectEnabled = {};
const effectRegions = {};

// --- Output ---
const output = setupOutput(outputCanvas, downloadBtn, outputSize, zoomOverlay, zoomImage);

// --- Regions ---
const regionInputs = {
  left: document.getElementById('region-left'),
  top: document.getElementById('region-top'),
  width: document.getElementById('region-width'),
  height: document.getElementById('region-height'),
};
const regions = setupRegions(inputContainer, regionInputs);

// --- Build effect cards ---
for (const effect of registry) {
  effectStrengths[effect.id] = effect.defaultStrength;
  effectEnabled[effect.id] = false;
  effectRegions[effect.id] = { x: 0, y: 0, w: 0, h: 0 };

  const isFullFrame = FULL_FRAME.has(effect.id);

  const card = document.createElement('div');
  card.className = 'effect-card';
  card.dataset.effectId = effect.id;

  // Header row
  const header = document.createElement('div');
  header.className = 'effect-card-header';

  const toggle = document.createElement('span');
  toggle.className = 'effect-toggle';
  toggle.textContent = '○';
  toggle.title = 'Toggle effect';

  const dot = document.createElement('span');
  dot.className = 'effect-dot';
  dot.style.cssText = `background:${getColor(effect.id)};width:8px;height:8px;border-radius:50%;display:inline-block;margin-right:6px;flex-shrink:0;`;

  const name = document.createElement('span');
  name.className = 'effect-card-name';
  name.textContent = effect.name;

  const badge = document.createElement('span');
  if (isFullFrame) {
    badge.className = 'effect-badge';
    badge.textContent = 'Full frame';
  }

  header.appendChild(toggle);
  header.appendChild(dot);
  header.appendChild(name);
  if (isFullFrame) header.appendChild(badge);

  // Body (hidden when disabled)
  const body = document.createElement('div');
  body.className = 'effect-card-body';
  body.style.display = 'none';

  const slider = document.createElement('input');
  slider.type = 'range';
  slider.min = '0';
  slider.max = '100';
  slider.value = effect.defaultStrength;
  slider.className = 'effect-slider';
  slider.dataset.effectId = effect.id;
  slider.addEventListener('input', () => {
    effectStrengths[effect.id] = parseInt(slider.value);
  });

  body.appendChild(slider);

  // Region inputs for non-full-frame effects
  if (!isFullFrame) {
    const regionRow = document.createElement('div');
    regionRow.className = 'effect-region-row';
    regionRow.innerHTML = `
      <span class="effect-region-label">Region:</span>
      <span class="effect-region-values" id="region-display-${effect.id}">Full image</span>
      <button class="effect-region-btn" data-effect="${effect.id}">Edit region</button>
    `;
    regionRow.querySelector('.effect-region-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      regions.setActiveEffect(effect.id);
      updateRegionInputsVisibility(effect.id);
    });
    body.appendChild(regionRow);
  }

  // Toggle
  const toggleEffect = () => {
    const wasEnabled = effectEnabled[effect.id];
    effectEnabled[effect.id] = !wasEnabled;
    toggle.textContent = effectEnabled[effect.id] ? '●' : '○';
    body.style.display = effectEnabled[effect.id] ? '' : 'none';
    card.classList.toggle('effect-card--enabled', effectEnabled[effect.id]);

    if (effectEnabled[effect.id] && !wasEnabled) {
      regions.setActiveEffect(effect.id);
      updateRegionInputsVisibility(effect.id);
    }

    updateAllOverlays();
  };

  toggle.addEventListener('click', toggleEffect);
  name.addEventListener('click', toggleEffect);

  card.appendChild(header);
  card.appendChild(body);
  effectsList.appendChild(card);
}

function getColor(id) {
  const colors = {
    'motion-blur': '#ff6b6b', 'soft-focus': '#ffd93d', 'chromatic-aberration': '#6bcb77',
    'iso-grain': '#4d96ff', 'dead-pixels': '#ff922b', 'dust-spots': '#cc5de8', 'jpeg-artifacts': '#20c997',
  };
  return colors[id] || '#888';
}

function updateRegionInputsVisibility(activeId) {
  const isFF = FULL_FRAME.has(activeId);
  for (const key of ['left', 'top', 'width', 'height']) {
    regionInputs[key].parentElement.style.display = isFF ? 'none' : '';
  }
}

function updateAllOverlays() {
  const states = registry.map(e => ({
    id: e.id,
    enabled: effectEnabled[e.id],
    region: effectRegions[e.id],
  }));
  regions.updateOverlays(states);
}

// --- Presets dropdown ---
for (const p of presets) {
  const opt = document.createElement('option');
  opt.value = p.id;
  opt.textContent = p.name;
  presetSelect.appendChild(opt);
}

presetApply.addEventListener('click', () => {
  const preset = presets.find(p => p.id === presetSelect.value);
  if (!preset) return;

  // Reset all
  for (const e of registry) {
    effectEnabled[e.id] = false;
    effectStrengths[e.id] = e.defaultStrength;
  }

  // Apply preset
  for (const [id, cfg] of Object.entries(preset.effects)) {
    effectEnabled[id] = cfg.enabled;
    effectStrengths[id] = cfg.strength;
  }

  // Re-render cards
  for (const card of effectsList.querySelectorAll('.effect-card')) {
    const id = card.dataset.effectId;
    const enabled = effectEnabled[id];
    card.querySelector('.effect-toggle').textContent = enabled ? '●' : '○';
    card.querySelector('.effect-card-body').style.display = enabled ? '' : 'none';
    card.classList.toggle('effect-card--enabled', enabled);
    const slider = card.querySelector('.effect-slider');
    if (slider) slider.value = effectStrengths[id];
  }

  updateAllOverlays();
  const firstEnabled = registry.find(e => effectEnabled[e.id]);
  if (firstEnabled) regions.setActiveEffect(firstEnabled.id);
});

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
    regions.updateImage(imageData.width, imageData.height, displayW, imageData.height * (displayW / imageData.width));

    // Init all regions to full image
    for (const e of registry) {
      effectRegions[e.id] = { x: 0, y: 0, w: imageData.width, h: imageData.height };
    }

    imageInfo.textContent = `${fileName} — ${imageData.width}×${imageData.height}`;
    output.clear();
    statusMsg.textContent = '';
  },
  (message) => {
    errorMsg.textContent = message;
    errorMsg.classList.remove('hidden');
  }
);

// --- Region change handler ---
regions.onRegionChanged((activeId, allRegions) => {
  for (const [id, r] of Object.entries(allRegions)) {
    effectRegions[id] = r;
  }
});

// --- Apply ---
applyBtn.addEventListener('click', async () => {
  if (!currentImageData) return;

  const enabledIds = new Set(registry.filter(e => effectEnabled[e.id]).map(e => e.id));
  if (enabledIds.size === 0) { statusMsg.textContent = 'No effects enabled.'; return; }

  applyBtn.disabled = true;
  statusMsg.textContent = `Processing ${enabledIds.size} effects...`;

  try {
    const blob = await applyEffects(currentImageData, enabledIds, effectStrengths, effectRegions);
    await output.showResult(blob);
    statusMsg.textContent = `${enabledIds.size} effects applied.`;
    saveCustomPreset({ enabledIds, strengths: effectStrengths, regions: effectRegions });
  } catch (err) {
    statusMsg.textContent = 'Processing failed.';
    console.error(err);
  } finally {
    applyBtn.disabled = false;
  }
});

// --- Reset ---
resetBtn.addEventListener('click', () => {
  for (const e of registry) {
    effectEnabled[e.id] = false;
    effectStrengths[e.id] = e.defaultStrength;
  }
  for (const card of effectsList.querySelectorAll('.effect-card')) {
    const id = card.dataset.effectId;
    card.querySelector('.effect-toggle').textContent = '○';
    card.querySelector('.effect-card-body').style.display = 'none';
    card.classList.remove('effect-card--enabled');
    const slider = card.querySelector('.effect-slider');
    if (slider) slider.value = effectStrengths[id];
  }
  updateAllOverlays();
  statusMsg.textContent = '';
});
```

- [ ] **Step 2: Update index.html controls panel**

Replace the effects section with the new card-based UI + presets dropdown + region inputs:

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

          <div class="effects-divider"></div>
          <div class="presets-row">
            <select id="preset-select"></select>
            <button id="preset-apply" class="btn-secondary">Apply preset</button>
          </div>

          <button id="apply-btn" class="btn-primary">Apply effects</button>
          <button id="reset-btn" class="btn-secondary">Reset all</button>
          <p id="status-msg" class="info-text"></p>
        </div>
```

- [ ] **Step 3: Verify syntax**

```bash
node --check js/app.js && echo "OK"
```

- [ ] **Step 4: Start server and smoke test**

```bash
python3 server.py &
curl -s -o /dev/null -w "%{http_code}" http://localhost:8000/
```

- [ ] **Step 5: Commit**

```bash
git add js/app.js index.html
git commit -m "feat: card-based effect UI with per-effect regions, presets, and rename"
```

---

### Task 6: CSS Update — Card Styles + Presets Dropdown

**Files:**
- Modify: `css/app.css`

- [ ] **Step 1: Replace effects-list styles with card styles**

Append to `css/app.css`, replacing the old `#effects-list` and `.effect-row` styles:

```css
/* ── Effect Cards ─────────────────────────── */

#effects-list {
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
}

.effect-card {
  border: 1px solid var(--border);
  padding: 0.625rem 0.75rem;
  transition: border-color 0.15s;
}

.effect-card--enabled {
  border-color: var(--text-muted);
}

.effect-card-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  cursor: pointer;
  user-select: none;
}

.effect-toggle {
  font-size: 0.875rem;
  flex-shrink: 0;
  width: 1.25rem;
  text-align: center;
}

.effect-card-name {
  font-family: var(--font);
  font-size: 0.875rem;
  font-weight: 500;
  color: var(--text);
}

.effect-badge {
  font-family: var(--font);
  font-size: 0.625rem;
  color: var(--text-muted);
  border: 1px solid var(--border);
  padding: 0.125rem 0.375rem;
  margin-left: auto;
  white-space: nowrap;
}

.effect-card-body {
  margin-top: 0.625rem;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.effect-slider {
  width: 100%;
  -webkit-appearance: none;
  appearance: none;
  height: 4px;
  background: var(--border);
  border-radius: 2px;
  outline: none;
}

.effect-slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: var(--text);
  cursor: pointer;
}

.effect-slider::-moz-range-thumb {
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: var(--text);
  border: none;
  cursor: pointer;
}

.effect-region-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.effect-region-label {
  font-family: var(--font);
  font-size: 0.6875rem;
  color: var(--text-muted);
}

.effect-region-values {
  font-family: var(--font);
  font-size: 0.6875rem;
  color: var(--text);
  flex: 1;
}

.effect-region-btn {
  font-family: var(--font);
  font-size: 0.625rem;
  background: transparent;
  border: 1px solid var(--border);
  color: var(--text-muted);
  padding: 0.125rem 0.5rem;
  cursor: pointer;
}

.effect-region-btn:hover {
  border-color: var(--text-muted);
  color: var(--text);
}

/* ── Effect Overlay Handles ──────────────── */

.effect-overlay-handle {
  transition: none;
  mix-blend-mode: difference;
}

.effect-overlay-resize {
  mix-blend-mode: difference;
}

/* ── Presets ──────────────────────────────── */

.presets-row {
  display: flex;
  gap: 0.5rem;
}

#preset-select {
  flex: 1;
  padding: 0.375rem 0.5rem;
  border: 1px solid var(--border);
  background: var(--bg);
  color: var(--text);
  font-family: var(--font);
  font-size: 0.75rem;
  outline: none;
}
```

- [ ] **Step 2: Remove old effect-row styles (conflict prevention)**

Remove old `.effect-row`, `.effect-label`, `.effect-desc`, `.effect-strength-label`, `.effects-divider` styles from the CSS (replace with the new ones above).

- [ ] **Step 3: Commit**

```bash
git add css/app.css
git commit -m "feat: card UI styles — collapsible effect cards, presets dropdown, overlay handles"
```

---

### Task 7: Integration Verification

**Files:**
- Modify: `README.md` (update with new name + features)

- [ ] **Step 1: Full syntax check**

```bash
for f in js/effects/*.js js/app.js js/processor.js js/ui/*.js js/utils.js; do
  node --check "$f" && echo "$f OK"
done
```

- [ ] **Step 2: Start server + verify**

```bash
python3 server.py &
curl -s -o /dev/null -w "%{http_code}" http://localhost:8000/
# Expected: 200
```

- [ ] **Step 3: Update README**

Update README title to "DesImageEditor", add per-effect region + presets documentation.

- [ ] **Step 4: Commit and push**

```bash
git add README.md
git commit -m "docs: update README for DesImageEditor — per-effect regions, presets"
git push origin main
```

- [ ] **Step 5: Manual end-to-end test checklist**

- [ ] Load a JPEG — verify workspace shows
- [ ] Enable Motion blur — verify card expands, red overlay appears on input
- [ ] Enable ISO grain — verify card expands, blue overlay appears
- [ ] Click between cards — verify active overlay changes (solid vs dashed)
- [ ] Drag active overlay — verify region inputs update
- [ ] Enable full-frame effect (Vignetting) — verify no overlay, "Full frame" badge
- [ ] Apply preset "Smartphone Snapshot" — verify 3 effects enabled with correct strengths
- [ ] Apply all effects — verify output with per-effect regions
- [ ] Zoom output — verify full-res preview
- [ ] Download — verify valid JPEG
- [ ] Reset — all cards collapse, overlays disappear
- [ ] Page title shows "DesImageEditor"
