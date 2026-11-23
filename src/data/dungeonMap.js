// Heartwood map data, ported from the approved mock-up (run 20261121-dungeon-map) and checked against
// chromatic-dungeons release/chromabithia (areas/*.yml, camps/*.yml, crates/*.yml, config.yml, the
// MythicMobs pack). Coordinates are world blocks. No em dashes: players read every string here.

// [name, colour, armour, waypoint cost]
export const DIFF = [
  ['EASY', '#55FF55', 'Iron', 'Free'],
  ['MEDIUM', '#FFAA00', 'Sporewarden or diamond', '$10,000'],
  ['HARD', '#FF7A45', 'Chromatic', '$20,000'],
  ['VERY HARD', '#E83A3A', 'Living Prism', '$40,000'],
];

// Respawn timers (camps/*.yml `respawn:`): interval-seconds per difficulty for camps, mini bosses and the Heart, and
// jitter-seconds, which CampDefs applies as plus or minus. The Heart has no jitter. The page shows interval + jitter.
export const RESPAWN = { camp: [180, 180, 225, 225], boss: 225, final: 1350, jitter: 45, finalJitter: 0 };

const R = (a, b, c, d) => [[a, c], [b, c], [b, d], [a, d]];

// n name, d difficulty, L depth layer (2 upper, 1 middle, 0 deep), c colour, p polygon [x, z], y range, t theme,
// lp label point [x, z], k camps [name, x, y, z], cr crates [x, y, z], b boss, key crate name, item, set, sp specials,
// o outskirts
export const ZONES = [
  {
    n: 'Mossgate Landing', d: 0, L: 2, c: '#6FBF5A', y: [50, 86], t: 'Covered moss hall and the Root Gate tunnel. Everyone starts here.', lp: [-985, -730],
    p: [[-1084, -768], [-928, -768], [-928, -808], [-890, -808], [-890, -762], [-856, -762], [-856, -690], [-1084, -690]],
    k: [['Root Gate', -907.5, 66, -786.5], ['Sporefall Steps', -1051.5, 58, -733.5], ['Moss Crossing', -939.5, 66, -744.5]],
    cr: [[-901.5, 67, -789.5], [-1053.5, 59, -728.5], [-888.5, 68, -723.5]], key: 'Mossgate Crate', item: 'Sporecap Tuft', set: 'Sporewarden', sp: 'Mossback Shell',
    b: { n: 'Old Mossback', hp: 60, at: [-885.5, 67, -722.5], camp: 'Mossback Shrine', m: 'Ground Slam. Calls 2 Sporelings.' },
  },
  {
    n: 'The Ochre Warrens', d: 0, L: 1, c: '#D98A4E', y: [10, 54], t: 'Terracotta canyon full of burrows.',
    p: [[-924, -680], [-848, -680], [-848, -572], [-886, -572], [-886, -592], [-924, -592]],
    k: [['Burrow Run', -911.5, 21, -602.5], ['Kiln Hollow', -875.5, 40, -668.5], ['Warren Crossing', -902.5, 42, -636.5]],
    cr: [[-912.5, 23, -600.5], [-876.5, 39, -669.5], [-863.5, 41, -653.5]], key: 'Ochre Cache', item: 'Kiln Shard', set: 'Kilnforged',
    b: { n: 'The Kilnmother', hp: 60, at: [-861.5, 41, -653.5], camp: 'Ochre Den', m: 'Kiln Breath fire cone. Pulls Burrowing Husks out of the walls.' },
  },
  {
    n: 'Mirewood Roots', d: 1, L: 1, c: '#A68F5B', y: [4, 48], t: 'Mangrove, mud channels and a boardwalk.', p: R(-1144, -1064, -688, -548),
    k: [['Sunken Weir', -1115.5, 22, -659.5], ['Mangrove Knot', -1083.5, 24, -663.5], ['Mudroot Shallows', -1095.5, 23, -623.5]],
    cr: [[-1116.5, 27, -662.5], [-1084.5, 27, -666.5], [-1116.5, 28, -575.5]], key: 'Mirewood Crate', item: 'Bog Pearl', set: 'Bogstrider', sp: 'Rot Village Bell',
    b: { n: 'Bogmaw', hp: 180, at: [-1119.5, 20, -575.5], camp: 'Weeping Mire', m: '3 mud pools (5 with 3+ players). Gulp.' },
  },
  {
    n: 'The Resin Hive', d: 1, L: 1, c: '#F2B632', y: [20, 70], t: 'Honeycomb halls and bee chambers.',
    p: [[-948, -591], [-887, -591], [-887, -571], [-872, -571], [-872, -524], [-948, -524]],
    k: [['Comb Galleries', -891.5, 35, -561.5], ['Amber Vault', -897.5, 38, -585.5], ['Honeycomb Loft', -926.5, 33, -578.5]],
    cr: [[-892.5, 34, -560.5], [-896.5, 36, -579.5], [-908.5, 28, -555.5]], key: 'Hive Crate', item: 'Royal Wax', set: 'Waxguard', sp: 'Royal Jelly, Waxed Lantern',
    b: { n: 'The Hive Matron', hp: 160, at: [-910.5, 29, -555.5], camp: 'Royal Cell', m: 'Resin Rain and drone swarms. Enrages once her drones are dead.' },
  },
  {
    n: 'Glowberry Canopy', d: 2, L: 1, c: '#E77FC2', y: [14, 49], t: 'Giant azalea crown with a deck and a lantern pavilion.', lp: [-1000, -615],
    p: [[-1062, -689], [-926, -689], [-926, -593], [-950, -593], [-950, -571], [-1062, -571]],
    k: [['Berry Bridges', -1017.5, 34, -657.5], ['Lantern Boughs', -964.5, 36, -596.5], ['Azalea Ruin', -975.5, 31, -623.5]],
    cr: [[-1014.5, 33, -655.5], [-968.5, 37, -595.5], [-999.5, 32, -642.5]], key: 'Glowberry Crate', item: 'Glowbloom', set: 'Bloomshroud', sp: 'Glowbloom Staff',
    b: { n: 'The Glowmother', hp: 200, at: [-1001.5, 31, -636.5], camp: 'Lantern Crown', m: 'Flare blind. Vine Cage.' },
  },
  {
    n: 'The Pale Drip', d: 2, L: 0, c: '#C9D3C0', y: [-50, 3], t: 'Dripstone caves hung with pale moss.', p: R(-1138, -1024, -646, -576),
    k: [['Dripfall Gallery', -1100.5, -19, -617.5], ['Hanging Moss Hall', -1069.5, -36, -619.5], ['Mossdrip Pool', -1085.5, -24, -587.5]],
    cr: [[-1092.5, -18, -617.5], [-1069.5, -37, -613.5], [-1119.5, -17, -597.5]], key: 'Pale Crate', item: 'Pale Teardrop', set: 'Palewatch', sp: 'Pale Teardrop Charm',
    b: { n: 'The Pale Matron', hp: 200, at: [-1113.5, -16, -589.5], camp: 'The Stillwell', m: 'Stalactite Storm. Still Gaze. 3 Pale Creakers.' },
  },
  {
    n: 'The Sulfur Geode', d: 2, L: 0, c: '#E3D95B', y: [-40, -10], t: 'Sulfur, end stone and amethyst cave.', p: R(-870, -815, -745, -676),
    k: [['Vent Fields', -827.5, -24, -702.5], ['Sulfur Seep', -865.5, -17, -744.5]],
    cr: [[-836.5, -17, -731.5], [-824.5, -21, -707.5]], key: 'Geode Crate', item: 'Geode Heartstone', set: 'Geodeplate', sp: 'Geode Sling, Choir Fork',
    b: { n: 'The Geode Tyrant', hp: 240, at: [-841.5, -18, -730.5], camp: 'Prism Heart', m: 'Shielded until her Geode Crystals break (3, or 5 with 3+ players). Resonance Pulse.' },
  },
  {
    n: 'The Hollow Below', d: 3, L: 2, c: '#2FB8A6', y: [49, 90], t: 'Sculk, warped forest and obsidian.', p: R(-1124, -985, -566, -466),
    k: [['Echo Trench', -1082.5, 50, -544.5], ['Warped Rift', -1007.5, 52, -490.5], ['Crying Ledge', -1038.5, 51, -521.5]],
    cr: [[-1085.5, 50, -542.5], [-1011.5, 53, -494.5], [-1049.5, 55, -495.5]], key: 'Hollow Crate', item: 'Hollow Echo', set: 'Sculkhollow', sp: "Listener's Ear",
    b: { n: 'The Listener', hp: 320, at: [-1052.5, 55, -496.5], camp: 'Obsidian Maw', m: 'Sonic Boom: break line of sight at the pillars. Darkness every 20 s. Enrages if 3 Shriekers go off.' },
  },
  {
    n: 'Heartwood Core', d: 3, L: 0, c: '#E0506A', y: [-64, 13], t: 'The base of the trunk: a mud and mangrove cavern. The last area.', p: R(-1022, -926, -700, -558),
    k: [['Sap Veins', -1013.5, -50, -674.5], ['Root Cathedral', -985.5, -54, -609.5], ['Heartwater Bank', -958.5, -55, -629.5], ['Rootwater Steps', -954.5, -54, -595.5], ['Lily Shore', -1018.5, -55, -611.5], ['Mushroom Shelf', -1004.5, -33, -630.5]],
    cr: [[-1007.5, -52, -673.5], [-980.5, -56, -609.5], [-982.5, -56, -636.5]], key: 'Core Crate', item: 'Rotroot Heartseed', set: 'Rotroot', sp: 'Branch of Heartwood (2%)',
    b: { n: 'The Rotroot Heart', hp: 800, final: 1, at: [-987.5, -55, -636.5], camp: 'Heart Chamber', m: 'Phase 1 Root Slam. Phase 2 Spore Storm: shielded while her 4 Root Nodes live (6 with 3+ players). Phase 3 Heartbeat, enrages at 10%.' },
  },
  // outskirts: one or two camps each, no boss
  { n: 'The Rot Village', o: 1, d: 0, L: 2, y: [55, 75], p: R(-909, -861, -633, -591), k: [['Rot Village', -884.5, 63, -608.5]] },
  { n: 'Reedwater', o: 1, d: 1, L: 1, y: [14, 34], p: R(-1000, -952, -762, -714), k: [['Reedwater', -975.5, 23, -741.5]] },
  { n: 'The Tidepool', o: 1, d: 1, L: 1, y: [0, 20], p: R(-1084, -1036, -548, -512), k: [['Tidepool', -1056.5, 8, -535.5]] },
  { n: 'The Drowned Wharf', o: 1, d: 1, L: 1, y: [-8, 12], p: R(-912, -864, -731, -683), k: [['Drowned Wharf', -887.5, -1, -706.5], ['Wharf Landing', -910.5, -1, -689.5]] },
  { n: 'The Moss Grotto', o: 1, d: 1, L: 0, y: [-51, -37], p: R(-919, -871, -710, -662), k: [['Moss Grotto', -894.5, -44, -685.5]] },
  { n: 'The Mudflats', o: 1, d: 1, L: 0, y: [-17, 3], p: R(-962, -914, -533, -485), k: [['Mudflats', -937.5, -11, -508.5], ['Mudflat Boards', -954.5, -13, -531.5]] },
  { n: "River's Bend", o: 1, d: 1, L: 0, y: [-36, -16], p: R(-884, -836, -672, -624), k: [["River's Bend", -860.5, -29, -647.5]] },
  { n: 'Crystal Choir', o: 1, d: 2, L: 0, y: [-36, -16], p: R(-996, -948, -768, -720), k: [['Crystal Choir', -971.5, -29, -743.5]], cr: [[-971.5, -27, -747.5]], key: 'Geode Crate' },
  { n: 'Spider Hollow', o: 1, d: 2, L: 0, y: [-43, -23], p: R(-926, -886, -577, -529), k: [['Spider Hollow', -909.5, -36, -552.5]] },
];

// [type, name, x, y, z, zone name, extra]
export const EXTRA = [
  ['way', 'Easy waypoint', -906.5, 65, -811.5, 'Mossgate Landing', 0], ['way', 'Medium waypoint', -884.5, 3, -677.5, 'The Drowned Wharf', 1],
  ['way', 'Hard waypoint', -982.5, -33, -722.5, 'Crystal Choir', 2], ['way', 'Very Hard waypoint', -996.5, -53, -691.5, 'Heartwood Core', 3],
  ['guard', 'Hollow Bridge Guard', -992.5, 56, -545.5, 'The Hollow Below'], ['guard', 'Hive Bridge Guard', -907.5, 67, -576.5, 'The Resin Hive'],
  ['guard', 'Mire Steps Guard', -1065.5, 65, -697.5, 'Mossgate Landing'], ['guard', 'Canopy Bridge Guard', -1058.5, 19, -590.5, 'Glowberry Canopy'],
  ['guard', 'Core Bridge Guard', -941.5, -39, -565.5, 'Heartwood Core'],
  ['npc', 'Contracts', -909.5, 65, -808.5, 'Mossgate Landing', '/dungeon contract'], ['npc', 'Enchanter', -903.5, 65, -808.5, 'Mossgate Landing', '/craft'],
  ['npc', 'Contracts', -885.5, 3, -680.5, 'The Drowned Wharf', '/dungeon contract'], ['npc', 'Contracts', -981.5, -33, -725.5, 'Crystal Choir', '/dungeon contract'],
  ['npc', 'Contracts', -998.5, -53, -689.5, 'Heartwood Core', '/dungeon contract'],
];
