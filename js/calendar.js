/* ============================================================
   ProtoMacro — calendar.js
   Monthly history calendar: 🟢 goals achieved · 🟡 partial ·
   🔴 logged poorly. Click a day → detail modal.
   ============================================================ */
import { $, icon } from './utils.js';
import { STATE } from './state.js';
import { openModal } from './core/modal.js';
import { scoreBand } from './core/metrics.js';
import { toDateStr, today } from './datetime.js';
import { formatWater } from './core/format.js';

let view = new Date();

const fmt = (n, unit = '') =>
  n === null ? '—' : `${Number.isFinite(n) ? n.toLocaleString() : '—'}${unit}`;

const dayDetail = (dateStr) => {
  const h = STATE.history.find((x) => x.date === dateStr);
  const weight = STATE.weightLog.find((w) => w.date === dateStr);
  const sleep = STATE.sleepLog.find((s) => s.date === dateStr);
  const water = h?.water ?? (dateStr === today() ? STATE.water.consumed : 0);
  const score = h?.score;

  const rows = [
    ['Calories', h && (h.items ?? 1) > 0 ? fmt(h.calories) : 'not logged'],
    ['Protein', h && (h.items ?? 1) > 0 ? fmt(h.protein, 'g') : '—'],
    ['Carbs', h && (h.items ?? 1) > 0 ? fmt(h.carbs, 'g') : '—'],
    ['Fat', h && (h.items ?? 1) > 0 ? fmt(h.fat, 'g') : '—'],
    ['Water', water ? formatWater(water, STATE.settings.units) : '—'],
    ['Weight', weight ? `${weight.weight} kg` : '—'],
    ['Sleep', sleep ? `${sleep.hours}h` : '—'],
    ['Completion score', score !== null && score !== undefined ? `${score}/100` : '—']
  ];

  openModal({
    title: dateStr,
    body: `
      <div class="migration-preview">
        ${rows.map(([k, v]) => `<div class="migration-preview-row"><span>${k}</span><strong>${v}</strong></div>`).join('')}
      </div>
      ${h?.mode ? `<p class="entity-sub" style="margin-top:8px;">Mode that day: ${h.mode}</p>` : ''}
    `
  });
};

const render = () => {
  const el = $('#historyCalendar');
  if (!el) return;

  const y = view.getFullYear();
  const m = view.getMonth();
  const first = new Date(y, m, 1);
  const startDow = first.getDay();
  const daysIn = new Date(y, m + 1, 0).getDate();
  const t = today();

  let cells = '';
  for (let i = 0; i < startDow; i++) cells += '<div class="calendar-day other"></div>';
  for (let d = 1; d <= daysIn; d++) {
    const key = toDateStr(new Date(y, m, d));
    const h = STATE.history.find((x) => x.date === key);
    const logged = h && (h.items ?? 1) > 0;
    const band = h?.score !== null && h?.score !== undefined
      ? scoreBand(h.score)
      : logged ? 'partial' : 'none';
    const cls = !logged ? '' : band === 'good' ? 'good' : band === 'partial' ? 'partial' : 'logged-bad';
    cells += `
      <button type="button" class="calendar-day ${cls}${key === t ? ' today-cell' : ''}"
        data-cal-day="${key}" title="${key}${h?.score !== undefined && h?.score !== null ? ` — score ${h.score}` : ''}"
        aria-label="${key}${logged ? `, score ${h.score ?? 'n/a'}` : ', not logged'}">${d}</button>
    `;
  }

  el.innerHTML = `
    <div class="calendar-nav">
      <button class="icon-btn" data-cal-nav="-1" aria-label="Previous month">${icon('chevronL', 14)}</button>
      <span class="calendar-title">${view.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</span>
      <button class="icon-btn" data-cal-nav="1" aria-label="Next month">${icon('chevronR', 14)}</button>
    </div>
    <div class="calendar-grid" role="grid" aria-label="Monthly history calendar">
      ${['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d) => `<div class="calendar-dow">${d}</div>`).join('')}
      ${cells}
    </div>
    <div class="calendar-legend">
      <span><span class="legend-dot" style="background:var(--primary)"></span> Goals achieved</span>
      <span><span class="legend-dot" style="background:var(--warning)"></span> Partial progress</span>
      <span><span class="legend-dot" style="background:var(--danger)"></span> Logged, off target</span>
      <span><span class="legend-dot" style="background:var(--bg-3)"></span> Not logged</span>
    </div>
  `;
};

export function initCalendar() {
  const card = $('#calendarCard');
  if (!card) return;
  render();

  card.addEventListener('click', (e) => {
    const nav = e.target.closest('[data-cal-nav]');
    if (nav) {
      view = new Date(view);
      view.setMonth(view.getMonth() + parseInt(nav.dataset.calNav, 10));
      render();
      return;
    }
    const day = e.target.closest('[data-cal-day]');
    if (day) dayDetail(day.dataset.calDay);
  });
}
