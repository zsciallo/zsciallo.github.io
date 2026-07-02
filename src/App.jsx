import config from './config.json';
import { useServerStatus } from './hooks/useServerStatus';
import { StatusBadge } from './components/StatusBadge';
import { ServerStatusSection } from './components/ServerStatusSection';
import { JoinCTA } from './components/JoinCTA';
import { SectionHeader } from './components/SectionHeader';
import { FeatureCard } from './components/FeatureCard';
import { Events } from './components/Events';
import { Footer } from './components/Footer';
import { Logo } from './components/Logo';
import emeraldIcon from './assets/emerald_icon.webp';
import diamondIcon from './assets/diamond_icon.webp';
import shieldIcon from './assets/shield_icon.webp';
import paperIcon from './assets/paper_icon.webp';

export default function App() {
  const status = useServerStatus(config.serverIP, config.underConstruction);

  return (
    <>
      <main>
        <section class="page-hero container" aria-label="ChromaBit Minecraft Server">

          <Logo />

          <p class="section-eyebrow">CHROMABIT MINECRAFT SERVER</p>
          <h1 class="hero-title">
            CHROMA<span class="accent">BIT</span>
          </h1>
          <p class="hero-sub">A Minecraft server where your grind pays off, literally.</p>

          <StatusBadge status={status} />

          <div class="rule" />

          <ServerStatusSection config={config} status={status} />
          <JoinCTA config={config} status={status} />

          <div class="rule" />
        </section>

        <section class="features-section" aria-label="ChromaBit features">
          <div class="container">
            <SectionHeader
              eyebrow="HOW IT WORKS"
              title={<>PLAYER-DRIVEN.<br />PRIZE-BACKED.</>}
              sub="ChromaBit is an Economy SMP built around competitive, player-driven gameplay. Grind the markets, build your wealth, and compete for real payouts."
            />
            <div class="features-grid">
              <FeatureCard
                icon={<img class="feature-icon-img" src={emeraldIcon} alt="" />}
                title="Player Economy"
                desc="Buy, sell, and trade in a fully player-driven market. Build shops, corner commodities, and dominate the leaderboard through smart play."
              />
              <FeatureCard
                icon={<img class="feature-icon-img" src={diamondIcon} alt="" />}
                title="Real Cash Prizes"
                desc={`The #1 spot on the balance leaderboard pays out $${config.prize.replace('$', '')} real USD every week via PayPal. No entry fee. No catch.`}
              />
              <FeatureCard
                icon={<img class="feature-icon-img" src={shieldIcon} alt="" />}
                title="Grief Prevention"
                desc="Your builds, chests, and land are fully protected. Focus on the economy your hard work is always safe."
              />
              <FeatureCard
                icon={<img class="feature-icon-img" src={paperIcon} alt="" />}
                title="Community Events"
                desc="Monthly themed build contests with community voting. Real cash prizes for winners, permanent recognition on the server."
              />
            </div>
          </div>
        </section>

        <Events prize={config.prize} discord={config.discord} />
      </main>
      <Footer />
    </>
  );
}
