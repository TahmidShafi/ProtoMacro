/* ============================================================
   ProtoMacro — share.js
   1. Daily nutrition scorecard (HTML Canvas -> PNG download)
   2. Weekly PDF report (jsPDF)
   3. Meal plan text share (Web Share API + clipboard fallback)
   All day keys use the shared local-date helpers from
   datetime.js so reports always match tracker history.
   ============================================================ */
import { jsPDF } from 'jspdf';
import { $, icon, toast } from './utils.js';
import { STATE } from './state.js';
import { MODES } from './mode.js';
import { today, toDateStr } from './datetime.js';
import { getTrackerTotals } from './tracker.js';

/* =========================================================
   Utilities
   ========================================================= */
const downloadDataUrl = (dataUrl, filename) => {
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
};

const gradeDay = () => {
  const g = STATE.goals;
  const t = getTrackerTotals ? getTrackerTotals() : { cal: 0, pro: 0, car: 0, fat: 0 };
  const within = (val, goal, pct) => goal > 0 && Math.abs(val - goal) / goal <= pct;
  const h5 = [within(t.pro, g.protein, 0.05), within(t.car, g.carbs, 0.05), within(t.fat, g.fat, 0.05)].filter(Boolean).length;
  const h10 = [within(t.pro, g.protein, 0.10), within(t.car, g.carbs, 0.10), within(t.fat, g.fat, 0.10)].filter(Boolean).length;

  let grade = 'F';
  if (h5 === 3) grade = 'A';
  else if (h10 === 3) grade = 'B';
  else if (h10 === 2) grade = 'C';
  else if (h10 === 1) grade = 'D';
  return { grade, totals: t };
};

/* =========================================================
   1) DAILY NUTRITION SCORECARD (canvas)
   ========================================================= */
const drawRing = (ctx, cx, cy, r, value, goal, color) => {
  const pct = goal > 0 ? Math.min(1, value / goal) : 0;
  /* track */
  ctx.beginPath();
  ctx.lineWidth = 12;
  ctx.strokeStyle = 'rgba(255,255,255,0.08)';
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.stroke();
  /* progress */
  ctx.beginPath();
  ctx.lineWidth = 12;
  ctx.strokeStyle = color;
  ctx.lineCap = 'round';
  ctx.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * pct);
  ctx.stroke();
};

export const buildScorecardCanvas = () => {
  const { grade, totals } = gradeDay();
  const g = STATE.goals;
  const mode = MODES[STATE.mode] || MODES.maintain;
  const W = 1200, H = 900;

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');

  /* Background gradient */
  const bgGrad = ctx.createLinearGradient(0, 0, W, H);
  bgGrad.addColorStop(0, '#0A0E0C');
  bgGrad.addColorStop(1, '#0F1412');
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, W, H);

  /* Accent glow */
  const glow = ctx.createRadialGradient(W * 0.2, H * 0.1, 20, W * 0.2, H * 0.1, 600);
  glow.addColorStop(0, 'rgba(0,200,83,0.18)');
  glow.addColorStop(1, 'rgba(0,200,83,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);

  /* Header */
  ctx.fillStyle = '#00C853';
  ctx.font = 'bold 48px Inter, sans-serif';
  ctx.fillText('\ud83d\udcaa ProtoMacro', 60, 100);
  ctx.fillStyle = '#8A9691';
  ctx.font = '500 22px Inter, sans-serif';
  const now = new Date();
  ctx.fillText(now.toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }), 60, 140);

  /* Grade capsule */
  const gradeColors = { A: '#00C853', B: '#5EFC8D', C: '#FFB648', D: '#FF9040', F: '#FF4D6D' };
  const gc = gradeColors[grade] || '#00C853';
  ctx.fillStyle = gc;
  ctx.beginPath();
  ctx.arc(W - 180, 130, 90, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#0A0E0C';
  ctx.font = 'bold 120px Inter, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(grade, W - 180, 138);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = '#F1F5F2';
  ctx.font = '600 20px Inter, sans-serif';
  ctx.fillText('Daily grade', W - 245, 250);

  /* Mode badge */
  ctx.fillStyle = 'rgba(0,200,83,0.15)';
  ctx.fillRect(60, 180, 280, 48);
  ctx.fillStyle = '#5EFC8D';
  ctx.font = '600 22px Inter, sans-serif';
  ctx.fillText(`${mode.emoji}  ${mode.label} mode`, 80, 212);

  /* Rings row */
  const ringY = 450;
  const rings = [
    { label: 'Protein', val: totals.pro, goal: g.protein, color: '#FF6B9D', unit: 'g' },
    { label: 'Carbs',   val: totals.car, goal: g.carbs,   color: '#FFB648', unit: 'g' },
    { label: 'Fat',     val: totals.fat, goal: g.fat,     color: '#4FC3F7', unit: 'g' }
  ];
  const ringGap = W / 3;
  rings.forEach((r, i) => {
    const cx = ringGap * i + ringGap / 2;
    drawRing(ctx, cx, ringY, 95, r.val, r.goal, r.color);
    ctx.fillStyle = '#F1F5F2';
    ctx.font = 'bold 42px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`${Math.round(r.val)}`, cx, ringY + 8);
    ctx.fillStyle = '#8A9691';
    ctx.font = '500 18px Inter, sans-serif';
    ctx.fillText(`/ ${r.goal}${r.unit}`, cx, ringY + 34);
    ctx.font = '600 22px Inter, sans-serif';
    ctx.fillStyle = r.color;
    ctx.fillText(r.label, cx, ringY + 140);
  });

  /* Calories card */
  ctx.textAlign = 'left';
  const pct = g.calories > 0 ? Math.min(1, totals.cal / g.calories) : 0;
  ctx.fillStyle = 'rgba(255,255,255,0.03)';
  ctx.fillRect(60, 660, W - 120, 150);
  ctx.strokeStyle = 'rgba(0,200,83,0.25)';
  ctx.lineWidth = 2;
  ctx.strokeRect(60, 660, W - 120, 150);
  ctx.fillStyle = '#8A9691';
  ctx.font = '600 18px Inter, sans-serif';
  ctx.fillText('TODAY\u2019S CALORIES', 90, 700);
  ctx.fillStyle = '#F1F5F2';
  ctx.font = 'bold 56px Inter, sans-serif';
  ctx.fillText(`${Math.round(totals.cal).toLocaleString()} kcal`, 90, 760);
  ctx.fillStyle = '#8A9691';
  ctx.font = '500 24px Inter, sans-serif';
  ctx.fillText(`of ${g.calories.toLocaleString()} kcal target (${Math.round(pct * 100)}%)`, 90, 795);

  /* Progress bar */
  const barX = W / 2 + 40, barY = 720, barW = W - barX - 90, barH = 18;
  ctx.fillStyle = 'rgba(255,255,255,0.06)';
  ctx.fillRect(barX, barY, barW, barH);
  const barGrad = ctx.createLinearGradient(barX, 0, barX + barW, 0);
  barGrad.addColorStop(0, '#00A344');
  barGrad.addColorStop(1, '#5EFC8D');
  ctx.fillStyle = barGrad;
  ctx.fillRect(barX, barY, barW * pct, barH);

  /* Footer */
  ctx.fillStyle = '#5E6B66';
  ctx.font = '500 16px Inter, sans-serif';
  ctx.fillText('Generated by ProtoMacro \u2014 your data never leaves this device', 60, H - 40);

  return canvas;
};

export const shareScorecard = () => {
  try {
    const canvas = buildScorecardCanvas();
    const url = canvas.toDataURL('image/png');
    downloadDataUrl(url, `protomacro-${today()}.png`);
    toast('Scorecard downloaded', 'success');
  } catch (e) {
    console.warn('[ProtoMacro] Scorecard failed:', e);
    toast('Could not generate scorecard.', 'error');
  }
};

/* =========================================================
   2) WEEKLY PDF REPORT (jsPDF)
   ========================================================= */
export function exportWeeklyPdf() {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const W = doc.internal.pageSize.getWidth();
  let y = 50;

  /* Header */
  doc.setFillColor(0, 200, 83);
  doc.rect(0, 0, W, 80, 'F');
  doc.setTextColor(10, 14, 12);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(24);
  doc.text('ProtoMacro Weekly Report', 40, 50);
  doc.setFontSize(11);
  doc.setFont('helvetica', 'normal');
  doc.text(new Date().toLocaleDateString(), 40, 68);

  y = 120;
  doc.setTextColor(30, 30, 30);

  /* User stats */
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text('Your daily targets', 40, y); y += 20;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  const g = STATE.goals;
  doc.text(`Calories: ${g.calories} kcal   \u2022   Protein: ${g.protein}g   \u2022   Carbs: ${g.carbs}g   \u2022   Fat: ${g.fat}g`, 40, y); y += 16;
  doc.text(`Mode: ${MODES[STATE.mode]?.label || 'Maintain'}   \u2022   TDEE: ${STATE.tdee} kcal`, 40, y); y += 30;

  /* 7-day calorie table */
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text('Last 7 days', 40, y); y += 12;

  const days = [];
  const now = new Date();
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now); d.setDate(now.getDate() - i);
    const key = toDateStr(d); /* local date — matches history snapshots exactly */
    days.push({ date: key, label: d.toLocaleDateString(undefined, { weekday: 'short' }), entry: STATE.history.find((h) => h.date === key) });
  }

  const col = [40, 120, 220, 300, 380, 470];
  const rowH = 22;
  doc.setFillColor(240, 240, 240);
  doc.rect(40, y, W - 80, rowH, 'F');
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text('Day',     col[0] + 6, y + 15);
  doc.text('Date',    col[1], y + 15);
  doc.text('Cal',     col[2], y + 15);
  doc.text('Protein', col[3], y + 15);
  doc.text('Carbs',   col[4], y + 15);
  doc.text('Fat',     col[5], y + 15);
  y += rowH;

  doc.setFont('helvetica', 'normal');
  let sum = { cal: 0, p: 0, c: 0, f: 0 }, tracked = 0;
  days.forEach((d) => {
    const e = d.entry;
    if (e) { sum.cal += e.calories; sum.p += e.protein; sum.c += e.carbs; sum.f += e.fat; tracked++; }
    doc.text(d.label, col[0] + 6, y + 15);
    doc.text(d.date,  col[1], y + 15);
    doc.text(String(e?.calories ?? '\u2014'), col[2], y + 15);
    doc.text(String(e?.protein  ?? '\u2014'), col[3], y + 15);
    doc.text(String(e?.carbs    ?? '\u2014'), col[4], y + 15);
    doc.text(String(e?.fat      ?? '\u2014'), col[5], y + 15);
    y += rowH;
  });

  y += 10;
  const avg = (n) => tracked ? (n / tracked).toFixed(0) : '\u2014';
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text('Weekly averages', 40, y); y += 18;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  doc.text(`Calories: ${avg(sum.cal)} kcal   \u2022   P: ${avg(sum.p)}g   \u2022   C: ${avg(sum.c)}g   \u2022   F: ${avg(sum.f)}g`, 40, y); y += 26;

  /* Consistency */
  let hits = 0;
  days.forEach((d) => {
    const e = d.entry; if (!e) return;
    const w = (v, goal) => goal > 0 && Math.abs(v - goal) / goal <= 0.10;
    if (w(e.protein, g.protein) && w(e.carbs, g.carbs) && w(e.fat, g.fat)) hits++;
  });
  const pct = tracked ? Math.round((hits / tracked) * 100) : 0;
  doc.setFont('helvetica', 'bold');
  doc.text('Consistency score', 40, y); y += 18;
  doc.setFont('helvetica', 'normal');
  doc.text(`${hits}/${tracked || 0} days hit all 3 macros within 10% — ${pct}% consistent.`, 40, y); y += 26;

  /* Weight change */
  const wl = STATE.weightLog || [];
  doc.setFont('helvetica', 'bold'); doc.text('Body weight', 40, y); y += 18;
  doc.setFont('helvetica', 'normal');
  if (wl.length) {
    const latest = wl[wl.length - 1];
    const weekAgoDate = new Date(); weekAgoDate.setDate(weekAgoDate.getDate() - 7);
    const oldish = [...wl].reverse().find((w) => w.date <= toDateStr(weekAgoDate));
    const delta = oldish ? (latest.weight - oldish.weight).toFixed(1) : '\u2014';
    doc.text(`Latest: ${latest.weight} kg on ${latest.date}   \u2022   7-day change: ${delta}kg`, 40, y);
  } else {
    doc.text('No weight logs yet.', 40, y);
  }
  y += 26;

  /* Top foods from tracker log (today) — approximation since we don't log per-day food history */
  doc.setFont('helvetica', 'bold'); doc.text('Top foods today', 40, y); y += 18;
  doc.setFont('helvetica', 'normal');
  const foods = [...STATE.log].sort((a, b) => b.calories * (b.servings/100) - a.calories * (a.servings/100)).slice(0, 5);
  if (foods.length) {
    foods.forEach((f, i) => {
      doc.text(`${i + 1}. ${f.name}  (${Math.round(f.calories * (f.servings / 100))} kcal)`, 40, y);
      y += 14;
    });
  } else {
    doc.text('No foods logged today.', 40, y); y += 14;
  }
  y += 14;

  /* Tip */
  doc.setFont('helvetica', 'bold'); doc.text('Personalised tip', 40, y); y += 16;
  doc.setFont('helvetica', 'normal');
  let tip = 'Keep logging daily — consistency beats perfection every week.';
  if (pct < 50 && tracked >= 3) tip = 'Aim for 5+ days of accurate tracking next week to build the habit.';
  else if (pct >= 70 && tracked >= 5) tip = 'Great consistency! Consider refining portion sizes to tighten macros to within 5%.';
  doc.text(tip, 40, y, { maxWidth: W - 80 });

  doc.save(`protomacro-weekly-${today()}.pdf`);
  toast('Weekly report saved', 'success');
}

/* =========================================================
   3) MEAL PLAN TEXT SHARE
   ========================================================= */
const buildMealPlanText = () => {
  const mode = MODES[STATE.mode]?.label || 'Maintain';
  const date = new Date().toLocaleDateString();
  const meals = STATE.planner;
  const g = STATE.goals;

  const fmtMeal = (emoji, label, items) => {
    let cal = 0;
    const names = items.map((i) => { cal += i.calories; return i.name; });
    const foodsText = names.length ? names.join(', ') : '(empty)';
    return `${emoji} ${label}: ${foodsText} — ${Math.round(cal)}kcal`;
  };

  let gc = 0, gp = 0, gcr = 0, gf = 0;
  for (const k of ['breakfast','lunch','dinner','snacks']) {
    for (const i of meals[k]) { gc += i.calories; gp += i.protein; gcr += i.carbs; gf += i.fat; }
  }

  return (
`\ud83d\udcca My ProtoMacro Meal Plan
\ud83d\uddd3\ufe0f ${date} | \ud83c\udfaf ${mode}

${fmtMeal('\ud83c\udf05', 'Breakfast', meals.breakfast)}
${fmtMeal('\u2600\ufe0f',  'Lunch',     meals.lunch)}
${fmtMeal('\ud83c\udf06', 'Dinner',    meals.dinner)}
${fmtMeal('\ud83c\udf19', 'Snacks',    meals.snacks)}

\ud83d\udcc8 Daily Totals:
Calories: ${Math.round(gc)} / ${g.calories}
Protein: ${gp.toFixed(0)}g | Carbs: ${gcr.toFixed(0)}g | Fat: ${gf.toFixed(0)}g

Built with ProtoMacro \ud83d\udcaa`);
};

export const shareMealPlan = async () => {
  const text = buildMealPlanText();
  try {
    if (navigator.share) {
      await navigator.share({ title: 'My ProtoMacro Meal Plan', text });
      return;
    }
  } catch (e) { /* user cancelled */ }
  try {
    await navigator.clipboard.writeText(text);
    toast('Meal plan copied to clipboard!', 'success');
  } catch (e) {
    prompt('Copy this meal plan:', text);
  }
};

/* Bind the meal-plan share button at init time */
export function initShare() {
  $('#shareMealPlanBtn')?.addEventListener('click', shareMealPlan);
}
