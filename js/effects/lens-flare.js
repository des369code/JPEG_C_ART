/** Lens flare — ghost reflections and veiling haze from bright light sources. */

export const effect = {
  id: 'lens-flare',
  name: 'Lens flare',
  category: 'lens',
  description: 'Internal reflections creating ghosts and haze when shooting toward bright light.',
  defaultStrength: 30,

  apply(ctx, width, height, _region, strength) {
    const opacity = strength / 100;
    if (opacity <= 0) return;

    // Find brightest point (approximate flare source)
    const sampleStep = 20;
    let brightest = { x: width * 0.7, y: height * 0.3, value: 0 };
    const imgData = ctx.getImageData(0, 0, width, height);
    for (let y = 0; y < height; y += sampleStep) {
      for (let x = 0; x < width; x += sampleStep) {
        const i = (y * width + x) * 4;
        const v = imgData.data[i] + imgData.data[i + 1] + imgData.data[i + 2];
        if (v > brightest.value) {
          brightest = { x, y, value: v };
        }
      }
    }

    const cx = width / 2;
    const cy = height / 2;
    const sx = brightest.x;
    const sy = brightest.y;

    // Draw ghost reflections along the line through center from source
    const ghosts = [
      { dist: -0.3, r: 0.08, color: `rgba(255,200,150,${opacity * 0.15})` },
      { dist: -0.5, r: 0.04, color: `rgba(150,200,255,${opacity * 0.12})` },
      { dist: -0.65, r: 0.06, color: `rgba(255,180,100,${opacity * 0.10})` },
      { dist: 0.35, r: 0.05, color: `rgba(200,220,255,${opacity * 0.10})` },
      { dist: 0.55, r: 0.03, color: `rgba(255,220,180,${opacity * 0.08})` },
    ];

    for (const g of ghosts) {
      const gx = cx + (sx - cx) * g.dist;
      const gy = cy + (sy - cy) * g.dist;
      const gr = Math.min(width, height) * g.r;

      const grad = ctx.createRadialGradient(gx, gy, 0, gx, gy, gr);
      grad.addColorStop(0, g.color);
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = grad;
      ctx.fillRect(gx - gr, gy - gr, gr * 2, gr * 2);
    }

    // Veiling haze over entire image
    ctx.fillStyle = `rgba(255,245,230,${opacity * 0.06})`;
    ctx.fillRect(0, 0, width, height);
  },
};
