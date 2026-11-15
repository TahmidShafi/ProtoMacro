"""Single entry point for the ProtoMacro food data pipeline:
extract -> staging (DuckDB) -> normalize -> validate -> load + reports.
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import re
import sys
import zipfile
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

if str(Path(__file__).resolve().parent.parent) not in sys.path:
    sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import duckdb
import jsonschema
import openpyxl
import pandas as pd
import yaml

from pipeline.extract import run_extract
from pipeline.report_charts import DEFAULT_DOCS_DIR, generate_report_charts
from pipeline.parsers import (
    has_foreign_biblio,
    infer_state,
    parse_fctb_cell,
    parse_fctb_energy,
    slugify,
    tokenize_tags,
)

REPO_ROOT = Path(__file__).resolve().parent.parent
PIPELINE_DIR = Path(__file__).resolve().parent
SQL_DIR = PIPELINE_DIR / "sql"
SCHEMA_PATH = PIPELINE_DIR / "schema" / "foods.schema.json"
DEFAULT_MANIFEST = PIPELINE_DIR / "sources.yml"
DEFAULT_RAW_DIR = REPO_ROOT / "data" / "raw"
DEFAULT_SEED = PIPELINE_DIR / "seeds" / "curated_v2.json"
DEFAULT_CROSSWALK = PIPELINE_DIR / "mappings" / "curated_crosswalk.csv"
DEFAULT_ANOMALIES = PIPELINE_DIR / "mappings" / "source_anomalies.csv"

CUISINE_RANGES: list[tuple[int, int, str]] = [
    (0, 35, "Bangladeshi / South Asian"),
    (36, 59, "Indian"),
    (60, 79, "Chinese"),
    (80, 99, "Arab / Middle Eastern"),
    (100, 128, "European"),
    (129, 160, "American"),
    (161, 170, "Common Proteins"),
    (171, 177, "Common Carbs"),
    (178, 183, "Common Fats"),
    (184, 187, "Dairy"),
    (188, 193, "Drinks"),
]


def _cuisine_for_index(idx: int) -> str:
    for lo, hi, label in CUISINE_RANGES:
        if lo <= idx <= hi:
            return label
    return "Other"
DEFAULT_FOODS_OUT = REPO_ROOT / "js" / "data" / "foods.json"
DEFAULT_MIGRATION_OUT = REPO_ROOT / "js" / "data" / "id_migration_v2_to_v3.json"
DEFAULT_RUN_LOG = PIPELINE_DIR / "reports" / "run_log.json"
DEFAULT_QUALITY_REPORT = PIPELINE_DIR / "reports" / "data_quality.md"


def parse_fctb_xlsx(xlsx_path: Path) -> pd.DataFrame:
    """Parse FCTB UserDB_Main_table into a staging-ready DataFrame."""
    wb = openpyxl.load_workbook(xlsx_path, data_only=True)
    ws = wb["UserDB_Main_table"]
    rows: list[dict[str, Any]] = []
    current_group = ""

    for r in range(3, ws.max_row + 1):
        c1 = ws.cell(r, 1).value
        c2 = ws.cell(r, 2).value
        if c1 is None and c2 is None:
            continue
        s1 = str(c1).strip() if c1 is not None else ""
        if re.match(r"^\d{2}\s+", s1) and c2 is None:
            current_group = re.sub(r"^\d{2}\s+", "", s1).strip()
            continue
        if not re.match(r"^\d{2}_", s1):
            continue

        name_en = str(c2 or "").strip()
        local_name = str(ws.cell(r, 3).value or "").strip() or None
        biblio = str(ws.cell(r, 5).value or "").strip()
        kcal, _ = parse_fctb_energy(ws.cell(r, 7).value)

        flags: list[str] = []
        water, f_w = parse_fctb_cell(ws.cell(r, 8).value)
        protein, f_p = parse_fctb_cell(ws.cell(r, 9).value)
        fat, f_f = parse_fctb_cell(ws.cell(r, 10).value)
        carbs_avail, f_c = parse_fctb_cell(ws.cell(r, 11).value)
        fibre, f_fib = parse_fctb_cell(
            ws.cell(r, 12).value, bracket_flag="crude_fibre_fallback"
        )
        ash, f_a = parse_fctb_cell(ws.cell(r, 13).value)
        flags.extend(f_w + f_p + f_f + f_c + f_fib + f_a)

        if has_foreign_biblio(biblio):
            flags.append("borrowed_value")
        if "*" in name_en or "recipe calculation" in biblio.lower():
            flags.append("recipe_calculated")

        rows.append(
            {
                "code": s1,
                "name_en": name_en,
                "local_name": local_name,
                "state": infer_state(name_en, biblio),
                "food_group": current_group or None,
                "kcal": float(kcal),
                "protein": float(protein or 0.0),
                "fat": float(fat or 0.0),
                "carbs_available": float(carbs_avail or 0.0),
                "fibre": fibre,
                "water": water,
                "ash": ash,
                "quality_flags": sorted(set(flags)),
                "tags": tokenize_tags(name_en, local_name, current_group),
            }
        )

    return pd.DataFrame(rows)


def parse_fdc_sr_legacy_zip(zip_path: Path) -> pd.DataFrame:
    """Parse USDA SR Legacy CSV zip into a staging-ready DataFrame."""
    with zipfile.ZipFile(zip_path) as zf:
        names = zf.namelist()
        food_csv = next(n for n in names if n.endswith("/food.csv") or n == "food.csv")
        fn_csv = next(
            n for n in names if n.endswith("/food_nutrient.csv") or n == "food_nutrient.csv"
        )
        cat_csv = next(
            (n for n in names if n.endswith("/food_category.csv") or n == "food_category.csv"),
            None,
        )

        foods = pd.read_csv(
            zf.open(food_csv), usecols=["fdc_id", "description", "food_category_id"]
        )
        cats = {}
        if cat_csv:
            cat_df = pd.read_csv(zf.open(cat_csv), usecols=["id", "description"])
            cats = dict(zip(cat_df["id"], cat_df["description"]))

        fn = pd.read_csv(
            zf.open(fn_csv),
            usecols=["fdc_id", "nutrient_id", "amount"],
        )
        # 1008=Energy(kcal), 2047/2048=Atwater energy, 1003=Protein, 1004=Fat, 1005=Carbs, 1079=Fibre, 1051=Water, 1007=Ash
        wanted = {1008, 2047, 2048, 1003, 1004, 1005, 1079, 1051, 1007}
        fn = fn[fn["nutrient_id"].isin(wanted)]
        piv = fn.pivot_table(
            index="fdc_id", columns="nutrient_id", values="amount", aggfunc="first"
        )

    rows: list[dict[str, Any]] = []
    for rec in foods.itertuples(index=False):
        fid = int(rec.fdc_id)
        if fid not in piv.index:
            continue
        nrow = piv.loc[fid]
        kcal = nrow.get(1008)
        if pd.isna(kcal):
            kcal = nrow.get(2047)
        if pd.isna(kcal):
            kcal = nrow.get(2048)
        if pd.isna(kcal):
            continue

        desc = str(rec.description).strip()
        fg = cats.get(rec.food_category_id)
        fibre = None if pd.isna(nrow.get(1079)) else float(nrow.get(1079))
        water = None if pd.isna(nrow.get(1051)) else float(nrow.get(1051))
        ash = None if pd.isna(nrow.get(1007)) else float(nrow.get(1007))

        rows.append(
            {
                "fdc_id": fid,
                "description": desc,
                "state": infer_state(desc),
                "food_group": str(fg) if fg and not pd.isna(fg) else None,
                "kcal": float(kcal),
                "protein": 0.0 if pd.isna(nrow.get(1003)) else float(nrow.get(1003)),
                "fat": 0.0 if pd.isna(nrow.get(1004)) else float(nrow.get(1004)),
                "carbs_total": 0.0 if pd.isna(nrow.get(1005)) else float(nrow.get(1005)),
                "fibre": fibre,
                "water": water,
                "ash": ash,
                "quality_flags": [],
                "tags": tokenize_tags(desc, str(fg) if fg else None),
            }
        )
    return pd.DataFrame(rows)


def parse_fdc_foundation_json_zip(zip_path: Path) -> pd.DataFrame:
    """Parse USDA Foundation Foods JSON zip into a staging-ready DataFrame."""
    with zipfile.ZipFile(zip_path) as zf:
        json_name = next(n for n in zf.namelist() if n.endswith(".json"))
        data = json.load(zf.open(json_name))

    rows: list[dict[str, Any]] = []
    for f in data.get("FoundationFoods", []):
        fid = int(f["fdcId"])
        desc = str(f["description"]).strip()
        fg = (f.get("foodCategory") or {}).get("description")
        nmap: dict[int, float] = {}
        for n in f.get("foodNutrients", []):
            nid = n.get("nutrient", {}).get("id")
            amt = n.get("amount")
            if nid is not None and amt is not None:
                nmap[int(nid)] = float(amt)

        kcal = nmap.get(1008) or nmap.get(2047) or nmap.get(2048)
        if kcal is None:
            continue

        rows.append(
            {
                "fdc_id": fid,
                "description": desc,
                "state": infer_state(desc),
                "food_group": fg,
                "kcal": float(kcal),
                "protein": float(nmap.get(1003, 0.0)),
                "fat": float(nmap.get(1004, nmap.get(1085, 0.0))),
                "carbs_total": float(nmap.get(1005, 0.0)),
                "fibre": nmap.get(1079),
                "water": nmap.get(1051),
                "ash": nmap.get(1007),
                "quality_flags": [],
                "tags": tokenize_tags(desc, fg),
            }
        )
    cols = [
        "fdc_id", "description", "state", "food_group", "kcal", "protein",
        "fat", "carbs_total", "fibre", "water", "ash", "quality_flags", "tags",
    ]
    return pd.DataFrame(rows, columns=cols)


def parse_curated_seed(seed_path: Path, crosswalk_path: Path) -> pd.DataFrame:
    """Join curated_v2.json seed with curated_crosswalk.csv."""
    seed = json.loads(seed_path.read_text(encoding="utf-8"))
    with crosswalk_path.open("r", encoding="utf-8") as f:
        cw = {int(r["curated_index"]): r for r in csv.DictReader(f)}

    rows: list[dict[str, Any]] = []
    used_slugs: set[str] = set()
    for idx, item in enumerate(seed):
        row = cw[idx]
        slug = slugify(item["name"])
        if slug in used_slugs:
            slug = f"{slug}_{idx}"
        used_slugs.add(slug)
        rows.append(
            {
                "curated_index": idx,
                "curated_id": f"curated_{slug}",
                "curated_name": item["name"],
                "state": infer_state(item["name"]),
                "fctb_code": row["fctb_code"].strip(),
                "fdc_id": row["fdc_id"].strip(),
                "match_type": row["match_type"].strip(),
                "kcal": float(item["calories"]),
                "protein": float(item["protein"]),
                "fat": float(item["fat"]),
                "carbs_total": float(item["carbs"]),
                "tags": tokenize_tags(item["name"], extra=item.get("tags", [])),
            }
        )
    return pd.DataFrame(rows)


def _pct_err(old: float, new: float) -> float | None:
    if new == 0:
        return 0.0 if old == 0 else None
    return abs(old - new) / new * 100.0


def build_data_quality_report(
    foods: list[dict[str, Any]],
    seed: list[dict[str, Any]],
    crosswalk_path: Path,
    mig_map: dict[str, str],
    energy_rows: list[tuple[str, float, float]],
) -> str:
    """Generate pipeline/reports/data_quality.md."""
    by_dataset = Counter(f["source"]["dataset"] for f in foods)
    by_state = Counter(f["state"] for f in foods)
    by_flag = Counter(flag for f in foods for flag in f["quality_flags"])

    diffs = [abs(k - est) / est * 100.0 for _, k, est in energy_rows if est > 0]
    diffs_sorted = sorted(diffs)
    med_atw = diffs_sorted[len(diffs_sorted) // 2] if diffs_sorted else 0.0
    p90_atw = diffs_sorted[int(0.9 * len(diffs_sorted))] if diffs_sorted else 0.0

    # Accuracy of old hand-entered values (exact matches only)
    by_id = {f["id"]: f for f in foods}
    with crosswalk_path.open("r", encoding="utf-8") as f:
        cw = list(csv.DictReader(f))

    macro_errs: dict[str, list[float]] = {"kcal": [], "protein": [], "carbs": [], "fat": []}
    worst: list[tuple[float, int, str, str, dict[str, Any], dict[str, Any]]] = []
    low_kcal_exact: list[tuple[int, str, str, float, float, float]] = []
    cuisine_counts: dict[str, Counter[str]] = {label: Counter() for _, _, label in CUISINE_RANGES}

    for r in cw:
        idx = int(r["curated_index"])
        mt = r["match_type"].strip()
        cuisine_counts[_cuisine_for_index(idx)][mt] += 1
        if mt != "exact":
            continue
        old = seed[idx]
        new_id = mig_map[f"local_{idx}"]
        new_item = by_id[new_id]
        np = new_item["per_100g"]

        if np["kcal"] < 20:
            low_kcal_exact.append(
                (idx, old["name"], new_id, float(old["calories"]), float(np["kcal"]), abs(float(old["calories"]) - float(np["kcal"])))
            )
            continue

        ek = _pct_err(old["calories"], np["kcal"])
        ep = _pct_err(old["protein"], np["protein"])
        ec = _pct_err(old["carbs"], np["carbs_total"])
        ef = _pct_err(old["fat"], np["fat"])

        if ek is not None:
            macro_errs["kcal"].append(ek)
            worst.append((ek, idx, old["name"], new_id, old, np))
        if ep is not None:
            macro_errs["protein"].append(ep)
        if ec is not None:
            macro_errs["carbs"].append(ec)
        if ef is not None:
            macro_errs["fat"].append(ef)

    def stats(vals: list[float]) -> tuple[float, float, int]:
        if not vals:
            return 0.0, 0.0, 0
        s = sorted(vals)
        return s[len(s) // 2], s[min(len(s) - 1, int(0.9 * len(s)))], len(s)

    worst.sort(key=lambda x: -x[0])

    lines = [
        "# ProtoMacro Food Catalog — Data Quality Report",
        "",
        f"Total normalized foods: **{len(foods)}**",
        "",
        "## Counts by Dataset",
        "",
        "| Dataset | Count |",
        "|---|---:|",
    ]
    for k, v in sorted(by_dataset.items()):
        lines.append(f"| `{k}` | {v} |")

    lines += [
        "",
        "## Counts by State",
        "",
        "| State | Count |",
        "|---|---:|",
    ]
    for k, v in sorted(by_state.items()):
        lines.append(f"| `{k}` | {v} |")

    lines += [
        "",
        "## Counts by Quality Flag",
        "",
        "| Quality Flag | Count |",
        "|---|---:|",
    ]
    for k, v in sorted(by_flag.items()):
        lines.append(f"| `{k}` | {v} |")

    lines += [
        "",
        "## Atwater Energy Check Distribution",
        "",
        f"- Checked items (Atwater > 0): **{len(diffs_sorted)}**",
        f"- Median `|kcal - atwater| / atwater`: **{med_atw:.2f}%**",
        f"- 90th percentile `|kcal - atwater| / atwater`: **{p90_atw:.2f}%**",
        f"- Flagged (`atwater_mismatch`, > max(20 kcal, 15%)): **{by_flag.get('atwater_mismatch', 0)}**",
        "",
        "### What the Atwater check does and does not prove",
        "",
        "In FCTB 2013, energy (`ENERC`) is itself calculated from the reported proximates using Atwater/INFOODS factors, so close agreement here validates our parsing and internal consistency of the extracted numbers — not real-world laboratory accuracy.",
        "",
        "## Crosswalk Match Types by Cuisine",
        "",
        "| Cuisine | `exact` | `approximate` | `different_state` | `none` | Total |",
        "|---|---:|---:|---:|---:|---:|",
    ]
    for _, _, label in CUISINE_RANGES:
        c = cuisine_counts[label]
        tot = sum(c.values())
        lines.append(
            f"| {label} | {c['exact']} | {c['approximate']} | {c['different_state']} | {c['none']} | {tot} |"
        )

    lines += [
        "",
        "## Accuracy of the Old Hand-Entered Values (`exact` matches, source kcal >= 20)",
        "",
        "| Macro | n | Median Abs % Error | 90th Percentile Abs % Error |",
        "|---|---:|---:|---:|",
    ]
    for m in ("kcal", "protein", "carbs", "fat"):
        med, p90, cnt = stats(macro_errs[m])
        lines.append(f"| `{m}` | {cnt} | {med:.1f}% | {p90:.1f}% |")

    if low_kcal_exact:
        lines += [
            "",
            "### Low-Calorie `exact` Matches Excluded from % Stats (source kcal < 20)",
            "",
            "| # | Curated Name | New ID | Old kcal | Source kcal | Abs kcal Diff |",
            "|---:|---|---|---:|---:|---:|",
        ]
        for idx, name, new_id, old_k, src_k, diff_k in low_kcal_exact:
            lines.append(
                f"| {idx} | {name} | `{new_id}` | {old_k} | {src_k} | {diff_k:.2f} |"
            )

    lines += [
        "",
        "### 10 Worst Hand-Entered `exact` Foods (by kcal % error, source kcal >= 20)",
        "",
        "| # | Curated Name | New ID | Old kcal | Source kcal | Abs % Error |",
        "|---:|---|---|---:|---:|---:|",
    ]
    for ek, idx, name, new_id, old, np in worst[:10]:
        lines.append(
            f"| {idx} | {name} | `{new_id}` | {old['calories']} | {np['kcal']} | {ek:.1f}% |"
        )

    return "\n".join(lines) + "\n"


def run_pipeline(
    manifest_path: Path = DEFAULT_MANIFEST,
    raw_dir: Path = DEFAULT_RAW_DIR,
    seed_path: Path = DEFAULT_SEED,
    crosswalk_path: Path = DEFAULT_CROSSWALK,
    anomalies_path: Path = DEFAULT_ANOMALIES,
    foods_out: Path = DEFAULT_FOODS_OUT,
    migration_out: Path = DEFAULT_MIGRATION_OUT,
    run_log_out: Path = DEFAULT_RUN_LOG,
    quality_report_out: Path = DEFAULT_QUALITY_REPORT,
    charts_dir: Path | None = DEFAULT_DOCS_DIR,
    skip_extract: bool = False,
) -> dict[str, Any]:
    """Run the full food data pipeline and return run metadata."""
    if not skip_extract:
        run_extract(manifest_path=manifest_path, raw_dir=raw_dir)

    with manifest_path.open("r", encoding="utf-8") as f:
        manifest = yaml.safe_load(f)["sources"]

    raw_fctb = parse_fctb_xlsx(raw_dir / manifest["fctb_xlsx"]["filename"])
    raw_fdc_sr = parse_fdc_sr_legacy_zip(raw_dir / manifest["fdc_sr_legacy"]["filename"])
    raw_fdc_found = parse_fdc_foundation_json_zip(raw_dir / manifest["fdc_foundation"]["filename"])
    raw_curated = parse_curated_seed(seed_path, crosswalk_path)
    if anomalies_path.exists():
        raw_anomalies = pd.read_csv(anomalies_path, dtype=str).fillna("")
    else:
        raw_anomalies = pd.DataFrame(columns=["source", "code", "reason", "evidence"])

    con = duckdb.connect(":memory:")
    con.register("raw_fctb", raw_fctb)
    con.register("raw_fdc_sr_legacy", raw_fdc_sr)
    con.register("raw_fdc_foundation", raw_fdc_found)
    con.register("raw_curated", raw_curated)
    con.register("raw_source_anomalies", raw_anomalies)

    for sql_file in ("01_staging.sql", "02_normalize.sql", "03_validate.sql"):
        con.execute((SQL_DIR / sql_file).read_text(encoding="utf-8"))

    errors = con.execute("SELECT id, err FROM validation_errors").fetchall()
    if errors:
        raise RuntimeError(f"Pipeline validation failed: {errors[:10]}")

    layer_counts = {
        "raw_fctb": len(raw_fctb),
        "raw_fdc_sr_legacy": len(raw_fdc_sr),
        "raw_fdc_foundation": len(raw_fdc_found),
        "raw_curated": len(raw_curated),
        "stg_fctb": con.execute("SELECT COUNT(*) FROM stg_fctb").fetchone()[0],
        "selected_fdc": con.execute("SELECT COUNT(*) FROM selected_fdc").fetchone()[0],
        "curated_estimates": con.execute("SELECT COUNT(*) FROM curated_estimates").fetchone()[0],
        "validated_foods": con.execute("SELECT COUNT(*) FROM validated_foods").fetchone()[0],
    }

    rows = con.execute(
        """
        SELECT
          id, source_code, name, local_name, state, food_group,
          kcal, protein, fat, carbs_available, carbs_total, fibre,
          basis, dataset, version, citation_key, quality_flags, tags, related_ids,
          suspect_reason
        FROM validated_foods
        ORDER BY id
        """
    ).fetchall()

    foods_list: list[dict[str, Any]] = []
    for r in rows:
        foods_list.append(
            {
                "id": r[0],
                "name": r[2],
                "local_name": r[3],
                "state": r[4],
                "food_group": r[5],
                "per_100g": {
                    "kcal": r[6],
                    "protein": r[7],
                    "fat": r[8],
                    "carbs_available": r[9],
                    "carbs_total": r[10],
                    "fibre": r[11],
                },
                "basis": r[12],
                "source": {
                    "dataset": r[13],
                    "code": r[1],
                    "version": r[14],
                    "citation_key": r[15],
                },
                "quality_flags": sorted(r[16] or []),
                "suspect_reason": r[19],
                "tags": sorted(r[17] or []),
                "related_ids": sorted(r[18] or []),
            }
        )

    dataset_counts = dict(sorted(Counter(f["source"]["dataset"] for f in foods_list).items()))
    source_meta = {
        k: {"version": str(v.get("retrieved_at") or v["filename"]), "sha256": v.get("sha256")}
        for k, v in sorted(manifest.items())
    }
    output_doc = {
        "metadata": {
            "schema_version": 3,
            "sources": source_meta,
            "counts": {
                "total": len(foods_list),
                "by_dataset": dataset_counts,
            },
        },
        "foods": foods_list,
    }

    schema = json.loads(SCHEMA_PATH.read_text(encoding="utf-8"))
    jsonschema.validate(instance=output_doc, schema=schema)

    foods_out.parent.mkdir(parents=True, exist_ok=True)
    foods_text = json.dumps(output_doc, indent=2, sort_keys=True, ensure_ascii=False) + "\n"
    foods_out.write_text(foods_text, encoding="utf-8", newline="\n")
    foods_sha = hashlib.sha256(foods_text.encode("utf-8")).hexdigest()

    mig_rows = con.execute("SELECT legacy_id, new_id FROM id_migration_map").fetchall()
    mig_map = {k: v for k, v in sorted(mig_rows, key=lambda x: int(x[0].split("_")[1]))}
    migration_out.parent.mkdir(parents=True, exist_ok=True)
    migration_out.write_text(
        json.dumps(mig_map, indent=2, ensure_ascii=False) + "\n", encoding="utf-8", newline="\n"
    )

    energy_rows = con.execute("SELECT id, kcal, atwater_est FROM validated_foods").fetchall()
    seed_data = json.loads(seed_path.read_text(encoding="utf-8"))
    quality_md = build_data_quality_report(foods_list, seed_data, crosswalk_path, mig_map, energy_rows)
    quality_report_out.parent.mkdir(parents=True, exist_ok=True)
    quality_report_out.write_text(quality_md, encoding="utf-8", newline="\n")

    if charts_dir is not None:
        generate_report_charts(foods_list, seed_data, crosswalk_path, mig_map, docs_dir=charts_dir)

    flag_counts = dict(sorted(Counter(fl for f in foods_list for fl in f["quality_flags"]).items()))
    run_log = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "foods_json_sha256": foods_sha,
        "layer_counts": layer_counts,
        "dataset_counts": dataset_counts,
        "flag_counts": flag_counts,
    }
    run_log_out.parent.mkdir(parents=True, exist_ok=True)
    run_log_out.write_text(json.dumps(run_log, indent=2) + "\n", encoding="utf-8", newline="\n")

    return run_log


def main() -> None:
    parser = argparse.ArgumentParser(description="Run the ProtoMacro food data pipeline.")
    parser.add_argument("--skip-extract", action="store_true")
    args = parser.parse_args()
    log = run_pipeline(skip_extract=args.skip_extract)
    print(json.dumps(log, indent=2))


if __name__ == "__main__":
    main()
