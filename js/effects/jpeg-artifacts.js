/** JPEG compression artifacts — encode->decode->re-encode cycle. */

import { qualityFromStrength, clamp } from '../utils.js';

export const effect = {
  id: 'jpeg-artifacts',
  name: 'JPEG artifacts',
  category: 'compression',
  description: '↑ heavier compression blocking, ringing, and colour banding. ↓ subtler artifacts.',
  defaultStrength: 50,

  async apply(ctx, width, height, region, strength) {
    const quality = qualityFromStrength(strength);
    if (quality >= 0.99) return;

    const { x, y, w, h } = region;

    // Extract region
    const regionData = ctx.getImageData(x, y, w, h);
    const regionCanvas = document.createElement('canvas');
    regionCanvas.width = w;
    regionCanvas.height = h;
    const rctx = regionCanvas.getContext('2d');
    rctx.putImageData(regionData, 0, 0);

    // Encode at low quality
    const degradedBlob = await new Promise((resolve) => {
      regionCanvas.toBlob(resolve, 'image/jpeg', quality);
    });

    // Decode back
    const degradedImg = await new Promise((resolve, reject) => {
      const url = URL.createObjectURL(degradedBlob);
      const img = new Image();
      img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('decode failed')); };
      img.src = url;
    });

    // Paste degraded region back
    ctx.drawImage(degradedImg, x, y, w, h);
  },
};
