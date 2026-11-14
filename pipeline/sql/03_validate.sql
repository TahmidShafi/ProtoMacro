-- Stage 3: Validation checks (flags vs hard errors)

CREATE OR REPLACE TABLE validated_foods AS
WITH checks AS (
  SELECT
    *,
    CASE
      WHEN dataset = 'fctb_2013'
        THEN 4.0 * protein + 9.0 * fat + 4.0 * carbs_available + 2.0 * COALESCE(fibre, 0.0)
      ELSE 4.0 * protein + 9.0 * fat + 4.0 * carbs_total
    END AS atwater_est,
    CASE
      WHEN water IS NOT NULL
        THEN COALESCE(water, 0.0) + protein + fat + COALESCE(carbs_available, carbs_total) + COALESCE(fibre, 0.0) + COALESCE(ash, 0.0)
      ELSE NULL
    END AS proximates_sum
  FROM norm_foods
)
SELECT
  id,
  source_code,
  name,
  local_name,
  state,
  food_group,
  ROUND(kcal, 2) AS kcal,
  ROUND(protein, 2) AS protein,
  ROUND(fat, 2) AS fat,
  CASE WHEN carbs_available IS NOT NULL THEN ROUND(carbs_available, 2) ELSE NULL END AS carbs_available,
  ROUND(carbs_total, 2) AS carbs_total,
  CASE WHEN fibre IS NOT NULL THEN ROUND(fibre, 2) ELSE NULL END AS fibre,
  basis,
  dataset,
  version,
  citation_key,
  atwater_est,
  proximates_sum,
  LIST_SORT(LIST_DISTINCT(LIST_CONCAT(
    quality_flags,
    LIST_CONCAT(
      CASE WHEN ABS(kcal - atwater_est) > GREATEST(20.0, 0.15 * atwater_est)
        THEN ['atwater_mismatch'] ELSE CAST([] AS VARCHAR[]) END,
      CASE WHEN proximates_sum IS NOT NULL AND proximates_sum > 102.0
        THEN ['proximates_over_100g'] ELSE CAST([] AS VARCHAR[]) END
    )
  ))) AS quality_flags,
  suspect_reason,
  tags,
  related_ids
FROM checks;

CREATE OR REPLACE TABLE validation_errors AS
SELECT id, 'missing_required_field' AS err
FROM validated_foods
WHERE id IS NULL OR name IS NULL OR state IS NULL
   OR kcal IS NULL OR protein IS NULL OR carbs_total IS NULL OR fat IS NULL
   OR dataset IS NULL OR source_code IS NULL OR version IS NULL
UNION ALL
SELECT id, 'negative_macro_or_kcal' AS err
FROM validated_foods
WHERE kcal < 0 OR protein < 0 OR carbs_total < 0 OR fat < 0
   OR (carbs_available IS NOT NULL AND carbs_available < 0)
   OR (fibre IS NOT NULL AND fibre < 0)
UNION ALL
SELECT id, 'duplicate_id' AS err
FROM (
  SELECT id, COUNT(*) AS cnt FROM validated_foods GROUP BY id HAVING COUNT(*) > 1
)
UNION ALL
SELECT id, 'proximates_gt_110g' AS err
FROM validated_foods
WHERE proximates_sum IS NOT NULL AND proximates_sum > 110.0;
