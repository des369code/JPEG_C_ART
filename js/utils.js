/** Shared helpers: magic bytes, clamp, quality formula, color-space utilities */

// ── Skin-tone hue range (Oklch, degrees) ──────────────────────────
// Human skin hue clusters in a narrow band across ethnicities because
// it is driven by melanin + hemoglobin absorption spectra.
// These defaults are based on published color science but should be
// calibrated against YOUR generated images — sample actual skin-tone
// pixels and verify they fall inside this range.
export const SKIN_HUE_MIN = 22;   // soft falloff starts here
export const SKIN_HUE_MAX = 68;   // soft falloff ends here
const SKIN_FALLOFF = 10;          // cosine transition width in degrees

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
/**
 * Precompute a skin-tone protection mask for an image region.
 *
 * Converts each pixel RGB → linear sRGB → Oklab → Oklch hue, then
 * checks against the skin hue range with soft cosine falloff at the
 * boundaries so there are no hard seams.
 *
 * @param {ImageData} imageData — region pixels (as returned by ctx.getImageData)
 * @returns {Float32Array} length = pixelCount:
 *    1.0 = full protection (reduce effect on this pixel)
 *    0.0 = no protection (apply effect normally)
 *
 * Performance: O(n) with one Oklab conversion per pixel. Call ONCE
 * per effect invocation, then index into the returned array in your
 * per-pixel loop — do NOT call this inside a loop.
 */
export function computeSkinMask(imageData) {
  const { data, width, height } = imageData;
  const pixelCount = width * height;
  const mask = new Float32Array(pixelCount);

  for (let i = 0, mi = 0; i < data.length; i += 4, mi++) {
    // ── sRGB → linear (gamma expansion) ──
    const r = srgbToLinear(data[i] / 255);
    const g = srgbToLinear(data[i + 1] / 255);
    const b = srgbToLinear(data[i + 2] / 255);

    // ── Linear sRGB → LMS ──
    const lVal = 0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b;
    const mVal = 0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b;
    const sVal = 0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b;

    // ── LMS → Oklab ──
    const lCbrt = Math.cbrt(lVal);
    const mCbrt = Math.cbrt(mVal);
    const sCbrt = Math.cbrt(sVal);

    const A = 1.9779984951 * lCbrt - 2.4285922050 * mCbrt + 0.4505937099 * sCbrt;
    const B = 0.0259040371 * lCbrt + 0.7827717662 * mCbrt - 0.8086757660 * sCbrt;

    // ── Oklab → Oklch hue (degrees) ──
    const hue = (Math.atan2(B, A) * 180) / Math.PI;
    const hue360 = hue < 0 ? hue + 360 : hue;

    // ── Soft skin mask with cosine falloff ──
    mask[mi] = skinMaskFactor(hue360);
  }

  return mask;
}

/** sRGB gamma expansion (component, 0–1). */
function srgbToLinear(c) {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

/**
 * Cosine-falloff skin protection factor for an Oklch hue.
 * Returns 0.0–1.0.
 */
function skinMaskFactor(hue) {
  if (hue >= SKIN_HUE_MIN && hue <= SKIN_HUE_MAX) return 1.0;
  if (hue < SKIN_HUE_MIN) {
    const d = SKIN_HUE_MIN - hue;
    if (d >= SKIN_FALLOFF) return 0.0;
    return 0.5 + 0.5 * Math.cos((Math.PI * d) / SKIN_FALLOFF);
  }
  // hue > SKIN_HUE_MAX
  const d = hue - SKIN_HUE_MAX;
  if (d >= SKIN_FALLOFF) return 0.0;
  return 0.5 + 0.5 * Math.cos((Math.PI * d) / SKIN_FALLOFF);
}

export function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1_048_576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1_048_576).toFixed(1)} MB`;
}
