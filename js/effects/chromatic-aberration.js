/** Chromatic aberration — R/G/B channel scaling offset (lateral CA). */

export const effect = {
  id: 'chromatic-aberration',
  name: 'Chromatic aberration',
  category: 'lens',
  description: '↑ more rainbow-coloured edges around objects. ↓ cleaner, less colourful edges.',
  defaultStrength: 40,

  apply(ctx, width, height, _region, strength) {
    const scale = 1 + (strength / 100) * 0.008; // 1.0 to 1.008
    if (scale <= 1.001) return;

    const imageData = ctx.getImageData(0, 0, width, height);
    const src = imageData.data;
    const cx = width / 2;
    const cy = height / 2;

    // Create output buffer
    const outCtx = document.createElement('canvas').getContext('2d');
    const outCanvas = outCtx.canvas;
    outCanvas.width = width;
    outCanvas.height = height;
    const outData = outCtx.createImageData(width, height);
    const dst = outData.data;

    // Fill with original first
    dst.set(src);

    // Shift red outward (scale > 1), blue inward (scale < 1)
    for (let py = 0; py < height; py++) {
      for (let px = 0; px < width; px++) {
        const dx = px - cx;
        const dy = py - cy;

        // Red channel: scale outward
        const rx = Math.round(cx + dx * scale);
        const ry = Math.round(cy + dy * scale);
        if (rx >= 0 && rx < width && ry >= 0 && ry < height) {
          const si = (py * width + px) * 4;
          const di = (ry * width + rx) * 4;
          dst[di] = src[si]; // Red
        }

        // Blue channel: scale inward
        const invScale = 2 - scale; // mirror: 1.0->1.0, 1.008->0.992
        const bx = Math.round(cx + dx * invScale);
        const by = Math.round(cy + dy * invScale);
        if (bx >= 0 && bx < width && by >= 0 && by < height) {
          const si = (py * width + px) * 4;
          const bi = (by * width + bx) * 4;
          dst[bi + 2] = src[si + 2]; // Blue
        }
      }
    }

    ctx.putImageData(outData, 0, 0);
  },
};
