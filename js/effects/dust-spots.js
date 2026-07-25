/** Dust spots — sensor dust creating dark blurred spots. */

import { clamp } from '../utils.js';

export const effect = {
  id: 'dust-spots',
  name: 'Dust spots',
  category: 'sensor',
  description: '↑ more dark smudges and specks like dust on the lens. ↓ fewer, cleaner-looking spots.',
  defaultStrength: 25,

  apply(ctx, width, height, region, strength) {
    const count = Math.round((strength / 100) * 8);
    if (count <= 0) return;

    const { x, y, w, h } = region;

    for (let n = 0; n < count; n++) {
      const sx = x + Math.random() * w;
      const sy = y + Math.random() * h;
      const radius = 3 + Math.random() * 12;
      const opacity = 0.03 + Math.random() * 0.10 * (strength / 100);

      const grad = ctx.createRadialGradient(sx, sy, radius * 0.2, sx, sy, radius);
      grad.addColorStop(0, `rgba(20,20,20,${opacity})`);
      grad.addColorStop(0.4, `rgba(30,30,30,${opacity * 0.7})`);
      grad.addColorStop(1, 'rgba(0,0,0,0)');

      ctx.fillStyle = grad;
      ctx.fillRect(sx - radius, sy - radius, radius * 2, radius * 2);
    }
  },
};
