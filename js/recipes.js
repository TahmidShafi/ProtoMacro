/* ============================================================
   ProtoMacro — recipes.js
   Recipe builder: combine ingredients (grams each) into a
   recipe with N servings → per-serving macros. Recipes are
   searchable/loggable like normal foods.
   ============================================================ */
import { escapeHtml, icon, makeId, toast, num, clamp } from './utils.js';
import { STATE, saveState } from './state.js';
import { openModal, formModal } from './core/modal.js';
import { addToTracker } from './tracker.js';
import { addToPlanner } from './planner.js';
import { FOODS_DB } from './foods-db.js';
import { emit } from './core/bus.js';

const allFoods = () => [...(window.__FOODS_DB__ || FOODS_DB), ...STATE.customFoods];

export const recipeById = (id) => STATE.recipes.find((r) => r.id === id);

const recompute = (recipe) => {
  const totals = recipe.items.reduce(
    (t, i) => ({
      calories: t.calories + (i.per100.calories * i.grams) / 100,
      protein: t.protein + (i.per100.protein * i.grams) / 100,
      carbs: t.carbs + (i.per100.carbs * i.grams) / 100,
      fat: t.fat + (i.per100.fat * i.grams) / 100
    }),
    { calories: 0, protein: 0, carbs: 0, fat: 0 }
  );
  const totalGrams = recipe.items.reduce((s, i) => s + i.grams, 0);
  recipe.perServing = {
    calories: Math.round(totals.calories / recipe.servings),
    protein: +(totals.protein / recipe.servings).toFixed(1),
    carbs: +(totals.carbs / recipe.servings).toFixed(1),
    fat: +(totals.fat / recipe.servings).toFixed(1),
    gramsPerServing: Math.round(totalGrams / recipe.servings)
  };
  recipe.updatedAt = Date.now();
};

const ingredientRowHtml = (item, idx) => `
  <div class="ingredient-row" data-idx="${idx}">
    <select class="form-input" data-role="ing-name" aria-label="Ingredient">
      <option value="">— choose —</option>
      ${allFoods().map((f) => `<option value="${escapeHtml(f.id)}"${f.id === item.foodId ? ' selected' : ''}>${escapeHtml(f.name)}</option>`).join('')}
    </select>
    <input type="number" class="form-input" data-role="ing-grams" value="${item.grams}" min="1" max="5000" aria-label="Grams" />
    <div class="entity-sub" data-role="ing-macros">${item.per100 ? `${Math.round((item.per100.calories * item.grams) / 100)} kcal` : '—'}</div>
    <button type="button" class="icon-btn danger" data-role="ing-remove" aria-label="Remove ingredient">${icon('x', 13)}</button>
  </div>
`;

export function openRecipeBuilder(existing = null) {
  const recipe = existing
    ? JSON.parse(JSON.stringify(existing))
    : { id: makeId(), name: '', servings: 1, items: [], createdAt: Date.now() };

  const wrap = document.createElement('div');
  const renderRows = () => {
    wrap.querySelector('[data-rows]').innerHTML =
      recipe.items.map((it, i) => ingredientRowHtml(it, i)).join('') ||
      '<p class="entity-sub">Add ingredients below. Pick a food, set grams — macros are computed automatically.</p>';
    wrap.querySelector('[data-total]').textContent = recipe.items.length
      ? `${recipe.items.length} ingredient${recipe.items.length > 1 ? 's' : ''}`
      : 'No ingredients yet';
  };

  wrap.innerHTML = `
    <div class="form-group full">
      <label class="form-label" for="recipeName">Recipe name</label>
      <input class="form-input" id="recipeName" value="${escapeHtml(recipe.name)}" placeholder="e.g. Chicken curry" />
    </div>
    <div class="form-group full">
      <label class="form-label" for="recipeServings">Servings (portions)</label>
      <input type="number" class="form-input" id="recipeServings" value="${recipe.servings}" min="1" max="50" />
    </div>
    <div data-rows></div>
    <div style="display:flex; justify-content:space-between; align-items:center; margin:10px 0;">
      <span class="entity-sub" data-total></span>
      <button type="button" class="btn btn-ghost btn-sm" data-add-ingredient>+ Add ingredient</button>
    </div>
  `;
  renderRows();

  const modal = openModal({
    title: existing ? 'Edit recipe' : 'New recipe',
    body: wrap,
    wide: true,
    actions: [
      { label: 'Cancel', class: 'btn btn-ghost' },
      {
        label: 'Save Recipe',
        class: 'btn btn-primary',
        onClick: () => {
          recipe.name = wrap.querySelector('#recipeName').value.trim();
          recipe.servings = clamp(num(wrap.querySelector('#recipeServings').value) || 1, 1, 50);
          if (!recipe.name) {
            toast('Give the recipe a name.', 'error');
            return false;
          }
          if (!recipe.items.length) {
            toast('Add at least one ingredient.', 'error');
            return false;
          }
          recompute(recipe);
          const idx = STATE.recipes.findIndex((r) => r.id === recipe.id);
          if (idx >= 0) STATE.recipes[idx] = recipe;
          else STATE.recipes.push(recipe);
          if (STATE.recipes.length > 100) STATE.recipes = STATE.recipes.slice(-100);
          saveState();
          emit('food-data:update');
          toast(`Recipe "${recipe.name}" saved`, 'success');
        }
      }
    ]
  });

  wrap.querySelector('[data-add-ingredient]').addEventListener('click', () => {
    recipe.items.push({ foodId: '', name: '', grams: 100, per100: null });
    renderRows();
    const rows = wrap.querySelectorAll('.ingredient-row');
    rows[rows.length - 1]?.scrollIntoView({ block: 'nearest' });
  });

  wrap.addEventListener('click', (e) => {
    const rm = e.target.closest('[data-role="ing-remove"]');
    if (rm) {
      recipe.items.splice(parseInt(rm.closest('.ingredient-row').dataset.idx, 10), 1);
      renderRows();
    }
  });

  wrap.addEventListener('change', (e) => {
    const row = e.target.closest('.ingredient-row');
    if (!row) return;
    const idx = parseInt(row.dataset.idx, 10);
    const item = recipe.items[idx];
    if (!item) return;

    if (e.target.matches('[data-role="ing-name"]')) {
      const food = allFoods().find((f) => f.id === e.target.value);
      if (food) {
        item.foodId = food.id;
        item.name = food.name;
        item.per100 = {
          calories: food.calories, protein: food.protein,
          carbs: food.carbs, fat: food.fat
        };
      }
    }
    if (e.target.matches('[data-role="ing-grams"]')) {
      item.grams = clamp(num(e.target.value) || 100, 1, 5000);
    }
    row.querySelector('[data-role="ing-macros"]').textContent = item.per100
      ? `${Math.round((item.per100.calories * item.grams) / 100)} kcal`
      : '—';
  });
  void modal;
}

/* A recipe as a loggable food item (one serving) */
export const recipeAsFood = (recipe) => ({
  id: 'recipe_' + recipe.id,
  name: `${recipe.name} (1 serving)`,
  brand: 'Recipe',
  calories: recipe.perServing.calories,
  protein: recipe.perServing.protein,
  carbs: recipe.perServing.carbs,
  fat: recipe.perServing.fat,
  source: 'recipe'
});

export const addRecipeToTracker = (recipe) => {
  addToTracker(recipeAsFood(recipe));
};

export const addRecipeToPlanner = async (recipe) => {
  const values = await formModal({
    title: `Add "${recipe.name}" to…`,
    fields: [{
      id: 'meal',
      label: 'Meal slot',
      type: 'select',
      options: [
        { value: 'breakfast', label: 'Breakfast' },
        { value: 'lunch', label: 'Lunch' },
        { value: 'dinner', label: 'Dinner' },
        { value: 'snacks', label: 'Snacks' }
      ]
    }]
  });
  if (!values) return;
  const food = recipeAsFood(recipe);
  /* a serving = gramsPerServing grams of the blended recipe */
  addToPlanner({ ...food, servings: recipe.perServing.gramsPerServing || 100 }, values.meal);
};

export const deleteRecipe = (id) => {
  STATE.recipes = STATE.recipes.filter((r) => r.id !== id);
  STATE.favorites.recipes = STATE.favorites.recipes.filter((x) => x !== id);
  saveState();
  emit('food-data:update');
};

export const toggleFavoriteRecipe = (id) => {
  const list = STATE.favorites.recipes;
  const i = list.indexOf(id);
  if (i >= 0) list.splice(i, 1);
  else list.push(id);
  saveState();
  emit('food-data:update');
};
