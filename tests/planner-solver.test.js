import { describe, it, expect } from 'vitest';
import {
  MEAL_ORDER,
  MEAL_META,
  PREFS,
  bucketFoods,
  pick,
  portionForCalories,
  foodAtGrams,
  buildMeal,
  generatePlan,
  regenerateMeal,
  swapFood
} from '../js/core/planner-solver.js';

describe('Planner Solver — Portion & Gram Calculations', () => {
  const chicken = { name: 'Chicken Breast', calories: 165, protein: 31, carbs: 0, fat: 3.6 };

  it('portionForCalories calculates grams clamped to [30, 500]', () => {
    // 330 kcal target with 165 kcal/100g food -> 200g
    expect(portionForCalories(chicken, 330)).toBe(200);

    // extreme low target clamps to 30g minimum
    expect(portionForCalories(chicken, 10)).toBe(30);

    // extreme high target clamps to 500g maximum
    expect(portionForCalories(chicken, 2000)).toBe(500);

    // null or 0 calorie food falls back to default 100g
    expect(portionForCalories(null, 300)).toBe(100);
    expect(portionForCalories({ calories: 0 }, 300)).toBe(100);
  });

  it('foodAtGrams computes macros scaled to gram portion', () => {
    const item = foodAtGrams(chicken, 200);
    expect(item.name).toBe('Chicken Breast');
    expect(item.grams).toBe(200);
    expect(item.amount).toBe('200g');
    expect(item.calories).toBe(330);
    expect(item.protein).toBe(62);
    expect(item.carbs).toBe(0);
    expect(item.fat).toBe(7.2);
  });
});

describe('Planner Solver — Food Bucketing & Preference Filters', () => {
  const sampleDb = [
    { name: 'Chicken Breast', calories: 165, protein: 31, carbs: 0, fat: 3.6, tags: [] },
    { name: 'Beef Curry', calories: 250, protein: 24, carbs: 5, fat: 15, tags: ['bangladeshi'] },
    { name: 'White Rice', calories: 130, protein: 2.7, carbs: 28, fat: 0.3, tags: ['bangladeshi'] },
    { name: 'Olive Oil', calories: 884, protein: 0, carbs: 0, fat: 100, tags: [] },
    { name: 'Fresh Cucumber', calories: 15, protein: 0.7, carbs: 3.6, fat: 0.1, tags: ['fresh'] },
    { name: 'Greek Yogurt', calories: 100, protein: 10, carbs: 4, fat: 5, tags: ['fresh'] },
    { name: 'Eggs Boiled', calories: 140, protein: 12, carbs: 1, fat: 10, tags: ['boiled'] },
    { name: 'Lentil Dal', calories: 116, protein: 9, carbs: 20, fat: 0.4, tags: ['bangladeshi'] }
  ];

  it('classifies foods into protein, carb, fat, veg, snack buckets', () => {
    const buckets = bucketFoods(sampleDb, []);
    expect(buckets.protein.some((f) => f.name === 'Chicken Breast')).toBe(true);
    expect(buckets.carb.some((f) => f.name === 'White Rice')).toBe(true);
    expect(buckets.fat.some((f) => f.name === 'Olive Oil')).toBe(true);
    expect(buckets.veg.some((f) => f.name === 'Fresh Cucumber')).toBe(true);
  });

  it('filters out non-vegetarian foods when vegetarian preference is active', () => {
    const buckets = bucketFoods(sampleDb, ['vegetarian']);
    const allVegFoods = Object.values(buckets).flat().map((f) => f.name);
    expect(allVegFoods).not.toContain('Chicken Breast');
    expect(allVegFoods).not.toContain('Beef Curry');
    expect(allVegFoods).toContain('White Rice');
    expect(allVegFoods).toContain('Fresh Cucumber');
  });

  it('filters for easy preparations when easy preference is active', () => {
    const buckets = bucketFoods(sampleDb, ['easy']);
    const allFoods = Object.values(buckets).flat().map((f) => f.name);
    expect(allFoods).toContain('Eggs Boiled');
    expect(allFoods).toContain('Fresh Cucumber');
    expect(allFoods).not.toContain('Beef Curry');
  });

  it('filters for budget staples when budget preference is active', () => {
    const buckets = bucketFoods(sampleDb, ['budget']);
    const allFoods = Object.values(buckets).flat().map((f) => f.name);
    expect(allFoods).toContain('White Rice');
    expect(allFoods).toContain('Chicken Breast');
    expect(allFoods).toContain('Lentil Dal');
  });

  it('sorts buckets by protein density when highProtein preference is active', () => {
    const buckets = bucketFoods(sampleDb, ['highProtein']);
    if (buckets.protein.length > 1) {
      for (let i = 0; i < buckets.protein.length - 1; i++) {
        expect(buckets.protein[i]._score).toBeGreaterThanOrEqual(buckets.protein[i + 1]._score);
      }
    }
  });
});

describe('Planner Solver — Food Selection & Meal Building', () => {
  const foods = [
    { name: 'Chicken', calories: 150, protein: 30, carbs: 0, fat: 3 },
    { name: 'Tuna', calories: 120, protein: 26, carbs: 0, fat: 1 },
    { name: 'Eggs', calories: 140, protein: 12, carbs: 1, fat: 10 }
  ];

  it('pick selects items and adds them to usedNames', () => {
    const used = new Set();
    const rng = () => 0; // deterministic pick: index 0
    const chosen = pick(foods, used, rng);
    expect(chosen.name).toBe('Chicken');
    expect(used.has('Chicken')).toBe(true);
  });

  it('pick avoids items already in usedNames if alternates are available', () => {
    const used = new Set(['Chicken']);
    let callCount = 0;
    // first return chicken (idx 0), next return tuna (idx 1)
    const rng = () => {
      callCount++;
      return callCount === 1 ? 0 : 0.5;
    };
    const chosen = pick(foods, used, rng);
    expect(chosen.name).toBe('Tuna');
  });

  it('pick returns null for empty array', () => {
    expect(pick([], new Set())).toBeNull();
  });

  it('buildMeal computes meal with mode macro shares', () => {
    const buckets = {
      protein: [{ name: 'Chicken', calories: 150, protein: 30, carbs: 0, fat: 3 }],
      carb: [{ name: 'Rice', calories: 130, protein: 3, carbs: 28, fat: 0 }],
      fat: [],
      veg: [{ name: 'Broccoli', calories: 35, protein: 2, carbs: 7, fat: 0 }],
      snack: []
    };
    const meal = buildMeal('lunch', 600, buckets, new Set(), 'cut');
    expect(meal.name).toContain('Chicken');
    expect(meal.name).toContain('rice');
    expect(meal.foods.length).toBeGreaterThan(0);
    expect(meal.totals.calories).toBeGreaterThan(0);
    expect(meal.totals.protein).toBeGreaterThan(0);
  });
});

describe('Planner Solver — generatePlan', () => {
  it('generates a 4-meal plan with daily totals and tips', () => {
    const plan = generatePlan({
      goals: { calories: 2200 },
      mode: 'bulk'
    });

    expect(plan.meals).toBeDefined();
    for (const key of MEAL_ORDER) {
      expect(plan.meals[key]).toBeDefined();
      expect(plan.meals[key].foods.length).toBeGreaterThan(0);
      expect(plan.meals[key].totals.calories).toBeGreaterThan(0);
    }
    expect(plan.daily_totals.calories).toBeGreaterThan(1500);
    expect(plan.daily_totals.protein).toBeGreaterThan(50);
    expect(plan.tips).toBeDefined();
    expect(plan.tips.length).toBeGreaterThan(0);
    expect(plan._source).toBe('local');
  });

  it('is deterministic when custom rng is supplied', () => {
    let seed1 = 0.1234;
    const rng1 = () => {
      seed1 = (seed1 * 9301 + 49297) % 233280;
      return seed1 / 233280;
    };
    let seed2 = 0.1234;
    const rng2 = () => {
      seed2 = (seed2 * 9301 + 49297) % 233280;
      return seed2 / 233280;
    };

    const plan1 = generatePlan({ goals: { calories: 2000 }, rng: rng1 });
    const plan2 = generatePlan({ goals: { calories: 2000 }, rng: rng2 });

    expect(plan1.daily_totals).toEqual(plan2.daily_totals);
    expect(plan1.meals.breakfast.foods).toEqual(plan2.meals.breakfast.foods);
  });

  it('relaxes filters if restrictive preferences empty a required bucket', () => {
    const miniDb = [
      { name: 'Chicken', calories: 150, protein: 30, carbs: 0, fat: 3 },
      { name: 'Rice', calories: 130, protein: 3, carbs: 28, fat: 0 }
    ];
    // vegetarian filter on this DB would leave protein bucket empty; solver falls back gracefully
    const plan = generatePlan({
      goals: { calories: 1800 },
      prefs: ['vegetarian'],
      db: miniDb
    });
    expect(plan.meals.breakfast.foods.length).toBeGreaterThan(0);
  });
});

describe('Planner Solver — Meal Regeneration & Food Swap', () => {
  it('regenerateMeal updates only the specified meal slot', () => {
    const plan = generatePlan({ goals: { calories: 2000 } });
    const originalDinnerName = plan.meals.dinner.name;
    const originalLunchFoods = [...plan.meals.lunch.foods];

    // Force regeneration with a different RNG
    let seed = 0.7777;
    const rng = () => {
      seed = (seed * 9301 + 49297) % 233280;
      return seed / 233280;
    };

    const updated = regenerateMeal(plan, 'dinner', {
      goals: { calories: 2000 },
      buckets: plan.buckets,
      rng
    });

    expect(updated.meals.lunch.foods).toEqual(originalLunchFoods);
    expect(updated.daily_totals).toBeDefined();
  });

  it('swapFood swaps one food for an alternative with similar calories', () => {
    const plan = generatePlan({ goals: { calories: 2000 } });
    const targetFood = plan.meals.breakfast.foods[0];
    expect(targetFood).toBeDefined();

    const res = swapFood(plan, 'breakfast', targetFood.name, {
      buckets: plan.buckets
    });

    expect(res.success).toBe(true);
    expect(res.plan.meals.breakfast.foods[0].name).not.toBe(targetFood.name);
  });

  it('swapFood returns false if meal or food is not found', () => {
    const plan = generatePlan({ goals: { calories: 2000 } });
    const res1 = swapFood(plan, 'non_existent_meal', 'Food');
    expect(res1.success).toBe(false);

    const res2 = swapFood(plan, 'breakfast', 'NonExistentFood12345');
    expect(res2.success).toBe(false);
  });
});
