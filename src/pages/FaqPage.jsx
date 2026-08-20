import config from '../config.json';
import { useServerStatus } from '../hooks/useServerStatus';
import { useScrollReveal } from '../hooks/useScrollReveal';
import { StatusBadge } from '../components/StatusBadge';
import { ServerStatusSection } from '../components/ServerStatusSection';
import { JoinCTA } from '../components/JoinCTA';
import { SectionHeader } from '../components/SectionHeader';
import { FaqItem } from '../components/FaqItem';
import { Footer } from '../components/Footer';

function formatDate(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

export function FaqPage() {
  const status = useServerStatus(config.serverIP, config.underConstruction);
  const launchDate = formatDate(config.launchDate);
  useScrollReveal();

  return (
    <>
      <main>
        <section class="page-hero container" aria-label="Chromabit FAQ">
          <p class="section-eyebrow">HELP CENTER</p>
          <h1 class="hero-title">
            HAVE<span class="accent">QUESTIONS?</span>
          </h1>
          <p class="hero-sub">Everything you need to know about Chromabit Economy SMP.</p>

          <StatusBadge status={status} />

          <div class="rule" />

          <ServerStatusSection config={config} status={status} />
          <JoinCTA config={config} />

          <div class="rule" />
        </section>

        <section class="faq-section" aria-label="Frequently asked questions">
          <div class="container">
            <SectionHeader eyebrow="QUESTIONS" title="FAQ" />
            <div class="faq-list">
            <p class="faq-section-label">GAMEPLAY</p>

              <FaqItem question="What type of server is Chromabit?">
                Chromabit is a spawner-based Economy SMP. Mob spawners are a core part of the economy they generate sellable drops that you use to build wealth, run shops, and climb the balance leaderboard.
              </FaqItem>

              <FaqItem question="How does the rank system work?">
                Progress through ranks as you play using <strong>/rankup</strong>
                <br />
                Each rank unlocks new perks. Acheieving the highest rank grants exclusive items such as Sell Chests.
              </FaqItem>

              <FaqItem question="How do spawners work?">
                Spawners store mob drops directly inside them right-click a spawner to open its storage and collect your loot. Place a hopper underneath to automate collection. Spawners can be picked up from the world, purchased via <strong>/shop</strong>, or won from the Spawner Crate at spawn (keys available through ranking up, voting, or the store).
              </FaqItem>

              <p class="faq-section-label">PRIZES</p>

              <FaqItem question="How do server events work?">
                Events are announced in our <a href={config.discord} target="_blank" rel="noopener">Discord</a> along with the rules and the closing date. The winner takes home <strong>{config.prize}</strong>, and the top 5 all earn credit: 100, 50, 25, 10, and 5. No entry fee required, just play.
              </FaqItem>

              <FaqItem question="How do I receive my prize?">
                Prizes are paid out as store credit. Winners will need to submit a ticket in the #prize-claims channel, and the credit is applied to your account so you can spend it on ranks, crate keys, or anything else in the <a href="/store/">store</a>.
              </FaqItem>

              <p class="faq-section-label">GENERAL</p>

              <FaqItem question="What is Chromabit?">
                Chromabit is a competitive Economy SMP Minecraft server. Players build wealth through a player-driven economy, compete on the balance leaderboard, and win store credit in server events.
              </FaqItem>

              <FaqItem question="What is an Economy SMP Minecraft server?">
                An Economy SMP is a Survival Multiplayer server built around a player-driven economic system. Players earn in-game currency by farming, trading, and running shops, then compete for top spots on leaderboards. On Chromabit, server events pay out store credit to the top finishers.
              </FaqItem>

              <FaqItem question="What is the server IP address?">
                The server IP is <strong>play.chromabit.us</strong>.
              </FaqItem>

              <FaqItem question="Is Chromabit Java or Bedrock Edition?">
                Chromabit runs on Java Edition. Join our <a href={config.discord} target="_blank" rel="noopener">Discord</a> for the latest info on supported versions and any cross-play options.
              </FaqItem>

              <FaqItem question="Does Chromabit have grief protection?">
                Yes. Your builds, land, and storage are fully protected by grief prevention. You can focus on competing in the economy without worrying about other players destroying your work.
              </FaqItem>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
