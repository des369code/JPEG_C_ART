/**
 * Split toning effect — automated tests.
 *
 * Verifies: zero strength = no change, shadows go cooler, highlights
 * go warmer, midtones at balance point minimally affected, export shape.
 *
 * Run:  node tests/split-toning.test.mjs
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
const { effect } = await import('../js/effects/split-toning.js?v=' + Date.now());

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

function createCanvas(w, h, fillFn) {
  imageStore.clear(); _canvasId = 0;
  const canvas = _mkCanvas(w, h);
  const ctx = canvas.getContext();
  const d = ctx.getImageData(0, 0, w, h);
  for (let py = 0; py < h; py++) {
    for (let px = 0; px < w; px++) {
      const idx = (py * w + px) * 4;
      const [r, g, b] = fillFn(px, py);
      d.data[idx] = r; d.data[idx + 1] = g; d.data[idx + 2] = b; d.data[idx + 3] = 255;
    }
  }
  ctx.putImageData(d, 0, 0);
  return canvas;
}

// ═══════════════════════════════════════════════════════════════════════
console.log('── Split toning tests ──');

// Test 1: Zero strength = no change
{
  console.log('\nTest 1: Zero strength = no change');
  const canvas = createCanvas(30, 30, () => [128, 128, 128]);
  const ctx = canvas.getContext();
  const before = ctx.getImageData(0, 0, 30, 30);

  effect.apply(ctx, 30, 30, { x: 0, y: 0, w: 30, h: 30 }, 0);

  const after = ctx.getImageData(0, 0, 30, 30);
  let diffs = 0;
  for (let i = 0; i < before.data.length; i++) {
    if (after.data[i] !== before.data[i]) diffs++;
  }
  checkEq(diffs, 0, 'zero strength → no pixel changes');
}

// Test 2: Shadows go cooler (blue shift relative to red)
{
  console.log('\nTest 2: Shadows go cooler');
  const canvas = createCanvas(30, 30, () => [50, 50, 50]); // dark pixels
  const ctx = canvas.getContext();

  effect.apply(ctx, 30, 30, { x: 0, y: 0, w: 30, h: 30 }, 100, { balance: 50 });

  const d = ctx.getImageData(0, 0, 30, 30);
  // Shadow tint is cool blue → blue channel increases relative to red
  let blueShiftSum = 0, n = 0;
  for (let i = 0; i < d.data.length; i += 4) {
    blueShiftSum += (d.data[i + 2] - d.data[i]); // B - R
    n++;
  }
  const avgBR = blueShiftSum / n;
  check(avgBR > 0, `dark pixels: blue > red on average (B-R avg: ${avgBR.toFixed(2)})`);
}

// Test 3: Highlights go warmer (red shift relative to blue)
{
  console.log('\nTest 3: Highlights go warmer');
  const canvas = createCanvas(30, 30, () => [240, 240, 240]);
  const ctx = canvas.getContext();

  effect.apply(ctx, 30, 30, { x: 0, y: 0, w: 30, h: 30 }, 100, { balance: 50 });

  const d = ctx.getImageData(0, 0, 30, 30);
  let redShiftSum = 0, n = 0;
  for (let i = 0; i < d.data.length; i += 4) {
    redShiftSum += (d.data[i] - d.data[i + 2]); // R - B
    n++;
  }
  const avgRB = redShiftSum / n;
  check(avgRB > 0, `bright pixels: red > blue on average (R-B avg: ${avgRB.toFixed(2)})`);
}

// Test 4: Midtones at balance point minimally affected
{
  console.log('\nTest 4: Midtones at balance point');
  // With balance=50, lum=128 (50% of 255) is the crossover.
  const canvas = createCanvas(30, 30, () => [128, 128, 128]);
  const ctx = canvas.getContext();

  effect.apply(ctx, 30, 30, { x: 0, y: 0, w: 30, h: 30 }, 100, { balance: 50 });

  const d = ctx.getImageData(0, 0, 30, 30);
  // At the balance point, the tint blend is 50/50. With overlay at 40% of 100% strength,
  // the shift should be small (both shadow and highlight tints partially apply).
  let maxDiff = 0;
  for (let i = 0; i < d.data.length; i += 4) {
    for (let c = 0; c < 3; c++) { // RGB only, skip alpha
      maxDiff = Math.max(maxDiff, Math.abs(d.data[i + c] - 128));
    }
  }
  check(maxDiff < 15, `midtones shift < 15 from 128 (max: ${maxDiff.toFixed(1)})`);
}

// Test 5: Export shape
{
  console.log('\nTest 5: Effect export shape');
  checkEq(effect.id, 'split-toning', 'id');
  checkEq(effect.name, 'Split toning', 'name');
  checkEq(effect.category, 'color', 'category');
  checkEq(typeof effect.defaultStrength, 'number', 'defaultStrength is number');
  checkEq(typeof effect.apply, 'function', 'apply is function');
}

// ═══════════════════════════════════════════════════════════════════════
console.log(`\n${'═'.repeat(50)}`);
if (failures === 0) console.log('ALL SPLIT TONING TESTS PASSED');
else { console.error(`${failures} FAILED`); process.exitCode = 1; }
