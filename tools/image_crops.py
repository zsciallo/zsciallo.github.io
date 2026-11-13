"""Crop boxes for store images whose art sits small in a big transparent canvas.

  python tools/image_crops.py          (needs Pillow: pip install pillow, in a venv outside the repo)
  Run by hand after a Prism Token image changes on Tebex; commit src/data/imageCrops.json.
  Not part of npm run build: the Tebex CDN sends no CORS header, so the browser cannot measure the art itself.

Reads the live Tebex categories (public Headless API, token from src/config.json),
takes only the packages of the categories in CROP_CATEGORY_IDS, downloads each
image and finds the art's bounding box without the soft drop shadow. Writes
src/data/imageCrops.json as { "<image URL>": { "w", "h", "box": [x0, y0, x1, y1] } },
sorted by URL, x1/y1 exclusive. src/lib/imageCrop.js turns an entry into the CSS
object-view-box that shows just the art (plus a small margin).

The shadow rule: a pixel is art when its alpha is at least ART_MIN_ALPHA and it is
coloured or bright (HSV saturation >= ART_MIN_SATURATION or value >= ART_MIN_VALUE,
on 0-255). The shadow is near-black and low-saturation, so it never counts, however
opaque it is; faint anti-aliased fringes below the alpha floor do not count either.
"""

import io
import json
import os
import sys
import urllib.request

from PIL import Image, ImageChops

# Only these Tebex categories get crops: 3501348 is Prism Tokens (PVP). SMP
# images are left exactly as they are (the owner asked about Prism Tokens only).
CROP_CATEGORY_IDS = [3501348]

ART_MIN_ALPHA = 64
ART_MIN_SATURATION = 60
ART_MIN_VALUE = 110
# An image whose art already spans this much of the canvas (in its larger
# relative extent) is left alone: cropping it would gain almost nothing.
MAX_EXTENT = 0.9

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CONFIG = os.path.join(ROOT, "src", "config.json")
OUT = os.path.join(ROOT, "src", "data", "imageCrops.json")
API = "https://headless.tebex.io/api/accounts/{token}/categories?includePackages=1"
HEADERS = {"User-Agent": "chromabit-image-crops/1.0", "Accept": "application/json"}


def fetch(url):
    req = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(req, timeout=60) as resp:
        return resp.read()


def mask(channel, threshold):
    return channel.point(lambda v: 255 if v >= threshold else 0)


def art_box(image):
    """The art's bounding box (x0, y0, x1, y1), x1/y1 exclusive, or None for an empty image."""
    rgba = image.convert("RGBA")
    alpha = rgba.getchannel("A")
    hsv = rgba.convert("RGB").convert("HSV")
    coloured = ImageChops.lighter(
        mask(hsv.getchannel("S"), ART_MIN_SATURATION),
        mask(hsv.getchannel("V"), ART_MIN_VALUE),
    )
    return ImageChops.multiply(mask(alpha, ART_MIN_ALPHA), coloured).getbbox()


def main():
    with open(CONFIG, encoding="utf-8") as f:
        token = json.load(f)["tebexToken"]
    categories = json.loads(fetch(API.format(token=token)))["data"]
    urls = []
    for cat in categories:
        if cat.get("id") in CROP_CATEGORY_IDS:
            urls += [p["image"] for p in cat.get("packages") or [] if p.get("image")]

    crops = {}
    for url in sorted(set(urls)):
        image = Image.open(io.BytesIO(fetch(url)))
        w, h = image.size
        box = art_box(image)
        if box is None:
            print(f"skip (no art found)  {url}")
            continue
        x0, y0, x1, y1 = box
        extent = max((x1 - x0) / w, (y1 - y0) / h)
        if extent >= MAX_EXTENT:
            print(f"skip (fills {extent:.2f})  {url}")
            continue
        crops[url] = {"w": w, "h": h, "box": [x0, y0, x1, y1]}
        print(f"crop {w}x{h} box {list(box)} extent {extent:.2f}  {url}")

    # One entry per line, sorted by URL, so a re-run diffs cleanly.
    lines = [f"  {json.dumps(url)}: {json.dumps(crops[url])}" for url in sorted(crops)]
    with open(OUT, "w", encoding="utf-8", newline="\n") as f:
        f.write("{\n" + ",\n".join(lines) + "\n}\n" if lines else "{}\n")
    print(f"wrote {len(crops)} entries to {os.path.relpath(OUT, ROOT)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
