/** Multi-overlay region selector — one colored handle per effect. */

import { clamp } from '../utils.js';

/** Colors assigned to each effect for overlay rendering. */
const OVERLAY_COLORS = {
  'motion-blur':          '#ff6b6b',
  'soft-focus':           '#ffd93d',
  'iso-grain':            '#4d96ff',
  'dead-pixels':          '#ff922b',
  'dust-spots':           '#cc5de8',
  'jpeg-artifacts':       '#20c997',
};

/** px from bottom-right corner that counts as a resize grab. */
const RESIZE_ZONE = 28;

/**
 * Set up per-effect region overlays on a canvas container.
 * @param {HTMLElement} container
 * @param {Object} inputs — {left, top, width, height} HTMLInputElements
 */
export function setupRegions(container, inputs) {
  const regions = {};       // { effectId: {x,y,w,h} }
  let activeId = null;      // currently editable effect
  let overlays = {};        // { effectId: { handle, resizeHandle } }
  let enabledEffects = {};  // { effectId: boolean }
  let imageW = 1, imageH = 1, displayW = 1, displayH = 1;
  let listeners = [];

  const overlayContainer = document.createElement('div');
  overlayContainer.className = 'region-overlay';
  container.style.position = 'relative';
  container.appendChild(overlayContainer);

  // Dragging state
  let dragging = false, resizing = false;
  let dragStart = { x: 0, y: 0 };
  let dragRegion = { x: 0, y: 0, w: 0, h: 0 };
  let rafId = null;
  let showAllOverlays = false;

  function toDisplay(r) {
    const sx = displayW / imageW;
    const sy = displayH / imageH;
    return { x: r.x * sx, y: r.y * sy, w: r.w * sx, h: r.h * sy };
  }

  function createHandle(effectId, color) {
    const handle = document.createElement('div');
    handle.className = 'effect-overlay-handle';
    // The border + outline extend 3px outside the content box.
    // Position the resize knob to straddle the border so the visual
    // corner IS the clickable resize target.
    handle.style.cssText = `position:absolute;border:2px solid ${color};outline:1px solid rgba(0,0,0,0.5);cursor:move;pointer-events:auto;`;
    handle.dataset.effectId = effectId;

    const resize = document.createElement('div');
    resize.className = 'effect-overlay-resize';
    // Extend 3px past the content edge to overlap the border+outline zone.
    // The visible corner = content + 2px border + 1px outline = 3px outside.
    resize.style.cssText = `position:absolute;bottom:-3px;right:-3px;width:22px;height:22px;background:${color};cursor:nwse-resize;pointer-events:auto;border-radius:0 0 3px 0;border:1px solid rgba(0,0,0,0.4);`;

    handle.appendChild(resize);

    handle.addEventListener('mousedown', (e) => {
      setActiveEffect(effectId);

      // Coordinate-based hit test: was the click in the bottom-right
      // RESIZE_ZONE of the handle?  This is robust against the resize
      // knob being clipped, overlapped, or the event targeting the
      // border instead of the child div.
      const rect = handle.getBoundingClientRect();
      const relX = e.clientX - rect.left;
      const relY = e.clientY - rect.top;
      const isResize = relX > rect.width - RESIZE_ZONE && relY > rect.height - RESIZE_ZONE;

      if (isResize) {
        resizing = true;
      } else {
        dragging = true;
      }
      dragStart = { x: e.clientX, y: e.clientY };
      dragRegion = { ...(regions[effectId] || { x: 0, y: 0, w: 200, h: 200 }) };
      e.preventDefault();
      e.stopPropagation();
    });

    return { handle, resize };
  }

  function applyDragResize(e) {
    if (!dragging && !resizing) return;
    if (!activeId) return;
    const dx = e.clientX - dragStart.x;
    const dy = e.clientY - dragStart.y;
    const sx = imageW / displayW;
    const sy = imageH / displayH;
    // Compute from dragRegion (snapshot at mousedown) so repeated
    // mousemoves don't drift from integer rounding.
    const r = { ...dragRegion };

    if (dragging) {
      r.x = Math.round(clamp(r.x + dx * sx, 0, imageW - r.w));
      r.y = Math.round(clamp(r.y + dy * sy, 0, imageH - r.h));
    } else {
      r.w = Math.round(clamp(r.w + dx * sx, 10, imageW - r.x));
      r.h = Math.round(clamp(r.h + dy * sy, 10, imageH - r.y));
    }

    regions[activeId] = r;
    renderAll();
    notify();
  }

  // Global mouse events — throttled via rAF so DOM writes don't lag.
  let pendingEvent = null;
  window.addEventListener('mousemove', (e) => {
    if (!dragging && !resizing) return;
    pendingEvent = e;                  // always track the latest position
    if (rafId) return;                // already scheduled
    rafId = requestAnimationFrame(() => {
      rafId = null;
      if (pendingEvent) {
        applyDragResize(pendingEvent);
        pendingEvent = null;
      }
    });
  });

  window.addEventListener('mouseup', () => {
    dragging = false;
    resizing = false;
    if (rafId) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
  });

  // Numeric input sync — controls the active effect
  for (const key of ['left', 'top', 'width', 'height']) {
    const input = inputs[key];
    input.addEventListener('input', () => {
      if (!activeId) return;
      const mapKey = key === 'left' ? 'x' : key === 'top' ? 'y' : key === 'width' ? 'w' : 'h';
      const r = regions[activeId] || { x: 0, y: 0, w: 200, h: 200 };
      r[mapKey] = clamp(parseInt(input.value) || 0, 0, mapKey === 'w' ? imageW : mapKey === 'h' ? imageH : 99999);
      regions[activeId] = r;
      renderAll();
      notify();
    });
  }

  function renderAll() {
    for (const [id, els] of Object.entries(overlays)) {
      if (!enabledEffects[id]) {
        els.handle.style.display = 'none';
        continue;
      }
      // When not showing all, only render the active effect's overlay
      if (!showAllOverlays && id !== activeId) {
        els.handle.style.display = 'none';
        continue;
      }
      const r = regions[id];
      if (!r) continue;
      const d = toDisplay(r);
      els.handle.style.display = '';
      els.handle.style.left = `${d.x}px`;
      els.handle.style.top = `${d.y}px`;
      els.handle.style.width = `${d.w}px`;
      els.handle.style.height = `${d.h}px`;
      // All solid when showing all (read-only viz), or solid for active when editing
      els.handle.style.borderStyle = showAllOverlays ? 'dashed' : 'solid';
      els.handle.style.pointerEvents = showAllOverlays ? 'none' : 'auto';
    }

    // Sync inputs to active effect (only when editing, not in showAll mode)
    if (!showAllOverlays && activeId && regions[activeId]) {
      const ar = regions[activeId];
      inputs.left.value = ar.x;
      inputs.top.value = ar.y;
      inputs.width.value = ar.w;
      inputs.height.value = ar.h;
    }
  }

  function notify() {
    for (const fn of listeners) fn(activeId, { ...regions });
  }

  return {
    getRegion(id) { return { ...(regions[id] || { x: 0, y: 0, w: imageW, h: imageH }) }; },

    setRegion(id, r) {
      regions[id] = { x: r.x ?? 0, y: r.y ?? 0, w: r.w ?? imageW, h: r.h ?? imageH };
    },

    setActiveEffect(id) {
      activeId = id;
      renderAll();
      notify();
    },

    getActiveEffect() { return activeId; },

    /**
     * Update which effects are enabled, their colors, and their regions.
     * @param {Array<{id:string, enabled:boolean, region:{x,y,w,h}}>} states
     */
    updateOverlays(states) {
      for (const s of states) {
        enabledEffects[s.id] = s.enabled;
        if (!regions[s.id]) regions[s.id] = s.region;
        if (!overlays[s.id] && OVERLAY_COLORS[s.id]) {
          overlays[s.id] = createHandle(s.id, OVERLAY_COLORS[s.id]);
          overlayContainer.appendChild(overlays[s.id].handle);
        }
      }
      if (activeId && !enabledEffects[activeId]) {
        // Active effect was disabled — switch to first enabled
        const next = states.find(s => s.enabled);
        activeId = next ? next.id : null;
      }
      renderAll();
    },

    onRegionChanged(fn) { listeners.push(fn); },

    updateImage(naturalW, naturalH, displayW_, displayH_) {
      imageW = naturalW;
      imageH = naturalH;
      displayW = displayW_;
      displayH = displayH_;
      // Default all regions to full image
      for (const id of Object.keys(OVERLAY_COLORS)) {
        regions[id] = { x: 0, y: 0, w: imageW, h: imageH };
      }
      renderAll();
    },

    toggleShowAll() {
      showAllOverlays = !showAllOverlays;
      renderAll();
      return showAllOverlays;
    },
  };
}
