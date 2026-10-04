import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { STATE, recordWeight, makeId } from '../js/state.js';
import {
  addPlannerItem,
  removePlannerItem,
  updatePlannerItemGrams,
  replacePlannerSlot,
  replacePlannerSlots,
  clearPlannerSlot,
  loadMealIntoSlot
} from '../js/planner.js';
import { recordRecent } from '../js/tracker.js';
import { toDateStr, today } from '../js/datetime.js';
import { escapeHtml, escapeAttr } from '../js/utils.js';
import { on } from '../js/core/bus.js';

describe('Phase 2 Group 2: Weight Log Canonical Operations', () => {
  beforeEach(() => {
    globalThis.document = {
      querySelector: () => null,
      querySelectorAll: () => [],
      createElement: () => ({ appendChild: () => {}, querySelector: () => null })
    };
    globalThis.localStorage = {
      getItem: () => null,
      setItem: () => {},
      removeItem: () => {}
    };
    STATE.weightLog = [];
    STATE.goalWeight = null;
  });

  afterEach(() => {
    delete globalThis.document;
    delete globalThis.localStorage;
  });

  it('records a new weight entry for today', () => {
    const success = recordWeight(75.5);
    expect(success).toBe(true);
    expect(STATE.weightLog).toHaveLength(1);
    expect(STATE.weightLog[0].date).toBe(today());
    expect(STATE.weightLog[0].weight).toBe(75.5);
  });

  it('updates an existing date weight entry without duplicating', () => {
    recordWeight(75.5, { date: '2026-05-10' });
    recordWeight(76.2, { date: '2026-05-10' });
    expect(STATE.weightLog).toHaveLength(1);
    expect(STATE.weightLog[0].date).toBe('2026-05-10');
    expect(STATE.weightLog[0].weight).toBe(76.2);
  });

  it('sorts entries chronologically', () => {
    recordWeight(77, { date: '2026-05-12' });
    recordWeight(75, { date: '2026-05-10' });
    recordWeight(76, { date: '2026-05-11' });
    expect(STATE.weightLog.map((w) => w.date)).toEqual([
      '2026-05-10',
      '2026-05-11',
      '2026-05-12'
    ]);
  });

  it('enforces maximum 365 entries retention', () => {
    const initial = [];
    for (let i = 0; i < 370; i++) {
      const d = new Date(2025, 0, 1);
      d.setDate(d.getDate() + i);
      initial.push({ date: toDateStr(d), weight: 70 + (i % 5) });
    }
    STATE.weightLog = initial;
    recordWeight(80, { date: '2026-06-01' });
    expect(STATE.weightLog.length).toBe(365);
    expect(STATE.weightLog[STATE.weightLog.length - 1].date).toBe('2026-06-01');
  });

  it('updates goalWeight when provided', () => {
    recordWeight(82.5, { goalWeight: 75.0 });
    expect(STATE.goalWeight).toBe(75.0);
  });

  it('rejects invalid weight values', () => {
    expect(recordWeight(10)).toBe(false); // below 25
    expect(recordWeight(400)).toBe(false); // above 350
    expect(recordWeight(NaN)).toBe(false);
    expect(recordWeight('invalid')).toBe(false);
    expect(STATE.weightLog).toHaveLength(0);
  });

  it('emits weight:logged event on success', () => {
    let emitted = null;
    on('weight:logged', (data) => {
      emitted = data;
    });
    recordWeight(74.0, { date: '2026-07-01' });
    expect(emitted).toEqual({ date: '2026-07-01', weight: 74.0 });
  });
});

describe('Phase 2 Group 2: Planner Canonical Operations', () => {
  beforeEach(() => {
    globalThis.document = {
      querySelector: () => null,
      querySelectorAll: () => [],
      createElement: () => ({ appendChild: () => {}, querySelector: () => null })
    };
    globalThis.localStorage = {
      getItem: () => null,
      setItem: () => {},
      removeItem: () => {}
    };
    STATE.planner = { breakfast: [], lunch: [], dinner: [], snacks: [] };
  });

  afterEach(() => {
    delete globalThis.document;
    delete globalThis.localStorage;
  });

  it('addPlannerItem appends food with uid and servings to slot', () => {
    addPlannerItem('breakfast', { name: 'Oatmeal', calories: 150, protein: 5, carbs: 27, fat: 3 });
    expect(STATE.planner.breakfast).toHaveLength(1);
    expect(STATE.planner.breakfast[0].name).toBe('Oatmeal');
    expect(STATE.planner.breakfast[0].uid).toBeDefined();
    expect(STATE.planner.breakfast[0].servings).toBe(100);
  });

  it('removePlannerItem removes item by uid', () => {
    addPlannerItem('lunch', { name: 'Chicken', calories: 200, uid: 'c1' });
    addPlannerItem('lunch', { name: 'Rice', calories: 150, uid: 'r1' });
    expect(STATE.planner.lunch).toHaveLength(2);
    removePlannerItem('lunch', 'c1');
    expect(STATE.planner.lunch).toHaveLength(1);
    expect(STATE.planner.lunch[0].uid).toBe('r1');
  });

  it('updatePlannerItemGrams clamps servings between 1 and 5000', () => {
    addPlannerItem('dinner', { name: 'Steak', calories: 250, uid: 's1', servings: 100 });
    updatePlannerItemGrams('dinner', 's1', 250);
    expect(STATE.planner.dinner[0].servings).toBe(250);

    updatePlannerItemGrams('dinner', 's1', 10000);
    expect(STATE.planner.dinner[0].servings).toBe(5000);

    updatePlannerItemGrams('dinner', 's1', -50);
    expect(STATE.planner.dinner[0].servings).toBe(1);
  });

  it('replacePlannerSlot updates single slot with new items', () => {
    addPlannerItem('snacks', { name: 'Apple', uid: 'a1' });
    replacePlannerSlot('snacks', [
      { name: 'Almonds', calories: 160 },
      { name: 'Greek Yogurt', calories: 100 }
    ]);
    expect(STATE.planner.snacks).toHaveLength(2);
    expect(STATE.planner.snacks[0].name).toBe('Almonds');
    expect(STATE.planner.snacks[0].uid).toBeDefined();
    expect(STATE.planner.snacks[1].name).toBe('Greek Yogurt');
  });

  it('replacePlannerSlots updates multiple slots in batch', () => {
    replacePlannerSlots({
      breakfast: [{ name: 'Eggs', calories: 140 }],
      lunch: [{ name: 'Tuna Salad', calories: 220 }]
    });
    expect(STATE.planner.breakfast).toHaveLength(1);
    expect(STATE.planner.breakfast[0].name).toBe('Eggs');
    expect(STATE.planner.lunch).toHaveLength(1);
    expect(STATE.planner.lunch[0].name).toBe('Tuna Salad');
  });

  it('clearPlannerSlot empties specified slot', () => {
    addPlannerItem('breakfast', { name: 'Toast' });
    expect(STATE.planner.breakfast).toHaveLength(1);
    clearPlannerSlot('breakfast');
    expect(STATE.planner.breakfast).toHaveLength(0);
  });

  it('loadMealIntoSlot appends items and assigns uids', () => {
    loadMealIntoSlot('lunch', [
      { name: 'Salmon', calories: 200, servings: 150 },
      { name: 'Broccoli', calories: 50, servings: 100 }
    ], 'Healthy Lunch');
    expect(STATE.planner.lunch).toHaveLength(2);
    expect(STATE.planner.lunch[0].name).toBe('Salmon');
    expect(STATE.planner.lunch[0].uid).toBeDefined();
    expect(STATE.planner.lunch[1].name).toBe('Broccoli');
  });
});

describe('Phase 2 Group 2: Recents Canonical Operations', () => {
  beforeEach(() => {
    STATE.recents = [];
  });

  it('orders newest item first', () => {
    recordRecent({ id: 'food_1', name: 'Food 1' });
    recordRecent({ id: 'food_2', name: 'Food 2' });
    expect(STATE.recents[0].id).toBe('food_2');
    expect(STATE.recents[1].id).toBe('food_1');
  });

  it('deduplicates items by moving existing id to the front', () => {
    recordRecent({ id: 'food_1', name: 'Food 1' });
    recordRecent({ id: 'food_2', name: 'Food 2' });
    recordRecent({ id: 'food_1', name: 'Food 1' });
    expect(STATE.recents).toHaveLength(2);
    expect(STATE.recents[0].id).toBe('food_1');
    expect(STATE.recents[1].id).toBe('food_2');
  });

  it('enforces maximum 30 retention limit', () => {
    for (let i = 0; i < 35; i++) {
      recordRecent({ id: `food_${i}` });
    }
    expect(STATE.recents).toHaveLength(30);
    expect(STATE.recents[0].id).toBe('food_34');
    expect(STATE.recents[29].id).toBe('food_5');
  });

  it('ignores ephemeral USDA foods without local id persistence', () => {
    recordRecent({ id: 'usda_123', source: 'usda' });
    expect(STATE.recents).toHaveLength(0);
  });

  it('ignores invalid food items missing id', () => {
    recordRecent(null);
    recordRecent({});
    expect(STATE.recents).toHaveLength(0);
  });
});

describe('Phase 2 Group 2: Utilities Canonicalization', () => {
  it('makeId returns valid non-empty string and is identical from utils and state', () => {
    const id = makeId();
    expect(typeof id).toBe('string');
    expect(id.length).toBeGreaterThan(5);
  });

  it('escapeAttr escapes special characters equivalent to escapeHtml', () => {
    const raw = '<div class="test" data-val=\'foo&bar\'>';
    expect(escapeAttr(raw)).toBe('&lt;div class=&quot;test&quot; data-val=&#39;foo&amp;bar&#39;&gt;');
    expect(escapeAttr(raw)).toBe(escapeHtml(raw));
  });
});
