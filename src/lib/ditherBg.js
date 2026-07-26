// Ordered-dither background (replaces the old CSS grid overlay).
// A reverse vignette — dark in the center, purple-to-pink stipple toward
// the edges — quantized per-cell against an 8x8 Bayer matrix and stretched
// to fill the viewport with crisp pixels. The vignette boundary slowly
// undulates, and the whole field leans gently toward the mouse.

const SCALE = 5; // screen px per dither cell
const FPS = 12;

// 8x8 Bayer matrix, normalized to (0, 1) thresholds.
const BAYER = [
  0, 32, 8, 40, 2, 34, 10, 42,
  48, 16, 56, 24, 50, 18, 58, 26,
  12, 44, 4, 36, 14, 46, 6, 38,
  60, 28, 52, 20, 62, 30, 54, 22,
  3, 35, 11, 43, 1, 33, 9, 41,
  51, 19, 59, 27, 49, 17, 57, 25,
  15, 47, 7, 39, 13, 45, 5, 37,
  63, 31, 55, 23, 61, 29, 53, 21,
].map((v) => (v + 0.5) / 64);

function start() {
  const canvas = document.createElement('canvas');
  canvas.className = 'dither-bg';
  canvas.setAttribute('aria-hidden', 'true');
  document.body.prepend(canvas);
  const ctx = canvas.getContext('2d');

  let w, h, img;

  // Mouse position (viewport fractions), eased so the field drifts after
  // the cursor instead of snapping.
  let mx = 0.5;
  let my = 0.5;
  let tx = 0.5;
  let ty = 0.5;

  const resize = () => {
    w = Math.ceil(window.innerWidth / SCALE);
    h = Math.ceil(window.innerHeight / SCALE);
    canvas.width = w;
    canvas.height = h;
    img = ctx.createImageData(w, h);
  };

  function draw(t) {
    const d = img.data;
    const aspect = w / h;
    const corner = Math.hypot(0.5 * aspect, 0.5);

    // Vignette center leans slightly toward the cursor.
    const cx = 0.5 + (mx - 0.5) * 0.12;
    const cy = 0.5 + (my - 0.5) * 0.12;

    let i = 0;
    for (let y = 0; y < h; y++) {
      const dy = y / h - cy;
      for (let x = 0; x < w; x++, i += 4) {
        const dx = (x / w - cx) * aspect;
        const dist = Math.hypot(dx, dy) / corner;
        const ang = Math.atan2(dy, dx);

        // Slowly drifting ripples along the vignette boundary.
        const r0 =
          0.3 + 0.05 * Math.sin(ang * 3 + t * 0.5) + 0.03 * Math.sin(ang * 5 - t * 0.33 + 1.4);

        const e = Math.max(0, (dist - r0) / 0.7);
        const f = e * e * 0.55;

        if (f > BAYER[(x & 7) + ((y & 7) << 3)]) {
          const m = Math.min(1, f * 2.2);
          // deep purple #9a4dff -> purple #c77dff -> pink #ff7de1 by brightness
          if (m < 0.5) {
            const k = m * 2;
            d[i] = 154 + 45 * k;
            d[i + 1] = 77 + 48 * k;
            d[i + 2] = 255;
          } else {
            const k = m * 2 - 1;
            d[i] = 199 + 56 * k;
            d[i + 1] = 125;
            d[i + 2] = 255 - 30 * k;
          }
          d[i + 3] = 30 + 44 * m;
        } else {
          d[i + 3] = 0;
        }
      }
    }
    ctx.putImageData(img, 0, 0);
  }

  resize();
  window.addEventListener('resize', resize);
  draw(0);

  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  window.addEventListener('mousemove', (e) => {
    tx = e.clientX / window.innerWidth;
    ty = e.clientY / window.innerHeight;
  });

  let lastTick = -1;
  const frame = (now) => {
    const tick = Math.floor(now / (1000 / FPS));
    if (tick !== lastTick) {
      lastTick = tick;
      // Ease toward the cursor.
      mx += (tx - mx) * 0.08;
      my += (ty - my) * 0.08;
      draw(tick / FPS);
    }
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

start();
