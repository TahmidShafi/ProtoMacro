/* ============================================================
   ProtoMacro — progress.js
   Weekly analytics dashboard (Chart.js, bundled locally).
   v2: charts update in place (no destroy/recreate churn),
   weight stats row (start/current/goal/weekly/monthly/total),
   7-day moving-average trend alongside actual readings,
   weekly review + history calendar panels.
   ============================================================ */
import Chart from 'chart.js/auto';
import { $, toast, num, clamp } from './utils.js';
import { STATE, saveState } from './state.js';
import { today, toDateStr } from './datetime.js';
import { exportWeeklyPdf } from './share.js';
import { macroConsistency, weightStats } from './core/metrics.js';
import { weightUnit, formatWeight, parseWeightToKg } from './core/format.js';
import { renderWeeklyReview, initWeeklyReview } from './weekly-review.js';
import { initCalendar } from './calendar.js';
import { on } from './core/bus.js';

const DOW = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
const COLORS = {
  protein: '#FF6B9D',
  carbs:   '#FFB648',
  fat:     '#4FC3F7',
  grid:    'rgba(255,255,255,0.06)',
  text:    '#8A9691',
  good:    '#00C853'
};

const charts = {}; /* active Chart.js instances, indexed by id */

const applyChartDefaults = () => {
  Chart.defaults.color = COLORS.text;
  Chart.defaults.font.family = "'Inter', -apple-system, sans-serif";
  Chart.defaults.borderColor = COLORS.grid;
  Chart.defaults.plugins.legend.labels.color = COLORS.text;
  Chart.defaults.plugins.legend.labels.boxWidth = 12;
  Chart.defaults.plugins.legend.labels.usePointStyle = true;
  Chart.defaults.plugins.tooltip.backgroundColor = 'rgba(10, 14, 12, 0.92)';
  Chart.defaults.plugins.tooltip.titleColor = '#F1F5F2';
  Chart.defaults.plugins.tooltip.bodyColor = '#C9D4CE';
  Chart.defaults.plugins.tooltip.padding = 10;
  Chart.defaults.plugins.tooltip.cornerRadius = 8;
  Chart.defaults.plugins.tooltip.displayColors = false;
  /* charts stay quiet for reduced-motion users */
  Chart.defaults.animation = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    ? false
    : { duration: 400, easing: 'easeOutQuart' };
};

/* =========================================================
   Helpers
   ========================================================= */
const last7Days = () => {
  const days = [];
  const now = new Date();
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(now.getDate() - i);
    days.push({ date: toDateStr(d), label: DOW[d.getDay()] });
  }
  return days;
};

const last30Days = () => {
  const days = [];
  const now = new Date();
  for (let i = 29; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(now.getDate() - i);
    days.push(toDateStr(d));
  }
  return days;
};

const findHistory = (date) => STATE.history.find((h) => h.date === date);

/* Update-in-place chart helper (perf fix: no destroy/recreate churn) */
const ensureChart = (id, ctx, config) => {
  if (charts[id]) {
    charts[id].data = config.data;
    charts[id].options = config.options;
    charts[id].update();
    return charts[id];
  }
  charts[id] = new Chart(ctx, config);
  return charts[id];
};

/* Scoped target-line plugin — registered once, idempotent */
let goalLineRegistered = false;
const registerGoalLine = () => {
  if (goalLineRegistered) return;
  goalLineRegistered = true;
  Chart.register({
    id: 'mmGoalLine',
    afterDatasetsDraw(chart) {
      const g = chart.options.plugins?.mmGoalLine?.goal;
      if (!g) return;
      const { ctx: c, chartArea: area, scales } = chart;
      if (!scales.y || !chart.chartArea) return;
      const y = scales.y.getPixelForValue(g);
      c.save();
      c.strokeStyle = 'rgba(0,200,83,0.6)';
      c.setLineDash([6, 6]);
      c.lineWidth = 2;
      c.beginPath();
      c.moveTo(area.left, y);
      c.lineTo(area.right, y);
      c.stroke();
      c.fillStyle = 'rgba(0,200,83,0.9)';
      c.font = '600 11px Inter';
      c.fillText(`Target: ${g} kcal`, area.left + 6, y - 4);
      c.restore();
    }
  });
};

/* =========================================================
   CHART 1 — Daily Calories (bar)
   ========================================================= */
const renderCaloriesChart = () => {
  const ctx = $('#chartCalories');
  if (!ctx) return;
  registerGoalLine();

  const days  = last7Days();
  const goal  = STATE.goals.calories;
  const data  = days.map((d) => {
    const h = findHistory(d.date);
    return h && (h.items ?? 1) > 0 ? h.calories : 0;
  });

  const colors = data.map((v) => {
    if (v === 0) return 'rgba(255,255,255,0.08)';
    const diff = v - goal;
    if (diff > 100)  return COLORS.protein;
    if (diff < -200) return COLORS.carbs;
    return COLORS.good;
  });

  ensureChart('cal', ctx, {
    type: 'bar',
    data: {
      labels: days.map((d) => d.label),
      datasets: [{ label: 'Calories', data, backgroundColor: colors, borderRadius: 8, borderWidth: 0 }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        title:  { display: true, text: 'Weekly Calorie Intake', color: '#F1F5F2', font: { size: 15, weight: '600' } },
        tooltip: { callbacks: { label: (c) => `${c.raw} / ${goal} kcal` } },
        mmGoalLine: { goal }
      },
      scales: {
        x: { grid: { display: false } },
        y: {
          beginAtZero: true,
          suggestedMax: Math.max(goal + 500, Math.max(...data) + 200),
          grid: { color: COLORS.grid }
        }
      }
    }
  });
};

/* =========================================================
   CHART 2 — Macro Breakdown (stacked bar)
   ========================================================= */
const renderMacroChart = () => {
  const ctx = $('#chartMacros');
  if (!ctx) return;

  const days = last7Days();
  const val = (key) => days.map((d) => {
    const h = findHistory(d.date);
    return h && (h.items ?? 1) > 0 ? (h[key] ?? 0) : 0;
  });

  ensureChart('mac', ctx, {
    type: 'bar',
    data: {
      labels: days.map((d) => d.label),
      datasets: [
        { label: 'Protein', data: val('protein'), backgroundColor: COLORS.protein, borderRadius: 6, stack: 'm' },
        { label: 'Carbs',   data: val('carbs'),   backgroundColor: COLORS.carbs,   borderRadius: 6, stack: 'm' },
        { label: 'Fat',     data: val('fat'),     backgroundColor: COLORS.fat,     borderRadius: 6, stack: 'm' }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: 'bottom', labels: { boxWidth: 12, padding: 14 } },
        title:  { display: true, text: 'Daily Macro Breakdown (g)', color: '#F1F5F2', font: { size: 15, weight: '600' } }
      },
      scales: {
        x: { stacked: true, grid: { display: false } },
        y: { stacked: true, beginAtZero: true, grid: { color: COLORS.grid } }
      }
    }
  });
};

/* =========================================================
   CHART 3 — Weekly Average Doughnuts
   ========================================================= */
const renderDoughnut = (id, label, value, goal, color) => {
  const ctx = $('#' + id);
  if (!ctx) return;
  const pct = goal > 0 ? Math.min(100, (value / goal) * 100) : 0;

  ensureChart(id, ctx, {
    type: 'doughnut',
    data: {
      datasets: [{
        data: [pct, 100 - pct],
        backgroundColor: [color, 'rgba(255,255,255,0.06)'],
        borderWidth: 0,
        cutout: '72%'
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: { enabled: false } }
    }
  });
  const labelEl = $(`#${id}-center`);
  if (labelEl) labelEl.innerHTML = `<div class="dough-pct">${Math.round(pct)}%</div><div class="dough-label">${label}</div><div class="dough-sub">${value.toFixed(0)} / ${goal}g</div>`;
};

const renderAverages = () => {
  const days = last7Days();
  const rows = days.map((d) => findHistory(d.date)).filter((h) => h && (h.items ?? 1) > 0);
  const avg = (key) => rows.length ? rows.reduce((s, r) => s + (r[key] || 0), 0) / rows.length : 0;
  const goals = STATE.goals;

  renderDoughnut('doughProtein', 'Avg Protein', avg('protein'), goals.protein, COLORS.protein);
  renderDoughnut('doughCarbs',   'Avg Carbs',   avg('carbs'),   goals.carbs,   COLORS.carbs);
  renderDoughnut('doughFat',     'Avg Fat',     avg('fat'),     goals.fat,     COLORS.fat);
};

/* =========================================================
   CHART 4 — Body Weight: actual + 7-day moving average
   ========================================================= */
const renderWeightChart = () => {
  const ctx = $('#chartWeight');
  if (!ctx) return;

  const units = STATE.settings.units;
  const dates = last30Days();
  const byDate = new Map(STATE.weightLog.map((w) => [w.date, w.weight]));

  let last = null;
  const series = dates.map((d) => {
    if (byDate.has(d)) last = byDate.get(d);
    return last;
  });

  /* 7-day moving average over actual readings, forward-filled */
  const readings = [...STATE.weightLog].sort((a, b) => a.date.localeCompare(b.date));
  const ma = [];
  for (let i = 0; i < readings.length; i++) {
    const slice = readings.slice(Math.max(0, i - 6), i + 1);
    ma.push(slice.reduce((s, r) => s + r.weight, 0) / slice.length);
  }
  const maByDate = new Map(readings.map((r, i) => [r.date, ma[i]]));
  let lastMa = null;
  const trendSeries = dates.map((d) => {
    if (maByDate.has(d)) lastMa = maByDate.get(d);
    return lastMa;
  });

  const toDisplay = (v) => (v === null ? null : +(weightUnit(units) === 'lb' ? v / 0.45359237 : v).toFixed(1));

  ensureChart('wt', ctx, {
    type: 'line',
    data: {
      labels: dates.map((d) => d.slice(5)),
      datasets: [
        {
          label: `Weight (${weightUnit(units)})`,
          data: series.map(toDisplay),
          borderColor: COLORS.good,
          backgroundColor: 'rgba(0,200,83,0.12)',
          fill: true,
          tension: 0.35,
          spanGaps: true,
          pointRadius: 3,
          pointBackgroundColor: COLORS.good
        },
        {
          label: '7-day trend',
          data: trendSeries.map(toDisplay),
          borderColor: COLORS.fat,
          borderDash: [5, 5],
          fill: false,
          tension: 0.4,
          spanGaps: true,
          pointRadius: 0
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: 'bottom', labels: { boxWidth: 12 } },
        title:  { display: true, text: `Body Weight — last 30 days (${weightUnit(units)})`, color: '#F1F5F2', font: { size: 15, weight: '600' } }
      },
      scales: {
        x: { grid: { display: false }, ticks: { maxRotation: 0, autoSkip: true, maxTicksLimit: 10 } },
        y: { grid: { color: COLORS.grid } }
      }
    }
  });

  renderWeightStats();
};

/* Stats row: start/current/goal/weekly/monthly/total */
const renderWeightStats = () => {
  const el = $('#weightStatsRow');
  if (!el) return;
  const units = STATE.settings.units;
  const s = weightStats(STATE.weightLog, { goalWeight: STATE.goalWeight });

  const cell = (val, label, signed = false) => {
    const shown = val === null || val === undefined
      ? '—'
      : `${signed && val > 0 ? '+' : ''}${formatWeight(Math.abs(val) !== val && signed ? Math.abs(val) : Math.abs(val), units)}${signed ? (val > 0 ? ' ↑' : val < 0 ? ' ↓' : ' →') : ''}`;
    return `<div class="review-stat"><div class="review-stat-val">${shown}</div><div class="review-stat-label">${label}</div></div>`;
  };

  el.innerHTML = [
    cell(s.start, 'Starting weight'),
    cell(s.current, 'Current weight'),
    cell(s.goal, 'Goal weight'),
    cell(s.weekly, 'Weekly change', true),
    cell(s.monthly, 'Monthly change', true),
    cell(s.total, 'Total change', true)
  ].join('');

  const ann = $('#weightDelta');
  if (ann) {
    if (s.current === null) {
      ann.className = 'weight-delta weight-delta-flat';
      ann.textContent = 'Log your first weight to see trends.';
    } else if (s.weekly !== null) {
      const arr = s.weekly > 0 ? '↑' : s.weekly < 0 ? '↓' : '→';
      ann.className = `weight-delta weight-delta-${s.weekly > 0 ? 'up' : s.weekly < 0 ? 'down' : 'flat'}`;
      ann.textContent = `${arr} ${formatWeight(Math.abs(s.weekly), units)} this week (trend line filters daily noise)`;
    } else {
      ann.className = 'weight-delta weight-delta-flat';
      ann.textContent = `Latest: ${formatWeight(s.current, units)}`;
    }
  }
};

/* =========================================================
   CONSISTENCY SCORE (uses shared metrics.js logic)
   ========================================================= */
const renderConsistency = () => {
  const el = $('#consistencyScore');
  if (!el) return;

  const days = last7Days().map((d) => findHistory(d.date));
  const { hits, tracked, pct } = macroConsistency(days, STATE.goals);

  let color = 'var(--danger)';
  let emoji = '💤';
  if (pct >= 70) { color = 'var(--primary)'; emoji = '🔥'; }
  else if (pct >= 50) { color = 'var(--warning)'; emoji = '💪'; }

  const circ = 2 * Math.PI * 54;
  const offset = circ * (1 - pct / 100);

  el.innerHTML = `
    <div class="consistency-ring-wrap">
      <svg viewBox="0 0 120 120" class="consistency-svg" role="img" aria-label="Macro consistency ${pct} percent">
        <circle cx="60" cy="60" r="54" fill="none" stroke="var(--ring-track)" stroke-width="10"/>
        <circle cx="60" cy="60" r="54" fill="none" stroke="${color}" stroke-width="10"
          stroke-linecap="round" stroke-dasharray="${circ}" stroke-dashoffset="${offset}"
          transform="rotate(-90 60 60)"/>
      </svg>
      <div class="consistency-inner">
        <div class="consistency-pct" style="color:${color}">${pct}%</div>
        <div class="consistency-sub">${hits}/${tracked || 7} days</div>
      </div>
    </div>
    <div class="consistency-text">
      <div class="consistency-title">${emoji} Macro consistency</div>
      <div class="consistency-body">Hit all 3 macro targets within 10% on <strong>${hits} of ${tracked || 7}</strong> tracked days this week.</div>
    </div>
  `;
};

/* =========================================================
   Weight log input (unit-aware)
   ========================================================= */
const bindWeight = () => {
  const input = $('#weightInput');
  const btn   = $('#logWeightBtn');
  if (!btn || !input) return;
  btn.addEventListener('click', () => {
    const kg = parseWeightToKg(input.value, STATE.settings.units);
    if (kg === null || kg < 25 || kg > 350) {
      return toast(`Enter a weight between 25 and 350 ${weightUnit(STATE.settings.units)}.`, 'error');
    }
    const t = today();
    const idx = STATE.weightLog.findIndex((x) => x.date === t);
    if (idx >= 0) STATE.weightLog[idx].weight = kg;
    else STATE.weightLog.push({ date: t, weight: kg });
    if (STATE.weightLog.length > 365) STATE.weightLog = STATE.weightLog.slice(-365);
    STATE.weightLog.sort((a, b) => a.date.localeCompare(b.date));
    saveState();
    input.value = '';
    toast('Weight logged', 'success');
    renderProgress();
  });
};

/* =========================================================
   PUBLIC
   ========================================================= */
export function renderProgress() {
  applyChartDefaults();
  renderCaloriesChart();
  renderMacroChart();
  renderAverages();
  renderWeightChart();
  renderConsistency();
  renderWeeklyReview();
}

export function initProgress() {
  if (!$('#progress')) return;
  initWeeklyReview();
  initCalendar();
  bindWeight();

  $('#exportPdfBtn')?.addEventListener('click', () => exportWeeklyPdf());

  renderProgress();

  /* Re-render when visible, but charts now update in place. */
  const section = $('#progress');
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) if (e.isIntersecting) renderProgress();
  }, { threshold: 0.15 });
  io.observe(section);

  on('state:replaced', renderProgress);
}
