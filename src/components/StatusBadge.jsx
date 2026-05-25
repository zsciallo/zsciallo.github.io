export function StatusBadge({ status }) {
  if (status.loading) {
    return (
      <div class="status-badge offline">
        <div class="status-dot" /> CHECKING...
      </div>
    );
  }
  if (!status.online) {
    return (
      <div class="status-badge offline">
        <div class="status-dot" /> SERVER UNDER CONSTRUCTION
      </div>
    );
  }
  return (
    <div class="status-badge">
      <div class="status-dot" /> SERVER ONLINE
      {status.ping != null && <span class="ping">{status.ping}ms</span>}
    </div>
  );
}
