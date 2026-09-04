/* ============================================================
   ProtoMacro — app.js
   Entry point. Imports every module (dependency order is now
   resolved by the ES module graph) and boots the app.

   Also self-hosts the Inter font weights used by styles.css.
   ============================================================ */

/* Fonts (bundled locally via @fontsource — no CDN, works offline) */
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

const boot = () => {
  loadState();

  initNav();
  initMode();
  initBmi();
  initSearch();
  initTracker();
  initPlanner();
  initRecovery();
  initCalculators();
  initProgress();
  initAiPlanner();
  initShare();

  const yearEl = $('#year');
  if (yearEl) yearEl.textContent = new Date().getFullYear();
};

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot, { once: true });
} else {
  boot();
}
