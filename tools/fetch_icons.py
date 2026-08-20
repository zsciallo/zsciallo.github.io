"""Vendor the item textures the marketplace needs.

Reads the materials named in the generated market index and pulls one sprite
per material into public/market/icons/. Vendoring rather than hot-linking keeps
the page free of a third-party runtime dependency and keeps the icons working
if the source disappears; the set is a few hundred PNGs of ~400 bytes each.

  python tools/fetch_icons.py [--force]

Missing sprites are fine - the front end falls back to a generated glyph tile,
so a material this source has never heard of still renders.
"""

import argparse
import json
import os
import urllib.error
import urllib.request

# Tried in order. No single version of this sprite set covers everything the
# server trades: 1.21.8 added dried ghasts and firefly bushes, while 1.21.4 is
# the broader base. Items newer than both (spears, nautilus armor, sulfur) have
# no sprite anywhere yet and fall through to the glyph tile.
SOURCES = [
    "https://mc.nerothe.com/img/1.21.8/minecraft_{name}.png",
    "https://mc.nerothe.com/img/1.21.4/minecraft_{name}.png",
]
HEADERS = {"User-Agent": "chromabit-market-icons/1.0"}


def download(name):
    for template in SOURCES:
        request = urllib.request.Request(template.format(name=name), headers=HEADERS)
        try:
            with urllib.request.urlopen(request, timeout=20) as response:
                body = response.read()
        except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError):
            continue
        if body.startswith(b"\x89PNG"):
            return body
    return None


def main():
    here = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    ap = argparse.ArgumentParser()
    ap.add_argument("--index", default=os.path.join(here, "public", "market", "index.json"))
    ap.add_argument("--out", default=os.path.join(here, "public", "market", "icons"))
    ap.add_argument("--force", action="store_true", help="re-download sprites already on disk")
    args = ap.parse_args()

    with open(args.index, encoding="utf-8") as fh:
        materials = sorted({item["id"] for item in json.load(fh)["items"]})
    os.makedirs(args.out, exist_ok=True)

    fetched = skipped = missing = 0
    for material in materials:
        name = material.split(":")[-1]
        target = os.path.join(args.out, f"{name}.png")
        if os.path.exists(target) and not args.force:
            skipped += 1
            continue
        body = download(name)
        if body is None:
            missing += 1
            continue
        with open(target, "wb") as fh:
            fh.write(body)
        fetched += 1

    print(f"[icons] {len(materials)} materials - {fetched} fetched, {skipped} cached, {missing} unavailable")


if __name__ == "__main__":
    main()
