// ============================================================
//  FINDME — compass.js
//  Device orientation + compass face rendering + needle anim
// ============================================================

/* ── Internal state ──────────────────────────────────────── */
let _deviceHeading   = null;   // degrees clockwise from magnetic north
let _targetBearing   = null;   // degrees from north toward partner
let _currentAngle    = 0;      // tracked needle angle (allows smooth wrap)
let _currentFaceAngle= 0;      // tracked face angle
let _orientationActive = false;

const SMOOTH = 0.18; // lerp factor per frame — lower = smoother but laggier

/* ── DOM refs (populated by initCompass) ─────────────────── */
let _faceEl   = null;  // the SVG face that rotates to keep N up
let _needleEl = null;  // the wrapper that rotates toward partner
let _bearingDisplay = null;

/* ── Initialise compass face SVG + start animation ──────── */
export function initCompass() {
  _faceEl   = document.getElementById('compass-face-container');
  _needleEl = document.getElementById('needle-wrapper');
  _bearingDisplay = document.getElementById('bearing-display');

  buildCompassFace(document.getElementById('compass-face'));
  requestAnimationFrame(_animLoop);
}

/* ── Request device orientation permission (iOS 13+) ─────── */
export async function requestOrientationPermission() {
  if (typeof DeviceOrientationEvent?.requestPermission === 'function') {
    const result = await DeviceOrientationEvent.requestPermission();
    if (result !== 'granted') throw new Error('Orientation permission denied');
  }
  _startOrientationListener();
  return true;
}

/* ── Start listening (Android / already-permitted iOS) ────── */
export function startOrientationIfAvailable() {
  if (typeof DeviceOrientationEvent?.requestPermission !== 'function') {
    _startOrientationListener();
  }
}

function _startOrientationListener() {
  if (_orientationActive) return;

  // Prefer absolute orientation event (Android Chrome)
  const useAbsolute = 'ondeviceorientationabsolute' in window;

  if (useAbsolute) {
    window.addEventListener('deviceorientationabsolute', _handleOrientation, true);
  } else {
    window.addEventListener('deviceorientation', _handleOrientation, true);
  }
  _orientationActive = true;
}

function _handleOrientation(event) {
  let heading = null;

  if (event.webkitCompassHeading !== undefined && event.webkitCompassHeading !== null) {
    // iOS — degrees clockwise from magnetic north
    heading = event.webkitCompassHeading;
  } else if (event.absolute && event.alpha !== null) {
    // Android absolute — alpha is CCW from north, flip it
    heading = (360 - event.alpha + 360) % 360;
  } else if (event.alpha !== null) {
    // Non-absolute fallback — alpha is device rotation, imprecise
    heading = (360 - event.alpha + 360) % 360;
  }

  _deviceHeading = heading;
}

/* ── Update target bearing (called by app.js) ────────────── */
export function setTargetBearing(bearing) {
  _targetBearing = bearing;
}

export function clearTargetBearing() {
  _targetBearing = null;
}

export function getDeviceHeading() {
  return _deviceHeading;
}

/* ── Animation loop ──────────────────────────────────────── */
function _animLoop() {
  _updateNeedle();
  _updateFace();
  requestAnimationFrame(_animLoop);
}

function _updateNeedle() {
  if (_needleEl === null) return;

  // If we have no target, keep needle pointing straight up (no partner)
  const targetAngle = (_targetBearing !== null) ? _targetBearing : 0;

  // Shortest-path interpolation
  _currentAngle = _shortestLerp(_currentAngle, targetAngle, SMOOTH);
  _needleEl.style.transform = `rotate(${_currentAngle}deg)`;

  if (_bearingDisplay && _targetBearing !== null) {
    _bearingDisplay.textContent = `${Math.round(_targetBearing)}°`;
  }
}

function _updateFace() {
  if (_faceEl === null || _deviceHeading === null) return;
  const target = -_deviceHeading;
  _currentFaceAngle = _shortestLerp(_currentFaceAngle, target, SMOOTH);
  _faceEl.style.transform = `rotate(${_currentFaceAngle}deg)`;
}

/* ── Lerp that takes shortest rotation path ─────────────── */
function _shortestLerp(current, target, t) {
  let delta = ((target - current) % 360 + 540) % 360 - 180;
  return current + delta * t;
}

/* ── Build compass face SVG ──────────────────────────────── */
function buildCompassFace(svg) {
  if (!svg) return;
  svg.innerHTML = '';

  const CX = 150, CY = 150;
  const OUTER_R = 142;

  // Background circle
  _svgEl(svg, 'circle', {
    cx: CX, cy: CY, r: OUTER_R + 2,
    fill: 'url(#compassGrad)', stroke: 'none'
  });

  // Defs for gradients
  const defs = _svgEl(svg, 'defs', {});

  const grad = _svgEl(defs, 'radialGradient', { id: 'compassGrad', cx: '50%', cy: '35%', r: '65%' });
  _svgEl(grad, 'stop', { offset: '0%',   'stop-color': '#1a2540' });
  _svgEl(grad, 'stop', { offset: '100%', 'stop-color': '#090d18' });

  // Tick marks
  for (let deg = 0; deg < 360; deg += 5) {
    const isCardinal     = deg % 90  === 0;
    const isIntercardinal = deg % 45  === 0 && !isCardinal;
    const isMajor        = deg % 30  === 0;

    const tickLen    = isCardinal ? 18 : isIntercardinal ? 13 : isMajor ? 8 : 5;
    const strokeW    = isCardinal ? 2.5 : isIntercardinal ? 1.5 : 1;
    const strokeColor = isCardinal
      ? (deg === 0 ? '#f59e0b' : '#64748b')
      : isIntercardinal ? '#334155' : '#1e293b';

    const rad = (deg - 90) * Math.PI / 180;
    const x1  = CX + (OUTER_R - tickLen) * Math.cos(rad);
    const y1  = CY + (OUTER_R - tickLen) * Math.sin(rad);
    const x2  = CX + OUTER_R * Math.cos(rad);
    const y2  = CY + OUTER_R * Math.sin(rad);

    _svgEl(svg, 'line', {
      x1, y1, x2, y2,
      stroke: strokeColor, 'stroke-width': strokeW,
      'stroke-linecap': 'round'
    });
  }

  // Cardinal + intercardinal labels
  const labels = [
    { deg:   0, text: 'N',  size: 20, color: '#f59e0b', weight: '700' },
    { deg:  45, text: 'NE', size: 11, color: '#475569', weight: '500' },
    { deg:  90, text: 'E',  size: 16, color: '#94a3b8', weight: '600' },
    { deg: 135, text: 'SE', size: 11, color: '#475569', weight: '500' },
    { deg: 180, text: 'S',  size: 16, color: '#94a3b8', weight: '600' },
    { deg: 225, text: 'SW', size: 11, color: '#475569', weight: '500' },
    { deg: 270, text: 'W',  size: 16, color: '#94a3b8', weight: '600' },
    { deg: 315, text: 'NW', size: 11, color: '#475569', weight: '500' },
  ];

  const labelR = OUTER_R - 28;
  labels.forEach(({ deg, text, size, color, weight }) => {
    const rad = (deg - 90) * Math.PI / 180;
    const x = CX + labelR * Math.cos(rad);
    const y = CY + labelR * Math.sin(rad);
    const t = _svgEl(svg, 'text', {
      x, y,
      'text-anchor': 'middle', 'dominant-baseline': 'central',
      fill: color, 'font-size': size, 'font-weight': weight,
      'font-family': "'DM Mono', monospace",
    });
    t.textContent = text;
  });
}

/* ── SVG element helper ──────────────────────────────────── */
function _svgEl(parent, tag, attrs) {
  const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
  Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, v));
  parent.appendChild(el);
  return el;
}
