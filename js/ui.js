// ============================================================
//  FINDME — ui.js
//  Controls all DOM / visual state transitions
// ============================================================

/* ── Screen IDs ─────────────────────────────────────────── */
const SCREENS = ['screen-identity', 'screen-permissions', 'screen-main'];

/* ── Action panel IDs ────────────────────────────────────── */
const ACTIONS = ['action-idle', 'action-requesting', 'action-incoming', 'action-active'];

export function showScreen(id) {
  SCREENS.forEach(s => {
    const el = document.getElementById(s);
    if (!el) return;
    el.classList.toggle('active', s === id);
  });
}

export function showAction(id) {
  ACTIONS.forEach(a => {
    const el = document.getElementById(a);
    if (!el) return;
    el.classList.toggle('hidden', a !== id);
  });
}

/* ── Identity screen ─────────────────────────────────────── */
export function populateIdentityScreen(users) {
  document.getElementById('user1-name').textContent  = users.user1.name;
  document.getElementById('user1-emoji').textContent = users.user1.emoji;
  document.getElementById('user2-name').textContent  = users.user2.name;
  document.getElementById('user2-emoji').textContent = users.user2.emoji;
}

/* ── Main screen chrome ──────────────────────────────────── */
export function setIdentityLabels(myName, partnerName) {
  document.getElementById('my-identity').textContent     = myName;
  document.getElementById('partner-identity').textContent = partnerName;
  document.getElementById('partner-name-find').textContent = partnerName;
  document.getElementById('partner-name-requesting').textContent = partnerName;
}

export function setRequesterName(name) {
  document.getElementById('requester-name').textContent = name;
}

/* ── Compass overlay ─────────────────────────────────────── */
export function setCompassOverlay(visible, text = '') {
  const overlay = document.getElementById('compass-overlay');
  overlay.classList.toggle('hidden', !visible);
  if (text) document.getElementById('compass-overlay-text').textContent = text;
}

/* ── Info panel ──────────────────────────────────────────── */
export function updateInfoPanel({ distance, lastUpdated, myAccuracy, bearing }) {
  if (distance     !== undefined) document.getElementById('distance-display').textContent = distance;
  if (lastUpdated  !== undefined) document.getElementById('last-updated').textContent     = lastUpdated;
  if (myAccuracy   !== undefined) document.getElementById('my-accuracy').textContent      = myAccuracy;
  if (bearing      !== undefined) document.getElementById('bearing-display').textContent  = bearing;
}

/* ── Request countdown timer ─────────────────────────────── */
let _countdownInterval = null;

export function startRequestCountdown(durationMs, onExpire) {
  clearInterval(_countdownInterval);
  const end = Date.now() + durationMs;

  function tick() {
    const remaining = Math.max(0, end - Date.now());
    const mins = Math.floor(remaining / 60_000);
    const secs = Math.floor((remaining % 60_000) / 1000);
    const el = document.getElementById('request-countdown');
    if (el) el.textContent = `${mins}:${secs.toString().padStart(2, '0')}`;
    if (remaining <= 0) {
      clearInterval(_countdownInterval);
      onExpire?.();
    }
  }
  tick();
  _countdownInterval = setInterval(tick, 1000);
}

export function stopRequestCountdown() {
  clearInterval(_countdownInterval);
}

/* ── Permission status indicators ───────────────────────── */
export function setPermStatus(perm, status) {
  // status: 'pending' | 'granted' | 'denied'
  const icons = { pending: '⏳', granted: '✅', denied: '❌' };
  const el = document.getElementById(`perm-${perm}-status`);
  if (el) el.textContent = icons[status] ?? '⏳';
}

/* ── Toast notifications ─────────────────────────────────── */
export function showToast(message, type = 'info', duration = 3500) {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  container.appendChild(toast);

  // Trigger animation
  requestAnimationFrame(() => toast.classList.add('visible'));

  setTimeout(() => {
    toast.classList.remove('visible');
    toast.addEventListener('transitionend', () => toast.remove(), { once: true });
  }, duration);
}

/* ── Connection status dot ───────────────────────────────── */
export function setConnectionStatus(status) {
  // status: 'online' | 'offline' | 'stale'
  const dot = document.getElementById('connection-status');
  if (!dot) return;
  dot.className = `connection-status ${status}`;
}

/* ── "Last updated X seconds ago" ticker ─────────────────── */
let _lastUpdatedTimestamp = null;
let _lastUpdatedInterval  = null;

export function startLastUpdatedTicker(timestamp) {
  _lastUpdatedTimestamp = timestamp;
  clearInterval(_lastUpdatedInterval);

  function tick() {
    if (!_lastUpdatedTimestamp) return;
    const secs = Math.round((Date.now() - _lastUpdatedTimestamp) / 1000);
    let text;
    if      (secs <  5)  text = 'Just now';
    else if (secs < 60)  text = `${secs}s ago`;
    else if (secs < 120) text = '1 min ago';
    else                  text = `${Math.floor(secs / 60)} min ago`;
    document.getElementById('last-updated').textContent = text;
  }

  tick();
  _lastUpdatedInterval = setInterval(tick, 1000);
}

export function stopLastUpdatedTicker() {
  clearInterval(_lastUpdatedInterval);
  _lastUpdatedTimestamp = null;
}
