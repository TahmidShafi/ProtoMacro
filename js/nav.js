/* ============================================================
   ProtoMacro — nav.js
   Application Shell Navigation Controller:
   - Persistent, collapsible sidebar navigation
   - Compact topbar with breadcrumb & dynamic page title
   - Mobile slide-in navigation drawer with backdrop & keyboard traps
   - Hash-based view switching (Zero unnecessary page scrolling)
   - Chart resize & view-refresh triggering
   - Deep-linking & browser history (Back / Forward)
   ============================================================ */
import { $, $$, rafThrottle } from './utils.js';
import { emit, on } from './core/bus.js';

const VIEW_TITLES = {
  today: 'Today',
  progress: 'Progress & Analytics',
  tracker: 'Food Tracker',
  search: 'Food Search',
  planner: 'Meal Planner',
  recipes: 'Recipes',
  'saved-meals': 'Saved Meals',
  grocery: 'Grocery List',
  workouts: 'Workouts',
  recovery: 'Recovery',
  calculators: 'Lifter Calculators',
  bmi: 'Goals & TDEE',
  reset: 'Habit Reset',
  settings: 'Settings'
};

const VIEW_DOC_TITLES = {
  today: 'Today — ProtoMacro',
  progress: 'Progress & Weekly Analytics — ProtoMacro',
  tracker: 'Food Tracker — ProtoMacro',
  search: 'Food Database & Search — ProtoMacro',
  planner: 'Meal Planner — ProtoMacro',
  recipes: 'Custom Recipes — ProtoMacro',
  'saved-meals': 'Saved Meals — ProtoMacro',
  grocery: 'Grocery List — ProtoMacro',
  workouts: 'Training Log & PRs — ProtoMacro',
  recovery: 'Recovery & Sleep — ProtoMacro',
  calculators: 'Serious Lifter Calculators — ProtoMacro',
  bmi: 'BMI & TDEE Goals — ProtoMacro',
  reset: 'Habit Reset — ProtoMacro',
  settings: 'Settings & Data — ProtoMacro'
};

// Aliases that map a virtual route or feature to a host view
const ROUTE_HOST_VIEWS = {
  recipes: 'search',
  'saved-meals': 'search',
  grocery: 'planner'
};

let currentRoute = 'today';
let sidebarCollapsed = false;
let mobileDrawerOpen = false;

export function getCurrentRoute() {
  return currentRoute;
}

export function navigateTo(targetRoute, { updateHash = true } = {}) {
  const cleanRoute = (targetRoute || 'today').replace(/^#/, '').trim().toLowerCase();
  const hostViewId = ROUTE_HOST_VIEWS[cleanRoute] || cleanRoute;

  const targetViewEl = $('#' + hostViewId);
  if (!targetViewEl) {
    if (cleanRoute !== 'today') return navigateTo('today', { updateHash });
    return;
  }

  currentRoute = cleanRoute;

  // 1. Update hash if requested
  if (updateHash && typeof window !== 'undefined' && window.location?.hash !== '#' + cleanRoute) {
    if (window.history?.pushState) {
      window.history.pushState(null, '', '#' + cleanRoute);
    } else if (window.location) {
      window.location.hash = cleanRoute;
    }
  }

  // 2. Hide all views and show active view
  const views = $$('.app-view');
  views.forEach((v) => {
    const isActive = v.id === hostViewId;
    v.classList.toggle('active', isActive);
    v.setAttribute('aria-hidden', String(!isActive));
  });

  // Ensure reveal targets in active view are shown
  targetViewEl.querySelectorAll('[data-reveal]').forEach((el) => {
    el.classList.add('in-view');
  });

  // 3. Update active sidebar links
  const links = $$('.sidebar-link');
  links.forEach((a) => {
    const navKey = a.dataset.nav || a.getAttribute('href')?.replace(/^#/, '');
    const isActive = navKey === cleanRoute;
    a.classList.toggle('active', isActive);
    if (isActive) {
      a.setAttribute('aria-current', 'page');
    } else {
      a.removeAttribute('aria-current');
    }
  });

  // 4. Update dynamic titles
  const title = VIEW_TITLES[cleanRoute] || VIEW_TITLES[hostViewId] || 'ProtoMacro';
  const pageTitleEl = $('#pageTitle');
  if (pageTitleEl) pageTitleEl.textContent = title;
  document.title = VIEW_DOC_TITLES[cleanRoute] || `${title} — ProtoMacro`;

  // 5. Scroll reset on view switch
  const appMain = $('#appMain');
  if (appMain) appMain.scrollTop = 0;
  window.scrollTo(0, 0);

  // 6. Close mobile drawer if open
  closeMobileDrawer();

  // 7. Route-specific hooks
  if (cleanRoute === 'recipes') {
    emit('search:tab', { tab: 'recipes' });
  } else if (cleanRoute === 'saved-meals') {
    emit('search:tab', { tab: 'meals' });
  } else if (cleanRoute === 'grocery') {
    emit('grocery:open');
  }

  // 8. View change notification & chart resize
  emit('nav:view-changed', { route: cleanRoute, view: hostViewId });
  window.dispatchEvent(new Event('resize'));
}

export function toggleSidebar(forceState) {
  const appShell = $('#appShell');
  const toggleBtn = $('#sidebarToggle');
  if (!appShell) return;

  sidebarCollapsed = typeof forceState === 'boolean' ? forceState : !sidebarCollapsed;
  appShell.classList.toggle('sidebar-collapsed', sidebarCollapsed);

  if (toggleBtn) {
    toggleBtn.setAttribute('aria-expanded', String(!sidebarCollapsed));
    toggleBtn.setAttribute('title', sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar');
  }

  try {
    localStorage.setItem('protomacro_sidebar_collapsed', String(sidebarCollapsed));
  } catch {}

  // Trigger resize so layout & charts adapt to new container width
  setTimeout(() => window.dispatchEvent(new Event('resize')), 150);
}

export function openMobileDrawer() {
  const appShell = $('#appShell');
  const hamburger = $('#hamburger');
  const sidebar = $('#appSidebar');
  if (!appShell) return;

  mobileDrawerOpen = true;
  appShell.classList.add('drawer-open');
  if (hamburger) {
    hamburger.classList.add('active');
    hamburger.setAttribute('aria-expanded', 'true');
  }
  if (sidebar) {
    sidebar.setAttribute('aria-hidden', 'false');
  }
  document.body.style.overflow = 'hidden';
}

export function closeMobileDrawer() {
  const appShell = $('#appShell');
  const hamburger = $('#hamburger');
  const sidebar = $('#appSidebar');
  if (!appShell || !mobileDrawerOpen) return;

  mobileDrawerOpen = false;
  appShell.classList.remove('drawer-open');
  if (hamburger) {
    hamburger.classList.remove('active');
    hamburger.setAttribute('aria-expanded', 'false');
  }
  if (sidebar && window.innerWidth < 992) {
    sidebar.setAttribute('aria-hidden', 'true');
  }
  document.body.style.overflow = '';
}

export function initNav() {
  const appShell = $('#appShell');
  const sidebarToggle = $('#sidebarToggle');
  const hamburger = $('#hamburger');
  const backdrop = $('#sidebarBackdrop');
  const topbarThemeToggle = $('#topbarThemeToggle');
  const themeQuickBtn = $('#themeQuickBtn');

  // Restore collapsed sidebar preference on desktop
  try {
    const saved = localStorage.getItem('protomacro_sidebar_collapsed');
    if (saved === 'true' && window.innerWidth >= 992) {
      toggleSidebar(true);
    }
  } catch {}

  // Sidebar collapse toggle click
  sidebarToggle?.addEventListener('click', () => toggleSidebar());

  // Mobile drawer toggle click
  hamburger?.addEventListener('click', () => {
    if (mobileDrawerOpen) closeMobileDrawer();
    else openMobileDrawer();
  });

  // Mobile backdrop click
  backdrop?.addEventListener('click', closeMobileDrawer);

  // Link click delegation
  document.addEventListener('click', (e) => {
    const link = e.target.closest('a[href^="#"]');
    if (!link) return;

    const href = link.getAttribute('href');
    if (href && href.length > 1) {
      e.preventDefault();
      const route = href.slice(1);
      navigateTo(route);
    }
  });

  // Theme toggle buttons
  const onThemeToggle = () => emit('theme:toggle');
  topbarThemeToggle?.addEventListener('click', onThemeToggle);
  themeQuickBtn?.addEventListener('click', onThemeToggle);

  // Keyboard navigation: Escape key closes mobile drawer
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && mobileDrawerOpen) {
      closeMobileDrawer();
      hamburger?.focus();
    }
  });

  // Window resize handler: reset mobile drawer on wide screen
  window.addEventListener('resize', rafThrottle(() => {
    if (window.innerWidth >= 992 && mobileDrawerOpen) {
      closeMobileDrawer();
    }
  }), { passive: true });

  // Popstate / hashchange listener for browser back/forward and deep-linking
  window.addEventListener('popstate', () => {
    const hash = window.location.hash.slice(1);
    if (hash && hash !== currentRoute) {
      navigateTo(hash, { updateHash: false });
    }
  });

  window.addEventListener('hashchange', () => {
    const hash = window.location.hash.slice(1);
    if (hash && hash !== currentRoute) {
      navigateTo(hash, { updateHash: false });
    }
  });

  // Initial navigation based on URL hash or default to 'today'
  const initialHash = window.location.hash.slice(1);
  navigateTo(initialHash || 'today', { updateHash: Boolean(initialHash) });
}
