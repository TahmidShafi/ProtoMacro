/* ============================================================
   ProtoMacro — migration-wizard.js
   Guest → account migration with explicit preview + confirm.
   Shows exactly what will be uploaded; nothing is silent.
   ============================================================ */
import { STATE, flushState } from './state.js';
import { openModal } from './core/modal.js';
import { toast } from './utils.js';
import { isSignedIn, openAuthModal } from './core/auth.js';
import { retrySync } from './core/sync.js';

const COUNT_KEYS = [
  ['Daily goals & mode', () => 1],
  ['Food log (today)', () => STATE.log.length],
  ['Meal planner items', () => Object.values(STATE.planner).reduce((s, a) => s + a.length, 0)],
  ['Custom foods', () => STATE.customFoods.length],
  ['Favorites', () => STATE.favorites.foods.length + STATE.favorites.recipes.length + STATE.favorites.meals.length],
  ['Recipes', () => STATE.recipes.length],
  ['Saved meals', () => STATE.savedMeals.length],
  ['History days', () => STATE.history.length],
  ['Water history', () => (STATE.history.filter((h) => (h.water ?? 0) > 0).length)],
  ['Supplement stack', () => STATE.supplements.list.length],
  ['Weight logs', () => STATE.weightLog.length],
  ['Sleep logs', () => STATE.sleepLog.length],
  ['Workouts', () => STATE.workouts.length],
  ['Habits', () => STATE.habits.length],
  ['Settings', () => 1]
];

export function openMigrationWizard() {
  if (!isSignedIn()) {
    toast('Sign in first — then sync your local data.', 'info');
    openAuthModal({ mode: 'signin' });
    return;
  }

  const rows = COUNT_KEYS
    .map(([label, count]) => `
      <div class="migration-preview-row">
        <span>${label}</span><strong>${count()}</strong>
      </div>`)
    .join('');

  openModal({
    title: 'Move local data to your account?',
    body: `
      <p class="entity-sub" style="margin-bottom:10px;">
        The data below currently lives <strong>only in this browser</strong>.
        Uploading makes it available on any device you sign in from.
        This app's cloud is protected by Row Level Security — only your account can read it.
      </p>
      <div class="migration-preview">${rows}</div>
      <p class="disclaimer">A local backup snapshot is kept automatically before syncing, and your data also remains in this browser.</p>
    `,
    actions: [
      { label: 'Not now', class: 'btn btn-ghost' },
      {
        label: 'Upload to cloud',
        class: 'btn btn-primary',
        onClick: async () => {
          await flushState();
          retrySync();
          toast('Local data uploaded to your account ☁️', 'success');
        }
      }
    ]
  });
}
