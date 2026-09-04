/* ============================================================
   ProtoMacro — search.js
   Hybrid food search:
     1. Search local FOODS_DB (always)
     2. If local results < 3, augment with USDA FoodData Central
     3. Dedupe + render, local results first
   ============================================================ */
import { $, escapeHtml, icon, toast } from './utils.js';
import { FOODS_DB } from './foods-db.js';
import { addToTracker } from './tracker.js';
import { addToPlanner } from './planner.js';

const LOCAL_LIMIT     = 6;
const USDA_MIN_LOCAL  = 3;
const TIMEOUT_MS      = 8000;
const USDA_URL        = 'https://api.nal.usda.gov/fdc/v1/foods/search';
const USDA_KEY        = 'DEMO_KEY';
const MEALS           = ['breakfast', 'lunch', 'dinner', 'snacks'];

/* USDA FoodData Central nutrient IDs (per 100g) */
const NUTRIENT = { calories: 1008, protein: 1003, carbs: 1005, fat: 1004 };

let dom = null;
let lastQuery = '';

/* =========================================================
   Local search — scored against FOODS_DB
   ========================================================= */

const scoreLocal = (food, queryLc) => {
  let score = 0;
  const name = food.name.toLowerCase();
  const tags = (food.tags || []).map((t) => t.toLowerCase());

  if (tags.includes(queryLc))    score += 3;   // exact tag match
  if (name.startsWith(queryLc))  score += 2;   // name starts with query
  if (name.includes(queryLc))    score += 1;   // name includes query

  return score;
};

const searchLocal = (query) => {
  const q = query.toLowerCase();
  const hits = [];
  for (const food of FOODS_DB) {
    const score = scoreLocal(food, q);
    if (score > 0) hits.push({ food, score });
  }
  return hits
    .sort((a, b) => b.score - a.score)
    .slice(0, LOCAL_LIMIT)
    .map((h) => ({ ...h.food, source: 'local' }));
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

  // Skip USDA entries without usable calorie data
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
  const url = `${USDA_URL}?query=${encodeURIComponent(query)}&api_key=${USDA_KEY}&pageSize=6&dataType=Foundation,SR%20Legacy`;
  try {
    const res = await fetchWithTimeout(url, TIMEOUT_MS);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    return (data.foods || []).map(normalizeUsda).filter(Boolean);
  } catch (err) {
    console.warn('[ProtoMacro] USDA search failed:', err.name || err.message);
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

const badgeHtml = (source) => source === 'local'
  ? '<span class="food-card-source local">Local</span>'
  : '<span class="food-card-source usda">USDA</span>';

const renderCard = (food) => {
  const el = document.createElement('div');
  el.className = 'food-card';
  el.draggable = true;
  el.dataset.food = JSON.stringify(food);
  el.innerHTML = `
    <div class="food-card-head">
      <div class="food-card-head-main">
        <div class="food-card-name">${escapeHtml(food.name)}</div>
        <div class="food-card-brand">
          ${badgeHtml(food.source)}
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
    </div>
  `;
  return el;
};

const renderResults = (foods) => {
  const frag = document.createDocumentFragment();
  foods.forEach((f) => frag.appendChild(renderCard(f)));
  dom.results.innerHTML = '';
  dom.results.appendChild(frag);
};

const renderSpinner = () => {
  dom.results.innerHTML = '<div class="loading-wrap"><div class="spinner"></div></div>';
};

const renderEmpty = (query) => {
  const q = escapeHtml(query);
  dom.results.innerHTML = `
    <div class="empty-state">
      <div class="empty-state-icon">&#128373;</div>
      <div class="empty-state-title">No results found for '${q}'.</div>
      <div>Try: <em>chicken, beef, rice, banana</em></div>
    </div>
  `;
};

/* =========================================================
   Main search orchestrator
   ========================================================= */

const runSearch = async (query) => {
  lastQuery = query;

  const local = searchLocal(query);

  // Enough local hits — render instantly, skip the API call
  if (local.length >= USDA_MIN_LOCAL) {
    renderResults(local);
    return;
  }

  // Otherwise show what we have (if any) and spin while USDA loads
  if (local.length > 0) {
    renderResults(local);
  } else {
    renderSpinner();
  }

  const api = await searchUsda(query);
  if (lastQuery !== query) return; // user typed something else mid-flight

  const merged = mergeResults(local, api);
  if (!merged.length) {
    renderEmpty(query);
    return;
  }
  renderResults(merged);
};

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

  dom.results.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-action]');
    if (!btn) return;
    const card = btn.closest('.food-card');
    let food;
    try {
      food = JSON.parse(card.dataset.food);
    } catch {
      return; // malformed payload — ignore
    }

    if (btn.dataset.action === 'track') {
      addToTracker(food);
    } else if (btn.dataset.action === 'plan') {
      const meal = prompt('Add to which meal? (breakfast, lunch, dinner, snacks)', 'lunch');
      if (!meal) return;
      const key = meal.toLowerCase().trim();
      if (!MEALS.includes(key)) {
        toast('Invalid meal. Use breakfast, lunch, dinner, or snacks.', 'error');
        return;
      }
      addToPlanner(food, key);
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
};

export function initSearch() {
  dom = {
    form:    $('#searchForm'),
    input:   $('#searchInput'),
    results: $('#searchResults')
  };
  bindEvents();
}
