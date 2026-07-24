/** Pipeline runner: applies enabled effects in registry order. */

import { registry } from './registry.js';
import { clamp } from '../utils.js';

const OUTPUT_QUALITY = 0.92;

/**
 * Apply all enabled effects to an image and return a JPEG blob.
 * @param {ImageData} imageData
 * @param {Set<string>} enabledIds
 * @param {Object<string, number>} strengths
 * @param {Object<string, {x:number,y:number,w:number,h:number}>} regions — per-effect regions
 * @param {Object<string, Object>} [extraParams] — per-effect extra parameters (radius, threshold, etc.)
 * @returns {Promise<Blob>}
 */
export async function applyEffects(imageData, enabledIds, strengths, regions = {}, extraParams = {}) {
  const { width, height } = imageData;

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  ctx.putImageData(imageData, 0, 0);

  for (const effect of registry) {
    if (!enabledIds.has(effect.id)) continue;
    const strength = strengths[effect.id] ?? effect.defaultStrength;
    if (strength <= 0) continue;

    // Per-effect region with full-frame fallback
    const r = regions[effect.id] || { x: 0, y: 0, w: width, h: height };
    const rx = clamp(r.x, 0, width);
    const ry = clamp(r.y, 0, height);
    const rw = clamp(r.w, 1, width - rx);
    const rh = clamp(r.h, 1, height - ry);

    try {
      await effect.apply(ctx, width, height, { x: rx, y: ry, w: rw, h: rh }, strength, extraParams[effect.id]);
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
