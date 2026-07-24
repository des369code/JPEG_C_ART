/** Vignetting — radial darkening toward image corners. */

export const effect = {
  id: 'vignetting',
  name: 'Vignetting',
  category: 'lens',
  description: 'Gradual darkening toward the edges and corners of the frame.',
  defaultStrength: 35,

  apply(ctx, width, height, _region, strength) {
    const opacity = strength / 100;
    if (opacity <= 0) return;

    const cx = width / 2;
    const cy = height / 2;
    const maxR = Math.sqrt(cx * cx + cy * cy);

    const gradient = ctx.createRadialGradient(cx, cy, maxR * 0.4, cx, cy, maxR);
    gradient.addColorStop(0, 'rgba(0,0,0,0)');
    gradient.addColorStop(1, `rgba(0,0,0,${opacity * 0.85})`);

    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);
  },
};
