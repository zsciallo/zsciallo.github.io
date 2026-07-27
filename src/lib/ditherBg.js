// Ordered-dither background (replaces the old CSS grid overlay).
// An ocean of purple stipple rising from the bottom of the viewport —
// quantized per-cell against an 8x8 Bayer matrix and stretched to fill
// the screen with crisp pixels. Swells travel across the waterline and
// a slow tide bobs the whole surface up and down.

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

  let w, h, img, atten;

  // Content lives in a centered 900px column; dim the stipple inside it so
  // the motion doesn't fight the copy, ramping back up toward the edges.
  const COLUMN_HALF = 470; // px from center where the fade starts
  const FADE = 220; // px over which opacity returns to full
  const DIM = 0.35; // opacity multiplier behind the content

  const resize = () => {
    w = Math.ceil(window.innerWidth / SCALE);
    h = Math.ceil(window.innerHeight / SCALE);
    canvas.width = w;
    canvas.height = h;
    img = ctx.createImageData(w, h);

    atten = new Float32Array(w);
    const mid = window.innerWidth / 2;
    for (let x = 0; x < w; x++) {
      const dpx = Math.abs((x + 0.5) * SCALE - mid);
      const k = Math.min(1, Math.max(0, (dpx - COLUMN_HALF) / FADE));
      atten[x] = DIM + (1 - DIM) * k * k * (3 - 2 * k); // smoothstep
    }
  };

  function draw(t) {
    const d = img.data;
    const aspect = w / h;

    // Slow tide: the whole waterline drifts up and down.
    const tide = 0.04 * Math.sin(t * 0.17);

    let i = 0;
    for (let y = 0; y < h; y++) {
      const v = y / h;
      for (let x = 0; x < w; x++, i += 4) {
        // Height-relative x so wave size is consistent at any aspect ratio.
        const u = (x / w) * aspect;

        // Two swells traveling in opposite directions across the waterline.
        const crest =
          0.35 +
          tide +
          0.07 * Math.sin(u * 4 - t * 0.9) +
          0.045 * Math.sin(u * 7 + t * 0.6 + 1.7);

        const e = Math.max(0, (v - crest) / 0.55);
        const f = e * e * 0.55;

        if (f > BAYER[(x & 7) + ((y & 7) << 3)]) {
          const m = Math.min(1, f * 2.2);
          // single electric purple #c14dff, fading in by depth
          d[i] = 193;
          d[i + 1] = 77;
          d[i + 2] = 255;
          d[i + 3] = (48 + 52 * m) * atten[x];
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

  let lastTick = -1;
  const frame = (now) => {
    const tick = Math.floor(now / (1000 / FPS));
    if (tick !== lastTick) {
      lastTick = tick;
      draw(tick / FPS);
    }
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

start();
