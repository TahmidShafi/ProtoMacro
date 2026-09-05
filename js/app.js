/* ============================================================
   ProtoMacro — app.js
   Entry point. Boots in dependency order:
     state load → theme → all feature modules → sync/auth.
   Inter font + styles are bundled locally (no CDN, offline OK).
   ============================================================ */

/* Fonts (bundled locally via @fontsource) */
import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import '@fontsource/inter/700.css';
import '@fontsource/inter/800.css';
import '@fontsource/inter/900.css';

/* Styles */
import '../css/styles.css';

/* Core */
import { $ } from './utils.js';
import { loadState } from './state.js';
import { on, emit } from './core/bus.js';
import { cloudConfigured } from './core/storage/index.js';

/* Feature modules */
import { initNav } from './nav.js';
import { initMode } from './mode.js';
import { initBmi } from './bmi.js';
import { initSearch } from './search.js';
import { initTracker } from './tracker.js';
import { initPlanner } from './planner.js';
import { initRecovery } from './recovery.js';
import { initCalculators } from './calculators.js';
import { initProgress } from './progress.js';
import { initAiPlanner } from './smart-planner.js';
import { initShare } from './share.js';
import { initDashboard } from './dashboard.js';
import { initHabits } from './habits.js';
import { initWorkouts } from './workouts.js';
import { initSettings, applyTheme } from './settings.js';
import { initBackup } from './backup.js';

/* Cloud (optional, env-gated — no-ops in guest mode) */
import { initAuth, maybeShowWelcome } from './core/auth.js';
import { initSync } from './core/sync.js';

/* ---------------- sync status pill ---------------- */

const bindSyncPill = () => {
  const pill = $('#syncPill');
  if (!pill) return;
  const label = $('.sync-label', pill);

  const LABELS = {
    local: 'Saved on this device',
    saved: '✓ Saved locally',
    syncing: '⟳ Syncing…',
    synced: '☁ Synced',
    offline: '⚠ Offline — will sync',
    error: '⚠ Sync problem'
  };

  on('sync:status', ({ status }) => {
    pill.className = `sync-pill ${status === 'local' || status === 'saved' ? '' : status}`;
    if (label) label.textContent = LABELS[status] || LABELS.local;
    pill.title = 'Data storage: ' + (LABELS[status] || 'local');
  });
  emit('sync:status', { status: 'saved' });
};

/* ---------------- boot ---------------- */

const boot = () => {
  loadState();
  applyTheme();

  initNav();
  initMode();
  initDashboard();
  initBmi();
  initSearch();
  initTracker();
  initPlanner();
  initWorkouts();
  initRecovery();
  initHabits();
  initCalculators();
  initProgress();
  initAiPlanner();
  initShare();
  initBackup();
  initSettings();

  bindSyncPill();
  initSync();
  initAuth().then(() => {
    maybeShowWelcome();
    emit('auth:ready');
  });

  const yearEl = $('#year');
  if (yearEl) yearEl.textContent = new Date().getFullYear();

  if (!cloudConfigured()) {
    /* keep pill honest in guest deployments */
    on('sync:status', () => {});
  }
};

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot, { once: true });
} else {
  boot();
}
