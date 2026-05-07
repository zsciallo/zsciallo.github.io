function copyIP() {
  const ip = document.getElementById('ip-text').textContent;
  const btn = document.getElementById('copy-btn');
  navigator.clipboard.writeText(ip).then(() => {
    btn.classList.add('copied');
    btn.innerHTML = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg> COPIED!';
    setTimeout(() => {
      btn.classList.remove('copied');
      btn.innerHTML = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg> COPY IP';
    }, 2000);
  });
}
