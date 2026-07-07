import winnerWeek1 from '../assets/winner_week1.png';

function ReceiptIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M4 2v20l2-1.5L8 22l2-1.5L12 22l2-1.5L16 22l2-1.5L20 22V2l-2 1.5L16 2l-2 1.5L12 2l-2 1.5L8 2 6 3.5 4 2z" />
      <path d="M8 7h8M8 11h8M8 15h5" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
      <path d="M20 6L9 17l-5-5" />
    </svg>
  );
}

function CrownIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M11.562 3.266a.5.5 0 0 1 .876 0L15.39 8.87a1 1 0 0 0 1.516.294L21.183 5.5a.5.5 0 0 1 .798.519l-2.834 10.246a1 1 0 0 1-.956.734H5.81a1 1 0 0 1-.957-.734L2.02 6.02a.5.5 0 0 1 .798-.519l4.276 3.664a1 1 0 0 0 1.516-.294z" />
      <path d="M5 21h14" />
    </svg>
  );
}

function FlameIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z" />
    </svg>
  );
}

export function PayoutLog({ prize }) {
  const amount = `${prize}.00`;

  return (
    <section class="payout-section" aria-label="ChromaBit weekly payout log">
      <div class="container">
        <div class="reveal">
          <span class="payout-badge">
            <ReceiptIcon /> PAYOUT LOG
          </span>
        </div>

        <div class="payout-list">
          {/* Paid week — real receipt */}
          <article class="payout-card reveal">
            <div class="payout-card-head">
              <span class="payout-week">WEEK OF JULY 5, 2026</span>
              <span class="payout-status paid"><CheckIcon /> PAID</span>
            </div>
            <div class="payout-row">
              <div class="payout-avatar"><CrownIcon /></div>
              <div class="payout-winner">
                <span class="payout-name">51037</span>
                <span class="payout-rank">#1 on /bal top</span>
              </div>
              <span class="payout-amount paid">{amount}</span>
            </div>
            <a
              class="payout-receipt"
              href={winnerWeek1}
              target="_blank"
              rel="noopener"
              aria-label="View the PayPal payout receipt for the week of July 5, 2026"
            >
              <img src={winnerWeek1} alt="PayPal receipt confirming the $100 payout to the week's winner" loading="lazy" />
            </a>
          </article>

          {/* Live week — up for grabs */}
          <article class="payout-card live reveal">
            <div class="payout-card-head">
              <span class="payout-week">WEEK OF JULY 12, 2026</span>
              <span class="payout-status live">RACE LIVE</span>
            </div>
            <div class="payout-row">
              <div class="payout-avatar live"><FlameIcon /></div>
              <div class="payout-winner">
                <span class="payout-name">Up for grabs</span>
                <span class="payout-rank">Climb /bal top to claim it</span>
              </div>
              <span class="payout-amount live">{amount}</span>
            </div>
          </article>
        </div>
      </div>
    </section>
  );
}
