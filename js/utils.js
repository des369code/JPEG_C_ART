/** Shared helpers: magic bytes, clamp, quality formula */

const JPEG_MAGIC = new Uint8Array([0xff, 0xd8, 0xff]);
const MEGAPIXEL_THRESHOLD = 50_000_000; // 50 MP
const MEGABYTE_THRESHOLD = 50_000_000;  // 50 MB

/**
 * Check if an ArrayBuffer starts with JPEG magic bytes (FF D8 FF).
 * @param {ArrayBuffer} buffer
 * @returns {boolean}
 */
export function isJPEG(buffer) {
  if (buffer.byteLength < 3) return false;
  const head = new Uint8Array(buffer, 0, 3);
  return head[0] === JPEG_MAGIC[0]
      && head[1] === JPEG_MAGIC[1]
      && head[2] === JPEG_MAGIC[2];
}

/**
 * Convert artifact strength (0–100) to JPEG quality (1.0 → 0.01).
 * Strength 0 = quality 1.0 (no artifacts).
 * Strength 100 = quality 0.01 (maximum degradation).
 * @param {number} strength — 0 to 100
 * @returns {number} — quality 0.01 to 1.0
 */
export function qualityFromStrength(strength) {
  const s = clamp(strength, 0, 100);
  return 1.0 - (s / 100) * 0.99;
}

/**
 * Clamp a value between min and max (inclusive).
 * @param {number} value
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
export function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

/**
 * Check if image exceeds size thresholds. Returns warning string or null.
 * @param {number} width — image width in pixels
 * @param {number} height — image height in pixels
 * @param {number} byteSize — file size in bytes
 * @returns {string|null}
 */
export function warnIfLarge(width, height, byteSize) {
  const pixels = width * height;
  const warnings = [];
  if (pixels > MEGAPIXEL_THRESHOLD) {
    warnings.push(`${(pixels / 1_000_000).toFixed(1)} megapixels`);
  }
  if (byteSize > MEGABYTE_THRESHOLD) {
    warnings.push(`${(byteSize / 1_000_000).toFixed(1)} MB`);
  }
  if (warnings.length === 0) return null;
  return `Large image (${warnings.join(", ")}). Processing may be slow. Continue?`;
}

/**
 * Format bytes into a human-readable string.
 * @param {number} bytes
 * @returns {string}
 */
export function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1_048_576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1_048_576).toFixed(1)} MB`;
}
