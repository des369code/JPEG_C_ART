/**
 * Chroma noise — independent, spatially-correlated noise in the Cb/Cr
 * (color) channels, separate from luminance.
 *
 * Why this exists: real camera sensors produce noise that is NOT the same
 * in brightness and color. Because of how Bayer demosaicing works, color
 * noise ends up smoothed into small correlated blotches rather than
 * per-pixel static, and it is statistically independent from luminance
 * noise. `iso-grain.js` handles luminance noise (monochromatic, per-pixel).
 * This effect adds the missing piece: noise in hue/saturation itself.
 *
 * This directly targets a documented weak point of diffusion-model
 * output — LPIPS loss is ~4× more sensitive to luminance error than
 * chrominance error during training, so generated images have unnaturally
 * "clean" color statistics even when brightness/contrast looks convincing.
 *
 * Skin-tone protection: chroma noise is reduced on skin-toned pixels
 * (Oklch hue 22°–68°) to prevent unnatural color blotching on faces.
 */

import { clamp, computeSkinMask, rgbToYCbCr, ycbcrToRgb } from '../utils.js';

export const effect = {
  id: 'chroma-noise',
  name: 'Chroma noise',
  category: 'sensor',
  description: 'Correlated color-channel noise mimicking real sensor chrominance noise.',
  defaultStrength: 35,

  // JPEG 4:2:0 chroma subsampling averages every 2×2 Cb/Cr block, so
  // correlation below 2px is largely destroyed after export at quality 0.92.
  extraParams: {
    correlation: { label: 'Blotch size', min: 2, max: 6, step: 0.5, default: 3, unit: 'px' },
  },

  apply(ctx, width, height, region, strength, extraParams = {}) {
    const amount = (strength / 100) * 16; // compensates for subsampling loss at ≥2px
    if (amount <= 0) return;

    const correlation = extraParams.correlation ?? 2.5;
    const { x, y, w, h } = region;

    // --- 1. Build two independent spatially-correlated noise fields ---
    // (one for Cb, one for Cr) by drawing random noise to an offscreen
    // canvas and blurring it — this produces the soft color blotches
    // real sensors exhibit, instead of harsh per-pixel static.
    const noiseCanvas = document.createElement('canvas');
    noiseCanvas.width = w;
    noiseCanvas.height = h;
    const nctx = noiseCanvas.getContext('2d');
    const noiseImg = nctx.createImageData(w, h);
    const nd = noiseImg.data;

    for (let i = 0; i < nd.length; i += 4) {
      // R channel encodes Cb offset, G channel encodes Cr offset,
      // both centered at 128 (zero offset).
      nd[i]     = 128 + (Math.random() - 0.5) * 255;
      nd[i + 1] = 128 + (Math.random() - 0.5) * 255;
      nd[i + 2] = 128;
      nd[i + 3] = 255;
    }
    nctx.putImageData(noiseImg, 0, 0);
    nctx.filter = `blur(${correlation}px)`;
    nctx.drawImage(noiseCanvas, 0, 0);
    nctx.filter = 'none';
    const noiseData = nctx.getImageData(0, 0, w, h).data;

    // --- 2. Precompute skin-tone protection mask ---
    const regionImageData = ctx.getImageData(x, y, w, h);
    const skinMask = computeSkinMask(regionImageData);

    // --- 3. Apply noise in YCbCr space, leaving luminance untouched ---
    const data = regionImageData.data;

    for (let i = 0, mi = 0; i < data.length; i += 4, mi++) {
      const r = data[i], g = data[i + 1], b = data[i + 2];

      let { y: yy, cb, cr } = rgbToYCbCr(r, g, b);

      const cbOffset = (noiseData[i]     - 128) / 128; // -1..1
      const crOffset = (noiseData[i + 1] - 128) / 128;

      // Reduce noise on skin tones by 70%
      const protection = 1.0 - skinMask[mi] * 0.7;

      cb = clamp(cb + cbOffset * amount * protection, 0, 255);
      cr = clamp(cr + crOffset * amount * protection, 0, 255);

      const out = ycbcrToRgb(yy, cb, cr);
      data[i]     = clamp(out.r, 0, 255);
      data[i + 1] = clamp(out.g, 0, 255);
      data[i + 2] = clamp(out.b, 0, 255);
    }

    ctx.putImageData(regionImageData, x, y);
  },
};
