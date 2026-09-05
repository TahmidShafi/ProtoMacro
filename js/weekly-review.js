/* ============================================================
   ProtoMacro — weekly-review.js
   Automatic rule-based weekly review: averages, consistency,
   weight trend, completion scores and simple insights.
   Rule-based only — explicitly NOT medical advice.
   ============================================================ */
import { $, icon } from './utils.js';
import { STATE } from './state.js';
import { macroConsistency, weightStats } from './core/metrics.js';
import { toDateStr } from './datetime.js';

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export const lastNDays = (n) => {
  const days = [];
  const now = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(now.getDate() - i);
    days.push({ date: toDateStr(d), label: DOW[d.getDay()] });
  }
  return days;
};

export const weekData = () => {
  const days = lastNDays(7).map((d) => ({
    ...d,
    entry: STATE.history.find((h) => h.date === d.date)
  }));
  const logged = days.filter((d) => d.entry && (d.entry.items ?? 1) > 0);
  const avg = (key) => logged.length
    ? logged.reduce((s, d) => s + (d.entry[key] || 0), 0) / logged.length
    : 0;
  const avgScore = logged.length
    ? Math.round(logged.reduce((s, d) => s + (d.entry.score ?? 0), 0) / logged.length)
    : 0;
  const waterLogged = logged.filter((d) => (d.entry.water ?? 0) > 0);
  const waterGoalDays = waterLogged.filter((d) => (d.entry.water ?? 0) >= STATE.water.goal * 0.8).length;
  const consistency = macroConsistency(days.map((d) => d.entry), STATE.goals);

  return { days, logged, avg, avgScore, waterGoalDays, waterLogged: waterLogged.length, consistency };
};

const insight = (kind, text) => `
  <div class="review-insight ${kind}">${icon(kind === 'positive' ? 'check' : 'info', 15, 2.5)}<span>${text}</span></div>
`;

export const buildReview = () => {
  const w = weekData();
  const g = STATE.goals;

  const stats = `
    <div class="review-grid">
      <div class="review-stat"><div class="review-stat-val">${Math.round(w.avg('calories')).toLocaleString()}</div><div class="review-stat-label">Avg calories / day</div></div>
      <div class="review-stat"><div class="review-stat-val">${Math.round(w.avg('protein'))}g</div><div class="review-stat-label">Avg protein / day</div></div>
      <div class="review-stat"><div class="review-stat-val">${w.consistency.pct}%</div><div class="review-stat-label">Macro consistency</div></div>
      <div class="review-stat"><div class="review-stat-val">${w.avgScore}</div><div class="review-stat-label">Avg completion score</div></div>
      <div class="review-stat"><div class="review-stat-val">${w.logged.length}/7</div><div class="review-stat-label">Days logged</div></div>
    </div>
  `;

  const insights = [];
  if (!w.logged.length) {
    insights.push(insight('neutral', 'No food logged this week yet — logging even a few days gives useful patterns.'));
  } else {
    if (w.avg('protein') >= g.protein * 0.9) {
      insights.push(insight('positive', '<strong>Protein consistency was excellent</strong> — you averaged near or above your target.'));
    } else if (w.avg('protein') >= g.protein * 0.7) {
      insights.push(insight('neutral', `Protein averaged ${Math.round(w.avg('protein'))}g — a bit short of your ${g.protein}g target. One extra protein-rich meal usually closes the gap.`));
    } else {
      insights.push(insight('neutral', `Protein averaged only ${Math.round(w.avg('protein'))}g vs your ${g.protein}g target — worth prioritising this week.`));
    }

    const calDiff = w.avg('calories') - g.calories;
    if (Math.abs(calDiff) <= g.calories * 0.1) {
      insights.push(insight('positive', 'Your calorie intake was generally close to your target — nice, steady control.'));
    } else if (calDiff > 0) {
      insights.push(insight('neutral', `Calories averaged about ${Math.round(calDiff)} kcal above target across logged days.`));
    } else {
      insights.push(insight('neutral', `Calories averaged about ${Math.round(-calDiff)} kcal below target across logged days.`));
    }

    if (w.logged.length >= 5) {
      insights.push(insight('positive', `<strong>Logging consistency was strong</strong> — ${w.logged.length} of 7 days tracked.`));
    } else {
      insights.push(insight('neutral', `You logged ${w.logged.length} of 7 days — more data means better trends.`));
    }

    if (w.waterLogged.length) {
      insights.push(insight(w.waterGoalDays / w.waterLogged.length >= 0.6 ? 'positive' : 'neutral', `Water goal reached on ${w.waterGoalDays} of ${w.waterLogged.length} logged days.`));
    }
  }

  const ws = weightStats(STATE.weightLog, { goalWeight: STATE.goalWeight });
  if (ws.weekly !== null) {
    const dir = ws.weekly > 0 ? 'up' : ws.weekly < 0 ? 'down' : 'unchanged';
    insights.push(insight('neutral', `Body weight is ${dir} ${Math.abs(ws.weekly).toFixed(1)}kg vs a week ago. Week-to-week noise is normal — judge the trend, not single readings.`));
  }

  return stats + `<div class="review-insights">${insights.join('')}</div>
    <p class="disclaimer">Rule-based observations about your logged data — not medical or dietary advice.</p>`;
};

export function renderWeeklyReview() {
  const el = $('#weeklyReview');
  if (el) el.innerHTML = buildReview();
}

export function initWeeklyReview() {
  if (!$('#weeklyReview')) return;
  renderWeeklyReview();
}
