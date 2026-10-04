/* ============================================================
   ProtoMacro — smart-planner.js
   100% local meal-plan generator (no AI, no network).
   v2: preference chips (high-protein, South Asian, budget,
   easy, vegetarian), per-meal regenerate, single-food swap,
   and "Use Plan" writes proper v2 planner items (grams in
   `servings`, not baked into the name).
   Delegates pure solving to core/planner-solver.js.
   ============================================================ */
import { $, escapeHtml, icon, toast } from './utils.js';
import { STATE } from './state.js';
import { replacePlannerSlots } from './planner.js';
import {
  MEAL_ORDER,
  MEAL_META,
  PREFS,
  generatePlan,
  regenerateMeal as solverRegenerateMeal,
  swapFood as solverSwapFood
} from './core/planner-solver.js';

let lastPlan = null;
let dom = null;
const prefs = new Set();

/* =========================================================
   Rendering
   ========================================================= */
const mealCard = (key, meal) => {
  const meta = MEAL_META[key];
  const foods = meal.foods.map((f) => `
    <li class="ai-food">
      <span class="ai-food-name">${escapeHtml(f.name)}</span>
      <span class="ai-food-amt">${escapeHtml(f.amount)}</span>
      <span class="ai-food-cal">${f.calories} kcal</span>
      <button type="button" class="icon-btn" data-swap="${key}:${escapeHtml(f.name)}" title="Swap this food" aria-label="Swap ${escapeHtml(f.name)}">${icon('refresh', 12, 2.2)}</button>
    </li>
  `).join('');
  const t = meal.totals;
  return `
    <div class="ai-meal-card" data-meal-key="${key}">
      <div class="ai-meal-head">
        <div class="ai-meal-title">${meta.emoji} ${meta.label}</div>
        <div style="display:flex; align-items:center; gap:8px;">
          <div class="ai-meal-cal">${Math.round(t.calories)} kcal</div>
          <button type="button" class="icon-btn" data-regen="${key}" title="Regenerate this meal" aria-label="Regenerate ${meta.label}">${icon('refresh', 13, 2.2)}</button>
        </div>
      </div>
      <div class="ai-meal-name">${escapeHtml(meal.name || '')}</div>
      <ul class="ai-food-list">${foods}</ul>
      <div class="ai-macro-chips">
        <span class="chip chip-p">P ${(+t.protein).toFixed(0)}g</span>
        <span class="chip chip-c">C ${(+t.carbs).toFixed(0)}g</span>
        <span class="chip chip-f">F ${(+t.fat).toFixed(0)}g</span>
      </div>
    </div>
  `;
};

const render = (plan) => {
  lastPlan = plan;
  const totals = plan.daily_totals || {};
  const tips = (plan.tips || []).slice(0, 3);

  dom.result.innerHTML = `
    <div class="ai-plan-head">
      <span class="ai-source ai-source-local">Built locally from your targets &amp; the food database</span>
      <div class="ai-plan-totals">
        <strong>${Math.round(totals.calories || 0)} kcal</strong>
        <span>P ${Math.round(totals.protein || 0)}g · C ${Math.round(totals.carbs || 0)}g · F ${Math.round(totals.fat || 0)}g</span>
      </div>
    </div>
    <div class="ai-meal-grid">
      ${MEAL_ORDER.map((k) => mealCard(k, plan.meals[k] || { foods: [], totals: {} })).join('')}
    </div>
    <div class="ai-tips">
      ${tips.map((t) => `<div class="ai-tip">${icon('bolt', 14, 2.5)} ${escapeHtml(t)}</div>`).join('')}
    </div>
    <div class="ai-plan-actions">
      <button class="btn btn-primary" id="aiUsePlanBtn">${icon('check2', 14, 2.5)} Use This Plan</button>
      <button class="btn btn-ghost" id="aiRegenBtn">${icon('arrow', 14, 2.5)} Regenerate All</button>
    </div>
  `;

  $('#aiUsePlanBtn').addEventListener('click', applyPlan);
  $('#aiRegenBtn').addEventListener('click', run);

  dom.result.querySelectorAll('[data-regen]').forEach((btn) => {
    btn.addEventListener('click', () => regenerateMeal(btn.dataset.regen));
  });
  dom.result.querySelectorAll('[data-swap]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const [mealKey, name] = btn.dataset.swap.split(':');
      swapFood(mealKey, name);
    });
  });
};

/* Regenerate one meal, preserving other meals */
const regenerateMeal = (mealKey) => {
  if (!lastPlan) return;
  const updated = solverRegenerateMeal(lastPlan, mealKey, {
    goals: STATE.goals,
    mode: STATE.mode,
    buckets: lastPlan.buckets
  });
  render(updated);
};

/* Swap a single food for a macro-similar alternative */
const swapFood = (mealKey, name) => {
  if (!lastPlan) return;
  const res = solverSwapFood(lastPlan, mealKey, name, {
    buckets: lastPlan.buckets
  });
  if (!res.success) {
    return toast('No alternatives found — try Regenerate.', 'info');
  }
  render(res.plan);
};

const applyPlan = () => {
  if (!lastPlan) return;
  const hasExisting = MEAL_ORDER.some((k) => (STATE.planner[k] || []).length > 0);
  if (hasExisting && !confirm('Replace your current planner meals with this plan?')) return;

  const slots = {};
  for (const key of MEAL_ORDER) {
    const meal = lastPlan.meals[key];
    if (!meal || !meal.foods) continue;
    slots[key] = meal.foods.map((f) => ({
      name: f.name,
      brand: 'Smart Plan',
      calories: f.calories ? Math.round((f.calories / f.grams) * 100) : 0,
      protein:  +(((f.protein || 0) / f.grams) * 100).toFixed(1),
      carbs:    +(((f.carbs   || 0) / f.grams) * 100).toFixed(1),
      fat:      +(((f.fat     || 0) / f.grams) * 100).toFixed(1),
      servings: f.grams
    }));
  }
  replacePlannerSlots(slots);
  toast('Meal plan loaded into your planner!', 'success');
};

const run = () => {
  try {
    const plan = generatePlan({
      goals: STATE.goals,
      mode: STATE.mode,
      prefs
    });
    if (!plan || !plan.meals) throw new Error('generation failed');
    render(plan);
  } catch (e) {
    console.warn('[ProtoMacro] Meal generation failed:', e);
    dom.result.innerHTML = '<div class="ai-error">Could not generate a plan with these preferences. Try removing a filter.</div>';
  }
};

const renderPrefs = () => {
  const host = $('#plannerPrefs');
  if (!host) return;
  host.innerHTML = PREFS.map((p) => `
    <button type="button" class="pref-chip${prefs.has(p.key) ? ' active' : ''}" data-pref="${p.key}"
      aria-pressed="${prefs.has(p.key)}">${p.label}</button>
  `).join('');
};

export function initAiPlanner() {
  const btn = $('#aiGenerateBtn');
  const result = $('#aiResult');
  if (!btn || !result) return;
  dom = { btn, result };
  renderPrefs();

  const host = $('#plannerPrefs');
  host?.addEventListener('click', (e) => {
    const chip = e.target.closest('[data-pref]');
    if (!chip) return;
    const key = chip.dataset.pref;
    if (prefs.has(key)) prefs.delete(key);
    else prefs.add(key);
    renderPrefs();
  });

  btn.addEventListener('click', run);
}
