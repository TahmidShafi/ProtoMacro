# Changelog

## 2026-11-15 — v3.1.0: Sourced Food Data Pipeline
- Added reproducible Python + DuckDB food data pipeline (`pipeline/run.py`, `npm run data:build`) ingesting Food Composition Table for Bangladesh (2013) and USDA FoodData Central (SR Legacy & Foundation Foods).
- Generated deterministic `js/data/foods.json` (545 sourced foods: `381` FCTB, `72` FDC SR Legacy, `92` curated estimates) and `js/data/id_migration_v2_to_v3.json`.
- Updated `js/foods-db.js` and `js/search.js` with source chips (`FCT Bangladesh 2013` / `USDA FDC` / `Estimate`), romanized Bangla search, fibre display, and `per 100 g edible portion` notes; added `Data sources` attribution card in Settings.
- Bumped `SCHEMA_VERSION` to `3` in `js/core/migrate.js` with `migrateV2toV3` remapping `local_N` IDs across `favorites`, `recents`, `planner`, `recipes`, and `savedMeals` without modifying logged macro numbers.
- Added `pytest` pipeline tests, `vitest` `migrateV2toV3` tests, and `.github/workflows/pipeline.yml` CI workflow.

## 2026-11-15 — v3.0.0: 100% Local-First
- Removed optional Supabase cloud sync, auth, and migration wizard (`js/core/sync.js`, `js/core/auth.js`, `js/core/storage/cloud.js`, `js/migration-wizard.js`, `supabase/`, `.env.example`) and uninstalled `@supabase/supabase-js`.
- Simplified `js/core/storage/index.js` to the local `localStorage` provider only while keeping `protomacro_v1`, schema, and any existing `protomacro_pre_sync_backup` untouched.
- Removed the topbar sync pill and Settings account/cloud card; updated Settings, footer, and `README.md` to document local-only storage and JSON backup/restore for moving devices.

## 2026-11-15 — UI, Performance & Security Polish
- Fixed 390px mobile horizontal overflow on `#today`, `#progress`, `#workouts`, and `#tracker`, plus calculator tab wrapping.
- Fixed Chart.js `Animation.tick` `this._fn` runtime error on `#workouts` and added empty-state cards for bare chart axes.
- Centered macro ring value labels on `#today`, pinned sidebar footer visibility, and replaced legacy `Step 01`–`09` eyebrows.
- Made `#grocery` a dedicated view with an empty state and aggregated shopping list; added `public/favicon.svg` and `#0B1020` manifest colors.
- Loaded Latin-only Inter weights (`400`–`900`), lazy-loaded `jspdf` on PDF export, and resolved Vite dynamic/static import warnings.
- Upgraded `dompurify` (`3.4.14` -> `3.4.18`) to clear all runtime `npm audit --omit=dev` advisories (`0` remaining).
- Added Playwright UI audit tooling (`npm run audit:ui`) and fixed `tests/group1.test.js` modal root mocking (`126/126` tests passing).
