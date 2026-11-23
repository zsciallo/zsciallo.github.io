"""Vendor the item sprites the wiki shows into public/wiki/icons/.

Collects every material the wiki names: a page's "icon" (when it is a material, not a site path),
every {{icon:material}} token in page text, and every facts table's "icons" list. Each sprite is
copied from art already in the repo when it is there (public/market/icons/, public/store/icons/*/),
else downloaded from the same sources as tools/fetch_icons.py. Vendoring rather than hot-linking
keeps the wiki free of a third-party runtime dependency.

  python tools/wiki/fetch_wiki_icons.py [--force]

Missing sprites are fine: the page renders nothing for a material without a file.
"""

import argparse
import glob
import json
import os
import re
import shutil
import sys

HERE = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.path.join(HERE, "tools"))
from fetch_icons import download  # noqa: E402  same sources, same request headers

MATERIAL = re.compile(r"^[a-z0-9_]+$")
TOKEN = re.compile(r"\{\{icon:([a-z0-9_]+)\}\}")


def strings(value):
    if isinstance(value, str):
        yield value
    elif isinstance(value, list):
        for v in value:
            yield from strings(v)
    elif isinstance(value, dict):
        for v in value.values():
            yield from strings(v)


def materials(pages_dir, facts_dir):
    found = set()
    for path in glob.glob(os.path.join(pages_dir, "*", "*.json")):
        with open(path, encoding="utf-8") as fh:
            page = json.load(fh)
        if MATERIAL.match(page.get("icon") or ""):
            found.add(page["icon"])
        for s in strings(page):
            found |= set(TOKEN.findall(s))
    for path in glob.glob(os.path.join(facts_dir, "*.json")):
        with open(path, encoding="utf-8") as fh:
            found |= {m for m in json.load(fh).get("icons") or [] if m and MATERIAL.match(m)}
    return sorted(found)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--pages", default=os.path.join(HERE, "src", "wiki", "pages"))
    ap.add_argument("--facts", default=os.path.join(HERE, "src", "wiki", "facts"))
    ap.add_argument("--out", default=os.path.join(HERE, "public", "wiki", "icons"))
    ap.add_argument("--force", action="store_true", help="re-fetch sprites already on disk")
    args = ap.parse_args()

    local = [os.path.join(HERE, "public", "market", "icons")] + sorted(glob.glob(os.path.join(HERE, "public", "store", "icons", "*")))
    wanted = materials(args.pages, args.facts)
    os.makedirs(args.out, exist_ok=True)

    copied = fetched = cached = 0
    missing = []
    for name in wanted:
        target = os.path.join(args.out, f"{name}.png")
        if os.path.exists(target) and not args.force:
            cached += 1
            continue
        source = next((os.path.join(d, f"{name}.png") for d in local if os.path.exists(os.path.join(d, f"{name}.png"))), None)
        if source:
            shutil.copyfile(source, target)
            copied += 1
            continue
        body = download(name)
        if body is None:
            missing.append(name)
            continue
        with open(target, "wb") as fh:
            fh.write(body)
        fetched += 1

    print(f"[wiki icons] {len(wanted)} materials - {copied} copied from the repo, {fetched} fetched, {cached} cached, {len(missing)} unavailable")
    if missing:
        print("[wiki icons] no sprite: " + ", ".join(missing))


if __name__ == "__main__":
    main()
