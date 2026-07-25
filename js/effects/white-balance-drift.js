/**
 * White balance drift — directional, continuous color temperature gradient
 * across the frame, mimicking mixed real-world lighting.
 *
 * Real photos, especially indoors, are lit by more than one light source
 * (window daylight + tungsten lamp + phone screen glow, etc.). A camera's
 * auto white balance picks ONE correction for the whole frame, so different
 * areas end up slightly warm or cool relative to each other depending on
 * which light dominates there.
 *
 * Generated images apply one globally consistent color balance — this is
 * one of the more visually detectable "too coherent" tells.
 *
 * This effect applies a single directional gradient from cool (~6500K
 * daylight) on one side to warm (~3200K tungsten) on the opposite side,
 * with drift seeded randomly per application (direction varies between
 * horizontal, vertical, or diagonal). The gradient is continuous across
 * the frame, modeling real light falloff rather than scattered blobs.
 *
 * Skin-tone protection: gradient opacity is reduced by 50% on skin-toned
 * pixels to avoid unnatural color casts on faces.
 */

import { clamp, computeSkinMask } from '../utils.js';

export const effect = {
  id: 'white-balance-drift',
  name: 'White balance drift',
  category: 'color',
  description: '↑ stronger warm/cool colour cast across frame. ↓ subtler mixed-lighting effect.',
  defaultStrength: 25,

  apply(ctx, width, height, _region, strength) {
    const opacity = (strength / 100) * 0.08; // max 8% tint overlay
    if (opacity <= 0) return;

    // --- 1. Pick a random gradient direction ---
    // We map the gradient from a "cool" point to a "warm" point on the
    // perimeter. Direction is one of: left→right, top→bottom, or diagonal.
    const dir = Math.floor(Math.random() * 3);
    let coolX, coolY, warmX, warmY;
    switch (dir) {
      case 0: // horizontal: left (cool) → right (warm)
        coolX = 0;        coolY = height / 2;
        warmX = width;    warmY = height / 2;
        break;
      case 1: // vertical: top (cool window) → bottom (warm interior)
        coolX = width / 2;  coolY = 0;
        warmX = width / 2;  warmY = height;
        break;
      default: // diagonal: top-left (cool) → bottom-right (warm)
        coolX = 0;        coolY = 0;
        warmX = width;    warmY = height;
        break;
    }

    // --- 2. Get image data and precompute skin mask ---
    const imageData = ctx.getImageData(0, 0, width, height);
    const data = imageData.data;
    const skinMask = computeSkinMask(imageData);

    // Gradient direction vector and its squared length
    const dx = warmX - coolX;
    const dy = warmY - coolY;
    const lenSq = dx * dx + dy * dy;
    if (lenSq < 1) return;

    // Tint colors
    const COOL_R = 150, COOL_G = 190, COOL_B = 255; // daylight/shade ~6500K
    const WARM_R = 255, WARM_G = 190, WARM_B = 120; // tungsten ~3200K

    // --- 3. Apply per-pixel tint ---
    for (let i = 0, mi = 0; i < data.length; i += 4, mi++) {
      const px = (i / 4) % width;
      const py = Math.floor((i / 4) / width);

      // Project pixel position onto the gradient direction to get t (0..1)
      const proj = ((px - coolX) * dx + (py - coolY) * dy) / lenSq;
      const t = clamp(proj, 0, 1);

      // Interpolate tint color
      const tintR = COOL_R + (WARM_R - COOL_R) * t;
      const tintG = COOL_G + (WARM_G - COOL_G) * t;
      const tintB = COOL_B + (WARM_B - COOL_B) * t;

      // Skin protection: reduce opacity by 50% on skin-tone pixels
      const skinProtection = 1.0 - skinMask[mi] * 0.5;
      const alpha = opacity * skinProtection;

      // Soft-light-style blend: tint gently pushes the pixel toward the tint color
      data[i]     = clamp(Math.round(data[i]     + (tintR - data[i])     * alpha), 0, 255);
      data[i + 1] = clamp(Math.round(data[i + 1] + (tintG - data[i + 1]) * alpha), 0, 255);
      data[i + 2] = clamp(Math.round(data[i + 2] + (tintB - data[i + 2]) * alpha), 0, 255);
    }

    ctx.putImageData(imageData, 0, 0);
  },
};
