/**
 * Vibrance — smart saturation boost in Oklab color space.
 *
 * Unlike uniform saturation (which pushes all colors equally and can
 * turn skin orange or make already-vivid colors garish), vibrance
 * targets only muted/desaturated colors and leaves saturated colors
 * and skin tones alone.
 *
 * This is how iPhone's "vibrance" / perceptual color rendering works —
 * it selectively pulls gray-ish colors toward vividness without
 * over-saturating what's already colorful.
 *
 * Algorithm:
 *   1. Precompute skin-tone mask (Oklch hue 22°–68° with falloff).
 *   2. Per-pixel: RGB → linear sRGB → Oklab.
 *   3. Compute chroma = sqrt(a² + b²).
 *   4. Boost factor: inversely proportional to current chroma.
 *      Gray pixels (chroma ≈ 0) get full boost.
 *      Already-vivid pixels get minimal/no boost.
 *      Skin-toned pixels get reduced boost (×0.2 when fully in skin range).
 *   5. Scale a, b by boost factor, convert back.
 */

import { clamp, computeSkinMask } from '../utils.js';

export const effect = {
  id: 'vibrance',
  name: 'Vibrance',
  category: 'color',
  description: 'Smart saturation boost — targets muted colors, protects skin tones and vivid hues.',
  defaultStrength: 35,

  apply(ctx, width, height, region, strength) {
    const amount = (strength / 100) * 2.5; // 0–2.5× max chroma boost
    if (amount <= 0) return;

    const { x, y, w, h } = region;
    const imageData = ctx.getImageData(x, y, w, h);
    const data = imageData.data;

    // Precompute skin mask once
    const skinMask = computeSkinMask(imageData);

    // Reference chroma — above this, no boost is applied.
    // 0.22 in Oklab corresponds to a reasonably saturated sRGB color.
    const REF_CHROMA = 0.22;

    for (let i = 0, mi = 0; i < data.length; i += 4, mi++) {
      const r = data[i], g = data[i + 1], b = data[i + 2];

      // ── sRGB → linear ──
      const lr = srgbToLinear(r / 255);
      const lg = srgbToLinear(g / 255);
      const lb = srgbToLinear(b / 255);

      // ── Linear sRGB → LMS ──
      const lVal = 0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb;
      const mVal = 0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb;
      const sVal = 0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb;

      // ── LMS → Oklab ──
      const lCbrt = Math.cbrt(lVal);
      const mCbrt = Math.cbrt(mVal);
      const sCbrt = Math.cbrt(sVal);

      const L = 0.2104542553 * lCbrt + 0.7936177850 * mCbrt - 0.0040720468 * sCbrt;
      let   A = 1.9779984951 * lCbrt - 2.4285922050 * mCbrt + 0.4505937099 * sCbrt;
      let   B = 0.0259040371 * lCbrt + 0.7827717662 * mCbrt - 0.8086757660 * sCbrt;

      // ── Chroma and boost ──
      const chroma = Math.sqrt(A * A + B * B);
      const saturated = Math.min(chroma / REF_CHROMA, 1.0); // 0 = gray, 1 = vivid+
      const desatFactor = 1.0 - saturated;                    // 1 = gray, 0 = vivid

      // Skin protection: reduce boost on skin tones by 80%
      const skinProtection = 1.0 - skinMask[mi] * 0.8;

      const boost = 1.0 + amount * desatFactor * skinProtection;

      // ── Scale a, b ──
      A *= boost;
      B *= boost;

      // ── Oklab → LMS → linear sRGB ──
      const lCbrt2 = Math.cbrt(L + 0.3963377774 * A + 0.2158037573 * B);
      const mCbrt2 = Math.cbrt(L - 0.1055613458 * A - 0.0638541728 * B);
      const sCbrt2 = Math.cbrt(L - 0.0894841775 * A - 1.2914855480 * B);

      let lr2 = lCbrt2 * lCbrt2 * lCbrt2;
      let lg2 = mCbrt2 * mCbrt2 * mCbrt2;
      let lb2 = sCbrt2 * sCbrt2 * sCbrt2;

      // LMS → linear sRGB (boosted)
      let lr3 =  4.0767416621 * lr2 - 3.3077115913 * lg2 + 0.2309699292 * lb2;
      let lg3 = -1.2684380046 * lr2 + 2.6097574011 * lg2 - 0.3413193965 * lb2;
      let lb3 = -0.0041960863 * lr2 - 0.7034186147 * lg2 + 1.7076147010 * lb2;

      // ── Gamut safety: if boosted color exceeds sRGB gamut, smoothly
      //     interpolate back toward the original to stay in range.
      //     This prevents harsh clamping artifacts on already-saturated colors.
      let gamutT = 1.0; // 1 = fully boosted, 0 = original
      if (lr3 < 0 || lg3 < 0 || lb3 < 0) {
        // At least one channel went negative — find safe blend factor
        if (lr3 < 0) gamutT = Math.min(gamutT, lr / (lr - lr3));
        if (lg3 < 0) gamutT = Math.min(gamutT, lg / (lg - lg3));
        if (lb3 < 0) gamutT = Math.min(gamutT, lb / (lb - lb3));
      }
      if (lr3 > 1 || lg3 > 1 || lb3 > 1) {
        if (lr3 > 1) gamutT = Math.min(gamutT, (1 - lr) / (lr3 - lr));
        if (lg3 > 1) gamutT = Math.min(gamutT, (1 - lg) / (lg3 - lg));
        if (lb3 > 1) gamutT = Math.min(gamutT, (1 - lb) / (lb3 - lb));
      }
      gamutT = Math.max(gamutT, 0);

      lr3 = lr + (lr3 - lr) * gamutT;
      lg3 = lg + (lg3 - lg) * gamutT;
      lb3 = lb + (lb3 - lb) * gamutT;

      // Linear → sRGB (gamma compression)
      data[i]     = clamp(Math.round(linearToSrgb(lr3) * 255), 0, 255);
      data[i + 1] = clamp(Math.round(linearToSrgb(lg3) * 255), 0, 255);
      data[i + 2] = clamp(Math.round(linearToSrgb(lb3) * 255), 0, 255);
    }

    ctx.putImageData(imageData, x, y);
  },
};

/** sRGB gamma expansion (component, 0–1). */
function srgbToLinear(c) {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

/** sRGB gamma compression (component, 0–1). */
function linearToSrgb(c) {
  const clamped = c < 0 ? 0 : c;
  return clamped <= 0.0031308 ? 12.92 * clamped : 1.055 * Math.pow(clamped, 1 / 2.4) - 0.055;
}
