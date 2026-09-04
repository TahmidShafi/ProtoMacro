/* ============================================================
   ProtoMacro — planner.js
   Drag-and-drop meal planner with per-meal + daily totals.
   Meal slots are generated from data to avoid HTML duplication.
   ============================================================ */
import { $, escapeHtml, icon, uid, toast } from './utils.js';
import { STATE, saveState } from './state.js';

const MEALS = [
  { key: 'breakfast', label: 'Breakfast', icon: '&#127869;' },
  { key: 'lunch',     label: 'Lunch',     icon: '&#129391;' },
  { key: 'dinner',    label: 'Dinner',    icon: '&#127869;&#65039;' },
  { key: 'snacks',    label: 'Snacks',    icon: '&#127824;' }
];

let dom = null;

const slotTemplate = (m) => `
  <div class="meal-slot" data-meal="${m.key}">
    <div class="meal-slot-head">
      <div class="meal-slot-icon">${m.icon}</div>
      <div class="meal-slot-title-wrap">
        <div class="meal-slot-title">${m.label}</div>
        <div class="meal-slot-count"><span data-count>0</span> items</div>
      </div>
    </div>
    <div class="meal-slot-body">
      <div class="meal-slot-items" data-items></div>
      <div class="meal-slot-drop" data-drop>Drop foods here</div>
    </div>
    <div class="meal-slot-foot">
      <div class="meal-stat"><div class="meal-stat-label">Cal</div><div class="meal-stat-val" data-stat="cal">0</div></div>
      <div class="meal-stat"><div class="meal-stat-label">P</div><div class="meal-stat-val" data-stat="pro">0g</div></div>
      <div class="meal-stat"><div class="meal-stat-label">C</div><div class="meal-stat-val" data-stat="car">0g</div></div>
      <div class="meal-stat"><div class="meal-stat-label">F</div><div class="meal-stat-val" data-stat="fat">0g</div></div>
    </div>
  </div>
`;

const renderItem = (item) => `
  <div class="meal-item" data-uid="${item.uid}">
    <span class="meal-item-name" title="${escapeHtml(item.name)}">${escapeHtml(item.name)}</span>
    <span class="meal-item-cal">${item.calories} kcal</span>
    <button class="delete-btn sm" data-role="remove" title="Remove" aria-label="Remove ${escapeHtml(item.name)}">${icon('x', 12, 2.5)}</button>
  </div>
`;

export const addToPlanner = (food, mealKey) => {
  STATE.planner[mealKey].push({ ...food, uid: uid() });
  saveState();
  updatePlanner();
  toast(`Added to ${mealKey}`, 'success');
};

export function updatePlanner() {
  let gc = 0, gp = 0, gcr = 0, gf = 0;

  for (const meal of MEALS) {
    const items = STATE.planner[meal.key] || [];
    const refs  = dom.slots[meal.key];

    refs.count.textContent = items.length;
    refs.items.innerHTML = items.map(renderItem).join('');
    refs.drop.style.display = items.length ? 'none' : 'grid';

    let mc = 0, mp = 0, mcr = 0, mf = 0;
    for (const i of items) { mc += i.calories; mp += i.protein; mcr += i.carbs; mf += i.fat; }

    refs.stats.cal.textContent = Math.round(mc);
    refs.stats.pro.textContent = mp.toFixed(1) + 'g';
    refs.stats.car.textContent = mcr.toFixed(1) + 'g';
    refs.stats.fat.textContent = mf.toFixed(1) + 'g';

    gc += mc; gp += mp; gcr += mcr; gf += mf;
  }

  dom.totalCal.textContent = Math.round(gc).toLocaleString();
  dom.totalPro.textContent = gp.toFixed(1) + 'g';
  dom.totalCar.textContent = gcr.toFixed(1) + 'g';
  dom.totalFat.textContent = gf.toFixed(1) + 'g';
}

const bindSlotEvents = (slotEl) => {
  const meal = slotEl.dataset.meal;

  slotEl.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    slotEl.classList.add('drag-over');
  });
  slotEl.addEventListener('dragleave', () => slotEl.classList.remove('drag-over'));
  slotEl.addEventListener('drop', (e) => {
    e.preventDefault();
    slotEl.classList.remove('drag-over');
    try {
      const food = JSON.parse(e.dataTransfer.getData('application/json'));
      addToPlanner(food, meal);
    } catch { /* ignore invalid payload */ }
  });

  /* Delegated remove clicks per slot */
  slotEl.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-role="remove"]');
    if (!btn) return;
    const itemEl = btn.closest('.meal-item');
    const uidVal = itemEl ? itemEl.dataset.uid : null;
    if (!uidVal) return;
    STATE.planner[meal] = STATE.planner[meal].filter((i) => i.uid !== uidVal);
    saveState();
    updatePlanner();
  });
};

export function initPlanner() {
  const grid = $('#mealGrid');
  grid.innerHTML = MEALS.map(slotTemplate).join('');

  /* Cache references per slot for fast re-renders */
  const slots = {};
  for (const meal of MEALS) {
    const slotEl = $(`.meal-slot[data-meal="${meal.key}"]`, grid);
    slots[meal.key] = {
      el:    slotEl,
      count: $('[data-count]', slotEl),
      items: $('[data-items]', slotEl),
      drop:  $('[data-drop]',  slotEl),
      stats: {
        cal: $('[data-stat="cal"]', slotEl),
        pro: $('[data-stat="pro"]', slotEl),
        car: $('[data-stat="car"]', slotEl),
        fat: $('[data-stat="fat"]', slotEl)
      }
    };
    bindSlotEvents(slotEl);
  }

  dom = {
    slots,
    totalCal: $('#plannerTotalCal'),
    totalPro: $('#plannerTotalPro'),
    totalCar: $('#plannerTotalCar'),
    totalFat: $('#plannerTotalFat')
  };

  updatePlanner();
}
