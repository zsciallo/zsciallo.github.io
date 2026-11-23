"""Vendor the item sprites the wiki shows into public/wiki/icons/.

Collects every material the wiki names: a page's "icon" (when it is a material, not a site path),
every {{icon:material}} token in page text, and every facts table's "icons" list. An ItemsAdder item id
(chromatic_chestplate) takes its flat item texture from the server's pack, read with `git show <ref>:...`
(3D-modelled items have a UV sheet, not a picture, so facts.py names their vanilla material instead).
Anything else is copied from art already in the repo when it is there (public/market/icons/,
public/store/icons/*/), else downloaded from the same sources as tools/fetch_icons.py. Vendoring rather
than hot-linking keeps the wiki free of a third-party runtime dependency.

  python tools/wiki/fetch_wiki_icons.py [--force] [--smp-ref REF]

Missing sprites are fine: the page renders nothing for a material without a file.
"""

import argparse
import glob
import json
import os
import re
import shutil
import subprocess
import sys

import yaml

HERE = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.path.join(HERE, "tools"))
from fetch_icons import download  # noqa: E402  same sources, same request headers

MATERIAL = re.compile(r"^[a-z0-9_]+$")
TOKEN = re.compile(r"\{\{icon:([a-z0-9_]+)\}\}")
SMP_REPO = "F:/Work/minecraft/mc-server"
IA_NAMESPACES = ("chromatic", "living_prism", "halloween", "shards", "clusters")
TEXTURE = re.compile(r"^[a-z0-9_]+$")  # one file in textures/: no folder (animated/), no ".."


def git_show(ref, path):
    """A file at the ref as bytes (binary-safe), else None."""
    r = subprocess.run(["git", "-C", SMP_REPO, "show", f"{ref}:{path}"], capture_output=True)
    return r.stdout if r.returncode == 0 else None


def ia_textures(ref):
    """{item id: pack path of its flat item texture} for the gear namespaces; armour layers and animations skipped."""
    found = {}
    for ns in IA_NAMESPACES:
        cfg = yaml.safe_load(git_show(ref, f"plugins/ItemsAdder/contents/{ns}/configs/{ns}.yml") or b"{}") or {}
        for iid, it in (cfg.get("items") or {}).items():
            tex = (it.get("resource") or {}).get("texture") or (it.get("graphics") or {}).get("texture")
            if MATERIAL.match(str(iid)) and isinstance(tex, str) and TEXTURE.match(tex) and "_layer_" not in tex:
                found[iid] = f"plugins/ItemsAdder/contents/{ns}/resourcepack/{ns}/textures/{tex}.png"
    return found


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
    ap.add_argument("--smp-ref", default="origin/main", help="mc-server ref the ItemsAdder textures are read at")
    args = ap.parse_args()

    local = [os.path.join(HERE, "public", "market", "icons")] + sorted(glob.glob(os.path.join(HERE, "public", "store", "icons", "*")))
    wanted = materials(args.pages, args.facts)
    os.makedirs(args.out, exist_ok=True)

    ia = ia_textures(args.smp_ref)
    copied = fetched = cached = vendored = 0
    missing, collisions = [], []
    for name in wanted:
        target = os.path.join(args.out, f"{name}.png")  # name matches MATERIAL, so the file stays in --out
        if name in ia:
            body = git_show(args.smp_ref, ia[name])
            if body is None or not body.startswith(b"\x89PNG"):
                missing.append(name)
            elif not os.path.exists(target):
                with open(target, "wb") as fh:
                    fh.write(body)
                vendored += 1
            elif open(target, "rb").read() == body:
                cached += 1
            else:
                collisions.append(name)  # never overwrite a different picture of the same name
            continue
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

    print(f"[wiki icons] {len(wanted)} materials - {vendored} from the ItemsAdder pack, {copied} copied from the repo, "
          f"{fetched} fetched, {cached} cached, {len(missing)} unavailable")
    if missing:
        print("[wiki icons] no sprite: " + ", ".join(missing))
    if collisions:
        print("[wiki icons] kept the existing file, it differs from the ItemsAdder texture: " + ", ".join(collisions))


if __name__ == "__main__":
    main()
