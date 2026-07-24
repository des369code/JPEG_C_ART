/**
 * Unsharp mask effect — automated tests.
 *
 * Verifies the edge-enhancement algorithm: blur → subtract → threshold → blend.
 * Mocks the Canvas 2D APIs needed by the effect.
 *
 * Run:  node tests/unsharp-mask.test.mjs
 */

import { ok, strictEqual as eq } from 'node:assert';

// ── Canvas 2D mock ──────────────────────────────────────────────────

/** Store of ImageData keyed by canvas id for retrieval. */
const imageStore = new Map();
let _canvasId = 0;

/**
 * Minimal mock: enough to support getImageData, putImageData, filter blur,
 * and drawImage(self) for the blur pass.
 */
function _mkCanvas(w, h) {
  const id = ++_canvasId;
  const ctx = {
    _canvasW: w,
    _canvasH: h,
    _filter: 'none',
    get filter() { return this._filter; },
    set filter(v) { this._filter = v; },

    getImageData(x, y, w, h) {
      // Return a copy of stored data or a default gray ramp
      if (imageStore.has(id)) {
        const src = imageStore.get(id);
        const copy = new Uint8ClampedArray(src.data);
        return { data: copy, width: w, height: h, colorSpace: 'srgb' };
      }
      // Default: flat mid-gray
      const len = w * h * 4;
      const data = new Uint8ClampedArray(len);
      for (let i = 0; i < len; i += 4) {
        data[i] = 128; data[i + 1] = 128; data[i + 2] = 128; data[i + 3] = 255;
      }
      return { data, width: w, height: h, colorSpace: 'srgb' };
    },

    putImageData(imgData, x, y) {
      // Store so subsequent getImageData returns it
      imageStore.set(id, {
        data: new Uint8ClampedArray(imgData.data),
        width: imgData.width,
        height: imgData.height,
        x, y,
      });
    },

    drawImage(source, dx, dy) {
      // Simulate filter:blur by averaging with neighbors (rough approximation)
      if (this._filter !== 'none' && this._filter.startsWith('blur(')) {
        // Extract radius from filter string like "blur(1.5px)"
        const m = this._filter.match(/blur\(([\d.]+)px\)/);
        const radius = m ? parseFloat(m[1]) : 1;
        // Box-blur pass: average each pixel with its neighbors
        if (imageStore.has(source._mockId || id)) {
          const src = imageStore.get(source._mockId || id);
          const w = this._canvasW;
          const h = this._canvasH;
          const blurred = new Uint8ClampedArray(src.data.length);
          const r = Math.round(radius);
          for (let py = 0; py < h; py++) {
            for (let px = 0; px < w; px++) {
              let sr = 0, sg = 0, sb = 0, sa = 0, count = 0;
              for (let dy2 = -r; dy2 <= r; dy2++) {
                for (let dx2 = -r; dx2 <= r; dx2++) {
                  const nx = px + dx2;
                  const ny = py + dy2;
                  if (nx >= 0 && nx < w && ny >= 0 && ny < h) {
                    const idx = (ny * w + nx) * 4;
                    sr += src.data[idx];
                    sg += src.data[idx + 1];
                    sb += src.data[idx + 2];
                    sa += src.data[idx + 3];
                    count++;
                  }
                }
              }
              const idx = (py * w + px) * 4;
              blurred[idx]     = sr / count;
              blurred[idx + 1] = sg / count;
              blurred[idx + 2] = sb / count;
              blurred[idx + 3] = sa / count;
            }
          }
          imageStore.set(id, {
            data: blurred,
            width: this._canvasW,
            height: this._canvasH,
            x: dx, y: dy,
          });
        }
      }
    },
  };
  // Store canvas id on ctx for drawImage to find the source
  const canvas = { width: w, height: h, getContext: () => ctx, _mockId: id };
  ctx._canvas = canvas;
  // When drawImage is called with the source canvas, wire up _mockId
  return canvas;
}

// Override document.createElement for 'canvas'
const origCreateElement = globalThis.document?.createElement;
const canvasEls = [];
globalThis.document = {
  ...(globalThis.document || {}),
  createElement(tag) {
    if (tag === 'canvas') {
      const c = _mkCanvas(0, 0);
      canvasEls.push(c);
      // Support width/height assignment after creation
      const proxy = new Proxy(c, {
        get(t, k) {
          if (k === 'width') return t.width;
          if (k === 'height') return t.height;
          if (k === 'getContext') return t.getContext.bind(t);
          if (k === '_mockId') return t._mockId;
          return t[k];
        },
        set(t, k, v) {
          if (k === 'width') { t.width = v; t.getContext()._canvasW = v; return true; }
          if (k === 'height') { t.height = v; t.getContext()._canvasH = v; return true; }
          t[k] = v;
          return true;
        },
      });
      return proxy;
    }
    return origCreateElement ? origCreateElement(tag) : {};
  },
};

// Also need enough DOM shim for the existing test infrastructure to not break
globalThis.window = globalThis.window || { addEventListener() {} };
globalThis.HTMLElement = globalThis.HTMLElement || class {};

// ── Import ──────────────────────────────────────────────────────────
const { effect } = await import('../js/effects/unsharp-mask.js?v=' + Date.now());

// ── Test helpers ─────────────────────────────────────────────────────
let failures = 0;
function check(cond, label) {
  if (!cond) { console.error(`  FAIL: ${label}`); failures++; }
  else console.log(`  PASS: ${label}`);
}
function checkEq(a, b, label) {
  if (a !== b) { console.error(`  FAIL: ${label} — expected ${b}, got ${a}`); failures++; }
  else console.log(`  PASS: ${label} (${a})`);
}
function checkClose(a, b, tol, label) {
  if (Math.abs(a - b) > tol) {
    console.error(`  FAIL: ${label} — expected ~${b}, got ${a} (tolerance ${tol})`);
    failures++;
  } else console.log(`  PASS: ${label} (${a.toFixed(1)} ≈ ${b})`);
}

// ── Helper: create a test canvas with a sharp edge ───────────────────
function createEdgeCanvas(w, h) {
  imageStore.clear();
  _canvasId = 0;
  const canvas = _mkCanvas(w, h);

  // Put a sharp vertical edge at center: left half dark (50), right half bright (200)
  const ctx = canvas.getContext();
  const imgData = ctx.getImageData(0, 0, w, h);
  const data = imgData.data;
  for (let py = 0; py < h; py++) {
    for (let px = 0; px < w; px++) {
      const idx = (py * w + px) * 4;
      const v = px < w / 2 ? 50 : 200;
      data[idx]     = v;  // R
      data[idx + 1] = v;  // G
      data[idx + 2] = v;  // B
      data[idx + 3] = 255; // A
    }
  }
  ctx.putImageData(imgData, 0, 0);
  return canvas;
}

// ═══════════════════════════════════════════════════════════════════════
console.log('── Unsharp mask tests ──');

// Test 1: Edge pixels are enhanced (sharpened)
{
  console.log('\nTest 1: Edge enhancement at sharp boundary');
  const canvas = createEdgeCanvas(100, 50);
  const ctx = canvas.getContext();

  // Record pixel values near the edge before applying
  const before = ctx.getImageData(0, 0, 100, 50);

  effect.apply(ctx, 100, 50, { x: 0, y: 0, w: 100, h: 50 }, 50, { radius: 2, threshold: 0 });

  const after = ctx.getImageData(0, 0, 100, 50);
  const b = before.data;
  const a = after.data;

  // Check a pixel on the dark side of the edge (px=48, near px=50 boundary)
  // Blurring should spread the bright side into the dark side at the edge,
  // then unsharp mask amplifies the difference → dark side gets darker
  const darkIdx = (25 * 100 + 48) * 4; // row 25, col 48 (dark side, near edge)
  const brightIdx = (25 * 100 + 52) * 4; // row 25, col 52 (bright side, near edge)

  // Dark side near edge: original=50, should get darker (overshoot)
  check(a[darkIdx] <= b[darkIdx], 'dark side near edge got darker (overshoot)');

  // Bright side near edge: original=200, should get brighter (overshoot)
  check(a[brightIdx] >= b[brightIdx], 'bright side near edge got brighter (overshoot)');

  // Far from edge: should remain near original values
  const farIdx = (25 * 100 + 10) * 4; // col 10, far from edge at col 50
  checkClose(a[farIdx], b[farIdx], 2, 'far from edge unchanged');
}

// Test 2: Threshold prevents sharpening of subtle differences
{
  console.log('\nTest 2: Threshold gates sharpening');
  const canvas = createEdgeCanvas(100, 50);

  // Create a subtle gradient instead of a sharp edge
  const ctx = canvas.getContext();
  const imgData = ctx.getImageData(0, 0, 100, 50);
  const data = imgData.data;
  for (let py = 0; py < 50; py++) {
    for (let px = 0; px < 100; px++) {
      const idx = (py * 100 + px) * 4;
      // Gradient: 126 to 130 (very subtle, diff < 5)
      const v = 126 + Math.round((px / 100) * 4);
      data[idx] = data[idx + 1] = data[idx + 2] = v;
      data[idx + 3] = 255;
    }
  }
  ctx.putImageData(imgData, 0, 0);

  const before = ctx.getImageData(0, 0, 100, 50);

  // Apply with high threshold (10) — the gradient diff is at most 2, so nothing should change
  effect.apply(ctx, 100, 50, { x: 0, y: 0, w: 100, h: 50 }, 80, { radius: 2, threshold: 10 });

  const after = ctx.getImageData(0, 0, 100, 50);

  // All pixels should remain nearly identical (within rounding of blur)
  let maxDiff = 0;
  for (let i = 0; i < before.data.length; i++) {
    maxDiff = Math.max(maxDiff, Math.abs(after.data[i] - before.data[i]));
  }
  check(maxDiff <= 2, `high threshold prevents sharpening (max diff=${maxDiff})`);
}

// Test 3: Amount scaling — strength=0 produces no change
{
  console.log('\nTest 3: Zero strength produces no change');
  const canvas = createEdgeCanvas(100, 50);
  const ctx = canvas.getContext();
  const before = ctx.getImageData(0, 0, 100, 50);

  effect.apply(ctx, 100, 50, { x: 0, y: 0, w: 100, h: 50 }, 0, { radius: 2, threshold: 0 });

  const after = ctx.getImageData(0, 0, 100, 50);

  let diffCount = 0;
  for (let i = 0; i < before.data.length; i++) {
    if (after.data[i] !== before.data[i]) diffCount++;
  }
  checkEq(diffCount, 0, 'zero strength → no pixel changes');
}

// Test 4: Higher amount produces stronger effect
{
  console.log('\nTest 4: Higher amount = stronger sharpening');

  // Create two canvases from the same pool (don't clear between them)
  imageStore.clear();
  _canvasId = 0;

  function makeEdge() {
    const c = _mkCanvas(100, 50);
    const ctx = c.getContext();
    const d = ctx.getImageData(0, 0, 100, 50);
    for (let py = 0; py < 50; py++) {
      for (let px = 0; px < 100; px++) {
        const idx = (py * 100 + px) * 4;
        const v = px < 50 ? 50 : 200;
        d.data[idx] = d.data[idx + 1] = d.data[idx + 2] = v;
        d.data[idx + 3] = 255;
      }
    }
    ctx.putImageData(d, 0, 0);
    return c;
  }

  const canvas1 = makeEdge();
  const canvas2 = makeEdge();

  effect.apply(canvas1.getContext(), 100, 50, { x: 0, y: 0, w: 100, h: 50 }, 25, { radius: 1.5, threshold: 0 });
  effect.apply(canvas2.getContext(), 100, 50, { x: 0, y: 0, w: 100, h: 50 }, 75, { radius: 1.5, threshold: 0 });

  const d1 = canvas1.getContext().getImageData(0, 0, 100, 50);
  const d2 = canvas2.getContext().getImageData(0, 0, 100, 50);

  // Compare edge overshoot: at high strength the overshoot should be larger.
  // Check pixel (row 25, col 48) on dark side near edge.
  const idx = (25 * 100 + 48) * 4;
  const dark1 = d1.data[idx]; // strength=25
  const dark2 = d2.data[idx]; // strength=75

  // Higher strength → darker overshoot on dark side (further from original 50)
  check(dark2 < dark1, `higher strength = stronger dark-overshoot (${dark2} < ${dark1})`);

  // Check bright side (col 51 — right next to edge at col 50)
  const idxB = (25 * 100 + 51) * 4;
  const bright1 = d1.data[idxB];
  const bright2 = d2.data[idxB];
  check(bright2 > bright1, `higher strength = stronger bright-overshoot (${bright2} > ${bright1})`);
}

// Test 5: Export shape is correct
{
  console.log('\nTest 5: Effect export shape');
  checkEq(effect.id, 'unsharp-mask', 'id');
  checkEq(effect.name, 'Unsharp mask', 'name');
  checkEq(effect.category, 'sharpening', 'category');
  checkEq(typeof effect.defaultStrength, 'number', 'defaultStrength is number');
  check(effect.extraParams !== undefined, 'has extraParams');
  check(effect.extraParams.radius !== undefined, 'has radius param');
  check(effect.extraParams.threshold !== undefined, 'has threshold param');
  checkEq(effect.extraParams.radius.default, 1.5, 'default radius');
  checkEq(effect.extraParams.threshold.default, 2, 'default threshold');
  checkEq(typeof effect.apply, 'function', 'apply is function');
}

// ═══════════════════════════════════════════════════════════════════════
console.log(`\n${'═'.repeat(50)}`);
if (failures === 0) console.log('ALL UNSHARP MASK TESTS PASSED');
else { console.error(`${failures} FAILED`); process.exitCode = 1; }
