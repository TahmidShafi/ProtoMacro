/* ============================================================
   ProtoMacro — recovery.js
   Water tracker (bottle visual + quick-add buttons)
   + Supplement tracker (checklist with kcal/protein contribution)
   + Sleep log (optional, hours per night).
   Resets daily via rolloverDaily() (run on state load).
   ============================================================ */
import { $, escapeHtml, icon, makeId, clamp, num, toast } from './utils.js';
import { STATE, saveState } from './state.js';
import { formModal } from './core/modal.js';
import { on, emit } from './core/bus.js';
import { computeDailyScore } from './core/metrics.js';
import { today } from './datetime.js';
import { formatWater } from './core/format.js';

const QUICK_ADDS = [250, 500, 750, 1000];

let dom = null;

/* Re-record today's snapshot when water/supplements change so the
   completion score stays current without logging food. */
const refreshSnapshot = () => {
  const h = STATE.history.find((x) => x.date === today());
  if (!h) return; /* tracker owns snapshot creation when food is logged */
  const score = computeDailyScore({
    calories: h.calories,
    protein: h.protein,
    items: h.items ?? 0,
    water: STATE.water.consumed,
    goals: { ...STATE.goals, water: STATE.water.goal }
  });
  h.water = STATE.water.consumed;
  h.score = score.score;
  saveState();
  emit('dashboard:update');
};

/* =========================================================
   WATER TRACKER
   ========================================================= */

const waterColor = (pct) => {
  if (pct < 50)  return 'var(--danger)';
  if (pct < 85)  return 'var(--warning)';
  return 'var(--primary)';
};

const renderWater = () => {
  const w = STATE.water;
  const pct = Math.min(120, (w.consumed / Math.max(1, w.goal)) * 100);
  const fillPct = Math.min(100, pct);

  dom.bottleFill.style.height = fillPct + '%';
  dom.waterAmount.textContent = (w.consumed / 1000).toFixed(2);
  dom.waterGoalLabel.textContent = (w.goal / 1000).toFixed(1) + 'L';
  dom.waterGoalInput.value = w.goal;
  dom.waterBar.style.width = fillPct + '%';
  dom.waterBar.style.background = waterColor(pct);
  dom.waterPercent.textContent = Math.round(pct) + '%';
  dom.waterPercent.style.color = waterColor(pct);
  dom.bottle.classList.toggle('complete', w.consumed >= w.goal);
};

const addWater = (ml) => {
  STATE.water.consumed = Math.max(0, STATE.water.consumed + ml);
  saveState();
  renderWater();
  refreshSnapshot();
};

const bindWater = () => {
  dom.waterAdds.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-add]');
    if (!btn) return;
    addWater(parseInt(btn.dataset.add, 10));
    toast(`+${btn.dataset.add} ml logged`, 'success');
  });

  dom.waterReset.addEventListener('click', () => {
    STATE.water.consumed = 0;
    saveState();
    renderWater();
    refreshSnapshot();
    toast('Water reset', 'info');
  });

  dom.waterGoalInput.addEventListener('change', () => {
    const v = clamp(num(dom.waterGoalInput.value) ?? 4000, 500, 10000);
    STATE.water.goal = v;
    saveState();
    renderWater();
    refreshSnapshot();
  });
};

/* =========================================================
   SUPPLEMENT TRACKER
   ========================================================= */

const supplementCard = (s, checked) => `
  <label class="supplement-card${checked ? ' checked' : ''}" data-id="${s.id}">
    <input type="checkbox" data-role="supp-check" ${checked ? 'checked' : ''} />
    <div class="supp-check-box" aria-hidden="true">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="20 6 9 17 4 12"/>
      </svg>
    </div>
    <div class="supp-main">
      <div class="supp-name">${escapeHtml(s.name)} <span class="supp-dose">(${escapeHtml(s.dose)})</span></div>
      <div class="supp-time">${escapeHtml(s.time)}</div>
    </div>
    <div class="supp-macros">
      <span class="supp-macro cal">${s.calories} kcal</span>
      <span class="supp-macro pro">${s.protein}g protein</span>
    </div>
    ${s.custom ? `<button class="supp-remove" data-role="supp-remove" title="Remove" aria-label="Remove ${escapeHtml(s.name)}">${icon('x', 12, 2.5)}</button>` : ''}
  </label>
`;

const renderSupplements = () => {
  const checked = STATE.supplements.checked;
  const list    = STATE.supplements.list;
  dom.suppList.innerHTML = list.map((s) => supplementCard(s, !!checked[s.id])).join('');

  let cal = 0, pro = 0, done = 0;
  for (const s of list) {
    if (checked[s.id]) {
      cal += s.calories;
      pro += s.protein;
      done++;
    }
  }
  dom.suppCal.textContent = cal;
  dom.suppPro.textContent = pro + 'g';
  dom.suppCount.textContent = `${done} / ${list.length} taken`;
};

const bindSupplements = () => {
  dom.suppList.addEventListener('change', (e) => {
    const box = e.target.closest('[data-role="supp-check"]');
    if (!box) return;
    const card = box.closest('.supplement-card');
    const id = card.dataset.id;
    STATE.supplements.checked[id] = !!box.checked;
    saveState();
    card.classList.toggle('checked', box.checked);
    if (box.checked) card.classList.add('just-checked');
    setTimeout(() => card.classList.remove('just-checked'), 600);
    renderSupplements();
    refreshSnapshot();
  });

  dom.suppList.addEventListener('click', async (e) => {
    const rm = e.target.closest('[data-role="supp-remove"]');
    if (!rm) return;
    e.preventDefault();
    const id = rm.closest('.supplement-card').dataset.id;
    STATE.supplements.list = STATE.supplements.list.filter((s) => s.id !== id);
    delete STATE.supplements.checked[id];
    saveState();
    renderSupplements();
    toast('Supplement removed', 'info');
  });

  dom.suppAddBtn.addEventListener('click', async () => {
    const values = await formModal({
      title: 'Add custom supplement',
      fields: [
        { id: 'name', label: 'Name (e.g. ZMA)', type: 'text', placeholder: 'Supplement name' },
        { id: 'dose', label: 'Dose (e.g. 1 capsule)', type: 'text', value: '1 serving' },
        { id: 'time', label: 'When to take', type: 'text', value: 'Anytime' },
        { id: 'calories', label: 'Calories per serving', type: 'number', value: 0, min: 0, max: 2000 },
        { id: 'protein', label: 'Protein per serving (g)', type: 'number', value: 0, min: 0, max: 200, step: 0.1 }
      ]
    });
    if (!values || !values.name?.trim()) return;
    STATE.supplements.list.push({
      id: 'custom_' + makeId(),
      name: values.name.trim().slice(0, 60),
      dose: (values.dose || '1 serving').trim().slice(0, 40),
      time: (values.time || 'Anytime').trim().slice(0, 40),
      calories: clamp(num(values.calories) ?? 0, 0, 2000),
      protein: clamp(num(values.protein) ?? 0, 0, 200),
      custom: true
    });
    saveState();
    renderSupplements();
    toast('Supplement added', 'success');
  });
};

/* =========================================================
   SLEEP LOG (optional)
   ========================================================= */

const renderSleep = () => {
  const last7 = [];
  const now = new Date();
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(now.getDate() - i);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const key = `${y}-${m}-${dd}`;
    const entry = STATE.sleepLog.find((s) => s.date === key);
    last7.push({ key, label: d.toLocaleDateString(undefined, { weekday: 'short' }), hours: entry?.hours ?? null });
  }

  const logged = last7.filter((d) => d.hours !== null);
  const avg = logged.length ? logged.reduce((s, d) => s + d.hours, 0) / logged.length : null;

  dom.sleepDays.innerHTML = last7.map((d) => `
    <div class="sleep-day${d.hours !== null ? ' logged' : ''}" title="${d.hours !== null ? d.hours + 'h' : 'Not logged'}">
      <div class="sleep-day-bar"><div class="sleep-day-fill" style="height:${d.hours ? Math.min(100, (d.hours / 10) * 100) : 0}%"></div></div>
      <div class="sleep-day-val">${d.hours !== null ? d.hours + 'h' : '—'}</div>
      <div class="sleep-day-label">${d.label}</div>
    </div>
  `).join('');

  dom.sleepAvg.textContent = avg !== null ? `${avg.toFixed(1)}h avg` : 'No sleep logged yet';
  dom.sleepInsight.textContent =
    avg === null
      ? 'Log your sleep to see simple trends. 7–9 hours is a common target for active people.'
      : avg >= 7 && avg <= 9
        ? `Solid week — ${avg.toFixed(1)}h average is in the 7–9h range most active people aim for.`
        : avg > 9
          ? `${avg.toFixed(1)}h average — more sleep than usual. Consistency matters as much as duration.`
          : `${avg.toFixed(1)}h average — below the 7–9h range. Earlier wind-downs may help recovery.`;
};

const bindSleep = () => {
  dom.sleepLogBtn.addEventListener('click', async () => {
    const values = await formModal({
      title: 'Log sleep',
      fields: [
        { id: 'hours', label: 'Hours slept last night', type: 'number', value: '', min: 0, max: 24, step: 0.25, placeholder: 'e.g. 7.5' }
      ],
      submitLabel: 'Log sleep'
    });
    if (!values) return;
    const hours = clamp(num(values.hours) ?? 0, 0, 24);
    if (hours <= 0) return toast('Enter hours between 0 and 24.', 'error');
    const t = today();
    const idx = STATE.sleepLog.findIndex((s) => s.date === t);
    if (idx >= 0) STATE.sleepLog[idx].hours = hours;
    else STATE.sleepLog.push({ date: t, hours });
    STATE.sleepLog.sort((a, b) => a.date.localeCompare(b.date));
    saveState();
    renderSleep();
    emit('dashboard:update');
    toast(`Logged ${hours}h of sleep`, 'success');
  });
};

/* =========================================================
   PUBLIC
   ========================================================= */

export function initRecovery() {
  dom = {
    bottle:          $('#waterBottle'),
    bottleFill:      $('#waterBottleFill'),
    waterAmount:     $('#waterAmount'),
    waterGoalLabel:  $('#waterGoalLabel'),
    waterGoalInput:  $('#waterGoalInput'),
    waterBar:        $('#waterBar'),
    waterPercent:    $('#waterPercent'),
    waterAdds:       $('#waterAdds'),
    waterReset:      $('#waterResetBtn'),
    suppList:        $('#suppList'),
    suppCal:         $('#suppTotalCal'),
    suppPro:         $('#suppTotalPro'),
    suppCount:       $('#suppCount'),
    suppAddBtn:      $('#suppAddBtn'),
    sleepDays:       $('#sleepDays'),
    sleepAvg:        $('#sleepAvg'),
    sleepInsight:    $('#sleepInsight'),
    sleepLogBtn:     $('#sleepLogBtn')
  };
  if (!dom.bottle) return;

  /* Build quick-add buttons */
  dom.waterAdds.innerHTML = QUICK_ADDS.map((ml) => `
    <button class="water-add-btn" data-add="${ml}">
      <span class="water-add-ml">+${ml >= 1000 ? (ml / 1000) + 'L' : ml + 'ml'}</span>
    </button>
  `).join('');

  bindWater();
  bindSupplements();
  bindSleep();

  on('state:replaced', () => { renderWater(); renderSupplements(); renderSleep(); });

  renderWater();
  renderSupplements();
  renderSleep();
}
