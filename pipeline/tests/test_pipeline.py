"""Unit and integration tests for ProtoMacro food pipeline."""

from __future__ import annotations

import json
from pathlib import Path

import duckdb
import jsonschema
import pytest
import yaml

from pipeline.parsers import parse_fctb_cell, parse_fctb_energy
from pipeline.run import REPO_ROOT, SCHEMA_PATH, SQL_DIR, run_pipeline

FIXTURES = Path(__file__).resolve().parent / "fixtures"


def test_parse_fctb_energy() -> None:
    assert parse_fctb_energy("(324)1360") == (324.0, 1360.0)
    assert parse_fctb_energy("(111)469") == (111.0, 469.0)
    with pytest.raises(ValueError):
        parse_fctb_energy("invalid")


def test_parse_fctb_cell_markers() -> None:
    assert parse_fctb_cell("tr") == (0.0, ["trace_to_zero"])
    assert parse_fctb_cell("[2.1]", bracket_flag="crude_fibre_fallback") == (
        2.1,
        ["crude_fibre_fallback"],
    )
    assert parse_fctb_cell("-") == (None, [])
    assert parse_fctb_cell(12.5) == (12.5, [])


def test_validation_rules_pass_and_fail() -> None:
    con = duckdb.connect(":memory:")
    validate_sql = (SQL_DIR / "03_validate.sql").read_text(encoding="utf-8")

    # Pass case + non-fatal flags (atwater_mismatch, proximates_over_100g)
    con.execute(
        """
        CREATE OR REPLACE TABLE norm_foods AS
        SELECT
          'fctb_01_0001' AS id, '01_0001' AS source_code, 'Rice' AS name,
          'Chal' AS local_name, 'raw' AS state, 'Cereals' AS food_group,
          350.0 AS kcal, 7.0 AS protein, 1.0 AS fat, 78.0 AS carbs_available,
          79.0 AS carbs_total, 1.0 AS fibre, 12.0 AS water, 1.0 AS ash,
          '100 g edible portion' AS basis, 'fctb_2013' AS dataset,
          '2013-07-04' AS version, 'fctb_2013' AS citation_key,
          CAST([] AS VARCHAR[]) AS quality_flags, CAST(NULL AS VARCHAR) AS suspect_reason,
          ['rice'] AS tags, CAST([] AS VARCHAR[]) AS related_ids
        UNION ALL
        SELECT
          'curated_weird', 'local_999', 'Weird', NULL, 'prepared', 'Curated',
          500.0, 10.0, 5.0, NULL, 10.0, NULL, 80.0, 5.0,
          '100 g', 'curated', 'v2', 'protomacro_curated_v2',
          ['curated_estimate'], NULL, ['weird'], []
        """
    )
    con.execute(validate_sql)
    assert con.execute("SELECT COUNT(*) FROM validation_errors").fetchone()[0] == 0
    flags = dict(con.execute("SELECT id, quality_flags FROM validated_foods").fetchall())
    assert "atwater_mismatch" in flags["curated_weird"]
    assert "proximates_over_100g" in flags["curated_weird"]

    # Fail cases: negative value, duplicate id, missing required field, proximates > 110g
    con.execute(
        """
        CREATE OR REPLACE TABLE norm_foods AS
        SELECT
          'dup_1' AS id, 'c1' AS source_code, 'BadNeg' AS name, NULL AS local_name,
          'raw' AS state, 'Test' AS food_group, -5.0 AS kcal, 1.0 AS protein,
          1.0 AS fat, 1.0 AS carbs_available, 1.0 AS carbs_total, 0.0 AS fibre,
          100.0 AS water, 20.0 AS ash, '100 g' AS basis, 'curated' AS dataset,
          'v2' AS version, 'k' AS citation_key, CAST([] AS VARCHAR[]) AS quality_flags,
          CAST(NULL AS VARCHAR) AS suspect_reason,
          CAST([] AS VARCHAR[]) AS tags, CAST([] AS VARCHAR[]) AS related_ids
        UNION ALL
        SELECT
          'dup_1', 'c2', NULL, NULL, 'raw', 'Test', 100.0, 1.0, 1.0, 1.0, 1.0,
          0.0, 10.0, 1.0, '100 g', 'curated', 'v2', 'k', [], NULL, [], []
        """
    )
    con.execute(validate_sql)
    errs = {r[1] for r in con.execute("SELECT id, err FROM validation_errors").fetchall()}
    assert {"negative_macro_or_kcal", "duplicate_id", "missing_required_field", "proximates_gt_110g"} <= errs


def test_pipeline_determinism_on_fixtures(tmp_path: Path) -> None:
    manifest = tmp_path / "sources.yml"
    manifest.write_text(
        yaml.safe_dump(
            {
                "sources": {
                    "fctb_xlsx": {"filename": "fctb_fixture.xlsx", "sha256": "abc", "retrieved_at": "2026-11-15"},
                    "fdc_sr_legacy": {"filename": "fdc_sr_fixture.zip", "sha256": "def", "retrieved_at": "2026-11-15"},
                    "fdc_foundation": {"filename": "fdc_foundation_fixture.zip", "sha256": "ghi", "retrieved_at": "2026-11-15"},
                }
            }
        ),
        encoding="utf-8",
    )

    out1 = tmp_path / "run1"
    out2 = tmp_path / "run2"
    r1 = run_pipeline(
        manifest_path=manifest,
        raw_dir=FIXTURES,
        seed_path=FIXTURES / "curated_fixture.json",
        crosswalk_path=FIXTURES / "crosswalk_fixture.csv",
        foods_out=out1 / "foods.json",
        migration_out=out1 / "mig.json",
        run_log_out=out1 / "log.json",
        quality_report_out=out1 / "dq.md",
        skip_extract=True,
    )
    r2 = run_pipeline(
        manifest_path=manifest,
        raw_dir=FIXTURES,
        seed_path=FIXTURES / "curated_fixture.json",
        crosswalk_path=FIXTURES / "crosswalk_fixture.csv",
        foods_out=out2 / "foods.json",
        migration_out=out2 / "mig.json",
        run_log_out=out2 / "log.json",
        quality_report_out=out2 / "dq.md",
        skip_extract=True,
    )
    assert r1["foods_json_sha256"] == r2["foods_json_sha256"]
    assert (out1 / "foods.json").read_bytes() == (out2 / "foods.json").read_bytes()


def test_committed_outputs_valid_and_complete() -> None:
    foods_path = REPO_ROOT / "js" / "data" / "foods.json"
    mig_path = REPO_ROOT / "js" / "data" / "id_migration_v2_to_v3.json"
    schema = json.loads(SCHEMA_PATH.read_text(encoding="utf-8"))
    foods_doc = json.loads(foods_path.read_text(encoding="utf-8"))
    jsonschema.validate(instance=foods_doc, schema=schema)

    mig = json.loads(mig_path.read_text(encoding="utf-8"))
    for i in range(194):
        assert f"local_{i}" in mig
    valid_ids = {f["id"] for f in foods_doc["foods"]}
    assert all(v in valid_ids for v in mig.values())


def test_infer_state_cases() -> None:
    from pipeline.parsers import infer_state

    assert infer_state("Fish, salmon, chinook, cooked, dry heat") == "cooked"
    assert infer_state("Cereals, oats, regular and quick, not fortified, dry") == "raw"
    assert infer_state("Hilsa, without bones, raw") == "raw"
    assert infer_state("Payesh*") == "prepared"


def test_approximate_policy_and_suspect_value(tmp_path: Path) -> None:
    manifest = tmp_path / "sources.yml"
    manifest.write_text(
        yaml.safe_dump(
            {
                "sources": {
                    "fctb_xlsx": {"filename": "fctb_fixture.xlsx", "sha256": "abc", "retrieved_at": "2026-11-15"},
                    "fdc_sr_legacy": {"filename": "fdc_sr_fixture.zip", "sha256": "def", "retrieved_at": "2026-11-15"},
                    "fdc_foundation": {"filename": "fdc_foundation_fixture.zip", "sha256": "ghi", "retrieved_at": "2026-11-15"},
                }
            }
        ),
        encoding="utf-8",
    )
    seed_path = tmp_path / "seed.json"
    seed_path.write_text(
        json.dumps([{"name": "Approx Dish", "calories": 250, "protein": 10, "carbs": 30, "fat": 8, "tags": []}]),
        encoding="utf-8",
    )
    cw_path = tmp_path / "cw.csv"
    cw_path.write_text(
        "curated_index,curated_name,fctb_code,fdc_id,match_type,source_name,source_state,notes\n"
        "0,Approx Dish,01_0041,,approximate,Rice boiled*,cooked,test approx\n",
        encoding="utf-8",
    )
    anom_path = tmp_path / "anomalies.csv"
    anom_path.write_text(
        "source,code,reason,evidence\n"
        'fctb_2013,01_0041,"Test anomaly reason","Test evidence"\n',
        encoding="utf-8",
    )
    out = tmp_path / "out"
    run_pipeline(
        manifest_path=manifest,
        raw_dir=FIXTURES,
        seed_path=seed_path,
        crosswalk_path=cw_path,
        anomalies_path=anom_path,
        foods_out=out / "foods.json",
        migration_out=out / "mig.json",
        run_log_out=out / "log.json",
        quality_report_out=out / "dq.md",
        skip_extract=True,
    )
    mig = json.loads((out / "mig.json").read_text(encoding="utf-8"))
    assert mig["local_0"] == "curated_approx_dish"

    foods = {f["id"]: f for f in json.loads((out / "foods.json").read_text(encoding="utf-8"))["foods"]}
    approx = foods["curated_approx_dish"]
    assert approx["per_100g"]["kcal"] == 250
    assert "approximate_crosswalk" in approx["quality_flags"]
    assert "fctb_01_0041" in approx["related_ids"]

    flagged = foods["fctb_01_0041"]
    assert "suspect_value" in flagged["quality_flags"]
    assert flagged["suspect_reason"] == "Test anomaly reason"
