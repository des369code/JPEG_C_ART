/** Motion blur — directional shutter drag. */

import { clamp } from '../utils.js';

export const effect = {
  id: 'motion-blur',
  name: 'Motion blur',
  category: 'focus',
  description: '↑ longer motion trails from camera shake. ↓ shorter trails.',
  defaultStrength: 30,

  apply(ctx, width, height, region, strength) {
    const maxOffset = (strength / 100) * 8;
    if (maxOffset < 0.2) return;

    const { x, y, w, h } = region;
    const angle = Math.random() * Math.PI * 2;
    const dx = Math.cos(angle) * maxOffset;
    const dy = Math.sin(angle) * maxOffset;

    const regionData = ctx.getImageData(x, y, w, h);
    const offCanvas = document.createElement('canvas');
    offCanvas.width = w;
    offCanvas.height = h;
    const offCtx = offCanvas.getContext('2d');
    offCtx.putImageData(regionData, 0, 0);

    const passes = 10;
    ctx.globalAlpha = 1 / passes;
    for (let i = 0; i < passes; i++) {
      const t = i / (passes - 1);
      ctx.drawImage(offCanvas, x + Math.round(dx * t), y + Math.round(dy * t));
    }
    ctx.globalAlpha = 1;
  },
};
