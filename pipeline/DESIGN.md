# ProtoMacro Food Data Pipeline — Design Document (Phase D1)

## 1. Problem & Goals

Currently, `js/foods-db.js` stores 194 hand-entered foods with:
- Positional IDs (`local_0` … `local_193`) that break references whenever items are inserted, reordered, or replaced.
- Unverified provenance (many non-cultural foods are labeled `brand: "USDA"` without an FDC ID or retrieval record).
- No standardized separation of food state (`raw` vs `cooked` vs `prepared`), available vs total carbohydrate, or dietary fibre.

The pipeline replaces this hand-maintained array with a reproducible, tested, DuckDB-backed ETL pipeline that outputs a single sourced food catalog with stable IDs and per-item provenance.

---

## 2. Pipeline Architecture & Layers

```
data/raw/ (gitignored, sha256-verified by pipeline/extract.py)
   │
   ▼
[1. Raw]       FCDB_7_4_14.xlsx (FCTB 2013)
               FoodData_Central_sr_legacy_food_csv_2018-04.zip (USDA SR Legacy)
               FoodData_Central_foundation_food_*.zip (USDA Foundation)*
   │
   ▼
[2. Staging]   DuckDB SQL tables/views:
               - stg_fctb (parsed (kcal)kJ, tr->0, [val] flags, CHOAVLDF vs FIBTG)
               - stg_fdc_sr_legacy (food.csv + food_nutrient.csv pivoted by nutrient_id)
               - stg_fdc_foundation (same schema, prioritized over SR Legacy within FDC)
               - stg_curated (194 legacy items + curated_crosswalk.csv)
   │
   ▼
[3. Normalized] DuckDB SQL + Python transform:
               - Merge priority: FCTB > FDC > Curated estimate
               - Carbohydrate alignment & unit normalization (per 100 g edible portion)
               - Validation suite (flags anomalies without silently dropping valid foods)
   │
   ▼
[4. App Output] data/foods.v3.json (consumed by app bundle)
                data/id_migration_v2_to_v3.json (local_N -> stable_id map)
```

> **Note on USDA Foundation Foods**: Profiling in D1 showed that `FoodData_Central_foundation_food_csv_2026-10-29.zip` only bundles Foundation-specific extension tables (`foundation_food.csv`, `agricultural_samples.csv`, etc.) without `food.csv` or `food_nutrient.csv`. In D2, Foundation Foods should be ingested from `FoodData_Central_foundation_food_json_2026-10-29.zip` (or the full `FoodData_Central_csv_2026-10-29.zip` bundle).

---

## 3. Output Schema

Each food record in the normalized output conforms to:

```json
{
  "id": "fctb_01_0012",
  "name": "Rice, BR-28, parboiled, milled, raw",
  "local_name": "Chaal, BR-28, siddho",
  "state": "raw",
  "per_100g": {
    "kcal": 348.0,
    "protein": 7.1,
    "carbs": 77.6,
    "fat": 0.6,
    "fibre": 1.4
  },
  "source": {
    "dataset": "fctb_2013",
    "code": "01_0012",
    "version": "2013-07-04"
  },
  "quality_flags": [],
  "tags": ["rice", "chaal", "bangladeshi", "cereal"]
}
```

### Field Specifications
- **`id`** (`string`, unique, immutable):
  - FCTB items: `fctb_<Code>` (e.g., `fctb_01_0012`)
  - FDC items: `fdc_<fdc_id>` (e.g., `fdc_171477`)
  - Curated-only items (no source match): `curated_<slug>` (deterministic ASCII slug from `curated_name`, e.g., `curated_chicken_biryani`)
- **`name`** (`string`): Canonical English name.
- **`local_name`** (`string | null`): Romanized Bengali / local name when present (100% populated for FCTB items).
- **`state`** (`"raw" | "cooked" | "prepared"`): Explicit preparation state so raw ingredients and cooked dishes are never conflated.
- **`per_100g`** (`object`): `kcal`, `protein`, `carbs`, `fat` (required numbers, `>= 0`), `fibre` (`number | null`, `>= 0`).
  - *Carbohydrate note*: FCTB reports **available** carbohydrate (`CHOAVLDF`, excluding fibre), whereas FDC reports carbohydrate **by difference** (including fibre). Output stores `carbs` as reported by the source's primary convention and documents it via `source.dataset` (with `fibre` always exposed separately).
- **`source`** (`object`): `{ dataset, code, version }` — required on every row.
- **`quality_flags`** (`string[]`): Non-blocking provenance/quality annotations, e.g.:
  - `trace_to_zero`: `"tr"` marker converted to `0`
  - `crude_fibre_fallback`: FCTB `[FIBC]` bracketed crude fibre used instead of `FIBTG`
  - `borrowed_value`: FCTB `Source/BiblioID` cites a secondary/foreign DB
  - `recipe_calculated`: FCTB `*` / `Recipe calculation` item
  - `atwater_mismatch`: Reported `kcal` differs from Atwater estimate beyond tolerance
  - `proximates_over_100g`: Sum of `water + protein + fat + carbs + fibre + ash > 102 g`
  - `curated_estimate`: Retained from legacy `js/foods-db.js` with no external source match
  - `different_state_crosswalk`: Legacy item matched only to a different cooking state in source
- **`tags`** (`string[]`): Lowercase search keywords (including Bengali transliterations and synonyms from `js/foods-db.js`).

---

## 4. Merge Priority & Unmatched Foods

1. **Merge priority**: `FCTB 2013 > USDA FDC (Foundation > SR Legacy) > Curated estimate`
   - Bangladeshi / South Asian foods present in FCTB take priority over USDA so local cultivars, fish, pulses, and recipes reflect regional composition.
   - Generic Western / international whole foods not in FCTB resolve to USDA FDC (preferring newer Foundation Foods over SR Legacy when both exist).
2. **Cooked vs. raw rule**: A cooked or prepared curated food is **never** silently replaced by a raw source row. In `curated_crosswalk.csv` such pairs are classified as `different_state` (`approximate` if a different preparation). For D2 output, cooked curated items without a cooked source match are either kept as `curated_estimate` (labeled `state: "cooked"`) or paired with a cooked FCTB/FDC entry.
3. **Foods with no match (`match_type = none`)**:
   - Retained in the catalog with `source: { dataset: "curated", code: "local_<N>", version: "v2" }` and `quality_flags: ["curated_estimate"]`.
   - Any false legacy `brand: "USDA"` label is stripped unless backed by a real `fdc_id`.

---

## 5. Validation Rules & Observability

Every build logs row counts at each layer (`raw → staging → normalized → output`, plus `dropped` and `flagged` counts) and enforces:

| Rule | Severity | Check |
|---|---|---|
| Required fields present | **Error (fail build)** | `id`, `name`, `state`, `kcal`, `protein`, `carbs`, `fat`, `source.{dataset,code,version}` non-null |
| Unique IDs | **Error (fail build)** | `COUNT(DISTINCT id) == COUNT(*)` |
| Provenance on every row | **Error (fail build)** | `source.dataset` in `{'fctb_2013','fdc_foundation','fdc_sr_legacy','curated'}` and `source.code` non-empty |
| Non-negative values | **Error (fail build)** | `kcal >= 0`, `protein >= 0`, `carbs >= 0`, `fat >= 0`, `fibre IS NULL OR fibre >= 0` |
| Proximates sum `<= ~100 g` | **Flag (`proximates_over_100g`)** | `COALESCE(water,0) + protein + fat + carbs + COALESCE(fibre,0) + COALESCE(ash,0) <= 102.0` (fail if `> 110.0`) |
| Atwater energy check | **Flag (`atwater_mismatch`)** | Compare `kcal` vs `4*P + 4*C + 9*F` (plus `2*fibre` for FCTB `CHOAVLDF`). Flag if `abs(kcal - est) > max(20, 0.15 * est)` — **flags rather than drops**, because FCTB/USDA use food-specific Atwater factors and organic acids/alcohol. |

---

## 6. ID Migration (`local_N` → Stable IDs)

Existing user data in `localStorage` (`protomacro_v1`) stores `'local_0'` … `'local_193'` references across five places:
1. `STATE.favorites` (`string[]` of food IDs)
2. `STATE.recents` (`string[]` of food IDs)
3. `STATE.planner` (meal slot items `{ foodId, ... }`)
4. `STATE.recipes` (ingredient lists `{ foodId, ... }`)
5. `STATE.savedMeals` (meal items `{ foodId, ... }`)
*(Plus `STATE.log` entries if `foodId` is stored alongside snapshot macros.)*

### Schema v3 Migration (`js/core/migrate.js`)
- Bump `SCHEMA_VERSION` from `2` to `3`.
- Add `migrateV2toV3(raw)` to `MIGRATIONS` in `js/core/migrate.js`.
- Use a static generated lookup `ID_MIGRATION_MAP` (`{ "local_0": "fctb_...", ... }`) to rewrite every `local_N` ID in `favorites`, `recents`, `planner`, `recipes`, `savedMeals`, and `log` items.
- Custom food IDs (`custom_*`) and already-migrated IDs are left untouched.
- Because `normalizeState` runs on every load path (`localStorage` and JSON backup import), old v1/v2 backups automatically upgrade to v3 IDs on import.

---

## 7. Attribution & Open Licensing Question

- **USDA FoodData Central (SR Legacy & Foundation Foods)**: Released under **CC0 1.0 Universal (Public Domain Dedication)**. No legal restriction on redistribution; standard academic/product citation recommended.
- **Food Composition Table for Bangladesh (FCTB 2013)**: Listed on the FAO/INFOODS directory as **"free access"** with **no named open license** (e.g., CC-BY or CC0).
  - **Proposed attribution text** (for About / Footer / Data Sources modal):
    > *Bangladeshi food composition data sourced from the Food Composition Table for Bangladesh (Shaheen et al., 2013), Institute of Nutrition and Food Science (INFS), University of Dhaka / FAO. U.S. and general food data sourced from USDA FoodData Central (SR Legacy & Foundation Foods, CC0).*
  - **Open question**: Before bundling FCTB-derived records into a public repository/app distribution, confirm with INFS / FAO INFOODS whether redistributing derived JSON extracts under an open-source repo is permitted under their "free access" terms.
