import config from './config.json';
import { useServerStatus } from './hooks/useServerStatus';
import { useScrollReveal } from './hooks/useScrollReveal';
import { StatusBadge } from './components/StatusBadge';
import { ServerStatusSection } from './components/ServerStatusSection';
import { JoinCTA } from './components/JoinCTA';
import { PayoutLog } from './components/PayoutLog';
import { SectionHeader } from './components/SectionHeader';
import { FeatureCard } from './components/FeatureCard';
import { Events } from './components/Events';
import { Footer } from './components/Footer';
import { Logo } from './components/Logo';
import emeraldIcon from './assets/emerald_icon.webp';
import diamondIcon from './assets/diamond_icon.webp';
import shieldIcon from './assets/shield_icon.webp';
import spawnerIcon from './assets/spawner_icon.webp';

export default function App() {
  const status = useServerStatus(config.serverIP, config.underConstruction);
  useScrollReveal();

  return (
    <>
      <main>
        <section class="page-hero container" aria-label="ChromaBit Minecraft Server">

          <Logo />

          <p class="section-eyebrow">CHROMABIT MINECRAFT SERVER</p>
          <h1 class="hero-title hero-title--inline">
            ECONOMY <span class="accent">SMP</span>
          </h1>
          <p class="hero-sub">ChromaBit is a competitive Economy SMP Minecraft server where the richest player wins $100 cash every single week.</p>

          <StatusBadge status={status} />

          <div class="rule" />

          <div class="hero-connect">
            <ServerStatusSection config={config} status={status} />
            <JoinCTA config={config} status={status} />
          </div>

          <div class="rule" />
        </section>

        <PayoutLog prize={config.prize} />

        <section class="features-section" aria-label="ChromaBit features">
          <div class="container">
            <SectionHeader
              eyebrow="HOW IT WORKS"
              title={<>PLAYER-DRIVEN.<br />PRIZE-BACKED.</>}
              sub="A server built around competitive, player-driven gameplay. Grind the markets, build your wealth, and compete for real payouts."
            />
            <div class="features-grid">
              <FeatureCard
                delay={0}
                icon={<img class="feature-icon-img" src={emeraldIcon} alt="" />}
                title="Player Economy"
                desc="Buy, sell, and trade in a fully player-driven market. Build shops, corner commodities, and dominate the leaderboard through smart play."
              />
              <FeatureCard
                delay={0.1}
                icon={<img class="feature-icon-img" src={diamondIcon} alt="" />}
                title="Real Cash Prizes"
                desc={`The #1 spot on the balance leaderboard pays out $${config.prize.replace('$', '')} real USD every week via PayPal. No entry fee. No catch.`}
              />
              <FeatureCard
                delay={0.2}
                icon={<img class="feature-icon-img" src={shieldIcon} alt="" />}
                title="Grief Prevention"
                desc="Your builds, chests, and land are fully protected. Focus on the economy your hard work is always safe."
              />
              <FeatureCard
                delay={0.3}
                icon={<img class="feature-icon-img" src={spawnerIcon} alt="" />}
                title="Custom Spawners"
                desc="Zero lag custom spawners that generate loot and XP. Stack them up, pipe the drops straight into hoppers, and sell everything from a simple GUI."
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
