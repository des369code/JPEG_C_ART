/**
 * Dynamic range stretch effect — automated tests.
 *
 * Verifies: low-contrast image gets stretched to extremes, chrominance
 * ratios are preserved, zero strength = no change, export shape.
 *
 * Run:  node tests/dynamic-range.test.mjs
 */

// ── Canvas 2D mock ──────────────────────────────────────────────────
const imageStore = new Map();
let _canvasId = 0;

function _mkCanvas(w, h) {
  const id = ++_canvasId;
  const fullW = w, fullH = h;
  const fullData = new Uint8ClampedArray(fullW * fullH * 4);
  for (let i = 0; i < fullData.length; i += 4) {
    fullData[i] = 128; fullData[i + 1] = 128; fullData[i + 2] = 128; fullData[i + 3] = 255;
  }
  imageStore.set(id, { data: fullData, width: fullW, height: fullH });

  const ctx = {
    _canvasW: fullW, _canvasH: fullH,
    getImageData(x, y, rw, rh) {
      const src = imageStore.get(id);
      const subData = new Uint8ClampedArray(rw * rh * 4);
      for (let py = 0; py < rh; py++) {
        for (let px = 0; px < rw; px++) {
          const srcIdx = ((y + py) * fullW + (x + px)) * 4;
          const dstIdx = (py * rw + px) * 4;
          subData[dstIdx]     = src.data[srcIdx];
          subData[dstIdx + 1] = src.data[srcIdx + 1];
          subData[dstIdx + 2] = src.data[srcIdx + 2];
          subData[dstIdx + 3] = src.data[srcIdx + 3];
        }
      }
      return { data: subData, width: rw, height: rh, colorSpace: 'srgb' };
    },
    putImageData(imgData, x, y) {
      const src = imageStore.get(id);
      const rw = imgData.width, rh = imgData.height;
      for (let py = 0; py < rh; py++) {
        for (let px = 0; px < rw; px++) {
          const srcIdx = (py * rw + px) * 4;
          const dstIdx = ((y + py) * fullW + (x + px)) * 4;
          src.data[dstIdx]     = imgData.data[srcIdx];
          src.data[dstIdx + 1] = imgData.data[srcIdx + 1];
          src.data[dstIdx + 2] = imgData.data[srcIdx + 2];
          src.data[dstIdx + 3] = imgData.data[srcIdx + 3];
        }
      }
    },
  };
  ctx._canvas = { width: fullW, height: fullH, getContext: () => ctx, _mockId: id };
  return ctx._canvas;
}

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
    return {};
  },
};
globalThis.window = globalThis.window || { addEventListener() {} };
globalThis.HTMLElement = globalThis.HTMLElement || class {};

// ── Import ──────────────────────────────────────────────────────────
const { effect } = await import('../js/effects/dynamic-range.js?v=' + Date.now());

// ── Helpers ──────────────────────────────────────────────────────────
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
  } else console.log(`  PASS: ${label} (${a.toFixed(3)} ≈ ${b})`);
}

// ═══════════════════════════════════════════════════════════════════════
console.log('── Dynamic range tests ──');

// Test 1: Zero strength = no change
{
  console.log('\nTest 1: Zero strength = no change');
  imageStore.clear(); _canvasId = 0;
  const canvas = _mkCanvas(30, 30);
  const ctx = canvas.getContext();
  const d = ctx.getImageData(0, 0, 30, 30);
  for (let i = 0; i < d.data.length; i += 4) {
    d.data[i] = 100; d.data[i + 1] = 80; d.data[i + 2] = 60;
  }
  ctx.putImageData(d, 0, 0);
  const before = ctx.getImageData(0, 0, 30, 30);

  effect.apply(ctx, 30, 30, { x: 0, y: 0, w: 30, h: 30 }, 0);

  const after = ctx.getImageData(0, 0, 30, 30);
  let diffs = 0;
  for (let i = 0; i < before.data.length; i++) {
    if (after.data[i] !== before.data[i]) diffs++;
  }
  checkEq(diffs, 0, 'zero strength → no pixel changes');
}

// Test 2: Low-contrast image gets stretched — luminance extremes reached
{
  console.log('\nTest 2: Luminance extremes reached');
  imageStore.clear(); _canvasId = 0;
  const W = 200, H = 150;
  const canvas = _mkCanvas(W, H);
  const ctx = canvas.getContext();
  const d = ctx.getImageData(0, 0, W, H);

  // Fill with a gradient from dark to mid-to bright so histogram has real tails.
  // Column 0: very dark (~10), last column: very bright (~245).
  for (let py = 0; py < H; py++) {
    for (let px = 0; px < W; px++) {
      const idx = (py * W + px) * 4;
      const v = 10 + (px / (W - 1)) * 235; // 10 → 245
      d.data[idx] = v; d.data[idx + 1] = v; d.data[idx + 2] = v;
      d.data[idx + 3] = 255;
    }
  }
  ctx.putImageData(d, 0, 0);

  effect.apply(ctx, W, H, { x: 0, y: 0, w: W, h: H }, 100, { percentile: 0.5 });

  const after = ctx.getImageData(0, 0, W, H);
  let minLum = 255, maxLum = 0;
  for (let i = 0; i < after.data.length; i += 4) {
    const lum = 0.299 * after.data[i] + 0.587 * after.data[i + 1] + 0.114 * after.data[i + 2];
    minLum = Math.min(minLum, lum);
    maxLum = Math.max(maxLum, lum);
  }
  check(minLum <= 10, `min luminance ≤ 10 after stretch (got ${minLum.toFixed(1)})`);
  check(maxLum >= 245, `max luminance ≥ 245 after stretch (got ${maxLum.toFixed(1)})`);
}

// Test 3: Chrominance ratios preserved
{
  console.log('\nTest 3: Chrominance ratios preserved');
  imageStore.clear(); _canvasId = 0;
  const canvas = _mkCanvas(10, 10);
  const ctx = canvas.getContext();
  const d = ctx.getImageData(0, 0, 10, 10);
  // Mixed-color pixel: R=200, G=100, B=50 (strong orange tint)
  for (let i = 0; i < d.data.length; i += 4) {
    d.data[i] = 200; d.data[i + 1] = 100; d.data[i + 2] = 50; d.data[i + 3] = 255;
  }
  ctx.putImageData(d, 0, 0);

  // Record pre-stretch ratios
  const oldLum = 0.299 * 200 + 0.587 * 100 + 0.114 * 50;
  const oldRG = oldLum > 0 ? 200 / oldLum : 0;
  const oldGG = oldLum > 0 ? 100 / oldLum : 0;

  effect.apply(ctx, 10, 10, { x: 0, y: 0, w: 10, h: 10 }, 100, { percentile: 0.3 });

  const after = ctx.getImageData(0, 0, 10, 10);
  const newLum = 0.299 * after.data[0] + 0.587 * after.data[1] + 0.114 * after.data[2];
  const newRG = newLum > 0 ? after.data[0] / newLum : 0;
  const newGG = newLum > 0 ? after.data[1] / newLum : 0;

  // R/luminance ratio should be preserved (within 1%)
  checkClose(newRG, oldRG, 0.01,
    `R/luminance ratio preserved (${oldRG.toFixed(3)} → ${newRG.toFixed(3)})`);
  checkClose(newGG, oldGG, 0.01,
    `G/luminance ratio preserved (${oldGG.toFixed(3)} → ${newGG.toFixed(3)})`);
}

// Test 4: Export shape
{
  console.log('\nTest 4: Effect export shape');
  checkEq(effect.id, 'dynamic-range', 'id');
  checkEq(effect.name, 'Dynamic range stretch', 'name');
  checkEq(effect.category, 'color', 'category');
  checkEq(typeof effect.defaultStrength, 'number', 'defaultStrength is number');
  checkEq(typeof effect.apply, 'function', 'apply is function');
}

// ═══════════════════════════════════════════════════════════════════════
console.log(`\n${'═'.repeat(50)}`);
if (failures === 0) console.log('ALL DYNAMIC RANGE TESTS PASSED');
else { console.error(`${failures} FAILED`); process.exitCode = 1; }
