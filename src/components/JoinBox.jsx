import { useDiscordMembers } from '../hooks/useDiscordMembers';
import { useCountdown } from '../hooks/useCountdown';
import { ArcadeButton } from './ArcadeButton';
import { CopyIpButton } from './CopyIpButton';

const fmt = (n) => n.toLocaleString('en-US');

/** Down or not open yet: the countdown before launch day, the maintenance line after it. */
function OfflineLabel({ launchDate, message }) {
  const time = useCountdown(launchDate);
  if (time.launched) return <span class="join-label join-label--down">{(message || 'Server offline').toUpperCase()}</span>;
  const pad = (n) => String(n).padStart(2, '0');
  return (
    <span class="join-label join-label--down">
      LAUNCHING IN <b class="join-count">{`${time.days}d ${pad(time.hours)}h ${pad(time.mins)}m`}</b>
    </span>
  );
}

/**
 * Row one's label. The live head count says the server is up better than the
 * word "online"; it falls back to SERVER IP while the check is in flight, or
 * when it failed and the server was assumed up rather than measured.
 */
function StatusLabel({ config, status }) {
  const offline = !status.loading && !status.online;
  if (offline) {
    return config.launchDate
      ? <OfflineLabel launchDate={config.launchDate} message={config.downSubMessage} />
      : <span class="join-label join-label--down">{(config.downSubMessage || 'Server offline').toUpperCase()}</span>;
  }
  const players = status.players;
  if (!players) return <span class="join-label">SERVER IP</span>;
  return (
    <span class="join-label">
      <b class="join-count">{fmt(players.online)}</b>
      {players.max ? ` / ${fmt(players.max)}` : ''} PLAYERS
    </span>
  );
}

/**
 * The hero's two actions: see the address and copy it, see the Discord and
 * join it. One small card, two rows, the Bedrock line underneath.
 */
export function JoinBox({ config, status }) {
  const members = useDiscordMembers(config.discord);

  return (
    <div class="card join-box" data-join-box>
      <div class="join-row">
        <div class="join-text">
          <StatusLabel config={config} status={status} />
          <span class="join-addr">play.<span class="accent">chromabit</span>.us</span>
        </div>
        <CopyIpButton variant="primary" />
      </div>
      <div class="join-row">
        <div class="join-text">
          <span class="join-label join-label--discord">DISCORD</span>
          <span class="join-members">{members != null ? fmt(members) : '60+'} MEMBERS</span>
        </div>
        <ArcadeButton href={config.discord} target="_blank" rel="noopener" variant="secondary" size="sm"
          data-discord-join aria-label="Join the Chromabit Discord">
          JOIN
        </ArcadeButton>
      </div>
      <p class="join-foot">
        <span class="join-ed">Bedrock: play.chromabit.us</span>
      </p>
    </div>
  );
}
