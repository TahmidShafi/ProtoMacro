# Food Composition Table for Bangladesh (FCTB 2013) — Source Profile

- **Workbook**: `data/raw/FCDB_7_4_14.xlsx` (Shaheen et al., 2013, INFS, University of Dhaka; hosted by FAO)
- **Companion PDF**: `data/raw/FCT_10_2_14_final_version.pdf`

## 1. Workbook Structure (11 Sheets)

| Sheet | Rows | Cols | Purpose |
|---|---:|---:|---|
| `Introduction` | 44 | 1 | Title, authors, institutional credits |
| `Components` | 244 | 4 | Component definitions, units, INFOODS tagnames, Atwater factors, analytical methods |
| `Key Foods` | 61 | 6 | Key Foods methodology (20 newly analyzed foods) |
| `Retention & Yield Factors` | 138 | 10 | EuroFIR RF and YF used for cooked foods / mixed recipes |
| `UserDB_Main_table` | 1058 | 256 | Main composition table (**37 populated columns**, cols 38–256 empty) |
| `Annex_Amio acids` | — | — | Amino acid profiles (subset of foods) |
| `Annex_ Fatty acids` | — | — | Fatty acid profiles |
| `Annex_Antioxidants` | — | — | Antioxidant / polyphenol values |
| `Annex_Antinutrients` | — | — | Phytic acid, oxalic acid |
| `Annex_Sugar` | 61 | 27 | Total sugar values (subset of 56 foods) |
| `Bibliography` | 199 | 2 | `BiblioID` reference lookup |

## 2. `UserDB_Main_table` Layout & Row Counts

- **Header rows**: 2 rows (`Row 1`: INFOODS tagname + unit; `Row 2`: human-readable component description).
- **Group header rows**: 15 food group banner rows (e.g., `01 Cereals and their products`).
- **Food data rows**: **381 foods** (codes formatted `GG_NNNN`, e.g., `01_0001`).
- **Metadata sub-rows**: Most foods are followed by `SD or min- max` (**308** rows, plus **1** row labeled `min- max` at row 1011) and `n` (**324** rows).

### Food Groups (15 groups, 381 items)

| Group | Items |
|---|---:|
| `01 Cereals and their products` | 43 |
| `02 Pulses, legumes and their products` | 16 |
| `03 Vegetables and their products` | 48 |
| `04 Leafy vegetables` | 36 |
| `05 Starchy roots, tubers and their products` | 21 |
| `06 Nuts, seeds and their products` | 16 |
| `07 Spices, condiments and herbs` | 20 |
| `08 Fruits` | 43 |
| `09 Fish, shellfish and their products` | 72 |
| `10 Meat, poultry and their products` | 16 |
| `11 Eggs and their products` | 7 |
| `12 Milk and its product` | 13 |
| `13 Fat and oils` | 12 |
| `14 Beverages` | 10 |
| `15 Miscellaneous` | 8 |
| **Total** | **381** |

## 3. Columns & Meanings (`UserDB_Main_table`, Cols 1–37)

| Col | Row 1 Header | Meaning (`Row 2` / `Components`) |
|---:|---|---|
| 1 | `Code` | Food code (`GG_NNNN`) |
| 2 | `Foodname in English` | English food name (`*` suffix on 54 recipe-calculated items) |
| 3 | `Foodname in Bengali` | Romanized Bengali name (present on **381/381** foods) |
| 4 | `Scientific name` | Botanical / zoological Latin name |
| 5 | `Source/BiblioID` | Primary / borrowed reference IDs or `Recipe calculation` |
| 6 | `EDIBLE` | Edible portion coefficient (ratio of edible portion as purchased) |
| 7 | `ENERC (kcal) kJ` | Metabolizable energy formatted as `(kcal)kJ`, e.g., `(324)1360` |
| 8 | `WATER (g)` | Water / moisture (oven drying 105 °C) |
| 9 | `PROT (g)` | Protein |
| 10 | `FATCE (g)` | Fat by Soxhlet |
| 11 | `CHOAVLDF (g)` | **Available carbohydrate by difference** (excludes fibre) |
| 12 | `FIBTG or [FIBC] (g)` | Total dietary fibre (AOAC 985.29), or `[crude fibre]` in brackets |
| 13 | `ASH (g)` | Ash |
| 14–21 | `CA`, `FE`, `MG`, `P`, `K`, `NA`, `ZN`, `CU` | Minerals (mg) |
| 22–29 | `VITA_RAE`, `RETOL`, `CARTBEQ or [CARTB]`, `CARTA`, `CARTB`, `CRYPX`, `VITD`, `VITE, or [TOCPHA]` | Fat-soluble vitamins & carotenoids (mcg / mg) |
| 30–37 | `THIA`, `RIBF`, `NIAEQ, or [NIA]`, `NIA`, `NIATRP`, `VITB6A`, `FOL`, `ASCL` | Water-soluble vitamins (mg / mcg) |

## 4. Basis, Units & Definitions

- **Basis**: Per **100 g edible portion of fresh weight** (including beverages/liquids).
- **Energy units**: Both kcal and kJ in a single string `(kcal)kJ` (all **381** rows follow this format).
- **Energy conversion factors** (`Components` Table 2):
  - Protein: `4 kcal/g` (`17 kJ/g`)
  - Fat: `9 kcal/g` (`37 kJ/g`)
  - Available carbohydrate: `4 kcal/g` (`17 kJ/g`)
  - **Fibre**: `2 kcal/g` (`8 kJ/g`)
  - Alcohol: `7 kcal/g` (`29 kJ/g`)
- **Carbohydrate definition**: **Available carbohydrate by difference** (`CHOAVLDF`), defined as:
  `100 - (Water + Protein + Fat + Ash + Fibre + Alcohol)`.
  It **does NOT include fibre** (unlike USDA `Carbohydrate, by difference`, which includes fibre).
- **Fibre**: Reported separately in `FIBTG or [FIBC] (g)`. When `[FIBC]` (crude fibre) is used instead of `FIBTG`, the workbook notes `CHOAVLDF` is of lower quality.

## 5. Raw vs Cooked / Prepared & Local Names

- **Local / Bangla names**: Present on **381 / 381 (100%)** foods, in Romanized Bengali (e.g., `Jaab, gota`, `Pawruti`, `Misti biscuit`).
- **State breakdown (English name & `Source/BiblioID`)**:
  - Contains `raw`: **245** items
  - Contains explicit cooking term (`boiled`, `cooked`, `fried`, `roasted`, `baked`, `steamed`, `grilled`, etc.): **43** items
  - Other / prepared / commercial / recipe without `raw`: **93** items
  - `Source/BiblioID == "Recipe calculation"`: **57** items (**54** carry `*` in `Foodname in English`), calculated using EuroFIR retention factors (`RF`) and local/literature yield factors (`YF`).

## 6. Missing-Value, Trace, Bracket & Borrowed Markers

Across all 32 numeric/value columns (Cols 6–37) of the **381** food rows (12,192 cells):

| Marker / Type | Count (Cols 6–37) | Meaning |
|---|---:|---|
| Numeric (`int`/`float`) | 9,900 | Standard numeric value |
| Empty / `None` | 1,353 | Missing / not analyzed |
| `[val]` (brackets) | 387 | Fallback method (e.g., `[FIBC]` crude fibre instead of `FIBTG`) |
| `(kcal)kJ` string | 381 | Combined energy cell (Col 7 only) |
| `tr` (trace) | 152 | Trace amount (below quantification limit; treat as `0` + flag) |
| `-` (dash) | 0 | Not used in `UserDB_Main_table` |
| Borrowed `BiblioID` | 267 foods | Citations include foreign DBs (`DK7`, `UK6`, `US25`, `IND`, `EAS`, `AFR`, etc.) |

### Proximate Columns Specifically (Cols 6–13)
- `EDIBLE` (Col 6): `353` numeric, `28` empty
- `ENERC` (Col 7): `381` `(kcal)kJ`
- `WATER` (Col 8): `380` numeric, `1` `tr`
- `PROT` (Col 9): `381` numeric
- `FATCE` (Col 10): `381` numeric
- `CHOAVLDF` (Col 11): `378` numeric, `2` `tr`, `1` bracketed
- `FIBTG or [FIBC]` (Col 12): `343` numeric, `35` `[FIBC]` bracketed, `3` empty
- `ASH` (Col 13): `379` numeric, `2` `tr`
