/* ============================================================
   ProtoMacro — core/sync.js
   Guest/account sync strategy (simple + reliable):
   - Local writes are always the primary source of truth (never lost).
   - In account mode, every state:persisted pushes the full state document.
   - On sign-in, remote is pulled; conflict policy: local-preferential
     union merge (history/weightLog/sleepLog by date, workouts/recipes/
     meals/customFoods by id), today's active day data stays local.
     Habit logs and setbacks are merged across local and remote.
     Remote metadata/goals/settings are accepted on pull.
     A local backup is snapshotted before any pull overwrites.
   - Offline pushes queue automatically (retry on online).
   ============================================================ */
import { STATE, serializableState, replaceState, flushState } from '../state.js';
import { getProvider, cloudConfigured } from './storage/index.js';
import { isSignedIn, getUserEmail } from './auth.js';
import { emit, on } from './bus.js';
import { normalizeState, SCHEMA_VERSION } from './migrate.js';

let status = 'local';
let pendingPush = false;
let syncing = false;

const setStatus = (next) => {
  status = next;
  emit('sync:status', { status, email: getUserEmail() });
};

export const getSyncStatus = () => status;

const snapshotLocalBackup = () => {
  try {
    localStorage.setItem('protomacro_pre_sync_backup', JSON.stringify(serializableState()));
  } catch { /* best effort */ }
};

export const unionMerge = (current, incoming) => {
  const cur = current || {};
  const inc = incoming || {};

  const byDate = (key) => {
    const m = new Map();
    for (const x of cur[key] || []) if (x && x.date) m.set(x.date, x);
    for (const x of inc[key] || []) if (x && x.date && !m.has(x.date)) m.set(x.date, x);
    return [...m.values()].sort((a, b) => a.date.localeCompare(b.date));
  };

  const byId = (key) => {
    const m = new Map();
    for (const x of cur[key] || []) if (x && x.id) m.set(x.id, x);
    for (const x of inc[key] || []) if (x && x.id && !m.has(x.id)) m.set(x.id, x);
    return [...m.values()];
  };

  const mergeHabits = () => {
    const m = new Map(
      byId('habits').map((h) => [
        h.id,
        { ...h, log: { ...(h.log || {}) }, setbacks: [...(h.setbacks || [])] }
      ])
    );
    for (const h of inc.habits || []) {
      if (!h || !h.id) continue;
      const existing = m.get(h.id);
      if (existing) {
        existing.log = { ...h.log, ...existing.log };
        existing.setbacks = [...(existing.setbacks || []), ...(h.setbacks || [])]
          .filter((s, i, arr) => arr.findIndex((x) => x.id === s.id) === i);
      } else {
        m.set(h.id, { ...h, log: { ...(h.log || {}) }, setbacks: [...(h.setbacks || [])] });
      }
    }
    return [...m.values()];
  };

  return {
    ...inc,
    log: cur.log,                         /* active day: local wins */
    planner: cur.planner,
    water: cur.water,
    supplements: cur.supplements,
    favorites: cur.favorites,
    recents: cur.recents,
    history: byDate('history').slice(-90),
    weightLog: byDate('weightLog').slice(-365),
    sleepLog: byDate('sleepLog').slice(-365),
    workouts: byId('workouts'),
    recipes: byId('recipes'),
    savedMeals: byId('savedMeals'),
    customFoods: byId('customFoods'),
    habits: mergeHabits()
  };
};

/* ---------------- push ---------------- */

const push = async () => {
  if (!cloudConfigured() || !isSignedIn() || syncing) {
    if (isSignedIn() && cloudConfigured()) pendingPush = true;
    return;
  }
  const provider = getProvider();
  if (provider.key !== 'cloud') return;

  syncing = true;
  setStatus('syncing');
  try {
    await flushState();
    const result = await provider.save(serializableState());
    if (result.ok) {
      pendingPush = false;
      setStatus('synced');
    } else {
      setStatus(navigator.onLine ? 'error' : 'offline');
    }
  } catch {
    setStatus(navigator.onLine ? 'error' : 'offline');
  } finally {
    syncing = false;
  }
};

/* ---------------- pull (on sign-in) ---------------- */

const pull = async () => {
  const provider = getProvider();
  if (provider.key !== 'cloud') return;

  setStatus('syncing');
  try {
    const res = await provider.load();
    if (!res.ok) {
      setStatus('error');
      return;
    }
    if (!res.data) {
      /* empty account — push local data up as the initial backup */
      await push();
      return;
    }
    const remote = normalizeState(res.data, () => 'cloud_' + Math.random().toString(36).slice(2));
    if (!remote) {
      setStatus('error');
      return;
    }
    snapshotLocalBackup();
    const merged = unionMerge(STATE, remote);
    replaceState(merged);
    setStatus('synced');
    emit('sync:pulled');
    await push();
  } catch {
    setStatus(navigator.onLine ? 'error' : 'offline');
  }
};

/* ---------------- wiring ---------------- */

export function initSync() {
  if (!cloudConfigured()) {
    setStatus('local');
    return;
  }

  on('state:persisted', ({ provider }) => {
    if (provider === 'local' && !isSignedIn()) setStatus('saved');
    else if (provider === 'cloud') setStatus('synced');
  });

  on('auth:signed-in', () => {
    setStatus('syncing');
    pull();
  });

  on('auth:signed-out', () => setStatus('saved'));

  on('storage:error', () => {
    if (isSignedIn()) setStatus('error');
  });

  /* push changes after each debounced local write, in account mode */
  on('state:persisted', ({ provider }) => {
    if (provider === 'local' && isSignedIn()) push();
  });

  window.addEventListener('online', () => {
    if (isSignedIn() && (pendingPush || status === 'offline' || status === 'error')) push();
    else if (isSignedIn()) setStatus('synced');
  });
  window.addEventListener('offline', () => {
    if (isSignedIn()) setStatus('offline');
  });

  setStatus(isSignedIn() ? 'syncing' : 'saved');
}

export const retrySync = () => push();
