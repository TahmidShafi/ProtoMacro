/* ============================================================
   ProtoMacro — tracker.js
   Macro tracker: progress rings, food log, totals, persistence.
   Also renders mode banner + surplus/deficit card.
   ============================================================ */
import { $, escapeHtml, icon, makeId, clamp, num, toast } from './utils.js';
import { STATE, saveState, recordDailySnapshot } from './state.js';
import { MODES } from './mode.js';
import { on } from './core/bus.js';
import { computeDailyScore } from './core/metrics.js';
import { shareScorecard } from './share.js';

import { today } from './datetime.js';

const RING_CIRC = 2 * Math.PI * 50;

const RINGS = [
  { key: 'cal', goal: 'calories', decimals: 0, unit: ''  },
  { key: 'pro', goal: 'protein',  decimals: 1, unit: 'g' },
  { key: 'car', goal: 'carbs',    decimals: 1, unit: 'g' },
  { key: 'fat', goal: 'fat',      decimals: 1, unit: 'g' }
];

let dom = null;

export const getTrackerTotals = () => {
  let cal = 0, pro = 0, car = 0, fat = 0;
  for (const item of STATE.log) {
    const mult = (item.servings || 100) / 100;
    cal += item.calories * mult;
    pro += item.protein  * mult;
    car += item.carbs    * mult;
    fat += item.fat      * mult;
  }
  return { cal, pro, car, fat };
};

/* Pick calorie ring color based on current mode + ratio.
   - CUT: red when over
   - BULK: blue when over (surplus)
   - MAINTAIN: green within 50 kcal of target, yellow otherwise */
const calRingColor = (value, goal, mode) => {
  if (!goal) return 'var(--primary)';
  const diff = value - goal;
  if (mode === 'cut')   return diff > 0    ? 'var(--danger)'  : 'var(--primary)';
  if (mode === 'bulk')  return diff >= 0   ? 'var(--info)'    : 'var(--primary)';
  /* maintain */
  return Math.abs(diff) <= 50 ? 'var(--primary)' : 'var(--warning)';
};

const setRing = (cfg, value, mode) => {
  const goal  = STATE.goals[cfg.goal] || 0;
  const ratio = goal > 0 ? Math.min(1.2, value / goal) : 0;
  const r     = dom.rings[cfg.key];

  r.progress.style.strokeDashoffset = RING_CIRC * (1 - Math.min(1, ratio));
  r.value.textContent   = (cfg.decimals ? value.toFixed(cfg.decimals) : Math.round(value).toLocaleString()) + cfg.unit;
  r.goalEl.textContent  = goal;
  r.percent.textContent = Math.round(ratio * 100) + '%';

  /* Calorie ring uses mode-aware color */
  if (cfg.key === 'cal') {
    r.progress.style.stroke = calRingColor(value, goal, mode);
  }
};

const renderRings = (t) => {
  const mode = STATE.mode;
  setRing(RINGS[0], t.cal, mode);
  setRing(RINGS[1], t.pro, mode);
  setRing(RINGS[2], t.car, mode);
  setRing(RINGS[3], t.fat, mode);
};

const renderRow = (item) => {
  const mult = (item.servings || 100) / 100;
  const c = item.calories * mult;
  const p = item.protein  * mult;
  const cr = item.carbs   * mult;
  const f = item.fat      * mult;
  const brand = item.brand ? ` <small>\u00b7 ${escapeHtml(item.brand)}</small>` : '';

  return `
    <tr data-uid="${item.uid}">
      <td class="food-name-cell" title="${escapeHtml(item.name)}">${escapeHtml(item.name)}${brand}</td>
      <td><input type="number" class="serving-input" value="${item.servings}" min="1" max="5000" data-role="serving" aria-label="Servings for ${escapeHtml(item.name)}" /></td>
      <td class="cal-cell">${Math.round(c)} kcal</td>
      <td class="macro-cell">${p.toFixed(1)}g</td>
      <td class="macro-cell">${cr.toFixed(1)}g</td>
      <td class="macro-cell">${f.toFixed(1)}g</td>
      <td><button class="delete-btn" data-role="delete" title="Remove" aria-label="Remove ${escapeHtml(item.name)}">${icon('x', 14, 2.5)}</button></td>
    </tr>
  `;
};

/* Mode banner just above the rings */
const renderModeBanner = () => {
  if (!dom.banner) return;
  const mode = MODES[STATE.mode] || MODES.maintain;
  const goal = STATE.goals.calories;
  const offsetText = mode.offset === 0
    ? '(maintenance)'
    : mode.offset > 0 ? `(+${mode.offset} surplus)` : `(${mode.offset} deficit)`;
  dom.banner.className = `mode-banner mode-banner-${mode.key}`;
  dom.banner.innerHTML = `
    <div class="mode-banner-main">
      <span class="mode-banner-emoji">${mode.emoji}</span>
      <strong>${mode.label === 'Cut' ? 'Cutting' : mode.label === 'Bulk' ? 'Bulking' : 'Maintaining'}</strong>
      &mdash; Target: <strong>${goal.toLocaleString()} kcal</strong>
      <span class="mode-banner-sub">${offsetText}</span>
    </div>
    <div class="mode-banner-blurb">${mode.blurb}</div>
  `;
};

/* Surplus / deficit card — below the log table */
const renderDeficitCard = (totals) => {
  if (!dom.deficit) return;
  const mode = STATE.mode;
  const goal = STATE.goals.calories;
  const consumed = Math.round(totals.cal);
  const diff = consumed - goal;
  const absDiff = Math.abs(diff);

  let stateClass = 'neutral';
  let message = '';

  if (mode === 'cut') {
    if (diff <= 0) {
      stateClass = 'good';
      message = `You are <strong>${absDiff} kcal in deficit</strong> today. On track for cut! \u2705`;
    } else {
      stateClass = 'bad';
      message = `You are <strong>${absDiff} kcal over</strong> your cut target. Dial it back. \u26a0\ufe0f`;
    }
  } else if (mode === 'bulk') {
    if (diff >= 0) {
      stateClass = 'good';
      message = `You are <strong>${absDiff} kcal in surplus</strong>. Feeding the gains! \u2705`;
    } else {
      stateClass = 'warn';
      message = `You are <strong>${absDiff} kcal under</strong> bulk target. Eat more! \u26a0\ufe0f`;
    }
  } else {
    if (absDiff <= 50) {
      stateClass = 'good';
      message = `Right on maintenance &mdash; within ${absDiff} kcal of target. \u2705`;
    } else {
      stateClass = 'warn';
      message = diff > 0
        ? `You are <strong>${absDiff} kcal over</strong> maintenance.`
        : `You are <strong>${absDiff} kcal under</strong> maintenance.`;
    }
  }

  dom.deficit.className = `deficit-card deficit-${stateClass}`;
  dom.deficit.innerHTML = `
    <div class="deficit-head">
      <div class="deficit-title">Daily balance</div>
      <div class="deficit-nums">
        <span>${consumed.toLocaleString()}</span>
        <small>/ ${goal.toLocaleString()} kcal</small>
      </div>
    </div>
    <div class="deficit-bar"><div class="deficit-bar-fill" style="width:${Math.min(120, (consumed / Math.max(1, goal)) * 100)}%"></div></div>
    <div class="deficit-msg">${message}</div>
  `;
};

export function updateTracker() {
  if (!dom) return;
  const items = STATE.log;

  renderModeBanner();

  const totals = items.length ? getTrackerTotals() : { cal: 0, pro: 0, car: 0, fat: 0 };
  const score = computeDailyScore({
    calories: totals.cal,
    protein: totals.pro,
    items: items.length,
    water: STATE.water.consumed,
    goals: { ...STATE.goals, water: STATE.water.goal }
  });

  if (!items.length) {
    dom.tbody.innerHTML = '<tr><td colspan="7"><div class="log-empty">No foods logged yet. Use the Food Search to add items.</div></td></tr>';
    dom.tfoot.classList.add('hidden');
    dom.count.textContent = '0 items logged';
    renderRings(totals);
    renderDeficitCard(totals);
    /* No snapshot when nothing was logged today — a zero-day is "not
       logged", never pollute history with fake 0-kcal entries. */
    const existing = STATE.history.find((h) => h.date === today() && (h.items ?? 1) > 0);
    if (!existing) {
      STATE.history = STATE.history.filter((h) => h.date !== today());
    }
    saveState();
    emit('dashboard:update');
    return;
  }

  dom.tfoot.classList.remove('hidden');
  dom.count.textContent = `${items.length} item${items.length === 1 ? '' : 's'} logged`;
  dom.tbody.innerHTML = items.map(renderRow).join('');

  dom.totalCal.textContent = `${Math.round(totals.cal)} kcal`;
  dom.totalPro.textContent = `${totals.pro.toFixed(1)}g`;
  dom.totalCar.textContent = `${totals.car.toFixed(1)}g`;
  dom.totalFat.textContent = `${totals.fat.toFixed(1)}g`;

  renderRings(totals);
  renderDeficitCard(totals);
  recordDailySnapshot(totals, { score: score.score });
  saveState();
  emit('dashboard:update');
}

export const addToTracker = (food) => {
  STATE.log.push({ ...food, uid: makeId(), servings: 100 });
  rememberRecent(food);
  saveState();
  updateTracker();
  toast(`Added "${food.name.slice(0, 36)}" to tracker`, 'success');
};

/* Track recently used foods (by stable id) for quick re-logging */
const rememberRecent = (food) => {
  if (!food?.id) return;
  STATE.recents = [
    { id: food.id, ts: Date.now() },
    ...STATE.recents.filter((r) => r.id !== food.id)
  ].slice(0, 30);
};

const bindEvents = () => {
  dom.tbody.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-role="delete"]');
    if (!btn) return;
    const tr = btn.closest('tr');
    const uidVal = tr.dataset.uid;
    STATE.log = STATE.log.filter((i) => i.uid !== uidVal);
    updateTracker();
    toast('Item removed', 'info');
  });

  dom.tbody.addEventListener('change', (e) => {
    const input = e.target.closest('[data-role="serving"]');
    if (!input) return;
    const tr = input.closest('tr');
    const uidVal = tr.dataset.uid;
    const val = clamp(num(input.value) ?? 100, 1, 5000);
    input.value = val;
    const item = STATE.log.find((i) => i.uid === uidVal);
    if (item) {
      item.servings = val;
      updateTracker();
    }
  });

  dom.clearBtn.addEventListener('click', () => {
    if (!STATE.log.length) return toast('Nothing to clear.', 'info');
    if (!confirm('Clear your food log? This cannot be undone.')) return;
    STATE.log = [];
    updateTracker();
    toast('Food log cleared.', 'info');
  });

  if (dom.shareBtn) {
    dom.shareBtn.addEventListener('click', () => shareScorecard());
  }
};

export function initTracker() {
  dom = {
    banner:   $('#trackerModeBanner'),
    deficit:  $('#deficitCard'),
    tbody:    $('#logTableBody'),
    tfoot:    $('#logTableFoot'),
    count:    $('#logCount'),
    totalCal: $('#totalCal'),
    totalPro: $('#totalPro'),
    totalCar: $('#totalCar'),
    totalFat: $('#totalFat'),
    clearBtn: $('#clearLogBtn'),
    shareBtn: $('#shareTodayBtn'),
    rings: {
      cal: { progress: $('#ringCal'), value: $('#ringCalVal'), goalEl: $('#ringCalGoal'), percent: $('#ringCalPct') },
      pro: { progress: $('#ringPro'), value: $('#ringProVal'), goalEl: $('#ringProGoal'), percent: $('#ringProPct') },
      car: { progress: $('#ringCar'), value: $('#ringCarVal'), goalEl: $('#ringCarGoal'), percent: $('#ringCarPct') },
      fat: { progress: $('#ringFat'), value: $('#ringFatVal'), goalEl: $('#ringFatGoal'), percent: $('#ringFatPct') }
    }
  };

  Object.values(dom.rings).forEach((r) => {
    r.progress.setAttribute('stroke-dasharray', RING_CIRC);
    r.progress.setAttribute('stroke-dashoffset', RING_CIRC);
  });

  /* Bus: mode.js triggers tracker refreshes without a static import cycle */
  on('tracker:update', updateTracker);
  on('state:replaced', updateTracker);

  bindEvents();
  updateTracker();
}
