import { useScrollReveal } from '../hooks/useScrollReveal';
import { ArcadeButton } from '../components/ArcadeButton';
import { CopyIpButton } from '../components/CopyIpButton';
import { MarketTicker } from '../components/MarketTicker';
import { Footer } from '../components/Footer';
import { NavBar } from '../components/NavBar';
import { MotionRoot } from '../lib/motion';

export function SmpPage() {
  useScrollReveal();

  return (
    <MotionRoot>
      <NavBar current="smp" />
      <main>
        <section class="page-hero container smp-hero" aria-label="Chromabit SMP">
          <p class="section-eyebrow">CHROMABIT SMP · SURVIVAL ECONOMY</p>
          <h1 class="hero-title hero-title--inline">
            {/* No-break spaces keep each sentence whole when the line wraps. */}
            MINE&nbsp;IT. PRICE&nbsp;IT. <span class="accent">TRADE&nbsp;IT.</span>
          </h1>
          <div class="smp-actions">
            <CopyIpButton variant="primary" size="md" />
          </div>
        </section>

        <section class="smp-body container" aria-label="Economy SMP">
          <div class="smp-market">
            <MarketTicker />
            <div class="smp-actions">
              <ArcadeButton href="/auctions/" variant="primary">OPEN THE AUCTION HOUSE</ArcadeButton>
            </div>
          </div>

          <div class="card dungeon reveal" data-section="dungeon">
            <a class="dungeon-preview" href="/dungeon/">
              <img src="/dungeon/preview.webp" alt="The Heartwood dungeon island, drawn block by block"
                width="800" height="614" loading="lazy" decoding="async" />
            </a>
            <div class="dungeon-text">
              <p class="section-eyebrow">SEASON 4 DUNGEON</p>
              <h2 class="section-title dungeon-title">HEARTWOOD</h2>
              <p class="dungeon-line">Nine zones under a giant tree. Plan your route before you drop&nbsp;in.</p>
              <div class="smp-actions">
                <ArcadeButton href="/dungeon/" variant="primary">EXPLORE THE MAP</ArcadeButton>
                <a class="dungeon-wiki" href="/wiki/smp/dungeons/">Heartwood wiki</a>
              </div>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </MotionRoot>
  );
}
