/**
 * Lens flare effect — automated tests.
 *
 * Verifies ghost reflections and veiling haze from bright light sources.
 * Strength 0->100 maps linearly to 0->1.0 global opacity.
 * Ghosts are radial gradients drawn along the line through center from the
 * brightest sampled point. Haze is a uniform warm-white overlay.
 *
 * Run:  node tests/lens-flare.test.mjs
 */

// ── Canvas 2D mock ──────────────────────────────────────────────────
const imageStore = new Map();
let _canvasId = 0;

function _parseRgba(str) {
  const m = str.match(/rgba?\((\d+),\s*(\d+),\s*(\d+),?\s*([\d.]+)?\)/);
  if (!m) return null;
  return { r: +m[1], g: +m[2], b: +m[3], a: m[4] ? +m[4] : 1 };
}

function _mkCanvas(w, h) {
  const id = ++_canvasId;
  const ctx = {
    _canvasW: w, _canvasH: h,

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
      const src = imageStore.get(id);
      if (!src) return;
      const data = src.data;

      // Bounding box in absolute pixel coordinates
      const x0 = Math.round(x);
      const y0 = Math.round(y);
      const x1 = Math.round(x + w);
      const y1 = Math.round(y + h);

      if (this._fillStyle && this._fillStyle._stops) {
        // ---- Radial gradient fill ----
        // Used by the lens-flare ghost reflections (inner=ghost colour,
        // outer=transparent) and potentially by other effects.
        const g = this._fillStyle;
        const cx = g._x0, cy = g._y0;
        const innerR = g._r0, outerR = g._r1;
        const stop0 = _parseRgba(g._stops[0].color);
        const stop1 = _parseRgba(g._stops[1].color);
        if (!stop0 || !stop1) return;

        for (let py = y0; py < y1; py++) {
          for (let px = x0; px < x1; px++) {
            if (px < 0 || px >= this._canvasW || py < 0 || py >= this._canvasH) continue;
            const dx = px - cx;
            const dy = py - cy;
            const dist = Math.sqrt(dx * dx + dy * dy);
            let t;
            if (dist <= innerR) t = 0;
            else if (dist >= outerR) t = 1;
            else t = (dist - innerR) / (outerR - innerR);
            // Linear interpolation between the two colour stops
            const r = stop0.r + (stop1.r - stop0.r) * t;
            const g = stop0.g + (stop1.g - stop0.g) * t;
            const b = stop0.b + (stop1.b - stop0.b) * t;
            const a = stop0.a + (stop1.a - stop0.a) * t;
            const idx = (py * this._canvasW + px) * 4;
            if (idx + 2 < data.length) {
              data[idx]     = Math.round(data[idx]     * (1 - a) + r * a);
              data[idx + 1] = Math.round(data[idx + 1] * (1 - a) + g * a);
              data[idx + 2] = Math.round(data[idx + 2] * (1 - a) + b * a);
            }
          }
        }
      } else if (typeof this._fillStyle === 'string') {
        // ---- Solid-color fill ----
        // Used by the veiling haze: fillStyle is set to e.g.
        // "rgba(255,245,230,0.06)" and fillRect covers the full canvas.
        const c = _parseRgba(this._fillStyle);
        if (!c) return;

        for (let py = y0; py < y1; py++) {
          for (let px = x0; px < x1; px++) {
            if (px < 0 || px >= this._canvasW || py < 0 || py >= this._canvasH) continue;
            const idx = (py * this._canvasW + px) * 4;
            if (idx + 2 < data.length) {
              data[idx]     = Math.round(data[idx]     * (1 - c.a) + c.r * c.a);
              data[idx + 1] = Math.round(data[idx + 1] * (1 - c.a) + c.g * c.a);
              data[idx + 2] = Math.round(data[idx + 2] * (1 - c.a) + c.b * c.a);
            }
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
const { effect } = await import('../js/effects/lens-flare.js?v=' + Date.now());

// ── Test helpers ─────────────────────────────────────────────────────
let failures = 0;
function check(cond, label) {
  if (!cond) { console.error(`  FAIL: ${label}`); failures++; }
  else console.log(`  PASS: ${label}`);
}
function checkEq(a, b, label) {
  if (a !== b) { console.error(`  FAIL: ${label} -- expected ${b}, got ${a}`); failures++; }
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

// ═══════════════════════════════════════════════════════════════════════
console.log('-- Lens flare tests --');

// Test 1: Zero strength produces no pixel changes
{
  console.log('\nTest 1: Zero strength = no change');
  const canvas = createUniformCanvas(100, 80, 200, 200, 200);
  const ctx = canvas.getContext();
  const before = ctx.getImageData(0, 0, 100, 80);

  effect.apply(ctx, 100, 80, null, 0);

  const after = ctx.getImageData(0, 0, 100, 80);
  let diffs = 0;
  for (let i = 0; i < before.data.length; i++) {
    if (after.data[i] !== before.data[i]) diffs++;
  }
  checkEq(diffs, 0, 'zero strength yields no pixel changes');
}

// Test 2: Higher strength = brighter image (more haze / ghost opacity)
{
  console.log('\nTest 2: Higher strength = brighter image');
  function pixelBrightness(strength) {
    imageStore.clear(); _canvasId = 0;
    const canvas = createUniformCanvas(100, 80, 100, 100, 100);
    const ctx = canvas.getContext();
    effect.apply(ctx, 100, 80, null, strength);
    const d = ctx.getImageData(0, 0, 100, 80);
    // Return average R of all pixels
    let sum = 0, count = 0;
    for (let i = 0; i < d.data.length; i += 4) { sum += d.data[i]; count++; }
    return sum / count;
  }

  const b25 = pixelBrightness(25);
  const b50 = pixelBrightness(50);
  const b100 = pixelBrightness(100);

  check(b100 > b50, `strength 100 brighter than 50 (${b100.toFixed(1)} > ${b50.toFixed(1)})`);
  check(b50 > b25, `strength 50 brighter than 25 (${b50.toFixed(1)} > ${b25.toFixed(1)})`);
  check(b25 > 100, `strength 25 above baseline 100 (${b25.toFixed(1)})`);
}

// Test 3: Ghost reflections create localized colour shifts
//
// Strategy: create a mostly-dark canvas with a single bright pixel at a
// known sampleable location.  After the effect runs, pixels near the
// predicted ghost centres (on the line from centre through the bright
// pixel) should be warmer / brighter than pixels far from any ghost.
{
  console.log('\nTest 3: Ghost reflections create localized shifts');
  const W = 200, H = 150;
  const canvas = createUniformCanvas(W, H, 20, 20, 20);
  const ctx = canvas.getContext();

  // Place a bright pixel at (140, 100) -- both 140 and 100 are multiples
  // of the sampling step (20), so the effect will find it.
  const d = ctx.getImageData(0, 0, W, H);
  const brightIdx = (100 * W + 140) * 4;
  d.data[brightIdx] = 250; d.data[brightIdx + 1] = 250; d.data[brightIdx + 2] = 250;
  ctx.putImageData(d, 0, 0);

  effect.apply(ctx, W, H, null, 100);

  const after = ctx.getImageData(0, 0, W, H);

  // Source = (140, 100).  Centre = (100, 75).
  // Ghost 1 (dist=-0.3): gx = 100 + (140-100)*(-0.3) = 88, gy = 67.5
  // Ghost 1 radius = min(W,H)*0.08 = 150*0.08 = 12
  // fillRect at (76, 55.5, 24, 24) -- covers rows 56..79, cols 76..99
  const ghostPixel = (67 * W + 88) * 4;
  const farPixel   = (67 * W + 10) * 4;  // same row, far from any ghost

  const gR = after.data[ghostPixel], gG = after.data[ghostPixel + 1], gB = after.data[ghostPixel + 2];
  const fR = after.data[farPixel],   fG = after.data[farPixel + 1],   fB = after.data[farPixel + 2];

  // On a 20-gray image the haze alone lifts R ~20 -> ~34.  The ghost
  // overlay adds warm tones, pushing R ~34 -> ~64 at the ghost centre.
  check(gR > fR + 10, `ghost pixel R (${gR}) > far pixel R (${fR}) by >10`);
  check(gR > 45,      `ghost pixel red channel > 45 (got ${gR})`);
  check(gG > gB || gR > gB, 'ghost pixel is warm (R or G > B)');
}

// Test 4: Strength-percentage mapping -- at 100%, opacity = 1.0, so the
//         veiling haze applies rgba(255,245,230,0.06) over every pixel.
//
//         On a uniform (128,128,128) image at a non-ghost pixel:
//           R = 128*0.94 + 255*0.06 = 135.6 ~ 136
//           G = 128*0.94 + 245*0.06 = 135.0 ~ 135
//           B = 128*0.94 + 230*0.06 = 134.1 ~ 134
{
  console.log('\nTest 4: Veiling haze at full strength (opacity = 1.0)');
  const canvas = createUniformCanvas(100, 80, 128, 128, 128);
  const ctx = canvas.getContext();

  effect.apply(ctx, 100, 80, null, 100);

  const after = ctx.getImageData(0, 0, 100, 80);
  // Pixel (10, 10) -- far from any ghost centre on a uniform image
  // (brightest point = (0,0) so ghosts cluster around x=65-82, y=52-66)
  const idx = (10 * 100 + 10) * 4;
  const r = after.data[idx], g = after.data[idx + 1], b = after.data[idx + 2];

  check(r >= 132 && r <= 139, `R near 136 at non-ghost pixel (got ${r})`);
  check(g >= 132 && g <= 139, `G near 135 at non-ghost pixel (got ${g})`);
  check(b >= 131 && b <= 138, `B near 134 at non-ghost pixel (got ${b})`);
}

// Test 5: Export shape verification
{
  console.log('\nTest 5: Effect export shape');
  checkEq(effect.id, 'lens-flare', 'id');
  checkEq(effect.name, 'Lens flare', 'name');
  checkEq(effect.category, 'lens', 'category');
  checkEq(typeof effect.defaultStrength, 'number', 'defaultStrength is number');
  checkEq(typeof effect.apply, 'function', 'apply is function');
  checkEq(effect.defaultStrength, 30, 'default strength is 30');
}

// ═══════════════════════════════════════════════════════════════════════
console.log(`\n${'='.repeat(50)}`);
if (failures === 0) {
  console.log('ALL LENS FLARE TESTS PASSED');
} else {
  console.error(`${failures} FAILED`);
  process.exitCode = 1;
}
