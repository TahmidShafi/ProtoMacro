/* ============================================================
   ProtoMacro — dashboard.js
   The "Today" screen: the main daily-use surface.
   Shows calories/macros, recovery, mode, completion score and
   quick actions. Updates reactively via the event bus.
   ============================================================ */
import { $, escapeHtml, animateNumber } from './utils.js';import { STATE } from './state.js';
import { MODES } from './mode.js';
import { getTrackerTotals } from './tracker.js';
import { computeDailyScore } from './core/metrics.js';
import { formatWater, weightUnit, formatWeight } from './core/format.js';
import { today } from './datetime.js';
import { on } from './core/bus.js';
import { addToTracker } from './tracker.js';
import { formModal, openModal } from './core/modal.js';

let dom = null;
const R = 34;
const CIRC = 2 * Math.PI * R;

const ringSvg = (pct, color) => `
  <svg viewBox="0 0 80 80" width="80" height="80" aria-hidden="true">
    <circle cx="40" cy="40" r="${R}" fill="none" stroke="var(--ring-track)" stroke-width="7"/>
    <circle cx="40" cy="40" r="${R}" fill="none" stroke="${color}" stroke-width="7"
      stroke-linecap="round" stroke-dasharray="${CIRC}" stroke-dashoffset="${CIRC * (1 - Math.min(1, pct))}"/>
  </svg>
`;

const renderMacroRings = (totals) => {
  const g = STATE.goals;
  const macros = [
    { label: 'Protein', val: totals.pro, goal: g.protein, color: 'var(--protein)', key: 'pro' },
    { label: 'Carbs',   val: totals.car, goal: g.carbs,   color: 'var(--carbs)',   key: 'car' },
    { label: 'Fat',     val: totals.fat, goal: g.fat,     color: 'var(--fat)',     key: 'fat' }
  ];

  /* update-in-place: build once, then mutate dashoffsets + text
     (avoids re-running the enter animation on every log change) */
  if (!dom.macroRings.children.length) {
    dom.macroRings.innerHTML = macros.map((m) => `
      <div class="progress-ring-card mini">
        <div class="ring-wrap mini-ring-svg">
          <svg viewBox="0 0 80 80" width="80" height="80" aria-hidden="true">
            <circle cx="40" cy="40" r="${R}" fill="none" stroke="var(--ring-track)" stroke-width="7"/>
            <circle class="ring-arc" data-arc="${m.key}" cx="40" cy="40" r="${R}" fill="none" stroke="${m.color}" stroke-width="7"
              stroke-linecap="round" stroke-dasharray="${CIRC}" stroke-dashoffset="${CIRC}"/>
          </svg>
          <div class="ring-inner" style="width:80px;height:80px;">
            <div class="ring-val" style="font-size:var(--text-sm);" data-val="${m.key}">0g</div>
          </div>
        </div>
        <div class="ring-label" style="font-size:var(--text-xs);">${m.label}</div>
        <div class="ring-percent" style="font-size:var(--text-xs);" data-pct="${m.key}">0%</div>
      </div>
    `).join('');
  }

  for (const m of macros) {
    const pct = m.goal > 0 ? m.val / m.goal : 0;
    dom.macroRings.querySelector(`[data-arc="${m.key}"]`)
      .style.strokeDashoffset = CIRC * (1 - Math.min(1, pct));
    dom.macroRings.querySelector(`[data-val="${m.key}"]`).textContent = `${Math.round(m.val)}g`;
    dom.macroRings.querySelector(`[data-pct="${m.key}"]`).textContent = `${Math.round(pct * 100)}%`;
  }
};

const renderScore = (totals, score) => {
  const b = score.breakdown;
  const color = score.score >= 80 ? 'var(--primary)' : score.score >= 40 ? 'var(--warning)' : 'var(--danger)';
  const prevPct = dom.scoreWrap.querySelector('.today-score-pct');

  /* animate the big number smoothly when it changes; the ring arc
     and breakdown re-render inline */
  if (prevPct && +prevPct.textContent === score.score) {
    /* unchanged — skip re-render entirely */
    return;
  }

  dom.scoreWrap.innerHTML = `
    <div class="today-score-ring">
      ${ringSvg(score.score / 100, color)}
      <div class="today-score-pct" style="color:${color}">${prevPct ? prevPct.textContent : '0'}</div>
    </div>
    <div class="score-breakdown" role="list" aria-label="Score breakdown">
      <div class="score-breakdown-row" role="listitem"><span>Calories within ±10% (40)</span><span class="earned">${b.calories}/40</span></div>
      <div class="score-breakdown-row" role="listitem"><span>Protein ≥ 90% (30)</span><span class="earned">${b.protein}/30</span></div>
      <div class="score-breakdown-row" role="listitem"><span>Water ≥ 80% (15)</span><span class="earned">${b.water}/15</span></div>
      <div class="score-breakdown-row" role="listitem"><span>Logged 3+ items (15)</span><span class="earned">${b.logging}/15</span></div>
    </div>
  `;
  animateNumber($('.today-score-pct', dom.scoreWrap), score.score, 600);
};

const renderRecovery = () => {
  const w = STATE.water;
  const waterPct = Math.min(100, (w.consumed / Math.max(1, w.goal)) * 100);
  const suppDone = Object.values(STATE.supplements.checked).filter(Boolean).length;
  const suppTotal = STATE.supplements.list.length || 7;
  const sleepToday = STATE.sleepLog.find((s) => s.date === today());

  dom.recoveryRows.innerHTML = `
    <div class="today-mini-row">
      💧 <span>Water</span>
      <span class="mini-progress"><span class="mini-fill" style="width:${waterPct}%"></span></span>
      <strong>${formatWater(w.consumed, STATE.settings.units)}</strong>
    </div>
    <div class="today-mini-row">
      💊 <span>Supplements</span>
      <span class="mini-progress"><span class="mini-fill" style="width:${(suppDone / suppTotal) * 100}%"></span></span>
      <strong>${suppDone}/${suppTotal}</strong>
    </div>
    <div class="today-mini-row">
      🛏️ <span>Sleep</span>
      <span style="flex:1"></span>
      <strong>${sleepToday ? sleepToday.hours + 'h' : '—'}</strong>
    </div>
  `;
};

const renderRecents = () => {
  const items = STATE.recents.slice(0, 4);
  if (!items.length) return;
  const resolve = (r) => {
    const byId = (db) => db.find((f) => f.id === r.id);
    return byId(STATE.customFoods) || byId(window.__FOODS_DB__ || []);
  };
  const rows = items
    .map((r) => resolve(r))
    .filter(Boolean)
    .slice(0, 4);

  if (!rows.length) return;
  dom.recents.innerHTML = rows.map((f) => `
    <div class="food-row">
      <span class="food-row-name">${escapeHtml(f.name)}</span>
      <span class="food-row-macros">${f.calories} kcal · ${f.protein}g P /100g</span>
      <button class="btn btn-ghost btn-sm" data-recent-add="${escapeHtml(f.id)}">+ Log</button>
    </div>
  `).join('');
};

const render = () => {
  if (!dom) return;
  const totals = getTrackerTotals();
  const goal = STATE.goals.calories;
  const mode = MODES[STATE.mode] || MODES.maintain;

  dom.date.textContent = new Date().toLocaleDateString(undefined, {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
  });
  dom.modeChip.textContent = `${mode.emoji} ${mode.label} · ${goal.toLocaleString()} kcal`;
  animateNumber(dom.calConsumed, Math.round(totals.cal), 500);
  dom.calGoal.textContent = goal.toLocaleString();
  dom.calRemaining.textContent = Math.max(0, Math.round(goal - totals.cal)).toLocaleString();

  renderMacroRings(totals);

  const score = computeDailyScore({
    calories: totals.cal,
    protein: totals.pro,
    items: STATE.log.length,
    water: STATE.water.consumed,
    goals: { ...STATE.goals, water: STATE.water.goal }
  });
  renderScore(totals, score);
  renderRecovery();
  renderRecents();
};

/* ---------------- quick actions ---------------- */

const quickWeight = async () => {
  const units = STATE.settings.units;
  const values = await formModal({
    title: 'Log today\'s weight',
    fields: [
      { id: 'weight', label: `Weight (${weightUnit(units)})`, type: 'number', min: 25, max: 350, step: 0.1, placeholder: 'e.g. 72.5' },
      { id: 'goal', label: `Goal weight (${weightUnit(units)}) — optional, saved as your target`, type: 'number', min: 25, max: 350, step: 0.1, placeholder: 'e.g. 68' }
    ],
    submitLabel: 'Log'
  });
  if (!values) return;
  const { parseWeightToKg } = await import('./core/format.js');
  const kg = parseWeightToKg(values.weight, units);
  if (!kg || kg < 25 || kg > 350) return;
  const t = today();
  const idx = STATE.weightLog.findIndex((x) => x.date === t);
  if (idx >= 0) STATE.weightLog[idx].weight = kg;
  else STATE.weightLog.push({ date: t, weight: kg });
  STATE.weightLog.sort((a, b) => a.date.localeCompare(b.date));
  if (values.goal) STATE.goalWeight = parseWeightToKg(values.goal, units);
  saveAndRefresh();
  render();
};

const saveAndRefresh = async () => {
  const { saveState } = await import('./state.js');
  saveState();
};

const bindQuick = () => {
  dom.section.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-quick]');
    if (!btn) return;
    const action = btn.dataset.quick;
    if (action === 'food' || action === 'plan') {
      document.getElementById(action === 'food' ? 'search' : 'planner')
        ?.scrollIntoView({ behavior: 'smooth' });
    } else if (action === 'water') {
      document.getElementById('recovery')?.scrollIntoView({ behavior: 'smooth' });
    } else if (action === 'weight') {
      quickWeight();
    } else if (action === 'workout') {
      document.getElementById('workouts')?.scrollIntoView({ behavior: 'smooth' });
    }
  });

  dom.section.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-recent-add]');
    if (!btn) return;
    const id = btn.dataset.recentAdd;
    const food = STATE.customFoods.find((f) => f.id === id)
      || (window.__FOODS_DB__ || []).find((f) => f.id === id);
    if (food) addToTracker(food);
  });
};

export function initDashboard() {
  dom = {
    section: $('#today'),
    date: $('#todayDate'),
    modeChip: $('#todayModeChip'),
    calConsumed: $('#todayCalConsumed'),
    calGoal: $('#todayCalGoal'),
    calRemaining: $('#todayCalRemaining'),
    macroRings: $('#todayMacroRings'),
    scoreWrap: $('#todayScoreWrap'),
    recoveryRows: $('#todayRecoveryRows'),
    recents: $('#todayRecents')
  };
  if (!dom.section) return;

  bindQuick();
  on('dashboard:update', render);
  on('tracker:update', render);
  on('goals:applied', render);
  on('state:replaced', render);
  render();
}
