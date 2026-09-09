/**
 * How a market works, for readers who have never traded anything.
 *
 * This teaches the idea, not our plumbing: what a price is, why it moves, and
 * how somebody makes or loses money on one. Kept to five short sections - a
 * primer nobody finishes teaches nothing, and the reader who needs it is one
 * click away from the thing it is explaining.
 *
 * A plain <details>, so it costs nothing when closed, opens without JavaScript
 * and is keyboard-operable for free. Closed by default: regulars are here for
 * the prices.
 */
export function MarketPrimer() {
  return (
    <details class="explainer">
      <summary>
        <span class="explainer-title">What is a market?</span>
        <span class="explainer-hint">never traded before? start here</span>
      </summary>

      <div class="explainer-body">
        <section>
          <h4>A price is a tug of war</h4>
          <p>
            Nobody sets it. The price sits where buyers and sellers are evenly
            matched. More people wanting in than out is <b>buy pressure</b>, and
            sellers can hold out for more, so it climbs. More wanting out than
            in, and they undercut each other, so it falls.
          </p>
        </section>

        <section>
          <h4>What moves the pressure</h4>
          <p>
            Supply and demand, both of which you can watch happen in game.
            Somebody finishes an iron farm and dumps stacks: supply up, price
            down. A big fight burns through everyone's totems: demand up, price
            up. The move often shows up before the reason does.
          </p>
        </section>

        <section>
          <h4>Making money, and losing it</h4>
          <p>
            You profit by buying low and selling higher. What you paid is the
            only number that matters after. A $5,000 totem is a win at $3,000
            and a loss at $8,000. Until you sell it is paper: it is worth what
            the next person will pay, not what the chart said yesterday.
          </p>
        </section>

        <section>
          <h4>Reading the chart</h4>
          <p>
            <b>Line</b> is price over time. <b>Candles</b> cut it into buckets:
            the body spans the open and close, green up and red down, and the
            thin wick marks the highest and lowest it touched between. The bars
            underneath are volume. A big move on no volume is one person's
            opinion.
          </p>
        </section>

        <section>
          <h4>Trading one</h4>
          <p>
            In game, <code>/stock</code> and the short name on a card, so
            {' '}<code>/stock diamond</code>. Large orders push the price against
            you as they fill, and you buy a shade above the quote and sell a
            shade below. Prices move fast and don't always come back, so don't put
            in what you can't shrug off.
          </p>
        </section>
      </div>
    </details>
  );
}
