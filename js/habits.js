/* ============================================================
   ProtoMacro — habits.js  ("RESET — break habits, build routines")
   Multi-habit tracking in two modes:
     quit   → avoid completely; only clean days count
     reduce → stay under a daily limit; partial success still counts
   Compassionate language throughout: a setback is data, not failure.
   ============================================================ */
import { $, escapeHtml, icon, makeId, toast, num } from './utils.js';
import { STATE, saveState } from './state.js';
import { openModal, formModal } from './core/modal.js';
import { on } from './core/bus.js';
import { habitStreak, nextMilestone, HABIT_MILESTONES } from './core/metrics.js';
import { today, toDateStr } from './datetime.js';

const TRIGGERS = ['stress', 'boredom', 'social', 'late night', 'other'];

const EMOJIS = ['🚭', '🍔', '🍭', '📱', '🎮', '🌙', '🥤', '🧠', '💪', '⭐'];

let dom = null;
let calendarMonth = new Date();

/* ---------------- status marking ---------------- */

const cycleStatus = (habit, key) => {
  const cur = habit.log[key];
  const next = { undefined: 'ok', ok: 'partial', partial: 'setback', setback: undefined }[cur];
  if (next) habit.log[key] = next;
  else delete habit.log[key];
};

const statusIcon = (status) =>
  ({ ok: '✅', partial: '🟡', setback: '🔴' }[status] ?? '');

const isWin = (habit, status) =>
  status === 'ok' || (habit.mode === 'reduce' && status === 'partial');

/* ---------------- habit card ---------------- */

const habitCard = (habit) => {
  const t = today();
  const streak = habitStreak(habit.log, habit.mode, t);

  /* last 7 days (oldest → today) */
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = toDateStr(d);
    days.push({ key, status: habit.log[key] });
  }

  const milestone = nextMilestone(streak.current);
  const milestoneHit = HABIT_MILESTONES.includes(streak.current);

  return `
  <div class="habit-card" data-habit="${habit.id}">
    <div class="habit-head">
      <span class="habit-emoji">${escapeHtml(habit.emoji || '⭐')}</span>
      <span class="habit-name">${escapeHtml(habit.name)}</span>
      <span class="habit-mode-chip">${habit.mode === 'quit' ? 'Quit' : `Reduce < ${habit.dailyLimit}${habit.limitUnit === 'hours' ? 'h' : ''}`}</span>
    </div>

    <div class="habit-stats">
      <div class="habit-stat"><div class="habit-stat-val habit-streak-flame">🔥 ${streak.current}</div><div class="habit-stat-label">Streak</div></div>
      <div class="habit-stat"><div class="habit-stat-val">${streak.longest}</div><div class="habit-stat-label">Longest</div></div>
      <div class="habit-stat"><div class="habit-stat-val">${streak.ok}</div><div class="habit-stat-label">Clean days</div></div>
      <div class="habit-stat"><div class="habit-stat-val">${streak.setbacks}</div><div class="habit-stat-label">Setbacks</div></div>
    </div>

    <div class="habit-week" role="group" aria-label="Last 7 days — tap to mark">
      ${days.map((d) => `
        <button type="button" class="habit-day ${d.status ?? ''}"
          data-day="${d.key}" title="${d.key} — ${d.status ? d.status : 'tap to mark OK'}"
          aria-label="${d.key}: ${d.status ?? 'unmarked'}">${statusIcon(d.status) || d.key.slice(8)}</button>
      `).join('')}
    </div>

    ${milestoneHit ? `<div class="habit-milestone">🎉 ${streak.current}-day milestone reached!</div>` : ''}
    ${milestone ? `<div class="entity-sub">${streak.current} days — next milestone: ${milestone} days</div>` : ''}
    ${habit.costPerDay > 0 ? `<div class="entity-sub">💰 Money saved: <strong>$${(streak.current * habit.costPerDay).toFixed(2)}</strong> (vs. old routine)</div>` : ''}
    <div class="entity-sub">Success rate: <strong>${streak.successRate}%</strong></div>

    <div class="habit-actions">
      <button class="btn btn-ghost btn-sm" data-habit-action="log-setback">Log setback</button>
      <button class="btn btn-ghost btn-sm" data-habit-action="edit">Edit</button>
      <button class="btn btn-ghost btn-sm" data-habit-action="delete">Delete</button>
    </div>
  </div>
`;
};

const triggerAnalytics = (habit) => {
  const counts = {};
  for (const s of habit.setbacks) counts[s.trigger] = (counts[s.trigger] || 0) + 1;
  const total = habit.setbacks.length;
  if (!total) return '';
  const rows = Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .map(([trigger, n]) => `
      <div class="trigger-bar-row">
        <span>${escapeHtml(trigger)}</span>
        <div class="trigger-bar"><div class="trigger-bar-fill" style="width:${(n / total) * 100}%"></div></div>
        <span>${n}</span>
      </div>
    `).join('');
  return `
    <div class="card" style="margin-top:14px;">
      <div class="progress-card-title">Common triggers — "${escapeHtml(habit.name)}"</div>
      <div class="trigger-bars">${rows}</div>
    </div>
  `;
};

const render = () => {
  if (!dom) return;
  dom.grid.innerHTML = STATE.habits.length
    ? STATE.habits.map(habitCard).join('')
    : '<div class="empty-state"><div class="empty-state-icon">🌱</div><div class="empty-state-title">No habits yet</div><div>Add one above — quitting or cutting back both count as wins.</div></div>';

  dom.analytics.innerHTML = STATE.habits.map(triggerAnalytics).join('');
};

const monthCalendar = (habit) => {
  const y = calendarMonth.getFullYear();
  const m = calendarMonth.getMonth();
  const first = new Date(y, m, 1);
  const startDow = first.getDay();
  const daysIn = new Date(y, m + 1, 0).getDate();

  let cells = '';
  for (let i = 0; i < startDow; i++) cells += '<div class="calendar-day other"></div>';
  for (let d = 1; d <= daysIn; d++) {
    const key = toDateStr(new Date(y, m, d));
    const s = habit.log[key];
    cells += `<div class="calendar-day ${s ?? ''}" title="${key}: ${s ?? 'unmarked'}">${statusIcon(s) || d}</div>`;
  }

  return `
    <div class="calendar-nav">
      <button class="icon-btn" data-cal-nav="-1" aria-label="Previous month">${icon('chevronL', 14)}</button>
      <span class="calendar-title">${calendarMonth.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</span>
      <button class="icon-btn" data-cal-nav="1" aria-label="Next month">${icon('chevronR', 14)}</button>
    </div>
    <div class="calendar-grid">
      ${['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d) => `<div class="calendar-dow">${d}</div>`).join('')}
      ${cells}
    </div>
    <div class="calendar-legend">
      <span><span class="legend-dot" style="background:var(--primary)"></span> Success</span>
      <span><span class="legend-dot" style="background:var(--warning)"></span> Partial</span>
      <span><span class="legend-dot" style="background:var(--danger)"></span> Setback</span>
    </div>
  `;
};

/* ---------------- actions ---------------- */

const addOrEditHabit = async (existing = null) => {
  const values = await formModal({
    title: existing ? 'Edit habit' : 'New habit',
    fields: [
      { id: 'name', label: 'Habit (e.g. Smoking, Junk food, Social media)', type: 'text', value: existing?.name ?? '' },
      {
        id: 'emoji', label: 'Icon', type: 'select',
        options: EMOJIS.map((e) => ({ value: e, label: `${e} ${e === '⭐' ? '(default)' : ''}` })),
        value: existing?.emoji ?? '⭐'
      },
      {
        id: 'mode', label: 'Mode', type: 'select',
        options: [
          { value: 'quit', label: 'Quit — avoid completely' },
          { value: 'reduce', label: 'Reduce — stay under a limit' }
        ],
        value: existing?.mode ?? 'quit'
      },
      { id: 'dailyLimit', label: 'Daily limit (reduce mode)', type: 'number', value: existing?.dailyLimit ?? 1, min: 0.5, max: 24, step: 0.5 },
      {
        id: 'limitUnit', label: 'Limit unit', type: 'select',
        options: [{ value: 'times', label: 'times/day' }, { value: 'hours', label: 'hours/day' }],
        value: existing?.limitUnit ?? 'times'
      },
      { id: 'costPerDay', label: 'Cost per day ($, optional — enables money-saved)', type: 'number', value: existing?.costPerDay ?? '', min: 0, max: 1000, step: 0.5 }
    ]
  });
  if (!values || !values.name?.trim()) return;

  if (existing) {
    Object.assign(existing, {
      name: values.name.trim().slice(0, 60),
      emoji: values.emoji,
      mode: values.mode,
      dailyLimit: Math.max(0.5, num(values.dailyLimit) ?? 1),
      limitUnit: values.limitUnit,
      costPerDay: Math.max(0, num(values.costPerDay) ?? 0)
    });
  } else {
    STATE.habits.push({
      id: makeId(),
      name: values.name.trim().slice(0, 60),
      emoji: values.emoji,
      mode: values.mode,
      dailyLimit: Math.max(0.5, num(values.dailyLimit) ?? 1),
      limitUnit: values.limitUnit,
      costPerDay: Math.max(0, num(values.costPerDay) ?? 0),
      createdAt: today(),
      log: {},
      setbacks: []
    });
  }
  saveState();
  render();
  toast(existing ? 'Habit updated' : 'Habit added — day 1 starts today', 'success');
};

const logSetback = async (habit) => {
  const values = await formModal({
    title: 'Log a setback',
    fields: [
      {
        id: 'trigger', label: 'What triggered it?', type: 'select',
        options: TRIGGERS.map((t) => ({ value: t, label: t[0].toUpperCase() + t.slice(1) }))
      },
      { id: 'note', label: 'Notes (optional — what happened, what could help next time)', type: 'text', placeholder: 'No judgment — this is just data.' }
    ],
    submitLabel: 'Log setback'
  });
  if (!values) return;
  habit.setbacks.unshift({
    id: makeId(),
    date: today(),
    trigger: values.trigger,
    note: (values.note || '').slice(0, 200)
  });
  habit.log[today()] = 'setback';
  saveState();
  render();
  toast('Setback logged. Your progress still matters — one day doesn\'t erase the streak you built.', 'info');
};

const deleteHabit = async (habit) => {
  const values = await formModal({
    title: `Delete "${habit.name}"?`,
    fields: [{ id: 'confirm', label: 'Type DELETE to confirm', type: 'text', placeholder: 'DELETE' }],
    submitLabel: 'Delete habit'
  });
  if (values?.confirm?.toUpperCase() !== 'DELETE') return;
  STATE.habits = STATE.habits.filter((h) => h.id !== habit.id);
  saveState();
  render();
  toast('Habit deleted', 'info');
};

const openCraving = () => {
  const steps = [
    ['⏸️', 'Pause. Cravings typically peak and pass within 10–20 minutes.'],
    ['🫁', 'Take five slow breaths — in for 4, hold for 4, out for 6.'],
    ['💧', 'Drink a glass of water. Thirst often masquerades as a craving.'],
    ['🚶', 'Take a short walk or change rooms — movement resets the urge.'],
    ['🎧', 'Distract yourself: music, a task, a message to a friend.'],
    ['🚪', 'If you can, leave the triggering environment for a few minutes.']
  ];
  openModal({
    title: '🌊 Craving mode',
    body: `
      <p style="font-size:var(--text-sm); color:var(--text-muted); margin-bottom:6px;">
        This urge is temporary. Work through the steps — you don't have to resist everything at once, just get through the next few minutes.
      </p>
      <div class="craving-steps">
        ${steps.map(([e, text], i) => `
          <div class="craving-step">
            <span class="craving-step-num">${i + 1}</span>
            <span>${e} ${text}</span>
          </div>
        `).join('')}
      </div>
      <p class="disclaimer">A general self-help tool, not medical advice. If cravings feel unmanageable, professional support genuinely helps.</p>
    `,
    actions: [{ label: 'I made it through', class: 'btn btn-primary' }]
  });
};

/* ---------------- init ---------------- */

export function initHabits() {
  dom = {
    section: $('#reset'),
    grid: $('#habitGrid'),
    analytics: $('#habitAnalytics')
  };
  if (!dom.section) return;

  $('#habitAddBtn')?.addEventListener('click', () => addOrEditHabit());
  $('#cravingBtn')?.addEventListener('click', openCraving);

  dom.section.addEventListener('click', async (e) => {
    const dayBtn = e.target.closest('.habit-day');
    if (dayBtn) {
      const habit = STATE.habits.find((h) => h.id === dayBtn.closest('.habit-card').dataset.habit);
      if (habit) {
        cycleStatus(habit, dayBtn.dataset.day);
        saveState();
        render();
      }
      return;
    }

    const nav = e.target.closest('[data-cal-nav]');
    if (nav) {
      calendarMonth.setMonth(calendarMonth.getMonth() + parseInt(nav.dataset.calNav, 10));
      render();
      return;
    }

    const actionBtn = e.target.closest('[data-habit-action]');
    if (!actionBtn) return;
    const habit = STATE.habits.find((h) => h.id === actionBtn.closest('.habit-card').dataset.habit);
    if (!habit) return;

    const action = actionBtn.dataset.habitAction;
    if (action === 'edit') addOrEditHabit(habit);
    else if (action === 'delete') deleteHabit(habit);
    else if (action === 'log-setback') logSetback(habit);
  });

  on('state:replaced', render);
  render();
}
