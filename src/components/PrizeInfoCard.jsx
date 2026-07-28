export function PrizeInfoCard({ prize }) {
  return (
    <div class="card info-card">
      <div class="card-label">SERVER EVENTS</div>
      <div class="prize-row">
        <div class="prize-icon pink">💰</div>
        <div class="prize-info">
          <div class="prize-name">1ST PLACE</div>
          <div class="prize-desc">Every event · top 5 all earn credit</div>
        </div>
        <div class="prize-amount pink">{prize}</div>
      </div>
      <div class="prize-row">
        <div class="prize-icon lilac">🏗️</div>
        <div class="prize-info">
          <div class="prize-name">EVENT CONTESTS</div>
          <div class="prize-desc">Community vote decides</div>
        </div>
        <div class="prize-amount lilac">STORE CREDIT</div>
      </div>
    </div>
  );
}
