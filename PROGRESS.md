# ProtoMacro v2 Overhaul — Progress / Resume Notes

Updated: 2026-09-05 (mid-implementation)

## ✅ Done

- **Security**: secret scan clean, `.gitignore` hardened (`.env*`, `*.key`), `.env.example` added. `test_glm.py` was deleted in an earlier session and never entered git history.
- **Tests**: `tests/core.test.js` — 32 passing (datetime, mode macros, sanitize*, normalizeState v1→v2 migration, daily score, macro consistency, weight stats, e1RM/volume, habit streaks). `npm test` green.
- **Core layer** (`js/core/`): `bus.js` (events), `format.js` (kg/lb, cm/ft+in, ml/oz), `metrics.js` (daily score, consistency, weightStats+movingAverage, epley1RM, volume, habitStreak), `migrate.js` (SCHEMA_VERSION=2, normalizeState, sanitizers), `modal.js` (a11y dialog + formModal + confirm patterns), `storage/{local,cloud,index}.js` (provider facade, env-gated Supabase).
- **state.js v2**: schemaVersion, new collections (customFoods, recipes, savedMeals, favorites, recents, workouts, habits, sleepLog, settings, goalWeight), debounced quota-aware saves via facade, `replaceState()`, snapshot gains items/water/score, no zero-pollution of history.
- **utils.js**: crypto UUIDs, `debounce`, reduced-motion-aware `animateNumber`, aria-live toasts, new icons.
- **mode.js / tracker.js / planner.js / bmi.js / recovery.js** refactored: event bus, grams editor in planner, snapshot+score sync, water/supplements refresh snapshot, sleep logging w/ modals (no `prompt()`).
- **index.html**: restructured — nav (Today/Goals/Foods/Tracker/Plan/Train/Recover/Reset/Progress/Tools/Settings), Today dashboard, Foods tabs UI, workouts + reset + settings sections, `<main>`, sync pill, aria labels. Smart-planner title entity fixed.
- **CSS**: v2 extension appended to `styles.css` — light theme tokens (`[data-theme="light"]`), reduced-motion, focus-visible, modals, today dashboard, food rows, habits, workouts, calendar, review, sleep, settings, grocery, responsive.
- **New feature modules written**: `dashboard.js` (Today), `recipes.js`, `saved-meals.js`, `grocery.js`, `habits.js` (Reset: streaks/setbacks/triggers/craving/milestones), `workouts.js` (sets/volume/e1RM/PRs/charts), `weekly-review.js`, `calendar.js`, `search.js` (debounced live search, typo tolerance, favorites/recents/recipes/meals/custom tabs, modal meal picker).
- **Deps installed**: @supabase/supabase-js, vite-plugin-pwa, vitest, eslint (package.json v2.0.0).

## ⏳ Remaining (in order)

1. **smart-planner.js** — preference chips (highProtein/southAsian/budget/easy/vegetarian), per-meal regenerate, swap single food, applyPlan writes `servings` grams (v2 planner model).
2. **progress.js** — weight stats row (start/current/goal/weekly/monthly/total), 7-day MA + actual line, chart update-in-place (no destroy churn), idempotent goal-line plugin, render weekly review + calendar hooks.
3. **nav.js** — SECTIONS = today,bmi,search,tracker,planner,workouts,recovery,reset,progress,calculators,settings.
4. **share.js** — minor: dedupe consistency via metrics (optional), keep working.
5. **settings.js** — units segs, theme seg (dark/light/system → `data-theme`), account card, USDA key override, clear-all.
6. **backup.js** — JSON export; import: validate→preview counts→confirm→merge-or-replace via `replaceState`.
7. **core/sync.js + core/auth.js** — status pill (saved/syncing/synced/error), push on `state:persisted`, pull+merge on sign-in/online, offline queue flag; auth modal (Continue privately / Sign in / Create account); migration wizard (preview counts → confirm → upload). `supabase/schema.sql` (table `protomacro_state`, RLS `user_id = auth.uid()`).
8. **app.js** — boot all modules incl. new ones; applyTheme; initSync; session restore; grocery/settings/backup wiring.
9. **PWA** — vite-plugin-pwa in vite.config, manifest, generate icons 192/512 (PS System.Drawing one-off), `dev-dist` ignored.
10. **CSS small adds** — `.visually-hidden`, `.nav-right`.
11. **Verify** — `npm test`, `npm run build`, `npm run preview`; fix any import cycles; final report (exec summary, security, architecture, features, tests, files, limitations).

## Key facts for resuming

- Storage key unchanged: `protomacro_v1`; v1 data migrates via `normalizeState`.
- Env: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` — app fully works in guest mode when unset.
- Event bus events in use: `tracker:update`, `goals:applied`, `dashboard:update`, `state:replaced`, `state:persisted`, `storage:error`, `food-data:update`, `grocery:update`.
- `window.__FOODS_DB__` set by search.js for cross-module lookups.
- Recipes/saved-meals logging flows through search.js tabs; `createFoodBtn` should offer choice (custom food / new recipe / saved meal) — not yet wired.
