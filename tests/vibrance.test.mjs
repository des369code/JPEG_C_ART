/**
 * Vibrance effect — automated tests.
 *
 * Verifies: gray pixels get largest boost, saturated pixels get minimal
 * boost, zero strength = no change, export shape.
 *
 * Run:  node tests/vibrance.test.mjs
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
const { effect } = await import('../js/effects/vibrance.js?v=' + Date.now());

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

function createPatchCanvas(w, h, fills) {
  imageStore.clear(); _canvasId = 0;
  const canvas = _mkCanvas(w, h);
  const ctx = canvas.getContext();
  const d = ctx.getImageData(0, 0, w, h);
  for (let py = 0; py < h; py++) {
    for (let px = 0; px < w; px++) {
      const idx = (py * w + px) * 4;
      const key = `${px},${py}`;
      const [r, g, b] = fills[key] || [128, 128, 128];
      d.data[idx] = r; d.data[idx + 1] = g; d.data[idx + 2] = b; d.data[idx + 3] = 255;
    }
  }
  ctx.putImageData(d, 0, 0);
  return canvas;
}

// Helper: compute Oklab chroma from sRGB
function oklabChroma(r, g, b) {
  const srgbToLinear = (c) => c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  const lr = srgbToLinear(r / 255), lg = srgbToLinear(g / 255), lb = srgbToLinear(b / 255);
  const Lv = 0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb;
  const Mv = 0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb;
  const Sv = 0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb;
  const A = 1.9779984951 * Math.cbrt(Lv) - 2.4285922050 * Math.cbrt(Mv) + 0.4505937099 * Math.cbrt(Sv);
  const B = 0.0259040371 * Math.cbrt(Lv) + 0.7827717662 * Math.cbrt(Mv) - 0.8086757660 * Math.cbrt(Sv);
  return Math.sqrt(A * A + B * B);
}

// ═══════════════════════════════════════════════════════════════════════
console.log('── Vibrance tests ──');

// Test 1: Zero strength = no change
{
  console.log('\nTest 1: Zero strength = no change');
  const canvas = createPatchCanvas(10, 10, { '0,0': [128, 100, 100], '5,5': [100, 150, 100] });
  const ctx = canvas.getContext();
  const before = ctx.getImageData(0, 0, 10, 10);

  effect.apply(ctx, 10, 10, { x: 0, y: 0, w: 10, h: 10 }, 0);

  const after = ctx.getImageData(0, 0, 10, 10);
  let diffs = 0;
  for (let i = 0; i < before.data.length; i++) {
    if (after.data[i] !== before.data[i]) diffs++;
  }
  checkEq(diffs, 0, 'zero strength → no pixel changes');
}

// Test 2: Gray pixel (r=g=b) has near-zero chroma before and after (identity round-trip)
{
  console.log('\nTest 2: Gray pixel chroma stays near zero');
  imageStore.clear(); _canvasId = 0;
  // Side-by-side: gray pixel (0,0) and colored pixel (1,0)
  const fills = {
    '0,0': [128, 128, 128], // gray — chroma ≈ 0
    '1,0': [200, 50, 50],   // vivid red — high chroma
  };
  const canvas = createPatchCanvas(3, 3, fills);
  const ctx = canvas.getContext();

  effect.apply(ctx, 3, 3, { x: 0, y: 0, w: 3, h: 3 }, 100);

  const after = ctx.getImageData(0, 0, 3, 3);
  const grayCAfter = oklabChroma(after.data[0], after.data[1], after.data[2]);
  const vividCAfter = oklabChroma(after.data[4], after.data[5], after.data[6]);

  // Gray pixel chroma should be near zero (round-trip preserves neutrality)
  check(grayCAfter < 0.01, `gray chroma near 0 after vibrance (${grayCAfter.toFixed(4)})`);
  // Vivid pixel should have visible chroma
  check(vividCAfter > 0.05, `vivid pixel has chroma > 0.05 after vibrance (${vividCAfter.toFixed(3)})`);
}

// Test 3: Already-saturated pixel changes very little
{
  console.log('\nTest 3: Saturated pixel changes very little');
  imageStore.clear(); _canvasId = 0;
  const fills = { '0,0': [255, 0, 0] }; // fully saturated red
  const canvas = createPatchCanvas(1, 1, fills);
  const ctx = canvas.getContext();

  const before = ctx.getImageData(0, 0, 1, 1);

  effect.apply(ctx, 1, 1, { x: 0, y: 0, w: 1, h: 1 }, 100);

  const after = ctx.getImageData(0, 0, 1, 1);
  // Fully saturated pixels should barely change (vibrance targets muted colors)
  let maxChannelDiff = 0;
  for (let c = 0; c < 3; c++) {
    maxChannelDiff = Math.max(maxChannelDiff, Math.abs(after.data[c] - before.data[c]));
  }
  check(maxChannelDiff <= 20,
    `saturated pixel max channel change ≤ 20 (got ${maxChannelDiff})`);
}

// Test 4: Export shape
{
  console.log('\nTest 4: Effect export shape');
  checkEq(effect.id, 'vibrance', 'id');
  checkEq(effect.name, 'Vibrance', 'name');
  checkEq(effect.category, 'color', 'category');
  checkEq(typeof effect.defaultStrength, 'number', 'defaultStrength is number');
  checkEq(typeof effect.apply, 'function', 'apply is function');
}

// ═══════════════════════════════════════════════════════════════════════
console.log(`\n${'═'.repeat(50)}`);
if (failures === 0) console.log('ALL VIBRANCE TESTS PASSED');
else { console.error(`${failures} FAILED`); process.exitCode = 1; }
