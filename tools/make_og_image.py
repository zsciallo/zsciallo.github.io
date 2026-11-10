"""Render public/og-preview.png, the 1200x630 link-preview image.

Builds a small HTML card in the site's look (background #0c0718 with a soft
purple glow, the pixel logo scaled up without smoothing, the Teko and
Jersey 10 webfonts) and screenshots it with headless Chrome.

  python tools/make_og_image.py [--chrome PATH] [--out PATH]

Needs Chrome and a network connection (the fonts come from Google Fonts).
Pillow, when importable, is used only to confirm the output is 1200x630.
"""

import argparse
import base64
import os
import pathlib
import subprocess
import sys
import tempfile

ROOT = pathlib.Path(__file__).resolve().parent.parent
LOGO = ROOT / "public" / "server-icon-old-2.png"
OUT = ROOT / "public" / "og-preview.png"
CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe"
WIDTH, HEIGHT = 1200, 630

HTML = """<!DOCTYPE html>
<html><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Teko:wght@700&family=Jersey+10&display=swap" rel="stylesheet">
<style>
  html, body {{ margin: 0; width: {w}px; height: {h}px; overflow: hidden; }}
  body {{
    background:
      radial-gradient(ellipse 60% 70% at 50% 42%, rgba(154, 77, 255, 0.30), rgba(154, 77, 255, 0) 70%),
      radial-gradient(ellipse 40% 35% at 50% 100%, rgba(255, 125, 225, 0.10), rgba(255, 125, 225, 0) 70%),
      #0c0718;
    color: #f3ecff;
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    font-family: 'Jersey 10', sans-serif; text-align: center;
  }}
  .logo {{ width: 176px; height: 176px; image-rendering: pixelated;
           filter: drop-shadow(0 0 28px rgba(199, 125, 255, 0.45)); }}
  h1 {{ font-family: 'Teko', sans-serif; font-weight: 700; font-size: 112px; line-height: 0.9; white-space: nowrap;
        letter-spacing: 0.04em; margin: 30px 0 0; }}
  h1 span {{ background: linear-gradient(135deg, #c77dff, #ff7de1);
             -webkit-background-clip: text; background-clip: text; color: transparent; }}
  .sub {{ font-size: 44px; color: #f3ecff; margin-top: 10px; }}
  .ip {{ font-size: 38px; color: #a493c4; margin-top: 18px; letter-spacing: 0.02em; }}
  .ip b {{ color: #c77dff; font-weight: 400; }}
</style></head>
<body>
  <img class="logo" src="data:image/png;base64,{logo}" alt="">
  <h1>CHROMABIT <span>NETWORK</span></h1>
  <div class="sub">Ranked PVP + Economy SMP &middot; Java + Bedrock</div>
  <div class="ip">play.<b>chromabit</b>.us</div>
</body></html>
"""


def main():
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--chrome", default=os.environ.get("CHROME", CHROME))
    ap.add_argument("--out", default=str(OUT))
    args = ap.parse_args()

    logo = base64.b64encode(LOGO.read_bytes()).decode("ascii")
    out = pathlib.Path(args.out).resolve()
    with tempfile.TemporaryDirectory() as tmp:
        page = pathlib.Path(tmp) / "og.html"
        page.write_text(HTML.format(w=WIDTH, h=HEIGHT, logo=logo), encoding="utf-8")
        subprocess.run(
            [args.chrome, "--headless=new", "--hide-scrollbars", "--force-device-scale-factor=1",
             "--virtual-time-budget=8000", f"--user-data-dir={tmp}/profile",
             f"--window-size={WIDTH},{HEIGHT}", f"--screenshot={out}", page.as_uri()],
            check=True, capture_output=True,
        )

    try:
        from PIL import Image
    except ImportError:
        print(f"wrote {out}")
        return
    with Image.open(out) as im:
        if im.size != (WIDTH, HEIGHT):
            sys.exit(f"{out} is {im.size[0]}x{im.size[1]}, want {WIDTH}x{HEIGHT}")
    print(f"wrote {out} ({WIDTH}x{HEIGHT})")


if __name__ == "__main__":
    main()
