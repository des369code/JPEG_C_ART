/** Canvas overlay with draggable, resizable rectangle region selector */

import { clamp } from '../utils.js';

/**
 * Set up a draggable region selector overlay on a canvas container.
 * The canvas should already display the loaded image.
 *
 * @param {HTMLElement} container — element wrapping the canvas
 * @param {Object} inputs — numeric input elements for left, top, width, height
 * @returns {Object} — { getRegion, setRegion, onRegionChanged, updateCanvas(canvas) }
 */
export function setupRegion(container, inputs) {
  let region = { x: 0, y: 0, w: 200, h: 200 };
  let imageW = 1, imageH = 1; // natural image dimensions
  let displayW = 1, displayH = 1; // display size
  let dragging = false;
  let resizing = false;
  let dragStart = { x: 0, y: 0 };
  let dragRegion = { x: 0, y: 0, w: 0, h: 0 };
  let listeners = [];

  // Create overlay div for the selection rectangle
  const overlay = document.createElement('div');
  overlay.className = 'region-overlay';
  overlay.style.cssText = `
    position: absolute; top: 0; left: 0;
    pointer-events: none; z-index: 10;
  `;
  container.style.position = 'relative';
  container.appendChild(overlay);

  // Create draggable/resizable handle
  const handle = document.createElement('div');
  handle.className = 'region-handle';
  handle.style.cssText = `
    position: absolute;
    border: 2px dashed #fff;
    box-shadow: 0 0 0 1px rgba(0,0,0,0.5);
    cursor: move;
    pointer-events: auto;
  `;

  // Resize handle (bottom-right corner)
  const resizeHandle = document.createElement('div');
  resizeHandle.className = 'resize-handle';
  resizeHandle.style.cssText = `
    position: absolute; bottom: -6px; right: -6px;
    width: 12px; height: 12px;
    background: #fff; border: 2px solid #333;
    cursor: nwse-resize; pointer-events: auto;
  `;
  handle.appendChild(resizeHandle);

  overlay.appendChild(handle);

  /** Map region coords from image space to display space */
  function toDisplay() {
    const sx = displayW / imageW;
    const sy = displayH / imageH;
    return {
      x: region.x * sx,
      y: region.y * sy,
      w: region.w * sx,
      h: region.h * sy,
    };
  }

  /** Map display coords back to image space */
  function toImage(displayX, displayY, displayW, displayH) {
    const sx = imageW / displayW;
    const sy = imageH / displayH;
    return {
      x: Math.round(clamp(displayX * sx, 0, imageW)),
      y: Math.round(clamp(displayY * sy, 0, imageH)),
      w: Math.round(clamp(displayW * sx, 1, imageW)),
      h: Math.round(clamp(displayH * sy, 1, imageH)),
    };
  }

  /** Update handle position and size */
  function render() {
    const d = toDisplay();
    handle.style.left = `${d.x}px`;
    handle.style.top = `${d.y}px`;
    handle.style.width = `${d.w}px`;
    handle.style.height = `${d.h}px`;

    // Sync numeric inputs
    inputs.left.value = region.x;
    inputs.top.value = region.y;
    inputs.width.value = region.w;
    inputs.height.value = region.h;
  }

  /** Notify listeners of region change */
  function notify() {
    for (const fn of listeners) fn({ ...region });
  }

  // --- Mouse events for drag ---

  handle.addEventListener('mousedown', (e) => {
    if (e.target === resizeHandle) {
      resizing = true;
    } else {
      dragging = true;
    }
    dragStart = { x: e.clientX, y: e.clientY };
    dragRegion = { ...region };
    e.preventDefault();
  });

  window.addEventListener('mousemove', (e) => {
    if (!dragging && !resizing) return;

    const dx = e.clientX - dragStart.x;
    const dy = e.clientY - dragStart.y;
    const sx = imageW / displayW;
    const sy = imageH / displayH;

    if (dragging) {
      region.x = Math.round(clamp(dragRegion.x + dx * sx, 0, imageW - region.w));
      region.y = Math.round(clamp(dragRegion.y + dy * sy, 0, imageH - region.h));
    } else if (resizing) {
      region.w = Math.round(clamp(dragRegion.w + dx * sx, 10, imageW - region.x));
      region.h = Math.round(clamp(dragRegion.h + dy * sy, 10, imageH - region.y));
    }

    render();
    notify();
  });

  window.addEventListener('mouseup', () => {
    dragging = false;
    resizing = false;
  });

  // --- Numeric input sync ---
  for (const key of ['left', 'top', 'width', 'height']) {
    const input = inputs[key];
    input.addEventListener('input', () => {
      const mapKey = key === 'left' ? 'x' : key === 'top' ? 'y' : key === 'width' ? 'w' : 'h';
      region[mapKey] = clamp(parseInt(input.value) || 0, 0, mapKey === 'w' ? imageW : mapKey === 'h' ? imageH : 99999);
      render();
      notify();
    });
  }

  return {
    /** Get current region in image coordinates */
    getRegion() {
      return { ...region };
    },

    /** Set region from image coordinates */
    setRegion(r) {
      region = {
        x: clamp(r.x ?? 0, 0, imageW - 1),
        y: clamp(r.y ?? 0, 0, imageH - 1),
        w: clamp(r.w ?? 200, 1, imageW),
        h: clamp(r.h ?? 200, 1, imageH),
      };
      render();
      notify();
    },

    /** Update when a new image is loaded */
    updateImage(naturalW, naturalH, displayW_, displayH_) {
      imageW = naturalW;
      imageH = naturalH;
      displayW = displayW_;
      displayH = displayH_;
      // Default region: center 50% of image
      region = {
        x: Math.round(imageW * 0.25),
        y: Math.round(imageH * 0.25),
        w: Math.round(imageW * 0.5),
        h: Math.round(imageH * 0.5),
      };
      render();
    },

    /** Listen for region changes */
    onRegionChanged(fn) {
      listeners.push(fn);
    },
  };
}
