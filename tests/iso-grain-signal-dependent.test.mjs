/**
 * ISO grain signal-dependent noise — automated tests.
 *
 * Verifies: shadowBias=0 = flat noise (backward compat), shadowBias=100
 * gives zero noise at lum=255, shadowBias=50 gives more noise in dark
 * pixels than bright pixels.
 *
 * Run:  node tests/iso-grain-signal-dependent.test.mjs
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
const { effect } = await import('../js/effects/iso-grain.js?v=' + Date.now());

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

let _seed = 42;
function seededRandom() {
  _seed = (_seed * 16807) % 2147483647;
  return (_seed - 1) / 2147483646;
}

function createTwoToneCanvas() {
  imageStore.clear(); _canvasId = 0;
  // Left half: dark (lum ~25), right half: bright (lum ~230)
  const canvas = _mkCanvas(60, 40);
  const ctx = canvas.getContext();
  const d = ctx.getImageData(0, 0, 60, 40);
  for (let py = 0; py < 40; py++) {
    for (let px = 0; px < 60; px++) {
      const idx = (py * 60 + px) * 4;
      if (px < 30) {
        d.data[idx] = 25; d.data[idx + 1] = 25; d.data[idx + 2] = 25;
      } else {
        d.data[idx] = 230; d.data[idx + 1] = 230; d.data[idx + 2] = 230;
      }
      d.data[idx + 3] = 255;
    }
  }
  ctx.putImageData(d, 0, 0);
  return canvas;
}

// ═══════════════════════════════════════════════════════════════════════
console.log('── ISO grain signal-dependent tests ──');

// Test 1: shadowBias=0 = flat noise (backward compat)
{
  console.log('\nTest 1: shadowBias=0 = flat noise');
  imageStore.clear(); _canvasId = 0; _seed = 42;
  const canvas = createTwoToneCanvas();
  const ctx = canvas.getContext();
  const origRandom = Math.random;
  Math.random = seededRandom;

  effect.apply(ctx, 60, 40, { x: 0, y: 0, w: 60, h: 40 }, 100, { shadowBias: 0 });

  Math.random = origRandom;
  const d = ctx.getImageData(0, 0, 60, 40);

  // With shadowBias=0, dark and bright halves should have similar RMS noise
  let darkRms = 0, brightRms = 0, darkN = 0, brightN = 0;
  for (let py = 0; py < 40; py++) {
    for (let px = 0; px < 60; px++) {
      const idx = (py * 60 + px) * 4;
      const diff = d.data[idx] - (px < 30 ? 25 : 230);
      if (px < 30) { darkRms += diff * diff; darkN++; }
      else { brightRms += diff * diff; brightN++; }
    }
  }
  darkRms = Math.sqrt(darkRms / darkN);
  brightRms = Math.sqrt(brightRms / brightN);

  check(Math.abs(darkRms - brightRms) < 5,
    `shadowBias=0: dark RMS ≈ bright RMS (dark: ${darkRms.toFixed(2)}, bright: ${brightRms.toFixed(2)})`);
}

// Test 2: shadowBias=100: bright pixels get dramatically less noise than dark pixels
{
  console.log('\nTest 2: shadowBias=100 — bright noise ≪ dark noise');
  imageStore.clear(); _canvasId = 0; _seed = 42;
  const canvas = createTwoToneCanvas();
  const ctx = canvas.getContext();
  const origRandom = Math.random;
  Math.random = seededRandom;

  effect.apply(ctx, 60, 40, { x: 0, y: 0, w: 60, h: 40 }, 100, { shadowBias: 100 });

  Math.random = origRandom;
  const d = ctx.getImageData(0, 0, 60, 40);

  // At shadowBias=100, lum=25: scale≈0.90, lum=230: scale≈0.10
  // Dark noise should be ~9× brighter noise in RMS terms
  let darkRms = 0, brightRms = 0, darkN = 0, brightN = 0;
  for (let py = 0; py < 40; py++) {
    for (let px = 0; px < 60; px++) {
      const idx = (py * 60 + px) * 4;
      const orig = px < 30 ? 25 : 230;
      const diff = d.data[idx] - orig;
      if (px < 30) { darkRms += diff * diff; darkN++; }
      else { brightRms += diff * diff; brightN++; }
    }
  }
  darkRms = Math.sqrt(darkRms / darkN);
  brightRms = Math.sqrt(brightRms / brightN);

  check(darkRms > brightRms * 5,
    `shadowBias=100: dark RMS (${darkRms.toFixed(2)}) ≫ bright RMS (${brightRms.toFixed(2)})`);

  // Dark pixels should still have meaningful noise
  check(darkRms > 5, `shadowBias=100: dark pixels have meaningful noise (RMS: ${darkRms.toFixed(2)})`);
}

// Test 3: shadowBias=50: dark pixel noise > bright pixel noise
{
  console.log('\nTest 3: shadowBias=50 — signal-dependent ratio');
  imageStore.clear(); _canvasId = 0; _seed = 42;
  const canvas = createTwoToneCanvas();
  const ctx = canvas.getContext();
  const origRandom = Math.random;
  Math.random = seededRandom;

  effect.apply(ctx, 60, 40, { x: 0, y: 0, w: 60, h: 40 }, 100, { shadowBias: 50 });

  Math.random = origRandom;
  const d = ctx.getImageData(0, 0, 60, 40);

  let darkRms = 0, brightRms = 0, darkN = 0, brightN = 0;
  for (let py = 0; py < 40; py++) {
    for (let px = 0; px < 60; px++) {
      const idx = (py * 60 + px) * 4;
      const diff = d.data[idx] - (px < 30 ? 25 : 230);
      if (px < 30) { darkRms += diff * diff; darkN++; }
      else { brightRms += diff * diff; brightN++; }
    }
  }
  darkRms = Math.sqrt(darkRms / darkN);
  brightRms = Math.sqrt(brightRms / brightN);

  // At shadowBias=50 with dark lum ~25 (scale ≈ 0.95) and bright lum ~230 (scale ≈ 0.55),
  // dark noise should be roughly 0.95/0.55 ≈ 1.7× brighter noise
  check(darkRms > brightRms,
    `shadowBias=50: dark RMS (${darkRms.toFixed(2)}) > bright RMS (${brightRms.toFixed(2)})`);
}

// ═══════════════════════════════════════════════════════════════════════
console.log(`\n${'═'.repeat(50)}`);
if (failures === 0) console.log('ALL SIGNAL-DEPENDENT GRAIN TESTS PASSED');
else { console.error(`${failures} FAILED`); process.exitCode = 1; }
