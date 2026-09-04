# ProtoMacro

**Fuel your gains. Track your nutrition.**

ProtoMacro is a private, local-first nutrition and fitness web app. No account,
no server, no tracking — everything you log stays in your own browser.

## Features

- **BMI & TDEE** — Mifflin-St Jeor calculator with lose/maintain/gain targets
- **Cut / Maintain / Bulk modes** — mode-aware calorie and macro goals
- **Food search** — curated local database (strong South Asian coverage) augmented by USDA FoodData Central lookups
- **Macro tracker** — live progress rings, editable servings, daily balance card
- **Meal planner** — drag-and-drop breakfast/lunch/dinner/snacks slots with per-meal totals
- **Smart meal generator** — one-day plans built locally from your targets
- **Recovery** — water intake tracker + supplement stack checklist
- **Calculators** — 1RM, US Navy body fat %, macros, Wilks score, LBM/FFMI
- **Progress dashboard** — weekly calorie/macro charts, weight trend, consistency score
- **Sharing** — PNG daily scorecard, PDF weekly report, meal-plan text export

## Development

Requires Node.js 20.19+.

```bash
npm install
npm run dev       # start dev server
npm run build     # production build to dist/
npm run preview   # serve the production build locally
```

## Tech notes

- Zero-framework vanilla JS, structured as ES modules (`js/`), bundled with Vite.
- Dependencies (Chart.js, jsPDF, Inter font) are bundled locally — no CDN calls at runtime.
- State persists to `localStorage` under the key `protomacro_v1`.
- Clearing your browser data clears your logs — use the weekly report or take backups.

## Privacy

All calculations run locally. The only outbound request is anonymous food search
against the public USDA FoodData Central API when the local database has too few
matches. Nothing you type is ever stored off-device.
    