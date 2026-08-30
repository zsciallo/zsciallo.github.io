import { EventCard, RewardRow } from './EventCard';
import { SectionHeader } from './SectionHeader';

export function Events({ prize, discord }) {
  return (
    <section class="events-section" aria-label="Chromabit SMP Events and Prizes">
      <div class="container">
        <SectionHeader eyebrow="COMPETE &amp; WIN" title={<>REAL PRIZES.<br />EVERY EVENT.</>} />

        <div class="events-grid">
          <EventCard
            badge="EVENTS"
            badgeClass="badge-weekly"
            isPink
            title="Server Events"
            prize={prize.toUpperCase()}
            prizeClass="prize-pink"
            ariaLabel="Server events and store credit prizes"
            description={<>Compete in server events and take the top spot to walk away with <strong>{prize}</strong>. Spend it on ranks, crate keys, and anything else in the store.</>}
          >
            <li>Events are announced in our Discord</li>
            <li>Credit is applied to your account in the store</li>
            <li>
              <div>
                Top 5 players all earn rewards
                <ul class="reward-list">
                  <RewardRow icon="🥇" label="1st: 100 store credit" />
                  <RewardRow icon="🥈" label="2nd: 50 store credit" />
                  <RewardRow icon="🥉" label="3rd: 25 store credit" />
                  <RewardRow icon="🏅" label="4th: 10 store credit" />
                  <RewardRow icon="⭐" label="5th: 5 store credit" />
                </ul>
              </div>
            </li>
            <li><span>For full details, join our <a href={discord} target="_blank" rel="noopener">Discord</a>!</span></li>
          </EventCard>
        </div>
      </div>
    </section>
  );
}
