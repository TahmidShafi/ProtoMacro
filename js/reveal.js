/* ============================================================
   ProtoMacro — reveal.js
   One-time section reveal on scroll (opacity + 12px translate).
   JS adds `js-reveal` to <html> and `in-view` per element, so
   no-JS users and reduced-motion users see everything instantly.
   ============================================================ */

const REDUCED = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

export function initReveal() {
  if (REDUCED()) return; /* CSS also guards, but skip observer work entirely */

  document.documentElement.classList.add('js-reveal');

  const targets = document.querySelectorAll('main > section > .container, main > section > .section-header');
  if (!targets.length) return;

  if (!('IntersectionObserver' in window)) {
    targets.forEach((el) => el.setAttribute('data-reveal', ''));
    targets.forEach((el) => el.classList.add('in-view'));
    return;
  }

  const io = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.classList.add('in-view');
        io.unobserve(entry.target); /* one-time — never re-triggers */
      }
    },
    { threshold: 0.08, rootMargin: '0px 0px -5% 0px' }
  );

  targets.forEach((el) => {
    el.setAttribute('data-reveal', '');
    /* elements already in the first viewport reveal immediately
       (observer fires on observe) — no artificial delay */
    io.observe(el);
  });
}
