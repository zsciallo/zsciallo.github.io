"""Paints public/dungeon/preview.webp: the island from the baked map data with a transparent background, cropped to
the island, 800 px wide. Same painter as bake.py's preview() but keeps coverage as alpha; run it after a bake.

Usage: python tools/dungeon_map/preview_webp.py [DIR]   (DIR defaults to public/dungeon)"""
import gzip, json, math, os, struct, sys
import numpy as np
from PIL import Image, ImageDraw

DIR = sys.argv[1] if len(sys.argv) > 1 else 'public/dungeon'
PPB, WIDTH = 4, 800                       # bake.py PREVIEW_PPB; the page shows it at most ~460 px wide
YAW, PITCH = math.radians(45.0), math.radians(35.0)
FWD = np.array([-math.sin(YAW) * math.cos(PITCH), -math.sin(PITCH), -math.cos(YAW) * math.cos(PITCH)])

meta = json.load(open(os.path.join(DIR, 'meta.json')))
raw = gzip.open(os.path.join(DIR, 'blocks.bin.gz')).read()
nB, nC = struct.unpack_from('<II', raw, 4)
cols = np.frombuffer(raw, '<u2', 4 * nB, 32 + 12 * nC).reshape(4, nB)
xyz, state = cols[:3].T, cols[3].astype(np.int64)
atl = np.asarray(Image.open(os.path.join(DIR, 'atlas.png')).convert('RGBA'))
(CW, CH), NCOL, PX = meta['atlas']['cell'], meta['atlas']['cols'], meta['atlas']['px']

s = PX // PPB
cw, ch = CW // s, CH // s
small = np.asarray(Image.fromarray(atl).resize((atl.shape[1] // s, atl.shape[0] // s), Image.BOX))
cells = np.stack([small[i // NCOL * ch:(i // NCOL + 1) * ch, i % NCOL * cw:(i % NCOL + 1) * cw] for i in range(state.max() + 1)])
p = xyz.astype(np.float64) + meta['origin'] + 0.5
m = p @ np.array(meta['A']).T + meta['b']
x0 = np.round(m[:, 0] * PPB - cw / 2).astype(np.int64)
y0 = np.round(m[:, 1] * PPB - ch / 2).astype(np.int64)
W, H = int(x0.max()) + cw + 1, int(y0.max()) + ch + 1
depth = (p @ FWD).astype(np.float32)
zbuf = np.full(W * H, np.inf, dtype=np.float32)
canvas = np.zeros((W * H, 3), dtype=np.uint8)
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

# Opaque = painted, or an unpainted gap enclosed by the island (flood the outside from a 1 px empty frame).
mask = Image.fromarray(np.pad(np.isfinite(zbuf).reshape(H, W), 1).astype(np.uint8) * 255).copy()  # copy: floodfill skips a read-only numpy-backed image
ImageDraw.floodfill(mask, (0, 0), 128)
alpha = (np.asarray(mask)[1:-1, 1:-1] != 128).astype(np.uint8) * 255
im = Image.fromarray(np.dstack([canvas.reshape(H, W, 3), alpha]), 'RGBA')
# Crop to the island itself (the piece holding the centre), so a stray far-off strand does not widen the frame.
main = Image.fromarray(alpha).copy()
ImageDraw.floodfill(main, (W // 2, H // 2), 128)
ys, xs = np.nonzero(np.asarray(main) == 128)
assert len(ys) > W * H // 4, 'the image centre is not on the island'
im = im.crop((xs.min(), ys.min(), xs.max() + 1, ys.max() + 1))
# Premultiplied resize: edge pixels fade to transparent, not to black, so no dark fringe on a light page.
im = im.convert('RGBa').resize((WIDTH, round(im.height * WIDTH / im.width)), Image.LANCZOS).convert('RGBA')
out = os.path.join(DIR, 'preview.webp')
im.save(out, 'WEBP', quality=82, alpha_quality=90, method=6)

# self-check: transparent corners, a solid island centre, the expected size
chk = np.asarray(Image.open(out))
assert chk.shape[1] == WIDTH and chk.shape[2] == 4, chk.shape
assert all(chk[y, x, 3] == 0 for y in (0, -1) for x in (0, -1)), 'a corner is not transparent'
assert (chk[..., 3] == 255).mean() > 0.4, 'island covers too little of the frame'
assert os.path.getsize(out) < 300_000, os.path.getsize(out)
print('%s %dx%d %d bytes' % (out, chk.shape[1], chk.shape[0], os.path.getsize(out)))
