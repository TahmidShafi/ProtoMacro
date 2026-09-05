/* ============================================================
   ProtoMacro — state.js
   Centralized state + persistence via the storage facade.
   Every load path (localStorage, cloud, import) funnels through
   normalizeState() so corrupt or partially-written data can never
   produce NaN/undefined bugs. Schema is versioned (v2) with a
   migration registry for backward compatibility with v1 data.
   ============================================================ */

import { today } from './datetime.js';
import { normalizeState, SCHEMA_VERSION } from './core/migrate.js';
import { getProvider } from './core/storage/index.js';
import { emit } from './core/bus.js';

const DEFAULT_SUPPLEMENTS = [
  { id: 'creatine',   name: 'Creatine',       dose: '5g',       time: 'Morning',        calories: 0,   protein: 0 },
  { id: 'whey',       name: 'Whey Protein',   dose: '30g',      time: 'Post workout',   calories: 120, protein: 24 },
  { id: 'preworkout', name: 'Pre-workout',    dose: '1 scoop',  time: 'Before gym',     calories: 10,  protein: 0 },
  { id: 'multi',      name: 'Multivitamin',   dose: '1 tablet', time: 'Morning',        calories: 0,   protein: 0 },
  { id: 'fishoil',    name: 'Fish Oil',       dose: '1000mg',   time: 'With meal',      calories: 10,  protein: 0 },
  { id: 'bcaa',       name: 'BCAA',           dose: '10g',      time: 'During workout', calories: 40,  protein: 10 },
  { id: 'casein',     name: 'Casein Protein', dose: '30g',      time: 'Before bed',     calories: 110, protein: 22 }
];

/* Stable IDs — crypto.randomUUID where available, fallback otherwise */
export const makeId = () =>
  (globalThis.crypto?.randomUUID?.() ||
    Date.now().toString(36) + Math.random().toString(36).slice(2, 10));

export const STATE = {
  schemaVersion: SCHEMA_VERSION,
  goals:      { calories: 2000, protein: 150, carbs: 200, fat: 67 },
  log:        [],
  planner:    { breakfast: [], lunch: [], dinner: [], snacks: [] },
  mode:       'maintain',
  tdee:       2000,
  water:      { date: '', consumed: 0, goal: 4000 },
  supplements:{ date: '', list: DEFAULT_SUPPLEMENTS.map((s) => ({ ...s })), checked: {} },
  history:    [],
  weightLog:  [],
  sleepLog:   [],
  goalWeight: null,
  customFoods:[],
  recipes:    [],
  savedMeals: [],
  favorites:  { foods: [], recipes: [], meals: [] },
  recents:    [],
  workouts:   [],
  habits:     [],
  settings:   { units: { weight: 'kg', height: 'cm', water: 'ml' }, theme: 'dark', accent: null, usdaKey: '' },
  lastResults: null /* transient BMI results — never persisted */
};

/* ---------------- rollover (daily resets) ---------------- */

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

/* ---------------- persistence ---------------- */

let saveTimer = null;
let pendingPayload = null;
let lastSaveError = null;

const persistNow = async () => {
  const provider = getProvider();
  const result = provider.save
    ? await provider.save(pendingPayload)
    : { ok: false, error: 'no-provider' };
  pendingPayload = null;
  if (!result.ok && result.error !== lastSaveError) {
    lastSaveError = result.error;
    emit('storage:error', result);
    if (result.error === 'quota') {
      const { toast } = await import('./utils.js');
      toast('Storage is full — export a backup and clear old data.', 'error');
    }
  } else if (result.ok) {
    lastSaveError = null;
  }
  emit('state:persisted', { ok: result.ok, provider: provider.key });
};

/* Debounced save — feature modules call this on every mutation. */
export function saveState() {
  pendingPayload = serializableState();
  clearTimeout(saveTimer);
  saveTimer = setTimeout(persistNow, 300);
}

/* Payload persisted = everything except transient fields. */
export const serializableState = () => ({
  schemaVersion: SCHEMA_VERSION,
  goals: STATE.goals,
  log: STATE.log,
  planner: STATE.planner,
  mode: STATE.mode,
  tdee: STATE.tdee,
  water: STATE.water,
  supplements: STATE.supplements,
  history: STATE.history,
  weightLog: STATE.weightLog,
  sleepLog: STATE.sleepLog,
  goalWeight: STATE.goalWeight,
  customFoods: STATE.customFoods,
  recipes: STATE.recipes,
  savedMeals: STATE.savedMeals,
  favorites: STATE.favorites,
  recents: STATE.recents,
  workouts: STATE.workouts,
  habits: STATE.habits,
  settings: STATE.settings
});

/* Flush pending debounced write immediately (used before sync/pull). */
export const flushState = () => {
  if (!saveTimer) return Promise.resolve();
  clearTimeout(saveTimer);
  saveTimer = null;
  pendingPayload = serializableState();
  return persistNow();
};

/* ---------------- load ---------------- */

export function loadState() {
  const raw = getProvider().load();
  const clean = normalizeState(raw, makeId);

  if (clean) {
    /* merge supplements list with defaults so new defaults appear
       for existing users while preserving custom entries + state */
    const savedById = new Map(clean.supplements.list.map((s) => [s.id, s]));
    const merged = DEFAULT_SUPPLEMENTS.map((d) => ({ ...d, ...(savedById.get(d.id) || {}) }));
    const customs = clean.supplements.list.filter(
      (s) => !DEFAULT_SUPPLEMENTS.some((d) => d.id === s.id)
    );
    clean.supplements.list = [...merged, ...customs];

    Object.assign(STATE, clean);
  }
  rolloverDaily();
}

/* Replace the entire in-memory state (backup import / cloud pull).
   Caller is responsible for having confirmed with the user. */
export function replaceState(raw) {
  const clean = normalizeState(raw, makeId);
  if (!clean) return false;
  const savedById = new Map(clean.supplements.list.map((s) => [s.id, s]));
  clean.supplements.list = [
    ...DEFAULT_SUPPLEMENTS.map((d) => ({ ...d, ...(savedById.get(d.id) || {}) })),
    ...clean.supplements.list.filter((s) => !DEFAULT_SUPPLEMENTS.some((d) => d.id === s.id))
  ];
  Object.assign(STATE, clean);
  rolloverDaily();
  saveState();
  emit('state:replaced');
  return true;
}

/* ---------------- daily snapshot ---------------- */

/* Persist a snapshot of today's tracker totals. De-dupes by date.
   `items` distinguishes "logged but zero" from "not logged". */
export function recordDailySnapshot(totals, extra = {}) {
  const t = today();
  const entry = {
    date:     t,
    calories: Math.round(totals.cal),
    protein:  +totals.pro.toFixed(1),
    carbs:    +totals.car.toFixed(1),
    fat:      +totals.fat.toFixed(1),
    mode:     STATE.mode,
    goals:    { ...STATE.goals },
    items:    extra.items ?? STATE.log.length,
    water:    extra.water ?? STATE.water.consumed,
    score:    extra.score ?? null
  };
  const idx = STATE.history.findIndex((h) => h.date === t);
  if (idx >= 0) STATE.history[idx] = entry;
  else STATE.history.push(entry);
  if (STATE.history.length > 90) {
    STATE.history = STATE.history.slice(-90);
  }
}
