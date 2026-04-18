// ============================================================
//  FINDME — location.js
//  Geolocation wrapper + Haversine distance/bearing helpers
// ============================================================

/* ── Internal state ──────────────────────────────────────── */
let _watchId          = null;
let _updateInterval   = null;
let _currentPosition  = null;   // { lat, lng, accuracy }
let _onPositionChange = null;   // callback(position)

/* ── Start watching device position ─────────────────────── */
export function startLocationWatch(onPositionChange) {
  if (!('geolocation' in navigator)) {
    throw new Error('Geolocation not supported');
  }

  _onPositionChange = onPositionChange;

  _watchId = navigator.geolocation.watchPosition(
    (pos) => {
      _currentPosition = {
        lat:      pos.coords.latitude,
        lng:      pos.coords.longitude,
        accuracy: Math.round(pos.coords.accuracy),
      };
      _onPositionChange?.(_currentPosition);
    },
    (err) => {
      console.error('Geolocation error:', err.message);
    },
    {
      enableHighAccuracy: true,
      timeout:            15_000,
      maximumAge:          5_000,
    }
  );
}

export function stopLocationWatch() {
  if (_watchId !== null) {
    navigator.geolocation.clearWatch(_watchId);
    _watchId = null;
  }
  clearInterval(_updateInterval);
  _updateInterval = null;
}

export function getCurrentPosition() {
  return _currentPosition;
}

/* ── One-shot position request ───────────────────────────── */
export function getPositionOnce() {
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({
        lat:      pos.coords.latitude,
        lng:      pos.coords.longitude,
        accuracy: Math.round(pos.coords.accuracy),
      }),
      reject,
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 10_000 }
    );
  });
}

/* ── Periodic Firestore push ─────────────────────────────── */
export function startLocationPusher(intervalMs, pushFn) {
  clearInterval(_updateInterval);

  async function doPush() {
    if (!_currentPosition) return;
    try {
      await pushFn(_currentPosition);
    } catch (err) {
      console.error('Location push failed:', err);
    }
  }

  doPush(); // immediate first push
  _updateInterval = setInterval(doPush, intervalMs);
}

export function stopLocationPusher() {
  clearInterval(_updateInterval);
  _updateInterval = null;
}

/* ── Haversine distance (metres) ─────────────────────────── */
export function distanceMetres(lat1, lng1, lat2, lng2) {
  const R    = 6_371_000; // Earth radius in metres
  const φ1   = lat1 * Math.PI / 180;
  const φ2   = lat2 * Math.PI / 180;
  const Δφ   = (lat2 - lat1) * Math.PI / 180;
  const Δλ   = (lng2 - lng1) * Math.PI / 180;
  const a    = Math.sin(Δφ / 2) ** 2
             + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/* ── Format distance for display (metric / UK) ───────────── */
export function formatDistance(metres) {
  if      (metres <   10) return `${Math.round(metres)} m`;
  else if (metres <  100) return `${Math.round(metres / 5)  * 5} m`;
  else if (metres < 1000) return `${Math.round(metres / 10) * 10} m`;
  else                    return `${(metres / 1000).toFixed(1)} km`;
}

/* ── Bearing from point A → point B (degrees, 0 = north) ── */
export function bearingDegrees(lat1, lng1, lat2, lng2) {
  const φ1 = lat1 * Math.PI / 180;
  const φ2 = lat2 * Math.PI / 180;
  const Δλ = (lng2 - lng1) * Math.PI / 180;
  const y  = Math.sin(Δλ) * Math.cos(φ2);
  const x  = Math.cos(φ1) * Math.sin(φ2)
            - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
}