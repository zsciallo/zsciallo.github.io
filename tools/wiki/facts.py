"""Generate the wiki fact tables (src/wiki/facts/<id>.json) from the game configs, read-only through git.

Usage: python tools/wiki/facts.py [--smp-ref REF] [--kit-ref REF] [--out DIR]
Configs are read only with `git show <sha>:<path>` (never the working tree, never a deny-list path). Odds, weights,
chances and pity never reach a cell: those keys are never read, a "15% chance" in a description loses its number, and a
final guard aborts on any cell that still matches the deny list.
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
REFS = {"smp": "origin/main", "kit": "origin/main"}
SITE = pathlib.Path(__file__).resolve().parents[2]
OUT = SITE / "src/wiki/facts"
DENY = pathlib.Path(__file__).with_name("deny.json")
# The spec's lists, used until U1's deny.json exists.
SPEC_TERMS = [r"\bodds\b", r"\bweight", r"\bpity\b", r"drop rate", r"\d+(\.\d+)?\s?%\s?chance", r"/caa\b",
              r"/chelp\b", r"/lp\b", r"/grant\b", r"\bpermission node", r"chromatic\.[a-z]+\.[a-z]+", r"\bgrim\b",
              r"anticheat", r"anti-dupe", r"\bdupe\b", r"\bexploit", r"\bseal\b", r"\bops?\.json", r"\brcon\b",
              r"\bpayout", r"\bprize pool"]
SPEC_PATHS = ["plugins/LuckPerms/*", "plugins/Votifier/*", "plugins/*Tebex*/*", "plugins/DiscordSRV/*",
              "plugins/*/database.yml"]
# A config value under one of these keys must never show; "chance to ..." in prose is fine, "chance: 30" is not.
KEY_GUARD = re.compile(r"\b(weight|pity|permission)s?\b|\bchances?\s*[:=]\s*\d", re.I)

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


def clean(text):
    return " ".join(COLOUR.sub("", str(text)).replace("\\n", " ").split())


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
    return ROMAN[n] if 0 < n < len(ROMAN) else str(n)


def enchant_list(enchants, where):
    if isinstance(enchants, list):  # PlayerKits2: ["FIRE_ASPECT;5"]
        enchants = dict(e.split(";", 1) for e in enchants)
    if not isinstance(enchants, dict):
        raise ShapeError(f"{where}: enchants is not a map or list")
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
        rows.append([clean(need(e, "display", where, str)), str(caps.get(eid, top)),
                     ", ".join(dict.fromkeys(APPLIES[a] for a in applies)),
                     no_chance(clean(need(e, "description", where, str)), removed)])
    for rows in tables.values():
        rows.sort(key=lambda r: (r[0].lower(), r[2]))
    return tables, removed[0], skipped


def duration(seconds):
    if seconds % 86400 == 0:
        return f"{seconds // 86400} d"
    if seconds % 3600 == 0:
        return f"{seconds // 3600} h"
    return f"{seconds // 60} min"


def build_smp_kits(kits):
    rows = []
    for file, k in sorted(kits.items()):
        where = f"PlayerKits2/kits/{file}"
        items = [{"material": need(it, "id", f"{where}:items", str), "amount": it.get("amount", 1),
                  "name": it.get("name"), "enchants": it.get("enchants") or {}}
                 for it in need(k, "items", where, dict).values()]
        title = clean(need(need(need(k, "display", where, dict), "default", f"{where}:display", dict),
                           "name", f"{where}:display.default", str))
        rows.append([title, duration(need(k, "cooldown", where, int)), loadout({"items": items}, where)])
    return rows


SNBT_TEXT = re.compile(r"""text:(?:"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)')""")
TRIM = " Armor Trim Smithing Template"


def snbt_name(value, where):
    """An ITEM reward without a Name: the preview item's custom name, else its item id."""
    at = value.find('"minecraft:custom_name":')
    if at >= 0:
        depth, i = 0, at + len('"minecraft:custom_name":')
        for j in range(i, len(value)):
            depth += {"{": 1, "[": 1, "}": -1, "]": -1}.get(value[j], 0)
            if depth == 0 and value[j] in "}],":
                break
        text = "".join(a or b for a, b in SNBT_TEXT.findall(value[i:j + 1]))
        if text.strip():
            return text
    m = re.search(r'id:"([a-z0-9_:]+)"', value)
    if not m:
        raise ShapeError(f"{where}: no Name and no item id in PreviewData")
    count = re.search(r"count:(\d+)", value)
    return name(m.group(1)) + (f" x{count.group(1)}" if count and int(count.group(1)) > 1 else "")


def reward_name(r, where):
    if "Name" in r:
        return clean(need(r, "Name", where, str))
    value = need(need(need(r, "PreviewData", where, dict), "Data", f"{where}.PreviewData", dict), "Value",
                 f"{where}.PreviewData.Data", str)
    return clean(snbt_name(value, where))


def build_smp_crates(crates, keys):
    rows = []
    for file, c in crates.items():
        where = f"ExcellentCrates/crates/{file}"
        key_names = []
        for opt, o in need(c, "CostOptions", where, dict).items():
            for entry in need(o, "Entries", f"{where}:CostOptions.{opt}", dict).values():
                kid = need(entry, "Key", f"{where}:CostOptions.{opt}.Entries", str)
                if kid not in keys:
                    raise ShapeError(f"{where}: key '{kid}' has no keys/{kid}.yml")
                key_names.append(clean(need(keys[kid], "Name", f"keys/{kid}.yml", str)))
        rewards = need(need(c, "Rewards", where, dict), "List", f"{where}:Rewards", dict)
        names = [reward_name(r, f"{where}:Rewards.List.{rid}") for rid, r in rewards.items()]
        if not names:
            raise ShapeError(f"{where}: Rewards.List is empty")
        trims = [n[:-len(TRIM)] for n in names if n.endswith(TRIM)]
        names = [n for n in names if not n.endswith(TRIM)] + ([f"Armour trims ({', '.join(trims)})"] if trims else [])
        rows.append([clean(need(c, "Name", where, str)), ", ".join(key_names), ", ".join(dict.fromkeys(names))])
    return sorted(rows)


def pass_reward(r, where):
    """The reward's name, else the lore line the pass menu shows for it."""
    if r.get("name"):
        return clean(r["name"])
    lines = [clean(x).lstrip("» ") for x in need(r, "lore-addon", f"{where} (no name)", list)]
    if not any(lines):
        raise ShapeError(f"{where}: no name and an empty lore-addon")
    return ", ".join(x for x in lines if x)


def build_pass(pass_, rewards, file):
    rows = []
    for tier, t in need(pass_, "tiers", file, dict).items():
        ids = need(t, "rewards", f"{file}:tiers.{tier}", list)
        names = [pass_reward(need(rewards, str(r), f"rewards.yml (tier {tier} of {file})", dict), f"rewards.yml:{r}")
                 for r in ids]
        rows.append([str(int(tier)), ", ".join(names)])
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
        rows.append([clean(need(k, "name", where, str)), modes, loadout(k, where)])
    return sorted(rows)


def build_ffa_kits(ffa):
    rows = []
    for kid, k in need(ffa, "kits", "ffa-kits.yml", dict).items():
        where = f"ffa-kits.yml:kits.{kid}"
        rows.append([clean(need(k, "name", where, str)), name(k.get("category", "kits")), loadout(k, where),
                     f"{need(k, 'price', where, int):,} Prism Coins"])
    return rows


def build_modifiers(mods):
    return [[clean(need(m, "name", f"modifiers.yml:pool.{mid}", str)),
             clean(need(m, "description", f"modifiers.yml:pool.{mid}", str))]
            for mid, m in need(mods, "pool", "modifiers.yml", dict).items()]


def build_augments(aug):
    removed, rows = [0], []
    for i, a in enumerate(need(aug, "pool", "augments.yml", list)):
        where = f"augments.yml:pool[{i}]"
        rows.append([clean(need(a, "name", where, str)), name(need(a, "rarity", where, str)),
                     no_chance(clean(" ".join(need(a, "lore", where, list))), removed)])
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
        rows.append([label, f"{need(it, 'price', where, int)} gold"])
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

    def yaml(self, path):
        self.check(path)
        text = self.git("show", f"{self.sha}:{path}", ok=True)
        if text is None:
            raise FileNotFoundError(path)
        data = yaml.load(text, Loader=getattr(yaml, "CSafeLoader", yaml.SafeLoader))
        if not isinstance(data, dict):
            raise ShapeError(f"{path}: top level is not a map")
        return data

    def folder(self, folder, suffix=".yml"):
        self.check(folder + "/")
        out = self.git("ls-tree", "--name-only", f"{self.sha}:{folder}", ok=True)
        if not out:
            raise FileNotFoundError(folder)
        return {f: self.yaml(f"{folder}/{f}") for f in sorted(out.split()) if f.endswith(suffix)}


def tables(smp, kit):
    """Yield (id, title, repo, source, thunk -> (columns, rows, removed))."""
    ae, arena = "plugins/AdvancedEnchantments", "plugins/ChromaticArena"

    yield "enchants", "", smp, f"{ae}/enchantments.yml", lambda: build_enchants(
        smp.yaml(f"{ae}/enchantments.yml"), smp.yaml("plugins/ChromaticCrafting/upgrades.yml"))
    yield ("smp-kits", "Kits", smp, "plugins/PlayerKits2/kits", lambda: (["Kit", "Cooldown", "Contents"],
           build_smp_kits(smp.folder("plugins/PlayerKits2/kits")), 0))
    yield ("smp-crates", "Crates", smp, "plugins/ExcellentCrates/crates", lambda: (["Crate", "Key", "Can contain"],
           build_smp_crates(smp.folder("plugins/ExcellentCrates/crates"),
                            {f[:-4]: v for f, v in smp.folder("plugins/ExcellentCrates/keys").items()}), 0))
    for track, title in (("free", "Battle Pass: free track"), ("premium", "Battle Pass: Chroma track")):
        path = f"plugins/BattlePass/passes/{track}.yml"
        yield (f"battlepass-{track}", title, smp, path, lambda path=path: (["Tier", "Reward"],
               build_pass(smp.yaml(path), smp.yaml("plugins/BattlePass/rewards.yml"), path), 0))
    yield ("pvp-kits", "Kits", kit, f"{arena}/kits", lambda: (["Kit", "Modes", "Loadout"],
           build_pvp_kits(kit.folder(f"{arena}/kits")), 0))
    yield ("pvp-ffa-kits", "FFA kits", kit, f"{arena}/ffa-kits.yml", lambda: (["Kit", "Tab", "Loadout", "Cost"],
           build_ffa_kits(kit.yaml(f"{arena}/ffa-kits.yml")), 0))
    yield ("pvp-modifiers", "Arena modifiers", kit, f"{arena}/modifiers.yml", lambda: (["Modifier", "What it does"],
           build_modifiers(kit.yaml(f"{arena}/modifiers.yml")), 0))
    yield ("pvp-augments", "Arena augments", kit, f"{arena}/augments.yml", lambda: (["Augment", "Rarity", "What it does"],
           *build_augments(kit.yaml(f"{arena}/augments.yml"))))
    yield ("pvp-divisions", "Ranked tiers", kit, f"{arena}/seasons.yml", lambda: (["Tier", "Rating", "Divisions"],
           build_divisions(kit.yaml(f"{arena}/seasons.yml")), 0))
    yield ("pvp-shop", "Arena shop", kit, f"{arena}/shop.yml", lambda: (["Item", "Price"],
           build_shop(kit.yaml(f"{arena}/shop.yml")), 0))
    yield ("pvp-arsenal-crate", "Arsenal Crate", kit, "plugins/ChromaticLoot/crates.yml", lambda: (["Tier", "Contents"],
           build_arsenal(kit.yaml("plugins/ChromaticLoot/crates.yml"), kit.yaml(f"{arena}/ffa-kits.yml")), 0))


def guard(t, terms):
    """The first deny-list hit in a table as a message, else None."""
    for row in t["rows"]:
        for cell in row:
            hit = next((p.pattern for p in terms if p.search(cell)), None) or (KEY_GUARD.search(cell) and "key guard")
            if hit:
                return f"table {t['id']} cell {cell!r} matches {hit}"
    return None


def run(smp_ref, kit_ref, out_dir):
    deny = json.loads(DENY.read_text(encoding="utf-8")) if DENY.exists() else {}
    terms = [re.compile(t, re.I) for t in deny.get("terms", SPEC_TERMS)]
    paths = deny.get("paths", SPEC_PATHS)
    smp, kit = Repo(SMP_REPO, smp_ref, paths), Repo(KIT_REPO, kit_ref, paths)
    names = {id(smp): "mc-server", id(kit): "mc-kit"}
    out, skipped, removed, notes = [], [], {}, []
    for tid, title, repo, source, thunk in tables(smp, kit):
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
            out += [{"id": f"enchants-{g}", "title": GEAR_TITLES[g], **base, "columns": ENCHANT_COLUMNS, "rows": r}
                    for g, r in sorted(gears.items())]
            continue
        cols, rows, removed[tid] = res
        if not rows:
            raise ShapeError(f"{tid}: no rows from {source}")
        out.append({"id": tid, "title": title, **base, "columns": cols, "rows": rows})
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
