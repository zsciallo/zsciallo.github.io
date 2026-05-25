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

export function ServerIPCard({ ip }) {
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    navigator.clipboard.writeText(ip).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div class="card ip-block">
      <div class="ip-label">SERVER IP</div>
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
