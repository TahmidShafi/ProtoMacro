/* ============================================================
   ProtoMacro — progress.js
   Weekly analytics dashboard using Chart.js (bundled locally).
   Charts: daily calories, macro breakdown, weekly averages,
           weight trend, consistency score.
   ============================================================ */
import Chart from 'chart.js/auto';
import { $, toast } from './utils.js';
import { STATE, saveState } from './state.js';
import { today, toDateStr } from './datetime.js';
import { exportWeeklyPdf } from './share.js';

const DOW = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
const COLORS = {
  protein: '#FF6B9D',
  carbs:   '#FFB648',
  fat:     '#4FC3F7',
  grid:    'rgba(255,255,255,0.06)',
  text:    '#8A9691'
};

const charts = {}; /* active Chart.js instances, indexed by id */

/* =========================================================
   Chart.js global defaults — configured once
   ========================================================= */
const applyChartDefaults = () => {
  Chart.defaults.color = COLORS.text;
  Chart.defaults.font.family = "'Inter', -apple-system, sans-serif";
  Chart.defaults.borderColor = COLORS.grid;
  Chart.defaults.plugins.legend.labels.color = COLORS.text;
};

const destroyChart = (id) => {
  if (charts[id]) { charts[id].destroy(); delete charts[id]; }
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

/* =========================================================
   CHART 1 — Daily Calories (bar)
   ========================================================= */
const renderCaloriesChart = () => {
  const ctx = $('#chartCalories');
  if (!ctx) return;
  destroyChart('cal');

  const days  = last7Days();
  const goal  = STATE.goals.calories;
  const data  = days.map((d) => findHistory(d.date)?.calories ?? 0);

  const colors = data.map((v) => {
    if (v === 0) return 'rgba(255,255,255,0.08)';
    const diff = v - goal;
    if (diff > 100)  return COLORS.protein;           /* over */
    if (diff < -200) return COLORS.carbs;             /* under */
    return '#00C853';                                 /* on target */
  });

  charts.cal = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: days.map((d) => d.label),
      datasets: [{
        label: 'Calories',
        data,
        backgroundColor: colors,
        borderRadius: 8,
        borderWidth: 0
      }]
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

/* Scoped target-line plugin — only draws on charts that opt in */
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

/* =========================================================
   CHART 2 — Macro Breakdown (stacked bar)
   ========================================================= */
const renderMacroChart = () => {
  const ctx = $('#chartMacros');
  if (!ctx) return;
  destroyChart('mac');

  const days = last7Days();
  const prot = days.map((d) => findHistory(d.date)?.protein ?? 0);
  const carb = days.map((d) => findHistory(d.date)?.carbs   ?? 0);
  const fat  = days.map((d) => findHistory(d.date)?.fat     ?? 0);

  charts.mac = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: days.map((d) => d.label),
      datasets: [
        { label: 'Protein', data: prot, backgroundColor: COLORS.protein, borderRadius: 6, stack: 'm' },
        { label: 'Carbs',   data: carb, backgroundColor: COLORS.carbs,   borderRadius: 6, stack: 'm' },
        { label: 'Fat',     data: fat,  backgroundColor: COLORS.fat,     borderRadius: 6, stack: 'm' }
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
   CHART 3 — Weekly Average Doughnuts (protein/carbs/fat)
   ========================================================= */
const renderDoughnut = (id, label, value, goal, color) => {
  const ctx = $('#' + id);
  if (!ctx) return;
  destroyChart(id);
  const pct = goal > 0 ? Math.min(100, (value / goal) * 100) : 0;
  charts[id] = new Chart(ctx, {
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
      plugins: {
        legend: { display: false },
        tooltip: { enabled: false }
      }
    }
  });
  const labelEl = $(`#${id}-center`);
  if (labelEl) labelEl.innerHTML = `<div class="dough-pct">${Math.round(pct)}%</div><div class="dough-label">${label}</div><div class="dough-sub">${value.toFixed(0)} / ${goal}g</div>`;
};

const renderAverages = () => {
  const days = last7Days();
  const rows = days.map((d) => findHistory(d.date)).filter(Boolean);
  const avg = (key) => rows.length ? rows.reduce((s, r) => s + (r[key] || 0), 0) / rows.length : 0;
  const goals = STATE.goals;

  renderDoughnut('doughProtein', 'Avg Protein', avg('protein'), goals.protein, COLORS.protein);
  renderDoughnut('doughCarbs',   'Avg Carbs',   avg('carbs'),   goals.carbs,   COLORS.carbs);
  renderDoughnut('doughFat',     'Avg Fat',     avg('fat'),     goals.fat,     COLORS.fat);
};

/* =========================================================
   CHART 4 — Body Weight Trend (30 days)
   ========================================================= */
const renderWeightChart = () => {
  const ctx = $('#chartWeight');
  if (!ctx) return;
  destroyChart('wt');

  const dates = last30Days();
  const byDate = new Map(STATE.weightLog.map((w) => [w.date, w.weight]));

  /* Forward-fill: last known value is used until a new reading appears */
  let last = null;
  const series = dates.map((d) => {
    if (byDate.has(d)) last = byDate.get(d);
    return last;
  });

  charts.wt = new Chart(ctx, {
    type: 'line',
    data: {
      labels: dates.map((d) => d.slice(5)),
      datasets: [{
        label: 'Weight (kg)',
        data: series,
        borderColor: '#00C853',
        backgroundColor: 'rgba(0,200,83,0.12)',
        fill: true,
        tension: 0.35,
        spanGaps: true,
        pointRadius: 3,
        pointBackgroundColor: '#00C853'
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        title:  { display: true, text: 'Body Weight — last 30 days', color: '#F1F5F2', font: { size: 15, weight: '600' } }
      },
      scales: {
        x: { grid: { display: false }, ticks: { maxRotation: 0, autoSkip: true, maxTicksLimit: 10 } },
        y: { grid: { color: COLORS.grid } }
      }
    }
  });

  /* Trend annotation (this week delta) */
  const ann = $('#weightDelta');
  if (ann) {
    const weekAgo = new Date(); weekAgo.setDate(weekAgo.getDate() - 7);
    const weekAgoStr = toDateStr(weekAgo);
    const recent  = STATE.weightLog[STATE.weightLog.length - 1];
    const oldish  = [...STATE.weightLog].reverse().find((w) => w.date <= weekAgoStr);
    if (recent && oldish) {
      const diff = recent.weight - oldish.weight;
      const arr = diff > 0 ? '\u2191' : diff < 0 ? '\u2193' : '\u2192';
      const sign = diff > 0 ? '+' : '';
      const cls = diff > 0 ? 'up' : diff < 0 ? 'down' : 'flat';
      ann.className = `weight-delta weight-delta-${cls}`;
      ann.textContent = `${arr} ${sign}${diff.toFixed(1)}kg this week`;
    } else if (recent) {
      ann.className = 'weight-delta weight-delta-flat';
      ann.textContent = `Latest: ${recent.weight}kg on ${recent.date}`;
    } else {
      ann.className = 'weight-delta weight-delta-flat';
      ann.textContent = 'Log your first weight to see trends.';
    }
  }
};

/* =========================================================
   CONSISTENCY SCORE (big circular)
   ========================================================= */
const renderConsistency = () => {
  const el = $('#consistencyScore');
  if (!el) return;

  const days = last7Days();
  const goals = STATE.goals;
  let hits = 0;
  let tracked = 0;

  for (const d of days) {
    const h = findHistory(d.date);
    if (!h) continue;
    tracked++;
    const within = (v, g) => g > 0 ? Math.abs(v - g) / g <= 0.10 : false;
    if (within(h.protein, goals.protein) && within(h.carbs, goals.carbs) && within(h.fat, goals.fat)) {
      hits++;
    }
  }

  const pct = tracked ? Math.round((hits / tracked) * 100) : 0;
  let color = 'var(--danger)';
  let emoji = '\ud83d\udca4';
  if (pct >= 70) { color = 'var(--primary)'; emoji = '\ud83d\udd25'; }
  else if (pct >= 50) { color = 'var(--warning)'; emoji = '\ud83d\udcaa'; }

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
   Weight log input
   ========================================================= */
const bindWeight = () => {
  const input = $('#weightInput');
  const btn   = $('#logWeightBtn');
  if (!btn || !input) return;
  btn.addEventListener('click', () => {
    const wRaw = parseFloat(input.value);
    if (!Number.isFinite(wRaw) || wRaw < 25 || wRaw > 350) {
      return toast('Enter a weight between 25 and 350 kg.', 'error');
    }
    const t = today();
    const idx = STATE.weightLog.findIndex((x) => x.date === t);
    if (idx >= 0) STATE.weightLog[idx].weight = wRaw;
    else STATE.weightLog.push({ date: t, weight: wRaw });
    /* Keep only last 365 */
    if (STATE.weightLog.length > 365) STATE.weightLog = STATE.weightLog.slice(-365);
    /* Keep log sorted by date so "latest" lookups stay correct */
    STATE.weightLog.sort((a, b) => a.date.localeCompare(b.date));
    saveState();
    input.value = '';
    toast(`Logged ${wRaw}kg for today`, 'success');
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
}

export function initProgress() {
  if (!$('#progress')) return;
  bindWeight();

  $('#exportPdfBtn')?.addEventListener('click', () => exportWeeklyPdf());

  /* Chart.js is bundled and imported statically — always available.
     Re-render when Progress tab comes into view (saves work). */
  renderProgress();

  const section = $('#progress');
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) if (e.isIntersecting) renderProgress();
  }, { threshold: 0.15 });
  io.observe(section);
}
