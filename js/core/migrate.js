/* ============================================================
   ProtoMacro — core/migrate.js
   PURE state normalization + versioned migrations.
   No DOM, no localStorage — takes a raw parsed object, returns
   a clean v2 state. This is the single entry point for every
   load path (localStorage, cloud pull, backup import).
   ============================================================ */

export const SCHEMA_VERSION = 2;

const MEAL_KEYS = ['breakfast', 'lunch', 'dinner', 'snacks'];
const MODE_KEYS = ['cut', 'maintain', 'bulk'];

const numOr = (v, fallback) => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : fallback;
};
const clampNum = (v, min, max, fallback) =>
  Math.max(min, Math.min(max, numOr(v, fallback)));
const strOr = (v, fallback = '') => (typeof v === 'string' ? v : fallback);

const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);
const isArr = Array.isArray;

const dateRe = /^\d{4}-\d{2}-\d{2}$/;
const safeDate = (v) => (typeof v === 'string' && dateRe.test(v) ? v : '');

/* ------------------------------------------------------------
   Item sanitizers
   ------------------------------------------------------------ */

export const sanitizeFoodItem = (raw, makeId) => {
  if (!isObj(raw) || typeof raw.name !== 'string' || !raw.name.trim()) return null;
  const unit = raw.unit === 'portion' ? 'portion' : 'g';
  const item = {
    ...raw,
    uid: strOr(raw.uid) || strOr(raw.id) || makeId(),
    name: raw.name.trim().slice(0, 120),
    brand: typeof raw.brand === 'string' ? raw.brand.slice(0, 60) : '',
    calories: numOr(raw.calories, 0),
    protein: numOr(raw.protein, 0),
    carbs: numOr(raw.carbs, 0),
    fat: numOr(raw.fat, 0),
    unit,
    servings:
      unit === 'portion'
        ? clampNum(raw.servings, 0.25, 50, 1)
        : clampNum(raw.servings, 1, 5000, 100)
  };
  if (unit === 'portion') {
    item.perPortion = {
      calories: numOr(raw.perPortion?.calories, item.calories),
      protein: numOr(raw.perPortion?.protein, item.protein),
      carbs: numOr(raw.perPortion?.carbs, item.carbs),
      fat: numOr(raw.perPortion?.fat, item.fat)
    };
  } else {
    delete item.perPortion;
  }
  return item;
};

const sanitizeItems = (arr, makeId) =>
  isArr(arr) ? arr.map((i) => sanitizeFoodItem(i, makeId)).filter(Boolean) : [];

const sanitizePlanner = (raw, makeId) => {
  const out = {};
  for (const key of MEAL_KEYS) {
    out[key] = sanitizeItems(isObj(raw) ? raw[key] : null, makeId);
  }
  return out;
};

export const sanitizeHistory = (raw) =>
  isArr(raw)
    ? raw
        .filter((h) => isObj(h) && safeDate(h.date))
        .map((h) => ({
          date: h.date,
          calories: numOr(h.calories, 0),
          protein: numOr(h.protein, 0),
          carbs: numOr(h.carbs, 0),
          fat: numOr(h.fat, 0),
          mode: MODE_KEYS.includes(h.mode) ? h.mode : 'maintain',
          goals: isObj(h.goals)
            ? {
                calories: numOr(h.goals.calories, 0),
                protein: numOr(h.goals.protein, 0),
                carbs: numOr(h.goals.carbs, 0),
                fat: numOr(h.goals.fat, 0)
              }
            : null,
          items: numOr(h.items, h.calories > 0 ? 1 : 0), // v1 approximation
          water: numOr(h.water, 0),
          score: numOr(h.score, null) === null ? null : numOr(h.score, 0)
        }))
        .slice(-90)
    : [];

export const sanitizeWeightLog = (raw) =>
  isArr(raw)
    ? raw
        .filter((w) => isObj(w) && safeDate(w.date))
        .map((w) => ({ date: w.date, weight: clampNum(w.weight, 25, 350, 0) }))
        .filter((w) => w.weight > 0)
        .sort((a, b) => a.date.localeCompare(b.date))
        .slice(-365)
    : [];

const sanitizeSleepLog = (raw) =>
  isArr(raw)
    ? raw
        .filter((s) => isObj(s) && safeDate(s.date))
        .map((s) => ({ date: s.date, hours: clampNum(s.hours, 0, 24, 0) }))
        .filter((s) => s.hours > 0)
        .sort((a, b) => a.date.localeCompare(b.date))
        .slice(-365)
    : [];

const sanitizeWorkouts = (raw, makeId) =>
  isArr(raw)
    ? raw
        .filter((w) => isObj(w) && safeDate(w.date))
        .map((w) => ({
          id: strOr(w.id) || makeId(),
          date: w.date,
          name: strOr(w.name).slice(0, 80),
          notes: strOr(w.notes).slice(0, 300),
          exercises: isArr(w.exercises)
            ? w.exercises
                .filter((ex) => isObj(ex) && typeof ex.name === 'string' && ex.name.trim())
                .map((ex) => ({
                  name: ex.name.trim().slice(0, 80),
                  sets: isArr(ex.sets)
                    ? ex.sets
                        .map((s) => ({
                          weight: clampNum(s?.weight, 0, 1000, 0),
                          reps: clampNum(s?.reps, 0, 100, 0)
                        }))
                        .filter((s) => s.reps > 0)
                    : []
                }))
            : []
        }))
        .slice(-365)
    : [];

const TRIGGERS = ['stress', 'boredom', 'social', 'late night', 'other'];

const sanitizeHabits = (raw, makeId) =>
  isArr(raw)
    ? raw
        .filter((h) => isObj(h) && typeof h.name === 'string' && h.name.trim())
        .map((h) => ({
          id: strOr(h.id) || makeId(),
          name: h.name.trim().slice(0, 60),
          emoji: strOr(h.emoji).slice(0, 4),
          mode: h.mode === 'reduce' ? 'reduce' : 'quit',
          dailyLimit: numOr(h.dailyLimit, 1),
          limitUnit: strOr(h.limitUnit, 'times'),
          costPerDay: numOr(h.costPerDay, 0),
          createdAt: safeDate(h.createdAt) || safeDate(h.date) || '',
          log: isObj(h.log)
            ? Object.fromEntries(
                Object.entries(h.log).filter(
                  ([k, v]) =>
                    dateRe.test(k) && ['ok', 'partial', 'setback'].includes(v)
                )
              )
            : {},
          setbacks: isArr(h.setbacks)
            ? h.setbacks
                .filter((s) => isObj(s) && safeDate(s.date))
                .map((s) => ({
                  id: strOr(s.id) || makeId(),
                  date: s.date,
                  trigger: TRIGGERS.includes(s.trigger) ? s.trigger : 'other',
                  note: strOr(s.note).slice(0, 200)
                }))
            : []
        }))
        .slice(0, 20)
    : [];

const sanitizeRecipes = (raw, makeId) =>
  isArr(raw)
    ? raw
        .filter((r) => isObj(r) && typeof r.name === 'string' && r.name.trim())
        .map((r) => {
          const items = isArr(r.items)
            ? r.items
                .filter((i) => isObj(i) && typeof i.name === 'string')
                .map((i) => ({
                  name: i.name.slice(0, 120),
                  grams: clampNum(i.grams, 1, 5000, 100),
                  per100: {
                    calories: numOr(i.per100?.calories, 0),
                    protein: numOr(i.per100?.protein, 0),
                    carbs: numOr(i.per100?.carbs, 0),
                    fat: numOr(i.per100?.fat, 0)
                  }
                }))
            : [];
          const servings = clampNum(r.servings, 1, 50, 1);
          const totals = items.reduce(
            (t, i) => ({
              calories: t.calories + (i.per100.calories * i.grams) / 100,
              protein: t.protein + (i.per100.protein * i.grams) / 100,
              carbs: t.carbs + (i.per100.carbs * i.grams) / 100,
              fat: t.fat + (i.per100.fat * i.grams) / 100
            }),
            { calories: 0, protein: 0, carbs: 0, fat: 0 }
          );
          return {
            id: strOr(r.id) || makeId(),
            name: r.name.trim().slice(0, 120),
            servings,
            createdAt: numOr(r.createdAt, Date.now()),
            updatedAt: numOr(r.updatedAt, Date.now()),
            items,
            perServing: {
              calories: Math.round(totals.calories / servings),
              protein: +(totals.protein / servings).toFixed(1),
              carbs: +(totals.carbs / servings).toFixed(1),
              fat: +(totals.fat / servings).toFixed(1),
              gramsPerServing: Math.round(
                items.reduce((s, i) => s + i.grams, 0) / servings
              )
            }
          };
        })
    : [];

const sanitizeSavedMeals = (raw, makeId) =>
  isArr(raw)
    ? raw
        .filter((m) => isObj(m) && typeof m.name === 'string' && m.name.trim())
        .map((m) => ({
          id: strOr(m.id) || makeId(),
          name: m.name.trim().slice(0, 80),
          createdAt: numOr(m.createdAt, Date.now()),
          items: sanitizeItems(m.items, makeId)
        }))
        .filter((m) => m.items.length)
        .slice(0, 100)
    : [];

const sanitizeCustomFoods = (raw, makeId) =>
  isArr(raw)
    ? raw
        .map((f) => sanitizeFoodItem(f, makeId))
        .filter(Boolean)
        .map((f) => ({ ...f, custom: true }))
    : [];

const sanitizeFavorites = (raw) => {
  const ids = (v) =>
    isArr(v) ? [...new Set(v.filter((x) => typeof x === 'string'))].slice(0, 500) : [];
  const r = isObj(raw) ? raw : {};
  return { foods: ids(r.foods), recipes: ids(r.recipes), meals: ids(r.meals) };
};

const sanitizeRecents = (raw) =>
  isArr(raw)
    ? raw
        .filter((r) => isObj(r) && typeof r.id === 'string')
        .map((r) => ({ id: r.id, ts: numOr(r.ts, 0) }))
        .filter((r) => r.ts > 0)
        .sort((a, b) => b.ts - a.ts)
        .slice(0, 30)
    : [];

const sanitizeSettings = (raw) => {
  const r = isObj(raw) ? raw : {};
  const u = isObj(r.units) ? r.units : {};
  return {
    units: {
      weight: u.weight === 'lb' ? 'lb' : 'kg',
      height: u.height === 'ft' ? 'ft' : 'cm',
      water: u.water === 'oz' ? 'oz' : 'ml'
    },
    theme: ['dark', 'light', 'system'].includes(r.theme) ? r.theme : 'dark',
    accent: typeof r.accent === 'string' ? r.accent.slice(0, 20) : null,
    usdaKey: strOr(r.usdaKey).slice(0, 80)
  };
};

const sanitizeSupplements = (raw) => {
  const r = isObj(raw) ? raw : {};
  const list = isArr(r.list)
    ? r.list
        .filter((s) => isObj(s) && typeof s.id === 'string' && typeof s.name === 'string')
        .map((s) => ({
          id: s.id.slice(0, 40),
          name: s.name.slice(0, 60),
          dose: strOr(s.dose).slice(0, 40),
          time: strOr(s.time).slice(0, 40),
          calories: numOr(s.calories, 0),
          protein: numOr(s.protein, 0),
          custom: !!s.custom
        }))
    : [];
  return {
    date: safeDate(r.date),
    list,
    checked: isObj(r.checked) && !isArr(r.checked) ? { ...r.checked } : {}
  };
};

const sanitizeWater = (raw) => {
  const r = isObj(raw) ? raw : {};
  return {
    date: safeDate(r.date),
    consumed: clampNum(r.consumed, 0, 50000, 0),
    goal: clampNum(r.goal, 500, 10000, 4000)
  };
};

/* ------------------------------------------------------------
   v1 → v2 migration. v1 lacked most fields; normalize fills
   defaults, so migration = re-key + defaults (no data transform
   beyond items counting in history).
   ------------------------------------------------------------ */
export const migrateV1toV2 = (raw) => ({ ...raw, schemaVersion: 2 });

const MIGRATIONS = { 1: migrateV1toV2 };

/* ------------------------------------------------------------
   Entry point: raw (any) → clean v2 state (or null if unusable)
   ------------------------------------------------------------ */
export function normalizeState(raw, makeId) {
  if (!isObj(raw)) return null;

  /* run versioned migrations up to SCHEMA_VERSION */
  let version = numOr(raw.schemaVersion, 1);
  let data = { ...raw };
  while (version < SCHEMA_VERSION) {
    const migrate = MIGRATIONS[version];
    if (!migrate) return null; // future version down-grade → refuse
    data = migrate(data);
    version++;
  }
  if (version > SCHEMA_VERSION) return null; // newer schema, older app

  const state = {
    schemaVersion: SCHEMA_VERSION,
    goals: {
      calories: clampNum(data.goals?.calories, 800, 10000, 2000),
      protein: clampNum(data.goals?.protein, 20, 500, 150),
      carbs: clampNum(data.goals?.carbs, 20, 1000, 200),
      fat: clampNum(data.goals?.fat, 10, 400, 67)
    },
    mode: MODE_KEYS.includes(data.mode) ? data.mode : 'maintain',
    tdee: clampNum(data.tdee, 800, 10000, 2000),
    log: sanitizeItems(data.log, makeId),
    planner: sanitizePlanner(data.planner, makeId),
    water: sanitizeWater(data.water),
    supplements: sanitizeSupplements(data.supplements),
    history: sanitizeHistory(data.history),
    weightLog: sanitizeWeightLog(data.weightLog),
    sleepLog: sanitizeSleepLog(data.sleepLog),
    goalWeight: numOr(data.goalWeight, null),
    customFoods: sanitizeCustomFoods(data.customFoods, makeId),
    recipes: sanitizeRecipes(data.recipes, makeId),
    savedMeals: sanitizeSavedMeals(data.savedMeals, makeId),
    favorites: sanitizeFavorites(data.favorites),
    recents: sanitizeRecents(data.recents),
    workouts: sanitizeWorkouts(data.workouts, makeId),
    habits: sanitizeHabits(data.habits, makeId),
    settings: sanitizeSettings(data.settings)
  };

  /* drop invalid goalWeight (0 / NaN handled above) */
  if (!(state.goalWeight > 0)) state.goalWeight = null;

  return state;
}
