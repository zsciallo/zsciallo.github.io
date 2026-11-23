"""Generate the wiki fact tables (src/wiki/facts/<id>.json) from the game configs, read-only through git.

Usage: python tools/wiki/facts.py [--smp-ref REF] [--kit-ref REF] [--out DIR]
Configs are read only with `git show <sha>:<path>` (never the working tree, never a deny-list path). Odds, weights,
chances and pity never reach a cell: those keys are never read, a "15% chance" in a description loses its number, and a
final guard aborts on any cell that still matches the deny list. Gear tables (gear-*) print the item lore as it is,
proc chances included (owner ruling 2026-11-22), and are exempt from that one deny term only.
"""
import argparse
import fnmatch
import json
import pathlib
import re
import subprocess
import sys

import yaml

SMP_REPO = "F:/Work/minecraft/mc-server"
KIT_REPO = "F:/Work/minecraft/mc-kit"
DUNGEONS_REPO = "F:/Work/minecraft/chromatic-dungeons"  # tools/hw_gear.py, the Heartwood gear catalogue
REFS = {"smp": "origin/main", "kit": "origin/main", "dungeons": "main"}
SITE = pathlib.Path(__file__).resolve().parents[2]
OUT = SITE / "src/wiki/facts"
DENY = pathlib.Path(__file__).with_name("deny.json")
RENDERED = pathlib.Path(__file__).with_name("rendered_icons.json")  # item id -> model, written by render_models.py
# The spec's lists, used until U1's deny.json exists.
SPEC_TERMS = [r"\bodds\b", r"\bweight", r"\bpity\b", r"drop rate", r"\d+(\.\d+)?\s?%\s?chance", r"/caa\b",
              r"/chelp\b", r"/lp\b", r"/grant\b", r"\bpermission node", r"chromatic\.[a-z]+\.[a-z]+", r"\bgrim\b",
              r"anticheat", r"anti-dupe", r"\bdupe\b", r"\bexploit", r"\bseal\b", r"\bops?\.json", r"\brcon\b",
              r"\bpayout", r"\bprize pool"]
SPEC_PATHS = ["plugins/LuckPerms/*", "plugins/Votifier/*", "plugins/*Tebex*/*", "plugins/DiscordSRV/*",
              "plugins/*/database.yml"]
# A config value under one of these keys must never show; "chance to ..." in prose is fine, "chance: 30" is not.
KEY_GUARD = re.compile(r"\b(weight|pity|permission)s?\b|\bchances?\s*[:=]\s*\d|/gems?\s+(give|take|balance)\b", re.I)

COLOUR = re.compile(r"[&§](#[0-9a-f]{6}|x([&§][0-9a-f]){6}|[0-9a-fk-or])|\{#[0-9a-f]{6}\}|<[^<>]*>|%[a-z_-]+%", re.I)
CHANCE = re.compile(r"\b(?:(a|an)\s+)?\d+(?:\.\d+)?\s?%\s?(chance)|\b(chance)\s+of\s+\d+(?:\.\d+)?\s?%", re.I)
SMALL = {"of", "the", "and", "on", "in"}
ROMAN = ["0", "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"]


class ShapeError(Exception):
    pass


def need(d, key, where, typ=None):
    if not isinstance(d, dict) or key not in d or (typ and not isinstance(d[key], typ)):
        raise ShapeError(f"{where}: key '{key}' missing or not {typ.__name__ if typ else 'present'}")
    return d[key]


SMALL_CAPS = str.maketrans("ᴀʙᴄᴅᴇꜰɢʜɪᴊᴋʟᴍɴᴏᴘǫʀꜱᴛᴜᴠᴡʏᴢ", "abcdefghijklmnopqrstuvwyz")


def clean(text):
    """Colour codes and tags off; small-caps letters folded to plain ones, each folded word capitalised."""
    text = COLOUR.sub("", str(text)).replace("\\n", " ")
    folded = text.translate(SMALL_CAPS)
    if folded != text:
        text = " ".join(f.capitalize() if f != o else f for f, o in zip(folded.split(), text.split()))
    return " ".join(text.split())


def no_chance(text, removed):
    """Drop the number from a stated percentage chance; removed[0] counts the edits."""
    def sub(m):
        removed[0] += 1
        word = m.group(2) or m.group(3)
        if m.start() == 0:
            return word[0].upper() + word[1:].lower()
        return "a chance" if m.group(2) else word.lower()
    return CHANCE.sub(sub, text)


def name(item_id):
    words = str(item_id).split(":")[-1].replace("_", " ").replace("-", " ").lower().split()
    return " ".join(w if i and w in SMALL else w.capitalize() for i, w in enumerate(words))


def roman(n):
    if n <= 0:
        return str(n)
    out = ""
    for value, numeral in ((1000, "M"), (900, "CM"), (500, "D"), (400, "CD"), (100, "C"), (90, "XC"), (50, "L"),
                           (40, "XL"), (10, "X"), (9, "IX"), (5, "V"), (4, "IV"), (1, "I")):
        out += numeral * (n // value)
        n %= value
    return out


def enchant_list(enchants, where):
    if not isinstance(enchants, dict):
        raise ShapeError(f"{where}: enchants is not a map")
    return [f"{name(k)} {roman(int(v))}" for k, v in enchants.items()]


def item_text(it, where):
    base = name(need(it, "material", where, str))
    if it.get("potion"):
        base += f" of {potion(it['potion'])}"
    parts = ([base] if it.get("name") else []) + enchant_list(it.get("enchants") or {}, where)
    text = (clean(it["name"]) if it.get("name") else base) + (f" ({', '.join(parts)})" if parts else "")
    return text + (f" x{it['amount']}" if it.get("amount", 1) > 1 else "")


def potion(p):
    if p.startswith("strong_"):
        return name(p[7:]) + " II"
    if p.startswith("long_"):
        return name(p[5:]) + " (long)"
    return name(p)


def counted(texts):
    """Identical entries become one with a count, first-seen order kept."""
    seen = {}
    for t in texts:
        seen[t] = seen.get(t, 0) + 1
    return [t if n == 1 else f"{t} x{n}" for t, n in seen.items()]


def loadout(kit, where):
    items = [item_text(it, f"{where}.items") for it in kit.get("items") or []]
    armor = kit.get("armor") or {}
    if not isinstance(armor, dict):
        raise ShapeError(f"{where}: armor is not a map")
    pieces = [(slot, armor[slot]) for slot in ("helmet", "chestplate", "leggings", "boots") if slot in armor]
    mats = [need(p, "material", f"{where}.armor.{slot}", str) for slot, p in pieces]
    if len(pieces) == 4 and len({(m.split("_")[0], str(p.get("enchants")), str(p.get("trim")))
                                 for m, (_, p) in zip(mats, pieces)}) == 1:
        p = pieces[0][1]
        ench = enchant_list(p.get("enchants") or {}, where)
        text = name(p["material"].split("_")[0]) + " armour" + (f" ({', '.join(ench)})" if ench else "")
        if p.get("trim"):
            text += f", {name(p['trim']['pattern'])} trim in {name(p['trim']['material'])}"
        arm = [text]
    else:
        arm = [item_text(p, f"{where}.armor.{slot}") for slot, p in pieces]
    out = counted(items) + arm
    if not out:
        raise ShapeError(f"{where}: kit has no items or armor")
    return ", ".join(out)


class Row(list):
    """A table row that also carries its icon (a vanilla material or None); compares like a plain list."""
    def __init__(self, cells, icon=None):
        super().__init__(cells)
        self.icon = icon


ICON = re.compile(r"^[a-z0-9_]+$")
SNBT_ID = re.compile(r'\bid:"(?:minecraft:)?([a-z0-9_]+)"')


def icon(material):
    """A config material as an icon id: lower snake case, minecraft: dropped; None when it is not a plain material."""
    if not material:
        return None
    m = str(material).lower().split(":")[-1] if str(material).lower().startswith("minecraft:") else str(material).lower()
    return m if ICON.match(m) else None


def key_icon(key):
    """The material of a crate key's item, from its SNBT."""
    m = SNBT_ID.findall(str(((key.get("item") or {}).get("item") or {}).get("Data", {}).get("Value", "")))
    return m[-1] if m else None


# ---------------------------------------------------------------- SMP

APPLIES = {"ALL_SWORD": "Swords", "ALL_AXE": "Axes", "ALL_PICKAXE": "Pickaxes", "ALL_SPADE": "Shovels",
           "ALL_SHOVEL": "Shovels", "ALL_HOE": "Hoes", "ALL_ARMOR": "All armour", "ALL_HELMET": "Helmets",
           "ALL_CHESTPLATE": "Chestplates", "ALL_LEGGINGS": "Leggings", "ALL_BOOTS": "Boots", "ALL_TOOLS": "Tools",
           "BOW": "Bows", "CROSSBOW": "Crossbows", "TRIDENT": "Tridents", "FISHING_ROD": "Fishing rods",
           "ELYTRA": "Elytra", "MACE": "Maces", "SHIELD": "Shields", "NETHERITE_SPEAR": "Netherite spears"}
ARMOUR = {"ALL_ARMOR", "ALL_HELMET", "ALL_CHESTPLATE", "ALL_LEGGINGS", "ALL_BOOTS", "ELYTRA"}
TOOLS = {"ALL_PICKAXE", "ALL_SPADE", "ALL_SHOVEL", "ALL_TOOLS"}
GEAR_TITLES = {"weapons": "Weapon enchants", "ranged": "Bow, crossbow and trident enchants",
               "armour": "Armour enchants", "tools": "Tool enchants", "hoes": "Hoe enchants",
               "fishing": "Fishing rod enchants", "chromatic": "Chromatic gear enchants",
               "halloween": "Halloween gear enchants"}
ENCHANT_COLUMNS = ["Enchant", "Max level", "Applies to", "What it does"]


def gear_of(e, applies):
    group = str(e.get("group", "")).upper()
    if group in ("CHROMATIC", "HALLOWEEN"):  # built into that gear, never a book
        return group.lower()
    a = set(applies)
    if "FISHING_ROD" in a:
        return "fishing"
    if "ALL_HOE" in a:
        return "hoes"
    if a & TOOLS or "MINING" in str(e.get("type", "")):
        return "tools"
    if a & ARMOUR:
        return "armour"
    if a <= {"BOW", "CROSSBOW", "TRIDENT"}:
        return "ranged"
    return "weapons"


def build_enchants(ench, upgrades):
    """-> ({gear: rows}, removed, skipped_ids). Max level is the Upgrade bench cap when the bench sells the enchant."""
    caps = {need(u, "enchant", f"upgrades.yml:upgrades.{k}", str): need(u, "max-level", f"upgrades.yml:upgrades.{k}", int)
            for k, u in need(upgrades, "upgrades", "upgrades.yml", dict).items()}
    tables, removed, skipped = {}, [0], []
    for eid, e in ench.items():
        where = f"enchantments.yml:{eid}"
        applies = need(e, "applies", where, list)
        unknown = [a for a in applies if a not in APPLIES]
        if unknown:
            if "HELD" in str(e.get("type")) and len(unknown) == len(applies):
                skipped.append(eid)  # an off-hand Shard item, not gear
                continue
            raise ShapeError(f"{where}: applies has unknown item {unknown[0]}")
        try:
            top = max(int(lv) for lv in need(e, "levels", where, dict))
        except ValueError:
            raise ShapeError(f"{where}: levels has a key that is not a number or no levels") from None
        rows = tables.setdefault(gear_of(e, applies), [])
        gear = next((a.lower() for a in applies if not a.startswith("ALL_")), "enchanted_book")
        rows.append(Row([clean(need(e, "display", where, str)), str(caps.get(eid, top)),
                         ", ".join(dict.fromkeys(APPLIES[a] for a in applies)),
                         no_chance(clean(need(e, "description", where, str)), removed)], gear))
    for rows in tables.values():
        rows.sort(key=lambda r: (r[0].lower(), r[2]))
    return tables, removed[0], skipped


def duration(seconds):
    if seconds == 0:
        return "None"
    for unit, size in (("d", 86400), ("h", 3600), ("min", 60), ("s", 1)):
        if seconds % size == 0:
            return f"{seconds // size} {unit}"


RANK_KIT = re.compile(r"^(vip|mvp)(plus)?$")
TOOL_ALIAS = re.compile(r"^(wood|wooden|stone|iron|gold|golden|diamond|netherite)(sword|shovel|pickaxe|axe|hoe)$")
CRATEKEY = re.compile(r"^/cratekey give \{USERNAME\} (\w+) (\d+)$")
PRISM = re.compile(r"^/prism give \{USERNAME\} (\d+)$")


def build_smp_kits(kits, keys):
    """Essentials kits.yml -> rows. One-time kits (delay < 0) and kits that only run other commands are left out."""
    rows = []
    for kid, k in need(kits, "kits", "Essentials/kits.yml", dict).items():
        where = f"Essentials/kits.yml:kits.{kid}"
        delay = need(k, "delay", where, int)
        if delay < 0:
            continue
        contents, item_icons, key_icons = [], [], []
        for line in need(k, "items", where, list):
            line = str(line).strip()
            if line.startswith("/"):
                m, p = CRATEKEY.match(line), PRISM.match(line)
                if m:
                    if m.group(1) not in keys:
                        raise ShapeError(f"{where}: key '{m.group(1)}' has no objects/key/{m.group(1)}.yml")
                    n = int(m.group(2))
                    key_icons.append(key_icon(keys[m.group(1)]))
                    contents.append(clean(keys[m.group(1)]["display"]["name"]) + (f" x{n}" if n > 1 else ""))
                elif p:
                    contents.append(f"{int(p.group(1)):,} Prism Shards")
                continue  # other commands (books, messages) are not items
            tokens = line.split()
            alias = TOOL_ALIAS.match(tokens[0].lower())
            item = {"material": f"{alias.group(1)}_{alias.group(2)}" if alias else tokens[0], "enchants": {}}
            for t in tokens[1:]:
                if t.isdigit():
                    item["amount"] = int(t)
                elif t.startswith("name:"):
                    item["name"] = t[5:].replace("_", " ")
                elif ":" in t and not t.startswith("lore:"):
                    ench, _, lvl = t.partition(":")
                    item["enchants"][ench] = int(lvl)
            contents.append(item_text(item, where))
            item_icons.append(icon(item["material"]))
        if not contents:
            continue
        rank = RANK_KIT.match(kid)
        title = (rank.group(1).upper() + ("+" if rank.group(2) else "")) if rank else name(kid)
        rows.append(Row([title, f"/kit {kid}", duration(delay), ", ".join(counted(contents))], next(filter(None, item_icons + key_icons), None)))  # first real item, else the key
    return rows


SNBT_TEXT = re.compile(r"""text:(?:"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)')""")
TRIM = re.compile(r"^Trim (\w+)$|^(\w+) Armor Trim Smithing Template$")


def snbt_custom_name(value):
    """The custom name inside an SNBT item, or None."""
    at = value.find('"minecraft:custom_name":')
    if at < 0:
        return None
    depth, i = 0, at + len('"minecraft:custom_name":')
    for j in range(i, len(value)):
        depth += {"{": 1, "[": 1, "}": -1, "]": -1}.get(value[j], 0)
        if depth == 0 and value[j] in "}],":
            break
    return "".join(a or b for a, b in SNBT_TEXT.findall(value[i:j + 1])).strip() or None


def reward_name(r, where):
    """ExcellentCrates 7: the preview name; when the preview shows the item itself, its custom name if it has one."""
    preview = need(r, "preview", where, dict)
    if preview.get("use_item_data"):
        custom = snbt_custom_name(str(((preview.get("icon") or {}).get("Data") or {}).get("Value", "")))
        if custom:
            return clean(custom)
    text = re.sub(r" X(\d+)$", r" x\1", clean(need(preview, "name", f"{where}.preview", str)))
    # The stack size lives on the given item, not in the preview name; a name that already counts is left alone.
    items = list(((r.get("items") or {}).get("item_list") or {}).values())
    count = re.search(r"\bcount:(\d+)", str(((items[0] or {}).get("Data") or {}).get("Value", ""))) if len(items) == 1 else None
    if count and int(count.group(1)) > 1 and not re.search(r"\bx\d+$|^\d+x\b|^[\d,]+ ", text):
        text += f" x{count.group(1)}"
    return text


def build_smp_crates(crates, rewards, keys):
    """ExcellentCrates 7 objects/ layout. A crate with no placed block cannot be opened and is left out."""
    rows = []
    for file, c in crates.items():
        cid, where = file[:-4], f"ExcellentCrates/objects/crate/{file}"
        positions = need(need(c, "blocks", where, dict), "positions", f"{where}:blocks", dict)
        if not any(positions.values()):
            continue
        key_names = []
        for kid in need(need(c, "key_requirements", where, dict), "keys", f"{where}:key_requirements", dict):
            if kid not in keys:
                raise ShapeError(f"{where}: key '{kid}' has no objects/key/{kid}.yml")
            key_names.append(clean(need(need(keys[kid], "display", f"key/{kid}.yml", dict), "name",
                                        f"key/{kid}.yml:display", str)))
        names = []
        for rid, ref in need(need(c, "rewards", where, dict), "reward_list", f"{where}:rewards", dict).items():
            reward_id = need(ref, "reward_id", f"{where}:rewards.reward_list.{rid}", str)
            if reward_id not in rewards.get(cid, {}):
                raise ShapeError(f"{where}: reward '{reward_id}' has no objects/reward/{cid}/{reward_id}.yml")
            names.append(reward_name(rewards[cid][reward_id], f"reward/{cid}/{reward_id}.yml"))
        if not names:
            raise ShapeError(f"{where}: rewards.reward_list is empty")
        trims = [m.group(1) or m.group(2) for m in map(TRIM.match, names) if m]
        names = [n for n in names if not TRIM.match(n)] + ([f"Armour trims ({', '.join(trims)})"] if trims else [])
        title = clean(need(need(c, "display", where, dict), "name", f"{where}:display", str))
        kicon = next(filter(None, (key_icon(keys[k]) for k in c["key_requirements"]["keys"])), None)
        rows.append(Row([title, ", ".join(key_names), ", ".join(dict.fromkeys(names))], kicon))
    return sorted(rows)


def pass_reward(r, where):
    """The reward's name, else the lore line the pass menu shows for it."""
    if r.get("name"):
        return clean(r["name"])
    lines = [clean(x).lstrip("» ") for x in need(r, "lore-addon", f"{where} (no name)", list)]
    if not any(lines):
        raise ShapeError(f"{where}: no name and an empty lore-addon")
    return ", ".join(x for x in lines if x)


CRATEKEY_CMD = re.compile(r"^cratekey give \S+ (\w+) \d+$")


def pass_icon(r, keys):
    """An item reward's first material, or the key a cratekey command gives."""
    for it in (r.get("items") or {}).values():
        return icon(it.get("material"))
    for cmd in r.get("commands") or []:
        m = CRATEKEY_CMD.match(str(cmd))
        if m and m.group(1) in keys:
            return key_icon(keys[m.group(1)])
    return None


def build_pass(pass_, rewards, file, keys=None):
    keys = keys or {}
    rows = []
    for tier, t in need(pass_, "tiers", file, dict).items():
        ids = need(t, "rewards", f"{file}:tiers.{tier}", list)
        names = [pass_reward(need(rewards, str(r), f"rewards.yml (tier {tier} of {file})", dict), f"rewards.yml:{r}")
                 for r in ids]
        rows.append(Row([str(int(tier)), ", ".join(names)],
                        next(filter(None, (pass_icon(rewards[str(r)], keys) for r in ids)), None)))
    return sorted(rows, key=lambda r: int(r[0]))


# ---------------------------------------------------------------- KitPVP

MODES = {"unranked": "Unranked", "ranked": "Ranked", "ffa": "FFA"}


def build_pvp_kits(kits):
    rows = []
    for file, k in kits.items():
        where = f"ChromaticArena/kits/{file}"
        if k.get("soon"):
            continue  # shown as "soon" in game, not playable
        modes = ", ".join(MODES.get(m, name(m)) for m in need(k, "modes", where, list))
        rows.append(Row([clean(need(k, "name", where, str)), modes, loadout(k, where)], icon(k.get("icon"))))
    return sorted(rows)


def build_ffa_kits(ffa):
    rows = []
    for kid, k in need(ffa, "kits", "ffa-kits.yml", dict).items():
        where = f"ffa-kits.yml:kits.{kid}"
        rows.append(Row([clean(need(k, "name", where, str)), name(k.get("category", "kits")), loadout(k, where),
                         f"{need(k, 'price', where, int):,} Prism Coins"], icon(k.get("icon"))))
    return rows


def build_modifiers(mods):
    return [Row([clean(need(m, "name", f"modifiers.yml:pool.{mid}", str)),
                 clean(need(m, "description", f"modifiers.yml:pool.{mid}", str))], icon(m.get("icon")))
            for mid, m in need(mods, "pool", "modifiers.yml", dict).items()]


def build_augments(aug):
    removed, rows = [0], []
    for i, a in enumerate(need(aug, "pool", "augments.yml", list)):
        where = f"augments.yml:pool[{i}]"
        rows.append(Row([clean(need(a, "name", where, str)), name(need(a, "rarity", where, str)),
                         no_chance(clean(" ".join(need(a, "lore", where, list))), removed)], icon(a.get("icon"))))
    return rows, removed[0]


def build_divisions(seasons):
    tiers = sorted(need(seasons, "tiers", "seasons.yml", list), key=lambda t: need(t, "min", "seasons.yml:tiers", int))
    steps = ", ".join(roman(n) for n in range(need(seasons, "divisions", "seasons.yml", int), 0, -1))
    rows = []
    for i, t in enumerate(tiers):
        top = i == len(tiers) - 1
        rating = f"{t['min']} and up" if top else f"{t['min']} to {tiers[i + 1]['min'] - 1}"
        rows.append([clean(need(t, "name", "seasons.yml:tiers", str)), rating, "None" if top else steps])
    return rows


def build_shop(shop):
    rows = []
    for iid, it in need(shop, "items", "shop.yml", dict).items():
        where = f"shop.yml:items.{iid}"
        only = it.get("classes")
        label = clean(need(it, "name", where, str)) + (f" ({', '.join(name(c) for c in only)} only)" if only else "")
        rows.append(Row([label, f"{need(it, 'price', where, int)} gold"], icon(it.get("icon"))))
    gold = lambda xs: ", ".join(str(x) for x in xs) + " gold"
    rows.append(["Weapon upgrade, each tier", gold(need(shop, "weapon-prices", "shop.yml", list))])
    rows.append(["Armour upgrade, each tier", gold(need(shop, "armor-prices", "shop.yml", list))])
    rows.append([f"Weapon enchant level (up to {need(shop, 'enchant-max', 'shop.yml', int)})",
                 f"{need(shop, 'enchant-price', 'shop.yml', int)} gold"])
    anvil = need(shop, "anvil", "shop.yml", dict)
    stats = ", ".join(clean(need(s, "name", "shop.yml:anvil.stats", str)) for s in need(anvil, "stats", "shop.yml:anvil", list))
    rows.append([f"Stat anvil (pick one of {need(anvil, 'offer', 'shop.yml:anvil', int)}: {stats}; "
                 f"up to {need(anvil, 'max', 'shop.yml:anvil', int)} a match)",
                 f"{need(anvil, 'price', 'shop.yml:anvil', int)} gold, each one after costs "
                 f"{need(anvil, 'price-step', 'shop.yml:anvil', int)} more"])
    # shortcut: class-specific weapon/armour price lists (Bulwark, Trident) are not shown; add rows if a page needs them.
    return rows


def build_arsenal(loot, ffa):
    crate = need(need(loot, "crates", "crates.yml", dict), "arsenal", "crates.yml:crates", dict)
    kits = need(ffa, "kits", "ffa-kits.yml", dict)
    by_tier = {r: [] for r in need(loot, "rarities", "crates.yml", list)}
    for i, p in enumerate(need(crate, "pool", "crates.yml:crates.arsenal", list)):
        where = f"crates.yml:crates.arsenal.pool[{i}]"
        reward, rarity = need(p, "reward", where, str), need(p, "rarity", where, str)
        if not reward.startswith("kit:") or reward[4:] not in kits or rarity not in by_tier:
            raise ShapeError(f"{where}: '{reward}' ({rarity}) is not an ffa-kits.yml kit with a known rarity")
        by_tier[rarity].append(clean(kits[reward[4:]]["name"]))
    return [[name(r), ", ".join(ks)] for r, ks in by_tier.items() if ks]


# ---------------------------------------------------------------- Gear (SMP)
# Gear tables print the item's own lore, proc chances included (owner ruling 2026-11-22), so no_chance() is not used
# here and guard() lets gear-* tables through the one deny term below. Weights, drop chances and odds are never read.

GEAR_CHANCE_TERM = r"\d+(\.\d+)?\s?%\s?chance"
GEAR_DASH = re.compile(r"\s+(--|\u2014|\u2013)\s+")
SLOT_ORDER = ["helmet", "chestplate", "leggings", "boots", "weapon"]
GIVEPIECE = re.compile(r"^asets givepiece \S+ (\w+) (\w+)$")
CC_GIVE = re.compile(r"^chromatic give \S+ (\w+)$")
AE_GIVE = re.compile(r"^ae giveitem \S+ (\w+) \d+$")
SNBT_ENCHANTS = re.compile(r'"minecraft:enchantments":\{([^{}]*)\}')
SNBT_LEVEL = re.compile(r'"minecraft:([a-z_]+)":(\d+)')
HW_NAMES = ("SETS", "HEARTGROWN_SETS", "TIER_ENCHANTS", "HEARTGROWN_ENCHANTS", "AE_ENCHANTS", "BRANCH_ID", "BRANCH_NAME",
            "BRANCH_ENCHANTS", "BRANCH_AE", "BRANCH_LORE")
SOCKET_FAMILIES = {"chromatic": "Chromatic", "living_prism": "Living Prism", "zone": "Heartwood zone sets",
                   "heartgrown": "Heartgrown"}
GEM_FEES = {"remove": ("Remove a gem", True), "change-skill": ("Change a gem's skill", True),
            "unlock": ("Unlock a socket", False)}  # (label, multiplied by the tier number), per the gems.yml header


def hw_literals(source):
    """The catalogue literals of chromatic-dungeons tools/hw_gear.py, parsed with ast and never imported or run."""
    import ast
    found = {}
    for node in ast.parse(source).body:
        if isinstance(node, ast.Assign) and len(node.targets) == 1 and isinstance(node.targets[0], ast.Name) \
                and node.targets[0].id in HW_NAMES:
            try:
                found[node.targets[0].id] = ast.literal_eval(node.value)
            except ValueError:
                raise ShapeError(f"hw_gear.py: {node.targets[0].id} is not a literal") from None
    missing = [n for n in HW_NAMES if n not in found]
    if missing:
        raise ShapeError(f"hw_gear.py: no literal {missing[0]}")
    return found


def ae_enchant_text(entries, ae_names, where):
    """AE armorSet 'id:level' entries -> 'Protection V, Trophy Hunter I'."""
    out = []
    for e in entries:
        eid, _, lvl = str(e).partition(":")
        if not lvl.isdigit():
            raise ShapeError(f"{where}: enchant '{e}' is not id:level")
        out.append(f"{ae_names.get(eid) or name(eid)} {roman(int(lvl))}")
    return ", ".join(out)


def lore_bonus(lines):
    """The '* ...' lines of a lore (and the lines that wrap them) up to the next blank line; 'Set bonus: ' when the
    lore has a SET BONUS header. 'None' when the lore has no bullet."""
    entries, on, is_set = [], False, False
    for line in map(clean, lines):
        if line.upper() == "SET BONUS":
            on = is_set = True
        elif line.startswith("* "):
            on = True
            entries.append(line[2:])
        elif on and line:
            entries[-1:] = [(entries[-1] + " " if entries else "") + line]
        elif on:
            break
    return ("Set bonus: " if is_set else "") + "; ".join(entries) if entries else "None"


def snbt_texts(value):
    return {a or b for a, b in SNBT_TEXT.findall(str(value))}


def hw_piece_id(texts, hw):
    """A give command's item as a hw_gear id, matched on its unique flavour line; None when it is not Heartwood gear."""
    if hw["BRANCH_LORE"][-1][0][1] in texts:  # the Branch's last lore line
        return hw["BRANCH_ID"]
    for set_name, (*_, pieces) in hw["SETS"].items():
        for slot, piece in pieces.items():
            if piece[3] in texts:
                return ("heartgrown_" if "Heartgrown. " in texts else "") + f"{set_name.lower()}_{slot}"
    return None


def gear_sources(recipes, crates, rewards, loot, ae_by_ia, hw):
    """{item key: set of where it comes from}. Keys: '<Set>/<slot>' for AE pieces, 'ia:<ns:id>' for other ItemsAdder
    items, 'ae:<item>' for AE items, 'hw:<id>' for Heartwood gear, 'reward:<crate>/<reward>' for a crate's own item.
    A crate that is not placed counts as a source with no name, so its items show as no longer obtainable."""
    sources = {}
    ia_key = lambda ia: ae_by_ia.get(ia) or f"ia:{ia}"
    for file, data in recipes.items():
        for rid, r in need(data, "recipes", file, dict).items():
            out = need(r, "output", f"{file}:recipes.{rid}", dict)
            if out.get("itemsadder"):
                sources.setdefault(ia_key(out["itemsadder"]), set()).add("Crafting")
            elif out.get("give"):
                hid = hw_piece_id(snbt_texts(out["give"]), hw)
                if hid:
                    sources.setdefault(f"hw:{hid}", set()).add("Crafting")
    all_recipes = {rid: r for data in recipes.values() for rid, r in data["recipes"].items()}
    for file, c in crates.items():
        cid, where = file[:-4], f"ExcellentCrates/objects/crate/{file}"
        placed = any(need(need(c, "blocks", where, dict), "positions", f"{where}:blocks", dict).values())
        label = clean(need(need(c, "display", where, dict), "name", f"{where}:display", str)) if placed else ""
        for ref in need(need(c, "rewards", where, dict), "reward_list", f"{where}:rewards", dict).values():
            rid = need(ref, "reward_id", where, str)
            r = rewards.get(cid, {}).get(rid)
            if r is None:
                raise ShapeError(f"{where}: reward '{rid}' has no objects/reward/{cid}/{rid}.yml")
            keys = []
            for b in ((r.get("commands") or {}).get("bundles") or {}).values():
                for cmd in b.get("commands") or []:
                    g, cc, ae = GIVEPIECE.match(cmd), CC_GIVE.match(cmd), AE_GIVE.match(cmd)
                    if g:
                        keys.append(f"{g.group(1)}/{g.group(2).lower()}")
                    elif cc and cc.group(1) in all_recipes:
                        keys.append(ia_key(all_recipes[cc.group(1)]["output"].get("itemsadder")))
                    elif ae:
                        keys.append(f"ae:{ae.group(1)}")
            if gear_item(r):
                keys.append(f"reward:{cid}/{rid}")
            for k in keys:
                sources.setdefault(k, set()).add(label)
    for tid, t in need(loot, "tables", "ChromaticDungeons/loot.yml", dict).items():
        for e in t.get("entries") or []:
            for cmd in e.get("commands") or []:
                hid = hw_piece_id(snbt_texts(cmd), hw)
                if hid:
                    sources.setdefault(f"hw:{hid}", set()).add("Heartwood")
    return sources


def obtained(found):
    """'Crafting', then the crates by name, then 'Heartwood'; only unplaced crates -> no longer obtainable."""
    named = sorted(found - {"", "Crafting", "Heartwood"})
    out = (["Crafting"] if "Crafting" in found else []) + named + (["Heartwood"] if "Heartwood" in found else [])
    return ", ".join(out) or "No longer obtainable"


def gear_item(r):
    """A crate reward's own item when it is named gear (a custom name and enchantments), as (snbt, material)."""
    items = list(((r.get("items") or {}).get("item_list") or {}).values())
    if len(items) != 1:
        return None
    value = str(((items[0] or {}).get("Data") or {}).get("Value", ""))
    mat = SNBT_ID.findall(value)
    return (value, mat[-1]) if snbt_custom_name(value) and SNBT_ENCHANTS.search(value) and mat else None


def build_ae_family(sets, prefix, ae_names, ia_icons, sources):
    """Every piece of the AE armorSets whose file name starts with prefix and that something hands out."""
    rows = []
    for file in sorted(f for f in sets if f.startswith(prefix)):
        s, set_name = sets[file], file[:-4]
        for slot, p in sorted(need(s, "items", f"armorSets/{file}", dict).items(), key=lambda kv: SLOT_ORDER.index(kv[0])):
            found = sources.get(f"{set_name}/{slot}")
            if found is None:
                continue
            where = f"armorSets/{file}:items.{slot}"
            rows.append(Row([clean(need(p, "name", where, str)), ae_enchant_text(p.get("enchants") or [], ae_names, where),
                             lore_bonus(p.get("lore") or []), obtained(found)],
                            ia_icons.get(p.get("itemsadder")) or icon(s.get("material"))))
    return rows


def build_crate_gear(rewards, cid, sources):
    rows = []
    for rid, r in sorted(rewards.get(cid, {}).items()):
        item = gear_item(r)
        if item and f"reward:{cid}/{rid}" in sources:
            levels = SNBT_LEVEL.findall(SNBT_ENCHANTS.search(item[0]).group(1))
            rows.append(Row([clean(snbt_custom_name(item[0])), ", ".join(f"{name(e)} {roman(int(lv))}" for e, lv in levels),
                             obtained(sources[f"reward:{cid}/{rid}"])], icon(item[1])))
    return rows


def hw_enchants(vanilla, ae, hw):
    return ", ".join([f"{name(k)} {roman(v)}" for k, v in vanilla.items()] +
                     [f"{hw['AE_ENCHANTS'][e][0]} {roman(lv)}" for e, lv in ae])


def build_hw_sets(hw, sources):
    rows = []
    for set_name, (zone, tier, *_, bonus, pieces) in hw["SETS"].items():
        if any(f"hw:{set_name.lower()}_{slot}" in sources for slot in pieces):
            rows.append(Row([f"{set_name} Set", zone, name(tier), bonus], "leather_chestplate"))
    return rows


def build_hw_pieces(hw, sources, heartgrown):
    rows = []
    for set_name, (zone, tier, *_, pieces) in hw["SETS"].items():
        if heartgrown and set_name not in hw["HEARTGROWN_SETS"]:
            continue
        prot, unb = hw["HEARTGROWN_ENCHANTS"] if heartgrown else hw["TIER_ENCHANTS"][tier]
        for slot, (piece, extra, ae, _) in pieces.items():
            hid = ("heartgrown_" if heartgrown else "") + f"{set_name.lower()}_{slot}"
            if f"hw:{hid}" in sources:
                rows.append(Row([("Heartgrown " if heartgrown else "") + piece, f"{set_name} Set",
                                 hw_enchants({"protection": prot, "unbreaking": unb, **extra}, ae, hw),
                                 obtained(sources[f"hw:{hid}"])], f"leather_{slot}"))
    if heartgrown and f"hw:{hw['BRANCH_ID']}" in sources:
        rows.append(Row([hw["BRANCH_NAME"], "None", hw_enchants(hw["BRANCH_ENCHANTS"], hw["BRANCH_AE"], hw),
                         obtained(sources[f"hw:{hw['BRANCH_ID']}"])], "wooden_sword"))
    return rows


def build_shards(sets, ench, ia_icons, sources):
    rows = []
    for file in sorted(f for f in sets if f.startswith("ShardOf")):
        p = need(need(sets[file], "items", f"armorSets/{file}", dict), "weapon", f"armorSets/{file}:items", dict)
        found = sources.get(f"{file[:-4]}/weapon")
        if found is None:
            continue
        eid = str(need(p, "enchants", f"armorSets/{file}:items.weapon", list)[0]).partition(":")[0]
        effect = clean(need(need(ench, eid, "enchantments.yml", dict), "description", f"enchantments.yml:{eid}", str))
        rows.append(Row([clean(need(p, "name", f"armorSets/{file}", str)), effect, obtained(found)], ia_icons.get(p.get("itemsadder"))))
    return rows


def build_made_from(recipes, file, item_names, ia_icons, sources):
    rows = []
    for rid, r in need(recipes, "recipes", file, dict).items():
        out = need(r, "output", f"{file}:recipes.{rid}", dict)
        ia = need(out, "itemsadder", f"{file}:recipes.{rid}.output", str)
        inputs = []
        for i in need(r, "inputs", f"{file}:recipes.{rid}", list):
            item, n = need(i, "item", f"{file}:recipes.{rid}.inputs", str), i.get("amount", 1)
            inputs.append((item_names.get(item) or name(item)) + (f" x{n}" if n > 1 else ""))
        rows.append(Row([clean(need(out, "name", f"{file}:recipes.{rid}.output", str)), ", ".join(inputs),
                         obtained(sources.get(f"ia:{ia}", set()))], ia_icons.get(ia)))
    return rows


def pct(v):
    return f"+{v:g}%"


def build_gem_tiers(gems):
    tiers = list(need(gems, "tiers", "gems.yml", dict).items())
    ratio = need(gems, "combine-ratio", "gems.yml", int)
    rows = []
    for i, (tier, t) in enumerate(tiers):
        where = f"gems.yml:tiers.{tier}"
        combine = f"{ratio} make 1 {name(tiers[i + 1][0])}" if i + 1 < len(tiers) else "Top tier"
        rows.append([name(tier), pct(need(t, "xp", where, (int, float))), pct(need(t, "delving-prism", where, (int, float))), combine])
    return rows


def build_gem_sockets(gems):
    rows = []
    for fam, s in need(gems, "sockets", "gems.yml", dict).items():
        if fam not in SOCKET_FAMILIES:
            raise ShapeError(f"gems.yml:sockets.{fam}: unknown armour family")
        top, open_ = need(s, "max", f"gems.yml:sockets.{fam}", int), need(s, "open", f"gems.yml:sockets.{fam}", int)
        rows.append([SOCKET_FAMILIES[fam], str(top) if top == open_ else f"{top} ({open_} open, {top - open_} to unlock)"])
    return rows


def build_gem_fees(gems):
    rows = []
    for key, cost in need(gems, "fees", "gems.yml", dict).items():
        if key not in GEM_FEES:
            raise ShapeError(f"gems.yml:fees.{key}: unknown fee")
        label, per_tier = GEM_FEES[key]
        rows.append([label, f"{cost:,} Prism" + (" x tier" if per_tier else "")])
    return rows


def build_trackers(ae_config, sources):
    rows = []
    items = need(ae_config, "items", "AdvancedEnchantments/config.yml", dict)
    for tid in ("stattrak", "mobtrak", "blocktrak", "fishtrak"):
        t = need(items, tid, "AdvancedEnchantments/config.yml:items", dict)
        where = f"AdvancedEnchantments/config.yml:items.{tid}"
        counts = clean(need(t, "lore", where, list)[0])
        rows.append(Row([clean(need(t, "name", where, str)), counts[:1].upper() + counts[1:],
                         obtained(sources.get(f"ae:{tid}", set()))], icon(t.get("type"))))
    return rows


# ---------------------------------------------------------------- git + run

class Repo:
    def __init__(self, path, ref, deny_paths):
        self.path, self.deny = path, deny_paths
        self.sha = self.git("rev-parse", "--short", ref).strip()

    def git(self, *args, ok=False):
        r = subprocess.run(["git", "-C", self.path, *args], capture_output=True, text=True, encoding="utf-8")
        if r.returncode and not ok:
            raise ShapeError(f"git {' '.join(args)} in {self.path} failed: {r.stderr.strip()}")
        return r.stdout if not r.returncode else None

    def check(self, path):
        if any(fnmatch.fnmatch(path, g) for g in self.deny):
            raise ShapeError(f"{path} is on the deny list; no tool may read it")

    def text(self, path):
        self.check(path)
        text = self.git("show", f"{self.sha}:{path}", ok=True)
        if text is None:
            raise FileNotFoundError(path)
        return text

    def yaml(self, path):
        data = yaml.load(self.text(path), Loader=getattr(yaml, "CSafeLoader", yaml.SafeLoader))
        if not isinstance(data, dict):
            raise ShapeError(f"{path}: top level is not a map")
        return data

    def need_jar(self, *prefixes):
        """The plugin must be installed at the ref (its jar in plugins/), or the table is not built."""
        if not prefixes:
            return  # a tools repo (chromatic-dungeons): its thunk checks the server's jars itself
        jars = (self.git("ls-tree", "--name-only", f"{self.sha}:plugins") or "").splitlines()
        for prefix in prefixes:
            if not any(j.startswith(prefix) and j.endswith(".jar") for j in jars):
                raise ShapeError(f"no plugins/{prefix}*.jar at {self.sha}: the plugin is not installed, its configs are not live")

    def folder(self, folder, suffix=".yml"):
        self.check(folder + "/")
        out = self.git("ls-tree", "--name-only", f"{self.sha}:{folder}", ok=True)
        if not out:
            raise FileNotFoundError(folder)
        return {f: self.yaml(f"{folder}/{f}") for f in sorted(out.split()) if f.endswith(suffix)}


def tables(smp, kit, dun):
    """Yield (id, title, repo, source, jars that must be installed, thunk -> (columns, rows, removed))."""
    ae, arena = "plugins/AdvancedEnchantments", "plugins/ChromaticArena"

    ec = "plugins/ExcellentCrates/objects"
    keys = lambda: {f[:-4]: v for f, v in smp.folder(f"{ec}/key").items()}
    yield ("enchants", "", smp, f"{ae}/enchantments.yml", ("AdvancedEnchantments-", "ChromaticCrafting"),
           lambda: build_enchants(smp.yaml(f"{ae}/enchantments.yml"), smp.yaml("plugins/ChromaticCrafting/upgrades.yml")))
    yield ("smp-kits", "Kits", smp, "plugins/Essentials/kits.yml", ("EssentialsX-",), lambda: (
           ["Kit", "Command", "Cooldown", "Contents"], build_smp_kits(smp.yaml("plugins/Essentials/kits.yml"), keys()), 0))

    def crates():
        found = smp.folder(f"{ec}/crate")
        rewards = {f[:-4]: {r[:-4]: v for r, v in smp.folder(f"{ec}/reward/{f[:-4]}").items()} for f in found}
        return ["Crate", "Key", "Can contain"], build_smp_crates(found, rewards, keys()), 0
    # 7.x reads objects/; the crates/ and keys/ folders beside it are 6.x leftovers.
    yield "smp-crates", "Crates", smp, f"{ec}/crate", ("ExcellentCrates-7.",), crates
    for track, title in (("free", "Battle Pass: free track"), ("premium", "Battle Pass: Chroma track")):
        path = f"plugins/BattlePass/passes/{track}.yml"
        yield (f"battlepass-{track}", title, smp, path, ("BattlePass-",), lambda path=path: (["Tier", "Reward"],
               build_pass(smp.yaml(path), smp.yaml("plugins/BattlePass/rewards.yml"), path, keys()), 0))
    ca = ("ChromaticArena.jar",)
    yield ("pvp-kits", "Kits", kit, f"{arena}/kits", ca, lambda: (["Kit", "Modes", "Loadout"],
           build_pvp_kits(kit.folder(f"{arena}/kits")), 0))
    yield ("pvp-ffa-kits", "FFA kits", kit, f"{arena}/ffa-kits.yml", ca, lambda: (["Kit", "Tab", "Loadout", "Cost"],
           build_ffa_kits(kit.yaml(f"{arena}/ffa-kits.yml")), 0))
    yield ("pvp-modifiers", "Arena modifiers", kit, f"{arena}/modifiers.yml", ca, lambda: (["Modifier", "What it does"],
           build_modifiers(kit.yaml(f"{arena}/modifiers.yml")), 0))
    yield ("pvp-augments", "Arena augments", kit, f"{arena}/augments.yml", ca, lambda: (["Augment", "Rarity", "What it does"],
           *build_augments(kit.yaml(f"{arena}/augments.yml"))))
    yield ("pvp-divisions", "Ranked tiers", kit, f"{arena}/seasons.yml", ca, lambda: (["Tier", "Rating", "Divisions"],
           build_divisions(kit.yaml(f"{arena}/seasons.yml")), 0))
    yield ("pvp-shop", "Arena shop", kit, f"{arena}/shop.yml", ca, lambda: (["Item", "Price"],
           build_shop(kit.yaml(f"{arena}/shop.yml")), 0))
    yield ("pvp-arsenal-crate", "Arsenal Crate", kit, "plugins/ChromaticLoot/crates.yml", ca + ("ChromaticLoot.jar",), lambda: (["Tier", "Contents"],
           build_arsenal(kit.yaml("plugins/ChromaticLoot/crates.yml"), kit.yaml(f"{arena}/ffa-kits.yml")), 0))
    yield from gear_tables(smp, dun)


def gear_tables(smp, dun):
    ae, cc, ec = "plugins/AdvancedEnchantments", "plugins/ChromaticCrafting", "plugins/ExcellentCrates/objects"
    rec = f"{cc}/recipes"
    cache = {}

    def ctx():
        """Everything the gear tables share, read once."""
        if not cache:
            sets = smp.folder(f"{ae}/armorSets")
            ia = {ns: smp.yaml(f"plugins/ItemsAdder/contents/{ns}/configs/{ns}.yml")
                  for ns in ("chromatic", "living_prism", "halloween", "shards", "clusters")}
            ia_items = {f"{ns}:{iid}": it for ns, d in ia.items() for iid, it in need(d, "items", f"ItemsAdder {ns}.yml", dict).items()}
            # A flat item texture is the item's picture; a 3D model is drawn by render_models.py (listed in RENDERED);
            # anything else shows its vanilla material.
            rendered = json.loads(RENDERED.read_text(encoding="utf-8")) if RENDERED.exists() else {}
            ia_icons = {k: (k.split(":")[1] if ((it.get("resource") or {}).get("texture") or (it.get("graphics") or {}).get("texture")
                                                or k.split(":")[1] in rendered)
                            else icon((it.get("resource") or {}).get("material") or it.get("material"))) for k, it in ia_items.items()}
            recipes = {f: smp.yaml(f"{rec}/{f}.yml") for f in ("gear", "zone_sets", "shards", "clusters", "apex")}
            crates = smp.folder(f"{ec}/crate")
            rewards = {f[:-4]: {r[:-4]: v for r, v in smp.folder(f"{ec}/reward/{f[:-4]}").items()} for f in crates}
            ae_by_ia = {p["itemsadder"]: f"{f[:-4]}/{slot}" for f, s in sets.items()
                        for slot, p in (s.get("items") or {}).items() if isinstance(p, dict) and p.get("itemsadder")}
            hw = hw_literals(dun.text("tools/hw_gear.py"))
            names = {k: clean(it.get("display_name", "")) for k, it in ia_items.items()}
            names.update({r["output"]["itemsadder"]: clean(r["output"]["name"]) for d in recipes.values()
                          for r in d["recipes"].values() if r["output"].get("itemsadder") and r["output"].get("name")})
            cache.update(sets=sets, ia_icons=ia_icons, recipes=recipes, rewards=rewards, hw=hw, names=names,
                         ench=smp.yaml(f"{ae}/enchantments.yml"),
                         sources=gear_sources(recipes, crates, rewards, smp.yaml("plugins/ChromaticDungeons/loot.yml"), ae_by_ia, hw))
            cache["ae_names"] = {k: clean(v.get("display", k)) for k, v in cache["ench"].items() if isinstance(v, dict)}
        return cache

    def hw_ctx():
        smp.need_jar(*jars, "ChromaticDungeons")
        return ctx()

    jars = ("AdvancedEnchantments-", "ChromaticCrafting", "ItemsAdder_", "ExcellentCrates-7.")
    piece_cols = ["Piece", "Enchants", "Bonus", "Obtained"]
    for tid, title, prefix in (("gear-chromatic", "Chromatic gear", "Chromatic"),
                               ("gear-living-prism", "Living Prism gear", "LivingPrism"),
                               ("gear-halloween", "Halloween gear", "Halloween")):
        yield (tid, title, smp, f"{ae}/armorSets", jars, lambda prefix=prefix: (piece_cols, build_ae_family(
            ctx()["sets"], prefix, ctx()["ae_names"], ctx()["ia_icons"], ctx()["sources"]), 0))
    hwsrc = "tools/hw_gear.py"
    yield ("gear-heartwood-sets", "Heartwood zone sets", dun, hwsrc, (), lambda: (
           ["Set", "Area", "Tier", "Set bonus"], build_hw_sets(hw_ctx()["hw"], ctx()["sources"]), 0))
    yield ("gear-heartwood-pieces", "Heartwood zone set pieces", dun, hwsrc, (), lambda: (
           ["Piece", "Set", "Enchants", "Obtained"], build_hw_pieces(hw_ctx()["hw"], ctx()["sources"], False), 0))
    yield ("gear-heartgrown", "Heartgrown armour and the Branch of Heartwood", dun, hwsrc, (), lambda: (
           ["Piece", "Set", "Enchants", "Obtained"], build_hw_pieces(hw_ctx()["hw"], ctx()["sources"], True), 0))
    for tid, title, cid in (("gear-corrupted", "Corrupted gear", "chroma_crate"), ("gear-voter", "Voter armour", "vote_crate")):
        yield (tid, title, smp, f"{ec}/reward/{cid}", jars, lambda cid=cid: (["Piece", "Enchants", "Obtained"],
               build_crate_gear(ctx()["rewards"], cid, ctx()["sources"]), 0))
    yield ("gear-shards", "Shards", smp, f"{ae}/armorSets", jars, lambda: (["Shard", "Effect", "Obtained"],
           build_shards(ctx()["sets"], ctx()["ench"], ctx()["ia_icons"], ctx()["sources"]), 0))
    for tid, title, f in (("gear-clusters", "Clusters", "clusters"), ("gear-prisms", "Apex prisms", "apex")):
        yield (tid, title, smp, f"{rec}/{f}.yml", jars, lambda f=f: (["Item", "Made from", "Obtained"], build_made_from(
               ctx()["recipes"][f], f"{f}.yml", ctx()["names"], ctx()["ia_icons"], ctx()["sources"]), 0))
    gems = f"{cc}/gems.yml"
    yield ("gear-gem-tiers", "Gem tiers", smp, gems, ("ChromaticCrafting",), lambda: (
           ["Tier", "XP bonus", "Delving Prism bonus", "Combine"], build_gem_tiers(smp.yaml(gems)), 0))
    yield ("gear-gem-sockets", "Gem sockets", smp, gems, ("ChromaticCrafting",), lambda: (
           ["Armour", "Sockets"], build_gem_sockets(smp.yaml(gems)), 0))
    yield ("gear-gem-fees", "Gem fees", smp, gems, ("ChromaticCrafting",), lambda: (
           ["Action", "Cost"], build_gem_fees(smp.yaml(gems)), 0))
    yield ("gear-trackers", "Trackers", smp, f"{ae}/config.yml", jars, lambda: (
           ["Tracker", "Counts", "Obtained"], build_trackers(smp.yaml(f"{ae}/config.yml"), ctx()["sources"]), 0))


def guard(t, terms):
    """The first deny-list hit in a table as a message, else None. Gear tables may show a lore's 'N% chance'."""
    if t["id"].startswith("gear-"):
        terms = [p for p in terms if p.pattern != GEAR_CHANCE_TERM]
    for row in t["rows"]:
        for cell in row:
            hit = next((p.pattern for p in terms if p.search(cell)), None) or (KEY_GUARD.search(cell) and "key guard")
            if hit:
                return f"table {t['id']} cell {cell!r} matches {hit}"
    return None


def with_icons(t):
    """Add "icons" (one per row, a material or None) when at least one row has one."""
    icons = [getattr(r, "icon", None) for r in t["rows"]]
    if any(icons):
        t["icons"] = icons
    return t


def run(smp_ref, kit_ref, out_dir):
    deny = json.loads(DENY.read_text(encoding="utf-8")) if DENY.exists() else {}
    terms = [re.compile(t, re.I) for t in deny.get("terms", SPEC_TERMS)]
    paths = deny.get("paths", SPEC_PATHS)
    smp, kit = Repo(SMP_REPO, smp_ref, paths), Repo(KIT_REPO, kit_ref, paths)
    dun = Repo(DUNGEONS_REPO, REFS["dungeons"], paths)
    names = {id(smp): "mc-server", id(kit): "mc-kit", id(dun): "chromatic-dungeons"}
    out, skipped, removed, notes = [], [], {}, []
    for tid, title, repo, source, jars, thunk in tables(smp, kit, dun):
        repo.need_jar(*jars)
        try:
            res = thunk()
        except FileNotFoundError as e:
            skipped.append(f"{tid} ({names[id(repo)]}:{e} not at {repo.sha})")
            continue
        base = {"source": f"{names[id(repo)]}:{source}", "ref": repo.sha}
        if tid == "enchants":
            gears, removed[tid], left_out = res
            notes.append(f"enchants: {sum(map(len, gears.values()))} in {len(gears)} gear groups, "
                         f"Shard items left out: {len(left_out)}")
            out += [with_icons({"id": f"enchants-{g}", "title": GEAR_TITLES[g], **base, "columns": ENCHANT_COLUMNS,
                                "rows": r}) for g, r in sorted(gears.items())]
            continue
        cols, rows, removed[tid] = res
        if not rows:
            raise ShapeError(f"{tid}: no rows from {source}")
        if tid.startswith("gear-"):
            for r in rows:  # site rule: no typed dashes in visitor text; lore's " -- " reads as a comma
                r[:] = [GEAR_DASH.sub(", ", c) for c in r]
        out.append(with_icons({"id": tid, "title": title, **base, "columns": cols, "rows": rows}))
    # A hit blocks its table (never written, old copy removed) and fails the run; the clean tables are still written.
    blocked = [msg for msg in (guard(t, terms) for t in out) if msg]
    out = [t for t in out if not guard(t, terms)]
    out_dir.mkdir(parents=True, exist_ok=True)
    keep = {t["id"] for t in out} | {s.split()[0] for s in skipped}
    for old in out_dir.glob("*.json"):
        if old.stem not in keep:
            old.unlink()
    for t in out:
        (out_dir / f"{t['id']}.json").write_text(json.dumps(t, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")
    return out, skipped, removed, notes, blocked


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--smp-ref", default=REFS["smp"])
    ap.add_argument("--kit-ref", default=REFS["kit"])
    ap.add_argument("--out", type=pathlib.Path, default=OUT)
    a = ap.parse_args(argv)
    sys.stdout.reconfigure(encoding="utf-8")
    try:
        out, skipped, removed, notes, blocked = run(a.smp_ref, a.kit_ref, a.out)
    except ShapeError as e:
        print(f"facts.py: {e}", file=sys.stderr)
        return 1
    for t in out:
        print(f"{t['id']}: {len(t['rows'])} rows ({t['source']} @ {t['ref']})")
    print("\n".join(notes))
    print("chance numbers removed: " + (", ".join(f"{k} {v}" for k, v in removed.items() if v) or "none"))
    for s in skipped:
        print(f"SKIPPED: {s}")
    for b in blocked:
        print(f"BLOCKED by the deny-list guard, not written: {b}", file=sys.stderr)
    return 1 if blocked else 0


if __name__ == "__main__":
    sys.exit(main())
