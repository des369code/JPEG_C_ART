/** ISO grain — high-ISO luminance noise (monochromatic for realism). */

import { clamp } from '../utils.js';

export const effect = {
  id: 'iso-grain',
  name: 'ISO grain',
  category: 'sensor',
  description: 'High-ISO luminance noise from the camera sensor.',
  defaultStrength: 50,

  apply(ctx, width, height, region, strength) {
    const intensity = (strength / 100) * 0.35;
    if (intensity <= 0) return;

    const { x, y, w, h } = region;
    const imageData = ctx.getImageData(x, y, w, h);
    const data = imageData.data;

    for (let i = 0; i < data.length; i += 4) {
      // Monochromatic noise — same random offset for R, G, B
      const noise = (Math.random() - 0.5) * intensity * 255;
      data[i]     = clamp(data[i]     + noise, 0, 255);
      data[i + 1] = clamp(data[i + 1] + noise, 0, 255);
      data[i + 2] = clamp(data[i + 2] + noise, 0, 255);
    }

    ctx.putImageData(imageData, x, y);
  },
};
