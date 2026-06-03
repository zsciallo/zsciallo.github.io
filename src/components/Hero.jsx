import { StatusBadge } from './StatusBadge';
import { ServerStatusSection } from './ServerStatusSection';
import { JoinCTA } from './JoinCTA';
import { PrizeInfoCard } from './PrizeInfoCard';
import { Logo } from './logo';

export function Hero({ config, status }) {
  return (
    <section class="hero container" aria-label="ChromaBit Minecraft Server">
      <Logo />

      <h1 class="hero-title">
        CHROMA<span class="accent">BIT</span>
      </h1>
      <p class="hero-sub">A Minecraft server where your grind pays off, literally.</p>

      <StatusBadge status={status} />

      <div class="rule" />

      <ServerStatusSection config={config} status={status} />

      <PrizeInfoCard prize={config.prize} />

      <JoinCTA config={config} status={status} />

      <div class="rule" />
    </section>
  );
}
