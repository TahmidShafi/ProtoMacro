-- Stage 1: Staging tables from parsed raw sources
CREATE OR REPLACE TABLE stg_fctb AS
SELECT
  'fctb_' || code AS id,
  code AS source_code,
  name_en AS name,
  local_name,
  state,
  food_group,
  kcal,
  protein,
  fat,
  COALESCE(carbs_available, 0.0) AS carbs_available,
  ROUND(COALESCE(carbs_available, 0.0) + COALESCE(fibre, 0.0), 4) AS carbs_total,
  fibre,
  water,
  ash,
  '100 g edible portion' AS basis,
  'fctb_2013' AS dataset,
  '2013-07-04' AS version,
  'fctb_2013' AS citation_key,
  quality_flags,
  tags
FROM raw_fctb;

CREATE OR REPLACE TABLE stg_fdc_foundation AS
SELECT
  'fdc_' || CAST(fdc_id AS VARCHAR) AS id,
  CAST(fdc_id AS VARCHAR) AS source_code,
  description AS name,
  CAST(NULL AS VARCHAR) AS local_name,
  state,
  food_group,
  kcal,
  protein,
  fat,
  CASE
    WHEN fibre IS NOT NULL THEN GREATEST(0.0, ROUND(carbs_total - fibre, 4))
    ELSE NULL
  END AS carbs_available,
  carbs_total,
  fibre,
  water,
  ash,
  '100 g' AS basis,
  'fdc_foundation' AS dataset,
  '2026-10-29' AS version,
  'fdc_foundation_2026_10_29' AS citation_key,
  quality_flags,
  tags
FROM raw_fdc_foundation;

CREATE OR REPLACE TABLE stg_fdc_sr_legacy AS
SELECT
  'fdc_' || CAST(fdc_id AS VARCHAR) AS id,
  CAST(fdc_id AS VARCHAR) AS source_code,
  description AS name,
  CAST(NULL AS VARCHAR) AS local_name,
  state,
  food_group,
  kcal,
  protein,
  fat,
  CASE
    WHEN fibre IS NOT NULL THEN GREATEST(0.0, ROUND(carbs_total - fibre, 4))
    ELSE NULL
  END AS carbs_available,
  carbs_total,
  fibre,
  water,
  ash,
  '100 g' AS basis,
  'fdc_sr_legacy' AS dataset,
  '2018-04' AS version,
  'fdc_sr_legacy_2018_04' AS citation_key,
  quality_flags,
  tags
FROM raw_fdc_sr_legacy;

CREATE OR REPLACE TABLE stg_curated AS
SELECT
  curated_index,
  'local_' || CAST(curated_index AS VARCHAR) AS legacy_id,
  curated_id AS id,
  curated_name AS name,
  state,
  fctb_code,
  fdc_id,
  match_type,
  kcal,
  protein,
  fat,
  carbs_total,
  tags
FROM raw_curated;
