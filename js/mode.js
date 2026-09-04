/* ============================================================
   ProtoMacro — mode.js
   Bulk / Cut / Maintain mode. Central source of truth for:
     - calorie offsets
     - macro splits
     - helper renderers (banner, deficit card inputs, toggle buttons)
   Other modules can register a hook via onGoalsApplied() to react
   when goals change (e.g. bmi.js refreshing its results panel).
   ============================================================ */
import { STATE, saveState } from './state.js';
import { toast, $ } from './utils.js';

export const MODES = {
  cut: {
    key: 'cut', label: 'Cut', emoji: '\ud83d\udd34',
    offset: -500, color: 'var(--danger)',
    splits: { p: 0.40, c: 0.30, f: 0.30 },
    blurb: 'Protein priority to preserve muscle during a deficit.'
  },
  maintain: {
    key: 'maintain', label: 'Maintain', emoji: '\u26aa',
    offset: 0, color: 'var(--text)',
    splits: { p: 0.30, c: 0.40, f: 0.30 },
    blurb: 'Balanced split for recomposition or body-weight maintenance.'
  },
  bulk: {
    key: 'bulk', label: 'Bulk', emoji: '\ud83d\udfe2',
    offset: +500, color: 'var(--primary)',
    splits: { p: 0.30, c: 0.50, f: 0.20 },
    blurb: 'Carb-heavy surplus — fuel for hard training and growth.'
  }
};

export const calcMacrosFor = (tdee, modeKey) => {
  const m = MODES[modeKey] || MODES.maintain;
  const cals = Math.max(1200, Math.round(tdee + m.offset));
  return {
    calories: cals,
    protein:  Math.round((cals * m.splits.p) / 4),
    carbs:    Math.round((cals * m.splits.c) / 4),
    fat:      Math.round((cals * m.splits.f) / 9)
  };
};

/* ------------------------------------------------------------
   Goals-applied hook registry.
   Modules register callbacks that run whenever active goals are
   recalculated (mode switch / TDEE save), keeping UI panels in
   sync without circular imports.
   ------------------------------------------------------------ */
const goalsHooks = new Set();

export const onGoalsApplied = (fn) => {
  if (typeof fn === 'function') goalsHooks.add(fn);
};

const emitGoalsApplied = () => {
  for (const fn of goalsHooks) {
    try { fn(); } catch (e) { console.warn('[ProtoMacro] goals hook failed:', e); }
  }
};

/* Change mode + (optionally) also persist a new TDEE from BMI calc */
export function setMode(modeKey, opts = {}) {
  if (!MODES[modeKey]) return;
  STATE.mode = modeKey;
  if (typeof opts.tdee === 'number') STATE.tdee = opts.tdee;
  STATE.goals = calcMacrosFor(STATE.tdee, modeKey);
  saveState();
  renderModeButtons();
  emitGoalsApplied();
  updateTrackerFn?.();
  if (!opts.silent) {
    const m = MODES[modeKey];
    toast(`${m.emoji} ${m.label} mode — target ${STATE.goals.calories} kcal/day`, 'success');
  }
}

/* tracker.js registers its updater here to avoid a static cycle
   (tracker imports MODES from this module). Call-time only. */
let updateTrackerFn = null;
export const bindTrackerUpdate = (fn) => { updateTrackerFn = fn; };

/* =========================================================
   Mode toggle buttons (rendered inside BMI results section)
   ========================================================= */
const MODE_ORDER = ['cut', 'maintain', 'bulk'];

export function renderModeButtons() {
  const host = $('#modeToggleGroup');
  if (!host) return;
  const current = STATE.mode;
  host.innerHTML = MODE_ORDER.map((k) => {
    const m = MODES[k];
    const active = k === current ? ' active' : '';
    const sign = m.offset > 0 ? `+${m.offset}` : m.offset < 0 ? `${m.offset}` : 'TDEE';
    return `
      <button type="button" class="mode-btn mode-${k}${active}" data-mode="${k}">
        <span class="mode-btn-emoji">${m.emoji}</span>
        <span class="mode-btn-label">${m.label}</span>
        <span class="mode-btn-sub">${sign} kcal</span>
      </button>
    `;
  }).join('');
}

const bindModeButtons = () => {
  const host = $('#modeToggleGroup');
  if (!host) return;
  host.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-mode]');
    if (!btn) return;
    setMode(btn.dataset.mode);
  });
};

export function initMode() {
  renderModeButtons();
  bindModeButtons();
}
