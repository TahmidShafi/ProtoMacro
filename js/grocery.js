/* ============================================================
   ProtoMacro — grocery.js
   Generate a grocery list from the current meal plan.
   Aggregates grams by food name; portions listed separately.
   Checkbox state is ephemeral (per session).
   ============================================================ */
import { $, escapeHtml, icon, toast } from './utils.js';
import { STATE } from './state.js';
import { openModal } from './core/modal.js';
import { itemMacros, MEAL_KEYS } from './planner.js';

const checked = new Set();

const aggregate = () => {
  const byName = new Map();
  for (const key of MEAL_KEYS) {
    for (const item of STATE.planner[key] || []) {
      const grams = item.servings ?? 100;
      const name = item.name.replace(/\s*\(\d+g\)\s*$/, '').trim();
      const existing = byName.get(name);
      if (existing) {
        existing.grams += grams;
        existing.count += 1;
      } else {
        byName.set(name, { name, grams, count: 1 });
      }
    }
  }
  return [...byName.values()].sort((a, b) => b.grams - a.grams);
};

const fmtGrams = (g) => (g >= 1000 ? `${(g / 1000).toFixed(1)} kg` : `${Math.round(g)} g`);

export function openGroceryList() {
  const items = aggregate();
  if (!items.length) {
    toast('Your meal plan is empty — add foods first.', 'info');
    return;
  }

  const wrap = document.createElement('div');
  const render = () => {
    wrap.innerHTML = `
      <div class="grocery-list" role="list">
        ${items.map((it, i) => `
          <label class="grocery-item${checked.has(i) ? ' checked' : ''}" role="listitem">
            <input type="checkbox" data-check="${i}" ${checked.has(i) ? 'checked' : ''} aria-label="Bought ${escapeHtml(it.name)}" />
            <span class="grocery-name">${escapeHtml(it.name)}</span>
            <span class="grocery-amt">~${fmtGrams(it.grams)}</span>
          </label>
        `).join('')}
      </div>
      <p class="disclaimer">Totals are summed from your current plan's gram amounts — round to sensible package sizes when you shop.</p>
    `;
  };
  render();

  wrap.addEventListener('change', (e) => {
    const i = parseInt(e.target.dataset.check, 10);
    if (Number.isFinite(i)) {
      if (e.target.checked) checked.add(i);
      else checked.delete(i);
      render();
    }
  });

  openModal({
    title: '🛒 Grocery list',
    body: wrap,
    wide: true,
    actions: [
      {
        label: 'Copy',
        class: 'btn btn-ghost',
        onClick: async () => {
          const text = items.map((it) => `• ${it.name} — ~${fmtGrams(it.grams)}`).join('\n');
          try {
            await navigator.clipboard.writeText(`ProtoMacro grocery list:\n\n${text}`);
            toast('Grocery list copied', 'success');
          } catch {
            toast('Clipboard unavailable', 'error');
          }
        }
      },
      {
        label: 'Print',
        class: 'btn btn-primary',
        onClick: () => {
          const w = window.open('', '_blank', 'width=480,height=640');
          if (!w) return toast('Pop-up blocked', 'error');
          w.document.write(`<title>Grocery List — ProtoMacro</title><pre style="font:15px/1.8 sans-serif">${items
            .map((it) => `☐ ${it.name} — ~${fmtGrams(it.grams)}`)
            .join('\n')}</pre>`);
          w.document.close();
          w.print();
        }
      }
    ]
  });
}
