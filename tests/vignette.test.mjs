/**
 * Vignette effect — automated tests.
 *
 * Verifies radial darkening: center stays bright, edges get darker.
 * Strength 0→100 maps linearly to 0→85% edge opacity.
 *
 * Run:  node tests/vignette.test.mjs
 */

// ── Canvas 2D mock ──────────────────────────────────────────────────
const imageStore = new Map();
let _canvasId = 0;

function _mkCanvas(w, h) {
  const id = ++_canvasId;
  const ctx = {
    _canvasW: w, _canvasH: h,
    getImageData(x, y, w, h) {
      if (imageStore.has(id)) {
        const src = imageStore.get(id);
        return { data: new Uint8ClampedArray(src.data), width: w, height: h, colorSpace: 'srgb' };
      }
      const len = w * h * 4;
      const data = new Uint8ClampedArray(len);
      for (let i = 0; i < len; i += 4) {
        data[i] = 128; data[i + 1] = 128; data[i + 2] = 128; data[i + 3] = 255;
      }
      return { data, width: w, height: h, colorSpace: 'srgb' };
    },
    putImageData(imgData) {
      imageStore.set(id, { data: new Uint8ClampedArray(imgData.data), width: imgData.width, height: imgData.height });
    },
    // Vignette uses createRadialGradient + fillRect
    createRadialGradient(x0, y0, r0, x1, y1, r1) {
      return {
        _x0: x0, _y0: y0, _r0: r0, _x1: x1, _y1: y1, _r1: r1,
        _stops: [],
        addColorStop(pos, color) { this._stops.push({ pos, color }); },
      };
    },
    _fillStyle: null,
    set fillStyle(v) { this._fillStyle = v; },
    get fillStyle() { return this._fillStyle; },
    fillRect(x, y, w, h) {
      if (!this._fillStyle || !this._fillStyle._stops) return;
      // Simulate radial gradient: for each pixel, compute distance from center,
      // interpolate between stops, blend with existing pixel
      const src = imageStore.get(id);
      if (!src) return;
      const g = this._fillStyle;
      const cx = g._x0, cy = g._y0;
      const innerR = g._r0, outerR = g._r1;
      const innerColor = g._stops[0]; // pos 0 = center (transparent)
      const outerColor = g._stops[1]; // pos 1 = edge (dark)

      // Parse outer color like "rgba(0,0,0,0.85)"
      const rgbaMatch = outerColor.color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+),?\s*([\d.]+)?\)/);
      if (!rgbaMatch) return;
      const or = parseInt(rgbaMatch[1]), og = parseInt(rgbaMatch[2]), ob = parseInt(rgbaMatch[3]);
      const oa = rgbaMatch[4] ? parseFloat(rgbaMatch[4]) : 1;

      const data = src.data;
      for (let py = 0; py < h; py++) {
        for (let px = x; px < x + w; px++) {
          const dx = px - cx, dy = py - cy;
          const dist = Math.sqrt(dx * dx + dy * dy);
          // Clamp t based on where this pixel falls relative to inner/outer radius
          let t;
          if (dist <= innerR) t = 0;
          else if (dist >= outerR) t = 1;
          else t = (dist - innerR) / (outerR - innerR);
          const alpha = t * oa;
          const idx = (py * this._canvasW + px) * 4;
          if (idx >= 0 && idx + 2 < data.length) {
            data[idx]     = Math.round(data[idx]     * (1 - alpha) + or * alpha);
            data[idx + 1] = Math.round(data[idx + 1] * (1 - alpha) + og * alpha);
            data[idx + 2] = Math.round(data[idx + 2] * (1 - alpha) + ob * alpha);
          }
        }
      }
    },
  };
  ctx._canvas = { width: w, height: h, getContext: () => ctx, _mockId: id };
  return ctx._canvas;
}

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
const { effect } = await import('../js/effects/vignette.js?v=' + Date.now());

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

function createUniformCanvas(w, h, r, g, b) {
  imageStore.clear(); _canvasId = 0;
  const canvas = _mkCanvas(w, h);
  const ctx = canvas.getContext();
  const d = ctx.getImageData(0, 0, w, h);
  for (let i = 0; i < d.data.length; i += 4) {
    d.data[i] = r; d.data[i + 1] = g; d.data[i + 2] = b; d.data[i + 3] = 255;
  }
  ctx.putImageData(d, 0, 0);
  return canvas;
}

// ═══════════════════════════════════════════════════════════════════════
console.log('── Vignette tests ──');

// Test 1: Zero strength produces no change
{
  console.log('\nTest 1: Zero strength = no change');
  const canvas = createUniformCanvas(100, 80, 200, 200, 200);
  const ctx = canvas.getContext();
  const before = ctx.getImageData(0, 0, 100, 80);

  effect.apply(ctx, 100, 80, null, 0);

  const after = ctx.getImageData(0, 0, 100, 80);
  let diffs = 0;
  for (let i = 0; i < before.data.length; i++) {
    if (after.data[i] !== before.data[i]) diffs++;
  }
  checkEq(diffs, 0, 'zero strength → no pixel changes');
}

// Test 2: Center stays bright, edges get dark
{
  console.log('\nTest 2: Center bright, edges dark');
  const canvas = createUniformCanvas(100, 80, 200, 200, 200);
  const ctx = canvas.getContext();
  const before = ctx.getImageData(0, 0, 100, 80);

  effect.apply(ctx, 100, 80, null, 100);

  const after = ctx.getImageData(0, 0, 100, 80);

  // Center pixel (50, 40) should be close to original (200)
  const centerIdx = (40 * 100 + 50) * 4;
  const centerBefore = before.data[centerIdx];
  const centerAfter = after.data[centerIdx];
  check(centerAfter >= centerBefore - 5, `center stays bright (before=${centerBefore}, after=${centerAfter})`);

  // Corner pixel (0, 0) should be much darker
  const cornerIdx = 0; // (0 * 100 + 0) * 4
  const cornerAfter = after.data[cornerIdx];
  check(cornerAfter < before.data[cornerIdx] - 100, `corner is darkened (${cornerAfter} < ${before.data[cornerIdx]})`);
}

// Test 3: Higher strength = darker corners
{
  console.log('\nTest 3: Higher strength = darker corners');
  function cornerValue(strength) {
    imageStore.clear(); _canvasId = 0;
    const canvas = createUniformCanvas(100, 80, 200, 200, 200);
    const ctx = canvas.getContext();
    effect.apply(ctx, 100, 80, null, strength);
    const d = ctx.getImageData(0, 0, 100, 80);
    return d.data[0]; // corner R value
  }

  const v25 = cornerValue(25);
  const v50 = cornerValue(50);
  const v100 = cornerValue(100);

  check(v100 < v50, `strength 100 darker than 50 at corner (${v100} < ${v50})`);
  check(v50 < v25, `strength 50 darker than 25 at corner (${v50} < ${v25})`);
}

// Test 4: Strength-percentage mapping — at 100%, max edge opacity = 0.85
{
  console.log('\nTest 4: Max opacity = 0.85 at strength 100');
  const canvas = createUniformCanvas(100, 80, 255, 255, 255);
  const ctx = canvas.getContext();

  effect.apply(ctx, 100, 80, null, 100);

  const after = ctx.getImageData(0, 0, 100, 80);
  // Far corner should approach black * 0.85 = 255 * (1 - 0.85) = ~38
  const cornerR = after.data[0];
  check(cornerR > 30 && cornerR < 50, `corner near expected 38 (got ${cornerR})`);
}

// Test 5: Inner 40% radius stays fully transparent
{
  console.log('\nTest 5: Inner 40% stays unvignetted');
  const canvas = createUniformCanvas(100, 80, 200, 200, 200);
  const ctx = canvas.getContext();

  effect.apply(ctx, 100, 80, null, 100);

  const after = ctx.getImageData(0, 0, 100, 80);
  // Center (50, 40) — well within inner radius (maxR*0.4 = 64*0.4 ≈ 25.6px from center)
  const centerR = after.data[(40 * 100 + 50) * 4];
  check(centerR >= 195, `center stays bright at full strength (${centerR})`);
}

// Test 6: Export shape
{
  console.log('\nTest 6: Effect export shape');
  checkEq(effect.id, 'vignetting', 'id');
  checkEq(effect.name, 'Vignetting', 'name');
  checkEq(effect.category, 'lens', 'category');
  checkEq(typeof effect.defaultStrength, 'number', 'defaultStrength is number');
  checkEq(typeof effect.apply, 'function', 'apply is function');
}

// ═══════════════════════════════════════════════════════════════════════
console.log(`\n${'═'.repeat(50)}`);
if (failures === 0) console.log('ALL VIGNETTE TESTS PASSED');
else { console.error(`${failures} FAILED`); process.exitCode = 1; }
