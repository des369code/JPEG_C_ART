/**
 * Dead/hot pixels effect — automated tests.
 *
 * Verifies stuck-pixel generation: count = round(strength / 100 * 30),
 * 70% hot (bright R:240-255, G:220-255, B:200-255), 30% dead (dark <10),
 * region-aware.
 *
 * Uses a seeded PRNG for deterministic tests.
 *
 * Run:  node tests/dead-pixels.test.mjs
 */

// ── Seeded PRNG (Mulberry32) ──────────────────────────────────────────
function mulberry32(seed) {
  let s = seed | 0;
  return function next() {
    s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

let _prng = null;

/** Replace Math.random with a seeded PRNG. Every call thereafter is deterministic. */
function setSeed(seed) {
  _prng = mulberry32(seed);
  Math.random = _prng;
}

// ── Canvas 2D mock ──────────────────────────────────────────────────
const imageStore = new Map();
let _canvasId = 0;

function _mkCanvas(w, h) {
  const id = ++_canvasId;
  const ctx = {
    _canvasW: w, _canvasH: h,

    getImageData(cx, cy, cw, ch) {
      const store = imageStore.get(id);
      const len = cw * ch * 4;
      const data = new Uint8ClampedArray(len);
      if (store) {
        // Copy the sub-region from the full canvas store
        for (let py = 0; py < ch; py++) {
          for (let px = 0; px < cw; px++) {
            const si = ((py + cy) * store.width + (px + cx)) * 4;
            const di = (py * cw + px) * 4;
            if (si >= 0 && si + 3 < store.data.length) {
              data[di] = store.data[si];
              data[di + 1] = store.data[si + 1];
              data[di + 2] = store.data[si + 2];
              data[di + 3] = store.data[si + 3];
            }
          }
        }
      } else {
        // Freshly-accessed region — fill with neutral gray
        for (let i = 0; i < len; i += 4) {
          data[i] = 128; data[i + 1] = 128; data[i + 2] = 128; data[i + 3] = 255;
        }
      }
      return { data, width: cw, height: ch, colorSpace: 'srgb' };
    },

    putImageData(imgData, dx = 0, dy = 0) {
      const store = imageStore.get(id);
      if (store) {
        const src = imgData.data;
        const iw = imgData.width;
        const ih = imgData.height;
        for (let py = 0; py < ih; py++) {
          for (let px = 0; px < iw; px++) {
            const si = (py * iw + px) * 4;
            const di = ((py + dy) * store.width + (px + dx)) * 4;
            if (di >= 0 && di + 3 < store.data.length) {
              store.data[di] = src[si];
              store.data[di + 1] = src[si + 1];
              store.data[di + 2] = src[si + 2];
              store.data[di + 3] = src[si + 3];
            }
          }
        }
      } else {
        imageStore.set(id, {
          data: new Uint8ClampedArray(imgData.data),
          width: imgData.width,
          height: imgData.height,
        });
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
const { effect } = await import('../js/effects/dead-pixels.js?v=' + Date.now());

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

function equalPixels(a, b) {
  return a.data.every((v, i) => v === b.data[i]);
}

function countModified(canvas, beforeData) {
  const ctx = canvas.getContext();
  const after = ctx.getImageData(0, 0, canvas.width, canvas.height);
  let count = 0;
  for (let i = 0; i < after.data.length; i += 4) {
    if (after.data[i] !== beforeData[i] ||
        after.data[i + 1] !== beforeData[i + 1] ||
        after.data[i + 2] !== beforeData[i + 2]) count++;
  }
  return count;
}

function countModifiedInRect(canvas, beforeData, rx, ry, rw, rh) {
  const w = canvas.width;
  const after = canvas.getContext().getImageData(0, 0, w, canvas.height);
  let count = 0;
  for (let py = ry; py < ry + rh; py++) {
    for (let px = rx; px < rx + rw; px++) {
      const i = (py * w + px) * 4;
      if (after.data[i] !== beforeData[i] ||
          after.data[i + 1] !== beforeData[i + 1] ||
          after.data[i + 2] !== beforeData[i + 2]) count++;
    }
  }
  return count;
}

// ═══════════════════════════════════════════════════════════════════════
console.log('── Dead-pixel tests ──');

// Test 1: Zero strength produces no change
{
  console.log('\nTest 1: Zero strength = no change');
  const canvas = createUniformCanvas(100, 80, 128, 128, 128);
  const ctx = canvas.getContext();
  const before = ctx.getImageData(0, 0, 100, 80);

  effect.apply(ctx, 100, 80, { x: 0, y: 0, w: 100, h: 80 }, 0);

  const after = ctx.getImageData(0, 0, 100, 80);
  check(equalPixels(before, after), 'strength 0 → no pixel changes');
}

// Test 2: Higher strength = more modified pixels
{
  console.log('\nTest 2: Higher strength → more dead pixels');

  function modifiedCount(strength) {
    imageStore.clear(); _canvasId = 0;
    setSeed(42);
    const canvas = _mkCanvas(200, 200);
    const ctx = canvas.getContext();
    // Fill with a distinctive uniform color so hot/dead pixels are easy to spot
    const d = ctx.getImageData(0, 0, 200, 200);
    for (let i = 0; i < d.data.length; i += 4) {
      d.data[i] = 100; d.data[i + 1] = 100; d.data[i + 2] = 100; d.data[i + 3] = 255;
    }
    ctx.putImageData(d, 0, 0);
    const before = ctx.getImageData(0, 0, 200, 200);

    effect.apply(ctx, 200, 200, { x: 0, y: 0, w: 200, h: 200 }, strength);

    return countModified(canvas, before.data);
  }

  const c25 = modifiedCount(25);
  const c50 = modifiedCount(50);
  const c100 = modifiedCount(100);

  check(c100 >= c50, `strength 100 modified ${c100} >= strength 50 (${c50})`);
  check(c50 >= c25, `strength 50 modified ${c50} >= strength 25 (${c25})`);
}

// Test 3: At strength 100, exactly 30 pixels are modified in the loop
// (count = round(100/100 * 30) = 30).  With a seeded RNG the total
// is deterministic — a handful of random-pick collisions are possible
// on a 200×200 canvas, so count ≈ 30.
{
  console.log('\nTest 3: Strength 100 yields roughly 30 modified pixels');
  imageStore.clear(); _canvasId = 0;
  setSeed(99);
  const canvas = createUniformCanvas(200, 200, 100, 100, 100);
  const ctx = canvas.getContext();
  const before = ctx.getImageData(0, 0, 200, 200);

  effect.apply(ctx, 200, 200, { x: 0, y: 0, w: 200, h: 200 }, 100);

  const modded = countModified(canvas, before.data);
  // On a 200×200 canvas (40 000 pixels), 30 random picks have ~1% collision
  // chance; accept 28–30.
  check(modded >= 28 && modded <= 30,
    `modified count ${modded} in [28, 30]`);
}

// Test 4: Hot pixels are bright (R > 200), dead pixels are dark (R < 10)
{
  console.log('\nTest 4: Hot pixels bright, dead pixels dark');
  imageStore.clear(); _canvasId = 0;
  setSeed(7);
  const canvas = createUniformCanvas(100, 80, 100, 100, 100);
  const ctx = canvas.getContext();
  const before = ctx.getImageData(0, 0, 100, 80);

  effect.apply(ctx, 100, 80, { x: 0, y: 0, w: 100, h: 80 }, 100);

  const after = ctx.getImageData(0, 0, 100, 80);
  const allDead = []; // collect indices of dead pixels for inspection
  const allHot = [];
  for (let i = 0; i < after.data.length; i += 4) {
    if (after.data[i] === before.data[i] &&
        after.data[i + 1] === before.data[i + 1] &&
        after.data[i + 2] === before.data[i + 2]) continue;
    // This pixel was modified
    const r = after.data[i];
    if (r > 200) {
      allHot.push(i);
      // Hot: R 240–255, G 220–255, B 200–255
      check(after.data[i] >= 240 && after.data[i] <= 255,
        `hot pixel R in [240, 255] (got ${after.data[i]})`);
      check(after.data[i + 1] >= 220 && after.data[i + 1] <= 255,
        `hot pixel G in [220, 255] (got ${after.data[i + 1]})`);
      check(after.data[i + 2] >= 200 && after.data[i + 2] <= 255,
        `hot pixel B in [200, 255] (got ${after.data[i + 2]})`);
    } else {
      allDead.push(i);
      // Dead: all channels < 11 (Uint8ClampedArray rounds Math.random()*10
      // up to 10 for values extremely close to 10.0; accept anything ≤ 10.)
      check(after.data[i] < 11,
        `dead pixel R < 11 (got ${after.data[i]})`);
      check(after.data[i + 1] < 11,
        `dead pixel G < 11 (got ${after.data[i + 1]})`);
      check(after.data[i + 2] < 11,
        `dead pixel B < 11 (got ${after.data[i + 2]})`);
    }
  }
  check(allHot.length + allDead.length > 0, 'at least one pixel modified');
  check(allHot.length + allDead.length <= 30, `at most 30 pixels modified (${allHot.length + allDead.length})`);
}

// Test 5: ~70% of modified pixels are hot (with fixed seed)
{
  console.log('\nTest 5: Hot/dead ratio approximately 70/30');
  imageStore.clear(); _canvasId = 0;
  setSeed(42);
  const canvas = createUniformCanvas(200, 200, 100, 100, 100);
  const ctx = canvas.getContext();
  const before = ctx.getImageData(0, 0, 200, 200);

  effect.apply(ctx, 200, 200, { x: 0, y: 0, w: 200, h: 200 }, 100);

  const after = ctx.getImageData(0, 0, 200, 200);
  let hot = 0, dead = 0;
  for (let i = 0; i < after.data.length; i += 4) {
    if (after.data[i] === before.data[i] &&
        after.data[i + 1] === before.data[i + 1] &&
        after.data[i + 2] === before.data[i + 2]) continue;
    if (after.data[i] > 200) hot++;
    else dead++;
  }
  const total = hot + dead;
  check(total > 0, 'at least one modified pixel');
  // With a fixed seed, the ratio is deterministic; accept a generous window
  const ratio = hot / total;
  check(ratio >= 0.5 && ratio <= 0.9,
    `hot ratio ${(ratio * 100).toFixed(0)}% in expected [50%, 90%] (hot=${hot}/${total})`);
}

// Test 6: Region respect — only pixels within region are affected
{
  console.log('\nTest 6: Region respect');
  imageStore.clear(); _canvasId = 0;
  setSeed(1);
  const canvas = createUniformCanvas(100, 100, 100, 100, 100);
  const ctx = canvas.getContext();
  const before = ctx.getImageData(0, 0, 100, 100);

  // Apply effect only to the top-left 20×20 quadrant
  effect.apply(ctx, 100, 100, { x: 0, y: 0, w: 20, h: 20 }, 100);

  const after = ctx.getImageData(0, 0, 100, 100);
  const insideModded = countModifiedInRect(canvas, before.data, 0, 0, 20, 20);
  const outsideModded = countModifiedInRect(canvas, before.data, 20, 20, 80, 80);

  check(insideModded > 0, `pixels modified inside region (${insideModded})`);
  checkEq(outsideModded, 0, `no pixels modified outside region (${outsideModded})`);
}

// Test 7: Strength-percentage mapping — count = round(strength / 100 * 30)
{
  console.log('\nTest 7: Count formula mapping');
  // We can't observe count directly; we check that the number of modified
  // pixels is ≤ the formula output (since random collisions may reduce it).
  // We use a large canvas (500×500) to minimise collisions.
  const counts = [
    { strength: 0,  expected: 0 },
    { strength: 10, expected: 3 },  // round(0.10 * 30) = 3
    { strength: 25, expected: 8 },  // round(0.25 * 30) = 8  (7.5)
    { strength: 33, expected: 10 }, // round(0.33 * 30) = 10 (9.9)
    { strength: 50, expected: 15 }, // round(0.50 * 30) = 15
    { strength: 67, expected: 20 }, // round(0.67 * 30) = 20 (20.1)
    { strength: 75, expected: 23 }, // round(0.75 * 30) = 23 (22.5)
    { strength: 100, expected: 30 },
  ];

  for (const { strength, expected } of counts) {
    imageStore.clear(); _canvasId = 0;
    setSeed(10 + strength);
    const canvas = createUniformCanvas(500, 500, 100, 100, 100);
    const ctx = canvas.getContext();
    const before = ctx.getImageData(0, 0, 500, 500);

    effect.apply(ctx, 500, 500, { x: 0, y: 0, w: 500, h: 500 }, strength);

    const modded = countModified(canvas, before.data);
    if (expected === 0) {
      checkEq(modded, 0, `count for strength ${strength} = 0`);
    } else {
      // Accept 0 collisions or a few
      check(modded >= expected - 2 && modded <= expected,
        `strength ${strength}: modified ${modded} ≈ expected ${expected}`);
    }
  }
}

// Test 8: Export shape
{
  console.log('\nTest 8: Effect export shape');
  checkEq(effect.id, 'dead-pixels', 'id');
  checkEq(effect.name, 'Dead/hot pixels', 'name');
  checkEq(effect.category, 'sensor', 'category');
  checkEq(typeof effect.defaultStrength, 'number', 'defaultStrength is number');
  checkEq(typeof effect.apply, 'function', 'apply is function');
}

// ═══════════════════════════════════════════════════════════════════════
console.log(`\n${'═'.repeat(50)}`);
if (failures === 0) console.log('ALL DEAD-PIXEL TESTS PASSED');
else { console.error(`${failures} FAILED`); process.exitCode = 1; }
