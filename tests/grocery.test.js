import { describe, it, expect } from 'vitest';
import { aggregateGroceryItems, formatGrams } from '../js/grocery.js';

describe('formatGrams', () => {
  it('formats amounts under 1000g as integers with g', () => {
    expect(formatGrams(250)).toBe('250 g');
    expect(formatGrams(50.4)).toBe('50 g');
    expect(formatGrams(0)).toBe('0 g');
  });

  it('formats amounts >= 1000g as kg with 1 decimal place', () => {
    expect(formatGrams(1000)).toBe('1.0 kg');
    expect(formatGrams(1500)).toBe('1.5 kg');
    expect(formatGrams(2450)).toBe('2.5 kg');
  });
});

describe('aggregateGroceryItems', () => {
  it('returns empty list for empty or null planner', () => {
    expect(aggregateGroceryItems({})).toEqual([]);
    expect(aggregateGroceryItems(null)).toEqual([]);
    expect(aggregateGroceryItems({ breakfast: [], lunch: [], dinner: [], snacks: [] })).toEqual([]);
  });

  it('aggregates foods across multiple meal slots', () => {
    const planner = {
      breakfast: [
        { name: 'Oatmeal', servings: 80 },
        { name: 'Banana', servings: 120 }
      ],
      lunch: [
        { name: 'Chicken Breast', servings: 200 }
      ],
      dinner: [
        { name: 'Rice', servings: 150 }
      ],
      snacks: []
    };
    const items = aggregateGroceryItems(planner);
    expect(items).toHaveLength(4);
    // Highest grams first
    expect(items[0].name).toBe('Chicken Breast');
    expect(items[0].grams).toBe(200);
    expect(items[1].name).toBe('Rice');
    expect(items[1].grams).toBe(150);
  });

  it('combines duplicate ingredients across slots, summing grams and counting occurrences', () => {
    const planner = {
      breakfast: [
        { name: 'Eggs', servings: 100 }
      ],
      lunch: [
        { name: 'Eggs', servings: 150 },
        { name: 'Rice', servings: 200 }
      ],
      dinner: [
        { name: 'Rice', servings: 200 }
      ],
      snacks: []
    };
    const items = aggregateGroceryItems(planner);
    expect(items).toHaveLength(2);

    const rice = items.find((i) => i.name === 'Rice');
    expect(rice.grams).toBe(400);
    expect(rice.count).toBe(2);

    const eggs = items.find((i) => i.name === 'Eggs');
    expect(eggs.grams).toBe(250);
    expect(eggs.count).toBe(2);
  });

  it('strips trailing gram suffixes from food names to avoid split aggregation', () => {
    const planner = {
      breakfast: [
        { name: 'Rolled Oats (50g)', servings: 50 }
      ],
      lunch: [
        { name: 'Rolled Oats', servings: 100 }
      ]
    };
    const items = aggregateGroceryItems(planner);
    expect(items).toHaveLength(1);
    expect(items[0].name).toBe('Rolled Oats');
    expect(items[0].grams).toBe(150);
    expect(items[0].count).toBe(2);
  });

  it('handles default servings (100g) when servings is undefined or null', () => {
    const planner = {
      breakfast: [
        { name: 'Greek Yogurt' } // servings omitted
      ]
    };
    const items = aggregateGroceryItems(planner);
    expect(items).toHaveLength(1);
    expect(items[0].name).toBe('Greek Yogurt');
    expect(items[0].grams).toBe(100);
  });

  it('safely skips malformed items without name or invalid entries', () => {
    const planner = {
      breakfast: [
        null,
        undefined,
        { calories: 200 }, // no name
        { name: 'Apple', servings: 150 }
      ]
    };
    const items = aggregateGroceryItems(planner);
    expect(items).toHaveLength(1);
    expect(items[0].name).toBe('Apple');
    expect(items[0].grams).toBe(150);
  });
});
