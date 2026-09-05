/* ============================================================
   ProtoMacro — planner.js
   Drag-and-drop meal planner with per-meal + daily totals.
   v2: every item has editable grams; totals scale properly
   (v1 bug: per-100g values were summed as absolutes).
   ============================================================ */
import { $, escapeHtml, icon, makeId, clamp, num, toast } from './utils.js';
import { STATE, saveState } from './state.js';
import { on, emit } from './core/bus.js';

const MEALS = [
  { key: 'breakfast', label: 'Breakfast', icon: '🌅' },
  { key: 'lunch',     label: 'Lunch',     icon: '🌞' },
  { key: 'dinner',    label: 'Dinner',    icon: '🌆' },
  { key: 'snacks',    label: 'Snacks',    icon: '🍎' }
];

export const MEAL_KEYS = MEALS.map((m) => m.key);

/* Scaled macros for a planner item (grams-based) */
export const itemMacros = (item) => {
  const mult = (item.servings ?? 100) / 100;
  return {
    calories: item.calories * mult,
    protein: item.protein * mult,
    carbs: item.carbs * mult,
    fat: item.fat * mult
  };
};

export const plannerTotals = (mealKey = null) => {
  const keys = mealKey ? [mealKey] : MEAL_KEYS;
  const totals = { calories: 0, protein: 0, carbs: 0, fat: 0 };
  for (const key of keys) {
    for (const item of STATE.planner[key] || []) {
      const m = itemMacros(item);
      totals.calories += m.calories;
      totals.protein += m.protein;
      totals.carbs += m.carbs;
      totals.fat += m.fat;
    }
  }
  return totals;
};

let dom = null;

const slotTemplate = (m) => `
  <div class="meal-slot" data-meal="${m.key}">
    <div class="meal-slot-head">
      <div class="meal-slot-icon" aria-hidden="true">${m.icon}</div>
      <div class="meal-slot-title-wrap">
        <div class="meal-slot-title">${m.label}</div>
        <div class="meal-slot-count"><span data-count>0</span> items</div>
      </div>
      <button type="button" class="btn btn-ghost btn-sm" data-save-meal="${m.key}" title="Save this meal for one-click logging">Save meal</button>
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

const renderItem = (item) => {
  const m = itemMacros(item);
  return `
  <div class="meal-item" data-uid="${item.uid}">
    <span class="meal-item-name" title="${escapeHtml(item.name)}">${escapeHtml(item.name)}</span>
    <input type="number" class="meal-item-grams" value="${item.servings ?? 100}" min="1" max="5000" step="5"
      data-role="grams" aria-label="Grams of ${escapeHtml(item.name)}" />
    <span class="meal-item-cal">${Math.round(m.calories)} kcal</span>
    <button class="delete-btn sm" data-role="remove" title="Remove" aria-label="Remove ${escapeHtml(item.name)}">${icon('x', 12, 2.5)}</button>
  </div>
`;
};

export const addToPlanner = (food, mealKey) => {
  if (!STATE.planner[mealKey]) return;
  STATE.planner[mealKey].push({ ...food, uid: makeId(), servings: food.servings ?? 100 });
  saveState();
  updatePlanner();
  toast(`Added to ${mealKey}`, 'success');
};

export function updatePlanner() {
  if (!dom) return;
  let gc = 0, gp = 0, gcr = 0, gf = 0;

  for (const meal of MEALS) {
    const items = STATE.planner[meal.key] || [];
    const refs  = dom.slots[meal.key];

    refs.count.textContent = items.length;
    refs.items.innerHTML = items.map(renderItem).join('');
    refs.drop.style.display = items.length ? 'none' : 'grid';

    let mc = 0, mp = 0, mcr = 0, mf = 0;
    for (const i of items) {
      const m = itemMacros(i);
      mc += m.calories; mp += m.protein; mcr += m.carbs; mf += m.fat;
    }

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
  emit('grocery:update');
}

const bindSlotEvents = (slotEl) => {
  const meal = slotEl.dataset.meal;

  slotEl.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    slotEl.classList.add('drag-over');
  });
  slotEl.addEventListener('dragleave', (e) => {
    if (!slotEl.contains(e.relatedTarget)) slotEl.classList.remove('drag-over');
  });
  slotEl.addEventListener('drop', (e) => {
    e.preventDefault();
    slotEl.classList.remove('drag-over');
    try {
      const food = JSON.parse(e.dataTransfer.getData('application/json'));
      addToPlanner(food, meal);
    } catch { /* ignore invalid payload */ }
  });

  slotEl.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-role="remove"]');
    if (btn) {
      const itemEl = btn.closest('.meal-item');
      const uidVal = itemEl ? itemEl.dataset.uid : null;
      if (!uidVal) return;
      STATE.planner[meal] = STATE.planner[meal].filter((i) => i.uid !== uidVal);
      saveState();
      updatePlanner();
      return;
    }
    const saveBtn = e.target.closest('[data-save-meal]');
    if (saveBtn) {
      import('./saved-meals.js').then((mod) => mod.saveMealFromSlot(meal));
    }
  });

  slotEl.addEventListener('change', (e) => {
    const input = e.target.closest('[data-role="grams"]');
    if (!input) return;
    const itemEl = input.closest('.meal-item');
    const uidVal = itemEl?.dataset.uid;
    const item = (STATE.planner[meal] || []).find((i) => i.uid === uidVal);
    if (!item) return;
    item.servings = clamp(num(input.value) ?? 100, 1, 5000);
    input.value = item.servings;
    saveState();
    updatePlanner();
  });
};

export function initPlanner() {
  const grid = $('#mealGrid');
  if (!grid) return;
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

  on('state:replaced', updatePlanner);
  updatePlanner();
}
