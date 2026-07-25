/**
 * ISO grain — high-ISO luminance noise with signal-dependent amplitude.
 *
 * Real camera sensors exhibit photon shot noise: noise is stronger in
 * shadows (fewer photons = higher relative uncertainty) and weaker in
 * highlights (more photons = lower relative uncertainty). The shadowBias
 * parameter controls this behavior:
 *   - 0%  = flat noise (same amplitude everywhere, backward compatible)
 *   - 50% = default — shadows get full noise, highlights get half
 *   - 100% = pure photon shot noise model — highlights get zero noise
 */

import { clamp } from '../utils.js';

export const effect = {
  id: 'iso-grain',
  name: 'ISO grain',
  category: 'sensor',
  description: 'High-ISO luminance noise with signal-dependent shadow emphasis.',
  defaultStrength: 50,

  extraParams: {
    shadowBias: { label: 'Shadow bias', min: 0, max: 100, step: 5, default: 50, unit: '%' },
  },

  apply(ctx, width, height, region, strength, extraParams = {}) {
    const intensity = (strength / 100) * 0.35;
    if (intensity <= 0) return;

    const shadowBias = (extraParams.shadowBias ?? 50) / 100; // 0..1

    const { x, y, w, h } = region;
    const imageData = ctx.getImageData(x, y, w, h);
    const data = imageData.data;

    for (let i = 0; i < data.length; i += 4) {
      // Signal-dependent scaling: 1.0 at lum=0, (1.0-shadowBias) at lum=255
      let lumScale = 1.0;
      if (shadowBias > 0) {
        const lum = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
        lumScale = 1.0 - shadowBias * (lum / 255);
      }

      // Monochromatic noise — same random offset for R, G, B
      const noise = (Math.random() - 0.5) * intensity * 255 * lumScale;
      data[i]     = clamp(data[i]     + noise, 0, 255);
      data[i + 1] = clamp(data[i + 1] + noise, 0, 255);
      data[i + 2] = clamp(data[i + 2] + noise, 0, 255);
    }

    ctx.putImageData(imageData, x, y);
  },
};
