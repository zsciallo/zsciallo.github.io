import { useCountdown } from '../hooks/useCountdown';

export function CountdownTimer({ targetDate, subMessage }) {
  const time = useCountdown(targetDate);

  return (
    <div class="card info-card status-card">
      <p class="launch-msg">LAUNCHING IN</p>
      <h3 class="countdown-timer">
        {time.launched
          ? 'LAUNCHING NOW!'
          : `${time.days}d ${String(time.hours).padStart(2, '0')}h ${String(time.mins).padStart(2, '0')}m ${String(time.secs).padStart(2, '0')}s`}
      </h3>
      {subMessage && <p class="launch-sub">{subMessage}</p>}
    </div>
  );
}
