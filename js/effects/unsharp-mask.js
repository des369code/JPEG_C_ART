/** Unsharp mask / acutance — edge contrast enhancement.
 *
 *  Algorithm:
 *    1. Gaussian-blur the region at the given radius.
 *    2. Subtract blurred from original → edge map (high-frequency detail).
 *    3. Add the edge map back onto the original, scaled by amount,
 *       only where the local luminance contrast exceeds the threshold.
 *
 *  Parameters:
 *    Amount    (0–200%) — strength of the contrast boost at edges.
 *    Radius    (0.5–5 px) — halo spread width. Small = fine detail,
 *                large = broader "clarity" look.
 *    Threshold (0–50) — minimum luminance difference before sharpening
 *                engages, so flat areas like sky stay smooth.
 */

import { clamp } from '../utils.js';

export const effect = {
  id: 'unsharp-mask',
  name: 'Unsharp mask',
  category: 'sharpening',
  description: 'Edge contrast enhancement — digital acutance and sharpening.',
  defaultStrength: 40,       // conservative: 40 → 80% amount

  /** Extra per-effect controls rendered as additional sliders. */
  extraParams: {
    radius:    { label: 'Radius',    min: 0.5, max: 5, step: 0.1, default: 1.5, unit: 'px' },
    threshold: { label: 'Threshold', min: 0,   max: 50, step: 1,  default: 2,   unit: '' },
  },

  /**
   * @param {CanvasRenderingContext2D} ctx
   * @param {number} width  — canvas width
   * @param {number} height — canvas height
   * @param {{x:number,y:number,w:number,h:number}} region
   * @param {number} strength — 0–100, mapped to 0–200 % amount internally
   * @param {Object} [extraParams] — { radius: number, threshold: number }
   */
  apply(ctx, width, height, region, strength, extraParams = {}) {
    // Strength 0–100 maps to amount 0–200 %
    const amount = (strength / 100) * 200;
    const radius = extraParams.radius ?? 1.5;
    const threshold = extraParams.threshold ?? 2;

    if (amount <= 0 || radius < 0.3) return;

    const { x, y, w, h } = region;

    // --- 1. Extract original region pixels ---------------------------
    const origData = ctx.getImageData(x, y, w, h);

    // --- 2. Create Gaussian-blurred copy via canvas filter -----------
    const tmp = document.createElement('canvas');
    tmp.width = w;
    tmp.height = h;
    const tctx = tmp.getContext('2d');
    tctx.putImageData(origData, 0, 0);
    tctx.filter = `blur(${radius}px)`;
    tctx.drawImage(tmp, 0, 0);
    tctx.filter = 'none';
    const blurData = tctx.getImageData(0, 0, w, h);

    // --- 3. Unsharp mask blend --------------------------------------
    const orig = origData.data;
    const blur = blurData.data;
    const scale = amount / 100; // e.g. 80% → 0.8

    for (let i = 0; i < orig.length; i += 4) {
      const dr = orig[i]     - blur[i];
      const dg = orig[i + 1] - blur[i + 1];
      const db = orig[i + 2] - blur[i + 2];

      // Perceptual luminance weight (BT.601)
      const lumDiff = 0.299 * dr + 0.587 * dg + 0.114 * db;

      if (Math.abs(lumDiff) > threshold) {
        orig[i]     = clamp(orig[i]     + dr * scale, 0, 255);
        orig[i + 1] = clamp(orig[i + 1] + dg * scale, 0, 255);
        orig[i + 2] = clamp(orig[i + 2] + db * scale, 0, 255);
      }
      // Alpha channel (i+3) unchanged
    }

    ctx.putImageData(origData, x, y);
  },
};
