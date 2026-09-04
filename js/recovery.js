/* ============================================================
   ProtoMacro — recovery.js
   Water tracker (bottle visual + quick-add buttons)
   + Supplement tracker (checklist with calorie/protein contribution).
   Resets daily via rolloverDaily() (already run on state load).
   ============================================================ */
import { $, escapeHtml, icon, uid, clamp, num, toast } from './utils.js';
import { STATE, saveState } from './state.js';

const QUICK_ADDS = [250, 500, 750, 1000];

let dom = null;

/* =========================================================
   WATER TRACKER
   ========================================================= */

const waterColor = (pct) => {
  /* red -> yellow -> green transition as goal is approached */
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

  /* Celebratory state when goal reached */
  dom.bottle.classList.toggle('complete', w.consumed >= w.goal);
};

const addWater = (ml) => {
  STATE.water.consumed = Math.max(0, STATE.water.consumed + ml);
  saveState();
  renderWater();
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
    toast('Water reset', 'info');
  });

  dom.waterGoalInput.addEventListener('change', () => {
    const v = clamp(num(dom.waterGoalInput.value) ?? 4000, 500, 10000);
    STATE.water.goal = v;
    saveState();
    renderWater();
  });
};

/* =========================================================
   SUPPLEMENT TRACKER
   ========================================================= */

const supplementCard = (s, checked) => `
  <label class="supplement-card${checked ? ' checked' : ''}" data-id="${s.id}">
    <input type="checkbox" data-role="supp-check" ${checked ? 'checked' : ''} />
    <div class="supp-check-box">
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
    ${s.custom ? `<button class="supp-remove" data-role="supp-remove" title="Remove">${icon('x', 12, 2.5)}</button>` : ''}
  </label>
`;

const renderSupplements = () => {
  const checked = STATE.supplements.checked;
  const list    = STATE.supplements.list;
  dom.suppList.innerHTML = list.map((s) => supplementCard(s, !!checked[s.id])).join('');

  /* Daily contribution */
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
  });

  dom.suppList.addEventListener('click', (e) => {
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

  dom.suppAddBtn.addEventListener('click', () => {
    const name = prompt('Supplement name (e.g. "ZMA")');
    if (!name) return;
    const dose = prompt('Dose (e.g. "1 capsule")', '1 capsule') || '1 serving';
    const time = prompt('When to take (e.g. "Before bed")', 'Anytime') || 'Anytime';
    const cals = num(prompt('Calories per serving?', '0')) || 0;
    const prot = num(prompt('Protein per serving (g)?', '0')) || 0;

    STATE.supplements.list.push({
      id: 'custom_' + uid(),
      name: name.trim().slice(0, 60),
      dose: dose.trim().slice(0, 40),
      time: time.trim().slice(0, 40),
      calories: cals, protein: prot,
      custom: true
    });
    saveState();
    renderSupplements();
    toast('Supplement added', 'success');
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
    suppAddBtn:      $('#suppAddBtn')
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

  renderWater();
  renderSupplements();
}
