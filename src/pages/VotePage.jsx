import { Footer } from '../components/Footer';
import { NavBar } from '../components/NavBar';
import { MotionRoot } from '../lib/motion';

// Same list as the SMP's /vote: mc-server plugins/VotingPlugin/VoteSites.yml (enabled sites).
const SITES = [
  ['MinecraftServers.org', 'https://minecraftservers.org/vote/689442'],
  ['Minecraft.Buzz', 'https://minecraft.buzz/vote/21980'],
  ['TopMinecraftServers', 'https://topminecraftservers.org/server/43855'],
  ['MC-Servers.com', 'https://mc-servers.com/vote/6589'],
  ['TopG.org', 'https://topg.org/minecraft-servers/server-683638'],
];

export function VotePage() {
  return (
    <MotionRoot>
      <NavBar />
      <main>
        <section class="page-hero container" aria-label="Vote for Chromabit">
          <a href="/" class="logo-link" aria-label="Back to Chromabit home">
            <img class="logo-sm" src="/server-icon-old-2.png" alt="Chromabit" width="96" height="96" />
          </a>

          <p class="section-eyebrow">ECONOMY SMP</p>
          <h1 class="hero-title hero-title--inline">
            VOTE FOR <span class="accent">CHROMABIT</span>
          </h1>
          <p class="hero-sub">Vote on every site. Rewards arrive on the SMP.</p>

          <div class="rule" />

          <div class="cta-group" style="flex-direction:column;max-width:420px;margin:0 auto 4rem">
            {SITES.map(([name, url]) => (
              <a class="btn btn-primary" href={url} target="_blank" rel="noopener">{name}</a>
            ))}
          </div>
        </section>
      </main>
      <Footer />
    </MotionRoot>
  );
}
