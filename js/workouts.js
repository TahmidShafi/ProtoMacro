/* ============================================================
   ProtoMacro — workouts.js
   Training log: exercise → sets (weight × reps).
   Computes volume, estimated 1RM (Epley), personal records,
   plus e1RM trend / weekly volume / frequency charts.
   ============================================================ */
import Chart from 'chart.js/auto';
import { $, escapeHtml, icon, makeId, toast, num, clamp } from './utils.js';
import { STATE, saveState } from './state.js';
import { on } from './core/bus.js';
import { epley1RM, trainingVolume } from './core/metrics.js';
import { toDateStr, today } from './datetime.js';

let dom = null;
let pendingSets = [];
let charts = {};

const COMMON_EXERCISES = [
  'Squat', 'Bench Press', 'Deadlift', 'Overhead Press', 'Barbell Row',
  'Pull-up', 'Lat Pulldown', 'Incline Bench Press', 'Romanian Deadlift',
  'Leg Press', 'Lunge', 'Dip', 'Bicep Curl', 'Tricep Extension',
  'Cable Row', 'Face Pull', 'Hip Thrust', 'Calf Raise'
];

const COLORS = {
  grid: 'rgba(255,255,255,0.06)',
  text: '#8A9691',
  primary: '#00C853',
  info: '#4FC3F7',
  warning: '#FFB648'
};

/* ---------------- form / sets ---------------- */

const renderSetsPreview = () => {
  dom.setsPreview.innerHTML = pendingSets.map((s, i) => `
    <span class="set-chip">${s.weight}kg × ${s.reps}
      <button type="button" data-remove-set="${i}" aria-label="Remove set">✕</button>
    </span>
  `).join('') || '<span class="entity-sub">No sets yet — add weight + reps, then "Add Set".</span>';
};

const addSet = () => {
  const w = num(dom.weight.value);
  const r = num(dom.reps.value);
  if (!w || w <= 0) return toast('Enter the weight used.', 'error');
  if (!r || r < 1) return toast('Enter the rep count.', 'error');
  pendingSets.push({ weight: clamp(w, 0, 1000), reps: clamp(r, 1, 50) });
  dom.weight.value = '';
  dom.reps.value = '';
  dom.name.focus();
  renderSetsPreview();
};

const saveWorkout = () => {
  if (!pendingSets.length) return toast('Add at least one set.', 'error');
  const name = dom.name.value.trim();
  if (!name) return toast('Enter the exercise name.', 'error');

  STATE.workouts.push({
    id: makeId(),
    date: today(),
    name,
    notes: '',
    exercises: [{ name, sets: pendingSets }]
  });
  if (STATE.workouts.length > 365) STATE.workouts = STATE.workouts.slice(-365);
  saveState();
  pendingSets = [];
  dom.name.value = '';
  renderSetsPreview();
  renderAll();
  toast('Workout saved', 'success');
};

/* ---------------- analysis ---------------- */

const exerciseHistory = (name) => {
  const entries = [];
  for (const w of STATE.workouts) {
    for (const ex of w.exercises) {
      if (ex.name.toLowerCase() !== name.toLowerCase()) continue;
      const best = ex.sets.reduce((m, s) => Math.max(m, epley1RM(s.weight, s.reps)), 0);
      if (best > 0) entries.push({ date: w.date, e1rm: best, sets: ex.sets });
    }
  }
  return entries.sort((a, b) => a.date.localeCompare(b.date));
};

const personalRecords = () => {
  const prs = new Map();
  for (const w of STATE.workouts) {
    for (const ex of w.exercises) {
      const best = ex.sets.reduce((m, s) => Math.max(m, epley1RM(s.weight, s.reps)), 0);
      if (best <= 0) continue;
      const cur = prs.get(ex.name);
      if (!cur || best > cur.e1rm) prs.set(ex.name, { e1rm: best, date: w.date });
    }
  }
  return [...prs.entries()].sort((a, b) => b[1].e1rm - a[1].e1rm);
};

const e1rmTrend = () => {
  /* best estimated 1RM per day across all exercises (top lift) */
  const byDate = new Map();
  for (const w of STATE.workouts) {
    for (const ex of w.exercises) {
      const best = ex.sets.reduce((m, s) => Math.max(m, epley1RM(s.weight, s.reps)), 0);
      if (best > (byDate.get(w.date) ?? 0)) byDate.set(w.date, best);
    }
  }
  return [...byDate.entries()].sort((a, b) => a[0].localeCompare(b[0]));
};

const weeklyVolume = () => {
  const weeks = new Map();
  for (const w of STATE.workouts) {
    const d = new Date(w.date + 'T00:00:00');
    const monday = new Date(d);
    monday.setDate(d.getDate() - d.getDay() + (d.getDay() === 0 ? -6 : 1));
    const key = toDateStr(monday);
    weeks.set(key, (weeks.get(key) || 0) + trainingVolume(w.exercises.flatMap((e) => e.sets)));
  }
  return [...weeks.entries()].sort((a, b) => a[0].localeCompare(b[0])).slice(-12);
};

/* ---------------- charts ---------------- */

const ensureChart = (id, ctx, config) => {
  if (charts[id]) {
    charts[id].data = config.data;
    charts[id].options = config.options;
    charts[id].update();
    return;
  }
  charts[id] = new Chart(ctx, config);
};

const renderCharts = () => {
  const e1 = e1rmTrend();
  if (dom.chartE1rm) {
    ensureChart('e1rm', dom.chartE1rm, {
      type: 'line',
      data: {
        labels: e1.map(([d]) => d.slice(5)),
        datasets: [{
          label: 'Best e1RM (kg)', data: e1.map(([, v]) => +v.toFixed(1)),
          borderColor: COLORS.primary, backgroundColor: 'rgba(0,200,83,0.12)',
          fill: true, tension: 0.35, pointRadius: 3
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false }, title: { display: true, text: 'Estimated 1RM trend', color: '#F1F5F2' } },
        scales: { x: { grid: { display: false } }, y: { beginAtZero: true, grid: { color: COLORS.grid } } }
      }
    });
  }

  const vol = weeklyVolume();
  if (dom.chartVolume) {
    ensureChart('volume', dom.chartVolume, {
      type: 'bar',
      data: {
        labels: vol.map(([d]) => d.slice(5)),
        datasets: [{
          label: 'Weekly volume (kg)', data: vol.map(([, v]) => v),
          backgroundColor: COLORS.info, borderRadius: 6
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false }, title: { display: true, text: 'Training volume by week', color: '#F1F5F2' } },
        scales: { x: { grid: { display: false } }, y: { beginAtZero: true, grid: { color: COLORS.grid } } }
      }
    });
  }
};

/* ---------------- render ---------------- */

const renderHistory = () => {
  const workouts = [...STATE.workouts].sort((a, b) => b.date.localeCompare(a.date));
  dom.count.textContent = workouts.length
    ? `${workouts.length} workout${workouts.length === 1 ? '' : 's'} logged`
    : 'No workouts yet';

  dom.history.innerHTML = workouts.slice(0, 30).map((w) => {
    const rows = w.exercises.map((ex) => {
      const vol = trainingVolume(ex.sets);
      const best = ex.sets.reduce((m, s) => Math.max(m, epley1RM(s.weight, s.reps)), 0);
      const isPR = personalRecords().some(([n, p]) => n === ex.name && Math.abs(p.e1rm - best) < 0.01);
      return `
        <div class="workout-exercise-row">
          <span><strong>${escapeHtml(ex.name)}</strong>${isPR ? '<span class="pr-badge">PR</span>' : ''}
            <small style="color:var(--text-muted)"> · ${ex.sets.map((s) => `${s.weight}×${s.reps}`).join(', ')}</small>
          </span>
          <span>${Math.round(vol)} kg · e1RM ${best.toFixed(0)}</span>
        </div>
      `;
    }).join('');
    return `
      <div class="workout-day-card">
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <strong>${escapeHtml(w.name)}</strong>
          <span class="entity-sub">${w.date} · <button class="icon-btn danger" data-wo-del="${w.id}" aria-label="Delete workout" style="width:26px;height:26px;">${icon('trash', 12)}</button></span>
        </div>
        ${rows}
      </div>
    `;
  }).join('') || '<div class="log-empty">No workouts logged yet.</div>';

  const prs = personalRecords();
  dom.prList.innerHTML = prs.length
    ? prs.slice(0, 8).map(([name, p]) => `
        <div class="food-row">
          <span class="food-row-name">${escapeHtml(name)}</span>
          <span class="food-row-macros">${p.e1rm.toFixed(0)} kg · ${p.date}</span>
        </div>
      `).join('')
    : '<div class="entity-sub">PRs appear here as you log workouts.</div>';

  const names = [...new Set(STATE.workouts.flatMap((w) => w.exercises.map((e) => e.name)))];
  dom.datalist.innerHTML = names.map((n) => `<option value="${escapeHtml(n)}">`).join('');
};

const renderAll = () => {
  renderHistory();
  renderCharts();
};

/* ---------------- init ---------------- */

export function initWorkouts() {
  const section = $('#workouts');
  if (!section) return;
  dom = {
    section,
    name: $('#woName'),
    weight: $('#woWeight'),
    reps: $('#woReps'),
    setsPreview: $('#woSetsPreview'),
    saveBtn: $('#woSaveBtn'),
    addSetBtn: $('#woAddSetBtn'),
    history: $('#woHistory'),
    count: $('#woCount'),
    prList: $('#prList'),
    datalist: $('#woExerciseList'),
    chartE1rm: $('#chartE1rm'),
    chartVolume: $('#chartVolume')
  };

  dom.datalist.innerHTML = COMMON_EXERCISES.map((n) => `<option value="${n}">`).join('');
  dom.addSetBtn.addEventListener('click', addSet);
  dom.saveBtn.addEventListener('click', saveWorkout);
  dom.reps.addEventListener('keydown', (e) => { if (e.key === 'Enter') addSet(); });
  dom.section.addEventListener('click', (e) => {
    const rm = e.target.closest('[data-remove-set]');
    if (rm) {
      pendingSets.splice(parseInt(rm.dataset.removeSet, 10), 1);
      renderSetsPreview();
      return;
    }
    const del = e.target.closest('[data-wo-del]');
    if (del) {
      STATE.workouts = STATE.workouts.filter((w) => w.id !== del.dataset.woDel);
      saveState();
      renderAll();
      toast('Workout deleted', 'info');
    }
  });

  on('state:replaced', renderAll);
  renderSetsPreview();
  renderAll();
}
