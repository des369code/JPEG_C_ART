/** Pipeline runner: applies enabled effects in registry order. */

import { registry } from './registry.js';
import { clamp } from '../utils.js';

const OUTPUT_QUALITY = 0.92;

/**
 * Apply all enabled effects to an image and return a JPEG blob.
 * @param {ImageData} imageData
 * @param {Set<string>} enabledIds
 * @param {Object<string, number>} strengths
 * @param {{x: number, y: number, w: number, h: number}} region
 * @returns {Promise<Blob>}
 */
export async function applyEffects(imageData, enabledIds, strengths, region) {
  const { width, height } = imageData;

  const rx = clamp(region.x, 0, width);
  const ry = clamp(region.y, 0, height);
  const rw = clamp(region.w, 1, width - rx);
  const rh = clamp(region.h, 1, height - ry);

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  ctx.putImageData(imageData, 0, 0);

  for (const effect of registry) {
    if (!enabledIds.has(effect.id)) continue;
    const strength = strengths[effect.id] ?? effect.defaultStrength;
    if (strength <= 0) continue;
    try {
      await effect.apply(ctx, width, height, { x: rx, y: ry, w: rw, h: rh }, strength);
    } catch (err) {
      console.error(`Effect "${effect.id}" failed:`, err);
    }
  }

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('toBlob returned null'))),
      'image/jpeg',
      OUTPUT_QUALITY
    );
  });
}
