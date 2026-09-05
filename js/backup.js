/* ============================================================
   ProtoMacro — backup.js
   Full JSON export / validated import.
   Import flow: pick file → parse → validate schema → preview
   counts → explicit confirm → merge or replace. Never silent.
   ============================================================ */
import { $, toast } from './utils.js';
import { STATE, serializableState, replaceState } from './state.js';
import { normalizeState, SCHEMA_VERSION } from './core/migrate.js';
import { openModal } from './core/modal.js';
import { emit } from './core/bus.js';
import { today } from './datetime.js';

/* ---------------- export ---------------- */

export const exportBackup = () => {
  try {
    const payload = {
      app: 'ProtoMacro',
      kind: 'backup',
      schemaVersion: SCHEMA_VERSION,
      exportedAt: new Date().toISOString(),
      data: serializableState()
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `protomacro-backup-${today()}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    toast('Backup exported', 'success');
  } catch (e) {
    console.warn('[ProtoMacro] export failed:', e);
    toast('Export failed — see console.', 'error');
  }
};

/* ---------------- import ---------------- */

const COUNT_KEYS = [
  ['Food log', 'log'], ['Custom foods', 'customFoods'], ['Recipes', 'recipes'],
  ['Saved meals', 'savedMeals'], ['History days', 'history'], ['Weight logs', 'weightLog'],
  ['Sleep logs', 'sleepLog'], ['Workouts', 'workouts'], ['Habits', 'habits']
];

const previewAndConfirm = (clean) => new Promise((resolve) => {
  const rows = COUNT_KEYS
    .map(([label, key]) => `
      <div class="migration-preview-row">
        <span>${label}</span><strong>${(clean[key] || []).length}</strong>
      </div>`)
    .join('');

  openModal({
    title: 'Import this backup?',
    body: `
      <p class="entity-sub" style="margin-bottom:8px;">Backup created: ${clean.schemaVersion === SCHEMA_VERSION ? 'compatible' : 'migrated'} · goals ${clean.goals.calories} kcal · mode ${clean.mode}</p>
      <div class="migration-preview">${rows}</div>
      <p class="disclaimer"><strong>Replace</strong> overwrites current data with the backup. <strong>Merge</strong> keeps current data and appends older records (backup wins per day).</p>
    `,
    onClose: () => resolve(null),
    actions: [
      { label: 'Cancel', class: 'btn btn-ghost' },
      {
        label: 'Merge',
        class: 'btn btn-ghost',
        onClick: () => resolve('merge')
      },
      {
        label: 'Replace all',
        class: 'btn btn-primary',
        onClick: () => resolve('replace')
      }
    ]
  });
});

const mergeStates = (current, incoming) => {
  const byDate = new Map();
  for (const h of [...incoming.history, ...current.history]) byDate.set(h.date, h);
  const merged = { ...incoming };
  merged.history = [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date)).slice(-90);
  merged.weightLog = dedupeByDate([...incoming.weightLog, ...current.weightLog]);
  merged.sleepLog = dedupeByDate([...incoming.sleepLog, ...current.sleepLog]);
  merged.workouts = dedupeById([...current.workouts, ...incoming.workouts]);
  merged.habits = mergeHabits(current.habits, incoming.habits);
  merged.recipes = dedupeById([...current.recipes, ...incoming.recipes]);
  merged.savedMeals = dedupeById([...current.savedMeals, ...incoming.savedMeals]);
  merged.customFoods = dedupeById([...current.customFoods, ...incoming.customFoods]);
  merged.log = current.log; /* today's active log: current wins */
  merged.recents = current.recents;
  return merged;
};

const dedupeByDate = (arr) => {
  const m = new Map();
  for (const x of arr) m.set(x.date, x);
  return [...m.values()].sort((a, b) => a.date.localeCompare(b.date)).slice(-365);
};
const dedupeById = (arr) => {
  const m = new Map();
  for (const x of arr) m.set(x.id, x);
  return [...m.values()];
};
const mergeHabits = (a, b) => {
  const merged = dedupeById([...a, ...b]);
  for (const habit of merged) {
    const fromA = a.find((h) => h.id === habit.id);
    const fromB = b.find((h) => h.id === habit.id);
    if (fromA && fromB) {
      habit.log = { ...fromA.log, ...fromB.log };
      habit.setbacks = dedupeById([...(fromA.setbacks || []), ...(fromB.setbacks || [])]);
    }
  }
  return merged;
};

export const importBackup = async () => {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'application/json,.json';
  input.onchange = async () => {
    const file = input.files?.[0];
    if (!file) return;
    let raw = null;
    try {
      raw = JSON.parse(await file.text());
    } catch {
      return toast('That file is not valid JSON.', 'error');
    }
    if (raw?.app !== 'ProtoMacro' || raw?.kind !== 'backup' || !raw.data) {
      return toast('Not a ProtoMacro backup file.', 'error');
    }

    /* validate through the same pipeline as every other load path */
    const clean = normalizeState(raw.data, () => 'import_' + Math.random().toString(36).slice(2));
    if (!clean) return toast('Backup failed schema validation.', 'error');

    const mode = await previewAndConfirm(clean);
    if (!mode) return;

    if (mode === 'replace') {
      replaceState(clean);
    } else {
      replaceState(mergeStates(STATE, clean));
    }
    toast('Backup imported', 'success');
  };
  input.click();
};

export function initBackup() {
  $('#exportBackupBtn')?.addEventListener('click', exportBackup);
  $('#importBackupBtn')?.addEventListener('click', importBackup);
}
