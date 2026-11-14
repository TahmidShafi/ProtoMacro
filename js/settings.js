/* ============================================================
   ProtoMacro — settings.js
   Units (display-only conversion; storage stays metric),
   theme (dark/light/system), USDA key override,
   danger zone.
   ============================================================ */
import { $, $$, toast, num } from './utils.js';
import { STATE, saveState } from './state.js';
import { on, emit } from './core/bus.js';
import { openModal, formModal } from './core/modal.js';
import { localProvider } from './core/storage/index.js';

let dom = null;

/* ---------------- theme ---------------- */

const systemDark = () => window.matchMedia?.('(prefers-color-scheme: dark)').matches;

export const applyTheme = () => {
  const theme = STATE.settings.theme || 'dark';
  const effective = theme === 'system' ? (systemDark() ? 'dark' : 'light') : theme;
  document.documentElement.dataset.theme = effective;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = effective === 'dark' ? '#0B1020' : '#F4F7FB';
};

const setTheme = (theme) => {
  STATE.settings.theme = theme;
  saveState();
  applyTheme();
  renderSegs();
  emit('theme:applied', { theme });
};

/* ---------------- units ---------------- */

const setUnit = (key, value) => {
  STATE.settings.units[key] = value;
  saveState();
  renderSegs();
};

const renderSegs = () => {
  const s = STATE.settings;
  const paint = (sel, active) => {
    $$(sel).forEach((b) => b.classList.toggle('active', b.dataset.value === active));
  };
  paint('#unitWeightSeg .seg-btn', s.units.weight);
  paint('#unitHeightSeg .seg-btn', s.units.height);
  paint('#unitWaterSeg .seg-btn', s.units.water);
  paint('#themeSeg .seg-btn', s.theme);
};

/* ---------------- init ---------------- */

export function initSettings() {
  const section = $('#settings');
  if (!section) return;
  dom = { section };

  applyTheme();

  $('#unitWeightSeg').addEventListener('click', (e) => {
    const b = e.target.closest('[data-value]');
    if (b) setUnit('weight', b.dataset.value);
  });
  $('#unitHeightSeg').addEventListener('click', (e) => {
    const b = e.target.closest('[data-value]');
    if (b) setUnit('height', b.dataset.value);
  });
  $('#unitWaterSeg').addEventListener('click', (e) => {
    const b = e.target.closest('[data-value]');
    if (b) setUnit('water', b.dataset.value);
  });
  $('#themeSeg').addEventListener('click', (e) => {
    const b = e.target.closest('[data-value]');
    if (b) setTheme(b.dataset.value);
  });

  /* USDA key override */
  const usdaWrap = document.createElement('div');
  usdaWrap.className = 'settings-row';
  usdaWrap.innerHTML = `
    <span>USDA API key <small style="color:var(--text-dim)">(optional — raises rate limits)</small></span>
    <button type="button" class="btn btn-ghost btn-sm" id="usdaKeyBtn">Set key</button>
  `;
  $('.settings-card h3')?.closest('.settings-card')?.appendChild(usdaWrap);
  $('#usdaKeyBtn')?.addEventListener('click', async () => {
    const values = await formModal({
      title: 'USDA FoodData Central API key',
      fields: [
        { id: 'key', label: 'API key (stored only on this device)', type: 'text', value: STATE.settings.usdaKey, placeholder: 'Leave empty to use the public DEMO_KEY' }
      ],
      submitLabel: 'Save key'
    });
    if (values === null) return;
    STATE.settings.usdaKey = (values.key || '').trim().slice(0, 80);
    saveState();
    toast(STATE.settings.usdaKey ? 'USDA key saved locally' : 'Using public DEMO_KEY', 'success');
  });

  /* Danger zone */
  $('#clearAllBtn')?.addEventListener('click', async () => {
    const values = await formModal({
      title: 'Clear ALL ProtoMacro data?',
      fields: [{ id: 'confirm', label: 'This erases logs, history, workouts, habits — everything. Type CLEAR to confirm.', type: 'text', placeholder: 'CLEAR' }],
      submitLabel: 'Erase everything'
    });
    if (values?.confirm?.toUpperCase() !== 'CLEAR') return;
    localProvider.clear();
    location.reload();
  });

  renderSegs();
  on('state:replaced', () => { renderSegs(); applyTheme(); });
  on('theme:toggle', () => {
    const current = document.documentElement.dataset.theme === 'light' ? 'dark' : 'light';
    setTheme(current);
  });
}
