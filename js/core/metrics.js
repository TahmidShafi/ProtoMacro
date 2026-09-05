/* ============================================================
   ProtoMacro — core/metrics.js
   Shared pure calculations used by tracker, dashboard, progress,
   weekly review, calendar, share. Single source of truth so the
   completion-score logic is never duplicated.

   All functions are pure (no DOM, no STATE) → easily testable.
   ============================================================ */

import { toDateStr } from '../datetime.js';

/* ------------------------------------------------------------
   DAILY COMPLETION SCORE (0–100)
   Transparent, tolerance-based. Factors:
     - Calories within ±10% of goal ......... 40
     - Protein ≥ 90% of goal ................ 30
     - Water ≥ 80% of goal .................. 15
     - Logged ≥ 3 items ..................... 15
   Each factor is reported so the UI can show the breakdown.
   ------------------------------------------------------------ */

export const SCORE_FACTORS = { calories: 40, protein: 30, water: 15, logging: 15 };

export const computeDailyScore = (input) => {
  const breakdown = {
    calories: 0,
    protein: 0,
    water: 0,
    logging: 0
  };

  const cal = input?.calories ?? 0;
  const pro = input?.protein ?? 0;
  const items = input?.items ?? 0;
  const water = input?.water ?? 0;
  const goals = input?.goals ?? {};
  const calGoal = goals.calories || 0;
  const proGoal = goals.protein || 0;
  const waterGoal = goals.water || 4000;

  if (calGoal > 0 && cal > 0) {
    const ratio = Math.abs(cal - calGoal) / calGoal;
    if (ratio <= 0.10) breakdown.calories = SCORE_FACTORS.calories;
    else if (ratio <= 0.20) breakdown.calories = Math.round(SCORE_FACTORS.calories / 2);
  }

  if (proGoal > 0 && cal > 0) {
    const ratio = pro / proGoal;
    if (ratio >= 1) breakdown.protein = SCORE_FACTORS.protein;
    else if (ratio >= 0.9) breakdown.protein = Math.round(SCORE_FACTORS.protein * 0.8);
    else if (ratio >= 0.7) breakdown.protein = Math.round(SCORE_FACTORS.protein * 0.5);
  }

  if (water > 0 && waterGoal > 0) {
    const ratio = water / waterGoal;
    if (ratio >= 1) breakdown.water = SCORE_FACTORS.water;
    else if (ratio >= 0.8) breakdown.water = SCORE_FACTORS.water;
    else if (ratio >= 0.5) breakdown.water = Math.round(SCORE_FACTORS.water / 2);
  }

  if (items >= 3) breakdown.logging = SCORE_FACTORS.logging;
  else if (items >= 1) breakdown.logging = Math.round(SCORE_FACTORS.logging / 2);

  const total =
    breakdown.calories + breakdown.protein + breakdown.water + breakdown.logging;

  return {
    score: Math.min(100, total),
    breakdown
  };
};

/* Score band → semantic label (used by calendar/dashboard) */
export const scoreBand = (score) => {
  if (score >= 80) return 'good';
  if (score >= 40) return 'partial';
  return 'none';
};

/* ------------------------------------------------------------
   MACRO CONSISTENCY (weekly) — previously duplicated 3×.
   A day "hits" when all three macros land within tolerance.
   ------------------------------------------------------------ */

export const macroConsistency = (days, goals, tolerance = 0.10) => {
  let hits = 0;
  let tracked = 0;
  for (const d of days) {
    if (!d) continue;
    tracked++;
    const within = (v, g) => g > 0 && v > 0 && Math.abs(v - g) / g <= tolerance;
    if (
      within(d.protein, goals.protein) &&
      within(d.carbs, goals.carbs) &&
      within(d.fat, goals.fat)
    ) {
      hits++;
    }
  }
  return { hits, tracked, pct: tracked ? Math.round((hits / tracked) * 100) : 0 };
};

/* ------------------------------------------------------------
   WEIGHT STATS — trend vs actual clearly separated.
   ------------------------------------------------------------ */

export const movingAverage = (series, window = 7) => {
  const out = [];
  for (let i = 0; i < series.length; i++) {
    const slice = series.slice(Math.max(0, i - window + 1), i + 1);
    const vals = slice.filter((v) => Number.isFinite(v));
    out.push(vals.length ? vals.reduce((s, v) => s + v, 0) / vals.length : null);
  }
  return out;
};

/* dateKey fn returns 'YYYY-MM-DD'; entries assumed [{date, weight}] */
export const weightStats = (weightLog, opts = {}) => {
  const { goalWeight = null, dateKey = (d) => d.date, now = new Date() } = opts;
  const sorted = [...weightLog].sort((a, b) => dateKey(a).localeCompare(dateKey(b)));
  if (!sorted.length) {
    return { start: null, current: null, goal: goalWeight, weekly: null, monthly: null, total: null, trend: [] };
  }

  const current = sorted[sorted.length - 1].weight;
  const start = sorted[0].weight;

  /* Reading closest to N days ago (either side) — friendlier for
     sparse logs than a strict cutoff. */
  const closestTo = (daysBack) => {
    const cut = new Date(now);
    cut.setDate(now.getDate() - daysBack);
    const key = toDateStr(cut);
    const time = (s) => new Date(s + 'T00:00:00').getTime();
    const cutT = time(key);
    let best = null;
    let bestDiff = Infinity;
    for (const w of sorted) {
      const diff = Math.abs(time(dateKey(w)) - cutT);
      if (diff < bestDiff) {
        bestDiff = diff;
        best = w;
      }
    }
    return best ? best.weight : null;
  };

  const weekAgo = closestTo(7);
  const monthAgo = closestTo(30);

  /* 7-day moving average over the log (actual values, sparse-safe) */
  const trend = movingAverage(sorted.map((w) => w.weight), 7);

  return {
    start,
    current,
    goal: goalWeight,
    weekly: weekAgo !== null ? current - weekAgo : null,
    monthly: monthAgo !== null ? current - monthAgo : null,
    total: start !== null ? current - start : null,
    trend
  };
};

/* ------------------------------------------------------------
   ESTIMATED 1RM — Epley (standard for workout tracking)
   ------------------------------------------------------------ */

export const epley1RM = (weight, reps) => {
  if (!(weight > 0) || !(reps >= 1)) return 0;
  if (reps === 1) return weight;
  return weight * (1 + reps / 30);
};

export const trainingVolume = (sets) =>
  (sets || []).reduce((sum, s) => {
    const w = Number(s.weight) || 0;
    const r = Number(s.reps) || 0;
    return sum + w * r;
  }, 0);

/* ------------------------------------------------------------
   HABIT STREAK LOGIC
   days: Map or object keyed 'YYYY-MM-DD' → 'ok' | 'partial' | 'setback'
   mode: 'quit'    → only 'ok' days count
         'reduce'  → 'ok' + 'partial' count (below limit counts as win)
   Anchors streak at today: today counts if won, else streak counts
   back from yesterday (so the streak isn't zeroed mid-day).
   ------------------------------------------------------------ */

export const habitStreak = (dayMap, mode = 'quit', todayKey) => {
  const isWin = (status) =>
    status === 'ok' || (mode === 'reduce' && status === 'partial');

  const d = new Date(todayKey + 'T00:00:00');
  const keyOf = (dt) => {
    const y = dt.getFullYear();
    const m = String(dt.getMonth() + 1).padStart(2, '0');
    const dd = String(dt.getDate()).padStart(2, '0');
    return `${y}-${m}-${dd}`;
  };

  let current = 0;
  let cursor = new Date(d);
  if (!isWin(dayMap[keyOf(cursor)])) {
    cursor.setDate(cursor.getDate() - 1);
  }
  while (isWin(dayMap[keyOf(cursor)])) {
    current++;
    cursor.setDate(cursor.getDate() - 1);
  }

  /* longest streak + totals from full history */
  const keys = Object.keys(dayMap).filter((k) => typeof dayMap[k] === 'string').sort();
  let longest = 0;
  let run = 0;
  let ok = 0;
  let setbacks = 0;
  let partial = 0;
  let prev = null;
  for (const k of keys) {
    const status = dayMap[k];
    const contiguous = prev !== null && (new Date(k + 'T00:00:00') - new Date(prev + 'T00:00:00')) === 86400000;
    if (!contiguous) run = 0;
    if (isWin(status)) {
      run++;
      ok++;
      if (run > longest) longest = run;
    } else {
      run = 0;
      if (status === 'setback') setbacks++;
      else if (status === 'partial') partial++;
    }
    prev = k;
  }

  const logged = ok + setbacks + partial;
  return {
    current,
    longest: Math.max(longest, current),
    ok,
    partial,
    setbacks,
    successRate: logged ? Math.round((ok / logged) * 100) : 0
  };
};

export const HABIT_MILESTONES = [1, 3, 7, 14, 30, 100, 365];
export const nextMilestone = (current) =>
  HABIT_MILESTONES.find((m) => m > current) ?? null;

/* MILESTONE_LABELS for money-saved etc. kept in habits.js (UI concern) */
