/**
 * Split toning — iPhone's signature cool-blue shadows + warm-golden
 * highlights, mapped per-pixel by luminance.
 *
 * Real iPhone photos have a characteristic color signature: shadows
 * lean cool (blue-cyan) and highlights lean warm (golden-amber). This
 * is baked in by Apple's ISP and is absent from AI-generated images,
 * which apply globally uniform color balance across the tonal range.
 *
 * This effect blends between a shadow tint and a highlight tint based
 * on each pixel's BT.601 luminance, with a configurable balance point
 * controlling where the crossover happens.
 *
 * Algorithm:
 *   1. Compute luminance per pixel.
 *   2. Map luminance to a blend factor via smoothstep around the balance.
 *   3. Mix shadow tint (cool blue) and highlight tint (warm golden).
 *   4. Overlay-blend the tint onto the original pixel at strength opacity.
 */

import { clamp, computeSkinMask } from '../utils.js';

export const effect = {
  id: 'split-toning',
  name: 'Split toning',
  category: 'color',
  description: 'Cool-blue shadows + warm-golden highlights — iPhone\'s tonal color signature.',
  defaultStrength: 30,

  extraParams: {
    balance: { label: 'Balance', min: 10, max: 90, step: 1, default: 50, unit: '%' },
  },

  apply(ctx, width, height, _region, strength, extraParams = {}) {
    const opacity = strength / 100; // 0–1, maps to tint blend amount
    if (opacity <= 0) return;

    // Balance as a luminance value (0–255). 50% balance = lum 128.
    const balanceLum = ((extraParams.balance ?? 50) / 100) * 255;

    const imageData = ctx.getImageData(0, 0, width, height);
    const data = imageData.data;

    // Precompute skin-tone protection mask
    const skinMask = computeSkinMask(imageData);

    // Shadow tint: cool deep blue (R:20, G:50, B:120)
    // Highlight tint: warm golden (R:255, G:210, B:140)
    const SHADOW_R = 20,  SHADOW_G = 50,  SHADOW_B = 120;
    const HILITE_R = 255, HILITE_G = 210, HILITE_B = 140;

    // Width of the crossover zone in luminance units.
    // Smaller = sharper transition; 40 gives a smooth blend.
    const TRANSITION = 40;

    for (let i = 0, mi = 0; i < data.length; i += 4, mi++) {
      const r = data[i], g = data[i + 1], b = data[i + 2];

      // BT.601 luminance
      const lum = 0.299 * r + 0.587 * g + 0.114 * b;

      // Smoothstep blend factor: 0 = full shadow, 1 = full highlight
      const raw = (lum - balanceLum) / TRANSITION;
      const t = clamp(raw * 0.5 + 0.5, 0, 1);

      // Interpolate tint color
      const tintR = SHADOW_R + (HILITE_R - SHADOW_R) * t;
      const tintG = SHADOW_G + (HILITE_G - SHADOW_G) * t;
      const tintB = SHADOW_B + (HILITE_B - SHADOW_B) * t;

      // Overlay blend: the tint is applied more strongly where the
      // original pixel is midtone, less in extremes, so it doesn't
      // overwhelm shadows or blow out highlights.
      const overlayR = overlayBlend(r, tintR);
      const overlayG = overlayBlend(g, tintG);
      const overlayB = overlayBlend(b, tintB);

      // Skin protection: reduce tint on faces by 60%.
      // Softer than chroma-noise (70%) — some warmth on skin is natural.
      const protection = 1.0 - skinMask[mi] * 0.6;

      // Mix with original at opacity
      data[i]     = clamp(r + (overlayR - r) * opacity * 0.4 * protection, 0, 255);
      data[i + 1] = clamp(g + (overlayG - g) * opacity * 0.4 * protection, 0, 255);
      data[i + 2] = clamp(b + (overlayB - b) * opacity * 0.4 * protection, 0, 255);
    }

    ctx.putImageData(imageData, 0, 0);
  },
};

/**
 * Photoshop-style overlay blend on a single channel (0–255).
 * Overlay multiplies or screens depending on whether the base is
 * below or above mid-gray.
 */
function overlayBlend(base, blend) {
  const b = base / 255;
  const t = blend / 255;
  if (b < 0.5) {
    return (2 * b * t) * 255;
  }
  return (1 - 2 * (1 - b) * (1 - t)) * 255;
}
