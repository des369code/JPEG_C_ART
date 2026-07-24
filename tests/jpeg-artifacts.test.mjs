/**
 * JPEG artifacts effect — automated tests.
 *
 * Verifies quality-from-strength formula, export shape, strength clamping,
 * and basic async apply behavior with mocked browser APIs.
 *
 * async apply flow (mocked):
 *   1. qualityFromStrength(strength) → quality (early return if >= 0.99)
 *   2. Extract region via ctx.getImageData
 *   3. Create temp canvas, put region data
 *   4. Encode to JPEG Blob via canvas.toBlob
 *   5. Decode Blob back to Image via URL.createObjectURL + Image() onload
 *   6. Paste back via ctx.drawImage
 *
 * Run:  node tests/jpeg-artifacts.test.mjs
 */

// ── Mock browser APIs ────────────────────────────────────────────────

// Image() constructor — fires onload synchronously when src is assigned
class MockImage {
  constructor() {
    this._src = null;
  }
  set src(url) {
    this._src = url;
    if (this.onload) this.onload();
  }
  get src() { return this._src; }
}

globalThis.Image = MockImage;
globalThis.URL = {
  createObjectURL() { return 'blob:mock'; },
  revokeObjectURL() {},
};

const origCreateElement = globalThis.document?.createElement;
globalThis.document = {
  ...(globalThis.document || {}),
  createElement(tag) {
    if (tag === 'canvas') {
      let _w = 0, _h = 0;
      const ctx = {
        putImageData() {},
        getImageData(x, y, w, h) {
          return { data: new Uint8ClampedArray(w * h * 4), width: w, height: h };
        },
      };
      return {
        get width() { return _w; },
        set width(v) { _w = v; },
        get height() { return _h; },
        set height(v) { _h = v; },
        getContext() { return ctx; },
        toBlob(cb) {
          const buf = new Uint8Array([0xFF, 0xD8, 0xFF, 0xD9]);
          cb(new Blob([buf], { type: 'image/jpeg' }));
        },
      };
    }
    return origCreateElement ? origCreateElement(tag) : {};
  },
};
globalThis.window = globalThis.window || { addEventListener() {} };
globalThis.HTMLElement = globalThis.HTMLElement || class {};

// ── Imports ───────────────────────────────────────────────────────────
const { effect } = await import('../js/effects/jpeg-artifacts.js?v=' + Date.now());
const { qualityFromStrength } = await import('../js/utils.js?v=' + Date.now());

// ── Helpers ───────────────────────────────────────────────────────────
let failures = 0;
function check(cond, label) {
  if (!cond) { console.error(`  FAIL: ${label}`); failures++; }
  else console.log(`  PASS: ${label}`);
}
function checkEq(a, b, label) {
  if (a !== b) { console.error(`  FAIL: ${label} — expected ${b}, got ${a}`); failures++; }
  else console.log(`  PASS: ${label} (${a})`);
}
function approx(a, b, tol, label) {
  if (Math.abs(a - b) > tol) {
    console.error(`  FAIL: ${label} — expected ~${b} (tol=${tol}), got ${a}`);
    failures++;
  } else console.log(`  PASS: ${label} (${a})`);
}

function createCtx(w, h) {
  return {
    getImageData(_x, _y, _w, _h) {
      return { data: new Uint8ClampedArray(_w * _h * 4), width: _w, height: _h };
    },
    drawImage() {},
  };
}

// ═══════════════════════════════════════════════════════════════════════
console.log('── JPEG artifacts tests ──');

// Test 1: qualityFromStrength formula
{
  console.log('\nTest 1: qualityFromStrength formula');
  approx(qualityFromStrength(0), 1.0, 0.001, 'strength 0 → quality 1.0');
  approx(qualityFromStrength(50), 0.505, 0.001, 'strength 50 → quality 0.505');
  approx(qualityFromStrength(100), 0.01, 0.001, 'strength 100 → quality 0.01');
}

// Test 2: qualityFromStrength monotonic
{
  console.log('\nTest 2: Monotonic quality decrease');
  check(qualityFromStrength(25) > qualityFromStrength(50), 'strength 25 > 50 quality');
  check(qualityFromStrength(75) < qualityFromStrength(25), 'strength 75 < 25 quality');
}

// Test 3: Edge-value clamping
{
  console.log('\nTest 3: Edge-value clamping');
  approx(qualityFromStrength(-10), 1.0, 0.001, 'strength -10 clamps to 0 → quality 1.0');
  approx(qualityFromStrength(150), 0.01, 0.001, 'strength 150 clamps to 100 → quality 0.01');
  approx(qualityFromStrength(0), 1.0, 0.001, 'strength 0 at boundary gives 1.0');
  approx(qualityFromStrength(100), 0.01, 0.001, 'strength 100 at boundary gives 0.01');
}

// Test 4: Export shape verification
{
  console.log('\nTest 4: Export shape');
  checkEq(effect.id, 'jpeg-artifacts', 'id');
  checkEq(effect.name, 'JPEG artifacts', 'name');
  checkEq(effect.category, 'compression', 'category');
  checkEq(typeof effect.defaultStrength, 'number', 'defaultStrength is number');
  checkEq(effect.defaultStrength, 50, 'defaultStrength equals 50');
  checkEq(typeof effect.apply, 'function', 'apply is function');
}

// Test 5: Async apply — strength 0 returns early (safe without real DOM)
{
  console.log('\nTest 5: Apply returns Promise at strength 0 (early return)');
  const result = effect.apply(null, 0, 0, null, 0);
  check(result instanceof Promise, 'apply returns a Promise (async function)');
}

// Test 6: Async apply at non-zero strength with region
{
  console.log('\nTest 6: Apply runs with region and calls drawImage');
  const ctx = createCtx(40, 40);
  const region = { x: 5, y: 5, w: 30, h: 30 };
  let drawCall = null;
  ctx.drawImage = (img, dx, dy, dw, dh) => { drawCall = { img, dx, dy, dw, dh }; };
  await effect.apply(ctx, 40, 40, region, 75);
  check(drawCall !== null, 'drawImage was called after JPEG decode cycle');
  if (drawCall) {
    checkEq(drawCall.dx, 5, 'drawImage x matches region.x');
    checkEq(drawCall.dy, 5, 'drawImage y matches region.y');
    checkEq(drawCall.dw, 30, 'drawImage w matches region.w');
    checkEq(drawCall.dh, 30, 'drawImage h matches region.h');
  }
}

// ═══════════════════════════════════════════════════════════════════════
console.log(`\n${'═'.repeat(50)}`);
if (failures === 0) console.log('ALL JPEG ARTIFACTS TESTS PASSED');
else { console.error(`${failures} FAILED`); process.exitCode = 1; }
