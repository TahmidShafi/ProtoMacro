import { describe, it, expect } from 'vitest';
import {
  normalizeState,
  sanitizeFoodItem,
  sanitizeHistory,
  sanitizeWeightLog,
  SCHEMA_VERSION
} from '../js/core/migrate.js';
import { computeDailyScore, macroConsistency, weightStats, epley1RM, trainingVolume, habitStreak, movingAverage } from '../js/core/metrics.js';
import { toDateStr, today } from '../js/datetime.js';
import { calcMacrosFor } from '../js/mode.js';

const makeId = () => 'test_' + Math.random().toString(36).slice(2);

describe('datetime', () => {
  it('formats local YYYY-MM-DD', () => {
    expect(toDateStr(new Date(2026, 8, 5))).toBe('2026-09-05');
  });
  it('today() is a valid date key', () => {
    expect(today()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('BMI / TDEE / macros (mode.js mirrors bmi.js formulas)', () => {
  it('maintain macros from TDEE', () => {
    const g = calcMacrosFor(2000, 'maintain');
    expect(g.calories).toBe(2000);
    expect(g.protein).toBe(Math.round((2000 * 0.3) / 4));
  });
  it('cut deficit floor at 1200', () => {
    expect(calcMacrosFor(1400, 'cut').calories).toBe(1200);
  });
  it('bulk surplus', () => {
    expect(calcMacrosFor(2000, 'bulk').calories).toBe(2500);
  });
});

describe('sanitizeFoodItem', () => {
  it('rejects items without a name', () => {
    expect(sanitizeFoodItem({ calories: 100 }, makeId)).toBeNull();
  });
  it('coerces non-finite macros to 0 and clamps servings', () => {
    const item = sanitizeFoodItem(
      { name: 'x', calories: NaN, protein: '5', servings: 99999 },
      makeId
    );
    expect(item.calories).toBe(0);
    expect(item.protein).toBe(5);
    expect(item.servings).toBe(5000);
  });
  it('portion units clamp to 0.25–50', () => {
    const item = sanitizeFoodItem({ name: 'x', unit: 'portion', servings: 100 }, makeId);
    expect(item.servings).toBe(50);
  });
  it('keeps existing uid (stable IDs for sync)', () => {
    const item = sanitizeFoodItem({ name: 'x', uid: 'abc' }, makeId);
    expect(item.uid).toBe('abc');
  });
});

describe('sanitizeHistory', () => {
  it('drops entries with invalid dates', () => {
    const out = sanitizeHistory([{ date: 'garbage' }, { date: '2026-09-01', calories: 100 }]);
    expect(out).toHaveLength(1);
    expect(out[0].calories).toBe(100);
  });
  it('v1 entries without items get inferred from calories', () => {
    const out = sanitizeHistory([{ date: '2026-09-01', calories: 500 }]);
    expect(out[0].items).toBe(1);
  });
});

describe('sanitizeWeightLog', () => {
  it('sorts by date and filters junk', () => {
    const out = sanitizeWeightLog([
      { date: '2026-09-03', weight: 80 },
      { date: 'bad', weight: 10 },
      { date: '2026-09-01', weight: 82 }
    ]);
    expect(out.map((w) => w.date)).toEqual(['2026-09-01', '2026-09-03']);
  });
});

describe('normalizeState — v1 data migrates', () => {
  const v1 = {
    goals: { calories: 2400, protein: 180, carbs: 240, fat: 80 },
    mode: 'cut',
    tdee: 2400,
    log: [{ name: 'Rice', calories: 130, protein: 2.7, carbs: 28, fat: 0.3, servings: 200 }],
    planner: { breakfast: [], lunch: [], dinner: [], snacks: [] },
    water: { date: '2026-09-01', consumed: 1500, goal: 4000 },
    supplements: { date: '2026-09-01', list: [], checked: { whey: true } },
    history: [{ date: '2026-09-01', calories: 2000, protein: 150, carbs: 200, fat: 67, mode: 'maintain', goals: {} }],
    weightLog: [{ date: '2026-09-01', weight: 75 }]
  };

  it('adds schemaVersion and all new collections', () => {
    const s = normalizeState(v1, makeId);
    expect(s.schemaVersion).toBe(SCHEMA_VERSION);
    expect(s.log).toHaveLength(1);
    expect(s.recipes).toEqual([]);
    expect(s.workouts).toEqual([]);
    expect(s.habits).toEqual([]);
    expect(s.settings.units.weight).toBe('kg');
  });
  it('rejects non-objects', () => {
    expect(normalizeState(null, makeId)).toBeNull();
    expect(normalizeState([1, 2], makeId)).toBeNull();
  });
  it('rejects future schema versions', () => {
    expect(normalizeState({ schemaVersion: 99 }, makeId)).toBeNull();
  });
  it('never produces NaN in goals', () => {
    const s = normalizeState({ goals: { calories: 'NaN' } }, makeId);
    expect(Number.isFinite(s.goals.calories)).toBe(true);
  });
});

describe('computeDailyScore', () => {
  const goals = { calories: 2000, protein: 150, water: 4000 };
  it('perfect day scores 100 with full breakdown', () => {
    const r = computeDailyScore({ calories: 2000, protein: 150, items: 3, water: 4000, goals });
    expect(r.score).toBe(100);
    expect(r.breakdown).toEqual({ calories: 40, protein: 30, water: 15, logging: 15 });
  });
  it('calories within ±10% pass, ±20% half', () => {
    expect(computeDailyScore({ calories: 1850, protein: 0, items: 0, water: 0, goals }).breakdown.calories).toBe(40);
    expect(computeDailyScore({ calories: 1650, protein: 0, items: 0, water: 0, goals }).breakdown.calories).toBe(20);
    expect(computeDailyScore({ calories: 1500, protein: 0, items: 0, water: 0, goals }).breakdown.calories).toBe(0);
  });
  it('never requires perfection — partial logging earns partial credit', () => {
    const r = computeDailyScore({ calories: 2000, protein: 150, items: 1, water: 2000, goals });
    expect(r.score).toBeGreaterThan(0);
    expect(r.score).toBeLessThan(100);
  });
  it('zero-everything scores 0', () => {
    expect(computeDailyScore({ calories: 0, protein: 0, items: 0, water: 0, goals }).score).toBe(0);
  });
  it('tolerates missing input', () => {
    expect(computeDailyScore(null).score).toBe(0);
  });
});

describe('macroConsistency', () => {
  const goals = { protein: 150, carbs: 200, fat: 67 };
  it('counts days with all macros within 10%', () => {
    const days = [
      { protein: 150, carbs: 200, fat: 67 },
      { protein: 140, carbs: 190, fat: 62 },
      { protein: 100, carbs: 200, fat: 67 } // protein misses
    ];
    const r = macroConsistency(days, goals);
    expect(r.hits).toBe(2);
    expect(r.tracked).toBe(3);
    expect(r.pct).toBe(67);
  });
  it('skips null days', () => {
    expect(macroConsistency([null, null], goals).tracked).toBe(0);
  });
});

describe('weight stats', () => {
  it('computes deltas and 7-day moving average', () => {
    const log = [
      { date: '2026-08-01', weight: 80 },
      { date: '2026-08-30', weight: 79 },
      { date: '2026-09-04', weight: 78 }
    ];
    const now = new Date(2026, 8, 5);
    const s = weightStats(log, { now });
    expect(s.start).toBe(80);
    expect(s.current).toBe(78);
    expect(s.total).toBe(-2);
    expect(s.weekly).toBe(-1); // 79 → 78
    expect(s.monthly).toBe(-2);
    expect(s.trend).toHaveLength(3);
  });
  it('handles empty log', () => {
    const s = weightStats([], { now: new Date() });
    expect(s.current).toBeNull();
  });
  it('movingAverage ignores sparse nulls', () => {
    const ma = movingAverage([1, null, 3, 4], 3);
    expect(ma[0]).toBe(1);
    expect(ma[2]).toBe(2);
  });
});

describe('workout math', () => {
  it('epley 1RM: 100kg × 5 reps ≈ 116.7', () => {
    expect(epley1RM(100, 5)).toBeCloseTo(116.67, 1);
    expect(epley1RM(100, 1)).toBe(100);
    expect(epley1RM(0, 5)).toBe(0);
  });
  it('volume = Σ weight × reps', () => {
    expect(trainingVolume([{ weight: 100, reps: 5 }, { weight: 60, reps: 10 }])).toBe(1100);
    expect(trainingVolume([{ weight: NaN, reps: 5 }])).toBe(0);
  });
});

describe('habit streaks', () => {
  /* local-date key (never toISOString — timezone shifts the day) */
  const key = (offset, from = '2026-09-05') => {
    const d = new Date(from + 'T00:00:00');
    d.setDate(d.getDate() - offset);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${dd}`;
  };
  it('quit mode: consecutive ok days count', () => {
    const log = { [key(1)]: 'ok', [key(2)]: 'ok', [key(3)]: 'ok', [key(4)]: 'setback' };
    const r = habitStreak(log, 'quit', '2026-09-05');
    expect(r.current).toBe(3);
    expect(r.longest).toBe(3);
    expect(r.setbacks).toBe(1);
  });
  it('reduce mode: partial days keep the streak alive', () => {
    const log = { [key(1)]: 'partial', [key(2)]: 'ok' };
    expect(habitStreak(log, 'reduce', '2026-09-05').current).toBe(2);
    // quit mode treats 'partial' as a miss → streak stops before yesterday
    expect(habitStreak(log, 'quit', '2026-09-05').current).toBe(0);
  });
  it('unlogged days break streaks; today not logged ≠ streak lost', () => {
    const log = { [key(1)]: 'ok', [key(2)]: 'ok' };
    expect(habitStreak(log, 'quit', '2026-09-05').current).toBe(2);
  });
  it('success rate from logged days only', () => {
    const log = { [key(1)]: 'ok', [key(2)]: 'ok', [key(3)]: 'setback' };
    expect(habitStreak(log, 'quit', '2026-09-05').successRate).toBe(67);
  });
});
