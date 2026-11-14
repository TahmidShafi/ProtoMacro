# ProtoMacro

**Fuel your gains. Track your nutrition.**

ProtoMacro is a private, 100% local-first nutrition, fitness and habit platform.
No account required, no server needed, no tracking — everything you log stays
on your own device.

## Core journey

**PLAN → EAT → TRACK → TRAIN → RECOVER → ANALYZE → IMPROVE**

## Features

- **Today dashboard** — calories/macros at a glance, recovery status, daily
  completion score (with a transparent breakdown), quick actions
- **BMI & TDEE** — Mifflin-St Jeor calculator with lose/maintain/gain targets
- **Cut / Maintain / Bulk modes** — mode-aware calorie and macro goals
- **Food system** — ~230 curated foods (strong South Asian coverage), custom
  foods, favorites, recents, debounced typo-tolerant search, USDA FoodData
  Central fallback
- **Macro tracker** — live progress rings, editable servings, daily balance card
- **Meal planner** — drag-and-drop slots with per-gram editing, per-meal totals,
  save any slot as a reusable meal
- **Smart meal generator** — preference chips (high protein, South Asian,
  budget, easy, vegetarian), per-meal regenerate, single-food swap — 100% local
- **Recipes** — build from ingredients, auto per-serving macros, loggable
- **Grocery list** — aggregated from the meal plan, copy/print
- **Workouts** — sets/reps/weight logging, volume, estimated 1RM, PRs, charts
- **Recovery** — water, supplement stack, sleep log
- **Reset (habits)** — quit/reduce modes, streaks, compassionate setback
  logging with triggers, craving mode, milestones, money saved
- **Progress** — weekly charts, weight trend vs actual (7-day moving average),
  weekly review insights, history calendar, PDF export
- **Backup & restore** — full JSON export, validated + previewed import
- **Settings** — kg/lb, cm/ft+in, ml/oz, dark/light/system theme
- **PWA** — installable, works offline (service worker + cached assets)

## Privacy

All calculations and storage run locally in your browser (`localStorage`). Nothing
you log ever leaves your device. The only outbound request is anonymous food
search against the public USDA FoodData Central API when you search online.

## Moving to another device (Backup & restore)

Your data stays in this browser. To move your logs, workouts, recipes, habits,
and settings to another device (or keep an offline copy):

1. Open **Settings → Backup & restore** and click **Export Backup** to download a JSON file.
2. On the new device, open **Settings → Backup & restore** and click **Import Backup**.
3. Review the validated preview of your data and confirm to restore.

## Development

Requires Node.js 20.19+.

```bash
npm install
npm run dev       # start dev server
npm run build     # production build to dist/
npm run preview   # serve the production build locally
npm test          # vitest (state, metrics, streaks, migrations…)
```

## Tech notes

- Zero-framework vanilla JS, structured as ES modules (`js/`), bundled with Vite.
- `js/core/` holds the data layer: the local storage provider,
  schema migrations (v1→v2), pure metric calculations, a11y modal helper and
  an event bus. Feature modules never touch localStorage directly.
- Dependencies (Chart.js, jsPDF, Inter font) are bundled locally —
  no CDN calls at runtime.
- State persists to `localStorage` under the key `protomacro_v1`
  (schemaVersion 2 inside the payload; v1 data migrates automatically).
- Clearing your browser data clears your logs — use the weekly report or the
  Settings → Backup export.

## Deployment

Vercel (auto-detects Vite) and GitHub Pages (via the included Actions
workflow) both work out of the box — the build uses relative paths.
