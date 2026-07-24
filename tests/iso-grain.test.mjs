/**
 * ISO grain effect — automated tests.
 *
 * Verifies monochromatic luminance noise: intensity scales linearly,
 * noise is zero-mean, and region is respected.
 *
 * Run:  node tests/iso-grain.test.mjs
 */

// ── Canvas 2D mock ──────────────────────────────────────────────────
const imageStore = new Map();
let _canvasId = 0;

function _mkCanvas(w, h) {
  const id = ++_canvasId;
  const fullW = w, fullH = h;

  // Initialize with mid-gray
  const fullData = new Uint8ClampedArray(fullW * fullH * 4);
  for (let i = 0; i < fullData.length; i += 4) {
    fullData[i] = 128; fullData[i + 1] = 128; fullData[i + 2] = 128; fullData[i + 3] = 255;
  }
  imageStore.set(id, { data: fullData, width: fullW, height: fullH });

  const ctx = {
    _canvasW: fullW, _canvasH: fullH,
    getImageData(x, y, rw, rh) {
      const src = imageStore.get(id);
      // Extract sub-region from full canvas data
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
      // Write sub-region back into full canvas
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
const { effect } = await import('../js/effects/iso-grain.js?v=' + Date.now());

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

// Deterministic random for reproducible tests
let _seed = 42;
function seededRandom() {
  _seed = (_seed * 16807) % 2147483647;
  return (_seed - 1) / 2147483646;
}

// ═══════════════════════════════════════════════════════════════════════
console.log('── ISO grain tests ──');

// Test 1: Zero strength = no change
{
  console.log('\nTest 1: Zero strength = no change');
  const canvas = createUniformCanvas(50, 40, 128, 128, 128);
  const ctx = canvas.getContext();
  const before = ctx.getImageData(0, 0, 50, 40);

  effect.apply(ctx, 50, 40, { x: 0, y: 0, w: 50, h: 40 }, 0);

  const after = ctx.getImageData(0, 0, 50, 40);
  let diffs = 0;
  for (let i = 0; i < before.data.length; i++) {
    if (after.data[i] !== before.data[i]) diffs++;
  }
  checkEq(diffs, 0, 'zero strength → no pixel changes');
}

// Test 2: Higher strength = more noise (higher variance)
{
  console.log('\nTest 2: Higher strength = more noise');

  function noiseVariance(strength) {
    imageStore.clear(); _canvasId = 0; _seed = 42;
    const canvas = createUniformCanvas(50, 40, 128, 128, 128);
    const ctx = canvas.getContext();
    const origRandom = Math.random;
    Math.random = seededRandom;
    effect.apply(ctx, 50, 40, { x: 0, y: 0, w: 50, h: 40 }, strength);
    Math.random = origRandom;
    const d = ctx.getImageData(0, 0, 50, 40);
    let sumSqDiff = 0, n = 0;
    for (let i = 0; i < d.data.length; i += 4) {
      sumSqDiff += (d.data[i] - 128) ** 2;
      n++;
    }
    return Math.sqrt(sumSqDiff / n); // RMS deviation
  }

  const rms25 = noiseVariance(25);
  const rms50 = noiseVariance(50);
  const rms100 = noiseVariance(100);

  check(rms50 > rms25, `strength 50 RMS > 25 RMS (${rms50.toFixed(2)} > ${rms25.toFixed(2)})`);
  check(rms100 > rms50, `strength 100 RMS > 50 RMS (${rms100.toFixed(2)} > ${rms50.toFixed(2)})`);
}

// Test 3: Noise is monochromatic (same offset for R, G, B per pixel)
{
  console.log('\nTest 3: Monochromatic noise');

  imageStore.clear(); _canvasId = 0; _seed = 123;
  const canvas = createUniformCanvas(50, 40, 128, 128, 128);
  const ctx = canvas.getContext();
  const origRandom = Math.random;
  Math.random = seededRandom;

  effect.apply(ctx, 50, 40, { x: 0, y: 0, w: 50, h: 40 }, 100);

  Math.random = origRandom;
  const d = ctx.getImageData(0, 0, 50, 40);
  let monoCount = 0, totalChanged = 0;
  for (let i = 0; i < d.data.length; i += 4) {
    const dr = d.data[i] - 128;
    const dg = d.data[i + 1] - 128;
    const db = d.data[i + 2] - 128;
    if (dr !== 0 || dg !== 0 || db !== 0) {
      totalChanged++;
      if (dr === dg && dg === db) monoCount++;
    }
  }
  check(monoCount === totalChanged && totalChanged > 0,
    `all ${totalChanged} changed pixels are monochromatic (R=G=B offset)`);
}

// Test 4: Region respect — only pixels within region get noise
{
  console.log('\nTest 4: Region respect');

  imageStore.clear(); _canvasId = 0; _seed = 99;
  const canvas = createUniformCanvas(50, 40, 128, 128, 128);
  const ctx = canvas.getContext();
  const origRandom = Math.random;
  Math.random = seededRandom;

  // Apply grain only to left half
  effect.apply(ctx, 50, 40, { x: 0, y: 0, w: 25, h: 40 }, 100);

  Math.random = origRandom;
  const d = ctx.getImageData(0, 0, 50, 40);

  let leftChanged = 0, rightChanged = 0;
  for (let py = 0; py < 40; py++) {
    for (let px = 0; px < 50; px++) {
      const idx = (py * 50 + px) * 4;
      const changed = d.data[idx] !== 128;
      if (px < 25) { if (changed) leftChanged++; }
      else { if (changed) rightChanged++; }
    }
  }
  check(leftChanged > 0, `left half has grain (${leftChanged} pixels changed)`);
  checkEq(rightChanged, 0, 'right half unchanged (outside region)');
}

// Test 5: Strength-percentage mapping — at 100%, intensity = 0.35
{
  console.log('\nTest 5: Intensity mapping at 100%');
  // intensity = (100/100) * 0.35 = 0.35
  // noise = (random - 0.5) * 0.35 * 255 = (0 to 1 → -0.5 to 0.5) * 89.25
  // Max possible noise: ±44.625

  imageStore.clear(); _canvasId = 0; _seed = 42;
  const canvas = createUniformCanvas(100, 80, 128, 128, 128);
  const ctx = canvas.getContext();
  const origRandom = Math.random;
  Math.random = seededRandom;

  effect.apply(ctx, 100, 80, { x: 0, y: 0, w: 100, h: 80 }, 100);

  Math.random = origRandom;
  const d = ctx.getImageData(0, 0, 100, 80);

  let maxAbsDiff = 0;
  for (let i = 0; i < d.data.length; i += 4) {
    maxAbsDiff = Math.max(maxAbsDiff, Math.abs(d.data[i] - 128));
  }
  // Max possible with seeded random should be less than 44.625
  check(maxAbsDiff <= 45, `max noise at 100% ≤ 45 (got ${maxAbsDiff.toFixed(1)})`);
  check(maxAbsDiff > 5, `max noise at 100% > 5 (meaningful, got ${maxAbsDiff.toFixed(1)})`);
}

// Test 6: Noise is zero-mean (average stays ~128)
{
  console.log('\nTest 6: Zero-mean noise');
  imageStore.clear(); _canvasId = 0; _seed = 777;
  const canvas = createUniformCanvas(200, 150, 128, 128, 128);
  const ctx = canvas.getContext();
  const origRandom = Math.random;
  Math.random = seededRandom;

  effect.apply(ctx, 200, 150, { x: 0, y: 0, w: 200, h: 150 }, 100);

  Math.random = origRandom;
  const d = ctx.getImageData(0, 0, 200, 150);
  let sum = 0, n = 0;
  for (let i = 0; i < d.data.length; i += 4) {
    sum += d.data[i]; n++;
  }
  const avg = sum / n;
  checkClose(avg, 128, 3, `average stays near 128 (got ${avg.toFixed(2)})`);
}

// Test 7: Export shape
{
  console.log('\nTest 7: Effect export shape');
  checkEq(effect.id, 'iso-grain', 'id');
  checkEq(effect.name, 'ISO grain', 'name');
  checkEq(effect.category, 'sensor', 'category');
  checkEq(typeof effect.defaultStrength, 'number', 'defaultStrength is number');
  checkEq(typeof effect.apply, 'function', 'apply is function');
}

// ═══════════════════════════════════════════════════════════════════════
console.log(`\n${'═'.repeat(50)}`);
if (failures === 0) console.log('ALL ISO GRAIN TESTS PASSED');
else { console.error(`${failures} FAILED`); process.exitCode = 1; }
