-- Stage 2: Normalize and merge FCTB > FDC Foundation > FDC SR Legacy > Curated estimate
-- Also compute curated tag carry-over, related_ids for different_state, and v2->v3 id migration map.

CREATE OR REPLACE TABLE referenced_fdc_ids AS
SELECT DISTINCT CAST(fdc_id AS VARCHAR) AS source_code
FROM stg_curated
WHERE fdc_id IS NOT NULL AND TRIM(fdc_id) <> ''
  AND match_type IN ('exact', 'approximate')
  AND (fctb_code IS NULL OR TRIM(fctb_code) = '');

CREATE OR REPLACE TABLE selected_fdc AS
SELECT f.*
FROM stg_fdc_foundation f
JOIN referenced_fdc_ids r ON f.source_code = r.source_code
UNION ALL
SELECT s.*
FROM stg_fdc_sr_legacy s
JOIN referenced_fdc_ids r ON s.source_code = r.source_code
WHERE NOT EXISTS (
  SELECT 1 FROM stg_fdc_foundation f WHERE f.source_code = s.source_code
);

CREATE OR REPLACE TABLE curated_estimates AS
SELECT
  c.id,
  c.legacy_id AS source_code,
  c.name,
  CAST(NULL AS VARCHAR) AS local_name,
  c.state,
  'Curated Estimate' AS food_group,
  c.kcal,
  c.protein,
  c.fat,
  CAST(NULL AS DOUBLE) AS carbs_available,
  c.carbs_total,
  CAST(NULL AS DOUBLE) AS fibre,
  CAST(NULL AS DOUBLE) AS water,
  CAST(NULL AS DOUBLE) AS ash,
  '100 g' AS basis,
  'curated' AS dataset,
  'v2' AS version,
  'protomacro_curated_v2' AS citation_key,
  CASE
    WHEN c.match_type = 'different_state'
      THEN ['curated_estimate', 'different_state_crosswalk']
    ELSE ['curated_estimate']
  END AS quality_flags,
  c.tags,
  CASE
    WHEN c.match_type = 'different_state' AND c.fctb_code IS NOT NULL AND TRIM(c.fctb_code) <> ''
      THEN ['fctb_' || c.fctb_code]
    WHEN c.match_type = 'different_state' AND c.fdc_id IS NOT NULL AND TRIM(c.fdc_id) <> ''
      THEN ['fdc_' || c.fdc_id]
    ELSE CAST([] AS VARCHAR[])
  END AS related_ids
FROM stg_curated c
WHERE c.match_type IN ('none', 'different_state');

CREATE OR REPLACE TABLE norm_foods_base AS
SELECT
  id, source_code, name, local_name, state, food_group,
  kcal, protein, fat, carbs_available, carbs_total, fibre, water, ash,
  basis, dataset, version, citation_key, quality_flags, tags,
  CAST([] AS VARCHAR[]) AS related_ids
FROM stg_fctb
UNION ALL
SELECT
  id, source_code, name, local_name, state, food_group,
  kcal, protein, fat, carbs_available, carbs_total, fibre, water, ash,
  basis, dataset, version, citation_key, quality_flags, tags,
  CAST([] AS VARCHAR[]) AS related_ids
FROM selected_fdc
UNION ALL
SELECT
  id, source_code, name, local_name, state, food_group,
  kcal, protein, fat, carbs_available, carbs_total, fibre, water, ash,
  basis, dataset, version, citation_key, quality_flags, tags,
  related_ids
FROM curated_estimates;

-- Bidirectional related_ids (link FCTB/FDC source items back to different_state curated items)
CREATE OR REPLACE TABLE reverse_links AS
SELECT
  'fctb_' || fctb_code AS target_id,
  LIST(id ORDER BY id) AS back_ids
FROM stg_curated
WHERE match_type = 'different_state' AND fctb_code IS NOT NULL AND TRIM(fctb_code) <> ''
GROUP BY 1
UNION ALL
SELECT
  'fdc_' || fdc_id AS target_id,
  LIST(id ORDER BY id) AS back_ids
FROM stg_curated
WHERE match_type = 'different_state'
  AND (fctb_code IS NULL OR TRIM(fctb_code) = '')
  AND fdc_id IS NOT NULL AND TRIM(fdc_id) <> ''
GROUP BY 1;

-- Carry over curated tags onto matched FCTB/FDC items
CREATE OR REPLACE TABLE curated_tag_carryover AS
SELECT
  CASE
    WHEN fctb_code IS NOT NULL AND TRIM(fctb_code) <> '' THEN 'fctb_' || fctb_code
    ELSE 'fdc_' || fdc_id
  END AS target_id,
  LIST_DISTINCT(FLATTEN(LIST(tags))) AS extra_tags
FROM stg_curated
WHERE match_type IN ('exact', 'approximate')
GROUP BY 1;

CREATE OR REPLACE TABLE norm_foods AS
SELECT
  b.id,
  b.source_code,
  b.name,
  b.local_name,
  b.state,
  b.food_group,
  b.kcal,
  b.protein,
  b.fat,
  b.carbs_available,
  b.carbs_total,
  b.fibre,
  b.water,
  b.ash,
  b.basis,
  b.dataset,
  b.version,
  b.citation_key,
  b.quality_flags,
  LIST_SORT(LIST_DISTINCT(LIST_CONCAT(b.tags, COALESCE(t.extra_tags, CAST([] AS VARCHAR[]))))) AS tags,
  LIST_SORT(LIST_DISTINCT(LIST_CONCAT(b.related_ids, COALESCE(r.back_ids, CAST([] AS VARCHAR[]))))) AS related_ids
FROM norm_foods_base b
LEFT JOIN curated_tag_carryover t ON b.id = t.target_id
LEFT JOIN reverse_links r ON b.id = r.target_id;

-- v2 -> v3 ID migration mapping for every local_0..local_193
CREATE OR REPLACE TABLE id_migration_map AS
SELECT
  legacy_id,
  CASE
    WHEN match_type IN ('exact', 'approximate') AND fctb_code IS NOT NULL AND TRIM(fctb_code) <> ''
      THEN 'fctb_' || fctb_code
    WHEN match_type IN ('exact', 'approximate') AND fdc_id IS NOT NULL AND TRIM(fdc_id) <> ''
      THEN 'fdc_' || fdc_id
    ELSE id
  END AS new_id
FROM stg_curated
ORDER BY curated_index;
