import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { on } from '../js/core/bus.js';
import {
  navigateTo,
  toggleSidebar,
  getCurrentRoute,
  openMobileDrawer,
  closeMobileDrawer
} from '../js/nav.js';

describe('ProtoMacro Navigation & Application Shell', () => {
  let mockStorage = {};
  let mockElements = {};

  beforeEach(() => {
    mockStorage = {};
    globalThis.localStorage = {
      getItem: (key) => mockStorage[key] || null,
      setItem: (key, val) => { mockStorage[key] = String(val); },
      removeItem: (key) => { delete mockStorage[key]; }
    };

    // Build DOM mock hierarchy for app-shell, sidebar, topbar and views
    const createMockElement = (id, classList = []) => {
      const classes = new Set(classList);
      const attrs = {};
      return {
        id,
        classList: {
          contains: (c) => classes.has(c),
          add: (c) => classes.add(c),
          remove: (c) => classes.delete(c),
          toggle: (c, force) => {
            if (force === undefined) {
              if (classes.has(c)) classes.delete(c);
              else classes.add(c);
            } else if (force) classes.add(c);
            else classes.delete(c);
          }
        },
        setAttribute: (k, v) => { attrs[k] = String(v); },
        getAttribute: (k) => attrs[k] || null,
        removeAttribute: (k) => { delete attrs[k]; },
        querySelectorAll: () => [],
        dataset: {},
        style: {}
      };
    };

    const views = [
      'today', 'bmi', 'search', 'tracker', 'planner',
      'workouts', 'recovery', 'reset', 'calculators', 'progress', 'settings'
    ];

    mockElements = {
      appShell: createMockElement('appShell'),
      appSidebar: createMockElement('appSidebar'),
      sidebarToggle: createMockElement('sidebarToggle'),
      hamburger: createMockElement('hamburger'),
      pageTitle: { textContent: 'Today' },
      appMain: { scrollTop: 0 }
    };

    views.forEach((v) => {
      mockElements[v] = createMockElement(v, ['app-view', v === 'today' ? 'active' : '']);
    });

    globalThis.document = {
      getElementById: (id) => mockElements[id] || null,
      querySelector: (sel) => {
        if (sel.startsWith('#')) return mockElements[sel.slice(1)] || null;
        if (sel === '.app-shell') return mockElements.appShell;
        if (sel === 'meta[name="theme-color"]') return { content: '' };
        return null;
      },
      querySelectorAll: (sel) => {
        if (sel === '.app-view') return views.map((v) => mockElements[v]);
        if (sel === '.sidebar-link') return [];
        return [];
      },
      body: { style: {} },
      documentElement: { dataset: { theme: 'dark' }, classList: { add: () => {}, remove: () => {} } },
      title: 'ProtoMacro'
    };

    globalThis.window = {
      location: { hash: '#today' },
      scrollTo: () => {},
      dispatchEvent: () => {},
      innerWidth: 1280,
      matchMedia: () => ({ matches: false })
    };
  });

  afterEach(() => {
    delete globalThis.document;
    delete globalThis.window;
    delete globalThis.localStorage;
  });

  it('navigates to tracker view and updates active state', () => {
    navigateTo('tracker');
    expect(getCurrentRoute()).toBe('tracker');
    expect(mockElements.tracker.classList.contains('active')).toBe(true);
    expect(mockElements.today.classList.contains('active')).toBe(false);
  });

  it('navigates to workouts and progress views', () => {
    navigateTo('workouts');
    expect(getCurrentRoute()).toBe('workouts');
    expect(mockElements.workouts.classList.contains('active')).toBe(true);

    navigateTo('progress');
    expect(getCurrentRoute()).toBe('progress');
    expect(mockElements.progress.classList.contains('active')).toBe(true);
    expect(mockElements.workouts.classList.contains('active')).toBe(false);
  });

  it('routes recipes to host search view and emits search:tab event', () => {
    let receivedTab = null;
    on('search:tab', ({ tab }) => { receivedTab = tab; });

    navigateTo('recipes');
    expect(getCurrentRoute()).toBe('recipes');
    expect(mockElements.search.classList.contains('active')).toBe(true);
    expect(receivedTab).toBe('recipes');
  });

  it('routes saved-meals to host search view and emits search:tab event', () => {
    let receivedTab = null;
    on('search:tab', ({ tab }) => { receivedTab = tab; });

    navigateTo('saved-meals');
    expect(getCurrentRoute()).toBe('saved-meals');
    expect(mockElements.search.classList.contains('active')).toBe(true);
    expect(receivedTab).toBe('meals');
  });

  it('routes grocery to host planner view and emits grocery:open event', () => {
    let groceryOpened = false;
    on('grocery:open', () => { groceryOpened = true; });

    navigateTo('grocery');
    expect(getCurrentRoute()).toBe('grocery');
    expect(mockElements.planner.classList.contains('active')).toBe(true);
    expect(groceryOpened).toBe(true);
  });

  it('toggles sidebar and persists state in localStorage', () => {
    toggleSidebar(true);
    expect(mockElements.appShell.classList.contains('sidebar-collapsed')).toBe(true);
    expect(mockStorage['protomacro_sidebar_collapsed']).toBe('true');

    toggleSidebar(false);
    expect(mockElements.appShell.classList.contains('sidebar-collapsed')).toBe(false);
    expect(mockStorage['protomacro_sidebar_collapsed']).toBe('false');
  });

  it('controls mobile drawer open and close states', () => {
    openMobileDrawer();
    expect(mockElements.appShell.classList.contains('drawer-open')).toBe(true);
    expect(mockElements.hamburger.classList.contains('active')).toBe(true);

    closeMobileDrawer();
    expect(mockElements.appShell.classList.contains('drawer-open')).toBe(false);
    expect(mockElements.hamburger.classList.contains('active')).toBe(false);
  });
});
