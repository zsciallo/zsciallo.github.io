"""Build the marketplace documents the auctions page reads.

Reads the auction house's own MySQL database and writes the JSON documents the
front end fetches. The plugin used to keep its state in a SQLite file that the
deploy copied off the game server; it now writes to MySQL, so this reads the
live tables and there is no snapshot to fetch or go stale. See tools/db.py for
where the connection settings come from.

  python tools/build_market_data.py [--out DIR]

Three documents come out of it, one per tab on the page:

  index.json / items/*.json  the auction house - cah_listing
  pools.json                 the liquidity pools - cah_market, cah_price_history,
                             cah_exchange_trade
  futures.json               the futures desk - cah_position, cah_house

Everything here is derivable by the plugin too, with one exception noted at
`floor_series`: floor-over-time is reconstructed by replaying historical listing
windows, whereas the plugin observes it live.
"""

import argparse
import base64
import hashlib
import io
import json
import os
import re
import shutil
import statistics
import sys
import time
from collections import defaultdict
from decimal import Decimal

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import javaobj.v2 as javaobj
from javaobj.v2.beans import JavaArray, JavaInstance, JavaString
from javaobj.v2.transformers import DefaultObjectTransformer

import db
from snbt import parse as snbt

HOUR = 3600_000
DAY = 24 * HOUR

# Below this many sales in a week, a percent change is noise rather than a
# trend, and the front end is told so with a null.
MIN_TREND_SALES = 2

# Listing states that put an item in front of buyers. CANCELLED joins them for
# floor history only - see `windows` in build_items.
LIVE = "ACTIVE"
SOLD = "SOLD"

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


def number(value):
    """MySQL DECIMAL arrives as Decimal, which json refuses to serialize."""
    if isinstance(value, Decimal):
        return float(value)
    return value


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

def item_key(item, item_type, variant):
    """Stable market key.

    The plugin groups its own markets by (item_type, variant), so those columns
    lead. They are not the whole story though: every enchanted book shares one
    item_type, and a Mending book and an Unbreaking book are not one market. So
    an item carrying identity-bearing components keeps the component digest the
    old SQLite build used. Working from the serialized component map rather than
    a hand-written field list means custom enchants, trims and anything a future
    plugin stamps on an item are covered without enumeration.
    """
    base = f"{item_type}~{variant}" if variant else item_type
    components = {
        k: v for k, v in ((item or {}).get("components") or {}).items()
        if k not in STRIP_COMPONENTS
    }
    if not components:
        return base, True
    canonical = json.dumps(components, sort_keys=True, ensure_ascii=False)
    digest = hashlib.sha256(canonical.encode("utf-8")).hexdigest()[:12]
    return f"{base}#{digest}", False


# -- Display fields ----------------------------------------------------------

_SECTION_CODES = re.compile(r"[§&][0-9a-fk-orA-FK-OR]")


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


def describe(item, item_type, variant, category):
    """Everything the front end needs to render an item without decoding it.

    item_type, variant and category come from the listing row rather than the
    blob: they are what the plugin itself indexes on, and they are populated
    even for the rows whose item_data fails to decode.
    """
    components = (item or {}).get("components") or {}

    custom = components.get("minecraft:custom_name") or components.get("minecraft:item_name")
    name = component_text(custom) if custom else ""
    enchants = enchant_list(components.get("minecraft:enchantments", "{}"))
    stored = enchant_list(components.get("minecraft:stored_enchantments", "{}"))

    # An enchanted book *is* its stored enchantments - without them in the name
    # every book in the market reads "Enchanted Book".
    if not name and stored:
        name = ", ".join(f"{prettify(e['id'])} {roman(e['level'])}" for e in stored)
    # Every spawner is a "Spawner" until the variant column says which mob.
    if not name and variant:
        name = f"{prettify(variant)} {prettify(item_type)}"
    if not name:
        name = prettify(item_type)

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
        "material": item_type,
        "materialName": prettify(item_type),
        "name": name,
        "variant": prettify(variant) if variant else None,
        "category": prettify(category) if category else None,
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


def change_over(series, value_of, now, span):
    """Percent move of a series against its own value `span` ago. The sample at
    or before that instant is the comparison point; a series that does not reach
    back that far has nothing to say and returns None."""
    if not series:
        return None
    cutoff = now - span
    earlier = [row for row in series if row["t"] <= cutoff]
    if not earlier:
        return None
    before = value_of(earlier[-1])
    after = value_of(series[-1])
    if not before:
        return None
    return round((after - before) / before * 100, 1)


def thin(series, cap):
    """Keep a series under `cap` points by dropping evenly across it, always
    keeping the newest. Pool prices are sampled per trade and per tick, so an
    old market accumulates far more detail than a chart can draw."""
    if len(series) <= cap:
        return series
    stride = len(series) / cap
    kept = [series[int(i * stride)] for i in range(cap)]
    if kept[-1] is not series[-1]:
        kept[-1] = series[-1]
    return kept


def window(series, trades, now, span):
    """The samples and trades inside the trailing `span`, as candles() wants
    them. Finer grains are capped so an old market does not ship a year of
    detail no chart will draw."""
    return ([row for row in series if row["t"] >= now - span],
            [trade for trade in trades if trade["at"] >= now - span])


def candles(series, trades, size):
    """Open/high/low/close of the quoted mid per bucket, with what traded in it.

    Built from the full sample series rather than the thinned one the line view
    draws: thinning drops points evenly, and the points it drops are exactly the
    highs and lows a candle exists to show.

    A bucket opens where the previous one closed, not at its own first sample.
    The mid is a standing quote that persists between samples rather than a
    fresh reading each hour, so the move from the last close into this bucket is
    part of this bucket. Opening at the first sample instead throws that move
    away: an hour with a single sample would collapse to a dot, and nothing
    would ever print a wick, because within one bucket the mid only ever walks
    one way.

    A bucket appears only if the mid was sampled in it. Every trade moves the
    mid and every move is sampled, so a bucket with trades always has samples -
    the reverse is not true, and a quiet hour is a candle with no volume.
    """
    grouped = defaultdict(list)
    for row in series:
        grouped[(row["t"] // size) * size].append(row)

    volume = defaultdict(lambda: {"units": 0, "gross": 0.0, "n": 0})
    for trade in trades:
        into = volume[(trade["at"] // size) * size]
        into["units"] += trade["units"]
        into["gross"] += trade["gross"]
        into["n"] += 1

    rows = []
    previous = None
    for t in sorted(grouped):
        mids = [row["mid"] for row in grouped[t]]
        opened = mids[0] if previous is None else previous
        marks = [opened] + mids
        traded = volume.get(t)
        previous = mids[-1]
        rows.append({
            "t": t,
            "o": opened,
            "h": max(marks),
            "l": min(marks),
            "c": mids[-1],
            "units": traded["units"] if traded else 0,
            "gross": round(traded["gross"], 2) if traded else 0,
            "n": traded["n"] if traded else 0,
        })
    return rows


# -- Output ------------------------------------------------------------------

def safe(key):
    """Item keys are already URL-safe; this only flattens them for a filename."""
    return key.replace(":", "_").replace("#", "__").replace("~", "-")


def write(out, name, payload):
    with open(os.path.join(out, name), "w", encoding="utf-8") as fh:
        json.dump(payload, fh, separators=(",", ":"))


# -- The auction house -------------------------------------------------------

LISTINGS_SQL = """
    SELECT id, seller, item_data, item_type, variant, item_amount, category,
           price, state, created_at, expires_at, sold_at
      FROM cah_listing
"""


def build_items(conn, out, fetched_at):
    """index.json plus one document per traded item, from cah_listing."""
    # Decoding dominates runtime and repeat listings are common, so cache on
    # the raw blob. The plugin does the same thing for the same reason.
    cache = {}
    items = {}
    sales = defaultdict(list)
    windows = defaultdict(list)
    active = defaultdict(list)
    # The newest event in the table, used as the reference point for every
    # relative window below. Deliberately not wall-clock: windows should be
    # measured against the data, not against when the script happened to run.
    # Freshness of the pull itself is fetched_at, reported separately.
    now = 0
    seen = 0
    failures = 0

    for row in db.rows(conn, LISTINGS_SQL):
        seen += 1
        blob = row["item_data"]
        digest = hashlib.sha1(blob.encode()).hexdigest()
        if digest not in cache:
            try:
                cache[digest] = decode_item(blob)
            except Exception:
                cache[digest] = None
        item = cache[digest]
        if item is None:
            # The row still knows its type, price and dates, which is most of
            # what the market is made of, so it stays in - it just renders
            # without enchantments or lore.
            failures += 1

        item_type = row["item_type"]
        variant = row["variant"]
        key, fungible = item_key(item, item_type, variant)
        count = max(1, int(row["item_amount"] or 1))
        price = float(number(row["price"]))
        unit = price / count
        listed, expires, sold = row["created_at"], row["expires_at"], row["sold_at"]

        if key not in items:
            info = describe(item, item_type, variant, row["category"])
            info.update({"key": key, "fungible": fungible})
            items[key] = info

        now = max(now, listed, sold or 0)

        if row["state"] == SOLD and sold:
            sales[key].append({
                "unitPrice": unit, "totalPrice": price, "count": count,
                "seller": row["seller"], "at": sold,
            })
            windows[key].append({"from": listed, "to": sold, "unitPrice": unit, "count": count})
        elif row["state"] == LIVE:
            active[key].append({
                "unitPrice": unit, "totalPrice": price, "count": count,
                "seller": row["seller"], "listedAt": listed, "expiresAt": expires,
            })
            windows[key].append({"from": listed, "to": expires, "unitPrice": unit, "count": count})
        else:
            # EXPIRED and CANCELLED never sold, but were genuinely on the market
            # and so belong in floor history. A cancellation records no time of
            # its own, so its window runs to the expiry it would have had -
            # an upper bound on how long it was actually up.
            windows[key].append({"from": listed, "to": expires, "unitPrice": unit, "count": count})

    if not seen:
        raise SystemExit("[market] cah_listing is empty - refusing to publish an empty market")
    if failures:
        print(f"[market] warning: {failures} of {seen} listings failed to decode")

    earliest = min((s["at"] for group in sales.values() for s in group), default=now)

    # Clear only the per-item documents, which this script owns outright and
    # which go stale as keys come and go. The output directory also holds the
    # vendored icons from fetch_icons.py, so wiping it wholesale would silently
    # delete them and leave the page full of broken images.
    out_items = os.path.join(out, "items")
    shutil.rmtree(out_items, ignore_errors=True)
    os.makedirs(out_items, exist_ok=True)

    sellers = defaultdict(lambda: {"active": 0, "sold": 0, "keys": set()})
    index = []
    live_total = 0

    for key, info in items.items():
        item_sales = sorted(sales[key], key=lambda s: s["at"])
        # A row can sit in ACTIVE past its expiry until the plugin sweeps it.
        # Those are not buyable, so they are not the floor.
        live = sorted((l for l in active[key] if l["expiresAt"] > now),
                      key=lambda l: l["unitPrice"])
        live_total += len(live)
        daily = bucket(item_sales, DAY)
        hourly = bucket([s for s in item_sales if s["at"] >= now - 30 * DAY], HOUR)
        floors = floor_series(windows[key], earliest, now)

        for listing in live:
            entry = sellers[listing["seller"]]
            entry["active"] += 1
            entry["keys"].add(key)
        for sale in item_sales:
            entry = sellers[sale["seller"]]
            entry["sold"] += 1
            entry["keys"].add(key)

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
            "variant": info["variant"],
            "category": info["category"],
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
    write(out, "index.json", {
        "generatedAt": now,
        "fetchedAt": fetched_at,
        "itemCount": len(index),
        "items": index,
    })
    write(out, "sellers.json", {
        "generatedAt": now,
        "sellers": sorted(
            ({"uuid": uuid, "active": v["active"], "sold": v["sold"], "keys": sorted(v["keys"])[:40]}
             for uuid, v in sellers.items()),
            key=lambda s: -s["active"],
        )[:200],
    })
    print(f"[market] {seen} listings -> {len(index)} items")

    return {
        "generatedAt": now,
        "itemCount": len(index),
        "listingCount": seen,
        "activeListings": live_total,
        "salesRecorded": sum(len(v) for v in sales.values()),
        "firstSale": earliest,
        "sellerCount": len(sellers),
    }


# -- The liquidity pools -----------------------------------------------------

# A pool's item_ref is authoritative for what it trades, but a ref beginning
# `file:` names a plugin YAML defining a custom item, which this script cannot
# read. Those get a name and a sprite by hand; an unmapped one falls back to the
# pool's own id and the front end's glyph tile.
CUSTOM_REFS = {
    "file:mending_book.yml": ("Mending Book", "minecraft:enchanted_book"),
    "file:firework3.yml": ("Firework Rocket", "minecraft:firework_rocket"),
}

# How much history a pool chart gets. Samples land on every trade and every
# price tick, so this is roughly a month of an active market at full detail.
POOL_HISTORY_CAP = 900


def pool_display(item_ref):
    if item_ref in CUSTOM_REFS:
        return CUSTOM_REFS[item_ref]
    if ":" in item_ref and not item_ref.startswith("file:"):
        return prettify(item_ref), item_ref
    return prettify(item_ref.split("/")[-1].split(".")[0]), None


def build_pools(conn, out, fetched_at):
    """pools.json - the instant-liquidity exchange.

    Every pool holds an inventory of one item and a pile of cash, and quotes off
    the two. The plugin's own mid price is republished rather than recomputed:
    the curve it prices on lives in the plugin, and a reimplementation here
    would drift from what players actually pay.
    """
    markets = db.all_rows(conn, "SELECT * FROM cah_market ORDER BY id")
    history = defaultdict(list)
    for row in db.all_rows(conn, """
        SELECT market, sampled_at, mid, inventory
          FROM cah_price_history ORDER BY market, sampled_at
    """):
        history[row["market"]].append({
            "t": row["sampled_at"],
            "mid": round(float(number(row["mid"])), 2),
            "inv": int(row["inventory"]),
        })

    trades = defaultdict(list)
    for row in db.all_rows(conn, """
        SELECT market, player, side, units, unit_price, gross, spread_cut,
               burned, mid_after, created_at
          FROM cah_exchange_trade ORDER BY market, created_at
    """):
        trades[row["market"]].append({
            "side": row["side"],
            "units": int(row["units"]),
            "unitPrice": round(float(number(row["unit_price"])), 2),
            "gross": round(float(number(row["gross"])), 2),
            "spreadCut": round(float(number(row["spread_cut"])), 2),
            "burned": int(row["burned"]),
            "midAfter": round(float(number(row["mid_after"])), 2),
            "player": row["player"],
            "at": row["created_at"],
        })

    now = max(
        [int(m["updated_at"]) for m in markets]
        + [row["t"] for rows in history.values() for row in rows[-1:]]
        + [row["at"] for rows in trades.values() for row in rows[-1:]]
        or [0]
    )

    pools = []
    for market in markets:
        pool_id = market["id"]
        name, icon = pool_display(market["item_ref"])
        series = history[pool_id]
        book = trades[pool_id]
        mid = float(number(market["last_mid"]))
        inventory = int(market["inventory"])
        cash = float(number(market["cash"]))

        def traded(span, _book=book):
            return [t for t in _book if t["at"] >= now - span]

        day, week = traded(DAY), traded(7 * DAY)
        pools.append({
            "id": pool_id,
            "name": name,
            "itemRef": market["item_ref"],
            # What the front end asks for a sprite; null means glyph tile.
            "icon": icon,
            "mid": round(mid, 2),
            "inventory": inventory,
            "cash": round(cash, 2),
            # Cash plus inventory at the quoted mid: how big the pool is, and
            # so how far a single trade can move it.
            "depth": round(cash + inventory * mid, 2),
            "halted": bool(market["halted"]),
            "updatedAt": int(market["updated_at"]),
            "change24h": change_over(series, lambda r: r["mid"], now, DAY),
            "change7d": change_over(series, lambda r: r["mid"], now, 7 * DAY),
            "trades24h": len(day),
            "trades7d": len(week),
            "tradesAll": len(book),
            "volume24h": round(sum(t["gross"] for t in day), 2),
            "volume7d": round(sum(t["gross"] for t in week), 2),
            "volumeAll": round(sum(t["gross"] for t in book), 2),
            # Net units the pool absorbed: positive means players sold into it.
            "netUnits": sum(t["units"] if t["side"] == "SELL" else -t["units"] for t in book),
            "unitsBought": sum(t["units"] for t in book if t["side"] == "BUY"),
            "unitsSold": sum(t["units"] for t in book if t["side"] == "SELL"),
            "burned": sum(t["burned"] for t in book),
            "spreadCut": round(sum(t["spreadCut"] for t in book), 2),
            "spark": [row["mid"] for row in thin(series, 32)],
            "history": thin(series, POOL_HISTORY_CAP),
            # Three grains, one per range the chart offers. The mid only moves
            # when someone trades, so the bucket has to be wide enough to hold
            # a reversal or every candle is a body with no wick: at an hour
            # these markets reverse about 1% of the time, at four hours 7%, at
            # a day 30%. Hourly still earns its place on a one-day window,
            # where six candles would be the alternative.
            "candles": {
                "hourly": candles(*window(series, book, now, 30 * DAY), size=HOUR),
                "fourHour": candles(*window(series, book, now, 90 * DAY), size=4 * HOUR),
                "daily": candles(series, book, DAY),
            },
            "trades": book[::-1][:60],
        })

    # Busiest first, dormant pools last - one of these has no liquidity left in
    # it and does not belong at the top of the page.
    pools.sort(key=lambda p: (-p["volumeAll"], -p["depth"], p["id"]))
    write(out, "pools.json", {
        "generatedAt": now,
        "fetchedAt": fetched_at,
        "poolCount": len(pools),
        "pools": pools,
    })
    print(f"[market] {len(pools)} pools, {sum(p['tradesAll'] for p in pools)} exchange trades")

    return {
        "generatedAt": now,
        "poolCount": len(pools),
        "poolTrades": sum(p["tradesAll"] for p in pools),
        "poolDepth": round(sum(p["depth"] for p in pools), 2),
    }, [{k: pool[k] for k in ("id", "name", "mid", "depth", "tradesAll")} for pool in pools]


# -- The futures desk --------------------------------------------------------

def build_futures(conn, out, fetched_at, pool_summaries):
    """futures.json - positions written against the pool mids.

    Nothing has been written yet: the desk is off on the server, so cah_position
    is empty and this publishes `live: false` with the markets it would trade
    on. The aggregation below runs unchanged the moment rows appear, so turning
    the feature on server-side is all that stands between here and a live tab.
    """
    positions = db.all_rows(conn, """
        SELECT id, market, player, side, contracts, entry_price, leverage, margin,
               commission, funding_paid, expires_at, state, settle_price, pnl,
               created_at, settled_at
          FROM cah_position ORDER BY created_at
    """)
    house = next(iter(db.all_rows(
        conn, "SELECT * FROM cah_house WHERE id = 'futures'")), None)

    rows = [{
        "id": p["id"],
        "market": p["market"],
        "player": p["player"],
        "side": p["side"],
        "contracts": int(p["contracts"]),
        "entryPrice": round(float(number(p["entry_price"])), 2),
        "leverage": round(float(number(p["leverage"])), 2),
        "margin": round(float(number(p["margin"])), 2),
        "commission": round(float(number(p["commission"])), 2),
        "fundingPaid": round(float(number(p["funding_paid"])), 2),
        "expiresAt": p["expires_at"],
        "state": p["state"],
        "settlePrice": None if p["settle_price"] is None else round(float(number(p["settle_price"])), 2),
        "pnl": None if p["pnl"] is None else round(float(number(p["pnl"])), 2),
        "createdAt": p["created_at"],
        "settledAt": p["settled_at"],
    } for p in positions]

    open_rows = [r for r in rows if r["state"] == "OPEN"]
    settled = [r for r in rows if r["state"] != "OPEN"]

    # One row per market that can be traded, open or not: with the desk closed
    # this is the whole document, and it is what makes the empty tab worth
    # reading. `mid` is the pool's live quote, which contracts settle against.
    by_market = defaultdict(list)
    for row in open_rows:
        by_market[row["market"]].append(row)

    markets = []
    for pool in pool_summaries:
        held = by_market.get(pool["id"], [])
        longs = sum(r["contracts"] for r in held if r["side"] == "LONG")
        shorts = sum(r["contracts"] for r in held if r["side"] == "SHORT")
        markets.append({
            "market": pool["id"],
            "name": pool["name"],
            "mid": pool["mid"],
            # Carried through so this document can be read without the pool one:
            # a market holding nothing that has never traded is a configuration
            # stub rather than something to offer contracts on.
            "depth": pool["depth"],
            "tradesAll": pool["tradesAll"],
            "positions": len(held),
            "longContracts": longs,
            "shortContracts": shorts,
            # Notional, not margin: what the open book is worth at the mid.
            "openInterest": round((longs + shorts) * pool["mid"], 2),
            "marginPosted": round(sum(r["margin"] for r in held), 2),
        })
    # Stable, so with the desk closed and every open interest zero the markets
    # keep the pool document's busiest-first order rather than falling back to
    # alphabetical.
    markets.sort(key=lambda m: -m["openInterest"])

    document = {
        "generatedAt": max([r["createdAt"] for r in rows]
                           + ([int(house["updated_at"])] if house else []) or [0]),
        "fetchedAt": fetched_at,
        # The desk is live once it has ever written a contract. Until then the
        # page says so rather than showing a table of zeroes.
        "live": bool(rows),
        "house": {
            "bankroll": round(float(number(house["bankroll"])), 2),
            "liability": round(float(number(house["liability"])), 2),
            "lifetimeIn": round(float(number(house["lifetime_in"])), 2),
            "lifetimeOut": round(float(number(house["lifetime_out"])), 2),
            "updatedAt": int(house["updated_at"]),
        } if house else None,
        "markets": markets,
        "totals": {
            "openPositions": len(open_rows),
            "openContracts": sum(r["contracts"] for r in open_rows),
            "openInterest": round(sum(m["openInterest"] for m in markets), 2),
            "marginPosted": round(sum(r["margin"] for r in open_rows), 2),
            "settledPositions": len(settled),
            "realisedPnl": round(sum(r["pnl"] or 0 for r in settled), 2),
            "commission": round(sum(r["commission"] for r in rows), 2),
            "fundingPaid": round(sum(r["fundingPaid"] for r in rows), 2),
            "traders": len({r["player"] for r in rows}),
        },
        "open": sorted(open_rows, key=lambda r: -r["createdAt"])[:60],
        "settled": sorted(settled, key=lambda r: -(r["settledAt"] or 0))[:60],
    }
    write(out, "futures.json", document)
    print(f"[market] futures {'live' if document['live'] else 'not enabled'} - "
          f"{len(open_rows)} open, {len(settled)} settled")

    return {
        "futuresLive": document["live"],
        "openPositions": len(open_rows),
    }


def main():
    here = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=os.path.join(here, "public", "market"))
    args = ap.parse_args()

    os.makedirs(args.out, exist_ok=True)
    fetched_at = int(time.time() * 1000)
    config = db.settings()
    print(f"[market] reading {config['database']} at {config['host']}")

    conn = db.connect()
    try:
        items = build_items(conn, args.out, fetched_at)
        pools, pool_summaries = build_pools(conn, args.out, fetched_at)
        futures = build_futures(conn, args.out, fetched_at, pool_summaries)
    finally:
        conn.close()

    meta = {
        "generatedAt": max(items["generatedAt"], pools["generatedAt"]),
        "fetchedAt": fetched_at,
        "source": f"mysql:{config['database']}",
        "schemaVersion": 2,
    }
    meta.update({k: v for k, v in items.items() if k != "generatedAt"})
    meta.update({k: v for k, v in pools.items() if k != "generatedAt"})
    meta.update(futures)
    write(args.out, "meta.json", meta)
    print(f"[market] wrote index, pools and futures to {args.out}")


if __name__ == "__main__":
    main()
