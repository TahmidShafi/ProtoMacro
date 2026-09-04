/* ============================================================
   ProtoMacro — utils.js
   Shared helpers: DOM shortcuts, formatting, toast, icons.
   ============================================================ */

export const $ = (sel, root) => (root || document).querySelector(sel);
export const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

/* HTML escaping (safe for text interpolation inside templates) */
const ESC_MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const escapeHtml = (str) => String(str).replace(/[&<>"']/g, (s) => ESC_MAP[s]);

/* Numeric parsing: returns null if NaN/infinite */
export const num = (v) => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : null;
};

/* Clamp helper */
export const clamp = (v, min, max) => Math.max(min, Math.min(max, v));

/* Animated number easing */
export const animateNumber = (el, target, duration = 700) => {
  if (!el) return;
  const start = 0;
  const t0 = performance.now();
  const tick = (now) => {
    const t = Math.min(1, (now - t0) / duration);
    const eased = 1 - Math.pow(1 - t, 3);
    el.textContent = Math.round(start + (target - start) * eased).toLocaleString();
    if (t < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
};

/* SVG icon registry — defined once, reused everywhere */
const ICONS = {
  check: '<polyline points="20 6 9 17 4 12"/>',
  x: '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>',
  alert: '<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>',
  info: '<circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>',
  plus: '<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>',
  trash: '<polyline points="3 6 5 6 21 6"/><path d="M19 6l-2 14a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/>',
  target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="3"/>',
  search: '<circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>',
  arrow: '<path d="M5 12h14M13 5l7 7-7 7"/>',
  calc: '<path d="M9 11H5a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7a2 2 0 0 0-2-2h-4"/><path d="M12 2v14M8 6l4-4 4 4"/>',
  check2: '<path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>',
  bookmark: '<path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>',
  bolt: '<path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/>'
};

export const icon = (name, size = 16, strokeWidth = 2) => {
  const body = ICONS[name];
  if (!body) return '';
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
};

/* Toast notifications */
export const toast = (msg, type = 'success') => {
  const container = $('#toastContainer');
  if (!container) return;
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  const iconName = type === 'error' ? 'alert' : type === 'info' ? 'info' : 'check';
  el.innerHTML = `<div class="toast-icon">${icon(iconName, 16, 2.5)}</div><div class="toast-msg">${escapeHtml(msg)}</div>`;
  container.appendChild(el);
  setTimeout(() => {
    el.classList.add('leaving');
    setTimeout(() => el.remove(), 300);
  }, 2800);
};

/* rAF-throttled event runner — reduces scroll/resize churn */
export const rafThrottle = (fn) => {
  let ticking = false;
  return function (...args) {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      fn.apply(this, args);
      ticking = false;
    });
  };
};

/* Unique id generator (fast, good enough for local keys) */
export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
