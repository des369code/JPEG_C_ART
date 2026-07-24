/**
 * Region resize — automated integration test.
 *
 * Mocks the minimal DOM APIs that js/ui/region.js needs, then drives
 * a mousedown→mousemove→mouseup sequence and asserts region geometry.
 *
 * Run:  node tests/region-resize.test.mjs
 */

import { ok, strictEqual as eq } from 'node:assert';

// ── record calls for assertion ────────────────────────────────────
const log = [];
function LOG(s) { log.push(s); }

// ── DOM shim (installed on globalThis before imports) ─────────────

const elements = [];           // all created elements, by creation order
const eventStore = new Map();  // element → { type → [fn] }

function _storeEvent(el, type, fn) {
  if (!eventStore.has(el)) eventStore.set(el, new Map());
  const m = eventStore.get(el);
  if (!m.has(type)) m.set(type, []);
  m.get(type).push(fn);
}

function _emit(el, type, e) {
  // Set target if not already set (simulates event originating at el)
  if (!('target' in e) || e.target == null) e.target = el;
  // Bubble up through parentElement chain
  let cur = el;
  while (cur) {
    const m = eventStore.get(cur);
    if (m && m.has(type)) {
      for (const fn of m.get(type)) fn.call(cur, e);
    }
    cur = cur.parentElement;
  }
}

// Fake style object — each key is a property, cssText sets all.
function _mkStyle() {
  const store = {};
  return new Proxy(store, {
    get(t, k) {
      if (k === 'cssText') {
        return Object.entries(t).map(([p, v]) => `${p}:${v};`).join('');
      }
      return t[k] ?? '';
    },
    set(t, k, v) {
      if (k === 'cssText') {
        // Parse "key:value;…" back into properties
        for (const pair of String(v).split(';')) {
          const c = pair.indexOf(':');
          if (c < 0) continue;
          const pk = pair.slice(0, c).trim();
          const pv = pair.slice(c + 1).trim();
          if (pk) t[pk] = pv;
        }
        return true;
      }
      t[k] = v;
      return true;
    },
  });
}

let _nextRafCb = null;
let _rafActive = false;

globalThis.requestAnimationFrame = (cb) => {
  _nextRafCb = cb;
  _rafActive = true;
  return 1;
};
globalThis.cancelAnimationFrame = () => {
  _nextRafCb = null;
  _rafActive = false;
};

function flushRAF() {
  // Execute any pending rAF callback.  Repeat in case the callback
  // itself schedules another rAF.
  let guard = 5;
  while (_nextRafCb && guard-- > 0) {
    const cb = _nextRafCb;
    _nextRafCb = null;
    _rafActive = false;
    cb();
  }
}

function _mkElement(tag) {
  const style = _mkStyle();
  const dataset = {};
  const children = [];
  let _text = '';
  let _disabled = false;

  const el = {
    tagName: tag.toUpperCase(),
    nodeName: tag.toUpperCase(),
    style,
    dataset,
    children,
    className: '',
    parentElement: null,
    get textContent() { return _text; },
    set textContent(v) { _text = v; },
    get disabled() { return _disabled; },
    set disabled(v) { _disabled = v; },
    get value() { return style['--value'] ?? ''; },
    set value(v) { style['--value'] = String(v); },

    appendChild(child) {
      child.parentElement = el;
      children.push(child);
    },

    addEventListener(type, fn) {
      _storeEvent(el, type, fn);
    },

    getBoundingClientRect() {
      const l = parseFloat(style.left) || 0;
      const t = parseFloat(style.top) || 0;
      const w = parseFloat(style.width) || 0;
      const h = parseFloat(style.height) || 0;
      return { left: l, top: t, width: w, height: h, right: l + w, bottom: t + h };
    },

    closest(_sel) { return null; },
    dispatchEvent(e) { _emit(el, e.type, e); },
  };

  elements.push(el);
  return el;
}

globalThis.document = {
  createElement(tag) {
    return _mkElement(tag);
  },
};

const winStore = new Map();
globalThis.window = {
  addEventListener(type, fn) {
    if (!winStore.has(type)) winStore.set(type, []);
    winStore.get(type).push(fn);
  },
};

globalThis.HTMLElement = class {};

function emitWindow(type, e) {
  const fns = winStore.get(type);
  if (fns) for (const fn of fns) fn(e);
}

// Helper: make a minimal mouse event
function mev(overrides = {}) {
  return {
    type: 'mousemove',
    clientX: 0,
    clientY: 0,
    preventDefault() {},
    stopPropagation() {},
    ...overrides,
  };
}

// ── Now import the real module ────────────────────────────────────
// Use a timestamp to defeat Node's module cache during development.
const ts = Date.now();
const { setupRegions } = await import(`../js/ui/region.js?v=${ts}`);

// ── Test runner ───────────────────────────────────────────────────

let failures = 0;
function check(cond, label) {
  if (!cond) {
    console.error(`  FAIL: ${label}`);
    failures++;
  } else {
    console.log(`  PASS: ${label}`);
  }
}

function checkEq(actual, expected, label) {
  if (actual !== expected) {
    console.error(`  FAIL: ${label} — expected ${expected}, got ${actual}`);
    failures++;
  } else {
    console.log(`  PASS: ${label} (${actual})`);
  }
}

// ═══════════════════════════════════════════════════════════════════
// TEST 1: Basic resize — mousedown in corner, mousemove inward,
//         verify region shrinks and DOM updates.
// ═══════════════════════════════════════════════════════════════════
console.log('\n── Test 1: Resize (shrink) ──');

const container = _mkElement('div');
const inputs = {
  left: _mkElement('input'),
  top: _mkElement('input'),
  width: _mkElement('input'),
  height: _mkElement('input'),
};
for (const inp of Object.values(inputs)) inp.value = '0';

const api = setupRegions(container, inputs);

// Simulate loading a 3000×2000 image displayed at 600×400
api.updateImage(3000, 2000, 600, 400);

// Enable motion-blur so its overlay gets created
api.updateOverlays([
  { id: 'motion-blur', enabled: true, region: { x: 0, y: 0, w: 3000, h: 2000 } },
]);
api.setActiveEffect('motion-blur');

// Find the handle via the overlay container
const overlay = container.children[0]; // region-overlay div
check(overlay.className === 'region-overlay', 'overlay container created');
const handle = overlay.children[0];    // effect-overlay-handle
check(handle.className === 'effect-overlay-handle', 'handle created');
check(handle.children.length === 1, 'handle has resize child');

// Verify initial render: handle fills the display area
checkEq(handle.style.left, '0px', 'handle left = 0');
checkEq(handle.style.top, '0px', 'handle top = 0');
checkEq(handle.style.width, '600px', 'handle display width = 600');
checkEq(handle.style.height, '400px', 'handle display height = 400');

// ── Simulate mousedown in bottom-right corner (resize zone) ──
const rect = handle.getBoundingClientRect();
const cornerX = rect.right - 5;
const cornerY = rect.bottom - 5;

_emit(handle, 'mousedown', mev({
  type: 'mousedown',
  clientX: cornerX,
  clientY: cornerY,
}));

checkEq(api.getActiveEffect(), 'motion-blur', 'active effect set');

// ── Simulate mousemove (drag inward: left 100px, up 80px) ──
emitWindow('mousemove', mev({
  clientX: cornerX - 100,
  clientY: cornerY - 80,
}));
flushRAF();  // rAF fires, processes pendingEvent
flushRAF();  // in case renderAll schedules another

const r1 = api.getRegion('motion-blur');
// scale = imageW/displayW = 3000/600 = 5
// dragRegion.w + dx*sx = 3000 + (-100)*5 = 3000 - 500 = 2500
checkEq(r1.w, 2500, 'region width = 2500 (shrunk)');
checkEq(r1.h, 1600, 'region height = 1600 (shrunk)');
checkEq(r1.x, 0, 'region x unchanged');
checkEq(r1.y, 0, 'region y unchanged');

// Verify DOM update
checkEq(handle.style.width, '500px', 'handle display width = 500');
checkEq(handle.style.height, '320px', 'handle display height = 320');

// ── mouseup stops interaction ──
emitWindow('mouseup', mev({ type: 'mouseup' }));
flushRAF();

// Another mousemove should NOT change the region
emitWindow('mousemove', mev({
  clientX: cornerX - 200,
  clientY: cornerY - 150,
}));
flushRAF();
flushRAF();

const r2 = api.getRegion('motion-blur');
checkEq(r2.w, r1.w, 'region unchanged after mouseup');
checkEq(r2.h, r1.h, 'region unchanged after mouseup');

// ═══════════════════════════════════════════════════════════════════
// TEST 2: Drag — mousedown in center moves region
// ═══════════════════════════════════════════════════════════════════
console.log('\n── Test 2: Drag ──');

const midX = rect.left + rect.width / 2;
const midY = rect.top + rect.height / 2;

_emit(handle, 'mousedown', mev({
  type: 'mousedown',
  clientX: midX,
  clientY: midY,
}));
flushRAF();

emitWindow('mousemove', mev({
  clientX: midX + 50,
  clientY: midY,
}));
flushRAF();
flushRAF();

const r3 = api.getRegion('motion-blur');
// dragRegion.x (snapshot) = 0. dx = 50. sx = 5.
// new x = clamp(0 + 250, 0, 3000 - 2500) = clamp(250, 0, 500) = 250
checkEq(r3.x, 250, 'region x = 250 after drag right');
checkEq(r3.y, 0, 'region y unchanged');
checkEq(r3.w, r1.w, 'region width unchanged during drag');
checkEq(r3.h, r1.h, 'region height unchanged during drag');

emitWindow('mouseup', mev({ type: 'mouseup' }));
flushRAF();

// ═══════════════════════════════════════════════════════════════════
// TEST 3: Resize from offset region (non-zero origin)
// ═══════════════════════════════════════════════════════════════════
console.log('\n── Test 3: Resize from offset ──');

api.setRegion('motion-blur', { x: 500, y: 300, w: 1000, h: 800 });
api.updateOverlays([
  { id: 'motion-blur', enabled: true, region: { x: 500, y: 300, w: 1000, h: 800 } },
]);
api.setActiveEffect('motion-blur');
flushRAF();
flushRAF();

const rect3 = handle.getBoundingClientRect();
const cx3 = rect3.right - 10;
const cy3 = rect3.bottom - 10;

// Resize ENLARGE: drag down-right
_emit(handle, 'mousedown', mev({
  type: 'mousedown',
  clientX: cx3,
  clientY: cy3,
}));
flushRAF();

emitWindow('mousemove', mev({
  clientX: cx3 + 30,
  clientY: cy3 + 20,
}));
flushRAF();
flushRAF();

const r4 = api.getRegion('motion-blur');
// dragRegion.w = 1000. dx = 30. sx = 5. new w = clamp(1000+150, 10, 3000-500) = clamp(1150, 10, 2500) = 1150
checkEq(r4.w, 1150, 'region width enlarged to 1150');
checkEq(r4.h, 900, 'region height enlarged to 900');
checkEq(r4.x, 500, 'region x unchanged during resize');
checkEq(r4.y, 300, 'region y unchanged during resize');

emitWindow('mouseup', mev({ type: 'mouseup' }));
flushRAF();

// ═══════════════════════════════════════════════════════════════════
// TEST 4: Click near but OUTSIDE resize zone → drag, not resize
// ═══════════════════════════════════════════════════════════════════
console.log('\n── Test 4: Corner detection boundary ──');

api.setRegion('motion-blur', { x: 100, y: 100, w: 800, h: 600 });
api.updateOverlays([
  { id: 'motion-blur', enabled: true, region: { x: 100, y: 100, w: 800, h: 600 } },
]);
api.setActiveEffect('motion-blur');
flushRAF();

const rect4 = handle.getBoundingClientRect();
// Click 40px from right, 5px from bottom → in vertical zone but NOT horizontal zone
const edgeX = rect4.right - 40; // outside 28px zone
const edgeY = rect4.bottom - 5; // inside 28px zone

_emit(handle, 'mousedown', mev({
  type: 'mousedown',
  clientX: edgeX,
  clientY: edgeY,
}));
flushRAF();

// If this were a resize, moving DOWN-RIGHT would enlarge.
// If this is a drag (correct), moving would shift x,y.
emitWindow('mousemove', mev({
  clientX: edgeX + 20,
  clientY: edgeY + 20,
}));
flushRAF();
flushRAF();

const r5 = api.getRegion('motion-blur');
// With scale=5, 20px display = 100 image px shift
checkEq(r5.x, 200, 'x shifted (was drag, not resize)');
checkEq(r5.y, 200, 'y shifted (was drag, not resize)');
checkEq(r5.w, 800, 'width unchanged (was drag)');
checkEq(r5.h, 600, 'height unchanged (was drag)');

emitWindow('mouseup', mev({ type: 'mouseup' }));
flushRAF();

// ═══════════════════════════════════════════════════════════════════
// TEST 5: Input sync — changing inputs updates region
// ═══════════════════════════════════════════════════════════════════
console.log('\n── Test 5: Input sync ──');

inputs.width.value = '500';
_emit(inputs.width, 'input', mev({ type: 'input' }));
flushRAF();

const r6 = api.getRegion('motion-blur');
checkEq(r6.w, 500, 'width set via input');

// ═══════════════════════════════════════════════════════════════════
// Summary
// ═══════════════════════════════════════════════════════════════════
console.log(`\n${'═'.repeat(50)}`);
if (failures === 0) {
  console.log('ALL TESTS PASSED');
} else {
  console.error(`${failures} TEST(S) FAILED`);
  process.exitCode = 1;
}
