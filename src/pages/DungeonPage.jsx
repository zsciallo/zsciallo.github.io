import { Fragment } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { A, b, origin, preview, size } from '../../public/dungeon/meta.json';
import { DIFF, EXTRA, RESPAWN, ZONES } from '../data/dungeonMap';
import { project, unproject } from '../lib/dungeonMap/data.js';
import { Footer } from '../components/Footer';
import { NavBar } from '../components/NavBar';
import { MotionRoot } from '../lib/motion';

// The Heartwood map (run 20261121-dungeon-map). Everything here renders on the server too; the WebGL map, the view and
// the data loading are src/lib/dungeonMap, loaded after the page is up. Visitor text (search box, URL hash) is only
// compared with the data, never inserted as markup.

const META = { A, b, preview };
const OPEN_Y = 72;
const POINT = 'POINT AT AN AREA FOR COORDINATES';
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const P = (x, y, z) => project(META, x, y, z);

// draw order: deep first, outskirts above main areas of the same depth; picking walks it backwards
const AREAS = [...ZONES].sort((p, q) => p.L - q.L || (p.o || 0) - (q.o || 0)).map((z) => {
  // the outline is the area's footprint laid at its floor: the average height of its camps
  const fy = z.k.reduce((s, c) => s + c[2], 0) / z.k.length;
  const pp = z.p.map(([x, zz]) => P(x, fy, zz));
  const xs = pp.map((p) => p[0]), ys = pp.map((p) => p[1]);
  const bb = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  return { ...z, id: slug(z.n), fy, pp, bb, lp: z.lp ? P(z.lp[0], fy, z.lp[1]) : [(bb[0] + bb[1]) / 2, (bb[2] + bb[3]) / 2] };
});
const byName = Object.fromEntries(AREAS.map((z) => [z.n, z]));
const MARKS = [];
const byId = Object.fromEntries(AREAS.map((z) => [z.id, { z }]));
const INDEX = [];
function mark(t, n, x, y, z, zone, extra) {
  const [mx, my] = P(x, y, z);
  const m = { t, n, x, y, z, mx, my, zone, extra, id: `${t}-${slug(n)}${t === 'crate' || t === 'npc' ? `-${MARKS.length}` : ''}` };
  MARKS.push(m);
  byId[m.id] = { m };
  return m;
}
for (const z of AREAS) INDEX.push({ n: z.n, sub: `${z.o ? 'Outskirts' : 'Area'} · ${DIFF[z.d][0]}`, id: z.id });
for (const z of AREAS) {
  for (const c of z.k) INDEX.push({ n: c[0], sub: `Camp · ${z.n}`, id: mark('camp', ...c, z).id });
  for (const c of z.cr || []) mark('crate', z.key, ...c, z);
  if (z.b) {
    z.boss = mark('boss', z.b.n, ...z.b.at, z, z.b);
    INDEX.push({ n: z.b.n, sub: `${z.b.final ? 'Final boss' : 'Mini boss'} · ${z.n}`, id: z.boss.id });
  }
}
for (const [t, n, x, y, z, zone, extra] of EXTRA) {
  const m = mark(t, n, x, y, z, byName[zone], extra);
  if (t === 'way') INDEX.push({ n, sub: 'Waypoint', id: m.id });
}
const BOSSES = AREAS.filter((z) => z.b);
const bossOfKey = (key) => BOSSES.find((z) => z.key === key)?.b.n;

function inPoly(p, x, z) {
  let c = false;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) if (p[i][1] > z !== p[j][1] > z && x < ((p[j][0] - p[i][0]) * (z - p[i][1])) / (p[j][1] - p[i][1]) + p[i][0]) c = !c;
  return c;
}

// the longest a respawn can take: base + jitter (respawn-scale only ever shortens it)
const campBack = (z) => RESPAWN.camp[z.d] + RESPAWN.jitter;
const secs = (s) => (s >= 600 ? `${s / 60} min` : `${s} s`);
const xyz = (m) => `X ${Math.floor(m.x)}  Y ${Math.floor(m.y)}  Z ${Math.floor(m.z)}`;
const Row = ({ k, children }) => (children ? <div class="dm-row"><dt>{k}</dt><dd>{children}</dd></div> : null);
const Chip = ({ d }) => <span class="dm-chip" style={{ '--c': DIFF[d][1] }}>{DIFF[d][0]}</span>;
const Lines = ({ items }) => items.filter(Boolean).map((t, i) => <Fragment key={i}>{i ? <br /> : null}{t}</Fragment>);

function Legend({ go, open }) {
  return (
    <details data-map-legend open={open}>
      <summary>LEGEND</summary>
      <div class="dm-tiers">
        {DIFF.map((d, i) => (
          <div key={d[0]}><Chip d={i} /><span>{d[2]} armour · waypoint {d[3].toLowerCase()}</span></div>
        ))}
      </div>
      <dl><Row k="BOSSES"><Lines items={BOSSES.map((z) => go(z.boss.id, z.b.n))} /></Row></dl>
    </details>
  );
}

function AreaPanel({ z, go }) {
  return (
    <>
      <p class="dm-eyebrow">{z.o ? 'OUTSKIRTS' : 'AREA'}</p>
      <h2>{z.n}</h2>
      <p><Chip d={z.d} /></p>
      {z.t && <p>{z.t}</p>}
      <dl>
        <Row k="HEIGHT">Y {z.y[0]} to {z.y[1]}</Row>
        <Row k="ARMOUR">{DIFF[z.d][2]}</Row>
        <Row k="BOSS">{z.b && go(z.boss.id, z.b.n)}</Row>
        <Row k="CAMPS"><Lines items={z.k.map((c) => go(`camp-${slug(c[0])}`, c[0]))} /></Row>
        <Row k="MOBS BACK">up to {secs(campBack(z))}</Row>
        <Row k="CRATE">{z.key && `${z.key} × ${z.cr.length}`}</Row>
        <Row k="ZONE ITEM">{z.item}</Row>
        <Row k="ARMOUR SET">{z.set}</Row>
        <Row k="RARE DROPS">{z.sp}</Row>
      </dl>
    </>
  );
}

function MarkPanel({ m, go }) {
  const z = m.zone;
  const near = m.t === 'way' || m.t === 'npc';
  const area = <Row k={near ? 'NEAR' : 'AREA'}>{go(z.id, z.n)}</Row>;
  const at = <Row k="WHERE">{xyz(m)}</Row>;
  if (m.t === 'boss') {
    const bo = m.extra;
    return (
      <>
        <p class="dm-eyebrow">{bo.final ? 'FINAL BOSS' : 'MINI BOSS'}</p>
        <h2>{bo.n}</h2>
        <p><Chip d={z.d} /></p>
        <p>{bo.m}</p>
        <dl>
          {area}
          <Row k="CAMP">{bo.camp}</Row>
          {at}
          <Row k="HEALTH">{bo.hp} base · +50% per extra player, up to 5</Row>
          <Row k="BACK IN">up to {secs(bo.final ? RESPAWN.final + RESPAWN.finalJitter : RESPAWN.boss + RESPAWN.jitter)}</Row>
          <Row k="DROPS"><Lines items={[z.item, `${z.set} armour`, z.sp, 'Trophy head (3%)']} /></Row>
          <Row k="CONTRACT">{!bo.final && <><code>/dungeon contract</code> summons a private fight</>}</Row>
        </dl>
      </>
    );
  }
  const head = { camp: 'CAMP', crate: 'CRATE', way: 'WAYPOINT', npc: 'NPC', guard: 'PATH GUARD' }[m.t];
  return (
    <>
      <p class="dm-eyebrow">{head}</p>
      <h2>{m.n}</h2>
      {m.t === 'crate' && <p>Opens with the {m.n.replace(/ (Crate|Cache)$/, '')} Key. Mobs here drop it, and so does {bossOfKey(m.n)}.</p>}
      {m.t === 'way' && <p>Warp here from the <code>/dungeon</code> menu. Die in any {DIFF[m.extra][0].toLowerCase()} area and you respawn here.</p>}
      {m.t === 'guard' && <p>A guard pack holds this crossing. Clear it to pass.</p>}
      <dl>
        {m.t === 'camp' && <Row k="MOBS BACK">up to {secs(campBack(z))}</Row>}
        {m.t === 'way' && <><Row k="WARP COST">{DIFF[m.extra][3]}</Row><Row k="ARMOUR">{DIFF[m.extra][2]}</Row></>}
        {m.t === 'npc' && <Row k="OPENS"><code>{m.extra}</code></Row>}
        {area}
        {at}
      </dl>
    </>
  );
}

/** The coordinate readout: its own state, so a mouse move re-renders one line, not the page. */
function Readout({ set }) {
  const [text, setText] = useState(POINT);
  set.current = setText;
  return <div class="dm-ctl dm-read">{text}</div>;
}

const LAYERS = [['zone', 'AREAS'], ['boss', 'BOSSES'], ['camp', 'CAMPS'], ['crate', 'CRATES'], ['way', 'WAYPOINTS'], ['guard', 'PATH GUARDS'], ['npc', 'NPCS']];

export function DungeonPage() {
  const [mode, setMode] = useState('cut');
  const [cut, setCut] = useState(OPEN_Y);
  // the grid's height until the blocks arrive, then the lowest and highest block
  const [range, setRange] = useState([origin[1], origin[1] + size[1] - 1]);
  const [gl, setGl] = useState('wait');
  const [sel, setSel] = useState(null);
  const [query, setQuery] = useState('');
  const [off, setOff] = useState([]);
  const [tint, setTint] = useState('zone');
  const [wide, setWide] = useState(true);
  const box = useRef(null);
  const map = useRef(null);
  const readout = useRef(null);
  const live = useRef(null);

  const cutOn = mode === 'cut' && gl !== 'off';
  const markHidden = (m) => cutOn && !(m.y <= cut && m.y > cut - 24);
  // in the cutaway, show what sits in the 24 blocks under the cut; anything above it is cut away with the blocks
  const zoneShown = (z) => !cutOn || (z.y[0] <= cut && z.y[1] >= cut - 12);
  const zoneAt = (mx, my) => AREAS.findLast((z) => zoneShown(z) && inPoly(z.pp, mx, my));

  const select = (o) => {
    setSel(o);
    // move the cut to just above the pick if the current one hides it
    if (o && cutOn && (o.z ? !zoneShown(o.z) : markHidden(o.m))) setCut(Math.min(range[1], Math.floor(o.z ? o.z.fy : o.m.y) + 3));
    const h = o ? (o.z ?? o.m).id : '';
    if (location.hash.slice(1) !== h) history.replaceState(null, '', h ? `#${h}` : location.pathname + location.search);
  };
  // after the card renders: the view leaves out the card or sheet the pick opens
  const later = (f) => requestAnimationFrame(() => map.current && f(map.current));
  const goTo = (id) => {
    if (!Object.hasOwn(byId, id)) return;
    const o = byId[id];
    select(o);
    later((v) => v.fly(o.z ? o.z.bb : [o.m.mx - 22, o.m.mx + 22, o.m.my - 22, o.m.my + 22], o.z ? 6 : undefined));
  };
  // a pick on the map itself keeps the zoom and only pans if the card would cover it
  const show = (o) => {
    select(o);
    if (o) later((v) => (o.z ? v.show((o.z.bb[0] + o.z.bb[1]) / 2, (o.z.bb[2] + o.z.bb[3]) / 2) : v.show(o.m.mx, o.m.my)));
  };
  const go = (id, text) => <button type="button" class="dm-go" onClick={() => goTo(id)}>{text}</button>;
  // the view to fit: the outlines shown at this cut (every outline in ALL BLOCKS), at their floors, plus a margin
  const frame = () => {
    const zs = AREAS.filter(zoneShown);
    const bbs = (zs.length ? zs : AREAS).map((z) => z.bb);
    return [Math.min(...bbs.map((v) => v[0])) - 4, Math.max(...bbs.map((v) => v[1])) + 4, Math.min(...bbs.map((v) => v[2])) - 4, Math.max(...bbs.map((v) => v[3])) + 4];
  };
  live.current = { zoneAt, show, goTo, frame, sel, engineCut: mode === 'cut' ? cut : null };

  useEffect(() => {
    setWide(!matchMedia('(max-width: 900px)').matches);
    let handle = null, dead = false;
    import('../lib/dungeonMap/index.js').then(({ mount }) => {
      if (dead) return;
      handle = map.current = mount(box.current, {
        meta: META,
        frame: () => live.current.frame(),
        onGl: (state, yr) => {
          setGl(state);
          if (yr) setRange(yr);
        },
        onTap: (mx, my) => {
          const z = live.current.zoneAt(mx, my);
          live.current.show(z ? { z } : null);
        },
        onHover: (mx, my) => {
          const z = mx == null ? null : live.current.zoneAt(mx, my);
          const w = z && unproject(META, mx, my, z.fy);
          readout.current?.(z ? `X ${Math.floor(w[0])}  Z ${Math.floor(w[1])}  ·  ${z.n}` : POINT);
        },
      });
      handle.cut(live.current.engineCut);
      live.current.goTo(location.hash.slice(1));
    });
    const onHash = () => live.current.goTo(location.hash.slice(1));
    addEventListener('hashchange', onHash);
    return () => {
      dead = true;
      removeEventListener('hashchange', onHash);
      handle?.destroy();
      map.current = null;
    };
  }, []);
  useEffect(() => map.current?.cut(mode === 'cut' ? cut : null), [mode, cut]);
  // a new view mode frames its own outlines, unless something is picked
  useEffect(() => void (live.current.sel || map.current?.fly()), [mode]);

  const q = query.trim().toLowerCase();
  const hits = q ? INDEX.filter((i) => i.n.toLowerCase().includes(q)).slice(0, 8) : [];
  const pick = (id) => (goTo(id), setQuery(''));
  const colour = (z) => (tint === 'diff' ? DIFF[z.d][1] : z.c || '#8A90A0');
  const selId = sel && (sel.z ?? sel.m).id;
  const at = (x, y) => ({ '--mx': String(x), '--my': String(y) });

  return (
    <MotionRoot>
      <NavBar current="smp" />
      <main class="dm">
        <header>
          <p class="section-eyebrow dm-kicker">SEASON 4 DUNGEON</p>
          <h1 class="dm-h1">HEARTWOOD MAP</h1>
        </header>

        <div class="dm-app">
          <div ref={box} data-map-box class={`dm-map ${off.map((t) => `no-${t}`).join(' ')}`}>
            <canvas aria-hidden="true" />
            <img data-map-preview src="/dungeon/preview.jpg" width="1200" height="1164" alt="The Heartwood island seen from above at an angle, every block drawn"
              loading="lazy" decoding="async" hidden={gl === 'on'} style={{ '--px': String(preview.x), '--py': String(preview.y), '--pw': String(preview.w), '--ph': String(preview.h) }} />
            <svg aria-hidden="true">
              <g class="dm-world">
                {AREAS.map((z) => (
                  <polygon key={z.id} class={`dm-zone${z.o ? ' out' : ''}${selId === z.id ? ' sel' : ''}`} points={z.pp.map((p) => p.join(',')).join(' ')}
                    fill={colour(z)} stroke={colour(z)} style={{ display: zoneShown(z) ? null : 'none' }} />
                ))}
              </g>
            </svg>
            <div class="dm-ov">
              {AREAS.map((z) => (
                <div key={z.id} class={`dm-zl${z.o ? ' out' : ''}`} hidden={!zoneShown(z)} style={{ ...at(...z.lp), '--c': colour(z) }}>
                  {z.n}{!z.o && <small>{DIFF[z.d][0]}</small>}
                </div>
              ))}
              {MARKS.map((m) => (
                <button key={m.id} type="button" data-marker-id={m.id} class={`dm-mk ${m.t}${m.extra?.final ? ' final' : ''}${selId === m.id ? ' sel' : ''}`}
                  hidden={markHidden(m)} aria-label={m.n} style={{ ...at(m.mx, m.my), '--c': m.zone.c || 'var(--accent)' }} onClick={() => show({ m })}>
                  <i /><span class="dm-lb">{m.n}</span>
                </button>
              ))}
            </div>

            {/* the overlays: a grid over the map; only its .dm-ctl children take pointer and wheel events */}
            <div class="dm-hud">
              <div class="dm-ctl dm-search">
                <input data-map-search type="search" placeholder="FIND AN AREA, BOSS OR CAMP" autocomplete="off" aria-label="Find an area, boss or camp"
                  value={query} onInput={(e) => setQuery(e.currentTarget.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && hits[0]) pick(hits[0].id);
                    if (e.key === 'Escape') setQuery('');
                  }} />
                {q && (
                  <ul class="dm-results">
                    {hits.length ? hits.map((h) => (
                      <li key={h.id}><button type="button" data-map-result onClick={() => pick(h.id)}><span>{h.n}</span><small>{h.sub}</small></button></li>
                    )) : <li><button type="button" disabled>Nothing by that name</button></li>}
                  </ul>
                )}
              </div>
              <details class="dm-ctl dm-layers">
                <summary>LAYERS</summary>
                {LAYERS.map(([t, label]) => (
                  <label key={t}>
                    <input type="checkbox" checked={!off.includes(t)} onChange={(e) => setOff((o) => (e.currentTarget.checked ? o.filter((x) => x !== t) : [...o, t]))} />
                    {t !== 'zone' && <span class={`dm-g ${t}`}><i /></span>} {label}
                  </label>
                ))}
                <p>COLOUR BY</p>
                <div class="dm-seg" role="radiogroup" aria-label="Colour areas by">
                  {[['zone', 'AREA'], ['diff', 'DIFFICULTY']].map(([v, t]) => (
                    <label key={v}><input type="radio" name="dm-tint" value={v} checked={tint === v} onChange={() => setTint(v)} /><span>{t}</span></label>
                  ))}
                </div>
              </details>
              <aside class="dm-ctl dm-panel" data-map-panel aria-live="polite">
                {sel && <button type="button" class="dm-x" data-map-close aria-label="Close" onClick={() => (select(null), requestAnimationFrame(() => box.current?.querySelector('[data-map-legend] summary')?.focus()))}>×</button>}
                {sel ? sel.z ? <AreaPanel z={sel.z} go={go} /> : <MarkPanel m={sel.m} go={go} /> : <Legend go={go} open={wide} />}
              </aside>
              <div class="dm-ctl dm-zoom">
                <button type="button" data-zoom-by="1.5" aria-label="Zoom in">+</button>
                <button type="button" data-zoom-by="0.6667" aria-label="Zoom out">−</button>
                <button type="button" aria-label="Show the whole dungeon" title="Show the whole dungeon" onClick={() => (select(null), later((v) => v.fly()))}>□</button>
              </div>
              <div class="dm-ctl dm-bar" hidden={gl === 'off'}>
                <div class="dm-seg" role="radiogroup" aria-label="View" data-map-mode hidden={gl === 'off'}>
                  {[['cut', 'CUTAWAY'], ['all', 'ALL BLOCKS']].map(([v, t]) => (
                    <label key={v}><input type="radio" name="dm-mode" value={v} checked={mode === v} onChange={() => setMode(v)} /><span>{t}</span></label>
                  ))}
                </div>
                <label class="dm-slice" hidden={!cutOn}>
                  <span>CUT AT Y {cut}</span>
                  <input data-map-slider type="range" min={range[0]} max={range[1]} step="1" value={cut} aria-label="Height the island is cut at"
                    onInput={(e) => setCut(Number(e.currentTarget.value))} />
                </label>
              </div>
              <div class="dm-ctl dm-north">N ↗</div>
              <Readout set={readout} />
            </div>
          </div>
        </div>
      </main>
      <Footer />
    </MotionRoot>
  );
}
