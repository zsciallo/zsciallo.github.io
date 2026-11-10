import { useScrollReveal } from '../hooks/useScrollReveal';
import { usePvpFeed } from '../hooks/usePvpFeed';
import { CopyIpButton } from '../components/CopyIpButton';
import { Footer } from '../components/Footer';
import { NavBar } from '../components/NavBar';
import { Leaderboard } from '../components/pvp/Leaderboard';
import { SeasonStrip } from '../components/pvp/SeasonStrip';
import { TierLadder } from '../components/pvp/TierLadder';
import { MotionRoot } from '../lib/motion';

// From the arena's own config (chromatic-arena: ranked placement, best of
// three, divisions, the level gate). Re-check them when ranked changes.
const FACTS = [
  ['10', 'placement matches before you get a rank'],
  ['BO3', 'every ranked duel is best of three'],
  ['III · II · I', 'three divisions in every tier below Chroma'],
  ['LVL 2', 'ranked opens at level 2'],
];

const MODES = [
  ['Duels', 'Ranked or unranked 1v1 on the Mythic and Magic arenas. Build your own kit layout.'],
  ['FFA Pit', 'Nine zones under the spawn. Your gear drops where you die. Stash it or extract with it.'],
  ['Prismatic Arena', 'A shrinking ring, a new augment each round, and a gold shop between fights. Last team standing wins.'],
  ['Tournaments', 'Double elimination. 1000, 500 and 250 Tokens for the top three, and the Champion title.'],
  ['Parties', 'Bring up to three friends. Queue Arena 2v2v2 as a pair.'],
  ['Cosmetics', 'Earn Tokens by playing and spend them on trails, hats and titles.'],
];

export function PvpPage() {
  const { boards, season, now } = usePvpFeed();
  useScrollReveal();

  return (
    <MotionRoot>
      <NavBar current="pvp" />
      <main>
        <section class="page-hero container pvp-hero" aria-label="ChromaPVP">
          <p class="section-eyebrow">
            CHROMAPVP · RANKED KIT PVP <span class="beta-tag">BETA</span>
          </p>
          <h1 class="hero-title hero-title--inline">
            {/* No-break spaces keep the second sentence whole when the line wraps. */}
            RANKED. <span class="accent">ON&nbsp;BOTH&nbsp;EDITIONS.</span>
          </h1>
          <p class="hero-sub pvp-sub">The only ranked competitive PVP for Java and Bedrock.</p>
          <SeasonStrip season={season} boards={boards} now={now} />
        </section>

        <div class="pvp-body container">
          <Leaderboard doc={boards} />

          <TierLadder doc={boards} />

          <section class="pvp-section reveal" aria-label="How ranked works">
            <div class="pvp-facts" data-facts>
              {FACTS.map(([figure, line]) => (
                <div key={line} class="card fact pvp-fact" data-fact>
                  <b class={`fact-figure${figure.length > 6 ? ' fact-figure--long' : ''}`}>{figure}</b>
                  <span class="fact-line">{line}</span>
                </div>
              ))}
            </div>
          </section>

          <section class="pvp-section reveal" data-modes aria-labelledby="pvp-modes-title">
            <p class="section-eyebrow">MORE THAN DUELS</p>
            <h2 class="section-title" id="pvp-modes-title">WHAT YOU CAN PLAY</h2>
            <div class="pvp-modes">
              {MODES.map(([title, desc]) => (
                <article key={title} class="card pvp-mode" data-mode>
                  <h3 class="pvp-mode-title">{title}</h3>
                  <p class="pvp-mode-desc">{desc}</p>
                </article>
              ))}
            </div>
          </section>

          <section class="claim-band pvp-join reveal" aria-labelledby="pvp-join-title">
            <h2 class="claim-title" id="pvp-join-title">JOIN AND <span class="accent">PLACE</span></h2>
            <p class="pvp-join-line">Connect to play.chromabit.us and pick Kit PVP in the hub.</p>
            <CopyIpButton variant="primary" size="md" />
          </section>
        </div>
      </main>
      <Footer />
    </MotionRoot>
  );
}
