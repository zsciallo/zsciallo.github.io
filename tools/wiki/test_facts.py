"""Self-test for facts.py: python tools/wiki/test_facts.py"""
import json
import pathlib
import sys
import tempfile

sys.path.insert(0, str(pathlib.Path(__file__).parent))
import facts  # noqa: E402

# Colour codes, hex, MiniMessage and AE placeholders are stripped.
assert facts.clean("&c&lIron &7Kit <gradient:#fff:#000>Gold</gradient> {#4CE07A}Shard &#FF00FFof %group-color%Light") \
    == "Iron Kit Gold Shard of Light"
assert facts.name("minecraft:DIAMOND_SWORD") == "Diamond Sword" and facts.name("totem_of_undying") == "Totem of Undying"

# A stated percentage chance loses its number; other percentages stay.
SAMPLE_ENCHANTS = {
    "twice": {"display": "%group-color%Twice", "description": "15% chance to strike twice.", "type": "ATTACK",
              "group": "ELITE", "applies": ["ALL_SWORD"], "levels": {"1": {"chance": 15}, "2": {"chance": 30}}},
    "mend": {"display": "&aMend", "description": "Has a 7.5% chance to heal,\nbelow 30% health.", "type": "DEFENSE",
             "group": "SIMPLE", "applies": ["ALL_ARMOR"], "levels": {"1": {"chance": 50}}},
    "aim": {"display": "Aim", "description": "Arrows fly true (chance of 20%).", "type": "BOW", "group": "SIMPLE",
            "applies": ["BOW"], "levels": {"1": {}}},
    "orb": {"display": "Orb", "description": "Speed while held.", "type": "HELD", "group": "CHROMATIC",
            "applies": ["EMERALD"], "levels": {"1": {}}},
}
UPGRADES = {"upgrades": {"twice": {"enchant": "twice", "max-level": 1}}}
gears, removed, left_out = facts.build_enchants(SAMPLE_ENCHANTS, UPGRADES)
assert gears == {"weapons": [["Twice", "1", "Swords", "Chance to strike twice."]],
                 "armour": [["Mend", "1", "All armour", "Has a chance to heal, below 30% health."]],
                 "ranged": [["Aim", "1", "Bows", "Arrows fly true (chance)."]]}, gears
assert removed == 3 and left_out == ["orb"]
_, n = facts.build_augments({"pool": [{"name": "Hook", "rarity": "gold",
                                       "lore": ["<gray>Archers only: 40% chance", "<gray>to slow."], "effects": []}]})
assert _ == [["Hook", "Gold", "Archers only: a chance to slow."]] and n == 1

# Small-caps letters fold to plain ones.
assert facts.clean("<#3498DB>ᴡᴀʀᴅᴇɴ ꜱᴘᴀᴡɴᴇʀ") == "Warden Spawner"

# ExcellentCrates 7: rewards with weights and rarity come out as names only; an unplaced crate is left out.
def crate(name, key, rewards, placed=True):
    return {"display": {"name": name}, "blocks": {"positions": {"spawn": ["1,2,3,0.0,0.0"]} if placed else {}},
            "key_requirements": {"enabled": True, "keys": {key: {"amount": 1}}},
            "rewards": {"required_rewards": 1, "reward_list": {r: {"reward_id": r} for r in rewards}}}
def reward(name, value="", item=False):
    return {"base": {"weight": 12.5}, "Rarity": {"enabled": True, "rarity_id": "mythic"},
            "preview": {"name": name, "use_item_data": item, "icon": {"Data": {"Value": value}}}}
CRATES = {"test_crate.yml": crate("<gradient:#F2CCFF:#7B2FBE>Test Crate</gradient>", "test_key", ["gem", "ingot", "blade", "rib"]),
          "old_crate.yml": crate("Old Crate", "test_key", ["gem"], placed=False)}
REWARDS = {"test_crate": {
    "gem": reward("&bGem"),
    "ingot": reward("Netherite Ingot X2", '{count:2,id:"minecraft:netherite_ingot"}', item=True),
    "blade": reward("Blade X1", '{components:{"minecraft:custom_name":{text:"",extra:[{text:"Big ",color:"#fff"},'
                    '{text:"Blade"}]},"minecraft:lore":[{text:"nope"}]},count:1,id:"minecraft:netherite_sword"}', item=True),
    "rib": reward("Trim Rib", '{count:1,id:"minecraft:rib_armor_trim_smithing_template"}', item=True)},
    "old_crate": {"gem": reward("Gem")}}
KEYS = {"test_key": {"display": {"name": "Test Key"}}}
# The stack size comes from the given item when the name does not already count it.
stack = lambda name, count: {**reward(name, item=True), "items": {"item_list": {"0": {"Data": {"Value": f'{{count:{count},id:"minecraft:iron_block"}}'}}}}}
assert [facts.reward_name(stack(n, c), "t") for n, c in (("Iron Block", 8), ("Elytra", 1), ("Netherite Ingot X2", 2), ("4x Resin", 4))]     == ["Iron Block x8", "Elytra", "Netherite Ingot x2", "4x Resin"]
rows = facts.build_smp_crates(CRATES, REWARDS, KEYS)
assert rows == [["Test Crate", "Test Key", "Gem, Netherite Ingot x2, Big Blade, Armour trims (Rib)"]], rows
assert not any(s in json.dumps(rows) for s in ("12.5", "mythic", "nope", "Old Crate"))

# Essentials kits: one-time and command-only kits are left out, rank kits show the rank, keys and Prism are named.
KITS = {"kits": {"starter": {"delay": -1, "items": ["stonesword 1"]},
                 "commandsbook": {"delay": 30, "items": ["/chelp item {USERNAME}"]},
                 "tools": {"delay": 600, "items": ["stonesword 1", "diamond_sword 1 sharpness:2", "bread 32",
                                                   "golden_shovel 1 name:&6Claim_Shovel lore:Right-click"]},
                 "vipplus": {"delay": 86400, "items": ["/cratekey give {USERNAME} test_key 2", "/prism give {USERNAME} 500"]}}}
assert facts.build_smp_kits(KITS, KEYS) == [
    ["Tools", "/kit tools", "10 min", "Stone Sword, Diamond Sword (Sharpness II), Bread x32, Claim Shovel (Golden Shovel)"],
    ["VIP+", "/kit vipplus", "1 d", "Test Key x2, 500 Prism Shards"]], facts.build_smp_kits(KITS, KEYS)

# A denied path is never read, and a table whose plugin has no jar at the ref is refused.
smp = facts.Repo(facts.SMP_REPO, facts.REFS["smp"], json.loads(facts.DENY.read_text(encoding="utf-8"))["paths"])
for denied in ("plugins/ChromaticSeal/config.yml", "plugins/ChromaticAuctionHouse/house-fill.yml",
               "plugins/ChromaticAuctionHouse/nudges.yml", "plugins/GrimAC/database.yml",
               "plugins/ChromaticCrafting/config.yml", "plugins/ChromaBound/config.yml",
               "plugins/ChromaticAuctionHouse/config.yml", "plugins/LuckPerms/config.yml"):
    try:
        smp.yaml(denied)
    except facts.ShapeError as e:
        assert "deny list" in str(e), e
    else:
        raise AssertionError(f"{denied} was read")
smp.check("plugins/Essentials/kits.yml")
try:
    smp.need_jar("PlayerKits2")
except facts.ShapeError as e:
    assert "not installed" in str(e)
else:
    raise AssertionError("PlayerKits2 has no jar but passed")

arsenal = facts.build_arsenal({"rarities": ["COMMON", "RARE"], "crates": {"arsenal": {"pity": {"within": 10}, "pool": [
    {"reward": "kit:a", "rarity": "RARE", "weight": 3}, {"reward": "kit:b", "rarity": "COMMON", "weight": 72}]}}},
    {"kits": {"a": {"name": "Alpha"}, "b": {"name": "<gold>Beta"}}})
assert arsenal == [["Common", "Beta"], ["Rare", "Alpha"]], arsenal

# The guard catches a deny-list term and a leaked config key.
terms = [__import__("re").compile(t, 2) for t in facts.SPEC_TERMS]
assert facts.guard({"id": "t", "rows": [["Crate", "weight: 5"]]}, terms)
assert facts.guard({"id": "t", "rows": [["Use /caa reload"]]}, terms)
assert facts.guard({"id": "t", "rows": [["Chance to strike twice.", "Featherweight"]]}, terms) is None

# An unexpected config shape raises, naming the file and key.
for bad, call in [
    ("kits.x: key 'delay'", lambda: facts.build_smp_kits({"kits": {"x": {"items": ["stone 1"]}}}, {})),
    ("crate/x.yml: key 'blocks'", lambda: facts.build_smp_crates({"x.yml": {"display": {"name": "X"}}}, {}, {})),
    ("unknown item GOLDEN_STAR", lambda: facts.build_enchants({"e": {**SAMPLE_ENCHANTS["aim"], "applies": ["GOLDEN_STAR"]}},
                                                             UPGRADES)),
    ("free.yml: key 'tiers'", lambda: facts.build_pass({"tier": {}}, {}, "free.yml")),
    ("ffa-kits.yml:kits.x: key 'price'", lambda: facts.build_ffa_kits({"kits": {"x": {"name": "X", "items": [
        {"material": "stone"}]}}})),
]:
    try:
        call()
    except facts.ShapeError as e:
        assert bad in str(e), (bad, str(e))
    else:
        raise AssertionError(f"no ShapeError for {bad}")

# Ordering is stable: shuffled input gives the same rows.
shuffled = dict(reversed(list(SAMPLE_ENCHANTS.items())))
assert facts.build_enchants(shuffled, UPGRADES)[0] == gears

# The real configs: every table parses, has rows, and a rerun gives the same bytes.
with tempfile.TemporaryDirectory() as a, tempfile.TemporaryDirectory() as b:
    out, skipped, removed, notes, blocked = facts.run(facts.REFS["smp"], facts.REFS["kit"], pathlib.Path(a))
    facts.run(facts.REFS["smp"], facts.REFS["kit"], pathlib.Path(b))
    files = sorted(pathlib.Path(a).glob("*.json"))
    assert files and len(files) == len(out)
    for f in files:
        t = json.loads(f.read_text(encoding="utf-8"))
        assert t["rows"] and all(len(r) == len(t["columns"]) and all(isinstance(c, str) and c for c in r)
                                 for r in t["rows"]), f.name
        assert f.read_bytes() == (pathlib.Path(b) / f.name).read_bytes(), f"{f.name} differs between runs"
    print(f"real run: {len(files)} tables written, skipped {skipped or 'none'}")
    for msg in blocked:
        print(f"WARNING blocked by the guard (facts.py exits 1): {msg[:120]}...")
print("test_facts: PASS")
