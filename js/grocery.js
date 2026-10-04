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
import { on } from './core/bus.js';

const checked = new Set();
let activeModal = null;
let activeWrap = null;
let activeItems = [];
let renderGroceryContent = null;

export const aggregateGroceryItems = (planner = STATE.planner) => {
  const byName = new Map();
  for (const key of MEAL_KEYS) {
    for (const item of (planner && planner[key]) || []) {
      if (!item || !item.name) continue;
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

export const formatGrams = (g) => (g >= 1000 ? `${(g / 1000).toFixed(1)} kg` : `${Math.round(g)} g`);

export function openGroceryList() {
  activeItems = aggregateGroceryItems();
  if (!activeItems.length) {
    toast('Your meal plan is empty — add foods first.', 'info');
    return;
  }

  activeWrap = document.createElement('div');
  renderGroceryContent = () => {
    activeItems = aggregateGroceryItems();
    if (!activeItems.length) {
      activeWrap.innerHTML = '<p class="entity-sub" style="padding:16px 0; text-align:center;">Your meal plan is empty — add foods in the planner.</p>';
      return;
    }
    activeWrap.innerHTML = `
      <div class="grocery-list" role="list">
        ${activeItems.map((it) => `
          <label class="grocery-item${checked.has(it.name) ? ' checked' : ''}" role="listitem">
            <input type="checkbox" data-item="${escapeHtml(it.name)}" ${checked.has(it.name) ? 'checked' : ''} aria-label="Bought ${escapeHtml(it.name)}" />
            <span class="grocery-name">${escapeHtml(it.name)}</span>
            <span class="grocery-amt">~${formatGrams(it.grams)}</span>
          </label>
        `).join('')}
      </div>
      <p class="disclaimer">Totals are summed from your current plan's gram amounts — round to sensible package sizes when you shop.</p>
    `;
  };
  renderGroceryContent();

  activeWrap.addEventListener('change', (e) => {
    const itemName = e.target.dataset.item;
    if (itemName) {
      if (e.target.checked) checked.add(itemName);
      else checked.delete(itemName);
      renderGroceryContent();
    }
  });

  activeModal = openModal({
    title: '🛒 Grocery list',
    body: activeWrap,
    wide: true,
    onClose: () => {
      activeModal = null;
      activeWrap = null;
      renderGroceryContent = null;
    },
    actions: [
      {
        label: 'Copy',
        class: 'btn btn-ghost',
        onClick: async () => {
          if (!activeItems.length) return;
          const text = activeItems.map((it) => `• ${it.name} — ~${formatGrams(it.grams)}`).join('\n');
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
          if (!activeItems.length) return;
          const w = window.open('', '_blank', 'width=480,height=640');
          if (!w) return toast('Pop-up blocked', 'error');

          w.document.title = 'Grocery List — ProtoMacro';
          const pre = w.document.createElement('pre');
          pre.style.cssText = 'font:15px/1.8 sans-serif; white-space:pre-wrap; margin:20px;';
          pre.textContent = activeItems
            .map((it) => `☐ ${it.name} — ~${formatGrams(it.grams)}`)
            .join('\n');
          w.document.body.appendChild(pre);
          w.document.close();
          w.print();
        }
      }
    ]
  });
}

export function initGrocery() {
  $('#groceryBtn')?.addEventListener('click', openGroceryList);
  on('grocery:update', () => {
    if (activeModal && activeWrap && renderGroceryContent) {
      renderGroceryContent();
    }
  });
}
