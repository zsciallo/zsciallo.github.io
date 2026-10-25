"""Pull the market documents from the API into public/market/.

The auction-house data is generated on the staff bot's box (discord-bot repo,
web/market_refresh.py) every few minutes and published as one tarball at
https://api.chromabit.us/market/snapshot.tar.gz. The site build downloads that
snapshot so the static /market/ copy on GitHub Pages - the fallback the browser
uses when the API is unreachable - matches what the API serves. No database
credentials are involved anywhere in the website build any more.

  python tools/fetch_market.py [--out public/market] [--api https://api.chromabit.us]

public/market/icons/ is committed and left untouched; everything else under
--out is replaced only after the download has been verified.
"""
import argparse
import io
import json
import os
import shutil
import sys
import tarfile
import tempfile
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
DEFAULT_OUT = os.path.join(os.path.dirname(HERE), "public", "market")
KEEP = {"icons"}
REQUIRED = ("index.json", "meta.json")


def download(url: str) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": "chromabit-site-build/1.0"})
    with urllib.request.urlopen(req, timeout=120) as response:
        return response.read()


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=DEFAULT_OUT)
    ap.add_argument("--api", default=os.environ.get("MARKET_API", "https://api.chromabit.us"))
    args = ap.parse_args()

    url = f"{args.api.rstrip('/')}/market/snapshot.tar.gz"
    print(f"[market] downloading {url}")
    data = download(url)
    print(f"[market] {len(data) / 1e6:.1f} MB")

    os.makedirs(os.path.dirname(os.path.abspath(args.out)), exist_ok=True)
    staging = tempfile.mkdtemp(prefix="market-", dir=os.path.dirname(os.path.abspath(args.out)))
    try:
        with tarfile.open(fileobj=io.BytesIO(data), mode="r:gz") as tar:
            tar.extractall(staging, filter="data")  # refuses absolute paths and ../ escapes
        for name in REQUIRED:
            with open(os.path.join(staging, name), encoding="utf-8") as handle:
                json.load(handle)
        meta = json.load(open(os.path.join(staging, "meta.json"), encoding="utf-8"))
        items = len(os.listdir(os.path.join(staging, "items"))) if os.path.isdir(os.path.join(staging, "items")) else 0
        if items == 0:
            raise SystemExit("[market] snapshot has no items/ - refusing to publish it")

        os.makedirs(args.out, exist_ok=True)
        for entry in os.listdir(args.out):
            if entry in KEEP:
                continue
            path = os.path.join(args.out, entry)
            shutil.rmtree(path) if os.path.isdir(path) else os.remove(path)
        for entry in os.listdir(staging):
            shutil.move(os.path.join(staging, entry), os.path.join(args.out, entry))
    finally:
        shutil.rmtree(staging, ignore_errors=True)

    print(f"[market] {items} items, generatedAt={meta.get('generatedAt')} -> {args.out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
