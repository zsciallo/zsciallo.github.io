"""Render the 3D-modelled ItemsAdder gear items to 64x64 wiki icons (public/wiki/icons/<item_id>.png).

Their pack textures are UV sheets, not pictures, so the item is drawn from its model the way the inventory shows it:
the model's `display.gui` pose (default 30, 225, 0 at 0.625 when it has none), orthographic, z-buffered, nearest
texture sampling, simple per-face shading, transparent background. Everything is read with `git show <ref>:<path>`
from mc-server; nothing is imported from the pack. A model whose parent is a vanilla model (elytra, plain materials)
cannot be drawn from the pack and keeps its vanilla icon.

  python tools/wiki/render_models.py [--smp-ref 63529705]

tools/wiki/rendered_icons.json lists item id -> model path for every icon this tool wrote; facts.py reads it, and a
rerun only overwrites files listed there.
"""
import argparse
import io
import json
import math
import os
import re
import subprocess
import sys

import numpy as np
import yaml
from PIL import Image

HERE = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SMP_REPO = "F:/Work/minecraft/mc-server"
NAMESPACES = ("chromatic", "living_prism", "halloween", "shards", "clusters")
MANIFEST = os.path.join(HERE, "tools", "wiki", "rendered_icons.json")
OUT = os.path.join(HERE, "public", "wiki", "icons")
NAME = re.compile(r"^[a-z0-9_]+$")
REF = re.compile(r"^(?:([a-z0-9_]+):)?([a-z0-9_]+(?:/[a-z0-9_]+)*)$")  # ns:path, no "..", no leading "/"
SIZE = 64
DEFAULT_GUI = {"rotation": [30, 225, 0], "translation": [0, 0, 0], "scale": [0.625, 0.625, 0.625]}

# Corners of each face, (top-left, top-right, bottom-right, bottom-left) as seen from outside; 0 = from, 1 = to.
FACES = {
    "north": ((1, 1, 0), (0, 1, 0), (0, 0, 0), (1, 0, 0)),
    "south": ((0, 1, 1), (1, 1, 1), (1, 0, 1), (0, 0, 1)),
    "east": ((1, 1, 1), (1, 1, 0), (1, 0, 0), (1, 0, 1)),
    "west": ((0, 1, 0), (0, 1, 1), (0, 0, 1), (0, 0, 0)),
    "up": ((0, 1, 0), (1, 1, 0), (1, 1, 1), (0, 1, 1)),
    "down": ((0, 0, 1), (1, 0, 1), (1, 0, 0), (0, 0, 0)),
}


class RenderError(Exception):
    pass


def pack_path(ref, kind, ext, default_ns):
    """'chromatic:animated/a1' -> plugins/ItemsAdder/contents/chromatic/resourcepack/chromatic/<kind>/animated/a1<ext>."""
    m = REF.match(str(ref))
    if not m:
        raise RenderError(f"refused path {ref!r}")
    ns = m.group(1) or default_ns
    return ns, f"plugins/ItemsAdder/contents/{ns}/resourcepack/{ns}/{kind}/{m.group(2)}{ext}"


def default_uv(face, f, t):
    x1, y1, z1 = f
    x2, y2, z2 = t
    return {"north": [16 - x2, 16 - y2, 16 - x1, 16 - y1], "south": [x1, 16 - y2, x2, 16 - y1],
            "east": [16 - z2, 16 - y2, 16 - z1, 16 - y1], "west": [z1, 16 - y2, z2, 16 - y1],
            "up": [x1, z1, x2, z2], "down": [x1, 16 - z2, x2, 16 - z1]}[face]


def rot_matrix(axis, deg):
    a = math.radians(deg)
    c, s = math.cos(a), math.sin(a)
    return {"x": np.array([[1, 0, 0], [0, c, -s], [0, s, c]]),
            "y": np.array([[c, 0, s], [0, 1, 0], [-s, 0, c]]),
            "z": np.array([[c, -s, 0], [s, c, 0], [0, 0, 1]])}[axis]


def load_model(show, ref, default_ns):
    """The model with in-pack parents merged in; None when a parent is outside the pack (a vanilla model)."""
    model, seen = {}, set()
    while ref:
        if str(ref).startswith("minecraft:") or str(ref).startswith("item/") or str(ref).startswith("block/"):
            return None if "elements" not in model else model
        ns, path = pack_path(ref, "models", ".json", default_ns)
        if path in seen:
            raise RenderError(f"parent loop at {path}")
        seen.add(path)
        raw = show(path)
        if raw is None:
            raise RenderError(f"no {path}")
        data = json.loads(raw.decode("utf-8"))
        for k, v in data.items():
            if k == "textures":
                model["textures"] = {**v, **model.get("textures", {})}
            elif k == "display":
                model["display"] = {**v, **model.get("display", {})}
            elif k not in model:
                model[k] = v
        model.setdefault("_ns", ns)
        ref = data.get("parent")
    return model if model.get("elements") else None


def texture(show, textures, key, default_ns, cache):
    """A face's '#key' resolved through the textures map to an RGBA array (first frame of an animation)."""
    ref, hops = key, 0
    while str(ref).startswith("#"):
        ref = textures.get(ref[1:])
        hops += 1
        if ref is None or hops > 8:
            return None
    if ref not in cache:
        _, path = pack_path(ref, "textures", ".png", default_ns)
        raw = show(path)
        if raw is None:
            cache[ref] = None
        else:
            im = Image.open(io.BytesIO(raw)).convert("RGBA")
            if im.height > im.width and im.height % im.width == 0:
                im = im.crop((0, 0, im.width, im.width))  # animated strip: first frame
            cache[ref] = np.asarray(im)
    return cache[ref]


def render(model, show, size=SIZE):
    """RGBA image of the model in its GUI pose."""
    gui = {**DEFAULT_GUI, **((model.get("display") or {}).get("gui") or {})}
    rx, ry, rz = (gui.get("rotation") or [0, 0, 0])
    R = rot_matrix("x", rx) @ rot_matrix("y", ry) @ rot_matrix("z", rz)
    S = np.array(gui.get("scale") or [1, 1, 1], dtype=float)
    T = np.array(gui.get("translation") or [0, 0, 0], dtype=float) / 16
    cache, ns = {}, model.get("_ns")
    img = np.zeros((size, size, 4), dtype=np.uint8)
    zbuf = np.full((size, size), -np.inf)

    def pose(p):
        return T + R @ (S * ((np.asarray(p, dtype=float) - 8) / 16))

    def warp_of(el):
        rot = el.get("rotation")
        if not (rot and rot.get("angle")):
            return lambda p: p
        M = rot_matrix(rot["axis"], rot["angle"])
        if rot.get("rescale"):
            k = 1 / math.cos(math.radians(abs(rot["angle"])))
            M = M @ np.diag([1 if rot["axis"] == a else k for a in "xyz"])
        o = np.array(rot.get("origin", [8, 8, 8]), dtype=float)
        return lambda p: M @ (p - o) + o

    # Fit the whole posed model in the frame (a few models reach past the 16 px slot), keeping it square.
    pts = np.array([pose(warp_of(el)(np.where(np.array(c) == 1, np.array(el["to"], float), np.array(el["from"], float))))
                    for el in model["elements"] for c in FACES["north"] + FACES["south"]])
    lo, hi = pts[:, :2].min(axis=0), pts[:, :2].max(axis=0)
    centre, span = (lo + hi) / 2, max(hi - lo) * 1.04 or 1.0

    def to_screen(p):
        q = pose(p)
        return np.array([(q[0] - centre[0]) / span, (q[1] - centre[1]) / span, q[2]])

    ys, xs = np.mgrid[0:size, 0:size]
    px, py = (xs + 0.5) / size - 0.5, 0.5 - (ys + 0.5) / size  # pixel centres in frame units, y up

    for el in model["elements"]:
        f, t = np.array(el["from"], dtype=float), np.array(el["to"], dtype=float)
        warp = warp_of(el)
        for face, fd in sorted((el.get("faces") or {}).items()):
            tex = texture(show, model.get("textures") or {}, fd.get("texture", ""), ns, cache)
            if tex is None:
                continue
            corners = [to_screen(warp(np.where(np.array(c) == 1, t, f))) for c in FACES[face]]
            u1, v1, u2, v2 = fd.get("uv") or default_uv(face, f, t)
            uvs = [(u1, v1), (u2, v1), (u2, v2), (u1, v2)]
            k = int(fd.get("rotation", 0)) // 90 % 4
            uvs = uvs[-k:] + uvs[:-k] if k else uvs
            p0, p1, p3 = corners[0], corners[1], corners[3]
            e1, e2 = p1 - p0, p3 - p0
            normal = np.cross(e2, e1)  # outward for the corner order above
            if normal[2] <= 1e-9:
                continue  # facing away (or edge on)
            n = normal / np.linalg.norm(normal)
            shade = (1.0 * max(n[1], 0) + 0.5 * max(-n[1], 0) + 0.8 * abs(n[2]) + 0.6 * abs(n[0])) / (abs(n[0]) + abs(n[1]) + abs(n[2]))
            det = e1[0] * e2[1] - e1[1] * e2[0]
            if abs(det) < 1e-12:
                continue
            xs4 = [c[0] for c in corners]
            ys4 = [c[1] for c in corners]
            c0 = max(int(math.floor((min(xs4) + 0.5) * size)), 0)
            c1 = min(int(math.ceil((max(xs4) + 0.5) * size)), size)
            r0 = max(int(math.floor((0.5 - max(ys4)) * size)), 0)
            r1 = min(int(math.ceil((0.5 - min(ys4)) * size)), size)
            if c0 >= c1 or r0 >= r1:
                continue
            dx, dy = px[r0:r1, c0:c1] - p0[0], py[r0:r1, c0:c1] - p0[1]
            s = (dx * e2[1] - dy * e2[0]) / det
            q = (e1[0] * dy - e1[1] * dx) / det
            inside = (s >= 0) & (s <= 1) & (q >= 0) & (q <= 1)
            if not inside.any():
                continue
            z = p0[2] + s * e1[2] + q * e2[2]
            uv0, uv1, uv3 = (np.array(uvs[i], dtype=float) for i in (0, 1, 3))
            u = uv0[0] + s * (uv1[0] - uv0[0]) + q * (uv3[0] - uv0[0])
            v = uv0[1] + s * (uv1[1] - uv0[1]) + q * (uv3[1] - uv0[1])
            h, w = tex.shape[:2]
            ti = np.clip((u / 16 * w).astype(int), 0, w - 1)
            tj = np.clip((v / 16 * h).astype(int), 0, h - 1)
            texel = tex[tj, ti]
            ok = inside & (texel[..., 3] > 0) & (z > zbuf[r0:r1, c0:c1])
            if not ok.any():
                continue
            rgb = np.clip(texel[..., :3].astype(float) * shade, 0, 255).astype(np.uint8)
            block = img[r0:r1, c0:c1]
            block[ok, :3] = rgb[ok]
            block[ok, 3] = texel[..., 3][ok]
            zbuf[r0:r1, c0:c1][ok] = z[ok]
    return Image.fromarray(img, "RGBA")


def png_bytes(im):
    buf = io.BytesIO()
    im.save(buf, "PNG", optimize=False)
    return buf.getvalue()


def model_items(show):
    """(item id, namespace, model ref) for every gear namespace item that has a model and no flat texture."""
    out = []
    for ns in NAMESPACES:
        raw = show(f"plugins/ItemsAdder/contents/{ns}/configs/{ns}.yml")
        cfg = yaml.safe_load(raw.decode("utf-8")) if raw else {}
        for iid, it in sorted(((cfg or {}).get("items") or {}).items()):
            res, gr = it.get("resource") or {}, it.get("graphics") or {}
            if res.get("texture") or gr.get("texture") or not (res.get("material") or it.get("material")):
                continue  # flat picture already, or not an item (a placed block)
            ref = res.get("model_path") or gr.get("model") or (gr.get("models") or {}).get("normal")
            if ref and NAME.match(str(iid)):
                out.append((iid, ns, ref))
    return out


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--smp-ref", default="63529705")
    ap.add_argument("--out", default=OUT)
    a = ap.parse_args(argv)

    def show(path):
        r = subprocess.run(["git", "-C", SMP_REPO, "show", f"{a.smp_ref}:{path}"], capture_output=True)
        return r.stdout if r.returncode == 0 else None

    manifest = json.load(open(MANIFEST, encoding="utf-8")) if os.path.exists(MANIFEST) else {}
    os.makedirs(a.out, exist_ok=True)
    done, skipped, kept = {}, [], []
    for iid, ns, ref in model_items(show):
        try:
            model = load_model(show, ref, ns)
        except RenderError as e:
            skipped.append(f"{iid} ({e})")
            continue
        if model is None:
            skipped.append(f"{iid} (vanilla parent model, no elements in the pack)")
            continue
        body = png_bytes(render(model, show))
        target = os.path.join(a.out, f"{iid}.png")  # iid matches NAME: stays inside --out
        if os.path.exists(target) and iid not in manifest and open(target, "rb").read() != body:
            kept.append(iid)  # someone else's picture: never overwritten
            continue
        with open(target, "wb") as fh:
            fh.write(body)
        done[iid] = pack_path(ref, "models", ".json", ns)[1]
    with open(MANIFEST, "w", encoding="utf-8", newline="\n") as fh:
        json.dump(dict(sorted(done.items())), fh, indent=1)
        fh.write("\n")
    print(f"[render] {len(done)} rendered")
    for s in skipped:
        print(f"[render] skipped {s}")
    if kept:
        print("[render] kept an existing different file: " + ", ".join(kept))
    return 0


if __name__ == "__main__":
    sys.exit(main())
