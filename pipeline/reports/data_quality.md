# ProtoMacro Food Catalog — Data Quality Report

Total normalized foods: **545**

## Counts by Dataset

| Dataset | Count |
|---|---:|
| `curated` | 92 |
| `fctb_2013` | 381 |
| `fdc_sr_legacy` | 72 |

## Counts by State

| State | Count |
|---|---:|
| `cooked` | 94 |
| `prepared` | 181 |
| `raw` | 270 |

## Counts by Quality Flag

| Quality Flag | Count |
|---|---:|
| `atwater_mismatch` | 1 |
| `borrowed_value` | 283 |
| `bracketed_value` | 1 |
| `crude_fibre_fallback` | 35 |
| `curated_estimate` | 92 |
| `different_state_crosswalk` | 9 |
| `proximates_over_100g` | 6 |
| `recipe_calculated` | 57 |
| `trace_to_zero` | 5 |

## Atwater Energy Check Distribution

- Checked items (Atwater > 0): **543**
- Median `|kcal - atwater| / atwater`: **0.33%**
- 90th percentile `|kcal - atwater| / atwater`: **2.60%**
- Flagged (`atwater_mismatch`, > max(20 kcal, 15%)): **1**

## Accuracy of the Old Hand-Entered Values (`exact` matches)

| Macro | n | Median Abs % Error | 90th Percentile Abs % Error |
|---|---:|---:|---:|
| `kcal` | 80 | 2.6% | 42.9% |
| `protein` | 80 | 7.6% | 57.1% |
| `carbs` | 78 | 6.0% | 40.8% |
| `fat` | 80 | 17.5% | 172.7% |

### 10 Worst Hand-Entered `exact` Foods (by kcal % error)

| # | Curated Name | New ID | Old kcal | Source kcal | Abs % Error |
|---:|---|---|---:|---:|---:|
| 72 | Egg drop soup | `fdc_174807` | 65 | 27.0 | 140.7% |
| 69 | Wonton soup | `fdc_171821` | 75 | 32.0 | 134.4% |
| 191 | Coffee, black | `fdc_171890` | 2 | 1.0 | 100.0% |
| 68 | Hot and sour soup | `fdc_174808` | 70 | 39.0 | 79.5% |
| 23 | Mishti doi (sweet yogurt) | `fctb_12_0003` | 140 | 94.0 | 48.9% |
| 31 | Bitter gourd / Karela | `fctb_03_0016` | 17 | 31.0 | 45.2% |
| 65 | Kung pao chicken | `fdc_167676` | 185 | 129.0 | 43.4% |
| 140 | Pulled pork | `fdc_173344` | 240 | 168.0 | 42.9% |
| 166 | Tuna, canned | `fdc_173709` | 116 | 86.0 | 34.9% |
| 80 | Hummus | `fdc_174289` | 166 | 237.0 | 30.0% |
