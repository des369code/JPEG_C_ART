/**
 * Dust spots effect — automated tests.
 *
 * Verifies dark blurred spots count scales linearly with strength,
 * spots stay within the region, and opacity scales with strength.
 *
 * Non-deterministic: uses Math.random for placement, radius, and opacity.
 * We mock Math.random for deterministic assertions.
 *
 * Run:  node tests/dust-spots.test.mjs
 */

// ── Canvas 2D mock ──────────────────────────────────────────────────
const imageStore = new Map();
let _canvasId = 0;

function _mkCanvas(w, h) {
  const id = ++_canvasId;
  const ctx = {
    _canvasW: w, _canvasH: h,
    _gradientCalls: [],

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
      imageStore.set(id, {
        data: new Uint8ClampedArray(imgData.data),
        width: imgData.width, height: imgData.height,
      });
    },

    createRadialGradient(x0, y0, r0, x1, y1, r1) {
      const grad = {
        _x0: x0, _y0: y0, _r0: r0, _x1: x1, _y1: y1, _r1: r1,
        _stops: [],
        addColorStop(pos, color) { this._stops.push({ pos, color }); },
      };
      ctx._gradientCalls.push(grad);
      return grad;
    },

    _fillStyle: null,
    set fillStyle(v) { this._fillStyle = v; },
    get fillStyle() { return this._fillStyle; },

    fillRect(x, y, w, h) {
      if (!this._fillStyle || !this._fillStyle._stops) return;
      const g = this._fillStyle;
      const src = imageStore.get(id);
      if (!src) return;
      // Dust gradient: first stop is rgba(20,20,20,opacity) at center
      const firstStop = g._stops[0];
      if (!firstStop) return;
      const rgbaMatch = firstStop.color.match(/rgba\((\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\)/);
      if (!rgbaMatch) return;
      const dr = parseInt(rgbaMatch[1], 10);
      const dg = parseInt(rgbaMatch[2], 10);
      const db = parseInt(rgbaMatch[3], 10);
      const opacity = parseFloat(rgbaMatch[4]);

      const data = src.data;
      const startX = Math.max(0, Math.floor(x));
      const endX = Math.min(this._canvasW, Math.ceil(x + w));
      const startY = Math.max(0, Math.floor(y));
      const endY = Math.min(this._canvasH, Math.ceil(y + h));

      for (let py = startY; py < endY; py++) {
        for (let px = startX; px < endX; px++) {
          const idx = (py * this._canvasW + px) * 4;
          if (idx >= 0 && idx + 2 < data.length) {
            data[idx]     = Math.round(data[idx]     * (1 - opacity) + dr * opacity);
            data[idx + 1] = Math.round(data[idx + 1] * (1 - opacity) + dg * opacity);
            data[idx + 2] = Math.round(data[idx + 2] * (1 - opacity) + db * opacity);
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
const { effect } = await import('../js/effects/dust-spots.js?v=' + Date.now());

// ── Math.random mock ────────────────────────────────────────────────
const origRandom = Math.random;
let _randomValues = [];
let _randomIdx = 0;

function mockRandom(...values) {
  _randomValues = values;
  _randomIdx = 0;
  Math.random = () => {
    if (_randomIdx < _randomValues.length) return _randomValues[_randomIdx++];
    return 0.5; // fallback
  };
}

function resetRandom() {
  Math.random = origRandom;
  _randomValues = [];
  _randomIdx = 0;
}

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

function checkApprox(a, b, tol, label) {
  if (Math.abs(a - b) > tol) {
    console.error(`  FAIL: ${label} — expected ~${b}, got ${a} (tol=${tol})`);
    failures++;
  } else console.log(`  PASS: ${label} (${a} ~ ${b})`);
}

function createUniformCanvas(w, h, r, g, b) {
  imageStore.clear();
  _canvasId = 0;
  const canvas = _mkCanvas(w, h);
  const ctx = canvas.getContext();
  const d = ctx.getImageData(0, 0, w, h);
  for (let i = 0; i < d.data.length; i += 4) {
    d.data[i] = r; d.data[i + 1] = g; d.data[i + 2] = b; d.data[i + 3] = 255;
  }
  ctx.putImageData(d, 0, 0);
  ctx._gradientCalls = [];
  return canvas;
}

/**
 * Fill mockRandom with enough 0.5 values for `spotCount` spots.
 * Each spot calls Math.random 4 times (sx, sy, radius, opacity).
 */
function fillRandom(spotCount) {
  const values = new Array(spotCount * 4).fill(0.5);
  mockRandom(...values);
}

// ═══════════════════════════════════════════════════════════════════════
console.log('── Dust-spot tests ──');

// Test 1: Zero strength produces no change
{
  console.log('\nTest 1: Zero strength = no change');
  const canvas = createUniformCanvas(100, 80, 200, 200, 200);
  const ctx = canvas.getContext();
  const before = ctx.getImageData(0, 0, 100, 80);

  effect.apply(ctx, 100, 80, { x: 0, y: 0, w: 100, h: 80 }, 0);

  const after = ctx.getImageData(0, 0, 100, 80);
  let diffs = 0;
  for (let i = 0; i < before.data.length; i++) {
    if (after.data[i] !== before.data[i]) diffs++;
  }
  checkEq(diffs, 0, 'zero strength -> no pixel changes');
  checkEq(ctx._gradientCalls.length, 0, 'zero strength -> no gradients created');
}

// Test 2: Higher strength = more spots (count increases)
{
  console.log('\nTest 2: Higher strength = more spots');
  // At strength 50 → round(0.5 * 8) = 4 spots
  fillRandom(4);
  const canvas50 = createUniformCanvas(100, 80, 200, 200, 200);
  const ctx50 = canvas50.getContext();
  effect.apply(ctx50, 100, 80, { x: 0, y: 0, w: 100, h: 80 }, 50);
  const count50 = ctx50._gradientCalls.length;
  checkEq(count50, 4, 'strength 50 -> 4 spots');

  // At strength 100 → round(1.0 * 8) = 8 spots
  fillRandom(8);
  const canvas100 = createUniformCanvas(100, 80, 200, 200, 200);
  const ctx100 = canvas100.getContext();
  effect.apply(ctx100, 100, 80, { x: 0, y: 0, w: 100, h: 80 }, 100);
  const count100 = ctx100._gradientCalls.length;
  checkEq(count100, 8, 'strength 100 -> 8 spots');

  check(count100 > count50, 'more spots at higher strength');
  resetRandom();
}

// Test 3: At strength 100, exactly 8 spots are drawn
{
  console.log('\nTest 3: At strength 100, exactly 8 spots');
  fillRandom(8);
  const canvas = createUniformCanvas(100, 80, 200, 200, 200);
  const ctx = canvas.getContext();
  effect.apply(ctx, 100, 80, { x: 0, y: 0, w: 100, h: 80 }, 100);
  checkEq(ctx._gradientCalls.length, 8, 'exactly 8 gradients created at strength 100');
  resetRandom();
}

// Test 4: Spots are within the specified region
{
  console.log('\nTest 4: Spots within specified region');
  const region = { x: 20, y: 15, w: 60, h: 50 };

  // Alternate between low and high random values to check both region edges
  const values = [];
  for (let i = 0; i < 8; i++) {
    values.push(i % 2 === 0 ? 0.001 : 0.999); // sx
    values.push(i % 2 === 0 ? 0.001 : 0.999); // sy
    values.push(0.5);                          // radius
    values.push(0.5);                          // opacity
  }
  mockRandom(...values);

  const canvas = createUniformCanvas(100, 80, 200, 200, 200);
  const ctx = canvas.getContext();
  effect.apply(ctx, 100, 80, region, 100);

  for (const g of ctx._gradientCalls) {
    check(g._x0 >= region.x, `spot x ${g._x0} >= region.x ${region.x}`);
    check(g._x0 < region.x + region.w, `spot x ${g._x0} < region.x + region.w = ${region.x + region.w}`);
    check(g._y0 >= region.y, `spot y ${g._y0} >= region.y ${region.y}`);
    check(g._y0 < region.y + region.h, `spot y ${g._y0} < region.y + region.h = ${region.y + region.h}`);
  }
  resetRandom();
}

// Test 5: Spots darken pixels (R value decreases at spot centers)
{
  console.log('\nTest 5: Spots darken pixels');

  // With Math.random=0.5 at strength 100:
  //   sx = 0 + 0.5 * 100 = 50
  //   sy = 0 + 0.5 * 80  = 40
  //   radius = 3 + 0.5 * 12 = 9
  //   opacity = 0.03 + 0.5 * 0.10 * 1.0 = 0.08
  //   fillRect(41, 31, 18, 18) — spot center at (50,40) is inside this rect
  fillRandom(1);

  const canvas = createUniformCanvas(100, 80, 200, 200, 200);
  const ctx = canvas.getContext();
  const before = ctx.getImageData(0, 0, 100, 80);
  const beforeR = before.data[(40 * 100 + 50) * 4];

  effect.apply(ctx, 100, 80, { x: 0, y: 0, w: 100, h: 80 }, 100);

  const after = ctx.getImageData(0, 0, 100, 80);
  const afterR = after.data[(40 * 100 + 50) * 4];
  check(afterR < beforeR, `pixel at spot center darkened (before=${beforeR}, after=${afterR})`);
  resetRandom();
}

// Test 6: Strength-percentage mapping: count = round(strength / 100 * 8)
{
  console.log('\nTest 6: Strength-percentage mapping (linear)');
  const strengths = [0, 12, 25, 37, 50, 62, 75, 87, 100];
  const expected  = [0,  1,  2,  3,  4,  5,  6,  7,   8];

  for (let i = 0; i < strengths.length; i++) {
    const spots = expected[i];
    if (spots > 0) fillRandom(spots);
    else mockRandom(); // no random values needed when count = 0

    const canvas = createUniformCanvas(100, 80, 200, 200, 200);
    const ctx = canvas.getContext();
    effect.apply(ctx, 100, 80, { x: 0, y: 0, w: 100, h: 80 }, strengths[i]);
    checkEq(ctx._gradientCalls.length, expected[i],
      `strength ${strengths[i]} -> ${expected[i]} spots`);
  }
  resetRandom();
}

// Test 7: Spot opacity scales with strength
{
  console.log('\nTest 7: Spot opacity scales with strength');

  // opacity = 0.03 + Math.random() * 0.10 * (strength / 100)
  // At strength 100, random=0.5: opacity = 0.03 + 0.5 * 0.10 * 1.0 = 0.08
  fillRandom(1);
  {
    const canvas = createUniformCanvas(100, 80, 200, 200, 200);
    const ctx = canvas.getContext();
    effect.apply(ctx, 100, 80, { x: 0, y: 0, w: 100, h: 80 }, 100);
    const g = ctx._gradientCalls[0];
    const m = g._stops[0].color.match(/rgba\((\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\)/);
    const opacity = parseFloat(m[4]);
    checkApprox(opacity, 0.08, 0.001, `strength 100 => opacity ~0.08 (got ${opacity})`);
  }
  resetRandom();

  // At strength 50, random=0.5: opacity = 0.03 + 0.5 * 0.10 * 0.5 = 0.055
  fillRandom(1);
  {
    const canvas = createUniformCanvas(100, 80, 200, 200, 200);
    const ctx = canvas.getContext();
    effect.apply(ctx, 100, 80, { x: 0, y: 0, w: 100, h: 80 }, 50);
    const g = ctx._gradientCalls[0];
    const m = g._stops[0].color.match(/rgba\((\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\)/);
    const opacity = parseFloat(m[4]);
    checkApprox(opacity, 0.055, 0.001, `strength 50 => opacity ~0.055 (got ${opacity})`);
  }
  resetRandom();

  // At strength 25, random=0.5: opacity = 0.03 + 0.5 * 0.10 * 0.25 = 0.0425
  fillRandom(1);
  {
    const canvas = createUniformCanvas(100, 80, 200, 200, 200);
    const ctx = canvas.getContext();
    effect.apply(ctx, 100, 80, { x: 0, y: 0, w: 100, h: 80 }, 25);
    const g = ctx._gradientCalls[0];
    const m = g._stops[0].color.match(/rgba\((\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\)/);
    const opacity = parseFloat(m[4]);
    checkApprox(opacity, 0.0425, 0.001, `strength 25 => opacity ~0.0425 (got ${opacity})`);
  }
  resetRandom();
}

// Test 8: Export shape verification
{
  console.log('\nTest 8: Effect export shape');
  checkEq(effect.id, 'dust-spots', 'id');
  checkEq(effect.name, 'Dust spots', 'name');
  checkEq(effect.category, 'sensor', 'category');
  checkEq(typeof effect.defaultStrength, 'number', 'defaultStrength is number');
  checkEq(effect.defaultStrength, 25, 'defaultStrength = 25');
  checkEq(typeof effect.apply, 'function', 'apply is function');
}

// ═══════════════════════════════════════════════════════════════════════
console.log(`\n${'═'.repeat(50)}`);
if (failures === 0) console.log('ALL DUST-SPOT TESTS PASSED');
else { console.error(`${failures} FAILED`); process.exitCode = 1; }
