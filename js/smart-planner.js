/* ============================================================
   ProtoMacro — smart-planner.js (formerly "AI planner")
   Generate a one-day meal plan from the user's goals + mode.

   This runs 100% locally: it picks foods from FOODS_DB to
   approximate the user's calorie and macro targets per meal.
   No network calls are made and no data leaves the device.
   ============================================================ */
import { $, escapeHtml, icon, uid, toast } from './utils.js';
import { STATE, saveState } from './state.js';
import { FOODS_DB } from './foods-db.js';

const MEAL_ORDER = ['breakfast', 'lunch', 'dinner', 'snacks'];
const MEAL_META  = {
  breakfast: { emoji: '\ud83c\udf05', label: 'Breakfast', share: 0.25 },
  lunch:     { emoji: '\u2600\ufe0f',  label: 'Lunch',     share: 0.30 },
  dinner:    { emoji: '\ud83c\udf06', label: 'Dinner',    share: 0.30 },
  snacks:    { emoji: '\ud83c\udf6a', label: 'Snacks',    share: 0.15 }
};

let lastPlan = null;
let dom = null;

/* =========================================================
   LOCAL GENERATOR
   Picks foods from FOODS_DB to approximate the macro split.
   ========================================================= */

/* Categorise foods into protein / carb / fat / veg buckets */
const bucketFoods = () => {
  const db = FOODS_DB || [];
  const buckets = { protein: [], carb: [], fat: [], veg: [], snack: [] };
  for (const f of db) {
    const kcal = f.calories || 0;
    if (kcal <= 0) continue;
    const total = f.protein + f.carbs + f.fat;
    if (!total) continue;
    const pPct = f.protein / total;
    const cPct = f.carbs / total;
    const fPct = f.fat / total;

    if (f.protein >= 15 && pPct > 0.35)      buckets.protein.push(f);
    else if (f.carbs >= 20 && cPct > 0.45)   buckets.carb.push(f);
    else if (fPct > 0.55 || (f.fat >= 15 && kcal >= 400)) buckets.fat.push(f);
    else if (kcal < 80)                      buckets.veg.push(f);
    else                                     buckets.snack.push(f);
  }
  return buckets;
};

const pick = (arr, usedNames) => {
  if (!arr.length) return null;
  for (let i = 0; i < 8; i++) {
    const f = arr[Math.floor(Math.random() * arr.length)];
    if (!usedNames.has(f.name)) { usedNames.add(f.name); return f; }
  }
  return arr[Math.floor(Math.random() * arr.length)];
};

const portionForCalories = (food, targetKcal) => {
  if (!food || !food.calories) return 100;
  return Math.round(Math.min(500, Math.max(30, (targetKcal / food.calories) * 100)));
};

const foodAtGrams = (food, grams) => {
  const m = grams / 100;
  return {
    name:     food.name,
    amount:   `${grams}g`,
    calories: Math.round(food.calories * m),
    protein:  +(food.protein  * m).toFixed(1),
    carbs:    +(food.carbs    * m).toFixed(1),
    fat:      +(food.fat      * m).toFixed(1)
  };
};

const buildMeal = (label, kcalTarget, buckets, usedNames, mode) => {
  /* Per-meal macro weights similar to global split but skewed by mode */
  const proteinFood = pick(buckets.protein, usedNames);
  const carbFood    = pick(buckets.carb,    usedNames);
  const extraFood   = pick(label === 'snacks' ? buckets.snack : buckets.veg, usedNames)
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
    'Prioritise whole-food protein sources \u2014 they keep you full longer during a deficit.',
    'Time most of your carbs around training to preserve gym performance.',
    'Stay hydrated (target 3.5\u20134L water/day) \u2014 hunger is often thirst in disguise.'
  ],
  bulk: [
    'Eat every 3\u20134 hours to comfortably hit your calorie surplus.',
    'Include a carb + protein combo within 60 minutes post-workout.',
    'If you feel stuffed, swap one solid meal for a calorie-dense smoothie.'
  ],
  maintain: [
    'Track for one week to verify your TDEE is accurate before adjusting.',
    'Hit at least 1.6g protein per kg of bodyweight for body recomposition.',
    'Sleep 7\u20139 hours \u2014 it drives recovery more than any supplement.'
  ]
};

const generateLocalPlan = (goals, mode) => {
  const buckets = bucketFoods();
  const used = new Set();
  const meals = {};
  for (const key of MEAL_ORDER) {
    const share = MEAL_META[key].share;
    const mealPlan = buildMeal(key, goals.calories * share, buckets, used, mode);
    meals[key] = mealPlan;
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
    </li>
  `).join('');
  const t = meal.totals;
  return `
    <div class="ai-meal-card">
      <div class="ai-meal-head">
        <div class="ai-meal-title">${meta.emoji} ${meta.label}</div>
        <div class="ai-meal-cal">${Math.round(t.calories)} kcal</div>
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
        <span>P ${Math.round(totals.protein || 0)}g \u00b7 C ${Math.round(totals.carbs || 0)}g \u00b7 F ${Math.round(totals.fat || 0)}g</span>
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
      <button class="btn btn-ghost" id="aiRegenBtn">${icon('arrow', 14, 2.5)} Regenerate</button>
    </div>
  `;

  $('#aiUsePlanBtn').addEventListener('click', applyPlan);
  $('#aiRegenBtn').addEventListener('click', run);
};

const applyPlan = () => {
  if (!lastPlan) return;
  const hasExisting = MEAL_ORDER.some((k) => (STATE.planner[k] || []).length > 0);
  if (hasExisting && !confirm('Replace your current planner meals with this plan?')) return;

  for (const key of MEAL_ORDER) {
    const meal = lastPlan.meals[key];
    if (!meal || !meal.foods) continue;
    /* Replace the existing meal slot with these foods */
    STATE.planner[key] = meal.foods.map((f) => ({
      uid:      uid(),
      name:     f.name + (f.amount ? ` (${f.amount})` : ''),
      brand:    'Smart Plan',
      calories: Math.round(f.calories || 0),
      protein:  +(f.protein || 0).toFixed(1),
      carbs:    +(f.carbs   || 0).toFixed(1),
      fat:      +(f.fat     || 0).toFixed(1)
    }));
  }
  saveState();
  updatePlannerFn();
  toast('Meal plan loaded into your planner!', 'success');
};

/* planner.js registers its updater at init to avoid a static import cycle */
let updatePlannerFn = () => {};
export const bindPlannerUpdate = (fn) => { updatePlannerFn = fn; };

const run = () => {
  /* Fully local generation — instant, no network, no fake loading states. */
  try {
    const plan = generateLocalPlan(STATE.goals, STATE.mode);
    if (!plan || !plan.meals) throw new Error('generation failed');
    render(plan);
  } catch (e) {
    console.warn('[ProtoMacro] Meal generation failed:', e);
    dom.result.innerHTML = '<div class="ai-error">Could not generate a plan. Please try again.</div>';
  }
};

export function initAiPlanner() {
  const btn = $('#aiGenerateBtn');
  const result = $('#aiResult');
  if (!btn || !result) return;
  dom = { btn, result };
  btn.addEventListener('click', run);
}
