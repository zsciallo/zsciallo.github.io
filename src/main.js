async function checkServerStatus() {
  const badge = document.querySelector(".status-badge");

  if (SITE_CONFIG.underConstruction) {
    setOffline(badge);
    return;
  }

  const start = Date.now();
  try {
    const res = await fetch(
      `https://api.mcsrvstat.us/3/${SITE_CONFIG.serverIP}`,
    );
    const ping = Date.now() - start;
    const data = await res.json();
    //console.log(data);
    if (data.online) {
      badge.innerHTML = `<div class="status-dot"></div> SERVER ONLINE <span class="ping">${ping}ms</span>`;
      document.querySelector(".info-card.status-card").style.display = "none";
    } else {
      setOffline(badge);
    }
  } catch {
    setOffline(badge);
  }
}

function setOffline(badge) {
  document.querySelector(".card.ip-block").remove();
  document.getElementById("visit-store-btn").style.display = "none";
  badge.classList.add("offline");
  badge.innerHTML = `<div class="status-dot"></div> SERVER UNDER CONSTRUCTION`;
  if (SITE_CONFIG.launchDate) {
    const sub = SITE_CONFIG.downSubMessage
      ? `<p class="launch-sub">${SITE_CONFIG.downSubMessage}</p>`
      : "";
    document.querySelector(".info-card.status-card").innerHTML =
      `<p class="launch-msg">LAUNCHING IN</p>
      <h3 id="countdown-timer" class="countdown-timer">--d --h --m --s</h3>
      ${sub}`;
    startCountdown();
  }
}

function startCountdown() {
  const [y, m, d] = SITE_CONFIG.launchDate.split("-").map(Number);
  const target = new Date(y, m - 1, d);

  function tick() {
    const el = document.getElementById("countdown-timer");
    if (!el) return;
    const diff = target - Date.now();
    if (diff <= 0) {
      el.textContent = "LAUNCHING NOW!";
      return;
    }
    const days = Math.floor(diff / 86400000);
    const hours = Math.floor((diff % 86400000) / 3600000);
    const mins = Math.floor((diff % 3600000) / 60000);
    const secs = Math.floor((diff % 60000) / 1000);
    el.textContent = `${days}d ${String(hours).padStart(2, "0")}h ${String(mins).padStart(2, "0")}m ${String(secs).padStart(2, "0")}s`;
    setTimeout(tick, 1000);
  }

  tick();
}

if (SITE_CONFIG.hideVisitStore) {
  document.getElementById("visit-store-btn").style.display = "none";
}

checkServerStatus();

function copyIP() {
  const ip = document.getElementById("ip-text").textContent;
  const btn = document.getElementById("copy-btn");
  navigator.clipboard.writeText(ip).then(() => {
    btn.classList.add("copied");
    btn.innerHTML =
      '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg> COPIED!';
    setTimeout(() => {
      btn.classList.remove("copied");
      btn.innerHTML =
        '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg> COPY IP';
    }, 2000);
  });
}
