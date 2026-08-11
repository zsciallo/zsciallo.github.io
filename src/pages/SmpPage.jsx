import config from '../config.json';

const logoSrc = '/server-icon-old-2.png';
import { useServerStatus } from '../hooks/useServerStatus';
import { useScrollReveal } from '../hooks/useScrollReveal';
import { StatusBadge } from '../components/StatusBadge';
import { ServerStatusSection } from '../components/ServerStatusSection';
import { JoinCTA } from '../components/JoinCTA';
import { SectionHeader } from '../components/SectionHeader';
import { FeatureCard } from '../components/FeatureCard';
import { Events } from '../components/Events';
import { Footer } from '../components/Footer';
import { Logo } from '../components/Logo';

export function SmpPage() {
  const status = useServerStatus(config.serverIP, config.underConstruction);
  useScrollReveal();

  return (
    <>
      <main>
        <section class="page-hero container" aria-label="ChromaBit Economy SMP Minecraft Server">

          <Logo />

          <p class="section-eyebrow">CHROMABIT MINECRAFT SERVER</p>
          <h1 class="hero-title">
            ECONOMY<span class="accent">SMP</span>
          </h1>
          <p class="hero-sub">
            ChromaBit is a competitive Economy SMP Minecraft server where server events pay out store credit to the players who come out on top.
          </p>

          <StatusBadge status={status} />

          <div class="rule" />

          <ServerStatusSection config={config} status={status} />
          <JoinCTA config={config} />

          <div class="rule" />
        </section>

        <section class="features-section" aria-label="Economy SMP features">
          <div class="container">
            <SectionHeader
              eyebrow="HOW IT WORKS"
              title={<>PLAYER-DRIVEN.<br />EVENT-BACKED.</>}
              sub="ChromaBit is an Economy SMP built around competitive, player-driven gameplay. Grind the markets, build your wealth, and compete in events for store credit."
            />
            <div class="features-grid">
              <FeatureCard
                delay={0}
                icon="💰"
                title="Player Economy"
                desc="Buy, sell, and trade in a fully player-driven market. Build shops, corner commodities, and dominate the leaderboard through smart play."
              />
              <FeatureCard
                delay={0.1}
                icon="🏆"
                title="Store Credit Prizes"
                desc={`Win a server event and take home ${config.prize} to spend on ranks, keys, and more. The top 5 all earn credit. No entry fee. No catch.`}
              />
              <FeatureCard
                delay={0.2}
                icon="🛡️"
                title="Grief Prevention"
                desc="Your builds, chests, and land are fully protected. Focus on the economy your hard work is always safe."
              />
              <FeatureCard
                delay={0.3}
                icon="🗳️"
                title="Community Events"
                desc="Themed contests with community voting. Store credit for the top finishers, permanent recognition on the server."
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
