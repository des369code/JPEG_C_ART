/** Soft focus — Gaussian blur, missed autofocus. */

export const effect = {
  id: 'soft-focus',
  name: 'Soft focus',
  category: 'focus',
  description: '↑ blurrier, like the camera missed focus. ↓ slightly softer but still sharp.',
  defaultStrength: 25,

  apply(ctx, width, height, region, strength) {
    const radius = (strength / 100) * 8;
    if (radius < 0.2) return;

    const { x, y, w, h } = region;
    const temp = document.createElement('canvas');
    temp.width = w;
    temp.height = h;
    const tctx = temp.getContext('2d');
    tctx.putImageData(ctx.getImageData(x, y, w, h), 0, 0);
    tctx.filter = `blur(${radius}px)`;
    tctx.drawImage(temp, 0, 0);
    tctx.filter = 'none';
    ctx.putImageData(tctx.getImageData(0, 0, w, h), x, y);
  },
};
