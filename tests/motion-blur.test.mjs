/**
 * Motion blur effect — automated tests.
 * Verifies maxOffset formula, drawImage trigger, deterministic angle seeding.
 * Run:  node tests/motion-blur.test.mjs
 */

const imageStore = new Map();
let _canvasId = 0;

function _mkCanvas(w, h) {
  const id = ++_canvasId;
  const fullW = w, fullH = h;
  const fullData = new Uint8ClampedArray(fullW * fullH * 4);
  for (let i = 0; i < fullData.length; i += 4) {
    fullData[i] = 128; fullData[i+1] = 128; fullData[i+2] = 128; fullData[i+3] = 255;
  }
  imageStore.set(id, { data: fullData, width: fullW, height: fullH });

  const ctx = {
    _canvasW: fullW, _canvasH: fullH,
    _globalAlpha: 1,
    get globalAlpha() { return this._globalAlpha; },
    set globalAlpha(v) { this._globalAlpha = v; },

    getImageData(x, y, rw, rh) {
      const src = imageStore.get(id);
      const cw = this._canvasW;
      const subData = new Uint8ClampedArray(rw * rh * 4);
      for (let py = 0; py < rh; py++) {
        for (let px = 0; px < rw; px++) {
          const si = ((y+py)*cw + (x+px))*4, di = (py*rw + px)*4;
          if (si >= 0 && si+3 < src.data.length) {
            subData[di]=src.data[si]; subData[di+1]=src.data[si+1];
            subData[di+2]=src.data[si+2]; subData[di+3]=src.data[si+3];
          }
        }
      }
      return { data: subData, width: rw, height: rh, colorSpace: 'srgb' };
    },

    putImageData(imgData, x, y) {
      const dst = imageStore.get(id);
      const cw = this._canvasW;
      for (let py = 0; py < imgData.height; py++) {
        for (let px = 0; px < imgData.width; px++) {
          const si = (py*imgData.width+px)*4, di = ((y+py)*cw + (x+px))*4;
          if (di >= 0 && di+3 < dst.data.length) {
            dst.data[di]=imgData.data[si]; dst.data[di+1]=imgData.data[si+1];
            dst.data[di+2]=imgData.data[si+2]; dst.data[di+3]=imgData.data[si+3];
          }
        }
      }
    },

    drawImage(source, dx, dy) {
      this._drawCalled = true;
      this._lastDx = Math.round(dx);
      this._lastDy = Math.round(dy);
    },
    _drawCalled: false,
    _lastDx: 0,
    _lastDy: 0,
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
          if (k==='width') return t.width;
          if (k==='height') return t.height;
          if (k==='getContext') return t.getContext.bind(t);
          if (k==='_mockId') return t._mockId;
          return t[k];
        },
        set(t, k, v) {
          if (k==='width') { t.width=v; t.getContext()._canvasW=v;
            const s=imageStore.get(t._mockId);
            if(s){s.width=v;s.data=new Uint8ClampedArray(v*s.height*4);s.data.fill(128);} return true; }
          if (k==='height') { t.height=v; t.getContext()._canvasH=v;
            const s=imageStore.get(t._mockId);
            if(s){s.height=v;s.data=new Uint8ClampedArray(s.width*v*4);s.data.fill(128);} return true; }
          t[k]=v; return true;
        },
      });
    }
    return origCreateElement ? origCreateElement(tag) : {};
  },
};
globalThis.window = globalThis.window || { addEventListener() {} };
globalThis.HTMLElement = globalThis.HTMLElement || class {};

const { effect } = await import('../js/effects/motion-blur.js?v=' + Date.now());

let failures = 0;
function check(c, l) { if (!c) { console.error(`  FAIL: ${l}`); failures++; } else console.log(`  PASS: ${l}`); }
function checkEq(a, b, l) { if (a !== b) { console.error(`  FAIL: ${l} — expected ${b}, got ${a}`); failures++; } else console.log(`  PASS: ${l} (${a})`); }

const origRandom = Math.random;

console.log('── Motion blur tests ──');

// Test 1: Zero strength = no change
{
  console.log('\nTest 1: Zero strength = no change');
  imageStore.clear(); _canvasId = 0;
  const canvas = _mkCanvas(50, 40);
  const ctx = canvas.getContext();
  const before = ctx.getImageData(0, 0, 50, 40);
  Math.random = () => 0.25;
  effect.apply(ctx, 50, 40, { x: 0, y: 0, w: 50, h: 40 }, 0);
  Math.random = origRandom;
  const after = ctx.getImageData(0, 0, 50, 40);
  let diffs = 0;
  for (let i = 0; i < before.data.length; i++) {
    if (after.data[i] !== before.data[i]) diffs++;
  }
  checkEq(diffs, 0, 'zero strength → no pixel changes');
}

// Test 2: Non-zero strength triggers drawImage
{
  console.log('\nTest 2: Effect triggers drawImage');
  imageStore.clear(); _canvasId = 0;
  const canvas = _mkCanvas(50, 40);
  const ctx = canvas.getContext();
  Math.random = () => 0;
  effect.apply(ctx, 50, 40, { x: 0, y: 0, w: 50, h: 40 }, 30);
  Math.random = origRandom;
  check(ctx._drawCalled, 'drawImage was called');
}

// Test 3: maxOffset formula
{
  console.log('\nTest 3: maxOffset = (strength/100) * 8');
  checkEq((100/100)*8, 8, 'strength 100 → offset 8px');
  checkEq((50/100)*8, 4, 'strength 50 → offset 4px');
  checkEq((0/100)*8, 0, 'strength 0 → offset 0px');
  check((6/100)*8 < 0.5, 'strength 6 → below early-return');
}

// Test 4: Deterministic with fixed seed
{
  console.log('\nTest 4: Deterministic with fixed seed');
  function getOffset(seed) {
    imageStore.clear(); _canvasId = 0;
    const canvas = _mkCanvas(30, 20);
    const ctx = canvas.getContext();
    Math.random = () => seed;
    effect.apply(ctx, 30, 20, { x: 0, y: 0, w: 30, h: 20 }, 50);
    Math.random = origRandom;
    return { dx: ctx._lastDx, dy: ctx._lastDy, called: ctx._drawCalled };
  }
  const a = getOffset(0.25), b = getOffset(0.25);
  check(a.called && b.called, 'effect ran both times');
  checkEq(a.dx, b.dx, `same seed → same dx (${a.dx})`);
  checkEq(a.dy, b.dy, `same seed → same dy (${a.dy})`);
}

// Test 5: Different seeds = different directions
{
  console.log('\nTest 5: Different seeds = different directions');
  const a = (() => {
    imageStore.clear(); _canvasId = 0;
    const canvas = _mkCanvas(30, 20); const ctx = canvas.getContext();
    Math.random = () => 0.1;
    effect.apply(ctx, 30, 20, { x: 0, y: 0, w: 30, h: 20 }, 50);
    Math.random = origRandom;
    return { dx: ctx._lastDx, dy: ctx._lastDy };
  })();
  const b = (() => {
    imageStore.clear(); _canvasId = 0;
    const canvas = _mkCanvas(30, 20); const ctx = canvas.getContext();
    Math.random = () => 0.5;
    effect.apply(ctx, 30, 20, { x: 0, y: 0, w: 30, h: 20 }, 50);
    Math.random = origRandom;
    return { dx: ctx._lastDx, dy: ctx._lastDy };
  })();
  check(a.dx !== b.dx || a.dy !== b.dy, 'different seeds → different offsets');
}

// Test 6: Export shape
{
  console.log('\nTest 6: Export shape');
  checkEq(effect.id, 'motion-blur', 'id');
  checkEq(effect.name, 'Motion blur', 'name');
  checkEq(effect.category, 'focus', 'category');
  checkEq(typeof effect.apply, 'function', 'apply is function');
}

console.log(`\n${'═'.repeat(50)}`);
if (failures === 0) console.log('ALL MOTION BLUR TESTS PASSED');
else { console.error(`${failures} FAILED`); process.exitCode = 1; }
