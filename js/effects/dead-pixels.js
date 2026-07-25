/** Dead/hot pixels — stuck sensor pixels. */

import { clamp } from '../utils.js';

export const effect = {
  id: 'dead-pixels',
  name: 'Dead/hot pixels',
  category: 'sensor',
  description: '↑ more tiny bright or dark dots stuck on the image. ↓ fewer dots.',
  defaultStrength: 20,

  apply(ctx, width, height, region, strength) {
    const count = Math.round((strength / 100) * 30);
    if (count <= 0) return;

    const { x, y, w, h } = region;
    const imageData = ctx.getImageData(x, y, w, h);
    const data = imageData.data;

    for (let n = 0; n < count; n++) {
      const px = Math.floor(Math.random() * w);
      const py = Math.floor(Math.random() * h);
      const i = (py * w + px) * 4;
      const isHot = Math.random() > 0.3;

      if (isHot) {
        data[i]     = 240 + Math.random() * 15;
        data[i + 1] = 220 + Math.random() * 35;
        data[i + 2] = 200 + Math.random() * 55;
      } else {
        data[i]     = Math.random() * 10;
        data[i + 1] = Math.random() * 10;
        data[i + 2] = Math.random() * 10;
      }
    }

    ctx.putImageData(imageData, x, y);
  },
};
