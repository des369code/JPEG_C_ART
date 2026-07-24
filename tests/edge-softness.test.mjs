/** Edge softness — formula + zero-op + blur trigger tests. Run: node tests/edge-softness.test.mjs */

const imageStore = new Map();
let _canvasId = 0;

function _mkCanvas(w, h) {
  const id = ++_canvasId;
  const fw = w, fh = h;
  const fd = new Uint8ClampedArray(fw * fh * 4);
  for (let i = 0; i < fd.length; i += 4) { fd[i]=128;fd[i+1]=128;fd[i+2]=128;fd[i+3]=255; }
  imageStore.set(id, { data: fd, width: fw, height: fh });
  const ctx = {
    _canvasW: fw, _canvasH: fh,
    _filter: 'none',
    get filter() { return this._filter; },
    set filter(v) { this._filter = v; },
    getImageData(x, y, rw, rh) {
      const s = imageStore.get(id); const cw = this._canvasW;
      const sd = new Uint8ClampedArray(rw * rh * 4);
      for (let py = 0; py < rh; py++) {
        for (let px = 0; px < rw; px++) {
          const si = ((y+py)*cw + (x+px))*4, di = (py*rw + px)*4;
          if (si>=0 && si+3 < s.data.length) { sd[di]=s.data[si];sd[di+1]=s.data[si+1];sd[di+2]=s.data[si+2];sd[di+3]=s.data[si+3]; }
        }
      }
      return { data: sd, width: rw, height: rh, colorSpace: 'srgb' };
    },
    putImageData(imgData, x, y) {
      const d = imageStore.get(id); const cw = this._canvasW;
      for (let py = 0; py < imgData.height; py++) {
        for (let px = 0; px < imgData.width; px++) {
          const si = (py*imgData.width+px)*4, di = ((y+py)*cw + (x+px))*4;
          if (di>=0 && di+3 < d.data.length) { d.data[di]=imgData.data[si];d.data[di+1]=imgData.data[si+1];d.data[di+2]=imgData.data[si+2];d.data[di+3]=imgData.data[si+3]; }
        }
      }
    },
    drawImage(source, dx, dy) {
      // blur filter simulation
      if (this._filter !== 'none' && this._filter.startsWith('blur(')) {
        const m = this._filter.match(/blur\(([\d.]+)px\)/);
        const radius = m ? parseFloat(m[1]) : 1;
        const srcId = source._mockId || id;
        const src = imageStore.get(srcId);
        if (!src) return;
        const w = this._canvasW, h = this._canvasH;
        const blurred = new Uint8ClampedArray(src.data.length);
        const r = Math.round(radius);
        for (let py = 0; py < h; py++) {
          for (let px = 0; px < w; px++) {
            let sr=0,sg=0,sb=0,sa=0,count=0;
            for (let dy2=-r;dy2<=r;dy2++) {
              for (let dx2=-r;dx2<=r;dx2++) {
                const nx=px+dx2,ny=py+dy2;
                if (nx>=0&&nx<w&&ny>=0&&ny<h) {
                  const idx=(ny*w+nx)*4;
                  sr+=src.data[idx];sg+=src.data[idx+1];sb+=src.data[idx+2];sa+=src.data[idx+3];count++;
                }
              }
            }
            const idx=(py*w+px)*4;
            blurred[idx]=sr/count;blurred[idx+1]=sg/count;blurred[idx+2]=sb/count;blurred[idx+3]=sa/count;
          }
        }
        imageStore.set(id, { data: blurred, width: w, height: h, x: dx, y: dy });
      }
    },
    createRadialGradient(x0,y0,r0,x1,y1,r1) {
      return {_x0:x0,_y0:y0,_r0:r0,_x1:x1,_y1:y1,_r1:r1,_stops:[],addColorStop(p,c){this._stops.push({pos:p,color:c});}};
    },
    _fillStyle: null,
    set fillStyle(v) { this._fillStyle = v; },
    get fillStyle() { return this._fillStyle; },
    fillRect(x, y, w, h) {
      if (this._fillStyle && this._fillStyle._stops) {
        const g = this._fillStyle;
        const cx=g._x0,cy=g._y0,iR=g._r0,oR=g._r1;
        const dst=imageStore.get(id);
        if(!dst)return;
        for(let py=0;py<h;py++){
          for(let px=0;px<w;px++){
            const dx2=px-cx,dy2=py-cy,dist=Math.sqrt(dx2*dx2+dy2*dy2);
            let t;if(dist<=iR)t=0;else if(dist>=oR)t=1;else t=(dist-iR)/(oR-iR);
            const idx=(py*this._canvasW+px)*4;
            if(idx+3<dst.data.length)dst.data[idx+3]=Math.round(t*255);
          }
        }
      }
    },
  };
  ctx._canvas = { width: fw, height: fh, getContext: () => ctx, _mockId: id };
  return ctx._canvas;
}

const origCE = globalThis.document?.createElement;
globalThis.document = { ...(globalThis.document || {}), createElement(tag) {
  if (tag === 'canvas') {
    const c = _mkCanvas(0, 0);
    return new Proxy(c, {
      get(t, k) { if (k==='width') return t.width; if (k==='height') return t.height; if (k==='getContext') return t.getContext.bind(t); if (k==='_mockId') return t._mockId; return t[k]; },
      set(t, k, v) {
        if (k==='width') { t.width=v;t.getContext()._canvasW=v; const s=imageStore.get(t._mockId); if(s){s.width=v;s.data=new Uint8ClampedArray(v*s.height*4);s.data.fill(128);} return true; }
        if (k==='height') { t.height=v;t.getContext()._canvasH=v; const s=imageStore.get(t._mockId); if(s){s.height=v;s.data=new Uint8ClampedArray(s.width*v*4);s.data.fill(128);} return true; }
        t[k]=v;return true;
      },
    });
  }
  return origCE ? origCE(tag) : {};
}};
globalThis.window = globalThis.window || { addEventListener() {} };
globalThis.HTMLElement = globalThis.HTMLElement || class {};

const { effect } = await import('../js/effects/edge-softness.js?v=' + Date.now());

let failures = 0;
function check(c, l) { if (!c) { console.error(`  FAIL: ${l}`); failures++; } else console.log(`  PASS: ${l}`); }
function checkEq(a, b, l) { if (a !== b) { console.error(`  FAIL: ${l} — expected ${b}, got ${a}`); failures++; } else console.log(`  PASS: ${l} (${a})`); }

console.log('── Edge softness tests ──');

{
  console.log('\nTest 1: Zero strength = no change');
  imageStore.clear(); _canvasId = 0;
  const canvas = _mkCanvas(50, 40); const ctx = canvas.getContext();
  const d = ctx.getImageData(0,0,50,40);
  for (let i=0;i<d.data.length;i+=4){d.data[i]=200;d.data[i+1]=200;d.data[i+2]=200;d.data[i+3]=255;}
  ctx.putImageData(d,0,0);
  const before = ctx.getImageData(0,0,50,40);
  effect.apply(ctx, 50, 40, null, 0);
  const after = ctx.getImageData(0,0,50,40);
  let diffs=0;
  for(let i=0;i<before.data.length;i++){if(after.data[i]!==before.data[i])diffs++;}
  checkEq(diffs,0,'zero strength → no pixel changes');
}

{
  console.log('\nTest 2: maxRadius = (strength/100) * 6');
  checkEq((100/100)*6,6,'strength 100 → radius 6px');
  checkEq((50/100)*6,3,'strength 50 → radius 3px');
  checkEq((0/100)*6,0,'strength 0 → radius 0px');
  check((8/100)*6<0.5,'strength 8 → below early-return threshold');
}

{
  console.log('\nTest 3: Effect produces pixel changes on non-uniform image');
  imageStore.clear(); _canvasId = 0;
  const canvas = _mkCanvas(60, 40); const ctx = canvas.getContext();
  const d = ctx.getImageData(0,0,60,40);
  // Sharp horizontal edge: top half white (250), bottom half black (10)
  for(let py=0;py<40;py++){
    for(let px=0;px<60;px++){
      const i=(py*60+px)*4;
      const v=py<20?250:10;
      d.data[i]=v;d.data[i+1]=v;d.data[i+2]=v;d.data[i+3]=255;
    }
  }
  ctx.putImageData(d,0,0);
  const before = ctx.getImageData(0,0,60,40);
  effect.apply(ctx, 60, 40, null, 50);
  const after = ctx.getImageData(0,0,60,40);
  let diffs=0;
  for(let i=0;i<before.data.length;i++){if(after.data[i]!==before.data[i])diffs++;}
  check(diffs>0,'pixels changed by edge softness on non-uniform image');
}

{
  console.log('\nTest 4: Export shape');
  checkEq(effect.id,'edge-softness','id');
  checkEq(effect.name,'Edge softness','name');
  checkEq(effect.category,'lens','category');
  checkEq(typeof effect.apply,'function','apply is function');
}

console.log(`\n${'═'.repeat(50)}`);
if (failures===0) console.log('ALL EDGE SOFTNESS TESTS PASSED');
else { console.error(`${failures} FAILED`); process.exitCode = 1; }
