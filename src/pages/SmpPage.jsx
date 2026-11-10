import { useScrollReveal } from '../hooks/useScrollReveal';
import { ArcadeButton } from '../components/ArcadeButton';
import { CopyIpButton } from '../components/CopyIpButton';
import { MarketTicker } from '../components/MarketTicker';
import { Footer } from '../components/Footer';
import { NavBar } from '../components/NavBar';
import { MotionRoot } from '../lib/motion';

// Heartwood, from the dungeon's own config (mc-server plugins/ChromaticDungeons,
// MythicMobs pack Heartwood, AdvancedEnchantments armorSets). Re-check these
// against the config when the dungeon changes; the U3 report lists the sources.
const FACTS = [
  ['9', 'zones, each with its own boss'],
  ['4', 'difficulties, from Easy to Very Hard'],
  ['3', 'phases to the final boss, The Rotroot Heart'],
  ['9', 'armour sets, one from every zone'],
];

export function SmpPage() {
  useScrollReveal();

  return (
    <MotionRoot>
      <NavBar />
      <main>
        <section class="page-hero container smp-hero" aria-label="Chromabit SMP">
          <p class="section-eyebrow">CHROMABIT SMP · SURVIVAL ECONOMY</p>
          <h1 class="hero-title hero-title--inline">
            {/* No-break spaces keep each sentence whole when the line wraps. */}
            MINE&nbsp;IT. PRICE&nbsp;IT. <span class="accent">TRADE&nbsp;IT.</span>
          </h1>
        </section>

        <section class="smp-body container" aria-label="Economy SMP">
          <div class="dungeon reveal" data-section="dungeon">
            <p class="section-eyebrow">SEASON 4 DUNGEON</p>
            <h2 class="section-title dungeon-title">HEARTWOOD</h2>
            <div class="fact-grid">
              {FACTS.map(([figure, line]) => (
                <div key={line} class="card fact" data-fact>
                  <b class="fact-figure">{figure}</b>
                  <span class="fact-line">{line}</span>
                </div>
              ))}
            </div>
          </div>

          <MarketTicker />

          <div class="smp-actions">
            <ArcadeButton href="/auctions/" variant="primary">OPEN THE AUCTION HOUSE</ArcadeButton>
            <CopyIpButton variant="secondary" size="md" />
          </div>
        </section>
      </main>
      <Footer />
    </MotionRoot>
  );
}
