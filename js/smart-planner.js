/* ============================================================
   ProtoMacro — smart-planner.js
   100% local meal-plan generator (no AI, no network).
   v2: preference chips (high-protein, South Asian, budget,
   easy, vegetarian), per-meal regenerate, single-food swap,
   and "Use Plan" writes proper v2 planner items (grams in
   `servings`, not baked into the name).
   ============================================================ */
import { $, escapeHtml, icon, makeId, toast } from './utils.js';
import { STATE, saveState } from './state.js';
import { FOODS_DB } from './foods-db.js';
import { on } from './core/bus.js';

const MEAL_ORDER = ['breakfast', 'lunch', 'dinner', 'snacks'];
const MEAL_META  = {
  breakfast: { emoji: '🌅', label: 'Breakfast', share: 0.25 },
  lunch:     { emoji: '☀️',  label: 'Lunch',     share: 0.30 },
  dinner:    { emoji: '🌆', label: 'Dinner',    share: 0.30 },
  snacks:    { emoji: '🍎', label: 'Snacks',    share: 0.15 }
};

let lastPlan = null;
let dom = null;
let lastBuckets = null;

const PREFS = [
  { key: 'highProtein', label: 'High protein' },
  { key: 'southAsian',  label: 'Bangladeshi / South Asian' },
  { key: 'budget',      label: 'Budget friendly' },
  { key: 'easy',        label: 'Easy cooking' },
  { key: 'vegetarian',  label: 'Vegetarian' }
];

const prefs = new Set();
const hasPref = (k) => prefs.has(k);

/* Budget proxy: protein-dense cheap staples */
const BUDGET_NAMES = /rice|dal|lentil|egg|oats|potato|banana|bread|wheat|flour|chicken|milk|yogurt|soy|tofu|peanut/i;
/* Easy/quick proxy: simple preparations */
const EASY_NAMES = /boiled|grilled|steamed|plain|fresh|raw|banana|fruit|yogurt|milk|egg|oats|bread|salad/i;
const NON_VEG = /chicken|beef|mutton|fish|prawn|shrimp|meat|duck|pork|lamb|kebab|wings|ribs|duck/i;

/* =========================================================
   Bucketing with preference filters
   ========================================================= */

const bucketFoods = () => {
  const db = FOODS_DB || [];
  const buckets = { protein: [], carb: [], fat: [], veg: [], snack: [] };

  for (const f of db) {
    const kcal = f.calories || 0;
    if (kcal <= 0) continue;

    if (hasPref('vegetarian') && NON_VEG.test(f.name)) continue;
    if (hasPref('southAsian') && !(f.tags || []).some((t) => ['bangladeshi', 'indian', 'south asian'].includes(t))) {
      /* keep a few universal staples even when filtering */
      if (!/^(egg|rice|milk|banana|oats|bread|chicken breast)/i.test(f.name)) continue;
    }
    if (hasPref('easy') && !EASY_NAMES.test(f.name)) continue;

    const total = f.protein + f.carbs + f.fat;
    if (!total) continue;
    const pPct = f.protein / total;
    const cPct = f.carbs / total;
    const fPct = f.fat / total;

    /* score by protein density for highProtein/budget ordering */
    let food = f;
    if (hasPref('highProtein') || hasPref('budget')) {
      food = { ...f, _score: (f.protein / Math.max(1, kcal)) };
    }
    if (hasPref('budget') && !BUDGET_NAMES.test(f.name)) continue;

    if (f.protein >= 15 && pPct > 0.35)      buckets.protein.push(food);
    else if (f.carbs >= 20 && cPct > 0.45)   buckets.carb.push(food);
    else if (fPct > 0.55 || (f.fat >= 15 && kcal >= 400)) buckets.fat.push(food);
    else if (kcal < 80)                      buckets.veg.push(food);
    else                                     buckets.snack.push(food);
  }

  if (hasPref('highProtein') || hasPref('budget')) {
    for (const key of Object.keys(buckets)) {
      buckets[key].sort((a, b) => (b._score ?? 0) - (a._score ?? 0));
    }
  }
  return buckets;
};

const pick = (arr, usedNames) => {
  if (!arr.length) return null;
  for (let i = 0; i < 10; i++) {
    const f = arr[Math.floor(Math.random() * arr.length)];
    if (!usedNames.has(f.name)) { usedNames.add(f.name); return f; }
  }
  return arr[Math.floor(Math.random() * arr.length)];
};

const portionForCalories = (food, targetKcal) => {
  if (!food || !food.calories) return 100;
  return Math.round(Math.min(500, Math.max(30, (targetKcal / food.calories) * 100)));
};

const foodAtGrams = (food, grams) => ({
  name:   food.name,
  amount: `${grams}g`,
  grams,
  calories: Math.round(food.calories * grams / 100),
  protein:  +(food.protein * grams / 100).toFixed(1),
  carbs:    +(food.carbs   * grams / 100).toFixed(1),
  fat:      +(food.fat     * grams / 100).toFixed(1)
});

const buildMeal = (key, kcalTarget, buckets, usedNames, mode) => {
  const proteinFood = pick(buckets.protein, usedNames);
  const carbFood    = pick(buckets.carb, usedNames);
  const extraFood   = pick(key === 'snacks' ? buckets.snack : buckets.veg, usedNames)
                   || pick(buckets.fat, usedNames);

  const pShare = mode === 'cut' ? 0.45 : mode === 'bulk' ? 0.30 : 0.35;
  const cShare = mode === 'cut' ? 0.35 : mode === 'bulk' ? 0.50 : 0.40;
  const eShare = 1 - pShare - cShare;

  const foods = [];
  if (proteinFood) foods.push(foodAtGrams(proteinFood, portionForCalories(proteinFood, kcalTarget * pShare)));
  if (carbFood)    foods.push(foodAtGrams(carbFood,    portionForCalories(carbFood,    kcalTarget * cShare)));
  if (extraFood)   foods.push(foodAtGrams(extraFood,   portionForCalories(extraFood,   kcalTarget * eShare)));

  const totals = foods.reduce((t, f) => ({
    calories: t.calories + f.calories,
    protein:  +(t.protein + f.protein).toFixed(1),
    carbs:    +(t.carbs   + f.carbs).toFixed(1),
    fat:      +(t.fat     + f.fat).toFixed(1)
  }), { calories: 0, protein: 0, carbs: 0, fat: 0 });

  const primary = proteinFood?.name?.split(',')[0] || 'Meal';
  const sideName = carbFood?.name?.split(',')[0];
  const name = sideName ? `${primary} with ${sideName.toLowerCase()}` : primary;

  return { name, foods, totals };
};

const TIPS_BY_MODE = {
  cut: [
    'Prioritise whole-food protein sources — they keep you full longer during a deficit.',
    'Time most of your carbs around training to preserve gym performance.',
    'Stay hydrated (target 3.5–4L water/day) — hunger is often thirst in disguise.'
  ],
  bulk: [
    'Eat every 3–4 hours to comfortably hit your calorie surplus.',
    'Include a carb + protein combo within 60 minutes post-workout.',
    'If you feel stuffed, swap one solid meal for a calorie-dense smoothie.'
  ],
  maintain: [
    'Track for one week to verify your TDEE is accurate before adjusting.',
    'Hit at least 1.6g protein per kg of bodyweight for body recomposition.',
    'Sleep 7–9 hours — it drives recovery more than any supplement.'
  ]
};

const generateLocalPlan = (goals, mode) => {
  lastBuckets = bucketFoods();

  /* Graceful handling of impossible targets (e.g. vegetarian filter
     emptied a bucket) — relax filters per bucket if missing. */
  if (!lastBuckets.protein.length) {
    lastBuckets.protein = FOODS_DB.filter((f) => f.protein >= 15);
  }
  if (!lastBuckets.carb.length) {
    lastBuckets.carb = FOODS_DB.filter((f) => f.carbs >= 20);
  }

  const used = new Set();
  const meals = {};
  for (const key of MEAL_ORDER) {
    meals[key] = buildMeal(key, goals.calories * MEAL_META[key].share, lastBuckets, used, mode);
  }
  const daily = Object.values(meals).reduce((t, m) => ({
    calories: t.calories + m.totals.calories,
    protein:  +(t.protein + m.totals.protein).toFixed(1),
    carbs:    +(t.carbs   + m.totals.carbs).toFixed(1),
    fat:      +(t.fat     + m.totals.fat).toFixed(1)
  }), { calories: 0, protein: 0, carbs: 0, fat: 0 });

  return {
    meals,
    daily_totals: daily,
    tips: TIPS_BY_MODE[mode] || TIPS_BY_MODE.maintain,
    _source: 'local'
  };
};

/* =========================================================
   Rendering
   ========================================================= */
const mealCard = (key, meal) => {
  const meta = MEAL_META[key];
  const foods = meal.foods.map((f) => `
    <li class="ai-food">
      <span class="ai-food-name">${escapeHtml(f.name)}</span>
      <span class="ai-food-amt">${escapeHtml(f.amount)}</span>
      <span class="ai-food-cal">${f.calories} kcal</span>
      <button type="button" class="icon-btn" data-swap="${key}:${escapeHtml(f.name)}" title="Swap this food" aria-label="Swap ${escapeHtml(f.name)}">${icon('refresh', 12, 2.2)}</button>
    </li>
  `).join('');
  const t = meal.totals;
  return `
    <div class="ai-meal-card" data-meal-key="${key}">
      <div class="ai-meal-head">
        <div class="ai-meal-title">${meta.emoji} ${meta.label}</div>
        <div style="display:flex; align-items:center; gap:8px;">
          <div class="ai-meal-cal">${Math.round(t.calories)} kcal</div>
          <button type="button" class="icon-btn" data-regen="${key}" title="Regenerate this meal" aria-label="Regenerate ${meta.label}">${icon('refresh', 13, 2.2)}</button>
        </div>
      </div>
      <div class="ai-meal-name">${escapeHtml(meal.name || '')}</div>
      <ul class="ai-food-list">${foods}</ul>
      <div class="ai-macro-chips">
        <span class="chip chip-p">P ${(+t.protein).toFixed(0)}g</span>
        <span class="chip chip-c">C ${(+t.carbs).toFixed(0)}g</span>
        <span class="chip chip-f">F ${(+t.fat).toFixed(0)}g</span>
      </div>
    </div>
  `;
};

const render = (plan) => {
  lastPlan = plan;
  const totals = plan.daily_totals || {};
  const tips = (plan.tips || []).slice(0, 3);

  dom.result.innerHTML = `
    <div class="ai-plan-head">
      <span class="ai-source ai-source-local">Built locally from your targets &amp; the food database</span>
      <div class="ai-plan-totals">
        <strong>${Math.round(totals.calories || 0)} kcal</strong>
        <span>P ${Math.round(totals.protein || 0)}g · C ${Math.round(totals.carbs || 0)}g · F ${Math.round(totals.fat || 0)}g</span>
      </div>
    </div>
    <div class="ai-meal-grid">
      ${MEAL_ORDER.map((k) => mealCard(k, plan.meals[k] || { foods: [], totals: {} })).join('')}
    </div>
    <div class="ai-tips">
      ${tips.map((t) => `<div class="ai-tip">${icon('bolt', 14, 2.5)} ${escapeHtml(t)}</div>`).join('')}
    </div>
    <div class="ai-plan-actions">
      <button class="btn btn-primary" id="aiUsePlanBtn">${icon('check2', 14, 2.5)} Use This Plan</button>
      <button class="btn btn-ghost" id="aiRegenBtn">${icon('arrow', 14, 2.5)} Regenerate All</button>
    </div>
  `;

  $('#aiUsePlanBtn').addEventListener('click', applyPlan);
  $('#aiRegenBtn').addEventListener('click', run);

  dom.result.querySelectorAll('[data-regen]').forEach((btn) => {
    btn.addEventListener('click', () => regenerateMeal(btn.dataset.regen));
  });
  dom.result.querySelectorAll('[data-swap]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const [mealKey, name] = btn.dataset.swap.split(':');
      swapFood(mealKey, name);
    });
  });
};

/* Regenerate one meal, preserving other meals */
const regenerateMeal = (mealKey) => {
  if (!lastPlan) return;
  const mode = STATE.mode;
  const used = new Set(
    MEAL_ORDER.filter((k) => k !== mealKey)
      .flatMap((k) => (lastPlan.meals[k]?.foods || []).map((f) => f.name))
  );
  lastPlan.meals[mealKey] = buildMeal(
    mealKey,
    STATE.goals.calories * MEAL_META[mealKey].share,
    lastBuckets || bucketFoods(),
    used,
    mode
  );
  /* recompute daily totals */
  lastPlan.daily_totals = Object.values(lastPlan.meals).reduce((t, m) => ({
    calories: t.calories + m.totals.calories,
    protein:  +(t.protein + m.totals.protein).toFixed(1),
    carbs:    +(t.carbs   + m.totals.carbs).toFixed(1),
    fat:      +(t.fat     + m.totals.fat).toFixed(1)
  }), { calories: 0, protein: 0, carbs: 0, fat: 0 });
  render(lastPlan);
};

/* Swap a single food for a macro-similar alternative */
const swapFood = (mealKey, name) => {
  const meal = lastPlan?.meals[mealKey];
  if (!meal) return;
  const idx = meal.foods.findIndex((f) => f.name === name);
  if (idx < 0) return;
  const old = meal.foods[idx];

  /* find candidates in any bucket with similar calories per 100g */
  const all = [
    ...(lastBuckets?.protein || []), ...(lastBuckets?.carb || []),
    ...(lastBuckets?.fat || []), ...(lastBuckets?.veg || []), ...(lastBuckets?.snack || [])
  ];
  const others = meal.foods.filter((f) => f.name !== name).map((f) => f.name);
  const candidates = all.filter((f) => !others.includes(f.name) && f.name !== old.name);
  if (!candidates.length) return toast('No alternatives found — try Regenerate.', 'info');

  candidates.sort((a, b) => Math.abs(a.calories - old.calories * 100 / (old.grams || 100)) - Math.abs(b.calories - old.calories * 100 / (old.grams || 100)));
  const replacement = candidates[Math.floor(Math.random() * Math.min(3, candidates.length))];
  const targetKcal = old.calories;
  meal.foods[idx] = foodAtGrams(replacement, portionForCalories(replacement, targetKcal));

  meal.totals = meal.foods.reduce((t, f) => ({
    calories: t.calories + f.calories,
    protein:  +(t.protein + f.protein).toFixed(1),
    carbs:    +(t.carbs   + f.carbs).toFixed(1),
    fat:      +(t.fat     + f.fat).toFixed(1)
  }), { calories: 0, protein: 0, carbs: 0, fat: 0 });

  render(lastPlan);
};

const applyPlan = () => {
  if (!lastPlan) return;
  const hasExisting = MEAL_ORDER.some((k) => (STATE.planner[k] || []).length > 0);
  if (hasExisting && !confirm('Replace your current planner meals with this plan?')) return;

  for (const key of MEAL_ORDER) {
    const meal = lastPlan.meals[key];
    if (!meal || !meal.foods) continue;
    STATE.planner[key] = meal.foods.map((f) => ({
      uid: makeId(),
      name: f.name,
      brand: 'Smart Plan',
      calories: f.calories ? Math.round((f.calories / f.grams) * 100) : 0,
      protein:  +(((f.protein || 0) / f.grams) * 100).toFixed(1),
      carbs:    +(((f.carbs   || 0) / f.grams) * 100).toFixed(1),
      fat:      +(((f.fat     || 0) / f.grams) * 100).toFixed(1),
      servings: f.grams
    }));
  }
  saveState();
  import('./planner.js').then((m) => m.updatePlanner());
  toast('Meal plan loaded into your planner!', 'success');
};

const run = () => {
  try {
    const plan = generateLocalPlan(STATE.goals, STATE.mode);
    if (!plan || !plan.meals) throw new Error('generation failed');
    render(plan);
  } catch (e) {
    console.warn('[ProtoMacro] Meal generation failed:', e);
    dom.result.innerHTML = '<div class="ai-error">Could not generate a plan with these preferences. Try removing a filter.</div>';
  }
};

const renderPrefs = () => {
  const host = $('#plannerPrefs');
  if (!host) return;
  host.innerHTML = PREFS.map((p) => `
    <button type="button" class="pref-chip${prefs.has(p.key) ? ' active' : ''}" data-pref="${p.key}"
      aria-pressed="${prefs.has(p.key)}">${p.label}</button>
  `).join('');
  host.addEventListener('click', (e) => {
    const chip = e.target.closest('[data-pref]');
    if (!chip) return;
    const key = chip.dataset.pref;
    if (prefs.has(key)) prefs.delete(key);
    else prefs.add(key);
    renderPrefs();
  });
};

export function initAiPlanner() {
  const btn = $('#aiGenerateBtn');
  const result = $('#aiResult');
  if (!btn || !result) return;
  dom = { btn, result };
  renderPrefs();
  btn.addEventListener('click', run);
}
