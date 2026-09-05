/* ============================================================
   ProtoMacro — core/sync.js
   Guest/account sync strategy (simple + reliable):
   - Local writes are always the source of truth (never lost).
   - In account mode, every state:persisted pushes the doc up
     (section-level LWW on updated_at).
   - On sign-in, remote is pulled; conflict policy: per-item
     union merge (history/weightLog by date, workouts/habits/
     recipes/meals by id), today's active log stays local.
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

const unionMerge = (current, incoming) => {
  const byDate = (key) => {
    const m = new Map();
    for (const x of current[key] || []) m.set(x.date, x);
    for (const x of incoming[key] || []) if (!m.has(x.date)) m.set(x.date, x);
    return [...m.values()].sort((a, b) => a.date.localeCompare(b.date));
  };
  const byId = (key) => {
    const m = new Map();
    for (const x of current[key] || []) m.set(x.id, x);
    for (const x of incoming[key] || []) if (!m.has(x.id)) m.set(x.id, x);
    return [...m.values()];
  };
  const mergeHabits = () => {
    const m = new Map(byId('habits').map((h) => [h.id, h]));
    for (const h of current.habits || []) {
      const cur = m.get(h.id);
      if (cur) {
        cur.log = { ...h.log, ...cur.log };
        cur.setbacks = [...(cur.setbacks || []), ...(h.setbacks || [])]
          .filter((s, i, arr) => arr.findIndex((x) => x.id === s.id) === i);
      } else {
        m.set(h.id, h);
      }
    }
    return [...m.values()];
  };

  return {
    ...incoming,
    log: current.log,                     /* active day: local wins */
    planner: current.planner,
    water: current.water,
    supplements: current.supplements,
    favorites: current.favorites,
    recents: current.recents,
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
