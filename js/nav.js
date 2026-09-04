/* ============================================================
   ProtoMacro — nav.js
   Sticky navbar, hamburger, scroll-spy active state.
   ============================================================ */
import { $, $$, rafThrottle } from './utils.js';

const SECTIONS = ['home', 'bmi', 'search', 'tracker', 'planner', 'recovery', 'calculators', 'progress'];

export function initNav() {
  const navbar    = $('#navbar');
  const navLinks  = $('#navLinks');
  const hamburger = $('#hamburger');
  const links     = $$('.nav-link');

  // Build a section-id -> link map for O(1) active updates
  const linkByHash = new Map(links.map((a) => [a.getAttribute('href'), a]));
  const sectionEls = SECTIONS.map((id) => $('#' + id)).filter(Boolean);

  const setMenuOpen = (open) => {
    hamburger.classList.toggle('active', open);
    navLinks.classList.toggle('open', open);
    hamburger.setAttribute('aria-expanded', String(open));
  };

  const onScroll = rafThrottle(() => {
    navbar.classList.toggle('scrolled', window.scrollY > 20);

    let current = 'home';
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
}
