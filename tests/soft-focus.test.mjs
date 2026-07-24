/**
 * Soft focus effect — automated tests.
 *
 * Verifies Gaussian blur: higher strength = larger radius = more blur.
 * radius = (strength / 100) * 8, so at 100% radius = 8px.
 * Respects region parameter (x, y, w, h).
 *
 * Run:  node tests/soft-focus.test.mjs
 */

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
      if (imageStore.has(id)) {
        const src = imageStore.get(id);
        const srcW = src.width;
        const data = new Uint8ClampedArray(w * h * 4);
        // Extract sub-region from stored data
        for (let py = 0; py < h; py++) {
          for (let px = 0; px < w; px++) {
            const srcIdx = ((y + py) * srcW + (x + px)) * 4;
            const dstIdx = (py * w + px) * 4;
            if (srcIdx >= 0 && srcIdx + 3 < src.data.length) {
              data[dstIdx]     = src.data[srcIdx];
              data[dstIdx + 1] = src.data[srcIdx + 1];
              data[dstIdx + 2] = src.data[srcIdx + 2];
              data[dstIdx + 3] = src.data[srcIdx + 3];
            }
          }
        }
        return { data, width: w, height: h, colorSpace: 'srgb' };
      }
      const len = w * h * 4;
      const data = new Uint8ClampedArray(len);
      for (let i = 0; i < len; i += 4) {
        data[i] = 128; data[i + 1] = 128; data[i + 2] = 128; data[i + 3] = 255;
      }
      return { data, width: w, height: h, colorSpace: 'srgb' };
    },

    putImageData(imgData, x, y) {
      // If this canvas already has stored data, merge the imageData in at
      // position (x, y) rather than replacing the entire canvas.
      if (imageStore.has(id)) {
        const existing = imageStore.get(id);
        const merged = new Uint8ClampedArray(existing.data);
        const srcW = imgData.width;
        const srcH = imgData.height;
        const dstW = existing.width;
        for (let py = 0; py < srcH; py++) {
          for (let px = 0; px < srcW; px++) {
            const srcIdx = (py * srcW + px) * 4;
            const dstIdx = ((y + py) * dstW + (x + px)) * 4;
            if (dstIdx >= 0 && dstIdx + 3 < merged.length) {
              merged[dstIdx]     = imgData.data[srcIdx];
              merged[dstIdx + 1] = imgData.data[srcIdx + 1];
              merged[dstIdx + 2] = imgData.data[srcIdx + 2];
              merged[dstIdx + 3] = imgData.data[srcIdx + 3];
            }
          }
        }
        imageStore.set(id, { data: merged, width: dstW, height: existing.height, x, y });
      } else {
        imageStore.set(id, {
          data: new Uint8ClampedArray(imgData.data),
          width: imgData.width,
          height: imgData.height,
          x, y,
        });
      }
    },

    /**
     * Simulate filter:blur by averaging each pixel with its neighbors
     * (box-blur approximation). Only acts when _filter is set to a blur value.
     */
    drawImage(source, dx, dy) {
      if (this._filter !== 'none' && this._filter.startsWith('blur(')) {
        const m = this._filter.match(/blur\(([\d.]+)px\)/);
        const radius = m ? parseFloat(m[1]) : 1;
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
  const canvas = { width: w, height: h, getContext: () => ctx, _mockId: id };
  ctx._canvas = canvas;
  return canvas;
}

// Override document.createElement for 'canvas'
const origCreateElement = globalThis.document?.createElement;
globalThis.document = {
  ...(globalThis.document || {}),
  createElement(tag) {
    if (tag === 'canvas') {
      const c = _mkCanvas(0, 0);
      return new Proxy(c, {
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
          t[k] = v; return true;
        },
      });
    }
    return origCreateElement ? origCreateElement(tag) : {};
  },
};
globalThis.window = globalThis.window || { addEventListener() {} };
globalThis.HTMLElement = globalThis.HTMLElement || class {};

// ── Import ──────────────────────────────────────────────────────────
const { effect } = await import('../js/effects/soft-focus.js?v=' + Date.now());

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

// ── Helpers ─────────────────────────────────────────────────────────

function createEdgeCanvas(w, h) {
  imageStore.clear();
  _canvasId = 0;
  const canvas = _mkCanvas(w, h);
  const ctx = canvas.getContext();
  const imgData = ctx.getImageData(0, 0, w, h);
  const data = imgData.data;
  for (let py = 0; py < h; py++) {
    for (let px = 0; px < w; px++) {
      const idx = (py * w + px) * 4;
      const v = px < w / 2 ? 50 : 200;
      data[idx] = data[idx + 1] = data[idx + 2] = v;
      data[idx + 3] = 255;
    }
  }
  ctx.putImageData(imgData, 0, 0);
  return canvas;
}

// ═══════════════════════════════════════════════════════════════════════
console.log('── Soft focus tests ──');

// Test 1: Zero strength produces no change (radius < 0.5 → early return)
{
  console.log('\nTest 1: Zero strength = no change');
  const canvas = createEdgeCanvas(100, 50);
  const ctx = canvas.getContext();
  const before = ctx.getImageData(0, 0, 100, 50);

  effect.apply(ctx, 100, 50, { x: 0, y: 0, w: 100, h: 50 }, 0);

  const after = ctx.getImageData(0, 0, 100, 50);
  let diffs = 0;
  for (let i = 0; i < before.data.length; i++) {
    if (after.data[i] !== before.data[i]) diffs++;
  }
  checkEq(diffs, 0, 'zero strength → no pixel changes');
}

// Test 2: Higher strength = more blur (pixels differ more from original)
{
  console.log('\nTest 2: Higher strength = more blur');

  function blurAtStrength(strength) {
    imageStore.clear();
    _canvasId = 0;
    const canvas = createEdgeCanvas(100, 50);
    effect.apply(canvas.getContext(), 100, 50, { x: 0, y: 0, w: 100, h: 50 }, strength);
    return canvas.getContext().getImageData(0, 0, 100, 50);
  }

  // On the dark side near the edge (col 45), blur mixes bright pixels from the
  // other side, making the value rise from its original 50.  Larger radius →
  // more bright pixels in kernel → brighter result.
  const idxDark = (25 * 100 + 45) * 4;
  const d25 = blurAtStrength(25).data[idxDark];
  const d75 = blurAtStrength(75).data[idxDark];
  check(d75 > d25, `higher strength → larger blur effect on dark side (${d75} > ${d25})`);

  // On the bright side near the edge (col 55), blur mixes dark pixels from the
  // other side, making the value drop from its original 200.
  const idxBright = (25 * 100 + 55) * 4;
  const b25 = blurAtStrength(25).data[idxBright];
  const b75 = blurAtStrength(75).data[idxBright];
  check(b75 < b25, `higher strength → larger blur effect on bright side (${b75} < ${b25})`);
}

// Test 3: Region respect — only pixels within the region are blurred
{
  console.log('\nTest 3: Region respect');
  imageStore.clear();
  _canvasId = 0;

  // Create a canvas with a bright square centered on a dark background.
  // Bright square: x∈[30,70), y∈[20,60) at value 200.
  // Everything else: value 50.
  const canvas = _mkCanvas(100, 80);
  const ctx = canvas.getContext();
  const d = ctx.getImageData(0, 0, 100, 80);
  for (let py = 0; py < 80; py++) {
    for (let px = 0; px < 100; px++) {
      const idx = (py * 100 + px) * 4;
      if (px >= 30 && px < 70 && py >= 20 && py < 60) {
        d.data[idx] = d.data[idx + 1] = d.data[idx + 2] = 200;
      } else {
        d.data[idx] = d.data[idx + 1] = d.data[idx + 2] = 50;
      }
      d.data[idx + 3] = 255;
    }
  }
  ctx.putImageData(d, 0, 0);
  const before = ctx.getImageData(0, 0, 100, 80);

  // Apply blur to a sub-region covering the left half of the bright square.
  effect.apply(ctx, 100, 80, { x: 20, y: 10, w: 50, h: 60 }, 100);

  const after = ctx.getImageData(0, 0, 100, 80);

  // Pixel far right (col 85) — outside region (region ends at col 70).
  const outsideIdx = (40 * 100 + 85) * 4;
  checkEq(after.data[outsideIdx], before.data[outsideIdx], 'pixel outside right of region unchanged');

  // Pixel left (col 10) — outside region (region starts at col 20).
  const leftIdx = (40 * 100 + 10) * 4;
  checkEq(after.data[leftIdx], before.data[leftIdx], 'pixel left of region unchanged');

  // Pixel above (row 5) — outside region (region starts at row 10).
  const aboveIdx = (5 * 100 + 40) * 4;
  checkEq(after.data[aboveIdx], before.data[aboveIdx], 'pixel above region unchanged');

  // Pixel inside region, near the bright-square edge (col 35, row 30).
  // The blur kernel includes dark pixels from outside the bright square,
  // so this pixel's value should change from the original 200.
  const insideIdx = (30 * 100 + 35) * 4;
  check(after.data[insideIdx] !== before.data[insideIdx], 'pixel inside region changed');
}

// Test 4: Strength-percentage mapping — at 100%, radius=8 — verify blur spread
{
  console.log('\nTest 4: Blur spread at full strength');
  imageStore.clear();
  _canvasId = 0;
  const canvas = createEdgeCanvas(200, 50);
  const ctx = canvas.getContext();

  effect.apply(ctx, 200, 50, { x: 0, y: 0, w: 200, h: 50 }, 100);

  const after = ctx.getImageData(0, 0, 200, 50);
  const a = after.data;

  // Edge at col 100.  With radius 8 the kernel is 17 px wide.
  // At col 90 (10px from edge): kernel spans cols 82-98 — all on the dark
  // side, so value stays 50 (no bright pixels captured).
  const darkIdx = (25 * 200 + 90) * 4;
  checkEq(a[darkIdx], 50, '10px from edge on dark side unchanged (kernel stays dark)');

  // At col 95 (5px from edge): kernel spans cols 87-103 — bright pixels at
  // cols 100-103 are included, so value should be > 50.
  const nearEdgeDarkIdx = (25 * 200 + 95) * 4;
  check(a[nearEdgeDarkIdx] > 50, `5px from edge on dark side shows blur mixing (${a[nearEdgeDarkIdx]} > 50)`);

  // Far in the dark side (col 5): no bright pixels reachable.
  const farDarkIdx = (25 * 200 + 5) * 4;
  checkEq(a[farDarkIdx], 50, 'far from edge on dark side unchanged');

  // At col 105 (5px from edge on bright side): kernel captures dark pixels.
  const nearEdgeBrightIdx = (25 * 200 + 105) * 4;
  check(a[nearEdgeBrightIdx] < 200, `5px from edge on bright side shows blur mixing (${a[nearEdgeBrightIdx]} < 200)`);

  // Now verify the spread is smaller at lower strength (radius=2).
  imageStore.clear();
  _canvasId = 0;
  const canvas2 = createEdgeCanvas(200, 50);
  effect.apply(canvas2.getContext(), 200, 50, { x: 0, y: 0, w: 200, h: 50 }, 25);
  const after25 = canvas2.getContext().getImageData(0, 0, 200, 50);

  // At strength=25 (radius=2), kernel is 5px wide.  Col 95 is 5px from
  // edge, kernel spans 93-97 — all dark side.  Value unchanged.
  const s25Idx = (25 * 200 + 95) * 4;
  checkEq(after25.data[s25Idx], 50, 'lower strength: 5px from edge unchanged');
}

// Test 5: Export shape verification
{
  console.log('\nTest 5: Effect export shape');
  checkEq(effect.id, 'soft-focus', 'id');
  checkEq(effect.name, 'Soft focus', 'name');
  checkEq(effect.category, 'focus', 'category');
  checkEq(typeof effect.defaultStrength, 'number', 'defaultStrength is number');
  checkEq(effect.defaultStrength, 25, 'defaultStrength value');
  checkEq(typeof effect.apply, 'function', 'apply is function');
  checkEq(typeof effect.description, 'string', 'description is string');
}

// ═══════════════════════════════════════════════════════════════════════
console.log(`\n${'═'.repeat(50)}`);
if (failures === 0) console.log('ALL SOFT FOCUS TESTS PASSED');
else { console.error(`${failures} FAILED`); process.exitCode = 1; }
