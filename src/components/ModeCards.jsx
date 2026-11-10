import { useEffect, useState } from 'preact/hooks';
import { boardRows, fetchBoards, tierColour, tierLabel } from '../lib/pvp';
import { fetchTicker, percent } from '../lib/market';
import { ArcadeButton } from './ArcadeButton';
import { CopyIpButton } from './CopyIpButton';
import { ServerCarousel } from './ServerCarousel';

/** Resolve `load()` once on mount; null until then, and null for good on any failure. */
function useOnce(load) {
  const [data, setData] = useState(null);
  useEffect(() => {
    let live = true;
    load().then((d) => live && setData(d), () => {});
    return () => { live = false; };
  }, []);
  return data;
}

/**
 * The PVP card's live block: the top three of the overall board. The feed is
 * newer than this page, so until it answers with rows the block stays an empty
 * container, the way MarketTicker removes itself rather than show a broken tape.
 */
const TIER_NAMES = ['tin', 'bronze', 'silver', 'gold', 'emerald', 'mithril', 'chroma'];

/**
 * What the slot shows while the ladder has no rows (and in the prerendered
 * page): the seven tiers, from the ladder config, so the card keeps its shape
 * and nothing jumps when the feed answers. Hidden as soon as there are rows.
 */
function LadderIdle({ hidden }) {
  return (
    <div class="mode-live mode-live--idle" data-ladder-idle hidden={hidden}>
      <p class="mode-live-head">SEVEN TIERS</p>
      <ul class="tier-chips">
        {TIER_NAMES.map((t) => (
          <li key={t} class="tier-chip" style={{ color: `var(--tier-${t})` }}>{t.toUpperCase()}</li>
        ))}
      </ul>
    </div>
  );
}

function LadderTop() {
  const doc = useOnce(fetchBoards);
  const rows = boardRows(doc, 'overall').slice(0, 3);
  return (
    <>
      <LadderIdle hidden={rows.length > 0} />
      <div class="mode-live" data-live="ladder" hidden={rows.length === 0}>
        {rows.length > 0 && (
          <>
            <h4 class="mode-live-head">TOP OF THE LADDER</h4>
            <ol class="mode-live-rows">
              {rows.map((row) => (
                <li key={row.uuid ?? row.name} class="mode-live-row">
                  <span class="mode-live-name"><span class="mode-live-rank">#{row.rank}</span> {row.name}</span>
                  <span class="mode-live-tier" style={{ color: tierColour(row.tier, doc) ?? undefined }}>{tierLabel(row)}</span>
                </li>
              ))}
            </ol>
          </>
        )}
      </div>
    </>
  );
}

/** The SMP card's live block: today's two biggest gainers and biggest loser. */
function TopMovers() {
  const data = useOnce(fetchTicker);
  const rows = [
    ...(data?.gainers ?? []).slice(0, 2).map((e) => ({ ...e, up: true })),
    ...(data?.losers ?? []).slice(0, 1).map((e) => ({ ...e, up: false })),
  ];
  return (
    <div class="mode-live" data-live="movers" hidden={rows.length === 0}>
      {rows.length > 0 && (
        <>
          <h4 class="mode-live-head">TODAY’S TOP MOVERS</h4>
          <ul class="mode-live-rows">
            {rows.map((e) => (
              <li key={`${e.kind}:${e.key}`} class="mode-live-row">
                <span class="mode-live-name">{e.label}</span>
                {/* Signed, so the direction never rests on the colour alone. */}
                <span class={`mode-live-change mode-live-change--${e.up ? 'up' : 'down'}`}>{percent(e.change)}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

/**
 * Stand-in art for the PVP banner until a real screenshot exists: crossed
 * swords over the seven tier colours, on the site's dither. To swap in a
 * picture, replace this component's markup with
 * <img src={pvpShot} alt="..." /> (the .mode-banner img rule covers it).
 */
function PvpArt() {
  return (
    <div class="pvp-art" aria-hidden="true">
      <span class="pvp-art-sword pvp-art-sword--a" />
      <span class="pvp-art-sword pvp-art-sword--b" />
      <span class="pvp-art-tiers">
        {TIER_NAMES.map((t) => (
          <i key={t} style={{ background: `var(--tier-${t})` }} />
        ))}
      </span>
    </div>
  );
}

/** The landing page's two modes, PVP first. */
export function ModeCards() {
  return (
    <div class="mode-grid">
      <article class="card mode-card mode-card--pvp reveal" data-mode-card="pvp">
        <div class="mode-banner mode-banner--pvp" data-banner="pvp">
          <PvpArt />
        </div>
        <div class="mode-body">
          <span class="mode-badge">COMPETITIVE · JAVA + BEDROCK</span>
          <h3 class="mode-title">CHROMAPVP <span class="beta-tag">BETA</span></h3>
          <p class="mode-desc">Ranked kit PVP. Duels, the FFA pit, the Prismatic Arena and tournaments.</p>
          <LadderTop />
          <div class="mode-actions">
            <ArcadeButton href="/pvp/" variant="primary" size="sm">ENTER PVP</ArcadeButton>
            <CopyIpButton variant="secondary" />
          </div>
        </div>
      </article>

      <article class="card mode-card reveal" data-mode-card="smp" style={{ '--reveal-delay': '0.1s' }}>
        <div class="mode-banner" data-banner="smp">
          <ServerCarousel />
        </div>
        <div class="mode-body">
          <span class="mode-badge">SURVIVAL · JAVA + BEDROCK</span>
          <h3 class="mode-title">ECONOMY SMP</h3>
          <p class="mode-desc">Survival with a player-run market. Claims, custom spawners, King of the Hill.</p>
          <TopMovers />
          <div class="mode-actions">
            <ArcadeButton href="/smp/" variant="primary" size="sm">EXPLORE THE SMP</ArcadeButton>
            <CopyIpButton variant="secondary" />
          </div>
        </div>
      </article>
    </div>
  );
}
