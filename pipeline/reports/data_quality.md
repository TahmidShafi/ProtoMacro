# ProtoMacro Food Catalog — Data Quality Report

Total normalized foods: **567**

## Counts by Dataset

| Dataset | Count |
|---|---:|
| `curated` | 117 |
| `fctb_2013` | 381 |
| `fdc_sr_legacy` | 69 |

## Counts by State

| State | Count |
|---|---:|
| `cooked` | 105 |
| `prepared` | 202 |
| `raw` | 260 |

## Counts by Quality Flag

| Quality Flag | Count |
|---|---:|
| `approximate_crosswalk` | 18 |
| `atwater_mismatch` | 1 |
| `borrowed_value` | 283 |
| `bracketed_value` | 1 |
| `crude_fibre_fallback` | 35 |
| `curated_estimate` | 117 |
| `different_state_crosswalk` | 9 |
| `proximates_over_100g` | 6 |
| `recipe_calculated` | 57 |
| `suspect_value` | 1 |
| `trace_to_zero` | 5 |

## Atwater Energy Check Distribution

- Checked items (Atwater > 0): **565**
- Median `|kcal - atwater| / atwater`: **0.35%**
- 90th percentile `|kcal - atwater| / atwater`: **2.73%**
- Flagged (`atwater_mismatch`, > max(20 kcal, 15%)): **1**

### What the Atwater check does and does not prove

In FCTB 2013, energy (`ENERC`) is itself calculated from the reported proximates using Atwater/INFOODS factors, so close agreement here validates our parsing and internal consistency of the extracted numbers — not real-world laboratory accuracy.

## Crosswalk Match Types by Cuisine

| Cuisine | `exact` | `approximate` | `different_state` | `none` | Total |
|---|---:|---:|---:|---:|---:|
| Bangladeshi / South Asian | 11 | 3 | 7 | 15 | 36 |
| Indian | 1 | 1 | 0 | 22 | 24 |
| Chinese | 9 | 3 | 0 | 8 | 20 |
| Arab / Middle Eastern | 5 | 0 | 0 | 15 | 20 |
| European | 8 | 3 | 0 | 18 | 29 |
| American | 14 | 6 | 2 | 10 | 32 |
| Common Proteins | 9 | 0 | 0 | 1 | 10 |
| Common Carbs | 5 | 2 | 0 | 0 | 7 |
| Common Fats | 6 | 0 | 0 | 0 | 6 |
| Dairy | 4 | 0 | 0 | 0 | 4 |
| Drinks | 5 | 0 | 0 | 1 | 6 |

## Accuracy of the Old Hand-Entered Values (`exact` matches, source kcal >= 20)

| Macro | n | Median Abs % Error | 90th Percentile Abs % Error |
|---|---:|---:|---:|
| `kcal` | 74 | 2.5% | 34.9% |
| `protein` | 74 | 6.4% | 51.6% |
| `carbs` | 73 | 6.0% | 40.8% |
| `fat` | 74 | 13.6% | 172.7% |

### Low-Calorie `exact` Matches Excluded from % Stats (source kcal < 20)

| # | Curated Name | New ID | Old kcal | Source kcal | Abs kcal Diff |
|---:|---|---|---:|---:|---:|
| 120 | Sauerkraut | `fdc_169279` | 19.0 | 19.0 | 0.00 |
| 191 | Coffee, black | `fdc_171890` | 2.0 | 1.0 | 1.00 |
| 192 | Green tea | `fdc_171917` | 1.0 | 1.0 | 0.00 |

### 10 Worst Hand-Entered `exact` Foods (by kcal % error, source kcal >= 20)

| # | Curated Name | New ID | Old kcal | Source kcal | Abs % Error |
|---:|---|---|---:|---:|---:|
| 72 | Egg drop soup | `fdc_174807` | 65 | 27.0 | 140.7% |
| 69 | Wonton soup | `fdc_171821` | 75 | 32.0 | 134.4% |
| 68 | Hot and sour soup | `fdc_174808` | 70 | 39.0 | 79.5% |
| 23 | Mishti doi (sweet yogurt) | `fctb_12_0003` | 140 | 94.0 | 48.9% |
| 31 | Bitter gourd / Karela | `fctb_03_0016` | 17 | 31.0 | 45.2% |
| 65 | Kung pao chicken | `fdc_167676` | 185 | 129.0 | 43.4% |
| 140 | Pulled pork | `fdc_173344` | 240 | 168.0 | 42.9% |
| 166 | Tuna, canned | `fdc_173709` | 116 | 86.0 | 34.9% |
| 80 | Hummus | `fdc_174289` | 166 | 237.0 | 30.0% |
| 32 | Jackfruit, ripe | `fctb_08_0017` | 95 | 74.0 | 28.4% |
