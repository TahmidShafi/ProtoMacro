/* ============================================================
   ProtoMacro — state.js
   Centralised state + localStorage persistence.
   All persisted fields are schema-guarded on load so corrupt or
   partially-written storage can never produce NaN/undefined bugs.
   ============================================================ */
import { today } from './datetime.js';

const LS_KEY = 'protomacro_v1';

const DEFAULT_SUPPLEMENTS = [
  { id: 'creatine',    name: 'Creatine',        dose: '5g',       time: 'Morning',         calories: 0,   protein: 0 },
  { id: 'whey',        name: 'Whey Protein',    dose: '30g',      time: 'Post workout',    calories: 120, protein: 24 },
  { id: 'preworkout',  name: 'Pre-workout',     dose: '1 scoop',  time: 'Before gym',      calories: 10,  protein: 0 },
  { id: 'multi',       name: 'Multivitamin',    dose: '1 tablet', time: 'Morning',         calories: 0,   protein: 0 },
  { id: 'fishoil',     name: 'Fish Oil',        dose: '1000mg',   time: 'With meal',       calories: 10,  protein: 0 },
  { id: 'bcaa',        name: 'BCAA',            dose: '10g',      time: 'During workout',  calories: 40,  protein: 10 },
  { id: 'casein',      name: 'Casein Protein',  dose: '30g',      time: 'Before bed',      calories: 110, protein: 22 }
];

export const STATE = {
  goals:       { calories: 2000, protein: 150, carbs: 200, fat: 67 },
  log:         [],
  planner:     { breakfast: [], lunch: [], dinner: [], snacks: [] },
  mode:        'maintain',    /* 'cut' | 'maintain' | 'bulk' */
  tdee:        2000,          /* base maintenance kcal — set by BMI calc */
  water:       { date: '',  consumed: 0, goal: 4000 /* ml */ },
  supplements: { date: '',  list: DEFAULT_SUPPLEMENTS.map((s) => ({ ...s })), checked: {} },
  history:     [],            /* [{date,calories,protein,carbs,fat,mode,goals}] */
  weightLog:   [],            /* [{date, weight}] */
  lastResults: null           /* transient BMI calc results */
};

/* ---------------- schema guards (B11) ---------------- */

const numOr = (v, fallback) => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : fallback;
};

const clampNum = (v, min, max, fallback) => Math.max(min, Math.min(max, numOr(v, fallback)));

const MEAL_KEYS = ['breakfast', 'lunch', 'dinner', 'snacks'];

const MODE_KEYS = ['cut', 'maintain', 'bulk'];

/* A food/log/planner item must have a name and finite macro numbers. */
const sanitizeItem = (raw) => {
  if (!raw || typeof raw.name !== 'string' || !raw.name.trim()) return null;
  return {
    ...raw,
    calories: numOr(raw.calories, 0),
    protein:  numOr(raw.protein, 0),
    carbs:    numOr(raw.carbs, 0),
    fat:      numOr(raw.fat, 0),
    servings: clampNum(raw.servings, 1, 5000, 100)
  };
};

const sanitizeItems = (arr) => Array.isArray(arr)
  ? arr.map(sanitizeItem).filter(Boolean)
  : [];

/* ---------------- rollover ---------------- */

/* Reset per-day items if the stored date is not today. */
const rolloverDaily = () => {
  const t = today();
  if (STATE.water.date !== t) {
    STATE.water.date = t;
    STATE.water.consumed = 0;
  }
  if (STATE.supplements.date !== t) {
    STATE.supplements.date = t;
    STATE.supplements.checked = {};
  }
};

export function saveState() {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify({
      goals:       STATE.goals,
      log:         STATE.log,
      planner:     STATE.planner,
      mode:        STATE.mode,
      tdee:        STATE.tdee,
      water:       STATE.water,
      supplements: STATE.supplements,
      history:     STATE.history,
      weightLog:   STATE.weightLog
    }));
  } catch (e) {
    console.warn('[ProtoMacro] Could not save state:', e);
  }
}

export function loadState() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) {
      const data = JSON.parse(raw);

      /* goals */
      if (data.goals && typeof data.goals === 'object') {
        STATE.goals = {
          calories: clampNum(data.goals.calories, 800, 10000, 2000),
          protein:  clampNum(data.goals.protein,  20, 500, 150),
          carbs:    clampNum(data.goals.carbs,    20, 1000, 200),
          fat:      clampNum(data.goals.fat,      10, 400, 67)
        };
      }

      /* log */
      STATE.log = sanitizeItems(data.log);

      /* planner */
      if (data.planner && typeof data.planner === 'object') {
        for (const key of MEAL_KEYS) {
          STATE.planner[key] = sanitizeItems(data.planner[key]);
        }
      }

      /* mode + tdee */
      if (MODE_KEYS.includes(data.mode)) STATE.mode = data.mode;
      if (data.tdee !== undefined) STATE.tdee = clampNum(data.tdee, 800, 10000, 2000);

      /* water */
      if (data.water && typeof data.water === 'object') {
        STATE.water = {
          date:     typeof data.water.date === 'string' ? data.water.date : '',
          consumed: clampNum(data.water.consumed, 0, 50000, 0),
          goal:     clampNum(data.water.goal, 500, 10000, 4000)
        };
      }

      /* supplements — merge with defaults so new defaults show up for existing users */
      if (data.supplements && typeof data.supplements === 'object') {
        const saved = data.supplements;
        const validList = Array.isArray(saved.list)
          ? saved.list.filter((s) => s && typeof s.id === 'string' && typeof s.name === 'string')
          : [];
        const byId  = new Map(validList.map((s) => [s.id, s]));
        const merged = DEFAULT_SUPPLEMENTS.map((d) => ({ ...d, ...(byId.get(d.id) || {}) }));
        const customs = validList.filter((s) => !DEFAULT_SUPPLEMENTS.some((d) => d.id === s.id));
        STATE.supplements = {
          date:    typeof saved.date === 'string' ? saved.date : '',
          list:    [...merged, ...customs],
          checked: (saved.checked && typeof saved.checked === 'object' && !Array.isArray(saved.checked))
            ? saved.checked
            : {}
        };
      }

      /* history */
      if (Array.isArray(data.history)) {
        STATE.history = data.history
          .filter((h) => h && typeof h.date === 'string')
          .map((h) => ({
            date:     h.date,
            calories: numOr(h.calories, 0),
            protein:  numOr(h.protein, 0),
            carbs:    numOr(h.carbs, 0),
            fat:      numOr(h.fat, 0),
            mode:     MODE_KEYS.includes(h.mode) ? h.mode : 'maintain',
            goals:    (h.goals && typeof h.goals === 'object') ? h.goals : { ...STATE.goals }
          }));
      }

      /* weight log */
      if (Array.isArray(data.weightLog)) {
        STATE.weightLog = data.weightLog
          .filter((w) => w && typeof w.date === 'string')
          .map((w) => ({ date: w.date, weight: clampNum(w.weight, 25, 350, 0) }))
          .filter((w) => w.weight > 0);
      }
    }
  } catch (e) {
    console.warn('[ProtoMacro] Could not load state:', e);
  }
  rolloverDaily();
}

/* Persist a daily snapshot of current tracker totals. Called by tracker.js
   any time the log changes — de-dupes by date. */
export function recordDailySnapshot(totals) {
  const t = today();
  const entry = {
    date:     t,
    calories: Math.round(totals.cal),
    protein:  +totals.pro.toFixed(1),
    carbs:    +totals.car.toFixed(1),
    fat:      +totals.fat.toFixed(1),
    mode:     STATE.mode,
    goals:    { ...STATE.goals }
  };
  const idx = STATE.history.findIndex((h) => h.date === t);
  if (idx >= 0) STATE.history[idx] = entry;
  else STATE.history.push(entry);
  /* Keep only last 90 days */
  if (STATE.history.length > 90) {
    STATE.history = STATE.history.slice(-90);
  }
}
