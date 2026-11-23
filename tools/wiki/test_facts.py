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

# Icons: config materials only, minecraft: dropped, anything else (ItemsAdder ids) None; a Row still equals its list.
assert [facts.icon(m) for m in ("DIAMOND_SWORD", "minecraft:trial_key", "itemsadder:ruby", None)] == ["diamond_sword", "trial_key", None, None]
assert facts.Row(["a"], "bow") == ["a"] and facts.Row(["a"], "bow").icon == "bow"

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

# ---- Gear tables
# hw_gear.py is parsed, never run: a file that would exit on import still parses, and a non-literal is refused.
HW_SRC = '''raise SystemExit("executed")
SETS = {"Mossy": ("Mossgate Landing", "EASY", "5B7F3A", "wild", "emerald", "7FBF5A",
                  "Hit by a mob: 15% chance of Regeneration I for 4s.", {
                      "helmet": ("Mossy Cap", {}, [("glowing", 1)], "Spores settle."),
                      "boots": ("Mossy Treads", {"feather_falling": 2}, [], "Green prints.")})}
HEARTGROWN_SETS = ("Mossy",)
TIER_ENCHANTS = {"EASY": (2, 2)}
HEARTGROWN_ENCHANTS = (4, 3)
AE_ENCHANTS = {"glowing": ("Glowing", "AAAAAA"), "ambit": ("Ambit", "FFFF55")}
BRANCH_ID = "branch_of_heartwood"
BRANCH_NAME = "Branch of Heartwood"
BRANCH_ENCHANTS = {"sharpness": 5}
BRANCH_AE = [("ambit", 1)]
BRANCH_LORE = [[("AAAAAA", "Broken.")], [("555555", "It still remembers growing.")]]
GEAR_ITEMS = tuple(_piece_ids())
'''
hw = facts.hw_literals(HW_SRC)
assert hw["HEARTGROWN_SETS"] == ("Mossy",) and "GEAR_ITEMS" not in hw
for bad_src, msg in ((HW_SRC.replace('HEARTGROWN_SETS = ("Mossy",)', "HEARTGROWN_SETS = tuple(SETS)"), "HEARTGROWN_SETS is not a literal"),
                     (HW_SRC.replace("BRANCH_ID = ", "BRANCH = "), "no literal BRANCH_ID")):
    try:
        facts.hw_literals(bad_src)
    except facts.ShapeError as e:
        assert msg in str(e), e
    else:
        raise AssertionError(f"hw_literals accepted: {msg}")

def give(texts):
    return "minecraft:give %player% minecraft:leather_helmet[minecraft:lore=[" + ",".join(f'{{text:"{t}"}}' for t in texts) + "]] 1"
SETS = {"Glint.yml": {"material": "NETHERITE", "items": {
            "boots": {"name": "&bGlint Boots", "itemsadder": "glint:glint_boots", "enchants": ["protection:5", "zap:1"],
                      "lore": ["", "SET BONUS", "{#C77DFF}* Strength I", "* Zap, 15% chance to shock", "on a hit", "(Requires all 4.)", "", "bound"]},
            "helmet": {"name": "Glint Helmet", "itemsadder": "glint:glint_helmet", "enchants": ["protection:5"], "lore": []}}},
        "GlintSword.yml": {"material": "NETHERITE_SWORD", "items": {"weapon": {"name": "Glint Sword", "itemsadder": "glint:glint_sword",
            "enchants": ["sharpness:8"], "lore": ["", "* Takes heads", ""]}}},
        "GlintExample.yml": {"items": {"weapon": {"name": "Stock Example", "enchants": ["sharpness:1"]}}},
        "ShardOfZap.yml": {"items": {"weapon": {"name": "Shard of Zap", "itemsadder": "shards:shard_of_zap", "enchants": ["shardofzap:1"]}}}}
RECIPES = {"gear.yml": {"recipes": {"g_boots": {"output": {"itemsadder": "glint:glint_boots", "name": "Glint Boots"}, "inputs": []}}},
           "zone_sets.yml": {"recipes": {"z_cap": {"output": {"give": give(["Mossy Cap", "Spores settle."])}, "inputs": []}}},
           "clusters.yml": {"recipes": {"c_zap": {"output": {"itemsadder": "clusters:zap_cluster", "name": "<b>Cluster of Zap</b>"},
                                                  "inputs": [{"item": "shards:shard_of_zap", "amount": 1},
                                                             {"item": "NETHERITE_INGOT", "amount": 8}]}}}}
GEAR_CRATES = {"glint_crate.yml": crate("Glint Crate", "test_key", ["sword", "boots", "blade", "zap", "trak", "cluster"]),
               "old_crate.yml": crate("Old Crate", "test_key", ["sword", "hat"], placed=False)}
cmd = lambda *c: {"base": {"weight": 12.5}, "commands": {"bundles": {"0": {"commands": list(c), "weight": 1.0}}}}
BLADE = '{components:{"minecraft:custom_name":{text:"Corrupted Blade"},"minecraft:enchantments":{"minecraft:sharpness":5,"minecraft:looting":3}},count:1,id:"minecraft:netherite_sword"}'
GEAR_REWARDS = {"glint_crate": {"sword": cmd("asets givepiece %player_name% GlintSword WEAPON", "ae giveitem %player_name% stattrak 1"),
                                "boots": cmd("asets givepiece %player_name% Glint BOOTS"),
                                "blade": {"base": {"weight": 33.3}, "items": {"item_list": {"0": {"Data": {"Value": BLADE}}}}},
                                "zap": cmd("asets givepiece %player_name% ShardOfZap WEAPON"),
                                "trak": cmd("ae giveitem %player_name% mobtrak 1"),
                                "cluster": cmd("chromatic give %player_name% c_zap")},
                "old_crate": {"sword": cmd("asets givepiece %player_name% GlintSword WEAPON"),
                              "hat": cmd("asets givepiece %player_name% Glint HELMET")}}
LOOT = {"tables": {"boss_t2": {"entries": [{"weight": 4, "commands": [give(["Heartgrown. ", "Mossy Treads", "Green prints."])]},
                                           {"weight": 1, "commands": [give(["It still remembers growing."])]},
                                           {"weight": 9, "commands": [give(["Mossy Cap", "Spores settle."])]}]}}}
ae_by_ia = {"glint:glint_boots": "Glint/boots", "glint:glint_helmet": "Glint/helmet", "glint:glint_sword": "GlintSword/weapon",
            "shards:shard_of_zap": "ShardOfZap/weapon"}
src = facts.gear_sources(RECIPES, GEAR_CRATES, GEAR_REWARDS, LOOT, ae_by_ia, hw)
ae_names = {"zap": "Zap", "shardofzap": "Shard of Zap"}
ia_icons = {"glint:glint_boots": "glint_boots", "glint:glint_sword": "netherite_sword", "shards:shard_of_zap": "shard_of_zap",
            "clusters:zap_cluster": "zap_cluster"}
family = facts.build_ae_family(SETS, "Glint", ae_names, ia_icons, src)
assert family == [
    ["Glint Helmet", "Protection V", "None", "No longer obtainable"],
    ["Glint Boots", "Protection V, Zap I", "Set bonus: Strength I; Zap, 15% chance to shock on a hit (Requires all 4.)", "Crafting, Glint Crate"],
    ["Glint Sword", "Sharpness VIII", "Takes heads", "Glint Crate"]], family  # the stock example set is left out
assert [r.icon for r in family] == ["netherite", "glint_boots", "netherite_sword"]  # helmet: no IA texture, the set material
assert facts.build_hw_sets(hw, src) == [["Mossy Set", "Mossgate Landing", "Easy", "Hit by a mob: 15% chance of Regeneration I for 4s."]]
assert facts.build_hw_pieces(hw, src, False) == [["Mossy Cap", "Mossy Set", "Protection II, Unbreaking II, Glowing I", "Crafting, Heartwood"]]
hg = facts.build_hw_pieces(hw, src, True)
assert hg == [["Heartgrown Mossy Treads", "Mossy Set", "Protection IV, Unbreaking III, Feather Falling II", "Heartwood"],
              ["Branch of Heartwood", "None", "Sharpness V, Ambit I", "Heartwood"]], hg
assert [r.icon for r in hg] == ["leather_boots", "wooden_sword"]
assert facts.build_crate_gear(GEAR_REWARDS, "glint_crate", src) == [["Corrupted Blade", "Sharpness V, Looting III", "Glint Crate"]]
assert facts.build_shards(SETS, {"shardofzap": {"description": "&7Zaps while held."}}, ia_icons, src) == [["Shard of Zap", "Zaps while held.", "Glint Crate"]]
made = facts.build_made_from(RECIPES["clusters.yml"], "clusters.yml", {"shards:shard_of_zap": "Shard of Zap"}, ia_icons, src)
assert made == [["Cluster of Zap", "Shard of Zap, Netherite Ingot x8", "Crafting, Glint Crate"]] and made[0].icon == "zap_cluster"
AE_CONFIG = {"items": {t: {"type": "ECHO_SHARD", "name": f"{{#C77DFF}}{t} Creator", "lore": [f"&7track {t}", "&7Drag it"]}
                       for t in ("stattrak", "mobtrak", "blocktrak", "fishtrak")}}
trackers = facts.build_trackers(AE_CONFIG, src)
assert trackers[:2] == [["stattrak Creator", "Track stattrak", "Glint Crate"], ["mobtrak Creator", "Track mobtrak", "Glint Crate"]]
assert trackers[2][2] == "No longer obtainable" and trackers[0].icon == "echo_shard"
# gems.yml: the drop key never reaches a cell.
GEMS = {"combine-ratio": 80, "tiers": {"rough": {"xp": 1, "drop": 0.25, "delving-prism": 0.5}, "perfect": {"xp": 12, "drop": 3.75, "delving-prism": 6}},
        "fees": {"remove": 500, "unlock": 10000}, "sockets": {"zone": {"max": 1, "open": 1}, "chromatic": {"max": 2, "open": 1}}}
gem_out = [facts.build_gem_tiers(GEMS), facts.build_gem_sockets(GEMS), facts.build_gem_fees(GEMS)]
assert gem_out == [[["Rough", "+1%", "+0.5%", "80 make 1 Perfect"], ["Perfect", "+12%", "+6%", "Top tier"]],
                   [["Heartwood zone sets", "1"], ["Chromatic", "2 (1 open, 1 to unlock)"]],
                   [["Remove a gem", "500 Prism x tier"], ["Unlock a socket", "10,000 Prism"]]], gem_out
everything = json.dumps([gem_out, family, hg, trackers, made, facts.build_crate_gear(GEAR_REWARDS, "glint_crate", src)])
assert not any(s in everything for s in ("0.25", "3.75", "12.5", "33.3", "weight", "drop")), everything

# The deny guard: gear-* tables may show a lore's "15% chance", nothing else is exempt.
deny_terms = [__import__("re").compile(t, 2) for t in json.loads(facts.DENY.read_text(encoding="utf-8"))["terms"]]
assert facts.GEAR_CHANCE_TERM in [p.pattern for p in deny_terms]
assert facts.guard({"id": "gear-x", "rows": [["Hit by a mob: 15% chance of Speed I"]]}, deny_terms) is None
assert facts.guard({"id": "smp-x", "rows": [["Hit by a mob: 15% chance of Speed I"]]}, deny_terms)
assert facts.guard({"id": "gear-x", "rows": [["Drop weight 5"]]}, deny_terms)
assert facts.guard({"id": "gear-x", "rows": [["Use /gem give to add one"]]}, deny_terms)
assert facts.guard({"id": "gear-x", "rows": [["15% chance", "/caa reload"]]}, deny_terms)

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
        icons = t.get("icons")
        assert icons is None or (len(icons) == len(t["rows"]) and all(i is None or facts.ICON.match(i) for i in icons)), f.name
    print(f"real run: {len(files)} tables written, skipped {skipped or 'none'}")
    for msg in blocked:
        print(f"WARNING blocked by the guard (facts.py exits 1): {msg[:120]}...")
print("test_facts: PASS")
