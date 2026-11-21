// WebGL2 renderer for the Heartwood map: one instanced imposter quad per block (atlas cell 48x56 px = 1.5 x 1.75 map
// units, centred on the projection of the block's centre). Depth is the block centre's distance along the view
// direction, so no sorting. A dark cut face covers the solid cubes the cut opens up. Draws only on request.
import { capMask, cutCount } from './data.js';

// blocks above home; bounces per second (heavier = lower); damping (lower rings longer); seconds for the wave
export const SPRING = { drop: 1.2, hz: 2, zeta: 0.2, spread: 0.5 };

const HEAD = `#version 300 es
precision highp float; precision highp int;
uniform vec3 uA0, uA1, uO, uView, uD; uniform vec2 uB, uSize, uDepth;
vec2 toMap(vec3 p) { return vec2(dot(uA0, p), dot(uA1, p)) + uB; }
vec4 toClip(vec2 m, vec3 p) { vec2 s = m * uView.x + uView.yz; return vec4(s.x / uSize.x * 2. - 1., 1. - s.y / uSize.y * 2., (dot(uD, p) - uDepth.x) * uDepth.y, 1); }
`;
const BLOCK_VS = `layout(location = 0) in uint ax; layout(location = 1) in uint ay; layout(location = 2) in uint az; layout(location = 3) in uint ast;
uniform vec2 uAtlas; uniform vec3 uMid; uniform vec4 uK; uniform float uT, uFrom; out vec2 v;
void main() {
  vec2 c = vec2(gl_VertexID & 1, gl_VertexID >> 1);
  vec3 p = uO + vec3(ax, ay, az) + .5;
  vec2 m = toMap(p);
  if (float(ay) > uFrom) {
    float h = fract(sin(dot(p.xz, vec2(12.9898, 78.233))) * 43758.5453);
    float tau = uT - uK.w * (length(m - uMid.xy) / uMid.z + .5 * h);
    if (tau < 0.) { gl_Position = vec4(2, 2, 2, 1); return; }
    p.y += uK.x * exp(-uK.y * tau) * (cos(uK.z * tau) + uK.y / uK.z * sin(uK.z * tau));
    m = toMap(p);
  }
  gl_Position = toClip(m + (c - .5) * vec2(1.5, 1.75), p);
  v = (vec2(float(ast % 40u), float(ast / 40u)) + c) / uAtlas;
}`;
const BLOCK_FS = `uniform sampler2D uTex; in vec2 v; out vec4 o;
void main() { vec4 t = texture(uTex, v); if (t.a < .5) discard; o = vec4(t.rgb, 1); }`;
const CAP_VS = `uniform vec3 uGrid; out vec2 w;
void main() {
  w = vec2(gl_VertexID & 1, gl_VertexID >> 1) * uGrid.xz;
  vec3 p = uO + vec3(w.x, uGrid.y, w.y);
  gl_Position = toClip(toMap(p), p);
}`;
// depth of the centre of the block half a block above the cell: covers the cut block's top, nothing in front of it
const CAP_FS = `uniform sampler2D uMask; uniform vec3 uGrid; in vec2 w; out vec4 o;
void main() {
  ivec2 cell = min(ivec2(w), ivec2(uGrid.xz) - 1);
  if (texelFetch(uMask, cell, 0).r < .5) discard;
  gl_FragDepth = ((dot(uD, uO + vec3(float(cell.x) + .5, uGrid.y + .5, float(cell.y) + .5)) - uDepth.x) * uDepth.y) * .5 + .5;
  o = vec4(46., 48., 56., 255.) / 255.;
}`;

function program(gl, vs, fs) {
  const p = gl.createProgram();
  for (const [type, src] of [[gl.VERTEX_SHADER, vs], [gl.FRAGMENT_SHADER, fs]]) {
    const s = gl.createShader(type);
    gl.shaderSource(s, HEAD + src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    gl.attachShader(p, s);
  }
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
  const u = {};
  for (let i = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS); i--; ) {
    const n = gl.getActiveUniform(p, i).name;
    u[n] = gl.getUniformLocation(p, n);
  }
  return { p, u };
}

/**
 * gl: a WebGL2 context. meta: meta.json (A, b, preview). blocks: parseBlocks() of blocks.bin. solid: solid.bin bytes.
 * atlas: the loaded atlas image. onDraw(): after each frame. Returns { view(k, tx, ty, w, h, dpr), cut(c | null), destroy() }.
 */
export function createEngine(gl, { meta, blocks, solid, atlas, reduced, onDraw }) {
  const { origin, size, chunks, nBlocks, y: Y } = blocks;
  const bp = program(gl, BLOCK_VS, BLOCK_FS), cp = program(gl, CAP_VS, CAP_FS);

  // the four columns, straight from the file
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Uint8Array(blocks.x.buffer, blocks.x.byteOffset, nBlocks * 8), gl.STATIC_DRAW);
  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  for (let i = 0; i < 4; i++) (gl.enableVertexAttribArray(i), gl.vertexAttribDivisor(i, 1));

  const tex = (unit) => {
    const t = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, t);
    for (const a of [gl.TEXTURE_WRAP_S, gl.TEXTURE_WRAP_T]) gl.texParameteri(gl.TEXTURE_2D, a, gl.CLAMP_TO_EDGE);
    return t;
  };
  const atlasTex = tex(0);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, atlas);
  gl.generateMipmap(gl.TEXTURE_2D);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  const maskTex = tex(1);
  for (const a of [gl.TEXTURE_MIN_FILTER, gl.TEXTURE_MAG_FILTER]) gl.texParameteri(gl.TEXTURE_2D, a, gl.NEAREST);
  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);

  // view direction: perpendicular to both map rows, pointing away from the camera (which sees +x, +y, +z faces)
  const [a, c] = meta.A;
  let d = [a[1] * c[2] - a[2] * c[1], a[2] * c[0] - a[0] * c[2], a[0] * c[1] - a[1] * c[0]];
  const len = Math.hypot(...d) * (d[0] + d[1] + d[2] > 0 ? -1 : 1);
  d = d.map((v) => v / len);
  const mid = origin.map((o, i) => o + size[i] / 2);
  const pv = meta.preview;
  for (const { p, u } of [bp, cp]) {
    gl.useProgram(p);
    gl.uniform3fv(u.uA0, a);
    gl.uniform3fv(u.uA1, c);
    gl.uniform2fv(u.uB, meta.b);
    gl.uniform3fv(u.uO, origin);
    gl.uniform3fv(u.uD, d);
    gl.uniform2f(u.uDepth, d[0] * mid[0] + d[1] * mid[1] + d[2] * mid[2], 1 / (Math.hypot(...size) / 2 + 8));
  }
  gl.uniform1i(cp.u.uMask, 1);
  gl.useProgram(bp.p);
  gl.uniform1i(bp.u.uTex, 0);
  gl.uniform2f(bp.u.uAtlas, 40, atlas.height / 56);
  gl.uniform3f(bp.u.uMid, pv.x + pv.w / 2, pv.y + pv.h / 2, 0.6 * Math.max(pv.w, pv.h));
  const w = 2 * Math.PI * SPRING.hz, z = SPRING.zeta;
  gl.uniform4f(bp.u.uK, SPRING.drop, z * w, w * Math.sqrt(1 - z * z), SPRING.spread);
  const settle = reduced ? 0 : SPRING.spread * 1.7 + 3.9 / (z * w);

  // each chunk's map box, from its 16x16 column and its lowest and highest block (the spring lifts by `drop`)
  const box = chunks.map(({ cx, cz, start, count }) => {
    const xs = [], ys = [];
    for (const [dx, dy, dz] of [[0, 0, 0], [16, 0, 0], [0, 0, 16], [16, 0, 16], [0, 1, 0], [16, 1, 0], [0, 1, 16], [16, 1, 16]]) {
      const p = [origin[0] + cx * 16 + dx, origin[1] + (dy ? Y[start + count - 1] + 1 + SPRING.drop : Y[start]), origin[2] + cz * 16 + dz];
      xs.push(a[0] * p[0] + a[1] * p[1] + a[2] * p[2] + meta.b[0]);
      ys.push(c[0] * p[0] + c[1] * p[1] + c[2] * p[2] + meta.b[1]);
    }
    return [Math.min(...xs) - 1, Math.max(...xs) + 1, Math.min(...ys) - 1, Math.max(...ys) + 1];
  });

  let k = 1, tx = 0, ty = 0, cw = 1, ch = 1, cut = size[1] - 1, capped = false, from = -1, t0 = performance.now(), raf = 0;
  const frame = () => {
    raf = 0;
    const t = (performance.now() - t0) / 1000, moving = t < settle;
    gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
    gl.clearColor(9 / 255, 10 / 255, 12 / 255, 1);
    gl.enable(gl.DEPTH_TEST);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.useProgram(bp.p);
    gl.uniform3f(bp.u.uView, k, tx, ty);
    gl.uniform2f(bp.u.uSize, cw, ch);
    gl.uniform1f(bp.u.uT, t);
    gl.uniform1f(bp.u.uFrom, moving ? from : 1e9);
    gl.bindVertexArray(vao);
    const [x0, x1, y0, y1] = [-tx / k, (cw - tx) / k, -ty / k, (ch - ty) / k];
    // nearest chunks (highest cx, cz) first, so the depth test rejects more
    for (let i = chunks.length; i--; ) {
      const b = box[i], ch_ = chunks[i];
      if (b[1] < x0 || b[0] > x1 || b[3] < y0 || b[2] > y1) continue;
      const n = cutCount(Y, ch_.start, ch_.count, cut);
      if (!n) continue;
      for (let j = 0; j < 4; j++) gl.vertexAttribIPointer(j, 1, gl.UNSIGNED_SHORT, 0, (j * nBlocks + ch_.start) * 2);
      gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, n);
    }
    if (capped) {
      gl.useProgram(cp.p);
      gl.uniform3f(cp.u.uView, k, tx, ty);
      gl.uniform2f(cp.u.uSize, cw, ch);
      gl.uniform3f(cp.u.uGrid, size[0], cut + 1, size[2]);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }
    onDraw?.();
    if (moving) request();
  };
  const request = () => (raf ||= requestAnimationFrame(frame));

  return {
    /** screen = map * k + (tx, ty) in CSS px; w x h the canvas in CSS px. */
    view(nk, ntx, nty, w, h, dpr) {
      [k, tx, ty, cw, ch] = [nk, ntx, nty, w, h];
      const W = Math.round(w * dpr), H = Math.round(h * dpr);
      if (gl.canvas.width !== W || gl.canvas.height !== H) [gl.canvas.width, gl.canvas.height] = [W, H];
      request();
    },
    /** Cut at world Y c (blocks above it go, a raise drops the new blocks in), or null for every block. */
    cut(c) {
      const next = c == null ? size[1] - 1 : Math.max(-1, Math.min(size[1] - 1, c - origin[1]));
      // shortcut: a raise while blocks are still falling restarts the spring from the old cut; the rest snap home
      if (next > cut) [from, t0] = [cut, performance.now()];
      cut = next;
      capped = c != null;
      if (capped) {
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, maskTex);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, size[0], size[2], 0, gl.RED, gl.UNSIGNED_BYTE, capMask(solid, size, cut).map((v) => v * 255));
      }
      request();
    },
    destroy() {
      cancelAnimationFrame(raf);
      for (const t of [atlasTex, maskTex]) gl.deleteTexture(t);
      gl.deleteBuffer(buf);
      gl.deleteVertexArray(vao);
      for (const { p } of [bp, cp]) gl.deleteProgram(p);
    },
  };
}
