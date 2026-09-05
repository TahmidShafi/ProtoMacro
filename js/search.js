/* ============================================================
   ProtoMacro — search.js
   Hybrid food search, v2:
     - debounced live search (250 ms)
     - ranked local results (favorites > recents > tag/name score)
     - typo tolerance (1-edit for words ≥ 5 chars)
     - USDA FDC fallback when local hits < 3
     - tabs: Results / Favorites / Recent / Recipes / Saved Meals /
       Custom Foods — everything loggable & draggable
   ============================================================ */
import { $, escapeHtml, icon, toast, debounce, makeId, clamp, num } from './utils.js';
import { FOODS_DB } from './foods-db.js';
import { STATE, saveState } from './state.js';
import { addToTracker } from './tracker.js';
import { addToPlanner } from './planner.js';
import { openModal, formModal } from './core/modal.js';
import { openRecipeBuilder, recipeAsFood, addRecipeToPlanner, toggleFavoriteRecipe, deleteRecipe } from './recipes.js';
import { logSavedMeal, loadSavedMealToPlanner, deleteSavedMeal, toggleFavoriteMeal, openMealBuilder } from './saved-meals.js';
import { on, emit } from './core/bus.js';

const LOCAL_LIMIT     = 8;
const USDA_MIN_LOCAL  = 3;
const TIMEOUT_MS      = 8000;
const USDA_URL        = 'https://api.nal.usda.gov/fdc/v1/foods/search';
const MEALS           = ['breakfast', 'lunch', 'dinner', 'snacks'];

/* USDA FoodData Central nutrient IDs (per 100g) */
const NUTRIENT = { calories: 1008, protein: 1003, carbs: 1005, fat: 1004 };

let dom = null;
let lastQuery = '';
let activeTab = 'results';

/* USDA key: user override from Settings beats the public DEMO_KEY */
const usdaKey = () => STATE.settings?.usdaKey?.trim() || 'DEMO_KEY';

/* Expose the DB for cross-module lookups (dashboard recents etc.) */
if (typeof window !== 'undefined') window.__FOODS_DB__ = FOODS_DB;

/* =========================================================
   Local search — ranked against FOODS_DB + custom foods
   ========================================================= */

const allSources = () => [
  ...STATE.customFoods.map((f) => ({ ...f, source: 'custom' })),
  ...FOODS_DB.map((f) => ({ ...f, source: 'local' }))
];

const levenshtein1 = (a, b) => {
  /* true if a and b are within one edit (substitution/insert/delete) */
  if (a === b) return true;
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0, j = 0, edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { i++; j++; continue; }
    if (++edits > 1) return false;
    if (a.length === b.length) { i++; j++; }
    else if (a.length > b.length) i++;
    else j++;
  }
  return true;
};

const scoreLocal = (food, queryLc, favSet, recentRank) => {
  let score = 0;
  const name = food.name.toLowerCase();
  const tags = (food.tags || []).map((t) => t.toLowerCase());

  if (name.startsWith(queryLc))          score += 8;
  else if (name.includes(queryLc))       score += 5;
  if (tags.includes(queryLc))            score += 4;

  /* word-level match with typo tolerance for longer words */
  for (const word of name.split(/[^a-z]+/)) {
    if (!word) continue;
    if (word === queryLc) { score += 6; break; }
    if (queryLc.length >= 5 && word.length >= 5 && levenshtein1(word, queryLc)) {
      score += 3;
      break;
    }
  }

  if (favSet.has(food.id)) score += 10;
  if (recentRank > 0) score += Math.max(0, 5 - recentRank);
  return score;
};

const searchLocal = (query) => {
  const q = query.toLowerCase().trim();
  const favSet = new Set(STATE.favorites.foods);
  const recentIdx = new Map(STATE.recents.map((r, i) => [r.id, i]));

  const hits = [];
  for (const food of allSources()) {
    const score = scoreLocal(food, q, favSet, recentIdx.get(food.id) ?? -1);
    if (score > 0) hits.push({ food, score });
  }
  return hits
    .sort((a, b) => b.score - a.score)
    .slice(0, LOCAL_LIMIT)
    .map((h) => ({ ...h.food, source: h.food.source === 'custom' ? 'custom' : 'local' }));
};

/* =========================================================
   USDA FoodData Central fetch
   ========================================================= */

const fetchWithTimeout = (url, ms) => {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  return fetch(url, { signal: ctrl.signal }).finally(() => clearTimeout(timer));
};

const pickNutrient = (nutrients, id) => {
  const n = nutrients.find((x) => x.nutrientId === id);
  return n ? n.value : undefined;
};

const normalizeUsda = (item) => {
  const nutrients = item.foodNutrients || [];
  const calories  = pickNutrient(nutrients, NUTRIENT.calories);
  if (calories === undefined || calories === 0) return null;

  const protein = pickNutrient(nutrients, NUTRIENT.protein) ?? 0;
  const carbs   = pickNutrient(nutrients, NUTRIENT.carbs)   ?? 0;
  const fat     = pickNutrient(nutrients, NUTRIENT.fat)     ?? 0;

  return {
    id: 'usda_api_' + item.fdcId,
    name: item.description,
    brand: 'USDA Live',
    calories: Math.round(calories),
    protein: Math.round(protein * 10) / 10,
    carbs:   Math.round(carbs   * 10) / 10,
    fat:     Math.round(fat     * 10) / 10,
    tags: [],
    source: 'usda'
  };
};

const searchUsda = async (query) => {
  const url = `${USDA_URL}?query=${encodeURIComponent(query)}&api_key=${encodeURIComponent(usdaKey())}&pageSize=6&dataType=Foundation,SR%20Legacy`;
  try {
    const res = await fetchWithTimeout(url, TIMEOUT_MS);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    return (data.foods || []).map(normalizeUsda).filter(Boolean);
  } catch (err) {
    /* timeout / network / rate-limit — local DB still covers the app */
    console.warn('[ProtoMacro] USDA search unavailable:', err.name || err.message);
    if (lastQuery === query && activeTab === 'results') {
      toast('USDA lookup unavailable — showing local results.', 'info');
    }
    return [];
  }
};

/* =========================================================
   Dedupe (local first wins on name collision)
   ========================================================= */

const normName = (n) => n.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

const mergeResults = (local, api) => {
  const seen = new Set(local.map((f) => normName(f.name)));
  const extras = api.filter((f) => {
    const key = normName(f.name);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return [...local, ...extras];
};

/* =========================================================
   Rendering
   ========================================================= */

const sourceBadge = (source) => {
  const cls = source === 'custom' ? 'custom' : source === 'recipe' ? 'recipe' : '';
  const label = source === 'custom' ? 'Custom' : source === 'recipe' ? 'Recipe' : source === 'local' ? 'Local' : 'USDA';
  return `<span class="source-chip ${cls}">${label}</span>`;
};

const renderCard = (food) => {
  const el = document.createElement('div');
  el.className = 'food-card';
  el.draggable = true;
  el.dataset.food = JSON.stringify(food);
  const isFav = STATE.favorites.foods.includes(food.id);
  el.innerHTML = `
    <button type="button" class="fav-btn${isFav ? ' active' : ''}" data-action="fav" aria-label="${isFav ? 'Unfavorite' : 'Favorite'} ${escapeHtml(food.name)}" title="${isFav ? 'Remove from favorites' : 'Add to favorites'}">${icon('star', 15, 2.2)}</button>
    <div class="food-card-head">
      <div class="food-card-head-main">
        <div class="food-card-name">${escapeHtml(food.name)}</div>
        <div class="food-card-brand">
          ${sourceBadge(food.source)}
          ${food.brand ? `<span class="food-card-brand-text">· ${escapeHtml(food.brand)}</span>` : ''}
        </div>
      </div>
      <div class="food-card-cal">${food.calories} kcal</div>
    </div>
    <div class="food-card-macros">
      <div class="food-macro p"><div class="food-macro-dot"></div><div class="food-macro-label">Protein</div><div class="food-macro-val">${food.protein}g</div></div>
      <div class="food-macro c"><div class="food-macro-dot"></div><div class="food-macro-label">Carbs</div><div class="food-macro-val">${food.carbs}g</div></div>
      <div class="food-macro f"><div class="food-macro-dot"></div><div class="food-macro-label">Fat</div><div class="food-macro-val">${food.fat}g</div></div>
    </div>
    <div class="food-card-note">Values per 100g</div>
    <div class="food-card-foot">
      <button class="btn btn-primary btn-sm" data-action="track">${icon('plus', 13, 2.5)} Add to Tracker</button>
      <button class="btn btn-ghost btn-sm" data-action="plan" title="Add to a meal slot" aria-label="Add to meal">${icon('target', 13, 2)}</button>
      ${food.source === 'custom' ? `<button class="btn btn-ghost btn-sm" data-action="edit-custom" aria-label="Edit custom food">${icon('edit', 13, 2)}</button>` : ''}
    </div>
  `;
  return el;
};

const rowHtml = ({ id, name, sub, badge, actions, payload }) => `
  <div class="food-row" ${payload ? `data-payload='${escapeHtml(payload)}'` : ''}>
    ${badge || ''}
    <span class="food-row-name">${escapeHtml(name)}</span>
    <span class="food-row-macros">${sub}</span>
    ${actions}
  </div>
`;

const renderFavorites = () => {
  const foods = STATE.favorites.foods
    .map((id) => allSources().find((f) => f.id === id) || null)
    .filter(Boolean);
  const recipes = STATE.recipes.filter((r) => STATE.favorites.recipes.includes(r.id));
  const meals = STATE.savedMeals.filter((m) => STATE.favorites.meals.includes(m.id));

  if (!foods.length && !recipes.length && !meals.length) {
    dom.results.innerHTML = '<div class="empty-state"><div class="empty-state-icon">⭐</div><div class="empty-state-title">No favorites yet</div><div>Tap the star on any food, recipe or meal to pin it here.</div></div>';
    return;
  }

  dom.results.innerHTML = `
    <div class="food-row-list">
      ${foods.map((f) => rowHtml({
        name: f.name, badge: sourceBadge(f.source),
        sub: `${f.calories} kcal · ${f.protein}g P`,
        actions: `<button class="btn btn-primary btn-sm" data-row-track="${escapeHtml(f.id)}">+ Log</button>`
      })).join('')}
      ${recipes.map((r) => rowHtml({
        name: r.name, badge: '<span class="source-chip recipe">Recipe</span>',
        sub: `${r.perServing.calories} kcal/serving · ${r.perServing.protein}g P`,
        actions: `<button class="btn btn-primary btn-sm" data-row-recipe="${r.id}">+ Log</button>`
      })).join('')}
      ${meals.map((m) => rowHtml({
        name: m.name, badge: '<span class="source-chip">Meal</span>',
        sub: `${m.items.length} items`,
        actions: `<button class="btn btn-primary btn-sm" data-row-meal="${m.id}">+ Log</button>`
      })).join('')}
    </div>
  `;
};

const renderRecent = () => {
  const rows = STATE.recents
    .map((r) => allSources().find((f) => f.id === r.id))
    .filter(Boolean)
    .slice(0, 12);

  if (!rows.length) {
    dom.results.innerHTML = '<div class="empty-state"><div class="empty-state-icon">🕘</div><div class="empty-state-title">No recent foods yet</div><div>Foods you log appear here for one-tap re-logging.</div></div>';
    return;
  }
  dom.results.innerHTML = `<div class="food-row-list">
    ${rows.map((f) => rowHtml({
      name: f.name, badge: sourceBadge(f.source),
      sub: `${f.calories} kcal · ${f.protein}g P /100g`,
      actions: `<button class="btn btn-primary btn-sm" data-row-track="${escapeHtml(f.id)}">+ Log</button>`
    })).join('')}
  </div>`;
};

const renderRecipes = () => {
  if (!STATE.recipes.length) {
    dom.results.innerHTML = '<div class="empty-state"><div class="empty-state-icon">🍲</div><div class="empty-state-title">No recipes yet</div><div>Create one with "Custom Food" ▸ New Recipe — combine ingredients, set servings, log per serving.</div></div>';
    return;
  }
  dom.results.innerHTML = `<div class="food-row-list">
    ${STATE.recipes.map((r) => {
      const fav = STATE.favorites.recipes.includes(r.id);
      return rowHtml({
        name: r.name, badge: '<span class="source-chip recipe">Recipe</span>',
        sub: `${r.perServing.calories} kcal · ${r.perServing.protein}g P · ${r.items.length} ingredients`,
        actions: `
          <button class="icon-btn${fav ? ' active' : ''}" data-recipe-fav="${r.id}" aria-label="Favorite">${icon('star', 14, 2.2)}</button>
          <button class="btn btn-ghost btn-sm" data-recipe-edit="${r.id}">Edit</button>
          <button class="btn btn-primary btn-sm" data-row-recipe="${r.id}">+ Log</button>
          <button class="icon-btn danger" data-recipe-del="${r.id}" aria-label="Delete recipe">${icon('trash', 13)}</button>`
      });
    }).join('')}
  </div>`;
};

const renderSavedMeals = () => {
  if (!STATE.savedMeals.length) {
    dom.results.innerHTML = '<div class="empty-state"><div class="empty-state-icon">🍱</div><div class="empty-state-title">No saved meals yet</div><div>Build a meal in the planner, then hit "Save meal" on a slot — or create one here.</div></div>';
    return;
  }
  dom.results.innerHTML = `<div class="food-row-list">
    ${STATE.savedMeals.map((m) => {
      const fav = STATE.favorites.meals.includes(m.id);
      return rowHtml({
        name: m.name, badge: '<span class="source-chip">Saved meal</span>',
        sub: `${m.items.length} items`,
        actions: `
          <button class="icon-btn${fav ? ' active' : ''}" data-meal-fav="${m.id}" aria-label="Favorite">${icon('star', 14, 2.2)}</button>
          <button class="btn btn-ghost btn-sm" data-meal-edit="${m.id}">Edit</button>
          <button class="btn btn-primary btn-sm" data-row-meal="${m.id}">+ Log</button>
          <button class="icon-btn danger" data-meal-del="${m.id}" aria-label="Delete meal">${icon('trash', 13)}</button>`
      });
    }).join('')}
  </div>`;
};

const renderCustom = () => {
  if (!STATE.customFoods.length) {
    dom.results.innerHTML = '<div class="empty-state"><div class="empty-state-icon">✏️</div><div class="empty-state-title">No custom foods yet</div><div>Create foods you eat often that aren\'t in the database.</div></div>';
    return;
  }
  dom.results.innerHTML = `<div class="food-row-list">
    ${STATE.customFoods.map((f) => {
      const fav = STATE.favorites.foods.includes(f.id);
      return rowHtml({
        name: f.name, badge: '<span class="source-chip custom">Custom</span>',
        sub: `${f.calories} kcal · ${f.protein}g P /100g`,
        actions: `
          <button class="icon-btn${fav ? ' active' : ''}" data-food-fav="${escapeHtml(f.id)}" aria-label="Favorite">${icon('star', 14, 2.2)}</button>
          <button class="btn btn-ghost btn-sm" data-custom-edit="${escapeHtml(f.id)}">Edit</button>
          <button class="btn btn-primary btn-sm" data-row-track="${escapeHtml(f.id)}">+ Log</button>
          <button class="icon-btn danger" data-custom-del="${escapeHtml(f.id)}" aria-label="Delete custom food">${icon('trash', 13)}</button>`
      });
    }).join('')}
  </div>`;
};

const renderResults = (foods) => {
  const frag = document.createDocumentFragment();
  foods.forEach((f) => frag.appendChild(renderCard(f)));
  dom.results.innerHTML = '';
  dom.results.appendChild(frag);
};

const renderSpinner = () => {
  dom.results.innerHTML = '<div class="loading-wrap"><div class="spinner"></div><div class="entity-sub" style="margin-top:10px;">Searching USDA…</div></div>';
};

const renderEmpty = (query) => {
  const q = escapeHtml(query);
  dom.results.innerHTML = `
    <div class="empty-state">
      <div class="empty-state-icon">&#128373;</div>
      <div class="empty-state-title">No results found for '${q}'.</div>
      <div>Try: <em>chicken, beef, rice, banana</em> — or create it as a custom food.</div>
    </div>
  `;
};

const renderTab = () => {
  if (activeTab === 'results') return true; /* caller renders */
  if (activeTab === 'favorites') renderFavorites();
  else if (activeTab === 'recent') renderRecent();
  else if (activeTab === 'recipes') renderRecipes();
  else if (activeTab === 'meals') renderSavedMeals();
  else if (activeTab === 'custom') renderCustom();
  return false;
};

/* =========================================================
   Main search orchestrator
   ========================================================= */

const runSearch = async (query) => {
  lastQuery = query;
  if (activeTab !== 'results') {
    activeTab = 'results';
    dom.tabs.querySelectorAll('.search-tab').forEach((t) => t.classList.toggle('active', t.dataset.tab === 'results'));
  }

  const local = searchLocal(query);
  if (local.length >= USDA_MIN_LOCAL) {
    renderResults(local);
    return;
  }

  if (local.length > 0) renderResults(local);
  else renderSpinner();

  const api = await searchUsda(query);
  if (lastQuery !== query || activeTab !== 'results') return;

  const merged = mergeResults(local, api);
  if (!merged.length) {
    renderEmpty(query);
    return;
  }
  renderResults(merged);
};
const debouncedSearch = debounce((q) => {
  if (q.trim().length >= 2) runSearch(q.trim());
}, 250);

/* =========================================================
   Custom food create/edit
   ========================================================= */

const customFoodModal = async (existing = null) => {
  const values = await formModal({
    title: existing ? 'Edit custom food' : 'New custom food',
    fields: [
      { id: 'name', label: 'Name', type: 'text', value: existing?.name ?? '', placeholder: 'e.g. Mom\'s khichuri' },
      { id: 'calories', label: 'Calories (per 100g)', type: 'number', value: existing?.calories ?? '', min: 0, max: 1000 },
      { id: 'protein', label: 'Protein g (per 100g)', type: 'number', value: existing?.protein ?? '', min: 0, max: 100, step: 0.1 },
      { id: 'carbs', label: 'Carbs g (per 100g)', type: 'number', value: existing?.carbs ?? '', min: 0, max: 100, step: 0.1 },
      { id: 'fat', label: 'Fat g (per 100g)', type: 'number', value: existing?.fat ?? '', min: 0, max: 100, step: 0.1 }
    ]
  });
  if (!values || !values.name?.trim()) return;

  const food = {
    id: existing?.id ?? 'custom_' + makeId(),
    name: values.name.trim().slice(0, 120),
    brand: 'Custom',
    calories: clamp(num(values.calories) ?? 0, 0, 1000),
    protein: clamp(num(values.protein) ?? 0, 0, 100),
    carbs: clamp(num(values.carbs) ?? 0, 0, 100),
    fat: clamp(num(values.fat) ?? 0, 0, 100),
    tags: [],
    source: 'custom'
  };
  if (existing) {
    const i = STATE.customFoods.findIndex((f) => f.id === existing.id);
    if (i >= 0) STATE.customFoods[i] = food;
  } else {
    STATE.customFoods.push(food);
    if (STATE.customFoods.length > 200) STATE.customFoods = STATE.customFoods.slice(-200);
  }
  saveState();
  emit('food-data:update');
  if (activeTab === 'custom') renderCustom();
  else runSearch(dom.input.value.trim() || food.name);
  toast(existing ? 'Custom food updated' : 'Custom food saved', 'success');
};

/* =========================================================
   Meal slot picker (replaces prompt())
   ========================================================= */

const mealSlotPicker = async (label) => {
  const values = await formModal({
    title: `Add "${label}" to…`,
    fields: [{
      id: 'meal', label: 'Meal slot', type: 'select',
      options: [
        { value: 'breakfast', label: '🌅 Breakfast' },
        { value: 'lunch', label: '🌞 Lunch' },
        { value: 'dinner', label: '🌆 Dinner' },
        { value: 'snacks', label: '🍎 Snacks' }
      ]
    }]
  });
  return values?.meal ?? null;
};

const rememberRecent = (food) => {
  if (!food?.id || food.source === 'usda') return;
  STATE.recents = [
    { id: food.id, ts: Date.now() },
    ...STATE.recents.filter((r) => r.id !== food.id)
  ].slice(0, 30);
};

const toggleFoodFav = (food) => {
  const list = STATE.favorites.foods;
  const i = list.indexOf(food.id);
  if (i >= 0) list.splice(i, 1);
  else list.push(food.id);
  saveState();
  emit('food-data:update');
  if (activeTab === 'results') {
    /* refresh star state */
    runSearch(lastQuery || dom.input.value.trim());
  } else {
    renderTab();
  }
};

const findFoodById = (id) =>
  allSources().find((f) => f.id === id);

/* =========================================================
   Event delegation
   ========================================================= */

const bindEvents = () => {
  dom.form.addEventListener('submit', (e) => {
    e.preventDefault();
    const q = dom.input.value.trim();
    if (!q) return toast('Please enter a search term.', 'error');
    runSearch(q);
  });

  /* live search */
  dom.input.addEventListener('input', () => debouncedSearch(dom.input.value));

  dom.tabs.addEventListener('click', (e) => {
    const tab = e.target.closest('.search-tab');
    if (!tab) return;
    activeTab = tab.dataset.tab;
    dom.tabs.querySelectorAll('.search-tab').forEach((t) => t.classList.toggle('active', t === tab));
    if (activeTab === 'results') {
      if (dom.input.value.trim()) runSearch(dom.input.value.trim());
      else dom.results.innerHTML = '<div class="empty-state"><div class="empty-state-icon">🔍</div><div class="empty-state-title">Start typing to find foods</div><div>Try: <em>chicken breast, oats, banana, dal</em></div></div>';
    } else if (!renderTab()) {
      /* fall through */
    }
  });

  $('#createFoodBtn')?.addEventListener('click', () => customFoodModal());

  dom.results.addEventListener('click', async (e) => {
    /* --- recipe actions --- */
    const rEdit = e.target.closest('[data-recipe-edit]');
    if (rEdit) {
      openRecipeBuilder(STATE.recipes.find((r) => r.id === rEdit.dataset.recipeEdit));
      return;
    }
    const rFav = e.target.closest('[data-recipe-fav]');
    if (rFav) { toggleFavoriteRecipe(rFav.dataset.recipeFav); return; }
    const rDel = e.target.closest('[data-recipe-del]');
    if (rDel) {
      deleteRecipe(rDel.dataset.recipeDel);
      toast('Recipe deleted', 'info');
      return;
    }
    const rLog = e.target.closest('[data-row-recipe]');
    if (rLog) {
      const recipe = STATE.recipes.find((r) => r.id === rLog.dataset.rowRecipe);
      if (recipe) {
        const meal = await mealSlotPicker(`${recipe.name} (1 serving)`);
        if (meal) addRecipeToPlanner(recipe, meal);
      }
      return;
    }

    /* --- saved meal actions --- */
    const mEdit = e.target.closest('[data-meal-edit]');
    if (mEdit) {
      openMealBuilder(STATE.savedMeals.find((m) => m.id === mEdit.dataset.mealEdit));
      return;
    }
    const mFav = e.target.closest('[data-meal-fav]');
    if (mFav) { toggleFavoriteMeal(mFav.dataset.mealFav); return; }
    const mDel = e.target.closest('[data-meal-del]');
    if (mDel) {
      deleteSavedMeal(mDel.dataset.mealDel);
      toast('Saved meal deleted', 'info');
      return;
    }
    const mLog = e.target.closest('[data-row-meal]');
    if (mLog) {
      const meal = STATE.savedMeals.find((m) => m.id === mLog.dataset.rowMeal);
      if (meal) {
        const choice = await formModal({
          title: `Log "${meal.name}"`,
          fields: [{
            id: 'where', label: 'Where?', type: 'select',
            options: [
              { value: 'tracker', label: "Log in today's tracker" },
              { value: 'breakfast', label: 'Add to Breakfast plan' },
              { value: 'lunch', label: 'Add to Lunch plan' },
              { value: 'dinner', label: 'Add to Dinner plan' },
              { value: 'snacks', label: 'Add to Snacks plan' }
            ]
          }]
        });
        if (!choice) return;
        if (choice.where === 'tracker') logSavedMeal(meal);
        else loadSavedMealToPlanner(meal, choice.where);
      }
      return;
    }

    /* --- custom food actions --- */
    const cEdit = e.target.closest('[data-custom-edit]');
    if (cEdit) {
      customFoodModal(STATE.customFoods.find((f) => f.id === cEdit.dataset.customEdit));
      return;
    }
    const cDel = e.target.closest('[data-custom-del]');
    if (cDel) {
      STATE.customFoods = STATE.customFoods.filter((f) => f.id !== cDel.dataset.customDel);
      STATE.favorites.foods = STATE.favorites.foods.filter((x) => x !== cDel.dataset.customDel);
      saveState();
      emit('food-data:update');
      renderCustom();
      toast('Custom food deleted', 'info');
      return;
    }
    const foodFav = e.target.closest('[data-food-fav]');
    if (foodFav) {
      const food = findFoodById(foodFav.dataset.foodFav);
      if (food) toggleFoodFav(food);
      return;
    }

    /* --- direct row log (favorites/recent tabs) --- */
    const rowTrack = e.target.closest('[data-row-track]');
    if (rowTrack) {
      const food = findFoodById(rowTrack.dataset.rowTrack);
      if (food) {
        addToTracker(food);
        rememberRecent(food);
      }
      return;
    }

    /* --- food card actions (results tab) --- */
    const btn = e.target.closest('button[data-action]');
    if (!btn) return;
    const card = btn.closest('.food-card');
    let food;
    try {
      food = JSON.parse(card.dataset.food);
    } catch {
      return;
    }

    if (btn.dataset.action === 'fav') {
      toggleFoodFav(food);
    } else if (btn.dataset.action === 'track') {
      addToTracker(food);
      rememberRecent(food);
    } else if (btn.dataset.action === 'plan') {
      const meal = await mealSlotPicker(food.name);
      if (meal) {
        addToPlanner(food, meal);
        rememberRecent(food);
      }
    } else if (btn.dataset.action === 'edit-custom') {
      customFoodModal(food);
    }
  });

  dom.results.addEventListener('dragstart', (e) => {
    const card = e.target.closest('.food-card');
    if (!card) return;
    card.classList.add('dragging');
    e.dataTransfer.setData('application/json', card.dataset.food);
    e.dataTransfer.effectAllowed = 'copy';
  });

  dom.results.addEventListener('dragend', (e) => {
    const card = e.target.closest('.food-card');
    if (card) card.classList.remove('dragging');
  });

  on('food-data:update', () => {
    if (activeTab !== 'results') renderTab();
  });
};

export function initSearch() {
  dom = {
    form:    $('#searchForm'),
    input:   $('#searchInput'),
    results: $('#searchResults'),
    tabs:    $('#searchTabs')
  };
  if (!dom.form) return;
  bindEvents();
}
