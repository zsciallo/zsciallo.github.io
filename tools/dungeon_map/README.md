# Dungeon map bake

`bake.py` turns the Heartwood part of the dungeon world into the static map data in `public/dungeon/`:

- `blocks.bin.gz`: every block the map camera could see (header, chunk table, x/y/z/state columns)
- `solid.bin.gz`: one bit per grid cell, set where the block is a whole opaque cube
- `atlas.png`: one 48x56 imposter per block state, 32 px per block, drawn with the arena-map ray caster
- `meta.json`: origin, size, counts, the world-to-map frame `A`/`b`, the preview's map rect, state names, world stamp
- `preview.jpg`: the whole island painted from the baked data, 1200 px wide

Formats: `.orch/runs/20261121-dungeon-map/spec-U1.md`. Checked by `npm run test:dungeon`.

## Inputs (read-only)

- `--region`: the dungeon world's region folder (default `F:\Work\minecraft\mc-server\world\dimensions\minecraft\dungeon\region`)
- `--lib`: the arena-map render lib with its 26.2 textures (default `F:\Work\minecraft\.orch\runs\20261114-arena-beta\maps\lib`)
- `--out`: output folder (default `public/dungeon`)

Bounds are fixed in the script: X -1168..-800, Z -832..-448, everything from y -60 up.

## Re-run

From the repo root, after the world changes:

```
python tools/dungeon_map/bake.py
npm run test:dungeon
```

Needs Python with numpy, Pillow and lz4. The script ends with a self-check against the region files and prints
the file sizes; commit the five files in `public/dungeon/`.
