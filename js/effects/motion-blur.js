/** Motion blur — directional shutter drag. */

import { clamp } from '../utils.js';

export const effect = {
  id: 'motion-blur',
  name: 'Motion blur',
  category: 'focus',
  description: 'Directional blur from camera shake or slow shutter speed.',
  defaultStrength: 30,

  apply(ctx, width, height, region, strength) {
    const maxOffset = (strength / 100) * 8;
    if (maxOffset < 0.5) return;

    const { x, y, w, h } = region;
    const angle = Math.random() * Math.PI * 2;
    const dx = Math.cos(angle) * maxOffset;
    const dy = Math.sin(angle) * maxOffset;

    const regionData = ctx.getImageData(x, y, w, h);
    const passes = 10;
    ctx.globalAlpha = 1 / passes;
    for (let i = 0; i < passes; i++) {
      const t = i / (passes - 1);
      ctx.putImageData(regionData, x + Math.round(dx * t), y + Math.round(dy * t));
    }
    ctx.globalAlpha = 1;
  },
};
