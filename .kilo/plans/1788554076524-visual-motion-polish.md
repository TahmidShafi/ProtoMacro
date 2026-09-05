# ProtoMacro — Visual & Motion Polish Plan

Diagnostic-driven polish pass over the existing v2 codebase. No framework changes, no new features, no architecture changes. Accent stays green (user-confirmed). All work is CSS + targeted JS edits in existing modules.

## Audit Findings (to fix)

**Layout**
1. `#today` uses `.hero` class → `min-height:100vh; padding:140px 0 80px` = huge dead space on the main dashboard.
2. `section { padding:100px 0 }` globally → bloated vertical rhythm.
3. ~250 lines dead hero CSS (`.hero-grid`, `.hero-badge`, `.hero-card`, `.mini-ring`, `.float-badge`, `.hero-stats`, `.hero-ctas`, `.hero h1`, `floatBadge`/`float` keyframes) — HTML no longer contains them.
4. `.today-rings` items hack inline `style="padding:10px 6px"` in dashboard.js over `.progress-ring-card` (24px) → need a proper `.progress-ring-card.mini` variant.
5. `.ai-food` is `grid-template-columns: 1fr auto auto` (3 cols) but smart-planner renders a 4th child (swap button) → overflow. Real bug.

**Color / theme consistency**
6. Hardcoded `rgba(255,255,255,…)` surfaces break light theme: `.mode-toggle-wrap`, `.mode-btn.mode-maintain.active`, `.log-table tr:hover`, `.weight-delta-flat`, `.mini-ring` (dead), `.water-bottle-body`, `.ai-food` (`rgba(0,0,0,0.2)`), `.food-macro` bg, `.chip` etc.
7. Accent overuse: green on eyebrows, ring percents, cal cells, calorie chips, logos — restrict to intentional moments.
8. `.btn-primary` heavy gradient + glow → solid primary, subtle shadow (calmer, matches "no excessive gradients").
9. Contrast: `--text-dim` slightly low on both themes; bump one step. Keep `--on-accent` near-black on green (accessible) via token.

**Typography**
10. Mixed hardcoded rem sizes vs `--text-*` tokens throughout v1 CSS → normalize.
11. No `tabular-nums` on animated stats → digit jitter during counts. Add to stat classes.
12. Global `--transition: 0.3s` too slow for micro-feedback → duration tokens (fast 140ms / base 200ms / slow 320ms) + easing tokens.

**Motion**
13. `utils.js animateNumber`: always starts from 0; no cancellation → jank + double-animation on rapid updates. Fix: per-element current-value tracking + cancel token; keep reduced-motion skip.
14. No modal exit animation (close = instant remove) → add 150ms fade/scale-out.
15. No section reveal system → IO-based one-time `opacity+translateY(12px)` reveal, JS-gated so no-JS stays visible, disabled under reduced motion.
16. `.food-card` re-animates whole grid on favorite toggle (full re-render) → toggle star state in place instead.
17. `.ring-progress.cal` uses SVG `drop-shadow` filter → repaints on every dashoffset transition; remove (keep flat).
18. Dashboard numbers jump statically → wire `animateNumber` (fixed version) to calorie value + completion score.
19. Dead keyframes cleanup (fadeInUp kept, float/floatBadge removed with hero CSS).
20. Toast stack unbounded → cap at 4.

**Navigation (mobile)**
21. Closed `.nav-links` remain focusable/tabbable (transform-only hiding); no Esc, no scroll lock, no backdrop, fixed `top:72px`, 11 links with no scroll cap → `visibility` transition + `aria-hidden`/inert management, Esc close, scroll lock, `max-height:calc(100dvh-72px); overflow-y:auto`.

**Performance**
22. Charts: unify tooltip style with design system; disable Chart.js animation under reduced motion; no other chart work needed (update-in-place already done).
23. Remove universal `.card:hover` border shift (noise on non-interactive cards); move hover to interactive variants only.
24. `.serving-input`/`.delete-btn` touch targets slightly small → min-height 32/36px.

**Accessibility**
25. `aria-live="polite"` on BMI form error containers (index.html attrs).
26. `.serving-input`/`.search-input` `outline:none` → ensure `:focus-visible` equivalents (global rule covers most; add for serving-input, habit-day, calendar-day focus styles).
27. Consolidate breakpoints (480/768/960) — the appended v2 CSS uses 640; fold into 480.

## Execution Order

1. **Tokens** (`styles.css` top): add `--dur-fast/base/slow`, `--ease-out`, `--surface-hover`, `--on-accent`, `--overlay`, spacing tokens (`--space-1..8`); bump `--text-dim`; refine `--transition` to use tokens.
2. **Dead CSS purge + layout**: delete hero/mini-ring/float-badge blocks + dead keyframes + `.food-card-source` (replaced by `.source-chip`); retune `section` padding to tokens (72px → 48px mobile), `.hero` → compact dashboard padding (not 100vh), mobile `.section-header` margin.
3. **Theme fixes**: replace all hardcoded rgba(255,255,255/0,0,0,…) surfaces with `var(--surface-*)`/`--overlay` tokens defined per theme; verify light theme across every section.
4. **Typography pass**: swap hardcoded rem values to `--text-*` tokens; add `tabular-nums` to `.today-cal-val`, `.ring-val`, `.deficit-nums`, `.calorie-card-value`, `.summary-stat-val`, `.calc-stat-val`, `.habit-stat-val`, `.water-amount`, `.review-stat-val`, `.consistency-pct`, `.dough-pct`.
5. **Buttons/cards**: `.btn-primary` solid + subtle shadow; press states (`transform: scale(0.98)`) on `.btn`, `.quick-btn`, `.water-add-btn`, `.mode-btn`, `.search-tab`; remove `.card:hover`; define `.card-interactive` for food-cards/meal-slots; unify pill paddings across `.search-tab/.pref-chip/.seg-btn/.calc-tab`.
6. **Motion system**:
   - utils.js: rewrite `animateNumber` (cancel token, start-from-current, rAF, reduced-motion instant).
   - modal.js: exit animation (`.closing` class, 150ms, then remove).
   - New tiny `reveal.js`: IO adds `.in-view` once to `[data-reveal]`; app.js tags `<main> > section` inner containers; CSS token-based transition; no-JS safe; reduced-motion instant.
   - CSS: shorter food-card enter (0.25s), `.calc-panel` fade 0.2s, toast cap styling unchanged.
7. **JS integration fixes**:
   - dashboard.js: `.progress-ring-card.mini` class (drop inline styles), `animateNumber` for consumed kcal + score, mini rings get dashoffset transition class.
   - search.js: favorite toggle updates star in place (no full re-render).
   - nav.js: mobile menu — Esc close, scroll lock, `aria-expanded`/`aria-hidden`, visibility transition.
   - smart-planner/mealCard: `.ai-food` grid 4 columns (CSS side).
   - progress.js: Chart.defaults tooltip styling + `Chart.defaults.animation = false` under reduced motion.
   - tracker.js: remove drop-shadow on `.cal` ring (CSS side mostly).
   - utils.js toast: cap stack at 4.
8. **index.html micro-edits**: `aria-live="polite"` on the 3 BMI `.form-error` divs; `data-reveal` hooks not needed in HTML (JS assigns).
9. **Mobile**: verify 320–414px — `.today-rings` stays 3-col with smaller rings, `.ai-food` stacks amount/cal under 400px, menu scroll cap, touch-target bumps, hide sync pill label ≤640px (already), test `.migration-preview-row` and modals at 320px.
10. **QA + build**: `npm test`, `npm run build`, `npm run preview` smoke; verify each feature flow unaffected (tracker, search tabs, planner DnD, habits day-tap, workouts, settings segs, backup, modals, charts); commit + push (deploys).

## Files Modified

- `css/styles.css` (bulk: tokens, purge, theme fixes, motion)
- `js/utils.js` (animateNumber, toast cap)
- `js/core/modal.js` (exit animation)
- `js/nav.js` (menu a11y/scroll-lock)
- `js/dashboard.js` (mini rings, number animation)
- `js/search.js` (in-place favorite toggle)
- `js/progress.js` (chart tooltip/reduced-motion defaults)
- `js/app.js` (reveal init)
- `index.html` (aria-live attrs)
- New: `js/reveal.js` (~30 lines)

## Validation

- `npm test` green (32 tests untouched — no logic changes).
- `npm run build` clean; preview smoke test (/, /sw.js, /manifest.webmanifest).
- Manual checklist per phase 16 in prompt; visual check dark + light at 320/375/768/1280.
- No functionality removed; all bus events and storage schema untouched.

## Out of scope

- Lighthouse automation (no browser tooling here) — static audit + build/test QA only; noted as limitation.
- No accent change, no new features, no framework changes.
