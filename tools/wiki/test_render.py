"""Self-test for render_models.py: python tools/wiki/test_render.py"""
import io
import json
import pathlib
import sys

import numpy as np
from PIL import Image

sys.path.insert(0, str(pathlib.Path(__file__).parent))
import render_models as rm  # noqa: E402

# A 2x2 texture: red, green / blue, white.
tex = Image.new("RGBA", (2, 2))
tex.putdata([(255, 0, 0, 255), (0, 255, 0, 255), (0, 0, 255, 255), (255, 255, 255, 255)])
buf = io.BytesIO()
tex.save(buf, "PNG")
FILES = {
    "plugins/ItemsAdder/contents/t/resourcepack/t/models/cube.json": json.dumps({
        "parent": "t:base", "textures": {"all": "t:tex"}}).encode(),
    "plugins/ItemsAdder/contents/t/resourcepack/t/models/base.json": json.dumps({
        "textures": {"0": "#all"},
        "elements": [{"from": [4, 4, 4], "to": [12, 12, 12],
                      "faces": {f: {"uv": [0, 0, 16, 16], "texture": "#0"} for f in rm.FACES}}]}).encode(),
    "plugins/ItemsAdder/contents/t/resourcepack/t/textures/tex.png": buf.getvalue(),
}
show = FILES.get

model = rm.load_model(show, "cube", "t")
assert model and model["textures"]["all"] == "t:tex"
a, b = rm.png_bytes(rm.render(model, show)), rm.png_bytes(rm.render(model, show))
assert a == b, "render is not deterministic"
im = Image.open(io.BytesIO(a))
assert im.size == (rm.SIZE, rm.SIZE) and im.mode == "RGBA"
px = np.asarray(im)
assert (px[..., 3] > 0).sum() > rm.SIZE * rm.SIZE // 4, "cube renders (mostly) empty"
assert all(im.getpixel(c)[3] == 0 for c in ((0, 0), (rm.SIZE - 1, 0), (0, rm.SIZE - 1), (rm.SIZE - 1, rm.SIZE - 1)))
assert len({tuple(c) for c in px[px[..., 3] > 0][:, :3]}) >= 4, "texture not sampled"

# A vanilla parent with no elements in the pack is not drawn.
assert rm.load_model(lambda p: json.dumps({"parent": "minecraft:item/elytra"}).encode(), "wings", "t") is None

# Paths that leave the pack are refused.
for bad in ("../../config", "t:../x", "/etc/x", "t:a/../../b", "T:Upper"):
    try:
        rm.pack_path(bad, "models", ".json", "t")
    except rm.RenderError:
        pass
    else:
        raise AssertionError(f"{bad!r} accepted")
assert rm.pack_path("t:animated/a1", "textures", ".png", "x")[1] == "plugins/ItemsAdder/contents/t/resourcepack/t/textures/animated/a1.png"
# A run into a scratch folder leaves the repo manifest as it is.
import tempfile  # noqa: E402
before = open(rm.MANIFEST, "rb").read() if pathlib.Path(rm.MANIFEST).exists() else None
with tempfile.TemporaryDirectory() as scratch:
    rm.main(["--out", scratch])
    assert any(pathlib.Path(scratch).glob("*.png")), "scratch run rendered nothing"
assert (open(rm.MANIFEST, "rb").read() if pathlib.Path(rm.MANIFEST).exists() else None) == before, "scratch run rewrote the manifest"
print("test_render: PASS")
