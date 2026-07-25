/**
 * Chromatic aberration — automated tests.
 *
 * Verifies color channel shifting: red outward, blue inward.
 * Scale = 1 + (strength/100) * 0.008  (1.0 to 1.008)
 * Red channel  → px * scale  (outward from center)
 * Blue channel → px * invScale,  invScale = 2 - scale  (inward toward center)
 *
 * Run:  node tests/chromatic-aberration.test.mjs
 */

// ── Canvas 2D mock ──────────────────────────────────────────────────
const imageStore = new Map();
let _canvasId = 0;

function _mkCanvas(w, h) {
  const id = ++_canvasId;
  const ctx = {
    _canvasW: w, _canvasH: h,

    get canvas() { return this._canvas; },

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

    createImageData(w, h) {
      return { data: new Uint8ClampedArray(w * h * 4), width: w, height: h };
    },

    // Vignette uses these — kept for the shared mock shape
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
      const src = imageStore.get(id);
      if (!src) return;
      const g = this._fillStyle;
      const cx = g._x0, cy = g._y0;
      const innerR = g._r0, outerR = g._r1;
      const innerColor = g._stops[0];
      const outerColor = g._stops[1];
      const rgbaMatch = outerColor.color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+),?\s*([\d.]+)?\)/);
      if (!rgbaMatch) return;
      const or = parseInt(rgbaMatch[1]), og = parseInt(rgbaMatch[2]), ob = parseInt(rgbaMatch[3]);
      const oa = rgbaMatch[4] ? parseFloat(rgbaMatch[4]) : 1;
      const data = src.data;
      for (let py = 0; py < h; py++) {
        for (let px = x; px < x + w; px++) {
          const dx = px - cx, dy = py - cy;
          const dist = Math.sqrt(dx * dx + dy * dy);
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
const { effect } = await import('../js/effects/chromatic-aberration.js?v=' + Date.now());

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

function pixelAt(ctx, x, y, w) {
  const d = ctx.getImageData(0, 0, w * 2, w); // oversize fetch, safe with our store
  const idx = (y * w + x) * 4;
  return { r: d.data[idx], g: d.data[idx + 1], b: d.data[idx + 2], a: d.data[idx + 3] };
}

function fillCanvas(canvas, w, h, fillR, fillG, fillB, dotX, dotY, dotR, dotG, dotB) {
  const ctx = canvas.getContext();
  const d = ctx.getImageData(0, 0, w, h);
  for (let i = 0; i < d.data.length; i += 4) {
    d.data[i] = fillR; d.data[i + 1] = fillG; d.data[i + 2] = fillB; d.data[i + 3] = 255;
  }
  if (dotX >= 0) {
    const idx = (dotY * w + dotX) * 4;
    d.data[idx] = dotR; d.data[idx + 1] = dotG; d.data[idx + 2] = dotB;
  }
  ctx.putImageData(d, 0, 0);
  return canvas;
}

function freshCanvas(w, h) {
  imageStore.clear(); _canvasId = 0;
  return _mkCanvas(w, h);
}

function applyFresh(w, h, strength, fillR, fillG, fillB, dotX, dotY, dotR, dotG, dotB) {
  const canvas = freshCanvas(w, h);
  fillCanvas(canvas, w, h, fillR, fillG, fillB, dotX, dotY, dotR, dotG, dotB);
  effect.apply(canvas.getContext(), w, h, null, strength);
  return canvas.getContext();
}

// ═══════════════════════════════════════════════════════════════════════
console.log('── Chromatic aberration tests ──');

// ── Test 1: Zero strength produces no change ─────────────────────────
// At strength 0, scale = 1.0 which is <= 1.001 → early return.
{
  console.log('\nTest 1: Zero strength = no change');
  const ctx = applyFresh(200, 150, 0, 128, 128, 128, -1, -1, 0, 0, 0);
  const d = ctx.getImageData(0, 0, 200, 150);
  let diffs = 0;
  for (let i = 0; i < d.data.length; i++) {
    if (d.data[i] !== (i % 4 === 3 ? 255 : 128)) diffs++;
  }
  checkEq(diffs, 0, 'zero strength → no pixel changes');
}

// ── Test 2: Higher strength = more channel separation ────────────────
// Place a red-only pixel right of center. At higher strength the red
// channel shifts further outward (further from center), which we
// measure as the gap between two symmetric red dots growing.
{
  console.log('\nTest 2: Higher strength = more separation');
  const W = 400, H = 200;

  function redGap(strength) {
    imageStore.clear(); _canvasId = 0;
    const canvas = freshCanvas(W, H);
    // Two red-only dots symmetric about center (200)
    fillCanvas(canvas, W, H, 0, 0, 0, 12, 75, 255, 0, 0);
    // Set the second dot
    const fillCtx = canvas.getContext();
    const fillD = fillCtx.getImageData(0, 0, W, H);
    const idx2 = (75 * W + 388) * 4;
    fillD.data[idx2] = 255; fillD.data[idx2 + 1] = 0; fillD.data[idx2 + 2] = 0;
    fillCtx.putImageData(fillD, 0, 0);

    effect.apply(canvas.getContext(), W, H, null, strength);
    const d = canvas.getContext().getImageData(0, 0, W, H);

    // Find leftmost and rightmost R=255 pixels in row 75
    let left = -1, right = -1;
    for (let x = 0; x < W; x++) {
      const idx = (75 * W + x) * 4;
      if (d.data[idx] === 255 && d.data[idx + 1] === 0 && d.data[idx + 2] === 0) {
        if (left < 0) left = x;
        right = x;
      }
    }
    if (left < 0 || right < 0) return -1;
    return right - left;
  }

  const gap50 = redGap(50);
  const gap100 = redGap(100);

  check(gap50 > 0, `gap exists at strength 50 (gap=${gap50})`);
  check(gap100 > 0, `gap exists at strength 100 (gap=${gap100})`);
  check(gap100 > gap50, `higher strength → wider red gap (${gap100} > ${gap50})`);
}

// ── Test 3: Red channel shifts outward from center ───────────────────
// White dot at (388,75) right of center (cx=200). At strength 100,
// scale=1.008 → red from (388,75) lands at x=390 (further from 200).
{
  console.log('\nTest 3: Red channel shifts outward');
  const ctx = applyFresh(400, 200, 100, 0, 0, 0, 388, 75, 255, 255, 255);

  const px390 = pixelAt(ctx, 390, 75, 400);
  check(px390.r === 255, `red at 390 = ${px390.r} (expected 255)`);
  check(px390.g === 0,   `green at 390 = ${px390.g} (expected 0)`);
  check(px390.b === 0,   `blue at 390 = ${px390.b} (expected 0)`);

  // Confirm the pixel one step inward (389) does NOT have the shifted red
  const px389 = pixelAt(ctx, 389, 75, 400);
  check(px389.r !== 255, `red NOT shifted to 389 (r=${px389.r})`);
}

// ── Test 4: Blue channel shifts inward toward center ─────────────────
// Same white dot at (388,75). At strength 100, invScale=0.992 →
// blue from (388,75) lands at x=386 (closer to 200).
{
  console.log('\nTest 4: Blue channel shifts inward');
  const ctx = applyFresh(400, 200, 100, 0, 0, 0, 388, 75, 255, 255, 255);

  const px386 = pixelAt(ctx, 386, 75, 400);
  check(px386.b === 255, `blue at 386 = ${px386.b} (expected 255)`);
  check(px386.r === 0,   `red at 386 = ${px386.r} (expected 0)`);
  check(px386.g === 0,   `green at 386 = ${px386.g} (expected 0)`);

  // Confirm the pixel one step outward (387) does NOT have the shifted blue
  const px387 = pixelAt(ctx, 387, 75, 400);
  check(px387.b !== 255, `blue NOT shifted to 387 (b=${px387.b})`);
}

// ── Test 5: Strength-percentage mapping ──────────────────────────────
// scale = 1 + (strength/100) * 0.008
// For a red-only dot at (388,75), dx=188, cx=200:
//   strength  0 → scale=1.000 → rx = 200+188*1       = 388        → no shift
//   strength 50 → scale=1.004 → rx = 200+188*1.004   = 388.752    → round 389
//   strength 100→ scale=1.008 → rx = 200+188*1.008   = 389.504    → round 390
{
  console.log('\nTest 5: Strength-percentage mapping');
  const W = 400, H = 200;

  function shiftedRedX(strength) {
    imageStore.clear(); _canvasId = 0;
    const ctx = applyFresh(W, H, strength, 0, 0, 0, 388, 75, 255, 0, 0);
    const d = ctx.getImageData(0, 0, W, H);
    for (let x = 0; x < W; x++) {
      const idx = (75 * W + x) * 4;
      // Pure red pixel: R=255, G=0, B=0
      if (d.data[idx] === 255 && d.data[idx + 1] === 0 && d.data[idx + 2] === 0) {
        return x;
      }
    }
    return -1;
  }

  const x0   = shiftedRedX(0);
  const x50  = shiftedRedX(50);
  const x100 = shiftedRedX(100);

  checkEq(x0,   388, 'strength   0 → scale=1.000 → red at x=388');
  checkEq(x50,  389, 'strength  50 → scale=1.004 → red at x=389');
  checkEq(x100, 390, 'strength 100 → scale=1.008 → red at x=390');
}

// ── Test 6: Export shape ─────────────────────────────────────────────
{
  console.log('\nTest 6: Effect export shape');
  checkEq(effect.id,      'chromatic-aberration', 'id');
  checkEq(effect.name,    'Chromatic aberration', 'name');
  checkEq(effect.category, 'lens', 'category');
  checkEq(typeof effect.description, 'string', 'description is string');
  check(effect.description.length > 0, 'description is non-empty');
  checkEq(typeof effect.defaultStrength, 'number', 'defaultStrength is number');
  checkEq(effect.defaultStrength, 40, 'defaultStrength = 40');
  checkEq(typeof effect.apply, 'function', 'apply is function');
}

// ═══════════════════════════════════════════════════════════════════════
console.log(`\n${'═'.repeat(50)}`);
if (failures === 0) console.log('ALL CHROMATIC ABERRATION TESTS PASSED');
else { console.error(`${failures} FAILED`); process.exitCode = 1; }
