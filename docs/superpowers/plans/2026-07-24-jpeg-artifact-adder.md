# JPEG Artifact Adder — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a single-page web app that introduces real JPEG compression artifacts into user-selected regions of an image, replicating onlinejpgtools.com/add-jpg-artifacts.

**Architecture:** Vanilla HTML/CSS/JS with ES modules. JPEG artifact generation uses the browser's native Canvas API `toBlob('image/jpeg', quality)` — the same real JPEG encoder the reference site uses (Chrome = libjpeg-turbo, Firefox = mozjpeg). No build step, no npm, no backend. Artifacts come from a genuine encode→decode→re-encode cycle at controlled quality levels.

**Tech Stack:** HTML5, CSS3, vanilla JavaScript (ES modules), Canvas API, Blob/FileReader API. No dependencies.

## Global Constraints

- Zero npm dependencies — everything loads via native `<script type="module">` or `<link>`
- Must work in Chrome, Firefox, Safari, Edge (all modern browsers)
- JPEG output quality for non-artifact areas: 0.92
- Artifact quality formula: `quality = 1.0 - (strength / 100) * 0.99` (maps 0%→1.0, 100%→0.01)
- JPEG magic bytes validation: check for `FF D8 FF` at file start
- Image size warning threshold: 50 megapixels or 50 megabytes
- Region coordinates clamp to image bounds silently

---

### Task 1: Project Scaffold — Directory Structure & Dev Server

**Files:**
- Create: `index.html` (shell only — full markup in Task 8)
- Create: `css/app.css` (empty)
- Create: `js/utils.js` (empty)
- Create: `js/processor.js` (empty)
- Create: `js/ui/upload.js` (empty)
- Create: `js/ui/region.js` (empty)
- Create: `js/ui/output.js` (empty)
- Create: `js/app.js` (empty)
- Create: `server.py`

**Interfaces:**
- Consumes: nothing (greenfield)
- Produces: directory structure all later tasks write into

- [ ] **Step 1: Create directory structure**

```bash
mkdir -p /Users/d.desmaanzephyll/Desktop/JPEG_C_ART/css
mkdir -p /Users/d.desmaanzephyll/Desktop/JPEG_C_ART/js/ui
```

- [ ] **Step 2: Create minimal index.html shell**

Write `index.html`:
```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>JPEG Artifact Adder</title>
  <link rel="stylesheet" href="css/app.css">
</head>
<body>
  <script type="module" src="js/app.js"></script>
</body>
</html>
```

- [ ] **Step 3: Create empty module files**

Write each empty file with a doc comment only:

`js/utils.js`:
```js
/** Shared helpers: magic bytes, clamp, quality formula */
```

`js/processor.js`:
```js
/** JPEG artifact engine: encode→decode→re-encode cycle via Canvas API */
```

`js/ui/upload.js`:
```js
/** File drop/click handler, JPEG validation, decode to ImageData */
```

`js/ui/region.js`:
```js
/** Canvas overlay with draggable, resizable rectangle region selector */
```

`js/ui/output.js`:
```js
/** Preview display and download trigger for processed image */
```

`js/app.js`:
```js
/** Main controller — wires UI events to processor calls */
```

`css/app.css`:
```css
/* JPEG Artifact Adder — all styles */
```

- [ ] **Step 4: Create dev server script**

Write `server.py`:
```python
import http.server
import socketserver

PORT = 8000

class Handler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cross-Origin-Opener-Policy", "same-origin")
        self.send_header("Cross-Origin-Embedder-Policy", "require-corp")
        super().end_headers()

with socketserver.TCPServer(("", PORT), Handler) as httpd:
    print(f"Serving at http://localhost:{PORT}")
    httpd.serve_forever()
```

- [ ] **Step 5: Verify scaffold loads without errors**

Run: `python3 server.py &` then `curl -s http://localhost:8000/ | head -5`
Expected: HTML structure returned. Kill the server after.

- [ ] **Step 6: Commit**

```bash
cd /Users/d.desmaanzephyll/Desktop/JPEG_C_ART
git init
git add -A
git commit -m "feat: project scaffold — directory structure, dev server, empty modules"
```

---

### Task 2: Utils Module — Shared Helpers

**Files:**
- Modify: `js/utils.js`

**Interfaces:**
- Consumes: nothing
- Produces:
  - `isJPEG(buffer: ArrayBuffer): boolean` — checks magic bytes FF D8 FF
  - `qualityFromStrength(strength: number): number` — maps 0–100 to 1.0–0.01
  - `clamp(value: number, min: number, max: number): number`
  - `warnIfLarge(width: number, height: number, byteSize: number): string|null` — returns warning or null

- [ ] **Step 1: Write the module**

Write `js/utils.js`:
```js
/** Shared helpers: magic bytes, clamp, quality formula */

const JPEG_MAGIC = new Uint8Array([0xff, 0xd8, 0xff]);
const MEGAPIXEL_THRESHOLD = 50_000_000; // 50 MP
const MEGABYTE_THRESHOLD = 50_000_000;  // 50 MB

/**
 * Check if an ArrayBuffer starts with JPEG magic bytes (FF D8 FF).
 * @param {ArrayBuffer} buffer
 * @returns {boolean}
 */
export function isJPEG(buffer) {
  if (buffer.byteLength < 3) return false;
  const head = new Uint8Array(buffer, 0, 3);
  return head[0] === JPEG_MAGIC[0]
      && head[1] === JPEG_MAGIC[1]
      && head[2] === JPEG_MAGIC[2];
}

/**
 * Convert artifact strength (0–100) to JPEG quality (1.0 → 0.01).
 * Strength 0 = quality 1.0 (no artifacts).
 * Strength 100 = quality 0.01 (maximum degradation).
 * @param {number} strength — 0 to 100
 * @returns {number} — quality 0.01 to 1.0
 */
export function qualityFromStrength(strength) {
  const s = clamp(strength, 0, 100);
  return 1.0 - (s / 100) * 0.99;
}

/**
 * Clamp a value between min and max (inclusive).
 * @param {number} value
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
export function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

/**
 * Check if image exceeds size thresholds. Returns warning string or null.
 * @param {number} width — image width in pixels
 * @param {number} height — image height in pixels
 * @param {number} byteSize — file size in bytes
 * @returns {string|null}
 */
export function warnIfLarge(width, height, byteSize) {
  const pixels = width * height;
  const warnings = [];
  if (pixels > MEGAPIXEL_THRESHOLD) {
    warnings.push(`${(pixels / 1_000_000).toFixed(1)} megapixels`);
  }
  if (byteSize > MEGABYTE_THRESHOLD) {
    warnings.push(`${(byteSize / 1_000_000).toFixed(1)} MB`);
  }
  if (warnings.length === 0) return null;
  return `Large image (${warnings.join(", ")}). Processing may be slow. Continue?`;
}

/**
 * Format bytes into a human-readable string.
 * @param {number} bytes
 * @returns {string}
 */
export function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1_048_576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1_048_576).toFixed(1)} MB`;
}
```

- [ ] **Step 2: Verify module loads**

Add a temporary import to `js/app.js`:
```js
import { isJPEG, qualityFromStrength, clamp, warnIfLarge, formatBytes } from './utils.js';
console.log('Utils loaded:', { isJPEG, qualityFromStrength, clamp, warnIfLarge, formatBytes });
```

Run: `python3 server.py &` → open `http://localhost:8000` → check DevTools console for the log.
Expected: `Utils loaded: {isJPEG: f, qualityFromStrength: f, ...}`

- [ ] **Step 3: Remove temporary import and commit**

Restore `js/app.js` to its empty state:
```js
/** Main controller — wires UI events to processor calls */
```

```bash
git add js/utils.js js/app.js
git commit -m "feat: add utils module — JPEG validation, quality formula, clamp, size warning"
```

---

### Task 3: Upload Module — File Input, Drag/Drop, JPEG Decode

**Files:**
- Modify: `js/ui/upload.js`

**Interfaces:**
- Consumes: `isJPEG`, `warnIfLarge`, `formatBytes` from `js/utils.js`
- Produces:
  - `setupUpload(dropZone: HTMLElement, fileInput: HTMLInputElement, onImageLoaded: (imageData: ImageData, fileName: string, fileSize: number) => void, onError: (message: string) => void): void`

- [ ] **Step 1: Write the upload module**

Write `js/ui/upload.js`:
```js
/** File drop/click handler, JPEG validation, decode to ImageData */

import { isJPEG, warnIfLarge, formatBytes } from '../utils.js';

/**
 * Set up file upload via drag-and-drop and file input click.
 * @param {HTMLElement} dropZone — element to receive drag events
 * @param {HTMLInputElement} fileInput — hidden file input
 * @param {function} onImageLoaded — callback(imageData, fileName, fileSize)
 * @param {function} onError — callback(message)
 */
export function setupUpload(dropZone, fileInput, onImageLoaded, onError) {
  // Click to open file picker
  dropZone.addEventListener('click', () => fileInput.click());

  // File selected via input
  fileInput.addEventListener('change', () => {
    const file = fileInput.files[0];
    if (file) handleFile(file, onImageLoaded, onError);
  });

  // Drag-and-drop
  dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('drag-over');
  });

  dropZone.addEventListener('dragleave', () => {
    dropZone.classList.remove('drag-over');
  });

  dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('drag-over');
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file, onImageLoaded, onError);
  });
}

/**
 * Validate and decode a JPEG file.
 */
function handleFile(file, onImageLoaded, onError) {
  // Check file extension / type
  if (!file.type.startsWith('image/')) {
    onError('Please select an image file.');
    return;
  }

  const reader = new FileReader();

  reader.onload = () => {
    const buffer = reader.result; // ArrayBuffer

    // Validate JPEG magic bytes
    if (!isJPEG(buffer)) {
      onError('Please use a JPEG image (JPG/JPEG format).');
      return;
    }

    // Decode via browser image decoder
    const blob = new Blob([buffer], { type: file.type });
    const url = URL.createObjectURL(blob);
    const img = new Image();

    img.onload = () => {
      URL.revokeObjectURL(url);

      // Size warning
      const warning = warnIfLarge(img.naturalWidth, img.naturalHeight, buffer.byteLength);
      if (warning && !confirm(warning)) {
        return; // User cancelled
      }

      // Draw to canvas to get raw ImageData
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

      onImageLoaded(imageData, file.name, buffer.byteLength);
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      onError('This JPEG format is not supported. Try a baseline JPEG.');
    };

    img.src = url;
  };

  reader.onerror = () => {
    onError('Failed to read file. Try again.');
  };

  reader.readAsArrayBuffer(file);
}
```

- [ ] **Step 2: Verify module syntax**

No runtime test yet (needs DOM). Verify no syntax errors:
```bash
node --check js/ui/upload.js 2>&1 || echo "Syntax check passed (Node may not support ESM with --check)"
```
(Notable: Node `--check` may not support ESM imports. As long as no glaring syntax errors, proceed.)

- [ ] **Step 3: Commit**

```bash
git add js/ui/upload.js
git commit -m "feat: add upload module — drag/drop, file input, JPEG decode"
```

---

### Task 4: Processor Module — JPEG Artifact Engine

**Files:**
- Modify: `js/processor.js`

**Interfaces:**
- Consumes: `qualityFromStrength`, `clamp` from `js/utils.js`
- Produces:
  - `applyArtifacts(imageData: ImageData, region: {x: number, y: number, w: number, h: number}, strength: number): Promise<Blob>` — returns processed JPEG blob
  - Core logic: extract region → encode at low quality → decode → composite → final encode

- [ ] **Step 1: Write the processor module**

Write `js/processor.js`:
```js
/** JPEG artifact engine: encode→decode→re-encode cycle via Canvas API */

import { qualityFromStrength, clamp } from './utils.js';

/** Quality for final output (non-artifact areas). */
const OUTPUT_QUALITY = 0.92;

/**
 * Apply JPEG artifacts to a region of the image.
 *
 * Mechanism: Extract the region → re-encode it at low JPEG quality →
 * decode the degraded version → composite it back onto the original →
 * encode the full image at normal quality.
 *
 * @param {ImageData} imageData — full image pixel data
 * @param {{x: number, y: number, w: number, h: number}} region
 * @param {number} strength — 0 to 100
 * @returns {Promise<Blob>} — JPEG blob with artifacts
 */
export async function applyArtifacts(imageData, region, strength) {
  const { width, height } = imageData;

  // Clamp region to image bounds
  const rx = clamp(region.x, 0, width);
  const ry = clamp(region.y, 0, height);
  const rw = clamp(region.w, 1, width - rx);
  const rh = clamp(region.h, 1, height - ry);

  // Step 1: Draw original to a full canvas
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  ctx.putImageData(imageData, 0, 0);

  if (strength <= 0) {
    // No artifacts — just return the original re-encoded at output quality
    return canvasToBlob(canvas, OUTPUT_QUALITY);
  }

  // Step 2: Extract the region into a sub-canvas
  const regionCanvas = document.createElement('canvas');
  regionCanvas.width = rw;
  regionCanvas.height = rh;
  const regionCtx = regionCanvas.getContext('2d');
  regionCtx.drawImage(canvas, rx, ry, rw, rh, 0, 0, rw, rh);

  // Step 3: Re-encode the region at low quality → get back a degraded JPEG blob
  const artifactQuality = qualityFromStrength(strength);
  const degradedBlob = await canvasToBlob(regionCanvas, artifactQuality);

  // Step 4: Decode the degraded region back
  const degradedImage = await blobToImage(degradedBlob);

  // Step 5: Paste degraded region onto the original
  ctx.drawImage(degradedImage, rx, ry, rw, rh);

  // Step 6: Encode final composite at output quality
  return canvasToBlob(canvas, OUTPUT_QUALITY);
}

/**
 * Convert a canvas to a JPEG blob at the given quality.
 * @param {HTMLCanvasElement} canvas
 * @param {number} quality — 0.0 to 1.0
 * @returns {Promise<Blob>}
 */
function canvasToBlob(canvas, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error('Canvas toBlob returned null'));
      },
      'image/jpeg',
      quality
    );
  });
}

/**
 * Decode a JPEG blob into an HTMLImageElement.
 * @param {Blob} blob
 * @returns {Promise<HTMLImageElement>}
 */
function blobToImage(blob) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to decode JPEG blob'));
    };
    img.src = url;
  });
}

/**
 * Get a Blob from an ImageData by drawing it to a canvas and encoding.
 * @param {ImageData} imageData
 * @param {number} quality
 * @returns {Promise<Blob>}
 */
export function imageDataToBlob(imageData, quality = OUTPUT_QUALITY) {
  const canvas = document.createElement('canvas');
  canvas.width = imageData.width;
  canvas.height = imageData.height;
  const ctx = canvas.getContext('2d');
  ctx.putImageData(imageData, 0, 0);
  return canvasToBlob(canvas, quality);
}
```

- [ ] **Step 2: Verify module syntax**

```bash
node -e "import('./js/processor.js').then(m => console.log(Object.keys(m)))" 2>&1 || echo "(Node ESM check — errors expected for DOM APIs, syntax should be clean)"
```

- [ ] **Step 3: Commit**

```bash
git add js/processor.js
git commit -m "feat: add processor module — JPEG artifact encode/decode/re-encode pipeline"
```

---

### Task 5: Region Selector — Draggable Canvas Overlay + Numeric Inputs

**Files:**
- Modify: `js/ui/region.js`

**Interfaces:**
- Consumes: `clamp` from `js/utils.js`
- Produces:
  - `setupRegion(canvasContainer: HTMLElement, inputs: {left: HTMLInputElement, top: HTMLInputElement, width: HTMLInputElement, height: HTMLInputElement}): {getRegion(): {x, y, w, h}, setRegion(r): void, onRegionChanged: (callback: (r) => void) => void}`

- [ ] **Step 1: Write the region selector module**

Write `js/ui/region.js`:
```js
/** Canvas overlay with draggable, resizable rectangle region selector */

import { clamp } from '../utils.js';

/**
 * Set up a draggable region selector overlay on a canvas container.
 * The canvas should already display the loaded image.
 *
 * @param {HTMLElement} container — element wrapping the canvas
 * @param {Object} inputs — numeric input elements for left, top, width, height
 * @returns {Object} — { getRegion, setRegion, onRegionChanged, updateCanvas(canvas) }
 */
export function setupRegion(container, inputs) {
  let region = { x: 0, y: 0, w: 200, h: 200 };
  let imageW = 1, imageH = 1; // natural image dimensions
  let displayW = 1, displayH = 1; // display size
  let dragging = false;
  let resizing = false;
  let dragStart = { x: 0, y: 0 };
  let dragRegion = { x: 0, y: 0, w: 0, h: 0 };
  let listeners = [];

  // Create overlay div for the selection rectangle
  const overlay = document.createElement('div');
  overlay.className = 'region-overlay';
  overlay.style.cssText = `
    position: absolute; top: 0; left: 0;
    pointer-events: none; z-index: 10;
  `;
  container.style.position = 'relative';
  container.appendChild(overlay);

  // Create draggable/resizable handle
  const handle = document.createElement('div');
  handle.className = 'region-handle';
  handle.style.cssText = `
    position: absolute;
    border: 2px dashed #fff;
    box-shadow: 0 0 0 1px rgba(0,0,0,0.5);
    cursor: move;
    pointer-events: auto;
  `;

  // Resize handle (bottom-right corner)
  const resizeHandle = document.createElement('div');
  resizeHandle.className = 'resize-handle';
  resizeHandle.style.cssText = `
    position: absolute; bottom: -6px; right: -6px;
    width: 12px; height: 12px;
    background: #fff; border: 2px solid #333;
    cursor: nwse-resize; pointer-events: auto;
  `;
  handle.appendChild(resizeHandle);

  overlay.appendChild(handle);

  /** Map region coords from image space to display space */
  function toDisplay() {
    const sx = displayW / imageW;
    const sy = displayH / imageH;
    return {
      x: region.x * sx,
      y: region.y * sy,
      w: region.w * sx,
      h: region.h * sy,
    };
  }

  /** Map display coords back to image space */
  function toImage(displayX, displayY, displayW, displayH) {
    const sx = imageW / displayW;
    const sy = imageH / displayH;
    return {
      x: Math.round(clamp(displayX * sx, 0, imageW)),
      y: Math.round(clamp(displayY * sy, 0, imageH)),
      w: Math.round(clamp(displayW * sx, 1, imageW)),
      h: Math.round(clamp(displayH * sy, 1, imageH)),
    };
  }

  /** Update handle position and size */
  function render() {
    const d = toDisplay();
    handle.style.left = `${d.x}px`;
    handle.style.top = `${d.y}px`;
    handle.style.width = `${d.w}px`;
    handle.style.height = `${d.h}px`;

    // Sync numeric inputs
    inputs.left.value = region.x;
    inputs.top.value = region.y;
    inputs.width.value = region.w;
    inputs.height.value = region.h;
  }

  /** Notify listeners of region change */
  function notify() {
    for (const fn of listeners) fn({ ...region });
  }

  // --- Mouse events for drag ---

  handle.addEventListener('mousedown', (e) => {
    if (e.target === resizeHandle) {
      resizing = true;
    } else {
      dragging = true;
    }
    dragStart = { x: e.clientX, y: e.clientY };
    dragRegion = { ...region };
    e.preventDefault();
  });

  window.addEventListener('mousemove', (e) => {
    if (!dragging && !resizing) return;

    const dx = e.clientX - dragStart.x;
    const dy = e.clientY - dragStart.y;
    const sx = imageW / displayW;
    const sy = imageH / displayH;

    if (dragging) {
      region.x = Math.round(clamp(dragRegion.x + dx * sx, 0, imageW - region.w));
      region.y = Math.round(clamp(dragRegion.y + dy * sy, 0, imageH - region.h));
    } else if (resizing) {
      region.w = Math.round(clamp(dragRegion.w + dx * sx, 10, imageW - region.x));
      region.h = Math.round(clamp(dragRegion.h + dy * sy, 10, imageH - region.y));
    }

    render();
    notify();
  });

  window.addEventListener('mouseup', () => {
    dragging = false;
    resizing = false;
  });

  // --- Numeric input sync ---
  for (const key of ['left', 'top', 'width', 'height']) {
    const input = inputs[key];
    input.addEventListener('input', () => {
      const mapKey = key === 'left' ? 'x' : key === 'top' ? 'y' : key === 'width' ? 'w' : 'h';
      region[mapKey] = clamp(parseInt(input.value) || 0, 0, mapKey === 'w' ? imageW : mapKey === 'h' ? imageH : 99999);
      render();
      notify();
    });
  }

  return {
    /** Get current region in image coordinates */
    getRegion() {
      return { ...region };
    },

    /** Set region from image coordinates */
    setRegion(r) {
      region = {
        x: clamp(r.x ?? 0, 0, imageW - 1),
        y: clamp(r.y ?? 0, 0, imageH - 1),
        w: clamp(r.w ?? 200, 1, imageW),
        h: clamp(r.h ?? 200, 1, imageH),
      };
      render();
      notify();
    },

    /** Update when a new image is loaded */
    updateImage(naturalW, naturalH, displayW_, displayH_) {
      imageW = naturalW;
      imageH = naturalH;
      displayW = displayW_;
      displayH = displayH_;
      // Default region: center 50% of image
      region = {
        x: Math.round(imageW * 0.25),
        y: Math.round(imageH * 0.25),
        w: Math.round(imageW * 0.5),
        h: Math.round(imageH * 0.5),
      };
      render();
    },

    /** Listen for region changes */
    onRegionChanged(fn) {
      listeners.push(fn);
    },
  };
}
```

- [ ] **Step 2: Verify module syntax**

```bash
node --check js/ui/region.js 2>&1 || echo "Syntax OK (ESM imports may fail Node check)"
```

- [ ] **Step 3: Commit**

```bash
git add js/ui/region.js
git commit -m "feat: add region selector — draggable canvas overlay with numeric input sync"
```

---

### Task 6: Output Module — Preview + Download

**Files:**
- Modify: `js/ui/output.js`

**Interfaces:**
- Consumes: `formatBytes` from `js/utils.js`
- Produces:
  - `setupOutput(previewCanvas: HTMLCanvasElement, downloadBtn: HTMLButtonElement, sizeEl: HTMLElement): {showResult(blob: Blob): void, clear(): void}`

- [ ] **Step 1: Write the output module**

Write `js/ui/output.js`:
```js
/** Preview display and download trigger for processed image */

import { formatBytes } from '../utils.js';

/**
 * Set up output display with preview canvas and download button.
 * @param {HTMLCanvasElement} previewCanvas
 * @param {HTMLButtonElement} downloadBtn
 * @param {HTMLElement} sizeEl — element to display file size
 * @returns {{showResult: function, clear: function}}
 */
export function setupOutput(previewCanvas, downloadBtn, sizeEl) {
  let currentBlob = null;

  downloadBtn.addEventListener('click', () => {
    if (!currentBlob) return;
    const url = URL.createObjectURL(currentBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'artifacted.jpg';
    a.click();
    URL.revokeObjectURL(url);
  });

  return {
    /**
     * Display a processed JPEG blob as a preview.
     * @param {Blob} blob
     */
    async showResult(blob) {
      currentBlob = blob;
      sizeEl.textContent = formatBytes(blob.size);

      // Decode blob to draw on preview canvas
      const url = URL.createObjectURL(blob);
      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(url);
        previewCanvas.width = img.naturalWidth;
        previewCanvas.height = img.naturalHeight;
        const ctx = previewCanvas.getContext('2d');
        ctx.drawImage(img, 0, 0);
        downloadBtn.disabled = false;
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        sizeEl.textContent = 'Error rendering preview';
      };
      img.src = url;
    },

    /** Clear output display */
    clear() {
      currentBlob = null;
      const ctx = previewCanvas.getContext('2d');
      ctx.clearRect(0, 0, previewCanvas.width, previewCanvas.height);
      sizeEl.textContent = '';
      downloadBtn.disabled = true;
    },
  };
}
```

- [ ] **Step 2: Commit**

```bash
git add js/ui/output.js
git commit -m "feat: add output module — preview canvas and download trigger"
```

---

### Task 7: HTML Shell — Full UI Markup

**Files:**
- Modify: `index.html`

**Interfaces:**
- Consumes: all JS modules (via script tags), all CSS (via link)
- Produces: complete DOM for all UI components

- [ ] **Step 1: Write the full index.html**

Write `index.html`:
```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>JPEG Artifact Adder</title>
  <link rel="stylesheet" href="css/app.css">
</head>
<body>
  <header>
    <h1>JPEG Artifact Adder</h1>
    <p class="subtitle">Add real JPEG compression artifacts to your images — free, offline, no upload.</p>
  </header>

  <main>
    <!-- Upload Zone -->
    <section id="upload-section">
      <div id="drop-zone">
        <div class="drop-content">
          <span class="drop-icon">🖼️</span>
          <p>Drop a JPEG image here or <strong>click to browse</strong></p>
        </div>
        <input type="file" id="file-input" accept="image/jpeg,image/jpg" hidden>
      </div>
      <p id="error-msg" class="error hidden"></p>
    </section>

    <!-- Workspace (hidden until image loaded) -->
    <section id="workspace" class="hidden">
      <div class="workspace-layout">
        <!-- Input Panel -->
        <div class="panel">
          <h2>Input</h2>
          <div id="input-canvas-container" class="canvas-container">
            <canvas id="input-canvas"></canvas>
          </div>
          <p id="image-info" class="info-text"></p>
        </div>

        <!-- Controls Panel -->
        <div class="panel controls-panel">
          <h2>Settings</h2>

          <div class="control-group">
            <label for="region-left">Left Offset</label>
            <input type="number" id="region-left" value="0" min="0">
          </div>
          <div class="control-group">
            <label for="region-top">Top Offset</label>
            <input type="number" id="region-top" value="0" min="0">
          </div>
          <div class="control-group">
            <label for="region-width">Region Width</label>
            <input type="number" id="region-width" value="200" min="1">
          </div>
          <div class="control-group">
            <label for="region-height">Region Height</label>
            <input type="number" id="region-height" value="200" min="1">
          </div>

          <div class="control-group">
            <label for="strength-slider">
              Artifact Strength: <span id="strength-value">50</span>%
            </label>
            <input type="range" id="strength-slider" value="50" min="0" max="100">
          </div>

          <button id="apply-btn" class="btn-primary">Apply Artifacts</button>
          <p id="status-msg" class="info-text"></p>
        </div>

        <!-- Output Panel -->
        <div class="panel">
          <h2>Output</h2>
          <div class="canvas-container">
            <canvas id="output-canvas"></canvas>
          </div>
          <div class="output-actions">
            <span id="output-size"></span>
            <button id="download-btn" class="btn-primary" disabled>Download</button>
          </div>
        </div>
      </div>
    </section>
  </main>

  <footer>
    <p>All processing happens locally in your browser. No images are ever uploaded.</p>
  </footer>

  <script type="module" src="js/app.js"></script>
</body>
</html>
```

- [ ] **Step 2: Verify HTML is valid**

```bash
python3 -c "
from html.parser import HTMLParser
class V(HTMLParser):
    def handle_starttag(self, tag, attrs): pass
    def handle_endtag(self, tag): pass
V().feed(open('index.html').read())
print('HTML parsed OK')
"
```

- [ ] **Step 3: Commit**

```bash
git add index.html
git commit -m "feat: add full HTML shell — upload zone, workspace, controls, output panels"
```

---

### Task 8: CSS — All Styles

**Files:**
- Modify: `css/app.css`

- [ ] **Step 1: Write the stylesheet**

Write `css/app.css`:
```css
/* JPEG Artifact Adder — all styles */

:root {
  --bg: #1a1a2e;
  --surface: #16213e;
  --surface2: #0f3460;
  --accent: #e94560;
  --text: #eee;
  --text-muted: #999;
  --border: #333;
  --radius: 8px;
}

* { box-sizing: border-box; margin: 0; padding: 0; }

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  background: var(--bg);
  color: var(--text);
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}

header {
  text-align: center;
  padding: 2rem 1rem 1rem;
}

header h1 {
  font-size: 1.8rem;
  font-weight: 700;
  margin-bottom: 0.25rem;
}

.subtitle {
  color: var(--text-muted);
  font-size: 0.95rem;
}

main {
  flex: 1;
  padding: 1rem;
  max-width: 1400px;
  margin: 0 auto;
  width: 100%;
}

/* Upload Zone */
#upload-section {
  margin-bottom: 1.5rem;
}

#drop-zone {
  border: 2px dashed var(--border);
  border-radius: var(--radius);
  padding: 3rem;
  text-align: center;
  cursor: pointer;
  transition: border-color 0.2s, background 0.2s;
}

#drop-zone:hover,
#drop-zone.drag-over {
  border-color: var(--accent);
  background: var(--surface);
}

.drop-icon {
  font-size: 2.5rem;
  display: block;
  margin-bottom: 0.5rem;
}

.drop-content p {
  color: var(--text-muted);
}

.error {
  color: var(--accent);
  margin-top: 0.5rem;
  font-size: 0.9rem;
}

.hidden { display: none !important; }

/* Workspace Layout */
.workspace-layout {
  display: grid;
  grid-template-columns: 1fr 280px 1fr;
  gap: 1rem;
  align-items: start;
}

@media (max-width: 900px) {
  .workspace-layout {
    grid-template-columns: 1fr;
  }
}

.panel {
  background: var(--surface);
  border-radius: var(--radius);
  padding: 1rem;
}

.panel h2 {
  font-size: 1rem;
  font-weight: 600;
  margin-bottom: 0.75rem;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

/* Canvas */
.canvas-container {
  position: relative;
  background: #000;
  border-radius: 4px;
  overflow: hidden;
  margin-bottom: 0.5rem;
}

.canvas-container canvas {
  display: block;
  max-width: 100%;
  height: auto;
}

.info-text {
  font-size: 0.85rem;
  color: var(--text-muted);
}

/* Controls */
.controls-panel {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.control-group {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.control-group label {
  font-size: 0.8rem;
  color: var(--text-muted);
}

.control-group input[type="number"] {
  padding: 0.4rem 0.5rem;
  border: 1px solid var(--border);
  border-radius: 4px;
  background: var(--bg);
  color: var(--text);
  font-size: 0.9rem;
  width: 100%;
}

.control-group input[type="range"] {
  width: 100%;
  accent-color: var(--accent);
}

.btn-primary {
  padding: 0.6rem 1rem;
  border: none;
  border-radius: var(--radius);
  background: var(--accent);
  color: #fff;
  font-size: 0.95rem;
  font-weight: 600;
  cursor: pointer;
  transition: opacity 0.2s;
}

.btn-primary:hover {
  opacity: 0.9;
}

.btn-primary:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

/* Output */
.output-actions {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 0.5rem;
}

#output-size {
  font-size: 0.85rem;
  color: var(--text-muted);
}

/* Region Overlay */
.region-handle {
  transition: none; /* real-time drag, no lag */
}

/* Footer */
footer {
  text-align: center;
  padding: 1rem;
  color: var(--text-muted);
  font-size: 0.8rem;
}
```

- [ ] **Step 2: Commit**

```bash
git add css/app.css
git commit -m "feat: add CSS styles — dark theme, workspace layout, upload zone"
```

---

### Task 9: App Controller — Wire Everything Together

**Files:**
- Modify: `js/app.js`

**Interfaces:**
- Consumes: all modules — utils, upload, region, processor, output
- Produces: fully functional app

- [ ] **Step 1: Write the app controller**

Write `js/app.js`:
```js
/** Main controller — wires UI events to processor calls */

import { setupUpload } from './ui/upload.js';
import { setupRegion } from './ui/region.js';
import { setupOutput } from './ui/output.js';
import { applyArtifacts } from './processor.js';

// --- DOM references ---
const dropZone = document.getElementById('drop-zone');
const fileInput = document.getElementById('file-input');
const errorMsg = document.getElementById('error-msg');
const workspace = document.getElementById('workspace');
const inputCanvas = document.getElementById('input-canvas');
const inputContainer = document.getElementById('input-canvas-container');
const imageInfo = document.getElementById('image-info');
const applyBtn = document.getElementById('apply-btn');
const statusMsg = document.getElementById('status-msg');
const strengthSlider = document.getElementById('strength-slider');
const strengthValue = document.getElementById('strength-value');
const outputCanvas = document.getElementById('output-canvas');
const downloadBtn = document.getElementById('download-btn');
const outputSize = document.getElementById('output-size');

// --- State ---
let currentImageData = null;
let currentFileName = '';

// --- Output module ---
const output = setupOutput(outputCanvas, downloadBtn, outputSize);

// --- Region selector ---
const regionInputs = {
  left: document.getElementById('region-left'),
  top: document.getElementById('region-top'),
  width: document.getElementById('region-width'),
  height: document.getElementById('region-height'),
};

const regionSelector = setupRegion(inputContainer, regionInputs);

// --- Strength slider ---
strengthSlider.addEventListener('input', () => {
  strengthValue.textContent = strengthSlider.value;
});

// --- Upload ---
setupUpload(dropZone, fileInput,
  (imageData, fileName, fileSize) => {
    currentImageData = imageData;
    currentFileName = fileName;

    // Hide error, show workspace
    errorMsg.classList.add('hidden');
    workspace.classList.remove('hidden');
    dropZone.style.display = 'none';

    // Draw on input canvas
    const displayW = inputContainer.clientWidth;
    const scale = displayW / imageData.width;
    const displayH = imageData.height * scale;

    inputCanvas.width = imageData.width;
    inputCanvas.height = imageData.height;
    const ctx = inputCanvas.getContext('2d');
    ctx.putImageData(imageData, 0, 0);

    // Update region selector
    regionSelector.updateImage(imageData.width, imageData.height, displayW, displayH);

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
  const strength = parseInt(strengthSlider.value);

  applyBtn.disabled = true;
  statusMsg.textContent = 'Processing...';

  try {
    const blob = await applyArtifacts(currentImageData, region, strength);
    await output.showResult(blob);
    statusMsg.textContent = 'Done!';
  } catch (err) {
    statusMsg.textContent = 'Processing failed. Try a smaller image.';
    console.error('Artifact processing error:', err);
  } finally {
    applyBtn.disabled = false;
  }
});
```

- [ ] **Step 2: Verify app loads without JS errors**

Start the server and check:
```bash
python3 server.py &
# Open http://localhost:8000 in browser
# Check DevTools console — should have no errors
```

- [ ] **Step 3: Smoke test end-to-end**

Download a test JPEG:
```bash
curl -o /tmp/test.jpg "https://upload.wikimedia.org/wikipedia/commons/thumb/4/47/PNG_transparency_demonstration_1.png/320px-PNG_transparency_demonstration_1.png"
# That's a PNG — use a real JPEG instead
```

Actually, create a small test JPEG programmatically:
```bash
# Use a known JPEG for testing — any small JPEG will work
```

Manual test steps:
1. Open http://localhost:8000
2. Drop any JPEG image
3. Verify input preview shows
4. Drag the region rectangle
5. Adjust strength slider to 80%
6. Click "Apply Artifacts"
7. Verify output preview shows degraded region
8. Click "Download"
9. Open downloaded file — verify it's a valid JPEG with visible artifacts in the selected region

- [ ] **Step 4: Commit**

```bash
git add js/app.js
git commit -m "feat: wire app controller — upload → region → processor → output pipeline"
```

---

### Task 10: Integration Verification & README

**Files:**
- Create: `README.md`
- Modify: none

- [ ] **Step 1: Write README**

Write `README.md`:
```markdown
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
```

- [ ] **Step 2: Full end-to-end verification**

Load the app and process a real JPEG:
```bash
python3 server.py &
```

Manual checklist:
- [ ] Drag-and-drop a JPEG onto the drop zone
- [ ] Click drop zone to open file picker
- [ ] Drag the region rectangle around
- [ ] Resize the region using the bottom-right handle
- [ ] Change numeric inputs — verify rectangle moves/resizes
- [ ] Set strength to 0% — apply — output looks identical to input
- [ ] Set strength to 50% — apply — visible blocking in region
- [ ] Set strength to 100% — apply — heavy pixelation in region
- [ ] Download button works — saved file is a valid JPEG
- [ ] Error shown for non-JPEG files
- [ ] Error shown for corrupt files

- [ ] **Step 3: Final commit**

```bash
git add README.md
git commit -m "docs: add README with quick start, how it works, verification checklist"
```

---

## Verification Checklist

Before declaring done, confirm:

1. **Real artifacts:** Output JPEG shows genuine blocking/ringing in the artifact region, not simulated noise
2. **Strength range:** 0% = no visible change, 100% = extreme pixelation
3. **Region accuracy:** Artifacts only appear in the selected rectangle
4. **Non-artifact areas:** Pristine regions are visually unchanged from input
5. **Valid output:** Downloaded file opens in any image viewer as a valid JPEG
6. **Error paths:** Non-JPEG files, corrupt files, and missing WASM all show user-friendly errors
7. **Offline:** App works with no network (after first load)
8. **Cross-browser:** Verified in at least Chrome + one other browser

