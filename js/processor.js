/** JPEG artifact engine: encode->decode->re-encode cycle via Canvas API */

import { qualityFromStrength, clamp } from './utils.js';

/** Quality for final output (non-artifact areas). */
const OUTPUT_QUALITY = 0.92;

/**
 * Apply JPEG artifacts to a region of the image.
 *
 * Mechanism: Extract the region → re-encode it at low JPEG quality →
 * decode the degraded version → composite it back onto the original →
 * encode the full image at normal quality.
 *
 * @param {ImageData} imageData — full image pixel data
 * @param {{x: number, y: number, w: number, h: number}} region
 * @param {number} strength — 0 to 100
 * @returns {Promise<Blob>} — JPEG blob with artifacts
 */
export async function applyArtifacts(imageData, region, strength) {
  const { width, height } = imageData;

  // Clamp region to image bounds
  const rx = clamp(region.x, 0, width);
  const ry = clamp(region.y, 0, height);
  const rw = clamp(region.w, 1, width - rx);
  const rh = clamp(region.h, 1, height - ry);

  // Step 1: Draw original to a full canvas
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  ctx.putImageData(imageData, 0, 0);

  if (strength <= 0) {
    // No artifacts — just return the original re-encoded at output quality
    return canvasToBlob(canvas, OUTPUT_QUALITY);
  }

  // Step 2: Extract the region into a sub-canvas
  const regionCanvas = document.createElement('canvas');
  regionCanvas.width = rw;
  regionCanvas.height = rh;
  const regionCtx = regionCanvas.getContext('2d');
  regionCtx.drawImage(canvas, rx, ry, rw, rh, 0, 0, rw, rh);

  // Step 3: Re-encode the region at low quality → get back a degraded JPEG blob
  const artifactQuality = qualityFromStrength(strength);
  const degradedBlob = await canvasToBlob(regionCanvas, artifactQuality);

  // Step 4: Decode the degraded region back
  const degradedImage = await blobToImage(degradedBlob);

  // Step 5: Paste degraded region onto the original
  ctx.drawImage(degradedImage, rx, ry, rw, rh);

  // Step 6: Encode final composite at output quality
  return canvasToBlob(canvas, OUTPUT_QUALITY);
}

/**
 * Convert a canvas to a JPEG blob at the given quality.
 * @param {HTMLCanvasElement} canvas
 * @param {number} quality — 0.0 to 1.0
 * @returns {Promise<Blob>}
 */
function canvasToBlob(canvas, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error('Canvas toBlob returned null'));
      },
      'image/jpeg',
      quality
    );
  });
}

/**
 * Decode a JPEG blob into an HTMLImageElement.
 * @param {Blob} blob
 * @returns {Promise<HTMLImageElement>}
 */
function blobToImage(blob) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to decode JPEG blob'));
    };
    img.src = url;
  });
}

/**
 * Get a Blob from an ImageData by drawing it to a canvas and encoding.
 * @param {ImageData} imageData
 * @param {number} quality
 * @returns {Promise<Blob>}
 */
export function imageDataToBlob(imageData, quality = OUTPUT_QUALITY) {
  const canvas = document.createElement('canvas');
  canvas.width = imageData.width;
  canvas.height = imageData.height;
  const ctx = canvas.getContext('2d');
  ctx.putImageData(imageData, 0, 0);
  return canvasToBlob(canvas, quality);
}
