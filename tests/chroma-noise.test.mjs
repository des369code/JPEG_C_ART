/**
 * Chroma noise effect — automated tests.
 *
 * Verifies: luminance preserved, chrominance changes with strength,
 * region respect, and export shape.
 *
 * Run:  node tests/chroma-noise.test.mjs
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
    filter: 'none',
    createImageData(w, h) {
      return { data: new Uint8ClampedArray(w * h * 4), width: w, height: h };
    },
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
    drawImage(src, dx, dy) { /* no-op for noise field self-blit */ },
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
globalThis.Math.random = globalThis.Math.random || Math.random;

// ── Import ──────────────────────────────────────────────────────────
const { effect } = await import('../js/effects/chroma-noise.js?v=' + Date.now());

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

let _seed = 42;
function seededRandom() {
  _seed = (_seed * 16807) % 2147483647;
  return (_seed - 1) / 2147483646;
}

// ═══════════════════════════════════════════════════════════════════════
console.log('── Chroma noise tests ──');

// Test 1: Zero strength = no change
{
  console.log('\nTest 1: Zero strength = no change');
  const canvas = createUniformCanvas(50, 40, 128, 100, 150);
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

// Test 2: Luminance preserved while chrominance changes
{
  console.log('\nTest 2: Luminance preserved, chrominance changes');
  imageStore.clear(); _canvasId = 0; _seed = 123;
  const canvas = createUniformCanvas(50, 40, 128, 100, 150);
  const ctx = canvas.getContext();
  const origRandom = Math.random;
  Math.random = seededRandom;

  effect.apply(ctx, 50, 40, { x: 0, y: 0, w: 50, h: 40 }, 100);

  Math.random = origRandom;
  const d = ctx.getImageData(0, 0, 50, 40);

  let lumDiffMax = 0, chromaChanges = 0;
  const origR = 128, origG = 100, origB = 150;
  const origY = 0.299 * origR + 0.587 * origG + 0.114 * origB;
  for (let i = 0; i < d.data.length; i += 4) {
    const newY = 0.299 * d.data[i] + 0.587 * d.data[i + 1] + 0.114 * d.data[i + 2];
    lumDiffMax = Math.max(lumDiffMax, Math.abs(newY - origY));
    if (d.data[i] !== origR || d.data[i + 1] !== origG || d.data[i + 2] !== origB) {
      chromaChanges++;
    }
  }
  check(lumDiffMax <= 2, `luminance change ≤ 2 (max diff: ${lumDiffMax.toFixed(2)})`);
  check(chromaChanges > 0, `chrominance changed (${chromaChanges} pixels)`);
}

// Test 3: Higher strength = more chrominance variance
{
  console.log('\nTest 3: Higher strength = more chrominance variance');

  function chromaVariance(strength) {
    imageStore.clear(); _canvasId = 0; _seed = 42;
    const canvas = createUniformCanvas(50, 40, 128, 100, 150);
    const ctx = canvas.getContext();
    const origRandom = Math.random;
    Math.random = seededRandom;
    effect.apply(ctx, 50, 40, { x: 0, y: 0, w: 50, h: 40 }, strength);
    Math.random = origRandom;
    const d = ctx.getImageData(0, 0, 50, 40);
    let sumSqDiff = 0, n = 0;
    const origCb = -0.168736 * 128 - 0.331264 * 100 + 0.5 * 150 + 128;
    for (let i = 0; i < d.data.length; i += 4) {
      const cb = -0.168736 * d.data[i] - 0.331264 * d.data[i + 1] + 0.5 * d.data[i + 2] + 128;
      sumSqDiff += (cb - origCb) ** 2;
      n++;
    }
    return Math.sqrt(sumSqDiff / n);
  }

  const rms25 = chromaVariance(25);
  const rms50 = chromaVariance(50);
  check(rms50 > rms25, `strength 50 Cb RMS > 25 RMS (${rms50.toFixed(2)} > ${rms25.toFixed(2)})`);
}

// Test 4: Region respect
{
  console.log('\nTest 4: Region respect');
  imageStore.clear(); _canvasId = 0; _seed = 99;
  const canvas = createUniformCanvas(50, 40, 128, 100, 150);
  const ctx = canvas.getContext();
  const origRandom = Math.random;
  Math.random = seededRandom;

  effect.apply(ctx, 50, 40, { x: 0, y: 0, w: 25, h: 40 }, 100);

  Math.random = origRandom;
  const d = ctx.getImageData(0, 0, 50, 40);

  let leftChanged = 0, rightChanged = 0;
  for (let py = 0; py < 40; py++) {
    for (let px = 0; px < 50; px++) {
      const idx = (py * 50 + px) * 4;
      const changed = d.data[idx] !== 128 || d.data[idx + 1] !== 100 || d.data[idx + 2] !== 150;
      if (px < 25) { if (changed) leftChanged++; }
      else { if (changed) rightChanged++; }
    }
  }
  check(leftChanged > 0, `left half has noise (${leftChanged} pixels changed)`);
  checkEq(rightChanged, 0, 'right half unchanged (outside region)');
}

// Test 5: Export shape
{
  console.log('\nTest 5: Effect export shape');
  checkEq(effect.id, 'chroma-noise', 'id');
  checkEq(effect.name, 'Chroma noise', 'name');
  checkEq(effect.category, 'sensor', 'category');
  checkEq(typeof effect.defaultStrength, 'number', 'defaultStrength is number');
  checkEq(typeof effect.apply, 'function', 'apply is function');
  check(effect.extraParams && effect.extraParams.correlation, 'has correlation extraParam');
}

// ═══════════════════════════════════════════════════════════════════════
console.log(`\n${'═'.repeat(50)}`);
if (failures === 0) console.log('ALL CHROMA NOISE TESTS PASSED');
else { console.error(`${failures} FAILED`); process.exitCode = 1; }
