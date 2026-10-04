/* ============================================================
   ProtoMacro — core/planner-solver.js
   Pure meal plan constraint satisfaction & calculation solver.
   Pure functions: no DOM, no STATE, no bus, deterministic with rng.
   ============================================================ */

import { FOODS_DB } from '../foods-db.js';

export const MEAL_ORDER = ['breakfast', 'lunch', 'dinner', 'snacks'];

export const MEAL_META = {
  breakfast: { emoji: '🌅', label: 'Breakfast', share: 0.25 },
  lunch:     { emoji: '☀️',  label: 'Lunch',     share: 0.30 },
  dinner:    { emoji: '🌆', label: 'Dinner',    share: 0.30 },
  snacks:    { emoji: '🍎', label: 'Snacks',    share: 0.15 }
};

export const PREFS = [
  { key: 'highProtein', label: 'High protein' },
  { key: 'southAsian',  label: 'Bangladeshi / South Asian' },
  { key: 'budget',      label: 'Budget friendly' },
  { key: 'easy',        label: 'Easy cooking' },
  { key: 'vegetarian',  label: 'Vegetarian' }
];

/* Budget proxy: protein-dense cheap staples */
export const BUDGET_NAMES = /rice|dal|lentil|egg|oats|potato|banana|bread|wheat|flour|chicken|milk|yogurt|soy|tofu|peanut/i;
/* Easy/quick proxy: simple preparations */
export const EASY_NAMES = /boiled|grilled|steamed|plain|fresh|raw|banana|fruit|yogurt|milk|egg|oats|bread|salad/i;
export const NON_VEG = /chicken|beef|mutton|fish|prawn|shrimp|meat|duck|pork|lamb|kebab|wings|ribs|duck/i;

export const TIPS_BY_MODE = {
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

/* =========================================================
   Bucketing with preference filters
   ========================================================= */

export const bucketFoods = (db = FOODS_DB, prefs = []) => {
  const activePrefs = prefs instanceof Set ? prefs : new Set(prefs || []);
  const hasPref = (k) => activePrefs.has(k);

  const buckets = { protein: [], carb: [], fat: [], veg: [], snack: [] };

  for (const f of db || []) {
    const kcal = f.calories || 0;
    if (kcal <= 0) continue;

    if (hasPref('vegetarian') && NON_VEG.test(f.name)) continue;
    if (hasPref('southAsian') && !(f.tags || []).some((t) => ['bangladeshi', 'indian', 'south asian'].includes(t))) {
      /* keep a few universal staples even when filtering */
      if (!/^(egg|rice|milk|banana|oats|bread|chicken breast)/i.test(f.name)) continue;
    }
    if (hasPref('easy') && !EASY_NAMES.test(f.name)) continue;

    const total = (f.protein || 0) + (f.carbs || 0) + (f.fat || 0);
    if (!total) continue;
    const pPct = (f.protein || 0) / total;
    const cPct = (f.carbs || 0) / total;
    const fPct = (f.fat || 0) / total;

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

export const pick = (arr, usedNames, rng = Math.random) => {
  if (!arr || !arr.length) return null;
  for (let i = 0; i < 10; i++) {
    const f = arr[Math.floor(rng() * arr.length)];
    if (!usedNames.has(f.name)) {
      usedNames.add(f.name);
      return f;
    }
  }
  return arr[Math.floor(rng() * arr.length)];
};

export const portionForCalories = (food, targetKcal) => {
  if (!food || !food.calories) return 100;
  return Math.round(Math.min(500, Math.max(30, (targetKcal / food.calories) * 100)));
};

export const foodAtGrams = (food, grams) => ({
  name:   food.name,
  amount: `${grams}g`,
  grams,
  calories: Math.round(food.calories * grams / 100),
  protein:  +(food.protein * grams / 100).toFixed(1),
  carbs:    +(food.carbs   * grams / 100).toFixed(1),
  fat:      +(food.fat     * grams / 100).toFixed(1)
});

export const buildMeal = (key, kcalTarget, buckets, usedNames = new Set(), mode = 'maintain', rng = Math.random) => {
  const proteinFood = pick(buckets.protein, usedNames, rng);
  const carbFood    = pick(buckets.carb, usedNames, rng);
  const extraFood   = pick(key === 'snacks' ? buckets.snack : buckets.veg, usedNames, rng)
                   || pick(buckets.fat, usedNames, rng);

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

export const generatePlan = ({
  goals = { calories: 2000 },
  mode = 'maintain',
  prefs = [],
  db = FOODS_DB,
  rng = Math.random
} = {}) => {
  const buckets = bucketFoods(db, prefs);

  /* Graceful handling of impossible targets (e.g. vegetarian filter
     emptied a bucket) — relax filters per bucket if missing. */
  if (!buckets.protein.length) {
    buckets.protein = (db || []).filter((f) => f.protein >= 15);
  }
  if (!buckets.carb.length) {
    buckets.carb = (db || []).filter((f) => f.carbs >= 20);
  }

  const used = new Set();
  const meals = {};
  const calTarget = goals?.calories || 2000;
  for (const key of MEAL_ORDER) {
    meals[key] = buildMeal(key, calTarget * MEAL_META[key].share, buckets, used, mode, rng);
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
    buckets,
    _source: 'local'
  };
};

export const regenerateMeal = (plan, mealKey, { goals, mode = 'maintain', buckets, rng = Math.random } = {}) => {
  if (!plan || !plan.meals) return plan;
  const used = new Set(
    MEAL_ORDER.filter((k) => k !== mealKey)
      .flatMap((k) => (plan.meals[k]?.foods || []).map((f) => f.name))
  );
  const calTarget = goals?.calories || 2000;
  plan.meals[mealKey] = buildMeal(
    mealKey,
    calTarget * MEAL_META[mealKey].share,
    buckets,
    used,
    mode,
    rng
  );
  plan.daily_totals = Object.values(plan.meals).reduce((t, m) => ({
    calories: t.calories + m.totals.calories,
    protein:  +(t.protein + m.totals.protein).toFixed(1),
    carbs:    +(t.carbs   + m.totals.carbs).toFixed(1),
    fat:      +(t.fat     + m.totals.fat).toFixed(1)
  }), { calories: 0, protein: 0, carbs: 0, fat: 0 });
  return plan;
};

export const swapFood = (plan, mealKey, foodName, { buckets, rng = Math.random } = {}) => {
  const meal = plan?.meals?.[mealKey];
  if (!meal) return { success: false, reason: 'Meal not found' };
  const idx = meal.foods.findIndex((f) => f.name === foodName);
  if (idx < 0) return { success: false, reason: 'Food not found' };
  const old = meal.foods[idx];

  const all = [
    ...(buckets?.protein || []), ...(buckets?.carb || []),
    ...(buckets?.fat || []), ...(buckets?.veg || []), ...(buckets?.snack || [])
  ];
  const others = meal.foods.filter((f) => f.name !== foodName).map((f) => f.name);
  const candidates = all.filter((f) => !others.includes(f.name) && f.name !== old.name);
  if (!candidates.length) return { success: false, reason: 'No alternatives found' };

  candidates.sort((a, b) => Math.abs(a.calories - old.calories * 100 / (old.grams || 100)) - Math.abs(b.calories - old.calories * 100 / (old.grams || 100)));
  const replacement = candidates[Math.floor(rng() * Math.min(3, candidates.length))];
  const targetKcal = old.calories;
  meal.foods[idx] = foodAtGrams(replacement, portionForCalories(replacement, targetKcal));

  meal.totals = meal.foods.reduce((t, f) => ({
    calories: t.calories + f.calories,
    protein:  +(t.protein + f.protein).toFixed(1),
    carbs:    +(t.carbs   + f.carbs).toFixed(1),
    fat:      +(t.fat     + f.fat).toFixed(1)
  }), { calories: 0, protein: 0, carbs: 0, fat: 0 });

  return { success: true, plan };
};
