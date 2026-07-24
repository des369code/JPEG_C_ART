/** Edge softness — increasing blur toward edges (field curvature / astigmatism). */

export const effect = {
  id: 'edge-softness',
  name: 'Edge softness',
  category: 'lens',
  description: 'Progressive blur toward frame edges from lens field curvature.',
  defaultStrength: 40,

  apply(ctx, width, height, _region, strength) {
    const maxRadius = (strength / 100) * 6;
    if (maxRadius < 0.2) return;

    // Create blurred copy
    const blurCanvas = document.createElement('canvas');
    blurCanvas.width = width;
    blurCanvas.height = height;
    const bctx = blurCanvas.getContext('2d');
    bctx.putImageData(ctx.getImageData(0, 0, width, height), 0, 0);
    bctx.filter = `blur(${maxRadius}px)`;
    bctx.drawImage(blurCanvas, 0, 0);
    bctx.filter = 'none';

    // Radial mask: center = transparent (keep sharp), edges = opaque (use blurred)
    const cx = width / 2;
    const cy = height / 2;
    const maxR = Math.sqrt(cx * cx + cy * cy);
    const maskCanvas = document.createElement('canvas');
    maskCanvas.width = width;
    maskCanvas.height = height;
    const mctx = maskCanvas.getContext('2d');
    const gradient = mctx.createRadialGradient(cx, cy, maxR * 0.3, cx, cy, maxR);
    gradient.addColorStop(0, 'rgba(0,0,0,0)');
    gradient.addColorStop(1, 'rgba(0,0,0,1)');
    mctx.fillStyle = gradient;
    mctx.fillRect(0, 0, width, height);

    // Copy blurred onto original using mask as alpha
    const maskData = mctx.getImageData(0, 0, width, height);
    const blurData = bctx.getImageData(0, 0, width, height);
    const origData = ctx.getImageData(0, 0, width, height);
    const out = origData;

    for (let i = 0; i < maskData.data.length; i += 4) {
      const alpha = maskData.data[i + 3] / 255; // 0=sharp center, 1=blurred edge
      out.data[i]     = origData.data[i]     * (1 - alpha) + blurData.data[i]     * alpha;
      out.data[i + 1] = origData.data[i + 1] * (1 - alpha) + blurData.data[i + 1] * alpha;
      out.data[i + 2] = origData.data[i + 2] * (1 - alpha) + blurData.data[i + 2] * alpha;
    }

    ctx.putImageData(out, 0, 0);
  },
};
