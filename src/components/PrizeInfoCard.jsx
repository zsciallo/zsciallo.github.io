export function PrizeInfoCard({ prize }) {
  return (
    <div class="card info-card">
      <div class="card-label">SERVER EVENTS</div>
      <div class="prize-row">
        <div class="prize-icon pink">💰</div>
        <div class="prize-info">
          <div class="prize-name">BAL TOP</div>
          <div class="prize-desc">Weekly · resets every Sunday</div>
        </div>
        <div class="prize-amount pink">{prize} USD</div>
      </div>
      <div class="prize-row">
        <div class="prize-icon lilac">🏗️</div>
        <div class="prize-info">
          <div class="prize-name">EVENT CONTESTS</div>
          <div class="prize-desc">Monthly · community vote decides</div>
        </div>
        <div class="prize-amount lilac">CASH PRIZE</div>
      </div>
    </div>
  );
}
