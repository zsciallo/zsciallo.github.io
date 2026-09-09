import { useState } from 'preact/hooks';

function CopyIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
      <rect x="9" y="9" width="13" height="13" rx="2" />
      <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

export function ServerIPCard({ ip, status }) {
  const [copied, setCopied] = useState(false);
  const players = status?.players;

  function handleCopy() {
    navigator.clipboard.writeText(ip).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div class="card ip-block">
      {/* The head count takes the label's place when we have one. It says the
          server is up more convincingly than the word "online" did, and the
          address underneath already says what the block is. Falls back to the
          label while the check is in flight, or when it failed and we assumed
          the server was up rather than measuring it. */}
      <div class="ip-label">
        {players ? (
          <>
            <b class="ip-count">{players.online.toLocaleString('en-US')}</b>
            {players.max ? ` / ${players.max.toLocaleString('en-US')}` : ''} PLAYERS
          </>
        ) : 'SERVER IP'}
      </div>
      <div class="ip-value">
        play.<span class="accent">chromabit</span>.us
      </div>
      <button class={`copy-btn${copied ? ' copied' : ''}`} onClick={handleCopy}>
        {copied ? <CheckIcon /> : <CopyIcon />}
        {copied ? 'COPIED!' : 'COPY IP'}
      </button>
    </div>
  );
}
