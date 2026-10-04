import { describe, it, expect } from 'vitest';
import { unionMerge } from '../js/core/sync.js';
import { calculateLogTotals } from '../js/core/metrics.js';

describe('calculateLogTotals (metrics domain logic)', () => {
  it('returns zeros for empty or null list', () => {
    expect(calculateLogTotals([])).toEqual({ cal: 0, pro: 0, car: 0, fat: 0 });
    expect(calculateLogTotals(null)).toEqual({ cal: 0, pro: 0, car: 0, fat: 0 });
  });

  it('calculates totals for standard 100g servings', () => {
    const items = [
      { name: 'Chicken', servings: 100, calories: 165, protein: 31, carbs: 0, fat: 3.6 },
      { name: 'Rice', servings: 100, calories: 130, protein: 2.7, carbs: 28, fat: 0.3 }
    ];
    const totals = calculateLogTotals(items);
    expect(totals.cal).toBe(295);
    expect(totals.pro).toBeCloseTo(33.7);
    expect(totals.car).toBeCloseTo(28);
    expect(totals.fat).toBeCloseTo(3.9);
  });

  it('scales nutrients proportionally to servings', () => {
    const items = [
      { name: 'Oats', servings: 50, calories: 389, protein: 16.9, carbs: 66.3, fat: 6.9 }
    ];
    const totals = calculateLogTotals(items);
    expect(totals.cal).toBeCloseTo(194.5);
    expect(totals.pro).toBeCloseTo(8.45);
    expect(totals.car).toBeCloseTo(33.15);
    expect(totals.fat).toBeCloseTo(3.45);
  });

  it('safely handles missing fields and null entries', () => {
    const items = [
      null,
      undefined,
      { calories: 100 }, // missing servings, protein, carbs, fat
    ];
    const totals = calculateLogTotals(items);
    expect(totals.cal).toBe(100);
    expect(totals.pro).toBe(0);
    expect(totals.car).toBe(0);
    expect(totals.fat).toBe(0);
  });
});

describe('unionMerge — basic cases', () => {
  it('local empty + remote populated: remote entities are added, remote metadata preserved', () => {
    const local = {};
    const remote = {
      mode: 'bulk',
      goals: { calories: 3000 },
      workouts: [{ id: 'w1', name: 'Legs' }],
      history: [{ date: '2026-09-01', calories: 2500 }]
    };
    const result = unionMerge(local, remote);
    expect(result.mode).toBe('bulk');
    expect(result.goals).toEqual({ calories: 3000 });
    expect(result.workouts).toEqual([{ id: 'w1', name: 'Legs' }]);
    expect(result.history).toEqual([{ date: '2026-09-01', calories: 2500 }]);
  });

  it('local populated + remote empty: local entities and active day preserved', () => {
    const local = {
      log: [{ id: 'item1', name: 'Eggs' }],
      workouts: [{ id: 'w1', name: 'Chest' }],
      history: [{ date: '2026-09-01', calories: 2000 }]
    };
    const remote = {};
    const result = unionMerge(local, remote);
    expect(result.log).toEqual([{ id: 'item1', name: 'Eggs' }]);
    expect(result.workouts).toEqual([{ id: 'w1', name: 'Chest' }]);
    expect(result.history).toEqual([{ date: '2026-09-01', calories: 2000 }]);
  });

  it('both empty: returns valid empty structure without crashing', () => {
    const result = unionMerge({}, {});
    expect(result.log).toBeUndefined();
    expect(result.workouts).toEqual([]);
    expect(result.history).toEqual([]);
    expect(result.recipes).toEqual([]);
    expect(result.habits).toEqual([]);
  });

  it('both populated: merges entity collections and active state correctly', () => {
    const local = {
      workouts: [{ id: 'w1', name: 'Local Push' }],
      history: [{ date: '2026-09-02', calories: 2100 }],
      log: [{ id: 'f1' }]
    };
    const remote = {
      workouts: [{ id: 'w2', name: 'Remote Pull' }],
      history: [{ date: '2026-09-01', calories: 1900 }],
      log: [{ id: 'remote_f1' }]
    };
    const result = unionMerge(local, remote);
    expect(result.workouts.map((w) => w.id)).toEqual(['w1', 'w2']);
    expect(result.history.map((h) => h.date)).toEqual(['2026-09-01', '2026-09-02']);
    expect(result.log).toEqual([{ id: 'f1' }]); // active day stays local
  });
});

describe('unionMerge — ID-based entities (workouts, recipes, savedMeals, customFoods)', () => {
  it('retains local-only entity', () => {
    const local = { workouts: [{ id: 'w_local', name: 'Push Day' }] };
    const remote = { workouts: [] };
    const result = unionMerge(local, remote);
    expect(result.workouts).toEqual([{ id: 'w_local', name: 'Push Day' }]);
  });

  it('appends remote-only entity', () => {
    const local = { workouts: [] };
    const remote = { workouts: [{ id: 'w_remote', name: 'Pull Day' }] };
    const result = unionMerge(local, remote);
    expect(result.workouts).toEqual([{ id: 'w_remote', name: 'Pull Day' }]);
  });

  it('local version wins on ID collision (remote changes discarded)', () => {
    const local = {
      recipes: [{ id: 'r1', name: 'Chicken & Rice (Local Version)', servings: 2 }]
    };
    const remote = {
      recipes: [{ id: 'r1', name: 'Chicken & Rice (Remote Edit)', servings: 4 }]
    };
    const result = unionMerge(local, remote);
    expect(result.recipes).toHaveLength(1);
    expect(result.recipes[0].name).toBe('Chicken & Rice (Local Version)');
    expect(result.recipes[0].servings).toBe(2);
  });

  it('merges multiple unique IDs from both sides', () => {
    const local = {
      savedMeals: [
        { id: 'm1', name: 'Breakfast' },
        { id: 'm2', name: 'Lunch' }
      ]
    };
    const remote = {
      savedMeals: [
        { id: 'm3', name: 'Dinner' },
        { id: 'm4', name: 'Snack' }
      ]
    };
    const result = unionMerge(local, remote);
    expect(result.savedMeals.map((m) => m.id)).toEqual(['m1', 'm2', 'm3', 'm4']);
  });

  it('deduplicates entities if input contains duplicate IDs (last local entry wins, remote ignored)', () => {
    const local = {
      customFoods: [
        { id: 'cf1', name: 'Whey Local A' },
        { id: 'cf1', name: 'Whey Local B' }
      ]
    };
    const remote = {
      customFoods: [
        { id: 'cf1', name: 'Whey Remote' }
      ]
    };
    const result = unionMerge(local, remote);
    expect(result.customFoods).toHaveLength(1);
    // In Map.set iteration over local array, the later local entry updates the map,
    // and remote is ignored because !m.has(id) is false.
    expect(result.customFoods[0].name).toBe('Whey Local B');
  });
});

describe('unionMerge — date-based entities (history, weightLog, sleepLog)', () => {
  it('merges local-only date', () => {
    const local = { history: [{ date: '2026-09-02', calories: 2000 }] };
    const remote = { history: [] };
    const result = unionMerge(local, remote);
    expect(result.history).toEqual([{ date: '2026-09-02', calories: 2000 }]);
  });

  it('merges remote-only date', () => {
    const local = { history: [] };
    const remote = { history: [{ date: '2026-09-01', calories: 1800 }] };
    const result = unionMerge(local, remote);
    expect(result.history).toEqual([{ date: '2026-09-01', calories: 1800 }]);
  });

  it('local version wins on same date', () => {
    const local = {
      weightLog: [{ date: '2026-09-05', weight: 75.5 }]
    };
    const remote = {
      weightLog: [{ date: '2026-09-05', weight: 77.0 }]
    };
    const result = unionMerge(local, remote);
    expect(result.weightLog).toHaveLength(1);
    expect(result.weightLog[0].weight).toBe(75.5);
  });

  it('sorts merged date entities in chronological ascending order', () => {
    const local = {
      sleepLog: [
        { date: '2026-09-03', hours: 7 },
        { date: '2026-09-01', hours: 8 }
      ]
    };
    const remote = {
      sleepLog: [
        { date: '2026-09-04', hours: 6.5 },
        { date: '2026-09-02', hours: 7.5 }
      ]
    };
    const result = unionMerge(local, remote);
    expect(result.sleepLog.map((s) => s.date)).toEqual([
      '2026-09-01',
      '2026-09-02',
      '2026-09-03',
      '2026-09-04'
    ]);
  });

  it('enforces retention caps (history: 90 days, weightLog: 365 days, sleepLog: 365 days)', () => {
    const manyHistory = Array.from({ length: 120 }, (_, i) => {
      const d = new Date(2026, 0, i + 1);
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      return { date: `${y}-${m}-${dd}`, calories: 2000 };
    });
    const result = unionMerge({ history: manyHistory }, {});
    expect(result.history).toHaveLength(90);
    // Preserves the latest 90 entries (the last entry in the 120-day span)
    expect(result.history[89].date).toBe(manyHistory[119].date);
  });
});

describe('unionMerge — active-day data and metadata rules', () => {
  it('strictly preserves active day data from local state', () => {
    const local = {
      log: [{ id: 'active_food' }],
      planner: { breakfast: [{ id: 'p1' }], lunch: [], dinner: [], snacks: [] },
      water: { date: '2026-09-05', consumed: 2500, goal: 4000 },
      supplements: { date: '2026-09-05', list: [], checked: { s1: true } },
      favorites: { foods: ['f1'], recipes: [], meals: [] },
      recents: [{ id: 'f1', ts: 12345 }]
    };
    const remote = {
      log: [{ id: 'remote_food_ignored' }],
      planner: { breakfast: [{ id: 'p_remote' }], lunch: [], dinner: [], snacks: [] },
      water: { date: '2026-09-05', consumed: 1000, goal: 3000 },
      supplements: { date: '2026-09-05', list: [], checked: {} },
      favorites: { foods: ['remote_f'], recipes: [], meals: [] },
      recents: [{ id: 'remote_recent', ts: 99999 }]
    };
    const result = unionMerge(local, remote);
    expect(result.log).toEqual(local.log);
    expect(result.planner).toEqual(local.planner);
    expect(result.water).toEqual(local.water);
    expect(result.supplements).toEqual(local.supplements);
    expect(result.favorites).toEqual(local.favorites);
    expect(result.recents).toEqual(local.recents);
  });

  it('accepts incoming remote metadata/config via spread', () => {
    const local = {
      mode: 'cut',
      tdee: 2200,
      goals: { calories: 1700, protein: 160 },
      settings: { theme: 'dark' }
    };
    const remote = {
      mode: 'bulk',
      tdee: 2500,
      goals: { calories: 3000, protein: 180 },
      settings: { theme: 'light' }
    };
    const result = unionMerge(local, remote);
    expect(result.mode).toBe('bulk');
    expect(result.tdee).toBe(2500);
    expect(result.goals).toEqual({ calories: 3000, protein: 180 });
    expect(result.settings).toEqual({ theme: 'light' });
  });
});

describe('unionMerge — nested data and habit merging', () => {
  it('preserves nested exercises and sets in workouts', () => {
    const local = {
      workouts: [
        {
          id: 'w1',
          name: 'Bench Press Session',
          date: '2026-09-05',
          exercises: [
            {
              name: 'Bench Press',
              sets: [
                { weight: 80, reps: 5 },
                { weight: 85, reps: 5 }
              ]
            }
          ]
        }
      ]
    };
    const remote = { workouts: [] };
    const result = unionMerge(local, remote);
    expect(result.workouts[0].exercises[0].sets).toEqual([
      { weight: 80, reps: 5 },
      { weight: 85, reps: 5 }
    ]);
  });

  it('merges habits: combines day logs and deduplicates setbacks across devices', () => {
    const local = {
      habits: [
        {
          id: 'h1',
          name: 'No Sugar',
          emoji: '🍬',
          mode: 'quit',
          log: { '2026-09-02': 'ok', '2026-09-03': 'ok' },
          setbacks: [{ id: 'sb_1', date: '2026-09-01', trigger: 'stress' }]
        }
      ]
    };
    const remote = {
      habits: [
        {
          id: 'h1',
          name: 'No Sugar (Remote Edit)',
          emoji: '🍬',
          mode: 'quit',
          log: { '2026-09-01': 'ok', '2026-09-02': 'setback' }, // 09-02 conflicts with local 'ok'
          setbacks: [
            { id: 'sb_1', date: '2026-09-01', trigger: 'stress' }, // duplicate id
            { id: 'sb_2', date: '2026-08-30', trigger: 'social' }  // new setback
          ]
        },
        {
          id: 'h2',
          name: 'Read 20 mins',
          log: { '2026-09-01': 'ok' },
          setbacks: []
        }
      ]
    };
    const result = unionMerge(local, remote);
    expect(result.habits).toHaveLength(2);

    const mergedH1 = result.habits.find((h) => h.id === 'h1');
    expect(mergedH1.name).toBe('No Sugar'); // local metadata wins
    // Local log on 2026-09-02 was 'ok', remote was 'setback'. Local wins:
    expect(mergedH1.log['2026-09-02']).toBe('ok');
    // Non-conflicting remote log on 2026-09-01 is preserved:
    expect(mergedH1.log['2026-09-01']).toBe('ok');
    expect(mergedH1.log['2026-09-03']).toBe('ok');
    // Setbacks deduplicated by ID:
    expect(mergedH1.setbacks.map((s) => s.id)).toEqual(['sb_1', 'sb_2']);

    const h2 = result.habits.find((h) => h.id === 'h2');
    expect(h2.name).toBe('Read 20 mins');
  });
});

describe('unionMerge — missing, null, and invalid data handling', () => {
  it('handles null/undefined for current and incoming gracefully', () => {
    expect(() => unionMerge(null, null)).not.toThrow();
    expect(() => unionMerge(undefined, undefined)).not.toThrow();
    const res = unionMerge(null, { goals: { calories: 2000 } });
    expect(res.goals.calories).toBe(2000);
    expect(res.workouts).toEqual([]);
  });

  it('skips malformed entities missing id or date', () => {
    const local = {
      workouts: [null, undefined, { name: 'No ID' }, { id: 'w1', name: 'Valid' }],
      history: [null, { calories: 1500 }, { date: '2026-09-01', calories: 2000 }]
    };
    const remote = {
      workouts: [{ id: null }, { id: 'w2', name: 'Valid Remote' }],
      history: [{ date: null }, { date: '2026-09-02', calories: 1900 }]
    };
    const result = unionMerge(local, remote);
    expect(result.workouts.map((w) => w.id)).toEqual(['w1', 'w2']);
    expect(result.history.map((h) => h.date)).toEqual(['2026-09-01', '2026-09-02']);
  });
});

describe('unionMerge — regression tests', () => {
  it('regression: does not mutate input arguments in place during habit merging', () => {
    const localHabit = {
      id: 'h_mut',
      name: 'Test',
      log: { '2026-09-01': 'ok' },
      setbacks: [{ id: 's1' }]
    };
    const remoteHabit = {
      id: 'h_mut',
      name: 'Test',
      log: { '2026-09-02': 'ok' },
      setbacks: [{ id: 's2' }]
    };
    const local = { habits: [localHabit] };
    const remote = { habits: [remoteHabit] };

    const result = unionMerge(local, remote);
    // Result should contain merged data:
    expect(result.habits[0].log).toEqual({ '2026-09-01': 'ok', '2026-09-02': 'ok' });
    // Local habit object must NOT have been mutated:
    expect(localHabit.log).toEqual({ '2026-09-01': 'ok' });
    expect(localHabit.setbacks).toEqual([{ id: 's1' }]);
  });

  it('regression: incoming habit logs are actually merged when habit ID exists in local', () => {
    const local = {
      habits: [{ id: 'h_sync', name: 'Workout', log: { '2026-09-05': 'ok' } }]
    };
    const remote = {
      habits: [{ id: 'h_sync', name: 'Workout', log: { '2026-09-04': 'ok' } }]
    };
    const result = unionMerge(local, remote);
    // Both days should be present in the merged habit
    expect(result.habits[0].log['2026-09-04']).toBe('ok');
    expect(result.habits[0].log['2026-09-05']).toBe('ok');
  });
});
