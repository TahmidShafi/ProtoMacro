# ProtoMacro Food Data Pipeline

Reproducible Python + DuckDB pipeline that builds ProtoMacro's sourced food catalog (`js/data/foods.json`) and v2→v3 ID migration map (`js/data/id_migration_v2_to_v3.json`).

## Setup

Requires Python **3.11+**:

```bash
python -m venv pipeline/.venv
# Windows PowerShell:
pipeline\.venv\Scripts\Activate.ps1
# macOS / Linux:
# source pipeline/.venv/bin/activate

pip install -r pipeline/requirements.txt
```

## Run

```bash
npm run data:build
# or directly:
python pipeline/run.py
```

`pipeline/run.py` runs:
1. `extract` — idempotent download into `data/raw/` verified against `pipeline/sources.yml` SHA-256 digests
2. `staging` — `pipeline/sql/01_staging.sql`
3. `normalize` — `pipeline/sql/02_normalize.sql` (priority: `FCTB 2013 > FDC Foundation > FDC SR Legacy > Curated estimate`)
4. `validate` — `pipeline/sql/03_validate.sql` + JSON Schema (`pipeline/schema/foods.schema.json`)
5. `load` — deterministic `js/data/foods.json`, `js/data/id_migration_v2_to_v3.json`, `pipeline/reports/run_log.json`, and `pipeline/reports/data_quality.md`

## Tests

```bash
pytest pipeline/tests -v
```
