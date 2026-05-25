import { EventCard, RewardRow } from './EventCard';

export function Events({ prize, discord }) {
  return (
    <section class="events-section" aria-label="ChromaBit Events and Prizes">
      <div class="container">
        <p class="section-eyebrow">COMPETE &amp; WIN</p>
        <h2 class="section-title">REAL PRIZES.<br />EVERY WEEK.</h2>

        <div class="events-grid">
          <EventCard
            badge="WEEKLY"
            badgeClass="badge-weekly"
            isPink
            title="Bal Top"
            prize={`${prize} USD`}
            prizeClass="prize-pink"
            ariaLabel="Weekly Balance Top event"
            description={<>The richest player on the server at the end of each week walks away with a real <strong>{prize} USD payout</strong>. Grind the economy, dominate the market, and claim your spot at the top.</>}
          >
            <li>Leaderboard resets every Sunday at midnight</li>
            <li>Paid out via PayPal</li>
            <li>
              <div>
                Top 5 players all earn rewards
                <ul class="reward-list">
                  <RewardRow icon="🥈" label="2nd: $50 store credit" />
                  <RewardRow icon="🥉" label="3rd: $25 store credit" />
                  <RewardRow icon="🏅" label="4th: $10 store credit" />
                  <RewardRow icon="⭐" label="5th: $5 store credit" />
                </ul>
              </div>
            </li>
            <li><span>For full details, join our <a href={discord} target="_blank" rel="noopener">Discord</a>!</span></li>
          </EventCard>

          <EventCard
            badge="MONTHLY"
            badgeClass="badge-monthly"
            title="Event Contests"
            prize="CASH PRIZE"
            prizeClass="prize-lilac"
            ariaLabel="Monthly Cash Prize Build Contest"
            description={<>Every month a theme is announced. Community votes on the winner. The best creation takes home <strong>real cash</strong> and permanent recognition on the server.</>}
          >
            <li>New theme announced on the 1st of each month</li>
            <li>You have the full month to build and submit</li>
            <li>Wide variety of themes, from redstone contraptions to fantasy castles</li>
            <li>
              <div>
                Community voting determines the winner
                <ul class="reward-list">
                  <RewardRow icon="🗳️" label="Open vote in Discord at month end" />
                  <RewardRow icon="👑" label="Most votes wins the prize" />
                </ul>
              </div>
            </li>
            <li>Winning build showcased on the server permanently</li>
            <li><span>For full details, join our <a href={discord} target="_blank" rel="noopener">Discord</a>!</span></li>
          </EventCard>
        </div>
      </div>
    </section>
  );
}
