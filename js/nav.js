/* ============================================================
   ProtoMacro — nav.js
   Sticky navbar, hamburger, scroll-spy active state.
   Mobile menu: visibility-based transition (no hidden focus
   traps), Esc close, body scroll lock, aria state synced.
   ============================================================ */
import { $, $$, rafThrottle } from './utils.js';

const SECTIONS = ['today', 'bmi', 'search', 'tracker', 'planner', 'workouts', 'recovery', 'reset', 'progress', 'calculators', 'settings'];

export function initNav() {
  const navbar    = $('#navbar');
  const navLinks  = $('#navLinks');
  const hamburger = $('#hamburger');
  const links     = $$('.nav-link');

  // Build a section-id -> link map for O(1) active updates
  const linkByHash = new Map(links.map((a) => [a.getAttribute('href'), a]));
  const sectionEls = SECTIONS.map((id) => $('#' + id)).filter(Boolean);

  const isMobile = () => window.matchMedia('(max-width: 768px)').matches;

  const setMenuOpen = (open) => {
    hamburger.classList.toggle('active', open);
    navLinks.classList.toggle('open', open);
    hamburger.setAttribute('aria-expanded', String(open));
    /* keep closed menu out of the a11y tree & tab order */
    navLinks.setAttribute('aria-hidden', String(!open));
    document.body.style.overflow = open && isMobile() ? 'hidden' : '';
  };

  const onScroll = rafThrottle(() => {
    navbar.classList.toggle('scrolled', window.scrollY > 20);

    let current = 'today';
    for (const el of sectionEls) {
      if (el.getBoundingClientRect().top <= 120) current = el.id;
    }
    const activeHref = '#' + current;
    linkByHash.forEach((link, href) => {
      link.classList.toggle('active', href === activeHref);
    });
  });

  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  hamburger.addEventListener('click', () => {
    setMenuOpen(!navLinks.classList.contains('open'));
  });

  // Close mobile menu on any link tap (event delegation)
  navLinks.addEventListener('click', (e) => {
    if (e.target.matches('.nav-link')) setMenuOpen(false);
  });

  // Esc closes the mobile menu (and restores focus to the button)
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && navLinks.classList.contains('open')) {
      setMenuOpen(false);
      hamburger.focus();
    }
  });

  // Reset state when leaving the mobile breakpoint
  window.addEventListener('resize', rafThrottle(() => {
    if (!isMobile() && navLinks.classList.contains('open')) setMenuOpen(false);
  }), { passive: true });

  // initial aria state
  setMenuOpen(false);
}
