import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { STATE } from '../js/state.js';
import { on, emit } from '../js/core/bus.js';
import {
  loadSavedMealToPlanner,
  logSavedMeal,
  deleteSavedMeal,
  toggleFavoriteMeal,
  initSavedMeals
} from '../js/saved-meals.js';
import { initMigrationWizard } from '../js/migration-wizard.js';

describe('Phase 2 Group 1: Dependency Graph Boundaries', () => {
  const rootDir = path.resolve(__dirname, '..');

  it('planner.js has NO static or dynamic import of saved-meals.js', () => {
    const plannerSrc = fs.readFileSync(path.join(rootDir, 'js/planner.js'), 'utf8');
    expect(plannerSrc).not.toMatch(/from\s+['"][^'"]*saved-meals/);
    expect(plannerSrc).not.toMatch(/import\s*\(\s*['"][^'"]*saved-meals/);
  });

  it('saved-meals.js has NO static or dynamic import of planner.js', () => {
    const savedMealsSrc = fs.readFileSync(path.join(rootDir, 'js/saved-meals.js'), 'utf8');
    expect(savedMealsSrc).not.toMatch(/from\s+['"][^'"]*planner\.js/);
    expect(savedMealsSrc).not.toMatch(/import\s*\(\s*['"][^'"]*planner\.js/);
  });

  it('core/auth.js has NO static or dynamic import of migration-wizard.js', () => {
    const authSrc = fs.readFileSync(path.join(rootDir, 'js/core/auth.js'), 'utf8');
    expect(authSrc).not.toMatch(/from\s+['"][^'"]*migration-wizard/);
    expect(authSrc).not.toMatch(/import\s*\(\s*['"][^'"]*migration-wizard/);
  });

  it('no file in js/core/ imports feature UI files from js/ root', () => {
    const coreDir = path.join(rootDir, 'js/core');
    const files = fs.readdirSync(coreDir).filter((f) => f.endsWith('.js'));
    for (const f of files) {
      const src = fs.readFileSync(path.join(coreDir, f), 'utf8');
      expect(src).not.toMatch(/import\s+.*from\s+['"]\.\.\/(planner|saved-meals|migration-wizard|search|dashboard|workouts|habits|progress)/);
      expect(src).not.toMatch(/import\s*\(\s*['"]\.\.\/(planner|saved-meals|migration-wizard|search|dashboard|workouts|habits|progress)/);
    }
  });
});

describe('Phase 2 Group 1: Planner & Saved Meals Behavior', () => {
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
    STATE.log = [];
    STATE.savedMeals = [];
    STATE.favorites = { foods: [], recipes: [], meals: [] };
  });

  afterEach(() => {
    delete globalThis.document;
    delete globalThis.localStorage;
  });

  it('loadSavedMealToPlanner populates planner slot and emits planner:update', () => {
    let plannerUpdateEmitted = false;
    on('planner:update', () => {
      plannerUpdateEmitted = true;
    });

    const meal = {
      id: 'meal_1',
      name: 'High Protein Lunch',
      items: [
        { id: 'f1', name: 'Chicken Breast', calories: 165, protein: 31, carbs: 0, fat: 3.6, servings: 200 },
        { id: 'f2', name: 'White Rice', calories: 130, protein: 2.7, carbs: 28, fat: 0.3, servings: 150 }
      ]
    };

    loadSavedMealToPlanner(meal, 'lunch');

    expect(STATE.planner.lunch).toHaveLength(2);
    expect(STATE.planner.lunch[0].name).toBe('Chicken Breast');
    expect(STATE.planner.lunch[0].servings).toBe(200);
    expect(STATE.planner.lunch[0].uid).toBeDefined();
    expect(STATE.planner.lunch[1].name).toBe('White Rice');
    expect(STATE.planner.lunch[1].servings).toBe(150);
    expect(STATE.planner.lunch[1].uid).toBeDefined();
    expect(plannerUpdateEmitted).toBe(true);
  });

  it('logSavedMeal appends all items to STATE.log with distinct uids', () => {
    const meal = {
      id: 'meal_2',
      name: 'Power Breakfast',
      items: [
        { id: 'f3', name: 'Eggs', calories: 143, protein: 12.6, carbs: 0.7, fat: 9.5, servings: 100 },
        { id: 'f4', name: 'Oats', calories: 389, protein: 16.9, carbs: 66.3, fat: 6.9, servings: 80 }
      ]
    };

    logSavedMeal(meal);

    expect(STATE.log).toHaveLength(2);
    expect(STATE.log[0].name).toBe('Eggs');
    expect(STATE.log[0].uid).toBeDefined();
    expect(STATE.log[1].name).toBe('Oats');
    expect(STATE.log[1].uid).toBeDefined();
    expect(STATE.log[0].uid).not.toBe(STATE.log[1].uid);
  });

  it('deleteSavedMeal removes meal and cleans up favorite meals', () => {
    STATE.savedMeals = [
      { id: 'm1', name: 'Meal 1', items: [] },
      { id: 'm2', name: 'Meal 2', items: [] }
    ];
    STATE.favorites.meals = ['m1', 'm2'];

    deleteSavedMeal('m1');

    expect(STATE.savedMeals).toHaveLength(1);
    expect(STATE.savedMeals[0].id).toBe('m2');
    expect(STATE.favorites.meals).toEqual(['m2']);
  });

  it('toggleFavoriteMeal adds and removes meal id in favorites', () => {
    STATE.favorites.meals = [];
    toggleFavoriteMeal('m10');
    expect(STATE.favorites.meals).toContain('m10');
    toggleFavoriteMeal('m10');
    expect(STATE.favorites.meals).not.toContain('m10');
  });

  it('initSavedMeals binds planner:save-meal to saveMealFromSlot handler', () => {
    initSavedMeals();
    // Empty slot displays info toast and does not throw
    expect(() => {
      emit('planner:save-meal', { mealKey: 'breakfast' });
    }).not.toThrow();
  });
});

describe('Phase 2 Group 1: Migration Wizard Event Bus Wiring', () => {
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
  });

  afterEach(() => {
    delete globalThis.document;
    delete globalThis.localStorage;
  });

  it('initMigrationWizard listens to migration:open event', () => {
    initMigrationWizard();
    expect(() => {
      emit('migration:open');
    }).not.toThrow();
  });
});
