/* ============================================================
   ProtoMacro — saved-meals.js
   Reusable food combinations ("High Protein Breakfast").
   Save from a planner slot or build ad-hoc; one-click logging.
   ============================================================ */
import { escapeHtml, icon, makeId, toast } from './utils.js';
import { STATE, saveState } from './state.js';
import { formModal } from './core/modal.js';
import { addToTracker, updateTracker } from './tracker.js';
import { MEAL_KEYS, itemMacros, updatePlanner } from './planner.js';
import { emit } from './core/bus.js';

export const savedMealById = (id) => STATE.savedMeals.find((m) => m.id === id);

export async function saveMealFromSlot(mealKey) {
  const items = (STATE.planner[mealKey] || []).map((i) => ({ ...i, uid: undefined }));
  if (!items.length) return toast('That meal slot is empty.', 'info');
  const values = await formModal({
    title: `Save ${mealKey} as a meal`,
    fields: [{ id: 'name', label: 'Meal name', type: 'text', placeholder: 'e.g. High Protein Breakfast' }]
  });
  if (!values?.name?.trim()) return;
  STATE.savedMeals.push({
    id: makeId(),
    name: values.name.trim().slice(0, 80),
    createdAt: Date.now(),
    items
  });
  if (STATE.savedMeals.length > 100) STATE.savedMeals = STATE.savedMeals.slice(-100);
  saveState();
  emit('food-data:update');
  toast('Meal saved — find it under Saved Meals', 'success');
}

export async function saveMealAdhoc() {
  const values = await formModal({
    title: 'New saved meal',
    fields: [{ id: 'name', label: 'Meal name', type: 'text', placeholder: 'e.g. High Protein Breakfast' }]
  });
  if (!values?.name?.trim()) return;
  openMealBuilder({ id: makeId(), name: values.name.trim().slice(0, 80), createdAt: Date.now(), items: [] });
}

export function openMealBuilder(meal) {
  const all = [...(window.__FOODS_DB__ || []), ...STATE.customFoods];
  const wrap = document.createElement('div');
  const renderRows = () => {
    wrap.querySelector('[data-rows]').innerHTML = meal.items.map((it, i) => `
      <div class="ingredient-row" data-idx="${i}">
        <select class="form-input" data-role="m-food" aria-label="Food">
          <option value="">— choose —</option>
          ${all.map((f) => `<option value="${escapeHtml(f.id)}"${f.id === it.id ? ' selected' : ''}>${escapeHtml(f.name)}</option>`).join('')}
        </select>
        <input type="number" class="form-input" data-role="m-grams" value="${it.servings ?? 100}" min="1" max="5000" aria-label="Grams" />
        <div class="entity-sub">${Math.round(((it.calories || 0) * (it.servings ?? 100)) / 100)} kcal</div>
        <button type="button" class="icon-btn danger" data-role="m-remove" aria-label="Remove">${icon('x', 13)}</button>
      </div>
    `).join('') || '<p class="entity-sub">Add foods to build this meal.</p>';
  };

  wrap.innerHTML = `<div data-rows></div>
    <div style="text-align:right; margin-top:10px;">
      <button type="button" class="btn btn-ghost btn-sm" data-add>+ Add food</button>
    </div>`;
  renderRows();

  openModal({
    title: `Edit "${meal.name}"`,
    body: wrap,
    wide: true,
    actions: [
      { label: 'Cancel', class: 'btn btn-ghost' },
      {
        label: 'Save Meal',
        class: 'btn btn-primary',
        onClick: () => {
          if (!meal.items.length) {
            toast('Add at least one food.', 'error');
            return false;
          }
          const idx = STATE.savedMeals.findIndex((m) => m.id === meal.id);
          if (idx >= 0) STATE.savedMeals[idx] = meal;
          else STATE.savedMeals.push(meal);
          saveState();
          emit('food-data:update');
          toast('Meal saved', 'success');
        }
      }
    ]
  });

  wrap.querySelector('[data-add]').addEventListener('click', () => {
    meal.items.push({ id: '', name: '', servings: 100 });
    renderRows();
  });
  wrap.addEventListener('click', (e) => {
    const rm = e.target.closest('[data-role="m-remove"]');
    if (rm) {
      meal.items.splice(parseInt(rm.closest('.ingredient-row').dataset.idx, 10), 1);
      renderRows();
    }
  });
  wrap.addEventListener('change', (e) => {
    const row = e.target.closest('.ingredient-row');
    if (!row) return;
    const item = meal.items[parseInt(row.dataset.idx, 10)];
    if (!item) return;
    if (e.target.matches('[data-role="m-food"]')) {
      const f = all.find((x) => x.id === e.target.value);
      if (f) {
        item.id = f.id;
        item.name = f.name;
        item.calories = f.calories;
        item.protein = f.protein;
        item.carbs = f.carbs;
        item.fat = f.fat;
      }
    }
    if (e.target.matches('[data-role="m-grams"]')) item.servings = Math.max(1, parseInt(e.target.value, 10) || 100);
    renderRows();
  });
}

/* One click → all items land in today's tracker */
export const logSavedMeal = (meal) => {
  for (const item of meal.items) {
    STATE.log.push({ ...item, uid: makeId() });
  }
  saveState();
  updateTracker();
  toast(`Logged "${meal.name}" (${meal.items.length} items)`, 'success');
};

export const deleteSavedMeal = (id) => {
  STATE.savedMeals = STATE.savedMeals.filter((m) => m.id !== id);
  STATE.favorites.meals = STATE.favorites.meals.filter((x) => x !== id);
  saveState();
  emit('food-data:update');
};

export const toggleFavoriteMeal = (id) => {
  const list = STATE.favorites.meals;
  const i = list.indexOf(id);
  if (i >= 0) list.splice(i, 1);
  else list.push(id);
  saveState();
  emit('food-data:update');
};

export const loadSavedMealToPlanner = (meal, mealKey) => {
  for (const item of meal.items) {
    STATE.planner[mealKey].push({ ...item, uid: makeId() });
  }
  saveState();
  updatePlanner();
  toast(`Added "${meal.name}" to ${mealKey}`, 'success');
};
