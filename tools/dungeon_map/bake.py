"""Bakes the Heartwood dungeon world into the map data in public/dungeon/ (see README.md beside this file).

Reads the region files (read-only), keeps every block a camera from above at the +x/+z corner could see, and writes
blocks.bin.gz, solid.bin.gz, atlas.png (one imposter per block state, drawn with the arena-map ray caster),
meta.json and preview.jpg. Ends with an assert-based self-check against the region files.

Usage: python tools/dungeon_map/bake.py [--region DIR] [--lib DIR] [--out DIR]"""
import argparse, gzip, json, math, os, struct, sys, time, zlib
from datetime import datetime, timezone
import numpy as np
import lz4.block
from PIL import Image

ap = argparse.ArgumentParser()
ap.add_argument('--region', default=r'F:\Work\minecraft\mc-server\world\dimensions\minecraft\dungeon\region')
ap.add_argument('--lib', default=r'F:\Work\minecraft\.orch\runs\20261114-arena-beta\maps\lib')
ap.add_argument('--out', default='public/dungeon')
ARGS = ap.parse_args()
sys.path.insert(0, ARGS.lib)
import render as R
import core

X0, X1, Z0, Z1 = -1168, -800, -832, -448          # block bounds, multiples of 16 (x1/z1 exclusive)
YMIN, YMAX, YCUT = -64, 320, -60                   # below YCUT is the flat world floor: dropped
CELL_W, CELL_H, COLS, PX = 48, 56, 40, 32
BG = (9, 10, 12)
PREVIEW_PPB = 4                                    # preview painted at 4 px per block (atlas / 8), then resized to 1200

# camera frame: the arena lib's orthographic frame for this view direction, checked against the spec's digits
YAW, PITCH = math.radians(45.0), math.radians(35.0)
FWD = np.array([-math.sin(YAW) * math.cos(PITCH), -math.sin(PITCH), -math.cos(YAW) * math.cos(PITCH)])
_, _, (RIGHT, UP, _) = R.ortho_rays(FWD, (0, 0, 0), 1.0, 1, 1)
A = np.array([RIGHT, -UP])
assert np.allclose(A, [[0.70711, 0, -0.70711], [0.40558, -0.81915, 0.40558]], atol=1e-5), A


# ---- region reader (Anvil, chunk compression 1/2/3/4, 4 = LZ4 block stream) ----
def unlz4(raw):
    out, p = [], 0
    while p < len(raw):
        assert raw[p:p + 8] == b'LZ4Block', raw[p:p + 8]
        tok = raw[p + 8]
        clen, olen = struct.unpack('<ii', raw[p + 9:p + 17])
        p += 21
        if olen == 0:
            break
        blk = raw[p:p + clen]
        out.append(blk if tok & 0xF0 == 0x10 else lz4.block.decompress(blk, uncompressed_size=olen))
        p += clen
    return b''.join(out)


def nbt(data):
    pos = 0

    def pay(t):
        nonlocal pos
        if t == 1: pos += 1; return data[pos - 1]
        if t == 2: pos += 2; return struct.unpack_from('>h', data, pos - 2)[0]
        if t == 3: pos += 4; return struct.unpack_from('>i', data, pos - 4)[0]
        if t == 4: pos += 8; return struct.unpack_from('>q', data, pos - 8)[0]
        if t == 5: pos += 4; return None
        if t == 6: pos += 8; return None
        if t == 7:
            n = struct.unpack_from('>i', data, pos)[0]; pos += 4 + n; return None
        if t == 8:
            n = struct.unpack_from('>H', data, pos)[0]; pos += 2 + n
            return data[pos - n:pos].decode('utf-8', 'replace')
        if t == 9:
            et = data[pos]; n = struct.unpack_from('>i', data, pos + 1)[0]; pos += 5
            return [pay(et) for _ in range(n)]
        if t == 10:
            out = {}
            while True:
                tt = data[pos]; pos += 1
                if tt == 0:
                    return out
                n = struct.unpack_from('>H', data, pos)[0]; pos += 2 + n
                k = data[pos - n:pos].decode('utf-8', 'replace')     # key first: pay() moves pos
                out[k] = pay(tt)
        if t == 11:
            n = struct.unpack_from('>i', data, pos)[0]; pos += 4 + 4 * n; return None
        if t == 12:
            n = struct.unpack_from('>i', data, pos)[0]; pos += 4 + 8 * n
            return np.frombuffer(data, dtype='>u8', count=n, offset=pos - 8 * n)
        raise ValueError(t)
    n = struct.unpack_from('>H', data, 1)[0]
    pos = 3 + n
    return pay(10)


def region_path(rx, rz):
    return os.path.join(ARGS.region, 'r.%d.%d.mca' % (rx, rz))


def chunks(path, only=None):
    data = open(path, 'rb').read()
    for i in range(1024) if only is None else (only,):
        sector = struct.unpack_from('>I', data, i * 4)[0] >> 8
        if not sector:
            continue
        start = sector * 4096
        length = struct.unpack_from('>I', data, start)[0]
        comp = data[start + 4]
        assert not comp & 0x80, 'external .mcc chunk in %s' % path
        yield i, nbt({1: gzip.decompress, 2: zlib.decompress, 3: bytes, 4: unlz4}[comp](data[start + 5:start + 4 + length]))


def section(sec):
    """(y0, palette names, (16,16,16) palette index [y,z,x] or None for a one-entry palette)."""
    y0 = sec['Y']
    y0 = (y0 - 256 if y0 > 127 else y0) * 16
    bs = sec.get('block_states')
    if not bs:
        return y0, None, None
    names = []
    for p in bs['palette']:
        # 26.x palette entry: 'name', {'': 'name'} or {'id': 'name', 'properties': {...}}; older: Name/Properties
        if isinstance(p, str):
            p = {'': p}
        nm = (p.get('') or p.get('id') or p['Name']).replace('minecraft:', '')
        pr = p.get('properties') or p.get('Properties')
        if pr:
            nm += '[' + ','.join('%s=%s' % kv for kv in sorted(pr.items())) + ']'
        names.append(nm)
    d = bs.get('data')
    if d is None:
        return y0, names, None
    bits = max(4, (len(names) - 1).bit_length())
    per = 64 // bits
    sh = (np.arange(per, dtype=np.uint64) * np.uint64(bits))[None, :]
    v = ((d.astype(np.uint64)[:, None] >> sh) & np.uint64((1 << bits) - 1)).reshape(-1)[:4096]
    return y0, names, v.astype(np.int64).reshape(16, 16, 16)


def load_grid():
    ids = np.zeros((YMAX - YMIN, Z1 - Z0, X1 - X0), dtype=np.uint16)
    names, idx = ['air'], {'air': 0}
    newest = 0.0
    for rx in range(X0 >> 9, ((X1 - 1) >> 9) + 1):
        for rz in range(Z0 >> 9, ((Z1 - 1) >> 9) + 1):
            f = region_path(rx, rz)
            if not os.path.exists(f):
                continue
            newest = max(newest, os.path.getmtime(f))
            for i, c in chunks(f):
                bx, bz = (rx * 32 + (i & 31)) * 16, (rz * 32 + (i >> 5)) * 16
                if not (X0 <= bx < X1 and Z0 <= bz < Z1):
                    continue
                for sec in c.get('sections', []):
                    y0, pn, blk = section(sec)
                    if pn is None or not YMIN <= y0 < YMAX:
                        continue
                    for nm in pn:
                        if nm not in idx:
                            idx[nm] = len(names); names.append(nm)
                    pal = np.array([idx[nm] for nm in pn], dtype=np.uint16)
                    ids[y0 - YMIN:y0 - YMIN + 16, bz - Z0:bz - Z0 + 16, bx - X0:bx - X0 + 16] = pal[0] if blk is None else pal[blk]
    return ids, names, newest


def block_at(x, y, z):
    """The block state name at a world coordinate, read straight from its region file."""
    cx, cz = x >> 4, z >> 4
    for _, c in chunks(region_path(cx >> 5, cz >> 5), only=(cz & 31) * 32 + (cx & 31)):
        for sec in c.get('sections', []):
            y0, pn, blk = section(sec)
            if pn is not None and y0 <= y < y0 + 16:
                return pn[0] if blk is None else pn[blk[y - y0, z & 15, x & 15]]
    return 'air'


# ---- the render lib, with the mock-up's fixes ----
_textures = R.textures


def _safe_textures(b):
    """The arena lib has no texture for some 26.3 blocks: draw those flat instead of crashing."""
    try:
        r = _textures(b)
        if r and r[0] is not None and r[1] is not None and not R._is_magenta(r[0]):
            return r
    except Exception:
        pass
    flat = {'yellow_poplar_leaves': (226, 186, 58), 'orange_poplar_leaves': (222, 128, 44), 'red_poplar_leaves': (188, 62, 44),
            'poplar_log': (150, 122, 92)}
    im = Image.new('RGBA', (16, 16), flat.get(b, (112, 112, 118)) + (255,))
    if b in flat:                                            # a little grain so a canopy is not one flat colour
        px = im.load()
        for i in range(0, 16, 3):
            for j in range(i % 2, 16, 4):
                px[i, j] = tuple(int(c * 0.82) for c in flat[b]) + (255,)
    return im, im


R.textures = _safe_textures


def patch(sc, names):
    """Water as a blue block (its texture is a grey, see-through tile); grey plant textures tinted green."""
    for i, n in enumerate(names):
        b = core.base(n)
        if b in ('water', 'bubble_column'):
            t = sc.tex[i].astype(np.float64)
            g = t[..., :3].mean(axis=-1, keepdims=True) / 255.0
            sc.tex[i, ..., :3] = np.clip(np.array([52, 98, 190.0]) * (0.75 + 0.5 * g), 0, 255)
            sc.tex[i, ..., 3] = 255
            sc.box[i, 0] = (0, 0, 0, 1, 14 / 16, 1); sc.nb[i] = 1; sc.kind[i] = 2; sc.plant[i] = False
        elif b in ('iron_chain', 'chain', 'end_rod'):          # sprite packed at u 0..5, box at 7..9: slide it onto the box
            sc.tex[i] = np.roll(sc.tex[i], 7, axis=2)
        elif b in ('short_grass', 'tall_grass', 'fern', 'large_fern', 'vine', 'lily_pad', 'sugar_cane'):
            rgb = sc.tex[i, ..., :3].astype(np.float64)
            if abs(rgb[..., 0].mean() - rgb[..., 1].mean()) < 4:
                sc.tex[i, ..., :3] = np.clip(rgb * np.array([124, 189, 107.0]) / 255.0, 0, 255)


def include_mask(ids, air, whole):
    """Not air and (not a whole cube, or a neighbour at y+1, x+1 or z+1 is not a whole cube or outside the grid)."""
    w = whole[ids]
    cov = np.zeros_like(w)
    cov[:-1, :-1, :-1] = w[1:, :-1, :-1] & w[:-1, :-1, 1:] & w[:-1, 1:, :-1]
    return ~air[ids] & ~(w & cov), w


def atlas(sc, states):
    """(rows*56, 40*48, 4) uint8: state i alone, its centre at the cell centre; alpha from a black and a white render."""
    n = len(states)
    img = np.zeros((math.ceil(n / COLS) * CELL_H, COLS * CELL_W, 4), dtype=np.uint8)
    du = (np.arange(CELL_W) + 0.5 - CELL_W / 2) / PX
    dv = (CELL_H / 2 - (np.arange(CELL_H) + 0.5)) / PX
    Ug, Vg = np.meshgrid(du, dv)
    cell = Ug.reshape(-1, 1) * RIGHT + Vg.reshape(-1, 1) * UP - FWD * 4.0     # rays for one cell, centre at (0,0,0)
    B = 200                                                                    # states per scene: bounded memory
    for a in range(0, n, B):
        st = states[a:a + B]
        sc.ids = np.zeros((1, 1, 3 * len(st)), dtype=np.uint16)              # one row, 3 apart: no shared shade/shadow
        sc.ids[0, 0, 0::3] = st
        sc.size = np.array([3.0 * len(st), 1.0, 1.0])
        ctr = np.stack([np.arange(len(st)) * 3 + 0.5, np.full(len(st), 0.5), np.full(len(st), 0.5)], 1)
        o = (ctr[:, None, :] + cell[None]).reshape(-1, 3)
        d = np.tile(FWD, (len(o), 1))
        k = sc.shade(o, d, np.zeros((len(o), 3)))
        w = sc.shade(o, d, np.full((len(o), 3), 255.0))
        al = np.clip(1 - (w - k).mean(axis=1) / 255.0, 0, 1)
        rgb = np.where(al[:, None] > 0, k / np.maximum(al, 1e-6)[:, None], 0)
        px = np.concatenate([np.clip(rgb, 0, 255), al[:, None] * 255], 1).round().astype(np.uint8).reshape(len(st), CELL_H, CELL_W, 4)
        for j in range(len(st)):
            i = a + j
            img[i // COLS * CELL_H:(i // COLS + 1) * CELL_H, i % COLS * CELL_W:(i % COLS + 1) * CELL_W] = px[j]
        print('  atlas %d/%d' % (min(n, a + B), n), flush=True)
    return img


def preview(atl, xyz, state, origin, b):
    """The island painted from the imposters, front-most block centre wins per pixel (painter's order), 1200 px wide."""
    s = PX // PREVIEW_PPB
    cw, ch = CELL_W // s, CELL_H // s
    small = np.asarray(Image.fromarray(atl).resize((atl.shape[1] // s, atl.shape[0] // s), Image.BOX))
    cells = np.stack([small[i // COLS * ch:(i // COLS + 1) * ch, i % COLS * cw:(i % COLS + 1) * cw] for i in range(state.max() + 1)])
    p = xyz.astype(np.float64) + origin + 0.5
    m = p @ A.T + b
    x0 = np.round(m[:, 0] * PREVIEW_PPB - cw / 2).astype(np.int64)
    y0 = np.round(m[:, 1] * PREVIEW_PPB - ch / 2).astype(np.int64)
    W, H = int(x0.max()) + cw + 1, int(y0.max()) + ch + 1
    assert x0.min() >= 0 and y0.min() >= 0
    depth = (p @ FWD).astype(np.float32)                    # smaller = nearer the camera
    zbuf = np.full(W * H, np.inf, dtype=np.float32)
    for pas in (0, 1):
        for dy in range(ch):
            for dx in range(cw):
                on = np.nonzero(cells[state, dy, dx, 3] >= 128)[0]
                pix = (y0[on] + dy) * W + x0[on] + dx
                if pas == 0:
                    np.minimum.at(zbuf, pix, depth[on])
                else:
                    win = depth[on] == zbuf[pix]
                    canvas[pix[win]] = cells[state[on[win]], dy, dx, :3]
        if pas == 0:
            canvas = np.tile(np.array(BG, dtype=np.uint8), (W * H, 1))
    im = Image.fromarray(canvas.reshape(H, W, 3)).resize((1200, round(H * 1200 / W)), Image.LANCZOS)
    return im, {'x': 0.0, 'y': 0.0, 'w': W / PREVIEW_PPB, 'h': H / PREVIEW_PPB}


def main():
    t0 = time.time()
    out = ARGS.out
    os.makedirs(out, exist_ok=True)
    ids, names, newest = load_grid()
    print('grid read %.0fs, palette %d' % (time.time() - t0, len(names)), flush=True)
    ids[:YCUT - YMIN] = 0
    air = np.array([core.base(n) in core.INVISIBLE for n in names])      # barrier/light/structure_void draw nothing: as air
    ys = np.nonzero((~air[ids]).any(axis=(1, 2)))[0]
    ids = ids[ys.min():ys.max() + 1]
    origin = np.array([X0, YMIN + int(ys.min()), Z0])
    sy, sz, sx = ids.shape

    class M: pass
    m = M(); m.ids = ids; m.names = names
    sc = R.Scene(m)
    patch(sc, names)
    whole = sc.kind == 1
    inc, solid = include_mask(ids, air, whole)

    y, z, x = np.nonzero(inc)
    pid = ids[y, z, x]
    del inc
    order = np.lexsort((x, z, y, x >> 4, z >> 4))           # chunks in (cz, cx), then y ascending
    x, y, z, pid = x[order], y[order], z[order], pid[order]
    used, state = np.unique(pid, return_inverse=True)
    states = [names[i] for i in used]
    key = (z >> 4) * 65536 + (x >> 4)
    ck, start, count = np.unique(key, return_index=True, return_counts=True)
    nB, nC, nS = len(x), len(ck), len(states)
    head = b'HWB1' + struct.pack('<IIiiiHHHH', nB, nC, *origin.tolist(), sx, sy, sz, nS)
    table = np.zeros(nC, dtype=[('cx', '<u2'), ('cz', '<u2'), ('s', '<u4'), ('c', '<u4')])
    table['cx'], table['cz'], table['s'], table['c'] = ck % 65536, ck // 65536, start, count
    cols = np.concatenate([x, y, z, state]).astype('<u2')
    with gzip.open(os.path.join(out, 'blocks.bin.gz'), 'wb', 9) as f:
        f.write(head + table.tobytes() + cols.tobytes())
    with gzip.open(os.path.join(out, 'solid.bin.gz'), 'wb', 9) as f:
        f.write(np.packbits(solid.ravel()).tobytes())
    del solid
    print('blocks %d chunks %d states %d (%.0fs)' % (nB, nC, nS, time.time() - t0), flush=True)

    atl = atlas(sc, used)
    Image.fromarray(atl, 'RGBA').save(os.path.join(out, 'atlas.png'), optimize=True)

    corners = np.array([[cx, cy, cz] for cx in (0, sx) for cy in (0, sy) for cz in (0, sz)]) + origin
    b = -(corners @ A.T).min(axis=0)
    im, rect = preview(atl, np.stack([x, y, z], 1), state, origin, b)
    im.save(os.path.join(out, 'preview.jpg'), 'JPEG', quality=80, optimize=True, progressive=True)

    meta = {'origin': origin.tolist(), 'size': [sx, sy, sz], 'nBlocks': nB, 'nChunks': nC, 'nStates': nS,
            'A': A.round(6).tolist(), 'b': b.round(6).tolist(), 'atlas': {'cell': [CELL_W, CELL_H], 'cols': COLS, 'px': PX},
            'preview': {k: round(v, 3) for k, v in rect.items()}, 'states': states,
            'world': '%s %s' % ('/'.join(os.path.normpath(ARGS.region).split(os.sep)[-2:]),
                                datetime.fromtimestamp(newest, timezone.utc).isoformat(timespec='seconds'))}
    json.dump(meta, open(os.path.join(out, 'meta.json'), 'w'), separators=(',', ':'))

    self_check(out, ids, names, air, whole, origin)
    total = 0
    for fn in sorted(os.listdir(out)):
        sz_ = os.path.getsize(os.path.join(out, fn)); total += sz_
        print('%-14s %9d bytes' % (fn, sz_))
    print('total          %9d bytes, %.0fs' % (total, time.time() - t0))
    assert total < 6_000_000, total                                               # AC4
    assert os.path.getsize(os.path.join(out, 'preview.jpg')) < 400_000


def self_check(out, ids, names, air, whole, origin):
    """AC2 + AC3: re-read what was written and compare it with the grid and the region files."""
    raw = gzip.open(os.path.join(out, 'blocks.bin.gz')).read()
    meta = json.load(open(os.path.join(out, 'meta.json')))
    nB, nC = struct.unpack_from('<II', raw, 4)
    nS = struct.unpack_from('<H', raw, 30)[0]
    cols = np.frombuffer(raw, '<u2', 4 * nB, 32 + 12 * nC).reshape(4, nB)
    w = whole[ids]
    # inclusion rule, counted another way: pad with "not a cube" outside the grid
    pw = np.pad(w, ((0, 1), (0, 1), (0, 1)))
    covered = w & pw[1:, :-1, :-1] & pw[:-1, :-1, 1:] & pw[:-1, 1:, :-1]
    assert nB == int((~air[ids] & ~covered).sum()), 'nBlocks %d != grid count' % nB
    rng = np.random.default_rng(20261121)
    for i in rng.choice(nB, 20, replace=False):
        x, y, z, s = (int(v) for v in cols[:, i])
        got = block_at(x + origin[0], y + origin[1], z + origin[2])
        assert got == meta['states'][s], (x, y, z, got, meta['states'][s])
    cube = {n for n, k in zip(names, whole) if k}
    ex = np.argwhere(covered)
    for y, z, x in ex[rng.choice(len(ex), 20, replace=False)]:
        wx, wy, wz = x + origin[0], y + origin[1], z + origin[2]
        for p in ((wx, wy, wz), (wx, wy + 1, wz), (wx + 1, wy, wz), (wx, wy, wz + 1)):
            assert block_at(*p) in cube, (p, block_at(*p))
    # AC3
    assert len(meta['states']) == nS == meta['nStates']
    atl = np.asarray(Image.open(os.path.join(out, 'atlas.png')))
    for i in range(nS):
        c = atl[i // COLS * CELL_H:(i // COLS + 1) * CELL_H, i % COLS * CELL_W:(i % COLS + 1) * CELL_W, 3]
        assert c.max() > 0, 'empty atlas cell %d %s' % (i, meta['states'][i])
    print('self-check PASS', flush=True)


main()
