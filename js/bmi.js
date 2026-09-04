/* ============================================================
   ProtoMacro — bmi.js
   BMI + TDEE (Mifflin-St Jeor) calculator.
   The results panel stays in sync with mode changes via the
   onGoalsApplied hook registered by mode.js (B5 fix).
   ============================================================ */
import { $ } from './utils.js';
import { num, clamp, animateNumber, toast } from './utils.js';
import { STATE, saveState } from './state.js';
import { setMode, calcMacrosFor, onGoalsApplied } from './mode.js';

const BMI_CATEGORIES = [
  { max: 18.5, label: 'Underweight',   bg: 'rgba(79, 195, 247, 0.15)', color: '#4FC3F7' },
  { max: 25,   label: 'Normal weight', bg: 'rgba(0, 200, 83, 0.15)',   color: 'var(--primary-light)' },
  { max: 30,   label: 'Overweight',    bg: 'rgba(255, 182, 72, 0.15)', color: '#FFB648' },
  { max: Infinity, label: 'Obese',     bg: 'rgba(255, 77, 109, 0.15)', color: '#FF4D6D' }
];

const VALIDATION = [
  { id: 'weight', min: 20, max: 400 },
  { id: 'height', min: 80, max: 250 },
  { id: 'age',    min: 10, max: 120 }
];

/* DOM cache (resolved once at init) */
let dom = null;

const getCategory = (bmi) => BMI_CATEGORIES.find((c) => bmi < c.max);

const validateForm = () => {
  let ok = true;
  for (const f of VALIDATION) {
    const input = dom[f.id];
    const v = num(input.value);
    const group = input.closest('.form-group');
    const invalid = v === null || v < f.min || v > f.max;
    group.classList.toggle('error', invalid);
    if (invalid) ok = false;
  }
  if (!ok) toast('Please fix the highlighted fields.', 'error');
  return ok;
};

const calculate = () => {
  const weight = num(dom.weight.value);
  const height = num(dom.height.value);
  const age    = num(dom.age.value);
  const gender = $('input[name="gender"]:checked').value;
  const activity = num(dom.activity.value);

  const bmi = weight / Math.pow(height / 100, 2);
  const bmr = gender === 'male'
    ? (10 * weight) + (6.25 * height) - (5 * age) + 5
    : (10 * weight) + (6.25 * height) - (5 * age) - 161;

  const tdee = Math.round(bmr * activity);

  return {
    bmi,
    tdee,
    lose: tdee - 500,
    gain: tdee + 500,
    protein: Math.round((tdee * 0.30) / 4),
    carbs:   Math.round((tdee * 0.40) / 4),
    fat:     Math.round((tdee * 0.30) / 9)
  };
};

const render = (r) => {
  dom.placeholder.classList.add('hidden');
  dom.content.classList.remove('hidden');
  dom.content.classList.add('fade-in');

  dom.bmiValue.textContent = r.bmi.toFixed(1);

  const cat = getCategory(r.bmi);
  dom.bmiCategory.textContent = cat.label;
  dom.bmiCategory.style.background = cat.bg;
  dom.bmiCategory.style.color = cat.color;

  // Position marker on 16 -> 40 scale
  dom.bmiMarker.style.left = clamp(((r.bmi - 16) / 24) * 100, 0, 100) + '%';

  animateNumber(dom.caloriesLose,     r.lose);
  animateNumber(dom.caloriesMaintain, r.tdee);
  animateNumber(dom.caloriesGain,     r.gain);

  /* Macro pills always reflect the ACTIVE mode's split — this is what
     "Set as my daily goals" will actually apply (B5 fix). */
  renderMacroPills();
};

/* Re-render the three macro pills from the currently active mode + TDEE. */
const renderMacroPills = () => {
  const g = calcMacrosFor(STATE.tdee, STATE.mode);
  dom.macroProtein.textContent = g.protein;
  dom.macroCarbs.textContent   = g.carbs;
  dom.macroFat.textContent     = g.fat;
};

export function initBmi() {
  dom = {
    form:             $('#bmiForm'),
    weight:           $('#weight'),
    height:           $('#height'),
    age:              $('#age'),
    activity:         $('#activity'),
    placeholder:      $('#resultsPlaceholder'),
    content:          $('#resultsContent'),
    bmiValue:         $('#bmiValue'),
    bmiCategory:      $('#bmiCategory'),
    bmiMarker:        $('#bmiMarker'),
    caloriesLose:     $('#caloriesLose'),
    caloriesMaintain: $('#caloriesMaintain'),
    caloriesGain:     $('#caloriesGain'),
    macroProtein:     $('#macroProtein'),
    macroCarbs:       $('#macroCarbs'),
    macroFat:         $('#macroFat'),
    saveBtn:          $('#saveGoalsBtn')
  };

  // Reasonable defaults (without overwriting saved values if pre-filled)
  if (!dom.weight.value) dom.weight.value = 72;
  if (!dom.height.value) dom.height.value = 175;
  if (!dom.age.value)    dom.age.value    = 25;

  dom.form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!validateForm()) return;
    const r = calculate();
    STATE.lastResults = r;
    STATE.tdee = r.tdee;
    saveState();
    render(r);
  });

  dom.saveBtn.addEventListener('click', () => {
    const r = STATE.lastResults;
    if (!r) return;
    /* Re-apply goals using the currently selected mode */
    setMode(STATE.mode, { tdee: r.tdee, silent: true });
    toast('Daily goals saved & tracker updated!', 'success');
  });

  /* Keep the results panel consistent whenever goals change
     (mode toggle anywhere in the app). */
  onGoalsApplied(() => {
    if (!STATE.lastResults || dom.content.classList.contains('hidden')) return;
    renderMacroPills();
  });
}
