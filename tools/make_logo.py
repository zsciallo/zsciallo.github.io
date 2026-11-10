"""Write public/logo-512.png: an exact 8x nearest-neighbour upscale of the
64x64 server icon, for the Organization logo in the structured data (Google
ignores logos under 112x112). Nothing on the pages shows it.

  python tools/make_logo.py

Needs Pillow. Checks the result: downsampling it back (taking every 8th pixel)
and checking every 8x8 block is one colour gives the source exactly.
"""

import os

from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "public", "server-icon-old-2.png")
OUT = os.path.join(ROOT, "public", "logo-512.png")
SCALE = 8


def main():
    src = Image.open(SRC).convert("RGBA")
    w, h = src.size
    big = src.resize((w * SCALE, h * SCALE), Image.NEAREST)
    big.save(OUT, optimize=True)

    check = Image.open(OUT).convert("RGBA")
    assert check.size == (w * SCALE, h * SCALE), check.size
    sp, bp = src.load(), check.load()
    for y in range(h * SCALE):
        for x in range(w * SCALE):
            if bp[x, y] != sp[x // SCALE, y // SCALE]:
                raise SystemExit(f"pixel {x},{y} is {bp[x, y]}, want {sp[x // SCALE, y // SCALE]}")
    print(f"wrote {OUT} ({w * SCALE}x{h * SCALE}), exact {SCALE}x upscale of {w}x{h}")


if __name__ == "__main__":
    main()
