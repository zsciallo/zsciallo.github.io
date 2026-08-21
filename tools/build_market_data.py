"""Stand-in for the Auction Tracker plugin's HTTP surface.

Reads DonutAuctionHouse's SQLite database directly and writes the same JSON
documents the plugin is specced to serve, so the marketplace front end can be
built and evaluated before any of the plugin exists. The document shapes here
are the contract: when the plugin ships, the front end changes one base URL and
nothing else.

  python tools/build_market_data.py [--db PATH] [--out DIR]

With no --db it reads whichever known snapshot of auctions.db is newest; see
DB_LOCATIONS.

Everything this script derives is derivable by the plugin too, with one
exception noted at `floor_series`: floor-over-time is reconstructed here by
replaying historical listing windows, whereas the plugin will observe it live.
"""

import argparse
import base64
import glob
import hashlib
import io
import json
import os
import re
import shutil
import sqlite3
import statistics
import sys
import time
from collections import defaultdict

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import javaobj.v2 as javaobj
from javaobj.v2.beans import JavaArray, JavaInstance, JavaString
from javaobj.v2.transformers import DefaultObjectTransformer

from snbt import parse as snbt

HOUR = 3600_000
DAY = 24 * HOUR

# Below this many sales in a week, a percent change is noise rather than a
# trend, and the front end is told so with a null.
MIN_TREND_SALES = 2

# Components that describe an individual copy of an item rather than what the
# item *is*. Leaving these in would split every market into one-of-a-kind rows.
STRIP_COMPONENTS = {
    "minecraft:damage",          # durability - a worn pickaxe is the same pickaxe
    "minecraft:repair_cost",     # anvil bookkeeping, climbs with every repair
    "minecraft:map_id",          # every filled map is its own id by definition
    "minecraft:map_decorations",
    "minecraft:map_color",
}

_TRANSFORMER = DefaultObjectTransformer()


# -- Java deserialization ----------------------------------------------------
# item_data is a Base64 BukkitObjectOutputStream frame: a Wrapper holding the
# ItemStack's ConfigurationSerializable map. We only need to understand the
# handful of classes Bukkit actually emits.

def _norm(o):
    if isinstance(o, JavaString):
        return str(o)
    if isinstance(o, (str, int, float, bool)) or o is None:
        return o
    if isinstance(o, JavaArray):
        return [_norm(x) for x in o]
    if isinstance(o, dict):
        return {_norm(k): _norm(v) for k, v in o.items()}
    if isinstance(o, (list, tuple)):
        return [_norm(x) for x in o]
    if isinstance(o, JavaInstance):
        name = o.classdesc.name
        flat = {f.name: v for _, fields in o.field_data.items() for f, v in fields.items()}
        if name.startswith("java.lang.") and "value" in flat:
            return _norm(flat["value"])
        if name == "org.bukkit.util.io.Wrapper":
            return _norm(flat.get("map"))
        if name == "com.google.common.collect.ImmutableMap$SerializedForm":
            return dict(zip(_norm(flat["keys"]), _norm(flat["values"])))
        return {"__class__": name}
    return repr(o)


def decode_item(b64):
    return _norm(javaobj.load(io.BytesIO(base64.b64decode(b64)), _TRANSFORMER))


# -- Item identity -----------------------------------------------------------

def item_key(item):
    """Stable market key: the material id, plus a digest when the item carries
    identity-bearing components. Working from the serialized component map
    rather than a hand-written field list means custom enchants, trims and
    anything a future plugin stamps on an item are covered without enumeration.
    """
    material = item.get("id", "minecraft:air")
    components = {
        k: v for k, v in (item.get("components") or {}).items()
        if k not in STRIP_COMPONENTS
    }
    if not components:
        return material, True
    canonical = json.dumps(components, sort_keys=True, ensure_ascii=False)
    digest = hashlib.sha256(canonical.encode("utf-8")).hexdigest()[:12]
    return f"{material}#{digest}", False


# -- Display fields ----------------------------------------------------------

_SECTION_CODES = re.compile(r"[\u00a7&][0-9a-fk-orA-FK-OR]")


def prettify(identifier):
    return identifier.split(":")[-1].replace("_", " ").title()


def component_text(value):
    """Flatten a Minecraft text component into a plain string.

    Names and lore arrive as nested {text, extra:[...]} trees carrying colour
    and style. The front end wants the words; styling is dropped here rather
    than shipped and stripped in the browser.
    """
    parsed = snbt(value) if isinstance(value, str) else value
    out = []

    def walk(node):
        if isinstance(node, str):
            out.append(node)
        elif isinstance(node, list):
            for child in node:
                walk(child)
        elif isinstance(node, dict):
            if isinstance(node.get("text"), str):
                out.append(node["text"])
            elif isinstance(node.get("translate"), str):
                out.append(prettify(node["translate"].split(".")[-1]))
            for child in node.get("extra") or []:
                walk(child)

    walk(parsed)
    return _SECTION_CODES.sub("", "".join(out)).strip()


def enchant_list(raw):
    parsed = snbt(raw)
    if not isinstance(parsed, dict):
        return []
    return sorted(
        ({"id": k.split(":")[-1], "level": int(v)}
         for k, v in parsed.items() if isinstance(v, (int, float))),
        key=lambda e: e["id"],
    )


def container_summary(raw):
    """Shulker boxes are traded for what is inside them, so the detail view
    needs the contents. Returns aggregated {id, name, count} rows."""
    parsed = snbt(raw)
    if not isinstance(parsed, list):
        return []
    totals = defaultdict(int)
    for slot in parsed:
        if not isinstance(slot, dict):
            continue
        inner = slot.get("item")
        if isinstance(inner, dict):
            totals[inner.get("id", "minecraft:air")] += int(inner.get("count", 1) or 1)
    return [
        {"id": k, "name": prettify(k), "count": v}
        for k, v in sorted(totals.items(), key=lambda kv: -kv[1])
    ]


_ROMAN = [(10, "X"), (9, "IX"), (5, "V"), (4, "IV"), (1, "I")]


def roman(n):
    if not 0 < n < 40:
        return str(n)
    out = ""
    for value, sym in _ROMAN:
        while n >= value:
            out += sym
            n -= value
    return out


def describe(item):
    """Everything the front end needs to render an item without decoding it."""
    components = item.get("components") or {}
    material = item.get("id", "minecraft:air")

    custom = components.get("minecraft:custom_name") or components.get("minecraft:item_name")
    name = component_text(custom) if custom else ""
    enchants = enchant_list(components.get("minecraft:enchantments", "{}"))
    stored = enchant_list(components.get("minecraft:stored_enchantments", "{}"))

    # An enchanted book *is* its stored enchantments - without them in the name
    # every book in the market reads "Enchanted Book".
    if not name and stored:
        name = ", ".join(f"{prettify(e['id'])} {roman(e['level'])}" for e in stored)
    if not name:
        name = prettify(material)

    lore_raw = components.get("minecraft:lore")
    lore = []
    if lore_raw:
        for line in (snbt(lore_raw) or []):
            text = component_text(line)
            if text:
                lore.append(text)

    trim = snbt(components["minecraft:trim"]) if "minecraft:trim" in components else None
    potion = snbt(components["minecraft:potion_contents"]) if "minecraft:potion_contents" in components else None

    return {
        "material": material,
        "materialName": prettify(material),
        "name": name,
        "custom": bool(custom),
        "enchants": enchants,
        "storedEnchants": stored,
        "lore": lore[:8],
        "contents": container_summary(components.get("minecraft:container", "[]")),
        "trim": (
            {"material": prettify(trim.get("material", "")), "pattern": prettify(trim.get("pattern", ""))}
            if isinstance(trim, dict) else None
        ),
        "potion": (
            prettify(potion.get("potion", ""))
            if isinstance(potion, dict) and potion.get("potion") else None
        ),
        "components": sorted(k.split(":")[-1] for k in components),
    }


# -- Aggregation -------------------------------------------------------------

def vwap(sales):
    """Volume-weighted average unit price - one sale of 64 should not count the
    same as one sale of 1."""
    qty = sum(s["count"] for s in sales)
    return sum(s["unitPrice"] * s["count"] for s in sales) / qty if qty else None


def bucket(sales, size):
    """Fold sales into fixed time buckets, one row each."""
    groups = defaultdict(list)
    for s in sales:
        groups[(s["at"] // size) * size].append(s)
    rows = []
    for t in sorted(groups):
        group = groups[t]
        prices = [s["unitPrice"] for s in group]
        qty = sum(s["count"] for s in group)
        gross = sum(s["unitPrice"] * s["count"] for s in group)
        rows.append({
            "t": t,
            "lo": round(min(prices), 2),
            "hi": round(max(prices), 2),
            "vwap": round(gross / qty, 2) if qty else round(statistics.fmean(prices), 2),
            "med": round(statistics.median(prices), 2),
            "n": len(group),
            "qty": qty,
        })
    return rows


def floor_series(windows, start, end, step=DAY):
    """Reconstruct floor-over-time by replaying listing windows.

    The plugin will *observe* the floor once per poll, because "what was the
    floor last Tuesday" is not answerable from a live table. Here we can cheat:
    every historical row records when it was listed and when it left the
    market, so the set of listings live at any past instant is recoverable.
    Same shape as what the plugin will emit; different provenance.
    """
    if not windows or end <= start:
        return []
    rows = []
    t = (start // step) * step
    while t <= end:
        live = [w for w in windows if w["from"] <= t < w["to"]]
        if live:
            rows.append({
                "t": t,
                "floor": round(min(w["unitPrice"] for w in live), 2),
                "listings": len(live),
                "quantity": sum(w["count"] for w in live),
            })
        t += step
    return rows


# -- Output ------------------------------------------------------------------

def safe(key):
    """Item keys are already URL-safe; this only flattens them for a filename."""
    return key.replace(":", "_").replace("#", "__")


def write(out, name, payload):
    with open(os.path.join(out, name), "w", encoding="utf-8") as fh:
        json.dump(payload, fh, separators=(",", ":"))


# Where a fresh export of the auction database turns up. Fresh copies are
# downloaded from the host, and the browser renames duplicates - "auctions.db",
# then "auctions (1).db", and so on - so match the pattern and take whichever
# file is newest rather than pinning a name that goes stale on the next export.
DB_LOCATIONS = [
    os.path.expanduser(r"~\Downloads\auctions*.db"),
    r"F:\Work\mc-server\plugins\DonutAuctionHouse\auctions.db",
]


def newest_db():
    found = [p for pattern in DB_LOCATIONS for p in glob.glob(pattern)]
    if not found:
        return DB_LOCATIONS[-1]
    return max(found, key=os.path.getmtime)


def main():
    here = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    ap = argparse.ArgumentParser()
    ap.add_argument("--db", default=newest_db(), help="auctions.db to read (default: newest known snapshot)")
    ap.add_argument("--out", default=os.path.join(here, "public", "market"))
    args = ap.parse_args()

    fetched_at = int(time.time() * 1000)
    conn = sqlite3.connect(f"file:{args.db.replace(os.sep, '/')}?mode=ro", uri=True)
    conn.execute("PRAGMA query_only=1")
    rows = conn.execute(
        "SELECT auction_id, seller_uuid, item_data, price, listing_time,"
        " expiration_time, sold_time, status FROM auctions"
    ).fetchall()
    print(f"[market] {len(rows)} rows from {args.db}")

    # Decoding dominates runtime and repeat listings are common, so cache on
    # the raw blob. The plugin will do the same thing for the same reason.
    cache = {}
    items = {}
    sales = defaultdict(list)
    windows = defaultdict(list)
    active = defaultdict(list)
    sellers = defaultdict(lambda: {"active": 0, "sold": 0, "keys": set()})
    # The newest event in the table, used as the reference point for every
    # relative window below. Deliberately not wall-clock: windows should be
    # measured against the data, not against when the script happened to run.
    # Freshness of the pull itself is fetched_at, reported separately.
    now = 0
    failures = 0

    for auction_id, seller, blob, price, listed, expires, sold, status in rows:
        digest = hashlib.sha1(blob.encode()).hexdigest()
        if digest not in cache:
            try:
                cache[digest] = decode_item(blob)
            except Exception:
                cache[digest] = None
        item = cache[digest]
        if item is None:
            failures += 1
            continue

        key, fungible = item_key(item)
        count = max(1, int(item.get("count", 1) or 1))
        unit = price / count
        if key not in items:
            info = describe(item)
            info.update({"key": key, "fungible": fungible})
            items[key] = info

        now = max(now, listed, sold or 0)
        sellers[seller]["keys"].add(key)

        if status == "SOLD" and sold:
            sales[key].append({
                "auctionId": auction_id, "unitPrice": unit, "totalPrice": price,
                "count": count, "seller": seller, "at": sold,
            })
            sellers[seller]["sold"] += 1
            windows[key].append({"from": listed, "to": sold, "unitPrice": unit, "count": count})
        elif status == "ACTIVE":
            active[key].append({
                "unitPrice": unit, "totalPrice": price, "count": count,
                "seller": seller, "listedAt": listed, "expiresAt": expires,
            })
            sellers[seller]["active"] += 1
            windows[key].append({"from": listed, "to": expires, "unitPrice": unit, "count": count})
        elif status == "EXPIRED":
            # Never sold, but it was genuinely on the market for that window and
            # so belongs in floor history.
            windows[key].append({"from": listed, "to": expires, "unitPrice": unit, "count": count})

    if failures:
        print(f"[market] warning: {failures} rows failed to decode")

    earliest = min((s["at"] for group in sales.values() for s in group), default=now)

    # Clear only the per-item documents, which this script owns outright and
    # which go stale as keys come and go. The output directory also holds the
    # vendored icons from fetch_icons.py, so wiping it wholesale would silently
    # delete them and leave the page full of broken images.
    out_items = os.path.join(args.out, "items")
    shutil.rmtree(out_items, ignore_errors=True)
    os.makedirs(out_items, exist_ok=True)

    index = []
    for key, info in items.items():
        item_sales = sorted(sales[key], key=lambda s: s["at"])
        live = sorted(active[key], key=lambda l: l["unitPrice"])
        daily = bucket(item_sales, DAY)
        hourly = bucket([s for s in item_sales if s["at"] >= now - 30 * DAY], HOUR)
        floors = floor_series(windows[key], earliest, now)

        def since(days, _sales=item_sales):
            return [s for s in _sales if s["at"] >= now - days * DAY]

        s7, s30 = since(7), since(30)
        qty7 = sum(s["count"] for s in s7)
        gross7 = sum(s["unitPrice"] * s["count"] for s in s7)
        last = item_sales[-1] if item_sales else None

        # Week-over-week on volume-weighted price, not first-vs-last daily
        # median. Most of these markets trade a handful of times a week, and
        # comparing two single-sale days produces changes in the thousands of
        # percent that say nothing about the item. Both weeks need at least two
        # sales before we are willing to call it a trend at all.
        prior = [s for s in item_sales if now - 14 * DAY <= s["at"] < now - 7 * DAY]
        change = None
        if len(s7) >= MIN_TREND_SALES and len(prior) >= MIN_TREND_SALES:
            before = vwap(prior)
            after = vwap(s7)
            if before:
                change = round((after - before) / before * 100, 1)

        summary = {
            "key": key,
            "id": info["material"],
            "name": info["name"],
            "materialName": info["materialName"],
            "fungible": info["fungible"],
            "custom": info["custom"],
            "enchants": (info["enchants"] or info["storedEnchants"])[:6],
            "floor": round(live[0]["unitPrice"], 2) if live else None,
            "activeListings": len(live),
            "activeQuantity": sum(l["count"] for l in live),
            "lastSale": {"price": round(last["unitPrice"], 2), "at": last["at"]} if last else None,
            "sales24h": len(since(1)),
            "sales7d": len(s7),
            "sales30d": len(s30),
            "salesAll": len(item_sales),
            "quantity7d": qty7,
            "volume7d": round(gross7, 2),
            "volumeAll": round(sum(s["unitPrice"] * s["count"] for s in item_sales), 2),
            "vwap7d": round(gross7 / qty7, 2) if qty7 else None,
            "spark": [row["med"] for row in daily[-14:]],
            "changeWow": change,
        }
        index.append(summary)

        detail = dict(summary)
        detail.update({
            "lore": info["lore"],
            "storedEnchants": info["storedEnchants"],
            "contents": info["contents"],
            "trim": info["trim"],
            "potion": info["potion"],
            "components": info["components"],
            "history": {"hourly": hourly, "daily": daily, "floor": floors},
            "listings": live[:60],
            "recentSales": [
                {"unitPrice": round(s["unitPrice"], 2), "count": s["count"],
                 "seller": s["seller"], "at": s["at"]}
                for s in item_sales[::-1][:60]
            ],
        })
        write(out_items, f"{safe(key)}.json", detail)

    index.sort(key=lambda s: (-s["salesAll"], s["key"]))
    write(args.out, "index.json", {
        "generatedAt": now,
        "fetchedAt": fetched_at,
        "itemCount": len(index),
        "items": index,
    })
    write(args.out, "meta.json", {
        "generatedAt": now,
        "fetchedAt": fetched_at,
        "source": "stand-in - auctions.db read directly",
        "schemaVersion": 1,
        "itemCount": len(index),
        "rowCount": len(rows),
        "activeListings": sum(len(v) for v in active.values()),
        "salesRecorded": sum(len(v) for v in sales.values()),
        "firstSale": earliest,
        "sellerCount": len(sellers),
    })
    write(args.out, "sellers.json", {
        "generatedAt": now,
        "sellers": sorted(
            ({"uuid": uuid, "active": v["active"], "sold": v["sold"], "keys": sorted(v["keys"])[:40]}
             for uuid, v in sellers.items()),
            key=lambda s: -s["active"],
        )[:200],
    })
    print(f"[market] wrote {len(index)} items to {args.out}")


if __name__ == "__main__":
    main()
