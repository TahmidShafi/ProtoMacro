/* ============================================================
   ProtoMacro — calculators.js
   Five bodybuilding calculators:
     1. One Rep Max (1RM) — Epley, Brzycki, Lander + % table
     2. Body Fat % (US Navy method, M/F)
     3. Macro calculator (bulk/cut/maintain/recomp)
     4. Wilks Score (powerlifting)
     5. Lean Body Mass + FFMI
   ============================================================ */
import { $, $$, num } from './utils.js';

const CALCS = [
  { key: '1rm',   label: 'One Rep Max', icon: '\ud83c\udfcb\ufe0f' },
  { key: 'bf',    label: 'Body Fat %',  icon: '\ud83d\udcca' },
  { key: 'macro', label: 'Macros',      icon: '\ud83c\udf57' },
  { key: 'wilks', label: 'Wilks Score', icon: '\ud83c\udfc6' },
  { key: 'ffmi',  label: 'LBM & FFMI',  icon: '\ud83e\uddec' }
];

let active = '1rm';

/* ---------------- Shared helpers ---------------- */
const numVal = (sel) => num($(sel)?.value);
const setResult = (sel, html) => {
  const el = $(sel);
  if (!el) return;
  el.innerHTML = html;
  el.classList.remove('fade-in');
  void el.offsetWidth;
  el.classList.add('fade-in');
};

/* =========================================================
   1) ONE REP MAX
   ========================================================= */
const oneRepMax = {
  epley:   (w, r) => w * (1 + r / 30),
  brzycki: (w, r) => w * 36 / (37 - r),
  lander:  (w, r) => (100 * w) / (101.3 - 2.67123 * r)
};

const PERCENTS = [100, 95, 90, 85, 80, 75, 70, 65, 60, 55, 50];
const REP_RANGES = {
  100: '1 rep (test day)',
  95:  '2 reps (heavy singles)',
  90:  '3-4 reps (strength)',
  85:  '5 reps (strength)',
  80:  '8 reps (hypertrophy)',
  75:  '10 reps (hypertrophy)',
  70:  '12 reps (hypertrophy)',
  65:  '15 reps (endurance)',
  60:  '16-20 reps (endurance)',
  55:  'Warm-up',
  50:  'Warm-up / pump'
};

const calc1RM = () => {
  const w = numVal('#rm-weight');
  const r = numVal('#rm-reps');
  if (!w || w <= 0 || !r || r < 1 || r > 20) {
    return setResult('#rm-result', '<div class="calc-error">Enter weight (> 0) and reps (1-20).</div>');
  }
  const ep  = oneRepMax.epley(w, r);
  const br  = oneRepMax.brzycki(w, r);
  const la  = oneRepMax.lander(w, r);
  const avg = (ep + br + la) / 3;

  const rows = PERCENTS.map((p) => `
    <tr>
      <td><strong>${p}%</strong></td>
      <td>${((avg * p) / 100).toFixed(1)} kg</td>
      <td class="calc-table-hint">${REP_RANGES[p]}</td>
    </tr>
  `).join('');

  setResult('#rm-result', `
    <div class="calc-result-grid">
      <div class="calc-stat"><div class="calc-stat-label">Epley</div><div class="calc-stat-val">${ep.toFixed(1)}<small>kg</small></div></div>
      <div class="calc-stat primary"><div class="calc-stat-label">Average 1RM</div><div class="calc-stat-val">${avg.toFixed(1)}<small>kg</small></div></div>
      <div class="calc-stat"><div class="calc-stat-label">Brzycki</div><div class="calc-stat-val">${br.toFixed(1)}<small>kg</small></div></div>
      <div class="calc-stat"><div class="calc-stat-label">Lander</div><div class="calc-stat-val">${la.toFixed(1)}<small>kg</small></div></div>
    </div>
    <div class="calc-result-tip"><strong>Tip:</strong> Use 80% of 1RM for hypertrophy (8-12 reps), 90%+ for strength.</div>
    <div class="calc-table-wrap">
      <table class="calc-table">
        <thead><tr><th>%</th><th>Load</th><th>Recommended use</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `);
};

/* =========================================================
   2) BODY FAT % (US Navy)
   ========================================================= */
const bfCategory = (bf, male) => {
  const ranges = male
    ? [[5,'Essential'],[13,'Athletes'],[17,'Fitness'],[24,'Average'],[100,'Obese']]
    : [[13,'Essential'],[20,'Athletes'],[24,'Fitness'],[31,'Average'],[100,'Obese']];
  for (const [max, label] of ranges) if (bf <= max) return label;
  return 'Obese';
};

const calcBF = () => {
  const male   = $('input[name="bfGender"]:checked').value === 'male';
  const neck   = numVal('#bf-neck');
  const waist  = numVal('#bf-waist');
  const height = numVal('#bf-height');
  const hips   = numVal('#bf-hips');

  if (!neck || !waist || !height || (!male && !hips)) {
    return setResult('#bf-result', '<div class="calc-error">Please fill in all measurements.</div>');
  }

  let bf;
  if (male) {
    bf = 495 / (1.0324 - 0.19077 * Math.log10(waist - neck) + 0.15456 * Math.log10(height)) - 450;
  } else {
    bf = 495 / (1.29579 - 0.35004 * Math.log10(waist + hips - neck) + 0.22100 * Math.log10(height)) - 450;
  }

  if (!Number.isFinite(bf) || bf < 2 || bf > 70) {
    return setResult('#bf-result', '<div class="calc-error">Measurements look off — double-check your values.</div>');
  }

  const cat = bfCategory(bf, male);

  setResult('#bf-result', `
    <div class="calc-hero">
      <div class="calc-hero-val">${bf.toFixed(1)}<small>%</small></div>
      <div class="calc-hero-label">Body Fat</div>
      <div class="calc-badge">${cat}</div>
    </div>
    <div class="calc-categories">
      <div class="cat-row"><span>Essential</span><small>${male ? '2-5%' : '10-13%'}</small></div>
      <div class="cat-row"><span>Athletes</span><small>${male ? '6-13%' : '14-20%'}</small></div>
      <div class="cat-row"><span>Fitness</span><small>${male ? '14-17%' : '21-24%'}</small></div>
      <div class="cat-row"><span>Average</span><small>${male ? '18-24%' : '25-31%'}</small></div>
      <div class="cat-row"><span>Obese</span><small>${male ? '25%+' : '32%+'}</small></div>
    </div>
  `);
};

/* =========================================================
   3) MACRO CALCULATOR
   ========================================================= */
const MACRO_PRESETS = {
  cut:      { p: 0.40, c: 0.30, f: 0.30, note: 'High protein to preserve muscle' },
  bulk:     { p: 0.30, c: 0.50, f: 0.20, note: 'Carb-heavy for energy and growth' },
  maintain: { p: 0.30, c: 0.40, f: 0.30, note: 'Balanced intake for recomposition' },
  recomp:   { p: 0.35, c: 0.35, f: 0.30, note: 'Even split for body recomposition' }
};

const PROTEIN_FOOD_HINTS = [
  'Chicken breast (~31g / 100g)',
  'Greek yogurt (~10g / 100g)',
  'Whey shake (~25g / scoop)',
  'Eggs (~6g / egg)',
  'Lean beef (~26g / 100g)',
  'Tuna (~25g / 100g)',
  'Cottage cheese (~11g / 100g)'
];

const calcMacro = () => {
  const cals = numVal('#mc-calories');
  const goal = $('#mc-goal').value;
  if (!cals || cals < 800) {
    return setResult('#mc-result', '<div class="calc-error">Enter a calorie target (800 or more).</div>');
  }
  const p = MACRO_PRESETS[goal];
  const protein = Math.round((cals * p.p) / 4);
  const carbs   = Math.round((cals * p.c) / 4);
  const fat     = Math.round((cals * p.f) / 9);

  const perMeal = (g) => (g / 4).toFixed(0);

  setResult('#mc-result', `
    <div class="calc-result-grid">
      <div class="calc-stat primary"><div class="calc-stat-label">Calories</div><div class="calc-stat-val">${cals}<small>kcal</small></div></div>
      <div class="calc-stat"><div class="calc-stat-label">Protein</div><div class="calc-stat-val" style="color:var(--protein)">${protein}<small>g</small></div></div>
      <div class="calc-stat"><div class="calc-stat-label">Carbs</div><div class="calc-stat-val" style="color:var(--carbs)">${carbs}<small>g</small></div></div>
      <div class="calc-stat"><div class="calc-stat-label">Fat</div><div class="calc-stat-val" style="color:var(--fat)">${fat}<small>g</small></div></div>
    </div>
    <div class="calc-result-tip"><strong>${p.note}</strong></div>
    <div class="calc-subgrid">
      <div><strong>Per meal (4 meals):</strong> ${perMeal(protein)}g P \u00b7 ${perMeal(carbs)}g C \u00b7 ${perMeal(fat)}g F</div>
    </div>
    <div class="calc-hint-block">
      <div class="calc-hint-title">High-protein foods to hit ${protein}g:</div>
      <ul class="calc-hint-list">${PROTEIN_FOOD_HINTS.map((h) => `<li>${h}</li>`).join('')}</ul>
    </div>
  `);
};

/* =========================================================
   4) WILKS SCORE
   ========================================================= */
const WILKS_COEFS = {
  male:   { a: -216.0475144, b: 16.2606339, c: -0.002388645, d: -0.00113732, e: 7.01863e-6,  f: -1.291e-8 },
  female: { a: 594.31747775582, b: -27.23842536447, c: 0.82112226871, d: -0.00930733913, e: 4.731582e-5, f: -9.054e-8 }
};

const calcWilks = () => {
  const bw    = numVal('#wk-bodyweight');
  const total = numVal('#wk-total');
  const male  = $('input[name="wkGender"]:checked').value === 'male';
  if (!bw || !total) {
    return setResult('#wk-result', '<div class="calc-error">Enter bodyweight and total lifted (kg).</div>');
  }
  const c = WILKS_COEFS[male ? 'male' : 'female'];
  const coef = 500 / (c.a + c.b*bw + c.c*bw**2 + c.d*bw**3 + c.e*bw**4 + c.f*bw**5);
  const score = coef * total;

  let cat = 'Beginner';
  if (score >= 500) cat = 'Elite';
  else if (score >= 400) cat = 'Advanced';
  else if (score >= 300) cat = 'Intermediate';

  setResult('#wk-result', `
    <div class="calc-hero">
      <div class="calc-hero-val">${score.toFixed(1)}</div>
      <div class="calc-hero-label">Wilks Score</div>
      <div class="calc-badge">${cat}</div>
    </div>
    <div class="calc-categories">
      <div class="cat-row"><span>Beginner</span><small>0 - 300</small></div>
      <div class="cat-row"><span>Intermediate</span><small>300 - 400</small></div>
      <div class="cat-row"><span>Advanced</span><small>400 - 500</small></div>
      <div class="cat-row"><span>Elite</span><small>500+</small></div>
    </div>
  `);
};

/* =========================================================
   5) LEAN BODY MASS + FFMI
   ========================================================= */
const ffmiCategory = (ffmi) => {
  if (ffmi < 18) return ['Below average', 'var(--text-muted)'];
  if (ffmi < 20) return ['Average', 'var(--info)'];
  if (ffmi < 22) return ['Above average', 'var(--primary)'];
  if (ffmi < 23) return ['Excellent', 'var(--primary-light)'];
  if (ffmi < 26) return ['Superior (natty limit)', 'var(--warning)'];
  return ['Suspiciously high (likely enhanced)', 'var(--danger)'];
};

const calcFFMI = () => {
  const w  = numVal('#ff-weight');
  const bf = numVal('#ff-bodyfat');
  const h  = numVal('#ff-height'); /* cm */
  if (!w || bf === null || bf < 2 || bf > 70 || !h) {
    return setResult('#ff-result', '<div class="calc-error">Enter weight (kg), body fat %, and height (cm).</div>');
  }
  const hM   = h / 100;
  const lbm  = w * (1 - bf / 100);
  const fat  = w - lbm;
  const ffmi = lbm / (hM * hM);
  const norm = ffmi + 6.1 * (1.8 - hM);
  const [cat, color] = ffmiCategory(norm);

  setResult('#ff-result', `
    <div class="calc-result-grid">
      <div class="calc-stat"><div class="calc-stat-label">Lean Body Mass</div><div class="calc-stat-val">${lbm.toFixed(1)}<small>kg</small></div></div>
      <div class="calc-stat"><div class="calc-stat-label">Fat Mass</div><div class="calc-stat-val">${fat.toFixed(1)}<small>kg</small></div></div>
      <div class="calc-stat"><div class="calc-stat-label">FFMI</div><div class="calc-stat-val">${ffmi.toFixed(1)}</div></div>
      <div class="calc-stat primary"><div class="calc-stat-label">Normalized FFMI</div><div class="calc-stat-val" style="color:${color}">${norm.toFixed(1)}</div></div>
    </div>
    <div class="calc-badge" style="background:${color};color:var(--bg-0);">${cat}</div>
    <div class="calc-categories">
      <div class="cat-row"><span>Below average</span><small>&lt;18</small></div>
      <div class="cat-row"><span>Average</span><small>18 - 20</small></div>
      <div class="cat-row"><span>Above average</span><small>20 - 22</small></div>
      <div class="cat-row"><span>Excellent</span><small>22 - 23</small></div>
      <div class="cat-row"><span>Superior (natty limit)</span><small>23 - 26</small></div>
      <div class="cat-row"><span>Suspiciously high</span><small>26+</small></div>
    </div>
  `);
};

/* =========================================================
   TABS
   ========================================================= */
const showPanel = (key) => {
  active = key;
  $$('.calc-tab').forEach((t) => t.classList.toggle('active', t.dataset.calc === key));
  $$('.calc-panel').forEach((p) => p.classList.toggle('active', p.dataset.calc === key));
};

const renderTabs = () => {
  const host = $('#calcTabs');
  if (!host) return;
  host.innerHTML = CALCS.map((c) => `
    <button class="calc-tab${c.key === active ? ' active' : ''}" data-calc="${c.key}" role="tab" aria-selected="${c.key === active}">
      <span class="calc-tab-icon">${c.icon}</span>
      <span>${c.label}</span>
    </button>
  `).join('');
};

export function initCalculators() {
  if (!$('#calculators')) return;
  renderTabs();
  showPanel(active);

  $('#calcTabs').addEventListener('click', (e) => {
    const t = e.target.closest('[data-calc]');
    if (t) showPanel(t.dataset.calc);
  });

  $('#rm-calc-btn')?.addEventListener('click', calc1RM);
  $('#bf-calc-btn')?.addEventListener('click', calcBF);
  $('#mc-calc-btn')?.addEventListener('click', calcMacro);
  $('#wk-calc-btn')?.addEventListener('click', calcWilks);
  $('#ff-calc-btn')?.addEventListener('click', calcFFMI);

  /* Show/hide hips field based on gender */
  const updHips = () => {
    const male = $('input[name="bfGender"]:checked').value === 'male';
    $('#bf-hips-row').style.display = male ? 'none' : '';
  };
  $$('input[name="bfGender"]').forEach((r) => r.addEventListener('change', updHips));
  updHips();
}
