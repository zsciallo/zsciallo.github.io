"""Heartwood drop tables (run 20261124-dungeon-drops): python test/wiki_drops_test.py [facts dir]

D-T1 shapes and D-T2 leak guard on the four dungeon-* fact tables (default src/wiki/facts, or the given dir), and
D-T3 facts.build_hw_drops on fixture configs full of weights, rolls, key chances and tier labels. Kept out of
tools/wiki/test_facts.py only because that path is not a test path for the test writer; the fixtures mirror its own.
"""
import json
import pathlib
import re
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1] / "tools" / "wiki"))
import facts  # noqa: E402

# As in tools/wiki/test_facts.py: a hw_gear.py with one set, parsed and never run, and a Heartwood give command.
hw = facts.hw_literals('''SETS = {"Mossy": ("Mossgate Landing", "EASY", "5B7F3A", "wild", "emerald", "7FBF5A", "Bonus.", {
    "helmet": ("Mossy Cap", {}, [], "Spores settle.")})}
HEARTGROWN_SETS = ("Mossy",)
TIER_ENCHANTS = {"EASY": (2, 2)}
HEARTGROWN_ENCHANTS = (4, 3)
AE_ENCHANTS = {}
BRANCH_ID = "branch_of_heartwood"
BRANCH_NAME = "Branch of Heartwood"
BRANCH_ENCHANTS = {"sharpness": 5}
BRANCH_AE = []
BRANCH_LORE = [[("555555", "It still remembers growing.")]]
''')


def give(texts):
    return "minecraft:give %player% minecraft:leather_helmet[minecraft:lore=[" + ",".join(f'{{text:"{t}"}}' for t in texts) + "]] 1"

# ---- Heartwood drop tables (run 20261124-dungeon-drops; owner 2026-11-23: "we need content on all the special drops
# from the dungeon"). D-T2: names and lore only, never odds, internal labels or amounts.
DROP_LEAKS = [(re.compile(p, re.I), what) for p, what in (
    (r"%", "a percentage"), (r"\b(weights?|rolls?|chances?|odds|pity|guarantee\w*|empty)\b", "an odds word"),
    (r"\bt[2-5]\b", "a tier label"), (r"hw_|_sp\b|_gem\b", "an internal id"), (r"\$", "money"),
    (r"\d[\d,.]*\s*Prism\b", "a Prism amount"), (r"\bLuck\b", "Luck"))]


def drop_leaks(t):
    """Every leak in a dungeon-* table; Luck is allowed only as the Pale Teardrop Charm's lore line."""
    cells = [(None, None, t["title"])] + [(None, None, c) for c in t["columns"]] + \
            [(r[0], i, c) for r in t["rows"] for i, c in enumerate(r)]
    return [f"{t['id']}: {what} in {c!r}" for item, col, c in cells for p, what in DROP_LEAKS if p.search(c)
            and not (what == "Luck" and t["id"] == "dungeon-boss-items" and item == "Pale Teardrop Charm" and col == 1)]


def drop_shapes(tables):
    """D-T1: the four tables, their columns and row counts, each row whole, pictured and tied to the zone table."""
    z, b, tr, m = (tables[f"dungeon-{n}"] for n in ("zone-drops", "boss-items", "trophies", "materials"))
    out = []
    for t, cols, n in ((z, ["Area", "Mini boss", "Zone item", "Armour set", "Crate and key", "Boss items"], 9),
                       (b, ["Item", "What it does", "Dropped by"], 9), (tr, ["Trophy", "Boss"], 9),
                       (m, ["Material", "Drops from", "Used for"], 13)):
        out += [f"{t['id']}: columns {t['columns']}"] if t["columns"] != cols else []
        out += [f"{t['id']}: {len(t['rows'])} rows, want {n}"] if len(t["rows"]) != n else []
        out += [f"{t['id']}: row {r} has an empty or None cell" for r in t["rows"] if not all(c.strip() and c != "None" for c in r)]
        icons = t.get("icons") or [None] * len(t["rows"])
        out += [f"{t['id']}: row {r[0]!r} has no picture file" for r, i in zip(t["rows"], icons)
                if not (i and (facts.SITE / "public/wiki/icons" / f"{i}.png").exists())]
    bosses, zone_items = [r[1] for r in z["rows"]], [r[2] for r in z["rows"]]
    for r in z["rows"]:
        out += [f"zone row {r[0]!r}: no difficulty"] if not re.search(r" \((Easy|Medium|Hard|Very Hard)\)$", r[0]) else []
        out += [f"zone row {r[0]!r}: set {r[3]!r}"] if not r[3].endswith(" Set") else []
        out += [f"zone row {r[0]!r}: crate and key {r[4]!r}"] if not re.fullmatch(r".+ \(.+ Key\)", r[4]) else []
    out += [f"zone table: {len(set(c))} distinct {w}, want 9" for c, w in ((bosses, "bosses"), (zone_items, "zone items"),
                                                                          ([r[0] for r in z["rows"]], "areas")) if len(set(c)) != 9]
    out += [f"boss item {r[0]!r}: effect {r[1]!r}" for r in b["rows"] if not r[1].endswith("Dungeon only.") or len(r[1]) < 20]
    out += [f"boss item {r[0]!r}: dropper {r[2]!r} is not a mini boss" for r in b["rows"] if not set(r[2].split(", ")) <= set(bosses)]
    out += [f"boss item {r[0]!r} is not in its boss's zone row" for r in b["rows"]
            if not any(r[0] in zr[5].split(", ") for zr in z["rows"] if zr[1] in r[2].split(", "))]
    out += [f"trophy {r!r}" for r in tr["rows"] if r[0] != f"{r[1]} Trophy" or r[1] not in bosses]
    out += [f"trophies cover {sorted(set(r[1] for r in tr['rows']))}, want every mini boss"] if set(r[1] for r in tr["rows"]) != set(bosses) else []
    want = {"Prismatic Resin", "Living Prism", "Blank Spawner", "Spawners", *zone_items}
    out += [f"materials are {sorted(r[0] for r in m['rows'])}, want {sorted(want)}"] if {r[0] for r in m["rows"]} != want else []
    return out


def drop_tables(d):
    return {f.stem: json.loads(f.read_text(encoding="utf-8")) for f in sorted(pathlib.Path(d).glob("dungeon-*.json"))}


# D-T1 + D-T2 on the shipped tables (what the page shows).
shipped = drop_tables(sys.argv[1] if len(sys.argv) > 1 else facts.OUT)
assert sorted(shipped) == ["dungeon-boss-items", "dungeon-materials", "dungeon-trophies", "dungeon-zone-drops"], sorted(shipped)
problems = drop_shapes(shipped) + [p for t in shipped.values() for p in drop_leaks(t)]
assert not problems, "\n".join(problems)
# The guard itself: each kind of leak is caught, the Teardrop Charm's own Luck line is not.
LEAK_T = {"id": "dungeon-boss-items", "title": "Boss items", "columns": ["Item", "What it does", "Dropped by"]}
assert not drop_leaks({**LEAK_T, "rows": [["Pale Teardrop Charm", "Carry it: +10 Luck in the dungeon. Dungeon only.", "The Pale Matron"]]})
for cell in ("15%", "Drop weight 4", "2 rolls", "Key chance", "Better odds", "Pity meter", "Guaranteed", "Empty roll",
             "t3", "hw_mossgate_sp", "zone_gem", "$5,000", "500 Prism", "+10 Luck"):
    assert drop_leaks({**LEAK_T, "rows": [["Mossback Shell", cell, "Old Mossback"]]}), cell

# D-T3: the generator on fixture configs full of weights, rolls, key chances and tier labels gives rows with none of them.
KIND_JAVA = '''enum Kind {
    SHELL(Material.TURTLE_SCUTE, "Mossy Shell", "Hold it and sneak: no knockback."),
    CHARM(Material.GHAST_TEAR, "Mossy Charm", "Carry it: steady hands.");
}
String trophy = display + " Trophy"; List.of("<dark_gray>Dungeon only.");
'''
gz = lambda: give(["Mossy Cap", "Spores settle."])
DROPS = {
    "mobs": {"hw_boss": {"loot": ["hw_boss_t3", "hw_boss_t4"], "key-drop-chance": 0.0437, "damage-share": 0.1},
             "hw_grunt": {"loot": "hw_grunt_t2"}, "not_hw": {"loot": "other"}},
    "loot": {"tables": {
        "hw_boss_t3": {"rolls": 3, "tier": "t3", "entries": [
            {"weight": 17.25, "item": "itemsadder:hw:sporecap", "amount": "2-5"},
            {"weight": 3.75, "item": "special:shell"}, {"weight": 0.625, "item": "special:head_hw_boss"},
            {"weight": 11.5, "commands": [gz()]}, {"weight": 41.5, "item": "minecraft:bread"}]},
        "hw_boss_t4": {"rolls": 2, "guarantee": {"t5": 1}, "entries": [{"weight": 0.0625, "item": "special:charm"},
                                                                        {"weight": 9.125, "item": "itemsadder:hw:resin"}]},
        "hw_grunt_t2": {"rolls": 1, "entries": [{"weight": 23.5, "item": "itemsadder:hw:resin"}, {"weight": 0.875, "spawner": "ZOMBIE"},
                                                {"weight": 1.375, "item": "cc:blank"}, {"weight": 6.5, "item": "itemsadder:hw:sporecap"}]},
        "hw_moss_crate_t": {"rolls": 6, "pity": 40, "entries": [{"weight": 0.3125, "item": "itemsadder:hw:living_prism"},
                                                                 {"weight": 5.5, "item": "itemsadder:hw:resin"}]},
        "other": {"entries": []}}},
    "areas": {"moss.yml": {"name": "&aMoss Landing", "difficulty": "EASY", "camps": ["moss_boss", "moss_sp", "moss_gem"]}},
    "camps": {"moss_boss.yml": {"boss": {"mob": "hw_boss", "chance": 0.33}}, "moss_sp.yml": {"crate": {"id": "moss_crate"}},
              "moss_gem.yml": {"crate": {"id": "moss_crate"}}},
    "crates": {"moss_crate.yml": {"display": "&2Moss Crate", "key": "moss_key", "loot": "hw_moss_crate_t", "opens": 3}},
    "keys": {"moss_key": {"display": "&2Moss Key", "drop-chance": 0.0437}},
    "config": {"contracts": {"zones": {"moss": {"item": "hw:sporecap", "price": 2500}}, "resin": "hw:resin", "fee": 750},
               "special": {"cooldown-seconds": {"shell": 60}}, "luck": {"per-charm": 10}},
    "mythic": {"hw_boss": "Old Mossy", "hw_grunt": "Grunt"},
    "names": {"hw:sporecap": "Sporecap Tuft", "hw:resin": "Prismatic Resin", "hw:living_prism": "Living Prism"},
    "icons": {"hw:sporecap": "brown_mushroom", "hw:resin": "resin", "hw:living_prism": "living_prism"},
    "cc_items": {"blank": {"name": "&fBlank Spawner", "material": "SPAWNER"}},
    "recipes": {"zone_sets": {"recipes": {"z_cap": {"output": {"give": gz()}, "inputs": [{"item": "hw:sporecap", "amount": 4},
                                                                                       {"item": "hw:resin", "amount": 8}]}}},
                "gear": {"recipes": {"g": {"output": {"itemsadder": "living_prism:helmet"}, "inputs": [{"item": "hw:living_prism", "amount": 2}]}}},
                "spawners": {"recipes": {"s": {"output": {"spawner-type": "ZOMBIE"}, "inputs": [{"item": "cc:blank", "amount": 1}]}}}},
    "hw": hw, "kinds": facts.special_kinds(KIND_JAVA)}
built = facts.build_hw_drops(DROPS)
assert built["dungeon-zone-drops"] == [["Moss Landing (Easy)", "Old Mossy", "Sporecap Tuft", "Mossy Set", "Moss Crate (Moss Key)",
                                        "Mossy Shell, Old Mossy Trophy, Mossy Charm"]], built["dungeon-zone-drops"]
assert built["dungeon-boss-items"] == [["Mossy Shell", "Hold it and sneak: no knockback. 1 min cooldown. Dungeon only.", "Old Mossy"],
                                       ["Mossy Charm", "Carry it: steady hands. Dungeon only.", "Old Mossy"]], built["dungeon-boss-items"]
assert built["dungeon-trophies"] == [["Old Mossy Trophy", "Old Mossy"]], built["dungeon-trophies"]
assert [r[0] for r in built["dungeon-materials"]] == ["Living Prism", "Prismatic Resin", "Sporecap Tuft", "Blank Spawner", "Spawners"], built["dungeon-materials"]
seen = json.dumps(built)
assert not any(s in seen for s in ("17.25", "3.75", "0.625", "11.5", "41.5", "0.0625", "9.125", "23.5", "0.875", "1.375", "6.5",
                                   "0.3125", "5.5", "0.0437", "0.33", "0.1", "2-5", "2500", "750", "40", "10", "Bread")), seen
for tid, rows in built.items():
    assert not drop_leaks({"id": tid, "title": "", "columns": [], "rows": rows}), (tid, drop_leaks({"id": tid, "title": "", "columns": [], "rows": rows}))

print("wiki_drops_test: PASS")
