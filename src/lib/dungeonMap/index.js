// The map box's live half: view (pan, pinch, wheel, zoom buttons), data loading and the WebGL engine.
// The view is screen = map * k + (tx, ty); it reaches the markers, outlines and preview as CSS variables on the box.
import { createEngine } from './engine.js';
import { parseBlocks } from './data.js';

const clampK = (v) => Math.min(16, Math.max(0.5, v));
const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

/** The bytes of public/dungeon/<file>, gunzipped (unless the host already did). */
async function bytes(file) {
  const r = await fetch(`/dungeon/${file}`);
  if (!r.ok) throw new Error(`${file}: ${r.status}`);
  const b = await r.arrayBuffer();
  const h = new Uint8Array(b, 0, 2);
  if (h[0] !== 0x1f || h[1] !== 0x8b) return b;
  return new Response(new Blob([b]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
}

/**
 * box: the [data-map-box] element (holds the canvas). opts: meta (A, b, preview), onGl('on' | 'off', yRange),
 * onTap(mx, my) on a click that did not drag, onHover(mx, my | null). Returns { destroy, fly(bb, maxK), cut(c | null) }.
 */
export function mount(box, { meta, frame, onGl, onTap, onHover }) {
  const canvas = box.querySelector('canvas');
  let k = 1, tx = 0, ty = 0, anim = 0, engine = null, cut = null, dead = false, touched = false;

  const apply = () => {
    box.style.setProperty('--k', k);
    box.style.setProperty('--tx', tx);
    box.style.setProperty('--ty', ty);
    box.dataset.zoom = k < 2.4 ? 'far' : k < 5 ? 'mid' : 'near';
    box.dataset.live = '';
    engine?.view(k, tx, ty, box.clientWidth, box.clientHeight, Math.min(2, devicePixelRatio || 1));
  };
  // the part of the box the info card leaves free, [left, top, right, bottom] in box px: right of the card on
  // desktop, above it under 900 px (a full-width sheet); measured as rendered, so the page calls after a pick renders
  const free = () => {
    const b = box.getBoundingClientRect(), c = box.querySelector('[data-map-panel]')?.getBoundingClientRect();
    if (!c) return [0, 0, b.width, b.height];
    return c.width < b.width / 2 ? [c.right - b.left, 0, b.width, b.height] : [0, 0, b.width, c.top - b.top];
  };
  const target = (bb, maxK = 99) => {
    const [l, t, r, b] = free(), w = r - l, h = b - t;
    const nk = clampK(Math.min(w / (bb[1] - bb[0]), h / (bb[3] - bb[2]), maxK) * 0.86);
    return [nk, l + w / 2 - ((bb[0] + bb[1]) / 2) * nk, t + h / 2 - ((bb[2] + bb[3]) / 2) * nk];
  };
  const pv = meta.preview;
  // what the page frames (the island's areas), clamped to the data box
  const whole = () => {
    const f = frame();
    return [Math.max(pv.x, f[0]), Math.min(pv.x + pv.w, f[1]), Math.max(pv.y, f[2]), Math.min(pv.y + pv.h, f[3])];
  };
  const fly = (to) => {
    touched = true;
    const from = [k, tx, ty];
    cancelAnimationFrame(anim);
    if (reducedMotion()) return ([k, tx, ty] = to), apply();
    const t0 = performance.now();
    const step = (now) => {
      const u = Math.min(1, (now - t0) / 320), e = 1 - (1 - u) ** 3;
      [k, tx, ty] = from.map((f, i) => f + (to[i] - f) * e);
      apply();
      if (u < 1) anim = requestAnimationFrame(step);
    };
    step(t0);
  };
  const zoomAt = (px, py, f) => {
    const nk = clampK(k * f);
    tx = px - ((px - tx) * nk) / k;
    ty = py - ((py - ty) * nk) / k;
    k = nk;
  };

  // pan, pinch, wheel
  const pts = new Map();
  let moved = 0;
  const local = (e) => {
    const r = box.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  };
  const down = (e) => {
    if (e.target.closest('button, input, label, summary, .dm-ctl')) return;
    cancelAnimationFrame(anim);
    box.setPointerCapture(e.pointerId);
    pts.set(e.pointerId, [e.clientX, e.clientY]);
    if (pts.size === 1) moved = 0;
    box.dataset.drag = '';
  };
  const move = (e) => {
    const prev = pts.get(e.pointerId);
    const [px, py] = local(e);
    if (!prev) return onHover((px - tx) / k, (py - ty) / k);
    const dx = e.clientX - prev[0], dy = e.clientY - prev[1];
    moved += Math.abs(dx) + Math.abs(dy);
    if (pts.size === 1) (tx += dx), (ty += dy);
    else {
      const o = [...pts].find(([id]) => id !== e.pointerId)[1];
      const d0 = Math.hypot(prev[0] - o[0], prev[1] - o[1]), d1 = Math.hypot(e.clientX - o[0], e.clientY - o[1]);
      const r = box.getBoundingClientRect();
      if (d0 > 0) zoomAt((e.clientX + o[0]) / 2 - r.left, (e.clientY + o[1]) / 2 - r.top, d1 / d0);
      moved += 9;
    }
    touched = true;
    pts.set(e.pointerId, [e.clientX, e.clientY]);
    apply();
  };
  const up = (e) => {
    if (!pts.delete(e.pointerId) || pts.size) return;
    delete box.dataset.drag;
    if (moved < 6 && e.type === 'pointerup') {
      const [px, py] = local(e);
      onTap((px - tx) / k, (py - ty) / k);
    }
  };
  const leave = () => onHover(null);
  const wheel = (e) => {
    // over an overlay the wheel scrolls it (the info card), not the map
    if (e.target.closest('.dm-ctl')) return;
    e.preventDefault();
    cancelAnimationFrame(anim);
    touched = true;
    const [px, py] = local(e);
    zoomAt(px, py, Math.exp(-e.deltaY * 0.0015));
    apply();
  };
  const click = (e) => {
    const z = e.target.closest('[data-zoom-by]');
    if (!z) return;
    touched = true;
    zoomAt(box.clientWidth / 2, box.clientHeight / 2, Number(z.dataset.zoomBy));
    apply();
  };
  const on = [['pointerdown', down], ['pointermove', move], ['pointerup', up], ['pointercancel', up], ['pointerleave', leave], ['wheel', wheel, { passive: false }], ['click', click]];
  for (const [ev, fn, o] of on) box.addEventListener(ev, fn, o);
  // until the visitor moves the view, a resize keeps the whole island in the box
  const ro = new ResizeObserver(() => {
    if (!touched) [k, tx, ty] = target(whole());
    apply();
  });
  ro.observe(box);
  [k, tx, ty] = target(whole());
  apply();

  const fail = () => {
    if (dead) return;
    canvas.hidden = true;
    box.dataset.gl = 'off';
    onGl('off');
  };
  // shortcut: a lost context drops to the preview for good (no webglcontextrestored rebuild); a reload brings it back
  canvas.addEventListener('webglcontextlost', fail);
  const gl = canvas.getContext('webgl2', { antialias: false });
  if (!gl || typeof DecompressionStream === 'undefined') fail();
  else {
    const atlas = new Image();
    atlas.src = '/dungeon/atlas.png';
    Promise.all([bytes('blocks.bin.gz'), bytes('solid.bin.gz'), atlas.decode()])
      .then(([b, s]) => {
        if (dead) return;
        const blocks = parseBlocks(b);
        let lo = Infinity, hi = -Infinity;
        for (const { start, count } of blocks.chunks) (lo = Math.min(lo, blocks.y[start])), (hi = Math.max(hi, blocks.y[start + count - 1]));
        let first = true;
        engine = createEngine(gl, {
          meta, blocks, solid: new Uint8Array(s), atlas, reduced: reducedMotion(),
          onDraw: () => {
            if (!first || canvas.hidden) return; // a context lost during the load stays off
            first = false;
            box.dataset.gl = 'on';
            onGl('on', [blocks.origin[1] + lo, blocks.origin[1] + hi]);
          },
        });
        engine.cut(cut);
        apply();
      })
      .catch(fail);
  }

  return {
    fly: (bb, maxK) => fly(target(bb ?? whole(), maxK)),
    // pan, at the same zoom, to bring (mx, my) into the free part of the box if it is not 20 px inside it
    show(mx, my) {
      const [l, t, r, b] = free(), x = mx * k + tx, y = my * k + ty;
      if (x < l + 20 || x > r - 20 || y < t + 20 || y > b - 20) fly([k, (l + r) / 2 - mx * k, (t + b) / 2 - my * k]);
    },
    cut(c) {
      cut = c;
      engine?.cut(c);
    },
    destroy() {
      dead = true;
      cancelAnimationFrame(anim);
      ro.disconnect();
      canvas.removeEventListener('webglcontextlost', fail);
      for (const [ev, fn, o] of on) box.removeEventListener(ev, fn, o);
      engine?.destroy();
    },
  };
}
