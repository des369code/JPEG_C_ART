/**
 * Dynamic range stretch — reintroduces genuine highlight/shadow clipping.
 *
 * Documented finding (McCloskey & Albright 2018, subsequent forensics work):
 * generator output tends to be internally normalized, which compresses the
 * intensity range and removes true under/overexposed pixels. Real iPhone
 * shots almost always have SOME region that's genuinely blown out (sky,
 * window, specular highlight) or genuinely crushed to black (deep shadow).
 * Generated images often sit entirely within a "safe" mid-range even when
 * they look contrasty.
 *
 * This effect finds the histogram extremes from luminance and stretches
 * them to true 0 and 255, scaling R, G, B proportionally to preserve
 * chrominance ratios — fixing the per-channel color shift present in
 * simpler implementations that stretch each channel independently.
 *
 * Algorithm:
 *   1. Build BT.601 luminance histogram.
 *   2. Find black/white points from percentile tails.
 *   3. For each pixel: convert RGB → YCbCr, stretch Y, keep Cb/Cr,
 *      convert back. Chrominance channels pass through untouched,
 *      avoiding division-by-small-number and per-channel clamp skew.
 */

import { clamp, rgbToYCbCr, ycbcrToRgb } from '../utils.js';

export const effect = {
  id: 'dynamic-range',
  name: 'Dynamic range stretch',
  category: 'color',
  description: 'Clips a small percentile of highlights/shadows to true white/black.',
  defaultStrength: 30,

  extraParams: {
    percentile: { label: 'Clip percentile', min: 0.05, max: 2, step: 0.05, default: 0.3, unit: '%' },
  },

  apply(ctx, width, height, region, strength, extraParams = {}) {
    const amount = strength / 100;
    if (amount <= 0) return;

    const percentile = (extraParams.percentile ?? 0.3) / 100;
    const { x, y, w, h } = region;
    const imageData = ctx.getImageData(x, y, w, h);
    const data = imageData.data;
    const pixelCount = w * h;

    // --- 1. Build luminance histogram (BT.601) ---
    const hist = new Uint32Array(256);
    for (let i = 0; i < data.length; i += 4) {
      const lum = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
      hist[lum]++;
    }

    // --- 2. Find black/white points from histogram tails ---
    const clipCount = Math.max(1, Math.round(pixelCount * percentile));
    let blackPoint = 0;
    let acc = 0;
    for (let v = 0; v < 256; v++) {
      acc += hist[v];
      if (acc >= clipCount) { blackPoint = v; break; }
    }
    let whitePoint = 255;
    acc = 0;
    for (let v = 255; v >= 0; v--) {
      acc += hist[v];
      if (acc >= clipCount) { whitePoint = v; break; }
    }
    if (whitePoint <= blackPoint) return; // degenerate histogram

    const range = whitePoint - blackPoint;

    // --- 3. YCbCr luminance-first stretch ---
    // Convert to YCbCr, stretch only Y, keep Cb/Cr untouched.
    // This avoids the division-by-small-number and per-channel
    // clamp skew that a multiplicative RGB ratio would introduce.
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i], g = data[i + 1], b = data[i + 2];

      const { y: oldLum, cb, cr } = rgbToYCbCr(r, g, b);

      // Stretched luminance (linear levels operation)
      const newLum = clamp(((oldLum - blackPoint) / range) * 255, 0, 255);

      // Blend between original and stretched based on strength
      const blendedLum = oldLum + (newLum - oldLum) * amount;

      const out = ycbcrToRgb(blendedLum, cb, cr);
      data[i]     = clamp(Math.round(out.r), 0, 255);
      data[i + 1] = clamp(Math.round(out.g), 0, 255);
      data[i + 2] = clamp(Math.round(out.b), 0, 255);
    }

    ctx.putImageData(imageData, x, y);
  },
};
